import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  appendHistory,
  assertInitialized,
  signConsent,
  snapshotPersona,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const signShape = {
  slug: z.string().min(1).describe('서명할 에이전트 slug.'),
  signer: z
    .string()
    .min(1)
    .max(200)
    .describe('서명자 표시명. 본인 인계 모드면 본인 이름, HR 대리 인계면 "HR · 김OO (대리, 본인 부재)" 같은 형식. CR/LF 자동 제거.'),
  note: z
    .string()
    .max(1_000)
    .optional()
    .describe('선택. 동의 범위·기한·특이사항 등의 짧은 메모. 최대 1000자.'),
} as const;

interface SignArgs {
  slug: string;
  signer: string;
  note?: string;
}

/**
 * Flip a draft agent to active by appending a signature block to consent.md
 * and updating registry.json. `ask` and `council` refuse non-active agents
 * unless AFTERGLOW_ALLOW_DRAFT=1 is set.
 */
export async function runSign(args: SignArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    if (!(await agentExists(args.slug))) {
      return errorReply(new AgentNotFoundError(args.slug).message);
    }
    const snap = await snapshotPersona(args.slug, `sign by ${args.signer}`);
    const r = await signConsent(args.slug, args.signer, args.note);
    await appendHistory(
      args.slug,
      `signed by ${args.signer} (${r.previousStatus} → active, snapshot ${snap.id})`,
    );
    // Put the sanitized signer into meta (not just summary) so the audit
    // tool's structured filters can find "all HR-delegated signs", "all
    // signs by user X", etc. The summary is for human eyeballs; meta is
    // for the queryable record.
    await auditAppend({
      tool: 'afterglow_sign',
      slug: args.slug,
      summary: `signed by ${r.signer}`,
      meta: {
        signer: r.signer,
        signerHint: /대리|delegated|HR\s*·/i.test(r.signer) ? 'delegated' : 'self',
        previousStatus: r.previousStatus,
        signedAt: r.signedAt,
        noteLength: args.note ? args.note.length : 0,
      },
    });

    const lines = [
      `✦ ${args.slug} 동의 완료 · 상태 ${r.previousStatus} → active`,
      `  서명자: ${r.signer}`,
      `  시각:   ${r.signedAt}`,
    ];
    if (args.note) lines.push(`  메모:   ${args.note}`);
    if (r.previousStatus === 'active') {
      lines.push('');
      lines.push('(주의) 이미 active 상태였어요. 추가 서명 블록만 consent.md 에 append 됐어요.');
    }
    lines.push('');
    lines.push(`이제 호출 가능: claude /afterglow ask ${args.slug} "..."`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
