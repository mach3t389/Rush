import { Component, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SFButton, SFIcon } from '../ui';

// Catches render-time crashes from whatever route is mounted in the
// AppShell's <Outlet /> — most commonly a page trying to read a project,
// client or resource that no longer exists (deleted, or a stale URL from
// before a deploy). Without this, a crash here bubbles to React Router's
// default error page with no way back except editing the URL by hand.
// Wrapping just the Outlet (not the whole AppShell) keeps the sidebar and
// top bar usable so the user can navigate away.
class ErrorBoundaryInner extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  componentDidCatch(error: unknown) {
    console.error('Route crashed:', error);
  }

  render() {
    if (this.state.hasError) {
      return <RouteErrorFallback />;
    }
    return this.props.children;
  }
}

function RouteErrorFallback() {
  const navigate = useNavigate();
  return (
    <div style={{
      height: '100%', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center',
    }}>
      <div style={{ width: 48, height: 48, borderRadius: 14, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SFIcon name="frown" size={22} color="var(--text-3)" />
      </div>
      <div>
        <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
          Cette page n'existe plus ou n'a pas pu s'afficher
        </p>
        <p style={{ fontSize: 13, color: 'var(--text-3)', maxWidth: 380 }}>
          Le lien que vous avez suivi (ou rafraîchi) pointe peut-être vers un élément supprimé ou déplacé.
        </p>
      </div>
      <SFButton variant="primary" onClick={() => navigate('/', { replace: true })}>
        Retour à l'accueil
      </SFButton>
    </div>
  );
}

// Small wrapper so the class component can key off the current path via a hook.
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation();
  return (
    <ErrorBoundaryInner key={location.pathname}>
      {children}
    </ErrorBoundaryInner>
  );
}
