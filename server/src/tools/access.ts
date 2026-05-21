import { z } from 'zod';
import {
  appendHistory,
  assertInitialized,
  assertWritable,
  evaluateAccess,
  getStatus,
  readAccess,
  writeAccess,
} from '../storage.js';
import { append as auditAppend } from '../audit.js';
import { errorReply, safe, type ToolReply } from './types.js';

export const accessShape = {
  action: z
    .enum(['list', 'allow', 'deny', 'remove', 'set-default', 'check'])
    .describe('list | allow | deny | remove | set-default | check.'),
  slug: z.string().min(1).describe('대상 에이전트 slug.'),
  rule: z
    .string()
    .optional()
    .describe('allow/deny/remove 시 룰. 예: "user:ykhyun", "role:director", "team:design".'),
  defaultPolicy: z
    .enum(['allow', 'deny'])
    .optional()
    .describe('set-default 액션의 기본 정책 (allow 또는 deny).'),
  caller: z
    .string()
    .optional()
    .describe('check 액션의 호출자 (시뮬레이션용).'),
} as const;

interface AccessArgs {
  action: 'list' | 'allow' | 'deny' | 'remove' | 'set-default' | 'check';
  slug: string;
  rule?: string;
  defaultPolicy?: 'allow' | 'deny';
  caller?: string;
}

