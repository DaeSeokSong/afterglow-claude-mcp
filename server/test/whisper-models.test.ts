/**
 * Transcription model management (v0.4): download / list / resolve ggml models.
 * Downloads are exercised against a local mock server (no external network).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';

let tmpRoot: string;
let server: Server | undefined;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-whisper-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
});
afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  delete process.env.AFTERGLOW_WHISPER_MODEL_BASEURL;
  if (server) { server.close(); server = undefined; }
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function startModelServer(): Promise<string> {
  server = createServer((req, res) => {
    // Serve fake "ggml" bytes for any /ggml-*.bin request.
    if (/\/ggml-.*\.bin$/.test(req.url ?? '')) {
      res.writeHead(200, { 'content-type': 'application/octet-stream' });
      res.end(Buffer.from('FAKE-GGML-MODEL-BYTES'));
    } else {
      res.writeHead(404);
      res.end('nope');
    }
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const addr = server!.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

async function bootstrap(slug = 'jiyoon') {
  const { runInit } = await import('../src/tools/init.js');
  const { runCreate } = await import('../src/tools/create.js');
  await runInit({});
  await runCreate({ slug, name: '이지윤', role: '디자이너' } as never);
}

describe('interview transcribe · model management', () => {
  it('downloads a model, lists it, and skips a re-download', async () => {
    await bootstrap();
    process.env.AFTERGLOW_WHISPER_MODEL_BASEURL = await startModelServer();
    const { runInterview } = await import('../src/tools/interview.js');
    const { whisperModelsDir } = await import('../src/storage.js');

    const dl = await runInterview({ action: 'transcribe', slug: 'jiyoon', download: true, model: 'tiny' } as never);
    expect(dl.isError).toBeUndefined();
    expect(dl.content[0].text).toMatch(/다운로드 완료/);
    const st = await stat(join(whisperModelsDir(), 'ggml-tiny.bin'));
    expect(st.isFile()).toBe(true);

    const list = await runInterview({ action: 'transcribe', slug: 'jiyoon', listModels: true } as never);
    expect(list.content[0].text).toMatch(/ggml-tiny\.bin/);

    const again = await runInterview({ action: 'transcribe', slug: 'jiyoon', download: true, model: 'tiny' } as never);
    expect(again.content[0].text).toMatch(/이미 있음|건너뜀/);
  });

  it('rejects an unknown model size', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const r = await runInterview({ action: 'transcribe', slug: 'jiyoon', download: true, model: 'enormous' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/알 수 없는 모델/);
  });

  it('list shows empty state with no models', async () => {
    await bootstrap();
    const { runInterview } = await import('../src/tools/interview.js');
    const r = await runInterview({ action: 'transcribe', slug: 'jiyoon', listModels: true } as never);
    expect(r.content[0].text).toMatch(/다운로드된 모델 없음/);
  });
});
