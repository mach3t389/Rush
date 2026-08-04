import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { getViewAsUser } from '../data/viewAsStore';
import { getRequiredPermissionForPath } from '../data/viewAsRoutePermissions';
import { getCurrentUser } from '../data/authStore';
import { getMyAccessLevel } from '../data/teamStore';
import { loadPermissions } from './profile/ProfileEditPanel';

// Wraps a route element. Sidebar.tsx already hides nav links a member can't
// use, but that alone never stopped a direct URL (typed, bookmarked, or
// linked from elsewhere) from reaching a restricted page — this component
// closes that gap by redirecting to the dashboard the moment such a route
// is actually reached.
//
// Two situations gate the same way, on the same required-permission map:
// (1) previewing an internal member via "View as" — the previewed
//     member's own permissions apply; (2) a real logged-in session where
//     the current user's own access level is 'member' (not owner/admin,
//     who get full access by construction, same rule as everywhere else
//     permissions are checked) — their own saved permissions apply.
export function ViewAsPermissionGate({ children }: { children: React.ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const viewAs = getViewAsUser();

  const allowed = (() => {
    const required = getRequiredPermissionForPath(location.pathname);
    if (!required) return true;

    if (viewAs?.type === 'internal') {
      const perms = viewAs.permissions ?? [];
      return required.some(p => perms.includes(p));
    }
    if (viewAs) return true; // viewing as a client contact: portal routes only, not these

    if (getMyAccessLevel() !== 'member') return true; // owner/admin: full access by construction
    const me = getCurrentUser();
    if (!me) return true; // no session — other guards handle auth, not this one
    const perms = loadPermissions(me.id, me.role);
    return required.some(p => perms.includes(p));
  })();

  useEffect(() => {
    if (!allowed) navigate('/', { replace: true });
  }, [allowed, navigate]);

  if (!allowed) return null;
  return <>{children}</>;
}
