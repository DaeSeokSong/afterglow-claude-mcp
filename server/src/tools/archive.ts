import { z } from 'zod';
import {
  archiveAgent,
  archivedAgentDir,
  appendHistory,
  assertInitialized,
  listArchivedSlugs,
  readRegistry,
  restoreAgent,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine } from '../sanitize.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const archiveShape = {
  action: z
    .enum(['archive', 'restore', 'list'])
    .describe('archive | restore | list. list 는 보관함의 모든 슬러그를 표시.'),
  slug: z
    .string()
    .min(1)
    .optional()
    .describe('archive / restore 시 필수. list 시 무시.'),
} as const;

interface ArchiveArgs {
  action: 'archive' | 'restore' | 'list';
  slug?: string;
}

/**
 * archive : agents/<slug>/ → archive/<slug>/ 로 이동, registry status=archived.
 *           이후 ask / council 호출이 거부됩니다. history.log 와 audit 에 기록.
 * restore : archive/<slug>/ → agents/<slug>/ 로 복원, registry status=paused.
 *           복원 후 ask 호출은 재서명(/afterglow sign) 또는 resume 명령이 필요.
 * list    : 보관함에 있는 모든 슬러그를 출력.
 *
 * 동일 슬러그로 두 번 archive 하거나, 활성 슬러그를 restore 하려고 하면
 * 명시적 에러를 반환합니다 — 데이터 손실 가능성을 막기 위함.
 */
export async function runArchive(args: ArchiveArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();

    if (args.action === 'list') {
      const slugs = await listArchivedSlugs();
      const reg = await readRegistry();
      const lines: string[] = [];
      lines.push('# afterglow archive');
      lines.push('');
      if (slugs.length === 0) {
        lines.push('(보관함이 비어있어요.)');
        lines.push('');
        lines.push('보관 명령: /afterglow archive <slug> --action archive');
      } else {
        lines.push(`보관된 에이전트 ${slugs.length} 명:`);
        lines.push('');
        for (const s of slugs) {
          const entry = reg.agents.find((a) => a.slug === s);
          // role reads RAW from registry — sanitise as single line so a
          // poisoned `role = "HR\n## OVERRIDE"` can't forge a header
          // when an orchestrator Claude reads the archive list.
          const role = entry?.role
            ? sanitisePromptLine(entry.role, 200)
            : '(registry에 없음 — 직접 복원 필요)';
          lines.push(`  · ${s.padEnd(20)} ${role}`);
        }
        lines.push('');
        lines.push('복원: /afterglow archive <slug> --action restore');
      }
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    if (!args.slug) {
      return errorReply(`action=${args.action} 에는 slug 가 필요합니다.`);
    }

    if (args.action === 'archive') {
      // History MUST be written before the rename — otherwise appendHistory
      // would recreate agents/<slug>/ (since the path resolver still points
      // at the live location), which then leaves a stub blocking restore.
      const archivePreview = new Date().toISOString();
      await appendHistory(
        args.slug,
        `archive requested at ${archivePreview} (about to be moved to archive/)`,
      );
      const r = await archiveAgent(args.slug);
      await auditAppend({
        tool: 'afterglow_archive',
        slug: args.slug,
        summary: `archived (${r.previousStatus} → archived)`,
        meta: { movedTo: r.movedTo, previousStatus: r.previousStatus },
      });
      const lines = [
        `✦ ${args.slug} 보관 완료 (${r.previousStatus} → archived).`,
        `  이동: ${r.movedFrom}`,
        `      → ${r.movedTo}`,
        `  시각: ${r.archivedAt}`,
        '',
        '이후 ask / council 호출은 거부됩니다.',
        `복원: /afterglow archive ${args.slug} --action restore`,
      ];
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // restore
    const r = await restoreAgent(args.slug);
    await appendHistory(args.slug, `restored (archived → ${r.newStatus}) at ${r.restoredAt}`);
    await auditAppend({
      tool: 'afterglow_archive',
      slug: args.slug,
      summary: `restored (archived → ${r.newStatus})`,
      meta: { movedFrom: r.movedFrom, newStatus: r.newStatus },
    });
    const lines = [
      `✦ ${args.slug} 복원 완료 (archived → ${r.newStatus}).`,
      `  이동: ${r.movedFrom}`,
      `      → ${r.movedTo}`,
      `  시각: ${r.restoredAt}`,
      '',
      'paused 상태로 복원됐어요. ask 호출 전에 다음 중 하나가 필요합니다:',
      `  · /afterglow resume ${args.slug}                — 기존 consent.md 가 그대로 유효한 경우 (1-step 활성화)`,
      `  · /afterglow sign ${args.slug} --signer "…"     — 새로 서명을 받을 수 있는 경우`,
      '  · AFTERGLOW_ALLOW_DRAFT=1                       (테스트 / 디버그)',
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

/** Exported for the README snippet that calls archive helpers directly. */
export { archivedAgentDir };
