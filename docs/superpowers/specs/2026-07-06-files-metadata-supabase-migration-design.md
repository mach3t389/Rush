# Files/Resources Metadata Supabase Migration — Design

**Status:** Approved by user (2026-07-06). Sub-project 1 of 3 for the "Fichiers/Ressources" chantier (Phase 2 backend migration, 7th chantier overall).

## Goal

Migrate `fileStore.ts` (folders + file metadata) and `resourceStore.ts` (resource metadata) from localStorage/mock to real Supabase persistence for real (non-demo) studios, following the exact dual demo/real pattern already shipped for Projects, Clients, Tasks, Mes tâches, Team, and Calendar. Demo accounts keep their current behavior byte-for-byte unchanged.

## Scope

**In scope:** `FileFolder` and `FileItem` records (the folder tree and file/resource metadata that populate the Fichiers screens), and `Resource` records (the metadata card shown for each resource — type, title, status, etc.).

**Explicitly out of scope, deferred to later sub-projects of the same chantier:**
- `fileContentStore.ts` — the actual imported file bytes (currently blob URLs + base64 localStorage). Requires choosing and wiring a real object-storage backend (sub-project 2).
- `resourceContentStore.ts` — the heterogeneous per-editor content (rich text document bodies, video review comments/corrections, checklist items, storyboard panels, etc.). Requires per-editor migration design (sub-project 3).

After this sub-project ships, real users will see a persistent, studio-shared folder tree and resource list that survives reload — but opening a file or resource will still show empty/local-only content until sub-projects 2 and 3 land. This is a real, if partial, improvement and a deliberate intermediate state, not a bug.

## Why this is scoped separately from binary storage

`Resource` (the metadata) has no binary payload of its own — it is a pure row (id, type, title, status, etc.), identical in shape to `Client` or `Project`. `FileFolder`/`FileItem` are also pure metadata rows; the actual bytes live in the separate `fileContentStore.ts`, addressed by `FileItem.id`. This means the metadata migration is a straightforward "one more table, same pattern" chantier with no new architectural risk, while the binary-storage piece is a genuinely new problem (choosing Supabase Storage vs. an external CDN, upload/download flow, size limits) that deserves its own focused design rather than being bundled in.

## Data model

### `file_folders` table
Mirrors `FileFolder` from `fileStore.ts`, `studio_id`-scoped:
- `id` (text, pk) — client-generated `folder-${Date.now()}` (existing convention, including the multi-node `folder-${Date.now()}-${seq}` suffix used by `addFolderTree`)
- `studio_id` (uuid, fk → studios.id)
- `name` (text)
- `parent_id` (text, nullable — self-referential, no FK constraint, matching the app's existing looseness around id references)
- `project_id` (text, nullable)
- `client_id` (text, nullable)
- `color` (text, nullable)
- `state` (text, nullable — `'archived' | 'trashed'`)
- `deleted_at` (text, nullable — ISO date string, matches existing `deletedAt?: string` shape)
- `created_at` (text — the app's own `createdAt` field, NOT a DB-managed timestamp; keeps the exact `YYYY-MM-DD` string format already used everywhere else in this codebase)

### `file_items` table
Mirrors `FileItem` from `fileStore.ts`, `studio_id`-scoped:
- `id` (text, pk) — client-generated `file-${Date.now()}`
- `studio_id` (uuid, fk → studios.id)
- `name` (text)
- `type` (text — `FileItemType`)
- `ext` (text)
- `size` (bigint, nullable)
- `parent_folder_id` (text, nullable)
- `project_id` (text, nullable)
- `client_id` (text, nullable)
- `resource_id` (text, nullable)
- `resource_type` (text, nullable)
- `media_subtype` (text, nullable)
- `state` (text, nullable)
- `deleted_at` (text, nullable)
- `created_at` (text)
- `updated_at` (text)

### `resources` table
Mirrors `Resource` from `types/index.ts`, `studio_id`-scoped:
- `id` (text, pk) — reuses whatever id convention the resource's creator already uses today (e.g. `r${Date.now()}`, unchanged)
- `studio_id` (uuid, fk → studios.id)
- `type` (text)
- `eyebrow` (text)
- `title` (text)
- `description` (text, nullable)
- `status` (text)
- `status_label` (text)
- `meta` (text)
- `version` (text, nullable)
- `progress` (integer, nullable)
- `avatars` (jsonb, nullable — array of `{initials, bg}`)
- `colors` (jsonb, nullable — array of strings)
- `media_subtype` (text, nullable)
- `web_url` (text, nullable)

All three tables get the same RLS shape already used for `events`/`event_types`: `select/insert/update/delete` policies scoped to `studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid())`, plus matching `grant`s.

## Store rewrites

### `fileStore.ts`
Rewritten following `clientStore.ts`'s pattern, with one difference from every prior chantier: this store caches TWO parallel in-memory arrays (folders and files) for real sessions instead of one, mirroring the file's existing `folders`/`files` module-level variables. Both are fetched together (one fetch call populates both caches) and both are reset together on logout.

Every exported function keeps its exact current signature. The recursive tree helpers (`addFolderTree`, `deleteFolder`'s subtree collection, `getFolderPath`, `collectSubtree`) are **pure functions over the in-memory array** already today — they stay exactly as-is for both demo and real sessions; only the boundary functions that read the initial array (`getFolders`/`getFiles`) and persist mutations (`persist()`) branch on `isDemoSession()`. This means the bulk of `fileStore.ts`'s ~600 lines of tree logic requires zero changes — only the handful of functions that currently call `persist()` (which writes to localStorage) need a real-session counterpart that writes the changed row(s) to Supabase and re-fetches.

Soft-delete (`trashFolder`/`archiveFolder`/etc.) and their `restore*` counterparts write the `state`/`deleted_at` columns for the affected row(s) exactly as they mutate the in-memory object today — same single-row-or-subtree write, then refetch, no new semantics.

### `resourceStore.ts`
Rewritten following `clientStore.ts`'s pattern exactly (its shape is already nearly identical: `getResources`, `addResource`, `updateResource`, `removeResource`, `subscribeResources` map one-to-one to `getClients`, `addClient`, `updateClient`, `removeClient`... with `removeResource` being the one addition, using the same delete pattern already used in `taskStore.ts`/`teamStore.ts`).

## Testing / verification plan

Same shape as every prior chantier: manual E2E covering demo-unchanged behavior, a fresh real signup creating a folder/file/resource, reload-persistence, a nested-subtree delete-cascade check (since that's the one piece of genuinely new-to-Supabase logic — a client-side recursive collect followed by a bulk write), and a final typecheck/lint/build diff against the pre-chantier baseline (185 errors / 338 lint problems, confirmed at the end of the Calendar chantier). Given `studioStore.ts`'s `getStudioId()` concurrency bug was only found and fixed during the Calendar chantier's own E2E pass — and this chantier adds 2 more concurrent callers (`fileStore.ts`, `resourceStore.ts`) — explicitly re-verify a brand-new real signup does not reintroduce a duplicate-studio race before considering this sub-project done.
