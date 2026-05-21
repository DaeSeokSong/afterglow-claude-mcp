import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  appendHistory,
  assertInitialized,
  readHistory,
  readPersona,
  writePersona,
  writeSystemPrompt,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { PersonaSchema, renderSystemPrompt, type Persona } from '../persona.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const recalibrateShape = {
  slug: z.string().min(1).describe('보정할 에이전트 slug.'),
  apply: z.boolean().optional().describe('true 면 실제 persona.json 수정. 기본은 dry-run.'),
  minSample: z
    .number()
    .int()
    .min(1)
    .max(1000)
    .optional()
    .describe('보정 판단에 필요한 최소 history 표본 수 (기본 10).'),
} as const;

interface RecalibrateArgs {
  slug: string;
  apply?: boolean;
  minSample?: number;
}

/* --------------------------------------------------------------- */
/* Analysis                                                        */
/* --------------------------------------------------------------- */

interface Stats {
  total: number;
  asks: number;
  lowConfHits: number;        // count of ask events with "low" markers
  peerAsks: number;
  refusals: number;
  feedbackThumbsDown: number;
  feedbackThumbsUp: number;
}

/**
 * Heuristic patterns we look for in history.log lines. The shape is
 * deliberately fuzzy so we tolerate human edits and partial migrations.
 */
const PAT_ASK = /\bask\b/i;
const PAT_LOW = /\b(low.?conf|score 0\.0\d|confidence (?:0|[1-4]\d)%|⚠)/i;
const PAT_PEER = /\bpeer.?ask\b/i;
const PAT_REFUSE = /\b(refuse|declined|모른다|거절)/i;
const PAT_UP = /(👍|thumbs.?up|positive feedback)/i;
const PAT_DOWN = /(👎|thumbs.?down|negative feedback)/i;

function analyse(messages: string[]): Stats {
  const s: Stats = {
    total: messages.length,
    asks: 0,
    lowConfHits: 0,
    peerAsks: 0,
    refusals: 0,
    feedbackThumbsDown: 0,
    feedbackThumbsUp: 0,
  };
  for (const m of messages) {
    if (PAT_ASK.test(m)) s.asks++;
    if (PAT_LOW.test(m)) s.lowConfHits++;
    if (PAT_PEER.test(m)) s.peerAsks++;
    if (PAT_REFUSE.test(m)) s.refusals++;
    if (PAT_UP.test(m)) s.feedbackThumbsUp++;
    if (PAT_DOWN.test(m)) s.feedbackThumbsDown++;
  }
  return s;
}

interface Adjustment {
  field: 'confidenceFloor' | 'peerAskThreshold';
  before: number;
  after: number;
  reason: string;
}

/**
 * Rule-based recalibration. Bounded by ±10pp per pass so a single noisy day
 * can't swing the persona drastically.
 *
 *   - 잦은 부정 피드백 / 거절 → confidenceFloor 올림 (더 보수적으로)
 *   - 잦은 긍정 피드백 + 낮은 거절률 → confidenceFloor 내림 (더 적극적으로)
 *   - 잦은 low-confidence 답변 → peerAskThreshold 올림 (남에게 더 자주 물어봄)
 *   - peerAsk 거의 안 한다 → peerAskThreshold 내림 (자기 답변 신뢰)
 */
