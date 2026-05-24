/**
 * MCP prompts — surfaced by Claude Code as slash commands
 * `/mcp__afterglow__<name>`. These DON'T do work themselves; each one expands
 * into a short user message that asks Claude to call the matching MCP tool with
 * the arguments the user filled in. So the user gets two ways to drive
 * Afterglow: natural language (Claude picks the tool) OR a slash command they
 * invoke directly from the prompt box (with argument hints).
 *
 * Tools remain the source of truth; prompts are thin, typed entry points.
 */
import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

/** Build a GetPromptResult that injects one user-turn instruction. */
function ask(text: string) {
  return { messages: [{ role: 'user' as const, content: { type: 'text' as const, text } }] };
}

/** Render `key="value"` pairs, skipping undefined/empty optionals. */
function kv(pairs: Record<string, string | undefined>): string {
  return Object.entries(pairs)
    .filter(([, v]) => v !== undefined && v !== '')
    .map(([k, v]) => `${k}="${String(v).replace(/"/g, '″')}"`)
    .join(', ');
}

export function registerPrompts(server: McpServer): void {
  /* ---- setup / lifecycle ---- */
  server.registerPrompt(
    'init',
    { title: 'Afterglow: 초기화', description: '~/.claude/afterglow/ 부트스트랩 (afterglow_init)', argsSchema: {} },
    async () => ask('Afterglow `afterglow_init` 도구를 호출해서 초기화해줘.'),
  );

  server.registerPrompt(
    'create',
    {
      title: 'Afterglow: 에이전트 생성',
      description: '퇴사자 에이전트 폴더 생성 (afterglow_create)',
      argsSchema: {
        slug: z.string().describe('짧은 식별자 (소문자/숫자/하이픈). 예: jiyoon'),
        name: z.string().describe('실제 이름. 예: 이지윤'),
        role: z.string().describe('직무 / 부서'),
        tenure: z.string().optional().describe('재직 기간 (선택)'),
        bio: z.string().optional().describe('한 줄 소개 (선택)'),
      },
    },
    async ({ slug, name, role, tenure, bio }) =>
      ask(`Afterglow \`afterglow_create\` 도구를 호출해줘: ${kv({ slug, name, role, tenure, bio })}`),
  );

  server.registerPrompt(
    'sign',
    {
      title: 'Afterglow: 동의서 서명',
      description: 'consent 서명 → active 전환 (afterglow_sign)',
      argsSchema: { slug: z.string().describe('대상 slug'), signer: z.string().describe('서명자 표시명') },
    },
    async ({ slug, signer }) => ask(`Afterglow \`afterglow_sign\` 도구를 호출해줘: ${kv({ slug, signer })}`),
  );

  server.registerPrompt(
    'resume',
    {
      title: 'Afterglow: 재활성화',
      description: 'paused/draft 를 active 로 (afterglow_resume)',
      argsSchema: { slug: z.string().describe('대상 slug') },
    },
    async ({ slug }) => ask(`Afterglow \`afterglow_resume\` 도구를 호출해줘: ${kv({ slug })}`),
  );

  /* ---- daily ---- */
  server.registerPrompt(
    'list',
    {
      title: 'Afterglow: 목록',
      description: '등록된 에이전트 목록 (afterglow_list)',
      argsSchema: { status: z.string().optional().describe('필터: active|learning|paused|draft|archived (선택)') },
    },
    async ({ status }) => ask(`Afterglow \`afterglow_list\` 도구를 호출해줘${status ? `: ${kv({ status })}` : '.'}`),
  );

  server.registerPrompt(
    'status',
    { title: 'Afterglow: 전체 대시보드', description: '모든 에이전트 상태 한눈에 (afterglow_status)', argsSchema: {} },
    async () => ask('Afterglow `afterglow_status` 도구를 호출해서 전체 대시보드를 보여줘.'),
  );

  server.registerPrompt(
    'inspect',
    {
      title: 'Afterglow: 상세 보기',
      description: '한 에이전트 상세 (afterglow_inspect)',
      argsSchema: { slug: z.string().describe('대상 slug') },
    },
    async ({ slug }) => ask(`Afterglow \`afterglow_inspect\` 도구를 호출해줘: ${kv({ slug })}`),
  );

  server.registerPrompt(
    'ask',
    {
      title: 'Afterglow: 질문',
      description: '페르소나로 질문 (afterglow_ask)',
      argsSchema: { slug: z.string().describe('대상 slug'), question: z.string().describe('질문') },
    },
    async ({ slug, question }) => ask(`Afterglow \`afterglow_ask\` 도구를 호출해줘: ${kv({ slug, question })}`),
  );

  server.registerPrompt(
    'edit',
    {
      title: 'Afterglow: 수정',
      description: '페르소나 수정 — 필드 직접 수정 / 에디터로 열기(open) / 직접 수정 재검증(revalidate) (afterglow_edit)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        bio: z.string().optional().describe('한 줄 소개 변경'),
        name: z.string().optional().describe('이름 변경'),
        role: z.string().optional().describe('직무 변경'),
        open: z.string().optional().describe('"true" → vim 등으로 직접 편집할 파일 경로 안내'),
        revalidate: z.string().optional().describe('"true" → 직접 수정한 persona.json 재검증·재생성'),
      },
    },
    async ({ slug, bio, name, role, open, revalidate }) => {
      if (open === 'true') return ask(`Afterglow \`afterglow_edit\` 도구를 호출해줘: slug="${slug}", open=true (에디터로 직접 편집할 파일 경로 안내).`);
      if (revalidate === 'true') return ask(`Afterglow \`afterglow_edit\` 도구를 호출해줘: slug="${slug}", revalidate=true (직접 수정한 persona.json 재검증·재생성).`);
      return ask(`Afterglow \`afterglow_edit\` 도구를 호출해줘: ${kv({ slug, bio, name, role })}`);
    },
  );

  /* ---- handoff / interview ---- */
  server.registerPrompt(
    'handoff',
    {
      title: 'Afterglow: 본인 인계',
      description: '본인 셀프 검수 (afterglow_handoff)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        action: z.string().describe('start | review | status | finalize | abort'),
        signer: z.string().optional().describe('finalize 시 서명자 (선택)'),
      },
    },
    async ({ slug, action, signer }) => ask(`Afterglow \`afterglow_handoff\` 도구를 호출해줘: ${kv({ slug, action, signer })}`),
  );

  server.registerPrompt(
    'interview',
    {
      title: 'Afterglow: 다중 인터뷰',
      description: '인계자 주도 인터뷰 (afterglow_interview)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        action: z.string().describe('start | add-question | answer | gap-check | suggest-questions | attach | finalize | list | inspect | …'),
        session: z.string().optional().describe('회차 id (선택, 예: 001-결제)'),
        title: z.string().optional().describe('start 시 제목 (선택)'),
        interviewer: z.string().optional().describe('start 시 진행자 (선택)'),
      },
    },
    async ({ slug, action, session, title, interviewer }) =>
      ask(`Afterglow \`afterglow_interview\` 도구를 호출해줘: ${kv({ slug, action, session, title, interviewer })}`),
  );

  server.registerPrompt(
    'council',
    {
      title: 'Afterglow: 합동 회의',
      description: '여러 에이전트 회의 (afterglow_council)',
      argsSchema: { slugs: z.string().describe('쉼표로 구분한 slug들. 예: jiyoon,jaehoon'), question: z.string().describe('회의 주제/질문') },
    },
    async ({ slugs, question }) => ask(`Afterglow \`afterglow_council\` 도구를 호출해줘: slugs=[${slugs}], ${kv({ question })}`),
  );

  /* ---- portable / ops ---- */
  server.registerPrompt(
    'export',
    {
      title: 'Afterglow: 내보내기',
      description: '에이전트 번들 내보내기 (afterglow_export)',
      argsSchema: { slugs: z.string().optional().describe('쉼표 구분 slug들 (생략+all=true 가능)'), all: z.string().optional().describe('true 면 전체') },
    },
    async ({ slugs, all }) =>
      ask(`Afterglow \`afterglow_export\` 도구를 호출해줘: ${all === 'true' ? 'all=true' : `slugs=[${slugs ?? ''}]`}`),
  );

  server.registerPrompt(
    'import',
    {
      title: 'Afterglow: 가져오기 (핫플러그)',
      description: '번들/폴더 가져오기 (afterglow_import)',
      argsSchema: {
        input: z.string().describe('번들 또는 에이전트 폴더 경로'),
        expectAnchor: z.string().optional().describe('보낸 사람이 준 앵커 해시 (선택, 위변조 검증)'),
      },
    },
    async ({ input, expectAnchor }) => ask(`Afterglow \`afterglow_import\` 도구를 호출해줘: ${kv({ input, expectAnchor })}`),
  );

  server.registerPrompt(
    'gc',
    {
      title: 'Afterglow: 보존/정리',
      description: '스냅샷/미디어/보관함 정리 (afterglow_gc)',
      argsSchema: {
        action: z.string().describe('list | prune-versions | purge-media | purge-archive'),
        slug: z.string().optional().describe('대상 slug (선택)'),
        apply: z.string().optional().describe('true 면 실제 삭제 (기본 dry-run)'),
      },
    },
    async ({ action, slug, apply }) => ask(`Afterglow \`afterglow_gc\` 도구를 호출해줘: ${kv({ action, slug, apply })}`),
  );

  /* ---- remaining tools (complete coverage) ---- */
  server.registerPrompt(
    'verify',
    {
      title: 'Afterglow: 번들 검증',
      description: 'import 전 읽기전용 사전 검증 (afterglow_verify)',
      argsSchema: { input: z.string().describe('번들 또는 에이전트 폴더 경로') },
    },
    async ({ input }) => ask(`Afterglow \`afterglow_verify\` 도구를 호출해줘: ${kv({ input })}`),
  );

  server.registerPrompt(
    'archive',
    {
      title: 'Afterglow: 보관/복원',
      description: '에이전트 보관·복원·목록 (afterglow_archive)',
      argsSchema: {
        action: z.string().describe('archive | restore | list'),
        slug: z.string().optional().describe('대상 slug (list 는 생략)'),
      },
    },
    async ({ action, slug }) => ask(`Afterglow \`afterglow_archive\` 도구를 호출해줘: ${kv({ action, slug })}`),
  );

  server.registerPrompt(
    'version',
    {
      title: 'Afterglow: 버전 관리',
      description: 'persona 버전 히스토리·롤백·태그 (afterglow_version)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        action: z.string().describe('list | diff | rollback | tag | snapshot'),
        versionA: z.string().optional().describe('diff/rollback/tag 대상 버전 id (예: v3)'),
        tag: z.string().optional().describe('tag 액션의 태그 이름'),
      },
    },
    async ({ slug, action, versionA, tag }) => ask(`Afterglow \`afterglow_version\` 도구를 호출해줘: ${kv({ slug, action, versionA, tag })}`),
  );

  server.registerPrompt(
    'access',
    {
      title: 'Afterglow: 호출 권한',
      description: 'user/role/team allow·deny 정책 (afterglow_access)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        action: z.string().describe('list | allow | deny | remove | set-default | check'),
        rule: z.string().optional().describe('allow/deny/remove 시 규칙 (예: user:ykhyun)'),
        caller: z.string().optional().describe('check 시 호출자 (예: user:ykhyun)'),
      },
    },
    async ({ slug, action, rule, caller }) => ask(`Afterglow \`afterglow_access\` 도구를 호출해줘: ${kv({ slug, action, rule, caller })}`),
  );

  server.registerPrompt(
    'correct',
    {
      title: 'Afterglow: 신뢰도 수동 보정',
      description: 'ask 결과 피드백·답변편집·규칙저장 (afterglow_correct)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        action: z.string().describe('feedback | edit-answer | save-rule | list'),
        feedback: z.string().optional().describe('피드백/규칙 본문'),
        recordId: z.string().optional().describe('대상 ask 레코드 id (선택)'),
      },
    },
    async ({ slug, action, feedback, recordId }) => ask(`Afterglow \`afterglow_correct\` 도구를 호출해줘: ${kv({ slug, action, feedback, recordId })}`),
  );

  server.registerPrompt(
    'history',
    {
      title: 'Afterglow: 대화 로그',
      description: 'history.log 필터 출력 (afterglow_history)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        filter: z.string().optional().describe('키워드 필터 (선택)'),
        limit: z.string().optional().describe('표시 개수 (선택)'),
      },
    },
    async ({ slug, filter, limit }) => ask(`Afterglow \`afterglow_history\` 도구를 호출해줘: ${kv({ slug, filter, limit })}`),
  );

  server.registerPrompt(
    'audit',
    {
      title: 'Afterglow: 감사 로그',
      description: 'hash-chained 감사 로그 + 무결성 검증 (afterglow_audit)',
      argsSchema: {
        slug: z.string().optional().describe('특정 에이전트만 필터 (선택)'),
        fast: z.string().optional().describe('true 면 체크포인트 이후만 검증 (대용량)'),
        checkpoint: z.string().optional().describe('true 면 체크포인트 기록'),
      },
    },
    async ({ slug, fast, checkpoint }) => ask(`Afterglow \`afterglow_audit\` 도구를 호출해줘: ${kv({ slug, fast, checkpoint })}`),
  );

  server.registerPrompt(
    'recalibrate',
    {
      title: 'Afterglow: 신뢰도 자동 보정',
      description: 'history 분석 → confidenceFloor/peerAskThreshold 조정 (afterglow_recalibrate)',
      argsSchema: {
        slug: z.string().describe('대상 slug'),
        byTopic: z.string().optional().describe('true 면 expertise별 진단 모드'),
        apply: z.string().optional().describe('true 면 실제 적용 (기본 dry-run)'),
      },
    },
    async ({ slug, byTopic, apply }) => ask(`Afterglow \`afterglow_recalibrate\` 도구를 호출해줘: ${kv({ slug, byTopic, apply })}`),
  );

  server.registerPrompt(
    'council-summary',
    {
      title: 'Afterglow: 회의록 요약',
      description: 'council 회의록 자동 요약 (afterglow_council_summary)',
      argsSchema: { file: z.string().optional().describe('회의록 파일명 (생략 시 최근 회의록)') },
    },
    async ({ file }) => ask(`Afterglow \`afterglow_council_summary\` 도구를 호출해줘${file ? `: ${kv({ file })}` : ' (가장 최근 회의록).'}`),
  );
}
