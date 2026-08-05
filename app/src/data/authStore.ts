import { USERS } from './mock';
import { supabase } from './supabaseClient';
import { resetStudioIdCache } from './studioStore';
import { initNotifPrefsOnSignup } from './notifPrefsStore';
import { computeInitials } from '../utils/initials';

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
// Broadcast-only key — value itself is meaningless (a timestamp), it just
// needs to change on every real logout() so the `storage` event fires in
// every OTHER tab. Deliberately separate from AUTH_KEY: login()'s internal
// supabase.auth.signOut() (when switching INTO a demo session) must never
// trigger this, or entering demo mode would reload-loop every other tab.
const LOGOUT_PING_KEY = 'sf_logout_ping';

// Built-in demo users mapped by email — connexion instantanée, ne passe jamais par Supabase
const DEMO_EMAIL_MAP: Record<string, string> = {
  'lea.marchand@rushflow.com':    'lea',
  'sarah.martin@rushflow.com':   'sarah',
  'thomas.robert@rushflow.com':  'thomas',
  'julie.bernard@rushflow.com':  'julie',
  'marc.dufour@rushflow.com':    'marc',
};

export const DEMO_ACCOUNTS = [
  { email: 'lea.marchand@rushflow.com',   name: 'Léa Marchand',  role: 'Admin',           initials: 'LM', color: '#5c3d8f' },
  { email: 'sarah.martin@rushflow.com',   name: 'Sarah Martin',  role: 'Dir. créative',   initials: 'SM', color: '#3b4f8f' },
  { email: 'thomas.robert@rushflow.com',  name: 'Thomas Robert', role: 'Chef de projet',  initials: 'TR', color: '#5c3d8f' },
];

// Cache en mémoire de l'utilisateur Supabase courant, tenu à jour par l'abonnement
// ci-dessous — permet à getCurrentUser() de rester synchrone (2 appelants existants
// dans l'app l'utilisent directement au rendu, sans effet).
let supabaseUserCache: AuthUser | null = null;

function mapSupabaseUser(user: { id: string; email?: string; user_metadata?: Record<string, unknown> }): AuthUser {
  const fullName = (user.user_metadata?.full_name as string) || user.email || '';
  const studioName = (user.user_metadata?.studio_name as string) || localStorage.getItem(STUDIO_NAME_KEY) || 'Mon studio';
  const initials = computeInitials(fullName);
  const palette = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B', '#E85BB8', '#5BE8A8', '#8A6FF5'];
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
  // A real Supabase session firing here means this browser is genuinely
  // signed into a real account — any leftover demo flag from an earlier,
  // unrelated demo click must never be allowed to keep outranking it (see
  // getCurrentUser() below, and the cross-tab bug this caused: a stale
  // sf_auth key with no expiry silently overrode real sessions in every
  // tab, including brand new ones, until an explicit logout()).
  if (session?.user) localStorage.removeItem(AUTH_KEY);
});

// Cross-tab sync: `storage` fires in every OTHER tab (never the tab that
// made the change) whenever AUTH_KEY is set/removed via localStorage. A
// full reload is the simplest way to guarantee every store's in-memory
// cache — not just this file's — reflects the new session, rather than
// trying to surgically unwind each one from a background tab.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', e => {
    if (e.key === AUTH_KEY || e.key === LOGOUT_PING_KEY) window.location.reload();
  });
}

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

// Lets Supabase-backed stores (projectStore, and future migrations) register
// their own in-memory cache reset without authStore needing to import them
// back — keeps the dependency direction one-way (stores depend on authStore).
const _logoutHandlers = new Set<() => void>();
export function onLogout(fn: () => void): void {
  _logoutHandlers.add(fn);
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
      studioName:  localStorage.getItem(STUDIO_NAME_KEY) ?? 'Studio Lumière Production',
    };
    // A real Supabase session sitting alongside a fresh demo flag is exactly
    // the split-brain state that caused the cross-tab identity bug — never
    // let both exist at once.
    await supabase.auth.signOut();
    localStorage.setItem(AUTH_KEY, JSON.stringify(user));
    return { ok: true };
  }

  // Vraie authentification Supabase — clear any leftover demo flag first so
  // a real sign-in always fully wins, even if this browser previously had a
  // demo session that was never explicitly logged out of.
  localStorage.removeItem(AUTH_KEY);
  const { error } = await supabase.auth.signInWithPassword({ email: lower, password });
  if (error) return { ok: false, error: 'auth.invalidCredentials' };
  return { ok: true };
}

export async function register(data: {
  studioName: string;
  name: string;
  email: string;
  password: string;
  emailOptIn: boolean;
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

  localStorage.removeItem(AUTH_KEY);
  localStorage.setItem(STUDIO_NAME_KEY, data.studioName.trim());
  void initNotifPrefsOnSignup(data.emailOptIn).catch(err => console.error('initNotifPrefsOnSignup failed', err));
  return { ok: true };
}

// Client-contact registration — distinct from register() above, which
// creates a NEW STUDIO for its caller (register() writes studio_name into
// the auth user_metadata, which getStudioId() later reads to provision a
// studio for a first-time studio owner). A client must never trigger studio
// provisioning, so this omits studio_name entirely — the resulting
// auth.users row has no studio_name in its metadata, and the client-session
// detection layer (clientSessionStore.ts) routes this account away from any
// code path that would call getStudioId() in the first place.
export async function registerClient(data: {
  name: string;
  email: string;
  password: string;
  emailOptIn: boolean;
}): Promise<{ ok: boolean; error?: string }> {
  if (!data.name.trim() || !data.email.trim() || !data.password.trim())
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
      },
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes('already registered')) {
      return { ok: false, error: 'auth.emailTaken' };
    }
    return { ok: false, error: 'auth.requiredFields' };
  }

  localStorage.removeItem(AUTH_KEY);
  void initNotifPrefsOnSignup(data.emailOptIn).catch(err => console.error('initNotifPrefsOnSignup failed', err));
  return { ok: true };
}

export async function logout(): Promise<void> {
  localStorage.removeItem(AUTH_KEY);
  resetStudioIdCache();
  _logoutHandlers.forEach(fn => fn());
  await supabase.auth.signOut();
  // Broadcast to every other open tab — see LOGOUT_PING_KEY comment above.
  localStorage.setItem(LOGOUT_PING_KEY, String(Date.now()));
}

export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!email.trim()) return { ok: false, error: 'auth.requiredFields' };
  // Without redirectTo, Supabase sends the recovery link back to the site's
  // default URL — supabase-js then silently turns the recovery token into a
  // normal session on load, and with no dedicated screen listening for it,
  // the user just lands logged into the app with their OLD password still
  // active (confirmed live 2026-08-05). redirectTo points the link at
  // ResetPassword.tsx, the only screen that actually calls updatePassword().
  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim(), {
    redirectTo: `${window.location.origin}/reset-password`,
  });
  if (error) return { ok: false, error: 'auth.requiredFields' };
  return { ok: true };
}

// Called from ResetPassword.tsx once the recovery-link session is active.
// Supabase requires an authenticated session to call updateUser — the
// recovery token IS that session, auto-created by supabase-js when it
// detects the token in the URL (detectSessionInUrl, on by default).
export async function updatePassword(newPassword: string): Promise<{ ok: boolean; error?: string }> {
  if (newPassword.length < 8) return { ok: false, error: 'auth.passwordTooShort' };
  const { error } = await supabase.auth.updateUser({ password: newPassword });
  if (error) return { ok: false, error: 'auth.requiredFields' };
  return { ok: true };
}
