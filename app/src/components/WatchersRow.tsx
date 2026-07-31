import { useState } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SFAvatar, SFIcon } from './ui';
import { getTeamMembers } from '../data/teamStore';

export function WatchersRow({ watchers, onAdd, onRemove }: {
  watchers: string[];
  onAdd: (userId: string) => void;
  onRemove: (userId: string) => void;
}) {
  const { t } = useTranslation();
  const [pickerOpen, setPickerOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);
  const members = getTeamMembers();
  const watcherMembers = members.filter(m => watchers.includes(m.id));
  const available = members.filter(m => !watchers.includes(m.id));

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
        {t('watchers.label')}
      </span>
      {watcherMembers.map(m => (
        <span key={m.id} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, padding: '2px 6px 2px 2px', borderRadius: 20, background: 'var(--surface-3)', border: '1px solid var(--border)' }}>
          <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} />
          <span style={{ fontSize: 11 }}>{m.name}</span>
          <button onClick={() => onRemove(m.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 1 }}>
            <SFIcon name="x" size={11} />
          </button>
        </span>
      ))}
      <button onClick={e => { setAnchor(e.currentTarget.getBoundingClientRect()); setPickerOpen(o => !o); }}
        style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 20, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>
        <SFIcon name="plus" size={11} /> {t('watchers.add')}
      </button>
      {pickerOpen && anchor && createPortal(
        <>
          <div onClick={() => setPickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
          <div style={{ position: 'fixed', top: anchor.bottom + 4, left: anchor.left, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 5, boxShadow: '0 10px 32px rgba(0,0,0,0.5)', minWidth: 180, maxHeight: 260, overflowY: 'auto' }}>
            {available.length === 0 && <p style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-3)' }}>{t('watchers.none')}</p>}
            {available.map(m => (
              <button key={m.id} onClick={() => { onAdd(m.id); setPickerOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 9px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} />
                <span style={{ fontSize: 12 }}>{m.name}</span>
              </button>
            ))}
          </div>
        </>,
        document.body
      )}
    </div>
  );
}
