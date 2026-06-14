// components/Shared.jsx — v2 (sidebar complète + composants partagés)
const { useState, useEffect, useRef } = React;

// ─── ICON ─────────────────────────────────────────────────────────────────
function SFIcon({ name, size = 18, color = 'currentColor' }) {
  const wrapRef = useRef(null);
  useEffect(() => {
    const wrap = wrapRef.current;
    if (!wrap || !window.lucide) return;
    wrap.innerHTML = '';
    const el = document.createElement('i');
    el.setAttribute('data-lucide', name);
    wrap.appendChild(el);
    window.lucide.createIcons();
    const svg = wrap.querySelector('svg');
    if (svg) { svg.setAttribute('width', size); svg.setAttribute('height', size); svg.style.strokeWidth = '1.6'; svg.style.display = 'block'; }
  }, [name, size]);
  return <span ref={wrapRef} style={{ display:'inline-flex', alignItems:'center', justifyContent:'center', width:size, height:size, color, flexShrink:0 }} />;
}

// ─── PILL ─────────────────────────────────────────────────────────────────
const PILL_COLORS = { ok:'var(--ok)', warn:'var(--warn)', info:'var(--info)', danger:'var(--danger)', review:'var(--review)', accent:'var(--accent)', neutral:'var(--text-3)' };
function SFPill({ status = 'neutral', children, small }) {
  const c = PILL_COLORS[status] || PILL_COLORS.neutral;
  return (
    <span style={{ fontFamily:'var(--ff-mono)', fontSize:small?9:10, letterSpacing:'0.05em', textTransform:'uppercase', padding:small?'2px 6px':'3px 8px', borderRadius:999, border:'1px solid var(--border-2)', color:c, display:'inline-flex', alignItems:'center', gap:5, whiteSpace:'nowrap', flexShrink:0 }}>
      <i style={{ width:5, height:5, borderRadius:999, background:c, flexShrink:0, display:'block' }} />{children}
    </span>
  );
}

// ─── AVATAR ───────────────────────────────────────────────────────────────
function SFAvatar({ initials, bg = '#2a3040', size = 28 }) {
  return (
    <div style={{ width:size, height:size, borderRadius:999, display:'grid', placeItems:'center', fontFamily:'var(--ff-mono)', fontSize:Math.floor(size*0.36), fontWeight:600, color:'#fff', background:bg, border:'1px solid var(--border-2)', flexShrink:0, letterSpacing:0 }}>
      {initials}
    </div>
  );
}

// ─── PROGRESS BAR ─────────────────────────────────────────────────────────
function SFBar({ pct, color = 'var(--accent)', height = 4 }) {
  return (
    <div style={{ height, borderRadius:999, background:'var(--surface-3)', overflow:'hidden', width:'100%' }}>
      <div style={{ width:`${pct}%`, height:'100%', borderRadius:999, background:color, transition:'width 0.4s ease' }} />
    </div>
  );
}

// ─── NAV ITEM ─────────────────────────────────────────────────────────────
function NavItem({ item, active, collapsed, sub, badge, onClick }) {
  const [hov, setHov] = useState(false);
  const isOn = active || hov;
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      title={collapsed ? item.label : undefined}
      style={{ width:'100%', padding:collapsed?'8px 0':'7px 10px', background:isOn?'var(--surface-2)':'transparent', border:'none', borderLeft:active?'2px solid var(--accent)':'2px solid transparent', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:9, justifyContent:collapsed?'center':'flex-start', textAlign:'left', transition:'all 0.12s ease', position:'relative' }}>
      <SFIcon name={item.icon} size={15} color={active?'var(--text)':'var(--text-2)'} />
      {!collapsed && (
        <div style={{ flex:1, overflow:'hidden' }}>
          <div style={{ fontFamily:'var(--ff-text)', fontSize:13, fontWeight:active?600:500, color:active?'var(--text)':'var(--text-2)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:1.35 }}>{item.label}</div>
          {sub && <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', marginTop:1 }}>{sub}</div>}
        </div>
      )}
      {badge && !collapsed && <span style={{ background:'var(--accent)', color:'var(--on-accent)', fontFamily:'var(--ff-mono)', fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:999, lineHeight:1.6 }}>{badge}</span>}
      {badge && collapsed && <span style={{ position:'absolute', top:5, right:6, width:7, height:7, background:'var(--accent)', borderRadius:999 }} />}
    </button>
  );
}

// ─── FAV SUB-ITEM ─────────────────────────────────────────────────────────
function FavSubItem({ label, color, active, onClick, collapsed }) {
  const [hov, setHov] = useState(false);
  if (collapsed) return null;
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width:'100%', padding:'6px 10px 6px 30px', background:hov||active?'var(--surface-2)':'transparent', border:'none', borderLeft:active?'2px solid var(--accent)':'2px solid transparent', borderRadius:8, cursor:'pointer', display:'flex', alignItems:'center', gap:8, textAlign:'left', transition:'all 0.1s' }}>
      <div style={{ width:6, height:6, borderRadius:999, background:color, flexShrink:0 }} />
      <span style={{ fontFamily:'var(--ff-text)', fontSize:12, color:active?'var(--text)':'var(--text-2)', fontWeight:active?500:400, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{label}</span>
    </button>
  );
}

// ─── PINNED ITEM ──────────────────────────────────────────────────────────
function PinnedItem({ project, onClick, collapsed }) {
  const [hov, setHov] = useState(false);
  if (collapsed) return null;
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width:'100%', padding:'5px 10px', background:hov?'var(--surface-2)':'transparent', border:'none', borderRadius:7, cursor:'pointer', textAlign:'left', transition:'background 0.1s', display:'flex', alignItems:'center', gap:7 }}>
      <div style={{ width:6, height:6, borderRadius:2, background:project.color, flexShrink:0 }} />
      <div style={{ overflow:'hidden', flex:1, minWidth:0 }}>
        <div style={{ fontFamily:'var(--ff-text)', fontSize:12, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project.label}</div>
        <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project.client}</div>
      </div>
      {hov && <SFIcon name="bookmark" size={11} color="var(--text-3)" />}
    </button>
  );
}

