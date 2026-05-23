/**
 * Tests for v0.3 features:
 *   suggest-questions · afterglow_status · afterglow_gc · transcribe(--text/--apply)
 *   · audit checkpoint/fast.  (import --expectAnchor lives in portable.test.ts.)
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, stat, appendFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-v3-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
  delete process.env.AFTERGLOW_ALLOW_DRAFT;
});
afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function bootstrapAndSign(slug = 'jiyoon', name = '이지윤') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runInit({});
  await runCreate({ slug, name, role: '디자이너', expertise: ['디자인'] } as never);
  await runSign({ slug, signer: name });
}

/* --------------------------------------------------------------- */
/* suggest-questions (Feature 3)                                   */
/* --------------------------------------------------------------- */

describe('interview · suggest-questions', () => {
  it('surfaces the 4 gap signals (low-conf, corrections, uncovered material, declined)', async () => {
    await bootstrapAndSign();
    const { runAsk } = await import('../src/tools/ask.js');
    const { runCorrect } = await import('../src/tools/correct.js');
    const { runInterview } = await import('../src/tools/interview.js');
    const { knowledgeDir } = await import('../src/storage.js');

    // Signal A: a low-confidence ask (no knowledge → confidence 0 → low-conf)
    await runAsk({ slug: 'jiyoon', question: '결제 정산 주기?' } as never);
    // Signal B: a correction
    await runCorrect({ action: 'feedback', slug: 'jiyoon', recordId: 'r1', feedback: '정산은 주 1회로 정정' } as never);
    // Signal C: knowledge file whose content isn't in bio (bio is empty)
    await writeFile(join(knowledgeDir('jiyoon'), 'payroll.md'), '정산고유토픽 절차는 매주 화요일에 실행됩니다.');
    // Signal D: a declined question in a finalized interview
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: '선행', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    const add = await runInterview({ action: 'add-question', slug: 'jiyoon', session: sid, question: '연봉정보 공유?' } as never);
    const qid = add.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
    await runInterview({ action: 'answer', slug: 'jiyoon', session: sid, id: qid, decline: true } as never);
    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewer', signer: '김' } as never);
    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewee', signer: '이지윤' } as never);

    const sug = await runInterview({ action: 'suggest-questions', slug: 'jiyoon' } as never);
    expect(sug.isError).toBeUndefined();
    const t = sug.content[0].text;
    expect(t).toContain('신호 A');
    expect(t).toContain('신호 B');
    expect(t).toContain('신호 C');
    expect(t).toContain('신호 D');
    expect(t).toMatch(/payroll\.md/);       // uncovered material
    expect(t).toContain('연봉정보 공유?');   // declined question
  });
});

/* --------------------------------------------------------------- */
/* afterglow_status (Feature 2)                                    */
/* --------------------------------------------------------------- */

describe('afterglow_status', () => {
  it('aggregates interview rounds, review-pending media, and import origin', async () => {
    await bootstrapAndSign('jiyoon');
    const { runInterview } = await import('../src/tools/interview.js');
    const { runStatus } = await import('../src/tools/status.js');
    const { agentDir } = await import('../src/storage.js');

    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 'r', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    await writeFile(join(agentDir('jiyoon'), 'v.mp4'), Buffer.from('V'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'v.mp4'), speakers: ['이지윤'], reviewRequired: true } as never);

    const txt = (await runStatus({} as never)).content[0].text;
    expect(txt).toContain('대시보드');
    expect(txt).toMatch(/jiyoon/);
    expect(txt).toMatch(/검토대기/);

    const js = JSON.parse((await runStatus({ json: true } as never)).content[0].text);
    const row = js.agents.find((a: { slug: string }) => a.slug === 'jiyoon');
    expect(row.interviews).toBe(1);
    expect(row.reviewPending).toBe(1);
    expect(js.totals.agents).toBe(1);
  });
});

/* --------------------------------------------------------------- */
/* afterglow_gc (Feature 4)                                        */
/* --------------------------------------------------------------- */

