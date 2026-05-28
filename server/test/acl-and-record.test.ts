/**
 * Tests for the design-review follow-ups:
 *   P5 — per-tool ACL minimum: mutator tools (correct, edit, recalibrate
 *        apply, version mutators) honour the agent's access policy. Closes
 *        the README-flagged hole that `access` was ask/council-only.
 *   P2 — `correct --action record-answer`: closes the audit loop by letting
 *        Claude's composed answer be archived back into the agent for
 *        future inspection / list / correction.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-acl-'));
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

/* ----------------------------------------------------------------- */
/* P5 · per-tool ACL                                                  */
/* ----------------------------------------------------------------- */

describe('acl · per-tool gate on mutator tools', () => {
  it('correct mutator is denied when default policy is deny and caller is not allowed', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runCorrect } = await import('../src/tools/correct.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);

    const denied = await runCorrect({
      action: 'feedback', slug: 'jiyoon', recordId: 'r1', feedback: '정정',
    } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);

    await runAccess({ action: 'allow', slug: 'jiyoon', rule: 'user:ykhyun' } as never);
    const ok = await runCorrect({
      action: 'feedback', slug: 'jiyoon', recordId: 'r2', feedback: '정정',
      caller: 'user:ykhyun',
    } as never);
    expect(ok.isError).toBeUndefined();
  });

  it('correct list (read-only) is not gated', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runCorrect } = await import('../src/tools/correct.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const r = await runCorrect({ action: 'list', slug: 'jiyoon' } as never);
    expect(r.isError).toBeUndefined();
  });

  it('edit is denied with explicit caller in deny rule', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runEdit } = await import('../src/tools/edit.js');
    await runAccess({ action: 'deny', slug: 'jiyoon', rule: 'user:eve' } as never);
    const r = await runEdit({ slug: 'jiyoon', bio: 'hack', caller: 'user:eve' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Access denied/);
  });

  it('version rollback is gated; list stays open', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runVersion } = await import('../src/tools/version.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const list = await runVersion({ action: 'list', slug: 'jiyoon' } as never);
    expect(list.isError).toBeUndefined();
    const denied = await runVersion({ action: 'snapshot', slug: 'jiyoon' } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);
  });

  it('malformed caller is rejected with a structured error', async () => {
    await bootstrap();
    const { runCorrect } = await import('../src/tools/correct.js');
    const r = await runCorrect({
      action: 'feedback', slug: 'jiyoon', recordId: 'r1', feedback: 'x',
      caller: 'not-a-valid-format', // missing user:/role:/team: prefix
    } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/Invalid caller/);
  });
});

/* ----------------------------------------------------------------- */
/* P2 · record-answer                                                 */
/* ----------------------------------------------------------------- */

describe('correct · record-answer (P2 — close the audit loop)', () => {
  it('writes a structured answer log + surfaces it under list', async () => {
    await bootstrap();
    const { runCorrect } = await import('../src/tools/correct.js');
    const { readAnswerLog } = await import('../src/storage.js');

    const rec = await runCorrect({
      action: 'record-answer',
      slug: 'jiyoon',
      question: '온보딩 step3 이탈 어떻게 줄였어요?',
      answer: 'step 2 설명을 절반으로 줄였더니 22% → 9% 로 떨어졌어요.',
      confidence: 91,
      sources: ['Confluence · DESIGN/onboarding-v2-postmortem', './materials/interview.pdf · p.14'],
    } as never);
    expect(rec.isError).toBeUndefined();
    expect(rec.content[0].text).toMatch(/회수 저장/);
    expect(rec.content[0].text).toMatch(/신뢰도 91/);

    const log = await readAnswerLog('jiyoon');
    expect(log).toHaveLength(1);
    expect(log[0].question).toContain('온보딩 step3');
    expect(log[0].answer).toContain('22% → 9%');
    expect(log[0].confidence).toBe(91);
    expect(log[0].sources).toHaveLength(2);

    const list = await runCorrect({ action: 'list', slug: 'jiyoon' } as never);
    expect(list.content[0].text).toMatch(/recorded answers/);
    expect(list.content[0].text).toMatch(/91%/);
    expect(list.content[0].text).toMatch(/22% → 9%/);
  });

  it('refuses without question + answer', async () => {
    await bootstrap();
    const { runCorrect } = await import('../src/tools/correct.js');
    const noQ = await runCorrect({ action: 'record-answer', slug: 'jiyoon', answer: 'a' } as never);
    expect(noQ.isError).toBe(true);
    expect(noQ.content[0].text).toMatch(/question/);
    const noA = await runCorrect({ action: 'record-answer', slug: 'jiyoon', question: 'q' } as never);
    expect(noA.isError).toBe(true);
    expect(noA.content[0].text).toMatch(/answer/);
  });

  it('record-answer respects ACL just like the other mutators', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runCorrect } = await import('../src/tools/correct.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const denied = await runCorrect({
      action: 'record-answer', slug: 'jiyoon',
      question: 'q', answer: 'a',
    } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);
  });
});
