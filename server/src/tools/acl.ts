/**
 * Per-tool access-control gate — extends the existing per-agent `access`
 * policy (originally `ask`/`council`-only) to mutator tools so a third party
 * can't, e.g., poison `corrections.log` or roll a persona back behind the
 * agent owner's back.
 *
 * Each mutator handler calls `assertAccessAllowed(slug, args.caller, tool)`
 * near the top; the helper validates the `caller` shape, consults
 * `checkAccess(slug, caller)`, and returns a structured `errorReply` (with
 * `isError: true`) when denied. When allowed, returns `null` so the caller
 * proceeds with normal logic.
 *
 * Backwards-compatible: agents whose `access.json` is wide-open (default
 * allow, no deny rules) still accept anonymous mutations — the gate only
 * bites when the owner has explicitly tightened policy.
 */
import { checkAccess } from '../storage.js';
import { sanitisePromptLine } from '../sanitize.js';
import { errorReply, type ToolReply } from './types.js';

// Mirrors ask.ts CALLER_PATTERN so caller spec is treated identically across
// the read-side (ask/council) and the new write-side mutator gates.
export const CALLER_PATTERN = /^(user|role|team):[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;

/**
 * Returns a denial reply (isError: true) when:
 *   1. `caller` is supplied but malformed (rejects `user:bad\nname` etc), or
 *   2. the agent's access policy denies the call (default deny or explicit
 *      deny rule).
 * Returns null when allowed — caller continues.
 */
export async function assertAccessAllowed(
  slug: string,
  caller: string | undefined,
  tool: string,
): Promise<ToolReply | null> {
  if (caller && !CALLER_PATTERN.test(caller)) {
    return errorReply(
      `Invalid caller for ${tool}: "${sanitisePromptLine(caller, 80)}". Expected "user:<id>", "role:<id>", or "team:<id>" (1-64 ASCII alnum / "-" / "_", starting with alnum).`,
    );
  }
  const check = await checkAccess(slug, caller);
  if (!check.allowed) {
    return errorReply(
      `Access denied for ${caller ?? '(anonymous)'} on ${tool}: ${check.reason}${check.matchedRule ? ` (rule: ${check.matchedRule})` : ''}`,
    );
  }
  return null;
}
