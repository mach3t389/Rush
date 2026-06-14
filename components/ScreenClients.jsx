// components/ScreenClients.jsx — Écran 8 : Liste des clients

const CLIENTS_DATA = [
  { id:'c1', initials:'NF', bg:'#3b4f8f', name:'Nova Films',        sector:'PUBLICITÉ · PARIS',     projects:4, pending:2, since:'2023', progress:72, status:'ok',      statusLabel:'Actif',     lastActivity:'Il y a 2h' },
  { id:'c2', initials:'SB', bg:'#1a6b4a', name:'Studio Bleu',       sector:'DOCUMENTAIRE · MONTRÉAL', projects:2, pending:1, since:'2022', progress:45, status:'ok',      statusLabel:'Actif',     lastActivity:'Il y a 5h' },
  { id:'c3', initials:'FL', bg:'#4a3428', name:'Fondation Lumière',  sector:'SOCIAL · LYON',         projects:1, pending:0, since:'2024', progress:60, status:'warn',    statusLabel:'En pause',   lastActivity:'Il y a 3j' },
  { id:'c4', initials:'ML', bg:'#2d5a7d', name:'Maison Leroux',      sector:'INSTITUTIONNEL · BORDEAUX', projects:1, pending:1, since:'2023', progress:80, status:'ok', statusLabel:'Actif',     lastActivity:'Hier' },
  { id:'c5', initials:'CO', bg:'#7d4e57', name:'Collectif Ondes',    sector:'CLIP MUSICAL · PARIS',  projects:1, pending:0, since:'2024', progress:45, status:'ok',      statusLabel:'Actif',     lastActivity:'Il y a 2j' },
  { id:'c6', initials:'AV', bg:'#3d3d30', name:'Agence Vertigo',     sector:'MOTION DESIGN · PARIS', projects:0, pending:0, since:'2025', progress:0,  status:'neutral', statusLabel:'Inactif',   lastActivity:'Il y a 1 sem.' },
];

const CLIENT_FILTERS = ['Tous', 'Actifs', 'Archivés'];

function ClientCard({ client, onOpen }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ background:hov?'var(--surface-2)':'var(--surface)', border:`1px solid ${hov?'var(--border-2)':'var(--border)'}`, borderRadius:14, padding:'18px', cursor:'default', transition:'all 0.12s', display:'flex', flexDirection:'column', gap:12, position:'relative' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:client.bg, display:'grid', placeItems:'center', fontFamily:'var(--ff-mono)', fontSize:14, fontWeight:700, color:'#fff', flexShrink:0 }}>{client.initials}</div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', marginBottom:2 }}>{client.name}</div>
          <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.1em', color:'var(--text-3)', textTransform:'uppercase' }}>{client.sector}</div>
        </div>
      </div>

      {/* Separator */}
      <div style={{ height:1, background:'var(--border)' }} />

      {/* Metrics */}
      <div style={{ display:'flex', gap:16, fontSize:11, color:'var(--text-2)' }}>
        <span><span style={{ fontWeight:600, color:'var(--text)' }}>{client.projects}</span> projets actifs</span>
        <span><span style={{ fontWeight:600, color:'var(--text)' }}>{client.pending}</span> livrables en attente</span>
        <span style={{ color:'var(--text-3)' }}>Depuis {client.since}</span>
      </div>

      {/* Progress */}
      {client.progress > 0 && <SFBar pct={client.progress} height={3} />}

      {/* Footer */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:8 }}>
        <SFPill status={client.status}>{client.statusLabel}</SFPill>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>Dernière activité {client.lastActivity}</span>
      </div>

      {/* Hover actions */}
      {hov && (
        <div style={{ position:'absolute', bottom:14, right:14, display:'flex', gap:6 }}>
          <button onClick={() => onOpen(client)} style={{ fontFamily:'var(--ff-text)', fontSize:11, color:'var(--text-2)', background:'var(--surface-3)', border:'1px solid var(--border-2)', borderRadius:7, padding:'5px 10px', cursor:'pointer', whiteSpace:'nowrap' }}>
            Voir les projets
          </button>
          <button style={{ fontFamily:'var(--ff-text)', fontSize:11, color:'var(--text-2)', background:'var(--surface-3)', border:'1px solid var(--border-2)', borderRadius:7, padding:'5px 10px', cursor:'pointer' }}>
            Contacter
          </button>
        </div>
      )}
    </div>
  );
}

function ScreenClients({ onNavigate }) {
  const [search, setSearch] = React.useState('');
  const [filter, setFilter] = React.useState('Tous');

  const filtered = CLIENTS_DATA.filter(c => {
    const matchSearch = c.name.toLowerCase().includes(search.toLowerCase());
    const matchFilter = filter === 'Tous' || (filter === 'Actifs' && c.status === 'ok') || (filter === 'Archivés' && c.status === 'neutral');
    return matchSearch && matchFilter;
  });

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      <PageHeader title="Clients" subtitle={`${CLIENTS_DATA.filter(c=>c.status==='ok').length} clients actifs`}>
        <BtnPrimary icon="plus">Nouveau client</BtnPrimary>
      </PageHeader>

      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'18px 24px' }}>
        {/* Search + filters */}
        <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:18 }}>
          <SearchInput placeholder="Rechercher un client…" value={search} onChange={setSearch} />
          <div style={{ display:'flex', gap:4 }}>
            {CLIENT_FILTERS.map(f => {
              const on = f === filter;
              return (
                <button key={f} onClick={() => setFilter(f)}
                  style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', padding:'6px 12px', borderRadius:8, background:on?'var(--surface-3)':'transparent', color:on?'var(--text)':'var(--text-3)', border:on?'1px solid var(--border-2)':'1px solid transparent', cursor:'pointer', transition:'all 0.12s' }}>
                  {f}
                </button>
              );
            })}
          </div>
        </div>

        {/* Grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
          {filtered.map(c => <ClientCard key={c.id} client={c} onOpen={() => onNavigate('fiche-client')} />)}
        </div>

        {filtered.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, color:'var(--text-3)' }}>
            <SFIcon name="users" size={32} color="var(--text-3)" />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:11 }}>AUCUN CLIENT TROUVÉ</span>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenClients });
