import { z } from 'zod';
import {
  appendHistory,
  assertActive,
  assertInitialized,
  readPersona,
  readSystemPrompt,
} from '../storage.js';
import { retrieve, type Retrieval } from '../rag.js';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const askShape = {
  slug: z.string().min(1).describe('질문을 받을 에이전트의 slug.'),
  question: z.string().min(1).describe('질문 내용.'),
  topK: z
    .number()
    .int()
    .min(1)
    .max(12)
    .optional()
    .describe('RAG 결과 청크 개수. 기본 4.'),
} as const;

interface AskArgs {
  slug: string;
  question: string;
  topK?: number;
}

/**
 * The `ask` tool does NOT call the LLM itself. Instead it returns a structured
 * block that Claude Code can read directly: the persona system prompt, the
 * matched knowledge chunks, and a few framing rules.
 *
 * Claude then composes the actual answer in the user's session — meaning the
 * exact same Claude model the user already pays for. No separate model
 * weights, no extra inference cost.
 */
export async function runAsk(args: AskArgs): Promise<ToolReply> {
  return safe(async () => {
  await assertInitialized();
  // Registry-aware gate: handles not-found · archived · not-signed in order.
  try {
    await assertActive(args.slug);
  } catch (e) {
    return errorReply((e as Error).message);
  }

  const persona = await readPersona(args.slug);
  const systemPrompt = await readSystemPrompt(args.slug);
  const topK = args.topK ?? 4;
  const hits = await retrieve(args.slug, args.question, topK);

  const confidenceEstimate = estimateConfidence(hits);
  const isLow = confidenceEstimate < persona.peerAskThreshold;
  await appendHistory(
    args.slug,
    `ask: "${truncate(args.question, 120)}" (${hits.length} chunks, confidence ${confidenceEstimate}%${isLow ? ', low-conf' : ''})`,
  );
  await auditAppend({
    tool: 'afterglow_ask',
    slug: args.slug,
    summary: `ask · ${hits.length} chunks · confidence ${confidenceEstimate}%`,
    meta: { topK, hits: hits.length, confidence: confidenceEstimate },
  });

  const lines: string[] = [];
  lines.push(`# 호출 컨텍스트  ·  ${persona.slug}  (${persona.name})`);
  lines.push('');
  lines.push('## 사용자 질문');
  lines.push(args.question.trim());
  lines.push('');
  lines.push(`## 페르소나 시스템 프롬프트  (~/.claude/afterglow/agents/${persona.slug}/system-prompt.md)`);
  lines.push(systemPrompt.trim());
  lines.push('');
  lines.push(`## 검색된 자료  (top ${hits.length} / ${topK} 요청)`);
  if (hits.length === 0) {
    lines.push('(매칭된 자료 없음 — knowledge/ 가 비어있거나 질문과 매칭되는 청크가 없습니다.)');
    lines.push('');
    lines.push(`이 경우 에이전트는 "이 부분은 제가 다뤄본 적이 없어요" 라고 솔직히 답하는 게 원칙입니다 (페르소나 ${persona.confidenceFloor}% 신뢰도 floor).`);
  } else {
    hits.forEach((h, i) => {
      lines.push(`### [${i + 1}] ${shortPath(h.chunk.path)} (chunk ${h.chunk.chunkIndex})  ·  score ${h.score}`);
      lines.push(truncate(h.chunk.text, 600));
      lines.push('');
    });
  }
  lines.push('');
  lines.push('## Claude 에게');
  lines.push(
    `위 시스템 프롬프트의 페르소나로 답하되, 검색된 자료에 근거하여 답하세요. 자료가 부족하면 솔직히 모른다고 말하세요. 답변 끝에 ✦ 마크와 신뢰도(0–100%)를 표시하고, 사용한 자료의 번호([1], [2] 등)를 인용하세요.`,
  );
  if (isLow) {
    lines.push('');
    lines.push(
      `※ 검색 점수가 낮습니다 (~${confidenceEstimate}%). 페르소나의 peer-ask 임계값(${persona.peerAskThreshold}%) 이하면, "이 부분은 ${persona.slug} 보다는 다른 에이전트가 더 잘 알 수 있어요" 라고 사용자에게 안내하세요.`,
    );
  }

  return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}

function shortPath(p: string): string {
  // Cross-platform: HOME on POSIX, USERPROFILE on Windows. os.homedir() is
  // the canonical lookup but importing it here would re-introduce a circular
  // shape; reading both env vars is sufficient for this display helper.
  const home = process.env.HOME ?? process.env.USERPROFILE ?? '';
  const normalised = p.replace(/\\/g, '/');
  if (home) {
    const normHome = home.replace(/\\/g, '/');
    if (normalised.startsWith(normHome)) {
      return '~' + normalised.slice(normHome.length);
    }
  }
  return normalised;
}

/**
 * Heuristic for TF-IDF cosine: scores are 0–1, with strong overlaps usually
 * landing around 0.4–0.7. We map [0, 0.6] linearly to [0, 100] and saturate.
 */
function estimateConfidence(hits: Retrieval[]): number {
  if (hits.length === 0) return 0;
  const top = hits[0].score;
  return Math.min(100, Math.max(0, Math.round((top / 0.6) * 100)));
}
