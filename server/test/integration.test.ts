/**
 * Integration / interplay tests (v0.2 hardening).
 *
 * These deliberately cross feature boundaries — the seams the unit tests don't
 * cover: handoff→interview→export→import end-to-end, archive↔interview,
 * version-rollback↔interview, provenance activity on imported agents, and
 * interview transcripts surviving a transfer + staying RAG-searchable.
 *
 * export writes under cwd, so we chdir into an isolated workdir and flip
 * AFTERGLOW_ROOT between a sender (A) and receiver (B) store.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let rootA: string;
let rootB: string;
let workDir: string;
let originalCwd: string;

beforeEach(async () => {
  rootA = await mkdtemp(join(tmpdir(), 'afterglow-iA-'));
  rootB = await mkdtemp(join(tmpdir(), 'afterglow-iB-'));
  workDir = await mkdtemp(join(tmpdir(), 'afterglow-iW-'));
  originalCwd = process.cwd();
  process.chdir(workDir);
  process.env.AFTERGLOW_ROOT = rootA;
  delete process.env.AFTERGLOW_ALLOW_DRAFT;
});

afterEach(async () => {
  process.chdir(originalCwd);
  delete process.env.AFTERGLOW_ROOT;
  for (const d of [rootA, rootB, workDir]) if (d) await rm(d, { recursive: true, force: true });
});

async function bootstrapAndSign(slug: string, name = '이지윤', role = '디자이너') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runInit({});
  await runCreate({ slug, name, role, expertise: ['디자인'] } as never);
  await runSign({ slug, signer: name });
}

async function runFinalizedInterview(slug: string, title: string, token: string) {
  const { runInterview } = await import('../src/tools/interview.js');
  const s = await runInterview({ action: 'start', slug, title, interviewer: '김후임', interviewee: '이지윤' } as never);
  const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
  const add = await runInterview({ action: 'add-question', slug, session: sid, question: `${title}?` } as never);
  const qid = add.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
  await runInterview({ action: 'answer', slug, session: sid, id: qid, answer: token, source: 'self-typed' } as never);
  await runInterview({ action: 'finalize', slug, session: sid, signRole: 'interviewer', signer: '김후임' } as never);
  await runInterview({ action: 'finalize', slug, session: sid, signRole: 'interviewee', signer: '이지윤' } as never);
  return sid;
}

function bundleFrom(text: string): string {
  return text.match(/위치:\s*(\S+)/)![1];
}

/* --------------------------------------------------------------- */
/* 1. handoff → interview → export → import (full transfer)         */
/* --------------------------------------------------------------- */

