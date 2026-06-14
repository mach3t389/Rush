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
      style={{
        background: SURFACE[surface],
        borderRadius: 'var(--radius)',
        border: '1px solid var(--border)',
        padding,
        display: 'flex',
        flexDirection: 'column',
        gap,
        cursor: onClick ? 'pointer' : undefined,
        ...style,
      }}
    >
      {children}
    </div>
  );
}
