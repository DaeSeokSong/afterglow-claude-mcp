/* cli_init.jsx — `claude /afterglow init` + `create <slug>` screens */
/* global React, Terminal, T, Icon */

const { useState: uI, useEffect: uIE } = React;

function ScreenInit() {
  return (
    <div className="cli-page">
      <div className="cli-page-h">
        <div className="eyebrow">처음 설치</div>
        <h2>한 번만 하면 됩니다.</h2>
        <p>MCP를 등록하고 폴더 위치 한 번 정하면 끝. 별도의 모델 학습이나 GPU는 필요 없어요 — 퇴사자의 지식은 Claude의 컨텍스트로 주입됩니다.</p>
      </div>

      <Terminal title="claude-code  ·  설치">
        <T.Prompt>claude mcp add afterglow npx @connecteve/afterglow-mcp@latest</T.Prompt>
        <T.Dim>  Downloading server bundle (3.2 MB) …</T.Dim>
        <T.Ok>afterglow-mcp@0.5.0 등록됨</T.Ok>
        <T.Ok>MCP config 업데이트: ~/.config/claude-code/mcp.json</T.Ok>
        <T.Dim>  Claude Code 재시작 필요 없음 — 즉시 사용 가능합니다.</T.Dim>
        <T.Br/>

        <T.Prompt>claude /afterglow init</T.Prompt>
        <T.Br/>
        <T.Heading icon="▸">처음 사용하시는군요. 몇 가지만 묻고 시작할게요.</T.Heading>
        <T.Br/>

        <T.Q q="데이터 저장 위치" required hint="기본: ~/.claude/afterglow/  — 폴더 안에 각 퇴사자 폴더가 만들어집니다">
        </T.Q>
        <T.Answer skipped>↵ enter (기본값 사용)</T.Answer>
        <T.Br/>

        <T.Q q="기본 임베딩 모델" required hint="RAG 검색용. 파일 인덱싱에만 사용 — Claude 호출에는 영향 없음">
          <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
            <span style={{color:"var(--brick)"}}>{`▸ `}</span>1. text-embedding-3-small (OpenAI · 빠름 · 권장)
          </T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  2. nomic-embed-text-v1.5 (로컬 · 오픈소스)`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  3. bge-m3 (로컬 · 다국어 강함)`}</T.Line>
        </T.Q>
        <T.Answer>1</T.Answer>
        <T.Br/>

        <T.Dim>  초기화 중…</T.Dim>
        <T.Ok>~/.claude/afterglow/config.yml</T.Ok>
        <T.Ok>~/.claude/afterglow/registry.json</T.Ok>
        <T.Ok>~/.claude/afterglow/councils/  (회의록 저장 폴더)</T.Ok>
        <T.Ok>~/.claude/commands/afterglow/  (슬래시 명령 8개 설치)</T.Ok>
        <T.Dim>  → ~/.claude/commands/ 은 Claude Code 권장 경로. afterglow/ 하위 폴더로 네임스페이스됩니다.</T.Dim>
        <T.Br/>

        <T.Line color="#FFE3C0" style={{marginTop:8}}>
          ✦ 준비 완료. 첫 에이전트를 만들어보세요:
        </T.Line>
        <T.Line color="var(--paper)" style={{paddingLeft:4}}>
          <T.Cmd>claude /afterglow create &lt;slug&gt;</T.Cmd>
        </T.Line>
      </Terminal>

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">두 가지 호출 방식</div>
          <p style={{marginBottom:8,lineHeight:1.65}}><b>① 셰에서 직접</b> — 일회성 호출용.</p>
          <span className="h-cmd">claude /afterglow ask jiyoon "..."</span>
          <p style={{marginTop:12,marginBottom:8,lineHeight:1.65}}><b>② Claude Code REPL 안에서</b> — 대화 중 호출. <code style={{background:"var(--paper-2)",padding:"0 4px",borderRadius:3,fontSize:11,fontFamily:"var(--font-mono)"}}>claude</code> 접두사 필요 없음.</p>
          <span className="h-cmd">&gt; /afterglow ask jiyoon "..."</span>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">왜 학습이 아니라 페르소나 + RAG?</div>
          <p>Claude Code는 Anthropic의 Claude를 호출해요. 우리가 만든 LoRA 가중치를 거기서 못 돌립니다. 대신 퇴사자의 톤과 자료를 Claude의 컨텍스트에 함께 넣어 호환성을 100%로 유지해요.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">설정 보기 / 변경</div>
          <span className="h-cmd">claude /afterglow config show</span>
          <span className="h-cmd" style={{marginTop:6}}>claude /afterglow config set embedding bge-m3</span>
        </div>
      </div>
    </div>
  );
}

