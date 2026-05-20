import { useCallback, useEffect, useRef, useState } from 'react';
import { BrandMark } from './components/ui';
import { TweaksPanel, TweakSection, TweakColor } from './components/TweaksPanel';
import { CommandPalette } from './components/CommandPalette';
import { useTweaks } from './lib/tweaks';
import {
  SCREEN_ENTRIES,
  navigate as navigateScreen,
  neighbor,
  screenForCommand,
} from './lib/navigation';
import { Overview } from './screens/Overview';
import { ScreenInit, ScreenCreate } from './screens/CliInit';
import { ScreenList, ScreenInspect } from './screens/CliView';
import { ScreenAsk, ScreenCouncil, ScreenLog } from './screens/CliChat';
import { ScreenEdit } from './screens/CliEdit';
import {
  ScreenSelfReview,
  ScreenVersion,
  ScreenLogViewer,
  ScreenAccess,
} from './screens/CliFeatures';
import {
  ScreenAudit,
  ScreenManualFix,
  ScreenAutoFix,
} from './screens/CliCompliance';
import { Roadmap } from './screens/Roadmap';
import { Ethics } from './screens/Ethics';

/* ------------------------------------------------------------ */
/* Screen registry                                              */
/* ------------------------------------------------------------ */

export type ScreenId =
  | 'overview'
  | 'init'
  | 'create'
  | 'handoff'
  | 'list'
  | 'ask'
  | 'inspect'
  | 'edit'
  | 'history'
  | 'council'
  | 'log'
  | 'version'
  | 'access'
  | 'audit'
  | 'manualfix'
  | 'autofix'
  | 'roadmap'
  | 'ethics';

type Group = 'intro' | 'setup' | 'daily' | 'multi' | 'admin' | 'docs';

interface ScreenDef {
  id: ScreenId;
  label: string;
  cmd: string | null;
  group: Group;
}

const SCREENS: ScreenDef[] = [
  { id: 'overview', label: '둘러보기', cmd: '(intro)', group: 'intro' },

  { id: 'init', label: '처음 설치', cmd: '/afterglow init', group: 'setup' },
  { id: 'create', label: '에이전트 만들기', cmd: '/afterglow create', group: 'setup' },
  { id: 'handoff', label: '본인 인계 모드', cmd: '/afterglow handoff', group: 'setup' },

  { id: 'list', label: '목록', cmd: '/afterglow list', group: 'daily' },
  { id: 'ask', label: '질문하기', cmd: '/afterglow ask', group: 'daily' },
  { id: 'inspect', label: '상세 보기', cmd: '/afterglow inspect', group: 'daily' },
  { id: 'edit', label: '에이전트 수정', cmd: '/afterglow edit', group: 'daily' },
  { id: 'history', label: '대화 로그 뷰어', cmd: '/afterglow history', group: 'daily' },

  { id: 'council', label: '합동 회의', cmd: '/afterglow council', group: 'multi' },
  { id: 'log', label: '회의록 다시 보기', cmd: '/afterglow log', group: 'multi' },

  { id: 'version', label: '버전 관리', cmd: '/afterglow version', group: 'admin' },
  { id: 'access', label: '권한 관리', cmd: '/afterglow access', group: 'admin' },
  { id: 'audit', label: '감사 로그', cmd: '/afterglow audit', group: 'admin' },
  { id: 'manualfix', label: '신뢰도 수동 보정', cmd: '/afterglow correct', group: 'admin' },
  { id: 'autofix', label: '신뢰도 자동 보정', cmd: '/afterglow recalibrate', group: 'admin' },

  { id: 'roadmap', label: '로드맵', cmd: null, group: 'docs' },
  { id: 'ethics', label: '윤리 가이드', cmd: null, group: 'docs' },
];

const GROUP_LABELS: Record<Group, string> = {
  intro: '한눈에',
  setup: '셋업 · 인계',
  daily: '매일 쓰는 명령',
  multi: '에이전트끼리',
  admin: '운영 / 관리',
  docs: '참고',
};

const SCREEN_IDS = new Set(SCREENS.map((s) => s.id));

const TWEAK_DEFAULTS: { accent: string; paper: string } = {
  accent: '#B5482C',
  paper: '#F2EDDF',
};

const ACCENT_OPTIONS = ['#B5482C', '#1F4A48', '#5A7A3D', '#4A3B6B'];
const PAPER_OPTIONS = ['#F2EDDF', '#F5F0E4', '#EDE6D4', '#FFFFFF'];

/* ------------------------------------------------------------ */
/* App                                                          */
/* ------------------------------------------------------------ */

function isScreenId(value: string): value is ScreenId {
  return SCREEN_IDS.has(value as ScreenId);
}

function readScreenFromHash(): ScreenId {
  const hash = (typeof window !== 'undefined' ? window.location.hash : '').replace('#', '');
  return isScreenId(hash) ? hash : 'overview';
}

