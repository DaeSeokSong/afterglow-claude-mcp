import type { ScreenId } from '../App';

/**
 * Imperatively change the current screen via hash.
 * App.tsx listens to `hashchange` so a hash mutation is enough.
 */
export function navigate(id: ScreenId): void {
  const next = id === 'overview' ? '' : id;
  if (window.location.hash.replace('#', '') !== next) {
    window.location.hash = next;
  }
}

/**
 * Map a slash-command verb (`init`, `ask`, `correct`, …) to a ScreenId.
 * Two screens have command verbs that differ from their id:
 *   - `correct`      → manualfix
 *   - `recalibrate`  → autofix
 */
const VERB_TO_SCREEN: Record<string, ScreenId> = {
  init: 'init',
  create: 'create',
  handoff: 'handoff',
  list: 'list',
  ask: 'ask',
  inspect: 'inspect',
  edit: 'edit',
  history: 'history',
  council: 'council',
  log: 'log',
  version: 'version',
  access: 'access',
  audit: 'audit',
  correct: 'manualfix',
  recalibrate: 'autofix',
};

/**
 * Extract a ScreenId from a free-form command string.
 * Examples:
 *   "claude /afterglow ask jiyoon \"...\""  → "ask"
 *   "/afterglow inspect jiyoon"             → "inspect"
 *   "edit jiyoon --tone humor=45"           → "edit"
 *   "claude /afterglow recalibrate"         → "autofix"
 *   "list --status active"                  → "list"
 *   "--status active"                       → null
 *
 * Matches:
 *   1) `/afterglow <verb>` anywhere in the string (preferred), or
 *   2) a leading short verb (`ask`, `inspect`, `edit`, …) at the very start.
 */
export function screenForCommand(input: string): ScreenId | null {
  if (!input) return null;
  const trimmed = input.trim();

  // 1) explicit /afterglow <verb>
  const longMatch = trimmed.match(/\/afterglow\s+([a-z-]+)/i);
  if (longMatch) {
    const verb = longMatch[1].toLowerCase();
    return VERB_TO_SCREEN[verb] ?? null;
  }

  // 2) bare verb at start (matches the shorthand used in helper cards)
  const shortMatch = trimmed.match(/^([a-z-]+)\b/i);
  if (shortMatch) {
    const verb = shortMatch[1].toLowerCase();
    return VERB_TO_SCREEN[verb] ?? null;
  }

  return null;
}

/**
 * 18-element ordered list of screens for the command palette.
 * Kept in sync manually with App.tsx's SCREENS array — duplicating is
 * fine since the list is small and changes rarely.
 */
export interface ScreenEntry {
  id: ScreenId;
  label: string;
  cmd: string | null;
  group: string;
  /** Optional single-letter shortcut for `g <key>` navigation. */
  shortcut?: string;
}

export const SCREEN_ENTRIES: ScreenEntry[] = [
  { id: 'overview',  label: '둘러보기',        cmd: '(intro)',                  group: '한눈에',         shortcut: 'o' },
  { id: 'init',      label: '처음 설치',        cmd: '/afterglow init',          group: '셋업 · 인계' },
  { id: 'create',    label: '에이전트 만들기',   cmd: '/afterglow create',        group: '셋업 · 인계',     shortcut: 'c' },
  { id: 'handoff',   label: '본인 인계 모드',    cmd: '/afterglow handoff',       group: '셋업 · 인계' },
  { id: 'list',      label: '목록',             cmd: '/afterglow list',          group: '매일 쓰는 명령',  shortcut: 'l' },
  { id: 'ask',       label: '질문하기',         cmd: '/afterglow ask',           group: '매일 쓰는 명령',  shortcut: 'a' },
  { id: 'inspect',   label: '상세 보기',        cmd: '/afterglow inspect',       group: '매일 쓰는 명령',  shortcut: 'i' },
  { id: 'edit',      label: '에이전트 수정',     cmd: '/afterglow edit',          group: '매일 쓰는 명령',  shortcut: 'e' },
  { id: 'history',   label: '대화 로그 뷰어',    cmd: '/afterglow history',       group: '매일 쓰는 명령',  shortcut: 'h' },
  { id: 'council',   label: '합동 회의',        cmd: '/afterglow council',       group: '에이전트끼리' },
  { id: 'log',       label: '회의록 다시 보기',  cmd: '/afterglow log',           group: '에이전트끼리' },
  { id: 'version',   label: '버전 관리',        cmd: '/afterglow version',       group: '운영 / 관리',     shortcut: 'v' },
  { id: 'access',    label: '권한 관리',        cmd: '/afterglow access',        group: '운영 / 관리' },
  { id: 'audit',     label: '감사 로그',        cmd: '/afterglow audit',         group: '운영 / 관리' },
  { id: 'manualfix', label: '신뢰도 수동 보정',  cmd: '/afterglow correct',       group: '운영 / 관리' },
  { id: 'autofix',   label: '신뢰도 자동 보정',  cmd: '/afterglow recalibrate',   group: '운영 / 관리' },
  { id: 'roadmap',   label: '로드맵',           cmd: null,                       group: '참고' },
  { id: 'ethics',    label: '윤리 가이드',       cmd: null,                       group: '참고' },
];

/** Sequential prev/next based on the SCREEN_ENTRIES order. */
export function neighbor(id: ScreenId, direction: 'prev' | 'next'): ScreenId | null {
  const i = SCREEN_ENTRIES.findIndex((s) => s.id === id);
  if (i < 0) return null;
  const j = direction === 'prev' ? i - 1 : i + 1;
  if (j < 0 || j >= SCREEN_ENTRIES.length) return null;
  return SCREEN_ENTRIES[j].id;
}
