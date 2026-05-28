import { z } from 'zod';
import {
  appendAnswerLog,
  appendCorrection,
  appendHistory,
  assertInitialized,
  assertWritable,
  getStatus,
  readAnswerLog,
  readCorrections,
  type CorrectionEntry,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine, sanitisePromptText } from '../sanitize.js';
import { assertAccessAllowed } from './acl.js';
import { elicitMissing, slugCandidates } from './elicit.js';
import { errorReply, safe, type ToolReply } from './types.js';

// recordIds end up embedded in log lines + the corrections.log parser splits
// on whitespace, so we keep them URL-/ASCII-safe to avoid injection.
const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\-]{0,127}$/;

export const correctShape = {
  action: z
    .enum(['feedback', 'edit-answer', 'save-rule', 'record-answer', 'list'])
    .optional()
    .describe('(필수) feedback | edit-answer | save-rule | record-answer(Claude 가 만든 답변을 감사용으로 회수 저장) | list.'),
  slug: z.string().min(1).optional().describe('(필수) 대상 에이전트 slug. 생략 시 안내합니다.'),
  recordId: z
    .string()
    .max(128)
    .optional()
    .describe('대상 ask 호출의 record id (history.log timestamp 또는 임의 식별자).'),
  // The hard caps here are the prompt-injection containment line: every byte
  // of these fields ends up in Claude's working context when the next `ask`
  // surfaces the corrections block, so we keep them narrow.
  feedback: z
    .string()
    .max(2_000)
    .optional()
    .describe('feedback 액션의 자연어 피드백 ("이 부분만 다시" 같은). 최대 2000자.'),
  newAnswer: z
    .string()
    .max(4_000)
    .optional()
    .describe('edit-answer 액션에서 사용자가 직접 적은 새 답변. 최대 4000자.'),
  rule: z
    .string()
    .max(2_000)
    .optional()
    .describe('save-rule 액션의 패턴 → 적용 규칙. 최대 2000자. 예: "when=결제 폼 → apply=폼 순서 변경은 백엔드 무영향".'),
  // record-answer fields (Phase P2 — close the "ask returns a context bundle,
  // the actual answer never comes back" audit gap).
  question: z
    .string()
    .max(10_000)
    .optional()
    .describe('record-answer 시 사용자가 한 질문 (ask 의 question 그대로). 최대 10000자.'),
  answer: z
    .string()
    .max(20_000)
    .optional()
    .describe('record-answer 시 Claude 가 만들어 사용자에게 보여준 답변 본문. 최대 20000자.'),
  confidence: z
    .number()
    .int()
    .min(0)
    .max(100)
    .optional()
    .describe('record-answer 시 Claude 가 자기 답변에 매긴 신뢰도(%, 0-100).'),
  sources: z
    .array(z.string().max(500))
    .max(20)
    .optional()
    .describe('record-answer 시 Claude 가 인용한 출처 라벨들.'),
  caller: z
    .string()
    .max(80)
    .optional()
    .describe('호출자 식별 (user:|role:|team:). access policy 가 deny 규칙이 있을 때 mutator 액션에 필수.'),
  limit: z.number().int().min(1).max(500).optional().describe('list 시 표시 개수 (기본 30).'),
} as const;

interface CorrectArgs {
  action: 'feedback' | 'edit-answer' | 'save-rule' | 'record-answer' | 'list';
  slug: string;
  recordId?: string;
  feedback?: string;
  newAnswer?: string;
  rule?: string;
  question?: string;
  answer?: string;
  confidence?: number;
  sources?: string[];
  caller?: string;
  limit?: number;
}

export async function runCorrect(args: CorrectArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const ask = await elicitMissing('correct', args as unknown as Record<string, unknown>, [
      { name: 'slug', required: true, label: '보정할 에이전트', candidates: slugCandidates, example: 'jiyoon' },
      { name: 'action', required: true, label: '동작', enumValues: ['feedback', 'edit-answer', 'save-rule', 'record-answer', 'list'] },
      { name: 'feedback', required: false, label: 'feedback/save-rule 본문' },
      { name: 'recordId', required: false, label: '대상 기록 id' },
      { name: 'caller', required: false, label: '호출자 (user:/role:/team:) — 정책 deny 시 필수' },
    ]);
    if (ask) return ask;
    try {
      await getStatus(args.slug); // registry-aware existence
    } catch (e) {
      return errorReply((e as Error).message);
    }
    // list is the only read-only action; all others append to corrections.log
    // (or answers.log for record-answer) and would corrupt an archived agent's
    // record.
    if (args.action !== 'list') {
      try {
        await assertWritable(args.slug);
      } catch (e) {
        return errorReply((e as Error).message);
      }
      // Per-tool ACL gate (Phase P5) — closes the "access policy is read-only"
      // hole the README itself flagged: previously anyone could pollute the
      // corrections / answer log even when the owner had set deny rules.
      const denied = await assertAccessAllowed(args.slug, args.caller, 'correct');
      if (denied) return denied;
    }
    // recordId validation applies to all write actions that take it.
    if (args.recordId && !RECORD_ID_PATTERN.test(args.recordId)) {
      return errorReply(
        `Invalid recordId "${sanitisePromptLine(args.recordId, 128)}". Use 1-128 chars: ASCII alnum / "-" / "_" / "." / ":", starting with alnum.`,
      );
    }
    switch (args.action) {
      case 'feedback':
        return feedback(args);
      case 'edit-answer':
        return editAnswer(args);
      case 'save-rule':
        return saveRule(args);
      case 'record-answer':
        return recordAnswer(args);
      case 'list':
        return listAction(args.slug, args.limit ?? 30);
    }
  });
}

