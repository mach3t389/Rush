// components/ScreenVideoReview.jsx — Module de révision vidéo

const TOTAL_SECS = 208; // 3:28

const VR_COMMENTS = [
  { id:'c1', author:'Sarah Martin',  initials:'SM', bg:'#3b4f8f', time:42,  label:'00:42', text:"L'intro est un peu longue — peut-on couper les 3 premières secondes ?", resolved:false },
  { id:'c2', author:'Thomas Robert', initials:'TR', bg:'#5c3d8f', time:75,  label:'01:15', text:'Transition au plan 8 est parfaite. Je valide ce segment.', resolved:false },
  { id:'c3', author:'Marc Dufour',   initials:'MD', bg:'#7d4e57', time:128, label:'02:08', text:'Son trop fort sur le plan extérieur rue Saint-Denis.', resolved:true },
  { id:'c4', author:'Julie Bernard', initials:'JB', bg:'#1a6b4a', time:28,  label:'00:28', text:"La colorimétrie des plans intérieurs est exactement ce qu'on cherchait.", resolved:false },
  { id:'c5', author:'Sarah Martin',  initials:'SM', bg:'#3b4f8f', time:114, label:'01:54', text:'Besoin d\'une musique plus dynamique pour le final — trop mou.', resolved:false },
  { id:'c6', author:'Thomas Robert', initials:'TR', bg:'#5c3d8f', time:165, label:'02:45', text:'La voix off est claire, la prise est bonne.', resolved:false },
  { id:'c7', author:'Marc Dufour',   initials:'MD', bg:'#7d4e57', time:190, label:'03:10', text:'Fin un peu abrupte, on peut ajouter un fondu au noir ?', resolved:true },
  { id:'c8', author:'Julie Bernard', initials:'JB', bg:'#1a6b4a', time:55,  label:'00:55', text:'Super travail sur les raccords de mouvement.', resolved:false },
];

const VR_CORRECTIONS = [
  { id:'cr1', num:'#1', label:"Couper l'intro de 3 secondes", status:'info', statusLabel:'En cours' },
  { id:'cr2', num:'#2', label:'Réduire niveau sonore plan extérieur', status:'ok',   statusLabel:'Intégré' },
  { id:'cr3', num:'#3', label:'Ajouter fondu au noir sur plan final', status:'warn', statusLabel:'À faire' },
  { id:'cr4', num:'#4', label:'Révision colorimétrie plans de nuit',  status:'warn', statusLabel:'À faire' },
  { id:'cr5', num:'#5', label:'Ajuster tempo de la musique finale',   status:'info', statusLabel:'En cours' },
];

const VR_APPROVERS = [
  { initials:'SM', bg:'#3b4f8f', name:'Sarah Martin',  role:'Dir. créative',  status:'warn', statusLabel:'En attente' },
  { initials:'JB', bg:'#1a6b4a', name:'Julie Bernard', role:'Chef de projet', status:'ok',   statusLabel:'Approuvé' },
  { initials:'MD', bg:'#7d4e57', name:'Marc Dufour',   role:'Producteur',     status:'warn', statusLabel:'En attente' },
];

const VERSIONS = [
  { v:'V1', status:'ok',     label:'Approuvé' },
  { v:'V2', status:'ok',     label:'Approuvé' },
  { v:'V3', status:'danger', label:'Corrections' },
  { v:'V4', status:'review', label:'En révision', active:true },
];

function fmt(s) {
  return `${String(Math.floor(s/60)).padStart(2,'0')}:${String(s%60).padStart(2,'0')}`;
}

// ─── TIMELINE ─────────────────────────────────────────────────────────────
function Timeline({ currentTime, isPlaying, onSeek }) {
  const markers = VR_COMMENTS.filter(c => !c.resolved);
  const pct = (currentTime / TOTAL_SECS) * 100;
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:8, flexShrink:0 }}>
      {/* Scrub bar */}
      <div style={{ position:'relative', height:22, display:'flex', alignItems:'center', cursor:'pointer', padding:'0 2px' }}
        onClick={e => {
          const r = e.currentTarget.getBoundingClientRect();
          onSeek(Math.round(((e.clientX - r.left) / r.width) * TOTAL_SECS));
        }}>
        <div style={{ height:4, width:'100%', background:'var(--surface-3)', borderRadius:999, position:'relative' }}>
          <div style={{ height:'100%', width:`${pct}%`, background:'var(--accent)', borderRadius:999, transition: isPlaying ? 'none':'width 0.1s' }} />
          {markers.map(c => (
            <div key={c.id} title={`${c.label} — ${c.author}`}
              style={{ position:'absolute', top:-4, left:`${(c.time/TOTAL_SECS)*100}%`, transform:'translateX(-50%)', width:0, height:0, borderLeft:'4px solid transparent', borderRight:'4px solid transparent', borderBottom:'7px solid var(--accent)', opacity:0.75, cursor:'pointer' }} />
          ))}
          <div style={{ position:'absolute', top:'50%', left:`${pct}%`, transform:'translate(-50%,-50%)', width:12, height:12, borderRadius:999, background:'var(--accent)', boxShadow:'0 0 0 3px rgba(249,255,0,0.2)', pointerEvents:'none', transition: isPlaying ? 'none':'left 0.1s' }} />
        </div>
      </div>
      {/* Controls row */}
      <div style={{ display:'flex', alignItems:'center', gap:12 }}>
        <button onClick={() => {}} style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-3)', display:'flex' }}>
          <SFIcon name="skip-back" size={15} color="var(--text-3)" />
        </button>
        <button onClick={() => {}}
          style={{ width:32, height:32, borderRadius:999, background:'var(--accent)', border:'none', cursor:'pointer', display:'grid', placeItems:'center', flexShrink:0 }}>
          <SFIcon name="play" size={14} color="var(--on-accent)" />
        </button>
        <button onClick={() => {}} style={{ background:'transparent', border:'none', cursor:'pointer', display:'flex' }}>
          <SFIcon name="skip-forward" size={15} color="var(--text-3)" />
        </button>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:11, color:'var(--text-2)' }}>
          {fmt(currentTime)} <span style={{ color:'var(--text-3)' }}>/ {fmt(TOTAL_SECS)}</span>
        </span>
        <div style={{ flex:1 }} />
        <SFIcon name="volume-2" size={15} color="var(--text-3)" />
        <SFIcon name="maximize-2" size={15} color="var(--text-3)" />
      </div>
    </div>
  );
}

// ─── COMMENT ROW ──────────────────────────────────────────────────────────
function CommentRow({ c, onSeek }) {
  const [hov, setHov] = React.useState(false);
  return (
    <div onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ display:'flex', gap:10, padding:'10px 0', borderBottom:'1px solid var(--border)', opacity: c.resolved ? 0.45 : 1, transition:'opacity 0.1s' }}>
      <SFAvatar initials={c.initials} bg={c.bg} size={28} />
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
          <span style={{ fontSize:12, fontWeight:600, color:'var(--text)' }}>{c.author}</span>
          <button onClick={() => onSeek(c.time)}
            style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--accent)', background:'transparent', border:'none', cursor:'pointer', padding:0 }}>
            {c.label}
          </button>
          {c.resolved && <SFIcon name="check-circle" size={13} color="var(--ok)" />}
        </div>
        <p style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.55, marginBottom: hov && !c.resolved ? 6 : 0 }}>{c.text}</p>
        {hov && !c.resolved && (
          <button style={{ fontFamily:'var(--ff-text)', fontSize:11, color:'var(--text-3)', background:'transparent', border:'1px solid var(--border)', borderRadius:6, padding:'3px 9px', cursor:'pointer', transition:'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.borderColor='var(--border-2)'; e.currentTarget.style.color='var(--text-2)'; }}
            onMouseLeave={e => { e.currentTarget.style.borderColor='var(--border)'; e.currentTarget.style.color='var(--text-3)'; }}>
            ↗ Créer une tâche
          </button>
        )}
      </div>
    </div>
  );
}

