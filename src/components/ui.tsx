import { type ReactNode, type CSSProperties } from 'react';
import clsx from 'clsx';
import { Icon } from './Icon';

/* ============ Brand mark ============ */
export function BrandMark() {
  return (
    <div className="brand">
      <div className="brand-mark">A</div>
      <div>
        <div className="brand-name">Afterglow</div>
        <div className="brand-sub">퇴사자 에이전트 MCP</div>
      </div>
    </div>
  );
}

/* ============ Avatar with optional ghost mark ============ */
interface AvatarProps {
  name?: string;
  color?: number;
  size?: 'sm' | 'lg' | string;
  ghost?: boolean;
  src?: string;
}
export function Avatar({ name, color = 0, size, ghost = false, src }: AvatarProps) {
  const initial = (name || '?').trim().charAt(0).toUpperCase();
  const cls = clsx('avatar', `c${color % 6}`, size);
  return (
    <div className={cls}>
      {src ? (
        <img src={src} alt={name} style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
      ) : (
        initial
      )}
      {ghost && <span className="ghost-mark">✦</span>}
    </div>
  );
}

/* ============ Badge ============ */
interface BadgeProps {
  children?: ReactNode;
  kind?: string;
  className?: string;
  style?: CSSProperties;
}
export function Badge({ children, kind, className, style }: BadgeProps) {
  return (
    <span className={clsx('badge', kind, className)} style={style}>
      {kind && kind !== 'brick' && <span className="dot" />}
      {children}
    </span>
  );
}

/* ============ Steps indicator ============ */
export type Step = string | { label: string; required?: boolean };
interface StepsProps {
  steps: Step[];
  current: number;
  onJump?: (index: number) => void;
}
export function Steps({ steps, current, onJump }: StepsProps) {
  const normalized = steps.map((s) =>
    typeof s === 'string' ? { label: s, required: true } : { required: true, ...s },
  );
  return (
    <div className="steps">
      {normalized.map((s, i) => {
        const state = i < current ? 'done' : i === current ? 'active' : '';
        return (
          <div
            key={i}
            className={clsx('step', state)}
            onClick={() => onJump && onJump(i)}
          >
            <span className="step-num">{i < current ? <Icon.Check /> : i + 1}</span>
            <span>{s.label}</span>
            <span className={clsx('req-marker', s.required ? 'req' : 'opt')}>
              {s.required ? '필수' : '선택'}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/* ============ MiniSparkline ============ */
interface SparkProps {
  data: number[];
  color?: string;
  width?: number;
  height?: number;
}
export function Spark({ data, color = 'var(--ink)', width = 110, height = 28 }: SparkProps) {
  const max = Math.max(...data);
  const min = Math.min(...data);
  const range = max - min || 1;
  const pts = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * width;
      const y = height - ((v - min) / range) * (height - 4) - 2;
      return `${x.toFixed(1)},${y.toFixed(1)}`;
    })
    .join(' ');
  return (
    <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`}>
      <polyline
        points={pts}
        fill="none"
        stroke={color}
        strokeWidth={1.4}
        strokeLinejoin="round"
        strokeLinecap="round"
      />
    </svg>
  );
}

/* ============ Upload slot ============ */
interface UploadSlotProps {
  icon?: ReactNode;
  label: string;
  status?: 'connected' | 'syncing';
  count?: string;
  onClick?: () => void;
}
export function UploadSlot({ icon, label, status, count, onClick }: UploadSlotProps) {
  return (
    <button className={clsx('upload-slot', status)} onClick={onClick}>
      <div className="upload-ico">{icon}</div>
      <div className="upload-body">
        <div className="upload-label">{label}</div>
        <div className="upload-meta">
          {status === 'connected' && (
            <>
              <span className="dot ok" /> 연결됨 · {count}
            </>
          )}
          {status === 'syncing' && (
            <>
              <span className="dot busy pulse" /> 동기화 중 · {count}
            </>
          )}
          {!status && <>아직 연결되지 않음</>}
        </div>
      </div>
      <div className="upload-action">
        {status === 'connected' ? '관리' : status === 'syncing' ? '보기' : '연결'}
        <Icon.Arrow />
      </div>
    </button>
  );
}
