# Archiver / supprimer un projet ou un client — Design

**Status:** Approuvé par l'utilisateur (2026-07-08).

## Contexte

En testant avec un vrai compte, l'utilisateur a remarqué qu'il n'y a aucune façon de supprimer un projet, ni un client. Confirmé par lecture du code : `projectStore.ts` et `clientStore.ts` n'exposent aucune fonction de suppression ou d'archivage. Deux morceaux d'interface existent déjà mais sont complètement déconnectés :
- `Clients.tsx` a un onglet de filtre "Archivés" (`c.status === 'neutral'`), mais rien dans l'interface ne permet réellement d'y faire passer un client.
- `FicheClient.tsx` a un état local `clientArchived`/`setClientArchived` et un menu `clientMenuOpen`/`clientMenuRef` — jamais initialisés depuis les vraies données du client, jamais reliés à un bouton ou un contenu de menu. Du code mort, entièrement déconnecté.

## Décision retenue avec l'utilisateur

Processus en deux étapes, comme pour les fichiers :
1. **Archiver** (réversible) — le projet ou le client disparaît des listes principales, mais reste accessible et récupérable dans une vue "Archivés".
2. **Supprimer définitivement** — accessible uniquement depuis un élément déjà archivé. Efface aussi toutes les données liées (comme supprimer un dossier dans Fichiers efface son contenu).

## Ce qui change dans les données (`archived`)

Un nouveau champ `archived: boolean` (défaut `false`) sur `projects` et sur `clients`. Pas de nouvelle table — un simple drapeau, cohérent avec le champ `state` déjà utilisé pour les dossiers/fichiers (`trashed`/`archived`), mais ici en booléen puisqu'il n'y a qu'un seul état intermédiaire (pas de "corbeille" séparée pour projets/clients — juste archivé ou non).

```sql
alter table projects add column archived boolean not null default false;
alter table clients  add column archived boolean not null default false;
```

Aucun changement de policy RLS nécessaire (le scoping par `studio_id` existant reste inchangé) ; pas de nouveau `grant` requis puisque `update`/`delete` sont déjà accordés sur ces tables.

## `projectStore.ts` et `clientStore.ts` — nouvelles fonctions

Même pattern dual démo/réel que `addProject`/`updateProject` déjà en place :

```ts
export function archiveProject(id: string): void {
  updateProject(id, { archived: true });
}
export function unarchiveProject(id: string): void {
  updateProject(id, { archived: false });
}
export function removeProject(id: string): void {
  // cascade — voir section suivante
  // puis, en démo : filtrer _added / retirer des overrides ; en réel : supabase.from('projects').delete().eq('id', id)
}
```

`getProjects()`/`getClients()` ne changent pas de comportement (ils continuent de tout retourner) — c'est aux écrans de filtrer sur `archived` pour les listes principales, exactement comme `Clients.tsx` filtre déjà sur `status`. Même chose côté `clientStore.ts` (`archiveClient`/`unarchiveClient`/`removeClient`).

## Suppression définitive — ce qui est effacé en cascade

**Supprimer un projet** efface, en plus de la ligne `projects` elle-même :
- Ses tâches et sections (`taskStore.ts` — tables `sections` et `tasks`, toutes deux filtrées par `project_id`).
- Ses fichiers et dossiers (`fileStore.ts` — tables `file_folders` et `file_items`, filtrées par `project_id`). Nouvelle fonction à ajouter, sur le modèle de `emptyTrash()` déjà présent dans ce fichier.
- Ses événements de calendrier (`eventStore.ts` — table `events`, filtrée par `project_id`). Nouvelle fonction à ajouter.
- Ses factures (`financeStore.ts` — `getInvoicesByProject(id)` puis `removeInvoice()` pour chacune, qui nettoie aussi le PDF associé).

**Supprimer un client** efface, en plus de la ligne `clients` elle-même :
- Tous ses projets — en appliquant la cascade ci-dessus à chacun.
- Ses fichiers et dossiers propres au client (pas rattachés à un projet précis) — table `file_folders`/`file_items` filtrées par `client_id`.
- Ses factures propres (sans projet) — `getInvoicesByClient(id)` puis `removeInvoice()`.
- Ses membres d'équipe côté client (`clientTeamStore.ts` — table `client_contacts`, filtrée par `client_id`). Nouvelle fonction à ajouter.

**Hors cascade, décision délibérée :** les ressources (`resourceStore.ts`) ne sont pas rattachées à un projet ou un client dans leur schéma actuel (elles sont seulement scopées par studio) — elles ne sont donc pas touchées par cette suppression. Un fichier supprimé qui pointait vers une ressource laisse la ressource orpheline (inaccessible depuis nulle part, mais pas activement effacée) ; risque jugé acceptable plutôt que de construire une logique de nettoyage croisé additionnelle pour un cas limite. "Mes tâches" (assignations personnelles) n'a pas besoin de nettoyage séparé : les tâches assignées y sont lues depuis la même table `tasks`, donc elles disparaissent automatiquement quand la tâche du projet est supprimée.

## Interface

**Projets** — le bouton "..." est ajouté dans `ProjectHeaderBar.tsx` (l'en-tête partagé par tous les onglets d'un projet — Tâches/Aperçu/Calendrier/Fichiers/Finance/Équipe/Activité), donc une seule modification couvre toutes les pages du projet. Menu : "Archiver le projet" (ou "Désarchiver" si déjà archivé) ; "Supprimer définitivement" visible seulement quand le projet est déjà archivé, avec confirmation inline (pattern déjà utilisé pour les factures : le bouton se change en "Confirmer ? Oui/Non").

`Projets.tsx` (liste) : les projets archivés sont exclus de la liste "Tous" par défaut, avec un nouvel onglet de filtre "Archivés" (même pattern que celui déjà existant dans `Clients.tsx`) pour les retrouver et y accéder (le clic ouvre normalement le projet, où le menu "..." permet de désarchiver ou supprimer).

**Clients** — le menu mort `clientMenuOpen`/`clientArchived` dans `FicheClient.tsx` est remplacé par un vrai bouton "..." à côté de "Modifier" dans l'en-tête du client, avec le même contenu de menu (Archiver/Désarchiver, Supprimer définitivement si déjà archivé). `Clients.tsx` : l'onglet "Archivés" déjà présent devient enfin fonctionnel (filtré sur le vrai champ `archived` plutôt que sur `status === 'neutral'`, qui n'a jamais été relié à rien).

## Hors scope

- Pas de "corbeille" intermédiaire pour projets/clients (contrairement aux fichiers) — directement archivé ↔ actif, puis suppression définitive.
- Pas de nettoyage des ressources orphelines (voir plus haut).
- Pas de changement au système de fichiers/dossiers lui-même au-delà de l'ajout d'une fonction de suppression en masse par `project_id`/`client_id`.

## Vérification

- Créer un projet de test avec une tâche, un fichier, un événement calendrier et une facture. L'archiver — il disparaît de la liste principale, reste visible dans "Archivés", son contenu est intact. Le désarchiver — il revient dans la liste principale sans rien perdre.
- Depuis "Archivés", supprimer définitivement ce même projet — confirmer que la tâche, le fichier, l'événement et la facture ont bien disparu (plus visibles nulle part dans l'application), et que le projet lui-même n'apparaît plus, même dans "Archivés".
- Même test pour un client avec un projet, une facture propre au client, et un membre d'équipe côté client.
- Confirmer qu'archiver un projet/client n'affecte pas les autres projets/clients du studio.
- Régression démo : les 3 comptes de démonstration ne sont pas affectés (nouvelles fonctions suivent le même pattern `isDemoSession()` que le reste du store).
- Vérification TypeScript/lint sans nouvelle régression par rapport à la référence actuelle (184 erreurs / 339 problèmes lint).