// ─── SCREEN VIDEO REVIEW ──────────────────────────────────────────────────
function ScreenVideoReview({ onTabChange, onNavigatePortail }) {
  const [currentTime, setCurrentTime] = React.useState(42);
  const [activeTab, setActiveTab] = React.useState('comments');
  const [newComment, setNewComment] = React.useState('');

  const TABS = [
    { id:'travail',    label:'Liste' },
    { id:'ressources', label:'Ressources' },
    { id:'activite',   label:'Activité' },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      <Topbar breadcrumb={['Nova Films', 'Campagne Été 2025', 'Rough Cut — V4']}
        tabs={TABS} activeTab="ressources"
        onTabChange={id => id !== 'ressources' && onTabChange && onTabChange(id)}>
        <BtnSecondary icon="arrow-left" onClick={() => onTabChange && onTabChange('ressources')}>Ressources</BtnSecondary>
      </Topbar>

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* ── Left col: player + comments ── */}
        <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>

          {/* Player area */}
          <div style={{ flex:'0 0 55%', display:'flex', flexDirection:'column', padding:'16px 20px', gap:12, background:'var(--bg)', overflow:'hidden', minHeight:0 }}>
            {/* Video placeholder */}
            <div style={{ flex:1, position:'relative', borderRadius:12, overflow:'hidden', background:'repeating-linear-gradient(135deg,rgba(255,255,255,0.04) 0 2px,transparent 2px 11px),var(--surface-2)', border:'1px solid var(--border)', display:'grid', placeItems:'center', minHeight:0 }}>
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:10, userSelect:'none' }}>
                <div style={{ width:52, height:52, borderRadius:999, background:'rgba(249,255,0,0.13)', border:'1px solid rgba(249,255,0,0.35)', display:'grid', placeItems:'center' }}>
                  <SFIcon name="play" size={22} color="var(--accent)" />
                </div>
              </div>
              <div style={{ position:'absolute', top:12, left:14 }}>
                <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-3)', background:'rgba(0,0,0,0.55)', padding:'3px 8px', borderRadius:5 }}>V4 — ROUGH CUT</span>
              </div>
            </div>

            {/* Version pills */}
            <div style={{ display:'flex', alignItems:'center', gap:6, flexShrink:0 }}>
              {VERSIONS.map(ver => (
                <div key={ver.v} style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                  <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, fontWeight:600, padding:'4px 11px', borderRadius:7, background: ver.active ? 'var(--accent)' : 'var(--surface-2)', color: ver.active ? 'var(--on-accent)' : 'var(--text-3)', border: ver.active ? 'none' : '1px solid var(--border)', cursor:'pointer', display:'block', transition:'all 0.12s' }}>
                    {ver.v}
                  </span>
                  {ver.active && <span style={{ fontFamily:'var(--ff-mono)', fontSize:8.5, color:'var(--text-3)', letterSpacing:'0.04em' }}>{ver.label}</span>}
                </div>
              ))}
              <button style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', background:'transparent', border:'1px dashed var(--border-2)', borderRadius:7, padding:'4px 10px', cursor:'pointer', marginLeft:4, whiteSpace:'nowrap' }}>
                + Nouvelle version
              </button>
            </div>

            {/* Timeline */}
            <Timeline currentTime={currentTime} isPlaying={false} onSeek={setCurrentTime} />
          </div>

          {/* Comments panel */}
          <div style={{ flex:1, display:'flex', flexDirection:'column', borderTop:'1px solid var(--border)', overflow:'hidden', minHeight:0 }}>
            {/* Tabs */}
            <div style={{ display:'flex', borderBottom:'1px solid var(--border)', padding:'0 20px', background:'var(--surface)', flexShrink:0 }}>
              {[{id:'comments',label:'Commentaires',n:VR_COMMENTS.length},{id:'corrections',label:'Corrections',n:VR_CORRECTIONS.length}].map(tab => {
                const on = tab.id === activeTab;
                return (
                  <button key={tab.id} onClick={() => setActiveTab(tab.id)}
                    style={{ fontFamily:'var(--ff-text)', fontSize:12, fontWeight: on ? 600 : 400, color: on ? 'var(--text)' : 'var(--text-3)', padding:'10px 12px', background:'transparent', border:'none', borderBottom: on ? '2px solid var(--accent)' : '2px solid transparent', cursor:'pointer', display:'flex', alignItems:'center', gap:5, transition:'all 0.12s' }}>
                    {tab.label}
                    <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', background:'var(--surface-2)', padding:'1px 5px', borderRadius:999 }}>{tab.n}</span>
                  </button>
                );
              })}
            </div>
            {/* List */}
            <div style={{ flex:1, overflowY:'auto', padding:'8px 20px' }}>
              {activeTab === 'comments'
                ? VR_COMMENTS.map(c => <CommentRow key={c.id} c={c} onSeek={setCurrentTime} />)
                : VR_CORRECTIONS.map(c => (
                  <div key={c.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'9px 0', borderBottom:'1px solid var(--border)' }}>
                    <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:22 }}>{c.num}</span>
                    <span style={{ flex:1, fontSize:12, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.label}</span>
                    <SFPill status={c.status}>{c.statusLabel}</SFPill>
                  </div>
                ))
              }
            </div>
            {/* Input */}
            <div style={{ padding:'10px 20px', borderTop:'1px solid var(--border)', display:'flex', gap:10, alignItems:'center', background:'var(--surface)', flexShrink:0 }}>
              <SFAvatar initials="JT" bg="#2d3748" size={28} />
              <input value={newComment} onChange={e => setNewComment(e.target.value)}
                placeholder="Ajouter un commentaire…"
                style={{ flex:1, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:9, padding:'8px 12px', fontSize:13, color:'var(--text)', outline:'none', transition:'border-color 0.12s' }}
                onFocus={e => e.target.style.borderColor = 'var(--border-2)'}
                onBlur={e => e.target.style.borderColor = 'var(--border)'}
              />
              <button style={{ width:34, height:34, borderRadius:9, background: newComment ? 'var(--accent)' : 'var(--surface-3)', border:'none', cursor: newComment ? 'pointer' : 'default', display:'grid', placeItems:'center', flexShrink:0, transition:'background 0.12s' }}>
                <SFIcon name="send" size={14} color={newComment ? 'var(--on-accent)' : 'var(--text-3)'} />
              </button>
            </div>
          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ width:272, flexShrink:0, borderLeft:'1px solid var(--border)', overflowY:'auto', padding:'18px', display:'flex', flexDirection:'column', gap:14, background:'var(--surface)' }}>
          <div>
            <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:6 }}>VERSION ACTIVE</div>
            <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Rough Cut — V4</div>
            <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', lineHeight:1.8 }}>
              Uploadé le 10 juin 2025<br/>par Thomas Robert
            </div>
          </div>
          <SFPill status="review">En révision</SFPill>
          <div style={{ height:1, background:'var(--border)' }} />
          <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
            <BtnPrimary onClick={() => {}}>Demander approbation</BtnPrimary>
            <BtnSecondary icon="send" onClick={onNavigatePortail}>Envoyer au client</BtnSecondary>
          </div>
          <div style={{ height:1, background:'var(--border)' }} />
          <div>
            <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:10 }}>APPROBATEURS</div>
            <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
              {VR_APPROVERS.map(a => (
                <div key={a.initials} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <SFAvatar initials={a.initials} bg={a.bg} size={26} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:'var(--text)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{a.name}</div>
                    <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>{a.role}</div>
                  </div>
                  <SFPill status={a.status} small>{a.statusLabel}</SFPill>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenVideoReview });
