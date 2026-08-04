import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { NavLink, useNavigate, useLocation } from 'react-router-dom';
import { SFIcon } from '../ui/SFIcon';
import { SFBar } from '../ui/SFBar';
import { OrgSwitcher } from './OrgSwitcher';
import { getProjects, subscribeProjects } from '../../data/projectStore';
import { getClients, subscribeClients } from '../../data/clientStore';
import { useProjectTotalNotifCount, useClientTotalNotifCount } from '../../hooks/useNotifs';
import {
  getPinnedIds, subscribePinned, movePinned, togglePin,
  getPinnedClientIds, subscribePinnedClients, movePinnedClient, togglePinClient,
  getProjectColor, setProjectColor,
} from '../../data/pinnedStore';
import { getLogoFull, getLogoSquare, subscribeStudioLogos } from '../../data/studioLogoStore';
import { getViewAsUser, subscribeViewAs } from '../../data/viewAsStore';
import { getRequiredPermissionForPath } from '../../data/viewAsRoutePermissions';
import { getTotalStorageUsedBytes, subscribeStorageUsage, checkStorageThreshold } from '../../data/storageStore';
import { getCurrentPlan, getCurrentStorageTier, subscribePlan } from '../../data/planStore';
import { getStorageLimitGB } from '../../data/planFeatures';
import { loadPersisted, savePersisted } from '../../data/persist';

function SidebarStorageBar({ collapsed }: { collapsed: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [usedBytes, setUsedBytes] = useState(getTotalStorageUsedBytes);
  const [plan, setPlan] = useState(getCurrentPlan);
  const [storageTier, setStorageTier] = useState(getCurrentStorageTier);

  useEffect(() => subscribeStorageUsage(() => setUsedBytes(getTotalStorageUsedBytes())), []);
  useEffect(() => subscribePlan(() => { setPlan(getCurrentPlan()); setStorageTier(getCurrentStorageTier()); }), []);

  const usedGB = usedBytes / (1024 ** 3);
  const limitGB = getStorageLimitGB(plan, storageTier);
  const pct = Math.min(100, (usedGB / limitGB) * 100);

  useEffect(() => { checkStorageThreshold(usedGB, limitGB); }, [usedGB, limitGB]);

  const openStorageView = () => {
    savePersisted('sf_view_fichiers', 'stockage');
    navigate('/fichiers');
  };

  if (collapsed) {
    return (
      <button
        onClick={openStorageView}
        title={`${usedGB.toFixed(usedGB < 1 ? 2 : 1)} / ${limitGB} Go`}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '8px 0', background: 'none', border: 'none', cursor: 'pointer', color: pct >= 90 ? 'var(--danger)' : 'var(--text-3)' }}
      >
        <SFIcon name="hard-drive" size={15} />
      </button>
    );
  }

  return (
    <button
      onClick={openStorageView}
      title={t('nav.viewStorage')}
      style={{ display: 'flex', flexDirection: 'column', gap: 6, width: '100%', padding: '8px 12px', borderRadius: 9, background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <SFIcon name="hard-drive" size={13} color="var(--text-3)" />
        <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>
          {usedGB.toFixed(usedGB < 1 ? 2 : 1)} / {limitGB} Go
        </span>
      </div>
      <SFBar value={usedGB} max={limitGB} height={4} color={pct >= 90 ? 'var(--danger)' : 'var(--accent)'} />
    </button>
  );
}

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

// These will be populated inside the Sidebar component using i18n

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

// Collapsible group of related global (cross-project) views — one row when
// closed, expands to direct one-click links to each sub-view. State persists
// (sf_nav_global_open) so it stays open across navigation/reloads once a
// user has opened it, instead of re-collapsing every time they leave.
function NavGroup({ icon, label, collapsed, active, children }: { icon: string; label: string; collapsed: boolean; active: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(() => active || loadPersisted('sf_nav_global_open', false));
  const wasActive = useRef(active);
  useEffect(() => {
    // Auto-open only on the transition into a sub-page (e.g. clicking a
    // sub-link elsewhere, or a fresh load on one of these routes) — once
    // open, the user can still collapse it manually even while active.
    if (active && !wasActive.current) setOpen(true);
    wasActive.current = active;
  }, [active]);

  if (collapsed) {
    // Collapsed sidebar has no room for a sub-list — clicking just opens it.
    return (
      <button
        onClick={() => setOpen(true)}
        title={label}
        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: '100%', padding: '8px 0', borderRadius: 9, border: 'none', background: active ? 'var(--surface-3)' : 'transparent', color: active ? 'var(--text)' : 'var(--text-2)', cursor: 'pointer' }}
      >
        <SFIcon name={icon} size={16} />
      </button>
    );
  }

  return (
    <div>
      {/* Pas de fond/bordure accent ici même quand `active` est vrai — un
          sous-élément (SubNavItem) porte déjà ce traitement pour indiquer
          où on se trouve réellement ; le dupliquer sur le groupe parent (qui
          n'est pas lui-même une destination, juste un bouton d'ouverture)
          donnait l'impression fausse que deux choses étaient sélectionnées
          à la fois. */}
      <button
        onClick={() => { const next = !open; setOpen(next); savePersisted('sf_nav_global_open', next); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 10, width: '100%',
          padding: '8px 12px', borderRadius: 9, border: 'none',
          background: 'transparent',
          color: 'var(--text-2)',
          fontSize: 13, fontWeight: 500, cursor: 'pointer', textAlign: 'left',
          borderLeft: '2px solid transparent',
        }}
      >
        <SFIcon name={icon} size={16} />
        <span style={{ flex: 1 }}>{label}</span>
        <SFIcon name={open ? 'chevron-down' : 'chevron-right'} size={13} color="var(--text-3)" />
      </button>
      {open && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 1, marginTop: 1 }}>
          {children}
        </div>
      )}
    </div>
  );
}

