# Archiver / supprimer un projet ou un client Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ajouter un vrai cycle archiver → désarchiver → supprimer définitivement pour les projets et les clients, avec suppression en cascade des données liées (tâches, fichiers, événements, factures) à la suppression définitive.

**Architecture:** Un champ `archived: boolean` sur `projects` et `clients` (même pattern que les autres champs déjà migrés). Les fonctions `archiveProject`/`unarchiveProject` (et l'équivalent client) ne sont que des appels à `updateProject`/`updateClient` déjà existants. `removeProject`/`removeClient` orchestrent la cascade en appelant les fonctions déjà exportées par `taskStore.ts`/`eventStore.ts`/`financeStore.ts`/`clientTeamStore.ts`, plus deux nouvelles petites fonctions de suppression en masse ajoutées à `fileStore.ts` (aucune n'existait pour « tous les fichiers d'un projet/client », seulement par dossier ou par état).

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS déjà en place).

## Global Constraints

- Sessions démo (`isDemoSession()`) : comportement `localStorage` inchangé pour tout ce qui existe déjà ; les nouvelles fonctions suivent le même branchement `isDemoSession()` que le reste de chaque store.
- Tous les identifiants restent `text` générés côté client — aucun changement de convention d'id ici (pas de nouvelle table).
- Pas de suite de tests automatisés — chaque tâche se vérifie par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`, référence actuelle : 184 erreurs / 339 problèmes lint, sans lien avec ce chantier) et par vérification manuelle via le serveur de preview.
- Aucune nouvelle policy RLS ni nouveau `grant` requis (le scoping par `studio_id` existant sur `projects`/`clients` reste inchangé, et `update`/`delete` sont déjà accordés sur ces deux tables ainsi que sur `sections`/`tasks`/`file_folders`/`file_items`/`events`/`invoices`/`client_contacts`).
- La suppression définitive d'un projet efface : ses tâches/sections (`taskStore.ts`), ses fichiers/dossiers (`fileStore.ts`), ses événements calendrier (`eventStore.ts`), ses factures (`financeStore.ts`). La suppression d'un client applique cette même cascade à chacun de ses projets, plus ses fichiers/dossiers propres au client, ses factures propres, et son équipe côté client (`clientTeamStore.ts`).
- Les ressources (`resourceStore.ts`) ne sont pas scopées par projet/client dans leur schéma actuel — volontairement hors cascade (voir le spec pour la justification).

---

### Task 1: Schéma Supabase (manuel)

**Files:** aucun fichier de code — SQL exécuté manuellement par l'utilisateur.

**Interfaces:**
- Produces: colonne `archived` sur `projects` et `clients`, consommée par les Tasks 2 et 3.

- [ ] **Step 1: Fournir le SQL à exécuter**

```sql
alter table projects add column archived boolean not null default false;
alter table clients  add column archived boolean not null default false;
```

- [ ] **Step 2: Confirmation utilisateur**

L'utilisateur exécute ce SQL dans l'éditeur SQL Supabase et confirme avant de passer à la Task 2.

---

### Task 2: `eventStore.ts` et `fileStore.ts` — fonctions de suppression en masse par projet/client

**Files:**
- Modify: `app/src/data/eventStore.ts`
- Modify: `app/src/data/fileStore.ts`

**Interfaces:**
- Consumes: aucune nouvelle interface externe.
- Produces: `deleteEventsForProject(projectId: string): void` (eventStore.ts), `deleteAllFilesForProject(projectId: string): void` et `deleteAllFilesForClient(clientId: string): void` (fileStore.ts) — consommées par la Task 3.

- [ ] **Step 1: `eventStore.ts` — ajouter `deleteEventsForProject`**

Ajouter, après la fonction `deleteEvent` existante :

```ts
async function deleteSupabaseEventsForProject(projectId: string): Promise<void> {
  const { error } = await supabase.from('events').delete().eq('project_id', projectId);
  if (error) { console.error('deleteSupabaseEventsForProject failed', error); return; }
  await fetchSupabaseEvents();
}

export function deleteEventsForProject(projectId: string): void {
  if (isDemoSession()) {
    saveDemoEvents(getDemoEvents().filter(e => e.projectId !== projectId));
    notify();
    return;
  }
  void deleteSupabaseEventsForProject(projectId);
}
```

(Utiliser exactement les mêmes noms de fonctions internes — `getDemoEvents`, `saveDemoEvents`, `fetchSupabaseEvents`, `notify` — déjà présents dans ce fichier, visibles juste au-dessus de la fonction `deleteEvent` existante.)

- [ ] **Step 2: `fileStore.ts` — ajouter `deleteAllFilesForProject` et `deleteAllFilesForClient`**

Ajouter, juste après la fonction `emptyTrash` existante :

```ts
export function deleteAllFilesForProject(projectId: string): void {
  if (isDemoSession()) {
    _demoFolders = _demoFolders.filter(f => f.projectId !== projectId);
    _demoFiles = _demoFiles.filter(fi => fi.projectId !== projectId);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const studioId = await getStudioId();
    const { error: filesError } = await supabase.from('file_items')
      .delete().eq('studio_id', studioId).eq('project_id', projectId);
    if (filesError) { console.error('deleteAllFilesForProject (files) failed', filesError); return; }
    const { error: foldersError } = await supabase.from('file_folders')
      .delete().eq('studio_id', studioId).eq('project_id', projectId);
    if (foldersError) { console.error('deleteAllFilesForProject (folders) failed', foldersError); return; }
    await fetchSupabaseFileData();
  })();
}

export function deleteAllFilesForClient(clientId: string): void {
  if (isDemoSession()) {
    _demoFolders = _demoFolders.filter(f => f.clientId !== clientId);
    _demoFiles = _demoFiles.filter(fi => fi.clientId !== clientId);
    persistDemo();
    notify();
    return;
  }

  void (async () => {
    const studioId = await getStudioId();
    const { error: filesError } = await supabase.from('file_items')
      .delete().eq('studio_id', studioId).eq('client_id', clientId);
    if (filesError) { console.error('deleteAllFilesForClient (files) failed', filesError); return; }
    const { error: foldersError } = await supabase.from('file_folders')
      .delete().eq('studio_id', studioId).eq('client_id', clientId);
    if (foldersError) { console.error('deleteAllFilesForClient (folders) failed', foldersError); return; }
    await fetchSupabaseFileData();
  })();
}
```

(Les fichiers sont supprimés avant les dossiers pour éviter tout souci de contrainte de clé étrangère entre `file_items.parent_folder_id` et `file_folders.id`.)

- [ ] **Step 3: Vérifier la compilation**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 184 erreurs (référence du projet), aucune nouvelle erreur.

- [ ] **Step 4: Commit**

```bash
git add app/src/data/eventStore.ts app/src/data/fileStore.ts
git commit -m "feat: bulk delete-by-project/client helpers in eventStore.ts and fileStore.ts"
```

---

### Task 3: `projectStore.ts` — champ `archived` + `archiveProject`/`unarchiveProject`/`removeProject`

**Files:**
- Modify: `app/src/types/index.ts` (ajouter `archived?: boolean` à `Project`)
- Modify: `app/src/data/projectStore.ts`

**Interfaces:**
- Consumes: `setSections(projectId, [])` (`./taskStore`), `deleteEventsForProject(projectId)` (`./eventStore`, Task 2), `deleteAllFilesForProject(projectId)` (`./fileStore`, Task 2), `getInvoicesByProject(projectId)` + `removeInvoice(id)` (`./financeStore`).
- Produces: `archiveProject(id: string): void`, `unarchiveProject(id: string): void`, `removeProject(id: string): void` — consommées par la Task 5 (UI) et par la Task 4 (`removeClient`, qui appelle `removeProject` pour chaque projet du client).

- [ ] **Step 1: `types/index.ts` — ajouter le champ**

Le bloc actuel :

```ts
export interface Project {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  clientColor: string;
  phase: Phase;
  phaseLabel: string;
  progress: number;
  taskCount: number;
  deliverableCount: number;
  members: User[];
  deliveryDate: string;
  status: Status;
  statusLabel: string;
  modifiedAt: string;
  budget?: number;
  description?: string;
  folderStructureTemplateId?: string;
}
```

Remplacer par (ajout de `archived?: boolean;`) :

```ts
export interface Project {
  id: string;
  name: string;
  clientId: string;
  clientName: string;
  clientColor: string;
  phase: Phase;
  phaseLabel: string;
  progress: number;
  taskCount: number;
  deliverableCount: number;
  members: User[];
  deliveryDate: string;
  status: Status;
  statusLabel: string;
  modifiedAt: string;
  budget?: number;
  description?: string;
  folderStructureTemplateId?: string;
  archived?: boolean;
}
```

- [ ] **Step 2: `projectStore.ts` — ajouter la colonne au mapping Row ↔ Project**

Le bloc `ProjectRow` actuel :

```ts
interface ProjectRow {
  id: string;
  studio_id: string;
  name: string;
  client_id: string;
  client_name: string;
  client_color: string;
  phase: string;
  phase_label: string;
  progress: number;
  task_count: number;
  deliverable_count: number;
  delivery_date: string;
  status: string;
  status_label: string;
  modified_at: string;
  budget: number | null;
  description: string | null;
  folder_structure_template_id: string | null;
  members: Project['members'];
}
```

Remplacer par (ajout de `archived: boolean;`) :

```ts
interface ProjectRow {
  id: string;
  studio_id: string;
  name: string;
  client_id: string;
  client_name: string;
  client_color: string;
  phase: string;
  phase_label: string;
  progress: number;
  task_count: number;
  deliverable_count: number;
  delivery_date: string;
  status: string;
  status_label: string;
  modified_at: string;
  budget: number | null;
  description: string | null;
  folder_structure_template_id: string | null;
  members: Project['members'];
  archived: boolean;
}
```

Dans `toProject`, le bloc actuel :

```ts
    folderStructureTemplateId: row.folder_structure_template_id ?? undefined,
  };
}
```

Remplacer par :

```ts
    folderStructureTemplateId: row.folder_structure_template_id ?? undefined,
    archived: row.archived,
  };
}
```

Dans `toRow`, le bloc actuel :

```ts
    folder_structure_template_id: p.folderStructureTemplateId ?? null,
    members: p.members,
  };
}
```

Remplacer par :

```ts
    folder_structure_template_id: p.folderStructureTemplateId ?? null,
    members: p.members,
    archived: p.archived ?? false,
  };
}
```

- [ ] **Step 3: Ajouter les imports nécessaires à la cascade**

Le bloc d'import actuel :

```ts
import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
```

Remplacer par :

```ts
import { PROJECTS } from './mock';
import type { Project } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { setSections } from './taskStore';
import { deleteEventsForProject } from './eventStore';
import { deleteAllFilesForProject } from './fileStore';
import { getInvoicesByProject, removeInvoice } from './financeStore';
```

- [ ] **Step 4: Ajouter `archiveProject`, `unarchiveProject`, `removeProject`**

Ajouter, à la fin du fichier, après `subscribeProjects` :

```ts
export function archiveProject(id: string): void {
  updateProject(id, { archived: true });
}

export function unarchiveProject(id: string): void {
  updateProject(id, { archived: false });
}

async function removeSupabaseProject(id: string): Promise<void> {
  const { error } = await supabase.from('projects').delete().eq('id', id);
  if (error) { console.error('removeSupabaseProject failed', error); return; }
  await fetchSupabaseProjects();
}

export function removeProject(id: string): void {
  setSections(id, []);
  deleteEventsForProject(id);
  deleteAllFilesForProject(id);
  getInvoicesByProject(id).forEach(inv => removeInvoice(inv.id));

  if (isDemoSession()) {
    _added = _added.filter(p => p.id !== id);
    const { [id]: _removed, ...rest } = _overrides;
    _overrides = rest;
    persist();
    persistOverrides();
    notify();
    return;
  }
  _supabaseProjects = _supabaseProjects.filter(p => p.id !== id);
  notify();
  void removeSupabaseProject(id);
}
```

(La cascade — tâches, événements, fichiers, factures — se fait de la même façon en démo et en session réelle, puisque chacune des fonctions appelées branche déjà elle-même sur `isDemoSession()`. Seule la suppression de la ligne `projects` elle-même a besoin de sa propre branche ici.)

- [ ] **Step 5: Vérifier la compilation**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 184 erreurs (référence du projet), aucune nouvelle erreur.

- [ ] **Step 6: Commit**

```bash
git add app/src/types/index.ts app/src/data/projectStore.ts
git commit -m "feat: archiveProject/unarchiveProject/removeProject with cascade delete"
```

---

### Task 4: `clientStore.ts` — champ `archived` + `archiveClient`/`unarchiveClient`/`removeClient`

**Files:**
- Modify: `app/src/types/index.ts` (ajouter `archived?: boolean` à `Client`)
- Modify: `app/src/data/clientStore.ts`

**Interfaces:**
- Consumes: `removeProject(id)` (`./projectStore`, Task 3), `deleteAllFilesForClient(clientId)` (`./fileStore`, Task 2), `getInvoicesByClient(clientId)` + `removeInvoice(id)` (`./financeStore`), `setClientTeam(clientId, [])` (`./clientTeamStore`).
- Produces: `archiveClient(id: string): void`, `unarchiveClient(id: string): void`, `removeClient(id: string): void` — consommées par la Task 6 (UI).

- [ ] **Step 1: `types/index.ts` — ajouter le champ**

Le bloc actuel :

```ts
export interface Client {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  sector: string;
  city: string;
  activeProjects: number;
  pendingDeliverables: number;
  since: string;
  progress: number;
  status: Status;
  statusLabel: string;
  lastActivity: string;
  address?: string;
  phone?: string;
  email?: string;
  emailCompta?: string;
  website?: string;
  notes?: string;
}
```

Remplacer par (ajout de `archived?: boolean;`) :

```ts
export interface Client {
  id: string;
  name: string;
  initials: string;
  avatarColor: string;
  sector: string;
  city: string;
  activeProjects: number;
  pendingDeliverables: number;
  since: string;
  progress: number;
  status: Status;
  statusLabel: string;
  lastActivity: string;
  address?: string;
  phone?: string;
  email?: string;
  emailCompta?: string;
  website?: string;
  notes?: string;
  archived?: boolean;
}
```

- [ ] **Step 2: `clientStore.ts` — ajouter la colonne au mapping Row ↔ Client**

Le bloc `ClientRow` actuel :

```ts
interface ClientRow {
  id: string;
  studio_id: string;
  name: string;
  initials: string;
  avatar_color: string;
  sector: string;
  city: string;
  active_projects: number;
  pending_deliverables: number;
  since: string;
  progress: number;
  status: string;
  status_label: string;
  last_activity: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  email_compta: string | null;
  website: string | null;
  notes: string | null;
}
```

Remplacer par (ajout de `archived: boolean;`) :

```ts
interface ClientRow {
  id: string;
  studio_id: string;
  name: string;
  initials: string;
  avatar_color: string;
  sector: string;
  city: string;
  active_projects: number;
  pending_deliverables: number;
  since: string;
  progress: number;
  status: string;
  status_label: string;
  last_activity: string;
  address: string | null;
  phone: string | null;
  email: string | null;
  email_compta: string | null;
  website: string | null;
  notes: string | null;
  archived: boolean;
}
```

Dans `toClient`, le bloc actuel :

```ts
    website: row.website ?? undefined,
    notes: row.notes ?? undefined,
  };
}
```

Remplacer par :

```ts
    website: row.website ?? undefined,
    notes: row.notes ?? undefined,
    archived: row.archived,
  };
}
```

Dans `toRow`, le bloc actuel :

```ts
    website: c.website ?? null,
    notes: c.notes ?? null,
  };
}
```

Remplacer par :

```ts
    website: c.website ?? null,
    notes: c.notes ?? null,
    archived: c.archived ?? false,
  };
}
```

- [ ] **Step 3: Ajouter les imports nécessaires à la cascade**

Le bloc d'import actuel :

```ts
import { CLIENTS } from './mock';
import type { Client } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
```

Remplacer par :

```ts
import { CLIENTS } from './mock';
import type { Client } from '../types';
import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { getProjects, removeProject } from './projectStore';
import { deleteAllFilesForClient } from './fileStore';
import { getInvoicesByClient, removeInvoice } from './financeStore';
import { setClientTeam } from './clientTeamStore';
```

- [ ] **Step 4: Ajouter `archiveClient`, `unarchiveClient`, `removeClient`**

Ajouter, à la fin du fichier, après `subscribeClients` :

```ts
export function archiveClient(id: string): void {
  updateClient(id, { archived: true });
}

export function unarchiveClient(id: string): void {
  updateClient(id, { archived: false });
}

async function removeSupabaseClient(id: string): Promise<void> {
  const { error } = await supabase.from('clients').delete().eq('id', id);
  if (error) { console.error('removeSupabaseClient failed', error); return; }
  await fetchSupabaseClients();
}

export function removeClient(id: string): void {
  getProjects().filter(p => p.clientId === id).forEach(p => removeProject(p.id));
  deleteAllFilesForClient(id);
  getInvoicesByClient(id).forEach(inv => removeInvoice(inv.id));
  setClientTeam(id, []);

  if (isDemoSession()) {
    _added = _added.filter(c => c.id !== id);
    const { [id]: _removed, ...rest } = _overrides;
    _overrides = rest;
    persist();
    persistOverrides();
    notify();
    return;
  }
  _supabaseClients = _supabaseClients.filter(c => c.id !== id);
  notify();
  void removeSupabaseClient(id);
}
```

- [ ] **Step 5: Vérifier la compilation**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 184 erreurs (référence du projet), aucune nouvelle erreur.

- [ ] **Step 6: Commit**

```bash
git add app/src/types/index.ts app/src/data/clientStore.ts
git commit -m "feat: archiveClient/unarchiveClient/removeClient with cascade delete"
```

---

### Task 5: `ProjectHeaderBar.tsx` — menu « ⋯ » (Archiver / Désarchiver / Supprimer définitivement)

**Files:**
- Modify: `app/src/components/ProjectHeaderBar.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json` (nouvelles clés)

**Interfaces:**
- Consumes: `archiveProject`, `unarchiveProject`, `removeProject` (`../data/projectStore`, Task 3).

- [ ] **Step 1: Ajouter les clés de traduction**

Dans `app/src/locales/fr.json`, section `"projects"`, ajouter (à côté de `"projectColor"` par exemple) :

```json
    "archiveProject": "Archiver le projet",
    "unarchiveProject": "Désarchiver le projet",
    "deleteProjectPermanently": "Supprimer définitivement",
    "deleteProjectConfirm": "Supprimer ce projet et tout son contenu ? Cette action est irréversible.",
    "archivedBadge": "Archivé"
```

Dans `app/src/locales/en.json`, section `"projects"`, ajouter :

```json
    "archiveProject": "Archive project",
    "unarchiveProject": "Unarchive project",
    "deleteProjectPermanently": "Delete permanently",
    "deleteProjectConfirm": "Delete this project and everything in it? This can't be undone.",
    "archivedBadge": "Archived"
```

- [ ] **Step 2: Importer les fonctions et ajouter l'état du menu**

Le bloc d'import actuel :

```ts
import { findProject, subscribeProjects } from '../data/projectStore';
```

Remplacer par :

```ts
import { findProject, subscribeProjects, archiveProject, unarchiveProject, removeProject } from '../data/projectStore';
```

Le bloc actuel :

```ts
  const [, forceUpdate] = useState(0);
  const dotColor = project ? getProjectColor(project.id, project.clientColor) : '#888';
  const [colorOpen, setColorOpen] = useState(false);
```

Remplacer par :

```ts
  const [, forceUpdate] = useState(0);
  const dotColor = project ? getProjectColor(project.id, project.clientColor) : '#888';
  const [colorOpen, setColorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
```

- [ ] **Step 3: Ajouter le menu dans le slot de droite**

Le bloc actuel :

```tsx
      {/* Right slot — actions propres à l'onglet */}
      {children && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {children}
        </div>
      )}
```

Remplacer par :

```tsx
      {/* Right slot — actions propres à l'onglet + menu du projet */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {project.archived && (
          <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', letterSpacing: '0.05em' }}>
            {t('projects.archivedBadge')}
          </span>
        )}
        {children}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(v => !v)} title={t('projects.projectColor')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}>
            <SFIcon name="ellipsis" size={15} />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => { setMenuOpen(false); setConfirmDelete(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                <button
                  onClick={() => { project.archived ? unarchiveProject(project.id) : archiveProject(project.id); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name={project.archived ? 'rotate-ccw' : 'archive'} size={13} color="var(--text-3)" />
                  {project.archived ? t('projects.unarchiveProject') : t('projects.archiveProject')}
                </button>
                {project.archived && !confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                  >
                    <SFIcon name="trash-2" size={13} color="var(--danger)" />
                    {t('projects.deleteProjectPermanently')}
                  </button>
                )}
                {project.archived && confirmDelete && (
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{t('projects.deleteProjectConfirm')}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { removeProject(project.id); setMenuOpen(false); setConfirmDelete(false); navigate('/projets'); }}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                      >
                        {t('tasks.yes')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                      >
                        {t('tasks.no')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>
```

(Réutilise les clés `tasks.yes`/`tasks.no` déjà existantes pour la confirmation — même convention que le reste de l'app. L'icône `ellipsis` doit exister dans Lucide — vérifier sur lucide.dev si elle ne s'affiche pas ; `archive`, `rotate-ccw` et `trash-2` sont déjà utilisés ailleurs dans le projet.)

- [ ] **Step 4: Vérifier la compilation**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 184 erreurs (référence du projet), aucune nouvelle erreur.

- [ ] **Step 5: Vérification visuelle**

Ouvrir un projet, cliquer le bouton « ⋯ » → « Archiver le projet ». Le badge « Archivé » apparaît dans l'en-tête. Rouvrir le menu → « Désarchiver le projet » le fait disparaître. Archiver à nouveau, rouvrir le menu → « Supprimer définitivement » apparaît, cliquer → confirmation Oui/Non s'affiche → Oui supprime et redirige vers `/projets`.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ProjectHeaderBar.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add archive/unarchive/delete menu to ProjectHeaderBar"
```

---

### Task 6: `ProjectsListView.tsx` — onglet « Archivés » + exclusion par défaut

**Files:**
- Modify: `app/src/components/ProjectsListView.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `Project.archived` (Task 3, via `../types`).

- [ ] **Step 1: Ajouter les clés de traduction**

Dans `app/src/locales/fr.json`, section `"projects"`, ajouter :

```json
    "filterArchived": "Archivés"
```

Dans `app/src/locales/en.json`, section `"projects"`, ajouter :

```json
    "filterArchived": "Archived"
```

- [ ] **Step 2: Étendre le type du filtre et la logique d'exclusion**

Le bloc actuel :

```ts
  const [filter, setFilter] = useState<'all' | Status>('all');
```

Remplacer par :

```ts
  const [filter, setFilter] = useState<'all' | Status | 'archived'>('all');
```

Le bloc actuel :

```ts
  const filtered = projects
    .filter(p => {
      if (search) {
        const q = search.toLowerCase();
        const match = p.name.toLowerCase().includes(q) || (!clientId && p.clientName.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (filter !== 'all') return p.status === filter;
      return true;
    })
```

Remplacer par :

```ts
  const filtered = projects
    .filter(p => {
      if (search) {
        const q = search.toLowerCase();
        const match = p.name.toLowerCase().includes(q) || (!clientId && p.clientName.toLowerCase().includes(q));
        if (!match) return false;
      }
      if (filter === 'archived') return !!p.archived;
      if (p.archived) return false;
      if (filter !== 'all') return p.status === filter;
      return true;
    })
```

- [ ] **Step 3: Ajouter l'onglet « Archivés »**

Le bloc actuel :

```tsx
          {([['all', t('projects.filterAll')], ...PROJECT_STATUS_OPTIONS.map(o => [o.status, t(o.labelKey)])] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val as 'all' | Status)}
              style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === val ? 'var(--surface-3)' : 'transparent', color: filter === val ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              {label}
            </button>
          ))}
```

Remplacer par :

```tsx
          {([['all', t('projects.filterAll')], ...PROJECT_STATUS_OPTIONS.map(o => [o.status, t(o.labelKey)]), ['archived', t('projects.filterArchived')]] as [string, string][]).map(([val, label]) => (
            <button
              key={val}
              onClick={() => setFilter(val as 'all' | Status | 'archived')}
              style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: filter === val ? 'var(--surface-3)' : 'transparent', color: filter === val ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}
            >
              {label}
            </button>
          ))}
```

- [ ] **Step 4: Vérifier la compilation**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 184 erreurs (référence du projet), aucune nouvelle erreur.

- [ ] **Step 5: Vérification visuelle**

Sur `/projets`, archiver un projet (via la Task 5) — il disparaît de « Tous » et apparaît dans « Archivés ». Le cliquer depuis « Archivés » ouvre normalement le projet.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ProjectsListView.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: add Archivés filter tab to ProjectsListView, exclude archived by default"
```

---

### Task 7: `FicheClient.tsx` et `Clients.tsx` — menu client réel

**Files:**
- Modify: `app/src/screens/FicheClient.tsx`
- Modify: `app/src/screens/Clients.tsx`
- Modify: `app/src/locales/fr.json`, `app/src/locales/en.json`

**Interfaces:**
- Consumes: `archiveClient`, `unarchiveClient`, `removeClient` (`../data/clientStore`, Task 4).

- [ ] **Step 1: Ajouter les clés de traduction**

Dans `app/src/locales/fr.json`, section `"client"`, ajouter (à côté de `"editClient"`) :

```json
    "archiveClient": "Archiver le client",
    "unarchiveClient": "Désarchiver le client",
    "deleteClientPermanently": "Supprimer définitivement",
    "deleteClientConfirm": "Supprimer ce client et tout son contenu (projets, factures, fichiers) ? Cette action est irréversible."
```

Dans `app/src/locales/en.json`, section `"client"`, ajouter :

```json
    "archiveClient": "Archive client",
    "unarchiveClient": "Unarchive client",
    "deleteClientPermanently": "Delete permanently",
    "deleteClientConfirm": "Delete this client and everything in it (projects, invoices, files)? This can't be undone."
```

- [ ] **Step 2: `FicheClient.tsx` — remplacer le stub mort par le vrai menu**

Importer les fonctions. Le bloc d'import actuel (chercher la ligne qui importe depuis `../data/clientStore`) :

```ts
import { getClients, findClient, updateClient } from '../data/clientStore';
```

Remplacer par (ajout des 3 fonctions ; garder le reste de la ligne identique si d'autres noms y figurent déjà — vérifier l'import exact dans le fichier avant de remplacer) :

```ts
import { getClients, findClient, updateClient, archiveClient, unarchiveClient, removeClient } from '../data/clientStore';
```

Le bloc actuel :

```tsx
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [clientArchived, setClientArchived] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientEditOpen, setClientEditOpen] = useState(() => searchParams.get('edit') === 'true');
  const clientMenuRef = useRef<HTMLDivElement>(null);
```

Remplacer par (retrait de l'état mort `clientArchived`/`setClientArchived`, `clientMenuOpen` et `clientMenuRef` réutilisés pour le vrai menu, ajout de `confirmDeleteClient`) :

```tsx
  const [showCreateProject, setShowCreateProject] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [confirmDeleteClient, setConfirmDeleteClient] = useState(false);
  const [clientEditOpen, setClientEditOpen] = useState(() => searchParams.get('edit') === 'true');
  const clientMenuRef = useRef<HTMLDivElement>(null);
```

Le bloc actuel (en-tête du client) :

```tsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {clientArchived && (
              <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', letterSpacing: '0.05em' }}>
                {t('client.archived')}
              </span>
            )}
            <button onClick={() => setClientEditOpen(true)} title={t('client.editClient')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <SFIcon name="square-pen" size={14} color="var(--text-3)" />
              {t('client.edit')}
            </button>
            <SFButton variant="primary" icon="plus" onClick={() => { setTab('projets'); setShowCreateProject(true); }}>{t('client.newProject')}</SFButton>
          </div>
```

Remplacer par :

```tsx
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {client.archived && (
              <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', letterSpacing: '0.05em' }}>
                {t('client.archived')}
              </span>
            )}
            <button onClick={() => setClientEditOpen(true)} title={t('client.editClient')}
              style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
            >
              <SFIcon name="square-pen" size={14} color="var(--text-3)" />
              {t('client.edit')}
            </button>
            <div style={{ position: 'relative' }} ref={clientMenuRef}>
              <button onClick={() => setClientMenuOpen(v => !v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}>
                <SFIcon name="ellipsis" size={15} />
              </button>
              {clientMenuOpen && (
                <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 210, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                  <button
                    onClick={() => { client.archived ? unarchiveClient(client.id) : archiveClient(client.id); setClientMenuOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                  >
                    <SFIcon name={client.archived ? 'rotate-ccw' : 'archive'} size={13} color="var(--text-3)" />
                    {client.archived ? t('client.unarchiveClient') : t('client.archiveClient')}
                  </button>
                  {client.archived && !confirmDeleteClient && (
                    <button
                      onClick={() => setConfirmDeleteClient(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                    >
                      <SFIcon name="trash-2" size={13} color="var(--danger)" />
                      {t('client.deleteClientPermanently')}
                    </button>
                  )}
                  {client.archived && confirmDeleteClient && (
                    <div style={{ padding: '8px 10px' }}>
                      <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{t('client.deleteClientConfirm')}</p>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button
                          onClick={() => { removeClient(client.id); setClientMenuOpen(false); setConfirmDeleteClient(false); navigate('/clients'); }}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                        >
                          {t('tasks.yes')}
                        </button>
                        <button
                          onClick={() => setConfirmDeleteClient(false)}
                          style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                        >
                          {t('tasks.no')}
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
            <SFButton variant="primary" icon="plus" onClick={() => { setTab('projets'); setShowCreateProject(true); }}>{t('client.newProject')}</SFButton>
          </div>
```

(`navigate` doit déjà être disponible dans ce composant, via `useNavigate()` — vérifier l'import en haut du fichier, l'ajouter s'il manque. L'effet de fermeture au clic extérieur qui référence déjà `clientMenuRef`/`clientMenuOpen` reste inchangé, il fonctionnera tel quel avec ce vrai menu.)

- [ ] **Step 3: `Clients.tsx` — brancher l'onglet « Archivés » sur le vrai champ**

Le bloc actuel :

```tsx
    if (filter === 'archived') return c.status === 'neutral';
```

Remplacer par :

```tsx
    if (filter === 'archived') return !!c.archived;
```

Chercher aussi le filtre de la liste "Tous"/"Actifs" pour s'assurer qu'un client archivé n'apparaît pas dans "Tous" — si la logique actuelle ne fait pas déjà cette distinction (chercher le bloc juste avant celui ci-dessus, autour du même `filter ===`), ajouter une exclusion équivalente à celle de la Task 6 : `if (c.archived) return false;` avant de continuer vers la logique `'all'`/`'active'`.

- [ ] **Step 4: Vérifier la compilation**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 184 erreurs (référence du projet), aucune nouvelle erreur.

- [ ] **Step 5: Vérification visuelle**

Sur la fiche d'un client, cliquer le bouton « ⋯ » à côté de « Modifier » → « Archiver le client ». Le badge « Archivé » apparaît, le client disparaît de la liste "Clients" principale, apparaît dans "Archivés". Rouvrir sa fiche → « Désarchiver » fonctionne. Archiver à nouveau → « Supprimer définitivement » → confirmation → suppression + redirection vers `/clients`.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/FicheClient.tsx app/src/screens/Clients.tsx app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat: wire real archive/delete menu for clients, fix dead clientArchived stub"
```

---

### Task 8: Vérification manuelle de bout en bout

**Files:** aucun (vérification seulement).

- [ ] **Step 1: Vérification TypeScript et lint finale**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 184 erreurs (référence du projet), aucune régression.

Run (depuis `app/`): `npm run lint`
Expected: 339 problèmes (référence du projet), aucune régression.

- [ ] **Step 2: Cascade complète — projet**

Avec un compte réel : créer un projet de test, y ajouter une tâche, un fichier, un événement de calendrier et une facture. Archiver le projet (il disparaît de `/projets`, reste dans "Archivés"). Le désarchiver (tout est intact). L'archiver à nouveau puis le supprimer définitivement — confirmer que la tâche, le fichier, l'événement et la facture ont disparu de partout dans l'application (pas seulement du projet).

- [ ] **Step 3: Cascade complète — client**

Créer un client de test avec un projet (contenant lui-même une tâche/fichier/facture), une facture propre au client (sans projet), et un membre d'équipe côté client. Archiver puis supprimer définitivement le client — confirmer que tout a disparu, y compris le projet et son propre contenu.

- [ ] **Step 4: Régression démo**

Avec un compte de démonstration : confirmer qu'archiver/désarchiver/supprimer un projet ou un client fonctionne de la même façon, entièrement en `localStorage`, sans toucher aux 3 comptes ni à leurs données de base au-delà de ce qui est explicitement testé.

- [ ] **Step 5: Revue finale**

Relire `git diff` de l'ensemble des fichiers modifiés pour confirmer : aucune référence résiduelle à l'ancien état mort `clientArchived`, le filtre "Archivés" de `Clients.tsx` n'utilise plus `status === 'neutral'`, et aucun écran (Dashboard, sidebar, sélecteurs de projet/client dans Taches.tsx/TaskPanel.tsx/ProjetCalendrier.tsx/CalendrierGlobal.tsx) ne montre par erreur un projet ou client archivé — si l'un de ces écrans liste les projets/clients sans passer par `ProjectsListView.tsx`/`Clients.tsx`, vérifier s'il a besoin d'un filtre `archived` ajouté à la volée pendant cette tâche.

- [ ] **Step 6: Commit final (si des ajustements ont été faits pendant la vérification)**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification of project/client archive+delete"
```

(Ne committer que s'il y a effectivement eu des changements pendant cette étape — sinon, sauter ce commit.)
