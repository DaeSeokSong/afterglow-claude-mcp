import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  appendHistory,
  assertInitialized,
  readHistory,
  readPersona,
  snapshotPersona,
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
  byTopic: z
    .boolean()
    .optional()
    .describe(
      '토픽별(expertise-aware) 분석 모드. 각 ask 를 페르소나의 expertise 키워드와 매칭해 in-expertise vs out-of-expertise 신뢰도 통계와 expertise 조정 제안을 출력합니다. 자동 적용은 안 함 (진단).',
    ),
} as const;

interface RecalibrateArgs {
  slug: string;
  apply?: boolean;
  minSample?: number;
  byTopic?: boolean;
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

/* --------------------------------------------------------------- */
/* Topic-aware (expertise-aware) analysis                           */
/* --------------------------------------------------------------- */

const ASK_QUESTION_RE = /^ask:\s+"([^"]+)"/;

interface TopicBucket {
  expertise: string;            // canonical expertise tag, or '(out-of-expertise)'
  asks: number;
  lowConf: number;
  refusals: number;
  thumbsUp: number;
  thumbsDown: number;
  avgConfidence: number | null; // true arithmetic mean of confidence%
  confidenceSum: number;        // internal — sum of confidence values
  confidenceCount: number;      // internal — number of confidence samples
}

function extractQuestion(message: string): string | null {
  const m = message.match(ASK_QUESTION_RE);
  return m ? m[1] : null;
}

function extractConfidence(message: string): number | null {
  const m = message.match(/confidence\s+(\d+)%/i);
  return m ? Number(m[1]) : null;
}

/**
 * Bucket each ask event by which (if any) of the agent's expertise tags
 * literally appears in the question text. An ask can fall into multiple
 * buckets if the question mentions several tags; an ask that mentions none
 * goes into the special '(out-of-expertise)' bucket.
 */
function bucketByExpertise(messages: string[], expertise: string[]): Map<string, TopicBucket> {
  const buckets = new Map<string, TopicBucket>();
  const ensure = (key: string): TopicBucket => {
    let b = buckets.get(key);
    if (!b) {
      b = {
        expertise: key,
        asks: 0,
        lowConf: 0,
        refusals: 0,
        thumbsUp: 0,
        thumbsDown: 0,
        avgConfidence: null,
        confidenceSum: 0,
        confidenceCount: 0,
      };
      buckets.set(key, b);
    }
    return b;
  };
  // seed buckets so we always include the agent's declared expertise
  for (const e of expertise) ensure(e);
  ensure('(out-of-expertise)');

  for (const m of messages) {
    const q = extractQuestion(m);
    if (!q) continue;
    const matched = expertise.filter((tag) => q.includes(tag));
    const targets = matched.length > 0 ? matched : ['(out-of-expertise)'];
    const conf = extractConfidence(m);
    const isLow = /\blow.?conf\b/i.test(m);
    const isRefuse = /(모른다|거절|declined|refuse)/i.test(m);
    const isUp = /(👍|thumbs.?up)/i.test(m);
    const isDown = /(👎|thumbs.?down)/i.test(m);

    for (const t of targets) {
      const b = ensure(t);
      b.asks++;
      if (isLow) b.lowConf++;
      if (isRefuse) b.refusals++;
      if (isUp) b.thumbsUp++;
      if (isDown) b.thumbsDown++;
      if (conf !== null) {
        b.confidenceSum += conf;
        b.confidenceCount++;
      }
    }
  }
  // Finalise true arithmetic mean per bucket.
  for (const b of buckets.values()) {
    b.avgConfidence = b.confidenceCount > 0 ? Math.round(b.confidenceSum / b.confidenceCount) : null;
  }
  return buckets;
}

interface TopicSuggestion {
  action: 'remove-expertise' | 'consider-adding' | 'invest-more';
  target: string;
  reason: string;
}

function suggestByTopic(
  expertise: string[],
  buckets: Map<string, TopicBucket>,
): TopicSuggestion[] {
  const out: TopicSuggestion[] = [];

  // For each declared expertise: if asks > 5 and avg confidence is very low,
  // or thumbs-down rate is high → suggest removing the tag.
  for (const tag of expertise) {
    const b = buckets.get(tag);
    if (!b || b.asks < 5) continue;
    const downRate = b.thumbsDown / b.asks;
    const lowRate = b.lowConf / b.asks;
    if (downRate > 0.3 || (b.avgConfidence !== null && b.avgConfidence < 50)) {
      out.push({
        action: 'remove-expertise',
        target: tag,
        reason: `"${tag}" 영역 ${b.asks} 회 호출 중 👎 ${b.thumbsDown}건 (${(downRate * 100).toFixed(0)}%) · avg conf ${b.avgConfidence ?? 'n/a'}% — 자신있는 영역에서 빼는 게 정직할 수 있어요.`,
      });
    } else if (lowRate < 0.1 && (b.avgConfidence ?? 0) > 80 && b.asks >= 10) {
      out.push({
        action: 'invest-more',
        target: tag,
        reason: `"${tag}" 영역에서 ${b.asks} 회 호출 모두 안정적 (avg ${b.avgConfidence}%, low-conf ${b.lowConf}). 자료를 더 모아두면 가치가 큰 영역.`,
      });
    }
  }

  // out-of-expertise: if many asks land here with decent confidence,
  // there's an unstated expertise the user keeps hitting.
  const outBucket = buckets.get('(out-of-expertise)');
  if (outBucket && outBucket.asks >= 5) {
    if ((outBucket.avgConfidence ?? 0) >= 70) {
      out.push({
        action: 'consider-adding',
        target: '(unnamed)',
        reason: `expertise 밖 질문이 ${outBucket.asks} 회 — avg conf ${outBucket.avgConfidence}% 로 의외로 잘 답하고 있어요. 새 expertise 태그 추가를 고려.`,
      });
    } else if (outBucket.avgConfidence !== null && outBucket.avgConfidence < 40) {
      out.push({
        action: 'remove-expertise',
        target: '(routing)',
        reason: `expertise 밖 질문 ${outBucket.asks} 회 모두 저신뢰 (avg ${outBucket.avgConfidence}%). 사용자에게 다른 에이전트를 안내하는 게 좋을 수 있어요.`,
      });
    }
  }

  return out;
}

async function runRecalibrateByTopic(args: RecalibrateArgs): Promise<ToolReply> {
  const minSample = args.minSample ?? 10;
  const history = await readHistory(args.slug);
  const messages = history.map((h) => h.message);
  const persona = await readPersona(args.slug);
  if (messages.length < minSample) {
    return {
      content: [
        {
          type: 'text',
          text:
            `(표본 부족) ${args.slug} history ${messages.length} / 최소 ${minSample}.\n` +
            `더 많이 사용한 뒤 다시 실행하세요. --min-sample 로 임계값을 조정할 수도 있어요.`,
        },
      ],
    };
  }

  const buckets = bucketByExpertise(messages, persona.expertise);
  const suggestions = suggestByTopic(persona.expertise, buckets);

  const lines: string[] = [];
  lines.push(`# recalibrate · ${args.slug} (by-topic / expertise-aware)`);
  lines.push('');
  lines.push('## 분석');
  lines.push(`- 페르소나 expertise: ${persona.expertise.length ? persona.expertise.join(' · ') : '(미지정)'}`);
  lines.push(`- 전체 ask 표본:     ${messages.filter((m) => extractQuestion(m)).length}`);
  lines.push('');
  lines.push('## 토픽별 통계');
  lines.push('');
  const allKeys = Array.from(buckets.keys()).sort((a, b) => {
    if (a === '(out-of-expertise)') return 1;
    if (b === '(out-of-expertise)') return -1;
    return a.localeCompare(b);
  });
  // Render as a markdown-ish table
  const headerCells = [
    'expertise'.padEnd(20),
    'asks'.padStart(5),
    'low-conf'.padStart(9),
    '👎'.padStart(4),
    '👍'.padStart(4),
    'avg conf'.padStart(9),
  ];
  lines.push(headerCells.join('  '));
  lines.push('-'.repeat(headerCells.join('  ').length));
  for (const k of allKeys) {
    const b = buckets.get(k)!;
    lines.push(
      [
        k.padEnd(20),
        String(b.asks).padStart(5),
        String(b.lowConf).padStart(9),
        String(b.thumbsDown).padStart(4),
        String(b.thumbsUp).padStart(4),
        (b.avgConfidence === null ? '—' : `${b.avgConfidence}%`).padStart(9),
      ].join('  '),
    );
  }
  lines.push('');

  if (suggestions.length === 0) {
    lines.push('## 제안');
    lines.push('변경 제안 없음 — 토픽 분포와 신뢰도가 균형 잡혀 있어요.');
  } else {
    lines.push(`## 제안 (${suggestions.length})`);
    for (const s of suggestions) {
      const label =
        s.action === 'remove-expertise'
          ? '제거'
          : s.action === 'consider-adding'
          ? '추가 검토'
          : '자료 보강';
      lines.push(`- [${label}] ${s.target}`);
      lines.push(`    ${s.reason}`);
    }
    lines.push('');
    lines.push(
      'by-topic 모드는 진단 전용이라 자동 적용 안 합니다. 수동 반영: /afterglow edit <slug> --add-expertise … --remove-expertise …',
    );
  }

  // audit + history
  await appendHistory(args.slug, `recalibrate --by-topic (${suggestions.length} suggestion${suggestions.length === 1 ? '' : 's'})`);
  await auditAppend({
    tool: 'afterglow_recalibrate',
    slug: args.slug,
    summary: `by-topic diagnostic · ${suggestions.length} suggestions`,
    meta: { mode: 'by-topic', expertise: persona.expertise, suggestions: suggestions.length },
  });

  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

export async function runRecalibrate(args: RecalibrateArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    if (!(await agentExists(args.slug))) {
      return errorReply(new AgentNotFoundError(args.slug).message);
    }
    if (args.byTopic) {
      return runRecalibrateByTopic(args);
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
    const snap = await snapshotPersona(args.slug, `recalibrate apply · ${adjustments.length} fields`);
    await writePersona(args.slug, parsed.data);
    await writeSystemPrompt(args.slug, renderSystemPrompt(parsed.data));
    await appendHistory(
      args.slug,
      `recalibrate applied (${adjustments.map((a) => a.field).join(', ')}, snapshot ${snap.id})`,
    );
    await auditAppend({
      tool: 'afterglow_recalibrate',
      slug: args.slug,
      summary: `applied ${adjustments.length} adjustments`,
      meta: {
        adjustments: adjustments.map((a) => ({ field: a.field, before: a.before, after: a.after })),
        stats,
        snapshot: snap.id,
      },
    });

    lines.push('');
    lines.push('✓ 적용 완료 — persona.json · system-prompt.md 갱신, history.log + audit 기록.');
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
