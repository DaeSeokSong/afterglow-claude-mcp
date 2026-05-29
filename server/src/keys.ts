/**
 * Local Ed25519 keypair management + bundle-manifest signing (Phase P3).
 *
 * Each Afterglow install gets a single ed25519 keypair at
 * `~/.claude/afterglow/keys/ed25519.json` — created on first export, reused
 * forever. The PUBLIC key travels inside each exported bundle's manifest, so a
 * receiver can verify the bundle was signed by *this* sender without any
 * out-of-band key exchange (TOFU). When a sender re-exports another bundle
 * later, the same public key reappears, so the receiver can pin & compare.
 *
 * Trust model is intentionally minimal:
 *   - present + verifies → "signed by <signer>, key <fingerprint>".
 *   - present + verification fails → tampering — import refuses by default.
 *   - absent → "unsigned" — old behaviour, neither verified nor refused.
 *
 * Heavyweight PKI (CA trust roots, cross-org signer directories, key
 * rotation) is deliberately out of scope — those need separate design.
 */
import { promises as fs } from 'node:fs';
import { homedir, userInfo } from 'node:os';
import { join, resolve } from 'node:path';
import {
  createHash,
  generateKeyPairSync,
  sign as cryptoSign,
  verify as cryptoVerify,
  createPublicKey,
  type KeyObject,
} from 'node:crypto';

export interface StoredKeyPair {
  alg: 'ed25519';
  /** base64 of the raw 32-byte ed25519 public key (SPKI -> raw). */
  publicKey: string;
  /** base64 of the raw 32-byte ed25519 private seed. */
  privateKey: string;
  signer: string;
  createdAt: string;
}

function rootDir(): string {
  const envRoot = process.env.AFTERGLOW_ROOT;
  if (envRoot) return resolve(envRoot);
  return join(homedir(), '.claude', 'afterglow');
}
function keysDir(): string { return join(rootDir(), 'keys'); }
function keypairPath(): string { return join(keysDir(), 'ed25519.json'); }

/**
 * Load the local keypair, creating it on first call. The `signer` defaults to
 * the OS user name, overridable via `AFTERGLOW_SIGNER_NAME` env or an explicit
 * argument (used by `export --exportedBy`).
 */
export async function loadOrCreateKeyPair(signerOverride?: string): Promise<StoredKeyPair> {
  try {
    const raw = await fs.readFile(keypairPath(), 'utf8');
    const parsed = JSON.parse(raw) as StoredKeyPair;
    if (parsed && parsed.alg === 'ed25519' && parsed.publicKey && parsed.privateKey) {
      // honour an override at sign-time without rewriting the keypair file —
      // the `signer` label is just metadata.
      if (signerOverride && signerOverride.trim() !== '' && signerOverride !== parsed.signer) {
        return { ...parsed, signer: signerOverride };
      }
      return parsed;
    }
  } catch {
    /* fall through to create */
  }
  await fs.mkdir(keysDir(), { recursive: true });
  const { publicKey, privateKey } = generateKeyPairSync('ed25519');
  // Strip SPKI/PKCS8 wrappers to keep the on-disk file small. Node hands back
  // a 32-byte raw seed inside the PKCS8 DER tail; export raw via JWK.
  const pubJwk = publicKey.export({ format: 'jwk' }) as { x: string };
  const prvJwk = privateKey.export({ format: 'jwk' }) as { d: string };
  const stored: StoredKeyPair = {
    alg: 'ed25519',
    publicKey: pubJwk.x,
    privateKey: prvJwk.d,
    signer:
      signerOverride && signerOverride.trim() !== ''
        ? signerOverride
        : (process.env.AFTERGLOW_SIGNER_NAME || userInfo().username || 'unknown'),
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(keypairPath(), JSON.stringify(stored, null, 2) + '\n', { mode: 0o600 });
  return stored;
}

function publicKeyObject(pubB64url: string): KeyObject {
  return createPublicKey({ format: 'jwk', key: { kty: 'OKP', crv: 'Ed25519', x: pubB64url } });
}

/** Sign a JS payload with the local keypair. Returns the base64 signature. */
export async function signPayload(payload: string, kp?: StoredKeyPair): Promise<{ publicKey: string; signature: string; signer: string }> {
  const keys = kp ?? (await loadOrCreateKeyPair());
  const { createPrivateKey } = await import('node:crypto');
  const prv = createPrivateKey({
    format: 'jwk',
    key: { kty: 'OKP', crv: 'Ed25519', x: keys.publicKey, d: keys.privateKey },
  });
  const sig = cryptoSign(null, Buffer.from(payload, 'utf8'), prv);
  return { publicKey: keys.publicKey, signature: sig.toString('base64'), signer: keys.signer };
}

/** Verify a signature using the public key embedded in the bundle (TOFU). */
export function verifyPayload(payload: string, publicKeyB64url: string, signatureB64: string): boolean {
  try {
    const pub = publicKeyObject(publicKeyB64url);
    return cryptoVerify(null, Buffer.from(payload, 'utf8'), pub, Buffer.from(signatureB64, 'base64'));
  } catch {
    return false;
  }
}

/** Short fingerprint of a public key (sha256 → first 19 hex chars), purely
 *  for display. Anyone comparing fingerprints out-of-band gets stronger
 *  assurance than "I just trust the name in the manifest". */
export function fingerprintPublicKey(publicKeyB64url: string): string {
  return createHash('sha256').update(publicKeyB64url).digest('hex').slice(0, 19);
}
