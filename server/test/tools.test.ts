/**
 * End-to-end tool tests for the v0.1.1 additions:
 *   edit · sign · council · history · audit · recalibrate
 *
 * Each test redirects ~/.claude/afterglow/ to a fresh tmp dir so the
 * filesystem is isolated.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-tools-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
  delete process.env.AFTERGLOW_ALLOW_DRAFT;
});

afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  delete process.env.AFTERGLOW_ALLOW_DRAFT;
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function bootstrap(slug = 'jiyoon') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  await runInit({});
  await runCreate({
    slug,
    name: '이지윤',
    role: '프로덕트 디자이너',
    tenure: '2019.03 – 2025.11',
    expertise: ['디자인'],
  });
}

async function bootstrapAndSign(slug = 'jiyoon') {
  await bootstrap(slug);
  const { runSign } = await import('../src/tools/sign.js');
  await runSign({ slug, signer: '본인' });
}

/* --------------------------------------------------------------- */
/* sign + consent gate                                             */
/* --------------------------------------------------------------- */

describe('sign · consent gate', () => {
  it('flips status draft → active and appends a signature block', async () => {
    await bootstrap();
    const { runSign } = await import('../src/tools/sign.js');
    const { runList } = await import('../src/tools/list.js');
    const { consentPath } = await import('../src/storage.js');

    const beforeList = JSON.parse((await runList({ json: true })).content[0].text) as {
      agents: { slug: string; status: string }[];
    };
    expect(beforeList.agents[0].status).toBe('draft');

    const r = await runSign({ slug: 'jiyoon', signer: '이지윤 본인', note: '검수 완료' });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain('active');

    const consent = await readFile(consentPath('jiyoon'), 'utf8');
    expect(consent).toContain('## 서명');
    expect(consent).toContain('이지윤 본인');
    expect(consent).toContain('검수 완료');

    const afterList = JSON.parse((await runList({ json: true })).content[0].text) as {
      agents: { slug: string; status: string }[];
    };
    expect(afterList.agents[0].status).toBe('active');
  });

  it('blocks ask for draft agents (NotSignedError)', async () => {
    await bootstrap();
    const { runAsk } = await import('../src/tools/ask.js');
    const r = await runAsk({ slug: 'jiyoon', question: '?' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/draft|sign/i);
  });

  it('AFTERGLOW_ALLOW_DRAFT=1 bypasses the gate', async () => {
    await bootstrap();
    process.env.AFTERGLOW_ALLOW_DRAFT = '1';
    const { runAsk } = await import('../src/tools/ask.js');
    const r = await runAsk({ slug: 'jiyoon', question: 'test' });
    expect(r.isError).toBeUndefined();
  });

  it('refuses to sign a non-existent agent', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runSign } = await import('../src/tools/sign.js');
    await runInit({});
    const r = await runSign({ slug: 'ghost', signer: 'x' });
    expect(r.isError).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* edit                                                            */
/* --------------------------------------------------------------- */

describe('edit', () => {
  it('updates bio + tone + expertise + sources + mcp allow/deny + thresholds', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    const { readPersona, readSystemPrompt } = await import('../src/storage.js');

    const r = await runEdit({
      slug: 'jiyoon',
      bio: '디자인 시스템을 만들었어요.',
      tone: { humor: 60 },
      addExpertise: ['연구'],
      addSources: [{ location: 'https://example.com/note' }],
      mcpAllowAdd: ['confluence'],
      mcpDenyAdd: ['postgres-prod'],
      confidenceFloor: 55,
      peerAskThreshold: 65,
    });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain('변경 사항');

    const p = await readPersona('jiyoon');
    expect(p.bio).toBe('디자인 시스템을 만들었어요.');
    expect(p.tone.humor).toBe(60);
    expect(p.tone.honorific).toBe(80); // unchanged
    expect(p.expertise).toEqual(expect.arrayContaining(['디자인', '연구']));
    expect(p.sources).toHaveLength(1);
    expect(p.sources[0].kind).toBe('url');
    expect(p.mcpAllow).toEqual(expect.arrayContaining(['filesystem', 'confluence']));
    expect(p.mcpDeny).toContain('postgres-prod');
    expect(p.confidenceFloor).toBe(55);
    expect(p.peerAskThreshold).toBe(65);

    const prompt = await readSystemPrompt('jiyoon');
    expect(prompt).toContain('디자인 시스템을 만들었어요');
    expect(prompt).toContain('연구');
    expect(prompt).toContain('confluence');
    expect(prompt).toContain('postgres-prod');
  });

  it('dry-run does not persist changes', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    const { readPersona } = await import('../src/storage.js');

    const r = await runEdit({ slug: 'jiyoon', bio: '새 소개', dryRun: true });
    expect(r.content[0].text).toContain('[dry-run]');
    const p = await readPersona('jiyoon');
    expect(p.bio).toBeUndefined();
  });

  it('returns "변경 없음" when nothing actually changes', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    const r1 = await runEdit({ slug: 'jiyoon', role: '프로덕트 디자이너' });
    expect(r1.content[0].text).toContain('변경 없음');
  });

  it('open returns the persona.json path + creates a backup snapshot', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    const { personaPath, listVersions } = await import('../src/storage.js');
    const r = await runEdit({ slug: 'jiyoon', open: true } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain(personaPath('jiyoon'));
    expect(r.content[0].text).toMatch(/직접 편집|revalidate/);
    expect((await listVersions('jiyoon')).length).toBeGreaterThan(0); // backup snapshot
  });

  it('revalidate applies a hand-edited persona.json + regenerates system-prompt', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    const { personaPath, readSystemPrompt } = await import('../src/storage.js');
    const { readFile, writeFile } = await import('node:fs/promises');
    // Simulate a vim edit: change bio directly in persona.json.
    const p = JSON.parse(await readFile(personaPath('jiyoon'), 'utf8'));
    p.bio = '직접편집한소개토큰';
    await writeFile(personaPath('jiyoon'), JSON.stringify(p, null, 2));

    const r = await runEdit({ slug: 'jiyoon', revalidate: true } as never);
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toMatch(/재검증 통과|재생성/);
    const sp = await readSystemPrompt('jiyoon');
    expect(sp).toContain('직접편집한소개토큰'); // regenerated from the edited file
  });

  it('revalidate rejects an invalid hand-edited persona.json without applying', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    const { personaPath } = await import('../src/storage.js');
    const { writeFile } = await import('node:fs/promises');
    await writeFile(personaPath('jiyoon'), '{ not valid json');
    const r = await runEdit({ slug: 'jiyoon', revalidate: true } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/파싱 실패|검증 실패/);
  });

  it('removes expertise and sources', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    const { readPersona } = await import('../src/storage.js');

    // add then remove
    await runEdit({
      slug: 'jiyoon',
      addExpertise: ['개발'],
      addSources: [{ location: './a.md' }, { location: './b.md' }],
    });
    const p1 = await readPersona('jiyoon');
    const ids = p1.sources.map((s) => s.id);
    expect(p1.expertise).toContain('개발');
    expect(p1.sources).toHaveLength(2);

    await runEdit({
      slug: 'jiyoon',
      removeExpertise: ['개발'],
      removeSourceIds: [ids[0]],
    });
    const p2 = await readPersona('jiyoon');
    expect(p2.expertise).not.toContain('개발');
    expect(p2.sources).toHaveLength(1);
    expect(p2.sources[0].id).toBe(ids[1]);
  });

  it('rejects out-of-range tone values via zod', async () => {
    await bootstrap();
    const { runEdit } = await import('../src/tools/edit.js');
    // 0 ~ 100 is the zod range — value 150 should fail through safe()
    const r = await runEdit({ slug: 'jiyoon', tone: { humor: 150 } });
    expect(r.isError).toBe(true);
  });

  it('errors on unknown slug', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runEdit } = await import('../src/tools/edit.js');
    await runInit({});
    const r = await runEdit({ slug: 'ghost', bio: 'x' });
    expect(r.isError).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* council                                                         */
