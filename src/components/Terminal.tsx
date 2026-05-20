import { Children, isValidElement, type ReactNode, type CSSProperties } from 'react';
import { navigate, screenForCommand } from '../lib/navigation';

interface TerminalProps {
  title?: string;
  meta?: string;
  children?: ReactNode;
  height?: number | string;
  footer?: ReactNode;
}

/** Generic terminal shell (mac-style titlebar + body) */
export function Terminal({ title, meta, children, height, footer }: TerminalProps) {
  return (
    <div className="cli-shell" style={height ? { height } : undefined}>
      <div className="cli-titlebar">
        <div className="dots">
          <i style={{ background: '#FF5F57' }} />
          <i style={{ background: '#FEBC2E' }} />
          <i style={{ background: '#28C840' }} />
        </div>
        <div className="title">{title || 'claude-code  ·  afterglow MCP'}</div>
        <div className="meta">{meta || 'v0.4.2'}</div>
      </div>
      <div className="cli-body cli-body-static">{children}</div>
      {footer && <div className="cli-footer">{footer}</div>}
    </div>
  );
}

/* ============== CLI primitives (T.*) ============== */

interface ChildOnly {
  children?: ReactNode;
}

const TPrompt = ({ children, dim }: ChildOnly & { dim?: boolean }) => (
  <div className={`cli-line prompt ${dim ? 'dim' : ''}`}>{children}</div>
);

const TLine = ({ children, color, style }: ChildOnly & { color?: string; style?: CSSProperties }) => (
  <div className="cli-line" style={{ color, ...style }}>
    {children}
  </div>
);

const TDim = ({ children }: ChildOnly) => (
  <div className="cli-line" style={{ color: 'rgba(245,240,228,0.5)' }}>
    {children}
  </div>
);

const TOk = ({ children }: ChildOnly) => (
  <div className="cli-line">
    <span style={{ color: '#8FBA70' }}>✓ </span>
    {children}
  </div>
);

const TWarn = ({ children }: ChildOnly) => (
  <div className="cli-line">
    <span style={{ color: '#E89A85' }}>! </span>
    {children}
  </div>
);

const TArrow = ({ children }: ChildOnly) => (
  <div className="cli-line" style={{ color: '#FFE3C0' }}>
    → {children}
  </div>
);

const TBr = () => <div className="cli-line">&nbsp;</div>;
const THr = () => <hr className="cli-divider" />;

const THeading = ({ children, icon }: ChildOnly & { icon?: ReactNode }) => (
  <div
    className="cli-line"
    style={{ color: '#FFE3C0', marginTop: 6, letterSpacing: '0.02em' }}
  >
    {icon && <span style={{ marginRight: 6 }}>{icon}</span>}
    {children}
  </div>
);

interface TQProps extends ChildOnly {
  q: ReactNode;
  required?: boolean;
  hint?: ReactNode;
}
const TQ = ({ q, required, hint, children }: TQProps) => (
  <div style={{ margin: '8px 0' }}>
    <div className="cli-line" style={{ color: 'rgba(245,240,228,0.85)' }}>
      <span style={{ color: '#C7B36F' }}>? </span>
      <span style={{ color: 'var(--paper)' }}>{q}</span>{' '}
      <span
        style={{
          fontSize: 10.5,
          padding: '0 6px',
          borderRadius: 3,
          marginLeft: 4,
          background: required ? 'rgba(181,72,44,0.25)' : 'rgba(245,240,228,0.1)',
          color: required ? '#E89A85' : 'rgba(245,240,228,0.6)',
          letterSpacing: '0.04em',
        }}
      >
        {required ? '필수' : '선택'}
      </span>
    </div>
    {hint && (
      <div
        className="cli-line"
        style={{
          color: 'rgba(245,240,228,0.4)',
          fontSize: 11.5,
          paddingLeft: 18,
        }}
      >
        {hint}
      </div>
    )}
    {children && <div style={{ paddingLeft: 18 }}>{children}</div>}
  </div>
);

const TAnswer = ({ children, skipped }: ChildOnly & { skipped?: boolean }) => (
  <div
    className="cli-line"
    style={{
      color: skipped ? 'rgba(245,240,228,0.45)' : '#C7E5B1',
      paddingLeft: 18,
      fontStyle: skipped ? 'italic' : 'normal',
    }}
  >
    <span style={{ color: 'var(--brick)' }}>{skipped ? '↳ ' : '> '}</span>
    {children}
  </div>
);

/**
 * Walk a ReactNode tree and concatenate its text content. Used to detect
 * whether a `<T.Cmd>` body contains a navigable slash command.
 */
function flattenText(node: ReactNode): string {
  if (node == null || node === false) return '';
  if (typeof node === 'string' || typeof node === 'number') return String(node);
  if (Array.isArray(node)) return node.map(flattenText).join('');
  if (isValidElement<{ children?: ReactNode }>(node)) {
    return Children.toArray(node.props.children).map(flattenText).join('');
  }
  return '';
}

const cmdSnippetStyle: CSSProperties = {
  color: 'var(--paper)',
  background: 'rgba(245,240,228,0.06)',
  padding: '0 6px',
  borderRadius: 3,
};

const TCmd = ({ children }: ChildOnly) => {
  const target = screenForCommand(flattenText(children));
  if (target) {
    return (
      <button
        type="button"
        onClick={() => navigate(target)}
        className="cli-cmd-link"
        style={{
          ...cmdSnippetStyle,
          border: 'none',
          cursor: 'pointer',
          font: 'inherit',
          textAlign: 'inherit',
          textDecoration: 'underline',
          textDecorationStyle: 'dotted',
          textUnderlineOffset: 3,
        }}
        title={`${target} 화면으로 이동`}
      >
        {children}
      </button>
    );
  }
  return <span style={cmdSnippetStyle}>{children}</span>;
};

const PALETTE = ['#B5482C', '#1F4A48', '#5A7A3D', '#4A3B6B', '#B58A2C', '#6B3F2E'];

interface TAgentProps {
  slug: string;
  color?: number;
  /** If false, render as plain visual chip (no click handler). Defaults to true. */
  linkable?: boolean;
}
const TAgent = ({ slug, color = 0, linkable = true }: TAgentProps) => {
  const inner = (
    <>
      <span
        style={{
          width: 12,
          height: 12,
          borderRadius: 3,
          background: PALETTE[color % 6],
          display: 'inline-block',
        }}
      />
      <span style={{ color: '#FFE3C0' }}>{slug}</span>
    </>
  );

  const baseStyle: CSSProperties = {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 6,
    background: 'rgba(245,240,228,0.05)',
    border: '1px solid rgba(245,240,228,0.12)',
    padding: '1px 7px',
    borderRadius: 4,
    fontSize: 11.5,
  };

  if (!linkable) {
    return <span style={baseStyle}>{inner}</span>;
  }

  return (
    <button
      type="button"
      onClick={() => navigate('inspect')}
      className="cli-agent-link"
      style={{
        ...baseStyle,
        cursor: 'pointer',
        font: 'inherit',
      }}
      title={`${slug} 상세 보기`}
    >
      {inner}
    </button>
  );
};

interface TBlockProps extends ChildOnly {
  who?: string;
  color?: number;
  dim?: boolean;
}
const TBlock = ({ children, who, color = 0, dim }: TBlockProps) => (
  <div style={{ margin: '8px 0' }}>
    {who && (
      <div
        className="cli-line"
        style={{ color: 'rgba(245,240,228,0.55)', fontSize: 11.5, marginBottom: 2 }}
      >
        <TAgent slug={who} color={color} /> says
      </div>
    )}
    <div className="cli-block" style={dim ? { opacity: 0.7 } : undefined}>
      {children}
    </div>
  </div>
);

interface TProgressProps {
  value: number;
  label?: string;
}
const TProgress = ({ value, label }: TProgressProps) => {
  const bars = Math.floor(value / 5);
  return (
    <div className="cli-line">
      <span style={{ color: 'var(--brick)' }}>{'█'.repeat(bars)}</span>
      <span style={{ color: 'rgba(245,240,228,0.25)' }}>{'░'.repeat(20 - bars)}</span>
      <span style={{ marginLeft: 12, color: 'var(--paper)' }}>{value}%</span>
      {label && (
        <span style={{ marginLeft: 10, color: 'rgba(245,240,228,0.55)' }}>· {label}</span>
      )}
    </div>
  );
};

const TFrame = ({ title, children }: { title: string; children?: ReactNode }) => (
  <div
    style={{
      margin: '10px 0',
      fontFamily: 'var(--font-mono)',
      fontSize: 12.5,
      lineHeight: 1.7,
    }}
  >
    <div className="cli-line" style={{ color: 'rgba(245,240,228,0.55)' }}>
      ╭─ {title} {'─'.repeat(Math.max(2, 56 - title.length))}╮
    </div>
    <div style={{ paddingLeft: 4, paddingRight: 4 }}>{children}</div>
    <div className="cli-line" style={{ color: 'rgba(245,240,228,0.55)' }}>
      ╰{'─'.repeat(60)}╯
    </div>
  </div>
);

const TSection = ({ title, children }: { title: string; children?: ReactNode }) => (
  <>
    <div
      className="cli-line"
      style={{ color: 'rgba(245,240,228,0.55)', marginTop: 6 }}
    >
      ├─ {title} {'─'.repeat(Math.max(2, 56 - title.length))}┤
    </div>
    <div style={{ paddingLeft: 4, paddingRight: 4 }}>{children}</div>
  </>
);

// Grouped CLI primitives. The `T.X` form keeps the call-site JSX readable.
// eslint-disable-next-line react-refresh/only-export-components
export const T = {
  Prompt: TPrompt,
  Line: TLine,
  Dim: TDim,
  Ok: TOk,
  Warn: TWarn,
  Arrow: TArrow,
  Br: TBr,
  Hr: THr,
  Heading: THeading,
  Q: TQ,
  Answer: TAnswer,
  Cmd: TCmd,
  Agent: TAgent,
  Block: TBlock,
  Progress: TProgress,
  Frame: TFrame,
  Section: TSection,
};
