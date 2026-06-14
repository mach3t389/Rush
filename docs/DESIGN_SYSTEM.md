# Design System — Plateforme de gestion de production créative
## Basé sur StudioFlow · Version 1.0

---

## Introduction

Ce document est la référence unique du design system. Il doit être fourni comme contexte à Claude Design lors de la création de maquettes, et à Claude Code lors du développement de composants. Toute décision visuelle non couverte ici doit s'aligner sur les principes fondateurs définis dans la section 1.

---

## 1. Principes fondateurs

**Thème principal : Sombre cinématographique**
L'interface est conçue autour d'un thème sombre dont la chaleur est délibérément neutre-chaude (noir légèrement teinté, pas froid ou bleu). C'est un espace de travail professionnel, dense, proche des outils de post-production vidéo (DaVinci Resolve, Adobe Premiere). Le thème clair est réservé aux impressions (Call Sheet) et à l'accessibilité.

**Accent unique et signature : Jaune électrique `#F9FF00`**
C'est la couleur de marque. Elle est utilisée avec parcimonie — uniquement pour les actions primaires, les éléments actifs, et le logo. Sa rareté lui donne son impact. Elle ne se mélange pas à d'autres couleurs vives.

**Typographie à deux voix**
`Montserrat` pour tout ce qui est lisible (titres, corps, labels). `IBM Plex Mono` pour tout ce qui est technique, structurel, ou de statut (badges, eyebrows, codes). Cette dualité crée un contraste intentionnel entre l'humain et le système.

**Densité contrôlée**
L'interface est dense mais jamais étouffante. La densité est gérée par les couches de surfaces (4 niveaux) et les bordures semi-transparentes, pas par des espacements excessifs. L'objectif est de montrer le maximum d'information sans surcharge cognitive.

---

## 2. Tokens de couleur

### 2.1 Thème sombre (défaut)

```css
:root {
  /* Surfaces — neutres légèrement chauds */
  --bg:        #0c0c0b;   /* Fond de page */
  --surface:   #141413;   /* Cartes, sidebar */
  --surface-2: #1b1b19;   /* Éléments interactifs au repos */
  --surface-3: #232320;   /* Hover, états actifs légers */

  /* Bordures */
  --border:    rgba(255,255,255,0.09);   /* Bordure principale */
  --border-2:  rgba(255,255,255,0.16);   /* Bordure emphase / focus */

  /* Texte */
  --text:      #f3f3ee;   /* Texte principal */
  --text-2:    #aeaea6;   /* Texte secondaire, labels */
  --text-3:    #74746c;   /* Texte désactivé, placeholders */

  /* Accent marque */
  --accent:     #f9ff00;  /* Jaune signature — actions primaires */
  --accent-dim: #c9cf18;  /* Accent au survol / moins saturé */
  --on-accent:  #14140a;  /* Texte sur fond accent (noir chaud) */

  /* Statuts sémantiques (chroma homogène oklch) */
  --ok:     oklch(0.78 0.15 150);   /* Validé · vert */
  --warn:   oklch(0.80 0.15 75);    /* En attente · ambre */
  --info:   oklch(0.74 0.13 240);   /* Information · bleu */
  --danger: oklch(0.68 0.18 25);    /* Retard / erreur · rouge */
  --review: oklch(0.72 0.15 310);   /* En révision · mauve */
}
```

### 2.2 Thème clair (impression / accessibilité)

```css
@media print {
  :root {
    --bg:        #ffffff;
    --surface:   #ffffff;
    --surface-2: #f5f5f5;
    --surface-3: #ebebeb;
    --text:      #111111;
    --text-2:    #444444;
    --text-3:    #888888;
    --border:    #dddddd;
    --border-2:  #bbbbbb;
    --accent:    #111111;
    --on-accent: #ffffff;
    --ok:        #1a6b38;
    --warn:      #7a5500;
    --danger:    #b02020;
    --info:      #1a4f8a;
  }
}
```

### 2.3 Correspondances statuts → classes CSS

| Statut | Variable | Classe pill |
|--------|----------|-------------|
| Complété / Validé | `--ok` | `.st-ok` |
| En attente | `--warn` | `.st-warn` |
| Information | `--info` | `.st-info` |
| En retard / Danger | `--danger` | `.st-danger` |
| En révision | `--review` | `.st-review` |
| Accent marque | `--accent` | `.st-accent` |

---

## 3. Typographie

### 3.1 Familles de police

```css
--ff-display: 'Montserrat', system-ui, sans-serif;
--ff-text:    'Montserrat', system-ui, sans-serif;
--ff-mono:    'IBM Plex Mono', ui-monospace, monospace;
```

**Montserrat** — Police principale. Utilisée pour tous les titres, corps de texte, labels, boutons. Chargée en weights 200, 300, 400, 700.

**IBM Plex Mono** — Police technique. Utilisée exclusivement pour les badges de statut, eyebrows, codes, timestamps, numéros de version. Chargée en weights 400, 500, 600.

### 3.2 Styles typographiques définis

| Classe | Police | Taille | Poids | Tracking | Usage |
|--------|--------|--------|-------|----------|-------|
| `.sf-display` | Montserrat | hérité | 900 | -0.02em | Grands titres de section |
| `.sf-display-mid` | Montserrat | hérité | 700 | -0.01em | Titres moyens |
| `.sf-mono` | IBM Plex Mono | 11px | hérité | +0.06em | Labels techniques, codes |
| `.sf-eyebrow` | IBM Plex Mono | 10.5px | hérité | +0.18em | Catégories au-dessus des titres |

### 3.3 Règles d'usage

- Les **eyebrows** sont toujours en `IBM Plex Mono`, capitales, couleur `var(--text-3)`, tracking 0.18em.
- Les **numéros de version** (V1, V2, V3) sont en `IBM Plex Mono`.
- Les **timestamps** et durées sont en `IBM Plex Mono`.
- Le **corps de texte** standard est 14px / Montserrat 400.
- Les **labels de navigation** sont 13px / Montserrat 500.
- Les **titres de carte** sont 14–15px / Montserrat 600.

---

## 4. Espacement et géométrie

### 4.1 Rayons de bordure

```css
--radius:    14px;   /* Cartes standard */
--radius-sm:  9px;   /* Boutons, badges, éléments petits */
--radius-lg: 20px;   /* Modales, panneaux larges */
```

Rayon `999px` pour les pills, avatars, et tout élément circulaire.

### 4.2 Ombres

```css
--shadow: 0 1px 0 rgba(255,255,255,0.04) inset,
          0 18px 40px -24px rgba(0,0,0,0.8);
```

L'ombre intérieure supérieure simule un reflet de lumière légère sur le bord de la carte. L'ombre extérieure est grande et douce, jamais sèche.

### 4.3 Grille d'espacement

L'espacement suit une grille de 4px avec des increments standard :

| Valeur | Usage |
|--------|-------|
| 4px | Gap minimal entre éléments inline |
| 8px | Padding interne compact (boutons sm, pills) |
| 12px | Padding standard (boutons, inputs) |
| 16px | Espacement entre éléments dans une section |
| 24px | Séparation de sections |
| 32px | Marges de contenu principal |
| 48px | Espacement de layout |

---

## 5. Composants

### 5.1 Boutons

```css
/* Bouton par défaut */
.sf-btn {
  font-family: var(--ff-text);
  font-weight: 600;
  font-size: 13px;
  border-radius: 10px;
  padding: 9px 15px;
  border: 1px solid var(--border-2);
  background: var(--surface-2);
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 8px;
}
.sf-btn:hover {
  background: var(--surface-3);
  border-color: rgba(255,255,255,0.26);
}

/* Bouton primaire */
.sf-btn-primary {
  background: var(--accent);
  color: var(--on-accent);
  border-color: var(--accent);
  font-weight: 700;
}
.sf-btn-primary:hover { background: #ffffff; border-color: #ffffff; }

/* Bouton fantôme */
.sf-btn-ghost {
  background: transparent;
  border-color: transparent;
  color: var(--text-2);
}
.sf-btn-ghost:hover { background: var(--surface-2); color: var(--text); }

/* Bouton petit */
.sf-btn-sm { padding: 6px 11px; font-size: 12px; }
```

**Règle d'usage** : Un seul bouton primaire (accent jaune) par zone d'action. Tous les autres sont `.sf-btn` ou `.sf-btn-ghost`. Le bouton primaire est réservé à l'action principale de création ou de validation.

### 5.2 Cartes

```css
.sf-card {
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: var(--radius);
}
```

Les cartes ne doivent jamais avoir de box-shadow par défaut. L'élévation est communiquée par la couleur de surface (`--surface` → `--surface-2` → `--surface-3`), pas par les ombres. L'ombre (`--shadow`) est utilisée uniquement pour les modales et les éléments flottants.

### 5.3 Badges de statut (Pills)

