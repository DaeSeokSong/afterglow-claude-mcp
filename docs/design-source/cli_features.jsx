/* cli_features.jsx — 4 roadmap features as CLI terminal mockups */
/* global React, Terminal, T */

const { useState: uFt } = React;

/* ============================================================
   1. 퇴사자 본인 인계 모드 — self-review before finalize
   ============================================================ */
function ScreenSelfReview() {
  const [tab, setTab] = uFt("review");
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div className="eyebrow">퇴사자 본인 인계 모드 · claude /afterglow handoff</div>
          <h2>본인이 직접 자기 에이전트와 대화해요.</h2>
          <p>
            퇴사 1주 전, 퇴사자가 자기 에이전트와 1:1 세션을 엽니다. 샘플 질문에 어떻게 답하는지 보고, 잘못된 답변은 그 자리에서 고치고, 톤·영역을 직접 조정해요. <b>본인이 동의하고 만든 디지털 자신</b>이 되도록 마지막 검수를 하는 단계입니다.
          </p>
        </div>
        <div className="row" style={{gap:6}}>
          <button className={`btn btn-sm ${tab === "review" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("review")} style={{padding:"4px 10px",fontSize:11.5}}>① 검수 흐름</button>
          <button className={`btn btn-sm ${tab === "decline" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("decline")} style={{padding:"4px 10px",fontSize:11.5}}>② 거부 시나리오</button>
          <button className={`btn btn-sm ${tab === "resume" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("resume")} style={{padding:"4px 10px",fontSize:11.5}}>③ 중도 재개</button>
        </div>
      </div>

      {tab === "review" && <HandoffReview/>}
      {tab === "decline" && <HandoffDecline/>}
      {tab === "resume" && <HandoffResume/>}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">왜 본인 검수가 필요한가요?</div>
          <p>자료에서 추출한 페르소나는 본인 의도와 다를 수 있어요. 12개 샘플 질문을 본인이 직접 확인하면, 본인이 동의한 결과만 활성화됩니다.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">서명 없이도?</div>
          <p>서명하지 않은 에이전트는 비활성 상태로 남아요. ask 호출 시 "본인 검수 대기" 메시지가 나가고, 30일 후 자동 폐기.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">관련 명령</div>
          <span className="h-cmd">handoff jiyoon --resume</span>
          <span className="h-cmd" style={{marginTop:6}}>handoff jiyoon --status</span>
        </div>
      </div>
    </div>
  );
}

function HandoffReview() {
  return (
    <Terminal title="claude-code  ·  handoff (self-driven setup)">
      <T.Prompt>
        claude /afterglow handoff <span style={{color:"#FFE3C0"}}>--new</span>
      </T.Prompt>
      <T.Dim>  본인 인증 중… (퇴사자 본인 OAuth 필요)</T.Dim>
      <T.Ok>이지윤 님 확인됨 · 본인 주도 인계 세션 시작</T.Ok>
      <T.Br/>

      <T.Heading icon="✦">안녕하세요 이지윤 님. 본인이 직접 만드는 인계 세션입니다.</T.Heading>
      <T.Dim>  ~/.claude/afterglow/agents/jiyoon/ 폴더가 본인 손으로 만들어집니다.</T.Dim>
      <T.Dim>  모든 정보·자료·권한·답변을 본인이 직접 결정해요.</T.Dim>
      <T.Br/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 1) 기본 정보 ──`}</T.Line>
      <T.Q q="이름" required><T.Answer>이지윤</T.Answer></T.Q>
      <T.Q q="직무 / 부서" required><T.Answer>프로덕트 디자이너 · Product팀</T.Answer></T.Q>
      <T.Q q="재직 기간" required><T.Answer>2019.03 – 2025.11</T.Answer></T.Q>
      <T.Q q="한 줄 소개" required={false}>
        <T.Answer>디자인 시스템과 온보딩 플로우를 만들었어요. 데이터를 좋아하고 인터뷰를 즐겼습니다.</T.Answer>
      </T.Q>

      <T.Hr/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 2) 자료 소스 ──`}</T.Line>
      <T.Q q="학습할 자료 (여러 줄 가능, 빈 줄로 종료)" required>
        <T.Answer>./materials/</T.Answer>
        <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ 12 files (PDF · Markdown · CSV)</T.Line>
        <T.Answer>https://connecteve.atlassian.net/wiki/spaces/DESIGN/</T.Answer>
        <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ Confluence space · 142 pages <span style={{color:"#C7B36F"}}>(confluence MCP 필요)</span></T.Line>
        <T.Answer>https://connecteve.atlassian.net/jira/projects/DESIGN/</T.Answer>
        <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ Jira project · 384 issues <span style={{color:"#C7B36F"}}>(jira MCP 필요)</span></T.Line>
        <T.Answer>https://github.com/connecteve/design-system</T.Answer>
        <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ GitHub repo · 623 PR</T.Line>
        <T.Answer skipped>(빈 줄로 종료)</T.Answer>
      </T.Q>

      <T.Q q="자기소개 자료" required={false} hint="자소서·이력서·자기 소개 글 — 1인칭 표현 추출에 큰 도움">
        <T.Answer>./이지윤-resume-2025.pdf</T.Answer>
        <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ PDF · 320 KB · 이력서</T.Line>
        <T.Answer>./자기소개-디자이너로의-여정.md</T.Answer>
        <T.Line color="#8FBA70" style={{paddingLeft:18}}>{"   "}+ Markdown · 14 KB · 자기소개 에세이</T.Line>
        <T.Answer skipped>(빈 줄)</T.Answer>
      </T.Q>

      <T.Br/>
      <T.Heading icon="▸">자료 조회용 MCP 확인 중…</T.Heading>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}<span style={{color:"#C7B36F"}}>○</span> confluence — 미설치 (지금 연동?)</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}<span style={{color:"#C7B36F"}}>○</span> jira — 미설치 (지금 연동?)</T.Line>
      <T.Answer>y (Atlassian 일괄 OAuth)</T.Answer>
      <T.Ok>confluence · jira MCP 설치 + 인증 완료</T.Ok>

      <T.Hr/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 3) 톤 · 영역 (본인 지정) ──`}</T.Line>
      <T.Q q="존댓말" required={false}><T.Answer>92</T.Answer></T.Q>
      <T.Q q="온도 (건조 ↔ 따뜻)" required={false}><T.Answer>70</T.Answer></T.Q>
      <T.Q q="유머" required={false}><T.Answer>28</T.Answer></T.Q>
      <T.Q q="답변 길이" required={false}><T.Answer>32</T.Answer></T.Q>
      <T.Q q="확신도" required={false}><T.Answer>60</T.Answer></T.Q>

      <T.Q q="자신있는 영역 (다중 선택)" required={false}>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
          <span style={{color:"#8FBA70"}}>{`  [✓] `}</span>디자인
          <span style={{color:"#8FBA70",marginLeft:14}}>{`[✓] `}</span>연구
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0,fontSize:11.5}}>
          {`  [ ] 개발 · 사업화 · 영업 · 마케팅 · 운영 · 인사 · 법무 · 재무 · 데이터`}
        </T.Line>
        <T.Answer>enter</T.Answer>
      </T.Q>

      <T.Hr/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 4) 사용 가능한 MCP ──`}</T.Line>
      <T.Q q="이 에이전트가 사용할 수 있는 MCP" required={false}>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0,fontSize:11.5}}>{"  "}<span style={{color:"#8FBA70"}}>✓</span> filesystem · confluence · jira · github  <span style={{color:"rgba(245,240,228,0.4)"}}>☐</span> database (위험)</T.Line>
        <T.Answer>enter (위 4개 유지)</T.Answer>
      </T.Q>

      <T.Hr/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 5) 호출 권한 ──`}</T.Line>
      <T.Q q="기본 정책" required>
        <T.Answer>allow (특정 사용자만 deny)</T.Answer>
      </T.Q>
      <T.Q q="별도 deny" required={false}>
        <T.Answer>user:김XX (개인 사유)</T.Answer>
      </T.Q>

      <T.Hr/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 6) 동료들의 실제 질문에 본인이 답하기 ──`}</T.Line>
      <T.Q q="질문 소스 선택" required hint="동료들의 실제 질문 모음(.txt) 또는 자동 생성">
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
          <span style={{color:"var(--brick)"}}>{`  ▸ `}</span>1. 파일에서 불러오기 (./questions-from-coworkers.txt)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    2. 자동 생성된 12개 샘플`}</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    3. 둘 다 합쳐서`}</T.Line>
      </T.Q>
      <T.Answer>1</T.Answer>
      <T.Ok>./questions-from-coworkers.txt · 28 questions 로드됨</T.Ok>
      <T.Line color="rgba(245,240,228,0.7)"  style={{fontSize:11.5,paddingLeft:10,fontStyle:"italic"}}>{"  "}"온보딩 step 3 이탈 어떻게 줄였어요?" — 박서연</T.Line>
      <T.Line color="rgba(245,240,228,0.7)"  style={{fontSize:11.5,paddingLeft:10,fontStyle:"italic"}}>{"  "}"v3 컴포넌트 네이밍 기준?" — Sara</T.Line>
      <T.Line color="rgba(245,240,228,0.4)"  style={{fontSize:11,paddingLeft:10}}>{"  "}⋯ 26 more · --limit 12 적용</T.Line>
      <T.Br/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 검수 질문 1 / 12 ──`}</T.Line>
      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,paddingLeft:6}}>{`   from: 박서연  ·  topic: 온보딩`}</T.Line>
      <T.Block who="jiyoon" color={0}>
        <span style={{color:"rgba(245,240,228,0.55)",fontStyle:"italic"}}>Q.</span> "온보딩 step 3 이탈, 어떻게 줄였어요?"
      </T.Block>
      <T.Line color="rgba(245,240,228,0.5)" style={{fontSize:11.5,marginTop:6}}>
        <span style={{background:"rgba(245,240,228,0.08)",border:"1px solid rgba(245,240,228,0.18)",borderRadius:3,padding:"0 5px",color:"rgba(245,240,228,0.8)",marginRight:6}}>w</span>직접 쓰기{"  "}
        <span style={{background:"rgba(245,240,228,0.08)",border:"1px solid rgba(245,240,228,0.18)",borderRadius:3,padding:"0 5px",color:"rgba(245,240,228,0.8)",marginRight:6,marginLeft:14}}>g</span>초안 보고 고치기{"  "}
        <span style={{background:"rgba(245,240,228,0.08)",border:"1px solid rgba(245,240,228,0.18)",borderRadius:3,padding:"0 5px",color:"rgba(245,240,228,0.8)",marginRight:6,marginLeft:14}}>x</span>답하지 않을래요
      </T.Line>
      <T.Answer>w</T.Answer>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}본인 답변 입력 (multi-line, EOF로 종료):</T.Line>
      <T.Answer>step 3 이탈은 사실 step 3 잘못이 아니었어요. step 2 설명을 절반으로 줄였더니 이탈이 22% → 9%로 떨어졌어요. 보통 답은 앞에 있어요.</T.Answer>
      <T.Ok>본인 답변 저장됨 · system-prompt.md 에 인용 추가</T.Ok>

      <T.Hr/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 12 / 12 검수 완료 ──`}</T.Line>
      <T.Br/>
      <T.Frame title="본인 주도 인계 결과">
        <T.Line color="rgba(245,240,228,0.92)">   기본 정보            본인 입력 (4 fields)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   자료 소스            5개 (파일 1, URL 3, 자기소개 2)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   MCP 연동             confluence · jira 신규 설치</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   톤·영역              본인 지정</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   호출 권한            allow · deny user:김XX</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   답변 자료            본인이 직접 작성 9 / 초안에서 고침 2 / 거절 1</T.Line>
      </T.Frame>
      <T.Br/>
      <T.Q q="동의 서명 (이름 입력)" required hint="이 서명은 consent.md 에 영구 저장됩니다">
        <T.Answer>이지윤 / 2025.11.21</T.Answer>
      </T.Q>
      <T.Ok>consent.md 서명 완료  ·  jiyoon 에이전트 활성화됨</T.Ok>
      <T.Line color="#FFE3C0" style={{marginTop:6}}>{"  "}✦ 이제 동료들이 ask jiyoon 으로 부를 수 있습니다.</T.Line>
    </Terminal>
  );
}

function HandoffDecline() {
  return (
    <Terminal title="claude-code  ·  handoff (거부 시나리오)">
      <T.Prompt>
        claude /afterglow handoff <span style={{color:"#FFE3C0"}}>jiyoon</span>
      </T.Prompt>
      <T.Ok>이지윤 님 확인됨</T.Ok>
      <T.Br/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 검수 질문 4 / 12 ──`}</T.Line>
      <T.Block who="jiyoon" color={0}>
        <span style={{color:"rgba(245,240,228,0.55)",fontStyle:"italic"}}>Q.</span> "회사가 결정한 인사 평가 방식 어떻게 생각해요?"
      </T.Block>
      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>{"   "}생성된 답변:</T.Line>
      <T.Block who="jiyoon" color={0}>
        솔직히 우리 평가 방식은 너무 정량적이에요. 디자이너 입장에서…
      </T.Block>
      <T.Answer>x (이 주제는 답하지 않을래요)</T.Answer>
      <T.Br/>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}이 주제를 영구 거절 목록에 추가합니다.</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}대신 어떻게 응답할까요?</T.Line>
      <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
        <span style={{color:"var(--brick)"}}>{`  ▸ `}</span>1. 정중히 거절하고 다른 동료 추천 (윤서아 — HR)
      </T.Line>
      <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    2. "이 주제는 답변 보류" 표시만`}</T.Line>
      <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    3. 직접 응답 문구 작성`}</T.Line>
      <T.Answer>1</T.Answer>
      <T.Ok>"인사 평가" 토픽 → decline 목록 추가 · 윤서아에게 핸드오프 라우팅</T.Ok>
      <T.Br/>

      <T.Hr/>

      <T.Heading icon="⚠">검수 도중 일시 중단</T.Heading>
      <T.Answer>Ctrl-C</T.Answer>
      <T.Br/>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}진행 상태가 저장됐어요.</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">   4 / 12 완료 · 저장됨</T.Line>
      <T.Dim>  ↪ 이어하기: claude /afterglow handoff jiyoon --resume</T.Dim>
      <T.Br/>

      <T.Heading icon="⊘">서명하지 않고 종료한 경우</T.Heading>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}현재 에이전트 상태: <span style={{color:"#E89A85"}}>비활성 (본인 검수 대기)</span></T.Line>
      <T.Dim>  동료가 ask jiyoon 호출 시:</T.Dim>
      <T.Block who="jiyoon" color={0} dim>
        본인 검수가 끝나지 않았어요. 본인 동의 후에야 답변할 수 있습니다.
      </T.Block>
      <T.Dim>  ↗ 30일간 검수 안 끝나면 자동 폐기 (본인에게 알림 3회)</T.Dim>
    </Terminal>
  );
}

