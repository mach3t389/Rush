// app/src/components/ui/AssigneeGroup.tsx
// Seul composant d'assignation de l'app. Remplace le bloc « avatar + menu
// déroulant de l'équipe » qui était dupliqué dans six écrans.
//
// Le menu est porté par createPortal plutôt que rendu sur place : les lignes
// de tâche ont un `overflow: hidden` qui le tronquerait. Il ne se referme pas
// entre deux clics — on coche plusieurs personnes d'affilée.
import { useState, useRef, useLayoutEffect, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import type { User } from '../../types';
import { getTeam } from '../../data/teamStore';
import { SFAvatar, SFAvatarGroup } from './SFAvatar';
import { SFIcon } from './SFIcon';

export function AssigneeGroup({
  assignees,
  onChange,
  size = 20,
  max = 2,
  readOnly = false,
  showNames = false,
  zIndex = 200,
}: {
  assignees: User[];
  onChange?: (next: User[]) => void;
  size?: number;
  max?: number;
  readOnly?: boolean;
  /** Affiche le nom à côté de l'avatar quand il n'y a qu'une personne. */
  showNames?: boolean;
  /** À monter quand le composant vit déjà dans un popover porté : le menu
   * est en `position: fixed` dans le body, donc un z-index inférieur à
   * celui du popover hôte le ferait passer derrière lui (cas vécu : le
   * panneau de champs d'une sous-tâche est à 600). */
  zIndex?: number;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const btnRef = useRef<HTMLButtonElement>(null);

  const toggle = (u: User) => {
    const next = assignees.some(a => a.id === u.id)
      ? assignees.filter(a => a.id !== u.id)
      : [...assignees, u];
    onChange?.(next);
  };

  const label = assignees.length === 1
    ? assignees[0].name
    : assignees.length === 0
      ? t('tasks.unassigned')
      : assignees.map(u => u.name).join(', ');

  const trigger = assignees.length === 0
    ? (
      <span style={{
        width: size, height: size, borderRadius: '50%',
        border: '1.5px dashed var(--border-2)', display: 'inline-flex',
        alignItems: 'center', justifyContent: 'center', flexShrink: 0,
      }}>
        <SFIcon name="user" size={Math.round(size * 0.55)} color="var(--text-3)" />
      </span>
    )
    : <SFAvatarGroup
        avatars={assignees.map(u => ({ initials: u.initials, bg: u.avatarColor, name: u.name }))}
        size={size}
        max={max}
      />;

  const content = (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 7, minWidth: 0 }}>
      {trigger}
      {showNames && (
        <span style={{
          fontSize: 12, color: assignees.length ? 'var(--text-2)' : 'var(--text-3)',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
        }}>{label}</span>
      )}
    </span>
  );

  if (readOnly) return <span title={label}>{content}</span>;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        title={label}
        onMouseDown={e => e.preventDefault()}
        onClick={e => {
          e.stopPropagation();
          setRect(e.currentTarget.getBoundingClientRect());
          setOpen(v => !v);
        }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'inline-flex', alignItems: 'center', minWidth: 0 }}
      >
        {content}
      </button>
      {open && <AssigneeMenu
        anchorRect={rect}
        assignees={assignees}
        zIndex={zIndex}
        onToggle={toggle}
        onClearAll={() => { onChange?.([]); setOpen(false); }}
        onClose={() => setOpen(false)}
      />}
    </>
  );
}

function AssigneeMenu({ anchorRect, assignees, zIndex, onToggle, onClearAll, onClose }: {
  anchorRect: DOMRect | null;
  assignees: User[];
  zIndex: number;
  onToggle: (u: User) => void;
  onClearAll: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // Même logique de placement que les InlineDropdown existants : bascule
  // au-dessus de l'ancre s'il n'y a pas la place en dessous.
  useLayoutEffect(() => {
    if (!ref.current || !anchorRect) return;
    const h = ref.current.offsetHeight;
    const w = ref.current.offsetWidth;
    const top = anchorRect.bottom + 4 + h > window.innerHeight && anchorRect.top >= h + 4
      ? anchorRect.top - h - 4
      : anchorRect.bottom + 4;
    const left = Math.max(8, Math.min(anchorRect.left, window.innerWidth - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [anchorRect]);

  useEffect(() => {
    const h = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  return createPortal(
    <>
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={ref} onClick={e => e.stopPropagation()} style={{
        position: 'fixed', ...pos, zIndex, background: 'var(--surface)',
        border: '1px solid var(--border-2)', borderRadius: 10, padding: 4,
        minWidth: 200, maxHeight: 280, overflowY: 'auto',
        boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
      }}>
        <button
          type="button"
          onClick={onClearAll}
          style={rowStyle}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name="user" size={10} color="var(--text-3)" />
          </span>
          <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>{t('tasks.noOne')}</span>
        </button>
        <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        {getTeam().map(u => {
          const on = assignees.some(a => a.id === u.id);
          return (
            <button
              key={u.id}
              type="button"
              onClick={() => onToggle(u)}
              style={rowStyle}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
            >
              <SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />
              <span style={{ flex: 1, textAlign: 'left' }}>{u.name}</span>
              {on && <SFIcon name="check" size={13} color="var(--accent)" />}
            </button>
          );
        })}
      </div>
    </>,
    document.body,
  );
}

const rowStyle: React.CSSProperties = {
  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
  padding: '7px 10px', border: 'none', background: 'none', cursor: 'pointer',
  textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)',
  color: 'var(--text)', borderRadius: 7,
};