```css
.sf-pill {
  font-family: var(--ff-mono);
  font-size: 10px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  padding: 3px 8px;
  border-radius: 999px;
  border: 1px solid var(--border-2);
  color: var(--text-2);
  display: inline-flex;
  align-items: center;
  gap: 5px;
}

.sf-dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; }
```

Combiné avec les classes de statut :
```html
<span class="sf-pill st-ok"><i class="sf-dot"></i>Complété</span>
<span class="sf-pill st-warn"><i class="sf-dot"></i>En attente</span>
<span class="sf-pill st-danger"><i class="sf-dot"></i>En retard</span>
<span class="sf-pill st-review"><i class="sf-dot"></i>En révision</span>
<span class="sf-pill st-info"><i class="sf-dot"></i>En cours</span>
```

### 5.4 Avatars

```css
.sf-av {
  width: 30px;
  height: 30px;
  border-radius: 999px;
  display: grid;
  place-items: center;
  font-family: var(--ff-mono);
  font-size: 11px;
  font-weight: 600;
  color: var(--text);
  border: 1px solid var(--border-2);
  flex: none;
}
```

Les avatars utilisent les initiales en `IBM Plex Mono`. Ils peuvent recevoir une couleur de fond personnalisée (pour différencier les membres de l'équipe).

### 5.5 Barre de progression

```css
.sf-bar { height: 5px; border-radius: 999px; background: var(--surface-3); overflow: hidden; }
.sf-bar > i { display: block; height: 100%; border-radius: 999px; background: var(--accent); }
```

```html
<div class="sf-bar"><i style="width: 65%"></i></div>
```

### 5.6 Logo

```css
.sf-logo {
  font-family: var(--ff-display);
  font-weight: 900;
  letter-spacing: -0.02em;
}
.sf-logo .sf-logo-sq {
  display: inline-grid;
  place-items: center;
  width: 26px;
  height: 26px;
  border-radius: 7px;
  background: var(--accent);
  color: var(--on-accent);
  font-size: 17px;
  font-weight: 900;
}
```

### 5.7 Placeholder vidéo (rayé)

Utilisé pour les ressources vidéo non encore uploadées.

```css
.sf-ph {
  position: relative;
  background:
    repeating-linear-gradient(135deg,
      rgba(255,255,255,0.045) 0 2px,
      transparent 2px 11px),
    var(--surface-2);
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  overflow: hidden;
  display: grid;
  place-items: center;
}
.sf-ph .sf-ph-label {
  font-family: var(--ff-mono);
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--text-3);
  background: rgba(0,0,0,0.35);
  padding: 3px 8px;
  border-radius: 6px;
}
```

### 5.8 Séparateur

```css
.sf-hr { height: 1px; background: var(--border); border: 0; margin: 0; }
```

### 5.9 Scrollbar personnalisée

```css
.sf-root *::-webkit-scrollbar { width: 8px; height: 8px; }
.sf-root *::-webkit-scrollbar-thumb {
  background: var(--border-2);
  border-radius: 8px;
}
```

---

## 6. Layout

### 6.1 Structure générale

```
┌─────────────────────────────────────────────┐
│ sf-root (background: --bg)                  │
│  ┌──────┐  ┌────────────────────────────┐   │
│  │      │  │ Main content               │   │
│  │ Side │  │  ┌──────────────────────┐  │   │
│  │ bar  │  │  │ Top bar              │  │   │
│  │      │  │  └──────────────────────┘  │   │
│  │      │  │  ┌──────────────────────┐  │   │
│  │      │  │  │ Content area         │  │   │
│  │      │  │  └──────────────────────┘  │   │
│  └──────┘  └────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

### 6.2 Sidebar

- Fond : `var(--surface)` soit `#141413`
- Largeur : fixe, non redimensionnable
- Structure verticale : Logo → Navigation principale → Séparateur → Favoris → Projets récents
- Les éléments actifs utilisent `var(--surface-2)` comme fond et `var(--text)` pour le texte
- Les éléments inactifs utilisent `var(--text-2)` ou `var(--text-3)` pour le texte
- L'accent jaune `#f9ff00` est utilisé pour le logo et les indicateurs d'état importants (notifications non lues)

### 6.3 Topbar

- Fond : légèrement différent de la sidebar, `var(--surface)` ou transparent sur `--bg`
- Contient : breadcrumb ou titre de page, actions contextuelles, avatar utilisateur
- Hauteur fixe, toujours visible

### 6.4 Zone de contenu

- Fond : `var(--bg)` soit `#0c0c0b`
- Scrollable verticalement
- Padding interne : 24px–32px selon la densité de la vue

---

## 7. Navigation — Éléments de la sidebar

```
Sidebar
│
├── Logo (accent jaune)
│
├── Mes tâches
├── Favoris (projets épinglés)
│   ├── Projet A
│   └── Projet B
│
├── [Séparateur]
│
├── Clients
│   ├── Client A
│   └── Client B
│
├── Projets récents
│
├── Équipes
│
├── Calendrier
│
├── Notifications (badge compteur)
│
└── Paramètres
```

---

## 8. Vues principales — Structure attendue

### 8.1 Vue Travail (Projet)

```
Top : Phase Stepper (Préproduction | Production | Postproduction | Livraison)
Corps :
  ├── Section "Préproduction" (repliable)
  │   ├── Tâche (titre, assigné, statut, priorité, dates)
  │   └── Tâche
  │       └── Sous-tâche (indentée)
  ├── Section "Production" (repliable)
  └── Section "Postproduction" (repliable)
```

### 8.2 Vue Ressources (Projet)

```
Corps :
  ├── [Bouton : Nouvelle ressource]
  ├── Carte Script (versions, statut, dernière modif)
  ├── Carte Document
  ├── Carte Moodboard
  ├── Carte Vidéo Review
  └── Carte Inspiration
```

### 8.3 Module Vidéo Review

```
┌─────────────────────────────────────────────┐
│ Player vidéo (16:9)                          │
│ Timeline avec marqueurs de commentaires      │
├─────────────────────────────────────────────┤
│ Onglets : Commentaires | Corrections         │
├─────────────────────────────────────────────┤
│ Liste commentaires (timestamp + texte)       │
│ ou Liste corrections (statut + label)        │
└─────────────────────────────────────────────┘
```

### 8.4 Mes tâches

```
Filtres : Aujourd'hui | Cette semaine | En retard | En cours | Complétées
Corps :
  ├── Groupe : Urgente
  │   └── Tâche (+ badge projet)
  ├── Groupe : Élevée
  └── Groupe : Normale
```

### 8.5 Portail client

```
Structure simplifiée (pas de sidebar interne)
├── Header : Logo + nom du studio
├── Ressources partagées
│   └── Vidéo / Document avec statut
└── Corrections demandées (liste avec statut temps réel)
```

---

## 9. Icônes

Le système utilise `SFIcon` — un composant d'icônes basé sur les icônes Lucide (stroke-based, 18px par défaut, stroke 1.6).

```jsx
<SFIcon name="play" size={18} stroke={1.6} color="var(--text-2)" />
```

Icônes clés utilisées dans l'interface :
- Navigation : `home`, `list-checks`, `star`, `users`, `calendar`, `bell`, `settings`
- Actions : `plus`, `upload`, `download`, `edit`, `trash`, `copy`, `link`
- Statuts : `check`, `clock`, `alert-triangle`, `x`, `eye`
- Contenu : `film`, `file-text`, `image`, `grid`, `code`
- Révision : `message-circle`, `thumbs-up`, `thumbs-down`

---

## 10. Patterns d'interaction

### 10.1 États des éléments interactifs

| État | Traitement |
|------|------------|
| Repos | `var(--surface-2)`, `var(--text-2)` |
| Survol (hover) | `var(--surface-3)`, `var(--text)` |
| Actif / Sélectionné | `var(--surface-3)` + bordure gauche `var(--accent)` ou fond accent |
| Focus | `border-color: var(--border-2)` + outline |
| Désactivé | opacité 0.4, `cursor: not-allowed` |

### 10.2 Transitions

Toutes les transitions sont courtes et fonctionnelles :
```css
transition: all 0.15s ease;
```

Pas d'animations décoratives. Les transitions servent uniquement à indiquer le changement d'état.

### 10.3 Scrollbars

Les scrollbars personnalisées (8px, thumb `var(--border-2)`, radius 8px) s'appliquent à tous les éléments scrollables. Elles ne sont jamais masquées sur desktop.

---

## 11. Composants de données — Tableaux et listes

### 11.1 Ligne de tâche

Structure minimale d'une ligne de tâche dans la vue Travail :
```
[checkbox] [titre] ........................... [assigné] [statut] [priorité] [date]
```

- Fond : transparent au repos, `var(--surface-2)` au survol
- Bordure inférieure : `1px solid var(--border)` (séparateur)
- Sous-tâches : indentation gauche de 24px, même structure

### 11.2 Carte de ressource

```
┌─────────────────────────────┐
│ [eyebrow : type en mono]    │
│ Titre de la ressource       │
│ ─────────────────────────── │
│ V3 · [pill statut] · Modif  │
│ [barre de progression]      │
└─────────────────────────────┘
```

---

## 12. Règles d'accessibilité

- Contraste minimum : 4.5:1 pour le texte corps sur les fonds correspondants.
- L'accent jaune `#f9ff00` sur `#14140a` (on-accent) satisfait le contraste WCAG AA.
- Les pills de statut utilisent toujours un point coloré **en plus** de la couleur du texte (ne pas se fier uniquement à la couleur).
- Les actions destructives (suppression) sont toujours en `var(--danger)` et nécessitent une confirmation.

---

## 13. Anti-patterns à éviter

Ces patterns sont explicitement **interdits** dans le design system :

❌ Utiliser l'accent jaune `#f9ff00` pour plus d'un élément par zone d'action  
❌ Ajouter des box-shadows sur les cartes (hormis modales/flottants)  
❌ Utiliser des animations décoratives ou des transitions > 300ms  
❌ Mélanger `IBM Plex Mono` avec du corps de texte (réservé aux éléments techniques)  
❌ Utiliser des couleurs vives autres que `--accent` et les couleurs de statut  
❌ Utiliser un fond blanc ou clair dans les vues principales (sauf impression)  
❌ Créer des niveaux de surface au-delà de `--surface-3`  
❌ Afficher des scrollbars invisibles (toujours visibles avec le style personnalisé)

---

## 14. Variables CSS — Récapitulatif complet

```css
:root {
  /* Surfaces */
  --bg:        #0c0c0b;
  --surface:   #141413;
  --surface-2: #1b1b19;
  --surface-3: #232320;

  /* Bordures */
  --border:    rgba(255,255,255,0.09);
  --border-2:  rgba(255,255,255,0.16);

  /* Texte */
  --text:      #f3f3ee;
  --text-2:    #aeaea6;
  --text-3:    #74746c;

  /* Accent */
  --accent:     #f9ff00;
  --accent-dim: #c9cf18;
  --on-accent:  #14140a;

  /* Statuts */
  --ok:     oklch(0.78 0.15 150);
  --warn:   oklch(0.80 0.15 75);
  --info:   oklch(0.74 0.13 240);
  --danger: oklch(0.68 0.18 25);
  --review: oklch(0.72 0.15 310);

  /* Géométrie */
  --radius:    14px;
  --radius-sm:  9px;
  --radius-lg: 20px;

  /* Ombre */
  --shadow: 0 1px 0 rgba(255,255,255,0.04) inset,
            0 18px 40px -24px rgba(0,0,0,0.8);

  /* Typographie */
  --ff-display: 'Montserrat', system-ui, sans-serif;
  --ff-text:    'Montserrat', system-ui, sans-serif;
  --ff-mono:    'IBM Plex Mono', ui-monospace, monospace;
}
```

---

## 15. Composants identifiés dans StudioFlow

Ces composants existent dans le prototype et doivent être réutilisés ou recréés fidèlement :

| Composant | Description |
|-----------|-------------|
| `PhaseStepper` | Stepper horizontal des phases de projet |
| `SFPill` | Badge de statut avec point coloré |
| `SFIcon` | Icônes Lucide enveloppées |
| `ApprovalRequestModal` | Modale de demande d'approbation client |
| `NewVersionModal` | Modale d'upload de nouvelle version |
| `SendToClientModal` | Modale d'envoi au portail client |
| `VersionStatusBadge` | Badge de statut de version (draft / approved / rejected) |
| `VersionCard` | Carte d'une version de ressource |
| `VideoUnifiedBlock` | Bloc vidéo avec player et commentaires |
| `VideoVersionsPage` | Page de gestion des versions vidéo |
| `MoodboardCanvas` | Canvas libre pour le moodboard |
| `DocsEditor` | Éditeur de document simple |
| `InspirationsPanel` | Panneau de références/inspirations |
| `MiniCalendar` | Mini-calendrier dans les vues projet |
| `ProjectDetail` | Shell de la vue projet (4 phases) |
| `ScreenTasks` | Vue Mes tâches (groupée par priorité) |
| `ScreenPortal` | Portail client |
| `ScreenActivity` | Fil d'activité |
| `TweaksPanel` | Panneau de configuration des composants |

---

*Design System v1.0 — Extrait et documenté depuis StudioFlow Prototype*  
*À utiliser comme référence pour Claude Design (maquettes) et Claude Code (développement)*
