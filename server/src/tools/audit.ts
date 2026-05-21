import { z } from 'zod';
import { assertInitialized } from '../storage.js';
import { readAll, verifyChain, type AuditRecord } from '../audit.js';
import { safe, type ToolReply } from './types.js';

export const auditShape = {
  limit: z.number().int().min(1).max(500).optional().describe('최근 N 줄만 표시 (기본 30).'),
  slug: z.string().optional().describe('특정 에이전트와 관련된 이벤트만 필터.'),
  tool: z.string().optional().describe('특정 도구 (afterglow_init 등) 만 필터.'),
  verify: z
    .boolean()
    .optional()
    .describe('hash chain 무결성 검증 (기본 true). false 면 출력만.'),
  json: z.boolean().optional().describe('JSON 으로 출력.'),
} as const;

interface AuditArgs {
  limit?: number;
  slug?: string;
  tool?: string;
  verify?: boolean;
  json?: boolean;
}

function chainHead(records: AuditRecord[]): string {
  return records.length === 0 ? '(empty)' : records[records.length - 1].hash;
}

export async function runAudit(args: AuditArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const all = await readAll();
    const verify = args.verify !== false;
    const verification = verify ? await verifyChain() : null;

    let filtered = all;
    if (args.slug) filtered = filtered.filter((r) => r.slug === args.slug);
    if (args.tool) filtered = filtered.filter((r) => r.tool === args.tool);

    const limit = args.limit ?? 30;
    const shown = filtered.slice(-limit);

    if (args.json) {
      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                total: all.length,
                matched: filtered.length,
                shown: shown.length,
                head: chainHead(all),
                verification,
                records: shown,
              },
              null,
              2,
            ),
          },
        ],
      };
    }

    const lines: string[] = [];
    lines.push('# afterglow audit log');
    lines.push('');
    lines.push(`총 레코드: ${all.length}`);
    if (args.slug || args.tool) {
      lines.push(`필터 일치:  ${filtered.length}`);
    }
    lines.push(`체인 헤드:  ${chainHead(all)}`);
    if (verification) {
      lines.push(
        verification.ok
          ? `검증: OK (${verification.total} 레코드, 모든 hash 일치)`
          : `검증: FAIL — ${verification.reason} @ seq=${verification.firstBadSeq}`,
      );
    } else {
      lines.push('검증: skipped (--no-verify)');
    }
    lines.push('');
    if (shown.length === 0) {
      lines.push('(표시할 레코드 없음)');
    } else {
      lines.push(`최근 ${shown.length} 건${args.slug ? ` · slug=${args.slug}` : ''}${args.tool ? ` · tool=${args.tool}` : ''}:`);
      lines.push('');
      for (const r of shown) {
        const head = `#${r.seq.toString().padStart(4)}  ${r.ts}  ${r.tool}${r.slug ? ` (${r.slug})` : ''}`;
        lines.push(head);
        lines.push(`        ${r.summary}`);
        lines.push(`        hash=${r.hash.slice(0, 12)}…  prev=${r.prev === 'GENESIS' ? 'GENESIS' : r.prev.slice(0, 12) + '…'}`);
      }
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