function SubNavItem({ to, icon, label, exact }: { to: string; icon: string; label: string; exact?: boolean }) {
  return (
    <NavLink
      to={to}
      end={exact}
      style={({ isActive }) => ({
        display: 'flex', alignItems: 'center', gap: 8,
        padding: '7px 12px 7px 34px', borderRadius: 9,
        fontSize: 12, fontWeight: 500,
        color: isActive ? 'var(--text)' : 'var(--text-3)',
        background: isActive ? 'var(--surface-3)' : 'transparent',
        borderLeft: isActive ? '2px solid var(--accent)' : '2px solid transparent',
        textDecoration: 'none',
        transition: 'background 0.1s, color 0.1s',
      })}
    >
      <SFIcon name={icon} size={14} />
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  const { t } = useTranslation();
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [pinnedIds, setPinnedIds] = useState(getPinnedIds);
  const [pinnedClientIds, setPinnedClientIds] = useState(getPinnedClientIds);
  const [dragIdx, setDragIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [dragOverPos, setDragOverPos] = useState<'before' | 'after' | null>(null);
  const [dragClientIdx, setDragClientIdx] = useState<number | null>(null);
  const [dragOverClientIdx, setDragOverClientIdx] = useState<number | null>(null);
  const [dragOverClientPos, setDragOverClientPos] = useState<'before' | 'after' | null>(null);
  const [hoveredPinId, setHoveredPinId] = useState<string | null>(null);
  const [hoveredClientId, setHoveredClientId] = useState<string | null>(null);
  const [colorPickerId, setColorPickerId] = useState<string | null>(null);
  const [, forceColorUpdate] = useState(0);
  const dragHandleActive = useRef(false);
  const dragClientHandleActive = useRef(false);

  useEffect(() => subscribePinned(() => setPinnedIds(getPinnedIds())), []);
  useEffect(() => subscribePinnedClients(() => setPinnedClientIds(getPinnedClientIds())), []);
  useEffect(() => subscribeProjects(() => setPinnedIds(prev => [...prev])), []);
  useEffect(() => subscribeClients(() => setPinnedClientIds(prev => [...prev])), []);

  // Collapse/expand the pinned lists themselves — shown by default, persisted
  // like NavGroup's own open state so a user who collapses one doesn't have
  // to redo it on every reload.
  const [projectsSectionOpen, setProjectsSectionOpen] = useState(() => loadPersisted('sf_pinned_projects_open', true));
  const [clientsSectionOpen, setClientsSectionOpen] = useState(() => loadPersisted('sf_pinned_clients_open', true));
  const toggleProjectsSection = () => setProjectsSectionOpen(v => { const next = !v; savePersisted('sf_pinned_projects_open', next); return next; });
  const toggleClientsSection = () => setClientsSectionOpen(v => { const next = !v; savePersisted('sf_pinned_clients_open', next); return next; });

  const [logoFull, setLogoFullState] = useState(getLogoFull);
  const [logoSquare, setLogoSquareState] = useState(getLogoSquare);
  const [viewAs, setViewAs] = useState(getViewAsUser);

  useEffect(() => subscribeStudioLogos(() => {
    setLogoFullState(getLogoFull());
    setLogoSquareState(getLogoSquare());
  }), []);

  useEffect(() => subscribeViewAs(() => setViewAs(getViewAsUser())), []);

  // Derive permission restrictions when viewing as an internal member —
  // uses the same route→permission mapping the route guard enforces
  // (viewAsRoutePermissions.ts), so a hidden link and an enforced redirect
  // can never disagree about what a given route requires.
  const viewAsPerms = viewAs?.type === 'internal' ? (viewAs.permissions ?? []) : null;
  const requiredForClients = getRequiredPermissionForPath('/clients')!;
  const canSeeClients = !viewAsPerms || requiredForClients.some(p => viewAsPerms.includes(p));
  const requiredForFinances = getRequiredPermissionForPath('/finances')!;
  const canSeeFinances = !viewAsPerms || requiredForFinances.some(p => viewAsPerms.includes(p));

  const pinnedProjects = pinnedIds
    .map(id => getProjects().find(p => p.id === id))
    .filter(p => p && !p.archived) as ReturnType<typeof getProjects>;

  const pinnedClients = pinnedClientIds
    .map(id => getClients().find(c => c.id === id))
    .filter(c => c && !c.archived) as ReturnType<typeof getClients>;

  // Project drag handlers
  const handleDragStart = (e: React.DragEvent, idx: number) => {
    if (!dragHandleActive.current) { e.preventDefault(); return; }
    setDragIdx(idx);
    e.dataTransfer.effectAllowed = 'move';
  };
  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    if (dragIdx === null || dragIdx === idx) return;
    // Which half of the hovered row the cursor is over decides whether the
    // dragged project lands before or after it — always inserting "before"
    // made it impossible to drop something after the last pinned project.
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOverIdx(idx);
    setDragOverPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
  };
  const handleDrop = (idx: number) => {
    if (dragIdx !== null && dragIdx !== idx) {
      const shiftedTarget = idx > dragIdx ? idx - 1 : idx;
      const toIdx = dragOverPos === 'after' ? shiftedTarget + 1 : shiftedTarget;
      movePinned(dragIdx, toIdx);
    }
    setDragIdx(null);
    setDragOverIdx(null);
    setDragOverPos(null);
    dragHandleActive.current = false;
  };
  const handleDragEnd = () => {
    setDragIdx(null);
    setDragOverIdx(null);
    setDragOverPos(null);
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
    if (dragClientIdx === null || dragClientIdx === idx) return;
    const rect = e.currentTarget.getBoundingClientRect();
    setDragOverClientIdx(idx);
    setDragOverClientPos(e.clientY < rect.top + rect.height / 2 ? 'before' : 'after');
  };
  const handleClientDrop = (idx: number) => {
    if (dragClientIdx !== null && dragClientIdx !== idx) {
      const shiftedTarget = idx > dragClientIdx ? idx - 1 : idx;
      const toIdx = dragOverClientPos === 'after' ? shiftedTarget + 1 : shiftedTarget;
      movePinnedClient(dragClientIdx, toIdx);
    }
    setDragClientIdx(null);
    setDragOverClientIdx(null);
    setDragOverClientPos(null);
    dragClientHandleActive.current = false;
  };
  const handleClientDragEnd = () => {
    setDragClientIdx(null);
    setDragOverClientIdx(null);
    setDragOverClientPos(null);
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
              : <img src="/favicon.svg" alt="Rushflow" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />
          ) : (
            logoFull
              ? <img src={logoFull} alt="Logo" style={{ maxHeight: 32, maxWidth: 160, objectFit: 'contain', flexShrink: 0 }} />
              : <>
                  <img src="/favicon.svg" alt="Rushflow" style={{ width: 24, height: 24, objectFit: 'contain', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--ff-display)', fontWeight: 900, fontSize: 14, letterSpacing: '-0.01em', whiteSpace: 'nowrap' }}>Rushflow</span>
                </>
          )}
        </div>
        {!collapsed && (
          <button
            onClick={() => setCollapsed(true)}
            title={t('nav.collapseMenu')}
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
          title={t('nav.expandMenu')}
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

      {/* Organisation switcher */}
      <OrgSwitcher collapsed={collapsed} />

      {/* Scrollable middle section */}
      <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {/* Main nav */}
        <nav style={{ padding: collapsed ? '0 6px' : '0 8px', display: 'flex', flexDirection: 'column', gap: 1 }}>
          {/* Accueil + Mes tâches */}
          <NavItem to="/"       icon="house"        label={t('nav.dashboard')} exact={true}  collapsed={collapsed} />
          <NavItem to="/taches" icon="square-check" label={t('nav.myTasks')}  exact={false} collapsed={collapsed} />

          {/* Séparateur */}
          <div style={{ height: 1, background: 'var(--border)', margin: collapsed ? '6px 4px' : '6px 12px' }} />

          {/* Entités */}
          <NavItem to="/projets" icon="folder" label={t('nav.projects')} exact={true} collapsed={collapsed} />
          {canSeeClients && (
            <NavItem to="/clients" icon="users" label={t('nav.clients')} exact={true} collapsed={collapsed} />
          )}

          {/* Séparateur */}
          <div style={{ height: 1, background: 'var(--border)', margin: collapsed ? '6px 4px' : '6px 12px' }} />

          {/* Vue globale — vues qui agrègent tous les projets à la fois */}
          <NavGroup
            icon="layout-grid"
            label={t('nav.globalView')}
            collapsed={collapsed}
            active={['/toutes-les-taches', '/calendrier', '/fichiers', '/finances'].some(p => location.pathname.startsWith(p))}
          >
            <SubNavItem to="/toutes-les-taches" icon="square-check" label={t('nav.allTasks')} exact={false} />
            <SubNavItem to="/calendrier" icon="calendar" label={t('nav.calendar')} exact={false} />
            <SubNavItem to="/fichiers" icon="folder-open" label={t('nav.files')} exact={false} />
            {canSeeFinances && <SubNavItem to="/finances" icon="wallet" label={t('nav.finances')} exact={false} />}
          </NavGroup>
        </nav>

        {/* Projets épinglés */}
        {!collapsed && pinnedProjects.length > 0 && (
          <div style={{ padding: '12px 8px 0' }}>
            <button
              onClick={toggleProjectsSection}
              title={projectsSectionOpen ? t('nav.collapseSection') : t('nav.expandSection')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 12px', marginBottom: 4,
              }}
            >
              <span style={{
                flex: 1, textAlign: 'left', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                {t('nav.pinnedProjects')}
              </span>
              <SFIcon name={projectsSectionOpen ? 'chevron-down' : 'chevron-right'} size={11} color="var(--text-3)" />
            </button>
            {projectsSectionOpen && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
              {pinnedProjects.map((p, idx) => {
                const dotColor = getProjectColor(p.id, p.clientColor ?? 'var(--text-3)');
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
                    style={{
                      opacity: dragIdx === idx ? 0.4 : 1, transition: 'opacity 0.1s', position: 'relative',
                      borderTop: dragOverIdx === idx && dragOverPos === 'before' && dragIdx !== idx ? '2px solid var(--accent)' : '2px solid transparent',
                      borderBottom: dragOverIdx === idx && dragOverPos === 'after' && dragIdx !== idx ? '2px solid var(--accent)' : '2px solid transparent',
                    }}
                  >
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
                        title={t('nav.reorder')}
                      >⠿</span>

                      {/* Color dot — click to open color picker */}
                      <span
                        onClick={e => { e.preventDefault(); e.stopPropagation(); setColorPickerId(prev => prev === p.id ? null : p.id); }}
                        title={t('nav.changeColor')}
                        style={{ width: 7, height: 7, borderRadius: 999, background: dotColor, flexShrink: 0, display: 'block', cursor: 'pointer', outline: colorPickerId === p.id ? `2px solid ${dotColor}` : 'none', outlineOffset: 2 }}
                      />

                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text-2)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', flex: 1, minWidth: 0 }}>
                        {p.name}
                      </span>
                      <ProjectPinnedBadge projectId={p.id} />
                    </NavLink>

                    {/* Color picker popover */}
                    {colorPickerId === p.id && (
                      <>
                      <div onClick={() => setColorPickerId(null)} style={{ position: 'fixed', inset: 0, zIndex: 199 }} />
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
                      </>
                    )}

                    {/* Unpin button */}
                    {hoveredPinId === p.id && (
                      <button
                        onClick={e => { e.preventDefault(); e.stopPropagation(); togglePin(p.id); }}
                        title={t('nav.unpin')}
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
            )}
          </div>
        )}

        {/* Clients épinglés */}
        {!collapsed && pinnedClients.length > 0 && (
          <div style={{ padding: '12px 8px 0' }}>
            <button
              onClick={toggleClientsSection}
              title={clientsSectionOpen ? t('nav.collapseSection') : t('nav.expandSection')}
              style={{
                display: 'flex', alignItems: 'center', gap: 4, width: '100%',
                background: 'none', border: 'none', cursor: 'pointer', padding: '0 12px', marginBottom: 4,
              }}
            >
              <span style={{
                flex: 1, textAlign: 'left', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
                textTransform: 'uppercase', letterSpacing: '0.1em',
              }}>
                {t('nav.pinnedClients')}
              </span>
              <SFIcon name={clientsSectionOpen ? 'chevron-down' : 'chevron-right'} size={11} color="var(--text-3)" />
            </button>
            {clientsSectionOpen && (
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
                  style={{
                    opacity: dragClientIdx === idx ? 0.4 : 1, transition: 'opacity 0.1s', position: 'relative',
                    borderTop: dragOverClientIdx === idx && dragOverClientPos === 'before' && dragClientIdx !== idx ? '2px solid var(--accent)' : '2px solid transparent',
                    borderBottom: dragOverClientIdx === idx && dragOverClientPos === 'after' && dragClientIdx !== idx ? '2px solid var(--accent)' : '2px solid transparent',
                  }}
                >
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
                      title={t('nav.reorder')}
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
                      title={t('nav.unpin')}
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
            )}
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
                <i style={{ width: 9, height: 9, borderRadius: 999, background: getProjectColor(p.id, p.clientColor ?? 'var(--text-3)'), display: 'block' }} />
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

      {/* Stockage */}
      <div style={{ padding: collapsed ? '0 6px' : '0 8px', marginBottom: 8 }}>
        <SidebarStorageBar collapsed={collapsed} />
      </div>

      {/* Bottom */}
      <div style={{ padding: collapsed ? '0 6px 12px' : '0 8px 12px', display: 'flex', flexDirection: 'column', gap: 1 }}>
        <NavItem to="/modeles" icon="layout-template" label={t('nav.models')} exact={false} collapsed={collapsed} />
        <NavLink
          to="/parametres"
          title={collapsed ? t('nav.settings') : undefined}
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
          {!collapsed && t('nav.settings')}
        </NavLink>

      </div>
    </aside>
  );
}
