/**
 * Tests for the v0.11 usability work:
 *   - afterglow_learn: add knowledge via text / path / url so `ask` can use it
 *     without the user hunting for the hidden knowledge/ folder.
 *   - afterglow_guide: state-aware getting-started orientation.
 *   - create ceremony reduction: auto-init (no separate init) + one-shot
 *     --signer (create + sign in one call).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;
let cwdRoot: string;
const origCwd = process.cwd();

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-use-'));
  cwdRoot = await mkdtemp(join(tmpdir(), 'afterglow-use-cwd-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
  process.chdir(cwdRoot);
});
afterEach(async () => {
  process.chdir(origCwd);
  delete process.env.AFTERGLOW_ROOT;
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
  if (cwdRoot) await rm(cwdRoot, { recursive: true, force: true });
});

async function makeAgent(slug = 'jiyoon', signer = '이지윤') {
  const { runCreate } = await import('../src/tools/create.js');
  await runCreate({ slug, name: '이지윤', role: '디자이너', signer } as never);
}

/* ----------------------------------------------------------------- */
/* create — auto-init + one-shot signer                              */
/* ----------------------------------------------------------------- */

describe('create · ceremony reduction', () => {
  it('auto-initializes when the store is not bootstrapped (no separate init)', async () => {
    const { isInitialized } = await import('../src/storage.js');
    expect(await isInitialized()).toBe(false);
    const { runCreate } = await import('../src/tools/create.js');
    const r = await runCreate({ slug: 'jiyoon', name: '이지윤', role: '디자이너' } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toMatch(/자동 초기화/);
    expect(await isInitialized()).toBe(true);
  });

  it('--signer creates AND activates in one call', async () => {
    const { runCreate } = await import('../src/tools/create.js');
    const { getStatus } = await import('../src/storage.js');
    const r = await runCreate({ slug: 'jiyoon', name: '이지윤', role: '디자이너', signer: '이지윤' } as never);
    expect(r.content[0].text).toMatch(/active/);
    expect(await getStatus('jiyoon')).toBe('active');
  });

  it('without --signer stays draft and ask is refused', async () => {
    const { runCreate } = await import('../src/tools/create.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { getStatus } = await import('../src/storage.js');
    await runCreate({ slug: 'jiyoon', name: '이지윤', role: '디자이너' } as never);
    expect(await getStatus('jiyoon')).toBe('draft');
    const ask = await runAsk({ slug: 'jiyoon', question: '안녕?' } as never);
    expect(ask.isError).toBe(true); // not active yet
  });
});

/* ----------------------------------------------------------------- */
/* learn — knowledge ingestion                                       */
/* ----------------------------------------------------------------- */

describe('learn · knowledge ingestion', () => {
  it('--text writes a .md into knowledge/ and ask retrieves it', async () => {
    await makeAgent();
    const { runLearn } = await import('../src/tools/learn.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { knowledgeDir } = await import('../src/storage.js');

    const r = await runLearn({ slug: 'jiyoon', text: '결제 fallback 은 토스 우선순위로 처리합니다. 학습토큰X.', title: 'payment' } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toMatch(/학습/);

    const files = await readdir(knowledgeDir('jiyoon'));
    expect(files.some((f) => f.endsWith('.md'))).toBe(true);

    const ask = await runAsk({ slug: 'jiyoon', question: '결제 fallback 우선순위?' } as never);
    expect(ask.content[0].text).toContain('학습토큰X');
  });

  it('--path copies indexable files from a cwd folder and skips others', async () => {
    await makeAgent();
    const { runLearn } = await import('../src/tools/learn.js');
    const { knowledgeDir } = await import('../src/storage.js');
    // Build a source folder under cwd with one indexable + one not.
    const src = join(cwdRoot, 'notes');
    await mkdir(src, { recursive: true });
    await writeFile(join(src, 'good.md'), '온보딩 step2 줄여 이탈 22→9.', 'utf8');
    await writeFile(join(src, 'skip.pdf'), 'binary-ish', 'utf8');

    const r = await runLearn({ slug: 'jiyoon', path: 'notes' } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toMatch(/1개 자료/);
    expect(r.content[0].text).toMatch(/건너뜀 1개/);

    const files = await readdir(knowledgeDir('jiyoon'));
    expect(files).toContain('good.md');
    expect(files).not.toContain('skip.pdf');
  });

  it('refuses a --path outside the cwd subtree', async () => {
    await makeAgent();
    const { runLearn } = await import('../src/tools/learn.js');
    const r = await runLearn({ slug: 'jiyoon', path: '/etc/hosts' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/현재 작업 폴더/);
  });

  it('requires one of path/text/url', async () => {
    await makeAgent();
    const { runLearn } = await import('../src/tools/learn.js');
    const r = await runLearn({ slug: 'jiyoon' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/path · text · url/);
  });

  it('honours the access policy (gated like other mutators)', async () => {
    await makeAgent();
    const { runAccess } = await import('../src/tools/access.js');
    const { runLearn } = await import('../src/tools/learn.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const denied = await runLearn({ slug: 'jiyoon', text: 'x' } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);
  });
});

/* ----------------------------------------------------------------- */
/* guide — orientation                                               */
/* ----------------------------------------------------------------- */

describe('guide · orientation', () => {
  it('works before init and shows the copy-paste quickstart', async () => {
    const { isInitialized } = await import('../src/storage.js');
    expect(await isInitialized()).toBe(false);
    const { runGuide } = await import('../src/tools/guide.js');
    const r = await runGuide({} as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toMatch(/빠른 시작/);
    expect(r.content[0].text).toMatch(/create → learn → sign → ask/);
    expect(r.content[0].text).toMatch(/지금 바로/);
  });

  it('adapts once agents exist and points at the next step', async () => {
    await makeAgent('jiyoon', '이지윤'); // active
    const { runGuide } = await import('../src/tools/guide.js');
    const r = await runGuide({} as never);
    expect(r.content[0].text).toMatch(/등록된 에이전트 \(1\)/);
    expect(r.content[0].text).toMatch(/다음 단계 — jiyoon/);
    expect(r.content[0].text).toMatch(/learn jiyoon/);
  });
});
