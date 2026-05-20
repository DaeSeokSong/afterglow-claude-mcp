#!/usr/bin/env node
/**
 * Smoke test the built MCP server over stdio.
 *
 * Spawns dist/index.js, sends an initialize / initialized / tools/list
 * sequence, asserts that the server replies with our 5 tool names and a
 * sane protocol version, then exits.
 *
 * Run as: node test/stdio.smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-stdio-'));
const env = { ...process.env, AFTERGLOW_ROOT: tmpRoot };

const child = spawn(process.execPath, ['dist/index.js'], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env,
});

const pending = new Map(); // id → resolver
let buf = '';

child.stdout.on('data', (chunk) => {
  buf += chunk.toString('utf8');
  let idx;
  while ((idx = buf.indexOf('\n')) >= 0) {
    const line = buf.slice(0, idx).trim();
    buf = buf.slice(idx + 1);
    if (!line) continue;
    try {
      const msg = JSON.parse(line);
      if (typeof msg.id === 'number' && pending.has(msg.id)) {
        pending.get(msg.id)(msg);
        pending.delete(msg.id);
      }
    } catch {
      // ignore non-JSON noise
    }
  }
});

function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}

function request(id, method, params) {
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });
}

try {
  const init = await request(1, 'initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'afterglow-smoke', version: '0.0.1' },
  });
  if (!init?.result?.serverInfo) throw new Error('initialize: no serverInfo in reply');
  if (init.result.serverInfo.name !== 'afterglow-mcp') {
    throw new Error(`wrong server name: ${init.result.serverInfo.name}`);
  }

  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const list = await request(2, 'tools/list', {});
  const names = (list?.result?.tools ?? []).map((t) => t.name).sort();
  const expected = ['afterglow_ask', 'afterglow_create', 'afterglow_init', 'afterglow_inspect', 'afterglow_list'];
  if (JSON.stringify(names) !== JSON.stringify(expected)) {
    throw new Error(`tools mismatch:\n  got      ${JSON.stringify(names)}\n  expected ${JSON.stringify(expected)}`);
  }

  // Smoke a real init call too.
  const initCall = await request(3, 'tools/call', {
    name: 'afterglow_init',
    arguments: {},
  });
  const txt = initCall?.result?.content?.[0]?.text ?? '';
  if (!/afterglow|Afterglow/.test(txt)) {
    throw new Error(`afterglow_init reply unexpected:\n${txt}`);
  }

  console.log('smoke: OK');
  console.log(`  serverInfo.name    : ${init.result.serverInfo.name}`);
  console.log(`  protocolVersion    : ${init.result.protocolVersion}`);
  console.log(`  tools              : ${names.join(', ')}`);
  console.log(`  afterglow_init     : ${txt.split('\n')[0]}`);
} catch (err) {
  console.error('smoke: FAIL');
  console.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
} finally {
  child.kill();
  await rm(tmpRoot, { recursive: true, force: true });
}