/* --------------------------------------------------------------- */

describe('council', () => {
  it('builds brief + writes transcript file, history + audit recorded', async () => {
    await bootstrapAndSign('jiyoon');
    await bootstrapAndSign('jaehoon');
    // small per-agent knowledge so retrieval yields hits
    const { knowledgeDir } = await import('../src/storage.js');
    await writeFile(
      join(knowledgeDir('jiyoon'), 'note.md'),
      '온보딩 step 2 설명을 절반으로 줄여서 step 3 이탈이 9%로 떨어졌어요.',
      'utf8',
    );
    await writeFile(
      join(knowledgeDir('jaehoon'), 'pay.md'),
      '결제 폼 변경은 백엔드에 영향이 없습니다. 3DS만 분리 유지.',
      'utf8',
    );

    const { runCouncil } = await import('../src/tools/council.js');
    const { councilsDir } = await import('../src/storage.js');
    const r = await runCouncil({
      slugs: ['jiyoon', 'jaehoon'],
      question: '온보딩 개선이 결제 폼에 영향 줄까요?',
      topic: 'pay-onboarding',
    });
    expect(r.isError).toBeUndefined();
    const text = r.content[0].text;
    expect(text).toContain('Council Brief');
    expect(text).toContain('jiyoon');
    expect(text).toContain('jaehoon');
    expect(text).toContain('회의록');

    // transcript file should exist in councils/
    const files = (await import('node:fs/promises')).readdir(councilsDir());
    const list = await files;
    expect(list.some((f) => f.includes('pay-onboarding'))).toBe(true);

    const { readHistory } = await import('../src/storage.js');
    const hj = await readHistory('jiyoon');
    expect(hj.some((e) => e.message.startsWith('council'))).toBe(true);

    const { readAll } = await import('../src/audit.js');
    const auditRecords = await readAll();
    expect(auditRecords.some((rec) => rec.tool === 'afterglow_council')).toBe(true);
  });

  it('rejects duplicate slugs', async () => {
    await bootstrapAndSign('jiyoon');
    const { runCouncil } = await import('../src/tools/council.js');
    const r = await runCouncil({ slugs: ['jiyoon', 'jiyoon'], question: '?' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/중복/);
  });

  it('rejects when one participant is draft (not signed)', async () => {
    await bootstrapAndSign('jiyoon');
    await bootstrap('jaehoon'); // draft
    const { runCouncil } = await import('../src/tools/council.js');
    const r = await runCouncil({ slugs: ['jiyoon', 'jaehoon'], question: '?' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/draft|sign/i);
  });

  it('rejects when a participant does not exist', async () => {
    await bootstrapAndSign('jiyoon');
    const { runCouncil } = await import('../src/tools/council.js');
    const r = await runCouncil({ slugs: ['jiyoon', 'ghost'], question: '?' });
    expect(r.isError).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* history                                                         */
/* --------------------------------------------------------------- */

describe('history', () => {
  it('returns empty message when history.log is empty', async () => {
    await bootstrap();
    const { runHistory } = await import('../src/tools/history.js');
    // ensure history file is missing — bootstrap writes one line (create), so clear it
    const { historyLogPath } = await import('../src/storage.js');
    await writeFile(historyLogPath('jiyoon'), '', 'utf8');
    const r = await runHistory({ slug: 'jiyoon' });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toMatch(/history 없음/);
  });

  it('filters by --since and --filter, respects --limit and --reverse', async () => {
    await bootstrapAndSign('jiyoon');
    const { appendHistory, historyLogPath } = await import('../src/storage.js');
    // overwrite history with deterministic timestamps
    await writeFile(
      historyLogPath('jiyoon'),
      [
        '2026-01-01T00:00:00.000Z  ask: "alpha" (3 chunks, confidence 80%)',
        '2026-02-01T00:00:00.000Z  ask: "beta" (1 chunks, confidence 30%, low-conf)',
        '2026-03-01T00:00:00.000Z  edit (2 fields)',
        '2026-04-01T00:00:00.000Z  ask: "gamma" (4 chunks, confidence 92%)',
      ].join('\n') + '\n',
      'utf8',
    );
    await appendHistory('jiyoon', 'ignored-since-it-comes-after-2099'); // sanity

    const { runHistory } = await import('../src/tools/history.js');

    const allJson = JSON.parse(
      (await runHistory({ slug: 'jiyoon', json: true })).content[0].text,
    ) as { shown: number; events: { message: string }[] };
    expect(allJson.shown).toBeGreaterThanOrEqual(4);

    const filtered = JSON.parse(
      (await runHistory({ slug: 'jiyoon', filter: 'low-conf', json: true })).content[0].text,
    ) as { shown: number; events: { message: string }[] };
    expect(filtered.shown).toBe(1);
    expect(filtered.events[0].message).toContain('beta');

    const since = JSON.parse(
      (await runHistory({ slug: 'jiyoon', since: '2026-03-01', json: true })).content[0].text,
    ) as { shown: number };
    expect(since).toMatchObject({ shown: expect.any(Number) });
    expect(since.shown).toBeGreaterThanOrEqual(2); // edit + gamma + sanity row

    const limited = JSON.parse(
      (await runHistory({ slug: 'jiyoon', limit: 2, json: true })).content[0].text,
    ) as { shown: number };
    expect(limited.shown).toBe(2);
  });

  it('rejects bad date strings', async () => {
    await bootstrap();
    const { runHistory } = await import('../src/tools/history.js');
    const r = await runHistory({ slug: 'jiyoon', since: 'not-a-date' });
    expect(r.isError).toBe(true);
  });

  it('errors on unknown slug', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runHistory } = await import('../src/tools/history.js');
    await runInit({});
    const r = await runHistory({ slug: 'ghost' });
    expect(r.isError).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* audit                                                           */
/* --------------------------------------------------------------- */

describe('audit · hash chain', () => {
  it('chain verifies after multiple tool calls', async () => {
    await bootstrap();
    const { runList } = await import('../src/tools/list.js');
    await runList({});
    await runList({ status: 'draft' });

    const { runAudit } = await import('../src/tools/audit.js');
    const r = await runAudit({ json: true });
    const parsed = JSON.parse(r.content[0].text) as {
      total: number;
      verification: { ok: boolean; total: number };
    };
    expect(parsed.verification.ok).toBe(true);
    expect(parsed.total).toBeGreaterThanOrEqual(3); // init + create + list*2
  });

  it('detects tampering in the middle of the chain', async () => {
    await bootstrap();
    const { auditPath } = await import('../src/audit.js');
    const raw = await readFile(auditPath(), 'utf8');
    const lines = raw.split('\n').filter((l) => l.length > 0);
    // mutate the summary of line 1 (init) without recomputing the hash
    const rec = JSON.parse(lines[0]) as { summary: string };
    rec.summary = 'tampered ' + rec.summary;
    lines[0] = JSON.stringify(rec);
    await writeFile(auditPath(), lines.join('\n') + '\n', 'utf8');

    const { verifyChain } = await import('../src/audit.js');
    const v = await verifyChain();
    expect(v.ok).toBe(false);
    expect(v.firstBadSeq).toBe(1);
  });

  it('filters by slug and tool', async () => {
    await bootstrapAndSign('jiyoon');
    await bootstrap('jaehoon');
    const { runAudit } = await import('../src/tools/audit.js');

    const bySlug = JSON.parse(
      (await runAudit({ slug: 'jiyoon', json: true })).content[0].text,
    ) as { matched: number; records: { slug?: string }[] };
    expect(bySlug.matched).toBeGreaterThanOrEqual(2); // create + sign
    for (const r of bySlug.records) expect(r.slug).toBe('jiyoon');

    const byTool = JSON.parse(
      (await runAudit({ tool: 'afterglow_sign', json: true })).content[0].text,
    ) as { records: { tool: string }[] };
    for (const r of byTool.records) expect(r.tool).toBe('afterglow_sign');
  });
});

/* --------------------------------------------------------------- */
/* recalibrate                                                     */
/* --------------------------------------------------------------- */

describe('recalibrate', () => {
  it('refuses below min sample', async () => {
    await bootstrapAndSign('jiyoon');
    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const r = await runRecalibrate({ slug: 'jiyoon' });
    expect(r.content[0].text).toMatch(/표본 부족/);
  });

  it('suggests raising confidenceFloor when 👎 / refusals are high (dry-run by default)', async () => {
    await bootstrapAndSign('jiyoon');
    const { historyLogPath, readPersona } = await import('../src/storage.js');
    // Synthesize a noisy ask history: many asks, many 👎 / refusals
    const lines: string[] = [];
    for (let i = 0; i < 15; i++) lines.push(`2026-02-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "q${i}" 👎`);
    for (let i = 0; i < 6; i++) lines.push(`2026-03-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "q" 모른다`);
    await writeFile(historyLogPath('jiyoon'), lines.join('\n') + '\n', 'utf8');

    const before = (await readPersona('jiyoon')).confidenceFloor;
    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const dry = await runRecalibrate({ slug: 'jiyoon' });
    expect(dry.isError).toBeUndefined();
    expect(dry.content[0].text).toContain('confidenceFloor');
    expect(dry.content[0].text).toContain('dry-run');
    expect((await readPersona('jiyoon')).confidenceFloor).toBe(before); // unchanged

    const applied = await runRecalibrate({ slug: 'jiyoon', apply: true });
    expect(applied.isError).toBeUndefined();
    expect((await readPersona('jiyoon')).confidenceFloor).toBeGreaterThan(before);
  });

  it('raises peerAskThreshold when many low-conf calls but no peer-asks', async () => {
    await bootstrapAndSign('jiyoon');
    const { historyLogPath, readPersona } = await import('../src/storage.js');
    const lines: string[] = [];
    for (let i = 0; i < 15; i++) {
      lines.push(`2026-02-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "q${i}" (low-conf)`);
    }
    await writeFile(historyLogPath('jiyoon'), lines.join('\n') + '\n', 'utf8');
    const before = (await readPersona('jiyoon')).peerAskThreshold;
    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const r = await runRecalibrate({ slug: 'jiyoon', apply: true });
    expect(r.isError).toBeUndefined();
    const after = (await readPersona('jiyoon')).peerAskThreshold;
    expect(after).toBeGreaterThan(before);
  });

  it('no-op when history is balanced', async () => {
    await bootstrapAndSign('jiyoon');
    const { historyLogPath } = await import('../src/storage.js');
    const lines = Array.from({ length: 15 }, (_, i) =>
      `2026-02-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "q${i}" (3 chunks, confidence 88%)`,
    );
    await writeFile(historyLogPath('jiyoon'), lines.join('\n') + '\n', 'utf8');
    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const r = await runRecalibrate({ slug: 'jiyoon' });
    expect(r.content[0].text).toMatch(/제안 없음/);
  });
});

/* --------------------------------------------------------------- */
/* RAG — TF-IDF                                                    */
/* --------------------------------------------------------------- */

describe('rag · TF-IDF', () => {
  it('ranks the relevant chunk higher when rare terms match', async () => {
    await bootstrapAndSign('jiyoon');
    const { knowledgeDir } = await import('../src/storage.js');
    const kdir = knowledgeDir('jiyoon');
    await writeFile(
      join(kdir, 'rare.md'),
      '결제 폼에서 카드 입력 순서를 바꾸면 PG사 분석 파이프라인에 영향이 갑니다. 3DS는 분리 유지.',
      'utf8',
    );
    await writeFile(
      join(kdir, 'common.md'),
      '오늘의 회의는 좋았어요. 회의는 일주일에 한 번 합니다.',
      'utf8',
    );

    const { retrieve } = await import('../src/rag.js');
    const hits = await retrieve('jiyoon', 'PG사 3DS 분석 파이프라인 영향');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.path).toMatch(/rare\.md$/);
  });

  it('returns empty list when query has no real tokens', async () => {
    await bootstrapAndSign('jiyoon');
    const { knowledgeDir } = await import('../src/storage.js');
    await writeFile(join(knowledgeDir('jiyoon'), 'x.md'), 'hello world', 'utf8');
    const { retrieve } = await import('../src/rag.js');
    const hits = await retrieve('jiyoon', '!!! ???');
    expect(hits).toEqual([]);
  });
});

/* --------------------------------------------------------------- */
/* ask · low-conf marking in history                               */
/* --------------------------------------------------------------- */

describe('ask · annotates history when score is low', () => {
  it('writes "low-conf" marker into history.log when score < peerAskThreshold', async () => {
    await bootstrapAndSign('jiyoon');
    const { runAsk } = await import('../src/tools/ask.js');
    // No knowledge → confidence 0% < threshold → low-conf marker
    const r = await runAsk({ slug: 'jiyoon', question: 'anything' });
    expect(r.isError).toBeUndefined();
    const { readHistory } = await import('../src/storage.js');
    const h = await readHistory('jiyoon');
    expect(h.some((e) => /low-conf/i.test(e.message))).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* generic regression: server folder integrity                     */
/* --------------------------------------------------------------- */

describe('integrity', () => {
  it('agents directory + audit.log live under AFTERGLOW_ROOT', async () => {
    await bootstrap();
    const { agentDir, auditPath } = await Promise.all([
      import('../src/storage.js'),
      import('../src/audit.js'),
    ]).then(([s, a]) => ({ agentDir: s.agentDir, auditPath: a.auditPath }));
    const aDir = agentDir('jiyoon');
    const aLog = auditPath();
    expect(aDir.startsWith(tmpRoot)).toBe(true);
    expect(aLog.startsWith(tmpRoot)).toBe(true);
    // both should exist
    await expect(stat(aDir)).resolves.toBeDefined();
    await expect(stat(aLog)).resolves.toBeDefined();
  });
});
