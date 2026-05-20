/* cli_compliance.jsx — 감사 로그 / 신뢰도 수동·자동 보정 */
/* global React, Terminal, T */

const { useState: uCp } = React;

/* ============================================================
   1. 감사 로그 & 컴플라이언스
   ============================================================ */
function ScreenAudit() {
  const [tab, setTab] = uCp("immutable");
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div className="eyebrow">감사 로그 & 컴플라이언스 · claude /afterglow audit</div>
          <h2>모든 일은 immutable log 에 남습니다.</h2>
          <p>
            자료 수집·답변·휴먼 피드백·동의서 서명 — 모든 사건이 hash-chained log로 보관돼요. 한 줄도 사후 수정이 불가능하고, 외부 감사에 그대로 제출할 수 있습니다.
          </p>
        </div>
        <div className="row" style={{gap:6}}>
          <button className={`btn btn-sm ${tab === "immutable" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("immutable")} style={{padding:"4px 10px",fontSize:11.5}}>① immutable 로그</button>
          <button className={`btn btn-sm ${tab === "consent" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("consent")} style={{padding:"4px 10px",fontSize:11.5}}>② 동의 이력</button>
          <button className={`btn btn-sm ${tab === "export" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("export")} style={{padding:"4px 10px",fontSize:11.5}}>③ 감사 보고서 내보내기</button>
        </div>
      </div>

      {tab === "immutable" && <AuditImmutable/>}
      {tab === "consent" && <AuditConsent/>}
      {tab === "export" && <AuditExport/>}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">왜 immutable?</div>
          <p>각 항목은 이전 항목의 hash를 포함해요. 한 줄을 수정하면 그 이후 모든 hash가 깨집니다. 사후 조작을 즉시 감지할 수 있어요.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">보존 기간</div>
          <p style={{lineHeight:1.65}}>기본 7년 (회계·노동 관련 규정). config.yml 에서 변경 가능. 폐기 전 본인 + 친권자 양측 알림.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">관련 명령</div>
          <span className="h-cmd">audit verify --all</span>
          <span className="h-cmd" style={{marginTop:4}}>audit consent jiyoon</span>
          <span className="h-cmd" style={{marginTop:4}}>audit export --range 2025-Q4</span>
        </div>
      </div>
    </div>
  );
}

function AuditImmutable() {
  return (
    <Terminal title="claude-code  ·  audit verify">
      <T.Prompt>claude /afterglow audit verify --all</T.Prompt>
      <T.Dim>  ~/.claude/afterglow/audit/*.jsonl  ·  hash chain 검증 중…</T.Dim>
      <T.Br/>

      <T.Ok>jiyoon/audit-2025-11.jsonl   142 events · chain valid · root hash a3f8…</T.Ok>
      <T.Ok>jaehoon/audit-2025-11.jsonl  387 events · chain valid · root hash 8d2c…</T.Ok>
      <T.Ok>hiroshi/audit-2025-11.jsonl  521 events · chain valid · root hash 4e1b…</T.Ok>
      <T.Line color="#8FBA70" style={{marginTop:4}}>  무결성 검증 통과 — 1,050 events · 0 tamper</T.Line>
      <T.Br/>

      <T.Hr/>

      <T.Prompt>claude /afterglow audit log <span style={{color:"#FFE3C0"}}>jiyoon</span> --tail 6</T.Prompt>
      <T.Dim>  최근 6개 이벤트 — append-only · hash-chained</T.Dim>
      <T.Br/>

      <T.Frame title="jiyoon audit log (최근 → 옛것)">
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}[11.21 16:38:21] ASK · caller=ykhyun · conf=91 · refs=2 · rating=👍</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}prev: 7c3a91…  ·  this: <span style={{color:"#FFE3C0"}}>a3f8d4c…</span></T.Line>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11,marginTop:6}}>{"  "}[11.21 16:38:09] PEER-ASK · jiyoon → jaehoon · auto-trigger conf=64</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}prev: f2b8c1…  ·  this: 7c3a91…</T.Line>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11,marginTop:6}}>{"  "}[11.21 14:32:18] COUNCIL_START · participants=[jiyoon, jaehoon, hiroshi]</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}prev: 5a9e2f…  ·  this: f2b8c1…</T.Line>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11,marginTop:6}}>{"  "}[11.21 10:18:42] FEEDBACK · caller=seoyeon · rating=👍 · target=ask:8d2c</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}prev: 31a7b9…  ·  this: 5a9e2f…</T.Line>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11,marginTop:6}}>{"  "}[11.20 17:42:08] EDIT · field=tone.humor · old=28 · new=45 · actor=ykhyun</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}prev: 9f4d18…  ·  this: 31a7b9…</T.Line>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11,marginTop:6}}>{"  "}[11.20 11:08:14] SOURCE_ADD · source=confluence:DESIGN/v3-rfc · chunks=14</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}prev: 2c6e84…  ·  this: 9f4d18…</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="⚠">변조 시도 감지 시</T.Heading>
      <T.Prompt>claude /afterglow audit verify <span style={{color:"#FFE3C0"}}>jaehoon</span></T.Prompt>
      <T.Br/>
      <T.Line color="#E89A85">{"  "}✗ chain broken at event [11.18 09:33:12]</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}expected prev: 4a9d2e…</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"     "}actual prev:   b8c2f1…</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}이후 이벤트 14개의 hash가 모두 깨졌어요.</T.Line>
      <T.Dim>  ↗ 친권자(윤기현) + Security 팀에 자동 알림 발송됨</T.Dim>
      <T.Dim>  ↗ 백업에서 복구: audit restore jaehoon --from 2025-11-17</T.Dim>
    </Terminal>
  );
}

function AuditConsent() {
  return (
    <Terminal title="claude-code  ·  audit consent jiyoon">
      <T.Prompt>claude /afterglow audit consent <span style={{color:"#FFE3C0"}}>jiyoon</span></T.Prompt>
      <T.Dim>  ~/.claude/afterglow/agents/jiyoon/consent-history.jsonl</T.Dim>
      <T.Br/>

      <T.Frame title="jiyoon — 동의 이력 (한 줄도 수정 불가)">
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}[2025.11.10 10:00] INITIAL_CONSENT · 본인 서명</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}범위: messages, notion-pages, github-reviews</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}서명자: 이지윤 (jiyoon@connecteve.com)</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}서명 방법: OAuth + 본인 비밀번호 재인증</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}hash: e8f2a1b4c…</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}[2025.11.12 17:44] HANDOFF_SIGNED · 본인 인계 검수 완료</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}12 / 12 검수 · 거부 1 · 본인 직접 작성 11</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}서명자: 이지윤  ·  서명 문구: "이지윤 / 2025.11.12"</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}hash: f1c8d3a92…</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}[2025.11.15 09:08] SCOPE_EXTEND · 본인 동의</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}추가: Confluence/DESIGN space (142 pages)</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}요청자: ykhyun (Workspace Admin)  ·  본인 승인 시각: 11.15 14:22</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}hash: 7a2b9e5d1…</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}[2025.11.20 11:08] ACCESS_DENY_ADD · 본인 명시</T.Line>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6}}>{"     "}user:김XX (사유: 본인 비공개)</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11}}>{"     "}hash: c4d8e1a73…</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="▸">본인이 동의를 철회할 때</T.Heading>
      <T.Prompt>claude /afterglow audit consent <span style={{color:"#FFE3C0"}}>jiyoon</span> --revoke</T.Prompt>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}본인 OAuth 재인증 필요…</T.Line>
      <T.Ok>이지윤 님 확인됨</T.Ok>
      <T.Q q="철회 범위" required>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
          <span style={{color:"var(--brick)"}}>{`  ▸ `}</span>1. 전체 — 에이전트 즉시 비활성화 + 30일 후 영구 삭제
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    2. 특정 자료만 (예: github-reviews 제외)`}</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    3. 특정 사용자만 (deny 추가)`}</T.Line>
      </T.Q>
      <T.Answer>1</T.Answer>
      <T.Line color="#C7B36F">{"  "}⚠ 전체 철회는 되돌릴 수 없어요. 정말 진행하시겠어요? (y/N)</T.Line>
      <T.Answer>y</T.Answer>
      <T.Ok>CONSENT_REVOKED · jiyoon 비활성화 · 30일 후 자동 폐기</T.Ok>
      <T.Dim>  철회 사실은 audit log에 보존됨 (immutable) — 향후에도 추적 가능</T.Dim>
    </Terminal>
  );
}

function AuditExport() {
  return (
    <Terminal title="claude-code  ·  audit export (외부 감사용)">
      <T.Prompt>claude /afterglow audit export --range <span style={{color:"#C7E5B1"}}>2025-Q4</span> --format <span style={{color:"#C7E5B1"}}>compliance-pack</span></T.Prompt>
      <T.Br/>
      <T.Heading icon="▸">감사 패키지 생성 중…</T.Heading>
      <T.Dim>  ./audit-pack-2025-Q4/</T.Dim>
      <T.Br/>

      <T.Ok>events.jsonl                       1,050 events · hash-chained</T.Ok>
      <T.Ok>consent-records.jsonl              23 consent events</T.Ok>
      <T.Ok>data-sources.csv                   42 sources · 9,128 chunks indexed</T.Ok>
      <T.Ok>access-attempts.csv                567 attempts · 12 denied</T.Ok>
      <T.Ok>feedback-events.jsonl              134 ratings · 4 manual corrections</T.Ok>
      <T.Ok>chain-verification-report.txt     모든 chain 검증 통과</T.Ok>
      <T.Ok>signature.sig                      ed25519 서명 · 검증 키 첨부</T.Ok>
      <T.Br/>

      <T.Frame title="패키지 요약">
        <T.Line color="rgba(245,240,228,0.92)">   기간              2025-10-01 ~ 2025-12-31 (Q4)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   대상 에이전트     12명</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   총 이벤트         1,839건</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   동의 이벤트       23건 (서명 5, 범위 추가 8, 철회 2, 사용자 deny 8)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   거부된 호출       12건 (자세한 사유 포함)</T.Line>
        <T.Br/>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>   서명: ed25519 / 키 ID: connecteve-afterglow-2025</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>   서명 시각: 2026.01.05 09:14:22 KST</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>   파일 크기: 47.2 MB · 압축 후 14.8 MB</T.Line>
      </T.Frame>

      <T.Br/>
      <T.Ok>./audit-pack-2025-Q4.tar.gz.sig 생성됨</T.Ok>
      <T.Line color="#FFE3C0" style={{marginTop:6}}>{"  "}↗ 감사 기관 / 법무팀 / 개인정보 보호 책임자에 직접 제출 가능</T.Line>
      <T.Dim>  검증: 감사자는 included 검증 키로 hash chain을 독립적으로 재검증할 수 있어요.</T.Dim>
    </Terminal>
  );
}

/* ============================================================
   2. 신뢰도 수동 보정
   ============================================================ */
function ScreenManualFix() {
  const [tab, setTab] = uCp("prompt");
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div className="eyebrow">신뢰도 수동 보정 · claude /afterglow correct</div>
          <h2>사용자가 직접 답변을 고쳐요.</h2>
          <p>
            답변이 살짝 어긋났다면 두 가지 방식으로 즉시 고칠 수 있어요. ① 자연어 프롬프트로 "이 부분만 다시" 요청하거나 ② 답변 라인을 직접 편집. 어느 쪽이든 system-prompt와 history에 반영되어 다음 호출부터 적용됩니다.
          </p>
        </div>
        <div className="row" style={{gap:6}}>
          <button className={`btn btn-sm ${tab === "prompt" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("prompt")} style={{padding:"4px 10px",fontSize:11.5}}>① 프롬프트 피드백</button>
          <button className={`btn btn-sm ${tab === "edit" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("edit")} style={{padding:"4px 10px",fontSize:11.5}}>② 직접 편집</button>
          <button className={`btn btn-sm ${tab === "rule" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("rule")} style={{padding:"4px 10px",fontSize:11.5}}>③ 규칙으로 저장</button>
        </div>
      </div>

      {tab === "prompt" && <ManualPrompt/>}
      {tab === "edit" && <ManualEdit/>}
      {tab === "rule" && <ManualRule/>}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">두 방식의 차이</div>
          <p style={{lineHeight:1.65}}>
            <b>프롬프트</b>: 자연어로 의도만 전달 — 에이전트가 다시 씀<br/>
            <b>편집</b>: 답변 텍스트를 직접 손봄 — 본인이 정확히 통제
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">규칙으로 저장</div>
          <p>같은 유형의 잘못이 반복되면 규칙(rule)으로 저장해 미래의 답변 자체를 막거나 다르게 답하도록 강제할 수 있어요.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">관련 명령</div>
          <span className="h-cmd">correct --last "..."</span>
          <span className="h-cmd" style={{marginTop:4}}>correct --edit</span>
          <span className="h-cmd" style={{marginTop:4}}>correct --save-as-rule</span>
        </div>
      </div>
    </div>
  );
}

function ManualPrompt() {
  return (
    <Terminal title="claude-code  ·  프롬프트로 피드백">
      <T.Prompt>claude /afterglow ask <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#C7E5B1"}}>"v3 컴포넌트 네이밍 기준?"</span></T.Prompt>
      <T.Dim>  → confidence 78%</T.Dim>
      <T.Br/>
      <T.Block who="jiyoon" color={0}>
        컴포넌트는 PascalCase로 짓고, 의미가 명확한 동사+명사 조합을 권장해요. 예: SubmitButton, IconLink.
      </T.Block>
      <T.Br/>

      <T.Line color="rgba(245,240,228,0.85)">{"  "}답변에 자연어로 피드백할 수 있어요:</T.Line>
      <T.Prompt>claude /afterglow correct <span style={{color:"#FFE3C0"}}>--last</span> <span style={{color:"#C7E5B1"}}>"기준만 말고 v2에서 v3로 바뀐 부분도 함께 설명해줘"</span></T.Prompt>
      <T.Dim>  → 직전 답변에 prompt-based correction 적용 중…</T.Dim>
      <T.Br/>

      <T.Block who="jiyoon" color={0}>
        v2는 PrimaryButton 같은 시각 기준이었어요. v3에선 SubmitButton·DeleteButton처럼 의미 기준으로 바뀌었어요.{"\n\n"}
        기준 자체는 두 가지예요: <span style={{color:"#FFE3C0"}}>(1)</span> 의미 기반 네이밍 — 시각이 아니라 의도 표현, <span style={{color:"#FFE3C0"}}>(2)</span> 변형은 prop으로 — variant/size 같은 시각 차이는 모두 prop으로 표현. 이렇게 바뀐 이유는 디자인 토큰을 갈아끼울 때 컴포넌트 이름을 안 바꿔도 되게 하기 위해서였어요.
      </T.Block>
      <T.Dim>  ↗ 피드백이 system-prompt 의 "변경 맥락도 함께 설명" 패턴으로 저장됨</T.Dim>
      <T.Dim>  ↗ 비슷한 질문 들어오면 자동으로 이 패턴 적용</T.Dim>

      <T.Hr/>

      <T.Heading icon="▸">여러 번 반복하면 자동 학습</T.Heading>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}같은 유형의 피드백을 3회 이상 받으면 알림:</T.Line>
      <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:6,fontSize:12}}>
        {"  "}<span style={{color:"#C7B36F"}}>{`▸ `}</span>"맥락을 함께 설명해줘" 피드백이 4회 누적 — 이를 기본 동작으로 만들까요? (y/N)
      </T.Line>
      <T.Answer>y</T.Answer>
      <T.Ok>system-prompt 에 영구 반영됨 · v1.5 로 버전 +1</T.Ok>
    </Terminal>
  );
}

