interface SFAvatarProps {
  initials: string;
  bg: string;
  size?: number;
  title?: string;
}

export function SFAvatar({ initials, bg, size = 28, title }: SFAvatarProps) {
  return (
    <span
      title={title}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: bg,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontSize: Math.round(size * 0.36),
        fontWeight: 600,
        color: '#fff',
        flexShrink: 0,
        letterSpacing: '0.01em',
        fontFamily: 'var(--ff-text)',
      }}
    >
      {initials}
    </span>
  );
}

interface SFAvatarGroupProps {
  avatars: { initials: string; bg: string; name?: string }[];
  size?: number;
  max?: number;
}

export function SFAvatarGroup({ avatars, size = 24, max = 4 }: SFAvatarGroupProps) {
  const shown = avatars.slice(0, max);
  const rest = avatars.length - shown.length;

  return (
    <div style={{ display: 'flex', alignItems: 'center' }}>
      {shown.map((a, i) => (
        <span
          key={i}
          style={{ marginLeft: i === 0 ? 0 : -(size * 0.28), zIndex: shown.length - i }}
        >
          <SFAvatar initials={a.initials} bg={a.bg} size={size} title={a.name} />
        </span>
      ))}
      {rest > 0 && (
        <span
          style={{
            marginLeft: -(size * 0.28),
            width: size,
            height: size,
            borderRadius: '50%',
            background: 'var(--surface-3)',
            border: '1px solid var(--border-2)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: Math.round(size * 0.32),
            color: 'var(--text-2)',
            fontWeight: 600,
            flexShrink: 0,
          }}
        >
          +{rest}
        </span>
      )}
    </div>
  );
}