/**
 * Record-answer (Phase P2) — log Claude's composed answer back into the
 * agent so audit / inspection / future RAG corrections see what was actually
 * said in the persona's name. Closes the gap that `ask` returns only a
 * context bundle and the real answer lives in the user's chat.
 */
async function recordAnswer(args: CorrectArgs): Promise<ToolReply> {
  if (!args.question || args.question.trim().length === 0) {
    return errorReply('record-answer 에는 question 이 필요합니다 (ask 때 했던 질문 그대로).');
  }
  if (!args.answer || args.answer.trim().length === 0) {
    return errorReply('record-answer 에는 answer (Claude 가 만든 답변 본문) 가 필요합니다.');
  }
  const now = new Date().toISOString();
  await appendAnswerLog(args.slug, {
    ts: now,
    question: sanitisePromptText(args.question, 10_000),
    answer: sanitisePromptText(args.answer, 20_000),
    confidence: args.confidence,
    sources: (args.sources ?? []).slice(0, 20).map((s) => sanitisePromptLine(s, 500)),
    caller: args.caller,
  });
  await appendHistory(
    args.slug,
    `record-answer (${args.answer.length} chars${args.confidence !== undefined ? `, confidence ${args.confidence}%` : ''}${args.caller ? `, by ${args.caller}` : ''})`,
  );
  await auditAppend({
    tool: 'afterglow_correct',
    slug: args.slug,
    summary: `correct record-answer · ${args.answer.length} chars`,
    meta: {
      action: 'record-answer',
      questionPreview: args.question.slice(0, 200),
      questionLength: args.question.length,
      answerLength: args.answer.length,
      confidence: args.confidence ?? null,
      sources: (args.sources ?? []).length,
      caller: args.caller ?? null,
    },
  });
  return {
    content: [
      {
        type: 'text',
        text:
          `✓ Claude 가 만든 답변을 ${args.slug} 의 answers.log 에 회수 저장했습니다 (${args.answer.length}자` +
          (args.confidence !== undefined ? `, 신뢰도 ${args.confidence}%` : '') +
          ((args.sources ?? []).length > 0 ? `, 출처 ${(args.sources ?? []).length}건` : '') +
          `). action=list 로 회수 답변 + 보정 기록을 한꺼번에 확인할 수 있습니다.`,
      },
    ],
  };
}

async function feedback(args: CorrectArgs): Promise<ToolReply> {
  if (!args.recordId) return errorReply('feedback 에는 recordId 가 필요합니다.');
  if (!args.feedback || args.feedback.trim().length === 0) {
    return errorReply('feedback 내용이 비어있을 수 없습니다.');
  }
  const entry: CorrectionEntry = {
    ts: new Date().toISOString(),
    recordId: args.recordId,
    kind: 'feedback',
    // Sanitise at write — corrections.log is read by ask.ts (system-prompt
    // context) and by `list` (Claude-visible). One sanitisation at the
    // boundary protects all downstream readers.
    note: sanitisePromptLine(args.feedback.trim(), 2_000),
  };
  await appendCorrection(args.slug, entry);
  await appendHistory(args.slug, `correct feedback record=${args.recordId} "${truncate(args.feedback, 60)}"`);
  await auditAppend({
    tool: 'afterglow_correct',
    slug: args.slug,
    summary: `feedback on ${args.recordId}`,
    meta: { recordId: args.recordId, length: args.feedback.length },
  });
  return {
    content: [
      {
        type: 'text',
        text:
          `✓ ${args.slug} 에 피드백 기록 (${args.recordId}).\n` +
          `  "${sanitisePromptLine(truncate(args.feedback, 120), 200)}"\n\n` +
          `피드백은 corrections.log + history.log + audit 에 누적돼서 사람이 검수할 때 참고합니다. ` +
          `에이전트 답변에 자동 반영하려면 \`edit-answer\` (사용자 정답으로 교체) 또는 \`save-rule\` ` +
          `(패턴→적용 규칙) 을 쓰세요 — 이 둘만 다음 ask 부터 RAG 보다 우선 인용됩니다.`,
      },
    ],
  };
}

