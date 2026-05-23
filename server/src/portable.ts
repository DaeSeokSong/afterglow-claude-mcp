/**
 * Portable bundles — export / import agent folders between Afterglow users.
 *
 * A "bundle" is a plain directory (NOT a binary archive — keeping the package
 * dependency-free), shaped as:
 *
 *   afterglow-export-<ts>/
 *   ├─ manifest.json          ← BundleManifest (version, agents, per-agent hash)
 *   └─ agents/
 *      ├─ <slug>/             ← copy of agents/<slug>/ minus embeddings/
 *      └─ …
 *
 * The user zips/tars the directory to hand it off; the receiver extracts and
 * runs `afterglow_import`. A single bare agent folder (just persona.json + …)
 * is ALSO importable for the "I only copied one folder" case.
 *
 * Integrity: each agent's folder is hashed (sorted relpath ⊕ content). Import
 * recomputes and compares against the manifest; the audit.log hash-chain is
 * separately verified. Nothing is trusted blindly.
 */
import { promises as fs } from 'node:fs';
import { createHash } from 'node:crypto';
import { join, relative, sep } from 'node:path';
import { z } from 'zod';
import { PersonaSchema } from './persona.js';

/* --------------------------------------------------------------- */
/* Manifest                                                        */
/* --------------------------------------------------------------- */

export const BundleAgentSchema = z
  .object({
    slug: z.string(),
    name: z.string(),
    role: z.string(),
    status: z.string(),
    folderHash: z.string(),
    fileCount: z.number().int().nonnegative(),
    originSigner: z.string().optional(),
  })
  .strict();
export type BundleAgent = z.infer<typeof BundleAgentSchema>;

export const BundleManifestSchema = z
  .object({
    version: z.literal(1),
    format: z.literal('afterglow-bundle'),
    exportedAt: z.string(),
    exportedBy: z.string().optional(),
    sourceServerVersion: z.string().optional(),
    includedVersions: z.boolean().default(false),
    agents: z.array(BundleAgentSchema).default([]),
  })
  .strict();
export type BundleManifest = z.infer<typeof BundleManifestSchema>;

/** Folders inside an agent dir that are NEVER bundled (regenerable at rest). */
export const ALWAYS_EXCLUDE = new Set(['embeddings']);

/* --------------------------------------------------------------- */
/* Folder hashing                                                  */
/* --------------------------------------------------------------- */

/**
 * Deterministic hash over a folder's file tree. We sort by POSIX-normalised
 * relative path and feed `relpath \0 <bytes> \0` for each file into one
 * sha256. Directory names that match `exclude` (top-level segment) are skipped
 * so export and import agree on what was hashed.
 */
export async function hashFolder(
  dir: string,
  exclude: Set<string>,
): Promise<{ hash: string; fileCount: number }> {
  const files = await walkFiles(dir, exclude);
  files.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0));
  const h = createHash('sha256');
  let count = 0;
  for (const f of files) {
    const bytes = await fs.readFile(f.abs);
    h.update(f.rel);
    h.update('\0');
    h.update(bytes);
    h.update('\0');
    count++;
  }
  return { hash: 'sha256:' + h.digest('hex'), fileCount: count };
}

interface WalkedFile {
  abs: string;
  rel: string; // POSIX-normalised, relative to the walk root
}

async function walkFiles(root: string, exclude: Set<string>): Promise<WalkedFile[]> {
  const out: WalkedFile[] = [];
  async function recurse(dir: string): Promise<void> {
    let entries: { name: string; isDirectory(): boolean; isFile(): boolean }[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as typeof entries;
    } catch {
      return;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join('/');
      // Exclude on the FIRST path segment (top-level folder inside the agent).
      const firstSeg = rel.split('/')[0];
      if (exclude.has(firstSeg)) continue;
      if (e.isDirectory()) await recurse(abs);
      else if (e.isFile()) out.push({ abs, rel });
    }
  }
  await recurse(root);
  return out;
}

/* --------------------------------------------------------------- */
/* Injection scan                                                  */
/* --------------------------------------------------------------- */

/**
 * Scan imported text (persona.bio, system-prompt.md, consent.md) for content
 * that looks like a prompt-injection / jailbreak attempt smuggled in by
 * whoever prepared the bundle. We do NOT auto-clean here (the persona schema
 * + renderSystemPrompt already defang at output) — this is an *advisory*
 * surface so import can warn the receiver and downgrade trust.
 */
const INJECTION_PATTERNS: { label: string; re: RegExp }[] = [
  { label: 'forged-header', re: /^[ \t]{0,3}#{1,6}\s*(OVERRIDE|SYSTEM|IGNORE|JAILBREAK|DAN|ADMIN)\b/im },
  { label: 'instruction-override', re: /(ignore|disregard|forget)\s+(all\s+)?(previous|above|prior)\s+(instructions|prompts|rules)/i },
  { label: 'instruction-override-ko', re: /(위|이전|앞)\s*(의\s*)?(지시|명령|규칙|프롬프트)\s*(를|을)?\s*(무시|잊)/ },
  { label: 'system-role-inject', re: /^\s*(system|assistant|developer)\s*[:：]/im },
  { label: 'tool-exfil', re: /(curl|wget|fetch)\s+https?:\/\//i },
];

export function scanForInjection(text: string): string[] {
  const hits: string[] = [];
  if (!text) return hits;
  for (const { label, re } of INJECTION_PATTERNS) {
    const m = text.match(re);
    if (m) hits.push(`${label}: "${m[0].slice(0, 80).replace(/\s+/g, ' ')}"`);
  }
  return hits;
}

/* --------------------------------------------------------------- */
/* Bundle / folder detection                                       */
/* --------------------------------------------------------------- */

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

export async function isBundleDir(dir: string): Promise<boolean> {
  return pathExists(join(dir, 'manifest.json'));
}

export async function isAgentFolder(dir: string): Promise<boolean> {
  return pathExists(join(dir, 'persona.json'));
}

export async function readManifest(bundleDir: string): Promise<BundleManifest> {
  const raw = await fs.readFile(join(bundleDir, 'manifest.json'), 'utf8');
  const parsed = BundleManifestSchema.safeParse(JSON.parse(raw));
  if (!parsed.success) {
    throw new Error(
      `manifest.json 형식 오류: ${parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join('; ')}`,
    );
  }
  return parsed.data;
}

/* --------------------------------------------------------------- */
/* Source validation (shared by import + verify)                   */
/* --------------------------------------------------------------- */

export interface AgentValidation {
  sourceDir: string;
  slug: string;
  name: string;
  role: string;
  schemaOk: boolean;
  schemaErrors: string[];
  hasConsentSignature: boolean;
  hasSymlinks: boolean;
  injectionWarnings: string[];
  computedHash: string;
  fileCount: number;
  manifestHash?: string;
  hashMatches?: boolean;
}

/**
 * Validate one bare agent folder (sourceDir contains persona.json). Pure read —
 * no writes, no storage coupling. `manifestHash`, when supplied, is compared
 * against the recomputed folder hash for tamper-evidence.
 */
export async function validateAgentSource(
  sourceDir: string,
  exclude: Set<string>,
  manifestHash?: string,
): Promise<AgentValidation> {
  const schemaErrors: string[] = [];
  let slug = '(unknown)';
  let name = '(unknown)';
  let role = '(unknown)';
  let schemaOk = false;

  try {
    const personaRaw = await fs.readFile(join(sourceDir, 'persona.json'), 'utf8');
    const parsed = PersonaSchema.safeParse(JSON.parse(personaRaw));
    if (parsed.success) {
      schemaOk = true;
      slug = parsed.data.slug;
      name = parsed.data.name;
      role = parsed.data.role;
    } else {
      schemaErrors.push(...parsed.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`));
      // Best-effort slug for the report even when schema fails.
      try {
        const obj = JSON.parse(personaRaw) as { slug?: string; name?: string; role?: string };
        if (obj.slug) slug = obj.slug;
        if (obj.name) name = obj.name;
        if (obj.role) role = obj.role;
      } catch {
        /* ignore */
      }
    }
  } catch (e) {
    schemaErrors.push(`persona.json 읽기 실패: ${(e as Error).message}`);
  }

  // Consent signature presence.
  let hasConsentSignature = false;
  try {
    const consent = await fs.readFile(join(sourceDir, 'consent.md'), 'utf8');
    hasConsentSignature = /^-\s*서명자:\s*\S/m.test(consent);
  } catch {
    /* no consent.md */
  }

  // Injection scan across the three text surfaces that feed the system prompt.
  const injectionWarnings: string[] = [];
  for (const f of ['persona.json', 'system-prompt.md', 'consent.md']) {
    try {
      const txt = await fs.readFile(join(sourceDir, f), 'utf8');
      for (const w of scanForInjection(txt)) injectionWarnings.push(`${f} → ${w}`);
    } catch {
      /* file may be absent */
    }
  }

  // Symlink presence (we refuse to copy symlinks; flag them here).
  const hasSymlinks = await containsSymlink(sourceDir, exclude);

  const { hash, fileCount } = await hashFolder(sourceDir, exclude);

  return {
    sourceDir,
    slug,
    name,
    role,
    schemaOk,
    schemaErrors,
    hasConsentSignature,
    hasSymlinks,
    injectionWarnings,
    computedHash: hash,
    fileCount,
    manifestHash,
    hashMatches: manifestHash ? hash === manifestHash : undefined,
  };
}

async function containsSymlink(root: string, exclude: Set<string>): Promise<boolean> {
  async function recurse(dir: string): Promise<boolean> {
    let entries: { name: string; isDirectory(): boolean; isSymbolicLink(): boolean }[];
    try {
      entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as typeof entries;
    } catch {
      return false;
    }
    for (const e of entries) {
      const abs = join(dir, e.name);
      const rel = relative(root, abs).split(sep).join('/');
      if (exclude.has(rel.split('/')[0])) continue;
      if (e.isSymbolicLink()) return true;
      if (e.isDirectory() && (await recurse(abs))) return true;
    }
    return false;
  }
  return recurse(root);
}

/**
 * Copy an agent folder, skipping symlinks (security: a symlink in a received
 * bundle could point at ~/.ssh/id_rsa and get RAG-indexed) and excluded dirs.
 */
export async function copyAgentTreeNoSymlinks(
  src: string,
  dest: string,
  exclude: Set<string>,
): Promise<void> {
  await fs.mkdir(dest, { recursive: true });
  let entries: { name: string; isDirectory(): boolean; isFile(): boolean; isSymbolicLink(): boolean }[];
  try {
    entries = (await fs.readdir(src, { withFileTypes: true })) as unknown as typeof entries;
  } catch {
    return;
  }
  for (const e of entries) {
    if (exclude.has(e.name)) continue;
    const from = join(src, e.name);
    const to = join(dest, e.name);
    if (e.isSymbolicLink()) continue; // never copy symlinks
    if (e.isDirectory()) await copyAgentTreeNoSymlinks(from, to, new Set());
    else if (e.isFile()) await fs.copyFile(from, to);
  }
}
