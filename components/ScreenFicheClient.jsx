// components/ScreenFicheClient.jsx — Écran 9 : Fiche client

const FICHE_PROJECTS = [
  { id:'fp1', name:'Campagne Été 2025',     phase:'Production',     phaseStatus:'info',   progress:65, tasks:8,  deliverables:3, members:['SM','TR','JB'], date:'15 juin', status:'info',   statusLabel:'En cours' },
  { id:'fp2', name:'Clip Corporate 2024',   phase:'Livraison',      phaseStatus:'ok',     progress:95, tasks:1,  deliverables:4, members:['JB','MD'],      date:'1 mars 24',status:'ok',   statusLabel:'Complété' },
  { id:'fp3', name:'Brand Film Q4 2024',    phase:'Livraison',      phaseStatus:'ok',     progress:100,tasks:0,  deliverables:5, members:['SM','TR'],       date:'Déc 2024',  status:'ok',   statusLabel:'Complété' },
  { id:'fp4', name:'Clip Printemps 2025',   phase:'Préproduction',  phaseStatus:'warn',   progress:20, tasks:12, deliverables:1, members:['MD','JB'],      date:'30 août',   status:'info', statusLabel:'En cours' },
];

const FICHE_MEMBER_BG = { SM:'#3b4f8f', TR:'#5c3d8f', JB:'#1a6b4a', MD:'#7d4e57' };
const PROJ_FILTERS = ['Tous','En cours','Complétés','Archivés'];

function MemberStack({ members }) {
  return (
    <div style={{ display:'flex' }}>
      {members.slice(0,3).map((m,i) => (
        <div key={m} style={{ marginLeft:i>0?-7:0, zIndex:members.length-i }}>
          <SFAvatar initials={m} bg={FICHE_MEMBER_BG[m]||'#2a3040'} size={22} />
        </div>
      ))}
      {members.length > 3 && (
        <div style={{ marginLeft:-7, width:22, height:22, borderRadius:999, background:'var(--surface-3)', border:'1px solid var(--border-2)', display:'grid', placeItems:'center', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>+{members.length-3}</div>
      )}
    </div>
  );
}

function ProjectListRow({ project }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:hov?'var(--surface-2)':'var(--surface)', border:'1px solid var(--border)', borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:14, transition:'all 0.12s', cursor:'pointer' }}>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{project.name}</span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.07em', textTransform:'uppercase', padding:'3px 8px', borderRadius:6, background:'var(--surface-2)', color:'var(--text-3)', whiteSpace:'nowrap', flexShrink:0 }}>{project.phase}</span>
        </div>
        <SFBar pct={project.progress} height={3} />
        <div style={{ display:'flex', alignItems:'center', gap:14, marginTop:7 }}>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>{project.tasks} tâches</span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>{project.deliverables} livrables</span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>{project.members.length} membres</span>
        </div>
      </div>
      <MemberStack members={project.members} />
      <div style={{ textAlign:'right', flexShrink:0 }}>
        <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', marginBottom:5 }}>{project.date}</div>
        <SFPill status={project.status}>{project.statusLabel}</SFPill>
      </div>
      <SFIcon name="chevron-right" size={16} color="var(--text-3)" />
    </div>
  );
}

function ScreenFicheClient({ onNavigate, onBack }) {
  const [activeTab, setActiveTab] = React.useState('projets');
  const [projFilter, setProjFilter] = React.useState('Tous');

  const filteredProjects = FICHE_PROJECTS.filter(p => {
    if (projFilter === 'Tous') return true;
    if (projFilter === 'En cours') return p.status === 'info';
    if (projFilter === 'Complétés') return p.status === 'ok';
    return true;
  });

  const TABS = [
    { id:'projets',   label:'Projets' },
    { id:'contacts',  label:'Contacts' },
    { id:'activite',  label:'Activité' },
    { id:'documents', label:'Documents' },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      {/* Topbar with breadcrumb */}
      <Topbar breadcrumb={['Clients', 'Nova Films']}>
        <BtnSecondary icon="arrow-left" onClick={onBack}>Clients</BtnSecondary>
      </Topbar>

      {/* Client header banner */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'20px 24px', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:16, marginBottom:16 }}>
          <div style={{ width:60, height:60, borderRadius:14, background:'#3b4f8f', display:'grid', placeItems:'center', fontFamily:'var(--ff-mono)', fontSize:20, fontWeight:700, color:'#fff', flexShrink:0 }}>NF</div>
          <div style={{ flex:1 }}>
            <h1 style={{ fontFamily:'var(--ff-display)', fontSize:22, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Nova Films</h1>
            <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color:'var(--text-3)' }}>CLIENT · PUBLICITÉ · PARIS</div>
          </div>
          <div style={{ display:'flex', gap:16, fontSize:12 }}>
            {[{n:'6',l:'projets'},{n:'4',l:'actifs'},{n:'Jan 2023',l:'client depuis'}].map((m,i) => (
              <div key={i} style={{ textAlign:'center' }}>
                <div style={{ fontFamily:'var(--ff-display)', fontSize:18, fontWeight:700, color:'var(--text)' }}>{m.n}</div>
                <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', marginTop:1 }}>{m.l}</div>
              </div>
            ))}
          </div>
          <div style={{ display:'flex', gap:8, flexShrink:0 }}>
            <BtnSecondary icon="edit-2">Modifier</BtnSecondary>
            <BtnPrimary icon="plus" onClick={() => onNavigate('onboarding')}>Nouveau projet</BtnPrimary>
          </div>
        </div>
        {/* Tabs */}
        <div style={{ display:'flex', gap:2, borderTop:'1px solid var(--border)', paddingTop:0, marginTop:4 }}>
          {TABS.map(tab => {
            const on = tab.id === activeTab;
            return (
              <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                style={{ fontFamily:'var(--ff-text)', fontSize:13, fontWeight:on?600:400, color:on?'var(--text)':'var(--text-3)', padding:'10px 12px', background:'transparent', border:'none', borderBottom:on?'2px solid var(--accent)':'2px solid transparent', cursor:'pointer', transition:'all 0.12s', marginBottom:-1 }}>
                {tab.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'18px 24px' }}>
        {activeTab === 'projets' && (
          <>
            {/* Filters */}
            <div style={{ display:'flex', gap:4, marginBottom:14 }}>
              {PROJ_FILTERS.map(f => {
                const on = f === projFilter;
                return (
                  <button key={f} onClick={() => setProjFilter(f)}
                    style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', padding:'5px 11px', borderRadius:7, background:on?'var(--surface-2)':'transparent', color:on?'var(--text)':'var(--text-3)', border:on?'1px solid var(--border-2)':'1px solid transparent', cursor:'pointer', transition:'all 0.12s' }}>
                    {f}
                  </button>
                );
              })}
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {filteredProjects.map(p => <ProjectListRow key={p.id} project={p} />)}
            </div>
          </>
        )}
        {activeTab !== 'projets' && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, color:'var(--text-3)' }}>
            <SFIcon name="clock" size={28} color="var(--text-3)" />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:11 }}>SECTION EN COURS DE DÉVELOPPEMENT</span>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenFicheClient });
