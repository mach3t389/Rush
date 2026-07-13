# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

---

## Commandes essentielles

Toutes les commandes s'exécutent depuis `app/` :

```bash
npm run dev       # Serveur de développement Vite (http://localhost:5173)
npm run build     # Vérification TypeScript + build de production
npm run lint      # ESLint
npm run preview   # Preview du build de production
```

Il n'y a pas de tests automatisés. La vérification se fait via le serveur de preview.

**Sauvegarde automatique :** un script PowerShell `auto-backup.ps1` à la racine commit et push toutes les heures via Windows Task Scheduler (`\RushDev\Rush Auto-Backup`). Le log est dans `auto-backup.log`.

---

## Architecture

### Stack

React 19 + TypeScript + Vite 8 + Tailwind v4 (via `@tailwindcss/vite`). SPA sans backend — tout l'état est en mémoire avec persistance `localStorage` optionnelle. Routeur : `react-router-dom` v7 en mode **data router** (`createBrowserRouter`).

### Structure des routes (`app/src/main.tsx`)

```
/portail/:projectId          → Portail (standalone, sans sidebar)
/                            → AppShell (sidebar + <Outlet>)
  /                          → Dashboard
  /taches                    → Taches
  /projets                   → Projets
  /projets/:projectId        → Travail (vue Kanban/sections du projet)
  /projets/:projectId/overview       → TravailOverview
  /projets/:projectId/fichiers       → Fichiers (wrapper FileBrowser scopé projet)
  /projets/:projectId/ressources/:resourceId → ResourceRouter → (VideoReview | ImageReview | DocumentReview | WebReview | ResourceDetail)
  /projets/:projectId/calendrier     → ProjetCalendrier
  /projets/:projectId/membres        → ProjectMembres
  /clients                   → Clients
  /clients/:clientId         → FicheClient
  /calendrier                → CalendrierGlobal
  /modeles                   → Modeles
  /fichiers                  → FichiersGlobal
  /global                    → VueGlobale (onglets Fichiers + Calendrier)
  /parametres                → Parametres
  /activite                  → Activite
```

`ResourceRouter` lit le `type` de la ressource et dispatch vers le bon composant de revue.

