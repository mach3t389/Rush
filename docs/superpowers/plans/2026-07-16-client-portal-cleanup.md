# Client Portal Cleanup Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fix three small, independent issues found during Step B's live testing: invitation screens showing generic Rush branding instead of the inviting studio's own logo, a member-detail panel footer that truncates its action buttons, and a permission picker that's shown (and silently inert) for client contacts who don't need it.

**Architecture:** Each of the three fixes is self-contained and touches a disjoint set of files — there is no shared code between them beyond patterns already established in Step A/B (extending a `security definer` RPC's return columns via drop+recreate, the `isDemoSession()` branch convention). Tasks are grouped by fix, not interleaved.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS), i18next. No automated test suite in this project (per `CLAUDE.md`) — verification is `npm run build` (TypeScript check) after each code task, plus a manual browser walkthrough in the final task.

## Global Constraints

- Never hardcode user-facing text — all UI strings go through `t('namespace.key')`. This chantier does not add any new user-facing text (it changes layout and data flow, not copy), so no new i18n keys are needed — confirm this holds true task by task rather than assuming it.
- Supabase migrations are never applied automatically in this project — the SQL file this plan produces must be pasted into Supabase → SQL Editor by the user manually (or applied via the Supabase MCP tool if the user explicitly authorizes it, as was done for a prior hotfix in this same feature line).
- Demo sessions (`isDemoSession()` true) must keep working exactly as today — `getLogoFull()`/`getLogoSquare()` (from `studioLogoStore.ts`) already work correctly in demo mode without any RPC involvement; only the real-session RPC path needs new columns.
- The two invitation screens (`ClientInvitationAccept.tsx`, `TeamInvitationAccept.tsx`) are near-literal duplicates by established project convention (see Step B's plan) — keep them that way; apply the same `Shell` change to both rather than extracting a shared component (out of scope, unrelated refactor).
- Explicitly out of scope for this plan (per the design spec): `Login.tsx`, `Register.tsx`, `ForgotPassword.tsx`, `NoOrganization.tsx`, `Pricing.tsx` keep their generic Rush branding unchanged — do not touch these files.

---

### Task 1: Supabase migration — expose studio logo to the two invitation RPCs

**Files:**
- Create: `docs/superpowers/specs/2026-07-16-invitation-studio-logo-migration.sql`

**Interfaces:**
- Produces: `get_client_invitation(p_token text)` returns two new columns `studio_logo_full text`, `studio_logo_square text`. `get_studio_invitation(p_token text)` returns the same two new columns. Consumed by Task 2 (`invitationStore.ts`) and Task 3 (`teamStore.ts`).

- [ ] **Step 1: Write the migration file**

```sql
-- 2026-07-16 — Client portal cleanup: expose the inviting studio's logo to
-- the two invitation RPCs, so ClientInvitationAccept.tsx and
-- TeamInvitationAccept.tsx can show the studio's own branding instead of
-- generic Rush branding. See
-- docs/superpowers/specs/2026-07-16-client-portal-cleanup-design.md.
--
-- MANUAL STEP REQUIRED: paste this whole file into Supabase → SQL Editor
-- and run it (or apply via an authorized Supabase MCP tool call, with
-- explicit user confirmation — do not apply automatically). Nothing in
-- this project applies migrations automatically — see CLAUDE.md's
-- "Migrations Supabase" section.
--
-- Both functions are dropped and recreated (not `create or replace`)
-- because Postgres rejects changing a RETURNS TABLE column list in place —
-- same reasoning as every prior invitation-RPC column addition in this
-- project (see 2026-07-13-invitation-email-check-migration.sql and
-- 2026-07-15-client-access-migration.sql).

-- ─────────────────────────────────────────────────────────────────────────
-- 1. get_client_invitation: add studio_logo_full / studio_logo_square.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists get_client_invitation(text);

create or replace function get_client_invitation(p_token text)
returns table (
  outcome text,
  client_id text,
  client_name text,
  contact_id text,
  contact_name text,
  contact_email text,
  portal_permissions jsonb,
  studio_name text,
  studio_logo_full text,
  studio_logo_square text
)
language sql security definer as $$
  select ci.outcome, ci.client_id, c.name, ci.contact_id, cc.name, cc.email, cc.portal_permissions, s.name, s.logo_full, s.logo_square
  from client_invitations ci
  join clients c on c.id = ci.client_id
  join client_contacts cc on cc.id = ci.contact_id
  join studios s on s.id = ci.studio_id
  where ci.token = p_token;
$$;
grant execute on function get_client_invitation(text) to anon, authenticated;

-- ─────────────────────────────────────────────────────────────────────────
-- 2. get_studio_invitation: add studio_logo_full / studio_logo_square.
-- ─────────────────────────────────────────────────────────────────────────

drop function if exists get_studio_invitation(text);

create or replace function get_studio_invitation(p_token text)
returns table (email text, role text, studio_name text, status text, studio_id uuid, studio_logo_full text, studio_logo_square text)
language sql security definer as $$
  select si.email, si.role, s.name, si.status, si.studio_id, s.logo_full, s.logo_square
  from studio_invitations si
  join studios s on s.id = si.studio_id
  where si.token = p_token;
$$;
grant execute on function get_studio_invitation(text) to anon, authenticated;
```

- [ ] **Step 2: Ask the user to run the migration**

This step cannot be automated. Tell the user: "Colle et exécute `docs/superpowers/specs/2026-07-16-invitation-studio-logo-migration.sql` dans Supabase → SQL Editor (ou dis-moi si tu veux que je l'applique directement comme pour le dernier correctif)." Do not proceed to real-session verification (Task 8) until the user confirms this ran.

- [ ] **Step 3: Commit**

```bash
git add docs/superpowers/specs/2026-07-16-invitation-studio-logo-migration.sql
git commit -m "docs: add migration exposing studio logo to invitation RPCs"
```

---

### Task 2: `invitationStore.ts` — carry the studio logo through `InvitationDetails`

**Files:**
- Modify: `app/src/data/invitationStore.ts`

**Interfaces:**
- Consumes: `getLogoFull()`, `getLogoSquare()` from `./studioLogoStore` (new import).
- Produces: `InvitationDetails.studioLogoFull: string | null`, `InvitationDetails.studioLogoSquare: string | null`. Consumed by Task 4 (`ClientInvitationAccept.tsx`).

- [ ] **Step 1: Add the two fields to `InvitationDetails`**

Replace:

```ts
export interface InvitationDetails {
  outcome: 'pending' | 'accepted' | 'declined';
  clientId: string;
  clientName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  portalPermissions: PortalPermissions;
  studioName: string;
}
```

with:

```ts
export interface InvitationDetails {
  outcome: 'pending' | 'accepted' | 'declined';
  clientId: string;
  clientName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  portalPermissions: PortalPermissions;
  studioName: string;
  studioLogoFull: string | null;
  studioLogoSquare: string | null;
}
```

- [ ] **Step 2: Import the logo store**

Replace:

```ts
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { findClient } from './clientStore';
import { getClientTeam, setClientTeam, removeClientTeamMember } from './clientTeamStore';
import { STUDIO_NAME_KEY } from './authStore';
import { DEFAULT_PORTAL_PERMISSIONS, type PortalPermissions } from './clientContactsStore';
```

with:

```ts
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { findClient } from './clientStore';
import { getClientTeam, setClientTeam, removeClientTeamMember } from './clientTeamStore';
import { STUDIO_NAME_KEY } from './authStore';
import { DEFAULT_PORTAL_PERMISSIONS, type PortalPermissions } from './clientContactsStore';
import { getLogoFull, getLogoSquare } from './studioLogoStore';
```

(If the existing import block's exact line order differs slightly from what's shown, just add the new `getLogoFull, getLogoSquare` import line anywhere among the other `import ... from './...'` lines at the top of the file — order doesn't matter functionally.)

- [ ] **Step 3: Populate the two fields in both branches of `getInvitationDetails`**

Replace:

```ts
    return {
      outcome: invitation.outcome,
      clientId: client.id,
      clientName: client.name,
      contactId: invitation.contactId,
      contactName: contact?.name ?? '',
      contactEmail: contact?.email ?? '',
      portalPermissions: contact?.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS,
      studioName: localStorage.getItem(STUDIO_NAME_KEY) ?? 'Rush',
    };
  }

  const { data, error } = await supabase.rpc('get_client_invitation', { p_token: token });
  if (error) { console.error('getInvitationDetails failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    outcome: row.outcome,
    clientId: row.client_id,
    clientName: row.client_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email ?? '',
    portalPermissions: row.portal_permissions ?? DEFAULT_PORTAL_PERMISSIONS,
    studioName: row.studio_name ?? 'Rush',
  };
}
```

with:

```ts
    return {
      outcome: invitation.outcome,
      clientId: client.id,
      clientName: client.name,
      contactId: invitation.contactId,
      contactName: contact?.name ?? '',
      contactEmail: contact?.email ?? '',
      portalPermissions: contact?.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS,
      studioName: localStorage.getItem(STUDIO_NAME_KEY) ?? 'Rush',
      studioLogoFull: getLogoFull(),
      studioLogoSquare: getLogoSquare(),
    };
  }

  const { data, error } = await supabase.rpc('get_client_invitation', { p_token: token });
  if (error) { console.error('getInvitationDetails failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;

  return {
    outcome: row.outcome,
    clientId: row.client_id,
    clientName: row.client_name,
    contactId: row.contact_id,
    contactName: row.contact_name,
    contactEmail: row.contact_email ?? '',
    portalPermissions: row.portal_permissions ?? DEFAULT_PORTAL_PERMISSIONS,
    studioName: row.studio_name ?? 'Rush',
    studioLogoFull: row.studio_logo_full ?? null,
    studioLogoSquare: row.studio_logo_square ?? null,
  };
}
```

- [ ] **Step 4: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors from `invitationStore.ts`. (There may be a NEW error in `ClientInvitationAccept.tsx` complaining that `InvitationDetails` gained required fields it doesn't yet handle — TypeScript does not error on unused-but-present object fields, so this should not actually happen; if it does, it means some other file constructs an `InvitationDetails` literal by hand — find it and report before continuing, don't guess a fix.)

- [ ] **Step 5: Commit**

```bash
git add app/src/data/invitationStore.ts
git commit -m "feat: carry studio logo through InvitationDetails"
```

---

### Task 3: `teamStore.ts` — carry the studio logo through `TeamInvitationInfo`

**Files:**
- Modify: `app/src/data/teamStore.ts`

**Interfaces:**
- Produces: `TeamInvitationInfo.studioLogoFull: string | null`, `TeamInvitationInfo.studioLogoSquare: string | null`. Consumed by Task 5 (`TeamInvitationAccept.tsx`).

- [ ] **Step 1: Add the two fields and map them**

Replace:

```ts
export interface TeamInvitationInfo {
  email: string;
  role: string;
  studioName: string;
  status: 'pending' | 'accepted';
  studioId: string;
}

export async function getInvitationByToken(token: string): Promise<TeamInvitationInfo | null> {
  const { data, error } = await supabase.rpc('get_studio_invitation', { p_token: token });
  if (error) { console.error('getInvitationByToken failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return { email: row.email, role: row.role, studioName: row.studio_name, status: row.status, studioId: row.studio_id };
}
```

with:

```ts
export interface TeamInvitationInfo {
  email: string;
  role: string;
  studioName: string;
  status: 'pending' | 'accepted';
  studioId: string;
  studioLogoFull: string | null;
  studioLogoSquare: string | null;
}

export async function getInvitationByToken(token: string): Promise<TeamInvitationInfo | null> {
  const { data, error } = await supabase.rpc('get_studio_invitation', { p_token: token });
  if (error) { console.error('getInvitationByToken failed', error); return null; }
  const row = Array.isArray(data) ? data[0] : data;
  if (!row) return null;
  return {
    email: row.email,
    role: row.role,
    studioName: row.studio_name,
    status: row.status,
    studioId: row.studio_id,
    studioLogoFull: row.studio_logo_full ?? null,
    studioLogoSquare: row.studio_logo_square ?? null,
  };
}
```

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors from `teamStore.ts`.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/teamStore.ts
git commit -m "feat: carry studio logo through TeamInvitationInfo"
```

---

### Task 4: `ClientInvitationAccept.tsx` — show the studio's logo

**Files:**
- Modify: `app/src/screens/ClientInvitationAccept.tsx`

**Interfaces:**
- Consumes: `InvitationDetails.studioLogoFull` (Task 2).
- Produces: no new exports — `Shell` gains an optional `logoUrl` prop, used only within this file.

- [ ] **Step 1: Give `Shell` an optional `logoUrl` prop**

Replace:

```tsx
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={14} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </div>
        {children}
      </div>
    </div>
  );
}
```

with:

```tsx
function Shell({ children, logoUrl }: { children: React.ReactNode; logoUrl?: string | null }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ height: 32, maxWidth: 240, objectFit: 'contain' }} />
          ) : (
            <>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SFIcon name="play" size={14} color="#0b0b0b" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
            </>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass `logoUrl` at every `<Shell>` call site**

There are 7 `<Shell>` usages in this file (loading, invalid, wrong-account, logged-in-join, choose, login, register — one return statement each). Add `logoUrl={invitation?.studioLogoFull}` to every one of them. Since `invitation` is `InvitationDetails | null` state already declared in the component, this is safe even before it loads (renders `undefined`/`null` → falls back to default Rush branding, which is correct for the loading/invalid states where there's nothing to show yet).

Find each `<Shell>` opening tag in the file (search for `<Shell>` — there should be exactly 7) and change it to `<Shell logoUrl={invitation?.studioLogoFull}>`. Do this for all 7 occurrences — they look like:

```tsx
  if (loadState === 'loading' || sessionEmail === undefined) {
    return <Shell logoUrl={invitation?.studioLogoFull}><p style={{ textAlign: 'center', color: 'var(--text-3)' }}>…</p></Shell>;
  }

  if (loadState === 'invalid') {
    return (
      <Shell logoUrl={invitation?.studioLogoFull}>
```

...and so on for the remaining 3 (wrong-account, logged-in-join, choose/login/register bottom three returns) — every `<Shell>` becomes `<Shell logoUrl={invitation?.studioLogoFull}>`, and every closing `</Shell>` stays exactly as-is (only the opening tag changes).

- [ ] **Step 3: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ClientInvitationAccept.tsx
git commit -m "feat: show the inviting studio's logo on ClientInvitationAccept"
```

---

### Task 5: `TeamInvitationAccept.tsx` — show the studio's logo

**Files:**
- Modify: `app/src/screens/TeamInvitationAccept.tsx`

**Interfaces:**
- Consumes: `TeamInvitationInfo.studioLogoFull` (Task 3).
- Produces: no new exports — same `Shell` pattern as Task 4, applied independently to this file (per the Global Constraints, these two screens stay separate, not extracted into a shared component).

- [ ] **Step 1: Give `Shell` an optional `logoUrl` prop**

Replace:

```tsx
function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={14} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </div>
        {children}
      </div>
    </div>
  );
}
```

with:

```tsx
function Shell({ children, logoUrl }: { children: React.ReactNode; logoUrl?: string | null }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          {logoUrl ? (
            <img src={logoUrl} alt="" style={{ height: 32, maxWidth: 240, objectFit: 'contain' }} />
          ) : (
            <>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SFIcon name="play" size={14} color="#0b0b0b" />
              </div>
              <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
            </>
          )}
        </div>
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Pass `logoUrl` at every `<Shell>` call site**

Same treatment as Task 4 Step 2, but using this file's state variable name: `invitation` here is typed `TeamInvitationInfo | null` (not `InvitationDetails`). Find every `<Shell>` opening tag in this file (there should be 7, matching the same loading/invalid/wrong-account/logged-in-join/choose/login/register structure as `ClientInvitationAccept.tsx`) and change each to `<Shell logoUrl={invitation?.studioLogoFull}>`.

- [ ] **Step 3: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/TeamInvitationAccept.tsx
git commit -m "feat: show the inviting studio's logo on TeamInvitationAccept"
```

---

### Task 6: `FicheClient.tsx` — two-row footer in the member detail panel

**Files:**
- Modify: `app/src/screens/FicheClient.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: nothing new — pure layout change, no signature changes.

- [ ] **Step 1: Restructure the footer into two rows**

Replace:

```tsx
          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>
                  {m.internal ? t('client.removeInternalConfirm') : t('client.removeContactConfirm')}
                </span>
                <SFButton variant="ghost" onClick={() => setConfirmDelete(false)}>{t('client.cancel')}</SFButton>
                <SFButton variant="ghost" onClick={() => { removeMember(m.id); onClose(); }} style={{ color: 'var(--danger)' }}>{t('client.remove')}</SFButton>
              </>
            ) : (
              <>
                <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--ff-text)', transition: 'all 0.15s' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,60,60,0.08)'; el.style.borderColor = 'var(--danger)'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'none'; el.style.borderColor = 'var(--border)'; }}>
                  <SFIcon name="user-minus" size={13} color="var(--danger)" />
                  {m.internal ? t('client.removeFromClient') : t('client.removeContact')}
                </button>
                <div style={{ flex: 1 }} />
                {!m.internal && (
                  <SFButton variant="ghost" icon="eye" onClick={handleViewAsPortal}>{t('viewAs.viewAs')}</SFButton>
                )}
                <SFButton variant="ghost" onClick={onClose}>{t('client.cancel')}</SFButton>
                <SFButton variant="primary" onClick={save}>{t('client.save')}</SFButton>
              </>
            )}

          {/* Project picker for multi-project clients */}
```

with:

```tsx
          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {confirmDelete ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>
                  {m.internal ? t('client.removeInternalConfirm') : t('client.removeContactConfirm')}
                </span>
                <SFButton variant="ghost" onClick={() => setConfirmDelete(false)}>{t('client.cancel')}</SFButton>
                <SFButton variant="ghost" onClick={() => { removeMember(m.id); onClose(); }} style={{ color: 'var(--danger)' }}>{t('client.remove')}</SFButton>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--ff-text)', transition: 'all 0.15s' }}
                    onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,60,60,0.08)'; el.style.borderColor = 'var(--danger)'; }}
                    onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'none'; el.style.borderColor = 'var(--border)'; }}>
                    <SFIcon name="user-minus" size={13} color="var(--danger)" />
                    {m.internal ? t('client.removeFromClient') : t('client.removeContact')}
                  </button>
                  <div style={{ flex: 1 }} />
                  {!m.internal && (
                    <SFButton variant="ghost" icon="eye" onClick={handleViewAsPortal}>{t('viewAs.viewAs')}</SFButton>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                  <SFButton variant="ghost" onClick={onClose}>{t('client.cancel')}</SFButton>
                  <SFButton variant="primary" onClick={save}>{t('client.save')}</SFButton>
                </div>
              </>
            )}

          {/* Project picker for multi-project clients */}
```

**Important — do not touch anything after this point.** The footer `<div>` opened above stays open past the "Project picker" block (which renders via `createPortal` to `document.body`, so it doesn't visually appear inside the footer despite being nested here in JSX) — its closing `</div>` is several dozen lines further down, right after that block's closing `})()}`. Do not add or remove any closing tags — this replacement only changes the content between the `{/* Footer */}` comment and the `{/* Project picker for multi-project clients */}` comment; everything from `{showProjectPicker && (() => {` onward is unchanged and must be left exactly as it is in the file.

- [ ] **Step 2: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors. If it reports a JSX structure error (mismatched tags), you likely disturbed the footer `<div>`'s closing tag further down the file — re-check that you only replaced the exact block specified above and left the project-picker block and its container's closing `</div>` untouched.

- [ ] **Step 3: Commit**

```bash
git add app/src/screens/FicheClient.tsx
git commit -m "fix: split the member panel footer into two rows so actions stop truncating"
```

---

### Task 7: `ProjectMembres.tsx` — hide the permission picker for client-contact-only selections

**Files:**
- Modify: `app/src/screens/ProjectMembres.tsx`

**Interfaces:**
- Consumes: nothing new.
- Produces: no new exports — internal logic change to `AddMemberModal`.

- [ ] **Step 1: Compute whether the current selection includes any internal member**

Replace:

```tsx
  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleConfirm = () => {
    const users = [...picked].map(id => allUsers[id]).filter(Boolean);
    if (users.length > 0) {
      users.forEach(u => savePermissions(u.id, perms));
      onAdd(users);
    }
  };
```

with:

```tsx
  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  // The permission-preset picker below writes to the internal PermissionKey
  // system (manage_projects, manage_files, etc.) — a client contact's real
  // permissions (approve/comment/download) live entirely separately, in
  // ClientContact.portalPermissions, set when they're added to the client's
  // own team in FicheClient.tsx. Showing this picker (and silently writing
  // an inert value) for a purely-external selection was confusing with no
  // effect — only apply/show it when at least one INTERNAL member is picked.
  const internalIds = new Set(internalTeam.map(u => u.id));
  const hasInternalPick = [...picked].some(id => internalIds.has(id));

  const handleConfirm = () => {
    const users = [...picked].map(id => allUsers[id]).filter(Boolean);
    if (users.length > 0) {
      users.filter(u => internalIds.has(u.id)).forEach(u => savePermissions(u.id, perms));
      onAdd(users);
    }
  };
```

- [ ] **Step 2: Only render the permission-preset section when `hasInternalPick` is true**

Replace:

```tsx
        {/* Permission presets */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            {t('members.permissions')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
            {PERMISSION_PRESETS.map(p => {
              const active = JSON.stringify([...perms].sort()) === JSON.stringify([...p.perms].sort());
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPerms(p.perms)}
                  style={{
                    padding: '7px 9px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                    transition: 'all 0.1s',
                  }}
                >
                  <p style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', margin: 0 }}>{t(p.labelKey)}</p>
                  <p style={{ fontSize: 9, color: 'var(--text-3)', margin: '1px 0 0', fontFamily: 'var(--ff-mono)', lineHeight: 1.35 }}>{t(p.descKey)}</p>
                </button>
              );
            })}
          </div>
        </div>
```

with:

```tsx
        {/* Permission presets — internal members only, see hasInternalPick above */}
        {hasInternalPick && (
          <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
            <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              {t('members.permissions')}
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
              {PERMISSION_PRESETS.map(p => {
                const active = JSON.stringify([...perms].sort()) === JSON.stringify([...p.perms].sort());
                return (
                  <button
                    key={p.key}
                    type="button"
                    onClick={() => setPerms(p.perms)}
                    style={{
                      padding: '7px 9px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                      border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                      background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                      transition: 'all 0.1s',
                    }}
                  >
                    <p style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', margin: 0 }}>{t(p.labelKey)}</p>
                    <p style={{ fontSize: 9, color: 'var(--text-3)', margin: '1px 0 0', fontFamily: 'var(--ff-mono)', lineHeight: 1.35 }}>{t(p.descKey)}</p>
                  </button>
                );
              })}
            </div>
          </div>
        )}
```

- [ ] **Step 3: Verify the TypeScript build**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run build`
Expected: succeeds with no new errors.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ProjectMembres.tsx
git commit -m "fix: hide the internal permission picker when only client contacts are selected"
```

---

### Task 8: Manual verification walkthrough

**Files:** none (verification only).

**Interfaces:** none.

- [ ] **Step 1: Demo-session sanity check**

Run: `cd "D:\Vibe Coding\Rush\app" && npm run dev`
Log in as a demo account (e.g. `lea.marchand@studioflow.fr`). Confirm no console errors on the dashboard.

- [ ] **Step 2: Verify the permission-picker fix (demo)**

Navigate to a project's Membres screen, open "Ajouter à l'équipe". Confirm: with only internal members checked, the "Autorisations" section appears as before. Uncheck internal, check only an external client contact (if the demo client has one) — confirm the "Autorisations" section disappears. Check both an internal and an external member together — confirm it reappears.

- [ ] **Step 3: Verify the footer layout fix (demo)**

Navigate to Clients → a client with at least one external contact → open that contact's "Fiche membre". Confirm the footer now shows two rows (Retirer/Voir en tant que on top, Annuler/Enregistrer on the bottom, right-aligned) and no buttons are cut off or overlapping.

- [ ] **Step 4: Note the real-session logo check is separate**

The studio-logo fix (Tasks 1-5) can only be meaningfully verified with a real Supabase session where a studio has actually uploaded a custom logo (Paramètres → Personnalisation), since demo sessions read from `localStorage` and the interesting case — an anonymous invitee seeing a REAL studio's logo through the RPC — requires the Task 1 migration to be live. Ask the user to: upload a logo in a real studio account (if not already done), generate a fresh client or team invitation link, open it in a private window, and confirm the studio's logo appears in place of the generic Rush lockup. Do not claim this task complete until the user confirms this, or reports back what they saw.

- [ ] **Step 5: Report results**

Summarize which checks passed and flag anything unexpected before considering this chantier complete.