// Identifiers must be filesystem-safe and grep-friendly:
//   · ASCII letters, digits, `-`, `_`
//   · 1-64 chars
//   · must start with alnum (rejects leading `.` / `-` / etc.)
// We intentionally dropped `/` and `.` from the earlier pattern — those let a
// malicious caller smuggle path separators / hidden-file shapes into the
// audit log and tags.json keys.
const RULE_PATTERN = /^(user|role|team):[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

function validateRule(rule: string | undefined): string | null {
  if (!rule) return null;
  return RULE_PATTERN.test(rule.trim())
    ? null
    : `Invalid rule "${rule}". Expected "user:<id>", "role:<id>", or "team:<id>" (1-64 ASCII alnum / "-" / "_", starting with alnum).`;
}

export async function runAccess(args: AccessArgs): Promise<ToolReply> {
  return safe(async () => {
    await assertInitialized();
    try {
      await getStatus(args.slug); // registry-aware existence
    } catch (e) {
      return errorReply((e as Error).message);
    }
    // list + check are read-only. The other actions mutate access.json,
    // which has no meaning on an archived agent — block them.
    if (args.action !== 'list' && args.action !== 'check') {
      try {
        await assertWritable(args.slug);
      } catch (e) {
        return errorReply((e as Error).message);
      }
    }
    switch (args.action) {
      case 'list':
        return listAction(args.slug);
      case 'allow':
      case 'deny':
        return mutate(args.slug, args.action, args.rule);
      case 'remove':
        return remove(args.slug, args.rule);
      case 'set-default':
        return setDefault(args.slug, args.defaultPolicy);
      case 'check':
        return check(args.slug, args.caller);
    }
  });
}

async function listAction(slug: string): Promise<ToolReply> {
  const policy = await readAccess(slug);
  const lines: string[] = [];
  lines.push(`# access · ${slug}`);
  lines.push('');
  lines.push(`기본 정책:  ${policy.defaultPolicy}`);
  lines.push(`업데이트:    ${policy.updatedAt}`);
  lines.push('');
  lines.push(`## 허용 (${policy.allow.length})`);
  if (policy.allow.length === 0) lines.push('  (없음)');
  else for (const r of policy.allow) lines.push(`  ✓ ${r}`);
  lines.push('');
  lines.push(`## 거부 (${policy.deny.length})`);
  if (policy.deny.length === 0) lines.push('  (없음)');
  else for (const r of policy.deny) lines.push(`  ✗ ${r}`);
  lines.push('');
  lines.push('명령:');
  lines.push(`  · allow / deny / remove --rule "user:…|role:…|team:…"`);
  lines.push(`  · set-default --defaultPolicy allow|deny`);
  lines.push(`  · check --caller "user:…"   (실제 변경 없이 시뮬레이션)`);
  return { content: [{ type: 'text', text: lines.join('\n') }] };
}

async function mutate(slug: string, kind: 'allow' | 'deny', rule: string | undefined): Promise<ToolReply> {
  if (!rule) return errorReply(`${kind} 에는 rule 이 필요합니다.`);
  const invalid = validateRule(rule);
  if (invalid) return errorReply(invalid);
  const policy = await readAccess(slug);
  const target = kind === 'allow' ? policy.allow : policy.deny;
  const other = kind === 'allow' ? policy.deny : policy.allow;
  if (target.includes(rule)) {
    return { content: [{ type: 'text', text: `(이미 ${kind}) ${rule}` }] };
  }
  // Mutating to allow auto-removes from deny (and vice versa) — silent dedup
  const removedFromOther = other.includes(rule);
  if (removedFromOther) {
    if (kind === 'allow') policy.deny = policy.deny.filter((r) => r !== rule);
    else policy.allow = policy.allow.filter((r) => r !== rule);
  }
  if (kind === 'allow') policy.allow.push(rule);
  else policy.deny.push(rule);
  await writeAccess(slug, policy);
  await appendHistory(slug, `access ${kind} ${rule}${removedFromOther ? ' (moved from other list)' : ''}`);
  await auditAppend({
    tool: 'afterglow_access',
    slug,
    summary: `${kind} ${rule}`,
    meta: { rule, kind, defaultPolicy: policy.defaultPolicy },
  });
  return {
    content: [
      {
        type: 'text',
        text: `✓ ${kind} ${rule}${removedFromOther ? ` (반대편에서 제거됨)` : ''}.`,
      },
    ],
  };
}

async function remove(slug: string, rule: string | undefined): Promise<ToolReply> {
  if (!rule) return errorReply('remove 에는 rule 이 필요합니다.');
  const policy = await readAccess(slug);
  const beforeAllow = policy.allow.length;
  const beforeDeny = policy.deny.length;
  policy.allow = policy.allow.filter((r) => r !== rule);
  policy.deny = policy.deny.filter((r) => r !== rule);
  const removed = beforeAllow - policy.allow.length + beforeDeny - policy.deny.length;
  if (removed === 0) {
    return { content: [{ type: 'text', text: `(no match) "${rule}" 는 어느 목록에도 없었어요.` }] };
  }
  await writeAccess(slug, policy);
  await appendHistory(slug, `access remove ${rule}`);
  await auditAppend({
    tool: 'afterglow_access',
    slug,
    summary: `remove ${rule}`,
    meta: { rule },
  });
  return { content: [{ type: 'text', text: `✓ ${rule} 제거됨 (${removed} entries).` }] };
}

async function setDefault(slug: string, policyKind: 'allow' | 'deny' | undefined): Promise<ToolReply> {
  if (!policyKind) return errorReply('set-default 에는 defaultPolicy 가 필요합니다.');
  const policy = await readAccess(slug);
  const previous = policy.defaultPolicy;
  policy.defaultPolicy = policyKind;
  await writeAccess(slug, policy);
  await appendHistory(slug, `access set-default ${previous} → ${policyKind}`);
  await auditAppend({
    tool: 'afterglow_access',
    slug,
    summary: `set-default ${previous} → ${policyKind}`,
    meta: { previous, next: policyKind },
  });
  return {
    content: [{ type: 'text', text: `✓ 기본 정책 ${previous} → ${policyKind}.` }],
  };
}

async function check(slug: string, caller: string | undefined): Promise<ToolReply> {
  const policy = await readAccess(slug);
  const r = evaluateAccess(policy, caller);
  return {
    content: [
      {
        type: 'text',
        text: `caller "${caller || '(anonymous)'}" → ${r.allowed ? '✓ allow' : '✗ deny'}  ·  ${r.reason}${r.matchedRule ? `  (matched: ${r.matchedRule})` : ''}`,
      },
    ],
  };
}
