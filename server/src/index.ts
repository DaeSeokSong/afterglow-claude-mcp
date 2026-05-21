#!/usr/bin/env node
/**
 * Afterglow MCP server entry point.
 *
 * Speaks the Model Context Protocol over stdio so Claude Code can register it
 * via:
 *
 *   claude mcp add afterglow npx @daeseoksong/afterglow-mcp
 *
 * The server exposes 14 tools that mirror the slash commands in the design:
 *   - afterglow_init             (/afterglow init)
 *   - afterglow_create           (/afterglow create <slug> …)
 *   - afterglow_list             (/afterglow list)
 *   - afterglow_inspect          (/afterglow inspect <slug>)
 *   - afterglow_ask              (/afterglow ask <slug> "...")
 *   - afterglow_edit             (/afterglow edit <slug> …)
 *   - afterglow_sign             (/afterglow sign <slug> --signer "...")
 *   - afterglow_resume           (/afterglow resume <slug>)
 *   - afterglow_council          (/afterglow council <slugs...> "...")
 *   - afterglow_council_summary  (/afterglow council summary [file])
 *   - afterglow_history          (/afterglow history <slug>)
 *   - afterglow_audit            (/afterglow audit)
 *   - afterglow_recalibrate      (/afterglow recalibrate <slug> [--byTopic])
 *   - afterglow_archive          (/afterglow archive <slug> --action archive|restore|list)
 *
 * `ask` and `council` do NOT call an LLM. They return persona + RAG context
 * so Claude in the user's session can compose the actual answer.
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
import { errorReply, type ToolReply } from './tools/types.js';

const SERVER_VERSION = '0.1.3';

export function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: 'afterglow-mcp',
      version: SERVER_VERSION,
    },
    {
      instructions:
        '퇴사자 에이전트 폴더(~/.claude/afterglow/)를 관리하는 MCP 서버. ' +
        'init → create → sign → list → inspect → ask, 그리고 edit / resume / council / council_summary / history / audit / recalibrate / archive 까지 14 개 도구로 한 사람의 폴더 단위로 페르소나·자료·권한·감사·보관을 다룹니다.',
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
    'afterglow_council_summary',
    {
      title: 'Afterglow — 회의록 자동 요약 (moderator)',
      description:
        'councils/ 안의 transcript 를 파싱해 참가자 · 결론 · 이견 · 합의 도달 여부 · ping 흐름 · 발언량을 구조화된 요약으로 출력합니다. 파일을 안 주면 가장 최근 회의록을 자동 선택.',
      inputSchema: councilSummaryShape,
    },
    wrap(runCouncilSummary),
  );

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
