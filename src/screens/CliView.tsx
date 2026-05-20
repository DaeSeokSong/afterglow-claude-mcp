import { useState } from 'react';
import { Terminal, T } from '../components/Terminal';

interface AgentRow {
  slug: string;
  name: string;
  english: string;
  role: string;
  color: number;
  status: 'active' | 'learning' | 'paused' | 'draft';
  trained: string;
  lastCall: string;
  confidence: number | null;
  calls: number;
  expertise?: string[];
  progress?: number;
}

const AGENTS: AgentRow[] = [
  {
    slug: 'jiyoon',
    name: '이지윤',
    english: 'Jiyoon Lee',
    role: 'Product Designer',
    color: 0,
    status: 'active',
    trained: '2025.11.18 14:22',
    lastCall: '2분 전',
    confidence: 94,
    calls: 142,
    expertise: ['디자인 시스템', '온보딩 플로우', '사용자 리서치'],
  },
  {
    slug: 'jaehoon',
    name: '박재훈',
    english: 'Jaehoon Park',
    role: 'Backend Engineer',
    color: 1,
    status: 'active',
    trained: '2025.11.20 09:15',
    lastCall: '12분 전',
    confidence: 92,
    calls: 387,
    expertise: ['결제', 'DB 아키텍처', '장애 대응'],
  },
  {
    slug: 'john',
    name: 'John Kim',
    english: 'John Kim',
    role: 'Data Scientist',
    color: 2,
    status: 'learning',
    trained: '—',
    lastCall: '—',
    confidence: null,
    calls: 0,
    progress: 64,
  },
  {
    slug: 'eunseo',
    name: '최은서',
    english: 'Eunseo Choi',
    role: 'Growth Manager',
    color: 3,
    status: 'paused',
    trained: '2025.10.22 11:40',
    lastCall: '3일 전',
    confidence: 86,
    calls: 89,
  },
  {
    slug: 'hiroshi',
    name: 'Hiroshi T.',
    english: 'Hiroshi Tanaka',
    role: 'CTO (Founding)',
    color: 4,
    status: 'active',
    trained: '2025.10.15 16:08',
    lastCall: '방금 전',
    confidence: 96,
    calls: 521,
  },
  {
    slug: 'seoa',
    name: '윤서아',
    english: 'Seoa Yoon',
    role: 'HR Manager',
    color: 5,
    status: 'active',
    trained: '2025.09.30 10:00',
    lastCall: '어제',
    confidence: 91,
    calls: 67,
  },
  {
    slug: 'minjun',
    name: '(미생성)',
    english: '—',
    role: 'DevOps · 동의 대기 중',
    color: 0,
    status: 'draft',
    trained: '—',
    lastCall: '—',
    confidence: null,
    calls: 0,
  },
];

type Filter = 'all' | 'active' | 'learning' | 'paused' | 'draft';

export function ScreenList() {
  const [filter, setFilter] = useState<Filter>('all');
  const filtered = AGENTS.filter((a) => filter === 'all' || a.status === filter);
  const colors = ['#B5482C', '#1F4A48', '#5A7A3D', '#4A3B6B', '#B58A2C', '#6B3F2E'];

  const filterOptions: { id: Filter; label: string }[] = [
    { id: 'all', label: '전체' },
    { id: 'active', label: '활성' },
    { id: 'learning', label: '학습 중' },
    { id: 'paused', label: '일시정지' },
    { id: 'draft', label: '초안' },
  ];

  return (
    <div className="cli-page">
      <div
        className="cli-page-h"
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <div>
          <div className="eyebrow">에이전트 목록 · claude /afterglow list</div>
          <h2>지금 등록된 모든 퇴사자 에이전트</h2>
          <p>Claude Code 안에서 list 명령을 치면 이렇게 표시돼요. 각 행은 한 명의 퇴사자, 한 폴더입니다.</p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          {filterOptions.map((f) => (
            <button
              key={f.id}
              className={`btn btn-sm ${filter === f.id ? 'btn-primary' : 'btn-ghost'}`}
              onClick={() => setFilter(f.id)}
              style={{ padding: '4px 10px', fontSize: 11.5 }}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      <Terminal title="claude-code  ·  afterglow list" meta={`${filtered.length} / ${AGENTS.length}`}>
        <T.Prompt>
          claude /afterglow list
          {filter !== 'all' && <span style={{ color: '#FFE3C0' }}> --status {filter}</span>}
        </T.Prompt>
        <T.Dim>  ~/.claude/afterglow/registry.json 읽는 중…</T.Dim>
        <T.Br />

        <div className="cli-row-hd">
          <div />
          <div>SLUG</div>
          <div>NAME / ROLE</div>
          <div>TRAINED · LAST CALL</div>
          <div className="num">CONF.</div>
          <div className="num">STATUS</div>
        </div>

        {filtered.map((a) => (
          <div key={a.slug} className={`cli-row ${a.status === 'draft' ? 'dim' : ''}`}>
            <div className="av-cell" style={{ background: colors[a.color] }}>
              {a.name === '(미생성)' ? '·' : a.name.charAt(0)}
            </div>
            <div className="slug">{a.slug}</div>
            <div className="name-cell">
              {a.name}
              <div className="sub">{a.role}</div>
            </div>
            <div className="role-cell">
              {a.trained === '—' ? (
                a.progress ? (
                  <span style={{ color: '#C7B36F' }}>학습 중 · {a.progress}%</span>
                ) : (
                  '—'
                )
              ) : (
                <>
                  {a.trained}
                  <div style={{ fontSize: 10.5, marginTop: 2, opacity: 0.7 }}>↑ {a.lastCall}</div>
                </>
              )}
            </div>
            <div className="num">{a.confidence ? `${a.confidence}%` : '—'}</div>
            <div className={`num status ${a.status}`}>
              {a.status === 'active' && '● active'}
              {a.status === 'learning' && '◐ learning'}
              {a.status === 'paused' && '○ paused'}
              {a.status === 'draft' && '□ draft'}
            </div>
          </div>
        ))}

        <T.Br />
        <T.Dim>
          {'  '}↪ 상세: <T.Cmd>claude /afterglow inspect &lt;slug&gt;</T.Cmd>
        </T.Dim>
        <T.Dim>
          {'  '}↪ 새로 만들기: <T.Cmd>claude /afterglow create &lt;slug&gt;</T.Cmd>
        </T.Dim>
      </Terminal>

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">필터</div>
          <span className="h-cmd">list --status active</span>
          <span className="h-cmd" style={{ marginTop: 6 }}>
            list --sort calls
          </span>
          <span className="h-cmd" style={{ marginTop: 6 }}>
            list --json
          </span>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">컬럼 설명</div>
          <p style={{ fontSize: 12, lineHeight: 1.7 }}>
            <b>slug</b> — 명령어에 쓰는 짧은 식별자
            <br />
            <b>conf.</b> — 최근 100회 답변의 평균 신뢰도
            <br />
            <b>status</b> — active · learning · paused · draft
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">아카이브</div>
          <p>호출 빈도가 낮거나 퇴사 후 24개월이 지난 에이전트는 자동 잠재기 진입.</p>
          <span className="h-cmd">claude /afterglow archive &lt;slug&gt;</span>
        </div>
      </div>
    </div>
  );
}

const bar = (pct: number, width = 20) => {
  const filled = Math.round((pct / 100) * width);
  return '█'.repeat(filled) + '░'.repeat(width - filled);
};

export function ScreenInspect() {
  return (
    <div className="cli-page">
      <div className="cli-page-h">
        <div className="eyebrow">상세 보기 · claude /afterglow inspect</div>
        <h2>한 명의 퇴사자, 한 화면에.</h2>
        <p>호출 통계, 톤, 자신있는 영역, 학습한 자료까지 한 명의 전체 페르소나를 보여줍니다.</p>
      </div>

      <Terminal title="claude-code  ·  inspect jiyoon">
        <T.Prompt>
          claude /afterglow inspect <span style={{ color: '#FFE3C0' }}>jiyoon</span>
        </T.Prompt>
        <T.Dim>
          {'  '}~/.claude/afterglow/agents/jiyoon/  ·  6 files · 18.4 MB (embeddings + knowledge)
        </T.Dim>
        <T.Br />

        <T.Frame title="jiyoon  ──  이지윤 (✦)">
          <T.Line color="rgba(245,240,228,0.92)">{'   '}프로덕트 디자이너 · Product팀</T.Line>
          <T.Line color="rgba(245,240,228,0.7)">{'   '}재직 기간   2019.03 – 2025.11</T.Line>
          <T.Line color="rgba(245,240,228,0.7)">{'   '}친권자      윤기현 (People팀)</T.Line>
          <T.Line color="rgba(245,240,228,0.7)">
            {'   '}동의서      consent.md  ·  본인 서명 2025.11.10
          </T.Line>
          <T.Br />
          <T.Line color="#FFE3C0" style={{ fontStyle: 'italic' }}>
            "디자인 시스템은 라이브러리가 아니라 합의예요."
          </T.Line>

          <T.Section title="통계">
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}호출 수            <span style={{ color: 'var(--paper)' }}>142</span>           (지난 7일
              +28)
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}평균 신뢰도        <span style={{ color: '#8FBA70' }}>94%</span>           (+4.2pp · 휴먼
              피드백 후)
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}응답 시간 P50      <span style={{ color: 'var(--paper)' }}>2.4초</span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}미해결 피드백      <span style={{ color: '#E89A85' }}>4건 👎</span>        ↪ claude
              /afterglow feedback jiyoon
            </T.Line>
          </T.Section>

          <T.Section title="시스템 프롬프트 (Claude 호출 시 주입)">
            <T.Line color="rgba(245,240,228,0.85)" style={{ paddingLeft: 0 }}>
              {'   '}
              <span style={{ color: 'rgba(245,240,228,0.45)' }}>system-prompt.md</span>  ·  1.8 KB  ·  마지막 갱신
              2025.11.18
            </T.Line>
            <T.Br />
            <T.Line color="rgba(245,240,228,0.7)" style={{ paddingLeft: 6, fontStyle: 'italic' }}>
              {'   '}당신은 이지윤입니다. Connecteve의 프로덕트 디자이너로
            </T.Line>
            <T.Line color="rgba(245,240,228,0.7)" style={{ paddingLeft: 6, fontStyle: 'italic' }}>
              {'   '}6년간 일했고, 디자인 시스템과 온보딩에 자신있어요. 답변
            </T.Line>
            <T.Line color="rgba(245,240,228,0.7)" style={{ paddingLeft: 6, fontStyle: 'italic' }}>
              {'   '}전에 항상 knowledge/ 에서 관련 자료를 검색한 다음 인용…
            </T.Line>
            <T.Line color="rgba(245,240,228,0.4)" style={{ paddingLeft: 6, fontSize: 11 }}>
              {'   '}↪ 전체 보기: edit jiyoon --view-prompt
            </T.Line>
          </T.Section>

          <T.Section title="톤 (시스템 프롬프트에 반영됨)">
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}존댓말  <span style={{ color: 'var(--brick)' }}>{bar(92)}</span>  92%
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}온도    <span style={{ color: 'var(--brick)' }}>{bar(70)}</span>  70%
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}유머    <span style={{ color: 'var(--brick)' }}>{bar(28)}</span>  28%
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}길이    <span style={{ color: 'var(--brick)' }}>{bar(32)}</span>  32%
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}확신    <span style={{ color: 'var(--brick)' }}>{bar(60)}</span>  60%
            </T.Line>
          </T.Section>

          <T.Section title="영역 (다중 선택)">
            <T.Line>
              <span style={{ color: '#8FBA70' }}>{'   ✓ '}</span>디자인
              <span style={{ color: '#8FBA70' }}>{'   ✓ '}</span>연구
            </T.Line>
            <T.Line color="rgba(245,240,228,0.55)" style={{ fontSize: 11.5, marginTop: 2 }}>
              {'   '}넓은 카테고리 11개 중 다중 선택 — 세부 토픽은 RAG가 자동으로 찾아요
            </T.Line>
            <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11, marginTop: 4 }}>
              {'   '}전체 옵션: 디자인 · 개발 · 연구 · 사업화 · 영업 · 마케팅 · 운영 · 인사 · 법무 · 재무 · 데이터
            </T.Line>
          </T.Section>

          <T.Section title="자료 (knowledge/ + embeddings/)">
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}📦 ./materials/                                <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                12 files · PDF/MD/CSV
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}🔗 Confluence · DESIGN space                   <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                142 pages
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}🔗 Jira · DESIGN project                       <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                384 issues
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}🔗 GitHub · connecteve/design-system           <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                623 PR
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}📦 ./interview-2025-11-10.pdf                  <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                1.4 MB
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}📄 persona/about-self.md                       <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                이력서 · 자기소개 (system-prompt 우선 인용)
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.55)" style={{ fontSize: 11.5, marginTop: 4 }}>
              {'   '}─ 4,128 chunks indexed · text-embedding-3-small · 마지막 동기화 4시간 전
            </T.Line>
          </T.Section>

          <T.Section title="사용 가능한 MCP (mcp-allowlist.yml)">
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}
              <span style={{ color: '#8FBA70' }}>✓</span> filesystem       <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                knowledge/ 폴더 자동 포함
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}
              <span style={{ color: '#8FBA70' }}>✓</span> confluence       <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                DESIGN space만 허용
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.92)">
              {'   '}
              <span style={{ color: '#8FBA70' }}>✓</span> jira             <span style={{ color: 'rgba(245,240,228,0.55)' }}>
                DESIGN project만 허용
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.5)">
              {'   '}
              <span style={{ color: 'rgba(245,240,228,0.4)' }}>☐</span> github           <span style={{ color: 'rgba(245,240,228,0.4)' }}>
                비활성 (디자인 영역에 불필요)
              </span>
            </T.Line>
            <T.Line color="rgba(245,240,228,0.5)">
              {'   '}
              <span style={{ color: 'rgba(245,240,228,0.4)' }}>☐</span> database         <span style={{ color: 'rgba(245,240,228,0.4)' }}>
                비활성
              </span>
            </T.Line>
            <T.Line color="#E89A85" style={{ fontSize: 11.5 }}>
              {'   '}
              <span>✗</span> postgres-prod   <span style={{ opacity: 0.7 }}>명시 거부 (위험 영역)</span>
            </T.Line>
          </T.Section>

          <T.Section title="자주 핸드오프">
            <T.Line color="rgba(245,240,228,0.85)">
              {'   '}
              <T.Agent slug="jiyoon" color={0} />{' '}
              <span style={{ color: 'rgba(245,240,228,0.55)' }}>→</span>{' '}
              <T.Agent slug="eunseo" color={3} />
              {'  '}마케팅 토픽 84%
            </T.Line>
            <T.Line color="rgba(245,240,228,0.85)">
              {'   '}
              <T.Agent slug="jiyoon" color={0} />{' '}
              <span style={{ color: 'rgba(245,240,228,0.55)' }}>→</span>{' '}
              <T.Agent slug="jaehoon" color={1} />
              {'  '}구현 가능성 42%
            </T.Line>
          </T.Section>
        </T.Frame>

        <T.Br />
        <T.Heading icon="▸">다음에 할 수 있는 일</T.Heading>
        <T.Line color="rgba(245,240,228,0.85)">
          {'  '}
          <T.Cmd>claude /afterglow ask jiyoon "..."</T.Cmd>
        </T.Line>
        <T.Line color="rgba(245,240,228,0.85)">
          {'  '}
          <T.Cmd>claude /afterglow edit jiyoon --interactive</T.Cmd>
        </T.Line>
        <T.Line color="rgba(245,240,228,0.85)">
          {'  '}
          <T.Cmd>claude /afterglow feedback jiyoon --last</T.Cmd>
        </T.Line>
      </Terminal>
    </div>
  );
}
