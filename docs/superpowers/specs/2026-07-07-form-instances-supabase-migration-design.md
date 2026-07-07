# Form Instances Supabase Migration — Design

**Status:** Approved by user (2026-07-07). 9th Phase 2 chantier (backend migration).

## Goal

Migrate `formStore.ts` (form *submissions* — filled-in responses to a form template, not the templates themselves) from a single global `localStorage` list to a studio-scoped Supabase table, while keeping the 3 hardcoded demo accounts working unchanged.

## Scope

**In scope:** `formStore.ts` only — the `FormInstance` records (id, template reference, linked project/client, responses, status).

**Explicitly out of scope:** `templates.ts` (`FormTemplate`, `ProjectTemplate`, `ResourceTemplate` — the reusable template definitions themselves) and `templateFavoritesStore.ts`. These are a separate, lower-priority candidate identified in the same audit as this chantier but not yet brainstormed. `financeStore.ts` remains deferred per the user's explicit request (see `finance-chantier-deferred` memory) — not touched here either.

## Current state (confirmed via code read)

`formStore.ts` holds a single `FormInstance[]` array in one global `localStorage` key (`sf_form_instances`), with zero studio scoping — the same class of bug already found and fixed in `studioLogoStore.ts` earlier in this chantier series (two studios sharing a browser would see each other's form submissions). `FormInstance` fields: `id`, `templateId`, `templateName`, `templateColor`, `linkedProjectId?`, `linkedProjectName?`, `linkedClientId?`, `linkedClientName?`, `responses: FormResponse[]`, `status: 'draft' | 'completed'`, `createdAt`, `updatedAt`. `FormResponse` is `{ fieldId: string, value: FormFieldValue, aiSuggested?: boolean }`, and `FormFieldValue` is `string | string[] | number` — no binary/file content, so payloads stay small.

Single consumer: `Modeles.tsx`, which calls `getFormInstances()`, `createFormInstance()`, `updateFormInstance()`, `deleteFormInstance()`, `subscribeFormStore()`. The whole list is bulk-fetched and filtered client-side (e.g. `getFormInstances().filter(i => i.templateId === templateId)`) — there is no on-demand, per-template fetching to design around.

## Migration

One new table, `form_instances`, following the exact same dual demo/real pattern as `resourceStore.ts` and every prior Phase 2 store:

```sql
create table form_instances (
  id text primary key,
  studio_id uuid not null references studios(id),
  template_id text not null,
  template_name text not null,
  template_color text not null,
  linked_project_id text,
  linked_project_name text,
  linked_client_id text,
  linked_client_name text,
  responses jsonb not null default '[]'::jsonb,
  status text not null default 'draft',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table form_instances enable row level security;

create policy "studio members can manage their form instances"
  on form_instances for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on form_instances to authenticated;
```

`id` is `text` (not `uuid`) since every client-generated entity id in this codebase is an app-generated string, not a database-generated UUID (confirmed pattern from `resources.id`, `clients.id`, `client_contacts.id` in prior chantiers — this project consistently generates ids client-side).

`formStore.ts` is rewritten with the same dual demo/real path: real sessions bulk-fetch all of a studio's `form_instances` into an in-memory cache on first access (mirroring `resourceStore.ts`), and all 5 existing exported functions keep their exact signatures. `Modeles.tsx` needs zero changes.

## Testing / verification plan

- Demo-session regression: creating/editing/deleting a form instance in the Modèles screen persists and reloads exactly as before.
- Real-session round-trip: create a form instance (draft), fill it in, mark it completed, reload, confirm it persists correctly including all responses.
- Studio scoping fix confirmed: two different real studios don't see each other's form instances (the bug this migration incidentally fixes).
- Cross-studio RLS isolation: confirm an unfiltered `select` from one studio's session returns only that studio's own rows.
- Final typecheck/lint diff against the baseline (185 typecheck errors / 339 lint problems).