async function editAnswer(args: CorrectArgs): Promise<ToolReply> {
  if (!args.recordId) return errorReply('edit-answer 에는 recordId 가 필요합니다.');
  if (!args.newAnswer || args.newAnswer.trim().length === 0) {
    return errorReply('newAnswer 가 비어있을 수 없습니다.');
  }
  const entry: CorrectionEntry = {
    ts: new Date().toISOString(),
    recordId: args.recordId,
    kind: 'edit-answer',
    // Sanitise + collapse newlines at write — ask.ts surfaces this inside
    // the ```corrections fence + an orchestrator may see it via `list`.
    note: sanitisePromptLine(args.newAnswer.trim(), 4_000),
  };
  await appendCorrection(args.slug, entry);
  await appendHistory(
    args.slug,
    `correct edit-answer record=${args.recordId} "${truncate(args.newAnswer, 60)}"`,
  );
  await auditAppend({
    tool: 'afterglow_correct',
    slug: args.slug,
    summary: `edit-answer on ${args.recordId}`,
    meta: { recordId: args.recordId, length: args.newAnswer.length },
  });
  return {
    content: [
      {
        type: 'text',
        text:
          `✓ ${args.slug} 의 record=${args.recordId} 답변을 사용자 정답으로 교체.\n` +
          `다음 호출부터 비슷한 질문이 들어오면 이 정답이 retrieval 결과보다 우선됩니다 (페르소나 self-correction).`,
      },
    ],
  };
}

async function saveRule(args: CorrectArgs): Promise<ToolReply> {
  if (!args.rule || args.rule.trim().length === 0) {
    return errorReply('save-rule 에는 rule 이 필요합니다 (예: "when=결제 폼 → apply=폼 순서 변경은 무영향").');
  }
  const entry: CorrectionEntry = {
    ts: new Date().toISOString(),
    recordId: args.recordId ?? 'rule',
    kind: 'save-rule',
    note: sanitisePromptLine(args.rule.trim(), 2_000),
  };
  await appendCorrection(args.slug, entry);
  await appendHistory(args.slug, `correct save-rule "${truncate(args.rule, 60)}"`);
  await auditAppend({
    tool: 'afterglow_correct',
    slug: args.slug,
    summary: 'save-rule',
    meta: { ruleLength: args.rule.length },
  });
  return {
    content: [
      { type: 'text', text: `✓ 규칙 저장됨. 같은 패턴의 질문이 다시 들어올 때 페르소나가 이 규칙을 참고합니다.` },
    ],
  };
}

async function listAction(slug: string, limit: number): Promise<ToolReply> {
  const corrections = await readCorrections(slug);
  const answers = await readAnswerLog(slug);
  if (corrections.length === 0 && answers.length === 0) {
    return { content: [{ type: 'text', text: `(no corrections / no recorded answers) ${slug} 에 회수 답변/보정 기록이 없어요.` }] };
  }
  const lines: string[] = [];
  if (corrections.length > 0) {
    const shown = corrections.slice(-limit).reverse();
    lines.push(`# corrections · ${slug}  (${shown.length} / ${corrections.length})`);
    lines.push('');
    for (const e of shown) {
      const tag = e.kind === 'feedback' ? '💬' : e.kind === 'edit-answer' ? '✎' : '📌';
      lines.push(`${tag} ${e.ts}  record=${sanitisePromptLine(e.recordId, 128)}`);
      // Notes are user-authored — sanitise so listings don't carry a forged
      // header into an orchestrator Claude's context.
      lines.push(`    ${sanitisePromptLine(truncate(e.note, 200), 300)}`);
    }
    lines.push('');
  }
  if (answers.length > 0) {
    const shownA = answers.slice(-limit).reverse();
    lines.push(`# recorded answers · ${slug}  (${shownA.length} / ${answers.length})`);
    lines.push('');
    for (const a of shownA) {
      const conf = a.confidence !== undefined ? ` · ${a.confidence}%` : '';
      const by = a.caller ? ` · by ${sanitisePromptLine(a.caller, 80)}` : '';
      lines.push(`✦ ${a.ts}${conf}${by}`);
      lines.push(`  Q: ${sanitisePromptLine(truncate(a.question, 160), 200)}`);
      lines.push(`  A: ${sanitisePromptLine(truncate(a.answer, 240), 280)}`);
      if (a.sources && a.sources.length > 0) {
        lines.push(`     ↗ ${a.sources.slice(0, 3).map((s) => sanitisePromptLine(s, 120)).join(' · ')}${a.sources.length > 3 ? ` (+${a.sources.length - 3})` : ''}`);
      }
    }
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