function ScreenCreate() {
  return (
    <div className="cli-page">
      <div className="cli-page-h">
        <div className="eyebrow">에이전트 만들기 · sequential</div>
        <h2>한 단계씩, 필수만 묻고 선택은 건너뛰어요.</h2>
        <p>자료는 파일·폴더·URL·Confluence/Jira/Notion 페이지 어떤 형식이든 받습니다. 모두 인덱싱돼서 Claude에게 전달할 시스템 프롬프트와 RAG 인덱스가 만들어져요. <b>모델 학습은 일어나지 않습니다</b> — 그래서 Claude Code와 100% 호환돼요.</p>
      </div>

      <Terminal title="claude-code  ·  새 에이전트">
        <T.Prompt>claude /afterglow create <span style={{color:"#FFE3C0"}}>jiyoon</span></T.Prompt>
        <T.Br/>
        <T.Heading icon="▸">새 에이전트 생성  ·  jiyoon</T.Heading>
        <T.Dim>  ~/.claude/afterglow/agents/jiyoon/ 폴더가 만들어집니다.</T.Dim>
        <T.Br/>

        <T.Q q="이름" required>
          <T.Answer>이지윤</T.Answer>
        </T.Q>

        <T.Q q="직무 / 부서" required>
          <T.Answer>프로덕트 디자이너 · Product팀</T.Answer>
        </T.Q>

        <T.Q q="재직 기간" required>
          <T.Answer>2019.03 – 2025.11</T.Answer>
        </T.Q>

        <T.Q q="한 줄 소개" required={false} hint="나중에 edit jiyoon --bio 로 채울 수 있어요">
          <T.Answer skipped>skip</T.Answer>
        </T.Q>

        <T.Q q="자료 소스" required hint="여러 줄 입력 가능 — 한 줄에 하나, 빈 줄로 종료. 파일/폴더/URL 무엇이든 OK">
          <T.Line color="rgba(245,240,228,0.7)" style={{paddingLeft:0,fontSize:11.5}}>{"   "}• .pdf · .md · .txt · .docx · .jsonl · .csv · 폴더 경로</T.Line>
          <T.Line color="rgba(245,240,228,0.7)" style={{paddingLeft:0,fontSize:11.5}}>{"   "}• Confluence URL  ·  Jira URL  ·  Notion URL</T.Line>
          <T.Line color="rgba(245,240,228,0.7)" style={{paddingLeft:0,fontSize:11.5}}>{"   "}• GitHub repo URL  ·  Google Docs URL  ·  일반 웹페이지</T.Line>
          <T.Br/>
          <T.Answer>./materials/</T.Answer>
          <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ 12 files detected (PDF, Markdown, CSV)</T.Line>
          <T.Answer>https://connecteve.atlassian.net/wiki/spaces/DESIGN/</T.Answer>
          <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ Confluence space · 142 pages <span style={{color:"#C7B36F"}}>(confluence MCP 필요)</span></T.Line>
          <T.Answer>https://connecteve.atlassian.net/jira/projects/DESIGN/</T.Answer>
          <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ Jira project · 384 issues <span style={{color:"#C7B36F"}}>(jira MCP 필요)</span></T.Line>
          <T.Answer>https://github.com/connecteve/design-system</T.Answer>
          <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ GitHub repo · 623 PR</T.Line>
          <T.Answer>./interview-2025-11-10.pdf</T.Answer>
          <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ PDF · 1.4 MB · 인계 인터뷰 녹취록</T.Line>
          <T.Answer skipped>(빈 줄로 종료)</T.Answer>
        </T.Q>

        <T.Q q="자기소개 자료 (선택)" required={false} hint="자소서·이력서·자기 소개 글 — 톤과 1인칭 표현을 잡는 데 큰 도움이 돼요">
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0,fontSize:11.5}}>{"  "}지원 형식: .pdf · .md · .docx · LinkedIn URL · Notion 페이지</T.Line>
          <T.Answer>./이지윤-resume-2025.pdf</T.Answer>
          <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ PDF · 320 KB · 이력서 · 4 pages</T.Line>
          <T.Answer>./자기소개-디자이너로의-여정.md</T.Answer>
          <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ Markdown · 14 KB · 자기소개 에세이</T.Line>
          <T.Answer skipped>(빈 줄로 종료 — 또는 enter로 skip)</T.Answer>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:18,fontSize:11.5}}>{"  "}↗ persona/about-self.md 로 저장됩니다 — system-prompt 에 우선 인용됨</T.Line>
        </T.Q>

        <T.Br/>
        <T.Heading icon="▸">자료 조회에 필요한 MCP 확인 중…</T.Heading>
        <T.Br/>
        <T.Line color="rgba(245,240,228,0.85)">{"  "}<span style={{color:"#8FBA70"}}>✓</span> filesystem    <span style={{color:"rgba(245,240,228,0.55)"}}>이미 설치됨 (Claude Code 기본)</span></T.Line>
        <T.Line color="rgba(245,240,228,0.85)">{"  "}<span style={{color:"#C7B36F"}}>○</span> confluence    <span style={{color:"rgba(245,240,228,0.55)"}}>미설치 — Confluence URL을 입력해서 필요</span></T.Line>
        <T.Line color="rgba(245,240,228,0.85)">{"  "}<span style={{color:"#C7B36F"}}>○</span> jira          <span style={{color:"rgba(245,240,228,0.55)"}}>미설치 — Jira URL을 입력해서 필요</span></T.Line>
        <T.Line color="rgba(245,240,228,0.85)">{"  "}<span style={{color:"#8FBA70"}}>✓</span> github        <span style={{color:"rgba(245,240,228,0.55)"}}>이미 설치됨</span></T.Line>
        <T.Br/>

        <T.Q q="누락된 MCP 2개를 지금 연동할까요?" required hint="자료 조회에 꼭 필요해요. skip 하면 그 자료들은 색인에서 제외돼요">
          <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
            <span style={{color:"var(--brick)"}}>{`▸ `}</span>1. 지금 연동 (추천)
          </T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  2. skip — 나중에 해당 에이전트 사용 전 꼭 연동 필요`}</T.Line>
        </T.Q>
        <T.Answer>1</T.Answer>
        <T.Dim>  @connecteve/confluence-mcp@1.2 설치 중…</T.Dim>
        <T.Ok>confluence MCP 등록됨 · OAuth 브라우저 열림</T.Ok>
        <T.Ok>Atlassian 인증 완료 (ykhyun@connecteve.com)</T.Ok>
        <T.Dim>  @atlassian/jira-mcp@0.8 설치 중…</T.Dim>
        <T.Ok>jira MCP 등록됨 · 같은 워크스페이스 인증 재사용</T.Ok>
        <T.Br/>
        <T.Heading icon="▸">최종 검증</T.Heading>
        <T.Ok>filesystem  · 12 files 읽기 성공</T.Ok>
        <T.Ok>confluence  · DESIGN space 142 pages 접근 성공</T.Ok>
        <T.Ok>jira        · DESIGN project 384 issues 접근 성공</T.Ok>
        <T.Ok>github      · connecteve/design-system 623 PR 접근 성공</T.Ok>
        <T.Line color="#8FBA70" style={{marginTop:4}}>  모든 자료 조회 가능 — 다음 단계로 진행</T.Line>

        <T.Br/>
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11.5,letterSpacing:"0.04em"}}>{`   ── 만약 skip을 눌렀다면 ──`}</T.Line>
        <T.Line color="#E89A85" style={{paddingLeft:2}}>{`  ⚠ confluence MCP 누락 — Confluence 페이지 142개를 조회할 수 없어요.`}</T.Line>
        <T.Line color="#E89A85" style={{paddingLeft:2}}>{`  ⚠ jira MCP 누락 — Jira 이슈 384개를 조회할 수 없어요.`}</T.Line>
        <T.Line color="rgba(245,240,228,0.7)" style={{paddingLeft:2}}>{`  → 이 에이전트를 사용하기 전 반드시 연동해 주세요:`}</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>
          <T.Cmd>claude mcp add confluence @connecteve/confluence-mcp@latest</T.Cmd>
        </T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>
          <T.Cmd>claude mcp add jira @atlassian/jira-mcp@latest</T.Cmd>
        </T.Line>
        <T.Line color="rgba(245,240,228,0.5)" style={{fontSize:11.5}}>{`  연동 안 한 상태로 ask 호출 시 답변에서 해당 자료는 빠지고 신뢰도가 낮아져요.`}</T.Line>

        <T.Q q="자신있던 영역" required={false} hint="여러 개 선택 가능 (스페이스로 토글, enter로 다음)">
          <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
            <span style={{color:"#8FBA70"}}>{`  [✓] `}</span>디자인
          </T.Line>
          <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
            <span style={{color:"#8FBA70"}}>{`  [✓] `}</span>연구
          </T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 개발`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 사업화`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 영업`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 마케팅`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 운영`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 인사`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 법무`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 재무`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] 데이터`}</T.Line>
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`  [ ] + 직접 입력…`}</T.Line>
          <T.Dim>{`  [space]toggle · [a]all · [n]none · [enter]continue`}</T.Dim>
          <T.Answer>2개 선택됨 · enter</T.Answer>
        </T.Q>

        <T.Q q="이 에이전트가 사용할 수 있는 MCP" required={false} hint="현재 등록된 MCP 중에서 골라요. 비우면 모든 MCP 거부 (기본 거부 정책)">
          <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0,fontSize:11.5}}>
            {"  "}현재 Claude Code에 등록된 MCP:
          </T.Line>
          <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0,fontSize:11.5}}>{"   "}<span style={{color:"#8FBA70"}}>✓</span> filesystem    파일 읽기 (knowledge/ 폴더 자동 포함)</T.Line>
          <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0,fontSize:11.5}}>{"   "}<span style={{color:"#8FBA70"}}>✓</span> confluence    공간 검색 (디자인 영역 토픽일 때만 의미 있음)</T.Line>
          <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0,fontSize:11.5}}>{"   "}<span style={{color:"#8FBA70"}}>✓</span> jira          이지윤이 다뤘던 이슈 검색</T.Line>
          <T.Line color="rgba(245,240,228,0.5)"  style={{paddingLeft:0,fontSize:11.5}}>{"   "}<span style={{color:"rgba(245,240,228,0.4)"}}>☐</span> github        (디자인 영역이라 비활성 권장)</T.Line>
          <T.Line color="rgba(245,240,228,0.5)"  style={{paddingLeft:0,fontSize:11.5}}>{"   "}<span style={{color:"rgba(245,240,228,0.4)"}}>☐</span> database      (디자이너에게 불필요)</T.Line>
          <T.Line color="rgba(245,240,228,0.5)"  style={{paddingLeft:0,fontSize:11.5}}>{"   "}<span style={{color:"rgba(245,240,228,0.4)"}}>☐</span> postgres-prod (위험 — 명시 거부)</T.Line>
          <T.Dim>{`  [t]oggle · [a]ll-on · [enter]continue`}</T.Dim>
          <T.Answer>enter (위 3개 유지)</T.Answer>
        </T.Q>

        <T.Br/>
        <T.Line color="#FFE3C0">✦ 인덱싱을 시작합니다 (예상 2분)</T.Line>
        <T.Progress value={100} label="자료 수집 (파일 + URL 다운로드)"/>
        <T.Progress value={100} label="텍스트 추출 & 정제 (PII 마스킹)"/>
        <T.Progress value={64} label="RAG 임베딩 생성 (text-embedding-3-small)"/>
        <T.Progress value={0} label="페르소나 추출 (자주 쓰는 표현·결정 기준)"/>
        <T.Progress value={0} label="시스템 프롬프트 합성"/>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.55)" style={{marginTop:6}}>
          {`  ⋯ 49초 경과  ·  학습이 아니라 인덱싱이라 빠릅니다`}
        </T.Line>
      </Terminal>

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">자료를 어떻게 처리해요?</div>
          <p style={{lineHeight:1.65}}>모든 자료를 텍스트로 변환 → 청크 단위로 임베딩 → vector DB에 저장. ask 시 질문과 관련된 청크만 골라 Claude의 컨텍스트로 함께 넣어요.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">MCP 권한 격리</div>
          <p>각 에이전트는 자기 폴더의 <code style={{background:"var(--paper-2)",padding:"0 4px",borderRadius:3,fontSize:11,fontFamily:"var(--font-mono)"}}>mcp-allowlist.yml</code>에 허용된 MCP만 쓸 수 있어요. 디자이너 에이전트가 prod DB를 건드릴 일은 없습니다.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">자료 추가</div>
          <p>나중에 자료가 더 모이면:</p>
          <span className="h-cmd">edit jiyoon --add-source &lt;url-or-path&gt;</span>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenInit, ScreenCreate });
