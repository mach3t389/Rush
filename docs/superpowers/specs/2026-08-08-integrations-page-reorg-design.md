# Réorganisation de la page Paramètres > Intégrations — Design

## Contexte

La page Intégrations (`Parametres.tsx`, section `integrations`) mélange aujourd'hui des intégrations actives (Northbook, Google Calendar), des cartes "bientôt disponible" génériques sans catégorie claire (Slack, Notion, Dropbox, Zapier), une section "Plugins" (Premiere Pro, DaVinci Resolve, empilés verticalement) et un encart "Clé API" entièrement factice (bouton désactivé, aucune vraie clé). L'ordre actuel place Northbook en premier, alors que ce n'est pas la plateforme la plus reconnue.

## Objectif

Regrouper les intégrations par catégorie, dans un ordre qui priorise les intégrations les plus reconnues, ajouter des cartes "bientôt disponible" pour des idées futures concrètes, et retirer les éléments purement factices qui n'ont aucune ambition à court terme.

## Structure finale (ordre des catégories)

1. **Calendrier**
   - Google Calendar — carte active existante (`GoogleCalendarCard`, inchangée)
   - "Outlook / Microsoft 365" — nouvelle carte "bientôt disponible"

2. **Fichiers & synchronisation**
   - Dropbox — carte "bientôt disponible" (déplacée depuis la grille générique actuelle)
   - "Rush Sync" (app de bureau, façon Google Drive — accès aux fichiers de l'organisation directement dans l'explorateur de fichiers local) — nouvelle carte "bientôt disponible"

3. **Montage vidéo (Plugins)**
   - Adobe Premiere Pro — carte existante (inchangée), mise **côte à côte** avec DaVinci Resolve (grille 2 colonnes au lieu d'un empilement vertical)
   - DaVinci Resolve — carte existante (inchangée)

4. **Comptabilité**
   - Northbook — carte active existante (`NorthbookIntegrationCard`, inchangée)

5. **Automatisation**
   - Zapier — carte "bientôt disponible" (déplacée depuis la grille générique actuelle)
   - "MCP (assistants IA externes)" — nouvelle carte "bientôt disponible" ; description : permettre à des assistants IA externes (Claude, etc.) de créer/modifier des tâches et d'interagir avec Rushflow directement

## Retiré

- **Slack** et **Notion** — cartes génériques sans ambition concrete à court terme, retirées entièrement (pas seulement masquées).
- **Encart "Clé API"** (bas de page) — entièrement factice (bouton "Copier" désactivé, aucune vraie clé générée). Retiré entièrement ; sera réintroduit uniquement le jour où une vraie API publique existe (prérequis probable pour la carte MCP ci-dessus).

## Détails d'implémentation

- Chaque catégorie a un titre de section, même style que le "Plugins" existant (`h2` + description courte), avec un séparateur visuel (`borderTop`) entre catégories, cohérent avec le style déjà utilisé pour la section Plugins actuelle.
- Les nouvelles cartes "bientôt disponible" réutilisent le style de carte existant (le composant/pattern déjà utilisé pour Slack/Notion/Dropbox/Zapier dans la grille actuelle : pastille couleur, nom, description, badge "BIENTÔT" à droite, `opacity: 0.5`).
- Dropbox et Zapier gardent leur couleur de marque actuelle (`#0061FF`, `#FF4A00`).
- Nouvelles cartes (Outlook, Rush Sync, MCP) : couleur de pastille à définir simplement (teintes neutres cohérentes avec le design system, ex. `var(--surface-3)` ou une teinte de marque si évidente — Outlook a une couleur de marque connue `#0078D4`).
- Aucun changement de comportement/logique pour les intégrations actives (Google Calendar, Northbook, Premiere Pro, DaVinci Resolve) — uniquement repositionnement visuel et regroupement.
- Nouvelles clés i18n requises dans `fr.json` et `en.json` (namespace `settings`) :
  - Titres de catégories : `integrationsCategoryCalendar`, `integrationsCategoryFiles`, `integrationsCategoryVideo` (réutilise `pluginsTitle`/`pluginsDesc` existants), `integrationsCategoryAccounting`, `integrationsCategoryAutomation`
  - Descriptions courtes de catégorie (une phrase chacune, même ton que `integrationsDesc` existant)
  - Nouvelles cartes : `integrationOutlookDesc`, `integrationRushSyncDesc`, `integrationMcpDesc`
  - Noms affichés ("Outlook / Microsoft 365", "Rush Sync", "MCP") peuvent être des chaînes en dur (ce sont des noms propres, comme "Slack"/"Notion" le sont déjà aujourd'hui) — seules les descriptions passent par `t()`.
- Suppression pure : bloc JSX de l'encart "Clé API" (lignes ~2500-2514 actuelles) et les entrées Slack/Notion du tableau de la grille générique — leurs clés i18n (`integrationSlackDesc`, `integrationNotionDesc`) deviennent orphelines, à retirer aussi de `fr.json`/`en.json`.
- Les clés i18n `apiKey`, `copy`, `howItConnects`, `howItConnectsDesc` deviennent orphelines si non utilisées ailleurs — vérifier avant suppression (recherche d'usage dans tout le repo, pas seulement ce fichier).

## Hors scope

- La construction réelle du serveur MCP (authentification, outils exposés, etc.) — chantier futur séparé, discuté mais non planifié ici.
- Toute vraie API publique / clé API fonctionnelle.
- L'intégration Outlook, Dropbox, Rush Sync et Zapier réelles — ce sont des cartes "bientôt disponible", aucune connexion fonctionnelle n'est construite dans ce chantier.
