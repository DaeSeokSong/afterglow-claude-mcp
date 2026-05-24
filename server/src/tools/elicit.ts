/**
 * Missing-argument elicitation — turn a terse "X is required" failure into a
 * guided reply that lists each missing **required** arg with numbered candidate
 * values (+ a "직접 입력" escape) and the relevant **optional** args, each
 * tagged `[필수]` / `[선택]`. Claude Code surfaces this as choices so the user
 * can pick 1·2·3 … or type their own — instead of guessing or erroring out.
 *
 * Generic + data-driven: each tool passes an `ElicitArg[]` describing its entry
 * arguments (and, for action-style tools, can vary the spec by `action`).
 */
import { readRegistry } from '../storage.js';
import { sanitisePromptLine } from '../sanitize.js';
import type { ToolReply } from './types.js';

export interface ElicitCandidate {
  value: string;
  note?: string;
}

export interface ElicitArg {
  name: string;
  required: boolean;
  /** human description of what the arg is */
  label: string;
  /** example value for a free-text arg → rendered as "직접 입력 (예: …)" */
  example?: string;
  /** fixed choice set (e.g. an action enum) */
  enumValues?: readonly string[];
  /** dynamic candidate provider (e.g. existing agent slugs) */
  candidates?: () => Promise<ElicitCandidate[]> | ElicitCandidate[];
}

function isEmpty(v: unknown): boolean {
  if (v === undefined || v === null) return true;
  if (typeof v === 'string') return v.trim().length === 0;
  if (Array.isArray(v)) return v.length === 0;
  return false;
}

/** Shared candidate provider: existing agents (slug + name/role/status note). */
export async function slugCandidates(): Promise<ElicitCandidate[]> {
  try {
    const reg = await readRegistry();
    return reg.agents.map((a) => ({
      value: a.slug,
      note: `${sanitisePromptLine(a.name, 24)} · ${sanitisePromptLine(a.role, 24)}${a.status !== 'active' ? ` · ${a.status}` : ''}`,
    }));
  } catch {
    return [];
  }
}

/**
 * Returns a guided ToolReply when any required arg is missing, else `null`
 * (caller proceeds). The reply is `isError: true` (the call did not run) but
 * its body is help, not a stack trace.
 */
export async function elicitMissing(
  tool: string,
  args: Record<string, unknown>,
  spec: ElicitArg[],
): Promise<ToolReply | null> {
  const missing = spec.filter((a) => a.required && isEmpty(args[a.name]));
  if (missing.length === 0) return null;

  const lines: string[] = [];
  lines.push(`✦ ${tool} — 정보가 더 필요해요. 아래를 채우면 실행할게요.`);
  lines.push('');
  for (const a of missing) {
    lines.push(`[필수] ${a.name} — ${a.label}`);
    await renderChoices(lines, a);
  }

  const optional = spec.filter((a) => !a.required && isEmpty(args[a.name]));
  if (optional.length > 0) {
    lines.push('');
    lines.push(`[선택] ${optional.map((a) => `${a.name}(${a.label})`).join(' · ')}`);
  }

  lines.push('');
  lines.push('번호를 고르거나 값을 직접 알려주시면 실행할게요.');
  lines.push(
    '<!-- Claude: 위 [필수] 인자를 사용자에게 번호 선택지로 물어보고(목록에 없으면 "직접 입력"으로 받기) 값이 모이면 이 도구를 다시 호출하세요. 임의로 값을 지어내지 마세요. -->',
  );
  return { content: [{ type: 'text', text: lines.join('\n') }], isError: true };
}

async function renderChoices(lines: string[], a: ElicitArg): Promise<void> {
  let n = 1;
  if (a.enumValues && a.enumValues.length > 0) {
    for (const v of a.enumValues) lines.push(`   ${n++}) ${v}`);
    return;
  }
  if (a.candidates) {
    let cands: ElicitCandidate[] = [];
    try {
      cands = await a.candidates();
    } catch {
      cands = [];
    }
    if (cands.length > 0) {
      for (const c of cands.slice(0, 9)) {
        lines.push(`   ${n++}) ${sanitisePromptLine(c.value, 64)}${c.note ? `   (${c.note})` : ''}`);
      }
      lines.push(`   ${n}) 직접 입력${a.example ? ` (예: ${a.example})` : ''}`);
      return;
    }
    lines.push(`   → 직접 입력${a.example ? ` (예: ${a.example})` : ' (값 입력)'}  · (아직 등록된 항목이 없어요)`);
    return;
  }
  lines.push(`   → 직접 입력${a.example ? ` (예: ${a.example})` : ' (값 입력)'}`);
}
