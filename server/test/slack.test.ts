/**
 * afterglow_slack (v0.4) — posts to a Slack Incoming Webhook. Exercised
 * end-to-end against a local mock webhook server (real fetch).
 */
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createServer, type Server } from 'node:http';

let tmpRoot: string;
let server: Server | undefined;
let received: { text?: string } | null = null;
let respondStatus = 200;

beforeEach(async () => {
  tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-slack-'));
  process.env.AFTERGLOW_ROOT = tmpRoot;
  received = null;
  respondStatus = 200;
});
afterEach(async () => {
  delete process.env.AFTERGLOW_ROOT;
  delete process.env.AFTERGLOW_SLACK_WEBHOOK;
  if (server) { server.close(); server = undefined; }
  if (tmpRoot) await rm(tmpRoot, { recursive: true, force: true });
});

async function startWebhook(): Promise<string> {
  server = createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      try { received = JSON.parse(body); } catch { received = null; }
      res.writeHead(respondStatus);
      res.end(respondStatus === 200 ? 'ok' : 'fail');
    });
  });
  await new Promise<void>((resolve) => server!.listen(0, '127.0.0.1', resolve));
  const addr = server!.address();
  const port = typeof addr === 'object' && addr ? addr.port : 0;
  return `http://127.0.0.1:${port}`;
}

async function seedAgent(slug: string, name: string) {
  const { runCreate } = await import('../src/tools/create.js');
  const { runSign } = await import('../src/tools/sign.js');
  await runCreate({ slug, name, role: '디자이너' } as never);
  await runSign({ slug, signer: name });
}

async function init() {
  const { runInit } = await import('../src/tools/init.js');
  await runInit({});
}

describe('afterglow_slack', () => {
  it('errors when no webhook is configured', async () => {
    await init();
    const { runSlack } = await import('../src/tools/slack.js');
    const r = await runSlack({ action: 'test' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/webhook/i);
  });

  it('test posts a ping to the webhook', async () => {
    await init();
    process.env.AFTERGLOW_SLACK_WEBHOOK = await startWebhook();
    const { runSlack } = await import('../src/tools/slack.js');
    const r = await runSlack({ action: 'test', message: '핸드오버 준비됨' } as never);
    expect(r.isError).toBeUndefined();
    expect(received?.text).toMatch(/연결 테스트/);
    expect(received?.text).toMatch(/핸드오버 준비됨/);
  });

  it('digest includes every agent', async () => {
    await init();
    await seedAgent('jiyoon', '이지윤');
    await seedAgent('jaehoon', '박재훈');
    process.env.AFTERGLOW_SLACK_WEBHOOK = await startWebhook();
    const { runSlack } = await import('../src/tools/slack.js');
    const r = await runSlack({ action: 'digest', webhook: process.env.AFTERGLOW_SLACK_WEBHOOK } as never);
    expect(r.isError).toBeUndefined();
    expect(received?.text).toMatch(/상태 요약/);
    expect(received?.text).toMatch(/이지윤/);
    expect(received?.text).toMatch(/박재훈/);
  });

  it('share posts one agent summary with interview count', async () => {
    await init();
    await seedAgent('jiyoon', '이지윤');
    const { runInterview } = await import('../src/tools/interview.js');
    const s = await runInterview({ action: 'start', slug: 'jiyoon', title: '결제', interviewer: '김', interviewee: '이지윤' } as never);
    const sid = s.content[0].text.match(/#(\d{3}[^\s"]*)/)![1];
    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewer', signer: '김' } as never);
    await runInterview({ action: 'finalize', slug: 'jiyoon', session: sid, signRole: 'interviewee', signer: '이지윤' } as never);

    process.env.AFTERGLOW_SLACK_WEBHOOK = await startWebhook();
    const { runSlack } = await import('../src/tools/slack.js');
    const r = await runSlack({ action: 'share', slug: 'jiyoon' } as never);
    expect(r.isError).toBeUndefined();
    expect(received?.text).toMatch(/이지윤/);
    expect(received?.text).toMatch(/인터뷰 1회차/);
  });

  it('surfaces a webhook failure', async () => {
    await init();
    process.env.AFTERGLOW_SLACK_WEBHOOK = await startWebhook();
    respondStatus = 500;
    const { runSlack } = await import('../src/tools/slack.js');
    const r = await runSlack({ action: 'test' } as never);
    expect(r.isError).toBe(true);
    expect(r.content[0].text).toMatch(/전송 실패/);
  });
});
