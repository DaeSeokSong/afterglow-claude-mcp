import { useEffect, useRef, useState, type ReactNode } from 'react';

interface TweaksPanelProps {
  title?: string;
  children?: ReactNode;
}

/**
 * Floating bottom-right panel that hosts design tweaks (accent / paper colors).
 * Collapses to a circular gear button when closed.
 */
export function TweaksPanel({ title = 'Tweaks', children }: TweaksPanelProps) {
  const [open, setOpen] = useState(false);
  const dragRef = useRef<HTMLDivElement | null>(null);
  const [pos, setPos] = useState<{ right: number; bottom: number }>({ right: 16, bottom: 16 });
  const dragState = useRef<{
    startX: number;
    startY: number;
    startRight: number;
    startBottom: number;
  } | null>(null);

  useEffect(() => {
    if (!dragRef.current) return;
    const onMove = (e: MouseEvent) => {
      const s = dragState.current;
      if (!s) return;
      const dx = e.clientX - s.startX;
      const dy = e.clientY - s.startY;
      setPos({
        right: Math.max(0, s.startRight - dx),
        bottom: Math.max(0, s.startBottom - dy),
      });
    };
    const onUp = () => {
      dragState.current = null;
      document.body.style.userSelect = '';
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const onHeaderMouseDown = (e: React.MouseEvent) => {
    dragState.current = {
      startX: e.clientX,
      startY: e.clientY,
      startRight: pos.right,
      startBottom: pos.bottom,
    };
    document.body.style.userSelect = 'none';
  };

  return (
    <>
      {!open && (
        <button
          aria-label="Open tweaks"
          onClick={() => setOpen(true)}
          style={{
            position: 'fixed',
            right: pos.right,
            bottom: pos.bottom,
            zIndex: 2147483646,
            width: 38,
            height: 38,
            borderRadius: '50%',
            border: '1px solid rgba(0,0,0,0.12)',
            background: 'rgba(250,249,247,0.85)',
            backdropFilter: 'blur(18px) saturate(160%)',
            cursor: 'pointer',
            boxShadow: '0 6px 22px rgba(0,0,0,0.18)',
            display: 'grid',
            placeItems: 'center',
            color: 'rgba(41,38,27,0.85)',
          }}
        >
          <svg viewBox="0 0 16 16" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.4">
            <circle cx="8" cy="8" r="2" />
            <path d="M8 1.5v1.7M8 12.8v1.7M2.6 5l1.5.85M11.9 10.15l1.5.85M2.6 11l1.5-.85M11.9 5.85l1.5-.85" />
          </svg>
        </button>
      )}

      {open && (
        <div
          ref={dragRef}
          style={{
            position: 'fixed',
            right: pos.right,
            bottom: pos.bottom,
            zIndex: 2147483646,
            width: 260,
            maxHeight: 'calc(100vh - 32px)',
            display: 'flex',
            flexDirection: 'column',
            background: 'rgba(250,249,247,0.85)',
            backdropFilter: 'blur(24px) saturate(160%)',
            border: '0.5px solid rgba(255,255,255,0.6)',
            borderRadius: 14,
            boxShadow: '0 1px 0 rgba(255,255,255,0.5) inset, 0 12px 40px rgba(0,0,0,0.18)',
            font: '11.5px/1.4 ui-sans-serif, system-ui, -apple-system, sans-serif',
            color: '#29261b',
            overflow: 'hidden',
          }}
        >
          <div
            onMouseDown={onHeaderMouseDown}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 8px 10px 14px',
              cursor: 'move',
              userSelect: 'none',
            }}
          >
            <b style={{ fontSize: 12, fontWeight: 600, letterSpacing: '0.01em' }}>{title}</b>
            <button
              onClick={() => setOpen(false)}
              aria-label="Close tweaks"
              style={{
                appearance: 'none',
                border: 0,
                background: 'transparent',
                color: 'rgba(41,38,27,0.55)',
                width: 22,
                height: 22,
                borderRadius: 6,
                cursor: 'pointer',
                fontSize: 13,
                lineHeight: 1,
              }}
            >
              ×
            </button>
          </div>
          <div
            style={{
              padding: '2px 14px 14px',
              display: 'flex',
              flexDirection: 'column',
              gap: 10,
              overflowY: 'auto',
            }}
          >
            {children}
          </div>
        </div>
      )}
    </>
  );
}

interface TweakSectionProps {
  label: string;
  children?: ReactNode;
}
export function TweakSection({ label, children }: TweakSectionProps) {
  return (
    <>
      <div
        style={{
          fontSize: 10,
          fontWeight: 600,
          letterSpacing: '0.06em',
          textTransform: 'uppercase',
          color: 'rgba(41,38,27,0.45)',
          padding: '4px 0 0',
        }}
      >
        {label}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>{children}</div>
    </>
  );
}

interface TweakColorProps {
  label: string;
  options: string[];
  value: string;
  onChange: (v: string) => void;
}
export function TweakColor({ label, options, value, onChange }: TweakColorProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          color: 'rgba(41,38,27,0.72)',
          fontWeight: 500,
        }}
      >
        <span>{label}</span>
        <span style={{ color: 'rgba(41,38,27,0.5)', fontFamily: 'JetBrains Mono, monospace' }}>{value}</span>
      </div>
      <div style={{ display: 'flex', gap: 6 }}>
        {options.map((c) => (
          <button
            key={c}
            onClick={() => onChange(c)}
            aria-label={c}
            style={{
              width: 26,
              height: 26,
              borderRadius: 6,
              border:
                value === c ? '2px solid rgba(0,0,0,0.55)' : '1px solid rgba(0,0,0,0.15)',
              background: c,
              cursor: 'pointer',
              padding: 0,
            }}
          />
        ))}
      </div>
    </div>
  );
}
