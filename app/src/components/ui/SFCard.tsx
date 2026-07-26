import type { CSSProperties, ReactNode } from 'react';

interface SFCardProps {
  children: ReactNode;
  padding?: number | string;
  gap?: number;
  style?: CSSProperties;
  className?: string;
  onClick?: () => void;
  surface?: 1 | 2 | 3;
}

const SURFACE = {
  1: 'var(--surface)',
  2: 'var(--surface-2)',
  3: 'var(--surface-3)',
};

export function SFCard({
  children,
  padding = 16,
  gap,
  style,
  className = '',
  onClick,
  surface = 1,
}: SFCardProps) {
  return (
    <div
      className={className}
      onClick={onClick}
      // Same hover lift as ProjectCard's clickable grid cards (border
      // lighten + 1px translateY) — only when the card is actually
      // clickable, matching that component's own gating.
      onMouseEnter={onClick ? e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--border-2)'; el.style.transform = 'translateY(-1px)'; } : undefined}
      onMouseLeave={onClick ? e => { const el = e.currentTarget as HTMLDivElement; el.style.borderColor = 'var(--border)'; el.style.transform = 'none'; } : undefined}
      style={{
        background: SURFACE[surface],
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding,
        display: 'flex',
        flexDirection: 'column',
        gap,
        cursor: onClick ? 'pointer' : undefined,
        transition: onClick ? 'border-color 0.15s, transform 0.12s' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
