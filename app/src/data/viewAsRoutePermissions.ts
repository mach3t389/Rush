import type { PermissionKey } from '../components/profile/ProfileEditPanel';

// Single source of truth for "which permission does this route need".
// Consumed by Sidebar.tsx (to hide the nav link) and ViewAsPermissionGate
// (to actually block the route) — kept in one place so the two can never
// drift apart, the way a route-level enforcement bug would otherwise be
// invisible (link hidden, but URL still reachable).
export function getRequiredPermissionForPath(pathname: string): PermissionKey[] | null {
  if (pathname === '/clients' || pathname.startsWith('/clients/')) {
    return ['manage_clients'];
  }
  if (pathname === '/membres' || pathname.startsWith('/membres/individus/')) {
    return ['manage_clients'];
  }
  if (pathname === '/finances' || /^\/projets\/[^/]+\/finances$/.test(pathname)) {
    return ['view_invoices', 'manage_invoices'];
  }
  return null;
}
