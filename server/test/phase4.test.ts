/**
 * Tests for the v0.1.3 additions:
 *   afterglow_archive (archive / restore / list)
 *   afterglow_council_summary (transcript parser + moderator output)
 *   afterglow_recalibrate --byTopic (expertise-aware diagnostic)
 *
 * Each test redirects ~/.claude/afterglow/ to a fresh tmp dir.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile, stat, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

let tmpRoot: string;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-p4-'));
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
/* afterglow_archive                                               */
/* --------------------------------------------------------------- */

describe('archive · happy path', () => {
  it('archives a signed agent and blocks ask afterwards', async () => {
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { agentDir, archivedAgentDir } = await import('../src/storage.js');

    const r = await runArchive({ action: 'archive', slug: 'jiyoon' });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain('보관 완료');

    // agents/<slug>/ gone, archive/<slug>/ exists
    await expect(stat(agentDir('jiyoon'))).rejects.toBeDefined();
    await expect(stat(archivedAgentDir('jiyoon'))).resolves.toBeDefined();

    // ask is now blocked with a clear archived error
    const a = await runAsk({ slug: 'jiyoon', question: '?' });
    expect(a.isError).toBe(true);
    expect(a.content[0].text).toMatch(/archived|보관/i);
  });

  it('restores an archived agent into paused (not active)', async () => {
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');
    const { runList } = await import('../src/tools/list.js');
    const { agentDir } = await import('../src/storage.js');

    await runArchive({ action: 'archive', slug: 'jiyoon' });
    const r = await runArchive({ action: 'restore', slug: 'jiyoon' });
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain('복원 완료');
    expect(r.content[0].text).toMatch(/paused/);
    await expect(stat(agentDir('jiyoon'))).resolves.toBeDefined();

    // registry says paused now
    const listing = JSON.parse((await runList({ json: true })).content[0].text) as {
      agents: { slug: string; status: string }[];
    };
    expect(listing.agents.find((a) => a.slug === 'jiyoon')?.status).toBe('paused');
  });

  it('lists archived slugs and shows empty state', async () => {
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');

    const empty = await runArchive({ action: 'list' });
    expect(empty.content[0].text).toMatch(/비어있어요|비어 있어요/);

    await runArchive({ action: 'archive', slug: 'jiyoon' });
    const filled = await runArchive({ action: 'list' });
    expect(filled.content[0].text).toContain('jiyoon');
    expect(filled.content[0].text).toMatch(/1\s*명/);
  });
});