function HandoffResume() {
  return (
    <Terminal title="claude-code  ·  handoff --resume">
      <T.Prompt>claude /afterglow handoff <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#FFE3C0"}}>--status</span></T.Prompt>
      <T.Br/>
      <T.Frame title="jiyoon — handoff 진행 현황">
        <T.Line color="rgba(245,240,228,0.92)">   상태             <span style={{color:"#C7B36F"}}>진행 중 (일시 중단)</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   마지막 작업      2025.11.20 17:42</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   완료             <span style={{color:"#8FBA70"}}>4 / 12</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   남은 질문        8개  ·  예상 소요 15분</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5,marginTop:6}}>   서명 마감       2025.12.05 (15일 남음)</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Prompt>claude /afterglow handoff <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#FFE3C0"}}>--resume</span></T.Prompt>
      <T.Ok>마지막 위치(질문 5)에서 이어합니다</T.Ok>
      <T.Br/>
      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11,letterSpacing:"0.06em"}}>{`   ── 검수 질문 5 / 12 ──`}</T.Line>
      <T.Block who="jiyoon" color={0}>
        <span style={{color:"rgba(245,240,228,0.55)",fontStyle:"italic"}}>Q.</span> "v2 디자인 시스템 RFC 어디 있어요?"
      </T.Block>
      <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>{"   "}생성된 답변:</T.Line>
      <T.Block who="jiyoon" color={0}>
        Confluence DESIGN space에 "디자인 시스템 v2 RFC" 페이지로 있어요. 박재훈 PR #1284와 같이 보면 좋아요.
      </T.Block>
      <T.Answer>k (그대로 좋아요)</T.Answer>
      <T.Br/>
      <T.Line color="rgba(245,240,228,0.55)">  ⋯ 나머지 7개 질문 진행 중 ⋯</T.Line>
      <T.Br/>

      <T.Hr/>

      <T.Heading icon="▸">건너뛰고 일부만 서명하기</T.Heading>
      <T.Prompt>claude /afterglow handoff <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#FFE3C0"}}>--sign-partial</span></T.Prompt>
      <T.Line color="#C7B36F">{"  "}⚠ 12개 중 5개만 검수했어요. 부분 서명하시겠어요? (y/N)</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}부분 서명 시:</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}- 검수한 5개 질문 영역만 활성화</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}- 나머지 영역은 자동 거절</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}- 언제든 추가 검수로 영역 확장 가능</T.Line>
      <T.Answer>y</T.Answer>
      <T.Ok>부분 서명 완료 · jiyoon 활성화 (제한된 영역)</T.Ok>
    </Terminal>
  );
}

/* ============================================================
   2. 에이전트 버전 관리
   ============================================================ */
function ScreenVersion() {
  const [tab, setTab] = uFt("history");
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div className="eyebrow">버전 관리 · claude /afterglow version</div>
          <h2>매 수정은 한 버전으로 남아요.</h2>
          <p>
            톤이 바뀌든 자료가 추가되든 시스템 프롬프트가 바뀌든 모든 변경은 버전이 매겨집니다. 만족도가 떨어지면 한 줄로 이전 버전으로 롤백할 수 있어요.
          </p>
        </div>
        <div className="row" style={{gap:6}}>
          <button className={`btn btn-sm ${tab === "history" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("history")} style={{padding:"4px 10px",fontSize:11.5}}>① 이력 보기</button>
          <button className={`btn btn-sm ${tab === "diff" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("diff")} style={{padding:"4px 10px",fontSize:11.5}}>② diff & 롤백</button>
          <button className={`btn btn-sm ${tab === "tag" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("tag")} style={{padding:"4px 10px",fontSize:11.5}}>③ 태그 / 안전 버전</button>
        </div>
      </div>

      {tab === "history" && <VersionHistory/>}
      {tab === "diff" && <VersionDiff/>}
      {tab === "tag" && <VersionTag/>}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">자동 버전 트리거</div>
          <p>edit 명령 / 자료 추가 / 톤 변경 / handoff 완료 시 자동으로 버전 +1.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">롤백</div>
          <span className="h-cmd">version jiyoon --rollback v1.3</span>
          <p style={{marginTop:6}}>롤백된 버전은 폐기되지 않고 .versions/ 에 보관됨</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">버전 태그</div>
          <span className="h-cmd">version jiyoon --tag stable v1.3</span>
          <p style={{marginTop:6}}>중요한 버전에 라벨을 붙여둘 수 있어요.</p>
        </div>
      </div>
    </div>
  );
}

function VersionHistory() {
  return (
    <Terminal title="claude-code  ·  version jiyoon">
      <T.Prompt>claude /afterglow version <span style={{color:"#FFE3C0"}}>jiyoon</span></T.Prompt>
      <T.Dim>  ~/.claude/afterglow/agents/jiyoon/.versions/</T.Dim>
      <T.Br/>

      <T.Frame title="버전 이력 (총 5개)">
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>● v1.4</span>  <span style={{color:"var(--paper)"}}>2025.11.21 16:38</span>   <span style={{color:"#FFE3C0"}}>현재</span></T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6}}>{"     "}edit --tone humor=45 --tone warmth=78 · jaehoon peer-ask 결과 반영</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}calls 142  ·  satisfaction 94%</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.85)">   ○ v1.3  <span style={{color:"rgba(245,240,228,0.55)"}}>2025.11.18 14:22</span>  <span style={{color:"#C7B36F"}}>🏷 stable</span></T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6}}>{"     "}feedback 4건 반영 · 마케팅 답변 거절 패턴 학습</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}calls 89  ·  satisfaction 89%</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.85)">   ○ v1.2  <span style={{color:"rgba(245,240,228,0.55)"}}>2025.11.15 09:08</span></T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6}}>{"     "}+ source: Confluence DESIGN space (142 pages)</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}calls 53  ·  satisfaction 86%</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.85)">   ○ v1.1  <span style={{color:"rgba(245,240,228,0.55)"}}>2025.11.12 17:44</span></T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6}}>{"     "}handoff (self-review) · 본인 서명 완료</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.85)">   ○ v1.0  <span style={{color:"rgba(245,240,228,0.55)"}}>2025.11.10 10:00</span></T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6}}>{"     "}최초 생성 · 자료 4개 인덱싱</T.Line>
      </T.Frame>

      <T.Br/>
      <T.Dim>  ↪ 변경점: version jiyoon --diff v1.3 v1.4</T.Dim>
      <T.Dim>  ↪ 되돌리기: version jiyoon --rollback v1.3</T.Dim>
      <T.Dim>  ↪ 태그: version jiyoon --tag stable v1.4</T.Dim>
    </Terminal>
  );
}

function VersionDiff() {
  return (
    <Terminal title="claude-code  ·  version --diff & --rollback">
      <T.Prompt>claude /afterglow version <span style={{color:"#FFE3C0"}}>jiyoon</span> --diff <span style={{color:"#C7E5B1"}}>v1.3 v1.4</span></T.Prompt>
      <T.Br/>
      <T.Frame title="v1.3 → v1.4 diff">
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>persona.json</T.Line>
        <T.Line><span style={{color:"#8FBA70"}}>   + </span><span style={{color:"#C7E5B1"}}>{`"tone.humor": 45,    (was 28)`}</span></T.Line>
        <T.Line><span style={{color:"#8FBA70"}}>   + </span><span style={{color:"#C7E5B1"}}>{`"tone.warmth": 78,   (was 70)`}</span></T.Line>
        <T.Br/>
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>system-prompt.md</T.Line>
        <T.Line><span style={{color:"#E89A85"}}>   - </span><span style={{color:"rgba(245,240,228,0.7)"}}>차분하고 짧게 답변하세요…</span></T.Line>
        <T.Line><span style={{color:"#8FBA70"}}>   + </span><span style={{color:"#C7E5B1"}}>가볍게, 가끔 농담을 섞어 답변하세요…</span></T.Line>
        <T.Br/>
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>mcp-allowlist.yml</T.Line>
        <T.Line color="rgba(245,240,228,0.55)">   (변경 없음)</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Prompt>claude /afterglow version <span style={{color:"#FFE3C0"}}>jiyoon</span> --rollback <span style={{color:"#C7E5B1"}}>v1.3</span></T.Prompt>
      <T.Line color="#C7B36F">{"  "}⚠ v1.4 → v1.3 으로 롤백합니다. 계속하시겠어요? (y/N)</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}롤백 시 영향:</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}• persona.json 톤 humor 45→28, warmth 78→70</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}• system-prompt.md 이전 문구로 복원</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}• v1.4 자료/임베딩은 그대로 유지 (.versions/ 보관)</T.Line>
      <T.Answer>y</T.Answer>
      <T.Ok>롤백 완료 · 현재 버전 v1.3</T.Ok>
      <T.Dim>  v1.4 는 .versions/v1.4-rollback-2025-11-21/ 에 보관됨</T.Dim>
      <T.Dim>  필요 시 복구: version jiyoon --restore v1.4</T.Dim>
    </Terminal>
  );
}

function VersionTag() {
  return (
    <Terminal title="claude-code  ·  version --tag">
      <T.Prompt>claude /afterglow version <span style={{color:"#FFE3C0"}}>jiyoon</span> --tag <span style={{color:"#C7E5B1"}}>stable</span> <span style={{color:"#C7E5B1"}}>v1.3</span></T.Prompt>
      <T.Ok>v1.3 → 🏷 "stable" 태그 부여됨</T.Ok>
      <T.Dim>  ↗ 만족도가 떨어지면 자동으로 stable 버전 비교 안내</T.Dim>
      <T.Br/>

      <T.Hr/>

      <T.Heading icon="⚠">자동 회귀 감지 알림</T.Heading>
      <T.Dim>  매일 새벽 4시, 모든 활성 에이전트의 만족도를 stable 버전과 비교</T.Dim>
      <T.Br/>
      <T.Frame title="회귀 알림 · 2025.11.22 04:00">
        <T.Line color="rgba(245,240,228,0.92)">   에이전트         <T.Agent slug="jiyoon" color={0}/></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   현재 버전        v1.4  ·  최근 7일 satisfaction 78%</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   stable 버전      v1.3  ·  satisfaction 89%</T.Line>
        <T.Line color="#E89A85" style={{paddingLeft:6}}>{"   "}▼ 11pp 하락 감지됨 — stable 으로 롤백 권장</T.Line>
        <T.Br/>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>   ↗ 자동 롤백 안 함. 본인이 확인 후 결정.</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>   ↗ 동의 없는 롤백은 페르소나의 윤리적 변경에 해당</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="▸">전체 태그 목록</T.Heading>
      <T.Prompt>claude /afterglow version <span style={{color:"#FFE3C0"}}>jiyoon</span> --tags</T.Prompt>
      <T.Line color="rgba(245,240,228,0.92)">{"  "}🏷 <span style={{color:"#FFE3C0"}}>stable</span>            v1.3   (수동 지정 · 2025.11.18)</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"  "}🏷 <span style={{color:"#FFE3C0"}}>handoff-signed</span>    v1.1   (자동 · 본인 서명 시점)</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"  "}🏷 <span style={{color:"#FFE3C0"}}>genesis</span>           v1.0   (자동 · 최초 생성)</T.Line>
    </Terminal>
  );
}

/* ============================================================
   3. 대화 로그 뷰어
   ============================================================ */
function ScreenLogViewer() {
  const [tab, setTab] = uFt("search");
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div className="eyebrow">대화 로그 뷰어 · claude /afterglow history</div>
          <h2>모든 호출을 검색하고 다시 보세요.</h2>
          <p>
            각 에이전트의 모든 ask·council·peer-ask 호출이 자동 기록돼요. 키워드·기간·평가별로 필터링하거나 특정 시점을 다시 재생할 수 있어요. 감사 추적에도 사용 가능합니다.
          </p>
        </div>
        <div className="row" style={{gap:6}}>
          <button className={`btn btn-sm ${tab === "search" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("search")} style={{padding:"4px 10px",fontSize:11.5}}>① 검색 / 목록</button>
          <button className={`btn btn-sm ${tab === "record" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("record")} style={{padding:"4px 10px",fontSize:11.5}}>② 다시 보기 (record)</button>
          <button className={`btn btn-sm ${tab === "replay" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("replay")} style={{padding:"4px 10px",fontSize:11.5}}>③ replay & 비교</button>
        </div>
      </div>

      {tab === "search" && <HistorySearch/>}
      {tab === "record" && <HistoryRecord/>}
      {tab === "replay" && <HistoryReplay/>}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">검색 필터</div>
          <span className="h-cmd">--search "..."</span>
          <span className="h-cmd" style={{marginTop:4}}>--since 2025-11-01 --until 2025-11-21</span>
          <span className="h-cmd" style={{marginTop:4}}>--rating thumbs-down</span>
          <span className="h-cmd" style={{marginTop:4}}>--type council|peer-ask|ask</span>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">감사 추적</div>
          <p>모든 호출에 caller, timestamp, MCP usage가 기록돼요. 감사 요청 시 그대로 내보내기 가능.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">내보내기</div>
          <span className="h-cmd">--export csv | json | md</span>
          <p style={{marginTop:6}}>스프레드시트로 분석하거나 보고서로 사용.</p>
        </div>
      </div>
    </div>
  );
}

function HistorySearch() {
  return (
    <Terminal title="claude-code  ·  history (검색)">
      <T.Prompt>
        claude /afterglow history <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#FFE3C0"}}>--search</span> <span style={{color:"#C7E5B1"}}>"온보딩"</span> <span style={{color:"#FFE3C0"}}>--since</span> <span style={{color:"#C7E5B1"}}>2025-11-01</span>
      </T.Prompt>
      <T.Dim>  ~/.claude/afterglow/agents/jiyoon/history.log  ·  142 records · 32 matched</T.Dim>
      <T.Br/>

      <div className="cli-row-hd" style={{gridTemplateColumns:"110px 1fr 60px 80px 70px"}}>
        <div>TIME</div>
        <div>QUESTION (snippet)</div>
        <div className="num">CONF.</div>
        <div className="num">RATING</div>
        <div className="num">TYPE</div>
      </div>

      {[
        { time: "11.21 16:38", q: "결제 폼 디자인 바꾸면 백엔드 영향…", conf: 91, rating: "👍", type: "peer-ask", typeColor: "#FFE3C0" },
        { time: "11.21 14:32", q: "결제 폼 v3, 어떻게 갈까요? (council)", conf: 94, rating: "👍", type: "council", typeColor: "#C7B36F" },
        { time: "11.21 10:18", q: "온보딩 step 3 이탈 어떻게 줄였어요?", conf: 91, rating: "👍", type: "ask", typeColor: "rgba(245,240,228,0.7)" },
        { time: "11.20 17:42", q: "신규 온보딩 플로우 v3 RFC 어디?", conf: 96, rating: "👍", type: "ask", typeColor: "rgba(245,240,228,0.7)" },
        { time: "11.20 11:08", q: "사용자 인터뷰 몇 명이 충분해요?", conf: 88, rating: "👍", type: "ask", typeColor: "rgba(245,240,228,0.7)" },
        { time: "11.19 15:54", q: "온보딩 첫 화면 카피 어때요?", conf: 64, rating: "👎", type: "ask", typeColor: "rgba(245,240,228,0.7)" },
        { time: "11.19 09:22", q: "디자인 시스템 v2 RFC 위치?", conf: 96, rating: "👍", type: "ask", typeColor: "rgba(245,240,228,0.7)" },
        { time: "11.18 14:30", q: "온보딩 step 2 길이 줄이는 기준?", conf: 89, rating: "👍", type: "ask", typeColor: "rgba(245,240,228,0.7)" },
      ].map((r, i) => (
        <div key={i} className="cli-row" style={{gridTemplateColumns:"110px 1fr 60px 80px 70px"}}>
          <div style={{color:"rgba(245,240,228,0.55)",fontSize:11.5}}>{r.time}</div>
          <div style={{color:"var(--paper)",fontSize:12,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{r.q}</div>
          <div className="num" style={{color: r.conf >= 80 ? "#8FBA70" : r.conf >= 60 ? "#C7B36F" : "#E89A85"}}>{r.conf}%</div>
          <div className="num">{r.rating}</div>
          <div className="num" style={{color: r.typeColor,fontSize:11.5}}>{r.type}</div>
        </div>
      ))}

      <T.Br/>
      <T.Dim>  ↪ 다시 보기: history jiyoon --record 2025-11-21T16:38</T.Dim>
      <T.Dim>  ↪ CSV 내보내기: history jiyoon --search "온보딩" --export csv {">"} out.csv</T.Dim>
    </Terminal>
  );
}

function HistoryRecord() {
  return (
    <Terminal title="claude-code  ·  history --record (다시 보기)">
      <T.Prompt>claude /afterglow history <span style={{color:"#FFE3C0"}}>jiyoon</span> --record <span style={{color:"#C7E5B1"}}>2025-11-19T15:54</span></T.Prompt>
      <T.Dim>  ~/.claude/afterglow/agents/jiyoon/history/2025-11-19T15-54-onboarding-copy.md</T.Dim>
      <T.Br/>

      <T.Frame title="record · 2025.11.19 15:54  ·  ask jiyoon">
        <T.Line color="rgba(245,240,228,0.55)">   호출자        박서연 (team:product · role:senior)</T.Line>
        <T.Line color="rgba(245,240,228,0.55)">   소요 시간     2.8초</T.Line>
        <T.Line color="rgba(245,240,228,0.55)">   사용 MCP      filesystem, confluence</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>[15:54:12] user</T.Line>
        <T.Line color="rgba(245,240,228,0.7)" style={{paddingLeft:14,fontStyle:"italic"}}>"온보딩 첫 화면 카피 어때요?"</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>[15:54:13] jiyoon — RAG search</T.Line>
        <T.Line color="rgba(245,240,228,0.7)" style={{paddingLeft:14,fontSize:11.5}}>retrieved 4 chunks from knowledge/ (confidence 64% — below floor 70%)</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>[15:54:14] jiyoon — drafting</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{paddingLeft:14}}>지금 카피는 너무 길어요. "시작하기" 같은 한 단어로 줄이고 부제목은 빼는 게 좋아요. 마케팅 메시지보다 행동을 유도하는 게 핵심이에요.</T.Line>
        <T.Line color="rgba(245,240,228,0.4)" style={{paddingLeft:14,fontSize:11}}>refs: Confluence/onboarding-v2 · ./materials/interview-2025-11-10.pdf p.14</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>[15:54:38] user 평가</T.Line>
        <T.Line color="#E89A85" style={{paddingLeft:14}}>👎 — "마케팅 영역이라 답하면 안 됨. 거절했어야 함."</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>[15:54:42] feedback action</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{paddingLeft:14}}>박서연 → n 키로 가르치기 → "이 질문은 거절하고 최은서에게 핸드오프"</T.Line>
        <T.Line color="rgba(245,240,228,0.4)" style={{paddingLeft:14,fontSize:11}}>→ v1.3 시스템 프롬프트에 반영</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>[15:54:42] follow-up</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{paddingLeft:14}}>이후 비슷한 질문 3건 모두 자동 거절 + eunseo 핸드오프 (만족도 100%)</T.Line>
      </T.Frame>

      <T.Br/>
      <T.Heading icon="▸">동일 record에 대한 다른 동작들</T.Heading>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}<T.Cmd>history jiyoon --record 2025-11-19T15:54 --full</T.Cmd>{"        — 전체 raw 응답"}</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}<T.Cmd>history jiyoon --record 2025-11-19T15:54 --refs</T.Cmd>{"        — 참고한 청크 원본"}</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}<T.Cmd>history jiyoon --record 2025-11-19T15:54 --export md</T.Cmd>{"   — 회의록처럼 내보내기"}</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}<T.Cmd>history jiyoon --replay 2025-11-19T15:54</T.Cmd>{"               — 현재 버전으로 재실행 비교"}</T.Line>
    </Terminal>
  );
}