**Ressources = Fichiers.** L'ancienne page liste `Ressources.tsx` (route `/projets/:id/ressources`) a été **supprimée** (juin 2026). Les ressources sont désormais gérées dans l'onglet **Fichiers** du projet (`FileBrowser`). On ouvre une ressource via la route détail `/projets/:id/ressources/:resourceId` (toujours active, utilisée par le FileBrowser, l'Activité, l'AIChat et l'aperçu projet). Ne pas recréer de page liste de ressources.

### Raccourcis clavier globaux (`app/src/components/layout/AppShell.tsx`)

Un unique `useEffect` dans `AppShell` attache un listener `keydown` global (phase capture) :

| Touche | Action |
|--------|--------|
| `R` (seule) | Ouvre la recherche (`CommandPalette`) — affichée dans la barre supérieure |
| `⌘K` / `Ctrl+K` | Bascule la recherche (convention universelle, conservée en plus de `R`) |
| `I` (seule) | Bascule l'Assistant IA via le bridge `triggerAIToggle()` |

**Pattern des touches uniques :** chaque touche simple est ignorée si le focus est dans un champ de saisie (`INPUT`/`TEXTAREA`/`contentEditable`), pour ne pas se déclencher pendant la frappe. `I` a une exception : il reste actif dans le panneau IA (`[data-ai-panel]`).

**Pourquoi `I` passe par un bridge :** `AIChat` gère son propre état d'ouverture en interne (composant frère), donc `AppShell` ne peut pas le piloter directement. Le bridge `aiChatBridge.ts` (`registerAIToggle`/`triggerAIToggle`) relaie l'action. `R` n'a pas besoin de bridge : `AppShell` possède l'état `cmdOpen` de la palette.

**⚠️ Piège HMR :** comme le listener est posé dans `useEffect(() => { window.addEventListener(...) }, [])` (deps vides), modifier le handler ne re-enregistre pas toujours le listener via Fast Refresh — l'ancien handler reste attaché et le nouveau raccourci semble « ne pas marcher ». **Toujours faire un rechargement complet de l'onglet (Ctrl+Shift+R) après avoir touché à ces raccourcis.** Le code, lui, est correct (vérifié en chargement propre).

### Couche données (`app/src/data/`)

**Pattern commun à tous les stores :**
- Les données de seed viennent de `mock.ts` et ne sont jamais modifiées.
- Les données ajoutées par l'utilisateur sont stockées séparément via `persist.ts` (`localStorage`).
- Chaque store expose `get*()`, `add*()`, `subscribe*(fn)` → retourne un unsubscribe.
- La réactivité est manuelle : les composants s'abonnent dans un `useEffect` et appellent `setState` dans le callback.

```
persist.ts            → loadPersisted<T>(key, fallback) / savePersisted(key, value)
mock.ts               → PROJECTS, CLIENTS, USERS, MY_TASKS, … (données de seed statiques)
projectStore.ts       → getProjects / addProject / subscribeProjects
eventStore.ts         → getEvents / addEvent / subscribeEvents
resourceStore.ts      → getResources / addResource / subscribeResources
taskStore.ts          → store de tâches par projet (get/setSections, moveTask(s), copyTasks, moveSection, copySection, deleteTask)
myTaskStore.ts        → tâches perso « Mes tâches » + sections perso (getMyTaskSections / add / remove)
clientStore.ts        → store clients
fileStore.ts          → dossiers + fichiers (FileFolder, FileItem) ; soft-delete (trashed/archived) ; addFolderTree
fileContentStore.ts   → contenu réel des fichiers importés (blob URLs en mémoire + base64 localStorage ≤ 3 Mo)
status.ts             → utilitaires de mapping Status → couleur/label
```

**Tâches — parité des vues.** Les actions tâches/sections (créer, supprimer, déplacer, copier, multi-sélection `Ctrl`/`Shift`+clic, menu clic droit) doivent rester cohérentes entre les 3 surfaces : `Travail.tsx` (liste), `TravailBoard.tsx` (Kanban) et `Taches.tsx` (Mes tâches). Déplacer/copier en masse passe par `BulkMoveModal` (sélecteur projet → section). Toute nouvelle action de tâche doit être ajoutée aux 3 endroits.

### FileBrowser (`app/src/screens/FichiersGlobal.tsx`)

Composant unique partagé entre toutes les surfaces fichiers :

| Surface | Mode | Clé de persistance nav |
|---------|------|------------------------|
| `/fichiers` (global) | `locked=false` | `sf_nav_global` |
| `/global` onglet Fichiers | `locked=false` | `sf_nav_global` |
| `/projets/:id/fichiers` | `locked=true, scope=project` | `sf_nav_project_<id>` |

**Navigation :** la position de navigation (`location : NavLocation`) est persistée via `usePersistedState` — retourner en arrière depuis une ressource restaure le bon dossier.

**Interactions unifiées (simple clic = sélectionner, double-clic = ouvrir) :**
- Dossiers (grille, liste, colonnes) → double-clic pour entrer
- VirtualCard / VirtualRow (racine, clients, projets) → double-clic pour naviguer ; simple clic = sélection avec highlight
- Ressources → double-clic → route `/projets/:id/ressources/:resourceId`
- Fichiers réels (non-ressource) → double-clic → `FilePreviewModal`
- Raccourcis : `Enter` = ouvrir la sélection ; `Escape` = fermer l'aperçu / vider la sélection ; `←`/`→` = nav entre fichiers dans l'aperçu

**Import de fichiers réels :**
- Drag & drop OS sur la zone de contenu → overlay jaune + import dans le dossier courant
- "Importer un fichier" dans le menu `+` → sélecteur de fichier natif (multi-sélection)
- Le contenu est stocké via `fileContentStore` : blob URL en mémoire (toute taille) + base64 localStorage (≤ 3 Mo, survit au rechargement)

**`FilePreviewModal` (double-clic sur un fichier non-ressource) :**
- PDF → iframe navigateur
- Image → zoom molette (20–600%), pan, boutons +/−/reset/plein-écran, raccourcis `+`/`-`/`0`
- Vidéo → lecteur natif, lecture auto
- Audio → lecteur avec boutons Précédent/Suivant parmi les fichiers audio du dossier
- Navigation globale `←`/`→` (toutes les vues), compteur `X / N`

**`StorageView` (vue taille des fichiers) :** composant standalone exporté. Les helpers `noSelectOnModifier` et `openResource` doivent être définis localement dans `StorageView` — ils ne sont pas accessibles depuis `FileBrowser`.

### Calendriers

**`CalendrierGlobal`** et **`ProjetCalendrier`** utilisent le même modèle de filtres :
- Logique d'**inclusion** (`selectedEventTypes`, `selectedProjects`) — par défaut tout est visible
- Cliquer un élément l'active ; les autres se grisent à 0.35 ; "Tout afficher" n'apparaît que quand un filtre est actif
- Pas de bouton Solo

**Prochains événements** dans `CalendrierGlobal` : 3 affichés par défaut, bouton "X de plus" / "Réduire" pour étendre.

**Glisser-déposer entre les jours** (`MonthView.tsx`, `TimeGridView.tsx`, `EventBlock.tsx`) : un événement peut être glissé vers un autre jour (vue mois, événements « jour entier » en vue semaine) ou vers un autre jour **et** une autre heure en même temps (événements horaires en vue semaine, `EventBlock`). Mécanisme commun : chaque case/colonne-jour porte `data-cal-day="AAAA-MM-JJ"` ; `document.elementFromPoint` résout le jour sous le curseur pendant le glisser. Un chip flottant suit le curseur en temps réel (état `ghost`/`allDayGhost`) pendant que l'original s'estompe à 35 % d'opacité — même sensation que le glisser vertical (changement d'heure) déjà en direct dans une journée. Seuil de mouvement (~4 px) pour distinguer clic et glisser ; le drapeau de suppression du clic qui suit (`suppressClickRef`) doit être remis à `false` via `setTimeout(…, 0)`, jamais seulement par un `onClick` gardé — un glisser inter-cases fait atterrir le `click` du navigateur sur l'ancêtre commun, pas sur un élément gardé (bug rencontré 2× : `MonthView` puis `TimeGridView`). La sauvegarde (`handleEventChange`, dans les deux écrans) écrit en date seule (`AAAA-MM-JJ`) pour un événement `allDay`, en ISO complet sinon.

