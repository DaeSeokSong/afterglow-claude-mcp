import { z } from 'zod';
import {
  appendHistory,
  assertInitialized,
  getStatus,
  resumeAgent,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { elicitMissing, slugCandidates } from './elicit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const resumeShape = {
  slug: z.string().min(1).optional().describe('(필수) 재활성화할 에이전트 slug. 생략 시 안내합니다.'),
} as const;

interface ResumeArgs {
  slug: string;
}

/**
 * Flip a non-archived / non-active agent (paused, draft, learning) back to
 * active without re-running the consent flow. Useful when:
 *
 *   1. The person is no longer reachable (already departed) and a fresh
 *      sign is impossible — the original consent.md signature still stands.
 *   2. An archived agent was restored (lands in paused) and the consent on
 *      file is still valid.
 *   3. The agent was manually paused via storage.pauseAgent.
 *
 * Refuses to resume an `archived` agent — those must go through
 * /afterglow archive --action restore first.
 */
export async function runResume(args: ResumeArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const ask = await elicitMissing('resume', args as unknown as Record<string, unknown>, [
      { name: 'slug', required: true, label: '재개할 에이전트 (paused/draft→active)', candidates: slugCandidates, example: 'jiyoon' },
    ]);
    if (ask) return ask;
    // getStatus reads the registry, so it correctly throws AgentNotFoundError
    // when there's no entry — even for archived agents whose folder is gone
    // from agents/<slug>/ (path-based agentExists would mis-report not-found).
    const current = await getStatus(args.slug);
    if (current === 'archived') {
      return errorReply(
        `Agent "${args.slug}" is archived. Restore first: /afterglow archive ${args.slug} --action restore`,
      );
    }
    if (current === 'active') {
      return {
        content: [
          {
            type: 'text',
            text: `${args.slug} 는 이미 active 상태예요. 추가 작업 없음.`,
          },
        ],
      };
    }
    const previous = await resumeAgent(args.slug);
    await appendHistory(args.slug, `resumed (${previous} → active)`);
    await auditAppend({
      tool: 'afterglow_resume',
      slug: args.slug,
      summary: `resumed (${previous} → active)`,
      meta: { previousStatus: previous },
    });
    const lines = [
      `✦ ${args.slug} 활성화 (${previous} → active).`,
      '',
      '기존 consent.md 서명이 그대로 유효한 경우에만 사용하세요.',
      `이제 호출 가능: claude /afterglow ask ${args.slug} "..."`,
    ];
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
