import type { PermissionKey } from '../components/profile/ProfileEditPanel';
import type { PortalPermissions } from './clientContactsStore';

export type ViewAsType = 'internal' | 'external';

export interface ViewAsUser {
  type: ViewAsType;
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  role: string;
  // internal members
  permissions?: PermissionKey[];
  // external contacts
  portalPermissions?: PortalPermissions;
  clientId?: string;
}

let _state: ViewAsUser | null = null;
const _listeners = new Set<() => void>();

function _notify() {
  _listeners.forEach(fn => fn());
}

export function getViewAsUser(): ViewAsUser | null {
  return _state;
}

export function enterViewAs(user: ViewAsUser): void {
  _state = user;
  _notify();
}

export function exitViewAs(): void {
  _state = null;
  _notify();
}

export function subscribeViewAs(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}
