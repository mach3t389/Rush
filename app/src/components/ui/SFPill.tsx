import type { Status } from '../../types';

const STATUS_COLOR: Record<Status, string> = {
  ok:      'var(--ok)',
  warn:    'var(--warn)',
  info:    'var(--info)',
  danger:  'var(--danger)',
  review:  'var(--review)',
  accent:  'var(--accent)',
  neutral: 'var(--text-3)',
};

interface SFPillProps {
  status?: Status;
  children: React.ReactNode;
  small?: boolean;
  className?: string;
}

export function SFPill({ status = 'neutral', children, small, className = '' }: SFPillProps) {
  const color = STATUS_COLOR[status];
  return (
    <span
      className={className}
      style={{
        fontFamily: 'var(--ff-mono)',
        fontSize: small ? 9 : 10,
        letterSpacing: '0.05em',
        textTransform: 'uppercase',
        padding: small ? '2px 6px' : '3px 8px',
        borderRadius: 999,
        border: '1px solid var(--border-2)',
        color,
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        whiteSpace: 'nowrap',
        flexShrink: 0,
      }}
    >
      <i style={{ width: small ? 5 : 6, height: small ? 5 : 6, borderRadius: 999, background: color, flexShrink: 0, display: 'block' }} />
      {children}
    </span>
  );
}
