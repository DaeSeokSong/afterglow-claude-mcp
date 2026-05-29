/**
 * Tests for the file-based (async) interview path:
 *   interview export-sheet → (hand off / fill) → interview import-answers
 * complementing the real-time (sync) answer flow. mode=async guidance too.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-sheet-'));
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
  const s = await runInterview({ action: 'start', slug, title: '파일 인터뷰', interviewer: '김', interviewee: '이지윤', mode: 'async' } as never);
  return s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
}
async function addQ(slug: string, sid: string, question: string): Promise<string> {
  const { runInterview } = await import('../src/tools/interview.js');
  const r = await runInterview({ action: 'add-question', slug, session: sid, question } as never);
  return r.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
}

describe('interview · export-sheet (md, legacy)', () => {
  it('format:md writes a sheet with id/Q/A markers for pending questions', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { interviewSessionDir } = await import('../src/storage.js');
    const sid = await startAsync();
    const q1 = await addQ('jiyoon', sid, '결제 fallback 5초 후 정책은?');
    const q2 = await addQ('jiyoon', sid, '온보딩 step 2를 어떻게 줄였나요?');

    const ex = await runInterview({ action: 'export-sheet', slug: 'jiyoon', session: sid, format: 'md' } as never);
    expect(ex.isError).toBeUndefined();
    const sheetPath = join(interviewSessionDir('jiyoon', sid), `answersheet-${sid}.md`);
    const sheet = await readFile(sheetPath, 'utf8');
    expect(sheet).toContain(`=== ${q1}`);
    expect(sheet).toContain(`=== ${q2}`);
    expect(sheet).toContain('[Q] 결제 fallback');
    expect(sheet).toContain('[A]');
  });

  it('refuses when there are no pending questions', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const sid = await startAsync();
    const r = await runInterview({ action: 'export-sheet', slug: 'jiyoon', session: sid } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/add-question/);
  });
});

describe('interview · import-answers (md round-trip, legacy)', () => {
  it('export(md) → fill → import records the answers (source self-typed)', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { interviewSessionDir, readInterviewSession } = await import('../src/storage.js');
    const sid = await startAsync();
    await addQ('jiyoon', sid, '결제 fallback 5초 후 정책은?');
    await addQ('jiyoon', sid, '온보딩 step 2를 어떻게 줄였나요?');
    await runInterview({ action: 'export-sheet', slug: 'jiyoon', session: sid, format: 'md' } as never);

    // Simulate the interviewee filling the sheet (replace the placeholder lines).
    const sheetPath = join(interviewSessionDir('jiyoon', sid), `answersheet-${sid}.md`);
    const filled = (await readFile(sheetPath, 'utf8')).replace(/<여기에 답변[^\n]*>/g, '파일답변토큰: 정산은 주 1회.');
    await writeFile(sheetPath, filled, 'utf8');

    const imp = await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: sheetPath } as never);
    expect(imp.isError).toBeUndefined();
    expect(imp.content[0].text).toMatch(/적용 2/);

    const s = (await readInterviewSession('jiyoon', sid))!;
    const answered = s.questions.filter((q) => q.status === 'answered');
    expect(answered).toHaveLength(2);
    expect(answered[0].answer).toContain('파일답변토큰');
    expect(answered[0].answerSource).toBe('self-typed');
  });

  it('handles declined, placeholder-skip, and unknown ids', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { readInterviewSession, agentDir } = await import('../src/storage.js');
    const sid = await startAsync();
    const q1 = await addQ('jiyoon', sid, 'Q1?');
    const q2 = await addQ('jiyoon', sid, 'Q2?');
    const q3 = await addQ('jiyoon', sid, 'Q3?');

    // Hand-craft a filled sheet: q1 answered, q2 declined, q3 left blank, + bogus id.
    const sheet = [
      '# answer sheet',
      '',
      `=== ${q1}`,
      '[Q] Q1?',
      '[A]',
      '5초 후 자동 전환입니다.',
      '',
      `=== ${q2}`,
      '[Q] Q2?',
      '[A]',
      '(declined)',
      '',
      `=== ${q3}`,
      '[Q] Q3?',
      '[A]',
      '<여기에 답변 / write your answer here>',
      '',
      '=== q-bogus-id-9999',
      '[Q] ghost',
      '[A]',
      '버려질 답변',
      '',
    ].join('\n');
    const sheetPath = join(agentDir('jiyoon'), 'filled.md');
    await writeFile(sheetPath, sheet, 'utf8');

    const imp = await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: sheetPath } as never);
    expect(imp.isError).toBeUndefined();
    const t = imp.content[0].text;
    expect(t).toMatch(/적용 1/);
    expect(t).toMatch(/거절 1/);
    expect(t).toMatch(/미매칭 1/);

    const s = (await readInterviewSession('jiyoon', sid))!;
    expect(s.questions.find((q) => q.id === q1)!.status).toBe('answered');
    expect(s.questions.find((q) => q.id === q2)!.status).toBe('declined');
    expect(s.questions.find((q) => q.id === q3)!.status).toBe('pending'); // placeholder skipped
  });

  it('full async flow → finalize absorbs the imported answer into persona.bio', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { interviewSessionDir, readPersona } = await import('../src/storage.js');
    const sid = await startAsync();
    await addQ('jiyoon', sid, '결제 정산 주기는?');
    await runInterview({ action: 'export-sheet', slug: 'jiyoon', session: sid, format: 'md' } as never);
    const sheetPath = join(interviewSessionDir('jiyoon', sid), `answersheet-${sid}.md`);
    const filled = (await readFile(sheetPath, 'utf8')).replace(/<여기에 답변[^\n]*>/g, '비동기흡수토큰: 주 1회 정산.');
    await writeFile(sheetPath, filled, 'utf8');
    await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: sheetPath } as never);

    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewer', signer: '김' } as never);
    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewee', signer: '이지윤' } as never);

    const persona = await readPersona('jiyoon');
    expect(persona.bio ?? '').toContain('비동기흡수토큰');
  });
});

describe('interview · mode guidance + elicitation', () => {
  it('mode=async start surfaces the export-sheet/import-answers flow', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 'a', interviewer: '김', interviewee: '이지윤', mode: 'async' } as never);
    const t = s.content[0].text;
    expect(t).toMatch(/async · 파일 인터뷰/);
    expect(t).toContain('export-sheet');
    expect(t).toContain('import-answers');
  });

  it('default (sync) start surfaces the real-time answer flow', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 'b', interviewer: '김', interviewee: '이지윤' } as never);
    expect(s.content[0].text).toMatch(/sync · 실시간 인터뷰/);
  });

  it('import-answers without a sheet elicits the sheet arg', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const sid = await startAsync();
    const r = await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('[필수] sheet');
  });
});

/* --------------------------------------------------------------- */
/* HTML form (default) + JSON import (the new path the user asked) */
/* --------------------------------------------------------------- */

describe('interview · export-sheet (HTML, new default)', () => {
  it('default format is html and writes a self-contained form with auto-save', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { interviewSessionDir } = await import('../src/storage.js');
    const sid = await startAsync();
    const q1 = await addQ('jiyoon', sid, '결제 fallback 5초 후 정책은?');
    const q2 = await addQ('jiyoon', sid, '의미 없는 질문일 수도?');

    const ex = await runInterview({ action: 'export-sheet', slug: 'jiyoon', session: sid } as never);
    expect(ex.isError).toBeUndefined();
    const sheetPath = join(interviewSessionDir('jiyoon', sid), `answersheet-${sid}.html`);
    const html = await readFile(sheetPath, 'utf8');
    // self-contained: no external CSS/JS/CDN, inline style + script.
    expect(html).toMatch(/<!doctype html>/i);
    expect(html).toContain('<style>');
    expect(html).toContain('<script>');
    expect(html).not.toMatch(/<link[^>]+href=/);
    expect(html).not.toMatch(/<script[^>]+src=/);
    // 4-way kind per question.
    expect(html).toContain('답변함');
    expect(html).toContain('답변 거절');
    expect(html).toContain('해당 없음');
    expect(html).toContain('의미 없는 질문');
    // Auto-save wiring: localStorage key scoped to slug+sessionId.
    expect(html).toContain(`afterglow:answers:jiyoon:${sid}`);
    expect(html).toMatch(/localStorage\.setItem/);
    expect(html).toMatch(/localStorage\.getItem/);
    // Question manifest is embedded for both rendering and a safety check.
    expect(html).toContain(q1);
    expect(html).toContain(q2);
    // The download flow is wired (button + handler).
    expect(html).toMatch(/function downloadJSON/);
    expect(html).toContain('답변 JSON 내려받기');
  });
});

