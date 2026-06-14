// components/ScreenRessources.jsx — Vue Ressources
const RESSOURCES = [
  {
    id: 'r1', type: 'script', eyebrow: 'SCRIPT',
    title: 'Scénario Campagne Été — V3',
    status: 'ok', statusLabel: 'Approuvé',
    meta: 'Modifié il y a 2h', version: 'V3',
  },
  {
    id: 'r2', type: 'video', eyebrow: 'VIDÉO',
    title: 'Rough Cut — Séquence 1',
    status: 'review', statusLabel: 'En révision',
    meta: '3 commentaires', version: 'V4',
    avatars: [
      {initials:'SM', bg:'#3b4f8f'},
      {initials:'TR', bg:'#5c3d8f'},
      {initials:'JB', bg:'#1a6b4a'},
    ],
  },
  {
    id: 'r3', type: 'moodboard', eyebrow: 'MOODBOARD',
    title: 'Direction artistique',
    status: 'info', statusLabel: 'En cours',
    meta: '14 références', version: null,
    colors: ['#2d3a4a','#4a3428','#2a3d30','#3d3042'],
  },
  {
    id: 'r4', type: 'document', eyebrow: 'DOCUMENT',
    title: 'Brief créatif client',
    status: 'ok', statusLabel: 'Validé',
    meta: 'PDF · 2.4 Mo', version: null,
  },
  {
    id: 'r5', type: 'checklist', eyebrow: 'CHECKLIST',
    title: 'Checklist tournage J1',
    status: 'info', statusLabel: 'En cours',
    meta: '6/10 complétés', version: null,
    progress: 60,
  },
  {
    id: 'r6', type: 'inspirations', eyebrow: 'INSPIRATIONS',
    title: 'Références visuelles',
    status: 'neutral', statusLabel: '8 références',
    meta: '8 références', version: null,
    colors: ['#1e2d3d','#3d2a1e','#1e3d2d','#3d3d1e','#2d1e3d','#2a2a2a'],
    avatar: {initials:'JT', bg:'#2d3748'},
  },
];

const FILTERS = ['Tous', 'Script', 'Document', 'Vidéo', 'Moodboard', 'Inspirations'];
const TYPE_MAP = { Script:'script', Document:'document', Vidéo:'video', Moodboard:'moodboard', Inspirations:'inspirations' };

function VideoThumb({ version }) {
  return (
    <div style={{ height:110, borderRadius:'10px 10px 0 0', background:'repeating-linear-gradient(135deg, rgba(255,255,255,0.045) 0 2px, transparent 2px 11px), var(--surface-2)', display:'grid', placeItems:'center', overflow:'hidden', position:'relative', flexShrink:0 }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:8 }}>
        <div style={{ width:36, height:36, borderRadius:999, background:'rgba(249,255,0,0.12)', border:'1px solid rgba(249,255,0,0.3)', display:'grid', placeItems:'center' }}>
          <SFIcon name="play" size={16} color="var(--accent)" />
        </div>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', letterSpacing:'0.08em', textTransform:'uppercase' }}>{version}</span>
      </div>
    </div>
  );
}

function ScriptThumb() {
  return (
    <div style={{ height:80, borderRadius:'10px 10px 0 0', background:'var(--surface-2)', display:'flex', alignItems:'center', justifyContent:'center', gap:12, flexShrink:0 }}>
      <SFIcon name="file-text" size={28} color="var(--text-3)" />
      <div>
        {[80, 60, 75, 50].map((w, i) => (
          <div key={i} style={{ height:3, width:w, background:'var(--border-2)', borderRadius:2, marginBottom:5 }} />
        ))}
      </div>
    </div>
  );
}

function ImageGrid({ colors, cols = 2 }) {
  return (
    <div style={{ display:'grid', gridTemplateColumns:`repeat(${cols},1fr)`, gap:3, padding:3, height: cols === 2 ? 90 : 80, borderRadius:'10px 10px 0 0', background:'var(--surface-2)', overflow:'hidden', flexShrink:0 }}>
      {colors.map((c, i) => (
        <div key={i} style={{ background:c, borderRadius:4 }} />
      ))}
    </div>
  );
}

function DocThumb() {
  return (
    <div style={{ height:80, borderRadius:'10px 10px 0 0', background:'var(--surface-2)', display:'grid', placeItems:'center', flexShrink:0 }}>
      <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
        <SFIcon name="file-text" size={26} color="var(--text-3)" />
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', letterSpacing:'0.1em', textTransform:'uppercase' }}>PDF</span>
      </div>
    </div>
  );
}

