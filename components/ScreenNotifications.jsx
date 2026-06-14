// components/ScreenNotifications.jsx — Écran 11 : Notifications

const NOTIFS_DATA = [
  // Today - unread
  { id:'n1', day:"Aujourd'hui", unread:true, initials:'ML', bg:'#5c3d8f', text:'Marie Dupont a approuvé la V4 de', bold:'Rough Cut — Nova Films', time:'Il y a 12 min', type:'APPROBATION', typeStatus:'ok', action:'Voir le livrable →' },
  { id:'n2', day:"Aujourd'hui", unread:true, initials:'TR', bg:'#5c3d8f', text:'Thomas a uploadé une nouvelle version de', bold:'Clip Automne', time:'Il y a 1h', type:'NOUVELLE VERSION', typeStatus:'info', action:'Voir la version →' },
  { id:'n3', day:"Aujourd'hui", unread:true, initials:'NF', bg:'#3b4f8f', text:'Le client Nova Films a laissé 2 commentaires sur', bold:'V4 Rough Cut', time:'Il y a 2h', type:'COMMENTAIRE', typeStatus:'review', action:'Voir les commentaires →' },
  // Yesterday - read
  { id:'n4', day:'Hier', unread:false, initials:'LM', bg:'#5c3d8f', text:"Léa t'a assigné la tâche", bold:'Révision scénario V3', time:'Hier, 16:42', type:'TÂCHE', typeStatus:'info', action:null },
  { id:'n5', day:'Hier', unread:false, initials:'MD', bg:'#7d4e57', text:'Budget Maison Leroux approuvé par', bold:'Marc Dufour', time:'Hier, 15:00', type:'APPROBATION', typeStatus:'ok', action:null },
  { id:'n6', day:'Hier', unread:false, initials:'TR', bg:'#5c3d8f', text:'Nouvelle version uploadée par Thomas sur', bold:'Les Bâtisseurs', time:'Hier, 11:25', type:'NOUVELLE VERSION', typeStatus:'info', action:null },
  { id:'n7', day:'Hier', unread:false, initials:'SB', bg:'#1a6b4a', text:'Le client Studio Bleu a demandé des corrections sur', bold:'Rough Cut V3', time:'Hier, 09:00', type:'CORRECTIONS', typeStatus:'danger', action:null },
  // This week - read
  { id:'n8', day:'Cette semaine', unread:false, initials:'SB', bg:'#1a6b4a', text:'Studio Bleu a accepté le devis pour', bold:'Les Bâtisseurs', time:'8 juin', type:'CONTRAT', typeStatus:'ok', action:null },
  { id:'n9', day:'Cette semaine', unread:false, initials:'CO', bg:'#7d4e57', text:'Collectif Ondes — contrat signé pour', bold:'Clip Horizon', time:'7 juin', type:'CONTRAT', typeStatus:'ok', action:null },
];

const NOTIF_FILTERS = ['Toutes', 'Non lues', 'Mentions', 'Approbations', 'Commentaires'];

function NotifRow({ notif }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'flex-start', gap:12, padding:'12px 16px', background: notif.unread ? 'var(--surface-2)' : hov ? 'var(--surface-2)' : 'transparent', borderLeft: notif.unread ? '2px solid var(--accent)' : '2px solid transparent', transition:'all 0.1s', borderBottom:'1px solid var(--border)' }}>
      {/* Unread dot */}
      <div style={{ width:7, height:7, borderRadius:999, background: notif.unread ? 'var(--info)' : 'transparent', marginTop:8, flexShrink:0 }} />
      <SFAvatar initials={notif.initials} bg={notif.bg} size={30} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ fontSize:12, color: notif.unread ? 'var(--text)' : 'var(--text-2)', lineHeight:1.55, marginBottom:5 }}>
          {notif.text} <span style={{ fontWeight:600, color: notif.unread ? 'var(--text)' : 'inherit' }}>{notif.bold}</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap' }}>
          <SFPill status={notif.typeStatus} small>{notif.type}</SFPill>
          {notif.action && hov && (
            <button style={{ fontFamily:'var(--ff-text)', fontSize:11, color:'var(--accent)', background:'transparent', border:'none', cursor:'pointer', padding:0 }}>
              {notif.action}
            </button>
          )}
        </div>
      </div>
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', whiteSpace:'nowrap', flexShrink:0, marginTop:2 }}>{notif.time}</span>
    </div>
  );
}

function ScreenNotifications() {
  const [filter, setFilter] = React.useState('Non lues');

  const unreadCount = NOTIFS_DATA.filter(n => n.unread).length;

  const filterCounts = {
    'Toutes': NOTIFS_DATA.length,
    'Non lues': unreadCount,
    'Mentions': 1,
    'Approbations': NOTIFS_DATA.filter(n=>n.typeStatus==='ok').length,
    'Commentaires': NOTIFS_DATA.filter(n=>n.type==='COMMENTAIRE').length,
  };

  const filtered = NOTIFS_DATA.filter(n => {
    if (filter === 'Non lues')     return n.unread;
    if (filter === 'Approbations') return n.typeStatus === 'ok';
    if (filter === 'Commentaires') return n.type === 'COMMENTAIRE';
    return true;
  });

  const days = [...new Set(filtered.map(n => n.day))];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'16px 24px', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
        <div>
          <h1 style={{ fontFamily:'var(--ff-display)', fontSize:22, fontWeight:700, color:'var(--text)', letterSpacing:'-0.01em', marginBottom:3 }}>Notifications</h1>
          {unreadCount > 0 && <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>{unreadCount} NON LUES</span>}
        </div>
        <BtnSecondary>Tout marquer comme lu</BtnSecondary>
      </div>

      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'18px 24px' }}>
        {/* Filters */}
        <div style={{ display:'flex', gap:4, marginBottom:18, flexWrap:'wrap' }}>
          {NOTIF_FILTERS.map(f => {
            const on = f === filter;
            const count = filterCounts[f];
            return (
              <button key={f} onClick={() => setFilter(f)}
                style={{ display:'flex', alignItems:'center', gap:5, fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', padding:'5px 12px', borderRadius:999, background:on?'var(--surface-2)':'transparent', color:on?'var(--text)':'var(--text-3)', border:on?'1px solid var(--border-2)':'1px solid transparent', cursor:'pointer', transition:'all 0.12s' }}>
                {f}
                {count !== undefined && <span style={{ background:on?'var(--surface-3)':'var(--surface-2)', padding:'0px 5px', borderRadius:999 }}>{count}</span>}
              </button>
            );
          })}
        </div>

        {/* Grouped list */}
        <div style={{ maxWidth:720 }}>
          {days.map(day => {
            const dayNotifs = filtered.filter(n => n.day === day);
            return (
              <div key={day} style={{ marginBottom:20 }}>
                <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:8 }}>
                  <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', whiteSpace:'nowrap' }}>{day}</span>
                  <div style={{ flex:1, height:1, background:'var(--border)' }} />
                </div>
                <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
                  {dayNotifs.map(n => <NotifRow key={n.id} notif={n} />)}
                </div>
              </div>
            );
          })}
          {filtered.length === 0 && (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, color:'var(--text-3)' }}>
              <SFIcon name="check-circle" size={32} color="var(--ok)" />
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:11 }}>TOUT EST À JOUR</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenNotifications });
