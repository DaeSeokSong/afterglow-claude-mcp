#!/usr/bin/env node
/**
 * Smoke test the built MCP server over stdio.
 *
 * Spawns dist/index.js, sends an initialize / initialized / tools/list
 * sequence, then exercises one realistic call against every tool:
 *   init → create → sign → list → inspect → edit → ask → council
 *   → history → recalibrate → archive → version → access → correct
 *   → handoff → interview (start→answer→gap-check→dual-sign)
 *   → export → verify → import → status → gc → suggest-questions
 *   → transcribe → audit checkpoint
 *
 * Verifies tool count (24), names, and that each call returns a content block.
 *
 * Run as: node test/stdio.smoke.mjs
 */
import { spawn } from 'node:child_process';
import { mkdtemp, rm, writeFile, mkdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const tmpRoot = await mkdtemp(join(tmpdir(), 'afterglow-stdio-'));
const env = { ...process.env, AFTERGLOW_ROOT: tmpRoot };

// Run the server with cwd=tmpRoot so export/import (which confine paths to the
// process CWD) write their bundles inside the throwaway dir, not the repo.
// dist/index.js must therefore be referenced by absolute path.
const serverDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const entry = join(serverDir, 'dist', 'index.js');

const child = spawn(process.execPath, [entry], {
  stdio: ['pipe', 'pipe', 'inherit'],
  env,
  cwd: tmpRoot,
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
  'afterglow_export',
  'afterglow_gc',
  'afterglow_handoff',
  'afterglow_history',
  'afterglow_import',
  'afterglow_init',
  'afterglow_inspect',
  'afterglow_interview',
  'afterglow_list',
  'afterglow_recalibrate',
  'afterglow_resume',
  'afterglow_sign',
  'afterglow_status',
  'afterglow_verify',
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

  /* ---------- MCP prompts (slash commands /mcp__afterglow__<name>) ---------- */
  const promptsList = await request('prompts/list', {});
  const promptNames = (promptsList?.result?.prompts ?? []).map((p) => p.name);
  for (const expected of ['init', 'create', 'edit', 'ask', 'interview', 'export', 'status']) {
    if (!promptNames.includes(expected)) {
      throw new Error(`prompt missing: ${expected} (got ${JSON.stringify(promptNames)})`);
    }
  }
  const promptGet = await request('prompts/get', {
    name: 'ask',
    arguments: { slug: 'jiyoon', question: '테스트' },
  });
  const promptText = promptGet?.result?.messages?.[0]?.content?.text ?? '';
  if (!/afterglow_ask/.test(promptText)) {
    throw new Error(`prompts/get ask did not route to the tool: ${promptText}`);
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

  /* ---------- interview lifecycle (start → answer → gap-check → dual sign) ---------- */
  const ivStart = assertOk(
    'interview-start',
    await callTool('afterglow_interview', {
      action: 'start',
      slug: 'jiyoon',
      title: '온보딩 보강',
      interviewer: '김후임',
      interviewee: '이지윤',
    }),
  );
  const ivSid = ivStart.content[0].text.match(/#(\d{3}[^\s"]*)/)[1];
  const ivAdd = assertOk(
    'interview-add-question',
    await callTool('afterglow_interview', {
      action: 'add-question',
      slug: 'jiyoon',
      session: ivSid,
      question: 'step 2 설명을 줄인 이유는?',
    }),
  );
  const ivQid = ivAdd.content[0].text.match(/\[(q-[0-9a-f-]+)\]/)[1];
  assertOk(
    'interview-answer',
    await callTool('afterglow_interview', {
      action: 'answer',
      slug: 'jiyoon',
      session: ivSid,
      id: ivQid,
      answer: '인지 부하를 줄이려고 절반으로 줄였어요.',
      source: 'self-typed',
    }),
  );
  const ivGap = assertOk(
    'interview-gap-check',
    await callTool('afterglow_interview', { action: 'gap-check', slug: 'jiyoon', session: ivSid }),
  );
  if (!/internal-contradiction/.test(ivGap.content[0].text)) {
    throw new Error('interview gap-check: missing signal framing');
  }
  assertOk(
    'interview-finalize-interviewer',
    await callTool('afterglow_interview', {
      action: 'finalize',
      slug: 'jiyoon',
      session: ivSid,
      signRole: 'interviewer',
      signer: '김후임',
    }),
  );
  const ivFin = assertOk(
    'interview-finalize-interviewee',
    await callTool('afterglow_interview', {
      action: 'finalize',
      slug: 'jiyoon',
      session: ivSid,
      signRole: 'interviewee',
      signer: '이지윤',
    }),
  );
  if (!/finalized/.test(ivFin.content[0].text)) {
    throw new Error('interview finalize: expected finalized after both signatures');
  }

  /* ---------- export → verify → import (portable hot-plug) ---------- */
  const exportCall = assertOk(
    'export',
    await callTool('afterglow_export', { slugs: ['jiyoon'], exportedBy: 'smoke runner' }),
  );
  const bundlePath = exportCall.content[0].text.match(/위치:\s*(\S+)/)[1];
  const bundleAnchor = exportCall.content[0].text.match(/번들 앵커 해시:\s*(\S+)/)[1];
  const verifyCall = assertOk('verify', await callTool('afterglow_verify', { input: bundlePath }));
  if (!/import 가능|주의가 필요/.test(verifyCall.content[0].text)) {
    throw new Error('verify: missing verdict line');
  }
  const importCall = assertOk(
    'import',
    await callTool('afterglow_import', {
      input: bundlePath,
      as: 'jiyoon-copy',
      trustSigner: '이지윤',
      importedBy: 'smoke runner',
      expectAnchor: bundleAnchor,
    }),
  );
  if (!/✓ 일치/.test(importCall.content[0].text)) {
    throw new Error('import: expected anchor match (✓ 일치)');
  }
  if (!/imported/.test(importCall.content[0].text)) {
    throw new Error('import: expected an imported agent');
  }
  // Imported agent should answer with a provenance banner.
  const askImported = assertOk(
    'ask-imported',
    await callTool('afterglow_ask', { slug: 'jiyoon-copy', question: '온보딩?' }),
  );
  if (!/출처 \(provenance\)/.test(askImported.content[0].text)) {
    throw new Error('ask on imported agent: missing provenance banner');
  }

  /* ---------- v0.3: status · gc · suggest-questions · transcribe · audit checkpoint ---------- */
  const statusCall = assertOk('status', await callTool('afterglow_status', { json: true }));
  const statusJson = JSON.parse(statusCall.content[0].text);
  if (typeof statusJson.totals?.agents !== 'number') throw new Error('status: totals missing');

  const gcList = assertOk('gc-list', await callTool('afterglow_gc', { action: 'list' }));
  if (!/정리 가능 항목/.test(gcList.content[0].text)) throw new Error('gc list: missing header');
  // dry-run prune (no --apply) must not delete anything
  assertOk('gc-prune-dry', await callTool('afterglow_gc', { action: 'prune-versions', slug: 'jiyoon', keep: 1 }));

  const suggest = assertOk(
    'interview-suggest',
    await callTool('afterglow_interview', { action: 'suggest-questions', slug: 'jiyoon' }),
  );
  if (!/신호 A/.test(suggest.content[0].text)) throw new Error('suggest-questions: missing signal framing');

  // transcribe --text round-trip: attach (the interview #001 has none) → save transcript
  const ivStart2 = assertOk(
    'interview-start-2',
    await callTool('afterglow_interview', { action: 'start', slug: 'jiyoon', title: '녹음', interviewer: '김후임', interviewee: '이지윤' }),
  );
  const ivSid2 = ivStart2.content[0].text.match(/#(\d{3}[^\s"]*)/)[1];
  const mediaPath = join(tmpRoot, 'agents', 'jiyoon', 'smoke-clip.mp3');
  await writeFile(mediaPath, Buffer.from('SMOKE-AUDIO'));
  assertOk(
    'interview-attach-2',
    await callTool('afterglow_interview', { action: 'attach', slug: 'jiyoon', session: ivSid2, file: mediaPath, speakers: ['이지윤'] }),
  );
  const tsave = assertOk(
    'interview-transcribe-save',
    await callTool('afterglow_interview', { action: 'transcribe', slug: 'jiyoon', session: ivSid2, file: 'smoke-clip.mp3', text: '스모크전사토큰 내용.' }),
  );
  if (!/저장|polished/.test(tsave.content[0].text)) throw new Error('transcribe --text: expected save');

  // audit checkpoint + fast verify
  const cp = assertOk('audit-checkpoint', await callTool('afterglow_audit', { checkpoint: true, json: true }));
  const cpJson = JSON.parse(cp.content[0].text);
  if (!(cpJson.checkpoints >= 1)) throw new Error('audit checkpoint: not recorded');
  const fast = assertOk('audit-fast', await callTool('afterglow_audit', { fast: true, json: true }));
  if (!JSON.parse(fast.content[0].text).verification?.ok) throw new Error('audit fast verify: not ok');

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
  console.log(`  interview lifecycle: start → answer → gap-check → dual-sign (#${ivSid})  OK`);
  console.log(`  portable hot-plug  : export → verify → import (jiyoon-copy) + anchor + provenance  OK`);
  console.log(`  v0.3 dashboard     : status (${statusJson.totals.agents} agents) + gc list/dry-run  OK`);
  console.log(`  v0.3 suggest/transc: suggest-questions + transcribe --text save  OK`);
  console.log(`  v0.3 audit         : checkpoint (${cpJson.checkpoints}) + fast verify  OK`);
  console.log(`  v0.5 prompts       : ${promptNames.length} slash commands (/mcp__afterglow__*)  OK`);
} catch (err) {
  console.error('smoke: FAIL');
  console.error(err instanceof Error ? err.stack : String(err));
  process.exitCode = 1;
} finally {
  child.kill();
  // Windows holds file handles until the child fully exits, so an immediate
  // rmdir hits EBUSY. Wait for the process to exit (bounded), then clean up
  // best-effort — a temp-dir cleanup failure must not fail an OK smoke run.
  await new Promise((resolve) => {
    if (child.exitCode !== null || child.signalCode !== null) return resolve();
    child.once('exit', resolve);
    setTimeout(resolve, 3000);
  });
  for (let attempt = 0; attempt < 5; attempt++) {
    try {
      await rm(tmpRoot, { recursive: true, force: true });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 300));
    }
  }
}