function ManualEdit() {
  return (
    <Terminal title="claude-code  ·  답변 직접 편집">
      <T.Prompt>claude /afterglow ask <span style={{color:"#FFE3C0"}}>jiyoon</span> <span style={{color:"#C7E5B1"}}>"디자인 시스템 RFC 어디 있어요?"</span></T.Prompt>
      <T.Dim>  → confidence 88%</T.Dim>
      <T.Br/>
      <T.Block who="jiyoon" color={0}>
        Confluence의 DESIGN 스페이스에 있어요. "디자인 시스템 v2 RFC" 페이지를 찾아보세요. 같이 검토했던 PR은 #1284였어요.
      </T.Block>
      <T.Br/>

      <T.Line color="rgba(245,240,228,0.85)">{"  "}직접 편집으로 정확한 링크를 넣어볼게요:</T.Line>
      <T.Prompt>claude /afterglow correct <span style={{color:"#FFE3C0"}}>--last</span> <span style={{color:"#FFE3C0"}}>--edit</span></T.Prompt>
      <T.Dim>  $EDITOR=vim · 직전 답변 편집 모드 열림</T.Dim>
      <T.Br/>

      <T.Line color="rgba(245,240,228,0.55)" style={{fontFamily:"var(--font-mono)",fontSize:11}}>{"  "}╭─ vim · last-answer.md ─────────────────────────────╮</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"  "}<span style={{color:"rgba(245,240,228,0.4)"}}>1 </span>Confluence의 DESIGN 스페이스에 있어요.</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"  "}<span style={{color:"rgba(245,240,228,0.4)"}}>2 </span>{`"디자인 시스템 v2 RFC" 페이지를 찾아보세요.`}</T.Line>
      <T.Line color="rgba(245,240,228,0.92)">{"  "}<span style={{color:"rgba(245,240,228,0.4)"}}>3 </span>같이 검토했던 PR은 #1284였어요.</T.Line>
      <T.Line color="rgba(245,240,228,0.4)" style={{fontFamily:"var(--font-mono)",fontSize:11}}>{"  "}~                                                  </T.Line>
      <T.Line color="rgba(245,240,228,0.55)" style={{fontFamily:"var(--font-mono)",fontSize:11}}>{"  "}╰─ -- INSERT --                          :wq | :q! ╯</T.Line>
      <T.Br/>
      <T.Dim>  편집 후 저장 (:wq) → 변경 사항:</T.Dim>
      <T.Frame title="diff">
        <T.Line><span style={{color:"#E89A85"}}>{"  - "}</span><span style={{color:"rgba(245,240,228,0.7)"}}>{`"디자인 시스템 v2 RFC" 페이지를 찾아보세요.`}</span></T.Line>
        <T.Line><span style={{color:"#8FBA70"}}>{"  + "}</span><span style={{color:"#C7E5B1"}}>{`정확한 경로: Confluence > DESIGN > Architecture > "v2 RFC"`}</span></T.Line>
        <T.Line><span style={{color:"#8FBA70"}}>{"  + "}</span><span style={{color:"#C7E5B1"}}>https://connecteve.atlassian.net/wiki/spaces/DESIGN/pages/142841</span></T.Line>
      </T.Frame>
      <T.Ok>편집 반영 · history에 corrected answer로 저장됨</T.Ok>
      <T.Br/>
      <T.Q q="이 수정을 system-prompt 패턴으로 학습할까요?" required>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
          <span style={{color:"var(--brick)"}}>{`  ▸ `}</span>1. 이번 한 번만 (history 기록만)
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    2. 같은 유형엔 항상 (system-prompt 반영)`}</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    3. 강제 규칙으로 저장 (rule 탭 참고)`}</T.Line>
      </T.Q>
      <T.Answer>2</T.Answer>
      <T.Ok>"링크가 있을 땐 항상 전체 URL 포함" 패턴 반영됨 · v1.5</T.Ok>
    </Terminal>
  );
}

function ManualRule() {
  return (
    <Terminal title="claude-code  ·  보정을 규칙으로 저장">
      <T.Prompt>claude /afterglow correct <span style={{color:"#FFE3C0"}}>--save-as-rule</span></T.Prompt>
      <T.Dim>  최근 50회 호출 중 비슷한 보정을 받은 답변을 분석합니다…</T.Dim>
      <T.Br/>
      <T.Heading icon="▸">반복 패턴 3개 감지</T.Heading>
      <T.Br/>

      <T.Frame title="제안된 규칙">
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── #1 (4회 보정됨) ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}답변에 페이지나 PR을 언급할 땐 정확한 URL을 함께 포함한다</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:6,fontSize:11.5}}>{"  "}sample: "디자인 시스템 v2 RFC" → "...v2 RFC (https://...)"</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── #2 (3회 보정됨) ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}변경된 결정을 설명할 땐 'v? → v? 어떻게 바뀌었는지' 함께 말한다</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── #3 (3회 보정됨) ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}'그때'라는 표현 대신 정확한 날짜 / 분기를 명시한다</T.Line>
      </T.Frame>

      <T.Br/>
      <T.Q q="어느 규칙을 영구 저장할까요? (다중 선택)" required>
        <T.Answer>1, 2, 3 (전부)</T.Answer>
      </T.Q>
      <T.Ok>3개 규칙이 ~/.claude/afterglow/agents/jiyoon/rules.yml 에 저장됨</T.Ok>
      <T.Dim>  ↗ 다음 호출부터 system-prompt 상단에 우선 주입됨</T.Dim>
      <T.Dim>  ↗ 규칙 비활성화: correct --disable-rule R-002</T.Dim>

      <T.Hr/>

      <T.Heading icon="▸">저장된 규칙 보기</T.Heading>
      <T.Prompt>claude /afterglow correct <span style={{color:"#FFE3C0"}}>--rules</span></T.Prompt>
      <T.Br/>
      <T.Frame title="rules.yml — 활성 규칙 5개">
        <T.Line color="rgba(245,240,228,0.92)">   R-001  <span style={{color:"#8FBA70"}}>●</span> 마케팅 영역 자동 거절 (handoff에서 본인 지정)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   R-002  <span style={{color:"#8FBA70"}}>●</span> 페이지·PR 언급 시 정확한 URL 포함</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   R-003  <span style={{color:"#8FBA70"}}>●</span> 변경된 결정 설명 시 before → after 함께</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   R-004  <span style={{color:"#8FBA70"}}>●</span> '그때' 대신 날짜/분기 명시</T.Line>
        <T.Line color="rgba(245,240,228,0.55)">   R-005  <span style={{color:"rgba(245,240,228,0.4)"}}>○</span> 답변 끝에 항상 출처 명시 (현재 비활성)</T.Line>
      </T.Frame>
    </Terminal>
  );
}

/* ============================================================
   3. 신뢰도 자동 보정
   ============================================================ */
function ScreenAutoFix() {
  const [tab, setTab] = uCp("recalc");
  return (
    <div className="cli-page">
      <div className="cli-page-h" style={{display:"flex",alignItems:"flex-end",justifyContent:"space-between"}}>
        <div>
          <div className="eyebrow">신뢰도 자동 보정 · claude /afterglow recalibrate</div>
          <h2>피드백 패턴으로 신뢰도를 스스로 조정해요.</h2>
          <p>
            사람의 가르치기를 누적해서 토픽별 신뢰도 점수를 자동 재조정합니다. 자주 👎가 누적된 영역은 신뢰도가 낮아져 자동 거절되고, 👍가 안정되는 영역은 더 자신있게 답해요. 모든 조정은 history에 기록되어 사람이 검토 가능합니다.
          </p>
        </div>
        <div className="row" style={{gap:6}}>
          <button className={`btn btn-sm ${tab === "recalc" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("recalc")} style={{padding:"4px 10px",fontSize:11.5}}>① 재조정 결과</button>
          <button className={`btn btn-sm ${tab === "schedule" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("schedule")} style={{padding:"4px 10px",fontSize:11.5}}>② 자동 스케줄</button>
          <button className={`btn btn-sm ${tab === "guardrail" ? "btn-primary" : "btn-ghost"}`} onClick={() => setTab("guardrail")} style={{padding:"4px 10px",fontSize:11.5}}>③ 가드레일</button>
        </div>
      </div>

      {tab === "recalc" && <AutoRecalc/>}
      {tab === "schedule" && <AutoSchedule/>}
      {tab === "guardrail" && <AutoGuardrail/>}

      <div className="helper-row">
        <div className="helper-card">
          <div className="h-eyebrow">자동 vs 수동</div>
          <p style={{lineHeight:1.65}}>
            <b>자동</b>: 통계 기반 신뢰도 점수 조정. 답변 내용은 안 바꿔요.<br/>
            <b>수동</b>: 사람이 답변 자체를 고침. 즉시 반영.
          </p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">언제 트리거?</div>
          <p>매일 새벽 4시 자동 + 피드백 50건 누적 시 즉시 + 사용자가 <code style={{background:"var(--paper-2)",padding:"0 4px",borderRadius:3,fontSize:11,fontFamily:"var(--font-mono)"}}>recalibrate</code> 명령으로 수동 호출.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">관련 명령</div>
          <span className="h-cmd">recalibrate jiyoon</span>
          <span className="h-cmd" style={{marginTop:4}}>recalibrate jiyoon --dry-run</span>
          <span className="h-cmd" style={{marginTop:4}}>recalibrate jiyoon --schedule daily</span>
        </div>
      </div>
    </div>
  );
}

function AutoRecalc() {
  return (
    <Terminal title="claude-code  ·  recalibrate jiyoon">
      <T.Prompt>claude /afterglow recalibrate <span style={{color:"#FFE3C0"}}>jiyoon</span></T.Prompt>
      <T.Dim>  최근 100회 호출 + 134건 피드백 분석 중…</T.Dim>
      <T.Br/>

      <T.Heading icon="▸">토픽별 신뢰도 변경 제안</T.Heading>
      <T.Frame title="recalibration plan · dry-run">
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── 토픽 ────────────── 현재 → 새 점수 ── 근거 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"  "}디자인 시스템         96 → <span style={{color:"#8FBA70"}}>97</span>   <span style={{color:"rgba(245,240,228,0.55)"}}>👍 32 / 👎 0 · stable</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"  "}온보딩 플로우         91 → <span style={{color:"#8FBA70"}}>94</span>   <span style={{color:"rgba(245,240,228,0.55)"}}>👍 28 / 👎 1 · 후속 보정 반영</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"  "}연구 / 사용자 인터뷰  88 → <span style={{color:"#8FBA70"}}>91</span>   <span style={{color:"rgba(245,240,228,0.55)"}}>👍 18 / 👎 0</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"  "}마케팅                32 → <span style={{color:"#E89A85"}}>18</span>   <span style={{color:"rgba(245,240,228,0.55)"}}>👎 6 · 거절률 ↑, 자동 거절 강화</span></T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"  "}v3 컴포넌트           — → <span style={{color:"#C7B36F"}}>71</span>   <span style={{color:"rgba(245,240,228,0.55)"}}>신규 토픽 감지 (호출 14건)</span></T.Line>
      </T.Frame>

      <T.Br/>
      <T.Q q="이 조정안을 적용할까요?" required>
        <T.Line color="rgba(245,240,228,0.85)" style={{paddingLeft:0}}>
          <span style={{color:"var(--brick)"}}>{`  ▸ `}</span>1. 전체 적용
        </T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    2. 항목별로 선택`}</T.Line>
        <T.Line color="rgba(245,240,228,0.55)" style={{paddingLeft:0}}>{`    3. 적용 안 함 (dry-run만)`}</T.Line>
      </T.Q>
      <T.Answer>1</T.Answer>
      <T.Ok>5개 토픽 신뢰도 업데이트됨 · v1.6 으로 버전 +1</T.Ok>
      <T.Dim>  ↗ 결과: 마케팅 영역 자동 거절 확실, v3 컴포넌트 답변 시 정중한 면책 추가</T.Dim>
      <T.Dim>  ↗ 모든 조정은 audit log에 기록됨 (immutable)</T.Dim>

      <T.Hr/>

      <T.Heading icon="▸">전후 비교 — 마케팅 질문</T.Heading>
      <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── before (신뢰도 32) ──</T.Line>
      <T.Block who="jiyoon" color={0} dim>
        이건 제 영역이 아니지만 한 가지 의견 드리면…
      </T.Block>
      <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── after (신뢰도 18 · 자동 거절) ──</T.Line>
      <T.Block who="jiyoon" color={0}>
        이건 제가 자신있는 영역이 아니에요. 최은서에게 물어보세요 — claude /afterglow ask eunseo "..."
      </T.Block>
    </Terminal>
  );
}

function AutoSchedule() {
  return (
    <Terminal title="claude-code  ·  recalibrate --schedule">
      <T.Prompt>claude /afterglow recalibrate <span style={{color:"#FFE3C0"}}>--schedule</span></T.Prompt>
      <T.Br/>

      <T.Frame title="자동 재조정 스케줄 (전체 에이전트)">
        <T.Line color="rgba(245,240,228,0.92)">   기본 주기            매일 04:00 KST</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   즉시 트리거          피드백 50건 누적 시</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   조용한 시간          22:00 – 08:00 (큰 변경 금지)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">   알림 발송            친권자 + 본인 (10pp 이상 변경 시)</T.Line>
        <T.Br/>
        <T.Line color="rgba(245,240,228,0.55)" style={{fontSize:11.5}}>   변경: config.yml 에서 recalibration.* 키 수정</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="▸">실행 이력</T.Heading>
      <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:12}}>{"  "}2025.11.21 04:00   12 agents · 평균 +1.2pp · 큰 변경 없음</T.Line>
      <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:12}}>{"  "}2025.11.20 04:00   12 agents · 평균 +0.8pp · jiyoon 마케팅 ↓ 14pp</T.Line>
      <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:12}}>{"  "}2025.11.19 04:00   12 agents · jaehoon SQL 영역 +6pp</T.Line>
      <T.Line color="rgba(245,240,228,0.92)" style={{fontSize:12}}>{"  "}2025.11.18 14:32   manual trigger by ykhyun · hiroshi 결정 기록 +4pp</T.Line>

      <T.Hr/>

      <T.Heading icon="▸">에이전트별 스케줄 변경</T.Heading>
      <T.Prompt>claude /afterglow recalibrate <span style={{color:"#FFE3C0"}}>hiroshi</span> --schedule <span style={{color:"#C7E5B1"}}>weekly</span></T.Prompt>
      <T.Ok>hiroshi: daily → weekly · 본인 요청에 따라 보수적 운영</T.Ok>
      <T.Dim>  CTO 에이전트는 답변이 안정적이라 자주 조정할 필요 없음</T.Dim>
    </Terminal>
  );
}

function AutoGuardrail() {
  return (
    <Terminal title="claude-code  ·  recalibrate --guardrails">
      <T.Prompt>claude /afterglow recalibrate <span style={{color:"#FFE3C0"}}>--guardrails</span></T.Prompt>
      <T.Br/>

      <T.Frame title="자동 보정 안전장치">
        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── 한 번에 바뀔 수 있는 최대치 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}점수 변경 한도        ±5pp / 회</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}거절 영역 추가        1개 / 회 (본인 알림 필수)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}거절 영역 해제        자동 불가 (수동만)</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── 본인 보호 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}handoff 서명한 답변   자동 보정 대상 제외 (본인이 직접 쓴 것)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}consent.md 의 영역    자동 비활성화 불가</T.Line>
        <T.Br/>

        <T.Line color="rgba(245,240,228,0.4)" style={{fontSize:11}}>{"  "}── 감지 패턴 ──</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}동일 사용자 패턴      한 사용자 피드백만으로 점수 변경 불가 (최소 3명 필요)</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}악의 의심             신규 사용자가 첫 7일간 👎만 누르면 가중치 0.3</T.Line>
        <T.Line color="rgba(245,240,228,0.92)">{"   "}polarization          👍·👎 양극화 시 자동 보정 일시중단 + 사람 호출</T.Line>
      </T.Frame>

      <T.Hr/>

      <T.Heading icon="⚠">가드레일이 발동했을 때</T.Heading>
      <T.Line color="#C7B36F">{"  "}⚠ jiyoon: 마케팅 영역에서 👍·👎 양극화 감지 (👍 8 / 👎 7)</T.Line>
      <T.Line color="rgba(245,240,228,0.85)">{"  "}자동 보정 일시중단됨 — 본인 또는 친권자(윤기현) 검토 필요</T.Line>
      <T.Dim>  ↗ 슬랙·이메일 알림 발송됨</T.Dim>
      <T.Dim>  ↗ 검토 후 진행: recalibrate jiyoon --force-after-review</T.Dim>

      <T.Hr/>

      <T.Heading icon="▸">가드레일 변경 (관리자만)</T.Heading>
      <T.Prompt>claude /afterglow recalibrate <span style={{color:"#FFE3C0"}}>--set-guardrail</span> <span style={{color:"#C7E5B1"}}>max-change=3pp</span></T.Prompt>
      <T.Ok>점수 변경 한도 5pp → 3pp 로 강화됨</T.Ok>
      <T.Dim>  더 보수적으로 운영. 의심 패턴 감지 시 조정폭 작게.</T.Dim>
    </Terminal>
  );
}

Object.assign(window, { ScreenAudit, ScreenManualFix, ScreenAutoFix });
