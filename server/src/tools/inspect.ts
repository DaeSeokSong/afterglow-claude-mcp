import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  assertInitialized,
  agentDir,
  knowledgeDir,
  readPersona,
} from '../storage.js';
import { promises as fs } from 'node:fs';
import { join } from 'node:path';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const inspectShape = {
  slug: z.string().min(1).describe('확인할 에이전트의 slug.'),
  json: z.boolean().optional().describe('JSON으로 출력.'),
} as const;

interface InspectArgs {
  slug: string;
  json?: boolean;
}

export async function runInspect(args: InspectArgs): Promise<ToolReply> {
  return safe(async () => {
  await assertInitialized();
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

  // Count knowledge files (1-level shallow + recursive)
  let knowledgeCount = 0;
  try {
    const files = await walkFiles(knowledgeDir(args.slug));
    knowledgeCount = files.length;
  } catch {
    /* ignore */
  }

  if (args.json) {
    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(
            { persona, knowledgeFileCount: knowledgeCount, folder: agentDir(args.slug) },
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

  const lines: string[] = [];
  lines.push(`╭─ ${persona.slug}  ──  ${persona.name} (✦) ${'─'.repeat(28)}╮`);
  lines.push(`   ${persona.role}`);
  if (persona.tenure) lines.push(`   재직 기간   ${persona.tenure}`);
  if (persona.bio) lines.push(`   소개        ${persona.bio}`);
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
      lines.push(`   • [${s.kind}] ${s.label ?? s.location}`);
    }
  }
  lines.push(`   knowledge/ 파일 ${knowledgeCount}개`);
  lines.push('');
  lines.push(`   ├─ MCP 권한 ${'─'.repeat(50)}┤`);
  lines.push(`   허용: ${persona.mcpAllow.join(', ') || '(없음)'}`);
  if (persona.mcpDeny.length > 0) lines.push(`   거부: ${persona.mcpDeny.join(', ')}`);
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
