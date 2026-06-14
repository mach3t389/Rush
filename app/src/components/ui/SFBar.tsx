interface SFBarProps {
  value: number;
  max?: number;
  height?: number;
  color?: string;
  bg?: string;
  radius?: number;
  className?: string;
}

export function SFBar({
  value,
  max = 100,
  height = 4,
  color = 'var(--accent)',
  bg = 'var(--surface-3)',
  radius = 999,
  className = '',
}: SFBarProps) {
  const pct = Math.min(100, Math.max(0, (value / max) * 100));

  return (
    <div
      className={className}
      style={{
        width: '100%',
        height,
        borderRadius: radius,
        background: bg,
        overflow: 'hidden',
        flexShrink: 0,
      }}
    >
      <div
        style={{
          width: `${pct}%`,
          height: '100%',
          borderRadius: radius,
          background: color,
          transition: 'width 0.3s ease',
        }}
      />
    </div>
  );
}
