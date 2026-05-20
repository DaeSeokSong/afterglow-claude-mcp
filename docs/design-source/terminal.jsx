/* terminal.jsx — shared terminal chrome and CLI line primitives */
/* global React */

const { useState: uT, useEffect: uTE, useRef: uTR } = React;

/* Generic terminal shell */
function Terminal({ title, meta, children, height, footer }) {
  return (
    <div className="cli-shell" style={height ? { height } : undefined}>
      <div className="cli-titlebar">
        <div className="dots">
          <i style={{background:"#FF5F57"}}></i>
          <i style={{background:"#FEBC2E"}}></i>
          <i style={{background:"#28C840"}}></i>
        </div>
        <div className="title">{title || "claude-code  ·  afterglow MCP"}</div>
        <div className="meta">{meta || "v0.4.2"}</div>
      </div>
      <div className="cli-body cli-body-static">{children}</div>
      {footer && <div className="cli-footer">{footer}</div>}
    </div>
  );
}

/* CLI primitives */
const T = {
  Prompt: ({ children, dim }) => (
    <div className={`cli-line prompt ${dim ? "dim" : ""}`}>{children}</div>
  ),
  Line: ({ children, color, style }) => (
    <div className="cli-line" style={{ color: color || undefined, ...style }}>{children}</div>
  ),
  Dim: ({ children }) => <div className="cli-line" style={{color:"rgba(245,240,228,0.5)"}}>{children}</div>,
  Ok: ({ children }) => <div className="cli-line"><span style={{color:"#8FBA70"}}>✓ </span>{children}</div>,
  Warn: ({ children }) => <div className="cli-line"><span style={{color:"#E89A85"}}>! </span>{children}</div>,
  Arrow: ({ children }) => <div className="cli-line" style={{color:"#FFE3C0"}}>→ {children}</div>,
  Br: () => <div className="cli-line">&nbsp;</div>,
  Hr: () => <hr className="cli-divider"/>,
  Heading: ({ children, icon }) => (
    <div className="cli-line" style={{color:"#FFE3C0",marginTop:6,letterSpacing:"0.02em"}}>
      {icon && <span style={{marginRight:6}}>{icon}</span>}{children}
    </div>
  ),
  Q: ({ q, required, hint, children }) => (
    <div style={{margin:"8px 0"}}>
      <div className="cli-line" style={{color:"rgba(245,240,228,0.85)"}}>
        <span style={{color:"#C7B36F"}}>? </span>
        <span style={{color:"var(--paper)"}}>{q}</span>
        {" "}
        <span style={{fontSize:10.5,padding:"0 6px",borderRadius:3,marginLeft:4,background: required ? "rgba(181,72,44,0.25)" : "rgba(245,240,228,0.1)",color: required ? "#E89A85" : "rgba(245,240,228,0.6)",letterSpacing:"0.04em"}}>
          {required ? "필수" : "선택"}
        </span>
      </div>
      {hint && <div className="cli-line" style={{color:"rgba(245,240,228,0.4)",fontSize:11.5,paddingLeft:18}}>{hint}</div>}
      {children && <div style={{paddingLeft:18}}>{children}</div>}
    </div>
  ),
  Answer: ({ children, skipped }) => (
    <div className="cli-line" style={{color: skipped ? "rgba(245,240,228,0.45)" : "#C7E5B1",paddingLeft:18,fontStyle: skipped ? "italic" : "normal"}}>
      <span style={{color:"var(--brick)"}}>{skipped ? "↳ " : "> "}</span>{children}
    </div>
  ),
  /* Inline-styled command snippet */
  Cmd: ({ children }) => <span style={{color:"var(--paper)",background:"rgba(245,240,228,0.06)",padding:"0 6px",borderRadius:3}}>{children}</span>,
  /* Agent reference pill */
  Agent: ({ slug, color = 0 }) => {
    const colors = ["#B5482C","#1F4A48","#5A7A3D","#4A3B6B","#B58A2C","#6B3F2E"];
    return (
      <span style={{
        display:"inline-flex",alignItems:"center",gap:6,
        background:"rgba(245,240,228,0.05)",
        border:"1px solid rgba(245,240,228,0.12)",
        padding:"1px 7px",borderRadius:4,fontSize:11.5
      }}>
        <span style={{
          width:12,height:12,borderRadius:3,background:colors[color%6],
          display:"inline-block"
        }}></span>
        <span style={{color:"#FFE3C0"}}>{slug}</span>
      </span>
    );
  },
  Block: ({ children, who, color = 0, dim }) => (
    <div style={{margin:"8px 0"}}>
      {who && (
        <div className="cli-line" style={{color:"rgba(245,240,228,0.55)",fontSize:11.5,marginBottom:2}}>
          <T.Agent slug={who} color={color}/> says
        </div>
      )}
      <div className="cli-block" style={dim ? {opacity:0.7} : undefined}>{children}</div>
    </div>
  ),
  Progress: ({ value, label }) => {
    const bars = Math.floor(value / 5);
    return (
      <div className="cli-line">
        <span style={{color:"var(--brick)"}}>{"█".repeat(bars)}</span>
        <span style={{color:"rgba(245,240,228,0.25)"}}>{"░".repeat(20 - bars)}</span>
        <span style={{marginLeft:12,color:"var(--paper)"}}>{value}%</span>
        {label && <span style={{marginLeft:10,color:"rgba(245,240,228,0.55)"}}>· {label}</span>}
      </div>
    );
  },
  /* Box-drawn frame for inspect / report */
  Frame: ({ title, children }) => (
    <div style={{margin:"10px 0",fontFamily:"var(--font-mono)",fontSize:12.5,lineHeight:1.7}}>
      <div className="cli-line" style={{color:"rgba(245,240,228,0.55)"}}>
        ╭─ {title} {"─".repeat(Math.max(2, 56 - title.length))}╮
      </div>
      <div style={{paddingLeft:4,paddingRight:4}}>{children}</div>
      <div className="cli-line" style={{color:"rgba(245,240,228,0.55)"}}>
        ╰{"─".repeat(60)}╯
      </div>
    </div>
  ),
  /* Section divider within a frame */
  Section: ({ title, children }) => (
    <>
      <div className="cli-line" style={{color:"rgba(245,240,228,0.55)",marginTop:6}}>
        ├─ {title} {"─".repeat(Math.max(2, 56 - title.length))}┤
      </div>
      <div style={{paddingLeft:4,paddingRight:4}}>{children}</div>
    </>
  ),
};

Object.assign(window, { Terminal, T });
