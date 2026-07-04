# Authentification Supabase — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer l'authentification mock (`authStore.ts`) par une vraie authentification Supabase, tout en gardant les 3 comptes démo fonctionnels sans backend (données mock inchangées).

**Architecture:** Un client Supabase unique (`app/src/data/supabaseClient.ts`) est utilisé par `authStore.ts`, dont les fonctions exportées (`login`, `register`, `logout`, `isAuthenticated`, `getCurrentUser`) gardent leurs noms et sont adaptées pour être asynchrones là où c'est nécessaire (appels réseau réels), tout en restant synchrones là où c'est possible (`getCurrentUser`, via un cache en mémoire tenu à jour par un abonnement `onAuthStateChange`). Les 5 écrans/composants qui consomment `authStore.ts` (`main.tsx`, `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `GlobalTopBar.tsx`) sont ajustés en conséquence.

**Tech Stack:** `@supabase/supabase-js` (nouveau), React 19 + TypeScript + Vite 8 (existant), aucune nouvelle dépendance UI.

## Global Constraints

- Les comptes démo (Léa, Sarah, Thomas) doivent continuer à fonctionner exactement comme avant — connexion instantanée côté client, sans passer par Supabase, sans changement de comportement visible.
- Aucune migration de données (projets/tâches/clients) — hors scope de ce plan.
- Aucune nouvelle clé i18n — toutes les erreurs réutilisent les clés `auth.*` déjà existantes dans `fr.json`/`en.json`.
- Les identifiants Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`) sont déjà dans `app/.env` (gitignoré) — ne pas les committer, ne pas les redemander.
- Vérification : `npx tsc --noEmit -p tsconfig.app.json` (pas `npx tsc --noEmit` seul, qui est un faux positif dans ce dépôt).

---

### Task 1: Configuration Supabase + réécriture d'`authStore.ts`

**Files:**
- Create: `app/src/vite-env.d.ts`
- Create: `app/src/data/supabaseClient.ts`
- Modify: `app/src/data/authStore.ts`

**Interfaces:**
- Produces: `supabase` (client Supabase exporté depuis `supabaseClient.ts`) ; `login(email, password): Promise<{ok, error?}>`, `register(data): Promise<{ok, error?}>`, `logout(): Promise<void>`, `isAuthenticated(): Promise<boolean>`, `getCurrentUser(): AuthUser | null` (reste synchrone), `resetPassword(email): Promise<{ok, error?}>` (nouvelle fonction) — toutes exportées depuis `authStore.ts`. `AuthUser`, `DEMO_ACCOUNTS`, `STUDIO_NAME_KEY` gardent leur forme actuelle.

- [ ] **Step 1: Installer le SDK Supabase**

Run (depuis `app/`): `npm install @supabase/supabase-js`

- [ ] **Step 2: Créer les types d'environnement Vite**

Créer `app/src/vite-env.d.ts` :

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_SUPABASE_URL: string;
  readonly VITE_SUPABASE_ANON_KEY: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}
```

- [ ] **Step 3: Créer le client Supabase**

Créer `app/src/data/supabaseClient.ts` :

```ts
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
```

- [ ] **Step 4: Réécrire `authStore.ts` en entier**

Remplacer tout le contenu de `app/src/data/authStore.ts` par :

```ts
import { USERS } from './mock';
import { supabase } from './supabaseClient';

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
  await supabase.auth.signOut();
}

export async function resetPassword(email: string): Promise<{ ok: boolean; error?: string }> {
  if (!email.trim()) return { ok: false, error: 'auth.requiredFields' };
  const { error } = await supabase.auth.resetPasswordForEmail(email.toLowerCase().trim());
  if (error) return { ok: false, error: 'auth.requiredFields' };
  return { ok: true };
}
```

**Note importante pour l'implémenteur :** ce fichier passe de fonctions synchrones à des fonctions `async` pour `login`, `register`, `logout`, `isAuthenticated` (mais **PAS** `getCurrentUser`, qui reste synchrone — voir le commentaire dans le code). Les 5 fichiers qui appellent ces fonctions sont mis à jour dans les tâches suivantes ; ne pas les toucher dans cette tâche.

- [ ] **Step 5: Typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "authStore.ts|supabaseClient.ts|vite-env.d.ts"`

Résultat attendu : des erreurs dans les fichiers qui appellent encore `login()`/`register()`/`logout()`/`isAuthenticated()` de façon synchrone (`main.tsx`, `Login.tsx`, `Register.tsx`, `GlobalTopBar.tsx`) — c'est normal, ces fichiers sont corrigés dans les tâches suivantes. Aucune erreur ne doit apparaître dans `authStore.ts`, `supabaseClient.ts` ou `vite-env.d.ts` eux-mêmes.

- [ ] **Step 6: Commit**

```bash
git add app/package.json app/package-lock.json app/src/vite-env.d.ts app/src/data/supabaseClient.ts app/src/data/authStore.ts
git commit -m "feat: replace mock auth with real Supabase authentication in authStore"
```

---

### Task 2: `main.tsx` — gardes de route asynchrones

**Files:**
- Modify: `app/src/main.tsx`

**Interfaces:**
- Consumes: `isAuthenticated(): Promise<boolean>` (Task 1).

- [ ] **Step 1: Rendre les loaders asynchrones**

Remplacer :

```tsx
// ── Route guards ──────────────────────────────────────────────────────────────
const authLoader = () => { if (!isAuthenticated()) return redirect('/login'); return null; };
const guestLoader = () => { if (isAuthenticated()) return redirect('/'); return null; };
```

par :

```tsx
// ── Route guards ──────────────────────────────────────────────────────────────
const authLoader = async () => { if (!(await isAuthenticated())) return redirect('/login'); return null; };
const guestLoader = async () => { if (await isAuthenticated()) return redirect('/'); return null; };
```

- [ ] **Step 2: Typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "main.tsx"`
Attendu : aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add app/src/main.tsx
git commit -m "fix: make route guard loaders async for real Supabase session check"
```

---

### Task 3: `Login.tsx` — connexion asynchrone

**Files:**
- Modify: `app/src/screens/Login.tsx`

**Interfaces:**
- Consumes: `login(email, password): Promise<{ok, error?}>` (Task 1).

- [ ] **Step 1: Rendre `handleSubmit` asynchrone**

Remplacer :

```tsx
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      const result = login(email, password);
      if (result.ok) {
        navigate('/', { replace: true });
      } else {
        setError(t(result.error!));
        setLoading(false);
      }
    }, 400);
  };
```

par :

```tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    const result = await login(email, password);
    if (result.ok) {
      navigate('/', { replace: true });
    } else {
      setError(t(result.error!));
      setLoading(false);
    }
  };
```

**Note :** le `setTimeout` de 400ms simulait un délai réseau artificiel pour le mock — il est retiré car `await login(...)` prend désormais un vrai temps réseau pour les comptes non-démo. Les comptes démo (résolus en interne sans appel réseau) resteront quasi instantanés, ce qui est le comportement souhaité.

- [ ] **Step 2: Typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "Login.tsx"`
Attendu : aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/Login.tsx
git commit -m "fix: await async login() in Login screen"
```

---

### Task 4: `Register.tsx` — inscription asynchrone

**Files:**
- Modify: `app/src/screens/Register.tsx`

**Interfaces:**
- Consumes: `register(data): Promise<{ok, error?}>` (Task 1).

- [ ] **Step 1: Rendre `handleSubmit` asynchrone**

Remplacer :

```tsx
  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setLoading(true);
    setError('');
    setTimeout(() => {
      const result = register({ studioName, name, email, password });
      if (result.ok) {
        navigate('/onboarding', { replace: true });
      } else {
        setError(t(result.error!));
        setLoading(false);
      }
    }, 400);
  };
```

par :

```tsx
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setLoading(true);
    setError('');
    const result = await register({ studioName, name, email, password });
    if (result.ok) {
      navigate('/onboarding', { replace: true });
    } else {
      setError(t(result.error!));
      setLoading(false);
    }
  };
```

- [ ] **Step 2: Typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "Register.tsx"`
Attendu : aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/Register.tsx
git commit -m "fix: await async register() in Register screen"
```

---

### Task 5: `ForgotPassword.tsx` — vrai envoi de courriel de réinitialisation

**Files:**
- Modify: `app/src/screens/ForgotPassword.tsx`

**Interfaces:**
- Consumes: `resetPassword(email): Promise<{ok, error?}>` (Task 1, nouvelle fonction).

- [ ] **Step 1: Importer `resetPassword` et `useTranslation` (déjà importé) reste, ajouter l'import**

Remplacer :

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setTimeout(() => { setSent(true); setLoading(false); }, 600);
  };
```

par :

```tsx
import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { resetPassword } from '../data/authStore';

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setError('');
    const result = await resetPassword(email);
    if (result.ok) {
      setSent(true);
    } else {
      setError(t(result.error!));
    }
    setLoading(false);
  };
```

- [ ] **Step 2: Ajouter l'affichage d'erreur dans le formulaire**

Remplacer (juste avant le bouton submit) :

```tsx
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                  {t('auth.email')}
                </label>
                <input
                  type="email" value={email} autoFocus
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '11px 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)', outline: 'none',
                  }}
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                />
              </div>

              <button
