import { z } from 'zod';
import {
  agentDir,
  agentExists,
  appendHistory,
  assertInitialized,
  assertValidSlug,
  AgentExistsError,
  createAgentSkeleton,
  upsertRegistryEntry,
  writePersona,
  writeSystemPrompt,
  consentPath,
} from '../storage.js';
import { promises as fs } from 'node:fs';
import {
  buildPersona,
  ExpertiseSchema,
  type PersonaSeed,
  renderSystemPrompt,
} from '../persona.js';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const createShape = {
  slug: z
    .string()
    .min(1)
    .max(32)
    .describe('짧은 식별자. 소문자/숫자/하이픈. 예: jiyoon, jaehoon, john-kim.'),
  name: z.string().min(1).describe('실제 이름. 예: 이지윤.'),
  role: z.string().min(1).describe('직무 / 부서. 예: 프로덕트 디자이너 · Product팀.'),
  tenure: z.string().optional().describe('재직 기간. 예: 2019.03 – 2025.11.'),
  bio: z.string().optional().describe('한 줄 소개.'),
  expertise: z
    .array(ExpertiseSchema)
    .optional()
    .describe('자신있는 카테고리(다중). 디자인/개발/연구/사업화/영업/마케팅/운영/인사/법무/재무/데이터.'),
  sources: z
    .array(z.string())
    .optional()
    .describe('학습 자료의 파일 경로 또는 URL 목록.'),
  mcpAllow: z
    .array(z.string())
    .optional()
    .describe('이 에이전트가 호출할 수 있는 MCP. 기본 [filesystem].'),
  mcpDeny: z.array(z.string()).optional().describe('명시적으로 거부할 MCP.'),
} as const;

export interface CreateArgs {
  slug: string;
  name: string;
  role: string;
  tenure?: string;
  bio?: string;
  expertise?: PersonaSeed['expertise'];
  sources?: string[];
  mcpAllow?: string[];
  mcpDeny?: string[];
}

export async function runCreate(args: CreateArgs): Promise<ToolReply> {
  return safe(async () => {
  await assertInitialized();
  try {
    assertValidSlug(args.slug);
  } catch (e) {
    return errorReply((e as Error).message);
  }
  if (await agentExists(args.slug)) {
    return errorReply(new AgentExistsError(args.slug).message);
  }

  const created = await createAgentSkeleton(args.slug);
  const sources =
    args.sources?.map((loc, i) => ({
      id: `src-${i + 1}`,
      location: loc,
      kind: detectKind(loc),
    })) ?? [];

  const persona = buildPersona({
    slug: args.slug,
    name: args.name,
    role: args.role,
    tenure: args.tenure,
    bio: args.bio,
    expertise: args.expertise,
    sources,
    mcpAllow: args.mcpAllow,
    mcpDeny: args.mcpDeny,
  });
  await writePersona(args.slug, persona);
  await writeSystemPrompt(args.slug, renderSystemPrompt(persona));
  await fs.writeFile(
    consentPath(args.slug),
    `# 동의서 — ${persona.name}\n\n` +
      `에이전트 slug: ${persona.slug}\n` +
      `생성 시각: ${persona.createdAt}\n\n` +
      `본인 서명을 받기 전에는 active 상태로 전환되지 않습니다.\n`,
    'utf8',
  );
  await appendHistory(args.slug, `created agent (${persona.name}, ${persona.role})`);

  await upsertRegistryEntry({
    slug: persona.slug,
    name: persona.name,
    role: persona.role,
    status: 'draft',
    createdAt: persona.createdAt,
    trainedAt: null,
  });

  const lines: string[] = [];
  lines.push(`✦ 에이전트 폴더 생성: ${agentDir(args.slug)}`);
  for (const p of created) lines.push(`  · ${p}`);
  lines.push(`  · persona.json`);
  lines.push(`  · system-prompt.md`);
  lines.push(`  · consent.md`);
  lines.push('');
  lines.push(`상태: draft (동의서 서명 전 — ask 호출은 거부됩니다)`);
  lines.push('');
  lines.push('다음 단계:');
  lines.push(`  · /afterglow inspect ${args.slug}     — 생성된 페르소나 확인`);
  lines.push(
    `  · /afterglow sign ${args.slug} --signer "이름"   — active 전환 (ask 가능)`,
  );
  lines.push(
    `  · /afterglow ask ${args.slug} "..."    — 서명 후 첫 질문`,
  );
  await auditAppend({
    tool: 'afterglow_create',
    slug: args.slug,
    summary: `created (${persona.name}, ${persona.role})`,
    meta: {
      expertise: persona.expertise,
      sources: persona.sources.length,
      mcpAllow: persona.mcpAllow,
    },
  });
  return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

function detectKind(location: string): 'file' | 'folder' | 'url' {
  if (/^https?:\/\//.test(location)) return 'url';
  if (location.endsWith('/') || location.endsWith('\\')) return 'folder';
  return 'file';
}
