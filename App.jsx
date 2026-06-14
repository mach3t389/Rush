// App.jsx — Shell, routing complet, tweaks
const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density":  "standard",
  "sidebar":  "plein",
  "accent":   "#f9ff00",
  "taskView": "liste"
}/*EDITMODE-END*/;

const DENSITY_MAP = {
  compact:  { rowPy: 5 },
  standard: { rowPy: 8 },
  'aéré':   { rowPy: 13 },
};

const NO_SIDEBAR_SCREENS = new Set(['portail']);

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);
  const [activeScreen, setActiveScreen] = React.useState('dashboard');
  const [showOnboarding, setShowOnboarding] = React.useState(false);
  const [activePhase, setActivePhase] = React.useState('preproduction');
  const [notification, setNotification] = React.useState(null);

  React.useEffect(() => {
    document.documentElement.style.setProperty('--accent', t.accent);
    const isDark = ['#f9ff00','#4ade80'].includes(t.accent);
    document.documentElement.style.setProperty('--on-accent', isDark ? '#14140a' : '#0c0c0b');
  }, [t.accent]);

  const density   = DENSITY_MAP[t.density] || DENSITY_MAP.standard;
  const collapsed = t.sidebar === 'réduit';
  const isPortail = NO_SIDEBAR_SCREENS.has(activeScreen);

  const go = (screen) => setActiveScreen(screen);

  const handleTabChange = (tabId) => {
    const map = { travail:'travail', ressources:'ressources', activite:'activite', 'video-review':'video-review' };
    if (map[tabId]) setActiveScreen(map[tabId]);
  };

  const handleSidebarNavigate = (screen) => setActiveScreen(screen);

  const handleCreateProject = ({ name }) => {
    setNotification(`Projet "${name}" créé avec succès`);
    setTimeout(() => setNotification(null), 3000);
    setActiveScreen('travail');
  };

  const renderScreen = () => {
    switch (activeScreen) {
      case 'dashboard':     return <ScreenDashboard  onNavigate={go} />;
      case 'travail':       return <ScreenTravail     density={density} taskView={t.taskView} activePhase={activePhase} onPhaseChange={setActivePhase} onTabChange={handleTabChange} />;
      case 'ressources':    return <ScreenRessources  density={density} onTabChange={handleTabChange} onNavigateVideoReview={() => go('video-review')} />;
      case 'taches':        return <ScreenTaches      density={density} />;
      case 'video-review':  return <ScreenVideoReview onTabChange={handleTabChange} onNavigatePortail={() => go('portail')} />;
      case 'portail':       return <ScreenPortail     onBack={() => go('video-review')} />;
      case 'activite':      return <ScreenActivite    onTabChange={handleTabChange} />;
      case 'clients':       return <ScreenClients     onNavigate={go} />;
      case 'fiche-client':  return <ScreenFicheClient onNavigate={go} onBack={() => go('clients')} />;
      case 'projets':       return <ScreenProjets     onNavigate={go} />;
      case 'notifications': return <ScreenNotifications />;
      case 'parametres':    return <ScreenParametres />;
      default:              return <ScreenDashboard  onNavigate={go} />;
    }
  };

  return (
    <div style={{ display:'flex', height:'100%', overflow:'hidden', background:'var(--bg)', fontFamily:'var(--ff-text)', color:'var(--text)' }}>
      {!isPortail && (
        <Sidebar
          activeScreen={activeScreen}
          onNavigate={handleSidebarNavigate}
          onNewProject={() => setShowOnboarding(true)}
          collapsed={collapsed}
        />
      )}

      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 }}>
        {renderScreen()}
      </div>

      {showOnboarding && (
        <ScreenOnboarding
          onClose={() => setShowOnboarding(false)}
          onCreateProject={handleCreateProject}
        />
      )}

      {notification && (
        <div style={{ position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)', background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:12, padding:'11px 18px', display:'flex', alignItems:'center', gap:10, boxShadow:'0 8px 32px rgba(0,0,0,0.55)', zIndex:300, whiteSpace:'nowrap' }}>
          <SFIcon name="check-circle" size={15} color="var(--ok)" />
          <span style={{ fontSize:13 }}>{notification}</span>
        </div>
      )}

      <TweaksPanel>
        <TweakSection label="Interface" />
        <TweakRadio label="Densité"   value={t.density}  options={['compact','standard','aéré']} onChange={v => setTweak('density', v)} />
        <TweakRadio label="Sidebar"   value={t.sidebar}  options={['plein','réduit']}            onChange={v => setTweak('sidebar', v)} />
        <TweakSection label="Couleur" />
        <TweakColor label="Accent"    value={t.accent}   options={['#f9ff00','#ffffff','#4ade80','#60a5fa']} onChange={v => setTweak('accent', v)} />
        <TweakSection label="Vue Liste" />
        <TweakRadio label="Affichage" value={t.taskView} options={['liste','kanban']}            onChange={v => setTweak('taskView', v)} />
      </TweaksPanel>
    </div>
  );
}

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<App />);