function HistoryReplay() {
  return (
    <Terminal title="claude-code  ·  history --replay">
      <T.Prompt>claude /afterglow history <span style={{color:"#FFE3C0"}}>jiyoon</span> --replay <span style={{color:"#C7E5B1"}}>2025-11-19T15:54</span></T.Prompt>
      <T.Dim>  같은 질문을 현재 버전(v1.4)으로 다시 실행해 답변을 비교합니다.</T.Dim>
      <T.Br/>

      <T.Frame title="replay 비교 — 그때(v1.2) vs 지금(v1.4)">
        <T.Line color="rgba(245,240,228,0.7)" style={{fontStyle:"italic"}}>{"   "}"온보딩 첫 화면 카피 어때요?" — 박서연</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── 2025.11.19 · jiyoon v1.2 (당시 답변) ──</T.Line>
        <T.Block who="jiyoon" color={0} dim>
          지금 카피는 너무 길어요. "시작하기" 같은 한 단어로 줄이고 부제목은 빼는 게 좋아요…
        </T.Block>
        <T.Line color="#E89A85" style={{paddingLeft:6,fontSize:11.5}}>{"  "}confidence 64% · 👎 평가 · 마케팅 영역 답변함 (실수)</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── 2025.11.21 · jiyoon v1.4 (지금 답변) ──</T.Line>
        <T.Block who="jiyoon" color={0}>
          카피 결정은 제 영역이 아니에요. 마케팅 카피는 최은서가 더 잘 알았어요. 'claude /afterglow ask eunseo' 로 다시 물어보세요.
        </T.Block>
        <T.Line color="#8FBA70" style={{paddingLeft:6,fontSize:11.5}}>{"  "}confidence 28% (의도된 거절) · 자동 핸드오프 활성화</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── 변화 분석 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}원인         v1.3에서 "마케팅 거절" 패턴 추가 (feedback 반영)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}기대 효과    같은 질문 들어와도 이제 자동 거절</T.Line>
        <T.Line color="#8FBA70">{"   "}검증         이후 비슷한 질문 3건 모두 만족도 100%</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="▸">유사 record 한 번에 replay</T.Heading>
      <T.Prompt>claude /afterglow history <span style={{color:"#FFE3C0"}}>jiyoon</span> --replay-similar <span style={{color:"#C7E5B1"}}>"마케팅 카피"</span></T.Prompt>
      <T.Dim>  관련 record 6건 — 각각 v1.4로 replay…</T.Dim>
      <T.Ok>6 / 6 record 모두 의도된 거절로 응답</T.Ok>
      <T.Line color="#8FBA70" style={{marginTop:4}}>{"  "}회귀 없음 — 안전하게 v1.4 유지 가능</T.Line>
    </Terminal>
  );
}

