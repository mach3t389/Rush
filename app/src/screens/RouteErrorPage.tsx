import { useRouteError } from 'react-router-dom';
import { SFButton, SFIcon } from '../components/ui';

// Router-level errorElement for standalone routes (no AppShell/sidebar around
// them, e.g. the public client portal) — catches loader errors and render
// crashes (typically a stale/deleted id in the URL) and gives the visitor a
// way out instead of React Router's blank default error screen.
export function RouteErrorPage() {
  const error = useRouteError();
  if (import.meta.env.DEV) console.error('Route error:', error);

  return (
    <div style={{
      height: '100vh', display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32,
      textAlign: 'center', background: 'var(--bg)',
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
      <SFButton variant="primary" onClick={() => { window.location.href = '/'; }}>
        Retour à l'accueil
      </SFButton>
    </div>
  );
}
