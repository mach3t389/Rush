interface SFAvatarProps {
  initials: string;
  bg?: string;
  color?: string;
  size?: number;
  title?: string;
  name?: string;
}

export function SFAvatar({ initials, bg, color, size = 28, title, name }: SFAvatarProps) {
  const resolvedBg = bg ?? color ?? 'var(--surface-3)';
  const resolvedTitle = title ?? name;
  return (
    <span
      title={resolvedTitle}
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: resolvedBg,
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
          // Sans display, ce wrapper reste un simple inline blockifié : sa
          // hauteur suit alors la line-height héritée du texte ambiant
          // (mesuré : 24.75px pour un avatar de 19px), pas celle de son
          // unique enfant — d'où l'avatar qui semblait décalé par rapport
          // aux puces priorité/statut, elles bien alignées à leur taille
          // exacte. inline-flex fait suivre la taille réelle du contenu.
          style={{ display: 'inline-flex', alignItems: 'center', marginLeft: i === 0 ? 0 : -(size * 0.28), zIndex: shown.length - i }}
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
            // Sans border-box, la bordure s'ajoutait à `size` : la bulle
            // « +N » rendait 2 px de plus que les avatars qu'elle prolonge,
            // et que toute puce alignée sur la même hauteur.
            boxSizing: 'border-box',
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
