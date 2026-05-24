import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  assertInitialized,
  agentDir,
  knowledgeDir,
  readInterviewIndex,
  readPersona,
  readProvenance,
} from '../storage.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { append as auditAppend } from '../audit.js';
import { sanitisePromptLine, sanitisePromptText } from '../sanitize.js';
import { elicitMissing, slugCandidates } from './elicit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const inspectShape = {
  slug: z.string().min(1).optional().describe('(필수) 확인할 에이전트의 slug. 생략 시 안내합니다.'),
  json: z.boolean().optional().describe('JSON으로 출력.'),
} as const;

interface InspectArgs {
  slug: string;
  json?: boolean;
}

export async function runInspect(args: InspectArgs): Promise<ToolReply> {
  return safe(async () => {
  await assertInitialized();
  const ask = await elicitMissing('inspect', args as unknown as Record<string, unknown>, [
    { name: 'slug', required: true, label: '상세를 볼 에이전트', candidates: slugCandidates, example: 'jiyoon' },
  ]);
  if (ask) return ask;
  if (!(await agentExists(args.slug))) {
    return errorReply(new AgentNotFoundError(args.slug).message);
  }
  await auditAppend({
    tool: 'afterglow_inspect',
    slug: args.slug,
    summary: `inspect${args.json ? ' --json' : ''}`,
    meta: { json: !!args.json },
  });
  const persona = await readPersona(args.slug);
  // Pull the live status from registry so the user can see active/paused/draft/archived
  // without a second `list` call.
  const { getStatus } = await import('../storage.js');
  let status = 'unknown';
  try {
    status = await getStatus(args.slug);
  } catch {
    /* very unlikely — readPersona already proved the agent exists */
  }

  // Count knowledge files (1-level shallow + recursive)
  let knowledgeCount = 0;
  try {
    const files = await walkFiles(knowledgeDir(args.slug));
    knowledgeCount = files.length;
  } catch {
    /* ignore */
  }

  // Interviews + provenance — surfaced here so a single `inspect` shows the
  // agent's full management state (rounds, transfer origin) without extra calls.
  const interviewIndex = await readInterviewIndex(args.slug);
  const provenance = await readProvenance(args.slug);

  if (args.json) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            {
              persona,
              status,
              knowledgeFileCount: knowledgeCount,
              interviews: interviewIndex.sessions,
              provenance,
              folder: agentDir(args.slug),
            },
            null,
            2,
          ),
        },
      ],
    };
  }

  const tone = persona.tone;
  const bar = (v: number) => {
    const filled = Math.round((v / 100) * 20);
    return '█'.repeat(filled) + '░'.repeat(20 - filled);
  };

  const statusDot =
    status === 'active' ? '● active'
    : status === 'paused' ? '○ paused'
    : status === 'archived' ? '▣ archived'
    : status === 'learning' ? '◐ learning'
    : '□ draft';
  // Sanitise every user-controlled field before emitting. An orchestrator
  // Claude that calls `inspect` to verify an agent before delegating to it
  // would otherwise read attacker-controlled markdown from persona.json
  // directly into its own context. Same defense-in-depth story as ask /
  // council — the rendered output is data, not instructions.
  const safeName = sanitisePromptLine(persona.name, 200);
  const safeRole = sanitisePromptLine(persona.role, 200);
  const safeTenure = persona.tenure ? sanitisePromptLine(persona.tenure, 200) : '';
  const safeBio = persona.bio ? sanitisePromptText(persona.bio, 20_000) : '';
  const lines: string[] = [];
  lines.push(`╭─ ${persona.slug}  ──  ${safeName} (✦)  ${statusDot} ${'─'.repeat(Math.max(2, 18))}╮`);
  lines.push(`   ${safeRole}`);
  if (safeTenure) lines.push(`   재직 기간   ${safeTenure}`);
  if (safeBio) lines.push(`   소개        ${safeBio}`);
  lines.push(`   상태        ${statusDot}`);
  lines.push('');
  lines.push(`   ├─ 톤 ${'─'.repeat(56)}┤`);
  lines.push(`   존댓말  ${bar(tone.honorific)}  ${tone.honorific}%`);
  lines.push(`   온도    ${bar(tone.warmth)}  ${tone.warmth}%`);
  lines.push(`   유머    ${bar(tone.humor)}  ${tone.humor}%`);
  lines.push(`   길이    ${bar(tone.verbosity)}  ${tone.verbosity}%`);
  lines.push(`   확신    ${bar(tone.certainty)}  ${tone.certainty}%`);
  lines.push('');
  lines.push(`   ├─ 영역 ${'─'.repeat(54)}┤`);
  lines.push(
    `   ${persona.expertise.length > 0 ? persona.expertise.join(' · ') : '(아직 지정되지 않음)'}`,
  );
  lines.push('');
  lines.push(`   ├─ 자료 ${'─'.repeat(54)}┤`);
  if (persona.sources.length === 0) {
    lines.push(`   (자료 없음 — /afterglow edit ${persona.slug} --add-source <path>)`);
  } else {
    for (const s of persona.sources) {
      lines.push(`   • [${s.kind}] ${sanitisePromptLine(s.label ?? s.location, 500)}`);
    }
  }
  lines.push(`   knowledge/ 파일 ${knowledgeCount}개`);
  lines.push('');
  lines.push(`   ├─ MCP 권한 ${'─'.repeat(50)}┤`);
  const safeAllow = persona.mcpAllow.map((m) => sanitisePromptLine(m, 200)).filter((m) => m.length > 0);
  const safeDeny = persona.mcpDeny.map((m) => sanitisePromptLine(m, 200)).filter((m) => m.length > 0);
  lines.push(`   허용: ${safeAllow.join(', ') || '(없음)'}`);
  if (safeDeny.length > 0) lines.push(`   거부: ${safeDeny.join(', ')}`);
  lines.push('');
  lines.push(`   ├─ 인터뷰 ${'─'.repeat(52)}┤`);
  if (interviewIndex.sessions.length === 0) {
    lines.push(`   (없음 — /afterglow interview ${persona.slug} --action start …)`);
  } else {
    const fin = interviewIndex.sessions.filter((s) => s.status === 'finalized').length;
    const pend = interviewIndex.sessions.filter((s) => s.status === 'pending-confirmation').length;
    const open = interviewIndex.sessions.filter((s) => s.status === 'open').length;
    lines.push(`   회차 ${interviewIndex.sessions.length} (finalized ${fin}${pend ? ` · pending ${pend}` : ''}${open ? ` · open ${open}` : ''})`);
    for (const s of interviewIndex.sessions.slice(0, 8)) {
      const mark =
        s.status === 'finalized' ? '✓' : s.status === 'pending-confirmation' ? '⏳' : s.status === 'aborted' ? '✗' : '·';
      const kindTag = s.kind === 'annotation' ? ' ⚠annotation' : '';
      lines.push(`   ${mark} #${s.sessionId}  ${sanitisePromptLine(s.title, 60)}${kindTag}`);
    }
  }
  if (provenance?.imported) {
    lines.push('');
    lines.push(`   ├─ 출처 (import) ${'─'.repeat(46)}┤`);
    lines.push(`   원 서명자: ${sanitisePromptLine(provenance.origin.signer ?? '(미상)', 200)} · 신뢰도: ${provenance.trustLevel}`);
    if (provenance.importedBy) lines.push(`   받은 사람: ${sanitisePromptLine(provenance.importedBy, 200)}`);
    const annot = provenance.postImportActivity.filter((a) => a.type === 'annotation').length;
    if (annot > 0) lines.push(`   ⚠ 인계자 주석 ${annot}건 포함 (본인 미확인)`);
  }
  lines.push('');
  lines.push(`   ├─ 폴더 ${'─'.repeat(54)}┤`);
  lines.push(`   ${agentDir(persona.slug)}`);
  lines.push(`   생성 ${persona.createdAt}`);
  lines.push(`   수정 ${persona.updatedAt}`);
  lines.push(`╰${'─'.repeat(64)}╯`);

  return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

async function walkFiles(dir: string): Promise<string[]> {
  let entries: { name: string; isDirectory: () => boolean; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as typeof entries;
  } catch {
    return [];
  }
  const out: string[] = [];
  for (const e of entries) {
    const full = join(dir, e.name);
    if (e.isDirectory()) out.push(...(await walkFiles(full)));
    else if (e.isFile()) out.push(full);
  }
  return out;
}