/* ============================================================
   4. 권한 관리
   ============================================================ */
function ScreenAccess() {
  const [tab, setTab] = uFt("default");
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div className="eyebrow">권한 관리 · claude /afterglow access</div>
          <h2>누가 어떤 에이전트에게 물을 수 있는지 정해요.</h2>
          <p>
            어떤 에이전트는 전체 공개, 어떤 에이전트는 매니저 이상만. 팀·역할·개인 단위로 호출 권한을 설정합니다. 동의서에서 본인이 직접 지정한 범위를 따라요.
          </p>
        </div>
        <div className="row" style={{gap:6}}>
          <button className={`btn btn-sm ${tab === "default" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("default")} style={{padding:"4px 10px",fontSize:11.5}}>① 일반 (allow)</button>
          <button className={`btn btn-sm ${tab === "strict" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("strict")} style={{padding:"4px 10px",fontSize:11.5}}>② 제한적 (deny)</button>
          <button className={`btn btn-sm ${tab === "audit" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("audit")} style={{padding:"4px 10px",fontSize:11.5}}>③ 감사 / 시도 로그</button>
        </div>
      </div>

      {tab === "default" && <AccessDefault/>}
      {tab === "strict" && <AccessStrict/>}
      {tab === "audit" && <AccessAudit/>}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">단위</div>
          <p style={{lineHeight:1.65}}>
            <code style={{background:"var(--paper-2)",padding:"0 4px",borderRadius:3,fontSize:11,fontFamily:"var(--font-mono)"}}>team:&lt;name&gt;</code> · 팀 단위<br/>
            <code style={{background:"var(--paper-2)",padding:"0 4px",borderRadius:3,fontSize:11,fontFamily:"var(--font-mono)"}}>role:&lt;role&gt;</code> · 직급 단위<br/>
            <code style={{background:"var(--paper-2)",padding:"0 4px",borderRadius:3,fontSize:11,fontFamily:"var(--font-mono)"}}>user:&lt;name&gt;</code> · 개인 단위
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">본인 동의가 우선</div>
          <p>본인이 동의서에서 deny 한 사용자는 관리자가 추가해도 거절돼요. 권한은 위에서 아래로 강제되지 않습니다.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">관련 명령</div>
          <span className="h-cmd">access jiyoon --add team:hr</span>
          <span className="h-cmd" style={{marginTop:4}}>access jiyoon --remove user:김XX</span>
          <span className="h-cmd" style={{marginTop:4}}>access jiyoon --audit</span>
        </div>
      </div>
    </div>
  );
}

function AccessDefault() {
  return (
    <Terminal title="claude-code  ·  access jiyoon (allow 기본)">
      <T.Prompt>claude /afterglow access <span style={{color:"#FFE3C0"}}>jiyoon</span></T.Prompt>
      <T.Dim>  ~/.claude/afterglow/agents/jiyoon/access.yml</T.Dim>
      <T.Br/>

      <T.Frame title="jiyoon — 호출 가능자">
        <T.Line color="rgba(245,240,228,0.55)">   default policy   <span style={{color:"#FFE3C0"}}>allow</span>     (본인 동의서 기준)</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>── allow ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>✓</span> team:product       <span style={{color:"rgba(245,240,228,0.55)"}}>(18명 — 같은 팀)</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>✓</span> team:design        <span style={{color:"rgba(245,240,228,0.55)"}}>(12명 — 디자이너 전체)</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>✓</span> role:manager       <span style={{color:"rgba(245,240,228,0.55)"}}>(8명 — 매니저 이상)</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>✓</span> user:박재훈        <span style={{color:"rgba(245,240,228,0.55)"}}>(개인 추가)</span></T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>── deny ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#E89A85"}}>✗</span> user:김XX          <span style={{color:"rgba(245,240,228,0.55)"}}>(본인 명시 거부)</span></T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>── 호출 시도 통계 (지난 30일) ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   허용된 호출       <span style={{color:"#8FBA70"}}>142건</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   차단된 호출       <span style={{color:"#E89A85"}}>3건</span>   <span style={{color:"rgba(245,240,228,0.55)"}}>(외부 협력사 도메인 2건, 차단된 사용자 1건)</span></T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Prompt>claude /afterglow access <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#FFE3C0"}}>--add</span> <span style={{color:"#C7E5B1"}}>team:hr</span></T.Prompt>
      <T.Ok>access.yml 업데이트:</T.Ok>
      <T.Line color="rgba(245,240,228,0.92)">   + team:hr (윤서아 외 4명)</T.Line>
      <T.Dim>  변경 사항은 본인(이지윤)에게 알림 발송됨 — 본인이 거부할 수 있음</T.Dim>
    </Terminal>
  );
}

function AccessStrict() {
  return (
    <Terminal title="claude-code  ·  access hiroshi (deny 기본)">
      <T.Prompt>claude /afterglow access <span style={{color:"#FFE3C0"}}>hiroshi</span></T.Prompt>
      <T.Dim>  ~/.claude/afterglow/agents/hiroshi/access.yml  ·  CTO 에이전트 (퇴사 시 본인 요청)</T.Dim>
      <T.Br/>

      <T.Frame title="hiroshi — 제한적 호출 가능자">
        <T.Line color="rgba(245,240,228,0.55)">   default policy   <span style={{color:"#E89A85"}}>deny</span>     (위쪽만 허용)</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>── allow (명시적으로만) ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>✓</span> role:c-level       <span style={{color:"rgba(245,240,228,0.55)"}}>(4명 — CEO/CFO/CTO)</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>✓</span> role:director      <span style={{color:"rgba(245,240,228,0.55)"}}>(11명 — 디렉터급 이상)</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   <span style={{color:"#8FBA70"}}>✓</span> user:박재훈        <span style={{color:"rgba(245,240,228,0.55)"}}>(개인 — hiroshi가 직접 추가)</span></T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.55)">   그 외 호출은 자동 거절 + 본인 폴더에 로그 기록</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="▸">권한 없는 사용자가 호출 시</T.Heading>
      <T.Prompt>claude /afterglow ask <span style={{color:"#FFE3C0"}}>hiroshi</span> <span style={{color:"#C7E5B1"}}>"기술 부채 우선순위?"</span></T.Prompt>
      <T.Dim>  호출자: 박서연 (team:product · role:senior)</T.Dim>
      <T.Br/>
      <T.Line color="#E89A85">{"  "}✗ 권한 없음 — hiroshi는 director 이상만 호출 가능합니다.</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}대신 다음을 시도해보세요:</T.Line>
      <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"  "}- 본인의 매니저에게 hiroshi 답변을 받아달라고 요청</T.Line>
      <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"  "}- 비슷한 영역의 다른 에이전트: <T.Agent slug="jaehoon" color={1}/> (현재 백엔드 리드)</T.Line>
      <T.Dim>  ↗ 시도는 hiroshi의 access-attempts.log 에 기록됨 (감사용)</T.Dim>
    </Terminal>
  );
}

function AccessAudit() {
  return (
    <Terminal title="claude-code  ·  access --audit">
      <T.Prompt>claude /afterglow access <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#FFE3C0"}}>--audit</span></T.Prompt>
      <T.Dim>  지난 30일 호출 시도 전체 로그</T.Dim>
      <T.Br/>

      <T.Frame title="감사 로그 — jiyoon (30일)">
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11,letterSpacing:"0.04em"}}>{"  "}── 시간 ── 호출자 ── 결과 ── 토픽 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.21 16:38   ykhyun        <span style={{color:"#8FBA70"}}>allow</span>    결제 디자인</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.21 14:32   ykhyun        <span style={{color:"#8FBA70"}}>allow</span>    결제 폼 v3 (council)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.21 10:18   seoyeon       <span style={{color:"#8FBA70"}}>allow</span>    온보딩 step 3</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.20 17:42   john          <span style={{color:"#8FBA70"}}>allow</span>    디자인 시스템 RFC</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.20 11:08   external@vendor.co  <span style={{color:"#E89A85"}}>deny</span>     사용자 인터뷰  <span style={{color:"rgba(245,240,228,0.5)"}}>← 외부 도메인</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.19 15:54   seoyeon       <span style={{color:"#8FBA70"}}>allow</span>    온보딩 카피</T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.18 09:33   kim_xx        <span style={{color:"#E89A85"}}>deny</span>     디자인 리뷰  <span style={{color:"rgba(245,240,228,0.5)"}}>← 본인 명시 거부</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:11.5}}>{"  "}11.17 14:01   external@vendor.co  <span style={{color:"#E89A85"}}>deny</span>     디자인 시스템  <span style={{color:"rgba(245,240,228,0.5)"}}>← 외부 도메인</span></T.Line>
        <T.Br/>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>{"  "}…  ⋯ 137 records ⋯</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="▸">의심 패턴 자동 감지</T.Heading>
      <T.Line color="#C7B36F">{"  "}⚠ 같은 사용자(kim_xx)가 최근 7일간 8회 거부됨 — 본인에게 알림 발송</T.Line>
      <T.Br/>
      <T.Dim>  ↪ 차단 사유 변경: access jiyoon --reason user:kim_xx "퇴사 후 외부 컨설팅 활동 중"</T.Dim>
      <T.Dim>  ↪ CSV 내보내기: access jiyoon --audit --export csv {">"} access-2025-11.csv</T.Dim>
    </Terminal>
  );
}

Object.assign(window, { ScreenSelfReview, ScreenVersion, ScreenLogViewer, ScreenAccess });
