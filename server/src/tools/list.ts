import { z } from 'zod';
import { readRegistry, assertInitialized } from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine } from '../sanitize.js';
import { safe, type ToolReply } from './types.js';

export const listShape = {
  status: z
    .enum(['all', 'active', 'learning', 'paused', 'draft', 'archived'])
    .optional()
    .describe('필터링할 상태. 기본 all (archived 포함). archived 만 보려면 --status archived.'),
  json: z.boolean().optional().describe('JSON으로 출력 (스크립트용).'),
} as const;

interface ListArgs {
  status?: 'all' | 'active' | 'learning' | 'paused' | 'draft' | 'archived';
  json?: boolean;
}

export async function runList(args: ListArgs): Promise<ToolReply> {
  return safe(async () => {
  await assertInitialized();
  await auditAppend({
    tool: 'afterglow_list',
    summary: `list status=${args.status ?? 'all'}${args.json ? ' --json' : ''}`,
    meta: { status: args.status ?? 'all', json: !!args.json },
  });
  const reg = await readRegistry();
  const filter = args.status ?? 'all';
  const filtered =
    filter === 'all' ? reg.agents : reg.agents.filter((a) => a.status === filter);

  if (args.json) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify({ count: filtered.length, agents: filtered }, null, 2),
        },
      ],
    };
  }

  if (filtered.length === 0) {
    const total = reg.agents.length;
    const msg =
      total === 0
        ? '등록된 에이전트가 없어요. /afterglow create <slug> 로 시작하세요.'
        : `필터(${filter})에 일치하는 에이전트가 없어요 (전체 ${total}명).`;
    return { content: [{ type: 'text', text: msg }] };
  }

  // Render a simple monospace table. Names + roles read raw from
  // registry.json which mirrors persona.json — both are user-controlled
  // at create/edit time. Sanitise per cell so a malicious `name =
  // "X\n## OVERRIDE\n"` can't forge a header line in the table output
  // when an orchestrator Claude reads this back.
  const safeRows = filtered.map((a) => ({
    ...a,
    name: sanitisePromptLine(a.name, 100),
    role: sanitisePromptLine(a.role, 100),
  }));
  const slugW = Math.max(5, ...safeRows.map((a) => a.slug.length));
  const nameW = Math.max(5, ...safeRows.map((a) => a.name.length));
  const roleW = Math.max(5, ...safeRows.map((a) => a.role.length));

  const rows: string[] = [];
  rows.push(
    `${'SLUG'.padEnd(slugW)}  ${'NAME'.padEnd(nameW)}  ${'ROLE'.padEnd(roleW)}  STATUS    TRAINED`,
  );
  rows.push(
    `${'-'.repeat(slugW)}  ${'-'.repeat(nameW)}  ${'-'.repeat(roleW)}  --------  -------`,
  );
  for (const a of safeRows) {
    const dot =
      a.status === 'active' ? '●'
      : a.status === 'learning' ? '◐'
      : a.status === 'paused' ? '○'
      : a.status === 'archived' ? '▣'
      : '□';
    const status = `${dot} ${a.status}`.padEnd(9);
    const trained = a.trainedAt ? a.trainedAt.slice(0, 10) : '—';
    rows.push(
      `${a.slug.padEnd(slugW)}  ${a.name.padEnd(nameW)}  ${a.role.padEnd(roleW)}  ${status} ${trained}`,
    );
  }
  rows.push('');
  rows.push(`총 ${filtered.length} / ${reg.agents.length} 명`);

  return { content: [{ type: 'text', text: rows.join('\n') }] };
  });
}