describe('interview · import-answers (JSON from the HTML form)', () => {
  it('round-trips answered / declined / n-a / meaningless with skipReason', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { readInterviewSession, agentDir } = await import('../src/storage.js');
    const sid = await startAsync();
    const q1 = await addQ('jiyoon', sid, 'Q1?');
    const q2 = await addQ('jiyoon', sid, 'Q2?');
    const q3 = await addQ('jiyoon', sid, 'Q3?');
    const q4 = await addQ('jiyoon', sid, 'Q4?');

    const payload = {
      afterglowAnswerSheet: 1,
      slug: 'jiyoon',
      sessionId: sid,
      exportedAt: new Date().toISOString(),
      answers: [
        { id: q1, kind: 'answered', answer: 'JSON폼토큰: 5초 후 자동 전환.' },
        { id: q2, kind: 'declined' },
        { id: q3, kind: 'n/a', note: '이 회사엔 그 정책 없음' },
        { id: q4, kind: 'meaningless', note: '' },
        { id: 'q-bogus', kind: 'answered', answer: '버려질' },
      ],
    };
    const jsonPath = join(agentDir('jiyoon'), `answers-${sid}.json`);
    await writeFile(jsonPath, JSON.stringify(payload, null, 2), 'utf8');

    const imp = await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: jsonPath } as never);
    expect(imp.isError).toBeUndefined();
    const t = imp.content[0].text;
    expect(t).toMatch(/json/);
    expect(t).toMatch(/적용 1/);
    expect(t).toMatch(/거절 1/);
    expect(t).toMatch(/미매칭 1/);

    const s = (await readInterviewSession('jiyoon', sid))!;
    const get = (id: string) => s.questions.find((q) => q.id === id)!;
    expect(get(q1).status).toBe('answered');
    expect(get(q1).answer).toContain('JSON폼토큰');
    expect(get(q1).answerSource).toBe('self-typed');
    expect(get(q2).status).toBe('declined');
    expect(get(q3).status).toBe('skipped');
    expect(get(q3).skipReason).toBe('n/a');
    expect(get(q3).skipNote).toBe('이 회사엔 그 정책 없음');
    expect(get(q4).status).toBe('skipped');
    expect(get(q4).skipReason).toBe('meaningless');
  });

  it('rejects a non-Afterglow JSON envelope', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { agentDir } = await import('../src/storage.js');
    const sid = await startAsync();
    await addQ('jiyoon', sid, 'Q?');
    const bad = join(agentDir('jiyoon'), 'bad.json');
    await writeFile(bad, JSON.stringify({ foo: 1 }), 'utf8');
    const r = await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: bad } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/afterglowAnswerSheet|answers/);
  });

  it('content-sniffs JSON even when the path does not end in .json', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { agentDir, readInterviewSession } = await import('../src/storage.js');
    const sid = await startAsync();
    const q1 = await addQ('jiyoon', sid, 'Q?');
    const odd = join(agentDir('jiyoon'), 'answers.txt');
    await writeFile(odd, JSON.stringify({
      afterglowAnswerSheet: 1, slug: 'jiyoon', sessionId: sid,
      answers: [{ id: q1, kind: 'answered', answer: '스니프토큰' }],
    }), 'utf8');
    const imp = await runInterview({ action: 'import-answers', slug: 'jiyoon', session: sid, sheet: odd } as never);
    expect(imp.isError).toBeUndefined();
    const s = (await readInterviewSession('jiyoon', sid))!;
    expect(s.questions.find((q) => q.id === q1)!.answer).toContain('스니프토큰');
  });
});
