# Custom Templates & Template Favorites Supabase Migration — Design

**Status:** Approved by user (2026-07-07). 10th Phase 2 chantier (backend migration).

## Goal

Migrate user-created custom templates (`templates.ts`'s `loadCustom*`/`saveCustom*` function pairs) and template favorites (`templateFavoritesStore.ts`) from `localStorage` to Supabase, while keeping the 3 hardcoded demo accounts working unchanged and leaving the built-in template catalogs (`BUILT_IN_TEMPLATES`, `BUILT_IN_FORM_TEMPLATES`, `BUILT_IN_RESOURCE_TEMPLATES`) completely untouched and static.

## Scope

**In scope:** the 6 custom-template storage functions in `templates.ts` (`loadCustomTemplates`/`saveCustomTemplates` for `ProjectTemplate`, `loadCustomFormTemplates`/`saveCustomFormTemplates` for `FormTemplate`, `loadCustomResourceTemplates`/`saveCustomResourceTemplates` for `ResourceTemplate`) and all 4 exports of `templateFavoritesStore.ts`.

**Explicitly out of scope:** `BUILT_IN_TEMPLATES`, `BUILT_IN_FORM_TEMPLATES`, `BUILT_IN_RESOURCE_TEMPLATES` (static, unmodified), `loadAllTemplates`/`loadAllFormTemplates`/`loadAllResourceTemplates` (these just concatenate built-ins with custom results and need no changes since their inputs' behavior is preserved), `formStore.ts` (already migrated in a prior chantier — distinct from templates, holds submitted responses not template definitions), `financeStore.ts` (deferred per the user's explicit request).

## Current state (confirmed via code read)

All 6 custom-template functions follow an identical, simple pattern: `loadCustomX(): X[]` reads a JSON array from one `localStorage` key, `saveCustomX(templates: X[]): void` overwrites that key with a full array. There is no per-item CRUD at the storage layer — `Modeles.tsx` (the only real consumer that mutates this data) always computes the complete desired custom-template array (add/edit/delete/reorder) and calls the corresponding `save*` function with the whole thing every time. `templateFavoritesStore.ts` holds a single `Set<string>` of favorited template ids in one `localStorage` key, with `toggleTemplateFavorite`, `isTemplateFavorite`, `getFavoriteTemplateIds`, and a pub-sub `subscribeTemplateFavorites`.

`ProjectTemplate`, `FormTemplate`, and `ResourceTemplate` are three structurally different, moderately complex interfaces (the last one especially — `ResourceTemplate` has 8 different optional nested-array fields depending on its `type`). None of the three are ever queried by nested field at the storage layer — always loaded/saved as a whole object.

## Migration

### Custom templates: 3 tables, one JSONB blob per template

Following the same precedent as `resourceContentStore.ts` (opaque JSONB blob for heterogeneous, deeply-nested content rather than modeling every nested field as its own SQL column):

```sql
create table custom_project_templates (
  id text primary key,
  studio_id uuid not null references studios(id),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table custom_form_templates (
  id text primary key,
  studio_id uuid not null references studios(id),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table custom_resource_templates (
  id text primary key,
  studio_id uuid not null references studios(id),
  data jsonb not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
```

Each table gets its own RLS policy reusing `my_studio_ids()` and its own `GRANT ... TO authenticated` statement. `data` holds the entire template object (including its own `id`, redundantly with the row's `id` column, for simplicity when reading back — matching the existing `ClientContact`-in-JSONB precedent from a prior chantier where the full object round-trips through one column).

`templates.ts`'s 6 functions are rewritten with the dual demo/real pattern: demo sessions keep today's exact `localStorage` behavior. Real sessions bulk-fetch a studio's custom templates for each kind into an in-memory cache (mirroring `resourceStore.ts`), and — since every write always replaces the whole custom-list — the `save*` functions reuse the exact "diff old vs. new ids, delete removed, upsert the rest" sync pattern already built and reviewed for `clientTeamStore.ts`'s `replaceSupabaseTeam` in a prior chantier, applied independently per template kind.

### Template favorites: one table, scoped per user

```sql
create table template_favorites (
  user_id uuid not null references auth.users(id) on delete cascade,
  template_id text not null,
  primary key (user_id, template_id)
);

alter table template_favorites enable row level security;

create policy "users manage their own template favorites"
  on template_favorites for all
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

grant select, insert, update, delete on template_favorites to authenticated;
```

Confirmed with the user: favorites are a personal preference (like notification preferences), not a studio-wide setting — each team member has their own favorited templates. `templateFavoritesStore.ts` is rewritten with the dual demo/real pattern: demo sessions keep today's exact `localStorage`-backed `Set<string>` behavior; real sessions bulk-fetch the caller's own favorited template ids into an in-memory `Set`, with `toggleTemplateFavorite` inserting or deleting the single row for that `(user_id, template_id)` pair.

## No consumer changes required

Every exported function signature across both files is preserved exactly. `Modeles.tsx`, `Travail.tsx`, `ProjectsListView.tsx`, and `FichiersGlobal.tsx` need zero changes.

## Testing / verification plan

- Demo-session regression: create/edit/delete/reorder custom templates of all 3 kinds in the Modèles screen, toggle favorites, reload — everything persists exactly as before this migration.
- Real-session round-trip: for each of the 3 template kinds, create a custom template, reload, confirm it persists alongside the (unchanged) built-ins; edit it, reload, confirm the edit persists; delete it, reload, confirm it's gone.
- Real-session favorites round-trip: toggle a favorite (including a built-in template's id, not just custom ones — favorites can apply to either), reload, confirm it persists; confirm a second real user in the same studio does NOT see the first user's favorites (per-user isolation).
- Cross-studio RLS isolation: confirm an unfiltered `select` on each of the 3 template tables from one studio's session returns only that studio's own rows.
- Cross-user RLS isolation: confirm an unfiltered `select` on `template_favorites` returns only the caller's own rows.
- Final typecheck/lint diff against the baseline (185 typecheck errors / 339 lint problems).
