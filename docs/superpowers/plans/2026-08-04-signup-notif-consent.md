# Consentement notifications à l'inscription — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add an opt-in checkbox to every account-creation form so users explicitly consent (or decline) to email notifications at signup, and persist that choice immediately instead of relying on an implicit fallback.

**Architecture:** A new `initNotifPrefsOnSignup(emailOptIn)` function in `notifPrefsStore.ts` writes an initial `notif_prefs` row right after Supabase `signUp()` succeeds. `register()` and `registerClient()` in `authStore.ts` gain an `emailOptIn` parameter and call it. Three screens (`Register.tsx`, `TeamInvitationAccept.tsx`, `ClientInvitationAccept.tsx`) each get a checkbox, defaulted to checked, wired into their existing local state and submit handlers.

**Tech Stack:** React 19 + TypeScript, Supabase (`notif_prefs` table), react-i18next.

## Global Constraints

- Checkbox defaults to **checked** in all 3 forms.
- Unchecked → all three categories (`comment`, `mention`, `approval`) get `email: false`; `inapp` stays `true` in every category regardless of the checkbox — in-app is never optional.
- Checked → identical to today's `DEFAULTS` (`comment` email off, `mention`/`approval` email on).
- Digest preferences (`DigestPrefs`) are untouched — out of scope.
- If the `notif_prefs` upsert fails, signup must still succeed (`console.error` and continue) — never block account creation on this write.
- No automated test suite in this project (see `CLAUDE.md`); verification is `npx tsc --noEmit -p tsconfig.app.json` plus manual checks against the Supabase table via the dev server.
- New copy goes through i18n (`auth.emailOptIn` key in `fr.json`/`en.json`) — no hardcoded UI text, per project convention.

---

### Task 1: `initNotifPrefsOnSignup` in `notifPrefsStore.ts`

**Files:**
- Modify: `app/src/data/notifPrefsStore.ts`

**Interfaces:**
- Consumes: existing `NotifPrefs`, `ChannelPrefs`, `NOTIF_EVENTS`, `DEFAULTS`, `supabase` (all already in this file).
- Produces: `export async function initNotifPrefsOnSignup(emailOptIn: boolean): Promise<void>` — used by Task 2 (`authStore.ts`).

- [ ] **Step 1: Add the function**

Insert this right after the existing `saveSupabasePrefs` function (after line 59, before the `// ── Public API` comment) in `app/src/data/notifPrefsStore.ts`:

```ts
// Called once, right after a brand-new Supabase Auth account is created
// (register()/registerClient() in authStore.ts) — writes the user's signup
// consent choice as an explicit notif_prefs row instead of leaving it to
// the implicit DEFAULTS fallback in loadNotifPrefs(). Never called for demo
// sessions (registration doesn't exist there) or for pre-existing users.
export async function initNotifPrefsOnSignup(emailOptIn: boolean): Promise<void> {
  const prefs: NotifPrefs = emailOptIn
    ? DEFAULTS
    : Object.fromEntries(NOTIF_EVENTS.map(e => [e.key, { inapp: true, email: false }]));
  await saveSupabasePrefs(prefs);
}
```

- [ ] **Step 2: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/notifPrefsStore.ts
git commit -m "feat(notifs): add initNotifPrefsOnSignup for explicit signup consent"
```

---

### Task 2: Wire `emailOptIn` through `authStore.ts`

**Files:**
- Modify: `app/src/data/authStore.ts`

**Interfaces:**
- Consumes: `initNotifPrefsOnSignup(emailOptIn: boolean): Promise<void>` from Task 1 (import from `./notifPrefsStore`).
- Produces: `register(data: { studioName, name, email, password, emailOptIn })` and `registerClient(data: { name, email, password, emailOptIn })` — both now require `emailOptIn: boolean` in their input object. Consumed by Task 3, 4, 5.

- [ ] **Step 1: Import the new function**

At the top of `app/src/data/authStore.ts`, add to the imports:

```ts
import { initNotifPrefsOnSignup } from './notifPrefsStore';
```

- [ ] **Step 2: Update `register()`**

In `app/src/data/authStore.ts`, replace the `register` function (currently lines 114-148) with:

```ts
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

  localStorage.setItem(STUDIO_NAME_KEY, data.studioName.trim());
  void initNotifPrefsOnSignup(data.emailOptIn).catch(err => console.error('initNotifPrefsOnSignup failed', err));
  return { ok: true };
}
```

- [ ] **Step 3: Update `registerClient()`**

In the same file, replace the `registerClient` function (currently lines 158-189) with:

```ts
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

  void initNotifPrefsOnSignup(data.emailOptIn).catch(err => console.error('initNotifPrefsOnSignup failed', err));
  return { ok: true };
}
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: errors at every call site of `register()`/`registerClient()` that doesn't yet pass `emailOptIn` (`Register.tsx`, `TeamInvitationAccept.tsx`, `ClientInvitationAccept.tsx`) — this is expected at this point in the plan; Tasks 3-5 fix them.

- [ ] **Step 5: Commit**

```bash
git add app/src/data/authStore.ts
git commit -m "feat(auth): require emailOptIn on register()/registerClient()"
```

---

### Task 3: i18n key for the checkbox label

**Files:**
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Produces: translation key `auth.emailOptIn`, consumed by Tasks 4-6.

- [ ] **Step 1: Add the French key**

In `app/src/locales/fr.json`, inside the `auth` object, add a new line right after `"registerButton": "Créer le compte",` (line 2476):

```json
    "emailOptIn": "Je souhaite recevoir des notifications par courriel (mentions, approbations, etc.) — modifiable à tout moment dans Paramètres.",
```

- [ ] **Step 2: Add the English key**

In `app/src/locales/en.json`, inside the `auth` object, add a new line right after `"registerButton": "Create account",` (line 2463):

```json
    "emailOptIn": "I'd like to receive email notifications (mentions, approvals, etc.) — you can change this anytime in Settings.",
```

- [ ] **Step 3: Verify JSON is still valid**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no JSON-parsing errors (a broken JSON file causes an immediate `tsc` failure on the import). Pre-existing errors from Task 2's call sites are still expected here.

- [ ] **Step 4: Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "i18n: add auth.emailOptIn translation key"
```

---

### Task 4: Checkbox in `Register.tsx`

**Files:**
- Modify: `app/src/screens/Register.tsx`

**Interfaces:**
- Consumes: `t('auth.emailOptIn')` from Task 3; `register({ ..., emailOptIn })` signature from Task 2.

- [ ] **Step 1: Add local state**

In `app/src/screens/Register.tsx`, in the `Register()` component, right after the existing `const [loading, setLoading] = useState(false);` (line 55), add:

```ts
  const [emailOptIn, setEmailOptIn] = useState(true);
```

- [ ] **Step 2: Pass it into the `register()` call**

Replace line 62:

```ts
    const result = await register({ studioName, name, email, password });
```

with:

```ts
    const result = await register({ studioName, name, email, password, emailOptIn });
```

- [ ] **Step 3: Render the checkbox**

In the same file, insert this block right after the `Field` for `confirm` (currently lines 155-156, right before the `{/* Error */}` comment on line 158):

```tsx
            <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginBottom: 16 }}>
              <input
                type="checkbox"
                checked={emailOptIn}
                onChange={e => setEmailOptIn(e.target.checked)}
                style={{ accentColor: 'var(--accent)', flexShrink: 0, marginTop: 2 }}
              />
              <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('auth.emailOptIn')}</span>
            </label>
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no more errors pointing at `Register.tsx`. Errors at `TeamInvitationAccept.tsx`/`ClientInvitationAccept.tsx` are still expected until Tasks 5-6.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/Register.tsx
git commit -m "feat(auth): add email-notification consent checkbox to Register.tsx"
```

---

### Task 5: Checkbox in `TeamInvitationAccept.tsx`

**Files:**
- Modify: `app/src/screens/TeamInvitationAccept.tsx`

**Interfaces:**
- Consumes: `t('auth.emailOptIn')` from Task 3; `register({ ..., emailOptIn })` signature from Task 2.

- [ ] **Step 1: Add local state**

In `app/src/screens/TeamInvitationAccept.tsx`, right after `const [submitting, setSubmitting] = useState(false);` (line 63), add:

```ts
  const [emailOptIn, setEmailOptIn] = useState(true);
```

- [ ] **Step 2: Pass it into the `register()` call**

Replace the `register({...})` call (currently lines 124-129):

```ts
    const result = await register({
      studioName: invitation.studioName,
      name,
      email: invitation.email,
      password,
    });
