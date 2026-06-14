// components/ScreenOnboarding.jsx — Modal "Nouveau projet"
const TEMPLATES = [
  { id:'pub', icon:'film', label:'Publicité courte', desc:'4 phases · 12 tâches · Checklist tournage', color:'#3b4f8f' },
  { id:'doc', icon:'video', label:'Documentaire', desc:'5 phases · 18 tâches · Interviews + terrain', color:'#1a6b4a' },
  { id:'clip', icon:'music', label:'Clip musical', desc:'3 phases · 9 tâches · Chorégraphie + sync', color:'#5c3d8f' },
  { id:'corp', icon:'building-2', label:'Film institutionnel', desc:'4 phases · 14 tâches · Voix off + motion', color:'#7d4e57' },
  { id:'motion', icon:'layers', label:'Motion design', desc:'3 phases · 8 tâches · After Effects ready', color:'#2d5a7d' },
  { id:'blank', icon:'plus-circle', label:'Projet vide', desc:'Partir de zéro — aucun template', color:'#3d3d30' },
];

const CLIENTS = ['Nova Films', 'Studio Lumière', 'Maison Leroux', 'Collectif Ondes', 'Autre client…'];

function TemplateCard({ template, selected, onSelect }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button
      onClick={() => onSelect(template.id)}
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ background: selected ? 'var(--surface-3)' : hov ? 'var(--surface-2)' : 'var(--surface-2)', border: `1px solid ${selected ? 'var(--accent)' : hov ? 'var(--border-2)' : 'var(--border)'}`, borderRadius:12, padding:'14px', cursor:'pointer', textAlign:'left', display:'flex', flexDirection:'column', gap:10, transition:'all 0.12s ease' }}>
      <div style={{ width:36, height:36, borderRadius:9, background: template.color + '33', border: `1px solid ${template.color}44`, display:'grid', placeItems:'center' }}>
        <SFIcon name={template.icon} size={18} color={template.color} />
      </div>
      <div>
        <div style={{ fontSize:13, fontWeight:600, color: selected ? 'var(--text)' : 'var(--text-2)', marginBottom:4 }}>{template.label}</div>
        <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, color:'var(--text-3)', lineHeight:1.5 }}>{template.desc}</div>
      </div>
      {selected && (
        <div style={{ position:'absolute', top:10, right:10, width:18, height:18, borderRadius:999, background:'var(--accent)', display:'grid', placeItems:'center' }}>
          <SFIcon name="check" size={10} color="var(--on-accent)" />
        </div>
      )}
    </button>
  );
}

function FormField({ label, children }) {
  return (
    <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
      <label style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)' }}>{label}</label>
      {children}
    </div>
  );
}

const inputStyle = {
  background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:9,
  padding:'9px 12px', fontSize:13, color:'var(--text)', width:'100%',
  outline:'none', transition:'border-color 0.12s',
};

function ScreenOnboarding({ onClose, onCreateProject }) {
  const [selected, setSelected] = React.useState('pub');
  const [name, setName] = React.useState('');
  const [client, setClient] = React.useState('');
  const [date, setDate] = React.useState('');
  const [portalToggle, setPortalToggle] = React.useState(false);
  const [focusedField, setFocusedField] = React.useState(null);
  const canCreate = name.trim().length > 0;

  const handleCreate = () => {
    if (!canCreate) return;
    onCreateProject && onCreateProject({ template: selected, name, client, date });
    onClose();
  };

  const handleBackdropClick = e => {
    if (e.target === e.currentTarget) onClose();
  };

  return (
    <div
      onClick={handleBackdropClick}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.72)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:200, padding:'24px' }}>
      <div style={{ background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:22, width:'100%', maxWidth:780, maxHeight:'calc(100vh - 48px)', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.7)' }}>
        {/* Header */}
        <div style={{ padding:'22px 28px 18px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'flex-start', justifyContent:'space-between', flexShrink:0 }}>
          <div>
            <h2 style={{ fontFamily:'var(--ff-display)', fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:4 }}>Nouveau projet</h2>
            <p style={{ fontFamily:'var(--ff-text)', fontSize:13, color:'var(--text-3)' }}>Choisissez un template pour démarrer rapidement</p>
          </div>
          <button onClick={onClose} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'6px 8px', cursor:'pointer', color:'var(--text-3)', display:'flex', alignItems:'center', transition:'all 0.1s' }}
            onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; e.currentTarget.style.color = 'var(--text)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.color = 'var(--text-3)'; }}>
            <SFIcon name="x" size={16} color="inherit" />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex:1, overflowY:'auto', padding:'22px 28px' }}>
          {/* Section 1: Templates */}
          <div style={{ marginBottom:26 }}>
            <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:14 }}>Template</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:10 }}>
              {TEMPLATES.map(t => (
                <div key={t.id} style={{ position:'relative' }}>
                  <TemplateCard template={t} selected={selected === t.id} onSelect={setSelected} />
                </div>
              ))}
            </div>
          </div>

          {/* Divider */}
          <div style={{ height:1, background:'var(--border)', marginBottom:24 }} />

          {/* Section 2: Project info */}
          <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:16 }}>Informations du projet</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <FormField label="Nom du projet *">
              <input
                value={name}
                onChange={e => setName(e.target.value)}
                onFocus={() => setFocusedField('name')}
                onBlur={() => setFocusedField(null)}
                placeholder="Ex: Campagne Été 2025"
                style={{ ...inputStyle, borderColor: focusedField === 'name' ? 'var(--border-2)' : 'var(--border)', boxShadow: focusedField === 'name' ? '0 0 0 2px rgba(249,255,0,0.08)' : 'none' }}
              />
            </FormField>
            <FormField label="Client">
              <select
                value={client}
                onChange={e => setClient(e.target.value)}
                onFocus={() => setFocusedField('client')}
                onBlur={() => setFocusedField(null)}
                style={{ ...inputStyle, borderColor: focusedField === 'client' ? 'var(--border-2)' : 'var(--border)', appearance:'none', cursor:'pointer' }}>
                <option value="" style={{ background:'#1b1b19' }}>Sélectionner un client…</option>
                {CLIENTS.map(c => <option key={c} value={c} style={{ background:'#1b1b19' }}>{c}</option>)}
              </select>
            </FormField>
            <FormField label="Date de livraison prévue">
              <input
                type="date"
                value={date}
                onChange={e => setDate(e.target.value)}
                onFocus={() => setFocusedField('date')}
                onBlur={() => setFocusedField(null)}
                style={{ ...inputStyle, borderColor: focusedField === 'date' ? 'var(--border-2)' : 'var(--border)', colorScheme:'dark' }}
              />
            </FormField>
            <FormField label="Portail client">
              <div style={{ display:'flex', alignItems:'center', gap:12, padding:'9px 12px', background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:9 }}>
                <span style={{ flex:1, fontSize:13, color:'var(--text-2)' }}>Inviter le client dès la création</span>
                <button onClick={() => setPortalToggle(p => !p)} style={{ width:38, height:22, borderRadius:999, background: portalToggle ? 'var(--accent)' : 'var(--surface-2)', border:'1px solid var(--border-2)', cursor:'pointer', position:'relative', transition:'background 0.15s', flexShrink:0 }}>
                  <div style={{ width:16, height:16, borderRadius:999, background: portalToggle ? 'var(--on-accent)' : 'var(--text-3)', position:'absolute', top:2, left: portalToggle ? 20 : 2, transition:'left 0.15s, background 0.15s' }} />
                </button>
              </div>
            </FormField>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding:'16px 28px', borderTop:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
          <div style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', letterSpacing:'0.06em' }}>
            {selected && TEMPLATES.find(t => t.id === selected)?.label} · {TEMPLATES.find(t => t.id === selected)?.desc}
          </div>
          <div style={{ display:'flex', gap:10 }}>
            <BtnSecondary onClick={onClose}>Annuler</BtnSecondary>
            <BtnPrimary onClick={handleCreate} disabled={!canCreate}>
              {canCreate ? 'Créer le projet' : 'Saisir un nom…'}
            </BtnPrimary>
          </div>
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenOnboarding });
