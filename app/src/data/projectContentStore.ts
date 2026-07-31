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

export type OverviewSectionKind = 'fields' | 'note' | 'vision' | 'deliverables' | 'checklist' | 'gallery' | 'links' | 'invoices' | 'files' | 'notes';

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
    kind: 'vision',
    title: i18n.t('overview.visionTitle'),
    icon: 'compass',
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

export const INVOICES_SECTION_ID = 'invoices';
export const FILES_SECTION_ID = 'files';
export const NOTES_SECTION_ID = 'notes';

export function getDefaultInvoicesSection(): CustomOverviewSection {
  return { id: INVOICES_SECTION_ID, kind: 'invoices', title: i18n.t('overview.invoicesTitle'), icon: 'receipt' };
}

export function getDefaultFilesSection(): CustomOverviewSection {
  return { id: FILES_SECTION_ID, kind: 'files', title: i18n.t('overview.filesTitle'), icon: 'folder' };
}

export function getDefaultNotesSection(): CustomOverviewSection {
  return { id: NOTES_SECTION_ID, kind: 'notes', title: i18n.t('overview.internalNotesTitle'), icon: 'sticky-note' };
}

// Table centrale des 5 modules système — un seul endroit à modifier pour ajouter
// un futur module système. L'ORDRE de ce tableau EST l'ordre par défaut utilisé
// à la migration (TravailOverview.tsx, applyLoadedContent) pour les modules
// qu'un projet n'a jamais eus. Identifié par id canonique, pas par kind seul :
// Vision garde une compatibilité de rendu avec le kind générique 'fields' (voir
// Step 1), donc son kind seul ne suffit pas à la distinguer d'un module
// "Champs personnalisés" ordinaire — l'id, lui, est toujours unique et stable.
export const SYSTEM_MODULES: { id: string; kind: OverviewSectionKind; factory: () => CustomOverviewSection }[] = [
  { id: VISION_SECTION_ID, kind: 'vision', factory: getDefaultVisionSection },
  { id: DELIVERABLES_SECTION_ID, kind: 'deliverables', factory: getDefaultDeliverablesSection },
  { id: INVOICES_SECTION_ID, kind: 'invoices', factory: getDefaultInvoicesSection },
  { id: FILES_SECTION_ID, kind: 'files', factory: getDefaultFilesSection },
  { id: NOTES_SECTION_ID, kind: 'notes', factory: getDefaultNotesSection },
];

export const SYSTEM_SECTION_IDS: string[] = SYSTEM_MODULES.map(m => m.id);

// kind -> id canonique, pour les 5 kinds système uniquement. Utilisé par
// OverviewSectionForm pour assigner l'id canonique à la création (au lieu d'un
// id générique sec-<timestamp>) et pour savoir quels choix exclure du sélecteur
// de kind quand le module existe déjà dans le projet (par id, pas par kind —
// même raison qu'au Step 3 ci-dessus).
export const SYSTEM_KIND_ID: Partial<Record<OverviewSectionKind, string>> =
  Object.fromEntries(SYSTEM_MODULES.map(m => [m.kind, m.id]));

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
  /** @deprecated remplacé par removedSystemModules — conservé uniquement pour la
   * migration de lecture d'anciens projets (voir TravailOverview.tsx,
   * applyLoadedContent). Plus jamais écrit après ce chantier. */
  deliverablesRemoved?: boolean;
  /** Ids canoniques (VISION_SECTION_ID, DELIVERABLES_SECTION_ID, etc.) des
   * modules système que l'utilisateur a explicitement supprimés de l'Aperçu —
   * la migration à la lecture ne les réinsère pas, contrairement à un projet
   * qui ne les a simplement jamais eus. */
  removedSystemModules?: string[];
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
