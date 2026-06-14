// components/ScreenParametres.jsx — Écran 12 : Paramètres

const PARAM_NAV = [
  { group:'Studio',     items:[{id:'studio-info', label:'Informations studio'},{id:'equipe',label:'Équipe et membres'},{id:'portail-brand',label:'Portail client'}] },
  { group:'Compte',     items:[{id:'profil',label:'Profil'},{id:'notifs-prefs',label:'Notifications'},{id:'securite',label:'Sécurité'}] },
  { group:'Facturation',items:[{id:'plan',label:'Plan & abonnement'},{id:'historique',label:'Historique'}] },
];

const ACCENT_SWATCHES = ['#f9ff00','#4ade80','#60a5fa','#f97316','#a78bfa','#fb7185'];

function ParamNavItem({ item, active, onClick }) {
  const [hov, setHov] = React.useState(false);
  return (
    <button onClick={onClick} onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ width:'100%', padding:'8px 12px', background:active?'var(--surface-3)':hov?'var(--surface-2)':'transparent', border:'none', borderLeft:active?'2px solid var(--accent)':'2px solid transparent', borderRadius:8, cursor:'pointer', textAlign:'left', transition:'all 0.1s', fontFamily:'var(--ff-text)', fontSize:13, color:active?'var(--text)':'var(--text-2)', fontWeight:active?500:400 }}>
      {item.label}
    </button>
  );
}

function FormLabel({ children }) {
  return <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', marginBottom:6 }}>{children}</div>;
}

function FormInput({ value, onChange, placeholder, type = 'text' }) {
  const [foc, setFoc] = React.useState(false);
  return (
    <input value={value} onChange={onChange} type={type} placeholder={placeholder}
      onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      style={{ width:'100%', background:'var(--surface-3)', border:`1px solid ${foc?'var(--border-2)':'var(--border)'}`, borderRadius:9, padding:'9px 12px', fontSize:13, color:'var(--text)', outline:'none', transition:'border-color 0.12s, box-shadow 0.12s', fontFamily:'var(--ff-text)', boxShadow:foc?'0 0 0 2px rgba(249,255,0,0.06)':'none' }}
    />
  );
}

function FormTextarea({ value, onChange, placeholder, rows = 3 }) {
  const [foc, setFoc] = React.useState(false);
  return (
    <textarea value={value} onChange={onChange} placeholder={placeholder} rows={rows}
      onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      style={{ width:'100%', background:'var(--surface-3)', border:`1px solid ${foc?'var(--border-2)':'var(--border)'}`, borderRadius:9, padding:'9px 12px', fontSize:13, color:'var(--text)', outline:'none', resize:'vertical', fontFamily:'var(--ff-text)', transition:'border-color 0.12s', boxShadow:foc?'0 0 0 2px rgba(249,255,0,0.06)':'none' }}
    />
  );
}

function FormSelect({ value, onChange, options }) {
  const [foc, setFoc] = React.useState(false);
  return (
    <select value={value} onChange={onChange} onFocus={() => setFoc(true)} onBlur={() => setFoc(false)}
      style={{ width:'100%', background:'var(--surface-3)', border:`1px solid ${foc?'var(--border-2)':'var(--border)'}`, borderRadius:9, padding:'9px 12px', fontSize:13, color:'var(--text)', outline:'none', appearance:'none', cursor:'pointer', fontFamily:'var(--ff-text)', transition:'border-color 0.12s', colorScheme:'dark' }}>
      {options.map(o => <option key={o} value={o} style={{ background:'#1b1b19' }}>{o}</option>)}
    </select>
  );
}

function StudioInfoSection() {
  const [name, setName] = React.useState('Rush Production');
  const [sector, setSector] = React.useState('Production vidéo');
  const [website, setWebsite] = React.useState('https://rush-production.ca');
  const [address, setAddress] = React.useState('1200 avenue McGill College\nMontréal, QC H3B 4G7\nCanada');
  const [accentSwatch, setAccentSwatch] = React.useState('#f9ff00');
  const [saved, setSaved] = React.useState(false);

  const handleSave = () => {
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  return (
    <div>
      <div style={{ marginBottom:22 }}>
        <h2 style={{ fontFamily:'var(--ff-display)', fontSize:18, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Informations studio</h2>
        <p style={{ fontSize:13, color:'var(--text-3)', lineHeight:1.5 }}>Ces informations apparaissent dans le portail client et les livrables partagés.</p>
      </div>

      {/* Form card */}
      <div style={{ background:'var(--surface)', border:'1px solid var(--border)', borderRadius:14, padding:'22px' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:16 }}>
          <div>
            <FormLabel>Nom du studio</FormLabel>
            <FormInput value={name} onChange={e => setName(e.target.value)} placeholder="Nom de votre studio" />
          </div>
          <div>
            <FormLabel>Secteur d'activité</FormLabel>
            <FormSelect value={sector} onChange={e => setSector(e.target.value)} options={['Production vidéo','Motion design','Photographie','Agence créative','Autre']} />
          </div>
          <div>
            <FormLabel>Site web</FormLabel>
            <FormInput value={website} onChange={e => setWebsite(e.target.value)} placeholder="https://…" />
          </div>
          <div>
            <FormLabel>Adresse</FormLabel>
            <FormTextarea value={address} onChange={e => setAddress(e.target.value)} rows={3} />
          </div>
        </div>

        {/* Logo upload */}
        <div style={{ marginBottom:20 }}>
          <FormLabel>Logo du studio</FormLabel>
          <div style={{ border:'1px dashed var(--border-2)', borderRadius:10, padding:'24px', background:'var(--surface-2)', display:'flex', flexDirection:'column', alignItems:'center', gap:10, cursor:'pointer', transition:'background 0.1s' }}
            onMouseEnter={e => e.currentTarget.style.background='var(--surface-3)'}
            onMouseLeave={e => e.currentTarget.style.background='var(--surface-2)'}>
            <SFIcon name="upload-cloud" size={26} color="var(--text-3)" />
            <span style={{ fontSize:13, color:'var(--text-2)' }}>Glissez votre logo ou cliquez pour parcourir</span>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>PNG, JPG · Max 2 Mo</span>
          </div>
        </div>

        {/* Accent swatches */}
        <div style={{ marginBottom:22 }}>
          <FormLabel>Couleur accent portail client</FormLabel>
          <div style={{ display:'flex', gap:10 }}>
            {ACCENT_SWATCHES.map(c => (
              <button key={c} onClick={() => setAccentSwatch(c)}
                style={{ width:28, height:28, borderRadius:999, background:c, border:`2px solid ${accentSwatch===c?'var(--text)':'transparent'}`, cursor:'pointer', transition:'transform 0.1s, border-color 0.1s', transform:accentSwatch===c?'scale(1.15)':'scale(1)' }} />
            ))}
          </div>
        </div>

        {/* Save button */}
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <BtnPrimary onClick={handleSave}>{saved ? '✓ Enregistré' : 'Enregistrer les modifications'}</BtnPrimary>
        </div>
      </div>
    </div>
  );
}

function ScreenParametres() {
  const [activeSection, setActiveSection] = React.useState('studio-info');

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
      <PageHeader title="Paramètres" />

      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
        {/* Sub-navigation */}
        <div style={{ width:210, flexShrink:0, background:'var(--surface)', borderRight:'1px solid var(--border)', overflowY:'auto', padding:'16px 10px' }}>
          {PARAM_NAV.map(group => (
            <div key={group.group} style={{ marginBottom:18 }}>
              <div style={{ fontFamily:'var(--ff-mono)', fontSize:9.5, letterSpacing:'0.14em', textTransform:'uppercase', color:'var(--text-3)', padding:'0 12px', marginBottom:4 }}>{group.group}</div>
              {group.items.map(item => (
                <ParamNavItem key={item.id} item={item} active={activeSection===item.id} onClick={() => setActiveSection(item.id)} />
              ))}
            </div>
          ))}
        </div>

        {/* Content area */}
        <div style={{ flex:1, overflowY:'auto', background:'var(--bg)', padding:'24px 28px' }}>
          {activeSection === 'studio-info' ? (
            <StudioInfoSection />
          ) : (
            <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:200, gap:12, color:'var(--text-3)' }}>
              <SFIcon name="settings" size={28} color="var(--text-3)" />
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:11 }}>SECTION EN COURS DE DÉVELOPPEMENT</span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

Object.assign(window, { ScreenParametres });
