import { useState } from 'react';
import { Terminal, T } from '../components/Terminal';

function FlagsView() {
  return (
    <Terminal title="claude-code  ·  edit (flags)">
      <T.Prompt>
        claude /afterglow edit <span style={{ color: '#FFE3C0' }}>jiyoon</span> --help
      </T.Prompt>
      <T.Br />
      <T.Heading icon="▸">jiyoon 편집 플래그</T.Heading>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.45)" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
        {'  '}── 기본 정보 ──
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--bio</span>{' '}
        <span style={{ color: '#C7E5B1' }}>"..."</span>                     한 줄 소개 수정
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--rename</span>{' '}
        <span style={{ color: '#C7E5B1' }}>"..."</span>                  이름 변경
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--view-prompt</span>                   system-prompt.md 보기
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--edit-prompt</span>                   system-prompt.md 직접 편집 (에디터 오픈)
      </T.Line>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.45)" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
        {'  '}── 자료 (어떤 형식이든 OK) ──
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--add-source</span>{' '}
        <span style={{ color: '#C7E5B1' }}>&lt;path-or-url&gt;</span>      자료 추가 + 자동 재인덱싱
      </T.Line>
      <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11.5 }}>
        {'      '}지원: PDF · MD · DOCX · CSV · JSONL · 폴더
      </T.Line>
      <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11.5 }}>
        {'      '}URL: Confluence · Jira · Notion · GitHub · Google Docs · 일반 웹
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--remove-source</span>{' '}
        <span style={{ color: '#C7E5B1' }}>&lt;id&gt;</span>           자료 제거
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--list-sources</span>                  현재 자료 목록
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--reindex</span>                       임베딩 다시 만들기
      </T.Line>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.45)" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
        {'  '}── MCP 권한 ──
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--mcp-allow</span>{' '}
        <span style={{ color: '#C7E5B1' }}>&lt;name&gt;</span>             해당 MCP 사용 허용
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--mcp-deny</span>{' '}
        <span style={{ color: '#C7E5B1' }}>&lt;name&gt;</span>              해당 MCP 명시 거부
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--mcp-list</span>                      현재 권한 보기
      </T.Line>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.45)" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
        {'  '}── 영역 / 톤 ──
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--add-expertise</span>{' '}
        <span style={{ color: '#C7E5B1' }}>"카테고리"</span>       자신있는 영역 추가 (예: 디자인 · 개발 · 인사)
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--remove-expertise</span>{' '}
        <span style={{ color: '#C7E5B1' }}>"카테고리"</span>    자신있는 영역 제거
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--tone</span>{' '}
        <span style={{ color: '#C7E5B1' }}>key=value</span>                톤 슬라이더 (0–100)
      </T.Line>
      <T.Line color="rgba(245,240,228,0.4)">
        {'      '}keys: honorific · warmth · humor · verbosity · certainty
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--confidence-floor</span>{' '}
        <span style={{ color: '#C7E5B1' }}>50</span>            신뢰도 최저선 (%)
      </T.Line>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.45)" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
        {'  '}── 직접 편집 (vim 등 에디터) ──
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--edit</span>{' '}
        <span style={{ color: '#C7E5B1' }}>persona | prompt | mcp</span>      $EDITOR 로 해당 파일 직접 편집
      </T.Line>
      <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11.5 }}>
        {'      '}예: edit jiyoon --edit persona  →  vim ~/.claude/afterglow/agents/jiyoon/persona.json
      </T.Line>
      <T.Line color="rgba(245,240,228,0.4)" style={{ fontSize: 11.5 }}>
        {'      '}$EDITOR 환경변수 (vim · nano · code 등) 자동 사용. 저장 시 검증 후 반영
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--open-folder</span>                   에이전트 폴더를 파일 매니저로 열기
      </T.Line>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.45)" style={{ fontSize: 11, letterSpacing: '0.04em' }}>
        {'  '}── 자발적 협의 ──
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--peer-ask</span>{' '}
        <span style={{ color: '#C7E5B1' }}>on|off</span>                답하다가 옆자리에 묻기 (peer-ask) 활성화
      </T.Line>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>--peer-threshold</span>{' '}
        <span style={{ color: '#C7E5B1' }}>0.6</span>             이 신뢰도 이하면 자동 peer-ask
      </T.Line>

      <T.Hr />

      <T.Prompt>
        claude /afterglow edit <span style={{ color: '#FFE3C0' }}>jiyoon</span>{' '}
        <span style={{ color: '#FFE3C0' }}>--add-source</span>{' '}
        <span style={{ color: '#C7E5B1' }}>
          https://connecteve.atlassian.net/wiki/spaces/DESIGN/pages/142841
        </span>
      </T.Prompt>
      <T.Dim>  URL 검증 중…</T.Dim>
      <T.Ok>Confluence 페이지 인식: "디자인 시스템 v3 RFC" · 마지막 수정 2025.11.18</T.Ok>
      <T.Ok>인덱스에 추가됨 (chunk +14)</T.Ok>
      <T.Line color="#C7B36F">{'  '}◐ 백그라운드 재인덱싱 시작</T.Line>
      <T.Dim>  진행 상황: claude /afterglow status jiyoon --watch</T.Dim>

      <T.Hr />

      <T.Prompt>
        claude /afterglow edit <span style={{ color: '#FFE3C0' }}>jiyoon</span>{' '}
        <span style={{ color: '#FFE3C0' }}>--edit</span> <span style={{ color: '#C7E5B1' }}>persona</span>
      </T.Prompt>
      <T.Dim>  $EDITOR=vim · ~/.claude/afterglow/agents/jiyoon/persona.json 열림</T.Dim>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.55)" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {'  '}╭─ vim · persona.json ─────────────────────────────╮
      </T.Line>
      {[
        '1 |{',
        '2 |  "slug": "jiyoon",',
        '3 |  "name": "이지윤",',
        '4 |  "role": "프로덕트 디자이너",',
        '5 |  "expertise": ["디자인", "연구"],',
        '6 |  "tone": {',
        '7 |    "honorific": 92,',
        '8 |    "humor": 28,',
        '9 |    "verbosity": 32',
        '10|  },',
        '11|  "confidence_floor": 50',
        '12|}',
      ].map((line) => {
        const [num, ...rest] = line.split('|');
        return (
          <T.Line key={num} color="rgba(245,240,228,0.92)">
            {'  '}
            <span style={{ color: 'rgba(245,240,228,0.4)' }}>{num}</span>
            {rest.join('|')}
          </T.Line>
        );
      })}
      <T.Line color="rgba(245,240,228,0.4)" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {'  '}~
      </T.Line>
      <T.Line color="rgba(245,240,228,0.55)" style={{ fontFamily: 'var(--font-mono)', fontSize: 11 }}>
        {'  '}╰─ -- INSERT --                          :wq | :q! ╯
      </T.Line>
      <T.Br />
      <T.Dim>  vim 종료 후 자동 검증 중…</T.Dim>
      <T.Ok>JSON 유효 · persona.json 저장됨</T.Ok>
      <T.Ok>history.log 에 diff 기록됨</T.Ok>
    </Terminal>
  );
}

function InteractiveView() {
  return (
    <Terminal title="claude-code  ·  edit --interactive">
      <T.Prompt>
        claude /afterglow edit <span style={{ color: '#FFE3C0' }}>jiyoon</span>{' '}
        <span style={{ color: '#FFE3C0' }}>--interactive</span>
      </T.Prompt>
      <T.Br />
      <T.Heading icon="📝">jiyoon 편집  ·  ↑↓ 이동, enter 수정, q 종료, s 저장</T.Heading>
      <T.Br />

      <T.Frame title="이지윤 (✦)  ·  persona.json">
        <T.Line color="rgba(245,240,228,0.92)">
          {'   '}
          <span style={{ color: 'var(--brick)' }}>▸</span> [1] 이름            <span style={{ color: 'var(--paper)' }}>이지윤</span>
        </T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[2] 직무            프로덕트 디자이너 · Product팀</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[3] 재직 기간       2019.03 – 2025.11</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[4] 한 줄 소개      디자인 시스템과 온보딩 플로우를 만들었습니다…</T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.7)">{'     '}[5] 자신있는 영역   디자인 시스템, 온보딩 플로우, 사용자 리서치</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[6] 신뢰도 최저선   50%</T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.55)">{'     '}── 톤 슬라이더 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[7]  존댓말  92  ████████████████████░</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[8]  온도    70  ██████████████░░░░░░</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[9]  유머    28  ██████░░░░░░░░░░░░░░</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[10] 길이    32  ███████░░░░░░░░░░░░░</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[11] 확신    60  ████████████░░░░░░░░</T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.55)">{'     '}── 자료 (knowledge/) ──</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[12] messages-export.jsonl  14,238 메시지</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[13] notion-pages.md        412 페이지</T.Line>
        <T.Line color="rgba(245,240,228,0.7)">{'     '}[14] github-reviews.json    623 PR</T.Line>
        <T.Line color="rgba(245,240,228,0.55)">{'     '}[+ ] 자료 추가하기…</T.Line>
        <T.Br />

        <T.Line color="rgba(245,240,228,0.55)">{'     '}── 위험 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.5)" style={{ color: '#E89A85' }}>
          {'     '}[X] 에이전트 영구 삭제 (폴더 통째로)
        </T.Line>
      </T.Frame>

      <T.Br />
      <T.Dim>  현재 선택: [1] 이름</T.Dim>
      <T.Line color="rgba(245,240,228,0.85)">
        {'  '}
        <span style={{ color: '#FFE3C0' }}>enter</span> 를 누르면 새 값을 입력할 수 있어요
      </T.Line>
      <T.Br />
      <T.Line color="rgba(245,240,228,0.55)" style={{ fontSize: 11.5 }}>
        {'  '}↑↓ 이동  ·  enter 수정  ·  s 저장  ·  d diff 미리보기  ·  q 종료
      </T.Line>
    </Terminal>
  );
}

export function ScreenEdit() {
  const [mode, setMode] = useState<'flags' | 'interactive'>('flags');

  return (
    <div className="cli-page">
      <div
        className="cli-page-h"
        style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between' }}
      >
        <div>
          <div className="eyebrow">에이전트 수정 · claude /afterglow edit</div>
          <h2>모든 수정은 CLI 명령어로.</h2>
          <p>
            플래그를 직접 넘기거나 인터랙티브 모드로 한 번에. 어떤 식이든 결국 같은{' '}
            <code
              style={{
                background: 'var(--paper-2)',
                padding: '0 5px',
                borderRadius: 3,
                fontSize: 12,
                fontFamily: 'var(--font-mono)',
              }}
            >
              persona.json
            </code>{' '}
            한 파일을 갱신해요.
          </p>
        </div>
        <div className="row" style={{ gap: 6 }}>
          <button
            className={`btn btn-sm ${mode === 'flags' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('flags')}
            style={{ padding: '4px 10px', fontSize: 11.5 }}
          >
            플래그 모드
          </button>
          <button
            className={`btn btn-sm ${mode === 'interactive' ? 'btn-primary' : 'btn-ghost'}`}
            onClick={() => setMode('interactive')}
            style={{ padding: '4px 10px', fontSize: 11.5 }}
          >
            --interactive
          </button>
        </div>
      </div>

      {mode === 'flags' ? <FlagsView /> : <InteractiveView />}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">모든 수정은 기록됩니다</div>
          <p>
            persona.json 변경 시 자동으로 history.log에 diff가 남고, council 회의록에서 이를 추적할 수 있어요.
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">에디터 직접 편집</div>
          <p>vim · nano · code 등 $EDITOR 환경변수 자동 사용:</p>
          <span className="h-cmd">edit jiyoon --edit persona</span>
          <span className="h-cmd" style={{ marginTop: 6 }}>
            vim ~/.claude/afterglow/agents/jiyoon/persona.json
          </span>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">변경 되돌리기</div>
          <p>history.log에 저장된 모든 변경은 시점별로 롤백 가능합니다.</p>
          <span className="h-cmd">edit jiyoon --rollback 2025-11-18</span>
        </div>
      </div>
    </div>
  );
}
