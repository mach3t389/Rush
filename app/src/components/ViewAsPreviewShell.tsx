import type { ReactNode } from 'react';
import { ViewAsBanner } from './ViewAsBanner';

// The /apercu-client/* routes are standalone (outside AppShell, matching
// the real /mon-espace/* client routes' shape) so the preview looks
// exactly like what a real client would see. But ViewAsBanner is normally
// only rendered inside AppShell — without this wrapper, an admin landing
// here after "Voir en tant que" has no visible indicator of the preview
// state and no way to exit it from this screen.
export function ViewAsPreviewShell({ children }: { children: ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <ViewAsBanner />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column' }}>{children}</div>
    </div>
  );
}
