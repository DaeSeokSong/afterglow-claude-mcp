/**
 * RAG tests (v0.4): BM25 lexical ranking + opt-in dense-vector backend.
 * The dense path is exercised end-to-end against a local mock /embeddings
 * server (real fetch, no external network).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, writeFile, readdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';

let tmpRoot: string;
let server: Server | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-rag-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
});
afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  delete process.env.AFTERGLOW_RAG_BACKEND;
  delete process.env.AFTERGLOW_EMBED_ENDPOINT;
  if (server) { server.close(); server = undefined; }
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function seed(slug = 'jiyoon') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  const { knowledgeDir } = await import('../src/storage.js');
  await runInit({});
  await runCreate({ slug, name: '이지윤', role: '디자이너' } as never);
  const kdir = knowledgeDir(slug);
  await writeFile(join(kdir, 'payment.md'), '결제 fallback 은 토스 우선순위로 처리합니다. 결제 정산은 주 1회.');
  await writeFile(join(kdir, 'onboarding.md'), '온보딩 step 2 설명을 줄여 이탈을 낮췄습니다.');
  return slug;
}

/** Start a mock OpenAI-compatible /embeddings server. Embedding rule:
 *  2-dim vector — [1,0] if the input mentions 결제/payment, else [0,1]. */
async function startMockEmbed(): Promise<string> {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      let input = '';
      try { input = JSON.parse(body).input ?? ''; } catch { /* ignore */ }
      const isPayment = /결제|payment|정산|fallback/i.test(input);
      const embedding = isPayment ? [1, 0.05] : [0.05, 1];
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify({ data: [{ embedding }] }));
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const addr = server!.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

describe('rag · BM25 lexical (default)', () => {
  it('ranks the topically-matching chunk first', async () => {
    await seed();
    const { retrieve } = await import('../src/rag.js');
    const hits = await retrieve('jiyoon', '결제 fallback 우선순위', 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.path).toMatch(/payment\.md/);
  });

  it('returns nothing for an all-stopword / empty query', async () => {
    await seed();
    const { retrieve } = await import('../src/rag.js');
    expect(await retrieve('jiyoon', '   ', 4)).toHaveLength(0);
  });
});

describe('rag · dense backend (opt-in)', () => {
  it('uses the embeddings endpoint, ranks by cosine, and caches vectors', async () => {
    await seed();
    const endpoint = await startMockEmbed();
    process.env.AFTERGLOW_RAG_BACKEND = 'dense';
    process.env.AFTERGLOW_EMBED_ENDPOINT = endpoint;

    const { retrieve } = await import('../src/rag.js');
    const { embeddingsDir } = await import('../src/storage.js');
    const hits = await retrieve('jiyoon', '결제 관련 질문', 2);
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0].chunk.path).toMatch(/payment\.md/); // payment chunk wins on cosine

    // chunk vectors were cached under embeddings/
    const cached = (await readdir(embeddingsDir('jiyoon'))).filter((f) => f.startsWith('vec-'));
    expect(cached.length).toBeGreaterThan(0);
  });

  it('falls back to lexical when dense is requested but no endpoint is set', async () => {
    await seed();
    process.env.AFTERGLOW_RAG_BACKEND = 'dense'; // but no AFTERGLOW_EMBED_ENDPOINT
    const { retrieve } = await import('../src/rag.js');
    const hits = await retrieve('jiyoon', '온보딩 이탈', 2);
    expect(hits.length).toBeGreaterThan(0); // lexical fallback still returns results
    expect(hits[0].chunk.path).toMatch(/onboarding\.md/);
  });
});
