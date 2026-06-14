// components/ScreenProjets.jsx — Écran 10 : Liste des projets

const PROJETS_DATA = [
  { id:'pj1', client:'Nova Films',       clientBg:'#3b4f8f', name:'Campagne Été 2025',      phase:'Production',    phaseStatus:'info',   progress:65, tasks:8,  date:'15 juin', status:'info',    statusLabel:'En cours',          members:['SM','TR','JB'], modified:'Il y a 1h' },
  { id:'pj2', client:'Studio Bleu',      clientBg:'#1a6b4a', name:'Les Bâtisseurs',          phase:'Préproduction', phaseStatus:'warn',   progress:30, tasks:14, date:'1 août',  status:'info',    statusLabel:'En cours',          members:['JB','MD'],     modified:'Il y a 3h' },
  { id:'pj3', client:'Maison Leroux',    clientBg:'#2d5a7d', name:'Film institutionnel 2025', phase:'Postproduction',phaseStatus:'ok',     progress:80, tasks:4,  date:'20 juin', status:'ok',      statusLabel:'En avance',         members:['SM','TR'],     modified:'Hier' },
  { id:'pj4', client:'Collectif Ondes',  clientBg:'#7d4e57', name:'Clip Horizon',             phase:'Production',   phaseStatus:'danger', progress:45, tasks:6,  date:'28 juin', status:'danger',  statusLabel:'En retard',         members:['MD','JB','SM'],modified:'Il y a 2h' },
  { id:'pj5', client:'Agence Vertigo',   clientBg:'#3d3d30', name:'Motion Design Pack',       phase:'Livraison',    phaseStatus:'warn',   progress:92, tasks:2,  date:'12 juin', status:'warn',    statusLabel:'En attente client', members:['TR'],          modified:'Il y a 4h' },
  { id:'pj6', client:'Studio Bleu',      clientBg:'#1a6b4a', name:'Brand Film Q4',            phase:'Livraison',    phaseStatus:'ok',     progress:100,tasks:0,  date:'Déc 2024',status:'neutral', statusLabel:'Complété',          members:['SM','JB'],     modified:'Il y a 2 sem.' },
];

const MEMBER_BG = { SM:'#3b4f8f', TR:'#5c3d8f', JB:'#1a6b4a', MD:'#7d4e57' };
const PROJ_STATUS_FILTERS = ['Tous','En cours','En retard','Complétés'];

function MiniMemberStack({ members }) {
  const shown = members.slice(0,3);
  const extra = members.length - 3;
  return (
    <div style={{ display:'flex' }}>
      {shown.map((m,i) => (
        <div key={m+i} style={{ marginLeft:i>0?-6:0, zIndex:shown.length-i }}>
          <SFAvatar initials={m} bg={MEMBER_BG[m]||'#2a3040'} size={20} />
        </div>
      ))}
      {extra > 0 && (
        <div style={{ marginLeft:-6, width:20, height:20, borderRadius:999, background:'var(--surface-3)', border:'1px solid var(--border-2)', display:'grid', placeItems:'center', fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)' }}>+{extra}</div>
      )}
    </div>
  );
}

function ProjectCard({ project }) {
  const [hov, setHov] = React.useState(false);
  const isCompleted = project.status === 'neutral';
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:hov?'var(--surface-2)':'var(--surface)', border:`1px solid ${hov?'var(--border-2)':'var(--border)'}`, borderRadius:14, overflow:'hidden', display:'flex', flexDirection:'column', opacity:isCompleted?0.6:1, transition:'all 0.12s', cursor:'pointer' }}>
      {/* Card header */}
      <div style={{ padding:'12px 14px 10px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:8 }}>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.1em', textTransform:'uppercase', color:'var(--text-3)', borderLeft:`2px solid ${project.clientBg}`, paddingLeft:7 }}>{project.client}</span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.06em', textTransform:'uppercase', padding:'3px 8px', borderRadius:6, background:'var(--surface-2)', color:'var(--text-3)' }}>{project.phase}</span>
        </div>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', marginBottom:10, lineHeight:1.3 }}>{project.name}</div>
        <SFBar pct={project.progress} height={4} />
      </div>

      {/* Metrics */}
      <div style={{ padding:'8px 14px', display:'flex', alignItems:'center', gap:12, borderTop:'1px solid var(--border)' }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', flex:1 }}>{project.tasks} tâches restantes</span>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>Livraison {project.date}</span>
      </div>

      {/* Footer */}
      <div style={{ padding:'8px 14px', display:'flex', alignItems:'center', justifyContent:'space-between', borderTop:'1px solid var(--border)', background:'var(--surface-2)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:8 }}>
          <MiniMemberStack members={project.members} />
          <SFPill status={project.status} small>{project.statusLabel}</SFPill>
        </div>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>{project.modified}</span>
      </div>
    </div>
  );
}

function ProjectListRow({ project }) {
  const [hov, setHov] = React.useState(false);
  const isCompleted = project.status === 'neutral';
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 16px', background:hov?'var(--surface-2)':'var(--surface)', border:'1px solid var(--border)', borderRadius:12, opacity:isCompleted?0.6:1, transition:'all 0.12s', cursor:'pointer' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:6 }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{project.name}</span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', borderLeft:`2px solid ${project.clientBg}`, paddingLeft:6 }}>{project.client}</span>
        </div>
        <SFBar pct={project.progress} height={3} />
      </div>
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:80 }}>{project.phase}</span>
      <MiniMemberStack members={project.members} />
      <SFPill status={project.status} small>{project.statusLabel}</SFPill>
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:60, textAlign:'right' }}>{project.date}</span>
    </div>
  );
}

function ScreenProjets({ onNavigate }) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('Tous');
  const [viewMode, setViewMode] = React.useState('grid');

  const filtered = PROJETS_DATA.filter(p => {
    const matchSearch = p.name.toLowerCase().includes(search.toLowerCase()) || p.client.toLowerCase().includes(search.toLowerCase());
    const matchFilter =
      filter === 'Tous'    ? true :
      filter === 'En cours'? p.status === 'info' :
      filter === 'En retard'? p.status === 'danger' :
      filter === 'Complétés'? p.status === 'neutral' : true;
    return matchSearch && matchFilter;
  });

  const total = PROJETS_DATA.length;
  const actifs = PROJETS_DATA.filter(p=>p.status==='info').length;
  const retard = PROJETS_DATA.filter(p=>p.status==='danger').length;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      <PageHeader title="Projets" subtitle={`${total} projets · ${actifs} actifs · ${retard} en retard`}>
        <BtnPrimary icon="plus" onClick={() => onNavigate('onboarding')}>Nouveau projet</BtnPrimary>
      </PageHeader>

      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'18px 24px' }}>
        {/* Filter bar */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <SearchInput placeholder="Rechercher un projet ou un client…" value={search} onChange={setSearch} />
          <div style={{ display:'flex', gap:4 }}>
            {PROJ_STATUS_FILTERS.map(f => {
              const on = f === filter;
              return (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', padding:'6px 12px', borderRadius:8, background:on?'var(--surface-3)':'transparent', color:on?'var(--text)':'var(--text-3)', border:on?'1px solid var(--border-2)':'1px solid transparent', cursor:'pointer', transition:'all 0.12s' }}>
                  {f}
                </button>
              );
            })}
          </div>
          <div style={{ marginLeft:'auto', display:'flex', gap:2 }}>
            {[{id:'grid',icon:'layout-grid'},{id:'list',icon:'list'}].map(v => (
              <button key={v.id} onClick={() => setViewMode(v.id)}
                style={{ width:32, height:32, display:'grid', placeItems:'center', borderRadius:7, background:viewMode===v.id?'var(--surface-3)':'transparent', border:viewMode===v.id?'1px solid var(--border-2)':'1px solid transparent', cursor:'pointer', transition:'all 0.12s' }}>
                <SFIcon name={v.icon} size={15} color={viewMode===v.id?'var(--text)':'var(--text-3)'} />
              </button>
            ))}
          </div>
        </div>

        {/* Grid or list */}
        {viewMode === 'grid' ? (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
            {filtered.map(p => <ProjectCard key={p.id} project={p} />)}
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            {filtered.map(p => <ProjectListRow key={p.id} project={p} />)}
          </div>
        )}

        {filtered.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, color:'var(--text-3)' }}>
            <SFIcon name="folder-open" size={32} color="var(--text-3)" />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:11 }}>AUCUN PROJET TROUVÉ</span>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenProjets });
