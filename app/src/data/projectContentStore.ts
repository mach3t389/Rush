import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';

// ─────────────────────────────────────────────────────────────────────────────
// Store de contenu libre par projet — pour l'instant les notes internes et la
// vision/positionnement de l'onglet Aperçu (TravailOverview.tsx). Le type
// `Project` (types/index.ts) ne porte que des métadonnées structurées ; ce
// contenu texte libre est stocké ici, indexé par `projectId`, même pattern que
// resourceContentStore.ts mais chargé à la demande par projet plutôt que
// préchargé en bloc (une seule page Aperçu affichée à la fois).
//
// Demo sessions: localStorage. Real sessions: table `project_content`.
// ─────────────────────────────────────────────────────────────────────────────

export type OverviewSectionKind = 'fields' | 'note';

export interface OverviewFieldDef {
  id: string;
  label: string;
  multiline?: boolean;
}

export interface CustomOverviewSection {
  id: string;
  kind: OverviewSectionKind;
  title: string;
  icon: string;
  fields?: OverviewFieldDef[]; // uniquement pour kind: 'fields'
}

export interface ProjectVision {
  concept: string;
  tonalite: string;
  publicCible: string;
  objectifs: string;
  references: string;
}

export interface ProjectContent {
  notes?: string;
  vision?: ProjectVision;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, string | Record<string, string>>;
}

const STORAGE_KEY = 'sf_project_content';

// ── Demo-session working set ─────────────────────────────────────────────────
let _demoContent: Record<string, ProjectContent> = loadPersisted(STORAGE_KEY, {} as Record<string, ProjectContent>);
function persistDemo() { savePersisted(STORAGE_KEY, _demoContent); }

// ── Real-session working set ─────────────────────────────────────────────────
let _supabaseContent: Record<string, ProjectContent> = {};
const _fetchedProjectIds = new Set<string>();

const _listeners: Set<() => void> = new Set();
function notify() { _listeners.forEach(fn => fn()); }

interface ProjectContentRow {
  project_id: string;
  content: ProjectContent;
}

async function fetchSupabaseContent(projectId: string): Promise<void> {
  const { data, error } = await supabase
    .from('project_content')
    .select('project_id, content')
    .eq('project_id', projectId)
    .maybeSingle();

  if (error) { console.error('fetchProjectContent failed', error); return; }
  if (data) _supabaseContent = { ..._supabaseContent, [projectId]: (data as ProjectContentRow).content };
  notify();
}

function ensureFetchStarted(projectId: string): void {
  if (_fetchedProjectIds.has(projectId)) return;
  _fetchedProjectIds.add(projectId);
  void fetchSupabaseContent(projectId);
}

export function resetProjectContentCache(): void {
  _supabaseContent = {};
  _fetchedProjectIds.clear();
}

onLogout(resetProjectContentCache);

async function setSupabaseContent(projectId: string, content: ProjectContent): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase
    .from('project_content')
    .upsert({ project_id: projectId, studio_id: studioId, content, updated_at: new Date().toISOString() });
  if (error) console.error('setProjectContent failed', error);
}

// ── Public API ───────────────────────────────────────────────────────────────

export function getProjectContent(projectId: string): ProjectContent {
  if (isDemoSession()) return _demoContent[projectId] ?? {};
  ensureFetchStarted(projectId);
  return _supabaseContent[projectId] ?? {};
}

export function setProjectContent(projectId: string, content: ProjectContent): void {
  if (isDemoSession()) {
    _demoContent = { ..._demoContent, [projectId]: content };
    persistDemo();
    notify();
    return;
  }
  _supabaseContent = { ..._supabaseContent, [projectId]: content };
  notify();
  void setSupabaseContent(projectId, content);
}

export function subscribeProjectContent(fn: () => void): () => void {
  _listeners.add(fn);
  return () => { _listeners.delete(fn); };
}
