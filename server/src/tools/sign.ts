import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  appendHistory,
  assertInitialized,
  signConsent,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const signShape = {
  slug: z.string().min(1).describe('서명할 에이전트 slug.'),
  signer: z
    .string()
    .min(1)
    .describe('서명자 표시명. 본인 인계 모드면 본인 이름, 위임 인계면 친권자 이름.'),
  note: z.string().optional().describe('선택. 동의 범위·기한·특이사항 등의 짧은 메모.'),
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
    const r = await signConsent(args.slug, args.signer, args.note);
    await appendHistory(args.slug, `signed by ${args.signer} (${r.previousStatus} → active)`);
    await auditAppend({
      tool: 'afterglow_sign',
      slug: args.slug,
      summary: `signed by ${args.signer}`,
      meta: { previousStatus: r.previousStatus, signedAt: r.signedAt },
    });

    const lines = [
      `✦ ${args.slug} 동의 완료 · 상태 ${r.previousStatus} → active`,
      `  서명자: ${r.signer}`,
      `  시각:   ${r.signedAt}`,
    ];
    if (args.note) lines.push(`  메모:   ${args.note}`);
    lines.push('');
    lines.push(`이제 호출 가능: claude /afterglow ask ${args.slug} "..."`);
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
