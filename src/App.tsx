import { useEffect, useState } from 'react';
import { BrandMark } from './components/ui';
import { TweaksPanel, TweakSection, TweakColor } from './components/TweaksPanel';
import { useTweaks } from './lib/tweaks';
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

export default function App() {
  const [screen, setScreen] = useState<ScreenId>(readScreenFromHash);
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  useEffect(() => {
    document.documentElement.style.setProperty('--brick', t.accent);
    document.documentElement.style.setProperty('--paper', t.paper);
  }, [t.accent, t.paper]);

  useEffect(() => {
    const next = screen === 'overview' ? '' : screen;
    if (window.location.hash.replace('#', '') !== next) {
      window.location.hash = next;
    }
  }, [screen]);

  useEffect(() => {
    const onHash = () => setScreen(readScreenFromHash());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const groups: Group[] = ['intro', 'setup', 'daily', 'multi', 'admin', 'docs'];
  const current = SCREENS.find((s) => s.id === screen);

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
          <div className="topbar-right">
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
    </div>
  );
}
