/**
 * Edge-case QA round 2 — cross-feature combinations (encryption × review ×
 * RAG, WASM × PII × encryption, hybrid × encrypted transcript) and a few more
 * masking / engine / elicitation corners.
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, type Server } from 'node:http';

const FIX = (n: string) =>
  pathToFileURL(join(dirname(fileURLToPath(import.meta.url)), 'fixtures', n)).href;

let tmpRoot: string;
let server: Server | undefined;
beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-edge2-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
});
afterEach(async () => {
  for (const k of [
    'AFTERGLOW_ROOT', 'AFTERGLOW_PII_REDACT', 'AFTERGLOW_ENCRYPTION_KEY',
    'AFTERGLOW_RAG_BACKEND', 'AFTERGLOW_RAG_HYBRID', 'AFTERGLOW_EMBED_ENDPOINT',
    'AFTERGLOW_WHISPER_ENGINE', 'AFTERGLOW_WHISPER_WASM_MODULE',
  ]) delete process.env[k];
  if (server) { server.close(); server = undefined; }
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function bootstrap(slug = 'jiyoon', name = '이지윤') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runInit({});
  await runCreate({ slug, name, role: '디자이너' } as never);
  await runSign({ slug, signer: name });
}
async function startSession(slug = 'jiyoon') {
  const { runInterview } = await import('../src/tools/interview.js');
  const s = await runInterview({ action: 'start', slug, title: 't', interviewer: '김', interviewee: '이지윤' } as never);
  return s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
}

/* ---------- masking precedence / formats ---------- */
describe('edge2 · maskPII precedence', () => {
  it('RRN wins over card for a 6-7 digit pattern', async () => {
    const { maskPII } = await import('../src/privacy.js');
    const r = maskPII('주민번호 900101-1234567 입니다.');
    expect(r.text).toContain('[주민번호]');
    expect(r.text).not.toContain('[카드번호]');
    expect(r.text).not.toContain('900101-1234567');
  });
  it('masks a KR landline number', async () => {
    const { maskPII } = await import('../src/privacy.js');
    const r = maskPII('사무실 02-123-4567 로 연락주세요.');
    expect(r.text).toContain('[전화]');
    expect(r.text).not.toContain('02-123-4567');
  });
});

/* ---------- encryption × reviewRequired × RAG ---------- */
describe('edge2 · encrypted reviewRequired transcript', () => {
  it('held transcript is encrypted, not searchable until review, then searchable', async () => {
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'sek';
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { agentDir, interviewAttachmentsDir } = await import('../src/storage.js');
    const sid = await startSession();
    await writeFile(join(agentDir('jiyoon'), 'v.mp4'), Buffer.from('V'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'v.mp4'), speakers: ['이지윤'], reviewRequired: true } as never);
    await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, file: 'v.mp4', text: '검토대기토큰: 정산 주기 설명.' } as never);

    // On disk: held .pending, encrypted (AFG1), not plaintext.
    const dir = interviewAttachmentsDir('jiyoon', sid);
    const held = await readFile(join(dir, 'v.mp4.transcript.pending'), 'utf8');
    expect(held.startsWith('AFG1:')).toBe(true);

    // Not searchable while held.
    let ask = await runAsk({ slug: 'jiyoon', question: '정산 주기?' } as never);
    expect(ask.content[0].text).not.toContain('검토대기토큰');

    // Review → promotes to .md (still encrypted) → searchable via transparent decrypt.
    await runInterview({ action: 'review', slug: 'jiyoon', session: sid, file: 'v.mp4' } as never);
    const promoted = await readFile(join(dir, 'v.mp4.transcript.md'), 'utf8');
    expect(promoted.startsWith('AFG1:')).toBe(true);
    ask = await runAsk({ slug: 'jiyoon', question: '정산 주기?' } as never);
    expect(ask.content[0].text).toContain('검토대기토큰');
  });
});

/* ---------- WASM × PII × encryption (full apply pipeline) ---------- */
describe('edge2 · transcribe --apply with PII + encryption', () => {
  it('WASM output is masked + encrypted on disk yet searchable', async () => {
    process.env.AFTERGLOW_WHISPER_ENGINE = 'wasm';
    process.env.AFTERGLOW_WHISPER_WASM_MODULE = FIX('fake-whisper-obj.mjs'); // returns 결제 정산 text
    process.env.AFTERGLOW_PII_REDACT = '1';
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'sek2';
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { agentDir, interviewAttachmentsDir } = await import('../src/storage.js');
    const sid = await startSession();
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);

    const apply = await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, apply: true, file: 'rec.mp3' } as never);
    expect(apply.isError).toBeUndefined();
    expect(apply.content[0].text).toMatch(/암호화/);

    const dir = interviewAttachmentsDir('jiyoon', sid);
    const onDisk = await readFile(join(dir, 'rec.mp3.transcript.md'), 'utf8');
    expect(onDisk.startsWith('AFG1:')).toBe(true);          // encrypted at rest

    const ask = await runAsk({ slug: 'jiyoon', question: '결제 정산 절차?' } as never);
    expect(ask.content[0].text).toContain('객체전사토큰');     // decrypted + searchable
  });
});

/* ---------- hybrid RAG over an encrypted transcript ---------- */
describe('edge2 · hybrid RAG + encrypted transcript', () => {
  async function mockEmbed(): Promise<string> {
    server = createServer((req, res) => {
      let body = '';
      req.on('data', (c) => (body += c));
      req.on('end', () => {
        let input = '';
        try { input = JSON.parse(body).input ?? ''; } catch { /* ignore */ }
        const hit = /정산|payment|결제/i.test(input);
        res.writeHead(200, { 'content-type': 'application/json' });
        res.end(JSON.stringify({ data: [{ embedding: hit ? [1, 0.05] : [0.05, 1] }] }));
      });
    });
    await new Promise<void>((r) => server!.listen(0, '127.0.0.1', r));
    const a = server!.address();
    return `http://127.0.0.1:${typeof a === 'object' && a ? a.port : 0}`;
  }

  it('encrypted transcript is retrievable under hybrid mode', async () => {
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'sek3';
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { agentDir } = await import('../src/storage.js');
    const sid = await startSession();
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);
    await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, file: 'rec.mp3', text: '하이브리드토큰: 결제 정산 주기 설명.' } as never);

    const endpoint = await mockEmbed();
    process.env.AFTERGLOW_RAG_BACKEND = 'dense';
    process.env.AFTERGLOW_EMBED_ENDPOINT = endpoint;
    const { retrieve, ragMode } = await import('../src/rag.js');
    expect(ragMode()).toBe('hybrid');
    const hits = await retrieve('jiyoon', '결제 정산', 4);
    const joined = hits.map((h) => h.chunk.text).join(' ');
    expect(joined).toContain('하이브리드토큰');
  });
});

/* ---------- whisper engine off / binary ---------- */
describe('edge2 · whisper engine modes', () => {
  it('engine=off refuses --apply with a clear message (no whisper attempt)', async () => {
    process.env.AFTERGLOW_WHISPER_ENGINE = 'off';
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { agentDir } = await import('../src/storage.js');
    const sid = await startSession();
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);
    const r = await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, apply: true, file: 'rec.mp3' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/off/);
  });

  it('engine=binary with no binary/model fails gracefully (mentions whisper/model)', async () => {
    process.env.AFTERGLOW_WHISPER_ENGINE = 'binary';
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const { agentDir } = await import('../src/storage.js');
    const sid = await startSession();
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);
    const r = await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, apply: true, file: 'rec.mp3' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/whisper|model/i);
  });
});

/* ---------- elicitation: empty-string arg is treated as missing (direct call) ---------- */
describe('edge2 · elicitation empty string', () => {
  it('an empty-string slug is treated as missing and elicited', async () => {
    await bootstrap();
    const { runAsk } = await import('../src/tools/ask.js');
    const r = await runAsk({ slug: '   ', question: '안녕?' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toContain('[필수] slug');
  });
});