function suggest(persona: Persona, stats: Stats): Adjustment[] {
  const out: Adjustment[] = [];
  if (stats.asks === 0) return out;

  const downRate = stats.feedbackThumbsDown / Math.max(1, stats.asks);
  const upRate = stats.feedbackThumbsUp / Math.max(1, stats.asks);
  const refuseRate = stats.refusals / Math.max(1, stats.asks);
  const lowRate = stats.lowConfHits / Math.max(1, stats.asks);
  const peerRate = stats.peerAsks / Math.max(1, stats.asks);

  const clamp = (n: number, lo = 0, hi = 100) => Math.max(lo, Math.min(hi, n));

  if (downRate > 0.2 || refuseRate > 0.3) {
    const before = persona.confidenceFloor;
    const after = clamp(before + 5);
    if (after !== before) {
      out.push({
        field: 'confidenceFloor',
        before,
        after,
        reason: `negative feedback ${(downRate * 100).toFixed(0)}% · refusal ${(refuseRate * 100).toFixed(0)}% — 더 보수적으로`,
      });
    }
  } else if (upRate > 0.5 && downRate < 0.05) {
    const before = persona.confidenceFloor;
    const after = clamp(before - 3, 30);
    if (after !== before) {
      out.push({
        field: 'confidenceFloor',
        before,
        after,
        reason: `positive feedback ${(upRate * 100).toFixed(0)}% · negative ${(downRate * 100).toFixed(0)}% — 조금 더 적극적으로`,
      });
    }
  }

  if (lowRate > 0.3 && peerRate < 0.1) {
    const before = persona.peerAskThreshold;
    const after = clamp(before + 5);
    if (after !== before) {
      out.push({
        field: 'peerAskThreshold',
        before,
        after,
        reason: `low-confidence ${(lowRate * 100).toFixed(0)}% 인데 peer-ask ${(peerRate * 100).toFixed(0)}% — 동료에게 더 자주 물어보세요`,
      });
    }
  } else if (peerRate > 0.5 && lowRate < 0.1) {
    const before = persona.peerAskThreshold;
    const after = clamp(before - 5, 40);
    if (after !== before) {
      out.push({
        field: 'peerAskThreshold',
        before,
        after,
        reason: `peer-ask ${(peerRate * 100).toFixed(0)}% 인데 low-conf ${(lowRate * 100).toFixed(0)}% — 자기 답변을 더 신뢰`,
      });
    }
  }

  return out;
}

export async function runRecalibrate(args: RecalibrateArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    if (!(await agentExists(args.slug))) {
      return errorReply(new AgentNotFoundError(args.slug).message);
    }
    const minSample = args.minSample ?? 10;
    const history = await readHistory(args.slug);
    const messages = history.map((h) => h.message);
    const stats = analyse(messages);

    if (stats.total < minSample) {
      return {
        content: [
          {
            type: 'text',
            text:
              `(표본 부족) ${args.slug} history ${stats.total} / 최소 ${minSample}.\n` +
              `더 많이 사용한 뒤 다시 실행하세요. --min-sample 로 임계값을 조정할 수도 있어요.`,
          },
        ],
      };
    }

    const persona = await readPersona(args.slug);
    const adjustments = suggest(persona, stats);

    const lines: string[] = [];
    lines.push(`# recalibrate · ${args.slug}`);
    lines.push('');
    lines.push('## 분석');
    lines.push(`- 총 이벤트:        ${stats.total}`);
    lines.push(`- ask 호출:         ${stats.asks}`);
    lines.push(`- low-confidence:   ${stats.lowConfHits}`);
    lines.push(`- peer-ask 발동:    ${stats.peerAsks}`);
    lines.push(`- 거절:             ${stats.refusals}`);
    lines.push(`- 👍 피드백:        ${stats.feedbackThumbsUp}`);
    lines.push(`- 👎 피드백:        ${stats.feedbackThumbsDown}`);
    lines.push('');

    if (adjustments.length === 0) {
      lines.push('## 결과');
      lines.push('변경 제안 없음 — 현재 페르소나 값이 사용 패턴과 잘 맞아요.');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    lines.push(`## 제안 (${adjustments.length})`);
    for (const a of adjustments) {
      lines.push(`- ${a.field}: ${a.before} → ${a.after}`);
      lines.push(`    이유: ${a.reason}`);
    }

    if (!args.apply) {
      lines.push('');
      lines.push('(dry-run) 적용하려면 같은 명령에 --apply 추가.');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }

    // Apply
    const next: Persona = JSON.parse(JSON.stringify(persona)) as Persona;
    for (const a of adjustments) {
      next[a.field] = a.after;
    }
    next.updatedAt = new Date().toISOString();
    const parsed = PersonaSchema.safeParse(next);
    if (!parsed.success) {
      return errorReply(
        `recalibrate 후 persona 검증 실패: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
    }
    await writePersona(args.slug, parsed.data);
    await writeSystemPrompt(args.slug, renderSystemPrompt(parsed.data));
    await appendHistory(
      args.slug,
      `recalibrate applied (${adjustments.map((a) => a.field).join(', ')})`,
    );
    await auditAppend({
      tool: 'afterglow_recalibrate',
      slug: args.slug,
      summary: `applied ${adjustments.length} adjustments`,
      meta: {
        adjustments: adjustments.map((a) => ({ field: a.field, before: a.before, after: a.after })),
        stats,
      },
    });

    lines.push('');
    lines.push('✓ 적용 완료 — persona.json · system-prompt.md 갱신, history.log + audit 기록.');
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