**Premier jour de la semaine** (réglable, Dimanche par défaut) : store `weekStartStore.ts` (`sf_week_start`, `0`=dimanche/`1`=lundi, préférence locale — pas de Supabase). `startOfWeek`/`getMonthGrid`/`getWeekDays` dans `calendarUtils.ts` prennent un paramètre `weekStart` par défaut `getWeekStart()`. Les tableaux `calendar.daysShort`/`datepicker.daysShort` restent stockés **lundi-d'abord** dans les locales — les en-têtes sont réordonnés au rendu (`MonthView`, `MiniCalendar`) ou dérivés de la vraie date (`TimeGridView.dayLabel`), jamais en réécrivant les tableaux de traduction. Réglage dans Paramètres → Personnalisation.

### Composants UI (`app/src/components/ui/`)

Composants primitifs réutilisables — toujours préférer ces composants aux éléments HTML bruts :

| Composant | Usage |
|-----------|-------|
| `SFButton` | Boutons avec variants `primary` / `secondary` / `ghost` |
| `SFIcon` | Icônes Lucide via nom kebab-case (ex: `"edit-3"`, `"sparkles"`) |
| `SFPill` | Badges de statut/type |
| `SFCard` | Conteneur carte |
| `SFAvatar` | Avatar initiales |
| `SFBar` | Barre de progression |
| `DatePicker` | Sélecteur date/heure |

**⚠️ RÈGLE CRITIQUE — Sélecteur de date :** Ne JAMAIS utiliser `<input type="date">`. Toujours utiliser `DatePickerDropdown` de `../components/ui`. Pattern standard :
```tsx
import { DatePickerDropdown, formatDisplay } from '../components/ui';

const [anchor, setAnchor] = useState<DOMRect | null>(null);

<button onClick={e => setAnchor(anchor ? null : e.currentTarget.getBoundingClientRect())}
  style={{ /* styles du champ */ }}>
  {value ? formatDisplay(value) : '—'}
</button>
{anchor && (
  <DatePickerDropdown value={value} onChange={v => { setValue(v); setAnchor(null); }}
    onClose={() => setAnchor(null)} anchorRect={anchor} zIndex={400} />
)}
```

