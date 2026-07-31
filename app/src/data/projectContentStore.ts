import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import i18n from '../i18n/i18n';

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

export type OverviewSectionKind = 'fields' | 'note' | 'deliverables' | 'checklist' | 'gallery' | 'links';

export interface OverviewFieldDef {
  id: string;
  label: string;
  multiline?: boolean;
}

export interface ChecklistItem {
  id: string;
  text: string;
  checked: boolean;
}

export interface GalleryImage {
  id: string;
  /** Blob URL en mémoire ; persisté via fileContentStore (même mécanisme que l'import de fichiers réels). */
  dataUrl: string;
  caption: string;
}

export interface CustomOverviewSection {
  id: string;
  kind: OverviewSectionKind;
  title: string;
  icon: string;
  fields?: OverviewFieldDef[]; // uniquement pour kind: 'fields'
  locked?: boolean; // ne peut pas être supprimée dans son ensemble (ex. Vision du projet) — ses champs restent éditables
}

export const VISION_SECTION_ID = 'vision';
export const DELIVERABLES_SECTION_ID = 'deliverables';

// Fonction (et non constante) pour que les libellés soient résolus dans la langue
// COURANTE à chaque appel — une constante figerait la langue au chargement du module.
export function getDefaultVisionSection(): CustomOverviewSection {
  return {
    id: VISION_SECTION_ID,
    kind: 'fields',
    title: i18n.t('overview.visionTitle'),
    icon: 'compass',
    locked: true,
    fields: [
      { id: 'concept', label: i18n.t('overview.visionConcept'), multiline: true },
      { id: 'tonalite', label: i18n.t('overview.visionTone'), multiline: true },
      { id: 'publicCible', label: i18n.t('overview.visionAudience'), multiline: true },
      { id: 'objectifs', label: i18n.t('overview.visionGoals'), multiline: true },
      { id: 'references', label: i18n.t('overview.visionReferences'), multiline: true },
    ],
  };
}

export function getDefaultDeliverablesSection(): CustomOverviewSection {
  return {
    id: DELIVERABLES_SECTION_ID,
    kind: 'deliverables',
    title: i18n.t('overview.clientDeliverables'),
    icon: 'package',
  };
}

export type CustomSectionValue =
  | string                        // kind: 'note'
  | Record<string, string>        // kind: 'fields'
  | ChecklistItem[]                // kind: 'checklist'
  | GalleryImage[]                 // kind: 'gallery'
  | string[];                      // kind: 'links' — ids de ressources/fichiers liés

export interface ProjectContent {
  notes?: string;
  customSections?: CustomOverviewSection[];
  customSectionData?: Record<string, CustomSectionValue>;
}

// Ancien format (avant unification de Vision dans customSections) :
// { vision: { concept, tonalite, publicCible, objectifs, references } }.
// Nouveau format : une entrée customSections avec id VISION_SECTION_ID + les valeurs dans
// customSectionData[VISION_SECTION_ID]. Purement une lecture de confort — n'écrit rien ;
// le prochain setProjectContent() persistera la nouvelle forme naturellement.
function migrateLegacyVision(content: ProjectContent & { vision?: Record<string, string> }): ProjectContent {
  const legacyVision = content.vision;
  const hasSection = (content.customSections ?? []).some(s => s.id === VISION_SECTION_ID);
  if (!legacyVision || hasSection) return content;
  return {
    ...content,
    customSections: [getDefaultVisionSection(), ...(content.customSections ?? [])],
    customSectionData: { ...content.customSectionData, [VISION_SECTION_ID]: legacyVision },
  };
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
  if (isDemoSession()) return migrateLegacyVision(_demoContent[projectId] ?? {});
  ensureFetchStarted(projectId);
  return migrateLegacyVision(_supabaseContent[projectId] ?? {});
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
