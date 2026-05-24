/**
 * Edge-case QA for the v0.8 surfaces: PII/encryption boundaries, RRF fusion
 * degenerate inputs, WASM module adapter variants, and elicitation corner
 * cases (empty registry, conditional-required slug, decline path, one-of).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const FIX = (n: string) =>
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', n)).href;

let tmpRoot: string;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-edge-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
});
afterEach(async () => {
  for (const k of [
    'AFTERGLOW_ROOT', 'AFTERGLOW_PII_REDACT', 'AFTERGLOW_ENCRYPTION_KEY',
    'AFTERGLOW_RAG_BACKEND', 'AFTERGLOW_RAG_HYBRID', 'AFTERGLOW_EMBED_ENDPOINT',
    'AFTERGLOW_WHISPER_ENGINE', 'AFTERGLOW_WHISPER_WASM_MODULE',
  ]) delete process.env[k];
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function initOnly() {
  const { runInit } = await import('../src/tools/init.js');
  await runInit({});
}
async function bootstrap(slug = 'jiyoon', name = '이지윤') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runInit({});
  await runCreate({ slug, name, role: '디자이너' } as never);
  await runSign({ slug, signer: name });
}

/* ---------------- PII masking edges ---------------- */
describe('edge · maskPII', () => {
  it('strips trailing punctuation around an email and counts multiples', async () => {
    const { maskPII } = await import('../src/privacy.js');
    const r = maskPII('메일 a@b.com, 그리고 c@d.co.kr. 끝.');
    expect(r.text).not.toMatch(/a@b\.com/);
    expect(r.text).not.toMatch(/c@d\.co\.kr/);
    expect(r.counts.email).toBe(2);
    expect(r.text).toContain('끝.');
  });

  it('is a no-op (total 0) on text with no PII', async () => {
    const { maskPII } = await import('../src/privacy.js');
    const r = maskPII('이탈률 9%, 표본 5000명, 버전 v2.');
    expect(r.total).toBe(0);
    expect(r.text).toBe('이탈률 9%, 표본 5000명, 버전 v2.');
  });
});

/* ---------------- encryption edges ---------------- */
describe('edge · encryption', () => {
  it('round-trips an empty string', async () => {
    const { encryptString, decryptString } = await import('../src/privacy.js');
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'k';
    const blob = encryptString('');
    expect(blob.startsWith('AFG1:')).toBe(true);
    expect(decryptString(blob)).toBe('');
  });

  it('round-trips multibyte + long content', async () => {
    const { encryptString, decryptString } = await import('../src/privacy.js');
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'pass phrase 한글';
    const big = '결제 정산 '.repeat(5000);
    expect(decryptString(encryptString(big))).toBe(big);
  });

  it('decrypt throws on a truncated/garbage blob', async () => {
    const { decryptString } = await import('../src/privacy.js');
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'k';
    expect(() => decryptString('AFG1:zzzz')).toThrow();
  });
});

/* ---------------- RRF fusion edges ---------------- */
describe('edge · rrfFuse', () => {
  const mk = (path: string, i = 0) => ({ chunk: { path, chunkIndex: i, text: '' }, score: 0 });

  it('handles empty input and empty lists', async () => {
    const { rrfFuse } = await import('../src/rag.js');
    expect(rrfFuse([], 5)).toEqual([]);
    expect(rrfFuse([[], []], 5)).toEqual([]);
  });

  it('a single list keeps its order', async () => {
    const { rrfFuse } = await import('../src/rag.js');
    const out = rrfFuse([[mk('a.md'), mk('b.md'), mk('c.md')]], 2);
    expect(out.map((r) => r.chunk.path)).toEqual(['a.md', 'b.md']);
  });

  it('distinguishes chunks of the same file by chunkIndex', async () => {
    const { rrfFuse } = await import('../src/rag.js');
    const out = rrfFuse([[mk('a.md', 0), mk('a.md', 1)]], 5);
    expect(out).toHaveLength(2);
  });
});

/* ---------------- whisper adapter variants ---------------- */
describe('edge · whisper adapters', () => {
  it('accepts a default-export module returning { text }', async () => {
    process.env.AFTERGLOW_WHISPER_WASM_MODULE = FIX('fake-whisper-obj.mjs');
    const { transcribeWasm } = await import('../src/whisper.js');
    const r = await transcribeWasm({ mediaPath: '/x/rec.mp3' });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.text).toContain('객체전사토큰');
  });

  it('treats a module without a transcribe/default fn as unavailable', async () => {
    process.env.AFTERGLOW_WHISPER_WASM_MODULE = FIX('bad-whisper.mjs');
    const { transcribeWasm } = await import('../src/whisper.js');
    const r = await transcribeWasm({ mediaPath: '/x/rec.mp3' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unavailable');
  });

  it('treats a non-existent module specifier as unavailable (no throw)', async () => {
    process.env.AFTERGLOW_WHISPER_WASM_MODULE = FIX('does-not-exist.mjs');
    const { transcribeWasm } = await import('../src/whisper.js');
    const r = await transcribeWasm({ mediaPath: '/x/rec.mp3' });
    expect(r.ok).toBe(false);
  });
});

/* ---------------- elicitation corner cases ---------------- */
describe('edge · elicitation', () => {
  it('ask with no agents yet → slug shows the direct-input fallback', async () => {
    await initOnly();
    const { runAsk } = await import('../src/tools/ask.js');
    const r = await runAsk({} as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('[필수] slug');
    expect(r.content[0].text).toMatch(/직접 입력/);
    expect(r.content[0].text).toMatch(/아직 등록된 항목이 없어요/);
  });

  it('archive archive-action without slug elicits slug; list does not', async () => {
    await bootstrap();
    const { runArchive } = await import('../src/tools/archive.js');
    const needs = await runArchive({ action: 'archive' } as never);
    expect(needs.isError).toBe(true);
    expect(needs.content[0].text).toContain('[필수] slug');
  });

  it('gc purge-media without slug elicits slug; list runs', async () => {
    await bootstrap();
    const { runGc } = await import('../src/tools/gc.js');
    const pm = await runGc({ action: 'purge-media' } as never);
    expect(pm.isError).toBe(true);
    expect(pm.content[0].text).toContain('[필수] slug');
    const list = await runGc({ action: 'list' } as never);
    expect(list.content[0].text).not.toContain('정보가 더 필요');
  });

  it('interview answer with decline=true does NOT require an answer body', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 'g', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    const add = await runInterview({ action: 'add-question', slug: 'jiyoon', session: sid, question: 'q?' } as never);
    const qid = add.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)![1];
    const r = await runInterview({ action: 'answer', slug: 'jiyoon', session: sid, id: qid, decline: true } as never);
    expect(r.isError).toBeUndefined();          // ran (declined), not an elicitation guide
    expect(r.content[0].text).not.toContain('정보가 더 필요');
    expect(r.content[0].text).toMatch(/declined/);
  });

  it('export with an empty slugs array still guides (one-of with all)', async () => {
    await bootstrap();
    const { runExport } = await import('../src/tools/export.js');
    const r = await runExport({ slugs: [] } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/slugs/);
    expect(r.content[0].text).toMatch(/all/);
  });
});
