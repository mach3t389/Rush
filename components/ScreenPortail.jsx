// components/ScreenPortail.jsx — Vue client (sans sidebar)

const PT_HISTORY = [
  { v:'V3', date:'3 juin',  status:'danger', statusLabel:'Corrections demandées' },
  { v:'V2', date:'27 mai',  status:'ok',     statusLabel:'Approuvé' },
  { v:'V1', date:'18 mai',  status:'ok',     statusLabel:'Approuvé' },
];

const PT_CORRECTIONS = [
  { num:'#1', label:"Couper l'intro de 3 secondes",     status:'info', statusLabel:'En cours' },
  { num:'#2', label:'Réduire niveau sonore extérieur',  status:'ok',   statusLabel:'Intégré' },
  { num:'#3', label:'Ajouter fondu au noir — plan final',status:'warn', statusLabel:'À faire' },
  { num:'#4', label:'Révision colorimétrie plans nuit', status:'warn', statusLabel:'À faire' },
];

function PortalVideoThumb({ playing, onToggle }) {
  return (
    <div onClick={onToggle}
      style={{ position:'relative', background:'repeating-linear-gradient(135deg,rgba(255,255,255,0.04) 0 2px,transparent 2px 11px),var(--surface-2)', borderRadius:10, overflow:'hidden', paddingBottom:'56.25%', cursor:'pointer' }}>
      <div style={{ position:'absolute', inset:0, display:'flex', alignItems:'center', justifyContent:'center' }}>
        <div style={{ width:52, height:52, borderRadius:999, background:'rgba(249,255,0,0.13)', border:'1px solid rgba(249,255,0,0.35)', backdropFilter:'blur(4px)', display:'grid', placeItems:'center', transition:'transform 0.12s' }}
          onMouseEnter={e => e.currentTarget.style.transform = 'scale(1.06)'}
          onMouseLeave={e => e.currentTarget.style.transform = 'scale(1)'}>
          <SFIcon name={playing ? 'pause' : 'play'} size={22} color="var(--accent)" />
        </div>
      </div>
      <div style={{ position:'absolute', top:10, left:12 }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.08em', textTransform:'uppercase', color:'var(--text-3)', background:'rgba(0,0,0,0.55)', padding:'3px 8px', borderRadius:5 }}>V4 — 03:28</span>
      </div>
    </div>
  );
}

function ScreenPortail({ onBack }) {
  const [approved, setApproved] = React.useState(null); // null | 'approved' | 'corrections'
  const [playing, setPlaying] = React.useState(false);
  const [corrections, setCorrections] = React.useState('');

  const borderAccent = approved === 'approved' ? 'var(--ok)' : approved === 'corrections' ? 'var(--danger)' : 'var(--accent)';
  const eyebrowColor = approved === 'approved' ? 'var(--ok)' : approved === 'corrections' ? 'var(--danger)' : 'var(--accent)';
  const eyebrowText = approved === 'approved' ? '✓ APPROUVÉ — MERCI' : approved === 'corrections' ? '✎ CORRECTIONS SOUMISES' : '● EN ATTENTE DE VOTRE APPROBATION';

  return (
    <div style={{ display:'flex', flexDirection:'column', height:'100%', background:'var(--bg)' }}>
      {/* Portal header — no sidebar */}
      <div style={{ background:'var(--surface)', borderBottom:'1px solid var(--border)', padding:'0 32px', height:52, display:'flex', alignItems:'center', gap:16, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <img src="assets/LogoMark_Inverse.svg" width={24} height={24} alt="Rush" />
          <span style={{ fontFamily:'var(--ff-display)', fontWeight:900, fontSize:13, letterSpacing:'-0.01em', color:'var(--text)', whiteSpace:'nowrap' }}>Rush</span>
        </div>
        <div style={{ flex:1, textAlign:'center' }}>
          <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Campagne Été 2025 </span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>· NOVA FILMS</span>
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
          <span style={{ fontSize:12, color:'var(--text-2)' }}>Marie Lefebvre</span>
          <SFAvatar initials="ML" bg="#5c3d8f" size={28} />
          <button onClick={onBack}
            style={{ display:'flex', alignItems:'center', gap:5, background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:7, padding:'5px 10px', color:'var(--text-3)', fontSize:12, cursor:'pointer', fontFamily:'var(--ff-text)', transition:'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.background='var(--surface-3)'; e.currentTarget.style.color='var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background='var(--surface-2)'; e.currentTarget.style.color='var(--text-3)'; }}>
            <SFIcon name="arrow-left" size={13} color="inherit" /> Studio
          </button>
        </div>
      </div>

      {/* Content */}
      <div style={{ flex:1, overflowY:'auto', padding:'28px 32px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 290px', gap:22, maxWidth:1060, margin:'0 auto' }}>

          {/* ── Left column ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
            {/* Active deliverable card */}
            <div style={{ background:'var(--surface)', border:`1px solid ${borderAccent}`, borderRadius:16, padding:'20px', transition:'border-color 0.3s' }}>
              <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.12em', textTransform:'uppercase', color: eyebrowColor, marginBottom:14, transition:'color 0.3s' }}>
                {eyebrowText}
              </div>
              <PortalVideoThumb playing={playing} onToggle={() => setPlaying(p => !p)} />
              <div style={{ marginTop:14, marginBottom:14 }}>
                <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Rough Cut Final — V4</div>
                <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>Partagé le 10 juin 2025 · 03:28</div>
              </div>

              {approved === null && (
                <div style={{ display:'flex', gap:10 }}>
                  <BtnPrimary onClick={() => setApproved('approved')}>Approuver ✓</BtnPrimary>
                  <BtnSecondary onClick={() => setApproved('corrections')}>Demander des corrections</BtnSecondary>
                </div>
              )}
              {approved === 'approved' && (
                <div style={{ padding:'10px 14px', background:'rgba(0,0,0,0.2)', border:'1px solid var(--ok)', borderRadius:9, display:'flex', alignItems:'center', gap:10 }}>
                  <SFIcon name="check-circle" size={16} color="var(--ok)" />
                  <span style={{ fontSize:12, color:'var(--text-2)' }}>Vous avez approuvé cette version. L'équipe a été notifiée.</span>
                </div>
              )}
              {approved === 'corrections' && (
                <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                  <textarea value={corrections} onChange={e => setCorrections(e.target.value)}
                    placeholder="Décrivez vos demandes de corrections…"
                    style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:9, padding:'10px 12px', fontSize:13, color:'var(--text)', resize:'vertical', minHeight:80, outline:'none', fontFamily:'var(--ff-text)' }}
                    onFocus={e => e.target.style.borderColor='var(--border-2)'}
                    onBlur={e => e.target.style.borderColor='var(--border)'}
                  />
                  <BtnPrimary onClick={() => {}} disabled={!corrections.trim()}>Envoyer les corrections</BtnPrimary>
                </div>
              )}
            </div>

            {/* Delivery history */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'18px 20px' }}>
              <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:12 }}>HISTORIQUE DES LIVRABLES</div>
              {PT_HISTORY.map((item, i) => (
                <div key={item.v} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 0', borderBottom: i < PT_HISTORY.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontFamily:'var(--ff-mono)', fontSize:11, fontWeight:600, color:'var(--text-2)', minWidth:22 }}>{item.v}</span>
                  <span style={{ flex:1, fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>Partagé le {item.date}</span>
                  <SFPill status={item.status}>{item.statusLabel}</SFPill>
                </div>
              ))}
            </div>
          </div>

          {/* ── Right column ── */}
          <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
            {/* Corrections */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'16px' }}>
              <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:12 }}>CORRECTIONS EN COURS</div>
              {PT_CORRECTIONS.map((c, i) => (
                <div key={c.num} style={{ display:'flex', alignItems:'center', gap:8, padding:'8px 0', borderBottom: i < PT_CORRECTIONS.length-1 ? '1px solid var(--border)' : 'none' }}>
                  <span style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', minWidth:18 }}>{c.num}</span>
                  <span style={{ flex:1, fontSize:12, color:'var(--text-2)', lineHeight:1.4 }}>{c.label}</span>
                  <SFPill status={c.status} small>{c.statusLabel}</SFPill>
                </div>
              ))}
            </div>

            {/* Contact */}
            <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'16px' }}>
              <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:12 }}>CONTACT STUDIO</div>
              <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:14 }}>
                <SFAvatar initials="TR" bg="#5c3d8f" size={36} />
                <div>
                  <div style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>Thomas Robert</div>
                  <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)' }}>Chef de projet</div>
                </div>
              </div>
              <BtnSecondary icon="message-circle">Envoyer un message</BtnSecondary>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenPortail });
