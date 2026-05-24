#!/usr/bin/env node
/**
 * Afterglow MCP server entry point.
 *
 * Speaks the Model Context Protocol over stdio so Claude Code can register it
 * via:
 *
 *   claude mcp add afterglow npx @daeseoksong/afterglow-mcp
 *
 * The server exposes 24 tools that mirror the slash commands in the design:
 *   - afterglow_init             (/afterglow init)
 *   - afterglow_create           (/afterglow create <slug> …)
 *   - afterglow_list             (/afterglow list)
 *   - afterglow_inspect          (/afterglow inspect <slug>)
 *   - afterglow_ask              (/afterglow ask <slug> "...")
 *   - afterglow_edit             (/afterglow edit <slug> …)
 *   - afterglow_sign             (/afterglow sign <slug> --signer "...")
 *   - afterglow_resume           (/afterglow resume <slug>)
 *   - afterglow_handoff          (/afterglow handoff <slug> --action start|review|status|finalize|abort)
 *   - afterglow_council          (/afterglow council <slugs...> "...")
 *   - afterglow_council_summary  (/afterglow council summary [file])
 *   - afterglow_history          (/afterglow history <slug>)
 *   - afterglow_audit            (/afterglow audit)
 *   - afterglow_recalibrate      (/afterglow recalibrate <slug> [--byTopic])
 *   - afterglow_correct          (/afterglow correct <slug> --action feedback|edit-answer|save-rule|list)
 *   - afterglow_archive          (/afterglow archive <slug> --action archive|restore|list)
 *   - afterglow_version          (/afterglow version <slug> --action list|diff|rollback|tag|snapshot)
 *   - afterglow_access           (/afterglow access <slug> --action list|allow|deny|set-default|check)
 *   - afterglow_interview        (/afterglow interview <slug> --action start|add-question|answer|gap-check|attach|review|annotate|status|list|inspect|finalize|abort|transcribe)
 *   - afterglow_export           (/afterglow export --slugs … | --all)
 *   - afterglow_import           (/afterglow import <path> [--as | --merge | --dryRun | --expectAnchor])
 *   - afterglow_verify           (/afterglow verify <path>)
 *   - afterglow_status           (/afterglow status)
 *   - afterglow_gc               (/afterglow gc --action list|prune-versions|purge-media|purge-archive)
 *
 * It also registers MCP *prompts*, which Claude Code surfaces as slash commands
 * `/mcp__afterglow__<name>` (init · create · sign · resume · list · status ·
 * inspect · ask · edit · handoff · interview · council · export · import · gc).
 * `edit` also supports open (show persona.json path for vim/editor) + revalidate
 * (re-validate a hand-edited persona.json + regenerate system-prompt). Each
 * prompt is a thin typed entry point that expands into a request for Claude to
 * call the matching tool — so users can drive Afterglow by natural language OR
 * directly from the prompt box.
 *
 * `ask`, `council`, `interview gap-check` and `interview suggest-questions` do
 * NOT call an LLM. They return persona + RAG context so Claude in the user's
 * session composes the answer. RAG ranks with BM25, an opt-in dense backend, or
 * (default when dense is on) a hybrid RRF fusion of both.
 *
 * v0.8 adds: a WASM whisper tier for `transcribe --apply` (no native build —
 * @xenova/transformers optionalDependency), opt-in PII masking
 * (AFTERGLOW_PII_REDACT) + encryption-at-rest (AFTERGLOW_ENCRYPTION_KEY) for
 * transcripts, and auto question-suggestion on `interview start`.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { initShape, runInit } from './tools/init.js';
import { createShape, runCreate, type CreateArgs } from './tools/create.js';
import { listShape, runList } from './tools/list.js';
import { inspectShape, runInspect } from './tools/inspect.js';
import { askShape, runAsk } from './tools/ask.js';
import { editShape, runEdit } from './tools/edit.js';
import { signShape, runSign } from './tools/sign.js';
import { councilShape, runCouncil } from './tools/council.js';
import { historyShape, runHistory } from './tools/history.js';
import { auditShape, runAudit } from './tools/audit.js';
import { recalibrateShape, runRecalibrate } from './tools/recalibrate.js';
import { archiveShape, runArchive } from './tools/archive.js';
import { councilSummaryShape, runCouncilSummary } from './tools/council_summary.js';
import { resumeShape, runResume } from './tools/resume.js';
import { handoffShape, runHandoff } from './tools/handoff.js';
import { versionShape, runVersion } from './tools/version.js';
import { accessShape, runAccess } from './tools/access.js';
import { correctShape, runCorrect } from './tools/correct.js';
import { interviewShape, runInterview } from './tools/interview.js';
import { exportShape, runExport } from './tools/export.js';
import { importShape, runImport } from './tools/import.js';
import { verifyShape, runVerify } from './tools/verify.js';
import { statusShape, runStatus } from './tools/status.js';
import { gcShape, runGc } from './tools/gc.js';
import { registerPrompts } from './prompts.js';
import { errorReply, type ToolReply } from './tools/types.js';

const SERVER_VERSION = '0.8.0';

export function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: 'afterglow-mcp',
      version: SERVER_VERSION,
    },
    {
      instructions:
        '퇴사자 에이전트 폴더(~/.claude/afterglow/)를 관리하는 MCP 서버. ' +
        'init → create → handoff(본인 인계 검수) → sign → list → inspect → ask, ' +
        '그리고 edit / resume / council / council_summary / history / audit / recalibrate / correct / archive / version / access, ' +
        '추가로 interview(인계자 주도 다중 인터뷰 + 갭 감지 + 음성·영상 + 전사) / export / import / verify(핫플러그) / status(대시보드) / gc(보존정리) 까지 ' +
        '24 개 도구로 한 사람의 폴더 단위로 페르소나·자료·권한·감사·보관·버전·본인 검수·추가 인터뷰·이식·운영을 다룹니다.',
    },
  );

  server.registerTool(
    'afterglow_init',
    {
      title: 'Afterglow 초기화',
      description:
        '~/.claude/afterglow/ 폴더를 만들고 config.yml · registry.json · councils/ 를 부트스트랩합니다. 이미 초기화된 경우 누락된 항목만 보충합니다.',
      inputSchema: initShape,
    },
    wrap(runInit),
  );

  server.registerTool(
    'afterglow_create',
    {
      title: 'Afterglow — 에이전트 만들기',
      description:
        '한 명의 퇴사자에 대한 폴더(agents/<slug>/)를 새로 만듭니다. persona.json + system-prompt.md + consent.md 가 함께 생성되고, registry.json 에 draft 상태로 등록됩니다. (active 전환은 afterglow_sign)',
      inputSchema: createShape,
    },
    wrap<CreateArgs>(runCreate),
  );

  server.registerTool(
    'afterglow_resume',
    {
      title: 'Afterglow — 재활성화 (재서명 없이)',
      description:
        'paused / draft / learning 상태의 에이전트를 active 로 되돌립니다. consent.md 서명이 이미 유효한데 사용자가 자리를 비웠다 돌아왔을 때 (또는 archive → restore 후) 사용. archived 는 거부 — 먼저 /afterglow archive --action restore 가 필요.',
      inputSchema: resumeShape,
    },
    wrap(runResume),
  );

  server.registerTool(
    'afterglow_sign',
    {
      title: 'Afterglow — 동의서 서명',
      description:
        'consent.md 에 서명 블록을 추가하고 registry.json status 를 draft → active 로 전환합니다. 미서명 에이전트는 ask / council 호출 거부됩니다.',
      inputSchema: signShape,
    },
    wrap(runSign),
  );

  server.registerTool(
    'afterglow_list',
    {
      title: 'Afterglow — 목록',
      description:
        '등록된 모든 에이전트를 표 / JSON 출력. --status (active|learning|paused|draft), --json 지원.',
      inputSchema: listShape,
    },
    wrap(runList),
  );

  server.registerTool(
    'afterglow_inspect',
    {
      title: 'Afterglow — 상세 보기',
      description:
        '한 에이전트의 페르소나·톤·자료·MCP 권한·폴더 경로를 한 화면으로 보여줍니다.',
      inputSchema: inspectShape,
    },
    wrap(runInspect),
  );

  server.registerTool(
    'afterglow_ask',
    {
      title: 'Afterglow — 질문 컨텍스트 빌드',
      description:
        '에이전트의 시스템 프롬프트와 TF-IDF RAG 검색 결과를 묶어 반환합니다. Claude 가 그 컨텍스트로 실제 답변을 생성합니다 — 별도 모델 호출 없음. (active 에이전트만 허용)',
      inputSchema: askShape,
    },
    wrap(runAsk),
  );

  server.registerTool(
    'afterglow_edit',
    {
      title: 'Afterglow — 에이전트 수정',
      description:
        'persona.json 을 부분 수정합니다 (이름·역할·소개·영역·톤·자료·MCP 권한·신뢰도). 변경 시 system-prompt.md 자동 재생성, history.log 와 audit 기록. --dry-run 으로 미리보기 가능.',
      inputSchema: editShape,
    },
    wrap(runEdit),
  );

  server.registerTool(
    'afterglow_council',
    {
      title: 'Afterglow — 합동 회의',
      description:
        '2–6 명의 에이전트를 한 질문에 모아 회의 컨텍스트를 만들고 councils/<timestamp>-<topic>.md 회의록 스켈레톤을 생성합니다. Claude 가 turn 별 발언과 합의를 진행해요.',
      inputSchema: councilShape,
    },
    wrap(runCouncil),
  );

  server.registerTool(
    'afterglow_history',
    {
      title: 'Afterglow — 대화 로그 뷰어',
      description:
        '에이전트의 history.log 를 시간 / 키워드 / 개수로 필터하여 출력합니다. --since / --until / --filter / --limit / --json / --reverse 지원.',
      inputSchema: historyShape,
    },
    wrap(runHistory),
  );

  server.registerTool(
    'afterglow_audit',
    {
      title: 'Afterglow — 감사 로그',
      description:
        '모든 도구 호출이 누적되는 SHA-256 hash-chained audit log 를 보여주고 체인 무결성을 검증합니다.',
      inputSchema: auditShape,
    },
    wrap(runAudit),
  );

  server.registerTool(
    'afterglow_recalibrate',
    {
      title: 'Afterglow — 신뢰도 자동 보정',
      description:
        'history.log 의 사용 패턴(피드백·거절·low-confidence·peer-ask 비율) 을 분석해 페르소나의 confidenceFloor / peerAskThreshold 를 자동 조정합니다. 기본 dry-run, --apply 로 실제 적용. --byTopic 으로 expertise-aware 진단 모드 (자동 적용 안 함).',
      inputSchema: recalibrateShape,
    },
    wrap(runRecalibrate),
  );

  server.registerTool(
    'afterglow_archive',
    {
      title: 'Afterglow — 보관 / 복원',
      description:
        'agents/<slug>/ 와 archive/<slug>/ 사이로 폴더를 옮깁니다. action=archive 는 보관(이후 ask/council 거부), action=restore 는 paused 로 복원(재서명 필요), action=list 는 보관함 슬러그 출력.',
      inputSchema: archiveShape,
    },
    wrap(runArchive),
  );

  server.registerTool(
    'afterglow_handoff',
    {
      title: 'Afterglow — 본인 인계 모드 (self-review onboarding)',
      description:
        '퇴사자 본인이 자기 에이전트의 샘플 질문을 직접 검수합니다. action=start → 질문 생성, action=review → 본인 답변 기록 (keep/edit/decline), action=status → 진행 확인, action=finalize → 본인 서명으로 active 전환, action=abort → 세션 폐기. 동료가 미리 적어둔 questions.txt 도 받을 수 있어요.',
      inputSchema: handoffShape,
    },
    wrap(runHandoff),
  );

  server.registerTool(
    'afterglow_version',
    {
      title: 'Afterglow — 버전 관리',
      description:
        'persona.json 의 버전 히스토리. action=list (모든 버전 + tag), diff (두 버전 비교 또는 한 버전 vs 현재), rollback (해당 버전으로 복원, 현재는 자동 백업), tag (stable / handoff-signed 같은 태그), snapshot (수동 백업). edit / sign / recalibrate apply / handoff finalize 시 자동 스냅샷.',
      inputSchema: versionShape,
    },
    wrap(runVersion),
  );

  server.registerTool(
    'afterglow_access',
    {
      title: 'Afterglow — 호출 권한 관리',
      description:
        'agents/<slug>/access.json 에 user: / role: / team: 단위 allow / deny 리스트와 default 정책. action=list / allow / deny / remove / set-default / check (시뮬레이션). ask 호출 시 caller 인자를 주면 자동 체크.',
      inputSchema: accessShape,
    },
    wrap(runAccess),
  );

  server.registerTool(
    'afterglow_correct',
    {
      title: 'Afterglow — 신뢰도 수동 보정',
      description:
        'ask 결과에 자연어 피드백 (action=feedback "이 부분 다시 써줘"), 답변 라인 직접 편집 (action=edit-answer), 반복 패턴을 규칙으로 저장 (action=save-rule). corrections.log + history.log + audit 에 모두 누적. action=list 로 최근 보정 확인.',
      inputSchema: correctShape,
    },
    wrap(runCorrect),
  );

  server.registerTool(
    'afterglow_council_summary',
    {
      title: 'Afterglow — 회의록 자동 요약 (moderator)',
      description:
        'councils/ 안의 transcript 를 파싱해 참가자 · 결론 · 이견 · 합의 도달 여부 · ping 흐름 · 발언량을 구조화된 요약으로 출력합니다. 파일을 안 주면 가장 최근 회의록을 자동 선택.',
      inputSchema: councilSummaryShape,
    },
    wrap(runCouncilSummary),
  );

  server.registerTool(
    'afterglow_interview',
    {
      title: 'Afterglow — 다중 인터뷰 (인계자 주도)',
      description:
        '인계자(인터뷰어)가 퇴사자(인터뷰이)를 여러 회차에 걸쳐 인터뷰합니다. handoff(본인 1회 셀프검수)와 달리 회차 무제한 — 빠진 부분을 메웁니다. ' +
        'action=start | add-question | answer | gap-check(빠진 부분 자동 감지) | attach(음성·영상) | review(검토 후 인덱싱) | annotate(부재 시 주석) | status | list | inspect | finalize(이중 서명) | abort | transcribe. ' +
        'gap-check 는 LLM 을 호출하지 않고 컨텍스트를 묶어 반환 — Claude 가 후속 질문을 생성합니다.',
      inputSchema: interviewShape,
    },
    wrap(runInterview),
  );

  server.registerTool(
    'afterglow_export',
    {
      title: 'Afterglow — 에이전트 내보내기 (다중)',
      description:
        '하나 이상의 에이전트 폴더를 portable 번들(폴더 + manifest.json + 무결성 해시)로 내보냅니다. slugs(다중) 또는 all=true. 받는 사람은 afterglow_import 로 바로 인식합니다. 번들은 압축해서 전달하거나 폴더째 복사하세요.',
      inputSchema: exportShape,
    },
    wrap(runExport),
  );

  server.registerTool(
    'afterglow_import',
    {
      title: 'Afterglow — 에이전트 가져오기 (핫플러그)',
      description:
        '다른 사용자가 만든 번들/에이전트 폴더를 가져옵니다. 스키마·서명·무결성 해시·심볼릭링크·프롬프트 인젝션을 검증하고 provenance(출처)를 기록합니다. 서명된 에이전트는 active, 미서명은 paused 로. --as(slug 변경) · --merge(인터뷰 병합) · --dryRun · --acceptBrokenChain 지원.',
      inputSchema: importShape,
    },
    wrap(runImport),
  );

  server.registerTool(
    'afterglow_verify',
    {
      title: 'Afterglow — 번들 사전 검증',
      description:
        'import 전에 번들/폴더를 읽기 전용으로 검증합니다. 스키마·서명·무결성·심볼릭링크·인젝션 의심을 체크리스트로 보여주되 로컬 저장소는 건드리지 않습니다.',
      inputSchema: verifyShape,
    },
    wrap(runVerify),
  );

  server.registerTool(
    'afterglow_status',
    {
      title: 'Afterglow — 전체 대시보드',
      description:
        '모든 에이전트의 상태·인터뷰 회차(완료/대기)·검토대기 미디어·import 출처/신뢰도를 한 번에 보여주는 운영 대시보드. 개별 inspect 보완. --json 지원.',
      inputSchema: statusShape,
    },
    wrap(runStatus),
  );

  server.registerTool(
    'afterglow_gc',
    {
      title: 'Afterglow — 보존/정리 (retention)',
      description:
        '오래된 persona 스냅샷 정리(태그 보존), 인터뷰 미디어 원본 삭제(전사본 유지·GDPR), 보관함 영구 삭제. action=list|prune-versions|purge-media|purge-archive. 기본 dry-run, --apply 로 실제 삭제.',
      inputSchema: gcShape,
    },
    wrap(runGc),
  );

  // Slash commands: /mcp__afterglow__<name> in Claude Code's prompt box.
  // Thin typed entry points that route to the tools above.
  registerPrompts(server);

  return server;
}

/**
 * Wrap a typed handler so any thrown error becomes a structured tool reply
 * instead of crashing the server. The runX functions already wrap with
 * safe(), but we double up here so MCP transport errors never surface as
 * un-handled rejections either.
 */
function wrap<TArgs>(handler: (args: TArgs) => Promise<ToolReply>) {
  return async (args: TArgs): Promise<ToolReply> => {
    try {
      return await handler(args);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return errorReply(msg);
    }
  };
}

async function main(): Promise<void> {
  const server = buildServer();
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // stdio handler keeps the event loop alive; this never resolves normally.
}

// Run only when invoked as a script (not when imported by tests).
// pathToFileURL handles Windows/POSIX differences in file:// URLs.
const invokedAsScript =
  process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href;

if (invokedAsScript) {
  main().catch((err) => {
    // Write to stderr; stdout is reserved for MCP frames.
    process.stderr.write(`[afterglow-mcp] fatal: ${err instanceof Error ? err.stack : String(err)}\n`);
    process.exit(1);
  });
}