/** Detect macOS-style platforms so we can label the palette hint as ⌘K vs Ctrl K. */
const IS_MAC =
  typeof navigator !== 'undefined' && /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent);

export default function App() {
  const [screen, setScreen] = useState<ScreenId>(readScreenFromHash);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [paletteOpen, setPaletteOpen] = useState(false);

  /* Live theme variables */
  useEffect(() => {
    document.documentElement.style.setProperty('--brick', t.accent);
    document.documentElement.style.setProperty('--paper', t.paper);
  }, [t.accent, t.paper]);

  /* Sync hash ← state */
  useEffect(() => {
    const next = screen === 'overview' ? '' : screen;
    if (window.location.hash.replace('#', '') !== next) {
      window.location.hash = next;
    }
  }, [screen]);

  /* Sync state ← hash */
  useEffect(() => {
    const onHash = () => setScreen(readScreenFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  /* ---------------------------------------------------------- */
  /* Click delegation: any `.h-cmd` / `.cli-cmd-link` whose text */
  /* parses to a known screen navigates on click. cli-cmd-link  */
  /* already navigates inline so we only need h-cmd here.       */
  /* ---------------------------------------------------------- */
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement | null;
      if (!target) return;
      const hcmd = target.closest('.h-cmd') as HTMLElement | null;
      if (!hcmd) return;
      const text = hcmd.textContent || '';
      const next = screenForCommand(text);
      if (next) {
        e.preventDefault();
        navigateScreen(next);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  /* ---------------------------------------------------------- */
  /* Keyboard shortcuts                                          */
  /*   - Cmd/Ctrl + K : open command palette                     */
  /*   - g, then letter (within 1.5s) : jump to a screen         */
  /*   - [ / ] : prev / next screen                              */
  /*   - ? : open palette as a help affordance                   */
  /* Shortcuts are suppressed while typing in an input/textarea  */
  /* or while the palette is open.                               */
  /* ---------------------------------------------------------- */
  const gPendingRef = useRef<number | null>(null);

  const isTypingTarget = (el: EventTarget | null): boolean => {
    if (!(el instanceof HTMLElement)) return false;
    const tag = el.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
    if (el.isContentEditable) return true;
    return false;
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Cmd/Ctrl+K toggles the palette regardless of focus context.
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
        e.preventDefault();
        setPaletteOpen((v) => !v);
        return;
      }
      if (paletteOpen) return; // palette owns Esc/Arrows/Enter while open
      if (isTypingTarget(e.target)) return;
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      // `?` opens the palette as well — easy mnemonic for help.
      if (e.key === '?') {
        e.preventDefault();
        setPaletteOpen(true);
        return;
      }

      // Prev/Next via [ and ]
      if (e.key === '[') {
        const prev = neighbor(screen, 'prev');
        if (prev) {
          e.preventDefault();
          navigateScreen(prev);
        }
        return;
      }
      if (e.key === ']') {
        const next = neighbor(screen, 'next');
        if (next) {
          e.preventDefault();
          navigateScreen(next);
        }
        return;
      }

      // `g` + letter
      if (gPendingRef.current !== null) {
        const letter = e.key.toLowerCase();
        const match = SCREEN_ENTRIES.find((s) => s.shortcut === letter);
        if (match) {
          e.preventDefault();
          navigateScreen(match.id);
        }
        window.clearTimeout(gPendingRef.current);
        gPendingRef.current = null;
        return;
      }
      if (e.key === 'g' || e.key === 'G') {
        e.preventDefault();
        gPendingRef.current = window.setTimeout(() => {
          gPendingRef.current = null;
        }, 1500);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      if (gPendingRef.current !== null) {
        window.clearTimeout(gPendingRef.current);
        gPendingRef.current = null;
      }
    };
  }, [paletteOpen, screen]);

  const openPalette = useCallback(() => setPaletteOpen(true), []);
  const closePalette = useCallback(() => setPaletteOpen(false), []);

  const groups: Group[] = ['intro', 'setup', 'daily', 'multi', 'admin', 'docs'];
  const current = SCREENS.find((s) => s.id === screen);

  const prevScreen = neighbor(screen, 'prev');
  const nextScreen = neighbor(screen, 'next');
  const prevLabel = prevScreen ? SCREEN_ENTRIES.find((s) => s.id === prevScreen)?.label : null;
  const nextLabel = nextScreen ? SCREEN_ENTRIES.find((s) => s.id === nextScreen)?.label : null;

  return (
    <div className="app">
      <aside className="sidebar">
        <BrandMark />

        {groups.map((g) => (
          <div key={g} className="nav-group">
            <div className="nav-label">{GROUP_LABELS[g]}</div>
            {SCREENS.filter((s) => s.group === g).map((s) => (
              <button
                key={s.id}
                className={`nav-item ${screen === s.id ? 'active' : ''}`}
                onClick={() => setScreen(s.id)}
              >
                <span>{s.label}</span>
                {s.cmd && <span className="nav-cmd">{s.cmd}</span>}
              </button>
            ))}
          </div>
        ))}

        <div className="sidebar-footer">
          <div className="av">YK</div>
          <div style={{ minWidth: 0 }}>
            <div
              style={{
                fontSize: 12.5,
                color: 'var(--ink)',
                fontWeight: 500,
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis',
              }}
            >
              윤기현
            </div>
            <div style={{ fontSize: 11, color: 'var(--ink-3)' }}>Workspace Admin</div>
          </div>
        </div>
      </aside>

      <main className="main">
        <div className="topbar">
          <div>
            <div className="crumb">{current ? GROUP_LABELS[current.group] : ''}</div>
            <h1>{current?.label}</h1>
          </div>
          <div className="topbar-right" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {prevScreen && (
              <button
                onClick={() => navigateScreen(prevScreen)}
                title={`이전: ${prevLabel ?? ''}  ·  shortcut: [`}
                className="topbar-nav-btn"
                aria-label="이전 화면"
              >
                ←
              </button>
            )}
            {nextScreen && (
              <button
                onClick={() => navigateScreen(nextScreen)}
                title={`다음: ${nextLabel ?? ''}  ·  shortcut: ]`}
                className="topbar-nav-btn"
                aria-label="다음 화면"
              >
                →
              </button>
            )}

            <button
              onClick={openPalette}
              title="명령 팔레트 열기"
              className="topbar-palette-btn"
            >
              <span style={{ fontSize: 12, color: 'var(--ink-3)' }}>화면 검색</span>
              <span
                style={{
                  fontFamily: 'var(--font-mono)',
                  fontSize: 11,
                  color: 'var(--ink-3)',
                  background: 'var(--paper)',
                  border: '1px solid var(--hair)',
                  borderRadius: 4,
                  padding: '1px 5px',
                  marginLeft: 8,
                }}
              >
                {IS_MAC ? '⌘ K' : 'Ctrl K'}
              </span>
            </button>

            {current?.cmd && (
              <span
                className="mono"
                style={{
                  background: 'var(--paper-2)',
                  border: '1px solid var(--hair)',
                  padding: '4px 10px',
                  borderRadius: 6,
                  fontSize: 12,
                  color: 'var(--brick-dark)',
                }}
              >
                claude {current.cmd}
              </span>
            )}
          </div>
        </div>

        <div className="canvas">
          {screen === 'overview' && <Overview onGo={setScreen} />}
          {screen === 'init' && <ScreenInit />}
          {screen === 'create' && <ScreenCreate />}
          {screen === 'handoff' && <ScreenSelfReview />}
          {screen === 'list' && <ScreenList />}
          {screen === 'ask' && <ScreenAsk />}
          {screen === 'inspect' && <ScreenInspect />}
          {screen === 'edit' && <ScreenEdit />}
          {screen === 'history' && <ScreenLogViewer />}
          {screen === 'council' && <ScreenCouncil />}
          {screen === 'log' && <ScreenLog />}
          {screen === 'version' && <ScreenVersion />}
          {screen === 'access' && <ScreenAccess />}
          {screen === 'audit' && <ScreenAudit />}
          {screen === 'manualfix' && <ScreenManualFix />}
          {screen === 'autofix' && <ScreenAutoFix />}
          {screen === 'roadmap' && <Roadmap />}
          {screen === 'ethics' && <Ethics />}
        </div>

        {(prevScreen || nextScreen) && (
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              gap: 12,
              marginTop: 32,
              paddingTop: 18,
              borderTop: '1px solid var(--hair)',
            }}
          >
            {prevScreen ? (
              <button
                className="screen-jump"
                onClick={() => navigateScreen(prevScreen)}
                style={{
                  textAlign: 'left',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em' }}>
                  ← 이전
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink)', marginTop: 2 }}>{prevLabel}</div>
              </button>
            ) : (
              <span />
            )}
            {nextScreen ? (
              <button
                className="screen-jump"
                onClick={() => navigateScreen(nextScreen)}
                style={{
                  textAlign: 'right',
                }}
              >
                <div style={{ fontSize: 11, color: 'var(--ink-4)', letterSpacing: '0.06em' }}>
                  다음 →
                </div>
                <div style={{ fontSize: 14, color: 'var(--ink)', marginTop: 2 }}>{nextLabel}</div>
              </button>
            ) : (
              <span />
            )}
          </div>
        )}
      </main>

      <TweaksPanel title="Tweaks">
        <TweakSection label="색감">
          <TweakColor
            label="액센트"
            options={ACCENT_OPTIONS}
            value={t.accent}
            onChange={(v) => setTweak('accent', v)}
          />
          <TweakColor
            label="배경(종이)"
            options={PAPER_OPTIONS}
            value={t.paper}
            onChange={(v) => setTweak('paper', v)}
          />
        </TweakSection>
      </TweaksPanel>

      {paletteOpen && <CommandPalette onClose={closePalette} />}
    </div>
  );
}