// ─── SIDEBAR SEPARATOR ────────────────────────────────────────────────────
function SidebarSep({ collapsed, label }) {
  if (collapsed) return <div style={{ height:1, background:'var(--border)', margin:'6px 8px' }} />;
  if (!label)    return <div style={{ height:1, background:'var(--border)', margin:'8px 6px' }} />;
  return <div style={{ padding:'10px 10px 4px', fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.18em', textTransform:'uppercase', color:'var(--text-3)' }}>{label}</div>;
}

// ─── SIDEBAR DATA ─────────────────────────────────────────────────────────
const MAIN_NAV = [
  { id:'accueil',       icon:'home',        label:'Accueil',       screen:'dashboard' },
  { id:'taches',        icon:'list-checks', label:'Mes tâches',    screen:'taches' },
  { id:'notifications', icon:'bell',        label:'Notifications', screen:'notifications', badge:3 },
  { id:'clients',    icon:'users',       label:'Clients',    screen:'clients' },
  { id:'projets',    icon:'folder-open', label:'Projets',    screen:'projets' },
];
const PINNED_PROJECTS = [
  { id:'rp1', label:'Campagne Été 2025', client:'Nova Films',    color:'#3b4f8f' },
  { id:'rp2', label:'Les Bâtisseurs',    client:'Studio Bleu',  color:'#1a6b4a' },
  { id:'rp3', label:'Clip Horizon',      client:'Collectif Ondes', color:'#7d4e57' },
];
const BOTTOM_NAV = [
  { id:'parametres', icon:'settings', label:'Paramètres', screen:'parametres' },
];

const PROJECT_SCREENS = new Set(['travail','ressources','video-review','activite']);
const CLIENT_SCREENS  = new Set(['clients','fiche-client']);

function Sidebar({ activeScreen, onNavigate, onNewProject, collapsed }) {
  const isActive = (id) => {
    if (id === 'accueil')    return activeScreen === 'dashboard';
    if (id === 'taches')     return activeScreen === 'taches';
    if (id === 'clients')    return CLIENT_SCREENS.has(activeScreen);
    if (id === 'projets')    return activeScreen === 'projets';
    if (id === 'notifications') return activeScreen === 'notifications';
    if (id === 'parametres') return activeScreen === 'parametres';
    return false;
  };

  return (
    <div style={{ width:collapsed?56:220, minHeight:'100vh', background:'var(--surface)', borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', flexShrink:0, transition:'width 0.2s ease', overflow:'hidden' }}>
      {/* Logo */}
      <div style={{ padding:collapsed?'14px 15px':'14px 18px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)', flexShrink:0 }}>
        <img src="assets/LogoMark_Inverse.svg" width={26} height={26} alt="Rush" style={{ flexShrink:0 }} />
        {!collapsed && <span style={{ fontFamily:'var(--ff-display)', fontWeight:900, fontSize:14, letterSpacing:'-0.01em', color:'var(--text)', whiteSpace:'nowrap' }}>Rush</span>}
      </div>

      {/* Scrollable nav */}
      <div style={{ flex:1, padding:'10px 8px', display:'flex', flexDirection:'column', gap:1, overflowY:'auto' }}>
        {MAIN_NAV.slice(0,3).map(item => (
          <NavItem key={item.id} item={item} active={isActive(item.id)} collapsed={collapsed} badge={item.badge} onClick={() => onNavigate(item.screen)} />
        ))}

        {MAIN_NAV.slice(3).map(item => (
          <NavItem key={item.id} item={item} active={isActive(item.id)} collapsed={collapsed} onClick={() => onNavigate(item.screen)} />
        ))}

        {/* Separator + Pinned projects */}
        <SidebarSep collapsed={collapsed} />
        <SidebarSep collapsed={collapsed} label="Épinglés" />
        {PINNED_PROJECTS.map(rp => (
          <PinnedItem key={rp.id} project={rp} collapsed={collapsed} onClick={() => onNavigate('travail')} />
        ))}

        {/* New project */}
        <div style={{ marginTop:8, padding:'0 2px' }}>
          <button onClick={onNewProject}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--accent)'; e.currentTarget.style.color='var(--accent)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border-2)'; e.currentTarget.style.color='var(--text-3)'; }}
            style={{ width:'100%', padding:collapsed?'8px 0':'8px 12px', background:'transparent', border:'1px dashed var(--border-2)', borderRadius:9, color:'var(--text-3)', fontFamily:'var(--ff-text)', fontSize:12, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6, justifyContent:collapsed?'center':'flex-start', transition:'all 0.15s' }}>
            <SFIcon name="plus" size={14} color="inherit" />
            {!collapsed && 'Nouveau projet'}
          </button>
        </div>
      </div>

      {/* Bottom */}
      <div style={{ padding:'10px 8px', borderTop:'1px solid var(--border)', display:'flex', flexDirection:'column', gap:1, flexShrink:0 }}>
        {BOTTOM_NAV.map(item => (
          <NavItem key={item.id} item={item} active={isActive(item.id)} collapsed={collapsed} badge={item.badge} onClick={() => onNavigate(item.screen)} />
        ))}
        <div style={{ marginTop:6, padding:collapsed?'5px 0':'5px 8px', display:'flex', alignItems:'center', gap:8 }}>
          <SFAvatar initials="LM" bg="#5c3d8f" size={27} />
          {!collapsed && (
            <div style={{ overflow:'hidden' }}>
              <div style={{ fontSize:12, fontWeight:600, color:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>Léa Marchand</div>
              <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>Admin</div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── TOPBAR ───────────────────────────────────────────────────────────────
function Topbar({ breadcrumb, tabs, activeTab, onTabChange, children }) {
  return (
    <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 24px', display:'flex', alignItems:'center', gap:14, height:50, flexShrink:0 }}>
      <div style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--ff-text)', fontSize:12, flexShrink:0 }}>
        {breadcrumb.map((item, i) => (
          <React.Fragment key={i}>
            {i > 0 && <span style={{ color:'var(--border-2)', margin:'0 1px' }}>›</span>}
            <span style={{ color:i===breadcrumb.length-1?'var(--text-2)':'var(--text-3)', fontWeight:i===breadcrumb.length-1?500:400 }}>{item}</span>
          </React.Fragment>
        ))}
      </div>
      {tabs && <div style={{ width:1, height:16, background:'var(--border-2)', flexShrink:0 }} />}
      {tabs && (
        <div style={{ display:'flex', alignItems:'stretch', gap:2, height:'100%' }}>
          {tabs.map(tab => {
            const on = tab.id === activeTab;
            return (
              <button key={tab.id} onClick={() => onTabChange && onTabChange(tab.id)}
                style={{ fontFamily:'var(--ff-text)', fontSize:13, fontWeight:on?600:400, color:on?'var(--text)':'var(--text-3)', padding:'0 10px', background:'transparent', border:'none', borderBottom:on?'2px solid var(--accent)':'2px solid transparent', cursor:'pointer', transition:'all 0.12s', whiteSpace:'nowrap' }}>
                {tab.label}
              </button>
            );
          })}
        </div>
      )}
      <div style={{ flex:1 }} />
      {children}
    </div>
  );
}

// ─── PHASE STEPPER ────────────────────────────────────────────────────────
const PHASES = [
  { id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' },
  { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' },
];
function PhaseStepper({ activePhase, onPhaseChange }) {
  return (
    <div style={{ padding:'10px 24px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, background:'var(--bg)', flexShrink:0, alignItems:'center' }}>
      {PHASES.map((phase, i) => {
        const on = phase.id === activePhase;
        return (
          <React.Fragment key={phase.id}>
            <button onClick={() => onPhaseChange(phase.id)}
              style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', fontWeight:on?700:500, padding:'5px 12px', borderRadius:7, background:on?'var(--accent)':'var(--surface-2)', color:on?'var(--on-accent)':'var(--text-3)', border:on?'none':'1px solid var(--border)', cursor:'pointer', transition:'all 0.15s', whiteSpace:'nowrap' }}>
              {phase.label}
            </button>
            {i < PHASES.length-1 && <div style={{ width:16, height:1, background:'var(--border)', flexShrink:0 }} />}
          </React.Fragment>
        );
      })}
    </div>
  );
}

// ─── BUTTONS ──────────────────────────────────────────────────────────────
function BtnPrimary({ icon, children, onClick, disabled }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} disabled={disabled} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', background:disabled?'var(--surface-3)':hov?'#fff':'var(--accent)', color:disabled?'var(--text-3)':'var(--on-accent)', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:disabled?'not-allowed':'pointer', fontFamily:'var(--ff-text)', transition:'background 0.12s', whiteSpace:'nowrap', flexShrink:0 }}>
      {icon && <SFIcon name={icon} size={14} color="inherit" />}{children}
    </button>
  );
}
function BtnSecondary({ icon, children, onClick }) {
  const [hov, setHov] = useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:7, padding:'7px 14px', background:hov?'var(--surface-3)':'var(--surface-2)', color:'var(--text)', borderRadius:9, fontSize:13, fontWeight:600, border:'1px solid var(--border-2)', cursor:'pointer', fontFamily:'var(--ff-text)', transition:'background 0.12s', whiteSpace:'nowrap', flexShrink:0 }}>
      {icon && <SFIcon name={icon} size={14} color="var(--text-2)" />}{children}
    </button>
  );
}

// ─── SEARCH INPUT ─────────────────────────────────────────────────────────
function SearchInput({ placeholder, value, onChange }) {
  const [foc, setFoc] = useState(false);
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, background:'var(--surface-2)', border:`1px solid ${foc?'var(--border-2)':'var(--border)'}`, borderRadius:9, padding:'8px 12px', transition:'border-color 0.12s', flex:1, maxWidth:320 }}>
      <SFIcon name="search" size={14} color="var(--text-3)" />
      <input value={value} onChange={e => onChange(e.target.value)} placeholder={placeholder||'Rechercher…'}
        onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
        style={{ flex:1, background:'transparent', border:'none', outline:'none', fontSize:13, color:'var(--text)', fontFamily:'var(--ff-text)' }} />
    </div>
  );
}

// ─── PAGE HEADER ──────────────────────────────────────────────────────────
function PageHeader({ title, subtitle, children }) {
  return (
    <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
      <div>
        <h1 style={{ fontFamily:'var(--ff-display)', fontSize:22, fontWeight:700, color:'var(--text)', letterSpacing:'-0.01em', marginBottom:3 }}>{title}</h1>
        {subtitle && <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em', textTransform:'uppercase' }}>{subtitle}</span>}
      </div>
      {children}
    </div>
  );
}

Object.assign(window, { SFIcon, SFPill, SFAvatar, SFBar, NavItem, FavSubItem, PinnedItem, Sidebar, Topbar, PhaseStepper, BtnPrimary, BtnSecondary, SearchInput, PageHeader });
