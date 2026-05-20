/* overview.jsx — landing / intro page for the CLI proposal */
/* global React, Icon */

function Overview({ onGo }) {
  return (
    <div className="cli-page">
      <div style={{marginBottom:24}}>
        <div className="eyebrow" style={{marginBottom:8}}>설계 제안 · v0.4</div>
        <h1 style={{fontFamily:"var(--font-serif)",fontWeight:500,fontSize:36,letterSpacing:"-0.025em",margin:"0 0 14px",lineHeight:1.1}}>
          퇴사한 동료를 폴더 안에 두고,<br/>
          Claude Code에서 다시 만납니다.
        </h1>
        <p style={{fontSize:14.5,color:"var(--ink-3)",margin:0,lineHeight:1.65,maxWidth:"60ch"}}>
          이 제안서는 <b style={{color:"var(--ink)"}}>Claude Code CLI 안에서만 동작하는 PoC</b>를 위한 화면 모음입니다. 슬랙도 별도 서버도 웹 대시보드도 없어요. MCP를 한 번 등록한 다음부터는 모든 작업이 <code style={{background:"var(--paper-2)",padding:"1px 6px",borderRadius:4,fontSize:13,fontFamily:"var(--font-mono)"}}>~/.claude/afterglow/</code> 폴더와 슬래시 명령으로 일어납니다.
        </p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"1.1fr 1fr",gap:24,marginBottom:32}}>
        <div className="card card-pad" style={{background:"var(--ink)",color:"var(--paper)",borderColor:"var(--ink)",position:"relative",overflow:"hidden",padding:"28px 32px"}}>
          <div style={{position:"absolute",inset:0,backgroundImage:"radial-gradient(rgba(245,240,228,0.06) 0.7px, transparent 0.7px)",backgroundSize:"14px 14px",pointerEvents:"none"}}></div>
          <div style={{position:"relative"}}>
            <div style={{fontSize:11,color:"rgba(245,240,228,0.55)",letterSpacing:"0.08em",textTransform:"uppercase",fontWeight:600,marginBottom:10}}>설계 원칙</div>
            <h3 style={{fontFamily:"var(--font-serif)",fontWeight:500,fontSize:22,letterSpacing:"-0.02em",margin:"0 0 18px",color:"var(--paper)"}}>5가지를 약속합니다.</h3>
            <ol style={{margin:0,paddingLeft:18,fontSize:13.5,color:"rgba(245,240,228,0.85)",lineHeight:1.75}}>
              <li><b style={{color:"var(--paper)"}}>학습이 아니라 페르소나 + RAG.</b> Claude의 컨텍스트에 톤과 자료를 함께 주입합니다 — 모델 학습 없이 Claude Code와 100% 호환.</li>
              <li><b style={{color:"var(--paper)"}}>한 폴더에 한 사람.</b> 백업·이동·삭제·인계가 단순해져요.</li>
              <li><b style={{color:"var(--paper)"}}>모든 작업은 CLI.</b> 웹 UI 없이 명령어 하나로 끝납니다.</li>
              <li><b style={{color:"var(--paper)"}}>서로 알고, 서로 답합니다.</b> 명시적 회의도, 답하다가 옆자리에 묻듯 자발적 협의도 — 모든 대화는 회의록으로 남아요.</li>
              <li><b style={{color:"var(--paper)"}}>가짜인 척하지 않습니다.</b> 모든 답변은 ✦ 마크 + 신뢰도 + 출처와 함께 표시돼요.</li>
            </ol>
          </div>
        </div>

        <div className="card card-pad" style={{padding:"28px 32px"}}>
          <div className="eyebrow" style={{marginBottom:10}}>한 눈에 보기</div>
          <h3 className="serif" style={{fontSize:18,fontWeight:500,letterSpacing:"-0.01em",margin:"0 0 14px"}}>이렇게 흘러갑니다</h3>
          <div style={{display:"flex",flexDirection:"column",gap:10,fontSize:13,lineHeight:1.55}}>
            <FlowItem n="1" label="처음 설치" cmd="claude mcp add afterglow ..." onClick={() => onGo("init")}/>
            <FlowItem n="2" label="에이전트 만들기 (순차적)" cmd="claude /afterglow create jiyoon" onClick={() => onGo("create")}/>
            <FlowItem n="3" label="목록 보기" cmd="claude /afterglow list" onClick={() => onGo("list")}/>
            <FlowItem n="4" label="질문하기" cmd="ask jiyoon &quot;...&quot;" onClick={() => onGo("ask")}/>
            <FlowItem n="5" label="수정 (CLI 명령)" cmd="edit jiyoon --tone humor=45" onClick={() => onGo("edit")}/>
            <FlowItem n="6" label="합동 회의 (다중 에이전트)" cmd="council jiyoon jaehoon hiroshi &quot;...&quot;" onClick={() => onGo("council")}/>
            <FlowItem n="7" label="대화록 다시 보기" cmd="log council-..." onClick={() => onGo("log")}/>
          </div>
        </div>
      </div>

      <div style={{marginBottom:24}}>
        <h3 className="serif" style={{fontSize:18,fontWeight:500,letterSpacing:"-0.01em",margin:"28px 0 8px"}}>
        호출 방식 — 두 가지 모두 OK
      </h3>
      <p style={{fontSize:13,color:"var(--ink-3)",margin:"0 0 14px",lineHeight:1.6}}>
        Claude Code는 두 모드에서 슬래시 명령을 인식합니다. 셸에서 한 줄로 호출하거나, REPL 안에서 대화하면서 호출하거나.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:24}}>
        <div className="helper-card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--hair)",background:"var(--paper-2)"}}>
            <div className="h-eyebrow" style={{margin:0}}>① 셸에서 직접</div>
          </div>
          <div style={{background:"#0F0D0A"}}>
            <div className="cli-titlebar" style={{background:"#1B1814"}}>
              <div className="dots">
                <i style={{background:"#FF5F57"}}></i>
                <i style={{background:"#FEBC2E"}}></i>
                <i style={{background:"#28C840"}}></i>
              </div>
              <div className="title">~/code/connecteve</div>
              <div className="meta">zsh</div>
            </div>
            <div style={{padding:"14px 16px",fontFamily:"var(--font-mono)",fontSize:12,lineHeight:1.7}}>
              <div style={{color:"rgba(245,240,228,0.85)"}}>
                <span style={{color:"#8FBA70"}}>~/code/connecteve</span> <span style={{color:"var(--brick)"}}>❯</span>{" "}
                <span style={{color:"var(--paper)"}}>claude /afterglow ask </span>
                <span style={{color:"#FFE3C0"}}>jiyoon</span>
                <span style={{color:"#C7E5B1"}}>{` "..."`}</span>
              </div>
              <div style={{color:"rgba(245,240,228,0.55)",marginTop:6,fontSize:11.5}}>{`  답변 → 셸 종료, 한 번에 끝`}</div>
            </div>
          </div>
        </div>

        <div className="helper-card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--hair)",background:"var(--paper-2)"}}>
            <div className="h-eyebrow" style={{margin:0}}>② Claude Code REPL 안에서</div>
          </div>
          <div style={{background:"#0F0D0A"}}>
            <div className="cli-titlebar" style={{background:"#1B1814"}}>
              <div className="dots">
                <i style={{background:"#FF5F57"}}></i>
                <i style={{background:"#FEBC2E"}}></i>
                <i style={{background:"#28C840"}}></i>
              </div>
              <div className="title">claude-code · session #1284</div>
              <div className="meta">REPL</div>
            </div>
            <div style={{padding:"14px 16px",fontFamily:"var(--font-mono)",fontSize:12,lineHeight:1.7}}>
              <div style={{color:"rgba(245,240,228,0.55)",fontSize:11.5}}>{` Claude Code v0.7.2 · MCPs: filesystem, github, afterglow`}</div>
              <div style={{color:"rgba(245,240,228,0.85)",marginTop:6}}>
                <span style={{color:"var(--brick)"}}>{` ❯ `}</span>
                <span style={{color:"var(--paper)"}}>지난 주 디자인 회의록 정리해줘</span>
              </div>
              <div style={{color:"rgba(245,240,228,0.7)",marginTop:4,paddingLeft:14,fontSize:11.5,fontStyle:"italic"}}>
                {`  → Claude 답변…`}
              </div>
              <div style={{color:"rgba(245,240,228,0.85)",marginTop:8}}>
                <span style={{color:"var(--brick)"}}>{` ❯ `}</span>
                <span style={{color:"#FFE3C0"}}>/afterglow </span>
                <span style={{color:"var(--paper)"}}>ask </span>
                <span style={{color:"#FFE3C0"}}>jiyoon</span>
                <span style={{color:"#C7E5B1"}}>{` "그때 결정 맥락도 알려줘"`}</span>
                <span className="cli-cursor"></span>
              </div>
              <div style={{color:"rgba(245,240,228,0.55)",marginTop:6,fontSize:11.5}}>
                {`  대화 흐름 유지 · 'claude' 접두사 없이 / 만으로`}
              </div>
            </div>
          </div>
        </div>
      </div>

      <h3 className="serif" style={{fontSize:20,fontWeight:500,letterSpacing:"-0.02em",margin:"0 0 6px"}}>~/.claude/afterglow/ 폴더 구조</h3>
      <p style={{fontSize:13,color:"var(--ink-3)",margin:"0 0 14px",lineHeight:1.6}}>
        Claude Code는 두 모드에서 슬래시 명령을 인식합니다. 셸에서 한 줄로 호출하거나, REPL 안에서 대화하면서 호출하거나.
      </p>
      <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:14,marginBottom:24}}>
        <div className="helper-card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--hair)",background:"var(--paper-2)"}}>
            <div className="h-eyebrow" style={{margin:0}}>① 셸에서 직접</div>
          </div>
          <div className="cli-shell" style={{borderRadius:0,boxShadow:"none",border:"none"}}>
            <div className="cli-titlebar" style={{background:"#1B1814"}}>
              <div className="dots">
                <i style={{background:"#FF5F57"}}></i>
                <i style={{background:"#FEBC2E"}}></i>
                <i style={{background:"#28C840"}}></i>
              </div>
              <div className="title">~/code/connecteve</div>
              <div className="meta">zsh</div>
            </div>
            <div style={{padding:"14px 16px",fontFamily:"var(--font-mono)",fontSize:12,lineHeight:1.7}}>
              <div style={{color:"rgba(245,240,228,0.85)"}}>
                <span style={{color:"#8FBA70"}}>~/code/connecteve</span> <span style={{color:"var(--brick)"}}>❯</span>{" "}
                <span style={{color:"var(--paper)"}}>claude /afterglow ask </span>
                <span style={{color:"#FFE3C0"}}>jiyoon</span>
                <span style={{color:"#C7E5B1"}}>{` "..."`}</span>
              </div>
              <div style={{color:"rgba(245,240,228,0.55)",marginTop:6,fontSize:11.5}}>{`  답변 → 셸 종료, 한 번에 끝`}</div>
            </div>
          </div>
        </div>

        <div className="helper-card" style={{padding:0,overflow:"hidden"}}>
          <div style={{padding:"10px 14px",borderBottom:"1px solid var(--hair)",background:"var(--paper-2)"}}>
            <div className="h-eyebrow" style={{margin:0}}>② Claude Code REPL 안에서</div>
          </div>
          <div className="cli-shell" style={{borderRadius:0,boxShadow:"none",border:"none"}}>
            <div className="cli-titlebar" style={{background:"#1B1814"}}>
              <div className="dots">
                <i style={{background:"#FF5F57"}}></i>
                <i style={{background:"#FEBC2E"}}></i>
                <i style={{background:"#28C840"}}></i>
              </div>
              <div className="title">claude-code · session #1284</div>
              <div className="meta">REPL</div>
            </div>
            <div style={{padding:"14px 16px",fontFamily:"var(--font-mono)",fontSize:12,lineHeight:1.7}}>
              <div style={{color:"rgba(245,240,228,0.55)",fontSize:11.5}}>{` Claude Code v0.7.2 · MCPs: filesystem, github, afterglow`}</div>
              <div style={{color:"rgba(245,240,228,0.85)",marginTop:6}}>
                <span style={{color:"var(--brick)"}}>{` ❯ `}</span>
                <span style={{color:"var(--paper)"}}>지난 주 디자인 회의록 정리해줘</span>
              </div>
              <div style={{color:"rgba(245,240,228,0.7)",marginTop:4,paddingLeft:14,fontSize:11.5,fontStyle:"italic"}}>
                {`  → Claude 답변…`}
              </div>
              <div style={{color:"rgba(245,240,228,0.85)",marginTop:8}}>
                <span style={{color:"var(--brick)"}}>{` ❯ `}</span>
                <span style={{color:"#FFE3C0"}}>/afterglow </span>
                <span style={{color:"var(--paper)"}}>ask </span>
                <span style={{color:"#FFE3C0"}}>jiyoon</span>
                <span style={{color:"#C7E5B1"}}>{` "그때 결정 맥락도 알려줘"`}</span>
                <span className="cli-cursor"></span>
              </div>
              <div style={{color:"rgba(245,240,228,0.55)",marginTop:6,fontSize:11.5}}>
                {`  대화 흐름 유지 · 'claude' 접두사 없이 / 만으로`}
              </div>
            </div>
          </div>
        </div>
      </div>
        <p style={{fontSize:13,color:"var(--ink-3)",margin:"0 0 14px",lineHeight:1.6}}>모든 에이전트는 자기 폴더 하나를 가져요. persona.json이 정체성, lora.safetensors가 학습된 어조, knowledge/가 자료, history.log가 변경 기록입니다.</p>
        <div className="tree">
          <div className="tree-line"><span className="folder">~/.claude/afterglow/</span></div>
          <div className="tree-line"><span className="glyph">├─ </span><span className="file">config.yml</span><span className="comment">  환경 설정 (임베딩 모델 · 저장 위치)</span></div>
          <div className="tree-line"><span className="glyph">├─ </span><span className="file">registry.json</span><span className="comment">  전체 에이전트 인덱스</span></div>
          <div className="tree-line"><span className="glyph">├─ </span><span className="folder">agents/</span></div>
          <div className="tree-line"><span className="glyph">│   ├─ </span><span className="folder">jiyoon/</span></div>
          <div className="tree-line"><span className="glyph">│   │   ├─ </span><span className="file">persona.json</span><span className="comment">  이름·역할·자신있는 영역·decline</span></div>
          <div className="tree-line"><span className="glyph">│   │   ├─ </span><span className="file">system-prompt.md</span><span className="comment">  Claude에게 주입할 페르소나 프롬프트</span></div>
          <div className="tree-line"><span className="glyph">│   │   ├─ </span><span className="file">mcp-allowlist.yml</span><span className="comment">  이 에이전트가 쓸 수 있는 MCP</span></div>
          <div className="tree-line"><span className="glyph">│   │   ├─ </span><span className="folder">knowledge/</span><span className="comment">  원본 자료 (PDF / Markdown / JSON)</span></div>
          <div className="tree-line"><span className="glyph">│   │   ├─ </span><span className="folder">embeddings/</span><span className="comment">  RAG 인덱스 (벡터 DB)</span></div>
          <div className="tree-line"><span className="glyph">│   │   ├─ </span><span className="file">consent.md</span><span className="comment">  본인 동의서</span></div>
          <div className="tree-line"><span className="glyph">│   │   └─ </span><span className="file">history.log</span><span className="comment">  호출·피드백·수정 누적</span></div>
          <div className="tree-line"><span className="glyph">│   ├─ </span><span className="folder">jaehoon/</span></div>
          <div className="tree-line"><span className="glyph">│   └─ </span><span className="folder">hiroshi/</span></div>
          <div className="tree-line"><span className="glyph">├─ </span><span className="folder">councils/</span><span className="comment">  명시적 회의 + 자발적 협의 모두 누적</span></div>
          <div className="tree-line"><span className="glyph">│   ├─ </span><span className="file">2025-11-21-1432-payment-v3.md</span><span className="comment">  council 명령으로 시작된 회의</span></div>
          <div className="tree-line"><span className="glyph">│   └─ </span><span className="file">2025-11-21-1638-jiyoon-peer-jaehoon.md</span><span className="comment">  ask 도중 자발적 협의</span></div>
          <div className="tree-line"><span className="glyph">└─ </span><span className="folder">commands/</span><span className="comment">  슬래시 명령 정의</span></div>
        </div>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(3,1fr)",gap:14}}>
        <div className="helper-card">
          <div className="h-eyebrow">Phase 1 (지금)</div>
          <h5>Claude Code CLI</h5>
          <p>이 제안서가 다루는 범위. 폴더 + 슬래시 명령으로 모든 것이 일어남.</p>
        </div>
        <div className="helper-card" style={{opacity:0.7}}>
          <div className="h-eyebrow">Phase 2 (나중)</div>
          <h5>(별도 요청 시)</h5>
          <p>외부 채널 연동은 이번 PoC 범위 밖. 같은 폴더 구조를 그대로 확장하면 됩니다.</p>
        </div>
        <div className="helper-card">
          <div className="h-eyebrow">참고 명령</div>
          <p style={{lineHeight:1.7}}>
            <code style={{background:"var(--paper-2)",padding:"1px 5px",borderRadius:3,fontSize:11.5,fontFamily:"var(--font-mono)"}}>--help</code>는 모든 명령에 사용 가능,
            <code style={{background:"var(--paper-2)",padding:"1px 5px",borderRadius:3,fontSize:11.5,fontFamily:"var(--font-mono)",marginLeft:6}}>--json</code>은 스크립트용 출력입니다.
          </p>
        </div>
      </div>
    </div>
  );
}

function FlowItem({ n, label, cmd, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        display:"grid",gridTemplateColumns:"22px 1fr auto",gap:12,alignItems:"center",
        padding:"8px 10px",background:"transparent",border:"1px solid transparent",borderRadius:6,
        cursor:"pointer",textAlign:"left",
      }}
      onMouseEnter={(e) => { e.currentTarget.style.background = "var(--paper-2)"; e.currentTarget.style.borderColor = "var(--hair)"; }}
      onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; e.currentTarget.style.borderColor = "transparent"; }}
    >
      <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--ink-4)",fontWeight:600}}>{n.padStart(2, "0")}</span>
      <span style={{fontSize:13,color:"var(--ink-2)"}}>{label}</span>
      <span style={{fontFamily:"var(--font-mono)",fontSize:11,color:"var(--brick-dark)",background:"var(--paper-2)",border:"1px solid var(--hair)",padding:"2px 8px",borderRadius:4}}>{cmd}</span>
    </button>
  );
}

Object.assign(window, { Overview });
