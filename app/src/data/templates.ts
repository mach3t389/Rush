import type { Priority, ResourceType } from '../types';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { loadPersisted, savePersisted } from './persist';

// ── Hidden built-in templates ────────────────────────────────────────────────────
// Les modèles "Intégrés" ne sont pas des lignes de données réelles (juste du contenu
// d'exemple codé en dur) : on ne peut pas les retirer du tableau, mais on peut les
// masquer localement — même effet visuel qu'une suppression, sans toucher au code.
// Préférence d'affichage locale au navigateur (comme sf_pinned_projects), pas synchronisée.

const HIDDEN_TEMPLATES_KEY = 'sf_hidden_templates';
let _hiddenTemplateIds: string[] = loadPersisted(HIDDEN_TEMPLATES_KEY, []);
const _hiddenListeners = new Set<() => void>();

export function isTemplateHidden(id: string): boolean {
  return _hiddenTemplateIds.includes(id);
}

export function hideTemplate(id: string): void {
  if (_hiddenTemplateIds.includes(id)) return;
  _hiddenTemplateIds = [..._hiddenTemplateIds, id];
  savePersisted(HIDDEN_TEMPLATES_KEY, _hiddenTemplateIds);
  _hiddenListeners.forEach(fn => fn());
}

export function unhideTemplate(id: string): void {
  _hiddenTemplateIds = _hiddenTemplateIds.filter(x => x !== id);
  savePersisted(HIDDEN_TEMPLATES_KEY, _hiddenTemplateIds);
  _hiddenListeners.forEach(fn => fn());
}

export function getHiddenTemplateIds(): string[] {
  return [..._hiddenTemplateIds];
}

export function subscribeHiddenTemplates(fn: () => void): () => void {
  _hiddenListeners.add(fn);
  return () => _hiddenListeners.delete(fn);
}

// ── Project template types ─────────────────────────────────────────────────────

export interface TemplateTask {
  title: string;
  priority: Priority;
  description?: string;
  status?: string;
  statusLabel?: string;
  dueDate?: string;
  assignee?: { id: string; name: string; initials: string; avatarColor: string };
  subtasks?: TemplateTask[];
}

export interface TemplateSection {
  label: string;
  tasks: TemplateTask[];
}

export interface TemplateResource {
  type: ResourceType;
  title: string;
  templateId?: string; // links to a ResourceTemplate
}

export interface ProjectTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  tags: string[];
  sections: TemplateSection[];
  resources: TemplateResource[];
  builtIn?: boolean;
  createdAt: string;
  defaultFolderStructureId?: string;
}

// ── Form template types ────────────────────────────────────────────────────────

export type FormFieldType = 'text' | 'textarea' | 'choice' | 'multi' | 'rating' | 'date' | 'number' | 'file';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  placeholder?: string;
  required?: boolean;
  options?: string[];
  ratingMax?: number;
  aiKey?: string; // maps to project data for AI pre-fill
  section?: string; // optional grouping header
}

export interface FormTemplate {
  id: string;
  name: string;
  description: string;
  color: string;
  icon: string;
  tags: string[];
  fields: FormField[];
  builtIn?: boolean;
  createdAt: string;
}

export type FormFieldValue = string | string[] | number;

export interface FormResponse {
  fieldId: string;
  value: FormFieldValue;
  aiSuggested?: boolean;
}

export interface FormInstance {
  id: string;
  templateId: string;
  templateName: string;
  templateColor: string;
  linkedProjectId?: string;
  linkedProjectName?: string;
  linkedClientId?: string;
  linkedClientName?: string;
  responses: FormResponse[];
  status: 'draft' | 'completed';
  createdAt: string;
  updatedAt: string;
}

// ── Built-in project templates ─────────────────────────────────────────────────

export const BUILT_IN_TEMPLATES: ProjectTemplate[] = [
  {
    id: 'tpl-video-sociale',
    name: 'Campagne vidéo sociale',
    description: 'Pour des projets de contenu court destinés aux réseaux sociaux. Inclut brief, tournage, montage et révisions client.',
    color: '#3b4f8f',
    icon: 'video',
    tags: ['Vidéo', 'Social media', 'Court format'],
    builtIn: true,
    createdAt: '2025-01-01',
    sections: [
      { label: 'Préproduction', tasks: [
        { title: 'Validation du brief client', priority: 'high' },
        { title: 'Écriture du script', priority: 'high' },
        { title: 'Repérage des lieux', priority: 'normal' },
        { title: 'Casting & confirmations', priority: 'normal' },
        { title: 'Création du moodboard', priority: 'low' },
        { title: 'Planification du tournage', priority: 'high' },
      ]},
      { label: 'Production', tasks: [
        { title: 'Journée de tournage J1', priority: 'high' },
        { title: 'Backup et vérification des rushs', priority: 'high' },
        { title: 'Photos de plateau', priority: 'low' },
      ]},
      { label: 'Postproduction', tasks: [
        { title: 'Montage rough cut', priority: 'high' },
        { title: 'Révision interne', priority: 'normal' },
        { title: 'Envoi V1 au client', priority: 'high' },
        { title: 'Intégration des retours', priority: 'normal' },
        { title: 'Étalonnage couleur', priority: 'normal' },
        { title: 'Mixage audio', priority: 'normal' },
        { title: 'Export formats finaux', priority: 'high' },
      ]},
      { label: 'Livraison', tasks: [
        { title: 'Envoi des fichiers au client', priority: 'high' },
        { title: 'Facturation solde', priority: 'high' },
        { title: 'Archivage du projet', priority: 'low' },
      ]},
    ],
    resources: [
      { type: 'screenplay', title: 'Script' },
      { type: 'moodboard',  title: 'Moodboard' },
      { type: 'checklist',  title: 'Checklist tournage' },
      { type: 'document',   title: 'Contrat de production' },
    ],
    defaultFolderStructureId: 'res-file-structure',
  },
  {
    id: 'tpl-film-institutionnel',
    name: 'Film institutionnel',
    description: 'Film corporate long format. Workflow complet de 4 à 8 semaines incluant interviews, B-roll et animation.',
    color: '#1a6b4a',
    icon: 'film',
    tags: ['Corporate', 'Long format', 'Interview'],
    builtIn: true,
    createdAt: '2025-01-01',
    sections: [
      { label: 'Préproduction', tasks: [
        { title: 'Réunion de lancement', priority: 'high' },
        { title: 'Rédaction du brief créatif', priority: 'high' },
        { title: 'Script et conducteur', priority: 'high' },
        { title: 'Recrutement des intervenants', priority: 'normal' },
        { title: 'Repérages', priority: 'normal' },
        { title: 'Planification multi-journées', priority: 'high' },
        { title: 'Validation budget', priority: 'high' },
      ]},
      { label: 'Production', tasks: [
        { title: 'Tournage interviews J1', priority: 'high' },
        { title: 'Tournage B-roll J2', priority: 'high' },
        { title: 'Backup rushs quotidien', priority: 'high' },
        { title: 'Sélection des prises', priority: 'normal' },
      ]},
      { label: 'Postproduction', tasks: [
        { title: 'Dérushage complet', priority: 'normal' },
        { title: 'Montage offline', priority: 'high' },
        { title: 'V1 → Validation client', priority: 'high' },
        { title: 'V2 avec retours', priority: 'normal' },
        { title: 'Animation graphique', priority: 'normal' },
        { title: 'Mixage son professionnel', priority: 'normal' },
        { title: 'Étalonnage', priority: 'normal' },
        { title: 'Export diffusion + web', priority: 'high' },
      ]},
      { label: 'Livraison', tasks: [
        { title: 'Remise des masters', priority: 'high' },
        { title: 'Formation utilisation fichiers', priority: 'low' },
        { title: 'Facturation et clôture', priority: 'high' },
      ]},
    ],
    resources: [
      { type: 'screenplay',   title: 'Conducteur & script' },
      { type: 'moodboard',    title: 'Direction artistique' },
      { type: 'document',     title: 'Contrat' },
      { type: 'checklist',    title: 'Checklist tournage' },
      { type: 'video_review', title: 'V1 client' },
    ],
    defaultFolderStructureId: 'res-file-structure',
  },
  {
    id: 'tpl-shoot-photo',
    name: 'Séance photo',
    description: 'Projet de photographie produit ou portrait. Inclut repérage, shooting et retouche.',
    color: '#7d4e57',
    icon: 'camera',
    tags: ['Photo', 'Portrait', 'Produit'],
    builtIn: true,
    createdAt: '2025-01-01',
    sections: [
      { label: 'Préparation', tasks: [
        { title: 'Brief et moodboard', priority: 'high' },
        { title: 'Sélection des modèles / produits', priority: 'normal' },
        { title: 'Repérage studio ou extérieur', priority: 'normal' },
        { title: 'Liste du matériel', priority: 'normal' },
        { title: 'Confirmation planning', priority: 'high' },
      ]},
      { label: 'Shooting', tasks: [
        { title: 'Journée de shooting', priority: 'high' },
        { title: 'Sélection des images (editing)', priority: 'high' },
        { title: 'Export sélection brute pour client', priority: 'normal' },
      ]},
      { label: 'Retouche & livraison', tasks: [
        { title: 'Retouche photos validées', priority: 'high' },
        { title: 'Export finaux (web + print)', priority: 'high' },
        { title: 'Remise au client', priority: 'high' },
        { title: 'Facturation', priority: 'high' },
      ]},
    ],
    resources: [
      { type: 'moodboard',    title: 'Moodboard' },
      { type: 'inspirations', title: 'Références visuelles' },
      { type: 'checklist',    title: 'Checklist matériel' },
    ],
  },
  {
    id: 'tpl-motion-design',
    name: 'Motion design',
    description: 'Production motion design ou animation 2D/3D. De la conception visuelle au rendu final.',
    color: '#5b3ea8',
    icon: 'sparkles',
    tags: ['Motion', 'Animation', '2D/3D'],
    builtIn: true,
    createdAt: '2025-01-01',
    sections: [
      { label: 'Conception', tasks: [
        { title: 'Brief et objectifs', priority: 'high' },
        { title: 'Styleframe V1', priority: 'high' },
        { title: 'Validation direction artistique', priority: 'high' },
        { title: 'Storyboard animatique', priority: 'normal' },
      ]},
      { label: 'Production', tasks: [
        { title: 'Design des assets graphiques', priority: 'high' },
        { title: 'Animation séquence 1', priority: 'high' },
        { title: 'Animation séquence 2', priority: 'normal' },
        { title: 'Intégration son / musique', priority: 'normal' },
        { title: 'Revue interne', priority: 'normal' },
      ]},
      { label: 'Révisions', tasks: [
        { title: 'Envoi V1 client', priority: 'high' },
        { title: 'Retours et corrections', priority: 'normal' },
        { title: 'Envoi V2', priority: 'normal' },
      ]},
      { label: 'Rendu & livraison', tasks: [
        { title: 'Rendu final (MP4 + formats)', priority: 'high' },
        { title: 'Livraison fichiers sources', priority: 'normal' },
        { title: 'Facturation', priority: 'high' },
      ]},
    ],
    resources: [
      { type: 'moodboard',    title: 'Direction artistique' },
      { type: 'screenplay',   title: 'Storyboard' },
      { type: 'video_review', title: 'Preview V1' },
      { type: 'document',     title: 'Cahier des charges' },
    ],
  },
  {
    id: 'tpl-vierge',
    name: 'Projet vierge',
    description: 'Commencer avec une page blanche. Aucune section ou tâche préconfigurée.',
    color: '#444',
    icon: 'file',
    tags: ['Libre'],
    builtIn: true,
    createdAt: '2025-01-01',
    sections: [],
    resources: [],
  },
];

// ── Built-in form templates ────────────────────────────────────────────────────

export const BUILT_IN_FORM_TEMPLATES: FormTemplate[] = [
  {
    id: 'form-brief-creatif',
    name: 'Brief créatif',
    description: 'Recueillez toutes les informations nécessaires pour démarrer un projet vidéo ou créatif. Questions sur les objectifs, l\'audience et le style attendu.',
    color: '#3b4f8f',
    icon: 'file-text',
    tags: ['Démarrage', 'Vidéo', 'Créatif'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'bc-01', type: 'text',     label: 'Nom de l\'entreprise / marque', placeholder: 'ex. Nova Films', required: true, aiKey: 'clientName' },
      { id: 'bc-02', type: 'text',     label: 'Nom du projet', placeholder: 'ex. Campagne été 2026', required: true, aiKey: 'projectName' },
      { id: 'bc-03', type: 'choice',   label: 'Type de contenu', required: true, options: ['Vidéo corporate', 'Publicité / spot', 'Documentaire', 'Clip musical', 'Contenu réseaux sociaux', 'Formation / tutoriel', 'Autre'] },
      { id: 'bc-04', type: 'textarea', label: 'Décrivez votre projet en quelques phrases', placeholder: 'Contexte, objectif principal, message clé…', required: true, aiKey: 'projectDescription' },
      { id: 'bc-05', type: 'textarea', label: 'Qui est votre audience cible ?', placeholder: 'Âge, intérêts, situation géographique…', required: true },
      { id: 'bc-06', type: 'multi',    label: 'Ton & style souhaités', options: ['Professionnel / corporatif', 'Dynamique / énergique', 'Chaleureux / humain', 'Inspirant / émotionnel', 'Humoristique / léger', 'Minimaliste / élégant', 'Authentique / documentaire'] },
      { id: 'bc-07', type: 'textarea', label: 'Références visuelles ou vidéos inspirantes', placeholder: 'Liens, noms de marques, descriptions…' },
      { id: 'bc-08', type: 'multi',    label: 'Livrables attendus', options: ['Version longue (2-5 min)', 'Version courte (< 60 sec)', 'Format carré (Instagram)', 'Format vertical (Reels/TikTok)', 'Format 16:9 (YouTube/web)', 'Chapitres séparés', 'Extraits / teaser'] },
      { id: 'bc-09', type: 'text',     label: 'Date de livraison souhaitée', placeholder: 'ex. 15 août 2026', aiKey: 'deliveryDate' },
      { id: 'bc-10', type: 'choice',   label: 'Budget approximatif', options: ['Moins de 1 000 $', '1 000 – 3 000 $', '3 000 – 7 500 $', '7 500 – 15 000 $', '15 000 – 30 000 $', 'Plus de 30 000 $', 'À discuter'] },
      { id: 'bc-11', type: 'textarea', label: 'Y a-t-il des contraintes ou éléments à éviter ?', placeholder: 'Sujets sensibles, concurrents, contraintes légales…' },
      { id: 'bc-12', type: 'textarea', label: 'Informations supplémentaires', placeholder: 'Tout ce qui n\'a pas été couvert ci-dessus…' },
    ],
  },
  {
    id: 'form-selection-musicale',
    name: 'Sélection musicale',
    description: 'Identifiez les préférences musicales du client pour la trame sonore d\'une vidéo. Adapté de votre formulaire existant.',
    color: '#5b3ea8',
    icon: 'music',
    tags: ['Musique', 'Postproduction', 'Créatif'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'sm-01', type: 'textarea', label: 'Avez-vous des exemples de vidéos ou morceaux qui reflètent le style musical recherché ?', placeholder: 'Liens YouTube, Spotify, noms d\'artistes…' },
      { id: 'sm-02', type: 'choice',   label: 'Genre musical préféré', required: true, options: ['Acoustique', 'Ambiance / atmosphérique', 'Blues', 'Cinématique / orchestral', 'Classique', 'Électronique', 'Folk', 'Jazz', 'Lofi & Chill Beats', 'Pop', 'Rock', 'Enfant / ludique', 'Autre'] },
      { id: 'sm-03', type: 'textarea', label: 'Y a-t-il des instruments spécifiques que vous aimeriez entendre ?', placeholder: 'Piano, guitare acoustique, cordes, synthé…' },
      { id: 'sm-04', type: 'choice',   label: 'Cadence idéale pour la musique', required: true, options: ['Lente / apaisante', 'Modérée / posée', 'Rapide / énergique', 'Variable selon les scènes', 'Pas de préférence'] },
      { id: 'sm-05', type: 'multi',    label: 'Éléments à éviter', options: ['Voix / paroles', 'Batteries / percussions fortes', 'Musique trop identifiable', 'Droits d\'auteur stricts', 'Genre électronique', 'Musique trop douce'] },
      { id: 'sm-06', type: 'rating',   label: 'Quelle importance accordez-vous à la musique dans ce projet ?', ratingMax: 5 },
      { id: 'sm-07', type: 'textarea', label: 'Autres directives ou préférences musicales', placeholder: 'Tout détail supplémentaire utile pour le choix musical…' },
    ],
  },
  {
    id: 'form-satisfaction-client',
    name: 'Satisfaction client',
    description: 'Évaluez la satisfaction de vos clients après la livraison d\'un projet. Adapté de votre formulaire de rétroaction existant.',
    color: '#1a6b4a',
    icon: 'star',
    tags: ['Rétroaction', 'Client', 'Post-projet'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'sc-01', type: 'rating',   label: 'Qualité générale de la vidéo livrée', required: true, ratingMax: 5 },
      { id: 'sc-02', type: 'rating',   label: 'Communication et suivi de l\'équipe', required: true, ratingMax: 5 },
      { id: 'sc-03', type: 'rating',   label: 'Respect des délais de livraison', required: true, ratingMax: 5 },
      { id: 'sc-04', type: 'rating',   label: 'Rapport qualité-prix', required: true, ratingMax: 5 },
      { id: 'sc-05', type: 'rating',   label: 'Probabilité de recommander notre studio', required: true, ratingMax: 5 },
      { id: 'sc-06', type: 'textarea', label: 'Quels aspects pourrions-nous améliorer ?', placeholder: 'Vos suggestions sont précieuses pour nous…' },
      { id: 'sc-07', type: 'textarea', label: 'Comment s\'est passée votre expérience lors du processus créatif ?', placeholder: 'Déroulement des réunions, retours, collaboration…' },
      { id: 'sc-08', type: 'textarea', label: 'Qu\'avez-vous particulièrement apprécié ?', placeholder: 'Ce qui vous a le plus marqué positivement…' },
      { id: 'sc-09', type: 'choice',   label: 'Envisagez-vous de faire appel à nos services pour un prochain projet ?', options: ['Oui, certainement', 'Probablement', 'Peut-être', 'Non pour l\'instant'] },
    ],
  },
  {
    id: 'form-demande-soumission',
    name: 'Demande de soumission',
    description: 'Formulaire de prise de contact pour les nouveaux prospects. Collecte les informations essentielles pour préparer une offre.',
    color: '#a85f3e',
    icon: 'send',
    tags: ['Vente', 'Prospect', 'Devis'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'ds-01', type: 'text',     label: 'Nom complet', placeholder: 'Prénom et nom', required: true },
      { id: 'ds-02', type: 'text',     label: 'Entreprise / organisation', placeholder: 'Nom de votre entreprise', required: true },
      { id: 'ds-03', type: 'text',     label: 'Adresse courriel', placeholder: 'votre@email.com', required: true },
      { id: 'ds-04', type: 'text',     label: 'Numéro de téléphone', placeholder: '+1 (514) 000-0000' },
      { id: 'ds-05', type: 'choice',   label: 'Type de projet', required: true, options: ['Vidéo corporate / institutionnelle', 'Publicité / spot télé ou web', 'Documentaire', 'Clip musical', 'Contenu réseaux sociaux', 'Formation / tutoriel vidéo', 'Événementiel', 'Photo', 'Motion design / animation', 'Autre'] },
      { id: 'ds-06', type: 'textarea', label: 'Décrivez votre projet', placeholder: 'Contexte, objectif, message à transmettre…', required: true },
      { id: 'ds-07', type: 'choice',   label: 'Durée approximative du contenu final', options: ['Moins de 30 secondes', '30 – 60 secondes', '1 – 3 minutes', '3 – 10 minutes', 'Plus de 10 minutes', 'Plusieurs formats', 'À déterminer'] },
      { id: 'ds-08', type: 'choice',   label: 'Budget envisagé', options: ['Moins de 1 000 $', '1 000 – 3 000 $', '3 000 – 7 500 $', '7 500 – 15 000 $', '15 000 – 30 000 $', 'Plus de 30 000 $', 'Je ne sais pas encore'] },
      { id: 'ds-09', type: 'text',     label: 'Date de livraison souhaitée', placeholder: 'ex. Fin septembre 2026' },
      { id: 'ds-10', type: 'choice',   label: 'Comment avez-vous entendu parler de nous ?', options: ['Référence / bouche-à-oreille', 'Réseaux sociaux', 'Google / recherche web', 'Portfolio en ligne', 'Événement / conférence', 'Autre'] },
      { id: 'ds-11', type: 'textarea', label: 'Avez-vous des exemples ou références visuelles ?', placeholder: 'Liens, noms de marques, descriptions…' },
      { id: 'ds-12', type: 'textarea', label: 'Questions ou informations supplémentaires', placeholder: 'Tout ce que vous souhaitez nous partager…' },
    ],
  },
  {
    id: 'form-onboarding-client',
    name: 'Onboarding client',
    description: 'Questionnaire de démarrage pour mieux connaître un nouveau client — identité de marque, cibles, concurrents et attentes.',
    color: '#2a7a8a',
    icon: 'users',
    tags: ['Démarrage', 'Client', 'Stratégie'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'oc-01', type: 'text',     label: 'Nom de l\'entreprise', required: true, aiKey: 'clientName' },
      { id: 'oc-02', type: 'text',     label: 'Secteur d\'activité', placeholder: 'ex. Technologie, Santé, Mode…', aiKey: 'sector' },
      { id: 'oc-03', type: 'textarea', label: 'Décrivez votre entreprise en quelques phrases', placeholder: 'Histoire, mission, valeurs fondamentales…', required: true },
      { id: 'oc-04', type: 'multi',    label: 'Avez-vous une charte graphique ou identité visuelle existante ?', options: ['Logo professionnel', 'Palette de couleurs définie', 'Guide de style / brand book', 'Typographies officielles', 'Non, nous partons de zéro'] },
      { id: 'oc-05', type: 'textarea', label: 'Qui sont vos principaux concurrents ?', placeholder: 'Noms, sites web, ce qui les distingue…' },
      { id: 'oc-06', type: 'textarea', label: 'Quelle est votre clientèle cible ?', placeholder: 'Âge, profession, localisation, besoins…', required: true },
      { id: 'oc-07', type: 'multi',    label: 'Sur quelles plateformes êtes-vous actif ?', options: ['Site web', 'Facebook', 'Instagram', 'LinkedIn', 'TikTok', 'YouTube', 'Twitter / X', 'Aucune pour l\'instant'] },
      { id: 'oc-08', type: 'textarea', label: 'Quelles sont vos attentes pour notre collaboration ?', placeholder: 'Résultats souhaités, fréquence de production, ton…', required: true },
      { id: 'oc-09', type: 'multi',    label: 'Types de contenus qui vous intéressent', options: ['Vidéos courtes réseaux sociaux', 'Films institutionnels', 'Témoignages clients', 'Tutoriels / formations', 'Événements', 'Publicités', 'Motion design', 'Photos professionnelles'] },
      { id: 'oc-10', type: 'textarea', label: 'Y a-t-il des sujets, images ou éléments à absolument éviter ?', placeholder: 'Contraintes légales, sensibilités culturelles, concurrents…' },
    ],
  },
  {
    id: 'form-fiche-tournage',
    name: 'Fiche technique tournage',
    description: 'Préparez et documentez tous les détails logistiques et techniques d\'une journée de tournage.',
    color: '#7d4e57',
    icon: 'clapperboard',
    tags: ['Production', 'Tournage', 'Logistique'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'ft-01', type: 'text',     label: 'Nom du projet', required: true, aiKey: 'projectName' },
      { id: 'ft-02', type: 'date',     label: 'Date du tournage', required: true },
      { id: 'ft-03', type: 'text',     label: 'Lieu(x) de tournage', placeholder: 'Adresse complète + point de repère', required: true },
      { id: 'ft-04', type: 'text',     label: 'Heure de convocation équipe', placeholder: 'ex. 7h00' },
      { id: 'ft-05', type: 'text',     label: 'Heure de début du tournage', placeholder: 'ex. 8h30' },
      { id: 'ft-06', type: 'text',     label: 'Heure de fin estimée', placeholder: 'ex. 17h00' },
      { id: 'ft-07', type: 'multi',    label: 'Équipe requise', options: ['Réalisateur', 'Directeur photo', 'Cadreur', 'Preneur de son', 'Chef électricien', 'Assistant caméra', 'Maquilleur/coiffeur', 'Régisseur', 'Photographe de plateau'] },
      { id: 'ft-08', type: 'multi',    label: 'Équipement caméra', options: ['Caméra principale', '2e caméra (multicam)', 'Objectifs primes', 'Zoom / téléobjectif', 'Drone', 'Steadicam / gimbal', 'Slider', 'Trépied lourd', 'Monopod'] },
      { id: 'ft-09', type: 'multi',    label: 'Équipement son', options: ['Micro HF', 'Perche + micro canon', 'Enregistreur autonome', 'Mixette', 'Oreillettes monitoring', 'Piles / batteries de rechange'] },
      { id: 'ft-10', type: 'multi',    label: 'Éclairage', options: ['LED panneaux', 'Fresnel / HMI', 'Réflecteurs', 'Diffuseurs', 'Drapeaux noirs', 'Gel de couleur'] },
      { id: 'ft-11', type: 'choice',   label: 'Autorisation de tournage obtenue ?', options: ['Oui, confirmée', 'En cours d\'obtention', 'Non requise (lieu privé)', 'Non applicable'] },
      { id: 'ft-12', type: 'textarea', label: 'Notes spéciales / contraintes de production', placeholder: 'Stationnement, accès, règles du lieu, sensibilités…' },
      { id: 'ft-13', type: 'textarea', label: 'Liste des scènes / séquences à tourner', placeholder: 'Décrivez brièvement chaque scène prévue…', required: true },
    ],
  },
  {
    id: 'form-validation-livrable',
    name: 'Validation livrable client',
    description: 'Recueillez les retours structurés du client sur un livrable (vidéo, photo, animation) pour faciliter les révisions.',
    color: '#2d5a7d',
    icon: 'check-circle',
    tags: ['Révision', 'Client', 'Livrable'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'vl-01', type: 'text',     label: 'Nom du livrable à valider', placeholder: 'ex. Vidéo corporate V2', required: true },
      { id: 'vl-02', type: 'choice',   label: 'Décision globale', required: true, options: ['✅ Approuvé — aucune modification', '⚠️ Approuvé avec modifications mineures', '🔄 Révisions requises avant approbation', '❌ À retravailler en profondeur'] },
      { id: 'vl-03', type: 'rating',   label: 'Satisfaction générale par rapport aux attentes', required: true, ratingMax: 5 },
      { id: 'vl-04', type: 'textarea', label: 'Retours sur le montage / structure narrative', placeholder: 'Rythme, ordre des séquences, transitions, durée…' },
      { id: 'vl-05', type: 'textarea', label: 'Retours sur l\'image (couleurs, cadrage, esthétique)', placeholder: 'Étalonnage, esthétique visuelle, qualité d\'image…' },
      { id: 'vl-06', type: 'textarea', label: 'Retours sur le son (musique, voix, effets)', placeholder: 'Volume, qualité audio, synchronisation, musique…' },
      { id: 'vl-07', type: 'textarea', label: 'Retours sur les textes et graphiques à l\'écran', placeholder: 'Titres, sous-titres, animations de texte, logo…' },
      { id: 'vl-08', type: 'textarea', label: 'Modifications demandées (liste détaillée)', placeholder: 'Numérotez chaque demande avec timecode si possible…' },
      { id: 'vl-09', type: 'text',     label: 'Date limite souhaitée pour la prochaine version', placeholder: 'ex. 20 juin 2026' },
      { id: 'vl-10', type: 'textarea', label: 'Commentaires supplémentaires', placeholder: 'Tout autre retour ou précision…' },
    ],
  },
  {
    id: 'form-brief-branding',
    name: 'Brief branding & identité',
    description: 'Questionnaire pour définir ou retravailler l\'identité visuelle d\'une marque — logo, couleurs, typographie et positionnement.',
    color: '#4a3428',
    icon: 'palette',
    tags: ['Branding', 'Design', 'Identité'],
    builtIn: true,
    createdAt: '2025-01-01',
    fields: [
      { id: 'bb-01', type: 'text',     label: 'Nom de la marque', required: true, aiKey: 'clientName' },
      { id: 'bb-02', type: 'textarea', label: 'Histoire et contexte de la marque', placeholder: 'Fondation, évolution, mission actuelle…', required: true },
      { id: 'bb-03', type: 'multi',    label: 'Valeurs de la marque (choisissez jusqu\'à 5)', options: ['Innovation', 'Authenticité', 'Excellence', 'Durabilité', 'Accessibilité', 'Luxe / prestige', 'Humour / légèreté', 'Confiance / sécurité', 'Créativité', 'Communauté'] },
      { id: 'bb-04', type: 'textarea', label: 'Décrivez votre client idéal', placeholder: 'Âge, style de vie, valeurs, revenus…', required: true },
      { id: 'bb-05', type: 'textarea', label: 'Qui sont vos principaux concurrents directs ?', placeholder: 'Noms, liens, ce qui vous différencie d\'eux…' },
      { id: 'bb-06', type: 'multi',    label: 'Styles visuels qui vous inspirent', options: ['Minimaliste / épuré', 'Luxueux / raffiné', 'Coloré / vibrant', 'Rétro / vintage', 'Tech / futuriste', 'Nature / organique', 'Géométrique / structuré', 'Illustratif / dessiné'] },
      { id: 'bb-07', type: 'multi',    label: 'Palettes de couleurs qui vous attirent', options: ['Tons neutres (blanc, beige, gris)', 'Tons sombres (noir, marine, bordeaux)', 'Tons vifs (rouge, jaune, orange)', 'Tons froids (bleu, vert, violet)', 'Pastels', 'Monochrome', 'Contrasté / bicolore'] },
      { id: 'bb-08', type: 'choice',   label: 'Style de typographie préféré', options: ['Serif classique (élégance, tradition)', 'Sans-serif moderne (clarté, tech)', 'Script / cursive (chaleur, personnalité)', 'Slab serif (force, robustesse)', 'Mixte (combinaison de styles)'] },
      { id: 'bb-09', type: 'textarea', label: 'Marques dont vous aimez l\'identité visuelle (hors secteur)', placeholder: 'Avec ce qui vous plaît dans leur esthétique…' },
      { id: 'bb-10', type: 'textarea', label: 'Éléments à absolument éviter dans votre identité', placeholder: 'Couleurs, styles, associations d\'idées indésirables…' },
      { id: 'bb-11', type: 'multi',    label: 'Supports où l\'identité sera utilisée', options: ['Site web', 'Réseaux sociaux', 'Imprimés / papeterie', 'Signalétique / affichage', 'Emballage / produit', 'Vêtements / merch', 'Vidéo / motion'] },
    ],
  },
];

// ── Project template storage ───────────────────────────────────────────────────

const STORAGE_KEY = 'sf_custom_templates';

let _demoProjectTemplates: ProjectTemplate[] = loadDemoProjectTemplates();
function loadDemoProjectTemplates(): ProjectTemplate[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistDemoProjectTemplates(): void { localStorage.setItem(STORAGE_KEY, JSON.stringify(_demoProjectTemplates)); }

let _supabaseProjectTemplates: ProjectTemplate[] = [];
let _projectTemplatesFetchStarted = false;

interface CustomTemplateRow { id: string; data: ProjectTemplate; }

async function fetchSupabaseProjectTemplates(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase.from('custom_project_templates').select('id, data').eq('studio_id', studioId);
    if (error) { console.error('fetchSupabaseProjectTemplates failed', error); return; }
    _supabaseProjectTemplates = (data as CustomTemplateRow[]).map(row => row.data);
  } catch (err) {
    console.error('fetchSupabaseProjectTemplates failed', err);
  }
}

function ensureProjectTemplatesFetchStarted(): void {
  if (_projectTemplatesFetchStarted) return;
  _projectTemplatesFetchStarted = true;
  void fetchSupabaseProjectTemplates();
}

export function resetCustomProjectTemplatesCache(): void {
  _supabaseProjectTemplates = [];
  _projectTemplatesFetchStarted = false;
}

onLogout(resetCustomProjectTemplatesCache);

async function replaceSupabaseProjectTemplates(previousIds: string[], templates: ProjectTemplate[]): Promise<void> {
  const studioId = await getStudioId();
  const nextIds = templates.map(t => t.id);
  const removedIds = previousIds.filter(id => !nextIds.includes(id));

  if (removedIds.length > 0) {
    const { error: delError } = await supabase.from('custom_project_templates').delete().in('id', removedIds);
    if (delError) { console.error('replaceSupabaseProjectTemplates delete failed', delError); return; }
  }

  if (templates.length > 0) {
    const { error: upsertError } = await supabase.from('custom_project_templates').upsert(
      templates.map(t => ({ id: t.id, studio_id: studioId, data: t }))
    );
    if (upsertError) { console.error('replaceSupabaseProjectTemplates upsert failed', upsertError); return; }
  }

  await fetchSupabaseProjectTemplates();
}

export function loadCustomTemplates(): ProjectTemplate[] {
  if (isDemoSession()) return _demoProjectTemplates;
  ensureProjectTemplatesFetchStarted();
  return _supabaseProjectTemplates;
}

export function saveCustomTemplates(templates: ProjectTemplate[]): void {
  if (isDemoSession()) {
    _demoProjectTemplates = templates;
    persistDemoProjectTemplates();
    return;
  }
  const previousIds = _supabaseProjectTemplates.map(t => t.id);
  _supabaseProjectTemplates = templates;
  void replaceSupabaseProjectTemplates(previousIds, templates);
}

export function getVisibleBuiltInTemplates(): ProjectTemplate[] {
  return BUILT_IN_TEMPLATES.filter(t => !isTemplateHidden(t.id));
}

export function loadAllTemplates(): ProjectTemplate[] {
  return [...getVisibleBuiltInTemplates(), ...loadCustomTemplates()];
}

// ── Form template storage ──────────────────────────────────────────────────────

const FORM_TPL_KEY = 'sf_custom_form_templates';

let _demoFormTemplates: FormTemplate[] = loadDemoFormTemplates();
function loadDemoFormTemplates(): FormTemplate[] {
  try {
    const raw = localStorage.getItem(FORM_TPL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistDemoFormTemplates(): void { localStorage.setItem(FORM_TPL_KEY, JSON.stringify(_demoFormTemplates)); }

let _supabaseFormTemplates: FormTemplate[] = [];
let _formTemplatesFetchStarted = false;

interface CustomFormTemplateRow { id: string; data: FormTemplate; }

async function fetchSupabaseFormTemplates(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase.from('custom_form_templates').select('id, data').eq('studio_id', studioId);
    if (error) { console.error('fetchSupabaseFormTemplates failed', error); return; }
    _supabaseFormTemplates = (data as CustomFormTemplateRow[]).map(row => row.data);
  } catch (err) {
    console.error('fetchSupabaseFormTemplates failed', err);
  }
}

function ensureFormTemplatesFetchStarted(): void {
  if (_formTemplatesFetchStarted) return;
  _formTemplatesFetchStarted = true;
  void fetchSupabaseFormTemplates();
}

export function resetCustomFormTemplatesCache(): void {
  _supabaseFormTemplates = [];
  _formTemplatesFetchStarted = false;
}

onLogout(resetCustomFormTemplatesCache);

async function replaceSupabaseFormTemplates(previousIds: string[], templates: FormTemplate[]): Promise<void> {
  const studioId = await getStudioId();
  const nextIds = templates.map(t => t.id);
  const removedIds = previousIds.filter(id => !nextIds.includes(id));

  if (removedIds.length > 0) {
    const { error: delError } = await supabase.from('custom_form_templates').delete().in('id', removedIds);
    if (delError) { console.error('replaceSupabaseFormTemplates delete failed', delError); return; }
  }

  if (templates.length > 0) {
    const { error: upsertError } = await supabase.from('custom_form_templates').upsert(
      templates.map(t => ({ id: t.id, studio_id: studioId, data: t }))
    );
    if (upsertError) { console.error('replaceSupabaseFormTemplates upsert failed', upsertError); return; }
  }

  await fetchSupabaseFormTemplates();
}

export function loadCustomFormTemplates(): FormTemplate[] {
  if (isDemoSession()) return _demoFormTemplates;
  ensureFormTemplatesFetchStarted();
  return _supabaseFormTemplates;
}

export function saveCustomFormTemplates(templates: FormTemplate[]): void {
  if (isDemoSession()) {
    _demoFormTemplates = templates;
    persistDemoFormTemplates();
    return;
  }
  const previousIds = _supabaseFormTemplates.map(t => t.id);
  _supabaseFormTemplates = templates;
  void replaceSupabaseFormTemplates(previousIds, templates);
}

export function getVisibleBuiltInFormTemplates(): FormTemplate[] {
  return BUILT_IN_FORM_TEMPLATES.filter(t => !isTemplateHidden(t.id));
}

export function loadAllFormTemplates(): FormTemplate[] {
  return [...getVisibleBuiltInFormTemplates(), ...loadCustomFormTemplates()];
}

// ── Resource template types ────────────────────────────────────────────────────

export type ResourceTemplateType = 'checklist' | 'document' | 'screenplay' | 'video_review' | 'file' | 'moodboard';

export interface ChecklistItem { id: string; text: string; }
export interface DocumentSection { title: string; body: string; }
export interface SceneBlock { id: string; location: string; time: string; action: string; }
export interface ReviewRound { id: string; label: string; description: string; }
export interface FolderNode { id: string; name: string; children?: FolderNode[]; }
export interface MoodboardRef { id: string; title: string; note: string; }

export interface ResourceTemplate {
  id: string;
  type: ResourceTemplateType;
  name: string;
  description: string;
  color: string;
  icon: string;
  tags: string[];
  builtIn?: boolean;
  createdAt: string;
  checklistItems?: ChecklistItem[];
  documentSections?: DocumentSection[];
  sceneBlocks?: SceneBlock[];
  reviewRounds?: ReviewRound[];
  folderStructure?: FolderNode[];
  moodboardRefs?: MoodboardRef[];
  rawHTML?: string;
  rawElements?: string;
}

// ── Built-in resource templates ────────────────────────────────────────────────

export const BUILT_IN_RESOURCE_TEMPLATES: ResourceTemplate[] = [
  // ── Checklists ──
  {
    id: 'res-checklist-tournage',
    type: 'checklist',
    name: 'Équipement tournage',
    description: 'Liste complète du matériel à préparer et vérifier avant chaque journée de tournage.',
    color: '#5B8AF5',
    icon: 'list-checks',
    tags: ['Tournage', 'Production', 'Logistique'],
    builtIn: true,
    createdAt: '2025-01-01',
    checklistItems: [
      { id: 'c1', text: 'Caméra principale + batteries chargées' },
      { id: 'c2', text: '2e caméra (si multicam)' },
      { id: 'c3', text: 'Objectifs : grand angle, 50mm, téléobjectif' },
      { id: 'c4', text: 'Cartes mémoire (×4 minimum) + lecteur' },
      { id: 'c5', text: 'Trépied + rotule fluide' },
      { id: 'c6', text: 'Gimbal / Steadicam chargé' },
      { id: 'c7', text: 'Micro HF (émetteur + récepteur)' },
      { id: 'c8', text: 'Micro canon + perche + bonnette' },
      { id: 'c9', text: 'Enregistreur audio autonome' },
      { id: 'c10', text: 'Casque monitoring' },
      { id: 'c11', text: 'Panneau LED principal' },
      { id: 'c12', text: 'Réflecteurs (blanc/argent/or)' },
      { id: 'c13', text: 'Câbles HDMI + alimentation + multiprise' },
      { id: 'c14', text: 'Gaffer tape + pinces' },
      { id: 'c15', text: 'Disque dur de sauvegarde sur place' },
    ],
  },
  {
    id: 'res-checklist-preprod',
    type: 'checklist',
    name: 'Checklist pré-production',
    description: 'Toutes les étapes à valider avant le début d\'un tournage.',
    color: '#34C98A',
    icon: 'list-checks',
    tags: ['Préproduction', 'Logistique'],
    builtIn: true,
    createdAt: '2025-01-01',
    checklistItems: [
      { id: 'p1', text: 'Brief client validé et signé' },
      { id: 'p2', text: 'Contrat de production envoyé et signé' },
      { id: 'p3', text: 'Acompte encaissé' },
      { id: 'p4', text: 'Script / storyboard approuvé' },
      { id: 'p5', text: 'Repérage des lieux effectué' },
      { id: 'p6', text: 'Autorisations de tournage obtenues' },
      { id: 'p7', text: 'Équipe confirmée avec horaires' },
      { id: 'p8', text: 'Casting confirmé' },
      { id: 'p9', text: 'Location de matériel réservée' },
      { id: 'p10', text: 'Plan de tournage envoyé à l\'équipe' },
      { id: 'p11', text: 'Transport et hébergement organisés' },
      { id: 'p12', text: 'Assurance production vérifiée' },
    ],
  },
  // ── Documents ──
  {
    id: 'res-doc-contrat',
    type: 'document',
    name: 'Contrat de production',
    description: 'Structure type d\'un contrat de production audiovisuelle avec les clauses essentielles.',
    color: '#F5975B',
    icon: 'file-text',
    tags: ['Corporate', 'Vente'],
    builtIn: true,
    createdAt: '2025-01-01',
    documentSections: [
      { title: 'Parties prenantes', body: 'Prestataire : [NOM STUDIO]\nClient : [NOM CLIENT]\nAdresse : [ADRESSE]\nSIRET : [NUMÉRO SIRET]' },
      { title: 'Objet du contrat', body: 'Le prestataire s\'engage à réaliser les prestations suivantes pour le compte du client :\n\n[DESCRIPTION DÉTAILLÉE DES PRESTATIONS]' },
      { title: 'Livrables', body: 'Les livrables attendus sont :\n- [LIVRABLE 1]\n- [LIVRABLE 2]\n- [LIVRABLE 3]\n\nFormats de livraison : [FORMATS]' },
      { title: 'Calendrier', body: 'Date de début : [DATE DÉBUT]\nDate de livraison finale : [DATE FIN]\n\nJalons intermédiaires :\n- [JALON 1] : [DATE]\n- [JALON 2] : [DATE]' },
      { title: 'Rémunération', body: 'Montant total HT : [MONTANT] €\nTVA (20%) : [MONTANT TVA] €\nMontant TTC : [MONTANT TTC] €\n\nModalités de paiement :\n- 50% à la signature\n- 50% à la livraison finale' },
      { title: 'Droits et propriété intellectuelle', body: 'Les droits de diffusion cédés sont :\n[DROITS CÉDÉS]\n\nLe prestataire conserve le droit de mentionner cette réalisation dans son portfolio.' },
      { title: 'Révisions', body: 'Le présent contrat inclut [NOMBRE] rounds de révisions.\nTout round supplémentaire sera facturé à [MONTANT] €/heure.' },
    ],
  },
  {
    id: 'res-doc-brief',
    type: 'document',
    name: 'Brief créatif',
    description: 'Document de cadrage créatif pour aligner studio et client avant le démarrage d\'un projet.',
    color: '#C45BE8',
    icon: 'file-text',
    tags: ['Créatif', 'Démarrage', 'Client'],
    builtIn: true,
    createdAt: '2025-01-01',
    documentSections: [
      { title: 'Contexte du projet', body: 'Client : [NOM CLIENT]\nProjet : [NOM PROJET]\nDate : [DATE]\n\nDescription du projet :\n[CONTEXTE ET BACKGROUND DU CLIENT]' },
      { title: 'Objectifs', body: 'Objectif principal :\n[OBJECTIF]\n\nObjectifs secondaires :\n- [OBJECTIF 2]\n- [OBJECTIF 3]\n\nIndicateurs de succès : [KPIs]' },
      { title: 'Audience cible', body: 'Profil principal : [DESCRIPTION]\nÂge : [TRANCHE D\'ÂGE]\nIntérêts : [INTÉRÊTS]\nPlateforme de diffusion : [PLATEFORMES]' },
      { title: 'Ton et style', body: 'Ton souhaité : [ex. Professionnel / Chaleureux / Dynamique]\nStyle visuel : [ex. Épuré / Coloré / Cinématographique]\nRéférences appréciées : [LIENS OU DESCRIPTIONS]' },
      { title: 'Contraintes', body: 'Durée : [DURÉE]\nBudget : [BUDGET]\nDélai de livraison : [DATE]\nContraintes techniques : [CONTRAINTES]\nÉléments à éviter : [ÉLÉMENTS]' },
    ],
  },
  // ── Scénarios ──
  {
    id: 'res-screenplay-3actes',
    type: 'screenplay',
    name: 'Structure 3 actes',
    description: 'Trame narrative classique en 3 actes pour un film corporatif ou publicitaire.',
    color: '#E85B7A',
    icon: 'clapperboard',
    tags: ['Créatif', 'Vidéo'],
    builtIn: true,
    createdAt: '2025-01-01',
    sceneBlocks: [
      { id: 's1', location: 'ACTE 1 — INTÉRIEUR / BUREAU — JOUR', time: '0:00 – 0:20', action: 'Présentation du contexte et du personnage principal. On établit le problème ou le besoin.' },
      { id: 's2', location: 'EXT. / VILLE — JOUR', time: '0:20 – 0:35', action: 'Le protagoniste est confronté au défi. On montre l\'avant (sans la solution).' },
      { id: 's3', location: 'ACTE 2 — INT. / PRODUIT EN ACTION — JOUR', time: '0:35 – 1:00', action: 'Introduction de la solution. Démonstration des bénéfices clés en situation réelle.' },
      { id: 's4', location: 'INT. / TÉMOIGNAGE CLIENT — JOUR', time: '1:00 – 1:20', action: 'Témoignage ou validation externe. Renforce la crédibilité de la solution.' },
      { id: 's5', location: 'ACTE 3 — EXT. / RÉSULTAT — JOUR', time: '1:20 – 1:40', action: 'Transformation du protagoniste. Résultat positif montré clairement.' },
      { id: 's6', location: 'INT. / PRODUIT — PLAN SERRÉ', time: '1:40 – 2:00', action: 'Call to action. Logo, slogan, coordonnées ou URL.' },
    ],
  },
  // ── Révisions vidéo ──
  {
    id: 'res-review-3rounds',
    type: 'video_review',
    name: 'Révision 3 rounds client',
    description: 'Structure standard de révision en 3 rounds avec objectifs définis pour chaque étape.',
    color: '#5BC4E8',
    icon: 'video',
    tags: ['Révision', 'Client', 'Livrable'],
    builtIn: true,
    createdAt: '2025-01-01',
    reviewRounds: [
      { id: 'r1', label: 'V1 — Rough cut', description: 'Première version non finalisée. Valider la structure narrative, le rythme général et l\'ordre des séquences. Pas de corrections de couleur ni de mixage audio définitif.' },
      { id: 'r2', label: 'V2 — Version fine cut', description: 'Intégration des retours V1. Valider les détails : textes à l\'écran, musique, couleurs, son. Dernière chance pour des modifications importantes.' },
      { id: 'r3', label: 'V3 — Version finale', description: 'Intégration des dernières corrections. Approbation finale du client. Toute modification après cette étape fera l\'objet d\'un devis supplémentaire.' },
    ],
  },
  // ── Fichiers / Arborescence ──
  {
    id: 'res-file-structure',
    type: 'file',
    name: 'Arborescence projet vidéo',
    description: 'Structure de dossiers standard pour organiser un projet de production audiovisuelle.',
    color: '#F5D05B',
    icon: 'folder',
    tags: ['Production', 'Logistique'],
    builtIn: true,
    createdAt: '2025-01-01',
    folderStructure: [
      { id: 'f1', name: '01_RUSHES', children: [
        { id: 'f1a', name: 'Jour_01' },
        { id: 'f1b', name: 'Jour_02' },
        { id: 'f1c', name: 'B-Roll' },
      ]},
      { id: 'f2', name: '02_AUDIO', children: [
        { id: 'f2a', name: 'Voix_off' },
        { id: 'f2b', name: 'Ambiances' },
        { id: 'f2c', name: 'Musiques' },
      ]},
      { id: 'f3', name: '03_ASSETS', children: [
        { id: 'f3a', name: 'Logos' },
        { id: 'f3b', name: 'Polices' },
        { id: 'f3c', name: 'Photos' },
        { id: 'f3d', name: 'Animations' },
      ]},
      { id: 'f4', name: '04_MONTAGE', children: [
        { id: 'f4a', name: 'Projets_Premiere' },
        { id: 'f4b', name: 'Sauvegardes' },
      ]},
      { id: 'f5', name: '05_EXPORTS', children: [
        { id: 'f5a', name: 'V1' },
        { id: 'f5b', name: 'V2' },
        { id: 'f5c', name: 'FINAL' },
      ]},
      { id: 'f6', name: '06_DOCUMENTS', children: [
        { id: 'f6a', name: 'Contrats' },
        { id: 'f6b', name: 'Briefs' },
        { id: 'f6c', name: 'Factures' },
      ]},
    ],
  },
  // ── Moodboard ──
  {
    id: 'res-moodboard-corporate',
    type: 'moodboard',
    name: 'Références visuelles corporate',
    description: 'Planche de références pour un tournage institutionnel. Cadrage, lumière, esthétique générale.',
    color: '#A05BE8',
    icon: 'grid-2x2',
    tags: ['Créatif', 'Corporate', 'Stratégie'],
    builtIn: true,
    createdAt: '2025-01-01',
    moodboardRefs: [
      { id: 'm1', title: 'Ambiance lumineuse', note: 'Lumière naturelle diffuse, tons chauds, éviter les ombres dures. Fenêtres en arrière-plan.' },
      { id: 'm2', title: 'Palette de couleurs', note: 'Bleu nuit #1a2b4a, blanc cassé #f5f0e8, accent doré #c8980a. Rester dans la charte graphique client.' },
      { id: 'm3', title: 'Cadrage interviews', note: 'Plan américain légèrement décentré, regard vers l\'objectif. Background flou (f/2.8). Ligne de regard dans le tiers gauche ou droit.' },
      { id: 'm4', title: 'B-roll : lieux de travail', note: 'Plans larges pour établir le contexte, gros plans sur les mains et détails. Mouvement fluide de caméra (slider ou gimbal).' },
      { id: 'm5', title: 'Typographie à l\'écran', note: 'Police : [POLICE CLIENT]. Titres en blanc sur fond semi-transparent. Entrées en fondu. Jamais de texte sur fond clair.' },
    ],
  },
];

// ── Resource template storage ──────────────────────────────────────────────────

const RES_TPL_KEY = 'sf_custom_resource_templates';

let _demoResourceTemplates: ResourceTemplate[] = loadDemoResourceTemplates();
function loadDemoResourceTemplates(): ResourceTemplate[] {
  try {
    const raw = localStorage.getItem(RES_TPL_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function persistDemoResourceTemplates(): void { localStorage.setItem(RES_TPL_KEY, JSON.stringify(_demoResourceTemplates)); }

let _supabaseResourceTemplates: ResourceTemplate[] = [];
let _resourceTemplatesFetchStarted = false;

interface CustomResourceTemplateRow { id: string; data: ResourceTemplate; }

async function fetchSupabaseResourceTemplates(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase.from('custom_resource_templates').select('id, data').eq('studio_id', studioId);
    if (error) { console.error('fetchSupabaseResourceTemplates failed', error); return; }
    _supabaseResourceTemplates = (data as CustomResourceTemplateRow[]).map(row => row.data);
  } catch (err) {
    console.error('fetchSupabaseResourceTemplates failed', err);
  }
}

function ensureResourceTemplatesFetchStarted(): void {
  if (_resourceTemplatesFetchStarted) return;
  _resourceTemplatesFetchStarted = true;
  void fetchSupabaseResourceTemplates();
}

export function resetCustomResourceTemplatesCache(): void {
  _supabaseResourceTemplates = [];
  _resourceTemplatesFetchStarted = false;
}

onLogout(resetCustomResourceTemplatesCache);

async function replaceSupabaseResourceTemplates(previousIds: string[], templates: ResourceTemplate[]): Promise<void> {
  const studioId = await getStudioId();
  const nextIds = templates.map(t => t.id);
  const removedIds = previousIds.filter(id => !nextIds.includes(id));

  if (removedIds.length > 0) {
    const { error: delError } = await supabase.from('custom_resource_templates').delete().in('id', removedIds);
    if (delError) { console.error('replaceSupabaseResourceTemplates delete failed', delError); return; }
  }

  if (templates.length > 0) {
    const { error: upsertError } = await supabase.from('custom_resource_templates').upsert(
      templates.map(t => ({ id: t.id, studio_id: studioId, data: t }))
    );
    if (upsertError) { console.error('replaceSupabaseResourceTemplates upsert failed', upsertError); return; }
  }

  await fetchSupabaseResourceTemplates();
}

export function loadCustomResourceTemplates(): ResourceTemplate[] {
  if (isDemoSession()) return _demoResourceTemplates;
  ensureResourceTemplatesFetchStarted();
  return _supabaseResourceTemplates;
}

export function saveCustomResourceTemplates(templates: ResourceTemplate[]): void {
  if (isDemoSession()) {
    _demoResourceTemplates = templates;
    persistDemoResourceTemplates();
    return;
  }
  const previousIds = _supabaseResourceTemplates.map(t => t.id);
  _supabaseResourceTemplates = templates;
  void replaceSupabaseResourceTemplates(previousIds, templates);
}

export function getVisibleBuiltInResourceTemplates(): ResourceTemplate[] {
  return BUILT_IN_RESOURCE_TEMPLATES.filter(t => !isTemplateHidden(t.id));
}

export function loadAllResourceTemplates(): ResourceTemplate[] {
  return [...getVisibleBuiltInResourceTemplates(), ...loadCustomResourceTemplates()];
}
