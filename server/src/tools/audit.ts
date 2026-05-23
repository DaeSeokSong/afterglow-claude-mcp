import { z } from 'zod';
import { assertInitialized } from '../storage.js';
import {
  readAll,
  verifyChain,
  verifyChainFast,
  writeCheckpoint,
  readCheckpoints,
  type AuditRecord,
} from '../audit.js';
import { sanitisePromptLine } from '../sanitize.js';
import { safe, type ToolReply } from './types.js';

export const auditShape = {
  limit: z.number().int().min(1).max(500).optional().describe('최근 N 줄만 표시 (기본 30).'),
  slug: z.string().optional().describe('특정 에이전트와 관련된 이벤트만 필터.'),
  tool: z.string().optional().describe('특정 도구 (afterglow_init 등) 만 필터.'),
  verify: z
    .boolean()
    .optional()
    .describe('hash chain 무결성 검증 (기본 true). false 면 출력만.'),
  fast: z
    .boolean()
    .optional()
    .describe('마지막 체크포인트 이후만 검증 (대용량 로그용 O(tail)). 체크포인트 없으면 전체 검증.'),
  checkpoint: z
    .boolean()
    .optional()
    .describe('현재 체인 헤드에 검증된 체크포인트 기록 (전체 검증 통과 시). 이후 --fast 검증의 앵커.'),
  json: z.boolean().optional().describe('JSON 으로 출력.'),
} as const;

interface AuditArgs {
  limit?: number;
  slug?: string;
  tool?: string;
  verify?: boolean;
  fast?: boolean;
  checkpoint?: boolean;
  json?: boolean;
}

function chainHead(records: AuditRecord[]): string {
  return records.length === 0 ? '(empty)' : records[records.length - 1].hash;
}

export async function runAudit(args: AuditArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();

    // Optional: record a verified checkpoint at the current head.
    let checkpointNote: string | null = null;
    if (args.checkpoint) {
      try {
        const cp = await writeCheckpoint();
        checkpointNote = `checkpoint 기록됨: seq=${cp.seq} hash=${cp.hash.slice(0, 12)}…`;
      } catch (e) {
        checkpointNote = `checkpoint 실패: ${sanitisePromptLine((e as Error).message, 200)}`;
      }
    }

    const all = await readAll();
    const verify = args.verify !== false;
    let verification: Awaited<ReturnType<typeof verifyChain>> | null = null;
    let verifyMode = 'full';
    if (verify) {
      if (args.fast) {
        const fv = await verifyChainFast();
        verification = { ok: fv.ok, total: fv.total, firstBadSeq: fv.firstBadSeq, reason: fv.reason };
        verifyMode = fv.usedCheckpoint ? `fast, seq>${fv.fromSeq - 1}` : 'full';
      } else {
        verification = await verifyChain();
      }
    }
    const checkpoints = await readCheckpoints();

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
                checkpoints: checkpoints.length,
                checkpointNote,
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
    lines.push(`체크포인트: ${checkpoints.length}${checkpoints.length ? ` (최신 seq=${checkpoints[checkpoints.length - 1].seq})` : ''}`);
    if (checkpointNote) lines.push(`            ${checkpointNote}`);
    if (verification) {
      lines.push(
        verification.ok
          ? `검증: OK (${verification.total} 레코드, ${verifyMode})`
          : `검증: FAIL — ${verification.reason} @ seq=${verification.firstBadSeq} (${verifyMode})`,
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
        // r.summary may carry caller-controlled fragments (questions,
        // signers, …). Most are sanitised at call-site now, but legacy
        // entries from older builds or unverified callers can still hold
        // newlines that would forge a header at column 0 once the
        // 8-space indent is consumed. sanitisePromptLine collapses them.
        lines.push(`        ${sanitisePromptLine(r.summary, 500)}`);
        lines.push(`        hash=${r.hash.slice(0, 12)}…  prev=${r.prev === 'GENESIS' ? 'GENESIS' : r.prev.slice(0, 12) + '…'}`);
      }
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
