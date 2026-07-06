# Files/Resources Metadata Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrate `fileStore.ts` (folders + file metadata) and `resourceStore.ts` (resource metadata) from localStorage/mock to real Supabase persistence for real (non-demo) studios, sub-project 1 of the "Fichiers/Ressources" chantier.

**Architecture:** Both stores get the dual demo/real rewrite already shipped for `clientStore.ts`/`eventStore.ts`. `fileStore.ts` keeps ALL of its existing tree-computation logic (subtree collection, path building, filtering) completely unchanged — only the handful of read/write boundary functions branch on `isDemoSession()`. Three flat `studio_id`-scoped tables (`file_folders`, `file_items`, `resources`) reuse the `my_studio_ids()` RLS helper and grant pattern already established.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS), existing `data/authStore.ts` / `data/studioStore.ts` (unmodified, reused as-is, unless E2E testing in Task 4 surfaces a new concurrency issue).

## Global Constraints

- Demo sessions (`isDemoSession() === true`) behave byte-for-byte unchanged — same seed data (`SEED_FOLDERS`, `SEED_FILES`, `RESOURCES`), same localStorage keys (`sf_file_folders`, `sf_file_items`, `sf_resources`), same synchronous return shape.
- `getFolders()`, `getFiles()`, `getAllFiles()`, and `getResources()` must stay fully synchronous for both demo and real sessions.
- `onLogout(resetFileCache)` and `onLogout(resetResourcesCache)` must be registered at module scope from the moment each file is written.
- Client-generated ids keep their exact current conventions: `folder-${Date.now()}` (and `folder-${Date.now()}-${seq}` for `addFolderTree`'s multi-node case), `file-${Date.now()}`, and whatever id shape `resourceStore.ts`'s callers already pass to `addResource` (unchanged — `resourceStore.ts` never generates ids itself today, and this migration does not add that).
- No write-queue unless Task 4's E2E testing proves one is necessary — every prior chantier except `taskStore.ts` (which does a delete-then-recreate batch write) needed none, and none of this sub-project's writes are delete-then-recreate batches.
- Do not modify `data/studioStore.ts`, `data/authStore.ts`, or `data/teamStore.ts` — only call their existing exports. If Task 4 finds a new `getStudioId()` concurrency issue, escalate rather than silently patching a second time with a different pattern than the one already applied there.
- `Resource` (from `types/index.ts`) has no `projectId`/`clientId` field — its project association is entirely indirect, via the `FileItem` row that references it by `resourceId`. Do not add a `project_id` column to the `resources` table.

---

### Task 1: Supabase schema (manual — user runs it)

**Files:**
- None (SQL run directly in the Supabase SQL editor by the user; not a code change)

**Interfaces:**
- Produces: `file_folders`, `file_items`, `resources` tables, RLS policies and grants that Tasks 2 and 3's Supabase calls depend on. All three reuse the `my_studio_ids()` helper function already created during the Team Invitations chantier — do not redefine it.

- [ ] **Step 1: Hand the user this SQL to run in the Supabase SQL editor**

```sql
create table if not exists file_folders (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  parent_id text,
  project_id text,
  client_id text,
  color text,
  state text,
  deleted_at text,
  created_at text not null
);
alter table file_folders enable row level security;

create policy "file_folders_select_own_studio" on file_folders for select
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "file_folders_insert_own_studio" on file_folders for insert
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "file_folders_update_own_studio" on file_folders for update
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()))
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "file_folders_delete_own_studio" on file_folders for delete
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on file_folders to authenticated;

create table if not exists file_items (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  name text not null,
  type text not null,
  ext text not null,
  size bigint,
  parent_folder_id text,
  project_id text,
  client_id text,
  resource_id text,
  resource_type text,
  media_subtype text,
  state text,
  deleted_at text,
  created_at text not null,
  updated_at text not null
);
alter table file_items enable row level security;

create policy "file_items_select_own_studio" on file_items for select
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "file_items_insert_own_studio" on file_items for insert
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "file_items_update_own_studio" on file_items for update
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()))
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "file_items_delete_own_studio" on file_items for delete
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on file_items to authenticated;

create table if not exists resources (
  id text primary key,
  studio_id uuid not null references studios(id) on delete cascade,
  type text not null,
  eyebrow text not null,
  title text not null,
  description text,
  status text not null,
  status_label text not null,
  meta text not null,
  version text,
  progress integer,
  avatars jsonb,
  colors jsonb,
  media_subtype text,
  web_url text,
  created_at timestamptz not null default now()
);
alter table resources enable row level security;

create policy "resources_select_own_studio" on resources for select
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "resources_insert_own_studio" on resources for insert
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "resources_update_own_studio" on resources for update
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()))
  with check (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
create policy "resources_delete_own_studio" on resources for delete
  using (studio_id in (select my_studio_ids()) or studio_id in (select id from studios where owner_user_id = auth.uid()));
grant select, insert, update, delete on resources to authenticated;
```

- [ ] **Step 2: Confirm with the user that all three tables now appear in the Supabase Table Editor, and that running the SQL produced no errors**

- [ ] **Step 3: Record in the progress ledger that Task 1 is done, quoting the user's confirmation**

---

### Task 2: `fileStore.ts` dual demo/real rewrite

**Files:**
- Modify: `app/src/data/fileStore.ts` (full rewrite, same public API)

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `../data/authStore`; `getStudioId` from `../data/studioStore`; `supabase` from `../data/supabaseClient`.
- Produces (unchanged from the current file, callers require zero changes): `FileFolder`, `FileItem`, `FileState`, `FileItemType`, `FolderTreeNode` types/interfaces; `getFolders`, `addFolder`, `addFolderTree`, `renameFolder`, `moveFolder`, `deleteFolder`, `getChildFolders`, `getRootFoldersForProject`, `getRootFoldersForClient`, `getGlobalRootFolders`, `getFiles`, `getFilesInFolder`, `addFile`, `deleteFile`, `renameFile`, `moveFile`, `moveFileFull`, `getAllFiles`, `trashFolder`, `trashFile`, `archiveFolder`, `archiveFile`, `restoreFolder`, `restoreFile`, `getStatedFolders`, `getStatedFiles`, `getTrashedFolders`, `getTrashedFiles`, `getArchivedFolders`, `getArchivedFiles`, `emptyTrash`, `subscribeFileStore`, `getFolderPath`, `formatFileSize`, `fileTypeFromExt`. Additionally exports `resetFileCache(): void` (new, for `onLogout` registration).

- [ ] **Step 1: Replace the full contents of `app/src/data/fileStore.ts` with:**

```ts
import { loadPersisted, savePersisted } from './persist';
import type { ResourceType } from '../types';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

// ── Types ──────────────────────────────────────────────────────────────────────

export type FileState = 'archived' | 'trashed';

export interface FileFolder {
  id: string;
  name: string;
  parentId: string | null; // null = root of its scope
  projectId?: string;
  clientId?: string;
  color?: string;
  createdAt: string;
  state?: FileState;   // undefined = actif ; 'archived' = archivé ; 'trashed' = corbeille
  deletedAt?: string;  // date de mise à la corbeille / d'archivage
}

export type FileItemType =
  | 'pdf' | 'image' | 'video' | 'audio' | 'zip' | 'doc' | 'spreadsheet'
  | 'resource' | 'other';

export interface FileItem {
  id: string;
  name: string;
  type: FileItemType;
  ext: string;
  size?: number; // bytes
  parentFolderId: string | null;
  projectId?: string;
  clientId?: string;
  resourceId?: string;
  resourceType?: ResourceType;
  mediaSubtype?: 'video' | 'photo' | 'file' | 'audio';
  createdAt: string;
  updatedAt: string;
  state?: FileState;
  deletedAt?: string;
}

// ── Seed folders (demo only) ────────────────────────────────────────────────────

const SEED_FOLDERS: FileFolder[] = [
  { id: 'folder-templates', name: 'Modèles', parentId: null, createdAt: '2025-01-01' },
  { id: 'folder-archives',  name: 'Archives', parentId: null, createdAt: '2025-01-01' },
  { id: 'folder-trash',     name: 'Corbeille', parentId: null, createdAt: '2025-01-01' },

  { id: 'f-ce-01', name: '01_RUSHES',   parentId: null, projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-02', name: '02_AUDIO',    parentId: null, projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-03', name: '03_ASSETS',   parentId: null, projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-04', name: '04_MONTAGE',  parentId: null, projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-05', name: '05_EXPORTS',  parentId: null, projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-06', name: '06_DOCUMENTS',parentId: null, projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-01a', name: 'Jour_01',    parentId: 'f-ce-01', projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-01b', name: 'Jour_02',    parentId: 'f-ce-01', projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-01c', name: 'B-Roll',     parentId: 'f-ce-01', projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-05a', name: 'V1',         parentId: 'f-ce-05', projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-05b', name: 'V2',         parentId: 'f-ce-05', projectId: 'pj1', createdAt: '2025-04-01' },
  { id: 'f-ce-05c', name: 'FINAL',      parentId: 'f-ce-05', projectId: 'pj1', createdAt: '2025-04-01' },

  { id: 'f-lb-01', name: '01_RUSHES',   parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
  { id: 'f-lb-02', name: '02_MONTAGE',  parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
  { id: 'f-lb-03', name: '03_EXPORTS',  parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
  { id: 'f-lb-04', name: '04_DOCUMENTS',parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
];

const SEED_FILES: FileItem[] = [
  { id: 'fi-ce-01', name: 'Contrat_Nova_2025.pdf',        type: 'pdf',   ext: 'pdf',  size: 245000,  parentFolderId: 'f-ce-06', projectId: 'pj1', createdAt: '2025-04-02', updatedAt: '2025-04-02' },
  { id: 'fi-ce-02', name: 'Brief_créatif_v3.pdf',         type: 'pdf',   ext: 'pdf',  size: 188000,  parentFolderId: 'f-ce-06', projectId: 'pj1', createdAt: '2025-04-05', updatedAt: '2025-04-10' },
  { id: 'fi-ce-03', name: 'Moodboard_final.jpg',          type: 'image', ext: 'jpg',  size: 3200000, parentFolderId: 'f-ce-03', projectId: 'pj1', createdAt: '2025-04-08', updatedAt: '2025-04-08' },
  { id: 'fi-ce-04', name: 'Logo_Nova_Films.png',          type: 'image', ext: 'png',  size: 120000,  parentFolderId: 'f-ce-03', projectId: 'pj1', createdAt: '2025-04-01', updatedAt: '2025-04-01' },
  { id: 'fi-ce-05', name: 'Rushes_Jour01_A001.mp4',       type: 'video', ext: 'mp4',  size: 4200000000, parentFolderId: 'f-ce-01a', projectId: 'pj1', createdAt: '2025-05-10', updatedAt: '2025-05-10' },
  { id: 'fi-ce-06', name: 'V1_Campagne_Été_2025.mp4',     type: 'video', ext: 'mp4',  size: 890000000, parentFolderId: 'f-ce-05a', projectId: 'pj1', createdAt: '2025-05-20', updatedAt: '2025-05-20' },
  { id: 'fi-ce-07', name: 'Musique_theme.wav',            type: 'audio', ext: 'wav',  size: 45000000, parentFolderId: 'f-ce-02', projectId: 'pj1', createdAt: '2025-04-15', updatedAt: '2025-04-15' },

  { id: 'fi-res-r2', name: 'Rough Cut — Séquence 1', type: 'resource', ext: '', resourceId: 'r2', resourceType: 'video_review', mediaSubtype: 'video', parentFolderId: 'f-ce-04', projectId: 'pj1', createdAt: '2025-05-15', updatedAt: '2025-06-20' },
  { id: 'fi-res-r1', name: 'Scénario Campagne Été — V3', type: 'resource', ext: '', resourceId: 'r1', resourceType: 'screenplay', parentFolderId: 'f-ce-06', projectId: 'pj1', createdAt: '2025-04-12', updatedAt: '2025-06-22' },

  { id: 'fi-lb-01', name: 'Contrat_StudioBleu.pdf',       type: 'pdf',   ext: 'pdf',  size: 198000,  parentFolderId: 'f-lb-04', projectId: 'pj2', createdAt: '2025-05-02', updatedAt: '2025-05-02' },
  { id: 'fi-lb-02', name: 'Script_v2_Les_Bâtisseurs.pdf', type: 'pdf',   ext: 'pdf',  size: 88000,   parentFolderId: 'f-lb-04', projectId: 'pj2', createdAt: '2025-05-08', updatedAt: '2025-05-12' },
  { id: 'fi-lb-03', name: 'Rushes_Interview_CEO.mp4',     type: 'video', ext: 'mp4',  size: 6800000000, parentFolderId: 'f-lb-01', projectId: 'pj2', createdAt: '2025-06-01', updatedAt: '2025-06-01' },
];

// ── Store state ──────────────────────────────────────────────────────────────────

type Listener = () => void;

const FOLDERS_KEY = 'sf_file_folders';
const FILES_KEY   = 'sf_file_items';

// Demo-session working set — identical to the pre-migration module state.
let _demoFolders: FileFolder[] = loadPersisted<FileFolder[]>(FOLDERS_KEY, SEED_FOLDERS);
let _demoFiles: FileItem[]     = loadPersisted<FileItem[]>(FILES_KEY, SEED_FILES);

// Real-session working set — empty until the background fetch resolves.
let _supabaseFolders: FileFolder[] = [];
let _supabaseFiles: FileItem[] = [];
let _supabaseFetchStarted = false;

const listeners = new Set<Listener>();
const notify = () => listeners.forEach(l => l());

function persistDemo() {
  savePersisted(FOLDERS_KEY, _demoFolders);
  savePersisted(FILES_KEY, _demoFiles);
}

// ── Real (Supabase-backed) session plumbing ─────────────────────────────────────

interface FolderRow {
  id: string;
  studio_id: string;
  name: string;
  parent_id: string | null;
  project_id: string | null;
  client_id: string | null;
  color: string | null;
  state: FileState | null;
  deleted_at: string | null;
  created_at: string;
}

interface ItemRow {
  id: string;
  studio_id: string;
  name: string;
  type: FileItemType;
  ext: string;
  size: number | null;
  parent_folder_id: string | null;
  project_id: string | null;
  client_id: string | null;
  resource_id: string | null;
  resource_type: ResourceType | null;
  media_subtype: FileItem['mediaSubtype'] | null;
  state: FileState | null;
  deleted_at: string | null;
  created_at: string;
  updated_at: string;
}

function toFolder(row: FolderRow): FileFolder {
  return {
    id: row.id,
    name: row.name,
    parentId: row.parent_id,
    projectId: row.project_id ?? undefined,
    clientId: row.client_id ?? undefined,
    color: row.color ?? undefined,
    createdAt: row.created_at,
    state: row.state ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function folderToRow(f: FileFolder, studioId: string): FolderRow {
  return {
    id: f.id,
    studio_id: studioId,
    name: f.name,
    parent_id: f.parentId,
    project_id: f.projectId ?? null,
    client_id: f.clientId ?? null,
    color: f.color ?? null,
    state: f.state ?? null,
    deleted_at: f.deletedAt ?? null,
    created_at: f.createdAt,
  };
}

function toItem(row: ItemRow): FileItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    ext: row.ext,
    size: row.size ?? undefined,
    parentFolderId: row.parent_folder_id,
    projectId: row.project_id ?? undefined,
    clientId: row.client_id ?? undefined,
    resourceId: row.resource_id ?? undefined,
    resourceType: row.resource_type ?? undefined,
    mediaSubtype: row.media_subtype ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    state: row.state ?? undefined,
    deletedAt: row.deleted_at ?? undefined,
  };
}

function itemToRow(f: FileItem, studioId: string): ItemRow {
  return {
    id: f.id,
    studio_id: studioId,
    name: f.name,
    type: f.type,
    ext: f.ext,
    size: f.size ?? null,
    parent_folder_id: f.parentFolderId,
    project_id: f.projectId ?? null,
    client_id: f.clientId ?? null,
    resource_id: f.resourceId ?? null,
    resource_type: f.resourceType ?? null,
    media_subtype: f.mediaSubtype ?? null,
    state: f.state ?? null,
    deleted_at: f.deletedAt ?? null,
    created_at: f.createdAt,
    updated_at: f.updatedAt,
  };
}

async function fetchSupabaseFileData(): Promise<void> {
  const studioId = await getStudioId();
  const [foldersRes, filesRes] = await Promise.all([
    supabase.from('file_folders').select('*').eq('studio_id', studioId),
    supabase.from('file_items').select('*').eq('studio_id', studioId),
  ]);
  if (foldersRes.error) { console.error('fetchSupabaseFileData (folders) failed', foldersRes.error); return; }
  if (filesRes.error) { console.error('fetchSupabaseFileData (files) failed', filesRes.error); return; }

  _supabaseFolders = (foldersRes.data as FolderRow[]).map(toFolder);
  _supabaseFiles = (filesRes.data as ItemRow[]).map(toItem);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseFileData();
}

export function resetFileCache(): void {
  _supabaseFolders = [];
  _supabaseFiles = [];
  _supabaseFetchStarted = false;
}

onLogout(resetFileCache);

// ── Read boundary (session-aware) ───────────────────────────────────────────────

export function getFolders(): FileFolder[] {
  if (isDemoSession()) return _demoFolders;
  ensureSupabaseFetchStarted();
  return _supabaseFolders;
}

export function getFiles(): FileItem[] {
  if (isDemoSession()) return _demoFiles;
  ensureSupabaseFetchStarted();
  return _supabaseFiles;
}

export function getAllFiles(): FileItem[] { return getFiles(); }

// ── Folders: writes ──────────────────────────────────────────────────────────────

export function addFolder(f: Omit<FileFolder, 'id' | 'createdAt'>): FileFolder {
  const folder: FileFolder = { ...f, id: `folder-${Date.now()}`, createdAt: new Date().toISOString().slice(0, 10) };

  if (isDemoSession()) {
    _demoFolders = [..._demoFolders, folder];
    persistDemo();
    notify();
    return folder;
  }

  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase.from('file_folders').insert(folderToRow(folder, studioId));
    if (error) { console.error('addFolder failed', error); return; }
    await fetchSupabaseFileData();
  })();
  return folder;
}

export interface FolderTreeNode { id?: string; name: string; children?: FolderTreeNode[] }

export function addFolderTree(
  nodes: FolderTreeNode[],
  scope: { projectId?: string; clientId?: string },
  parentId: string | null = null,
): void {
  const createdAt = new Date().toISOString().slice(0, 10);
  let seq = 0;
  const additions: FileFolder[] = [];
  const walk = (list: FolderTreeNode[], parent: string | null) => {
    list.forEach(node => {
      const id = `folder-${Date.now()}-${seq++}`;
      additions.push({ id, name: node.name, parentId: parent, projectId: scope.projectId, clientId: scope.clientId, createdAt });
      if (node.children && node.children.length) walk(node.children, id);
    });
  };
  walk(nodes, parentId);
  if (!additions.length) return;

  if (isDemoSession()) {
    _demoFolders = [..._demoFolders, ...additions];
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase.from('file_folders').insert(additions.map(f => folderToRow(f, studioId)));
    if (error) { console.error('addFolderTree failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

export function renameFolder(id: string, name: string): void {
  if (isDemoSession()) {
    _demoFolders = _demoFolders.map(f => f.id === id ? { ...f, name } : f);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error } = await supabase.from('file_folders').update({ name }).eq('id', id);
    if (error) { console.error('renameFolder failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

export function moveFolder(id: string, parentId: string | null): void {
  if (isDemoSession()) {
    _demoFolders = _demoFolders.map(f => f.id === id ? { ...f, parentId } : f);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error } = await supabase.from('file_folders').update({ parent_id: parentId }).eq('id', id);
    if (error) { console.error('moveFolder failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

export function deleteFolder(id: string): void {
  const toDelete = new Set<string>();
  const collect = (folderId: string) => {
    toDelete.add(folderId);
    getFolders().filter(f => f.parentId === folderId).forEach(f => collect(f.id));
  };
  collect(id);
  const folderIds = Array.from(toDelete);

  if (isDemoSession()) {
    _demoFolders = _demoFolders.filter(f => !toDelete.has(f.id));
    _demoFiles = _demoFiles.filter(fi => !toDelete.has(fi.parentFolderId ?? ''));
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error: filesError } = await supabase.from('file_items').delete().in('parent_folder_id', folderIds);
    if (filesError) { console.error('deleteFolder (files) failed', filesError); return; }
    const { error: foldersError } = await supabase.from('file_folders').delete().in('id', folderIds);
    if (foldersError) { console.error('deleteFolder (folders) failed', foldersError); return; }
    await fetchSupabaseFileData();
  })();
}

// ── Folders: pure filters (unchanged logic, now read via getFolders()) ──────────

export function getChildFolders(parentId: string | null, projectId?: string, clientId?: string): FileFolder[] {
  return getFolders().filter(f =>
    f.parentId === parentId &&
    (projectId !== undefined ? f.projectId === projectId : clientId !== undefined ? f.clientId === clientId : !f.projectId && !f.clientId)
  );
}

export function getRootFoldersForProject(projectId: string): FileFolder[] {
  return getFolders().filter(f => f.projectId === projectId && f.parentId === null);
}

export function getRootFoldersForClient(clientId: string): FileFolder[] {
  return getFolders().filter(f => f.clientId === clientId && f.parentId === null);
}

export function getGlobalRootFolders(): FileFolder[] {
  return getFolders().filter(f => !f.projectId && !f.clientId && f.parentId === null);
}

// ── Files: writes ────────────────────────────────────────────────────────────────

export function getFilesInFolder(folderId: string | null, projectId?: string, clientId?: string): FileItem[] {
  return getFiles().filter(fi =>
    fi.parentFolderId === folderId &&
    (projectId !== undefined ? fi.projectId === projectId :
     clientId !== undefined ? fi.clientId === clientId :
     !fi.projectId && !fi.clientId)
  );
}

export function addFile(f: Omit<FileItem, 'id' | 'createdAt' | 'updatedAt'>): FileItem {
  const now = new Date().toISOString().slice(0, 10);
  const file: FileItem = { ...f, id: `file-${Date.now()}`, createdAt: now, updatedAt: now };

  if (isDemoSession()) {
    _demoFiles = [..._demoFiles, file];
    persistDemo();
    notify();
    return file;
  }

  void (async () => {
    const studioId = await getStudioId();
    const { error } = await supabase.from('file_items').insert(itemToRow(file, studioId));
    if (error) { console.error('addFile failed', error); return; }
    await fetchSupabaseFileData();
  })();
  return file;
}

export function deleteFile(id: string): void {
  if (isDemoSession()) {
    _demoFiles = _demoFiles.filter(f => f.id !== id);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error } = await supabase.from('file_items').delete().eq('id', id);
    if (error) { console.error('deleteFile failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

export function renameFile(id: string, name: string): void {
  const updatedAt = new Date().toISOString().slice(0, 10);

  if (isDemoSession()) {
    _demoFiles = _demoFiles.map(f => f.id === id ? { ...f, name, updatedAt } : f);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error } = await supabase.from('file_items').update({ name, updated_at: updatedAt }).eq('id', id);
    if (error) { console.error('renameFile failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

export function moveFile(id: string, parentFolderId: string | null): void {
  if (isDemoSession()) {
    _demoFiles = _demoFiles.map(f => f.id === id ? { ...f, parentFolderId } : f);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error } = await supabase.from('file_items').update({ parent_folder_id: parentFolderId }).eq('id', id);
    if (error) { console.error('moveFile failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

export function moveFileFull(id: string, parentFolderId: string | null, projectId?: string, clientId?: string): void {
  if (isDemoSession()) {
    _demoFiles = _demoFiles.map(f => f.id === id ? { ...f, parentFolderId, projectId, clientId } : f);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error } = await supabase.from('file_items').update({
      parent_folder_id: parentFolderId,
      project_id: projectId ?? null,
      client_id: clientId ?? null,
    }).eq('id', id);
    if (error) { console.error('moveFileFull failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

// ── Soft delete: Corbeille & Archives ────────────────────────────────────────────

const today = () => new Date().toISOString().slice(0, 10);

function collectSubtree(folderId: string): { folderIds: Set<string>; fileIds: Set<string> } {
  const folderIds = new Set<string>();
  const fileIds = new Set<string>();
  const walk = (fid: string) => {
    folderIds.add(fid);
    getFolders().filter(f => f.parentId === fid).forEach(f => walk(f.id));
  };
  walk(folderId);
  getFiles().forEach(fi => { if (fi.parentFolderId && folderIds.has(fi.parentFolderId)) fileIds.add(fi.id); });
  return { folderIds, fileIds };
}

function setFolderState(id: string, state: FileState | undefined): void {
  const { folderIds, fileIds } = collectSubtree(id);
  const stamp = state ? today() : undefined;

  if (isDemoSession()) {
    _demoFolders = _demoFolders.map(f => folderIds.has(f.id) ? { ...f, state, deletedAt: stamp } : f);
    _demoFiles = _demoFiles.map(fi => fileIds.has(fi.id) ? { ...fi, state, deletedAt: stamp } : fi);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const folderIdList = Array.from(folderIds);
    const fileIdList = Array.from(fileIds);
    const { error: foldersError } = await supabase.from('file_folders')
      .update({ state: state ?? null, deleted_at: stamp ?? null })
      .in('id', folderIdList);
    if (foldersError) { console.error('setFolderState (folders) failed', foldersError); return; }
    if (fileIdList.length) {
      const { error: filesError } = await supabase.from('file_items')
        .update({ state: state ?? null, deleted_at: stamp ?? null })
        .in('id', fileIdList);
      if (filesError) { console.error('setFolderState (files) failed', filesError); return; }
    }
    await fetchSupabaseFileData();
  })();
}

function setFileState(id: string, state: FileState | undefined): void {
  const stamp = state ? today() : undefined;

  if (isDemoSession()) {
    _demoFiles = _demoFiles.map(fi => fi.id === id ? { ...fi, state, deletedAt: stamp } : fi);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const { error } = await supabase.from('file_items')
      .update({ state: state ?? null, deleted_at: stamp ?? null })
      .eq('id', id);
    if (error) { console.error('setFileState failed', error); return; }
    await fetchSupabaseFileData();
  })();
}

export function trashFolder(id: string): void   { setFolderState(id, 'trashed'); }
export function trashFile(id: string): void      { setFileState(id, 'trashed'); }
export function archiveFolder(id: string): void  { setFolderState(id, 'archived'); }
export function archiveFile(id: string): void    { setFileState(id, 'archived'); }
export function restoreFolder(id: string): void  { setFolderState(id, undefined); }
export function restoreFile(id: string): void    { setFileState(id, undefined); }

function parentInState(parentFolderId: string | null, state: FileState): boolean {
  if (!parentFolderId) return false;
  const parent = getFolders().find(f => f.id === parentFolderId);
  return parent?.state === state;
}

export function getStatedFolders(state: FileState): FileFolder[] {
  return getFolders().filter(f => f.state === state && !parentInState(f.parentId, state));
}

export function getStatedFiles(state: FileState): FileItem[] {
  return getFiles().filter(fi => fi.state === state && !parentInState(fi.parentFolderId, state));
}

export function getTrashedFolders(): FileFolder[]  { return getStatedFolders('trashed'); }
export function getTrashedFiles(): FileItem[]      { return getStatedFiles('trashed'); }
export function getArchivedFolders(): FileFolder[] { return getStatedFolders('archived'); }
export function getArchivedFiles(): FileItem[]     { return getStatedFiles('archived'); }

export function emptyTrash(): void {
  if (isDemoSession()) {
    _demoFolders = _demoFolders.filter(f => f.state !== 'trashed');
    _demoFiles = _demoFiles.filter(fi => fi.state !== 'trashed');
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const studioId = await getStudioId();
    const { error: foldersError } = await supabase.from('file_folders')
      .delete().eq('studio_id', studioId).eq('state', 'trashed');
    if (foldersError) { console.error('emptyTrash (folders) failed', foldersError); return; }
    const { error: filesError } = await supabase.from('file_items')
      .delete().eq('studio_id', studioId).eq('state', 'trashed');
    if (filesError) { console.error('emptyTrash (files) failed', filesError); return; }
    await fetchSupabaseFileData();
  })();
}

// ── Subscriptions ──────────────────────────────────────────────────────────────

export function subscribeFileStore(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getFolderPath(folderId: string): FileFolder[] {
  const path: FileFolder[] = [];
  let current = getFolders().find(f => f.id === folderId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? getFolders().find(f => f.id === current!.parentId) : undefined;
  }
  return path;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes) return '—';
  if (bytes < 1024) return `${bytes} o`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} Mo`;
  return `${(bytes / 1024 / 1024 / 1024).toFixed(2)} Go`;
}

export function fileTypeFromExt(ext: string): FileItemType {
  const e = ext.toLowerCase();
  if (['pdf'].includes(e)) return 'pdf';
  if (['jpg','jpeg','png','gif','webp','svg','heic'].includes(e)) return 'image';
  if (['mp4','mov','avi','mkv','webm','mxf'].includes(e)) return 'video';
  if (['mp3','wav','aac','flac','ogg','aif'].includes(e)) return 'audio';
  if (['zip','rar','7z','tar','gz'].includes(e)) return 'zip';
  if (['doc','docx','odt','rtf'].includes(e)) return 'doc';
  if (['xls','xlsx','csv','ods'].includes(e)) return 'spreadsheet';
  return 'other';
}
```

- [ ] **Step 2: Run the app's typecheck to confirm no consumer breaks**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors introduced by this file (the confirmed baseline is 185 errors elsewhere in the repo)

- [ ] **Step 3: Commit**

```bash
git add app/src/data/fileStore.ts
git commit -m "feat: fileStore.ts dual demo/real Supabase path"
```

---

### Task 3: `resourceStore.ts` dual demo/real rewrite

**Files:**
- Modify: `app/src/data/resourceStore.ts` (full rewrite, same public API)

**Interfaces:**
- Consumes: `isDemoSession, onLogout` from `../data/authStore`; `getStudioId` from `../data/studioStore`; `supabase` from `../data/supabaseClient`.
- Produces (unchanged from the current file, callers require zero changes): `getResources(): Resource[]`, `addResource(r: Resource): void`, `updateResource(id: string, patch: Partial<Resource>): void`, `removeResource(id: string): void`, `subscribeResources(fn: () => void): () => void`. Additionally exports `resetResourcesCache(): void`.

- [ ] **Step 1: Replace the full contents of `app/src/data/resourceStore.ts` with:**

```ts
import { RESOURCES } from './mock';
import type { Resource } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

const STORAGE_KEY = 'sf_resources';

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoResources: Resource[] = loadPersisted(STORAGE_KEY, [...RESOURCES]);

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseResources: Resource[] = [];
let _supabaseFetchStarted = false;

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }
function persistDemo() { savePersisted(STORAGE_KEY, _demoResources); }

interface ResourceRow {
  id: string;
  studio_id: string;
  type: string;
  eyebrow: string;
  title: string;
  description: string | null;
  status: string;
  status_label: string;
  meta: string;
  version: string | null;
  progress: number | null;
  avatars: { initials: string; bg: string }[] | null;
  colors: string[] | null;
  media_subtype: Resource['mediaSubtype'] | null;
  web_url: string | null;
}

function toResource(row: ResourceRow): Resource {
  return {
    id: row.id,
    type: row.type as Resource['type'],
    eyebrow: row.eyebrow,
    title: row.title,
    description: row.description ?? undefined,
    status: row.status as Resource['status'],
    statusLabel: row.status_label,
    meta: row.meta,
    version: row.version ?? undefined,
    progress: row.progress ?? undefined,
    avatars: row.avatars ?? undefined,
    colors: row.colors ?? undefined,
    mediaSubtype: row.media_subtype ?? undefined,
    webUrl: row.web_url ?? undefined,
  };
}

function toRow(r: Resource, studioId: string): ResourceRow {
  return {
    id: r.id,
    studio_id: studioId,
    type: r.type,
    eyebrow: r.eyebrow,
    title: r.title,
    description: r.description ?? null,
    status: r.status,
    status_label: r.statusLabel,
    meta: r.meta,
    version: r.version ?? null,
    progress: r.progress ?? null,
    avatars: r.avatars ?? null,
    colors: r.colors ?? null,
    media_subtype: r.mediaSubtype ?? null,
    web_url: r.webUrl ?? null,
  };
}

async function fetchSupabaseResources(): Promise<void> {
  const studioId = await getStudioId();
  const { data, error } = await supabase
    .from('resources')
    .select('*')
    .eq('studio_id', studioId)
    .order('created_at', { ascending: true });

  if (error) { console.error('fetchSupabaseResources failed', error); return; }

  _supabaseResources = (data as ResourceRow[]).map(toResource);
  notify();
}

function ensureSupabaseFetchStarted(): void {
  if (_supabaseFetchStarted) return;
  _supabaseFetchStarted = true;
  void fetchSupabaseResources();
}

export function resetResourcesCache(): void {
  _supabaseResources = [];
  _supabaseFetchStarted = false;
}

onLogout(resetResourcesCache);

async function addSupabaseResource(r: Resource): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('resources').insert(toRow(r, studioId));
  if (error) { console.error('addSupabaseResource failed', error); return; }
  await fetchSupabaseResources();
}

async function updateSupabaseResource(id: string, patch: Partial<Resource>): Promise<void> {
  const studioId = await getStudioId();
  const current = _supabaseResources.find(r => r.id === id);
  if (!current) { console.error('updateSupabaseResource: resource not found in cache', id); return; }
  const merged = { ...current, ...patch };
  const { error } = await supabase.from('resources').update(toRow(merged, studioId)).eq('id', id);
  if (error) { console.error('updateSupabaseResource failed', error); return; }
  await fetchSupabaseResources();
}

async function removeSupabaseResource(id: string): Promise<void> {
  const { error } = await supabase.from('resources').delete().eq('id', id);
  if (error) { console.error('removeSupabaseResource failed', error); return; }
  await fetchSupabaseResources();
}

// ── Public API (unchanged signatures) ─────────────────────────────────────────

export function getResources(): Resource[] {
  if (isDemoSession()) return _demoResources;
  ensureSupabaseFetchStarted();
  return _supabaseResources;
}

export function addResource(r: Resource): void {
  if (isDemoSession()) {
    _demoResources = [..._demoResources, r];
    persistDemo();
    notify();
    return;
  }
  void addSupabaseResource(r);
}