describe('afterglow_gc', () => {
  it('prune-versions keeps newest N + tagged, deletes the rest (dry-run vs apply)', async () => {
    await bootstrapAndSign('jiyoon');
    const { runEdit } = await import('../src/tools/edit.js');
    const { runVersion } = await import('../src/tools/version.js');
    const { runGc } = await import('../src/tools/gc.js');
    const { listVersions } = await import('../src/storage.js');

    // Create several snapshots via edits.
    for (let i = 0; i < 5; i++) await runEdit({ slug: 'jiyoon', bio: `bio v${i}` } as never);
    const before = await listVersions('jiyoon');
    expect(before.length).toBeGreaterThanOrEqual(5);
    // Tag the OLDEST so prune must preserve it.
    await runVersion({ action: 'tag', slug: 'jiyoon', versionA: before[0].id, tag: 'keep-me' } as never);

    const dry = await runGc({ action: 'prune-versions', slug: 'jiyoon', keep: 1 } as never);
    expect(dry.content[0].text).toMatch(/dry-run/);
    expect((await listVersions('jiyoon')).length).toBe(before.length); // nothing deleted yet

    await runGc({ action: 'prune-versions', slug: 'jiyoon', keep: 1, apply: true } as never);
    const after = await listVersions('jiyoon');
    expect(after.length).toBeLessThan(before.length);
    expect(after.some((v) => v.id === before[0].id)).toBe(true); // tagged survived
  });

  it('purge-media removes originals but keeps transcripts', async () => {
    await bootstrapAndSign('jiyoon');
    const { runInterview } = await import('../src/tools/interview.js');
    const { runGc } = await import('../src/tools/gc.js');
    const { agentDir, interviewAttachmentsDir } = await import('../src/storage.js');

    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 'm', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    await writeFile(join(agentDir('jiyoon'), 'a.mp3'), Buffer.from('AUDIO'));
    await writeFile(join(agentDir('jiyoon'), 'a.txt'), '전사본유지토큰.');
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'a.mp3'), transcript: join(agentDir('jiyoon'), 'a.txt'), speakers: ['이지윤'] } as never);

    await runGc({ action: 'purge-media', slug: 'jiyoon', apply: true } as never);
    const dir = interviewAttachmentsDir('jiyoon', sid);
    await expect(stat(join(dir, 'a.mp3'))).rejects.toBeTruthy(); // original gone
    const trans = await readFile(join(dir, 'a.mp3.transcript.md'), 'utf8'); // transcript kept
    expect(trans).toContain('전사본유지토큰');
  });

  it('purge-archive hard-deletes archived agents + registry entry', async () => {
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');
    const { runGc } = await import('../src/tools/gc.js');
    const { runList } = await import('../src/tools/list.js');
    const { archivedAgentDir } = await import('../src/storage.js');
    await runArchive({ action: 'archive', slug: 'jiyoon' } as never);

    const dry = await runGc({ action: 'purge-archive', slug: 'jiyoon' } as never);
    expect(dry.content[0].text).toMatch(/dry-run/);

    await runGc({ action: 'purge-archive', slug: 'jiyoon', apply: true } as never);
    await expect(stat(archivedAgentDir('jiyoon'))).rejects.toBeTruthy();
    const list = JSON.parse((await runList({ json: true })).content[0].text);
    expect(list.agents.some((a: { slug: string }) => a.slug === 'jiyoon')).toBe(false);
  });
});

/* --------------------------------------------------------------- */
/* transcribe --text / --apply (Feature 1)                         */
/* --------------------------------------------------------------- */

describe('interview · transcribe', () => {
  it('--text saves a transcript that becomes RAG-searchable', async () => {
    await bootstrapAndSign('jiyoon');
    const { runInterview } = await import('../src/tools/interview.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { agentDir } = await import('../src/storage.js');
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 't', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);

    const save = await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, file: 'rec.mp3', text: '폴리시드토큰: 대시보드 export 절차 설명.' } as never);
    expect(save.isError).toBeUndefined();
    expect(save.content[0].text).toMatch(/저장|polished/);

    const ask = await runAsk({ slug: 'jiyoon', question: '대시보드 export 절차?' } as never);
    expect(ask.content[0].text).toContain('폴리시드토큰');
  });

  it('--apply without a local whisper binary fails gracefully', async () => {
    await bootstrapAndSign('jiyoon');
    const { runInterview } = await import('../src/tools/interview.js');
    const { agentDir } = await import('../src/storage.js');
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 'a', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);
    const r = await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, apply: true } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/whisper|model/i);
  });
});

/* --------------------------------------------------------------- */
/* audit checkpoint / fast verify (Feature 5)                      */
/* --------------------------------------------------------------- */

describe('audit · checkpoint + fast verify', () => {
  it('records a checkpoint and fast-verifies; detects tampering after the checkpoint', async () => {
    await bootstrapAndSign('jiyoon'); // generates several audit records
    const { runAudit } = await import('../src/tools/audit.js');
    const { auditPath, readCheckpoints } = await import('../src/audit.js');

    const cp = await runAudit({ checkpoint: true, json: true } as never);
    const cpJson = JSON.parse(cp.content[0].text);
    expect(cpJson.checkpoints).toBeGreaterThanOrEqual(1);
    expect((await readCheckpoints()).length).toBeGreaterThanOrEqual(1);

    // fast verify is OK right after checkpoint
    const fastOk = JSON.parse((await runAudit({ fast: true, json: true } as never)).content[0].text);
    expect(fastOk.verification.ok).toBe(true);

    // append a forged record AFTER the checkpoint → fast verify must FAIL
    await appendFile(auditPath(), JSON.stringify({ seq: 9999, ts: 'x', prev: 'bad', hash: 'deadbeef', tool: 'evil', summary: 'forged' }) + '\n', 'utf8');
    const fastBad = JSON.parse((await runAudit({ fast: true, json: true } as never)).content[0].text);
    expect(fastBad.verification.ok).toBe(false);
  });

  it('refuses to checkpoint a broken chain', async () => {
    await bootstrapAndSign('jiyoon');
    const { runAudit } = await import('../src/tools/audit.js');
    const { auditPath } = await import('../src/audit.js');
    await appendFile(auditPath(), 'not-json-line\n', 'utf8');
    const cp = await runAudit({ checkpoint: true, json: true } as never);
    const j = JSON.parse(cp.content[0].text);
    expect(j.checkpointNote).toMatch(/실패|broken/i);
  });
});
