// components/ScreenDashboard.jsx — Écran 7 : Accueil / Dashboard

const TODAY_TASKS = [
  { id:'dt1', title:'Révision scénario V3', project:'Nova Films', status:'danger', statusLabel:'En retard', checked:false },
  { id:'dt2', title:'Préparation équipement tournage', project:'Nova Films', status:'info', statusLabel:'En cours', checked:false },
  { id:'dt3', title:'Appel de confirmation client', project:'Maison Leroux', status:'warn', statusLabel:'En attente', checked:false },
  { id:'dt4', title:'Brief documentaire "Les Bâtisseurs"', project:'Studio Bleu', status:'info', statusLabel:'En cours', checked:true },
  { id:'dt5', title:'Vérifier licences musicales', project:'Collectif Ondes', status:'warn', statusLabel:'En attente', checked:false },
];

const RECENT_ACTIVITY = [
  { initials:'ML', bg:'#5c3d8f', text:'Marie a approuvé V4 — Nova Films', time:'Il y a 12 min' },
  { initials:'TR', bg:'#5c3d8f', text:'Thomas a uploadé une nouvelle version', time:'Il y a 1h' },
  { initials:'LM', bg:'#5c3d8f', text:'Léa a créé 3 tâches — Clip Automne', time:'Il y a 2h' },
  { initials:'NF', bg:'#3b4f8f', text:'Client Nova Films a laissé 2 commentaires', time:'Il y a 3h' },
];

const ACTIVE_PROJECTS = [
  { id:'ap1', name:'Campagne Été 2025', client:'Nova Films', phase:'Production', phaseStatus:'info', progress:65, date:'15 juin', status:'info', statusLabel:'En cours' },
  { id:'ap2', name:'Les Bâtisseurs', client:'Studio Bleu', phase:'Préproduction', phaseStatus:'warn', progress:30, date:'1 août', status:'info', statusLabel:'En cours' },
  { id:'ap3', name:'Film institutionnel 2025', client:'Maison Leroux', phase:'Postproduction', phaseStatus:'info', progress:80, date:'20 juin', status:'ok', statusLabel:'En avance' },
  { id:'ap4', name:'Clip Horizon', client:'Collectif Ondes', phase:'Production', phaseStatus:'danger', progress:45, date:'28 juin', status:'danger', statusLabel:'En retard' },
];

const PENDING_APPROVALS = [
  { id:'pa1', title:'Rough Cut Final — V4', client:'Nova Films', since:'2 jours', sinceRed:true },
  { id:'pa2', title:'Motion Graphics — Teaser', client:'Studio Bleu', since:'1 jour', sinceRed:false },
];

// ─── WIDGET WRAPPER ───────────────────────────────────────────────────────
function Widget({ title, count, link, onLink, children }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
      {(title || link) && (
        <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div style={{ display:'flex', alignItems:'center', gap:8 }}>
            {title && <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{title}</span>}
            {count !== undefined && <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', background:'var(--surface-2)', padding:'1px 6px', borderRadius:999 }}>({count})</span>}
          </div>
          {link && <button onClick={onLink} style={{ fontFamily:'var(--ff-text)', fontSize:12, color:'var(--text-3)', background:'transparent', border:'none', cursor:'pointer', transition:'color 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.color='var(--accent)'}
            onMouseLeave={e => e.currentTarget.style.color='var(--text-3)'}>{link}</button>}
        </div>
      )}
      {children}
    </div>
  );
}

// ─── KPI WIDGET ───────────────────────────────────────────────────────────
function KpiWidget({ value, label, color = 'var(--text)' }) {
  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px', display:'flex', flexDirection:'column', gap:4 }}>
      <span style={{ fontFamily:'var(--ff-display)', fontSize:38, fontWeight:900, color, lineHeight:1, letterSpacing:'-0.02em' }}>{value}</span>
      <span style={{ fontFamily:'var(--ff-text)', fontSize:12, color:'var(--text-2)', fontWeight:500 }}>{label}</span>
    </div>
  );
}

// ─── TODAY TASK ROW ───────────────────────────────────────────────────────
function TodayTaskRow({ task, onToggle }) {
  const [hov, setHov] = React.useState(false);
  const [checked, setChecked] = React.useState(task.checked);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:9, padding:'8px 16px', background:hov?'var(--surface-2)':'transparent', borderBottom:'1px solid var(--border)', transition:'background 0.1s' }}>
      <button onClick={() => setChecked(p => !p)}
        style={{ width:15, height:15, borderRadius:999, border:checked?'none':'1.5px solid var(--border-2)', background:checked?'var(--accent)':'transparent', display:'grid', placeItems:'center', flexShrink:0, cursor:'pointer', padding:0 }}>
        {checked && <SFIcon name="check" size={9} color="var(--on-accent)" />}
      </button>
      <span style={{ flex:1, fontSize:12, color:checked?'var(--text-3)':'var(--text)', textDecoration:checked?'line-through':'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{task.title}</span>
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', background:'var(--surface-2)', padding:'1px 6px', borderRadius:5, borderLeft:`2px solid #3b4f8f`, whiteSpace:'nowrap', flexShrink:0 }}>{task.project}</span>
      <SFPill status={task.status} small>{task.statusLabel}</SFPill>
    </div>
  );
}

// ─── PROJECT ROW ──────────────────────────────────────────────────────────
function ProjectRow({ project }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ padding:'12px 16px', background:hov?'var(--surface-2)':'transparent', borderBottom:'1px solid var(--border)', cursor:'default', transition:'background 0.1s' }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:7 }}>
        <span style={{ fontSize:12, fontWeight:600, color:'var(--text)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project.name}</span>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>{project.client}</span>
        <SFPill status={project.status} small>{project.statusLabel}</SFPill>
      </div>
      <SFBar pct={project.progress} height={3} />
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:6 }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', background:'var(--surface-3)', padding:'2px 7px', borderRadius:5, textTransform:'uppercase', letterSpacing:'0.05em' }}>{project.phase}</span>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>Livraison {project.date}</span>
      </div>
    </div>
  );
}

// ─── SCREEN DASHBOARD ─────────────────────────────────────────────────────
function ScreenDashboard({ onNavigate }) {
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      {/* Header */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <h1 style={{ fontFamily:'var(--ff-display)', fontSize:22, fontWeight:700, color:'var(--text)', letterSpacing:'-0.01em', marginBottom:3 }}>Bonjour, Léa 👋</h1>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>
            MARDI 10 JUIN · <span style={{ color:'var(--danger)' }}>3 TÂCHES URGENTES AUJOURD'HUI</span>
          </span>
        </div>
        <BtnPrimary icon="plus" onClick={() => onNavigate('onboarding')}>Nouveau projet</BtnPrimary>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'20px 24px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'2fr 1.6fr 1.1fr', gap:16, alignItems:'start' }}>

          {/* ── Left column ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Today's tasks */}
            <Widget title="Aujourd'hui" count={TODAY_TASKS.length} link="Voir toutes mes tâches →" onLink={() => onNavigate('taches')}>
              {TODAY_TASKS.map(task => <TodayTaskRow key={task.id} task={task} />)}
            </Widget>

            {/* Recent activity */}
            <Widget title="Activité récente">
              {RECENT_ACTIVITY.map((a, i) => (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 16px', borderBottom: i < RECENT_ACTIVITY.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <SFAvatar initials={a.initials} bg={a.bg} size={26} />
                  <span style={{ flex:1, fontSize:12, color:'var(--text-2)', lineHeight:1.4 }}>{a.text}</span>
                  <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', whiteSpace:'nowrap' }}>{a.time}</span>
                </div>
              ))}
            </Widget>
          </div>

          {/* ── Center column ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            <Widget title="Projets actifs" count={ACTIVE_PROJECTS.length} link="Voir tous →" onLink={() => onNavigate('projets')}>
              {ACTIVE_PROJECTS.map(p => <ProjectRow key={p.id} project={p} />)}
            </Widget>
          </div>

          {/* ── Right column ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
            <KpiWidget value="6" label="Projets actifs" color="var(--accent)" />
            <KpiWidget value="3" label="En retard" color="var(--danger)" />
            <KpiWidget value="12" label="Tâches cette semaine" />

            {/* Pending approvals */}
            <Widget title="En attente d'approbation">
              {PENDING_APPROVALS.map((pa, i) => (
                <div key={pa.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 14px', borderBottom: i < PENDING_APPROVALS.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width:36, height:24, borderRadius:5, background:'repeating-linear-gradient(135deg,rgba(255,255,255,0.04) 0 2px,transparent 2px 8px),var(--surface-2)', flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:11, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{pa.title}</div>
                    <div style={{ fontFamily:'var(--ff-mono)', fontSize:9, color: pa.sinceRed ? 'var(--danger)' : 'var(--text-3)' }}>En attente depuis {pa.since}</div>
                  </div>
                </div>
              ))}
            </Widget>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenDashboard });
