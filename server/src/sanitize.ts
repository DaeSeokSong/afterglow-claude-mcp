/**
 * Markdown / prompt-injection defang shared across the server.
 *
 * Every place where user-controlled text flows into a system prompt or a
 * structurally-meaningful markdown context uses these helpers so the attack
 * surface stays in one file instead of scattered across each tool.
 *
 * The defenses below closed 6 rounds of adversarial QA on the handoff path.
 * They are duplicated here (instead of left in `tools/handoff.ts`) so the
 * exact same logic now applies to `renderSystemPrompt` (persona fields),
 * `ask` (RAG chunks + question), and `council` (RAG chunks + question).
 */

/* --------------------------------------------------------------- */
/* Multi-line text defang                                          */
/* --------------------------------------------------------------- */

/**
 * Defang user-authored text before it lands somewhere the LLM will parse
 * as structured markdown (notably the rendered system prompt).
 *
 * Closes every attack we know of:
 *
 *   · ATX headers (`#`, `##`, …) in ANY block-leading position — top-level,
 *     inside (nested) blockquotes `> ## X` / `>> ## X`, inside list items
 *     `- ## X` / `* ## X` / `+ ## X` / `1. ## X`, with up to 3 leading
 *     spaces / tabs. We backslash-escape only the `#` run, leaving the
 *     prefix untouched so the visible quote/list layout survives.
 *   · Setext underlines (line of pure `=` or pure `-`, ≥1 char) — these
 *     turn the PREVIOUS non-empty line into an H1/H2. We replace the run
 *     with `·`s so it no longer matches.
 *   · Triple-backtick fence escape — a user-supplied ```` ``` ```` run can
 *     terminate the surrounding code-fence we use to wrap their input.
 *     We replace the run with U+02CB (`ˋ`) so it looks the same but is
 *     not a fence delimiter.
 *   · NUL bytes (filesystem truncation tricks).
 *   · Lone CR line-endings (CommonMark §2.2 treats `\r` alone as a line
 *     terminator, but `String.split(/\r?\n/)` does not — so we normalise
 *     all `\r\n`, lone `\r`, and `\n` to `\n` before per-line analysis).
 *   · Fullwidth `＃` (U+FF03) and small `﹟` (U+FE5F) — normalised to ASCII
 *     `#` so an attacker can't slip a header past the regex.
 *   · Leading `<` (HTML block tag) — escaped to `\<` so a stray `<h1>` or
 *     `<script>` block doesn't get picked up by a markdown→HTML renderer
 *     downstream. The system-prompt pipeline reads text not HTML today,
 *     but pipelines change.
 *
 * Multi-line content IS preserved (real handoff answers / bios need it);
 * only the header / fence / escape vectors are closed.
 */
export function sanitisePromptText(s: string, max = 20_000): string {
  // Step 1 — normalise: NUL strip, line-end folding, lookalike normalisation.
  // The hyphen-class normalisation folds Unicode em-dash / hyphen variants
  // to ASCII `-` so the setext defang in step 3 catches them too (some LLM
  // markdown parsers treat U+2014 em-dash runs as H2 underlines).
  let text = String(s ?? '')
    .replace(/\0/g, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[＃﹟]/g, '#')
    .replace(/[‐‑‒–—―−]/g, '-');

  // Step 2 — ATX header defang in every block-leading position.
  text = text.replace(
    /^([ \t]{0,3}(?:>[ \t]*)*(?:[-*+][ \t]+|\d+\.[ \t]+)?[ \t]*)(#+)/gm,
    '$1\\$2',
  );

  // Step 3 — line-by-line: setext underlines + HTML block defang.
  text = text
    .split('\n')
    .map((line) => {
      if (/^[ \t]*=+[ \t]*$/.test(line)) return line.replace(/=/g, '·');
      if (/^[ \t]*-+[ \t]*$/.test(line)) return line.replace(/-/g, '·');
      if (/^[ \t]*</.test(line)) return line.replace(/</g, '\\<');
      return line;
    })
    .join('\n');

  // Step 4 — triple+ backtick AND tilde fence escape (anywhere on any line).
  // CommonMark uses backticks; some parsers also accept ~~~ as a fence.
  // Both get replaced with visually-similar characters that do not delimit.
  text = text.replace(/`{3,}/g, (m) => 'ˋ'.repeat(m.length));
  text = text.replace(/~{3,}/g, (m) => '∼'.repeat(m.length));

  return text.slice(0, max);
}

/* --------------------------------------------------------------- */
/* Single-line field defang                                        */
/* --------------------------------------------------------------- */

/**
 * Strict single-line variant for fields that are conceptually one line —
 * `name`, `role`, `tenure`, `sources[].label`, `sources[].location`,
 * `mcpAllow[*]`, `mcpDeny[*]`. We collapse all CR/LF/tab into a single
 * space and then defang ATX/fence characters within the resulting line.
 *
 * The line-collapse is important: a `name = "Alice\n\n## ..."` payload
 * would otherwise break out of its `- 직무: ${role}` rendering by
 * starting a new line. With everything on one line, even an embedded
 * `## ` becomes harmless because it isn't at column 0 anymore.
 */
export function sanitisePromptLine(s: string, max = 500): string {
  let text = String(s ?? '')
    .replace(/\0/g, '')
    .replace(/[＃﹟]/g, '#')
    // Fold ALL whitespace runs (incl. \r \n \t) into single spaces.
    .replace(/\s+/g, ' ')
    .trim();
  // Triple+ backtick defang (would otherwise close a wrapping fence).
  text = text.replace(/`{3,}/g, (m) => 'ˋ'.repeat(m.length));
  // Defensive: escape ATX `#` and leading `<` even though it's mid-line.
  // ATX is `<= 3 spaces + #`. After whitespace-fold the line never starts
  // with whitespace, so just escape any `#`-at-position-0 occurrence.
  if (text.startsWith('#')) text = `\\${text}`;
  if (text.startsWith('<')) text = `\\${text}`;
  return text.slice(0, max);
}
