/**
 * Storage / persona / RAG / tool integration tests.
 *
 * Every test redirects ~/.claude/afterglow/ to an isolated tmp dir via the
 * AFTERGLOW_ROOT env var. We re-import the modules inside `beforeEach` so the
 * rootDir() helper picks up the new env value on each test.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, mkdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-test-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
});

afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  if (tmpRoot) {
    await rm(tmpRoot, { recursive: true, force: true });
  }
});

describe('storage', () => {
  it('init creates the expected scaffold', async () => {
    const { init, isInitialized, configPath, registryPath, councilsDir, agentsDir } =
      await import('../src/storage.js');

    expect(await isInitialized()).toBe(false);
    const result = await init({});
    expect(result.alreadyExisted).toBe(false);
    expect(result.created.length).toBeGreaterThan(0);

    expect(await isInitialized()).toBe(true);
    // sanity check: paths now exist
    for (const p of [configPath(), registryPath(), councilsDir(), agentsDir()]) {
      const stat = await import('node:fs/promises').then((m) => m.stat(p));
      expect(stat).toBeDefined();
    }
  });

  it('init is idempotent', async () => {
    const { init } = await import('../src/storage.js');
    const r1 = await init({});
    const r2 = await init({});
    expect(r1.alreadyExisted).toBe(false);
    expect(r2.alreadyExisted).toBe(true);
    expect(r2.created).toHaveLength(0);
  });

  it('rejects invalid slugs', async () => {
    const { init, createAgentSkeleton, InvalidSlugError } = await import('../src/storage.js');
    await init({});
    await expect(createAgentSkeleton('Bad_Slug!')).rejects.toBeInstanceOf(InvalidSlugError);
    await expect(createAgentSkeleton('-leading')).rejects.toBeInstanceOf(InvalidSlugError);
    await expect(createAgentSkeleton('trailing-')).rejects.toBeInstanceOf(InvalidSlugError);
  });

  it('refuses double-create', async () => {
    const { init, createAgentSkeleton, AgentExistsError } = await import('../src/storage.js');
    await init({});
    await createAgentSkeleton('jiyoon');
    await expect(createAgentSkeleton('jiyoon')).rejects.toBeInstanceOf(AgentExistsError);
  });
});

describe('persona', () => {
  it('builds a persona with defaults', async () => {
    const { buildPersona, PersonaSchema, renderSystemPrompt } = await import('../src/persona.js');
    const p = buildPersona({
      slug: 'jiyoon',
      name: '이지윤',
      role: '프로덕트 디자이너',
      expertise: ['디자인', '연구'],
    });
    expect(PersonaSchema.safeParse(p).success).toBe(true);
    expect(p.tone.honorific).toBe(80);
    expect(p.mcpAllow).toContain('filesystem');
    const prompt = renderSystemPrompt(p);
    expect(prompt).toContain('이지윤');
    expect(prompt).toContain('## 톤');
    expect(prompt).toContain('## 자신있는 영역');
    expect(prompt).toContain('디자인 · 연구');
  });

  it('rejects out-of-range tone values', async () => {
    const { PersonaSchema } = await import('../src/persona.js');
    const r = PersonaSchema.safeParse({
      slug: 'x',
      name: 'X',
      role: 'r',
      tone: { honorific: 150, warmth: 0, humor: 0, verbosity: 0, certainty: 0 },
      createdAt: '2026-01-01T00:00:00Z',
      updatedAt: '2026-01-01T00:00:00Z',
    });
    expect(r.success).toBe(false);
  });
});

describe('rag', () => {
  it('returns empty array when knowledge/ is empty', async () => {
    const { init, createAgentSkeleton } = await import('../src/storage.js');
    const { retrieve } = await import('../src/rag.js');
    await init({});
    await createAgentSkeleton('jiyoon');
    const hits = await retrieve('jiyoon', 'anything');
    expect(hits).toEqual([]);
  });

  it('scores chunks by token overlap', async () => {
    const { init, createAgentSkeleton, knowledgeDir } = await import('../src/storage.js');
    const { retrieve, tokenize } = await import('../src/rag.js');
    await init({});
    await createAgentSkeleton('jiyoon');
    const kdir = knowledgeDir('jiyoon');
    await writeFile(
      join(kdir, 'onboarding.md'),
      [
        '# 온보딩 step 3 이탈',
        '',
        'step 3 이탈은 사실 step 3 잘못이 아니라 step 2 설명 길이 때문이었어요.',
        '우리는 step 2 설명을 절반으로 줄였고 이탈이 22% → 9% 로 떨어졌어요.',
      ].join('\n'),
      'utf8',
    );
    await writeFile(
      join(kdir, 'design-system.md'),
      '디자인 시스템은 라이브러리가 아니라 합의입니다.',
      'utf8',
    );

    const hits = await retrieve('jiyoon', '온보딩 step 3 이탈 어떻게 줄였어요?');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.path).toMatch(/onboarding\.md$/);
    expect(hits[0].score).toBeGreaterThan(0);

    // tokenizer drops stopwords like "이건"/"the"
    expect(tokenize('the and a 그리고')).toEqual([]);
  });
});

describe('tools — end-to-end', () => {
  it('init → create → sign → list → inspect → ask round-trip', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runCreate } = await import('../src/tools/create.js');
    const { runSign } = await import('../src/tools/sign.js');
    const { runList } = await import('../src/tools/list.js');
    const { runInspect } = await import('../src/tools/inspect.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { knowledgeDir } = await import('../src/storage.js');

    const r1 = await runInit({});
    expect(r1.isError).toBeUndefined();
    expect(r1.content[0].text).toContain('Afterglow 초기화 완료');

    const r2 = await runCreate({
      slug: 'jiyoon',
      name: '이지윤',
      role: '프로덕트 디자이너',
      tenure: '2019.03 – 2025.11',
      expertise: ['디자인'],
      sources: ['./materials/', 'https://example.com/page'],
    });
    expect(r2.isError).toBeUndefined();
    expect(r2.content[0].text).toContain('에이전트 폴더 생성');

    // Flip draft → active so the ask gate lets us through.
    const r2b = await runSign({ slug: 'jiyoon', signer: '본인' });
    expect(r2b.isError).toBeUndefined();

    // Drop in a knowledge chunk so ask has something to retrieve.
    const kdir = knowledgeDir('jiyoon');
    await mkdir(kdir, { recursive: true });
    await writeFile(
      join(kdir, 'note.md'),
      '온보딩 step 3 이탈을 step 2 설명 단축으로 절반 줄였습니다.',
      'utf8',
    );

    const r3 = await runList({});
    expect(r3.isError).toBeUndefined();
    expect(r3.content[0].text).toContain('jiyoon');

    const r3b = await runList({ json: true });
    const json = JSON.parse(r3b.content[0].text) as { count: number; agents: { slug: string }[] };
    expect(json.count).toBe(1);
    expect(json.agents[0].slug).toBe('jiyoon');

    const r4 = await runInspect({ slug: 'jiyoon' });
    expect(r4.isError).toBeUndefined();
    expect(r4.content[0].text).toContain('이지윤');
    expect(r4.content[0].text).toContain('jiyoon');

    const r5 = await runAsk({ slug: 'jiyoon', question: '온보딩 step 3 이탈, 어떻게 줄였어요?' });
    expect(r5.isError).toBeUndefined();
    const askText = r5.content[0].text;
    expect(askText).toContain('# 호출 컨텍스트');
    expect(askText).toContain('## 사용자 질문');
    expect(askText).toContain('[근거 A] 페르소나 소개');
    expect(askText).toContain('[근거 C] 검색된 자료');
    expect(askText).toContain('답변 규칙');         // grounding contract present
    expect(askText).toContain('근거 판정');          // verdict banner present
    expect(askText).toContain('step 2 설명 단축');
  });

  it('returns structured error when ask called on unknown agent', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runAsk } = await import('../src/tools/ask.js');
    await runInit({});
    const r = await runAsk({ slug: 'ghost', question: 'hi' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not found/i);
  });

  it('returns structured error when called before init', async () => {
    const { runList } = await import('../src/tools/list.js');
    const r = await runList({});
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not been initialized/i);
  });

  it('write-then-read persona round-trip preserves content', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runCreate } = await import('../src/tools/create.js');
    const { personaPath } = await import('../src/storage.js');
    await runInit({});
    await runCreate({
      slug: 'jaehoon',
      name: '박재훈',
      role: '백엔드',
      expertise: ['개발'],
    });
    const raw = await readFile(personaPath('jaehoon'), 'utf8');
    expect(raw).toContain('"slug": "jaehoon"');
    expect(raw).toContain('"name": "박재훈"');
  });
});
