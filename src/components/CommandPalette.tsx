import { useEffect, useMemo, useRef, useState } from 'react';
import { navigate, SCREEN_ENTRIES, type ScreenEntry } from '../lib/navigation';

interface CommandPaletteProps {
  onClose: () => void;
}

/**
 * Cmd+K / Ctrl+K command palette.
 * - Fuzzy-ish substring search over label / cmd / group.
 * - ↑↓ moves selection, Enter navigates, Esc closes.
 *
 * The parent is expected to conditionally mount/unmount this component
 * (see App.tsx), so initial state is always fresh on open — no reset
 * effect needed.
 */
export function CommandPalette({ onClose }: CommandPaletteProps) {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);

  // Auto-focus the input on mount.
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus());
    return () => cancelAnimationFrame(id);
  }, []);

  const matches = useMemo<ScreenEntry[]>(() => {
    const q = query.trim().toLowerCase();
    if (!q) return SCREEN_ENTRIES;
    return SCREEN_ENTRIES.filter((s) => {
      const hay = `${s.label} ${s.cmd ?? ''} ${s.group} ${s.id}`.toLowerCase();
      // Match if every token appears as substring.
      return q.split(/\s+/).every((tok) => hay.includes(tok));
    });
  }, [query]);

  // Scroll active item into view on selection change.
  useEffect(() => {
    const list = listRef.current;
    if (!list) return;
    const el = list.querySelector<HTMLButtonElement>(`button[data-idx="${active}"]`);
    if (el) el.scrollIntoView({ block: 'nearest' });
  }, [active]);

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActive((i) => Math.min(matches.length - 1, i + 1));
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActive((i) => Math.max(0, i - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const pick = matches[active];
      if (pick) {
        navigate(pick.id);
        onClose();
      }
    } else if (e.key === 'Escape') {
      e.preventDefault();
      onClose();
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(15,13,10,0.45)',
        backdropFilter: 'blur(4px)',
        zIndex: 2147483647,
        display: 'grid',
        placeItems: 'start center',
        paddingTop: '12vh',
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 'min(640px, 90vw)',
          background: 'var(--paper)',
          border: '1px solid var(--hair)',
          borderRadius: 14,
          boxShadow: '0 20px 60px rgba(15,13,10,0.35)',
          overflow: 'hidden',
          color: 'var(--ink)',
        }}
      >
        <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--hair)' }}>
          <div
            style={{
              fontSize: 10,
              color: 'var(--ink-4)',
              letterSpacing: '0.08em',
              textTransform: 'uppercase',
              fontWeight: 600,
              marginBottom: 6,
            }}
          >
            바로 가기
          </div>
          <input
            ref={inputRef}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setActive(0);
            }}
            onKeyDown={onKeyDown}
            placeholder="화면 이름 · 슬래시 명령 · 그룹으로 검색"
            style={{
              width: '100%',
              border: 'none',
              outline: 'none',
              background: 'transparent',
              color: 'var(--ink)',
              fontSize: 16,
              fontFamily: 'var(--font-sans, inherit)',
              padding: 0,
            }}
          />
        </div>

        <div
          ref={listRef}
          style={{
            maxHeight: '55vh',
            overflowY: 'auto',
            padding: 6,
          }}
        >
          {matches.length === 0 && (
            <div
              style={{
                padding: '24px 14px',
                color: 'var(--ink-3)',
                fontSize: 13,
                textAlign: 'center',
              }}
            >
              일치하는 화면이 없어요.
            </div>
          )}

          {matches.map((s, i) => {
            const isActive = i === active;
            return (
              <button
                key={s.id}
                data-idx={i}
                onMouseEnter={() => setActive(i)}
                onClick={() => {
                  navigate(s.id);
                  onClose();
                }}
                style={{
                  width: '100%',
                  display: 'grid',
                  gridTemplateColumns: '1fr auto',
                  alignItems: 'center',
                  gap: 12,
                  padding: '10px 12px',
                  border: 'none',
                  background: isActive ? 'var(--paper-2)' : 'transparent',
                  borderRadius: 8,
                  cursor: 'pointer',
                  textAlign: 'left',
                  color: 'var(--ink)',
                }}
              >
                <div style={{ minWidth: 0 }}>
                  <div
                    style={{
                      fontSize: 13.5,
                      fontWeight: 500,
                      color: 'var(--ink)',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {s.label}
                  </div>
                  <div
                    style={{
                      fontSize: 11.5,
                      color: 'var(--ink-4)',
                      marginTop: 2,
                      fontFamily: s.cmd ? 'var(--font-mono)' : undefined,
                    }}
                  >
                    {s.cmd ?? s.group}
                  </div>
                </div>
                {s.shortcut && (
                  <span
                    style={{
                      fontFamily: 'var(--font-mono)',
                      fontSize: 11,
                      color: 'var(--ink-3)',
                      background: 'var(--paper-2)',
                      border: '1px solid var(--hair)',
                      borderRadius: 4,
                      padding: '1px 6px',
                    }}
                  >
                    g {s.shortcut}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 18,
            padding: '8px 14px',
            borderTop: '1px solid var(--hair)',
            fontSize: 11,
            color: 'var(--ink-4)',
            background: 'var(--paper-2)',
            fontFamily: 'var(--font-mono)',
          }}
        >
          <span>↑↓ 이동</span>
          <span>↵ 이동</span>
          <span>esc 닫기</span>
          <span style={{ marginLeft: 'auto' }}>g + 단축키로 점프도 가능</span>
        </div>
      </div>
    </div>
  );
}
