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
