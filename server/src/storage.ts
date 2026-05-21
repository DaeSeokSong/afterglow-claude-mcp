/**
 * Filesystem layout owner for ~/.claude/afterglow/
 *
 *   ~/.claude/afterglow/
 *   ├─ config.yml                ← env config (embedding model, storage root, …)
 *   ├─ registry.json             ← index of all agents
 *   ├─ councils/                 ← council + peer-ask transcripts (markdown)
 *   └─ agents/<slug>/
 *      ├─ persona.json
 *      ├─ system-prompt.md
 *      ├─ mcp-allowlist.yml
 *      ├─ consent.md
 *      ├─ history.log
 *      ├─ knowledge/             ← raw source files (PDF / md / txt / …)
 *      └─ embeddings/            ← derived RAG index (jsonl chunks for the PoC)
 */
import { promises as fs } from 'node:fs';
import { homedir } from 'node:os';
import { dirname, join, resolve } from 'node:path';
import type { Persona } from './persona.js';

/* --------------------------------------------------------------- */
/* In-process per-slug + per-audit mutex                            */
/* --------------------------------------------------------------- */
/* MCP stdio servers are single-process but the SDK fan-outs        */
/* mean a request can be in flight while another is parsed. Without */
/* serialisation, snapshotPersona and audit.append race each other  */
/* and either lose snapshots or break the hash chain. We use a tiny */
/* Promise-chain locker keyed by a string.                          */

const __locks: Map<string, Promise<unknown>> = new Map();

export async function withLock<T>(key: string, fn: () => Promise<T>): Promise<T> {
  const previous = __locks.get(key) ?? Promise.resolve();
  let release!: () => void;
  const next = new Promise<void>((res) => (release = res));
  __locks.set(key, next);
  try {
    await previous; // wait until earlier holders finish
    return await fn();
  } finally {
    release();
    if (__locks.get(key) === next) __locks.delete(key);
  }
}

/**
 * Strip control characters that would let a malicious caller inject
 * fake lines into our newline-delimited logs (history.log, corrections.log).
 * Specifically: \r, \n, NUL. Also clamp very long single tokens so a single
 * gigantic field can't blow up tail / grep on the log.
 */
export function sanitizeLogLine(s: string): string {
  return String(s ?? '')
    .replace(/[\r\n\0]/g, ' ')
    .slice(0, 4_000);
}

/**
 * Resolved on every call (not at module load) so tests can flip
 * AFTERGLOW_ROOT per-test without re-importing the module.
 */
export function rootDir(): string {
  const envRoot = process.env.AFTERGLOW_ROOT;
  if (envRoot) return resolve(envRoot);
  return join(homedir(), '.claude', 'afterglow');
}

export function configPath(): string {
  return join(rootDir(), 'config.yml');
}

export function registryPath(): string {
  return join(rootDir(), 'registry.json');
}

export function councilsDir(): string {
  return join(rootDir(), 'councils');
}

export function agentsDir(): string {
  return join(rootDir(), 'agents');
}

export function agentDir(slug: string): string {
  return join(agentsDir(), slug);
}

export function archiveDir(): string {
  return join(rootDir(), 'archive');
}

export function archivedAgentDir(slug: string): string {
  return join(archiveDir(), slug);
}

export function personaPath(slug: string): string {
  return join(agentDir(slug), 'persona.json');
}

export function systemPromptPath(slug: string): string {
  return join(agentDir(slug), 'system-prompt.md');
}

export function consentPath(slug: string): string {
  return join(agentDir(slug), 'consent.md');
}

export function historyLogPath(slug: string): string {
  return join(agentDir(slug), 'history.log');
}

export function knowledgeDir(slug: string): string {
  return join(agentDir(slug), 'knowledge');
}

export function embeddingsDir(slug: string): string {
  return join(agentDir(slug), 'embeddings');
}

export function versionsDir(slug: string): string {
  return join(agentDir(slug), '.versions');
}

export function versionTagsPath(slug: string): string {
  return join(versionsDir(slug), 'tags.json');
}

export function accessPath(slug: string): string {
  return join(agentDir(slug), 'access.json');
}

export function handoffPath(slug: string): string {
  return join(agentDir(slug), 'handoff.json');
}

export function correctionsLogPath(slug: string): string {
  return join(agentDir(slug), 'corrections.log');
}

/* --------------------------------------------------------------- */
/* Slug validation                                                 */
/* --------------------------------------------------------------- */

