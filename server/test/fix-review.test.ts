/**
 * Regression tests for the two bugs caught during the v0.9 design review:
 * - B1: persona.bio truncation dropped NEW content (kept first 20k) — now
 *   drops oldest absorbed-interview blocks so finalize always preserves the
 *   most recent boost.
 * - B2: `skipped` questions (n/a / meaningless from the HTML answer sheet)
 *   never made it into renderInterviewBlock — now absorbed with their
 *   skipReason/skipNote so future asks know the area was marked off-limits.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-fixes-'));
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
  await runCreate({ slug, name, role: '디자이너' } as never);
  await runSign({ slug, signer: name });
}
async function startAsync(slug = 'jiyoon') {
  const { runInterview } = await import('../src/tools/interview.js');
  const s = await runInterview({ action: 'start', slug, title: '회차', interviewer: '김', interviewee: '이지윤', mode: 'async' } as never);
  return s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
}
async function addQ(slug: string, sid: string, q: string): Promise<string> {
  const { runInterview } = await import('../src/tools/interview.js');
  const r = await runInterview({ action: 'add-question', slug, session: sid, question: q } as never);
  return r.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
}
async function answer(slug: string, sid: string, id: string, text: string) {
  const { runInterview } = await import('../src/tools/interview.js');
  await runInterview({ action: 'answer', slug, session: sid, id, answer: text, source: 'self-typed' } as never);
}
async function finalize(slug: string, sid: string) {
  const { runInterview } = await import('../src/tools/interview.js');
  await runInterview({ action: 'finalize', slug, session: sid, signRole: 'interviewer', signer: '김' } as never);
  await runInterview({ action: 'finalize', slug, session: sid, signRole: 'interviewee', signer: '이지윤' } as never);
}

/* ----------------------------------------------------------------- */
/* B1 — bio truncation must drop OLDEST block, not the newest one    */
/* ----------------------------------------------------------------- */

describe('fix · B1 persona.bio fits by dropping oldest absorbed block', () => {
  it('after many rounds, the most recent interview is always preserved', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { readPersona } = await import('../src/storage.js');

    // Each round adds an answered question large enough that 6 rounds combined
    // overflow the 20k bio cap. We tag each round so we can see which absorbed
    // blocks survive after fit-from-the-front trimming.
    const FILLER = '결제 정책 설명 '.repeat(500); // ~4.5 KB each → 6 rounds ≈ 27 KB
    for (let r = 1; r <= 6; r++) {
      const sid = await startAsync();
      const qid = await addQ('jiyoon', sid, `회차${r} 질문?`);
      await answer('jiyoon', sid, qid, `회차${r}토큰 ${FILLER}`);
      await finalize('jiyoon', sid);
    }

    const persona = await readPersona('jiyoon');
    expect(persona.bio).toBeTruthy();
    expect((persona.bio ?? '').length).toBeLessThanOrEqual(20_000);
    // The most recent round MUST be present (was dropped by the buggy slice).
    expect(persona.bio).toContain('회차6토큰');
    // At least one of the very oldest rounds should have been dropped to fit.
    expect(persona.bio).not.toContain('회차1토큰');
  });
});

/* ----------------------------------------------------------------- */
/* B2 — skipped questions are absorbed with skipReason/skipNote      */
/* ----------------------------------------------------------------- */

describe('fix · B2 skipped questions absorbed into persona.bio', () => {
  it('n/a + meaningless questions land in a dedicated bio section with reason', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { readPersona, agentDir } = await import('../src/storage.js');
    const sid = await startAsync();
    const q1 = await addQ('jiyoon', sid, '의료 데이터 보안 정책은?');
    const q2 = await addQ('jiyoon', sid, '주말 당직 패턴은?');

    // Hand-craft a JSON answer sheet (the HTML form's output).
    const payload = {
      afterglowAnswerSheet: 1,
      slug: 'jiyoon',
      sessionId: sid,
      answers: [
        { id: q1, kind: 'n/a', note: '이 팀은 의료 데이터 안 다룸' },
        { id: q2, kind: 'meaningless' },
      ],
    };
    const sheetPath = join(agentDir('jiyoon'), 'sheet.json');
    await writeFile(sheetPath, JSON.stringify(payload), 'utf8');
    await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: sheetPath } as never);
    await finalize('jiyoon', sid);

    const persona = await readPersona('jiyoon');
    expect(persona.bio).toContain('해당 없음 / 의미 없음');
    expect(persona.bio).toContain('의료 데이터 보안 정책은?');
    expect(persona.bio).toContain('[n/a]');
    expect(persona.bio).toContain('이 팀은 의료 데이터 안 다룸');
    expect(persona.bio).toContain('[meaningless]');
  });

  it('a session with ONLY skipped questions still gets absorbed (was previously suppressed)', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { readPersona, agentDir } = await import('../src/storage.js');
    const sid = await startAsync();
    const q1 = await addQ('jiyoon', sid, '치과 전공 분야?');

    const payload = {
      afterglowAnswerSheet: 1,
      slug: 'jiyoon',
      sessionId: sid,
      answers: [{ id: q1, kind: 'n/a', note: '내과 의사임' }],
    };
    const sheetPath = join(agentDir('jiyoon'), 'sheet.json');
    await writeFile(sheetPath, JSON.stringify(payload), 'utf8');
    await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: sheetPath } as never);
    await finalize('jiyoon', sid);

    const persona = await readPersona('jiyoon');
    expect(persona.bio).toContain('해당 없음 / 의미 없음');
    expect(persona.bio).toContain('치과 전공 분야');
  });
});
