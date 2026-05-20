/* roadmap.jsx — feature roadmap / planned features page */
/* global React, Icon, Badge */

const ROADMAP = {
  now: [
    {
      title: "감사 로그 & 컴플라이언스",
      desc: "모든 자료 수집·답변·휴먼 피드백을 immutable log로 보관. 개인정보 처리 동의 이력 추적. 외부 감사에 대비한 timestamped chain-of-custody 보존.",
      tags: ["감사", "법무"],
      priority: true,
      votes: 28,
      done: true,
    },
    {
      title: "신뢰도 수동 보정",
      desc: "ask 결과에 사용자가 자연어 프롬프트로 피드백하거나(\"이 부분만 다시 써줘\"), 답변 라인을 직접 편집할 수 있어요. 즉시 system-prompt에 반영.",
      tags: ["피드백", "휴먼-인-루프"],
      priority: true,
      votes: 19,
      done: true,
    },
  ],
  next: [],
  later: [
    {
      title: "신뢰도 자동 보정",
      desc: "휴먼 피드백 패턴을 분석해 모델 신뢰도 점수를 자동 재조정. 사람 가르치기 없이도 점점 정확해져요.",
      tags: ["mlops", "자동화"],
      votes: 14,
      done: true,
    },
  ],
};

function Roadmap() {
  const total = ROADMAP.now.length + ROADMAP.next.length + ROADMAP.later.length;
  return (
    <div className="screen">
      <div className="roadmap-hero">
        <div>
          <div className="eyebrow" style={{marginBottom:10}}>제품 로드맵 · 2026 Q1–Q3</div>
          <h2>지금 만들 수 있는 것보다,<br/>다음에 만들 것을 더 신중하게.</h2>
          <p>Afterglow는 사람을 흉내내는 일을 다룹니다. 그래서 기능을 빨리 넣기보다 어떤 기능이 윤리적으로 안전한지를 먼저 묻습니다. 아래는 우리가 다음 3분기 동안 검토 중인 기능들입니다.</p>
        </div>
        <div className="stat">
          <div className="stat-big">{total}</div>
          <div className="stat-label">기획 중인 기능</div>
        </div>
      </div>

      <div className="rm-cols" style={{gridTemplateColumns:"1fr 1fr"}}>
        <RoadmapCol
          quarter="2026 Q1"
          tagKind="now"
          title="지금 만드는 중"
          sub="다음 릴리스에 포함될 기능"
          items={ROADMAP.now}
        />
        <RoadmapCol
          quarter="2026 Q3+"
          tagKind=""
          title="더 멀리"
          sub="검토 단계 · 우선순위에 따라 조정"
          items={ROADMAP.later}
        />
      </div>

      <div className="card card-pad" style={{marginTop:24,display:"grid",gridTemplateColumns:"auto 1fr auto",gap:20,alignItems:"center"}}>
        <div style={{flexShrink:0,width:42,height:42,borderRadius:8,background:"var(--brick-soft)",color:"var(--brick-dark)",display:"grid",placeItems:"center"}}>
          <Icon.Sparkle/>
        </div>
        <div>
          <div className="serif" style={{fontSize:16,fontWeight:500,letterSpacing:"-0.01em"}}>여기에 없는 기능을 원하시나요?</div>
          <div className="muted" style={{fontSize:12.5,marginTop:2}}>
            기획 단계에서 사용자 의견이 가장 큰 영향을 줍니다. 메일이나 GitHub <span className="mono">connecteve/afterglow-feedback</span> 저장소에서 알려주세요.
          </div>
        </div>
        <button className="btn btn-primary btn-sm">기능 제안하기 <Icon.Arrow stroke="currentColor"/></button>
      </div>
    </div>
  );
}

function RoadmapCol({ quarter, tagKind, title, sub, items }) {
  return (
    <div className="rm-col">
      <h3>{title} <span className={`rm-quarter-tag ${tagKind}`}>{quarter}</span></h3>
      <div className="col-sub">{sub}</div>
      {items.map((it, i) => (
        <div key={i} className={`rm-card ${it.priority ? "featured" : ""}`}>
          <h5>{it.title} {it.done && <span style={{fontSize:10.5,letterSpacing:"0.04em",background:"rgba(79,122,63,0.15)",color:"var(--ok)",padding:"1px 7px",borderRadius:999,marginLeft:6,fontWeight:600}}>✓ 구현됨</span>}</h5>
          <p>{it.desc}</p>
          <div className="rm-meta">
            {it.tags.map(t => (
              <span key={t} className={`rm-tag ${it.priority && t === it.tags[0] ? "priority" : ""}`}>{t}</span>
            ))}
          </div>
          <span className="rm-vote">👍 {it.votes}</span>
        </div>
      ))}
    </div>
  );
}

Object.assign(window, { Roadmap });
