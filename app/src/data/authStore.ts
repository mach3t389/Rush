import { USERS } from './mock';
import { supabase } from './supabaseClient';
import { resetStudioIdCache } from './studioStore';

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
export const STUDIO_NAME_KEY = 'sf_studio_name';

// Built-in demo users mapped by email — connexion instantanée, ne passe jamais par Supabase
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

// Cache en mémoire de l'utilisateur Supabase courant, tenu à jour par l'abonnement
// ci-dessous — permet à getCurrentUser() de rester synchrone (2 appelants existants
// dans l'app l'utilisent directement au rendu, sans effet).
let supabaseUserCache: AuthUser | null = null;

function mapSupabaseUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const fullName = (user.user_metadata?.full_name as string) || user.email || '';
  const studioName = (user.user_metadata?.studio_name as string) || localStorage.getItem(STUDIO_NAME_KEY) || 'Mon studio';
  const parts = fullName.trim().split(' ').filter(Boolean);
  const initials = parts.map(p => p[0]).join('').toUpperCase().slice(0, 2) || '??';
  const palette = ['#5c3d8f', '#3b4f8f', '#1a6b4a', '#7d4e57', '#a85f3e'];
  const avatarColor = palette[(user.email ?? '').length % palette.length];
  return {
    id: user.id,
    name: fullName,
    email: user.email ?? '',
    role: 'Admin',
    initials,
    avatarColor,
    studioName,
  };
}

supabase.auth.onAuthStateChange((_event, session) => {
  supabaseUserCache = session?.user ? mapSupabaseUser(session.user) : null;
});

export async function isAuthenticated(): Promise<boolean> {
  if (localStorage.getItem(AUTH_KEY)) return true; // session démo
  const { data } = await supabase.auth.getSession();
  return !!data.session;
}

export function getCurrentUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(AUTH_KEY);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return supabaseUserCache;
}

export function isDemoSession(): boolean {
  return !!localStorage.getItem(AUTH_KEY);
}

export async function login(email: string, password: string): Promise<{ ok: boolean; error?: string }> {
  if (!email.trim() || !password.trim()) return { ok: false, error: 'auth.requiredFields' };

  const lower = email.toLowerCase().trim();

  // Comptes démo — n'importe quel mot de passe accepté, ne passe pas par Supabase
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

  // Vraie authentification Supabase
  const { error } = await supabase.auth.signInWithPassword({ email: lower, password });
  if (error) return { ok: false, error: 'auth.invalidCredentials' };
  return { ok: true };
}

export async function register(data: {
  studioName: string;
  name: string;
  email: string;
  password: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!data.studioName.trim() || !data.name.trim() || !data.email.trim() || !data.password.trim())
    return { ok: false, error: 'auth.requiredFields' };
  if (data.password.length < 8)
    return { ok: false, error: 'auth.passwordTooShort' };

  const lower = data.email.toLowerCase().trim();
  if (DEMO_EMAIL_MAP[lower]) return { ok: false, error: 'auth.emailTaken' };

  const { error } = await supabase.auth.signUp({
    email: lower,
    password: data.password,
    options: {
      data: {
        full_name: data.name.trim(),
        studio_name: data.studioName.trim(),
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { ok: false, error: 'auth.emailTaken' };
    }
    return { ok: false, error: 'auth.requiredFields' };
  }

  localStorage.setItem(STUDIO_NAME_KEY, data.studioName.trim());
  return { ok: true };
}

export async function logout(): Promise<void> {
  localStorage.removeItem(AUTH_KEY);
  resetStudioIdCache();
  await supabase.auth.signOut();
}

export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!email.trim()) return { ok: false, error: 'auth.requiredFields' };
  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim());
  if (error) return { ok: false, error: 'auth.requiredFields' };
  return { ok: true };
}