```

par :

```tsx
            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                  {t('auth.email')}
                </label>
                <input
                  type="email" value={email} autoFocus
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '11px 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)', outline: 'none',
                  }}
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 9, marginBottom: 16,
                  background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <SFIcon name="alert-circle" size={14} color="var(--danger)" />
                  <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
                </div>
              )}

              <button
```

- [ ] **Step 3: Typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "ForgotPassword.tsx"`
Attendu : aucune sortie.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ForgotPassword.tsx
git commit -m "feat: wire ForgotPassword to real Supabase password reset email"
```

---

### Task 6: `GlobalTopBar.tsx` — déconnexion asynchrone

**Files:**
- Modify: `app/src/components/layout/GlobalTopBar.tsx:199`

**Interfaces:**
- Consumes: `logout(): Promise<void>` (Task 1).

- [ ] **Step 1: Marquer l'appel comme volontairement non attendu**

Remplacer :

```tsx
              <MenuRow icon="log-out" label={t('auth.logout')} danger onClick={() => { setShowUserMenu(false); logout(); navigate('/login', { replace: true }); }} />
```

par :

```tsx
              <MenuRow icon="log-out" label={t('auth.logout')} danger onClick={() => { setShowUserMenu(false); void logout(); navigate('/login', { replace: true }); }} />
```

**Note :** `void logout()` indique explicitement qu'on ne bloque pas la navigation sur la fin de l'appel réseau `signOut()` — la session locale démo est déjà effacée de façon synchrone au tout début de `logout()`, donc l'utilisateur voit l'effet immédiatement peu importe la latence réseau du `signOut()` Supabase en arrière-plan.

- [ ] **Step 2: Typecheck**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "GlobalTopBar.tsx"`
Attendu : aucune sortie.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/layout/GlobalTopBar.tsx
git commit -m "fix: mark async logout() call as intentionally unawaited in GlobalTopBar"
```

---

### Task 7: Vérification manuelle de bout en bout

**Files:** aucun (vérification seulement).

**Interfaces:** aucune.

- [ ] **Step 1: Connexion démo (comportement inchangé)**

Via l'outil Preview : aller sur `/login`, cliquer sur un des 3 comptes démo, se connecter. Confirmer l'accès immédiat à l'app, sans appel réseau à Supabase (vérifier via `preview_network` qu'aucune requête vers le domaine Supabase n'est faite pour ce chemin).

- [ ] **Step 2: Vraie inscription**

Aller sur `/register`, remplir le formulaire avec un email réel jamais utilisé (ex. `test+phase1@exemple.com`), un mot de passe de 8+ caractères, soumettre. Confirmer la redirection vers `/onboarding`. Aller dans le tableau de bord Supabase (Authentication → Users) et confirmer qu'un nouvel utilisateur est apparu avec cet email.

- [ ] **Step 3: Vraie connexion**

Se déconnecter, retourner sur `/login`, se connecter avec l'email et le mot de passe utilisés à l'étape 2. Confirmer l'accès à l'app.

- [ ] **Step 4: Mauvais mot de passe**

Sur `/login`, entrer l'email de l'étape 2 avec un mauvais mot de passe. Confirmer l'affichage du message d'erreur (`auth.invalidCredentials`), pas d'accès à l'app.

- [ ] **Step 5: Persistance de session**

Une fois connecté (via l'étape 3), recharger complètement la page (`Ctrl+Shift+R` ou équivalent). Confirmer que la session reste active (pas de redirection vers `/login`).

- [ ] **Step 6: Réinitialisation de mot de passe**

Sur `/forgot-password`, entrer l'email de l'étape 2, soumettre. Confirmer l'affichage de l'écran de succès. Vérifier (si possible) la réception réelle d'un courriel de Supabase.

- [ ] **Step 7: Déconnexion**

Depuis l'app, se déconnecter via le menu utilisateur. Confirmer le retour à `/login` et qu'un rechargement de page ne redonne pas accès à l'app tant qu'on ne se reconnecte pas.

- [ ] **Step 8: Typecheck complet**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Comparer avec le compte de référence d'avant ce plan (190 erreurs préexistantes, sans lien avec ce chantier). Attendu : aucune nouvelle erreur introduite par ce plan.

- [ ] **Step 9: Lint**

Run (depuis `app/`): `npm run lint 2>&1 | grep -A5 "authStore.ts\|main.tsx\|Login.tsx\|Register.tsx\|ForgotPassword.tsx\|GlobalTopBar.tsx\|supabaseClient.ts"`
Attendu : aucune nouvelle erreur (comparer tout résultat contre la version de base du fichier via `git show`, ce dépôt a une dette de lint préexistante sans lien avec ce chantier).
