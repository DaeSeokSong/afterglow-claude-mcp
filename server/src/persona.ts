import { z } from 'zod';

/**
 * Persona — the on-disk identity of one agent.
 *
 * This file owns the schema (Zod) and the helper that derives a system prompt
 * from a persona. Storing the schema centrally means /create, /edit and /inspect
 * all reject the same malformed shapes the same way.
 */

export const ExpertiseSchema = z.enum([
  '디자인',
  '개발',
  '연구',
  '사업화',
  '영업',
  '마케팅',
  '운영',
  '인사',
  '법무',
  '재무',
  '데이터',
]);
export type Expertise = z.infer<typeof ExpertiseSchema>;

export const ToneSchema = z
  .object({
    /** 존댓말 (0=반말, 100=존댓말) */
    honorific: z.number().int().min(0).max(100),
    /** 온도/온화함 (0=쌀쌀맞음, 100=다정함) */
    warmth: z.number().int().min(0).max(100),
    /** 유머 */
    humor: z.number().int().min(0).max(100),
    /** 답변 길이 선호 */
    verbosity: z.number().int().min(0).max(100),
    /** 확신도 표현 (0=조심스러움, 100=단정적) */
    certainty: z.number().int().min(0).max(100),
  })
  .strict();
export type Tone = z.infer<typeof ToneSchema>;

export const SourceSchema = z
  .object({
    /** stable id (slugified path or url) */
    id: z.string().min(1),
    /** original path / URL */
    location: z.string().min(1),
    /** auto-detected kind */
    kind: z.enum(['file', 'folder', 'url']),
    /** human description */
    label: z.string().optional(),
  })
  .strict();
export type Source = z.infer<typeof SourceSchema>;

export const PersonaSchema = z
  .object({
    // Strict lowercase to match storage.ts SLUG_RE — preventing case-collision
    // smuggling on case-insensitive filesystems (Windows / macOS default APFS).
    // A snapshot or hand-edited persona with slug="Alice" must NOT load.
    slug: z.string().regex(/^[a-z0-9](?:[a-z0-9-]{0,30}[a-z0-9])?$/),
    name: z.string().min(1).max(200),
    role: z.string().min(1).max(200),
    tenure: z.string().min(1).max(200).optional(),
    bio: z.string().max(20_000).optional(),
    expertise: z.array(ExpertiseSchema).default([]),
    tone: ToneSchema.default({
      honorific: 80,
      warmth: 60,
      humor: 30,
      verbosity: 40,
      certainty: 60,
    }),
    confidenceFloor: z.number().int().min(0).max(100).default(50),
    /** Auto-trigger peer-ask when own confidence is below this. */
    peerAskThreshold: z.number().int().min(0).max(100).default(70),
    sources: z.array(SourceSchema).default([]),
    /** MCP allowlist (whitelist semantics). */
    mcpAllow: z.array(z.string()).default(['filesystem']),
    /** Explicit MCP deny list (overrides allow). */
    mcpDeny: z.array(z.string()).default([]),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .strict();

export type Persona = z.infer<typeof PersonaSchema>;

export interface PersonaSeed {
  slug: string;
  name: string;
  role: string;
  tenure?: string;
  bio?: string;
  expertise?: Expertise[];
  tone?: Partial<Tone>;
  sources?: Source[];
  mcpAllow?: string[];
  mcpDeny?: string[];
}

export function buildPersona(seed: PersonaSeed): Persona {
  const now = new Date().toISOString();
  const persona = PersonaSchema.parse({
    slug: seed.slug,
    name: seed.name,
    role: seed.role,
    tenure: seed.tenure,
    bio: seed.bio,
    expertise: seed.expertise ?? [],
    tone: {
      honorific: 80,
      warmth: 60,
      humor: 30,
      verbosity: 40,
      certainty: 60,
      ...seed.tone,
    },
    confidenceFloor: 50,
    peerAskThreshold: 70,
    sources: seed.sources ?? [],
    mcpAllow: seed.mcpAllow ?? ['filesystem'],
    mcpDeny: seed.mcpDeny ?? [],
    createdAt: now,
    updatedAt: now,
  });
  return persona;
}

/**
 * Render the persona as a Markdown system prompt that gets injected into
 * Claude's context every time the agent is asked.
 *
 * The output is designed to be readable by humans (so `--view-prompt` is
 * useful) AND parseable enough for prompt-engineering tools that scan
 * H1/H2 headers.
 */
export function renderSystemPrompt(persona: Persona): string {
  const tone = persona.tone;
  const toneLines = [
    `- 존댓말 ${tone.honorific}/100`,
    `- 온도 ${tone.warmth}/100`,
    `- 유머 ${tone.humor}/100`,
    `- 길이 ${tone.verbosity}/100`,
    `- 확신 ${tone.certainty}/100`,
  ].join('\n');

  const expertise =
    persona.expertise.length > 0 ? persona.expertise.join(' · ') : '(아직 지정되지 않음)';

  const sources =
    persona.sources.length > 0
      ? persona.sources
          .map((s) => `- ${s.label ?? s.location} (${s.kind})`)
          .join('\n')
      : '- (자료 없음 — knowledge/ 에 직접 추가하거나 /afterglow edit --add-source 사용)';

  return [
    `# 당신은 ${persona.name} 입니다`,
    '',
    `- 직무: ${persona.role}`,
    persona.tenure ? `- 재직 기간: ${persona.tenure}` : '',
    persona.bio ? `- 한 줄 소개: ${persona.bio}` : '',
    '',
    '## 톤',
    toneLines,
    '',
    '## 자신있는 영역',
    expertise,
    '',
    '## 답변 원칙',
    `- 신뢰도가 ${persona.confidenceFloor}% 이하면 솔직히 모른다고 말하세요. 추측 금지.`,
    `- 신뢰도가 ${persona.peerAskThreshold}% 이하면 더 잘 아는 동료 에이전트가 있는지 모더레이터에게 확인해주세요 (peer-ask).`,
    '- 매 답변에 ✦ 마크와 신뢰도, 사용한 자료(출처)를 함께 표시하세요.',
    '- 출처가 없는 추측은 하지 마세요.',
    '',
    '## 참고 자료',
    sources,
    '',
    '## 사용 가능한 MCP',
    persona.mcpAllow.length > 0 ? persona.mcpAllow.map((m) => `- ${m}`).join('\n') : '- (없음)',
    persona.mcpDeny.length > 0
      ? `\n## 명시 거부 MCP\n${persona.mcpDeny.map((m) => `- ${m}`).join('\n')}`
      : '',
  ]
    .filter((s) => s !== '')
    .join('\n');
}