export function updateResource(id: string, patch: Partial<Resource>): void {
  if (isDemoSession()) {
    _demoResources = _demoResources.map(r => r.id === id ? { ...r, ...patch } : r);
    persistDemo();
    notify();
    return;
  }
  void updateSupabaseResource(id, patch);
}

export function removeResource(id: string): void {
  if (isDemoSession()) {
    _demoResources = _demoResources.filter(r => r.id !== id);
    persistDemo();
    notify();
    return;
  }
  void removeSupabaseResource(id);
}

export function subscribeResources(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
```

- [ ] **Step 2: Run the app's typecheck to confirm no consumer breaks**

Run: `cd app && npx tsc --noEmit -p tsconfig.app.json`
Expected: no new errors introduced by this file

- [ ] **Step 3: Commit**

```bash
git add app/src/data/resourceStore.ts
git commit -m "feat: resourceStore.ts dual demo/real Supabase path"
```

---

### Task 4: End-to-end manual verification

**Files:**
- None (manual browser verification, no code changes expected unless a bug is found)

**Interfaces:**
- Consumes: everything built in Tasks 1-3.

- [ ] **Step 1: Demo-session regression check**

Log in as a demo account. Open `/fichiers` (global) and a project's `/projets/:id/fichiers`. Confirm:
- Existing seed folders/files still render correctly, including nested subfolders (e.g. `01_RUSHES` → `Jour_01`).
- Creating a new folder, renaming a file, and moving a file between folders all still work exactly as before.
- Trash/restore and Archive/restore still work, including that trashing a parent folder correctly hides its children in the normal view.
- No console errors.

- [ ] **Step 2: Real-session folder/file/resource creation + persistence**

Log in as (or sign up) a real account with an existing project. Open `/projets/:id/fichiers`. Create a new folder, then a subfolder inside it, then rename one of them. Confirm:
- Both appear immediately in the UI.
- Reload the page — both survive with the correct parent/child relationship intact.
- Check the Supabase Table Editor: rows exist in `file_folders` scoped to the correct `studio_id`, with the subfolder's `parent_id` correctly pointing at the parent's `id`.
- Create a resource via whatever existing UI path adds one (e.g. via a project template, or the AI chat's `create_resource` tool if available) and confirm it appears in `resources` scoped to the correct `studio_id`.

- [ ] **Step 3: Nested-subtree delete-cascade check**

Using the folder structure created in Step 2 (a parent folder containing a subfolder, and add a file inside the subfolder for this test), delete the top-level parent folder. Confirm:
- Both the parent and the subfolder disappear from the UI immediately.
- Reload the page — neither reappears (proving the delete was durable, not just an optimistic local removal).
- Check the Supabase Table Editor: the file that was inside the subfolder is also gone from `file_items` (proving the cascade correctly removed files belonging to a deleted descendant folder, not just the folders themselves).

- [ ] **Step 4: `getStudioId()` concurrency re-check**

Sign up a brand-new real account (fresh studio, never logged in before) and watch the network tab (or console) during the first page load after signup. Confirm:
- No `23505 duplicate key` error on any `studios` or other table insert.
- No failed requests at all during the initial dashboard load, despite `fileStore.ts` and `resourceStore.ts` now being 2 more concurrent callers of `getStudioId()` alongside the 7 that existed after the Calendar chantier.

If a `23505` or any other race-condition symptom appears, do not attempt a new fix pattern — inspect whether the existing in-flight-promise memoization in `studioStore.ts` (added during the Calendar chantier) is somehow bypassed, and escalate with findings rather than guessing.

- [ ] **Step 5: Final typecheck/lint diff against baseline**

Run:
```bash
cd app && npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "^src/"
npm run lint 2>&1 | tail -3
```
Expected: typecheck error count is 185 (identical to the confirmed baseline) and lint reports 338 problems (308 errors, 30 warnings) or fewer.

- [ ] **Step 6: Record final verification results in the progress ledger**
