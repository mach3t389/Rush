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
  /projets/:projectId/ressources     → Ressources
  /projets/:projectId/ressources/:resourceId → ResourceRouter → (VideoReview | ImageReview | DocumentReview | WebReview | ResourceDetail)
  /projets/:projectId/calendrier     → ProjetCalendrier
  /projets/:projectId/membres        → ProjectMembres
  /clients                   → Clients
  /clients/:clientId         → FicheClient
  /calendrier                → CalendrierGlobal
  /modeles                   → Modeles
  /notifications             → Notifications
  /parametres                → Parametres
  /activite                  → Activite
```

`ResourceRouter` lit le `type` de la ressource et dispatch vers le bon composant de revue.

### Couche données (`app/src/data/`)

**Pattern commun à tous les stores :**
- Les données de seed viennent de `mock.ts` et ne sont jamais modifiées.
- Les données ajoutées par l'utilisateur sont stockées séparément via `persist.ts` (`localStorage`).
- Chaque store expose `get*()`, `add*()`, `subscribe*(fn)` → retourne un unsubscribe.
- La réactivité est manuelle : les composants s'abonnent dans un `useEffect` et appellent `setState` dans le callback.

```
persist.ts          → loadPersisted<T>(key, fallback) / savePersisted(key, value)
mock.ts             → PROJECTS, CLIENTS, USERS, MY_TASKS, … (données de seed statiques)
projectStore.ts     → getProjects / addProject / subscribeProjects
eventStore.ts       → getEvents / addEvent / subscribeEvents
resourceStore.ts    → getResources / addResource / subscribeResources
taskStore.ts        → store de tâches par projet
clientStore.ts      → store clients
status.ts           → utilitaires de mapping Status → couleur/label
```

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

---

## Conventions

- Tous les styles sont en `style={}` inline ou via tokens CSS. Tailwind n'est utilisé que marginalement.
- Pas de state management global (pas de Redux/Zustand) — les stores sont des modules singleton avec abonnement manuel.
- Les écrans sont de larges fichiers `.tsx` autonomes — c'est intentionnel pour cette phase du projet.
- Le portail client (`/portail/:projectId`) est une route standalone sans `AppShell` ni sidebar.
- La couleur accent (`--accent`) peut être personnalisée par l'utilisateur depuis Paramètres → Portail client ; elle s'applique à toute l'interface en temps réel via `document.documentElement.style.setProperty`.
