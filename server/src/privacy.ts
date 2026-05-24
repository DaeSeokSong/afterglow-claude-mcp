/**
 * Privacy layer — two opt-in, default-OFF capabilities for the data Afterglow
 * itself writes (interview transcripts + derived text):
 *
 *   - **PII masking** (`AFTERGLOW_PII_REDACT=1`) — scrub emails, phone numbers,
 *     Korean resident-registration numbers, card numbers, IPs and common API
 *     secrets out of a transcript BEFORE it lands on disk / in the RAG index.
 *   - **Encryption at rest** (`AFTERGLOW_ENCRYPTION_KEY=<passphrase>`) —
 *     AES-256-GCM with a per-file scrypt-derived key. Encrypted files carry an
 *     `AFG1:` magic prefix; `readTextMaybeEncrypted` transparently decrypts so
 *     the RAG layer keeps working. With no key set, files stay plaintext and
 *     behaviour is byte-for-byte identical to before (backward compatible).
 *
 * Both are deliberately scoped to text Afterglow authors (transcripts), not to
 * arbitrary user-dropped knowledge files — those are read transparently whether
 * encrypted or not, so a mixed store (some encrypted, some plain) just works.
 */
import { promises as fs } from 'node:fs';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  scryptSync,
} from 'node:crypto';

/* --------------------------------------------------------------- */
/* PII masking                                                     */
/* --------------------------------------------------------------- */

export function redactionEnabled(): boolean {
  return process.env.AFTERGLOW_PII_REDACT === '1';
}

export interface MaskResult {
  text: string;
  counts: Record<string, number>;
  total: number;
}

/**
 * Replace PII spans with category placeholders. Order matters: the broadest
 * pattern (phone) runs LAST so an email / RRN / card isn't half-eaten by it,
 * and each pass operates on the progressively-masked text (placeholders are
 * bracketed Korean labels that later patterns can't re-match).
 */
export function maskPII(input: string): MaskResult {
  const counts: Record<string, number> = {};
  let text = String(input ?? '');

  const apply = (label: string, re: RegExp, placeholder: string): void => {
    let n = 0;
    text = text.replace(re, () => {
      n++;
      return placeholder;
    });
    if (n > 0) counts[label] = (counts[label] ?? 0) + n;
  };

  // Email — before everything (its @ and dots confuse number patterns).
  apply('email', /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+\.[A-Za-z0-9.-]+/g, '[이메일]');

  // Common API secrets / tokens by recognisable prefix (avoid masking every
  // long string — only well-known credential shapes).
  apply(
    'secret',
    /\b(?:sk-[A-Za-z0-9]{16,}|ghp_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|AKIA[0-9A-Z]{16}|xox[baprs]-[A-Za-z0-9-]{10,}|AIza[0-9A-Za-z_-]{20,})\b/g,
    '[토큰]',
  );

  // Korean resident-registration number: 6 digits - 7 digits.
  apply('rrn', /\b\d{6}-\d{7}\b/g, '[주민번호]');

  // Card-like: 13–16 digits in 4-groups (spaces or hyphens) or solid run.
  apply(
    'card',
    /\b(?:\d[ -]?){12,15}\d\b/g,
    '[카드번호]',
  );

  // IPv4.
  apply('ip', /\b(?:\d{1,3}\.){3}\d{1,3}\b/g, '[IP]');

  // Phone — KR (leading 0) or international (+). Requires a leading 0/+ so a
  // bare run of digits (e.g. a count) is not swept up.
  apply(
    'phone',
    /(?:\+\d{1,3}[-.\s]?)?0\d{1,2}[-.\s]?\d{3,4}[-.\s]?\d{4}\b/g,
    '[전화]',
  );

  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  return { text, counts, total };
}

/* --------------------------------------------------------------- */
/* Encryption at rest (AES-256-GCM, scrypt KDF)                    */
/* --------------------------------------------------------------- */

const MAGIC = 'AFG1:';
const SALT_LEN = 16;
const IV_LEN = 12;
const TAG_LEN = 16;

export function encryptionEnabled(): boolean {
  return !!process.env.AFTERGLOW_ENCRYPTION_KEY;
}

export class EncryptionKeyMissingError extends Error {
  constructor() {
    super(
      '암호화된 파일을 읽으려면 AFTERGLOW_ENCRYPTION_KEY 가 필요합니다 (저장 시 쓰던 그 키).',
    );
    this.name = 'EncryptionKeyMissingError';
  }
}

function deriveKey(passphrase: string, salt: Buffer): Buffer {
  // scrypt with default cost — fine for small transcripts, intentionally slow
  // enough to make brute-forcing the passphrase costly.
  return scryptSync(passphrase, salt, 32);
}

export function isEncrypted(s: string): boolean {
  return s.startsWith(MAGIC);
}

/** Encrypt plaintext → `AFG1:<base64(salt|iv|tag|ciphertext)>`. */
export function encryptString(plain: string): string {
  const passphrase = process.env.AFTERGLOW_ENCRYPTION_KEY;
  if (!passphrase) throw new EncryptionKeyMissingError();
  const salt = randomBytes(SALT_LEN);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(passphrase, salt);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([cipher.update(plain, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return MAGIC + Buffer.concat([salt, iv, tag, ct]).toString('base64');
}

/** Decrypt an `AFG1:` blob back to plaintext. Throws on a wrong key (GCM tag
 *  mismatch) or a missing key — never silently returns garbage. */
export function decryptString(blob: string): string {
  const passphrase = process.env.AFTERGLOW_ENCRYPTION_KEY;
  if (!passphrase) throw new EncryptionKeyMissingError();
  const raw = Buffer.from(blob.slice(MAGIC.length).trim(), 'base64');
  if (raw.length < SALT_LEN + IV_LEN + TAG_LEN) {
    throw new Error('암호문 형식이 올바르지 않습니다 (너무 짧음).');
  }
  const salt = raw.subarray(0, SALT_LEN);
  const iv = raw.subarray(SALT_LEN, SALT_LEN + IV_LEN);
  const tag = raw.subarray(SALT_LEN + IV_LEN, SALT_LEN + IV_LEN + TAG_LEN);
  const ct = raw.subarray(SALT_LEN + IV_LEN + TAG_LEN);
  const key = deriveKey(passphrase, salt);
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ct), decipher.final()]).toString('utf8');
}

/* --------------------------------------------------------------- */
/* Transparent read / write                                        */
/* --------------------------------------------------------------- */

/** Read a text file, transparently decrypting if it carries the AFG1 magic.
 *  Plaintext files are returned as-is (backward compatible). */
export async function readTextMaybeEncrypted(path: string): Promise<string> {
  const raw = await fs.readFile(path, 'utf8');
  return isEncrypted(raw) ? decryptString(raw) : raw;
}

/** Write text, encrypting at rest when AFTERGLOW_ENCRYPTION_KEY is set. */
export async function writeTextMaybeEncrypted(path: string, text: string): Promise<void> {
  if (encryptionEnabled()) {
    await fs.writeFile(path, encryptString(text) + '\n', 'utf8');
  } else {
    await fs.writeFile(path, text, 'utf8');
  }
}
