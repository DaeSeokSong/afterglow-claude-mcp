#!/usr/bin/env node
/**
 * Afterglow MCP server entry point.
 *
 * Speaks the Model Context Protocol over stdio so Claude Code can register it
 * via:
 *
 *   claude mcp add afterglow npx @afterglow/mcp-server
 *
 * The server exposes five tools that mirror the slash commands in the design:
 *   - afterglow_init       (`/afterglow init`)
 *   - afterglow_create     (`/afterglow create <slug> …`)
 *   - afterglow_list       (`/afterglow list`)
 *   - afterglow_inspect    (`/afterglow inspect <slug>`)
 *   - afterglow_ask        (`/afterglow ask <slug> "..."`)
 *
 * The "ask" tool intentionally does NOT call an LLM. It loads the agent's
 * persona system prompt and RAG-matched knowledge chunks and returns them as
 * structured text. Claude Code itself composes the actual answer using the
 * user's Claude session, so there is no separate model dependency and no
 * extra inference cost.
 */
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { pathToFileURL } from 'node:url';
import { initShape, runInit } from './tools/init.js';
import { createShape, runCreate, type CreateArgs } from './tools/create.js';
import { listShape, runList } from './tools/list.js';
import { inspectShape, runInspect } from './tools/inspect.js';
import { askShape, runAsk } from './tools/ask.js';
import { errorReply, type ToolReply } from './tools/types.js';

const SERVER_VERSION = '0.1.0';

export function buildServer(): McpServer {
  const server = new McpServer(
    {
      name: 'afterglow-mcp',
      version: SERVER_VERSION,
    },
    {
      instructions:
        '퇴사자 에이전트 폴더(~/.claude/afterglow/)를 관리하는 MCP 서버. ' +
        'init → create → list → inspect → ask 다섯 도구로 한 사람의 폴더 단위로 페르소나와 자료를 다룹니다.',
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
        '한 명의 퇴사자에 대한 폴더(agents/<slug>/)를 새로 만듭니다. persona.json + system-prompt.md + consent.md 가 함께 생성되고, registry.json 에 draft 상태로 등록됩니다.',
      inputSchema: createShape,
    },
    wrap<CreateArgs>(runCreate),
  );

  server.registerTool(
    'afterglow_list',
    {
      title: 'Afterglow — 목록',
      description:
        '등록된 모든 에이전트를 표 형태로 보여줍니다. --status 필터, --json 출력 지원.',
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
        '에이전트의 시스템 프롬프트와 RAG 검색 결과를 묶어 반환합니다. Claude 가 그 컨텍스트로 실제 답변을 생성합니다 — 별도 모델 호출 없음.',
      inputSchema: askShape,
    },
    wrap(runAsk),
  );

  return server;
}

/**
 * Wrap a typed handler so any thrown error becomes a structured tool reply
 * instead of crashing the server.
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
