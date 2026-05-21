import { z } from 'zod';
import {
  appendCorrection,
  appendHistory,
  assertInitialized,
  assertWritable,
  getStatus,
  readCorrections,
  type CorrectionEntry,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine } from '../sanitize.js';
import { errorReply, safe, type ToolReply } from './types.js';

// recordIds end up embedded in log lines + the corrections.log parser splits
// on whitespace, so we keep them URL-/ASCII-safe to avoid injection.
const RECORD_ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._:\-]{0,127}$/;

export const correctShape = {
  action: z
    .enum(['feedback', 'edit-answer', 'save-rule', 'list'])
    .describe('feedback | edit-answer | save-rule | list.'),
  slug: z.string().min(1).describe('대상 에이전트 slug.'),
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
  limit: z.number().int().min(1).max(500).optional().describe('list 시 표시 개수 (기본 30).'),
} as const;

interface CorrectArgs {
  action: 'feedback' | 'edit-answer' | 'save-rule' | 'list';
  slug: string;
  recordId?: string;
  feedback?: string;
  newAnswer?: string;
  rule?: string;
  limit?: number;
}

export async function runCorrect(args: CorrectArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    try {
      await getStatus(args.slug); // registry-aware existence
    } catch (e) {
      return errorReply((e as Error).message);
    }
    // list is the only read-only action; all others append to corrections.log
    // and would corrupt an archived agent's record.
    if (args.action !== 'list') {
      try {
        await assertWritable(args.slug);
      } catch (e) {
        return errorReply((e as Error).message);
      }
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
      case 'list':
        return listAction(args.slug, args.limit ?? 30);
    }
  });
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
  const entries = await readCorrections(slug);
  if (entries.length === 0) {
    return { content: [{ type: 'text', text: `(no corrections) ${slug} 에 보정 기록이 없어요.` }] };
  }
  const shown = entries.slice(-limit).reverse();
  const lines: string[] = [];
  lines.push(`# corrections · ${slug}  (${shown.length} / ${entries.length})`);
  lines.push('');
  for (const e of shown) {
    const tag = e.kind === 'feedback' ? '💬' : e.kind === 'edit-answer' ? '✎' : '📌';
    lines.push(`${tag} ${e.ts}  record=${sanitisePromptLine(e.recordId, 128)}`);
    // Notes are user-authored — sanitise so listings don't carry a forged
    // header into an orchestrator Claude's context.
    lines.push(`    ${sanitisePromptLine(truncate(e.note, 200), 300)}`);
  }
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

function truncate(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + '…';
}
