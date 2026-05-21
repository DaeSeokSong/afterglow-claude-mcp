#!/usr/bin/env node
/**
 * Smoke test the built MCP server over stdio.
 *
 * Spawns dist/index.js, sends an initialize / initialized / tools/list
 * sequence, then exercises one realistic call against every tool:
 *   init → create → sign → list → inspect → edit → ask → council
 *   → history → recalibrate → audit
 *
 * Verifies tool count, names, and that each call returns a content block.
 *
 * Run as: node test/stdio.smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
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

let nextId = 1;
function send(obj) {
  child.stdin.write(JSON.stringify(obj) + '\n');
}
function request(method, params) {
  const id = nextId++;
  return new Promise((resolve) => {
    pending.set(id, resolve);
    send({ jsonrpc: '2.0', id, method, params });
  });
}
function callTool(name, args) {
  return request('tools/call', { name, arguments: args });
}
function assertOk(label, reply) {
  if (!reply?.result || reply.error) {
    throw new Error(`${label} → no result: ${JSON.stringify(reply)}`);
  }
  if (reply.result.isError) {
    const text = reply.result.content?.[0]?.text ?? '(empty)';
    throw new Error(`${label} returned isError:true\n${text}`);
  }
  return reply.result;
}

const EXPECTED_TOOLS = [
  'afterglow_access',
  'afterglow_archive',
  'afterglow_ask',
  'afterglow_audit',
  'afterglow_correct',
  'afterglow_council',
  'afterglow_council_summary',
  'afterglow_create',
  'afterglow_edit',
  'afterglow_handoff',
  'afterglow_history',
  'afterglow_init',
  'afterglow_inspect',
  'afterglow_list',
  'afterglow_recalibrate',
  'afterglow_resume',
  'afterglow_sign',
  'afterglow_version',
];

try {
  const init = await request('initialize', {
    protocolVersion: '2024-11-05',
    capabilities: {},
    clientInfo: { name: 'afterglow-smoke', version: '0.0.2' },
  });
  if (!init?.result?.serverInfo) throw new Error('initialize: no serverInfo');
  if (init.result.serverInfo.name !== 'afterglow-mcp') {
    throw new Error(`wrong server name: ${init.result.serverInfo.name}`);
  }
  send({ jsonrpc: '2.0', method: 'notifications/initialized' });

  const list = await request('tools/list', {});
  const names = (list?.result?.tools ?? []).map((t) => t.name).sort();
  if (JSON.stringify(names) !== JSON.stringify(EXPECTED_TOOLS)) {
    throw new Error(
      `tools mismatch:\n  got      ${JSON.stringify(names)}\n  expected ${JSON.stringify(EXPECTED_TOOLS)}`,
    );
  }

  /* ---------- happy-path call against every tool ---------- */

  assertOk('init', await callTool('afterglow_init', {}));
  assertOk(
    'create',
    await callTool('afterglow_create', {
      slug: 'jiyoon',
      name: '이지윤',
      role: '프로덕트 디자이너',
      expertise: ['디자인'],
    }),
  );
  assertOk(
    'sign',
    await callTool('afterglow_sign', {
      slug: 'jiyoon',
      signer: 'smoke runner',
      note: 'stdio smoke test',
    }),
  );
  assertOk('list', await callTool('afterglow_list', { json: true }));
  assertOk('inspect', await callTool('afterglow_inspect', { slug: 'jiyoon' }));
  assertOk(
    'edit',
    await callTool('afterglow_edit', {
      slug: 'jiyoon',
      bio: '디자인 시스템을 만들었습니다.',
      tone: { humor: 40 },
    }),
  );

  // Plant a tiny knowledge file so ask + council find something
  const kdir = join(tmpRoot, 'agents', 'jiyoon', 'knowledge');
  await mkdir(kdir, { recursive: true });
  await writeFile(
    join(kdir, 'note.md'),
    '온보딩 step 2 설명을 절반으로 줄여서 이탈이 22%에서 9%로 떨어졌어요.',
    'utf8',
  );

  const ask = assertOk(
    'ask',
    await callTool('afterglow_ask', { slug: 'jiyoon', question: '온보딩 step 3 이탈?' }),
  );
  if (!/# 호출 컨텍스트/.test(ask.content[0].text)) {
    throw new Error('ask did not return expected header');
  }

  // Second agent for council
  assertOk(
    'create-2',
    await callTool('afterglow_create', {
      slug: 'jaehoon',
      name: '박재훈',
      role: '백엔드',
      expertise: ['개발'],
    }),
  );
  assertOk('sign-2', await callTool('afterglow_sign', { slug: 'jaehoon', signer: 'smoke runner' }));

  const council = assertOk(
    'council',
    await callTool('afterglow_council', {
      slugs: ['jiyoon', 'jaehoon'],
      question: '온보딩 개선이 결제에 영향?',
    }),
  );
  if (!/Council Brief/.test(council.content[0].text)) {
    throw new Error('council brief missing');
  }

  assertOk('history', await callTool('afterglow_history', { slug: 'jiyoon', json: true }));

  const recal = assertOk(
    'recalibrate',
    await callTool('afterglow_recalibrate', { slug: 'jiyoon' }),
  );
  // We don't assert specific text — small sample so it usually prints "표본 부족"

  // archive + restore round-trip
  const archiveCall = assertOk(
    'archive',
    await callTool('afterglow_archive', { action: 'archive', slug: 'jaehoon' }),
  );
  if (!/보관 완료/.test(archiveCall.content[0].text)) {
    throw new Error('archive: expected 보관 완료');
  }
  const archiveList = assertOk(
    'archive-list',
    await callTool('afterglow_archive', { action: 'list' }),
  );
  if (!/jaehoon/.test(archiveList.content[0].text)) {
    throw new Error('archive list: jaehoon missing');
  }
  const restoreCall = assertOk(
    'restore',
    await callTool('afterglow_archive', { action: 'restore', slug: 'jaehoon' }),
  );
  if (!/복원 완료/.test(restoreCall.content[0].text)) {
    throw new Error('restore: expected 복원 완료');
  }
  // After restore the agent is paused; resume puts it back to active without re-signing.
  const resumeCall = assertOk('resume', await callTool('afterglow_resume', { slug: 'jaehoon' }));
  if (!/활성화/.test(resumeCall.content[0].text)) {
    throw new Error('resume: expected 활성화 in reply');
  }

  // version tool — should at least be able to list (snapshots auto-created by edit/sign earlier).
  const versionList = assertOk(
    'version-list',
    await callTool('afterglow_version', { action: 'list', slug: 'jiyoon' }),
  );
  if (!/versions|버전/.test(versionList.content[0].text)) {
    throw new Error('version list: missing header');
  }

  // access tool — set default deny + add allow rule + check
  assertOk(
    'access-set-default',
    await callTool('afterglow_access', {
      action: 'set-default',
      slug: 'jiyoon',
      defaultPolicy: 'deny',
    }),
  );
  assertOk(
    'access-allow',
    await callTool('afterglow_access', {
      action: 'allow',
      slug: 'jiyoon',
      rule: 'user:smoke',
    }),
  );
  const accessAllow = assertOk(
    'access-check-allow',
    await callTool('afterglow_access', {
      action: 'check',
      slug: 'jiyoon',
      caller: 'user:smoke',
    }),
  );
  if (!/✓ allow/.test(accessAllow.content[0].text)) {
    throw new Error('access check: user:smoke should be allowed');
  }
  const accessDeny = assertOk(
    'access-check-deny',
    await callTool('afterglow_access', {
      action: 'check',
      slug: 'jiyoon',
      caller: 'user:other',
    }),
  );
  if (!/✗ deny/.test(accessDeny.content[0].text)) {
    throw new Error('access check: user:other should be denied under defaultPolicy=deny');
  }
  // Restore default to allow so subsequent calls don't break
  assertOk(
    'access-set-default-back',
    await callTool('afterglow_access', {
      action: 'set-default',
      slug: 'jiyoon',
      defaultPolicy: 'allow',
    }),
  );

  // correct tool — feedback + list
  assertOk(
    'correct-feedback',
    await callTool('afterglow_correct', {
      action: 'feedback',
      slug: 'jiyoon',
      recordId: 'rec-smoke',
      feedback: 'smoke test feedback',
    }),
  );
  const correctList = assertOk(
    'correct-list',
    await callTool('afterglow_correct', { action: 'list', slug: 'jiyoon' }),
  );
  if (!/rec-smoke/.test(correctList.content[0].text)) {
    throw new Error('correct list: missing recently appended record');
  }

  // handoff tool — start + status + abort (a full lifecycle is covered by unit tests)
  // Use a fresh draft agent so we don't disturb jiyoon's state.
  assertOk(
    'handoff-create-draft',
    await callTool('afterglow_create', {
      slug: 'handofftest',
      name: 'Handoff Test',
      role: 'tester',
    }),
  );
  const handoffStart = assertOk(
    'handoff-start',
    await callTool('afterglow_handoff', {
      action: 'start',
      slug: 'handofftest',
      limit: 3,
    }),
  );
  if (!/handoff 세션 시작/.test(handoffStart.content[0].text)) {
    throw new Error('handoff start: expected 세션 시작');
  }
  const handoffStatus = assertOk(
    'handoff-status',
    await callTool('afterglow_handoff', { action: 'status', slug: 'handofftest' }),
  );
  if (!/pending 3/.test(handoffStatus.content[0].text)) {
    throw new Error('handoff status: expected 3 pending');
  }
  assertOk(
    'handoff-abort',
    await callTool('afterglow_handoff', { action: 'abort', slug: 'handofftest' }),
  );

  // council_summary on the latest transcript
  const summary = assertOk(
    'council_summary',
    await callTool('afterglow_council_summary', { json: true }),
  );
  const summaryJson = JSON.parse(summary.content[0].text);
  if (!Array.isArray(summaryJson.participants) || summaryJson.participants.length === 0) {
    throw new Error('council_summary: participants missing');
  }

  const audit = assertOk(
    'audit',
    await callTool('afterglow_audit', { json: true }),
  );
  const auditJson = JSON.parse(audit.content[0].text);
  if (!auditJson.verification?.ok) {
    throw new Error(`audit chain not OK: ${JSON.stringify(auditJson.verification)}`);
  }

  console.log('smoke: OK');
  console.log(`  serverInfo.name    : ${init.result.serverInfo.name}`);
  console.log(`  protocolVersion    : ${init.result.protocolVersion}`);
  console.log(`  tools (${names.length})           : ${names.join(', ')}`);
  console.log(`  audit total        : ${auditJson.total}`);
  console.log(`  audit chain        : ${auditJson.verification?.ok ? 'verified' : 'broken'}`);
  console.log(`  recalibrate output : ${recal.content[0].text.split('\n')[0]}`);
  console.log(`  council summary    : ${summaryJson.participants.length} participants, consensus=${summaryJson.consensusReached}`);
  console.log(`  archive round-trip : archive → list → restore → resume  OK`);
  console.log(`  handoff lifecycle  : start (3 q) → status → abort  OK`);
  console.log(`  access policy      : default deny + user:smoke allow + check OK`);
  console.log(`  correct feedback   : feedback recorded + list shows entry`);
  console.log(`  version list       : ${(versionList.content[0].text.match(/v\d+/g) ?? []).length} snapshot(s) tracked`);
} catch (err) {
  console.error('smoke: FAIL');
  console.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
} finally {
  child.kill();
  await rm(tmpRoot, { recursive: true, force: true });
}
