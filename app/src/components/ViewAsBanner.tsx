import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon } from './ui';
import { getViewAsUser, exitViewAs, subscribeViewAs } from '../data/viewAsStore';

export function ViewAsBanner() {
  const { t } = useTranslation();
  const [viewAs, setViewAs] = useState(getViewAsUser);
  const [hovered, setHovered] = useState(false);

  useEffect(() => subscribeViewAs(() => setViewAs(getViewAsUser())), []);

  if (!viewAs) return null;

  return (
    <div style={{
      background: 'var(--accent)', color: 'var(--on-accent)',
      padding: '0 16px', height: 36, display: 'flex', alignItems: 'center', gap: 10,
      flexShrink: 0, zIndex: 201,
    }}>
      <SFIcon name="eye" size={13} color="var(--on-accent)" />

      {/* Avatar */}
      <div style={{
        width: 20, height: 20, borderRadius: '50%',
        background: viewAs.avatarColor,
        border: '1.5px solid rgba(0,0,0,0.2)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 7, fontWeight: 800, color: '#fff', flexShrink: 0,
        letterSpacing: '-0.02em',
      }}>
        {viewAs.initials}
      </div>

      <span style={{ fontSize: 12, fontWeight: 600, fontFamily: 'var(--ff-text)' }}>
        {t('viewAs.banner')}
      </span>
      <span style={{ fontSize: 12, fontWeight: 700, fontFamily: 'var(--ff-display)' }}>
        {viewAs.name}
      </span>
      <span style={{
        fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.04em',
        background: 'rgba(0,0,0,0.12)', padding: '2px 7px', borderRadius: 5,
      }}>
        {viewAs.role}
      </span>
      {viewAs.type === 'internal' && (
        <span style={{
          fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.06em',
          background: 'rgba(0,0,0,0.08)', padding: '2px 6px', borderRadius: 5,
          textTransform: 'uppercase',
        }}>
          {t('viewAs.internalLabel')}
        </span>
      )}
      {viewAs.type === 'external' && (
        <span style={{
          fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.06em',
          background: 'rgba(0,0,0,0.08)', padding: '2px 6px', borderRadius: 5,
          textTransform: 'uppercase',
        }}>
          {t('viewAs.externalLabel')}
        </span>
      )}

      <div style={{ flex: 1 }} />

      <button
        onClick={exitViewAs}
        onMouseEnter={() => setHovered(true)}
        onMouseLeave={() => setHovered(false)}
        style={{
          background: hovered ? 'rgba(0,0,0,0.25)' : 'rgba(0,0,0,0.15)',
          border: 'none', borderRadius: 7,
          color: 'var(--on-accent)', cursor: 'pointer',
          padding: '5px 12px', fontSize: 11, fontWeight: 700,
          fontFamily: 'var(--ff-text)',
          display: 'flex', alignItems: 'center', gap: 5,
          transition: 'background 0.1s',
        }}
      >
        <SFIcon name="x" size={11} color="var(--on-accent)" />
        {t('viewAs.exit')}
      </button>
    </div>
  );
}