```

with:

```ts
    const result = await register({
      studioName: invitation.studioName,
      name,
      email: invitation.email,
      password,
      emailOptIn,
    });
```

- [ ] **Step 3: Render the checkbox**

In the same file's `mode === 'register'` form (the return statement starting at line 297), insert this block right after the confirm-password field (currently lines 319-322, right before the `{error && (...)}` block that starts on line 324):

```tsx
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={emailOptIn}
            onChange={e => setEmailOptIn(e.target.checked)}
            style={{ accentColor: 'var(--accent)', flexShrink: 0, marginTop: 2 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('auth.emailOptIn')}</span>
        </label>
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no more errors pointing at `TeamInvitationAccept.tsx`. Errors at `ClientInvitationAccept.tsx` are still expected until Task 6.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/TeamInvitationAccept.tsx
git commit -m "feat(auth): add email-notification consent checkbox to TeamInvitationAccept.tsx"
```

---

### Task 6: Checkbox in `ClientInvitationAccept.tsx`

**Files:**
- Modify: `app/src/screens/ClientInvitationAccept.tsx`

**Interfaces:**
- Consumes: `t('auth.emailOptIn')` from Task 3; `registerClient({ ..., emailOptIn })` signature from Task 2.

- [ ] **Step 1: Add local state**

In `app/src/screens/ClientInvitationAccept.tsx`, find the `const [submitting, setSubmitting] = useState(false);` line (same pattern as `TeamInvitationAccept.tsx`, near the top of the component) and add right after it:

```ts
  const [emailOptIn, setEmailOptIn] = useState(true);
```

- [ ] **Step 2: Pass it into the `registerClient()` call**

Replace the `registerClient({...})` call (currently lines 125-129):

```ts
    const result = await registerClient({
      name,
      email: invitation.contactEmail,
      password,
    });
```

with:

```ts
    const result = await registerClient({
      name,
      email: invitation.contactEmail,
      password,
      emailOptIn,
    });
```

- [ ] **Step 3: Render the checkbox**

In the same file's registration form (the return statement starting at line 296), insert this block right after the confirm-password field (currently lines 317-320, right before the `{error && (...)}` block that starts on line 322):

```tsx
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 9, cursor: 'pointer', marginBottom: 16 }}>
          <input
            type="checkbox"
            checked={emailOptIn}
            onChange={e => setEmailOptIn(e.target.checked)}
            style={{ accentColor: 'var(--accent)', flexShrink: 0, marginTop: 2 }}
          />
          <span style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.5 }}>{t('auth.emailOptIn')}</span>
        </label>
```

- [ ] **Step 4: Typecheck**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no errors anywhere in the project.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ClientInvitationAccept.tsx
git commit -m "feat(auth): add email-notification consent checkbox to ClientInvitationAccept.tsx"
```

---

### Task 7: Manual verification against a real Supabase account

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Start the dev server**

Use the project's preview tooling to start `rush-app` (per `.claude/launch.json`) and open it in the browser.

- [ ] **Step 2: Register a brand-new real account with the checkbox checked**

Go to `/register`, fill in a throwaway studio name/email/password, leave the new checkbox checked (default), submit.

- [ ] **Step 3: Confirm the row in Supabase**

In the Supabase dashboard, open **Table Editor → `notif_prefs`**, find the row for the new user, and confirm `prefs` matches:

```json
{"comment":{"inapp":true,"email":false},"mention":{"inapp":true,"email":true},"approval":{"inapp":true,"email":true}}
```

- [ ] **Step 4: Confirm Paramètres reflects it**

Log in as that user, go to **Paramètres → Notifications**, and confirm the toggles for Mentions/Approbations show email enabled, Commentaires shows email disabled — matching what Step 3 confirmed in the database.

- [ ] **Step 5: Repeat with the checkbox unchecked**

Register a second throwaway account with the checkbox unchecked. Confirm in Supabase that all three categories show `"email":false` and all three show `"inapp":true`.

- [ ] **Step 6: Spot-check one invitation flow**

Pick either the team-invitation or client-invitation flow (whichever is easier to set up with existing test data), accept an invitation through the registration branch with the checkbox left checked, and confirm the resulting `notif_prefs` row looks the same as Step 3.

No commit for this task — it's verification only.
