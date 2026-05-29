/**
 * Tests for the post-v0.9 design-review follow-ups:
 *   - Phase 1: ACL extension to handoff / interview / archive / gc mutators.
 *   - Phase 2 (P3 minimum): Ed25519 signing of bundle manifest + verify/import
 *     surface the signature status (TOFU).
 *   - Phase 3 (P4 minimum): correct --action data-subject-export read-only dump.
 *   - Phase 4: status surfaces per-agent staleness + dense RAG health.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, readFile, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';

let tmpRoot: string;
let cwdRoot: string;
let server: Server | undefined;
const origCwd = process.cwd();
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-v10-'));
  cwdRoot = await mkdtemp(join(tmpdir(), 'afterglow-v10-cwd-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
  process.chdir(cwdRoot);
});
afterEach(async () => {
  process.chdir(origCwd);
  delete process.env.AFTERGLOW_ROOT;
  delete process.env.AFTERGLOW_RAG_BACKEND;
  delete process.env.AFTERGLOW_EMBED_ENDPOINT;
  delete process.env.AFTERGLOW_SIGNER_NAME;
  if (server) { server.close(); server = undefined; }
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
  if (cwdRoot) await rm(cwdRoot, { recursive: true, force: true });
});

async function bootstrap(slug = 'jiyoon', name = '이지윤') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runInit({});
  await runCreate({ slug, name, role: '디자이너' } as never);
  await runSign({ slug, signer: name });
}

/* ----------------------------------------------------------------- */
/* Phase 1 — ACL extension to remaining mutators                    */
/* ----------------------------------------------------------------- */

describe('phase1 · ACL extension', () => {
  it('handoff start is denied when default-deny + no allow rule', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runHandoff } = await import('../src/tools/handoff.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const denied = await runHandoff({ action: 'start', slug: 'jiyoon', limit: 1 } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);
    const ok = await runHandoff({ action: 'status', slug: 'jiyoon' } as never);
    expect(ok.isError).toBeUndefined(); // status is read-only — passes
  });

  it('interview mutators are denied; gap-check (read-only) passes', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runInterview } = await import('../src/tools/interview.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const denied = await runInterview({ action: 'start', slug: 'jiyoon', interviewer: '김', title: 't' } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);
    const list = await runInterview({ action: 'list', slug: 'jiyoon' } as never);
    expect(list.isError).toBeUndefined();
  });

  it('archive action is gated; list (no slug) is not', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runArchive } = await import('../src/tools/archive.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const denied = await runArchive({ action: 'archive', slug: 'jiyoon' } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);
    const list = await runArchive({ action: 'list' } as never);
    expect(list.isError).toBeUndefined();
  });

  it('gc apply=true with a specific slug is gated; dry-run is not', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runGc } = await import('../src/tools/gc.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    // dry-run prune is allowed even under deny policy.
    const dry = await runGc({ action: 'prune-versions', slug: 'jiyoon', keep: 1 } as never);
    expect(dry.isError).toBeUndefined();
    const denied = await runGc({ action: 'prune-versions', slug: 'jiyoon', keep: 1, apply: true } as never);
    expect(denied.isError).toBe(true);
    expect(denied.content[0].text).toMatch(/Access denied/);
  });
});

/* ----------------------------------------------------------------- */
/* Phase 2 — Ed25519 manifest signing                                */
/* ----------------------------------------------------------------- */

