import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../ui/SFIcon';
import { triggerAIToggle } from '../aiChatBridge';
import { subscribeNotifs, getNotifHistory } from '../../data/notificationStore';
import { USERS } from '../../data/mock';
import { ProfileEditPanel, loadProfile, loadPhoto } from '../profile/ProfileEditPanel';
import { getShortcuts, subscribeShortcuts, formatCombo } from '../../data/shortcutsStore';

interface Props {
  onSearch: () => void;
}

const me = USERS.lea;

export function GlobalTopBar({ onSearch }: Props) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const location = useLocation();

  // Nav history
  const stackRef    = useRef<string[]>([location.pathname + location.search]);
  const idxRef      = useRef(0);
  const isNavAction = useRef(false);
  const [, forceUpdate] = useState(0);

  // UI state
  const [showProfile, setShowProfile] = useState(false);
  const [unreadCount, setUnreadCount] = useState(() => getNotifHistory().filter(n => !n.read).length);
  const [shortcuts, setShortcuts] = useState(getShortcuts);

  // Profile
  const profileOverrides = loadProfile(me.id);
  const photoUrl = loadPhoto(me.id);
  const displayName = profileOverrides.name ?? me.name;
  const displayRole = profileOverrides.role ?? me.role;

  useEffect(() => subscribeNotifs(() => setUnreadCount(getNotifHistory().filter(n => !n.read).length)), []);
  useEffect(() => subscribeShortcuts(() => setShortcuts(getShortcuts())), []);

  // History tracking
  useEffect(() => {
    if (isNavAction.current) { isNavAction.current = false; forceUpdate(n => n + 1); return; }
    const path = location.pathname + location.search;
    const stack = stackRef.current;
    if (stack[idxRef.current] === path) return;
    stack.splice(idxRef.current + 1);
    stack.push(path);
    idxRef.current = stack.length - 1;
    forceUpdate(n => n + 1);
  }, [location]);

  const canBack    = idxRef.current > 0;
  const canForward = idxRef.current < stackRef.current.length - 1;
  const goBack    = () => { if (!canBack)    return; isNavAction.current = true; idxRef.current--; navigate(-1); };
  const goForward = () => { if (!canForward) return; isNavAction.current = true; idxRef.current++; navigate(1); };

  const navBtn = (enabled: boolean): React.CSSProperties => ({
    width: 28, height: 28, display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 7, background: 'transparent', border: 'none',
    cursor: enabled ? 'pointer' : 'default', color: enabled ? 'var(--text-2)' : 'var(--border-2)',
    transition: 'background 0.1s', flexShrink: 0,
  });

  const labelBtn: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, padding: '0 10px', height: 30,
    borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)',
    cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, fontWeight: 500,
    fontFamily: 'var(--ff-text)', transition: 'background 0.1s, border-color 0.1s',
    flexShrink: 0,
  };

  return (
    <>
      <div style={{
        height: 46, borderBottom: '1px solid var(--border)',
        display: 'flex', alignItems: 'center', gap: 6,
        padding: '0 12px', background: 'var(--surface)', flexShrink: 0,
      }}>
        {/* Back / Forward */}
        <button onClick={goBack} disabled={!canBack} title={t('topbar.back')} style={navBtn(canBack)}
          onMouseEnter={e => { if (canBack) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
          <SFIcon name="chevron-left" size={15} />
        </button>
        <button onClick={goForward} disabled={!canForward} title={t('topbar.forward')} style={navBtn(canForward)}
          onMouseEnter={e => { if (canForward) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
          <SFIcon name="chevron-right" size={15} />
        </button>

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

        {/* Search */}
        <button onClick={onSearch} style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flex: 1, maxWidth: 280, height: 30,
          background: 'var(--surface-2)', border: '1px solid var(--border)',
          borderRadius: 9, padding: '0 10px', cursor: 'text',
          color: 'var(--text-3)', textAlign: 'left', transition: 'border-color 0.15s',
        }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
          <SFIcon name="search" size={13} />
          <span style={{ fontSize: 12, fontFamily: 'var(--ff-text)', flex: 1, color: 'var(--text-3)' }}>{t('topbar.search')}</span>
          <kbd style={{ fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 4, padding: '1px 5px', fontFamily: 'var(--ff-mono)' }}>{formatCombo(shortcuts.search)}</kbd>
        </button>

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {/* Assistant IA */}
        <button onClick={() => triggerAIToggle()}
          style={{ ...labelBtn, color: 'var(--accent)', borderColor: 'rgba(249,255,0,0.25)', background: 'rgba(249,255,0,0.06)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,255,0,0.12)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(249,255,0,0.4)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(249,255,0,0.06)'; (e.currentTarget as HTMLElement).style.borderColor = 'rgba(249,255,0,0.25)'; }}>
          <SFIcon name="sparkles" size={14} color="var(--accent)" />
          IA
          <kbd style={{ fontSize: 10, color: 'var(--on-accent)', background: 'var(--accent)', border: '1px solid rgba(249,255,0,0.4)', borderRadius: 4, padding: '1px 6px', fontFamily: 'var(--ff-mono)', fontWeight: 700, lineHeight: 1.4 }}>{formatCombo(shortcuts.ai_toggle)}</kbd>
        </button>

        {/* Activité */}
        <NavLink to="/activite" style={{ textDecoration: 'none' }}>
          {({ isActive }) => (
            <div style={{ ...labelBtn, position: 'relative', color: isActive ? 'var(--text)' : 'var(--text-2)', background: isActive ? 'var(--surface-3)' : 'var(--surface-2)', borderColor: isActive ? 'var(--border-2)' : 'var(--border)' } as React.CSSProperties}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isActive ? 'var(--surface-3)' : 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.borderColor = isActive ? 'var(--border-2)' : 'var(--border)'; }}>
              <SFIcon name="bell" size={14} />
              Activité
              {unreadCount > 0 && (
                <span style={{ background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, fontSize: 9, fontWeight: 700, padding: '1px 5px', fontFamily: 'var(--ff-mono)', lineHeight: 1.4 }}>
                  {unreadCount}
                </span>
              )}
            </div>
          )}
        </NavLink>

        <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

        {/* Profil */}
        <button onClick={() => setShowProfile(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, height: 30, padding: '0 8px 0 4px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', flexShrink: 0, transition: 'background 0.1s, border-color 0.1s' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
          <div style={{ width: 22, height: 22, borderRadius: '50%', background: me.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, fontWeight: 700, color: '#fff', flexShrink: 0, overflow: 'hidden' }}>
            {photoUrl ? <img src={photoUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : me.initials}
          </div>
          <div style={{ textAlign: 'left', minWidth: 0 }}>
            <p style={{ fontSize: 11, fontWeight: 600, lineHeight: 1.15, whiteSpace: 'nowrap', color: 'var(--text)' }}>{displayName}</p>
            <p style={{ fontSize: 9, color: 'var(--text-3)', lineHeight: 1.15, whiteSpace: 'nowrap' }}>{displayRole}</p>
          </div>
        </button>
      </div>

      {showProfile && (
        <ProfileEditPanel
          userId={me.id}
          initialName={me.name}
          initialRole={me.role}
          initialEmail="lea.marchand@studioflow.fr"
          initialPhone="+1 514 555-0101"
          initialInitials={me.initials}
          initialColor={me.avatarColor}
          isSelf
          isAdmin
          onClose={() => setShowProfile(false)}
        />
      )}
    </>
  );
}