**Important :** `SFIcon` accepte n'importe quel nom d'icône Lucide en kebab-case. Vérifier la disponibilité sur [lucide.dev](https://lucide.dev) si une icône ne s'affiche pas (elle retourne `null` silencieusement si inconnue).

### Design system (`app/src/index.css`)

Tokens CSS définis deux fois : dans `@theme {}` (Tailwind v4) et dans `:root {}` (pour les `style={}` inline).

```
Couleurs : --bg, --surface, --surface-2, --surface-3
           --accent (#f9ff00), --on-accent (#14140a), --accent-dim
           --text, --text-2, --text-3
           --border, --border-2
           --ok, --warn, --info, --danger, --review
Polices  : --ff-display, --ff-text  → Montserrat (UI générale)
           --ff-mono                → IBM Plex Mono (métadonnées, tags, labels techniques)
Rayons   : --radius (14px), --radius-sm (9px), --radius-lg (20px)
```

**Règle typographique :** `var(--ff-text)` pour tous les boutons d'action et textes UI. `var(--ff-mono)` uniquement pour les labels en MAJUSCULES avec `letterSpacing`, les métadonnées, les éléments de calendrier numérique et les identifiants techniques.

**Google Fonts** : chargées via `<link>` dans `index.html` — ne jamais utiliser `@import url()` dans les fichiers CSS (incompatible avec le traitement PostCSS de Tailwind v4).

### Proxy web (`app/vite.config.ts`)

Un middleware Vite personnalisé expose `/web-proxy/<url-encodée>` qui :
1. Fetch la ressource distante côté serveur
2. Réécrit les URLs relatives en absolues dans HTML et CSS
3. Injecte un script de suppression des error overlays (Next.js, etc.)
4. Retire les en-têtes bloquants (`x-frame-options`, `content-security-policy`, etc.)

Utilisé par `WebReview.tsx` pour afficher des sites externes dans un `<iframe>` avec annotations.

### Assistant IA (`app/src/components/AIChat.tsx`)

Panneau flottant connecté à **Ollama** en local (`http://localhost:11434/api/chat`). Boucle agentique : appel Ollama → si `tool_calls` présents → exécution locale → reboucle jusqu'à réponse textuelle.

- Modèle configurable dans les paramètres du panneau (défaut : `llama3.2`)
- Outils disponibles : `list_projects`, `list_clients`, `list_tasks`, `create_project`, `create_event`, `create_resource`, `navigate`
- Reconnaissance vocale via Web Speech API (Chrome/Edge uniquement)
- Rendu markdown dans les réponses assistant (gras, listes, blocs de code)
- Prérequis : Ollama installé + `ollama pull llama3.2`

### IA dans DocumentView (`app/src/screens/ResourceDetail.tsx`)

Le panneau droit de `DocumentView` (éditeur de texte riche) est tabulé : **Commentaires** / **IA**.

- Onglet IA : chat Ollama contextualisé sur le contenu du document (2000 premiers caractères injectés en system prompt)
- Actions rapides : Structurer, Continuer, Résumer, Reformuler formellement, Améliorer le style
- Dictée vocale (Web Speech API, `fr-FR`)
- Sélecteur de modèle Ollama (même liste que AIChat)
- État `rightTab` local (non persisté) — réinitialisé à `'comments'` à chaque ouverture

### Génération IA dans StoryboardView (`app/src/screens/ResourceDetail.tsx`)

Le modal de génération IA du storyboard (`StoryboardView`) supporte trois modes de prompt accessibles depuis un toggle **Texte / Dessin** :

**Mode Texte :**
- Textarea de description libre avec pré-remplissage depuis le label du plan
- Bouton dictée vocale (Web Speech API, icône `mic`/`mic-off`) — état `sbListening` + `sbRecognitionRef`
- Transcription en temps réel ajoutée au prompt

**Mode Dessin (canvas 16:9) :**
- Canvas HTML5 (`canvasRef`, 544×306 px, ratio 16/9) avec fond noir initialisé via `useEffect` sur `[showAIModal, promptMode]`
- Palette de 8 couleurs (points colorés), slider de taille de brosse (1–20 px), bouton Gomme (toggle `isErasing`), bouton Effacer (`clearCanvas`)
- Dessin souris + touch (`startDraw`/`continueDraw`/`endDraw`) via `globalCompositeOperation`: `'source-over'` (pinceau) ou `'destination-out'` (gomme)
- Champ description optionnel sous le canvas
- `generateImage()` capture le canvas via `canvas.toDataURL('image/png')` et préfixe le prompt avec `[Croquis]`

**États et refs :**
```typescript
const [promptMode, setPromptMode]  = useState<'text' | 'draw'>('text');
const [sbListening, setSbListening] = useState(false);
const [drawColor, setDrawColor]    = useState('#ffffff');
const [brushSize, setBrushSize]    = useState(4);
const [isErasing, setIsErasing]    = useState(false);
const canvasRef     = useRef<HTMLCanvasElement>(null);
const isDrawingRef  = useRef(false);
const sbRecognitionRef = useRef<any>(null);
```

`openAI()` remet `promptMode` à `'text'` et `isErasing` à `false` à chaque ouverture. En mode dessin, le bouton Générer est actif même sans texte (le croquis suffit).

### Internationalization (i18n)

L'application supporte **plusieurs langues** via **i18next + react-i18next**. La langue sélectionnée est persistée dans `localStorage` (clé : `language`, défaut : `fr`).

**Structure :**
- `app/src/i18n/i18n.ts` — configuration i18next (ressources, langue par défaut, persistence)
- `app/src/i18n/useI18n.ts` — hook personnalisé pour accéder aux traductions
- `app/src/locales/fr.json` — traductions français
- `app/src/locales/en.json` — traductions anglais
- Fichiers organisés par **namespace** : `nav`, `search`, `dashboard`, `tasks`, `activity`, etc.

**Utilisation dans les composants :**
```tsx
import { useTranslation } from 'react-i18next';

export function MonComposant() {
  const { t, i18n } = useTranslation();
  return <button>{t('nav.dashboard')}</button>;
}
```

**Pour changer la langue programmatiquement :**
```tsx
i18n.changeLanguage('en'); // Persiste automatiquement dans localStorage
```

**⚠️ RÈGLE CRITIQUE : Ne JAMAIS hard-coder du texte utilisateur dans le code.** Tous les textes UI doivent passer par `t('namespace.key')`. Voir `app/src/locales/fr.json` et `en.json` pour les clés disponibles. **Ajouter les nouvelles clés d'abord dans les fichiers de traduction, puis utiliser `t()`.**

**Sélecteur de langue :** Paramètres → Personnalisation → Langue

### Paramètres persistés (`localStorage`)

| Clé | Contenu |
|-----|---------|
| `sf_added_projects` | Projets créés par l'utilisateur |
| `sf_events` | Événements calendrier |
| `sf_resources` | Ressources ajoutées |
| `sf_portal_accent` | Couleur accent du portail client |
| `sf_ui_fonts` | Polices d'interface choisies |
| `sf_logo_full` / `sf_logo_square` | Logos studio (base64) |
| `sf_pinned_projects` | Projets épinglés dans la sidebar |
| `sf_nav_global` | Dernière position de navigation dans FileBrowser global |
| `sf_nav_project_<id>` | Dernière position par projet (dossier actif) |
| `sf_fc_<fileId>` | Contenu base64 des fichiers importés ≤ 3 Mo |
| `sf_week_start` | Premier jour de la semaine dans le calendrier (`0`=dimanche déf., `1`=lundi) |

---

### ⚠️ Migrations Supabase — exécution manuelle requise

Les fichiers `docs/superpowers/specs/*-migration.sql` sont des **specs**, pas des preuves qu'ils ont été appliqués. Chaque migration doit être collée et exécutée à la main dans **Supabase → SQL Editor** — rien ne le fait automatiquement (pas de CLI/CI de migration dans ce projet). Un incident vécu (2026-07-12) : la migration de `sidebar_prefs` (projets/clients épinglés, couleurs de projet) avait été écrite début juillet mais jamais exécutée — chaque lecture/écriture réelle (session non-démo) échouait silencieusement en 404 (`PGRST205: table not found`), masqué par la mise à jour optimiste du cache local (l'app semblait fonctionner jusqu'au prochain rechargement). **Avant de soupçonner un bug de code sur une fonctionnalité Supabase qui "ne persiste pas"**, vérifier d'abord que la table existe réellement (`fetch` un `select` sur `/rest/v1/<table>?limit=1` avec un vrai token de session, ou demander à l'utilisateur de vérifier dans le dashboard).

## Conventions

- Tous les styles sont en `style={}` inline ou via tokens CSS. Tailwind n'est utilisé que marginalement.
- Pas de state management global (pas de Redux/Zustand) — les stores sont des modules singleton avec abonnement manuel.
- Les écrans sont de larges fichiers `.tsx` autonomes — c'est intentionnel pour cette phase du projet.
- Le portail client (`/portail/:projectId`) est une route standalone sans `AppShell` ni sidebar.
- La couleur accent (`--accent`) peut être personnalisée par l'utilisateur depuis Paramètres → Portail client ; elle s'applique à toute l'interface en temps réel via `document.documentElement.style.setProperty`.
