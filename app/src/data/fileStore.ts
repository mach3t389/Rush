import { loadPersisted, savePersisted } from './persist';

// ── Types ──────────────────────────────────────────────────────────────────────

export interface FileFolder {
  id: string;
  name: string;
  parentId: string | null; // null = root of its scope
  projectId?: string;
  clientId?: string;
  color?: string;
  createdAt: string;
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
  createdAt: string;
  updatedAt: string;
}

// ── Seed folders ───────────────────────────────────────────────────────────────

const SEED_FOLDERS: FileFolder[] = [
  // Global root folders
  { id: 'folder-templates', name: 'Modèles', parentId: null, createdAt: '2025-01-01' },
  { id: 'folder-archives',  name: 'Archives', parentId: null, createdAt: '2025-01-01' },
  { id: 'folder-trash',     name: 'Corbeille', parentId: null, createdAt: '2025-01-01' },

  // Project-scoped folders (Campagne Été 2025 = pj1)
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

  // Project-scoped folders (Les Bâtisseurs = pj2)
  { id: 'f-lb-01', name: '01_RUSHES',   parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
  { id: 'f-lb-02', name: '02_MONTAGE',  parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
  { id: 'f-lb-03', name: '03_EXPORTS',  parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
  { id: 'f-lb-04', name: '04_DOCUMENTS',parentId: null, projectId: 'pj2', createdAt: '2025-05-01' },
];

const SEED_FILES: FileItem[] = [
  // Campagne Été 2025 — Documents
  { id: 'fi-ce-01', name: 'Contrat_Nova_2025.pdf',        type: 'pdf',   ext: 'pdf',  size: 245000,  parentFolderId: 'f-ce-06', projectId: 'pj1', createdAt: '2025-04-02', updatedAt: '2025-04-02' },
  { id: 'fi-ce-02', name: 'Brief_créatif_v3.pdf',         type: 'pdf',   ext: 'pdf',  size: 188000,  parentFolderId: 'f-ce-06', projectId: 'pj1', createdAt: '2025-04-05', updatedAt: '2025-04-10' },
  { id: 'fi-ce-03', name: 'Moodboard_final.jpg',          type: 'image', ext: 'jpg',  size: 3200000, parentFolderId: 'f-ce-03', projectId: 'pj1', createdAt: '2025-04-08', updatedAt: '2025-04-08' },
  { id: 'fi-ce-04', name: 'Logo_Nova_Films.png',          type: 'image', ext: 'png',  size: 120000,  parentFolderId: 'f-ce-03', projectId: 'pj1', createdAt: '2025-04-01', updatedAt: '2025-04-01' },
  { id: 'fi-ce-05', name: 'Rushes_Jour01_A001.mp4',       type: 'video', ext: 'mp4',  size: 4200000000, parentFolderId: 'f-ce-01a', projectId: 'pj1', createdAt: '2025-05-10', updatedAt: '2025-05-10' },
  { id: 'fi-ce-06', name: 'V1_Campagne_Été_2025.mp4',     type: 'video', ext: 'mp4',  size: 890000000, parentFolderId: 'f-ce-05a', projectId: 'pj1', createdAt: '2025-05-20', updatedAt: '2025-05-20' },
  { id: 'fi-ce-07', name: 'Musique_theme.wav',            type: 'audio', ext: 'wav',  size: 45000000, parentFolderId: 'f-ce-02', projectId: 'pj1', createdAt: '2025-04-15', updatedAt: '2025-04-15' },

  // Les Bâtisseurs (pj2)
  { id: 'fi-lb-01', name: 'Contrat_StudioBleu.pdf',       type: 'pdf',   ext: 'pdf',  size: 198000,  parentFolderId: 'f-lb-04', projectId: 'pj2', createdAt: '2025-05-02', updatedAt: '2025-05-02' },
  { id: 'fi-lb-02', name: 'Script_v2_Les_Bâtisseurs.pdf', type: 'pdf',   ext: 'pdf',  size: 88000,   parentFolderId: 'f-lb-04', projectId: 'pj2', createdAt: '2025-05-08', updatedAt: '2025-05-12' },
  { id: 'fi-lb-03', name: 'Rushes_Interview_CEO.mp4',     type: 'video', ext: 'mp4',  size: 6800000000, parentFolderId: 'f-lb-01', projectId: 'pj2', createdAt: '2025-06-01', updatedAt: '2025-06-01' },
];

// ── Store ──────────────────────────────────────────────────────────────────────

type Listener = () => void;

const FOLDERS_KEY = 'sf_file_folders';
const FILES_KEY   = 'sf_file_items';

let folders: FileFolder[] = loadPersisted<FileFolder[]>(FOLDERS_KEY, SEED_FOLDERS);
let files: FileItem[]     = loadPersisted<FileItem[]>(FILES_KEY, SEED_FILES);

const listeners = new Set<Listener>();
const notify = () => listeners.forEach(l => l());

function persist() {
  savePersisted(FOLDERS_KEY, folders);
  savePersisted(FILES_KEY, files);
}

// ── Folders ────────────────────────────────────────────────────────────────────

export function getFolders(): FileFolder[] { return folders; }

export function addFolder(f: Omit<FileFolder, 'id' | 'createdAt'>): FileFolder {
  const folder: FileFolder = { ...f, id: `folder-${Date.now()}`, createdAt: new Date().toISOString().slice(0, 10) };
  folders = [...folders, folder];
  persist();
  notify();
  return folder;
}

export function renameFolder(id: string, name: string): void {
  folders = folders.map(f => f.id === id ? { ...f, name } : f);
  persist();
  notify();
}

export function deleteFolder(id: string): void {
  const toDelete = new Set<string>();
  const collect = (folderId: string) => {
    toDelete.add(folderId);
    folders.filter(f => f.parentId === folderId).forEach(f => collect(f.id));
  };
  collect(id);
  folders = folders.filter(f => !toDelete.has(f.id));
  files = files.filter(fi => !toDelete.has(fi.parentFolderId ?? ''));
  persist();
  notify();
}

export function getChildFolders(parentId: string | null, projectId?: string, clientId?: string): FileFolder[] {
  return folders.filter(f =>
    f.parentId === parentId &&
    (projectId !== undefined ? f.projectId === projectId : clientId !== undefined ? f.clientId === clientId : !f.projectId && !f.clientId)
  );
}

export function getRootFoldersForProject(projectId: string): FileFolder[] {
  return folders.filter(f => f.projectId === projectId && f.parentId === null);
}

export function getRootFoldersForClient(clientId: string): FileFolder[] {
  return folders.filter(f => f.clientId === clientId && f.parentId === null);
}

export function getGlobalRootFolders(): FileFolder[] {
  return folders.filter(f => !f.projectId && !f.clientId && f.parentId === null);
}

// ── Files ──────────────────────────────────────────────────────────────────────

export function getFiles(): FileItem[] { return files; }

export function getFilesInFolder(folderId: string | null, projectId?: string, clientId?: string): FileItem[] {
  return files.filter(fi =>
    fi.parentFolderId === folderId &&
    (projectId !== undefined ? fi.projectId === projectId :
     clientId !== undefined ? fi.clientId === clientId :
     !fi.projectId && !fi.clientId)
  );
}

export function addFile(f: Omit<FileItem, 'id' | 'createdAt' | 'updatedAt'>): FileItem {
  const now = new Date().toISOString().slice(0, 10);
  const file: FileItem = { ...f, id: `file-${Date.now()}`, createdAt: now, updatedAt: now };
  files = [...files, file];
  persist();
  notify();
  return file;
}

export function deleteFile(id: string): void {
  files = files.filter(f => f.id !== id);
  persist();
  notify();
}

export function renameFile(id: string, name: string): void {
  files = files.map(f => f.id === id ? { ...f, name, updatedAt: new Date().toISOString().slice(0, 10) } : f);
  persist();
  notify();
}

export function moveFile(id: string, parentFolderId: string | null): void {
  files = files.map(f => f.id === id ? { ...f, parentFolderId } : f);
  persist();
  notify();
}

export function getAllFiles(): FileItem[] { return files; }

// ── Subscriptions ──────────────────────────────────────────────────────────────

export function subscribeFileStore(fn: Listener): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// ── Helpers ────────────────────────────────────────────────────────────────────

export function getFolderPath(folderId: string): FileFolder[] {
  const path: FileFolder[] = [];
  let current = folders.find(f => f.id === folderId);
  while (current) {
    path.unshift(current);
    current = current.parentId ? folders.find(f => f.id === current!.parentId) : undefined;
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
