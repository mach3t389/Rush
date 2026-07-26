import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getViewAsUser } from '../data/viewAsStore';
import { getRequiredPermissionForPath } from '../data/viewAsRoutePermissions';

// Wraps a route element. Sidebar.tsx already hides nav links the previewed
// internal member can't use, but that alone never stopped a direct URL
// (typed, bookmarked, or linked from elsewhere) from reaching a restricted
// page during a preview — this component closes that gap by redirecting to
// the dashboard the moment such a route is actually reached.
export function ViewAsPermissionGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const viewAs = getViewAsUser();

  const allowed = (() => {
    if (viewAs?.type !== 'internal') return true;
    const required = getRequiredPermissionForPath(location.pathname);
    if (!required) return true;
    const perms = viewAs.permissions ?? [];
    return required.some(p => perms.includes(p));
  })();

  useEffect(() => {
    if (!allowed) navigate('/', { replace: true });
  }, [allowed, navigate]);

  if (!allowed) return null;
  return <>{children}</>;
}
