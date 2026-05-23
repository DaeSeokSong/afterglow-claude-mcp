/**
 * Hash-chained immutable audit log.
 *
 * Every tool call writes a single line to ~/.claude/afterglow/audit.log.
 * Lines are JSON, and each record carries a sha256 over (prev_hash || canonical
 * record body). Tampering with any line breaks the chain on the next verify.
 *
 *   {"seq":1,"ts":"...","prev":"GENESIS","hash":"…64hex…","tool":"afterglow_init", ...}
 *   {"seq":2,"ts":"...","prev":"…hash1…","hash":"…64hex…","tool":"afterglow_create", ...}
 *
 * The chain head doubles as a tamper-evidence anchor; you can copy it
 * elsewhere (signed mail, secrets manager) and detect any post-hoc edit by
 * re-running `verifyChain`.
 */
import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import { dirname, join } from 'node:path';
import { rootDir, withLock } from './storage.js';

export interface AuditRecord {
  seq: number;
  ts: string;
  prev: string;
  hash: string;
  tool: string;
  /** affected agent slug, if any */
  slug?: string;
  /** short, redacted summary of what changed */
  summary: string;
  /** structured metadata (no secrets) */
  meta?: Record<string, unknown>;
}

const GENESIS = 'GENESIS';

export function auditPath(): string {
  return join(rootDir(), 'audit.log');
}

function canonicalBody(rec: Omit<AuditRecord, 'hash'>): string {
  // Deterministic JSON: keys sorted, no whitespace, no Date objects.
  const keys = Object.keys(rec).sort();
  const obj: Record<string, unknown> = {};
  for (const k of keys) obj[k] = (rec as unknown as Record<string, unknown>)[k];
  return JSON.stringify(obj);
}

function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

async function ensureDir(p: string): Promise<void> {
  await fs.mkdir(p, { recursive: true });
}

async function safeReadLines(path: string): Promise<string[]> {
  try {
    const raw = await fs.readFile(path, 'utf8');
    return raw.split('\n').filter((l) => l.trim().length > 0);
  } catch {
    return [];
  }
}

export class AuditCorruptedError extends Error {
  constructor(seq: number | 'unknown', detail: string) {
    super(`audit.log corruption detected at line ~${seq}: ${detail}. Refusing to append.`);
    this.name = 'AuditCorruptedError';
  }
}

/**
 * Return the most-recent record. Throws `AuditCorruptedError` when the tail
 * of the log is malformed — silently skipping a damaged last line would let
 * the next append reuse the previous `seq` / `prev` and quietly break the
 * tamper-evidence chain. Mid-chain corruption is still surfaced by
 * `verifyChain` and does not block appends.
 */
async function lastRecord(): Promise<AuditRecord | null> {
  const lines = await safeReadLines(auditPath());
  if (lines.length === 0) return null;
  try {
    return JSON.parse(lines[lines.length - 1]) as AuditRecord;
  } catch (err) {
    throw new AuditCorruptedError(lines.length, err instanceof Error ? err.message : String(err));
  }
}

export interface AppendInput {
  tool: string;
  slug?: string;
  summary: string;
  meta?: Record<string, unknown>;
}

export async function append(input: AppendInput): Promise<AuditRecord> {
  // Serialise every append against a single global lock. Two concurrent
  // tool calls would otherwise see the same lastRecord() and emit
  // conflicting (seq, prev) — silently breaking the tamper-evidence
  // chain. The lock is held for the whole read-modify-write window.
  return withLock('audit-append', async () => {
    const last = await lastRecord();
    const seq = (last?.seq ?? 0) + 1;
    const prev = last?.hash ?? GENESIS;
    const ts = new Date().toISOString();
    const body: Omit<AuditRecord, 'hash'> = {
      seq,
      ts,
      prev,
      tool: input.tool,
      slug: input.slug,
      summary: input.summary,
      meta: input.meta,
    };
    const hash = sha256Hex(canonicalBody(body));
    const record: AuditRecord = { ...body, hash };
    await ensureDir(dirname(auditPath()));
    await fs.appendFile(auditPath(), JSON.stringify(record) + '\n', 'utf8');
    return record;
  });
}

export interface ChainVerification {
  ok: boolean;
  total: number;
  firstBadSeq?: number;
  reason?: string;
}

export async function verifyChain(): Promise<ChainVerification> {
  const lines = await safeReadLines(auditPath());
  if (lines.length === 0) return { ok: true, total: 0 };
  let prev = GENESIS;
  let expectedSeq = 1;
  for (const line of lines) {
    let rec: AuditRecord;
    try {
      rec = JSON.parse(line) as AuditRecord;
    } catch {
      return {
        ok: false,
        total: lines.length,
        firstBadSeq: expectedSeq,
        reason: 'malformed JSON',
      };
    }
    if (rec.seq !== expectedSeq) {
      return {
        ok: false,
        total: lines.length,
        firstBadSeq: rec.seq,
        reason: `seq mismatch (expected ${expectedSeq}, got ${rec.seq})`,
      };
    }
    if (rec.prev !== prev) {
      return {
        ok: false,
        total: lines.length,
        firstBadSeq: rec.seq,
        reason: 'prev hash mismatch',
      };
    }
    const body: Omit<AuditRecord, 'hash'> = {
      seq: rec.seq,
      ts: rec.ts,
      prev: rec.prev,
      tool: rec.tool,
      slug: rec.slug,
      summary: rec.summary,
      meta: rec.meta,
    };
    const expected = sha256Hex(canonicalBody(body));
    if (rec.hash !== expected) {
      return {
        ok: false,
        total: lines.length,
        firstBadSeq: rec.seq,
        reason: 'hash mismatch (record tampered)',
      };
    }
    prev = rec.hash;
    expectedSeq++;
  }
  return { ok: true, total: lines.length };
}

/* --------------------------------------------------------------- */
/* Checkpoints — incremental verification anchors for large logs    */
/* --------------------------------------------------------------- */

export interface Checkpoint {
  seq: number;
  hash: string;
  ts: string;
}

export function checkpointsPath(): string {
  return join(rootDir(), 'audit.checkpoints.json');
}

export async function readCheckpoints(): Promise<Checkpoint[]> {
  try {
    const raw = await fs.readFile(checkpointsPath(), 'utf8');
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Checkpoint[]) : [];
  } catch {
    return [];
  }
}

/**
 * Record a verified checkpoint at the current chain head. Verifies the FULL
 * chain first — a checkpoint must never anchor a corrupt prefix. Returns the
 * new checkpoint, or throws if the chain doesn't verify.
 */
export async function writeCheckpoint(): Promise<Checkpoint> {
  return withLock('audit-append', async () => {
    const v = await verifyChain();
    if (!v.ok) throw new Error(`Refusing to checkpoint a broken chain: ${v.reason} @ seq=${v.firstBadSeq}`);
    const last = await lastRecord();
    if (!last) throw new Error('Nothing to checkpoint — audit log is empty.');
    const cp: Checkpoint = { seq: last.seq, hash: last.hash, ts: new Date().toISOString() };
    const all = await readCheckpoints();
    all.push(cp);
    await ensureDir(dirname(checkpointsPath()));
    await fs.writeFile(checkpointsPath(), JSON.stringify(all, null, 2) + '\n', 'utf8');
    return cp;
  });
}

export interface FastVerification extends ChainVerification {
  /** seq the verification started from (1 if no checkpoint was used) */
  fromSeq: number;
  usedCheckpoint: boolean;
}

/**
 * Verify only the records AFTER the latest checkpoint, trusting the checkpoint
 * as an anchor. O(tail) instead of O(all) for long logs. Falls back to a full
 * verify when no checkpoint exists. Tampering BEFORE the checkpoint is by
 * design not re-checked here (use verifyChain() for a full audit).
 */
export async function verifyChainFast(): Promise<FastVerification> {
  const cps = await readCheckpoints();
  if (cps.length === 0) {
    const full = await verifyChain();
    return { ...full, fromSeq: 1, usedCheckpoint: false };
  }
  const cp = cps[cps.length - 1];
  const lines = await safeReadLines(auditPath());
  // Parse all; locate the anchor record and verify the tail from it.
  const records: AuditRecord[] = [];
  for (const l of lines) {
    try {
      records.push(JSON.parse(l) as AuditRecord);
    } catch {
      return { ok: false, total: lines.length, firstBadSeq: records.length + 1, reason: 'malformed JSON', fromSeq: cp.seq, usedCheckpoint: true };
    }
  }
  const anchor = records.find((r) => r.seq === cp.seq);
  if (!anchor || anchor.hash !== cp.hash) {
    return { ok: false, total: records.length, firstBadSeq: cp.seq, reason: 'checkpoint anchor mismatch (log diverged from checkpoint)', fromSeq: cp.seq, usedCheckpoint: true };
  }
  let prev = cp.hash;
  let expectedSeq = cp.seq + 1;
  for (const rec of records.filter((r) => r.seq > cp.seq)) {
    if (rec.seq !== expectedSeq) return { ok: false, total: records.length, firstBadSeq: rec.seq, reason: `seq mismatch (expected ${expectedSeq})`, fromSeq: cp.seq, usedCheckpoint: true };
    if (rec.prev !== prev) return { ok: false, total: records.length, firstBadSeq: rec.seq, reason: 'prev hash mismatch', fromSeq: cp.seq, usedCheckpoint: true };
    const body: Omit<AuditRecord, 'hash'> = { seq: rec.seq, ts: rec.ts, prev: rec.prev, tool: rec.tool, slug: rec.slug, summary: rec.summary, meta: rec.meta };
    if (rec.hash !== sha256Hex(canonicalBody(body))) return { ok: false, total: records.length, firstBadSeq: rec.seq, reason: 'hash mismatch (record tampered)', fromSeq: cp.seq, usedCheckpoint: true };
    prev = rec.hash;
    expectedSeq++;
  }
  return { ok: true, total: records.length, fromSeq: cp.seq + 1, usedCheckpoint: true };
}

export async function readAll(): Promise<AuditRecord[]> {
  const lines = await safeReadLines(auditPath());
  const out: AuditRecord[] = [];
  for (const l of lines) {
    try {
      out.push(JSON.parse(l) as AuditRecord);
    } catch {
      /* skip malformed */
    }
  }
  return out;
}
