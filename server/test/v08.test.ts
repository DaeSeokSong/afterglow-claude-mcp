/**
 * Tests for v0.8 features:
 *   · PII masking + encryption at rest (privacy.ts)
 *   · WASM whisper engine for transcribe --apply (whisper.ts, injectable module)
 *   · hybrid RAG reranking (RRF fusion in rag.ts)
 *   · suggest-questions auto-ask on interview start
 *   · status dashboard env/security flags
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, type Server } from 'node:http';

const FAKE_WHISPER = pathToFileURL(
  join(dirname(fileURLToPath(import.meta.url)), 'fixtures', 'fake-whisper.mjs'),
).href;

let tmpRoot: string;
let server: Server | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-v8-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
});
afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  delete process.env.AFTERGLOW_PII_REDACT;
  delete process.env.AFTERGLOW_ENCRYPTION_KEY;
  delete process.env.AFTERGLOW_RAG_BACKEND;
  delete process.env.AFTERGLOW_RAG_HYBRID;
  delete process.env.AFTERGLOW_EMBED_ENDPOINT;
  delete process.env.AFTERGLOW_WHISPER_ENGINE;
  delete process.env.AFTERGLOW_WHISPER_WASM_MODULE;
  if (server) { server.close(); server = undefined; }
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function bootstrapAndSign(slug = 'jiyoon', name = '이지윤') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runInit({});
  await runCreate({ slug, name, role: '디자이너', expertise: ['디자인'] } as never);
  await runSign({ slug, signer: name });
}

async function startInterview(slug = 'jiyoon', title = 't', extra: Record<string, unknown> = {}) {
  const { runInterview } = await import('../src/tools/interview.js');
  const s = await runInterview({ action: 'start', slug, title, interviewer: '김', interviewee: '이지윤', ...extra } as never);
  const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
  return { reply: s, sid };
}

/* --------------------------------------------------------------- */
/* PII masking                                                     */
/* --------------------------------------------------------------- */

describe('privacy · maskPII', () => {
  it('masks email / phone / RRN / card but leaves ordinary text intact', async () => {
    const { maskPII } = await import('../src/privacy.js');
    const input =
      '연락처 alice@example.com, 전화 010-1234-5678, 주민번호 900101-1234567, ' +
      '카드 1234-5678-9012-3456. 정산은 주 1회 처리합니다.';
    const { text, counts, total } = maskPII(input);
    expect(text).toContain('[이메일]');
    expect(text).toContain('[전화]');
    expect(text).toContain('[주민번호]');
    expect(text).toContain('[카드번호]');
    expect(text).not.toContain('alice@example.com');
    expect(text).not.toContain('900101-1234567');
    expect(text).toContain('정산은 주 1회 처리합니다'); // ordinary text survives
    expect(counts.email).toBe(1);
    expect(total).toBeGreaterThanOrEqual(4);
  });

  it('does not mask a bare number that is not phone-shaped', async () => {
    const { maskPII } = await import('../src/privacy.js');
    const { text, total } = maskPII('이탈률을 32% 줄였고 표본은 5000 명이었습니다.');
    expect(text).toBe('이탈률을 32% 줄였고 표본은 5000 명이었습니다.');
    expect(total).toBe(0);
  });
});

/* --------------------------------------------------------------- */
/* Encryption at rest                                              */
/* --------------------------------------------------------------- */

