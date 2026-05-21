import { z } from 'zod';
import {
  appendHistory,
  assertInitialized,
  assertWritable,
  getStatus,
  listVersionTags,
  listVersions,
  readPersona,
  readVersion,
  restoreVersion,
  snapshotPersona,
  tagVersion,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

/**
 * Tags get embedded in JSON keys (tags.json), audit summaries, and history
 * lines. Keep them filesystem-safe and grep-friendly:
 *   · ASCII letters / digits / dot / hyphen / underscore
 *   · 1–40 chars
 *   · must start with alnum (forbid `.foo` hidden-file shapes)
 *
 * This is intentionally narrower than `[A-Za-z0-9_.\-/]` — no slashes (would
 * be parsed as path segments) and no whitespace.
 */
const TAG_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,39}$/;
const VERSION_ID_PATTERN = /^v\d{1,9}$/;

export const versionShape = {
  action: z
    .enum(['list', 'diff', 'rollback', 'tag', 'snapshot'])
    .describe('list | diff | rollback | tag | snapshot.'),
  slug: z.string().min(1).describe('대상 에이전트 slug.'),
  versionA: z
    .string()
    .max(80)
    .optional()
    .describe('diff/rollback/tag 시 대상 버전 id (예: v3). rollback 은 태그 이름 (예: "pre-nov-redesign") 도 받음.'),
  versionB: z.string().optional().describe('diff 시 비교 대상 version id.'),
  tag: z.string().optional().describe('tag 액션의 태그 이름 (예: stable, handoff-signed).'),
  reason: z
    .string()
    .max(500)
    .optional()
    .describe('snapshot 액션의 사유 메모. 미입력 시 "manual snapshot".'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(500)
    .optional()
    .describe('list 액션의 표시 개수 (기본 30, 가장 최근부터). 200+ 스냅샷 케이스 대응.'),
} as const;

interface VersionArgs {
  action: 'list' | 'diff' | 'rollback' | 'tag' | 'snapshot';
  slug: string;
  versionA?: string;
  versionB?: string;
  tag?: string;
  reason?: string;
  limit?: number;
}

export async function runVersion(args: VersionArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    // Registry-aware existence — works even after archiveAgent moves the
    // folder out of agents/<slug>/.
    try {
      await getStatus(args.slug);
    } catch (e) {
      return errorReply((e as Error).message);
    }
    // list / diff are read-only and OK on archived agents (history view).
    // snapshot / rollback / tag mutate persona or tag store → archived guard.
    if (args.action !== 'list' && args.action !== 'diff') {
      try {
        await assertWritable(args.slug);
      } catch (e) {
        return errorReply((e as Error).message);
      }
    }
    // For rollback we ALSO accept a tag name (resolved via tags.json) so
    // users don't have to remember `v37` vs `v42` for a long-lived "stable"
    // tag they set 6 months ago.
    let versionA = args.versionA;
    if (versionA && !VERSION_ID_PATTERN.test(versionA)) {
      if (args.action === 'rollback') {
        if (!TAG_PATTERN.test(versionA)) {
          return errorReply(
            `versionA "${versionA}" 는 버전 id (v1..v999999999) 도 태그 이름도 아닙니다.`,
          );
        }
        const tags = await listVersionTags(args.slug);
        const resolved = tags[versionA];
        if (!resolved) {
          return errorReply(`tag "${versionA}" 를 못 찾았어요. /afterglow version list 로 태그 목록을 확인하세요.`);
        }
        versionA = resolved;
      } else {
        return errorReply(`versionA "${versionA}" 형식 오류. "v1".."v999999999" 사용.`);
      }
    }
    if (args.versionB && !VERSION_ID_PATTERN.test(args.versionB)) {
      return errorReply(`versionB "${args.versionB}" 형식 오류. "v1".."v999999999" 사용.`);
    }
    switch (args.action) {
      case 'list':
        return listAction(args.slug, args.limit ?? 30);
      case 'snapshot':
        return snapshotAction(args.slug, args.reason);
      case 'diff':
        return diffAction(args.slug, versionA, args.versionB);
      case 'rollback':
        return rollbackAction(args.slug, versionA, args.versionA);
      case 'tag':
        return tagAction(args.slug, versionA, args.tag);
    }
  });
}

async function listAction(slug: string, limit: number): Promise<ToolReply> {
  const versions = await listVersions(slug);
  const tags = await listVersionTags(slug);
  const reverseTags = new Map<string, string[]>();
  for (const [tag, id] of Object.entries(tags)) {
    if (!reverseTags.has(id)) reverseTags.set(id, []);
    reverseTags.get(id)!.push(tag);
  }
  if (versions.length === 0) {
    return {
      content: [
        {
          type: 'text',
          text:
            `(no versions) ${slug} 에 저장된 버전이 없어요.\n` +
            `· edit / sign / handoff / recalibrate apply 호출 시 자동으로 스냅샷됩니다.\n` +
            `· 수동 스냅샷: action=snapshot --reason "…"`,
        },
      ],
    };
  }
  // Show most-recent N (reverse chronological). At 200+ versions a flat list
  // would overflow the terminal.
  const shown = versions.slice().reverse().slice(0, limit);
  const truncated = versions.length > shown.length;
  const lines: string[] = [];
  lines.push(`# versions · ${slug}  (${shown.length} / ${versions.length}${truncated ? ', 최근순' : ''})`);
  lines.push('');
  for (const v of shown) {
    const tagsForV = (reverseTags.get(v.id) ?? []).map((t) => `🏷 ${t}`).join('  ');
    lines.push(`  ${v.id.padEnd(6)} ${v.createdAt}  ${v.reason}  ${tagsForV}`);
  }
  if (truncated) {
    lines.push('');
    lines.push(`… ${versions.length - shown.length} 개 더 있음. --limit 으로 늘리거나 .versions/ 직접 확인.`);
  }
  lines.push('');
  lines.push('명령:');
  lines.push(`  · /afterglow version diff <a> <b>          — persona JSON diff`);
  lines.push(`  · /afterglow version rollback <id|tag>      — 버전 id 또는 태그로 복원 (자동 백업 + system-prompt 재생성)`);
  lines.push(`  · /afterglow version tag <id> <tag>         — 태그 부여 (stable / handoff-signed 등)`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function snapshotAction(slug: string, reason: string | undefined): Promise<ToolReply> {
  const r = await snapshotPersona(slug, reason ?? 'manual snapshot');
  await appendHistory(slug, `version snapshot ${r.id} (${r.reason})`);
  await auditAppend({
    tool: 'afterglow_version',
    slug,
    summary: `snapshot ${r.id}`,
    meta: { reason: r.reason, path: r.path },
  });
  return {
    content: [{ type: 'text', text: `✦ ${r.id} 저장됨 (${r.reason}) · ${r.path}` }],
  };
}

async function diffAction(
  slug: string,
  a: string | undefined,
  b: string | undefined,
): Promise<ToolReply> {
  if (!a) return errorReply('diff 에는 versionA 가 필요합니다 (versionB 없으면 현재 persona 와 비교).');
  const versionsList = await listVersions(slug);
  if (!versionsList.some((v) => v.id === a)) {
    return errorReply(`버전 "${a}" 를 못 찾았어요.`);
  }
  if (b && !versionsList.some((v) => v.id === b)) {
    return errorReply(`버전 "${b}" 를 못 찾았어요.`);
  }
  const target = await readVersion(slug, a);
  const compareWith = b ? await readVersion(slug, b) : await readPersona(slug);
  const targetJson = JSON.stringify(target, null, 2).split('\n');
  const compareJson = JSON.stringify(compareWith, null, 2).split('\n');
  const diff = lineDiff(targetJson, compareJson);
  const head = `# diff ${a} → ${b ?? 'current'}`;
  return {
    content: [{ type: 'text', text: `${head}\n\n${diff.join('\n')}` }],
  };
}

async function rollbackAction(
  slug: string,
  id: string | undefined,
  originalInput?: string,
): Promise<ToolReply> {
  if (!id) return errorReply('rollback 에는 versionA (버전 id 또는 태그) 가 필요합니다.');
  const tagSuffix = originalInput && originalInput !== id ? ` (tag "${originalInput}")` : '';
  const r = await restoreVersion(slug, id);
  await appendHistory(
    slug,
    `version rollback to ${id}${tagSuffix} (safety snapshot ${r.snapshotBeforeRestore})`,
  );
  await auditAppend({
    tool: 'afterglow_version',
    slug,
    summary: `rollback to ${id}${tagSuffix}`,
    meta: {
      safetySnapshot: r.snapshotBeforeRestore,
      requestedVersion: originalInput ?? id,
      resolvedVersion: id,
    },
  });
  return {
    content: [
      {
        type: 'text',
        text:
          `✦ ${slug} 를 ${id}${tagSuffix} 로 복원 완료.\n` +
          `  · 복원 전 안전 스냅샷: ${r.snapshotBeforeRestore}\n` +
          `  · 시각: ${r.restoredAt}\n` +
          `  · system-prompt.md 도 함께 재생성됐어요 — 다음 ask 부터 새 페르소나가 반영됩니다.`,
      },
    ],
  };
}

async function tagAction(
  slug: string,
  id: string | undefined,
  tag: string | undefined,
): Promise<ToolReply> {
  if (!id || !tag) return errorReply('tag 에는 versionA + tag 둘 다 필요합니다.');
  if (!TAG_PATTERN.test(tag)) {
    return errorReply(
      `tag "${tag}" 형식 오류. 1-40자 ASCII 알파벳/숫자/"."/"-"/"_" 만 허용, 알파벳·숫자로 시작해야 합니다.`,
    );
  }
  await tagVersion(slug, id, tag);
  await appendHistory(slug, `version tag ${id} as "${tag}"`);
  await auditAppend({
    tool: 'afterglow_version',
    slug,
    summary: `tag ${id} as ${tag}`,
    meta: { id, tag },
  });
  return { content: [{ type: 'text', text: `🏷 ${id} → "${tag}" 태그 부여.` }] };
}

/** Tiny line-based diff. Marks lines only in A (`-`) or only in B (`+`). */
function lineDiff(a: string[], b: string[]): string[] {
  const setA = new Set(a);
  const setB = new Set(b);
  const out: string[] = [];
  const seen = new Set<string>();
  // Walk both in original order, emit common + diff markers
  let i = 0,
    j = 0;
  while (i < a.length || j < b.length) {
    const la = a[i],
      lb = b[j];
    if (la === lb) {
      if (la !== undefined) out.push(`  ${la}`);
      i++;
      j++;
    } else if (la !== undefined && !setB.has(la)) {
      out.push(`- ${la}`);
      seen.add(`-${la}`);
      i++;
    } else if (lb !== undefined && !setA.has(lb)) {
      out.push(`+ ${lb}`);
      seen.add(`+${lb}`);
      j++;
    } else {
      // both sides have the line elsewhere — emit + and advance the other side later
      if (la !== undefined) {
        if (!seen.has(`-${la}`)) out.push(`- ${la}`);
        i++;
      }
      if (lb !== undefined) {
        if (!seen.has(`+${lb}`)) out.push(`+ ${lb}`);
        j++;
      }
    }
  }
  return out;
}