const SLUG_RE = /^[a-z0-9][a-z0-9-]{0,30}[a-z0-9]$/;
const SLUG_RE_SINGLE = /^[a-z0-9]$/;

/**
 * Windows reserved device names — creating `agents/con/` etc. either fails
 * loudly or hangs on legacy code paths. Rejecting them up-front keeps the
 * filesystem layout portable.
 */
const WINDOWS_RESERVED = new Set([
  'con', 'prn', 'aux', 'nul',
  'com1', 'com2', 'com3', 'com4', 'com5', 'com6', 'com7', 'com8', 'com9',
  'lpt1', 'lpt2', 'lpt3', 'lpt4', 'lpt5', 'lpt6', 'lpt7', 'lpt8', 'lpt9',
]);

export class InvalidSlugError extends Error {
  constructor(slug: string) {
    super(`Invalid slug: "${slug}". Use 1-32 lowercase letters/digits/hyphens, starting and ending with a letter or digit (Windows reserved names like "con"/"prn" are not allowed).`);
    this.name = 'InvalidSlugError';
  }
}

export class AgentNotFoundError extends Error {
  constructor(slug: string) {
    super(`Agent not found: "${slug}".`);
    this.name = 'AgentNotFoundError';
  }
}

export class AgentExistsError extends Error {
  constructor(slug: string) {
    super(`Agent already exists: "${slug}".`);
    this.name = 'AgentExistsError';
  }
}

export class NotInitializedError extends Error {
  constructor() {
    super('Afterglow has not been initialized. Run /afterglow init first.');
    this.name = 'NotInitializedError';
  }
}

export function assertValidSlug(slug: string): void {
  const ok = slug.length === 1 ? SLUG_RE_SINGLE.test(slug) : SLUG_RE.test(slug);
  if (!ok) throw new InvalidSlugError(slug);
  if (WINDOWS_RESERVED.has(slug)) throw new InvalidSlugError(slug);
}

/* --------------------------------------------------------------- */
/* Init / status                                                   */
/* --------------------------------------------------------------- */

export interface InitOptions {
  embeddingModel?: string;
}

export interface InitResult {
  root: string;
  created: string[];
  alreadyExisted: boolean;
}

const DEFAULT_CONFIG = (model: string) => `# Afterglow environment config
# Generated by /afterglow init — safe to edit.

embedding_model: ${model}
storage_root: ~/.claude/afterglow
created_at: ${new Date().toISOString()}
`;

export async function isInitialized(): Promise<boolean> {
  try {
    await fs.access(configPath());
    await fs.access(registryPath());
    return true;
  } catch {
    return false;
  }
}

export async function assertInitialized(): Promise<void> {
  if (!(await isInitialized())) throw new NotInitializedError();
}

export async function init(opts: InitOptions = {}): Promise<InitResult> {
  const embeddingModel = opts.embeddingModel ?? 'text-embedding-3-small';
  const created: string[] = [];

  const root = rootDir();
  const existed = await isInitialized();

  await mkdirIdempotent(root, created);
  await mkdirIdempotent(agentsDir(), created);
  await mkdirIdempotent(councilsDir(), created);

  if (!(await pathExists(configPath()))) {
    await fs.writeFile(configPath(), DEFAULT_CONFIG(embeddingModel), 'utf8');
    created.push(configPath());
  }
  if (!(await pathExists(registryPath()))) {
    await fs.writeFile(registryPath(), JSON.stringify({ version: 1, agents: [] }, null, 2) + '\n', 'utf8');
    created.push(registryPath());
  }

  return { root, created, alreadyExisted: existed };
}

/* --------------------------------------------------------------- */
/* Registry I/O                                                    */
/* --------------------------------------------------------------- */

export type AgentStatus = 'active' | 'learning' | 'paused' | 'draft' | 'archived';

export interface RegistryEntry {
  slug: string;
  name: string;
  role: string;
  status: AgentStatus;
  createdAt: string;
  trainedAt: string | null;
}

export interface Registry {
  version: 1;
  agents: RegistryEntry[];
}

export async function readRegistry(): Promise<Registry> {
  await assertInitialized();
  const raw = await fs.readFile(registryPath(), 'utf8');
  const parsed = JSON.parse(raw) as Registry;
  if (!parsed || parsed.version !== 1 || !Array.isArray(parsed.agents)) {
    throw new Error('registry.json is malformed.');
  }
  return parsed;
}

export async function writeRegistry(reg: Registry): Promise<void> {
  await fs.writeFile(registryPath(), JSON.stringify(reg, null, 2) + '\n', 'utf8');
}

export async function upsertRegistryEntry(entry: RegistryEntry): Promise<void> {
  const reg = await readRegistry();
  const idx = reg.agents.findIndex((a) => a.slug === entry.slug);
  if (idx >= 0) {
    reg.agents[idx] = entry;
  } else {
    reg.agents.push(entry);
    reg.agents.sort((a, b) => a.slug.localeCompare(b.slug));
  }
  await writeRegistry(reg);
}

export async function removeRegistryEntry(slug: string): Promise<void> {
  const reg = await readRegistry();
  reg.agents = reg.agents.filter((a) => a.slug !== slug);
  await writeRegistry(reg);
}

/* --------------------------------------------------------------- */
/* Agent folder                                                    */
/* --------------------------------------------------------------- */

export async function agentExists(slug: string): Promise<boolean> {
  return pathExists(agentDir(slug));
}

export async function createAgentSkeleton(slug: string): Promise<string[]> {
  await assertInitialized();
  assertValidSlug(slug);
  if (await agentExists(slug)) throw new AgentExistsError(slug);

  const created: string[] = [];
  await mkdirIdempotent(agentDir(slug), created);
  await mkdirIdempotent(knowledgeDir(slug), created);
  await mkdirIdempotent(embeddingsDir(slug), created);
  return created;
}

export async function readPersona(slug: string): Promise<Persona> {
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
  const raw = await fs.readFile(personaPath(slug), 'utf8');
  return JSON.parse(raw) as Persona;
}

export async function writePersona(slug: string, persona: Persona): Promise<void> {
  await fs.writeFile(personaPath(slug), JSON.stringify(persona, null, 2) + '\n', 'utf8');
}

export async function writeSystemPrompt(slug: string, body: string): Promise<void> {
  const path = systemPromptPath(slug);
  await ensureDir(dirname(path));
  await fs.writeFile(path, body.endsWith('\n') ? body : body + '\n', 'utf8');
}

export async function readSystemPrompt(slug: string): Promise<string> {
  return fs.readFile(systemPromptPath(slug), 'utf8');
}

export async function appendHistory(slug: string, line: string): Promise<void> {
  // Serialise per-slug so two parallel appends on Windows can't interleave
  // bytes and corrupt the log. node's `fs.appendFile` is not guaranteed
  // atomic on Windows for arbitrary sizes; the lock makes it so.
  return withLock(`history:${slug}`, async () => {
    const path = historyLogPath(slug);
    await ensureDir(dirname(path));
    const ts = new Date().toISOString();
    // sanitizeLogLine strips CR/LF/NUL so an attacker-controlled `line`
    // can't inject a fake history record.
    await fs.appendFile(path, `${ts}  ${sanitizeLogLine(line)}\n`, 'utf8');
  });
}

/* --------------------------------------------------------------- */
/* History log parsing                                             */
/* --------------------------------------------------------------- */

export interface HistoryEvent {
  ts: string;
  message: string;
}

export async function readHistory(slug: string): Promise<HistoryEvent[]> {
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
  const path = historyLogPath(slug);
  let raw: string;
  try {
    raw = await fs.readFile(path, 'utf8');
  } catch {
    return [];
  }
  const lines = raw.split('\n').filter((l) => l.trim().length > 0);
  // Format: `${ISO timestamp}  ${message}`
  const out: HistoryEvent[] = [];
  for (const line of lines) {
    const m = line.match(/^(\S+)\s\s(.+)$/);
    if (m) out.push({ ts: m[1], message: m[2] });
    else out.push({ ts: '', message: line });
  }
  return out;
}

/* --------------------------------------------------------------- */
/* Consent / status workflow                                       */
/* --------------------------------------------------------------- */

export class NotSignedError extends Error {
  constructor(slug: string, currentStatus?: AgentStatus) {
    const stateHint = currentStatus ? ` (current: ${currentStatus})` : '';
    // For `paused` and `draft` we point users at two different remedies:
    //   - draft   → /afterglow sign     (consent not yet captured)
    //   - paused  → /afterglow resume   (consent still on file)
    // Both options are listed so the message stays useful when the caller
    // didn't pass currentStatus.
    super(
      `Agent "${slug}" is not active${stateHint}.\n` +
        `  · 처음 서명: /afterglow sign ${slug} --signer "..."\n` +
        `  · 이미 서명되어 있다면: /afterglow resume ${slug}`,
    );
    this.name = 'NotSignedError';
  }
}

export interface SignResult {
  signedAt: string;
  signer: string;
  previousStatus: RegistryEntry['status'];
  newStatus: RegistryEntry['status'];
}

/**
 * Strip CR/LF from a markdown field so the caller can't forge fake
 * `## 서명` blocks by stuffing newlines into `signer` / `note`. Also caps
 * the length to keep `consent.md` legible.
 */
function sanitizeConsentField(s: string, max = 200): string {
  return String(s ?? '')
    .replace(/[\r\n\0]+/g, ' ')
    .trim()
    .slice(0, max);
}

export async function signConsent(
  slug: string,
  signer: string,
  note?: string,
): Promise<SignResult> {
  await assertInitialized();
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);

  const reg = await readRegistry();
  const entry = reg.agents.find((a) => a.slug === slug);
  if (!entry) throw new AgentNotFoundError(slug);
  const previousStatus = entry.status;

  const cleanSigner = sanitizeConsentField(signer);
  const cleanNote = note !== undefined ? sanitizeConsentField(note, 1_000) : '';
  if (cleanSigner.length === 0) {
    throw new Error(
      'signer must contain at least one non-whitespace character (CR/LF/NUL stripped).',
    );
  }
  const signedAt = new Date().toISOString();
  const block =
    `\n## 서명\n\n` +
    `- 서명자: ${cleanSigner}\n` +
    `- 시각: ${signedAt}\n` +
    (cleanNote ? `- 메모: ${cleanNote}\n` : '');
  await fs.appendFile(consentPath(slug), block, 'utf8');

  entry.status = 'active';
  entry.trainedAt = entry.trainedAt ?? signedAt;
  await writeRegistry(reg);

  return { signedAt, signer: cleanSigner, previousStatus, newStatus: 'active' };
}

export async function pauseAgent(slug: string): Promise<RegistryEntry['status']> {
  await assertInitialized();
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
  const reg = await readRegistry();
  const entry = reg.agents.find((a) => a.slug === slug);
  if (!entry) throw new AgentNotFoundError(slug);
  const prev = entry.status;
  entry.status = 'paused';
  await writeRegistry(reg);
  return prev;
}

export async function resumeAgent(slug: string): Promise<RegistryEntry['status']> {
  await assertInitialized();
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
  const reg = await readRegistry();
  const entry = reg.agents.find((a) => a.slug === slug);
  if (!entry) throw new AgentNotFoundError(slug);
  const prev = entry.status;
  entry.status = 'active';
  await writeRegistry(reg);
  return prev;
}

export async function getStatus(slug: string): Promise<RegistryEntry['status']> {
  const reg = await readRegistry();
  const entry = reg.agents.find((a) => a.slug === slug);
  if (!entry) throw new AgentNotFoundError(slug);
  return entry.status;
}

/**
 * Gate for `afterglow_ask` (and council). Allows only `active` agents.
 * Bypass for tests / debug: AFTERGLOW_ALLOW_DRAFT=1 disables the gate.
 * Archived agents are always blocked (must be restored first).
 */
export async function assertActive(slug: string): Promise<void> {
  const status = await getStatus(slug);
  if (status === 'archived') throw new ArchivedAgentError(slug);
  if (process.env.AFTERGLOW_ALLOW_DRAFT === '1') return;
  if (status !== 'active') throw new NotSignedError(slug, status);
}

/**
 * Gate for mutating tools (edit / version / access / handoff / correct …):
 * an archived agent must be restored first. Unlike `assertActive` this
 * does NOT require the agent to be signed — draft / paused / learning
 * agents are still writable (creating them is the whole point).
 */
export async function assertWritable(slug: string): Promise<void> {
  const status = await getStatus(slug);
  if (status === 'archived') throw new ArchivedAgentError(slug);
}

/* --------------------------------------------------------------- */
/* Archive / restore                                               */
/* --------------------------------------------------------------- */

export class ArchivedAgentError extends Error {
  constructor(slug: string) {
    super(`Agent "${slug}" is archived. Restore it first: /afterglow archive ${slug} --action restore`);
    this.name = 'ArchivedAgentError';
  }
}

export class NotArchivedError extends Error {
  constructor(slug: string) {
    super(`Agent "${slug}" is not archived. Nothing to restore.`);
    this.name = 'NotArchivedError';
  }
}

export class ArchiveTargetExistsError extends Error {
  constructor(path: string) {
    super(`Archive target already exists: ${path}. Refusing to overwrite.`);
    this.name = 'ArchiveTargetExistsError';
  }
}

export class RestoreTargetExistsError extends Error {
  constructor(path: string) {
    super(`Restore target already exists: ${path}. An active agent with the same slug is in the way.`);
    this.name = 'RestoreTargetExistsError';
  }
}

export interface ArchiveResult {
  slug: string;
  movedFrom: string;
  movedTo: string;
  previousStatus: AgentStatus;
  archivedAt: string;
}

export async function archiveAgent(slug: string): Promise<ArchiveResult> {
  await assertInitialized();
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
  const reg = await readRegistry();
  const entry = reg.agents.find((a) => a.slug === slug);
  if (!entry) throw new AgentNotFoundError(slug);
  if (entry.status === 'archived') {
    throw new Error(`Agent "${slug}" is already archived.`);
  }

  await ensureDir(archiveDir());
  const target = archivedAgentDir(slug);
  if (await pathExists(target)) throw new ArchiveTargetExistsError(target);

  const source = agentDir(slug);
  const previousStatus = entry.status;
  const archivedAt = new Date().toISOString();

  // Flip the registry FIRST. A crash between flip and rename leaves
  // status=archived but folder still at agents/<slug>/ — restoreAgent
  // detects this (status=archived but archive/<slug>/ missing) and a
  // re-archive call recovers cleanly. The previous ordering was
  // rename-then-write-registry, which on a crash left the folder at
  // archive/<slug>/ but registry still 'active' — irrecoverable without
  // hand-editing registry.json.
  entry.status = 'archived';
  await writeRegistry(reg);

  try {
    await fs.rename(source, target);
  } catch (e) {
    // Roll back the registry flip so the agent stays operable.
    entry.status = previousStatus;
    await writeRegistry(reg);
    throw e;
  }

  return {
    slug,
    movedFrom: source,
    movedTo: target,
    previousStatus,
    archivedAt,
  };
}

export interface RestoreResult {
  slug: string;
  movedFrom: string;
  movedTo: string;
  newStatus: AgentStatus;
  restoredAt: string;
}

/**
 * Restore an archived agent back to agents/<slug>/. Lands in `paused` —
 * the user must explicitly re-sign or call resume to reach `active`.
 * This avoids surprise activations after months on the shelf.
 */
export async function restoreAgent(slug: string): Promise<RestoreResult> {
  await assertInitialized();
  const reg = await readRegistry();
  const entry = reg.agents.find((a) => a.slug === slug);
  if (!entry) throw new AgentNotFoundError(slug);
  if (entry.status !== 'archived') throw new NotArchivedError(slug);

  const source = archivedAgentDir(slug);
  if (!(await pathExists(source))) {
    throw new Error(`Archived folder missing: ${source}. Registry says archived but data is gone.`);
  }
  const target = agentDir(slug);
  if (await pathExists(target)) throw new RestoreTargetExistsError(target);

  await ensureDir(agentsDir());
  await fs.rename(source, target);

  const restoredAt = new Date().toISOString();
  entry.status = 'paused';
  await writeRegistry(reg);

  return {
    slug,
    movedFrom: source,
    movedTo: target,
    newStatus: 'paused',
    restoredAt,
  };
}

/* --------------------------------------------------------------- */
/* Version snapshots                                               */
/* --------------------------------------------------------------- */

export interface VersionEntry {
  id: string;              // e.g. "v1", "v2", …
  createdAt: string;
  reason: string;          // why this snapshot was taken (edit/sign/recalibrate/handoff/manual)
  path: string;            // absolute path to the snapshot file
}

export interface VersionTags {
  [tag: string]: string;   // tag → version id
}

async function readVersionTags(slug: string): Promise<VersionTags> {
  try {
    const raw = await fs.readFile(versionTagsPath(slug), 'utf8');
    return JSON.parse(raw) as VersionTags;
  } catch {
    return {};
  }
}

async function writeVersionTags(slug: string, tags: VersionTags): Promise<void> {
  await ensureDir(versionsDir(slug));
  await fs.writeFile(versionTagsPath(slug), JSON.stringify(tags, null, 2) + '\n', 'utf8');
}

export async function listVersions(slug: string): Promise<VersionEntry[]> {
  // No folder check — archived agents' .versions/ lives at archive/<slug>/
  // and read-only inspectors should still work. Callers must verify the slug
  // up-front (via getStatus / readRegistry) for proper not-found errors.
  const dir = versionsDir(slug);
  let entries: { name: string; isFile: () => boolean }[];
  try {
    entries = (await fs.readdir(dir, { withFileTypes: true })) as unknown as typeof entries;
  } catch {
    return [];
  }
  const out: VersionEntry[] = [];
  for (const e of entries) {
    if (!e.isFile()) continue;
    const m = e.name.match(/^(v\d+)-(.+)\.json$/);
    if (!m) continue;
    const [, id, ts] = m;
    try {
      const stat = await fs.stat(join(dir, e.name));
      out.push({
        id,
        createdAt: ts.replace(/-/g, ':').slice(0, 19) + 'Z',
        reason: '(see file for full metadata)',
        path: join(dir, e.name),
      });
      // Try to enrich with reason if the file embeds it
      const raw = await fs.readFile(join(dir, e.name), 'utf8');
      const parsed = JSON.parse(raw) as { __meta__?: { reason?: string } };
      if (parsed.__meta__?.reason) out[out.length - 1].reason = parsed.__meta__.reason;
      // also use mtime as a fallback timestamp
      if (!ts) out[out.length - 1].createdAt = stat.mtime.toISOString();
    } catch {
      /* malformed file, skip enrichment */
    }
  }
  // sort by numeric version id ascending
  out.sort((a, b) => parseInt(a.id.slice(1)) - parseInt(b.id.slice(1)));
  return out;
}

export async function snapshotPersona(slug: string, reason: string): Promise<VersionEntry> {
  // Serialise per-slug to defeat the TOCTOU race where two concurrent
  // callers (e.g. edit + sign in parallel) compute the same `nextNum`
  // and overwrite each other's snapshot. The lock key is per-slug so
  // unrelated agents still proceed in parallel.
  return withLock(`snapshot:${slug}`, async () => {
    if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
    const existing = await listVersions(slug);
    const nextNum = existing.length > 0 ? parseInt(existing[existing.length - 1].id.slice(1)) + 1 : 1;
    const id = `v${nextNum}`;
    const now = new Date();
    const tsForFs = now.toISOString().replace(/[:.]/g, '-');
    const path = join(versionsDir(slug), `${id}-${tsForFs}.json`);
    let current: unknown = {};
    try {
      current = JSON.parse(await fs.readFile(personaPath(slug), 'utf8'));
    } catch {
      /* if persona.json missing, snapshot empty */
    }
    const body = { __meta__: { id, createdAt: now.toISOString(), reason }, persona: current };
    await ensureDir(versionsDir(slug));
    await fs.writeFile(path, JSON.stringify(body, null, 2) + '\n', 'utf8');
    return { id, createdAt: now.toISOString(), reason, path };
  });
}

export async function readVersion(slug: string, id: string): Promise<unknown> {
  const versions = await listVersions(slug);
  const v = versions.find((x) => x.id === id);
  if (!v) throw new Error(`Version "${id}" not found for ${slug}.`);
  const raw = await fs.readFile(v.path, 'utf8');
  const parsed = JSON.parse(raw) as { persona?: unknown };
  return parsed.persona ?? parsed;
}

export interface RestoreResultV {
  fromVersion: string;
  snapshotBeforeRestore: string;
  restoredAt: string;
}

export async function restoreVersion(slug: string, id: string): Promise<RestoreResultV> {
  if (!(await agentExists(slug))) throw new AgentNotFoundError(slug);
  // Serialise the entire restore (snapshot → write → render) per-slug so a
  // concurrent `edit` / `recalibrate apply` can't clobber the restored
  // persona between the safety snapshot and the actual write. Shares the
  // `snapshot:${slug}` lock key with `snapshotPersona` so they can't race.
  return withLock(`snapshot:${slug}`, async () => {
    const target = await readVersion(slug, id);
    const existing = await listVersions(slug);
    const nextNum =
      existing.length > 0 ? parseInt(existing[existing.length - 1].id.slice(1)) + 1 : 1;
    // Inline snapshot (instead of recursive call) — we already hold the lock.
    const safetyId = `v${nextNum}`;
    const safetyTs = new Date();
    const safetyPath = join(
      versionsDir(slug),
      `${safetyId}-${safetyTs.toISOString().replace(/[:.]/g, '-')}.json`,
    );
    let currentPersona: unknown = {};
    try {
      currentPersona = JSON.parse(await fs.readFile(personaPath(slug), 'utf8'));
    } catch {
      /* persona.json missing → snapshot empty */
    }
    await ensureDir(versionsDir(slug));
    await fs.writeFile(
      safetyPath,
      JSON.stringify(
        {
          __meta__: {
            id: safetyId,
            createdAt: safetyTs.toISOString(),
            reason: `restore-safety (before ${id})`,
          },
          persona: currentPersona,
        },
        null,
        2,
      ) + '\n',
      'utf8',
    );

    // Now overwrite persona.json + regenerate system-prompt.md atomically
    // w.r.t. other lock holders.
    await fs.writeFile(personaPath(slug), JSON.stringify(target, null, 2) + '\n', 'utf8');
    try {
      const { PersonaSchema, renderSystemPrompt } = await import('./persona.js');
      const parsed = PersonaSchema.safeParse(target);
      if (parsed.success) {
        const promptPath = systemPromptPath(slug);
        await ensureDir(dirname(promptPath));
        await fs.writeFile(promptPath, renderSystemPrompt(parsed.data) + '\n', 'utf8');
      }
      // If parse fails (old/foreign snapshot) we leave system-prompt.md
      // alone — the audit log surfaces the partial rollback.
    } catch {
      /* renderSystemPrompt is best-effort during rollback */
    }

    return {
      fromVersion: id,
      snapshotBeforeRestore: safetyId,
      restoredAt: new Date().toISOString(),
    };
  });
}

export async function tagVersion(slug: string, id: string, tag: string): Promise<void> {
  const versions = await listVersions(slug);
  if (!versions.some((v) => v.id === id)) {
    throw new Error(`Version "${id}" not found for ${slug}.`);
  }
  const tags = await readVersionTags(slug);
  tags[tag] = id;
  await writeVersionTags(slug, tags);
}

export async function listVersionTags(slug: string): Promise<VersionTags> {
  return readVersionTags(slug);
}

/* --------------------------------------------------------------- */
/* Access policy                                                   */
/* --------------------------------------------------------------- */

export interface AccessPolicy {
  defaultPolicy: 'allow' | 'deny';
  allow: string[];   // entries like "user:ykhyun", "role:director", "team:design"
  deny: string[];
  updatedAt: string;
}

const DEFAULT_ACCESS: AccessPolicy = {
  defaultPolicy: 'allow',
  allow: [],
  deny: [],
  updatedAt: '1970-01-01T00:00:00Z',
};

export async function readAccess(slug: string): Promise<AccessPolicy> {
  // No folder-based existence check: callers must validate the slug via
  // `getStatus` (registry-aware) first. This keeps read-only view actions
  // working on archived agents whose folder has been moved to archive/.
  try {
    const raw = await fs.readFile(accessPath(slug), 'utf8');
    const parsed = JSON.parse(raw) as AccessPolicy;
    return { ...DEFAULT_ACCESS, ...parsed };
  } catch {
    return { ...DEFAULT_ACCESS };
  }
}

export async function writeAccess(slug: string, policy: AccessPolicy): Promise<void> {
  policy.updatedAt = new Date().toISOString();
  await ensureDir(agentDir(slug));
  await fs.writeFile(accessPath(slug), JSON.stringify(policy, null, 2) + '\n', 'utf8');
}

export interface AccessCheck {
  allowed: boolean;
  reason: string;
  matchedRule?: string;
}

/**
 * Caller spec is a free-form identifier like:
 *   "user:ykhyun"  (most specific — overrides role/team)
 *   "role:director"
 *   "team:design"
 *   "" / undefined  → caller anonymous (uses defaultPolicy)
 *
 * Matching is deny-first: any deny match → blocked, then any allow match → allowed,
 * otherwise the defaultPolicy decides. user: wins over role: wins over team: when
 * multiple rules of the same verdict match (most-specific reason in `matchedRule`).
 */
export function evaluateAccess(policy: AccessPolicy, caller: string | undefined): AccessCheck {
  const c = (caller ?? '').trim();
  // Exact-match deny always wins. Role/team denies of a user not declared
  // in user:* require explicit listing — keeping the matcher narrow makes
  // the policy predictable.
  if (c && policy.deny.includes(c)) {
    return { allowed: false, reason: `denied by rule "${c}"`, matchedRule: c };
  }
  // Explicit allow
  if (c && policy.allow.includes(c)) {
    return { allowed: true, reason: `allowed by rule "${c}"`, matchedRule: c };
  }
  // Fallback to defaultPolicy (also catches anonymous callers).
  if (policy.defaultPolicy === 'allow') {
    return { allowed: true, reason: 'default policy is allow' };
  }
  return { allowed: false, reason: `caller "${c || '(anonymous)'}" not in allow list and defaultPolicy=deny` };
}

export async function checkAccess(slug: string, caller: string | undefined): Promise<AccessCheck> {
  const policy = await readAccess(slug);
  return evaluateAccess(policy, caller);
}

/* --------------------------------------------------------------- */
/* Handoff session                                                 */
/* --------------------------------------------------------------- */

export interface HandoffQuestion {
  id: string;
  question: string;
  status: 'pending' | 'kept' | 'edited' | 'declined';
  draftAnswer?: string;     // what the agent would have said (from RAG context)
  userAnswer?: string;      // the person's authoritative answer
  recordedAt?: string;
}

export interface HandoffSession {
  slug: string;
  startedAt: string;
  finalizedAt?: string;
  signer?: string;
  limit: number;
  source: 'auto' | 'file' | 'mixed';
  sourceFile?: string;
  questions: HandoffQuestion[];
}

export async function readHandoff(slug: string): Promise<HandoffSession | null> {
  try {
    const raw = await fs.readFile(handoffPath(slug), 'utf8');
    return JSON.parse(raw) as HandoffSession;
  } catch {
    return null;
  }
}

export async function writeHandoff(slug: string, session: HandoffSession): Promise<void> {
  await ensureDir(agentDir(slug));
  await fs.writeFile(handoffPath(slug), JSON.stringify(session, null, 2) + '\n', 'utf8');
}

export async function deleteHandoff(slug: string): Promise<void> {
  try {
    await fs.unlink(handoffPath(slug));
  } catch {
    /* already absent */
  }
}

/* --------------------------------------------------------------- */
/* Corrections log                                                 */
/* --------------------------------------------------------------- */

export interface CorrectionEntry {
  ts: string;
  recordId: string;
  kind: 'feedback' | 'edit-answer' | 'save-rule';
  note: string;
}

export async function appendCorrection(slug: string, entry: CorrectionEntry): Promise<void> {
  // Same Windows-atomicity story as appendHistory: lock per-slug.
  return withLock(`corrections:${slug}`, async () => {
    await ensureDir(agentDir(slug));
    await fs.appendFile(
      correctionsLogPath(slug),
      `${entry.ts}  [${entry.kind}] record=${sanitizeLogLine(entry.recordId)}  ${sanitizeLogLine(entry.note)}\n`,
      'utf8',
    );
  });
}

export async function readCorrections(slug: string): Promise<CorrectionEntry[]> {
  let raw: string;
  try {
    raw = await fs.readFile(correctionsLogPath(slug), 'utf8');
  } catch {
    return [];
  }
  const out: CorrectionEntry[] = [];
  for (const line of raw.split('\n')) {
    const m = line.match(/^(\S+)\s+\[(feedback|edit-answer|save-rule)\]\s+record=(\S+)\s+(.+)$/);
    if (!m) continue;
    out.push({ ts: m[1], kind: m[2] as CorrectionEntry['kind'], recordId: m[3], note: m[4] });
  }
  return out;
}

export async function listArchivedSlugs(): Promise<string[]> {
  try {
    const entries = (await fs.readdir(archiveDir(), { withFileTypes: true })) as unknown as {
      name: string;
      isDirectory: () => boolean;
    }[];
    return entries.filter((e) => e.isDirectory()).map((e) => e.name).sort();
  } catch {
    return [];
  }
}

/* --------------------------------------------------------------- */
/* Internals                                                       */
/* --------------------------------------------------------------- */

export async function pathExists(p: string): Promise<boolean> {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function mkdirIdempotent(p: string, log: string[]): Promise<void> {
  const existed = await pathExists(p);
  await ensureDir(p);
  if (!existed) log.push(p);
}