describe('privacy · encryption at rest', () => {
  it('round-trips encrypt → decrypt and rejects a wrong key', async () => {
    const { encryptString, decryptString } = await import('../src/privacy.js');
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'correct horse battery staple';
    const blob = encryptString('비밀 인계 메모: 토스 우선순위.');
    expect(blob.startsWith('AFG1:')).toBe(true);
    expect(decryptString(blob)).toBe('비밀 인계 메모: 토스 우선순위.');

    process.env.AFTERGLOW_ENCRYPTION_KEY = 'wrong key';
    expect(() => decryptString(blob)).toThrow();
  });

  it('encryptString throws when no key is configured', async () => {
    const { encryptString } = await import('../src/privacy.js');
    delete process.env.AFTERGLOW_ENCRYPTION_KEY;
    expect(() => encryptString('x')).toThrow();
  });

  it('readTextMaybeEncrypted handles both plaintext and encrypted files', async () => {
    const { writeTextMaybeEncrypted, readTextMaybeEncrypted } = await import('../src/privacy.js');
    const plain = join(tmpRoot, 'plain.txt');
    const enc = join(tmpRoot, 'enc.txt');

    // plaintext (no key)
    await writeTextMaybeEncrypted(plain, '평문 내용');
    expect(await readTextMaybeEncrypted(plain)).toBe('평문 내용');
    expect(await readFile(plain, 'utf8')).toBe('평문 내용'); // really plaintext on disk

    // encrypted (key set)
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'k';
    await writeTextMaybeEncrypted(enc, '암호 내용');
    const onDisk = await readFile(enc, 'utf8');
    expect(onDisk.startsWith('AFG1:')).toBe(true); // ciphertext on disk
    expect(onDisk).not.toContain('암호 내용');
    expect(await readTextMaybeEncrypted(enc)).toBe('암호 내용'); // transparent decrypt

    // reading an encrypted file with no key throws
    delete process.env.AFTERGLOW_ENCRYPTION_KEY;
    await expect(readTextMaybeEncrypted(enc)).rejects.toBeTruthy();
  });
});

/* --------------------------------------------------------------- */
/* Transcript privacy end-to-end (mask + encrypt + RAG-searchable) */
/* --------------------------------------------------------------- */

describe('interview · transcript privacy end-to-end', () => {
  it('redacts PII + encrypts on disk yet stays RAG-searchable via decrypt', async () => {
    process.env.AFTERGLOW_PII_REDACT = '1';
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'offboarding-secret';
    await bootstrapAndSign();
    const { runInterview } = await import('../src/tools/interview.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { agentDir, interviewAttachmentsDir } = await import('../src/storage.js');
    const { sid } = await startInterview();
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);

    const save = await runInterview({
      action: 'transcribe', slug: 'jiyoon', session: sid, file: 'rec.mp3',
      text: '암호화토큰: 대시보드 export 절차 설명. 문의는 bob@corp.com 으로.',
    } as never);
    expect(save.isError).toBeUndefined();
    expect(save.content[0].text).toMatch(/마스킹/);
    expect(save.content[0].text).toMatch(/암호화/);

    // On disk: encrypted (AFG1) and no raw email / no raw token.
    const dir = interviewAttachmentsDir('jiyoon', sid);
    const onDisk = await readFile(join(dir, 'rec.mp3.transcript.md'), 'utf8');
    expect(onDisk.startsWith('AFG1:')).toBe(true);
    expect(onDisk).not.toContain('bob@corp.com');
    expect(onDisk).not.toContain('암호화토큰');

    // ask decrypts transparently → token searchable, email masked out.
    const ask = await runAsk({ slug: 'jiyoon', question: '대시보드 export 절차?' } as never);
    expect(ask.content[0].text).toContain('암호화토큰');
    expect(ask.content[0].text).toContain('[이메일]');
    expect(ask.content[0].text).not.toContain('bob@corp.com');
  });
});

/* --------------------------------------------------------------- */
/* WASM whisper engine                                             */
/* --------------------------------------------------------------- */

describe('whisper · engine selection', () => {
  it('reads AFTERGLOW_WHISPER_ENGINE with auto fallback', async () => {
    const { whisperEngine } = await import('../src/whisper.js');
    delete process.env.AFTERGLOW_WHISPER_ENGINE;
    expect(whisperEngine()).toBe('auto');
    process.env.AFTERGLOW_WHISPER_ENGINE = 'wasm';
    expect(whisperEngine()).toBe('wasm');
    process.env.AFTERGLOW_WHISPER_ENGINE = 'off';
    expect(whisperEngine()).toBe('off');
    process.env.AFTERGLOW_WHISPER_ENGINE = 'nonsense';
    expect(whisperEngine()).toBe('auto');
  });

  it('transcribeWasm reports unavailable when no module/engine is installed', async () => {
    const { transcribeWasm } = await import('../src/whisper.js');
    delete process.env.AFTERGLOW_WHISPER_WASM_MODULE; // no custom module, no xenova
    const r = await transcribeWasm({ mediaPath: '/nope.wav' });
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.reason).toBe('unavailable');
  });
});

describe('interview · transcribe --apply via injected WASM module', () => {
  it('runs the WASM tier, saves the transcript, and it becomes RAG-searchable', async () => {
    process.env.AFTERGLOW_WHISPER_ENGINE = 'wasm';
    process.env.AFTERGLOW_WHISPER_WASM_MODULE = FAKE_WHISPER;
    await bootstrapAndSign();
    const { runInterview } = await import('../src/tools/interview.js');
    const { runAsk } = await import('../src/tools/ask.js');
    const { agentDir } = await import('../src/storage.js');
    const { sid } = await startInterview();
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('AUDIO'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);

    const apply = await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, apply: true, file: 'rec.mp3' } as never);
    expect(apply.isError).toBeUndefined();
    expect(apply.content[0].text).toMatch(/전사 완료/);
    expect(apply.content[0].text).toMatch(/module:/); // engine via injected module

    const ask = await runAsk({ slug: 'jiyoon', question: '대시보드 export 절차?' } as never);
    expect(ask.content[0].text).toContain('와즘전사토큰');
  });

  it('engine=wasm with no engine installed fails gracefully (mentions whisper)', async () => {
    process.env.AFTERGLOW_WHISPER_ENGINE = 'wasm';
    delete process.env.AFTERGLOW_WHISPER_WASM_MODULE;
    await bootstrapAndSign();
    const { runInterview } = await import('../src/tools/interview.js');
    const { agentDir } = await import('../src/storage.js');
    const { sid } = await startInterview();
    await writeFile(join(agentDir('jiyoon'), 'rec.mp3'), Buffer.from('A'));
    await runInterview({ action: 'attach', slug: 'jiyoon', session: sid, file: join(agentDir('jiyoon'), 'rec.mp3'), speakers: ['이지윤'] } as never);
    const r = await runInterview({ action: 'transcribe', slug: 'jiyoon', session: sid, apply: true } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/whisper/i);
  });
});

/* --------------------------------------------------------------- */
/* Hybrid RAG reranking (RRF)                                      */
/* --------------------------------------------------------------- */

async function seedRag(slug = 'jiyoon') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { knowledgeDir } = await import('../src/storage.js');
  await runInit({});
  await runCreate({ slug, name: '이지윤', role: '디자이너' } as never);
  const kdir = knowledgeDir(slug);
  await writeFile(join(kdir, 'payment.md'), '결제 fallback 은 토스 우선순위로 처리합니다. 결제 정산은 주 1회.');
  await writeFile(join(kdir, 'onboarding.md'), '온보딩 step 2 설명을 줄여 이탈을 낮췄습니다.');
}

async function startMockEmbed(): Promise<string> {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let input = '';
      try { input = JSON.parse(body).input ?? ''; } catch { /* ignore */ }
      const isPayment = /결제|payment|정산|fallback/i.test(input);
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ embedding: isPayment ? [1, 0.05] : [0.05, 1] }] }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const addr = server!.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe('rag · RRF fusion', () => {
  it('ranks a chunk found in BOTH lists above one found in a single list', async () => {
    const { rrfFuse } = await import('../src/rag.js');
    const mk = (path: string, i: number) => ({ chunk: { path, chunkIndex: i, text: '' }, score: 0 });
    // list A: [shared, onlyA] ; list B: [onlyB, shared]
    const a = [mk('shared.md', 0), mk('onlyA.md', 0)];
    const b = [mk('onlyB.md', 0), mk('shared.md', 0)];
    const fused = rrfFuse([a, b], 3);
    expect(fused[0].chunk.path).toBe('shared.md'); // present in both → top
  });

  it('hybrid mode fuses dense + lexical and reports ragMode=hybrid', async () => {
    await seedRag();
    const endpoint = await startMockEmbed();
    process.env.AFTERGLOW_RAG_BACKEND = 'dense';
    process.env.AFTERGLOW_EMBED_ENDPOINT = endpoint;
    const { retrieve, ragMode } = await import('../src/rag.js');
    expect(ragMode()).toBe('hybrid');
    const hits = await retrieve('jiyoon', '결제 fallback 우선순위', 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.path).toMatch(/payment\.md/);
  });

  it('AFTERGLOW_RAG_HYBRID=off uses pure dense (ragMode=dense)', async () => {
    process.env.AFTERGLOW_RAG_BACKEND = 'dense';
    process.env.AFTERGLOW_RAG_HYBRID = 'off';
    const { ragMode } = await import('../src/rag.js');
    expect(ragMode()).toBe('dense');
  });
});

/* --------------------------------------------------------------- */
/* suggest-questions auto-ask on start                             */
/* --------------------------------------------------------------- */

describe('interview · auto-suggest on start', () => {
  it('start embeds a suggestion block + a proceed question by default', async () => {
    await bootstrapAndSign();
    const { reply } = await startInterview('jiyoon', '신규회차');
    const t = reply.content[0].text;
    expect(t).toContain('자동 질문 제안');
    expect(t).toMatch(/진행할까요/);
  });

  it('suggest=false suppresses the auto-suggestion block', async () => {
    await bootstrapAndSign();
    const { reply } = await startInterview('jiyoon', '조용회차', { suggest: false });
    expect(reply.content[0].text).not.toContain('자동 질문 제안');
  });

  it('annotation (interviewee absent) interviews skip auto-suggest', async () => {
    await bootstrapAndSign();
    const { runInterview } = await import('../src/tools/interview.js');
    const { writeFollowupConsent } = await import('../src/storage.js');
    // Pre-authorise proxy annotation (normally written by handoff finalize).
    await writeFollowupConsent('jiyoon', {
      allowFollowupInterview: false,
      allowProxyAnnotation: true,
      signedBy: '이지윤',
      signedAt: new Date().toISOString(),
    } as never);
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: '부재주석', interviewer: '김', intervieweeAbsent: true } as never);
    expect(s.isError).toBeUndefined();
    expect(s.content[0].text).not.toContain('자동 질문 제안');
  });
});

/* --------------------------------------------------------------- */
/* status dashboard env flags                                      */
/* --------------------------------------------------------------- */

describe('afterglow_status · env/security flags', () => {
  it('surfaces ragMode, PII, encryption, whisper engine in text + json', async () => {
    process.env.AFTERGLOW_PII_REDACT = '1';
    process.env.AFTERGLOW_ENCRYPTION_KEY = 'k';
    process.env.AFTERGLOW_WHISPER_ENGINE = 'wasm';
    await bootstrapAndSign();
    const { runStatus } = await import('../src/tools/status.js');

    const txt = (await runStatus({} as never)).content[0].text;
    expect(txt).toMatch(/PII마스킹 on/);
    expect(txt).toMatch(/저장암호화 on/);
    expect(txt).toMatch(/whisper wasm/);

    const js = JSON.parse((await runStatus({ json: true } as never)).content[0].text);
    expect(js.env.piiRedaction).toBe(true);
    expect(js.env.encryptionAtRest).toBe(true);
    expect(js.env.whisperEngine).toBe('wasm');
    expect(js.env.ragMode).toBe('lexical');
  });
});
