import { z } from 'zod';
import {
  assertInitialized,
  agentExists,
  readInterviewIndex,
  readProvenance,
  readRegistry,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine } from '../sanitize.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const slackShape = {
  action: z
    .enum(['test', 'digest', 'share'])
    .describe('test(연결 확인) | digest(전체 상태 요약 전송) | share(특정 에이전트 요약 전송).'),
  slug: z.string().optional().describe('share 시 대상 에이전트.'),
  message: z.string().max(2_000).optional().describe('test 시 함께 보낼 메모(선택).'),
  webhook: z
    .string()
    .max(2_000)
    .optional()
    .describe('Slack Incoming Webhook URL. 생략 시 env AFTERGLOW_SLACK_WEBHOOK 사용.'),
} as const;

interface SlackArgs {
  action: 'test' | 'digest' | 'share';
  slug?: string;
  message?: string;
  webhook?: string;
}

function resolveWebhook(arg?: string): string | null {
  const url = arg || process.env.AFTERGLOW_SLACK_WEBHOOK || '';
  return /^https?:\/\//.test(url) ? url : null;
}

async function postToSlack(url: string, text: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ text }),
    });
    if (!res.ok) return { ok: false, reason: `HTTP ${res.status}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, reason: (e as Error).message };
  }
}

/**
 * Post Afterglow updates to a Slack channel via an Incoming Webhook. Useful for
 * a team channel that should see handover-readiness at a glance (digest) or a
 * heads-up when a colleague's agent gets new interview content (share).
 *
 * The webhook URL is user-supplied (their channel); we POST `{text}` mrkdwn.
 */
export async function runSlack(args: SlackArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    const url = resolveWebhook(args.webhook);
    if (!url) {
      return errorReply(
        'Slack webhook 이 설정되지 않았습니다. AFTERGLOW_SLACK_WEBHOOK 환경변수에 Incoming Webhook URL 을 넣거나 --webhook 으로 전달하세요. ' +
          '(Slack → Apps → Incoming Webhooks 에서 채널별 URL 생성)',
      );
    }

    let text: string;
    if (args.action === 'test') {
      text = `✦ Afterglow 연결 테스트${args.message ? ` — ${sanitisePromptLine(args.message, 500)}` : ''}`;
    } else if (args.action === 'digest') {
      text = await buildDigest();
    } else {
      if (!args.slug) return errorReply('share 에는 slug 가 필요합니다.');
      if (!(await agentExists(args.slug))) return errorReply(`에이전트를 찾을 수 없습니다: ${sanitisePromptLine(args.slug, 64)}.`);
      text = await buildShare(args.slug);
    }

    const r = await postToSlack(url, text);
    await auditAppend({
      tool: 'afterglow_slack',
      slug: args.slug,
      summary: `slack ${args.action} · ${r.ok ? 'sent' : 'failed'}`,
      meta: { action: args.action, ok: r.ok },
    });
    if (!r.ok) return errorReply(`Slack 전송 실패: ${sanitisePromptLine(r.reason, 200)}`);
    return { content: [{ type: 'text', text: `✓ Slack 전송 완료 (${args.action}).` }] };
  });
}

async function buildDigest(): Promise<string> {
  const reg = await readRegistry();
  if (reg.agents.length === 0) return '*Afterglow 상태 요약*\n등록된 에이전트가 없습니다.';
  const rows: string[] = [];
  let totalInterviews = 0;
  for (const a of reg.agents) {
    const idx = await readInterviewIndex(a.slug);
    totalInterviews += idx.sessions.length;
    const flags: string[] = [a.status];
    if (idx.sessions.length) flags.push(`인터뷰 ${idx.sessions.length}`);
    const prov = await readProvenance(a.slug);
    if (prov?.imported) flags.push(`import←${sanitisePromptLine(prov.origin.signer ?? '?', 40)}`);
    if (a.status === 'draft' || a.status === 'paused') flags.push('미서명');
    rows.push(`• *${sanitisePromptLine(a.name, 40)}* (${a.slug}) — ${flags.join(' · ')}`);
  }
  const active = reg.agents.filter((a) => a.status === 'active').length;
  const header = `*Afterglow 상태 요약*\n에이전트 ${reg.agents.length} · active ${active} · 인터뷰 ${totalInterviews}`;
  return [header, '', ...rows].slice(0, 60).join('\n');
}

async function buildShare(slug: string): Promise<string> {
  const reg = await readRegistry();
  const entry = reg.agents.find((a) => a.slug === slug);
  const idx = await readInterviewIndex(slug);
  const prov = await readProvenance(slug);
  const finalized = idx.sessions.filter((s) => s.status === 'finalized').length;
  const lines = [
    `*Afterglow · ${sanitisePromptLine(entry?.name ?? slug, 40)}* (${slug})`,
    `상태: ${entry?.status ?? '?'} · 인터뷰 ${idx.sessions.length}회차(완료 ${finalized})`,
  ];
  if (prov?.imported) {
    lines.push(`출처: import ← ${sanitisePromptLine(prov.origin.signer ?? '?', 40)} · 신뢰도 ${prov.trustLevel}`);
  }
  const recent = idx.sessions.slice(-3).map((s) => `  - #${s.sessionId} ${sanitisePromptLine(s.title, 60)} [${s.status}]`);
  if (recent.length) {
    lines.push('최근 회차:');
    lines.push(...recent);
  }
  return lines.join('\n');
}