describe('archive · edge cases', () => {
  it('refuses to archive a slug that does not exist', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runArchive } = await import('../src/tools/archive.js');
    await runInit({});
    const r = await runArchive({ action: 'archive', slug: 'ghost' });
    expect(r.isError).toBe(true);
  });

  it('refuses to archive twice (already archived)', async () => {
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');
    await runArchive({ action: 'archive', slug: 'jiyoon' });
    const r = await runArchive({ action: 'archive', slug: 'jiyoon' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/already archived|이미 archived/i);
  });

  it('refuses to restore when nothing is archived', async () => {
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');
    const r = await runArchive({ action: 'restore', slug: 'jiyoon' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/not archived|nothing to restore/i);
  });

  it('refuses to restore when an active slug already exists', async () => {
    // Manufacture a collision: archive jiyoon, then re-create another agent
    // with the same slug somehow → restore should refuse.
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');
    const { agentsDir } = await import('../src/storage.js');
    await runArchive({ action: 'archive', slug: 'jiyoon' });

    // Simulate something occupying agents/jiyoon/
    await mkdir(join(agentsDir(), 'jiyoon'), { recursive: true });

    const r = await runArchive({ action: 'restore', slug: 'jiyoon' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/in the way|already exists/i);
  });

  it('refuses action=archive without slug', async () => {
    const { runInit } = await import('../src/tools/init.js');
    const { runArchive } = await import('../src/tools/archive.js');
    await runInit({});
    const r = await runArchive({ action: 'archive' } as { action: 'archive' });
    expect(r.isError).toBe(true);
  });

  it('audit chain stays verified across archive → restore', async () => {
    await bootstrapAndSign('jiyoon');
    const { runArchive } = await import('../src/tools/archive.js');
    await runArchive({ action: 'archive', slug: 'jiyoon' });
    await runArchive({ action: 'restore', slug: 'jiyoon' });
    const { verifyChain } = await import('../src/audit.js');
    const v = await verifyChain();
    expect(v.ok).toBe(true);
  });
});

/* --------------------------------------------------------------- */
/* afterglow_council_summary                                       */
/* --------------------------------------------------------------- */

const FAKE_TRANSCRIPT = (extra?: string) =>
  `# Council — 결제 폼 v3, 어떻게 갈까요?

- 시각: 2026-04-12T14:32:18.000Z
- 참가자: jiyoon · jaehoon · hiroshi
- 질문: 결제 폼 v3, 어떻게 갈까요?

## 참가자 컨텍스트

### jiyoon
- 자신있는 영역: 디자인 · 연구
- 검색된 자료: 1 청크

## 발언 기록

### jiyoon
한 화면으로 보여주는 게 좋겠어요. step 수를 줄여야 합니다.
✦ 신뢰도 91% · [1]

### jaehoon
@hiroshi 2022년 PG사 합의가 있었던 거 아닌가요?
✦ 신뢰도 84%

### hiroshi
맞아요. 3DS 단계는 분리 유지가 원칙입니다. ✓ 동의
✦ 신뢰도 96% · [2]

### jiyoon
좋아요. 일반 결제는 한 화면, 3DS 만 별도. agreed.
✦ 신뢰도 90%

## 결론 (합의)
- 일반 결제: 한 화면 유지, 폼 단계 최소화
- 3DS: 별도 화면 유지 (hiroshi 2022 결정 존중)
- 백엔드 변경 없음

## 이견 / 보류
- 없음 — 만장일치

${extra ?? ''}
`;

describe('council_summary · parsing', () => {
  it('summarizes a clean consensus transcript', async () => {
    await bootstrapAndSign('jiyoon');
    const { councilsDir } = await import('../src/storage.js');
    await mkdir(councilsDir(), { recursive: true });
    await writeFile(join(councilsDir(), '2026-04-12-1432-payment-v3.md'), FAKE_TRANSCRIPT(), 'utf8');

    const { runCouncilSummary } = await import('../src/tools/council_summary.js');
    const r = await runCouncilSummary({ file: '2026-04-12-1432-payment-v3', json: true });
    expect(r.isError).toBeUndefined();
    const parsed = JSON.parse(r.content[0].text) as {
      participants: string[];
      conclusion: string[];
      dissent: string[];
      consensusReached: boolean;
      pings: { from: string; to: string }[];
      turnCount: number;
    };
    expect(parsed.participants).toEqual(['jiyoon', 'jaehoon', 'hiroshi']);
    expect(parsed.conclusion.length).toBeGreaterThanOrEqual(3);
    expect(parsed.dissent).toEqual([]);
    expect(parsed.consensusReached).toBe(true);
    expect(parsed.pings.length).toBeGreaterThanOrEqual(1); // jaehoon → hiroshi
    expect(parsed.turnCount).toBe(4);
  });

  it('auto-selects the most recent file when no name is given', async () => {
    await bootstrapAndSign('jiyoon');
    const { councilsDir } = await import('../src/storage.js');
    await mkdir(councilsDir(), { recursive: true });
    await writeFile(join(councilsDir(), '2026-01-01-1000-old.md'), FAKE_TRANSCRIPT(), 'utf8');
    await writeFile(join(councilsDir(), '2026-04-12-1432-new.md'), FAKE_TRANSCRIPT(), 'utf8');

    const { runCouncilSummary } = await import('../src/tools/council_summary.js');
    const r = await runCouncilSummary({});
    expect(r.isError).toBeUndefined();
    expect(r.content[0].text).toContain('2026-04-12-1432-new.md');
  });

  it('flags unresolved disagreement', async () => {
    await bootstrapAndSign('jiyoon');
    const { councilsDir } = await import('../src/storage.js');
    await mkdir(councilsDir(), { recursive: true });
    const disagreement = `# Council — 의견 충돌 케이스

- 시각: 2026-04-13T10:00:00.000Z
- 참가자: jiyoon · jaehoon
- 질문: 새 기능 도입할까요?

## 발언 기록

### jiyoon
저는 반대합니다. 사용자 피드백이 아직 모자라요.

### jaehoon
저는 도입에 찬성합니다. 시장이 기다리지 않아요.

## 결론 (합의)
- (없음)

## 이견 / 보류
- jiyoon: 추가 리서치 필요
- jaehoon: 즉시 출시 필요
`;
    await writeFile(join(councilsDir(), '2026-04-13-disagreement.md'), disagreement, 'utf8');

    const { runCouncilSummary } = await import('../src/tools/council_summary.js');
    const r = await runCouncilSummary({ file: '2026-04-13-disagreement', json: true });
    expect(r.isError).toBeUndefined();
    const parsed = JSON.parse(r.content[0].text) as {
      consensusReached: boolean;
      conclusion: string[];
      dissent: string[];
    };
    expect(parsed.consensusReached).toBe(false);
    expect(parsed.dissent.length).toBeGreaterThanOrEqual(2);
  });

  it('errors on missing file', async () => {
    await bootstrapAndSign('jiyoon');
    const { runCouncilSummary } = await import('../src/tools/council_summary.js');
    const r = await runCouncilSummary({ file: 'does-not-exist' });
    expect(r.isError).toBe(true);
  });

  it('errors when councils/ is empty and no file given', async () => {
    await bootstrapAndSign('jiyoon');
    const { runCouncilSummary } = await import('../src/tools/council_summary.js');
    // councils/ exists but is empty
    const r = await runCouncilSummary({});
    expect(r.isError).toBe(true);
  });

  it('counts turns and speaker stats in text output', async () => {
    await bootstrapAndSign('jiyoon');
    const { councilsDir } = await import('../src/storage.js');
    await mkdir(councilsDir(), { recursive: true });
    await writeFile(join(councilsDir(), '2026-04-12-stats.md'), FAKE_TRANSCRIPT(), 'utf8');

    const { runCouncilSummary } = await import('../src/tools/council_summary.js');
    const r = await runCouncilSummary({ file: '2026-04-12-stats' });
    expect(r.isError).toBeUndefined();
    const text = r.content[0].text;
    expect(text).toMatch(/jiyoon/);
    expect(text).toMatch(/turn/);
    expect(text).toContain('합의');
  });
});

/* --------------------------------------------------------------- */
/* recalibrate --byTopic                                           */
/* --------------------------------------------------------------- */

describe('recalibrate · byTopic (expertise-aware)', () => {
  it('suggests removing an expertise when its asks are mostly 👎', async () => {
    await bootstrapAndSign('jiyoon');
    // Persona has expertise ['디자인']. Add '재무' so we can show it failing.
    const { runEdit } = await import('../src/tools/edit.js');
    await runEdit({ slug: 'jiyoon', addExpertise: ['재무'] });

    const { historyLogPath } = await import('../src/storage.js');
    const lines: string[] = [];
    // 10 stable design questions
    for (let i = 0; i < 10; i++) {
      lines.push(`2026-02-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "디자인 시스템 토큰 결정?" (3 chunks, confidence 88%)`);
    }
    // 8 finance questions, mostly 👎
    for (let i = 0; i < 8; i++) {
      lines.push(`2026-03-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "재무 처리 어떻게?" (1 chunks, confidence 30%, low-conf) 👎`);
    }
    await writeFile(historyLogPath('jiyoon'), lines.join('\n') + '\n', 'utf8');

    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const r = await runRecalibrate({ slug: 'jiyoon', byTopic: true });
    expect(r.isError).toBeUndefined();
    const text = r.content[0].text;
    expect(text).toContain('by-topic');
    expect(text).toContain('재무');
    expect(text).toMatch(/제거|remove/);
  });

  it('flags out-of-expertise asks that succeed (candidate for adding)', async () => {
    await bootstrapAndSign('jiyoon');
    // persona has only ['디자인']
    const { historyLogPath } = await import('../src/storage.js');
    const lines: string[] = [];
    for (let i = 0; i < 12; i++) {
      // questions that mention "결제" or "운영" — neither in expertise
      lines.push(`2026-02-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "결제 흐름 최적화 어떻게?" (3 chunks, confidence 82%)`);
    }
    await writeFile(historyLogPath('jiyoon'), lines.join('\n') + '\n', 'utf8');

    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const r = await runRecalibrate({ slug: 'jiyoon', byTopic: true });
    expect(r.isError).toBeUndefined();
    const text = r.content[0].text;
    // out-of-expertise bucket should mention "추가 검토" or "adding"
    expect(text).toMatch(/out-of-expertise|expertise 밖/);
    expect(text).toMatch(/추가 검토|consider-adding/);
  });

  it('returns sample-too-small message when below min sample', async () => {
    await bootstrapAndSign('jiyoon');
    // history.log will only have create + sign lines (< 10)
    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const r = await runRecalibrate({ slug: 'jiyoon', byTopic: true });
    expect(r.content[0].text).toMatch(/표본 부족/);
  });

  it('no suggestion when topic distribution is balanced', async () => {
    await bootstrapAndSign('jiyoon');
    const { historyLogPath } = await import('../src/storage.js');
    const lines: string[] = [];
    for (let i = 0; i < 15; i++) {
      lines.push(`2026-02-${(i + 1).toString().padStart(2, '0')}T00:00:00.000Z  ask: "디자인 시스템 토큰?" (3 chunks, confidence 75%)`);
    }
    await writeFile(historyLogPath('jiyoon'), lines.join('\n') + '\n', 'utf8');
    const { runRecalibrate } = await import('../src/tools/recalibrate.js');
    const r = await runRecalibrate({ slug: 'jiyoon', byTopic: true });
    expect(r.content[0].text).toMatch(/제안|변경 제안 없음/);
  });
});

/* --------------------------------------------------------------- */
/* archived agent integration                                      */
/* --------------------------------------------------------------- */

describe('archived agent integration', () => {
  it('archived agents block council too (not just ask)', async () => {
    await bootstrapAndSign('jiyoon');
    await bootstrapAndSign('jaehoon');
    const { runArchive } = await import('../src/tools/archive.js');
    const { runCouncil } = await import('../src/tools/council.js');
    await runArchive({ action: 'archive', slug: 'jaehoon' });
    const r = await runCouncil({ slugs: ['jiyoon', 'jaehoon'], question: '?' });
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/archived|보관/);
  });

  it('list --status archived shows only archived', async () => {
    await bootstrapAndSign('jiyoon');
    await bootstrapAndSign('jaehoon');
    const { runArchive } = await import('../src/tools/archive.js');
    const { runList } = await import('../src/tools/list.js');
    await runArchive({ action: 'archive', slug: 'jaehoon' });
    const r = await runList({ status: 'archived', json: true });
    const data = JSON.parse(r.content[0].text) as { count: number; agents: { slug: string }[] };
    expect(data.count).toBe(1);
    expect(data.agents[0].slug).toBe('jaehoon');
  });
});
