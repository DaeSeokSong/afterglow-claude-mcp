import { z } from 'zod';
import {
  agentExists,
  AgentNotFoundError,
  appendHistory,
  assertInitialized,
  readPersona,
  writePersona,
  writeSystemPrompt,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import {
  ExpertiseSchema,
  PersonaSchema,
  renderSystemPrompt,
  type Expertise,
  type Persona,
  type Source,
  type Tone,
} from '../persona.js';
import { errorReply, safe, type ToolReply } from './types.js';

const TonePatchSchema = z
  .object({
    honorific: z.number().int().min(0).max(100).optional(),
    warmth: z.number().int().min(0).max(100).optional(),
    humor: z.number().int().min(0).max(100).optional(),
    verbosity: z.number().int().min(0).max(100).optional(),
    certainty: z.number().int().min(0).max(100).optional(),
  })
  .strict();

const AddSourceSchema = z
  .object({
    location: z.string().min(1),
    kind: z.enum(['file', 'folder', 'url']).optional(),
    label: z.string().optional(),
  })
  .strict();

export const editShape = {
  slug: z.string().min(1).describe('수정할 에이전트 slug.'),

  /* 기본 정보 */
  name: z.string().min(1).optional().describe('이름 변경.'),
  role: z.string().min(1).optional().describe('직무 / 부서 변경.'),
  tenure: z.string().optional().describe('재직 기간 변경. 빈 문자열 → 제거.'),
  bio: z.string().optional().describe('한 줄 소개 변경. 빈 문자열 → 제거.'),

  /* 영역 */
  addExpertise: z.array(ExpertiseSchema).optional().describe('자신있는 영역 추가.'),
  removeExpertise: z.array(ExpertiseSchema).optional().describe('자신있는 영역 제거.'),

  /* 톤 */
  tone: TonePatchSchema.optional().describe('톤 슬라이더 부분 patch (0–100).'),

  /* 자료 */
  addSources: z.array(AddSourceSchema).optional().describe('자료 추가.'),
  removeSourceIds: z.array(z.string()).optional().describe('자료 id로 제거.'),

  /* MCP 권한 */
  mcpAllowAdd: z.array(z.string()).optional(),
  mcpAllowRemove: z.array(z.string()).optional(),
  mcpDenyAdd: z.array(z.string()).optional(),
  mcpDenyRemove: z.array(z.string()).optional(),

  /* 신뢰도 */
  confidenceFloor: z.number().int().min(0).max(100).optional(),
  peerAskThreshold: z.number().int().min(0).max(100).optional(),

  /** Dry-run: 변경사항만 보여주고 저장 안 함. */
  dryRun: z.boolean().optional(),
} as const;

interface EditArgs {
  slug: string;
  name?: string;
  role?: string;
  tenure?: string;
  bio?: string;
  addExpertise?: Expertise[];
  removeExpertise?: Expertise[];
  tone?: Partial<Tone>;
  addSources?: { location: string; kind?: Source['kind']; label?: string }[];
  removeSourceIds?: string[];
  mcpAllowAdd?: string[];
  mcpAllowRemove?: string[];
  mcpDenyAdd?: string[];
  mcpDenyRemove?: string[];
  confidenceFloor?: number;
  peerAskThreshold?: number;
  dryRun?: boolean;
}

function uniq<T>(xs: T[]): T[] {
  return Array.from(new Set(xs));
}

function detectKind(location: string): Source['kind'] {
  if (/^https?:\/\//.test(location)) return 'url';
  if (location.endsWith('/') || location.endsWith('\\')) return 'folder';
  return 'file';
}

function nextSourceId(existing: Source[]): (prefix: string) => string {
  const used = new Set(existing.map((s) => s.id));
  return (prefix) => {
    for (let i = existing.length + 1; i < existing.length + 100; i++) {
      const id = `${prefix}-${i}`;
      if (!used.has(id)) {
        used.add(id);
        return id;
      }
    }
    // fallback — extremely unlikely
    return `${prefix}-${Date.now()}`;
  };
}

interface Change {
  field: string;
  before: unknown;
  after: unknown;
}

export async function runEdit(args: EditArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    if (!(await agentExists(args.slug))) {
      return errorReply(new AgentNotFoundError(args.slug).message);
    }

    const current = await readPersona(args.slug);
    const next: Persona = JSON.parse(JSON.stringify(current)) as Persona;
    const changes: Change[] = [];

    if (args.name !== undefined && args.name !== current.name) {
      next.name = args.name;
      changes.push({ field: 'name', before: current.name, after: args.name });
    }
    if (args.role !== undefined && args.role !== current.role) {
      next.role = args.role;
      changes.push({ field: 'role', before: current.role, after: args.role });
    }
    if (args.tenure !== undefined) {
      const trimmed = args.tenure.trim();
      const after = trimmed.length === 0 ? undefined : trimmed;
      if (after !== current.tenure) {
        next.tenure = after;
        changes.push({ field: 'tenure', before: current.tenure ?? null, after: after ?? null });
      }
    }
    if (args.bio !== undefined) {
      const trimmed = args.bio.trim();
      const after = trimmed.length === 0 ? undefined : trimmed;
      if (after !== current.bio) {
        next.bio = after;
        changes.push({ field: 'bio', before: current.bio ?? null, after: after ?? null });
      }
    }

    if (args.addExpertise && args.addExpertise.length > 0) {
      const beforeArr = [...next.expertise];
      next.expertise = uniq([...next.expertise, ...args.addExpertise]);
      if (next.expertise.length !== beforeArr.length) {
        changes.push({ field: 'expertise(+)', before: beforeArr, after: next.expertise });
      }
    }
    if (args.removeExpertise && args.removeExpertise.length > 0) {
      const beforeArr = [...next.expertise];
      const toRemove = new Set<Expertise>(args.removeExpertise);
      next.expertise = next.expertise.filter((e) => !toRemove.has(e));
      if (next.expertise.length !== beforeArr.length) {
        changes.push({ field: 'expertise(-)', before: beforeArr, after: next.expertise });
      }
    }

    if (args.tone) {
      const before = { ...next.tone };
      next.tone = { ...next.tone, ...args.tone };
      const touched = (Object.entries(args.tone) as [keyof Tone, number | undefined][])
        .filter(([k, v]) => v !== undefined && before[k] !== v)
        .map(([k]) => k);
      if (touched.length > 0) {
        changes.push({ field: `tone(${touched.join(',')})`, before, after: next.tone });
      }
    }

    if (args.addSources && args.addSources.length > 0) {
      const beforeArr = [...next.sources];
      const allocate = nextSourceId(next.sources);
      const added: Source[] = args.addSources.map((s) => ({
        id: allocate('src'),
        location: s.location,
        kind: s.kind ?? detectKind(s.location),
        label: s.label,
      }));
      next.sources = [...next.sources, ...added];
      changes.push({ field: 'sources(+)', before: beforeArr.length, after: next.sources.length });
    }
    if (args.removeSourceIds && args.removeSourceIds.length > 0) {
      const beforeArr = [...next.sources];
      const remove = new Set(args.removeSourceIds);
      next.sources = next.sources.filter((s) => !remove.has(s.id));
      if (next.sources.length !== beforeArr.length) {
        changes.push({ field: 'sources(-)', before: beforeArr.length, after: next.sources.length });
      }
    }

    if (args.mcpAllowAdd && args.mcpAllowAdd.length > 0) {
      const before = [...next.mcpAllow];
      next.mcpAllow = uniq([...next.mcpAllow, ...args.mcpAllowAdd]);
      if (next.mcpAllow.length !== before.length) {
        changes.push({ field: 'mcpAllow(+)', before, after: next.mcpAllow });
      }
    }
    if (args.mcpAllowRemove && args.mcpAllowRemove.length > 0) {
      const before = [...next.mcpAllow];
      const remove = new Set(args.mcpAllowRemove);
      next.mcpAllow = next.mcpAllow.filter((m) => !remove.has(m));
      if (next.mcpAllow.length !== before.length) {
        changes.push({ field: 'mcpAllow(-)', before, after: next.mcpAllow });
      }
    }
    if (args.mcpDenyAdd && args.mcpDenyAdd.length > 0) {
      const before = [...next.mcpDeny];
      next.mcpDeny = uniq([...next.mcpDeny, ...args.mcpDenyAdd]);
      if (next.mcpDeny.length !== before.length) {
        changes.push({ field: 'mcpDeny(+)', before, after: next.mcpDeny });
      }
    }
    if (args.mcpDenyRemove && args.mcpDenyRemove.length > 0) {
      const before = [...next.mcpDeny];
      const remove = new Set(args.mcpDenyRemove);
      next.mcpDeny = next.mcpDeny.filter((m) => !remove.has(m));
      if (next.mcpDeny.length !== before.length) {
        changes.push({ field: 'mcpDeny(-)', before, after: next.mcpDeny });
      }
    }

    if (
      args.confidenceFloor !== undefined &&
      args.confidenceFloor !== current.confidenceFloor
    ) {
      next.confidenceFloor = args.confidenceFloor;
      changes.push({
        field: 'confidenceFloor',
        before: current.confidenceFloor,
        after: args.confidenceFloor,
      });
    }
    if (
      args.peerAskThreshold !== undefined &&
      args.peerAskThreshold !== current.peerAskThreshold
    ) {
      next.peerAskThreshold = args.peerAskThreshold;
      changes.push({
        field: 'peerAskThreshold',
        before: current.peerAskThreshold,
        after: args.peerAskThreshold,
      });
    }

    if (changes.length === 0) {
      return {
        content: [
          { type: 'text', text: `(변경 없음) ${args.slug} persona.json 그대로.` },
        ],
      };
    }

    next.updatedAt = new Date().toISOString();
    const parsed = PersonaSchema.safeParse(next);
    if (!parsed.success) {
      return errorReply(
        `persona 검증 실패: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
      );
    }

    const lines: string[] = [];
    lines.push(`${args.dryRun ? '[dry-run] ' : ''}변경 사항 (${changes.length})`);
    for (const c of changes) {
      lines.push(`  • ${c.field}`);
      lines.push(`    before: ${shortJson(c.before)}`);
      lines.push(`    after:  ${shortJson(c.after)}`);
    }

    if (!args.dryRun) {
      await writePersona(args.slug, parsed.data);
      await writeSystemPrompt(args.slug, renderSystemPrompt(parsed.data));
      await appendHistory(args.slug, `edit (${changes.length} field${changes.length > 1 ? 's' : ''})`);
      await auditAppend({
        tool: 'afterglow_edit',
        slug: args.slug,
        summary: `${changes.length} fields changed`,
        meta: { fields: changes.map((c) => c.field) },
      });
      lines.push('');
      lines.push('✓ persona.json 저장 + system-prompt.md 재생성 + history.log 기록');
    }
    return { content: [{ type: 'text', text: lines.join('\n') }] };
  });
}

function shortJson(v: unknown): string {
  const s = JSON.stringify(v);
  if (s == null) return String(v);
  return s.length > 120 ? s.slice(0, 117) + '…' : s;
}