function ChecklistThumb({ progress }) {
  return (
    <div style={{ padding:'14px 16px 10px', background:'var(--surface-2)', borderRadius:'10px 10px 0 0', flexShrink:0 }}>
      <div style={{ marginBottom:10 }}>
        <SFBar pct={progress} height={5} />
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
        {[{done:true,w:70},{done:true,w:90},{done:false,w:55},{done:false,w:80}].map((item, i) => (
          <div key={i} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{ width:12, height:12, borderRadius:3, background: item.done ? 'var(--accent)' : 'transparent', border: item.done ? 'none' : '1px solid var(--border-2)', flexShrink:0, display:'grid', placeItems:'center' }}>
              {item.done && <SFIcon name="check" size={8} color="var(--on-accent)" />}
            </div>
            <div style={{ height:3, width:`${item.w}%`, background: item.done ? 'var(--border-2)' : 'var(--border)', borderRadius:2 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

function ResourceCard({ res, onClick }) {
  const [hov, setHov] = React.useState(false);

  const thumb = () => {
    if (res.type === 'video')        return <VideoThumb version={res.version} />;
    if (res.type === 'script')       return <ScriptThumb />;
    if (res.type === 'moodboard')    return <ImageGrid colors={res.colors} cols={2} />;
    if (res.type === 'document')     return <DocThumb />;
    if (res.type === 'checklist')    return <ChecklistThumb progress={res.progress} />;
    if (res.type === 'inspirations') return <ImageGrid colors={res.colors} cols={3} />;
    return null;
  };

  return (
    <div
      onClick={onClick}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'var(--surface-2)' : 'var(--surface)', border:`1px solid ${hov ? 'var(--border-2)' : 'var(--border)'}`, borderRadius:14, overflow:'hidden', display:'flex', flexDirection:'column', cursor: onClick ? 'pointer' : 'default', transition:'border-color 0.12s, background 0.12s' }}>
      {thumb()}
      <div style={{ padding:'12px 14px', display:'flex', flexDirection:'column', gap:6, flex:1 }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)' }}>
          {res.eyebrow}{res.version ? ` · ${res.version}` : ''}
        </span>
        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', lineHeight:1.35 }}>{res.title}</div>
        <div style={{ height:1, background:'var(--border)', marginTop:2 }} />
        <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:2 }}>
          <SFPill status={res.status}>{res.statusLabel}</SFPill>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{res.meta}</span>
          {res.avatars && (
            <div style={{ display:'flex', gap:-4 }}>
              {res.avatars.map((a,i) => (
                <div key={i} style={{ marginLeft: i > 0 ? -8 : 0, zIndex: res.avatars.length - i }}>
                  <SFAvatar initials={a.initials} bg={a.bg} size={20} />
                </div>
              ))}
            </div>
          )}
          {res.avatar && <SFAvatar initials={res.avatar.initials} bg={res.avatar.bg} size={20} />}
          {res.type === 'script' && <SFIcon name="download" size={14} color="var(--text-3)" />}
        </div>
      </div>
    </div>
  );
}

function ScreenRessources({ density, onTabChange, onNavigateVideoReview }) {
  const [activeFilter, setActiveFilter] = React.useState('Tous');
  const [showNew, setShowNew] = React.useState(false);

  const filtered = RESSOURCES.filter(r => {
    if (activeFilter === 'Tous') return true;
    return r.type === TYPE_MAP[activeFilter];
  });

  const TABS = [
    { id:'travail',    label:'Liste' },
    { id:'ressources', label:'Ressources' },
    { id:'activite',   label:'Activité' },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      <Topbar
        breadcrumb={['Clients', 'Nova Films', 'Campagne Été 2025']}
        tabs={TABS}
        activeTab="ressources"
        onTabChange={id => id !== 'ressources' && onTabChange(id)}>
        <BtnPrimary icon="plus" onClick={() => setShowNew(true)}>Nouvelle ressource</BtnPrimary>
      </Topbar>

      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'18px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:4, marginBottom:18, flexWrap:'wrap' }}>
          {FILTERS.map(f => {
            const isActive = f === activeFilter;
            return (
              <button key={f} onClick={() => setActiveFilter(f)}
                style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.1em', textTransform:'uppercase', padding:'5px 11px', borderRadius:7, background: isActive ? 'var(--surface-2)' : 'transparent', color: isActive ? 'var(--text)' : 'var(--text-3)', border: isActive ? '1px solid var(--border-2)' : '1px solid transparent', cursor:'pointer', transition:'all 0.12s', whiteSpace:'nowrap' }}>
                {f}
              </button>
            );
          })}
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(270px, 1fr))', gap:14 }}>
          {filtered.map(res => <ResourceCard key={res.id} res={res} onClick={res.type === 'video' ? onNavigateVideoReview : undefined} />)}
        </div>

        {filtered.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, color:'var(--text-3)' }}>
            <SFIcon name="folder-open" size={32} color="var(--text-3)" />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:11, letterSpacing:'0.1em' }}>AUCUNE RESSOURCE</span>
          </div>
        )}
      </div>

      {showNew && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:12, padding:'12px 20px', display:'flex', alignItems:'center', gap:12, boxShadow:'0 8px 32px rgba(0,0,0,0.5)', zIndex:100 }}>
          <SFIcon name="check-circle" size={16} color="var(--ok)" />
          <span style={{ fontSize:13 }}>Nouvelle ressource créée</span>
          <button onClick={() => setShowNew(false)} style={{ background:'transparent', border:'none', color:'var(--text-3)', cursor:'pointer', padding:0, display:'flex' }}>
            <SFIcon name="x" size={14} color="var(--text-3)" />
          </button>
        </div>
      )}
    </div>
  );
}

Object.assign(window, { ScreenRessources });
