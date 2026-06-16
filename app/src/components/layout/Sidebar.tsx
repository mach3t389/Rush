import { useState, useEffect, useRef } from 'react';
import { NavLink } from 'react-router-dom';
import { SFIcon } from '../ui/SFIcon';
import { USERS } from '../../data/mock';
import { getProjects, subscribeProjects } from '../../data/projectStore';
import { getClients, subscribeClients } from '../../data/clientStore';
import { useProjectTotalNotifCount, useClientTotalNotifCount } from '../../hooks/useNotifs';
import { ProfileEditPanel, loadProfile, loadPhoto } from '../profile/ProfileEditPanel';
import {
  getPinnedIds, subscribePinned, movePinned, togglePin,
  getPinnedClientIds, subscribePinnedClients, movePinnedClient, togglePinClient,
  getProjectColor, setProjectColor,
} from '../../data/pinnedStore';
import { getLogoFull, getLogoSquare, subscribeStudioLogos } from '../../data/studioLogoStore';
import { subscribeNotifs, getNotifHistory } from '../../data/notificationStore';

function PinnedBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span style={{
      fontSize: 9, fontWeight: 700, fontFamily: 'var(--ff-mono)',
      background: 'var(--accent)', color: 'var(--on-accent)',
      borderRadius: 999, padding: '1px 5px', lineHeight: 1.5,
      minWidth: 14, textAlign: 'center', flexShrink: 0,
    }}>
      {count}
    </span>
  );
}

function ProjectPinnedBadge({ projectId }: { projectId: string }) {
  const count = useProjectTotalNotifCount(projectId);
  return <PinnedBadge count={count} />;
}

function ClientPinnedBadge({ clientId }: { clientId: string }) {
  const count = useClientTotalNotifCount(clientId);
  return <PinnedBadge count={count} />;
}

const PROJECT_COLOR_PRESETS = [
  '#5B8AF5', '#34C98A', '#C45BE8', '#F5975B', '#E85B7A', '#5BC4E8',
  '#F5D05B', '#5BE8C4', '#E87A5B', '#A05BE8', '#5BE870', '#E85BB8',
];

const NAV_MAIN = [
  { to: '/',          icon: 'house',         label: 'Accueil',    exact: true  },
  { to: '/taches',    icon: 'square-check',  label: 'Mes tâches', exact: false },
];

const NAV_BOTTOM_MAIN = [
  { to: '/clients',    icon: 'users',        label: 'Clients',       exact: true  },
  { to: '/projets',    icon: 'folder',       label: 'Projets',       exact: true  },
  { to: '/fichiers',   icon: 'hard-drive',   label: 'Fichiers',      exact: false },
  { to: '/calendrier', icon: 'calendar',     label: 'Calendrier',    exact: false },
  { to: '/activite',   icon: 'bell',         label: 'Notifications', exact: false },
];

const me = USERS.lea;

function NavItem({ to, icon, label, exact, collapsed, badge }: { to: string; icon: string; label: string; exact?: boolean; collapsed: boolean; badge?: number }) {
  return (
    <NavLink
      to={to}
      end={exact}
      title={collapsed ? label : undefined}
      style={({ isActive }) => ({
        display: 'flex',
        alignItems: 'center',
        gap: collapsed ? 0 : 10,
        padding: collapsed ? '8px 0' : '8px 12px',
        justifyContent: collapsed ? 'center' : 'flex-start',
        borderRadius: 9,
        fontSize: 13,
        fontWeight: 500,
        color: isActive ? 'var(--text)' : 'var(--text-2)',
        background: isActive ? 'var(--surface-3)' : 'transparent',
        borderLeft: collapsed ? 'none' : isActive ? '2px solid var(--accent)' : '2px solid transparent',
        outline: collapsed && isActive ? '2px solid var(--accent)' : 'none',
        outlineOffset: '-2px',
        textDecoration: 'none',
        transition: 'background 0.1s, color 0.1s',
      })}
    >
      <span style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
        <SFIcon name={icon} size={16} />
        {collapsed && badge && badge > 0 && (
          <span style={{
            position: 'absolute', top: -5, right: -7,
            background: 'var(--accent)', color: 'var(--on-accent)',
            borderRadius: 999, fontSize: 8, fontWeight: 700,
            padding: '1px 4px', fontFamily: 'var(--ff-mono)', lineHeight: 1.4,
          }}>{badge}</span>
        )}
      </span>
      {!collapsed && label}
      {!collapsed && badge && badge > 0 ? (
        <span style={{
          marginLeft: 'auto',
          background: 'var(--accent)', color: 'var(--on-accent)',
          borderRadius: 999, fontSize: 9, fontWeight: 700,
          padding: '1px 5px', fontFamily: 'var(--ff-mono)',
        }}>{badge}</span>
      ) : null}
    </NavLink>
  );
}

export function Sidebar({ onSearch }: { onSearch?: () => void }) {
  const [collapsed, setCollapsed] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(getPinnedIds);
  const [pinnedClientIds, setPinnedClientIds] = useState(getPinnedClientIds);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragClientIdx, setDragClientIdx] = useState<number | null>(null);
  const [dragOverClientIdx, setDragOverClientIdx] = useState<number | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [, forceColorUpdate] = useState(0);
  const dragHandleActive = useRef(false);
  const dragClientHandleActive = useRef(false);

  const [unreadCount, setUnreadCount] = useState(() => getNotifHistory().filter(n => !n.read).length);

  useEffect(() => subscribePinned(() => setPinnedIds(getPinnedIds())), []);
  useEffect(() => subscribePinnedClients(() => setPinnedClientIds(getPinnedClientIds())), []);
  useEffect(() => subscribeProjects(() => setPinnedIds(prev => [...prev])), []);
  useEffect(() => subscribeClients(() => setPinnedClientIds(prev => [...prev])), []);
  useEffect(() => subscribeNotifs(() => setUnreadCount(getNotifHistory().filter(n => !n.read).length)), []);

  // Close color picker on outside click
  useEffect(() => {
    if (!colorPickerId) return;
    const handler = () => setColorPickerId(null);
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [colorPickerId]);

  const [logoFull, setLogoFullState] = useState(getLogoFull);
  const [logoSquare, setLogoSquareState] = useState(getLogoSquare);

  useEffect(() => subscribeStudioLogos(() => {
    setLogoFullState(getLogoFull());
    setLogoSquareState(getLogoSquare());
  }), []);

  const profileOverrides = loadProfile(me.id);
  const photoUrl = loadPhoto(me.id);
  const displayName = profileOverrides.name ?? me.name;
  const displayRole = profileOverrides.role ?? me.role;

  const pinnedProjects = pinnedIds
    .map(id => getProjects().find(p => p.id === id))
    .filter(Boolean) as ReturnType<typeof getProjects>;

  const pinnedClients = pinnedClientIds
    .map(id => getClients().find(c => c.id === id))
    .filter(Boolean) as ReturnType<typeof getClients>;

  // Project drag handlers
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    if (!dragHandleActive.current) { e.preventDefault(); return; }
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };
  const handleDrop = (idx: number) => {
    if (dragIdx !== null) movePinned(dragIdx, idx);
    setDragIdx(null);
    setDragOverIdx(null);
    dragHandleActive.current = false;
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
    dragHandleActive.current = false;
  };

  // Client drag handlers
  const handleClientDragStart = (e: React.DragEvent, idx: number) => {
    if (!dragClientHandleActive.current) { e.preventDefault(); return; }
    setDragClientIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleClientDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverClientIdx(idx);
  };
  const handleClientDrop = (idx: number) => {
    if (dragClientIdx !== null) movePinnedClient(dragClientIdx, idx);
    setDragClientIdx(null);
    setDragOverClientIdx(null);
    dragClientHandleActive.current = false;
  };
  const handleClientDragEnd = () => {
    setDragClientIdx(null);
    setDragOverClientIdx(null);
    dragClientHandleActive.current = false;
  };

  const W = collapsed ? 56 : 220;

  return (
    <aside
      style={{
        width: W,
        minWidth: W,
        height: '100%',
        background: 'var(--surface)',
        borderRight: '1px solid var(--border)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        transition: 'width 0.2s ease, min-width 0.2s ease',
      }}
    >
      {/* Logo + collapse toggle */}
      <div style={{ padding: collapsed ? '16px 0 12px' : '16px 16px 12px', display: 'flex', alignItems: 'center', gap: 10, justifyContent: collapsed ? 'center' : 'space-between', position: 'relative' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
          {collapsed ? (
            logoSquare
              ? <img src={logoSquare} alt="Logo" style={{ width: 26, height: 26, objectFit: 'contain', borderRadius: 6, flexShrink: 0 }} />
              : <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--on-accent)', fontFamily: 'var(--ff-display)', lineHeight: 1 }}>R</span>
                </div>
          ) : (
            logoFull
              ? <img src={logoFull} alt="Logo" style={{ maxHeight: 32, maxWidth: 160, objectFit: 'contain', flexShrink: 0 }} />
              : <>
                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span style={{ fontSize: 11, fontWeight: 900, color: 'var(--on-accent)', fontFamily: 'var(--ff-display)', lineHeight: 1 }}>R</span>
                  </div>
                  <span style={{ fontFamily: 'var(--ff-display)', fontWeight: 900, fontSize: 14, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Rush</span>
                </>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title="Réduire le menu"
            style={{
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              width: 22, height: 22, borderRadius: 6, border: 'none',
              background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', flexShrink: 0,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
          >
            <SFIcon name="chevron-left" size={13} />
          </button>
        )}
      </div>

      {/* Expand button (collapsed mode) */}
      {collapsed && (
        <button
          onClick={() => setCollapsed(false)}
          title="Développer le menu"
          style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 26, height: 26, borderRadius: 6, border: 'none',
            background: 'var(--surface-2)', color: 'var(--text-3)', cursor: 'pointer',
            alignSelf: 'center', marginBottom: 4,
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="chevron-right" size={13} />
        </button>
      )}

      {/* Scrollable middle section */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Main nav */}
        <nav style={{ padding: collapsed ? '0 6px' : '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {NAV_MAIN.map(item => (
            <NavItem key={item.to} {...item} collapsed={collapsed} />
          ))}
          {NAV_BOTTOM_MAIN.map(item => (
            <NavItem
              key={item.to}
              icon={item.icon} label={item.label} to={item.to} exact={item.exact}
              collapsed={collapsed}
              badge={item.to === '/activite' ? unreadCount : undefined}
            />
          ))}
          {/* Separator */}
          <div style={{ height: 1, background: 'var(--border)', margin: collapsed ? '6px 4px' : '6px 12px' }} />
          <NavItem to="/modeles" icon="library" label="Modèles" exact={false} collapsed={collapsed} />
        </nav>

        {/* Projets épinglés */}
        {!collapsed && pinnedProjects.length > 0 && (
          <div style={{ padding: '12px 8px 0' }}>
            <p style={{
              fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              padding: '0 12px', marginBottom: 4,
            }}>
              Projets épinglés
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pinnedProjects.map((p, idx) => {
                const dotColor = getProjectColor(p.id, p.clientColor);
                return (
                  <div
                    key={p.id}
                    draggable
                    onDragStart={e => handleDragStart(e, idx)}
                    onDragOver={e => handleDragOver(e, idx)}
                    onDrop={() => handleDrop(idx)}
                    onDragEnd={handleDragEnd}
                    onMouseEnter={() => setHoveredPinId(p.id)}
                    onMouseLeave={() => setHoveredPinId(null)}
                    style={{ opacity: dragIdx === idx ? 0.4 : 1, transition: 'opacity 0.1s', position: 'relative' }}
                  >
                    {dragOverIdx === idx && dragIdx !== idx && (
                      <div style={{ height: 2, borderRadius: 2, background: 'var(--accent)', margin: '1px 12px' }} />
                    )}
                    <NavLink
                      to={`/projets/${p.id}`}
                      style={({ isActive }) => ({
                        display: 'flex', alignItems: 'center', gap: 8,
                        padding: '7px 12px', paddingRight: hoveredPinId === p.id ? 30 : 12,
                        borderRadius: 9, textDecoration: 'none',
                        background: isActive ? 'var(--surface-3)' : hoveredPinId === p.id ? 'var(--surface-2)' : 'transparent',
                        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                        transition: 'background 0.1s', position: 'relative',
                      })}
                    >
                      <span
                        onMouseDown={() => { dragHandleActive.current = true; }}
                        onMouseUp={() => { dragHandleActive.current = false; }}
                        style={{ position: 'absolute', left: 1, top: '50%', transform: 'translateY(-50%)', cursor: 'grab', color: 'var(--border-2)', opacity: 0.6, lineHeight: 1, fontSize: 10 }}
                        title="Réordonner"
                      >⠿</span>

                      {/* Color dot — click to open color picker */}
                      <span
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setColorPickerId(prev => prev === p.id ? null : p.id); }}
                        title="Changer la couleur"
                        style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, flexShrink: 0, display: 'block', cursor: 'pointer', outline: colorPickerId === p.id ? `2px solid ${dotColor}` : 'none', outlineOffset: 2 }}
                      />

                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                        {p.name}
                      </span>
                      <ProjectPinnedBadge projectId={p.id} />
                    </NavLink>

                    {/* Color picker popover */}
                    {colorPickerId === p.id && (
                      <div
                        onMouseDown={e => e.stopPropagation()}
                        style={{
                          position: 'absolute', left: 20, top: '100%', zIndex: 200,
                          background: 'var(--surface)', border: '1px solid var(--border)',
                          borderRadius: 10, padding: 8, boxShadow: '0 4px 16px rgba(0,0,0,0.18)',
                          display: 'grid', gridTemplateColumns: 'repeat(6, 18px)', gap: 5,
                        }}
                      >
                        {PROJECT_COLOR_PRESETS.map(color => (
                          <button
                            key={color}
                            onClick={e => { e.preventDefault(); e.stopPropagation(); setProjectColor(p.id, color); forceColorUpdate(n => n + 1); setColorPickerId(null); }}
                            style={{
                              width: 18, height: 18, borderRadius: 5, background: color,
                              border: dotColor === color ? '2px solid var(--text)' : '2px solid transparent',
                              cursor: 'pointer', padding: 0,
                            }}
                          />
                        ))}
                      </div>
                    )}

                    {/* Unpin button */}
                    {hoveredPinId === p.id && (
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(p.id); }}
                        title="Désépingler"
                        style={{
                          position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          width: 20, height: 20, borderRadius: 5, border: 'none',
                          background: 'var(--surface-3)', color: 'var(--text-3)', cursor: 'pointer',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.15)'; (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                      >
                        <SFIcon name="star" size={11} fill="currentColor" />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Clients épinglés */}
        {!collapsed && pinnedClients.length > 0 && (
          <div style={{ padding: '12px 8px 0' }}>
            <p style={{
              fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
              textTransform: 'uppercase', letterSpacing: '0.1em',
              padding: '0 12px', marginBottom: 4,
            }}>
              Clients épinglés
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pinnedClients.map((c, idx) => (
                <div
                  key={c.id}
                  draggable
                  onDragStart={e => handleClientDragStart(e, idx)}
                  onDragOver={e => handleClientDragOver(e, idx)}
                  onDrop={() => handleClientDrop(idx)}
                  onDragEnd={handleClientDragEnd}
                  onMouseEnter={() => setHoveredClientId(c.id)}
                  onMouseLeave={() => setHoveredClientId(null)}
                  style={{ opacity: dragClientIdx === idx ? 0.4 : 1, transition: 'opacity 0.1s', position: 'relative' }}
                >
                  {dragOverClientIdx === idx && dragClientIdx !== idx && (
                    <div style={{ height: 2, borderRadius: 2, background: 'var(--accent)', margin: '1px 12px' }} />
                  )}
                  <NavLink
                    to={`/clients/${c.id}`}
                    style={({ isActive }) => ({
                      display: 'flex', alignItems: 'center', gap: 8,
                      padding: '7px 12px', paddingRight: hoveredClientId === c.id ? 30 : 12,
                      borderRadius: 9, textDecoration: 'none',
                      background: isActive ? 'var(--surface-3)' : hoveredClientId === c.id ? 'var(--surface-2)' : 'transparent',
                      borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
                      transition: 'background 0.1s', position: 'relative',
                    })}
                  >
                    <span
                      onMouseDown={() => { dragClientHandleActive.current = true; }}
                      onMouseUp={() => { dragClientHandleActive.current = false; }}
                      style={{ position: 'absolute', left: 1, top: '50%', transform: 'translateY(-50%)', cursor: 'grab', color: 'var(--border-2)', opacity: 0.6, lineHeight: 1, fontSize: 10 }}
                      title="Réordonner"
                    >⠿</span>
                    {/* Client avatar dot */}
                    <div style={{
                      width: 16, height: 16, borderRadius: 5, background: c.avatarColor,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 7, fontWeight: 700, color: '#fff', flexShrink: 0,
                    }}>
                      {c.initials}
                    </div>
                    <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                      {c.name}
                    </span>
                    <ClientPinnedBadge clientId={c.id} />
                  </NavLink>
                  {/* Unpin button */}
                  {hoveredClientId === c.id && (
                    <button
                      onClick={e => { e.preventDefault(); e.stopPropagation(); togglePinClient(c.id); }}
                      title="Désépingler"
                      style={{
                        position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        width: 20, height: 20, borderRadius: 5, border: 'none',
                        background: 'var(--surface-3)', color: 'var(--text-3)', cursor: 'pointer',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.15)'; (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                    >
                      <SFIcon name="star" size={11} fill="currentColor" />
                    </button>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Collapsed épinglés — dots/initials */}
        {collapsed && (pinnedProjects.length > 0 || pinnedClients.length > 0) && (
          <div style={{ padding: '8px 6px 0', display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center' }}>
            {pinnedProjects.map(p => (
              <NavLink
                key={p.id}
                to={`/projets/${p.id}`}
                title={p.name}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 28, borderRadius: 7, textDecoration: 'none',
                  background: isActive ? 'var(--surface-3)' : 'transparent',
                })}
              >
                <i style={{ width: 9, height: 9, borderRadius: 999, background: getProjectColor(p.id, p.clientColor), display: 'block' }} />
              </NavLink>
            ))}
            {pinnedClients.length > 0 && pinnedProjects.length > 0 && (
              <div style={{ height: 1, width: 20, background: 'var(--border)', margin: '2px 0' }} />
            )}
            {pinnedClients.map(c => (
              <NavLink
                key={c.id}
                to={`/clients/${c.id}`}
                title={c.name}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  width: 32, height: 28, borderRadius: 7, textDecoration: 'none',
                  background: isActive ? 'var(--surface-3)' : 'transparent',
                })}
              >
                <div style={{
                  width: 18, height: 18, borderRadius: 5, background: c.avatarColor,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 7, fontWeight: 700, color: '#fff',
                }}>
                  {c.initials}
                </div>
              </NavLink>
            ))}
          </div>
        )}
      </div>

      {/* Separator */}
      <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />

      {/* Bottom */}
      <div style={{ padding: collapsed ? '0 6px 12px' : '0 8px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <NavLink
          to="/parametres"
          title={collapsed ? 'Paramètres' : undefined}
          style={({ isActive }) => ({
            display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '8px 0' : '8px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            borderRadius: 9,
            fontSize: 13, fontWeight: 500,
            color: isActive ? 'var(--text)' : 'var(--text-2)',
            background: isActive ? 'var(--surface-3)' : 'transparent',
            borderLeft: collapsed ? 'none' : isActive ? '2px solid var(--accent)' : '2px solid transparent',
            textDecoration: 'none',
          })}
        >
          <SFIcon name="settings" size={16} />
          {!collapsed && 'Paramètres'}
        </NavLink>

        {/* User */}
        <button
          onClick={() => setShowProfile(true)}
          title={collapsed ? displayName : undefined}
          style={{
            display: 'flex', alignItems: 'center', gap: collapsed ? 0 : 10,
            padding: collapsed ? '8px 0' : '8px 12px',
            justifyContent: collapsed ? 'center' : 'flex-start',
            marginTop: 4, background: 'none', border: 'none', cursor: 'pointer',
            borderRadius: 9, width: '100%', textAlign: 'left',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
        >
          <div style={{
            width: 28, height: 28, borderRadius: '50%',
            background: me.avatarColor,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 600, color: '#fff', flexShrink: 0,
            overflow: 'hidden',
          }}>
            {photoUrl
              ? <img src={photoUrl} alt={displayName} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              : me.initials}
          </div>
          {!collapsed && (
            <div style={{ minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 600, lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayName}</p>
              <p style={{ fontSize: 10, color: 'var(--text-2)', lineHeight: 1.2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayRole}</p>
            </div>
          )}
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
    </aside>
  );
}
