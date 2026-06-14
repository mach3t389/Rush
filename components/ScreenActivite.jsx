// components/ScreenActivite.jsx — Fil d'activité du projet

const ACTIVITIES = [
  { id:'a1', day:"Aujourd'hui", type:'comment', initials:'SM', bg:'#3b4f8f', author:'Sarah Martin',  action:'a commenté sur',            target:'Rough Cut — V4',              detail:'"L\'intro est un peu longue…"',        time:'Il y a 12 min' },
  { id:'a2', day:"Aujourd'hui", type:'upload',  initials:'TR', bg:'#5c3d8f', author:'Thomas Robert', action:'a uploadé une nouvelle version', target:'Rough Cut — V4',              detail:'V4 · 03:28 · 2.1 Go',                time:'Il y a 2h' },
  { id:'a3', day:"Aujourd'hui", type:'task',    initials:'JB', bg:'#1a6b4a', author:'Julie Bernard', action:'a complété la tâche',           target:'Repérage des lieux de tournage', detail:'Section Préproduction',              time:'Il y a 3h' },
  { id:'a4', day:'Hier',        type:'approve', initials:'MD', bg:'#7d4e57', author:'Marc Dufour',   action:'a approuvé le document',        target:'Brief créatif client',          detail:'Document PDF · Validé',              time:'Hier, 16:42' },
  { id:'a5', day:'Hier',        type:'comment', initials:'SM', bg:'#3b4f8f', author:'Sarah Martin',  action:'a créé une tâche depuis',       target:'Commentaire 00:42',             detail:'→ Couper l\'intro de 3 secondes',    time:'Hier, 14:10' },
  { id:'a6', day:'Hier',        type:'upload',  initials:'TR', bg:'#5c3d8f', author:'Thomas Robert', action:'a modifié',                     target:'Scénario Campagne Été — V3',    detail:'Révision dialogues scènes 3 à 7',    time:'Hier, 11:25' },
  { id:'a7', day:'9 juin',      type:'client',  initials:'ML', bg:'#5c3d8f', author:'Marie Lefebvre (client)', action:'a demandé des corrections sur', target:'Rough Cut — V3', detail:'5 corrections listées',             time:'9 juin, 10:00' },
  { id:'a8', day:'9 juin',      type:'task',    initials:'JB', bg:'#1a6b4a', author:'Julie Bernard', action:'a assigné la tâche',            target:'Tournage jour 1',               detail:'Assigné à Sarah Martin · Urgente',  time:'9 juin, 09:15' },
];

const ACTIVITY_ICON = {
  comment: { name:'message-circle', color:'var(--info)' },
  upload:  { name:'upload-cloud',   color:'var(--accent)' },
  task:    { name:'check-circle',   color:'var(--ok)' },
  approve: { name:'check-circle',   color:'var(--ok)' },
  client:  { name:'users',          color:'var(--review)' },
};

function ActivityItem({ a }) {
  const [hov, setHov] = React.useState(false);
  const ico = ACTIVITY_ICON[a.type] || ACTIVITY_ICON.comment;
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'11px 16px', background: hov ? 'var(--surface-2)' : 'transparent', transition:'background 0.1s' }}>
      <div style={{ position:'relative', flexShrink:0 }}>
        <SFAvatar initials={a.initials} bg={a.bg} size={30} />
        <div style={{ position:'absolute', bottom:-2, right:-2, width:14, height:14, borderRadius:999, background:'var(--surface)', border:'1px solid var(--border-2)', display:'grid', placeItems:'center' }}>
          <SFIcon name={ico.name} size={8} color={ico.color} />
        </div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.55 }}>
          <span style={{ fontWeight:600, color:'var(--text)' }}>{a.author}</span>
          {' '}{a.action}{' '}
          <span style={{ color:'var(--text)', fontWeight:500 }}>{a.target}</span>
        </div>
        <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', marginTop:2 }}>{a.detail}</div>
      </div>
      <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', whiteSpace:'nowrap', flexShrink:0 }}>{a.time}</div>
    </div>
  );
}

function ScreenActivite({ onTabChange }) {
  const days = [...new Set(ACTIVITIES.map(a => a.day))];
  const TABS = [
    { id:'travail',    label:'Liste' },
    { id:'ressources', label:'Ressources' },
    { id:'activite',   label:'Activité' },
  ];
  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      <Topbar breadcrumb={['Clients', 'Nova Films', 'Campagne Été 2025']}
        tabs={TABS} activeTab="activite"
        onTabChange={id => id !== 'activite' && onTabChange && onTabChange(id)}>
        <BtnSecondary icon="filter">Filtrer</BtnSecondary>
      </Topbar>

      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'20px 24px' }}>
        <div style={{ maxWidth:660 }}>
          {days.map(day => {
            const items = ACTIVITIES.filter(a => a.day === day);
            return (
              <div key={day} style={{ marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:10 }}>
                  <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', whiteSpace:'nowrap' }}>{day}</span>
                  <div style={{ flex:1, height:1, background:'var(--border)' }} />
                </div>
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                  {items.map((a, i) => (
                    <div key={a.id} style={{ borderBottom: i < items.length-1 ? '1px solid var(--border)' : 'none' }}>
                      <ActivityItem a={a} />
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenActivite });
