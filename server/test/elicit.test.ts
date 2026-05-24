/**
 * Tests for missing-argument elicitation (tools/elicit.ts + per-tool wiring):
 * when a required arg is omitted, tools return a guided reply with numbered
 * candidates, a "직접 입력" escape, and [필수]/[선택] tags — instead of a terse
 * error. When all required args are present, the tool runs normally.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-elicit-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
});
afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function bootstrap(slug = 'jiyoon', name = '이지윤') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runInit({});
  await runCreate({ slug, name, role: '프로덕트 디자이너' } as never);
  await runSign({ slug, signer: name });
}

describe('elicit · simple tools', () => {
  it('ask with no args lists slug candidates + question free-text + tags', async () => {
    await bootstrap();
    const { runAsk } = await import('../src/tools/ask.js');
    const r = await runAsk({} as never);
    expect(r.isError).toBe(true);
    const t = r.content[0].text;
    expect(t).toContain('정보가 더 필요');
    expect(t).toContain('[필수] slug');
    expect(t).toMatch(/1\)\s*jiyoon/);          // dynamic candidate
    expect(t).toContain('이지윤');               // candidate note
    expect(t).toContain('직접 입력');             // the "type your own" escape
    expect(t).toContain('[필수] question');
    expect(t).toContain('[선택]');                // optional args surfaced
  });

  it('create elicits only the still-missing required field (name)', async () => {
    const { runInit } = await import('../src/tools/init.js');
    await runInit({});
    const { runCreate } = await import('../src/tools/create.js');
    const r = await runCreate({ slug: 'newbie', role: '개발자' } as never);
    expect(r.isError).toBe(true);
    const t = r.content[0].text;
    expect(t).toContain('[필수] name');
    expect(t).not.toContain('[필수] slug');   // slug was provided
    expect(t).not.toContain('[필수] role');   // role was provided
    expect(t).toContain('직접 입력');          // free-text arg
  });

  it('runs normally when required args are present (no guide)', async () => {
    await bootstrap();
    const { runAsk } = await import('../src/tools/ask.js');
    const r = await runAsk({ slug: 'ghost', question: '안녕?' } as never);
    // ghost doesn't exist → a not-found error, NOT an elicitation guide.
    expect(r.content[0].text).not.toContain('정보가 더 필요');
  });
});

describe('elicit · action enums', () => {
  it('access with no action lists the action enum', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const r = await runAccess({ slug: 'jiyoon' } as never);
    expect(r.isError).toBe(true);
    const t = r.content[0].text;
    expect(t).toContain('[필수] action');
    expect(t).toMatch(/allow/);
    expect(t).toMatch(/deny/);
  });

  it('archive list needs no slug (runs); archive with no action elicits', async () => {
    await bootstrap();
    const { runArchive } = await import('../src/tools/archive.js');
    const list = await runArchive({ action: 'list' } as never);
    expect(list.content[0].text).not.toContain('정보가 더 필요'); // list runs without slug

    const noAction = await runArchive({} as never);
    expect(noAction.isError).toBe(true);
    expect(noAction.content[0].text).toContain('[필수] action');
  });
});

describe('elicit · interview per-action', () => {
  it('answer with no id surfaces pending-question candidates', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: '갭', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    const add = await runInterview({ action: 'add-question', slug: 'jiyoon', session: sid, question: '5초 후 정책?' } as never);
    const qid = add.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];

    const r = await runInterview({ action: 'answer', slug: 'jiyoon', session: sid } as never);
    expect(r.isError).toBe(true);
    const t = r.content[0].text;
    expect(t).toContain('[필수] id');
    expect(t).toContain(qid);              // the pending question id as a candidate
    expect(t).toContain('[필수] answer');
  });

  it('start with no interviewer elicits it', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const r = await runInterview({ action: 'start', slug: 'jiyoon', title: 'x' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('[필수] interviewer');
  });

  it('transcribe --listModels does not require a session', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const r = await runInterview({ action: 'transcribe', slug: 'jiyoon', listModels: true } as never);
    expect(r.content[0].text).not.toContain('정보가 더 필요');
  });
});

describe('elicit · export one-of', () => {
  it('export with neither slugs nor all guides with agent candidates + all option', async () => {
    await bootstrap();
    const { runExport } = await import('../src/tools/export.js');
    const r = await runExport({} as never);
    expect(r.isError).toBe(true);
    const t = r.content[0].text;
    expect(t).toContain('slugs');
    expect(t).toMatch(/1\)\s*jiyoon/);
    expect(t).toMatch(/all/);
  });
});