describe('integration · full lifecycle transfer (interview survives hot-plug)', () => {
  it('interview answers + transcript transfer across stores and stay RAG-searchable', async () => {
    await bootstrapAndSign('jiyoon');
    const { runInterview } = await import('../src/tools/interview.js');
    const { runExport } = await import('../src/tools/export.js');
    const { agentDir } = await import('../src/storage.js');

    // interview with a media attachment whose transcript carries a distinct token
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: '결제', interviewer: '김후임', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    const add = await runInterview({ action: 'add-question', slug: 'jiyoon', session: sid, question: 'fallback?' } as never);
    const qid = add.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
    await runInterview({ action: 'answer', slug: 'jiyoon', session: sid, id: qid, answer: '답변핵심토큰', source: 'self-typed' } as never);
    await writeFile(join(agentDir('jiyoon'), 'clip.mp3'), Buffer.from('AUD'));
    await writeFile(join(agentDir('jiyoon'), 'clip.txt'), '전사본고유토큰: 토스 우선 fallback.');
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'clip.mp3'), transcript: join(agentDir('jiyoon'), 'clip.txt'), speakers: ['이지윤'] } as never);
    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewer', signer: '김후임' } as never);
    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewee', signer: '이지윤' } as never);

    const bundle = bundleFrom((await runExport({ all: true, exportedBy: '이지윤' })).content[0].text);

    // Receiver store
    process.env.AFTERGLOW_ROOT = rootB;
    const { runInit } = await import('../src/tools/init.js');
    const { runImport } = await import('../src/tools/import.js');
    const { runAsk } = await import('../src/tools/ask.js');
    await runInit({});
    const imp = await runImport({ input: bundle, importedBy: '김후임', from: '이지윤', trustSigner: '이지윤' });
    expect(imp.content[0].text).toContain('imported');

    // persona.bio block transferred
    const { readPersona } = await import('../src/storage.js');
    const p = await readPersona('jiyoon');
    expect(p.bio ?? '').toContain('답변핵심토큰');

    // interview transcript is RAG-searchable in the RECEIVER store + provenance banner
    const ask = await runAsk({ slug: 'jiyoon', question: '전사본고유토큰 관련 fallback?' } as never);
    expect(ask.isError).toBeUndefined();
    expect(ask.content[0].text).toContain('전사본고유토큰');
    expect(ask.content[0].text).toContain('출처 (provenance)');

    // interview session itself transferred (inspect on receiver)
    const insp = await runInterview({ action: 'inspect', slug: 'jiyoon', session: sid } as never);
    expect(insp.content[0].text).toContain('결제');

    // persona inspect surfaces interview count + import provenance (mgmt visibility)
    const { runInspect } = await import('../src/tools/inspect.js');
    const pInsp = await runInspect({ slug: 'jiyoon' } as never);
    expect(pInsp.content[0].text).toContain('인터뷰');
    expect(pInsp.content[0].text).toMatch(/회차 1/);
    expect(pInsp.content[0].text).toContain('출처 (import)');
    const pJson = JSON.parse((await runInspect({ slug: 'jiyoon', json: true } as never)).content[0].text);
    expect(pJson.interviews.length).toBe(1);
    expect(pJson.provenance.imported).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* 2. provenance records interview activity on imported agents      */
/* --------------------------------------------------------------- */

describe('integration · provenance activity log', () => {
  it('an interview finalized on an imported agent is recorded in provenance', async () => {
    await bootstrapAndSign('jiyoon');
    const { runExport } = await import('../src/tools/export.js');
    const bundle = bundleFrom((await runExport({ all: true })).content[0].text);

    process.env.AFTERGLOW_ROOT = rootB;
    const { runInit } = await import('../src/tools/init.js');
    const { runImport } = await import('../src/tools/import.js');
    await runInit({});
    await runImport({ input: bundle, trustSigner: '이지윤' });

    await runFinalizedInterview('jiyoon', '후속', '후속토큰');

    const { readProvenance } = await import('../src/storage.js');
    const prov = await readProvenance('jiyoon');
    expect(prov?.imported).toBe(true);
    expect(prov?.postImportActivity.length).toBeGreaterThan(0);
    expect(prov?.postImportActivity.some((a) => a.type === 'interview')).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* 3. archive ↔ interview (no crash on archived agent)              */
/* --------------------------------------------------------------- */

describe('integration · archive ↔ interview', () => {
  it('archiving an agent with interviews does not break list/inspect, restore recovers', async () => {
    await bootstrapAndSign('jiyoon');
    const sid = await runFinalizedInterview('jiyoon', '회차', '보관토큰');
    const { runArchive } = await import('../src/tools/archive.js');
    const { runInterview } = await import('../src/tools/interview.js');

    await runArchive({ action: 'archive', slug: 'jiyoon' });
    // Read-only interview actions on an archived agent must not throw.
    const list = await runInterview({ action: 'list', slug: 'jiyoon' } as never);
    expect(list.isError).toBeUndefined();
    // Mutating actions are refused (archived).
    const blocked = await runInterview({ action: 'start', slug: 'jiyoon', title: 'x', interviewer: 'a' } as never);
    expect(blocked.isError).toBe(true);

    await runArchive({ action: 'restore', slug: 'jiyoon' });
    const insp = await runInterview({ action: 'inspect', slug: 'jiyoon', session: sid } as never);
    expect(insp.isError).toBeUndefined();
    expect(insp.content[0].text).toContain('회차');
  });
});

/* --------------------------------------------------------------- */
/* 4. handoff after interview preserves the interview bio block     */
/* --------------------------------------------------------------- */

describe('integration · handoff preserves prior interview blocks', () => {
  it('a later handoff finalize does not drop an absorbed interview block', async () => {
    // create (draft) then interview (works on draft via AFTERGLOW_ALLOW_DRAFT-free writable gate)
    const { runInit } = await import('../src/tools/init.js');
    const { runCreate } = await import('../src/tools/create.js');
    const { runHandoff } = await import('../src/tools/handoff.js');
    const { readPersona } = await import('../src/storage.js');
    await runInit({});
    await runCreate({ slug: 'jiyoon', name: '이지윤', role: '디자이너' } as never);

    await runFinalizedInterview('jiyoon', '인터뷰선행', '인터뷰선행토큰');
    let p = await readPersona('jiyoon');
    expect(p.bio ?? '').toContain('인터뷰선행토큰');

    // now a handoff finalize (edits one answer) — must keep the interview block
    await runHandoff({ action: 'start', slug: 'jiyoon', limit: 1 } as never);
    const status = await runHandoff({ action: 'status', slug: 'jiyoon' } as never);
    const hqid = status.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
    await runHandoff({ action: 'review', slug: 'jiyoon', reviews: [{ id: hqid, action: 'edit', userAnswer: '핸드오프답변토큰' }] } as never);
    await runHandoff({ action: 'finalize', slug: 'jiyoon', signer: '이지윤' } as never);

    p = await readPersona('jiyoon');
    expect(p.bio ?? '').toContain('인터뷰선행토큰'); // interview block survives
    expect(p.bio ?? '').toContain('핸드오프답변토큰'); // handoff block added
  });
});

/* --------------------------------------------------------------- */
/* 5. version rollback ↔ interview (graceful, session persists)     */
/* --------------------------------------------------------------- */

describe('integration · version rollback after interview', () => {
  it('rolling persona back before an interview does not crash; session still exists', async () => {
    await bootstrapAndSign('jiyoon');
    const { readPersona } = await import('../src/storage.js');
    const { runVersion } = await import('../src/tools/version.js');
    const { runInterview } = await import('../src/tools/interview.js');

    const sid = await runFinalizedInterview('jiyoon', '롤백', '롤백토큰');
    expect((await readPersona('jiyoon')).bio ?? '').toContain('롤백토큰');

    // interview absorption snapshots persona (pre/post) → v1 exists.
    const list = await runVersion({ action: 'list', slug: 'jiyoon' } as never);
    expect(list.content[0].text).toMatch(/v1/);
    const r = await runVersion({ action: 'rollback', slug: 'jiyoon', versionA: 'v1' } as never);
    expect(r.isError).toBeUndefined();

    // session.json persists regardless of persona rollback (no crash, data intact)
    const insp = await runInterview({ action: 'inspect', slug: 'jiyoon', session: sid } as never);
    expect(insp.isError).toBeUndefined();
    expect(insp.content[0].text).toContain('롤백');
  });
});

/* --------------------------------------------------------------- */
/* 6. pending-confirmation interview transfers, receiver completes  */
/* --------------------------------------------------------------- */

describe('integration · pending-confirmation interview completes after transfer', () => {
  it('interviewer-only session transfers and the receiver can finalize with interviewee sig', async () => {
    await bootstrapAndSign('jiyoon');
    const { runInterview } = await import('../src/tools/interview.js');
    const { runExport } = await import('../src/tools/export.js');
    const { readPersona } = await import('../src/storage.js');

    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: '대기', interviewer: '김후임', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    const add = await runInterview({ action: 'add-question', slug: 'jiyoon', session: sid, question: 'q?' } as never);
    const qid = add.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
    await runInterview({ action: 'answer', slug: 'jiyoon', session: sid, id: qid, answer: '대기토큰', source: 'self-typed' } as never);
    const f1 = await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewer', signer: '김후임' } as never);
    expect(f1.content[0].text).toContain('pending-confirmation');
    expect((await readPersona('jiyoon')).bio ?? '').not.toContain('대기토큰'); // not absorbed yet

    const bundle = bundleFrom((await runExport({ all: true })).content[0].text);
    process.env.AFTERGLOW_ROOT = rootB;
    const { runInit } = await import('../src/tools/init.js');
    const { runImport } = await import('../src/tools/import.js');
    await runInit({});
    await runImport({ input: bundle, trustSigner: '이지윤' });

    // receiver completes with interviewee signature → absorbed
    const f2 = await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewee', signer: '이지윤' } as never);
    expect(f2.content[0].text).toContain('finalized');
    expect((await readPersona('jiyoon')).bio ?? '').toContain('대기토큰');
  });
});
