// components/ScreenTaches.jsx — Vue "Mes tâches"
const MY_TASKS = [
  // Urgente
  { id:'u1', title:'Révision finale scénario V3 — Dialogues principaux', project:'Nova Films', projectColor:'#3b4f8f', status:'danger', statusLabel:'En retard', date:'Hier', dateRed:true, priority:'urgente' },
  { id:'u2', title:'Validation maquettes graphiques motion design', project:'Studio Lumière', projectColor:'#5c3d8f', status:'info', statusLabel:'En cours', date:"Aujourd'hui", dateRed:false, priority:'urgente' },
  // Élevée
  { id:'h1', title:'Préparation liste équipement tournage jour 1', project:'Nova Films', projectColor:'#3b4f8f', status:'warn', statusLabel:'En attente', date:'Demain', dateRed:false, priority:'haute' },
  { id:'h2', title:'Brief créatif documentaire "Les Bâtisseurs"', project:'Studio Lumière', projectColor:'#5c3d8f', status:'info', statusLabel:'En cours', date:'12 juin', dateRed:false, priority:'haute' },
  { id:'h3', title:'Appel de confirmation client avant tournage', project:'Maison Leroux', projectColor:'#1a6b4a', status:'warn', statusLabel:'En attente', date:'13 juin', dateRed:false, priority:'haute' },
  { id:'h4', title:'Envoi devis production clip musical', project:'Collectif Ondes', projectColor:'#7d4e57', status:'info', statusLabel:'En cours', date:'14 juin', dateRed:false, priority:'haute' },
  // Normale
  { id:'n1', title:'Archiver les projets terminés Q1 2025', project:'Studio interne', projectColor:'#404040', status:'ok', statusLabel:'Complété', date:'8 juin', dateRed:false, priority:'normale' },
  { id:'n2', title:'Mettre à jour la grille tarifaire 2025', project:'Studio interne', projectColor:'#404040', status:'warn', statusLabel:'En attente', date:'20 juin', dateRed:false, priority:'normale' },
  { id:'n3', title:'Vérifier licences musicales clip Collectif Ondes', project:'Collectif Ondes', projectColor:'#7d4e57', status:'warn', statusLabel:'En attente', date:'18 juin', dateRed:false, priority:'normale' },
  { id:'n4', title:'Commander batteries Li-Ion pour le tournage J2', project:'Nova Films', projectColor:'#3b4f8f', status:'warn', statusLabel:'En attente', date:'16 juin', dateRed:false, priority:'normale' },
  { id:'n5', title:'Planifier la réunion de post-production', project:'Studio Lumière', projectColor:'#5c3d8f', status:'warn', statusLabel:'En attente', date:'22 juin', dateRed:false, priority:'normale' },
  { id:'n6', title:'Rédiger le rapport de fin de projet Maison Leroux', project:'Maison Leroux', projectColor:'#1a6b4a', status:'warn', statusLabel:'En attente', date:'25 juin', dateRed:false, priority:'normale' },
];

const PRIORITY_GROUPS = [
  { id:'urgente', label:'Urgente', color:'var(--danger)', status:'danger', filter: t => t.priority === 'urgente' },
  { id:'haute',   label:'Élevée',  color:'var(--warn)',   status:'warn',   filter: t => t.priority === 'haute' },
  { id:'normale', label:'Normale', color:'var(--text-3)', status:'neutral',filter: t => t.priority === 'normale' },
];

const TIME_FILTERS = [
  { id:'today',  label:"Aujourd'hui" },
  { id:'week',   label:'Cette semaine' },
  { id:'late',   label:'En retard' },
  { id:'all',    label:'Tout' },
];

function applyFilter(tasks, filter) {
  if (filter === 'today')  return tasks.filter(t => t.date === "Aujourd'hui" || t.date === 'Hier');
  if (filter === 'week')   return tasks.filter(t => !['20 juin','22 juin','25 juin','18 juin'].includes(t.date));
  if (filter === 'late')   return tasks.filter(t => t.status === 'danger' || t.date === 'Hier');
  return tasks;
}

// ─── TASK ROW ─────────────────────────────────────────────────────────────
function TacheRow({ task, checked, onToggle, density }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:10, paddingTop: density.rowPy, paddingBottom: density.rowPy, paddingLeft:14, paddingRight:14, background: hov ? 'var(--surface-2)' : 'transparent', borderBottom:'1px solid var(--border)', transition:'background 0.1s', minWidth:0 }}>
      {/* Checkbox */}
      <button onClick={() => onToggle(task.id)}
        style={{ width:16, height:16, borderRadius:999, border: checked ? 'none' : '1.5px solid var(--border-2)', background: checked ? 'var(--accent)' : 'transparent', display:'grid', placeItems:'center', flexShrink:0, cursor:'pointer', padding:0, transition:'all 0.12s' }}>
        {checked && <SFIcon name="check" size={9} color="var(--on-accent)" />}
      </button>
      {/* Title */}
      <div style={{ flex:1, fontSize:13, color: checked ? 'var(--text-3)' : 'var(--text)', textDecoration: checked ? 'line-through' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
        {task.title}
      </div>
      {/* Project badge */}
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.06em', padding:'2px 8px', borderRadius:6, background:'var(--surface-3)', color:'var(--text-2)', whiteSpace:'nowrap', flexShrink:0, borderLeft:`2px solid ${task.projectColor}` }}>
        {task.project}
      </span>
      <SFPill status={task.status}>{task.statusLabel}</SFPill>
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color: task.dateRed ? 'var(--danger)' : 'var(--text-3)', minWidth:62, textAlign:'right', whiteSpace:'nowrap' }}>
        {task.date}
      </span>
    </div>
  );
}

// ─── PRIORITY GROUP ────────────────────────────────────────────────────────
function PriorityGroup({ group, tasks, checkedIds, onToggle, density, defaultExpanded = true }) {
  const [open, setOpen] = React.useState(defaultExpanded);
  const [showAll, setShowAll] = React.useState(false);
  const MAX_VISIBLE = 3;
  const filtered = tasks.filter(group.filter);
  const visible = showAll ? filtered : filtered.slice(0, MAX_VISIBLE);
  const hidden = filtered.length - MAX_VISIBLE;

  if (filtered.length === 0) return null;

  return (
    <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, overflow:'hidden' }}>
      {/* Group header */}
      <button
        onClick={() => setOpen(p => !p)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:9, padding:'10px 14px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left', transition:'background 0.1s' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
        <div style={{ width:8, height:8, borderRadius:2, background: group.color, flexShrink:0 }} />
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color: group.color, fontWeight:600 }}>{group.label}</span>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>({filtered.length})</span>
        <div style={{ flex:1 }} />
        <SFIcon name={open ? 'chevron-down' : 'chevron-right'} size={13} color="var(--text-3)" />
      </button>

      {open && (
        <>
          {visible.map(task => (
            <TacheRow key={task.id} task={task} checked={checkedIds.includes(task.id)} onToggle={onToggle} density={density} />
          ))}
          {!showAll && hidden > 0 && (
            <button
              onClick={() => setShowAll(true)}
              style={{ width:'100%', padding:'7px 14px', background:'transparent', border:'none', borderTop:'1px solid var(--border)', color:'var(--text-3)', fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', cursor:'pointer', textAlign:'left', transition:'all 0.1s' }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'var(--text-3)'; }}>
              Voir {hidden} de plus ›
            </button>
          )}
        </>
      )}
    </div>
  );
}

// ─── SCREEN TACHES ────────────────────────────────────────────────────────
function ScreenTaches({ density }) {
  const [filter, setFilter] = React.useState('week');
  const [checked, setChecked] = React.useState([]);

  const toggleCheck = id => setChecked(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  const filteredTasks = applyFilter(MY_TASKS, filter);

  const total = MY_TASKS.length;
  const late = MY_TASKS.filter(t => t.status === 'danger' || t.date === 'Hier').length;

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      {/* Header area */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'16px 24px 0', flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'flex-start', justifyContent:'space-between', marginBottom:14 }}>
          <div>
            <h1 style={{ fontFamily:'var(--ff-display)', fontSize:22, fontWeight:700, color:'var(--text)', letterSpacing:'-0.01em', marginBottom:4 }}>
              Mes tâches
            </h1>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>
              {total} TÂCHES ASSIGNÉES · <span style={{ color:'var(--danger)' }}>{late} EN RETARD</span>
            </span>
          </div>
          <BtnPrimary icon="plus" onClick={() => {}}>Nouvelle tâche</BtnPrimary>
        </div>
        {/* Time filters */}
        <div style={{ display:'flex', gap:0 }}>
          {TIME_FILTERS.map(f => {
            const isActive = f.id === filter;
            return (
              <button key={f.id} onClick={() => setFilter(f.id)}
                style={{ fontFamily:'var(--ff-text)', fontSize:13, fontWeight: isActive ? 600 : 400, color: isActive ? 'var(--text)' : 'var(--text-3)', padding:'0 12px', paddingBottom:10, background:'transparent', border:'none', borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent', cursor:'pointer', transition:'all 0.12s', whiteSpace:'nowrap' }}>
                {f.label}
              </button>
            );
          })}
        </div>
      </div>

      {/* Task list */}
      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'18px 24px', display:'flex', flexDirection:'column', gap:10 }}>
        {PRIORITY_GROUPS.map((group, i) => (
          <PriorityGroup
            key={group.id}
            group={group}
            tasks={filteredTasks}
            checkedIds={checked}
            onToggle={toggleCheck}
            density={density}
            defaultExpanded={i < 2}
          />
        ))}
        {filteredTasks.length === 0 && (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, color:'var(--text-3)' }}>
            <SFIcon name="check-circle" size={32} color="var(--ok)" />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:11, letterSpacing:'0.1em' }}>TOUT EST À JOUR</span>
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenTaches });
