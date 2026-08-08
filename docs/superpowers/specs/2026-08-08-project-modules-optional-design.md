# Modules de projet optionnels (Calendrier / Fichiers / Finance) — Design

**Date :** 2026-08-08
**Statut :** approuvé par l'utilisateur, prêt pour plan d'implémentation

## Contexte

Chaque projet a déjà 3 booléens (`calendarEnabled`, `filesEnabled`, `financeEnabled`) qui contrôlent quels onglets apparaissent dans `ProjectHeaderBar.tsx`. Le mécanisme fonctionne au niveau code, mais :

1. Le sélecteur de modules (case à cocher) dans `ProjectEditPanel` (`ProjectCard.tsx`) et dans l'assistant de création (`ProjectsListView.tsx`) ne montre presque aucune différence visuelle entre coché/non coché (même bordure, même fond dans les deux cas), contrairement aux pastilles de Statut juste au-dessus dans le même modal qui, elles, ont un vrai état sélectionné (bordure accent + fond teinté).
2. Le module Finance est verrouillé tant que le projet n'a pas de `clientId` — mais l'utilisateur veut pouvoir facturer des projets sans client (subventions, financement interne).
3. Le formulaire de facture (`InvoiceFormPanel` dans `Finances.tsx`) exige un client de toute façon (`disabled={!title.trim() || !clientId || !amount}`) — donc même en retirant la contrainte au niveau du projet, il faudrait aussi rendre le client optionnel sur la facture elle-même pour que ce soit utilisable.
4. Désactiver un module qui contient déjà des données (ex. Fichiers avec des fichiers dedans) ne prévient pas l'utilisateur — le module se masque silencieusement.

## Comportement actuel confirmé (ne change pas)

- `calendarEnabled`/`filesEnabled`/`financeEnabled` sont des colonnes sur `projects`, indépendantes de toute autre table. Désactiver un module ne supprime **aucune** donnée — il masque seulement l'onglet.
- Désactiver Calendrier masque aussi les événements du projet dans la Vue globale des calendriers (`CalendrierGlobal.tsx:807`) — pas seulement l'onglet du projet. Comportement volontairement conservé.
- L'activation d'un Google Calendar par projet (`google-calendar-project.ts`, `googleCalendarStore.ts`) est un geste séparé et explicite (bouton "Activer" dans l'onglet Calendrier), jamais automatique à la création du projet ni lié à `calendarEnabled`. Aucun changement ici — le module Rush et le Google Calendar du projet restent deux choses distinctes.
- Réactiver un module fait réapparaître ses données intactes (rien n'est jamais supprimé par la désactivation).

## Changements

### 1. Style visuel unifié du sélecteur de modules

- Créer un composant partagé (ex. `ModuleToggleList` dans `app/src/components/ui/`) réutilisé par `ProjectEditPanel` (ProjectCard.tsx) et l'étape modules de l'assistant de création (ProjectsListView.tsx), qui dupliquent actuellement ce bloc avec des règles légèrement différentes (`disabled` vs `locked` pour Finance).
- État coché : bordure `var(--accent)` + fond `rgba(249,255,0,0.05)`, même traitement que les pastilles de Statut dans le même modal.
- État désactivé (verrouillé par plan) : garder l'opacité réduite + le message explicatif existant (`moduleFinanceRequiresPlan`).

### 2. Finance sans client

- Retirer `disabled: !p.clientId` sur le toggle Finance dans `ProjectEditPanel` et `disabled: isPersonalProject || (!clientId && !newClientName.trim())` (partie client) dans `ProjectsListView.tsx` — Finance reste seulement verrouillé par le plan (`canUseFeature(plan, 'finances')`), plus par la présence d'un client.
- `ProjectHeaderBar.tsx:69` : `if (tb.key === 'finance') return project.financeEnabled && !!project.clientId;` → devient `if (tb.key === 'finance') return project.financeEnabled;`
- `financeEnabled: lFinanceEnabled && !!p.clientId` (ProjectCard.tsx:118) → `financeEnabled: lFinanceEnabled`

### 3. Facture sans client

- `Invoice.clientId` (`financeStore.ts:86`) : `string` → `string | null`.
- Migration Supabase : rendre `invoices.client_id` nullable (nouveau fichier `docs/superpowers/specs/<date>-invoices-nullable-client-migration.sql`, à exécuter manuellement dans Supabase SQL Editor comme toute migration de ce projet — voir CLAUDE.md).
- `InvoiceFormPanel` (Finances.tsx) : le sélecteur Client reste affiché mais n'est plus obligatoire ; bouton Enregistrer n'exige plus `clientId`, seulement `title`/`amount`.
- Affichage : partout où le code lit `clientMap[inv.clientId]` (`Finances.tsx:1265,1500`, `ProjetFinances.tsx:115`), fallback vers le nom du projet ou un libellé "Interne" (nouvelle clé i18n `finance.noClientLabel`) quand `clientId` est vide.
- Filtrage/regroupement par client (listes, filtres) : une facture sans client tombe dans un groupe "Aucun client" — même convention que les autres buckets "Aucun X" de l'app (cf. mémoire terminologie déjà unifiée sur `tasks.noStatus`/`unassigned`/`noCategory`).

### 4. Confirmation avant désactivation d'un module avec données

- Au moment de décocher un module dans `ProjectEditPanel`/assistant, si le projet a du contenu dans ce module (événements pour Calendrier, fichiers pour Fichiers, factures pour Finance), afficher une confirmation légère (`confirmDialog`, déjà utilisé ailleurs dans l'app pour ce genre de garde-fou) avant d'appliquer le changement : *"Ce module contient des données ([N] éléments) — elles resteront enregistrées mais l'onglet disparaîtra. Continuer ?"*
- Si le module est vide, aucune confirmation — le toggle s'applique directement comme aujourd'hui.
- Nécessite de connaître le compte d'éléments par module pour le projet en cours d'édition au moment du clic (events count, files count, invoices count) — à récupérer via les stores existants (`eventStore`, `fileStore`, `financeStore`) filtrés par `projectId`.

## Hors scope

- Pas de changement au comportement de masquage de la Vue globale des calendriers (confirmé volontairement conservé).
- Pas de lien nouveau entre modules Rush et activation Google Calendar par projet.
- Pas d'audit plus large des autres champs optionnels/obligatoires de la facture au-delà du client.
