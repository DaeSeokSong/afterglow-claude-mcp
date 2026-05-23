import { z } from 'zod';
import {
  assertInitialized,
  readInterviewIndex,
  readInterviewSession,
  readProvenance,
  readRegistry,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine } from '../sanitize.js';
import { safe, type ToolReply } from './types.js';

export const statusShape = {
  json: z.boolean().optional().describe('JSON 으로 출력 (스크립트용).'),
} as const;

interface StatusArgs {
  json?: boolean;
}

interface AgentSummary {
  slug: string;
  name: string;
  status: string;
  interviews: number;
  interviewsFinalized: number;
  interviewsPending: number;
  reviewPending: number;
  imported: boolean;
  originSigner?: string;
  trustLevel?: string;
  annotations: number;
}

/**
 * Global management dashboard — one call answers "what's the state of every
 * agent?": status, interview rounds (finalized / pending-confirmation), media
 * awaiting review, and import origin/trust. Complements per-agent `inspect`.
 */
export async function runStatus(args: StatusArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    await auditAppend({ tool: 'afterglow_status', summary: `status${args.json ? ' --json' : ''}`, meta: { json: !!args.json } });

    const reg = await readRegistry();
    const summaries: AgentSummary[] = [];
    for (const a of reg.agents) {
      const idx = await readInterviewIndex(a.slug);
      let finalized = 0;
      let pending = 0;
      let reviewPending = 0;
      for (const s of idx.sessions) {
        if (s.status === 'finalized') finalized++;
        else if (s.status === 'pending-confirmation') pending++;
      }
      // Count attachments still awaiting review (reviewRequired) across sessions.
      for (const item of idx.sessions) {
        const sess = await readInterviewSession(a.slug, item.sessionId);
        if (sess) reviewPending += sess.attachments.filter((att) => att.reviewRequired).length;
      }
      const prov = await readProvenance(a.slug);
      summaries.push({
        slug: a.slug,
        name: a.name,
        status: a.status,
        interviews: idx.sessions.length,
        interviewsFinalized: finalized,
        interviewsPending: pending,
        reviewPending,
        imported: !!prov?.imported,
        originSigner: prov?.origin.signer,
        trustLevel: prov?.trustLevel,
        annotations: prov?.postImportActivity.filter((p) => p.type === 'annotation').length ?? 0,
      });
    }

    const totals = {
      agents: summaries.length,
      active: summaries.filter((s) => s.status === 'active').length,
      unsigned: summaries.filter((s) => s.status === 'draft' || s.status === 'paused').length,
      archived: summaries.filter((s) => s.status === 'archived').length,
      interviews: summaries.reduce((n, s) => n + s.interviews, 0),
      pendingInterviews: summaries.reduce((n, s) => n + s.interviewsPending, 0),
      reviewPending: summaries.reduce((n, s) => n + s.reviewPending, 0),
      imported: summaries.filter((s) => s.imported).length,
    };

    if (args.json) {
      return { content: [{ type: 'text', text: JSON.stringify({ totals, agents: summaries }, null, 2) }] };
    }

    const lines: string[] = [];
    lines.push('# afterglow status — 전체 대시보드');
    lines.push('');
    if (summaries.length === 0) {
      lines.push('등록된 에이전트가 없어요. /afterglow create <slug> 로 시작하세요.');
      return { content: [{ type: 'text', text: lines.join('\n') }] };
    }
    lines.push(
      `에이전트 ${totals.agents} (active ${totals.active} · 미서명 ${totals.unsigned} · archived ${totals.archived} · import ${totals.imported})`,
    );
    lines.push(`인터뷰 ${totals.interviews} 회차 · pending-confirmation ${totals.pendingInterviews} · 검토대기 미디어 ${totals.reviewPending}`);
    lines.push('');
    for (const s of summaries) {
      const dot =
        s.status === 'active' ? '●'
        : s.status === 'paused' ? '○'
        : s.status === 'archived' ? '▣'
        : s.status === 'learning' ? '◐'
        : '□';
      const flags: string[] = [];
      if (s.interviews > 0) flags.push(`인터뷰 ${s.interviews}(✓${s.interviewsFinalized}${s.interviewsPending ? ` ⏳${s.interviewsPending}` : ''})`);
      if (s.reviewPending > 0) flags.push(`⚠검토대기 ${s.reviewPending}`);
      if (s.imported) flags.push(`import←${sanitisePromptLine(s.originSigner ?? '?', 40)}/${s.trustLevel}`);
      if (s.annotations > 0) flags.push(`⚠주석 ${s.annotations}`);
      if (s.status === 'draft' || s.status === 'paused') flags.push('미서명');
      lines.push(`  ${dot} ${s.slug.padEnd(16)} ${sanitisePromptLine(s.name, 20).padEnd(22)} ${flags.join(' · ') || '—'}`);
    }
    lines.push('');
    lines.push('상세: /afterglow inspect <slug>');
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}
