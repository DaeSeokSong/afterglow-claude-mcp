import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const base: Partial<SVGProps<SVGSVGElement>> = {
  width: 14,
  height: 14,
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.6,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
};

export const Icon = {
  Plus: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} {...p}>
      <path d="M8 3.5v9M3.5 8h9" />
    </svg>
  ),
  Check: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.8} {...p}>
      <path d="M3 8.5l3.2 3.2L13 5" />
    </svg>
  ),
  Arrow: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} {...p}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  ),
  ArrowLeft: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} {...p}>
      <path d="M13 8H3M7 4L3 8l4 4" />
    </svg>
  ),
  Home: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <path d="M2.5 7.5L8 3l5.5 4.5V13a.5.5 0 0 1-.5.5h-3v-4h-4v4h-3a.5.5 0 0 1-.5-.5V7.5z" />
    </svg>
  ),
  Sparkle: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.4} {...p}>
      <path d="M8 2v3M8 11v3M2 8h3M11 8h3M4 4l2 2M10 10l2 2M4 12l2-2M10 6l2-2" />
    </svg>
  ),
  Users: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <circle cx="6" cy="6" r="2.5" />
      <path d="M2 13c0-2.2 1.8-4 4-4s4 1.8 4 4" />
      <path d="M10.5 5.5a2 2 0 0 1 0 4M14 13c0-1.5-1-3-2.5-3.5" />
    </svg>
  ),
  Plug: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <path d="M5 7V3M11 7V3M3 7h10v2a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4V7zM8 13v2" />
    </svg>
  ),
  Book: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <path d="M3 3h6a2 2 0 0 1 2 2v8H5a2 2 0 0 1-2-2V3zM11 5a2 2 0 0 1 2-2v8a2 2 0 0 0-2 2" />
    </svg>
  ),
  Shield: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <path d="M8 2l5 2v4c0 3-2.2 5.5-5 6-2.8-.5-5-3-5-6V4l5-2z" />
    </svg>
  ),
  Search: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <circle cx="7" cy="7" r="4" />
      <path d="M10 10l3 3" />
    </svg>
  ),
  Upload: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <path d="M8 2v9M4 6l4-4 4 4M2 13h12" />
    </svg>
  ),
  Notion: (p: IconProps) => (
    <svg viewBox="0 0 16 16" width={14} height={14} {...p}>
      <rect width="14" height="14" x="1" y="1" rx="2" fill="#1B1814" />
      <path
        d="M5 4.5v7m0-7l4 5.5V4.5m2 0v7"
        stroke="#FBF8F0"
        strokeWidth="1.2"
        fill="none"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  ),
  Github: (p: IconProps) => (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" {...p}>
      <path d="M8 1a7 7 0 0 0-2.21 13.64c.35.06.48-.15.48-.34v-1.2c-1.95.42-2.36-.94-2.36-.94-.32-.81-.78-1.03-.78-1.03-.64-.43.05-.42.05-.42.7.05 1.07.72 1.07.72.63 1.07 1.64.76 2.04.58.06-.46.25-.77.45-.94-1.56-.18-3.2-.78-3.2-3.46 0-.77.27-1.4.72-1.88-.07-.18-.31-.9.07-1.87 0 0 .59-.19 1.93.72A6.7 6.7 0 0 1 8 4.55c.6 0 1.2.08 1.76.24 1.34-.91 1.93-.72 1.93-.72.38.97.14 1.69.07 1.87.45.48.72 1.11.72 1.88 0 2.69-1.64 3.28-3.2 3.45.25.22.48.65.48 1.31v1.94c0 .19.13.41.49.34A7 7 0 0 0 8 1z" />
    </svg>
  ),
  Mail: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <rect x="2" y="3.5" width="12" height="9" rx="1" />
      <path d="M2.5 4.5L8 9l5.5-4.5" />
    </svg>
  ),
  Mic: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <rect x="6" y="2" width="4" height="8" rx="2" />
      <path d="M3.5 8a4.5 4.5 0 0 0 9 0M8 12.5V14" />
    </svg>
  ),
  More: (p: IconProps) => (
    <svg viewBox="0 0 16 16" width={14} height={14} fill="currentColor" {...p}>
      <circle cx="3.5" cy="8" r="1.2" />
      <circle cx="8" cy="8" r="1.2" />
      <circle cx="12.5" cy="8" r="1.2" />
    </svg>
  ),
  Settings: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.4} {...p}>
      <circle cx="8" cy="8" r="2" />
      <path d="M8 1.5v1.7M8 12.8v1.7M2.6 5l1.5.85M11.9 10.15l1.5.85M2.6 11l1.5-.85M11.9 5.85l1.5-.85" />
    </svg>
  ),
  Hash: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.4} {...p}>
      <path d="M6 2L4 14M12 2l-2 12M2 5h12M2 11h12" />
    </svg>
  ),
  Lock: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.4} {...p}>
      <rect x="3" y="7" width="10" height="7" rx="1" />
      <path d="M5 7V5a3 3 0 0 1 6 0v2" />
    </svg>
  ),
  Send: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.5} {...p}>
      <path d="M14 2L7 9M14 2L9.5 14l-2.5-5L2 6.5 14 2z" />
    </svg>
  ),
  Ghost: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.4} {...p}>
      <path d="M3 14v-7a5 5 0 0 1 10 0v7l-2-1.5L9 14l-1-1.5L7 14l-2-1.5L3 14z" />
      <circle cx="6" cy="7" r="0.6" fill="currentColor" stroke="none" />
      <circle cx="10" cy="7" r="0.6" fill="currentColor" stroke="none" />
    </svg>
  ),
  Doc: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.4} {...p}>
      <path d="M4 2h6l3 3v9H4V2z" />
      <path d="M10 2v3h3M6 8h4M6 11h4" />
    </svg>
  ),
  Network: (p: IconProps) => (
    <svg viewBox="0 0 16 16" {...base} strokeWidth={1.4} {...p}>
      <circle cx="3.5" cy="8" r="2" />
      <circle cx="12.5" cy="3.5" r="1.6" />
      <circle cx="12.5" cy="12.5" r="1.6" />
      <path d="M5.4 7L11 4M5.4 9L11 12" />
    </svg>
  ),
};

export type IconKey = keyof typeof Icon;
