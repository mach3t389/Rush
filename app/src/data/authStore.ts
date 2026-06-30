import { USERS } from './mock';

export interface AuthUser {
  id: string;
  name: string;
  email: string;
  role: string;
  initials: string;
  avatarColor: string;
  studioName: string;
}

const AUTH_KEY      = 'sf_auth';
const REGISTERED_KEY = 'sf_registered_users';
export const STUDIO_NAME_KEY = 'sf_studio_name';

// Built-in demo users mapped by email
const DEMO_EMAIL_MAP: Record<string, string> = {
  'lea.marchand@studioflow.fr':    'lea',
  'sarah.martin@studioflow.fr':   'sarah',
  'thomas.robert@studioflow.fr':  'thomas',
  'julie.bernard@studioflow.fr':  'julie',
  'marc.dufour@studioflow.fr':    'marc',
};

export const DEMO_ACCOUNTS = [
  { email: 'lea.marchand@studioflow.fr',   name: 'Léa Marchand',  role: 'Admin',           initials: 'LM', color: '#5c3d8f' },
  { email: 'sarah.martin@studioflow.fr',   name: 'Sarah Martin',  role: 'Dir. créative',   initials: 'SM', color: '#3b4f8f' },
  { email: 'thomas.robert@studioflow.fr',  name: 'Thomas Robert', role: 'Chef de projet',  initials: 'TR', color: '#5c3d8f' },
];

export function isAuthenticated(): boolean {
  return !!localStorage.getItem(AUTH_KEY);
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}

export function login(email: string, password: string): { ok: boolean; error?: string } {
  if (!email.trim() || !password.trim()) return { ok: false, error: 'auth.requiredFields' };

  const lower = email.toLowerCase().trim();

  // Demo studio users — any password accepted
  const userId = DEMO_EMAIL_MAP[lower];
  if (userId) {
    const u = USERS[userId];
    const user: AuthUser = {
      id:          u.id,
      name:        u.name,
      email:       lower,
      role:        u.role,
      initials:    u.initials,
      avatarColor: u.avatarColor,
      studioName:  localStorage.getItem(STUDIO_NAME_KEY) ?? 'StudioFlow Production',
    };
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return { ok: true };
  }

  // Registered users — password verified
  try {
    const reg: Record<string, { user: AuthUser; password: string }> =
      JSON.parse(localStorage.getItem(REGISTERED_KEY) ?? '{}');
    const entry = reg[lower];
    if (entry && entry.password === password) {
      localStorage.setItem(AUTH_KEY, JSON.stringify(entry.user));
      return { ok: true };
    }
  } catch { /* noop */ }

  return { ok: false, error: 'auth.invalidCredentials' };
}

export function register(data: {
  studioName: string;
  name: string;
  email: string;
  password: string;
}): { ok: boolean; error?: string } {
  if (!data.studioName.trim() || !data.name.trim() || !data.email.trim() || !data.password.trim())
    return { ok: false, error: 'auth.requiredFields' };
  if (data.password.length < 8)
    return { ok: false, error: 'auth.passwordTooShort' };

  const lower = data.email.toLowerCase().trim();
  if (DEMO_EMAIL_MAP[lower]) return { ok: false, error: 'auth.emailTaken' };

  try {
    const reg: Record<string, { user: AuthUser; password: string }> =
      JSON.parse(localStorage.getItem(REGISTERED_KEY) ?? '{}');
    if (reg[lower]) return { ok: false, error: 'auth.emailTaken' };

    const parts = data.name.trim().split(' ');
    const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2);
    const palette = ['#5c3d8f', '#3b4f8f', '#1a6b4a', '#7d4e57', '#a85f3e'];
    const avatarColor = palette[lower.length % palette.length];

    const user: AuthUser = {
      id:          `usr_${Date.now()}`,
      name:        data.name.trim(),
      email:       lower,
      role:        'Admin',
      initials,
      avatarColor,
      studioName:  data.studioName.trim(),
    };

    reg[lower] = { user, password: data.password };
    localStorage.setItem(REGISTERED_KEY, JSON.stringify(reg));
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    localStorage.setItem(STUDIO_NAME_KEY, data.studioName.trim());
    return { ok: true };
  } catch {
    return { ok: false, error: 'auth.requiredFields' };
  }
}

export function logout() {
  localStorage.removeItem(AUTH_KEY);
}