describe('phase2 · PKI signing of bundle manifest', () => {
  it('export embeds a valid Ed25519 signature that verify reports', async () => {
    process.env.AFTERGLOW_SIGNER_NAME = 'alice';
    await bootstrap();
    const { runExport } = await import('../src/tools/export.js');
    const { runVerify } = await import('../src/tools/verify.js');

    const ex = await runExport({ all: true } as never);
    expect(ex.isError).toBeUndefined();
    const outDir = ex.content[0].text.match(/위치: (\S+)/)![1];
    const manifestPath = join(outDir, 'manifest.json');
    const m = JSON.parse(await readFile(manifestPath, 'utf8'));
    expect(m.signature).toBeDefined();
    expect(m.signature.alg).toBe('ed25519');
    expect(m.signature.signer).toBe('alice');
    expect(m.signature.publicKey).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(m.signature.signature).toMatch(/^[A-Za-z0-9+/=]+$/);

    const v = await runVerify({ input: outDir } as never);
    expect(v.content[0].text).toMatch(/서명: ✓ 검증 통과/);
    expect(v.content[0].text).toMatch(/alice/);
  });

  it('verify catches a tampered signature and import refuses it', async () => {
    await bootstrap();
    const { runExport } = await import('../src/tools/export.js');
    const { runVerify } = await import('../src/tools/verify.js');
    const { runImport } = await import('../src/tools/import.js');
    const ex = await runExport({ all: true } as never);
    const outDir = ex.content[0].text.match(/위치: (\S+)/)![1];
    const manifestPath = join(outDir, 'manifest.json');
    const m = JSON.parse(await readFile(manifestPath, 'utf8'));
    // Flip one byte in the embedded signature to break verification.
    const sigBuf = Buffer.from(m.signature.signature, 'base64');
    sigBuf[0] ^= 0x42;
    m.signature.signature = sigBuf.toString('base64');
    await writeFile(manifestPath, JSON.stringify(m, null, 2), 'utf8');

    const v = await runVerify({ input: outDir } as never);
    expect(v.content[0].text).toMatch(/서명: ✗ 검증 실패/);

    const refused = await runImport({ input: outDir, as: 'jiyoon-copy' } as never);
    expect(refused.isError).toBe(true);
    expect(refused.content[0].text).toMatch(/서명 검증 실패/);

    const forced = await runImport({ input: outDir, as: 'jiyoon-copy2', acceptBrokenChain: true } as never);
    // forced still proceeds (acceptBrokenChain) but notes the failure.
    expect(forced.content[0].text).toMatch(/서명 검증 ✗ — 강행됨/);
  });

  it('a pre-v0.10 unsigned manifest is accepted as "unsigned" (back-compat)', async () => {
    await bootstrap();
    const { runExport } = await import('../src/tools/export.js');
    const { runVerify } = await import('../src/tools/verify.js');
    const ex = await runExport({ all: true } as never);
    const outDir = ex.content[0].text.match(/위치: (\S+)/)![1];
    const manifestPath = join(outDir, 'manifest.json');
    const m = JSON.parse(await readFile(manifestPath, 'utf8'));
    delete m.signature; // simulate a pre-v0.10 bundle
    await writeFile(manifestPath, JSON.stringify(m, null, 2), 'utf8');
    const v = await runVerify({ input: outDir } as never);
    expect(v.content[0].text).toMatch(/서명: \(없음\)/);
  });
});

/* ----------------------------------------------------------------- */
/* Phase 3 — data-subject-export                                     */
/* ----------------------------------------------------------------- */

describe('phase3 · correct data-subject-export', () => {
  it('returns a structured dump of everything Afterglow holds about the agent', async () => {
    await bootstrap();
    const { runCorrect } = await import('../src/tools/correct.js');
    const { runInterview } = await import('../src/tools/interview.js');
    // Add a tiny bit of activity so the dump has meaningful content.
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: 'r', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    await runCorrect({ action: 'feedback', slug: 'jiyoon', recordId: 'r1', feedback: '정정 메모' } as never);
    await runCorrect({ action: 'record-answer', slug: 'jiyoon', question: '온보딩?', answer: '답', confidence: 80 } as never);

    const dump = await runCorrect({ action: 'data-subject-export', slug: 'jiyoon' } as never);
    expect(dump.isError).toBeUndefined();
    const parsed = JSON.parse(dump.content[0].text);
    expect(parsed.afterglowDataSubjectExport).toBe(1);
    expect(parsed.slug).toBe('jiyoon');
    expect(parsed.persona?.name).toBe('이지윤');
    expect(parsed.consent.signers.length).toBeGreaterThan(0);
    expect(parsed.interviews.count).toBe(1);
    expect(parsed.interviews.sessions[0].sessionId).toBe(sid);
    expect(parsed.history.tail.length).toBeGreaterThan(0);
    expect(parsed.corrections.count).toBeGreaterThanOrEqual(1);
    expect(parsed.recordedAnswers.count).toBe(1);
    expect(parsed.audit.aboutThisAgent).toBeGreaterThan(0);
    expect(Array.isArray(parsed.notes)).toBe(true);
  });

  it('data-subject-export is read-only and not blocked by deny policy', async () => {
    await bootstrap();
    const { runAccess } = await import('../src/tools/access.js');
    const { runCorrect } = await import('../src/tools/correct.js');
    await runAccess({ action: 'set-default', slug: 'jiyoon', defaultPolicy: 'deny' } as never);
    const dump = await runCorrect({ action: 'data-subject-export', slug: 'jiyoon' } as never);
    expect(dump.isError).toBeUndefined();
  });
});

/* ----------------------------------------------------------------- */
/* Phase 4 — status refinements                                      */
/* ----------------------------------------------------------------- */

describe('phase4 · status refinements', () => {
  it('JSON status surfaces lastActivityAt + staleDays per agent', async () => {
    await bootstrap();
    const { runStatus } = await import('../src/tools/status.js');
    const js = JSON.parse((await runStatus({ json: true } as never)).content[0].text);
    const row = js.agents.find((a: { slug: string }) => a.slug === 'jiyoon');
    expect(row).toBeDefined();
    expect(row.lastActivityAt).toBeTypeOf('string');
    expect(row.staleDays).toBeTypeOf('number');
    expect(row.staleDays).toBeLessThan(2);
  });

  it('dense health counter ticks up when the dense endpoint fails', async () => {
    await bootstrap();
    // Configure dense with a non-existent endpoint so embedText returns null.
    process.env.AFTERGLOW_RAG_BACKEND = 'dense';
    process.env.AFTERGLOW_EMBED_ENDPOINT = 'http://127.0.0.1:1/embeddings';
    const { runAsk } = await import('../src/tools/ask.js');
    const { knowledgeDir } = await import('../src/storage.js');
    // Need some knowledge content so retrieve actually invokes the dense path.
    await mkdir(knowledgeDir('jiyoon'), { recursive: true });
    await writeFile(join(knowledgeDir('jiyoon'), 'note.md'), '결제 fallback 정책', 'utf8');
    await runAsk({ slug: 'jiyoon', question: '결제 fallback' } as never);

    const { runStatus } = await import('../src/tools/status.js');
    const js = JSON.parse((await runStatus({ json: true } as never)).content[0].text);
    expect(js.env.denseFailures).toBeGreaterThanOrEqual(1);
    expect(js.env.denseLastError).toBeTruthy();
  });

  it('HTML answer sheet includes the cross-device progress save/load handlers', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { interviewSessionDir } = await import('../src/storage.js');
    const start = await runInterview({ action: 'start', slug: 'jiyoon', title: 't', interviewer: '김', interviewee: '이지윤', mode: 'async' } as never);
    const sid = start.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    await runInterview({ action: 'add-question', slug: 'jiyoon', session: sid, question: 'Q?' } as never);
    await runInterview({ action: 'export-sheet', slug: 'jiyoon', session: sid } as never);
    const html = await readFile(join(interviewSessionDir('jiyoon', sid), `answersheet-${sid}.html`), 'utf8');
    expect(html).toContain('진행 저장(파일)');
    expect(html).toContain('진행 불러오기');
    expect(html).toMatch(/function saveProgress/);
    expect(html).toMatch(/function loadProgress/);
  });
});
