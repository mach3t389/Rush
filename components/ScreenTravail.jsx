// components/ScreenTravail.jsx — Vue Travail avec liste + kanban
const TASKS_DATA_INIT = {
  preproduction: {
    label: 'Préproduction', progress: 75,
    tasks: [
      { id:'p1', title:'Analyse du brief client et validation des objectifs', assignee:{initials:'SM',bg:'#3b4f8f'}, status:'ok', statusLabel:'Complété', priority:'normal', priorityLabel:'Normale', date:'3 mai', checked:true, subtasks:[] },
      { id:'p2', title:'Écriture du scénario V3', assignee:{initials:'TR',bg:'#5c3d8f'}, status:'info', statusLabel:'En cours', priority:'high', priorityLabel:'Élevée', date:'10 mai', checked:false,
        subtasks:[
          { id:'p2s1', title:'Révision des dialogues — Scènes 3 à 7', assignee:{initials:'TR',bg:'#5c3d8f'}, status:'warn', statusLabel:'En attente', priority:'high', priorityLabel:'Élevée', date:'8 mai', checked:false, subtasks:[] },
        ]
      },
      { id:'p3', title:'Repérage des lieux de tournage', assignee:{initials:'JB',bg:'#1a6b4a'}, status:'ok', statusLabel:'Complété', priority:'normal', priorityLabel:'Normale', date:'5 mai', checked:true, subtasks:[] },
      { id:'p4', title:'Casting acteurs principaux', assignee:{initials:'MD',bg:'#7d4e57'}, status:'warn', statusLabel:'En attente', priority:'high', priorityLabel:'Élevée', date:'15 mai', checked:false, subtasks:[] },
    ]
  },
  production: {
    label: 'Production', progress: 40,
    tasks: [
      { id:'pr1', title:'Tournage jour 1 — Studio principal', assignee:{initials:'SM',bg:'#3b4f8f'}, status:'danger', statusLabel:'En retard', priority:'urgent', priorityLabel:'Urgente', date:'8 mai', checked:false, subtasks:[] },
      { id:'pr2', title:'Tournage jour 2 — Extérieur centre-ville', assignee:{initials:'TR',bg:'#5c3d8f'}, status:'info', statusLabel:'En cours', priority:'high', priorityLabel:'Élevée', date:'12 mai', checked:false, subtasks:[] },
    ]
  },
  postproduction: {
    label: 'Postproduction', progress: 0,
    tasks: [
      { id:'pp1', title:'Assemblage rough cut', assignee:{initials:'JB',bg:'#1a6b4a'}, status:'warn', statusLabel:'En attente', priority:'normal', priorityLabel:'Normale', date:'20 mai', checked:false, subtasks:[] },
      { id:'pp2', title:'Étalonnage colorimétrique', assignee:{initials:'MD',bg:'#7d4e57'}, status:'warn', statusLabel:'En attente', priority:'normal', priorityLabel:'Normale', date:'25 mai', checked:false, subtasks:[] },
      { id:'pp3', title:'Mixage et design sonore', assignee:{initials:'SM',bg:'#3b4f8f'}, status:'warn', statusLabel:'En attente', priority:'high', priorityLabel:'Élevée', date:'28 mai', checked:false, subtasks:[] },
    ]
  },
  livraison: {
    label: 'Livraison', progress: 0,
    tasks: [
      { id:'l1', title:'Export H.264 + ProRes 4K', assignee:{initials:'JB',bg:'#1a6b4a'}, status:'warn', statusLabel:'En attente', priority:'normal', priorityLabel:'Normale', date:'1 juin', checked:false, subtasks:[] },
      { id:'l2', title:'Présentation finale client Nova Films', assignee:{initials:'MD',bg:'#7d4e57'}, status:'warn', statusLabel:'En attente', priority:'high', priorityLabel:'Élevée', date:'5 juin', checked:false, subtasks:[] },
    ]
  }
};

const PRIORITY_STATUS = { urgent:'danger', high:'warn', normal:'neutral' };

function TaskRow({ task, indent, density, onToggle }) {
  const [hov, setHov] = React.useState(false);
  const pl = 14 + (indent || 0);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:10, paddingTop: density.rowPy, paddingBottom: density.rowPy, paddingLeft: pl, paddingRight:14, background: hov ? 'var(--surface-2)':'transparent', borderBottom:'1px solid var(--border)', transition:'background 0.1s', minWidth:0 }}>
      <button
        onClick={() => onToggle(task.id)}
        style={{ width:16, height:16, borderRadius:999, border: task.checked ? 'none' : '1.5px solid var(--border-2)', background: task.checked ? 'var(--accent)' : 'transparent', display:'grid', placeItems:'center', flexShrink:0, cursor:'pointer', padding:0, transition:'all 0.12s ease' }}>
        {task.checked && <SFIcon name="check" size={9} color="var(--on-accent)" />}
      </button>
      <div style={{ flex:1, fontSize: indent ? 12 : 13, fontWeight: indent ? 400 : 400, color: task.checked ? 'var(--text-3)' : 'var(--text)', textDecoration: task.checked ? 'line-through' : 'none', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', lineHeight:1.4 }}>
        {task.title}
      </div>
      <div style={{ width:20, flexShrink:0, display:'flex', justifyContent:'center' }}>
        {hov && <SFIcon name="more-horizontal" size={14} color="var(--text-3)" />}
      </div>
      <div style={{ width:32, flexShrink:0, display:'flex', justifyContent:'center' }}>
        <SFAvatar initials={task.assignee.initials} bg={task.assignee.bg} size={24} />
      </div>
      <div style={{ width:116, flexShrink:0, display:'flex', alignItems:'center' }}>
        <SFPill status={task.status}>{task.statusLabel}</SFPill>
      </div>
      <div style={{ width:86, flexShrink:0, display:'flex', alignItems:'center' }}>
        <SFPill status={PRIORITY_STATUS[task.priority]}>{task.priorityLabel}</SFPill>
      </div>
      <div style={{ width:58, flexShrink:0, textAlign:'right' }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color: task.status === 'danger' ? 'var(--danger)' : 'var(--text-3)', whiteSpace:'nowrap' }}>
          {task.date}
        </span>
      </div>
    </div>
  );
}

function TaskSection({ sectionKey, data, expanded, onToggle, onTaskToggle, density }) {
  const [hdrHov, setHdrHov] = React.useState(false);
  return (
    <div style={{ background:'var(--surface)', borderRadius:14, border:'1px solid var(--border)', overflow:'hidden' }}>
      <button
        onClick={() => onToggle(sectionKey)}
        onMouseEnter={() => setHdrHov(true)}
        onMouseLeave={() => setHdrHov(false)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:10, padding:'10px 14px', background: hdrHov ? 'var(--surface-2)' : 'transparent', border:'none', cursor:'pointer', textAlign:'left', transition:'background 0.1s' }}>
        <SFIcon name={expanded ? 'chevron-down':'chevron-right'} size={14} color="var(--text-3)" />
        <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{data.label}</span>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>({data.tasks.length} tâches)</span>
        <div style={{ flex:1, margin:'0 10px' }}><SFBar pct={data.progress} /></div>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color: data.progress > 0 ? 'var(--accent)' : 'var(--text-3)', minWidth:28, textAlign:'right' }}>{data.progress}%</span>
      </button>
      {expanded && (
        <>
          {data.tasks.map(task => (
            <React.Fragment key={task.id}>
              <TaskRow task={task} density={density} onToggle={onTaskToggle} />
              {(task.subtasks || []).map(sub => (
                <TaskRow key={sub.id} task={sub} indent={28} density={density} onToggle={onTaskToggle} />
              ))}
            </React.Fragment>
          ))}
          <AddTaskRow />
        </>
      )}
    </div>
  );
}

function AddTaskRow() {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 14px', borderTop:'1px solid var(--border)', color: hov ? 'var(--text-2)' : 'var(--text-3)', cursor:'pointer', transition:'all 0.1s', background: hov ? 'var(--surface-2)' : 'transparent' }}>
      <SFIcon name="plus" size={13} color="inherit" />
      <span style={{ fontSize:12, fontFamily:'var(--ff-text)' }}>Ajouter une tâche</span>
    </div>
  );
}

const KANBAN_COLS = [
  { id:'warn',   label:'En attente', statuses:['warn'] },
  { id:'info',   label:'En cours',   statuses:['info'] },
  { id:'ok',     label:'Complété',   statuses:['ok'] },
  { id:'danger', label:'En retard',  statuses:['danger'] },
];

function KanbanView({ tasks }) {
  const allTasks = Object.entries(tasks).flatMap(([, data]) =>
    data.tasks.flatMap(t => [
      { ...t, section: data.label },
      ...(t.subtasks || []).map(s => ({ ...s, section: data.label + ' ›' }))
    ])
  );
  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, padding:'20px 24px', minWidth:0 }}>
      {KANBAN_COLS.map(col => {
        const colTasks = allTasks.filter(t => col.statuses.includes(t.status));
        return (
          <div key={col.id}>
            <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:10 }}>
              <SFPill status={col.id}>{col.label}</SFPill>
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>{colTasks.length}</span>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {colTasks.map(task => (
                <KanbanCard key={task.id} task={task} />
              ))}
              {colTasks.length === 0 && (
                <div style={{ border:'1px dashed var(--border)', borderRadius:10, padding:'14px 12px', color:'var(--text-3)', fontSize:11, textAlign:'center', fontFamily:'var(--ff-mono)' }}>Aucune tâche</div>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function KanbanCard({ task }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: hov ? 'var(--surface-2)' : 'var(--surface)', border: `1px solid ${hov ? 'var(--border-2)' : 'var(--border)'}`, borderRadius:10, padding:'10px 12px', cursor:'default', transition:'all 0.12s ease' }}>
      <div style={{ fontSize:12, fontWeight:500, color:'var(--text)', marginBottom:9, lineHeight:1.45 }}>{task.title}</div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', gap:6 }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', background:'var(--surface-3)', padding:'2px 6px', borderRadius:5, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', maxWidth:120 }}>{task.section}</span>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <SFPill status={PRIORITY_STATUS[task.priority]} small>{task.priorityLabel}</SFPill>
          <SFAvatar initials={task.assignee.initials} bg={task.assignee.bg} size={20} />
        </div>
      </div>
    </div>
  );
}

function ScreenTravail({ density, taskView, activePhase, onPhaseChange, onTabChange }) {
  const [tasks, setTasks] = React.useState(TASKS_DATA_INIT);
  const [expanded, setExpanded] = React.useState({ preproduction:true, production:true, postproduction:false, livraison:false });

  const toggleSection = key => setExpanded(p => ({ ...p, [key]: !p[key] }));

  const toggleTask = taskId => {
    setTasks(prev => {
      const next = JSON.parse(JSON.stringify(prev));
      for (const section of Object.values(next)) {
        for (const task of section.tasks) {
          if (task.id === taskId) { task.checked = !task.checked; return next; }
          const sub = (task.subtasks || []).find(s => s.id === taskId);
          if (sub) { sub.checked = !sub.checked; return next; }
        }
      }
      return next;
    });
  };

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
        activeTab="travail"
        onTabChange={id => id !== 'travail' && onTabChange(id)}>
        <BtnPrimary icon="plus" onClick={() => {}}>Nouvelle tâche</BtnPrimary>
      </Topbar>

      <div style={{ flex:1, overflowY:'auto', background:'var(--bg)' }}>
        {taskView === 'kanban' ? (
          <KanbanView tasks={tasks} />
        ) : (
          <div style={{ padding:'18px 24px', display:'flex', flexDirection:'column', gap:10 }}>
            {Object.entries(tasks).map(([key, data]) => (
              <TaskSection
                key={key}
                sectionKey={key}
                data={data}
                expanded={expanded[key]}
                onToggle={toggleSection}
                onTaskToggle={toggleTask}
                density={density}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

Object.assign(window, { ScreenTravail });
