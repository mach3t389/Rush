# Modèle Client / Membre / Projet — conception

**Date :** 2026-08-04
**Statut :** approuvé par l'utilisateur après une longue session de brainstorming, en attente de relecture finale du document avant passage au plan d'implémentation.

## Contexte

Plusieurs chantiers menés aujourd'hui (renommage Client→Groupe, hub Membres, indépendance des projets vis-à-vis des clients) ont créé une incohérence de fond : le mot "Groupe" assumait à la fois le rôle de facturation, de portée d'accès, de cible de notification et d'étiquette d'affichage — quatre rôles différents selon l'écran. Un audit structurel complet (voir la conversation) a confirmé que le modèle de données sous-jacent (`Project.clientId` optionnel + `Project.members` séparé) est déjà correct ; c'est l'implémentation qui mélange les rôles.

**Principe directeur explicite de l'utilisateur : repartir le plus possible de l'interface qui existait AVANT les chantiers d'aujourd'hui** (`Clients.tsx`/`FicheClient.tsx`, qui fonctionnaient bien), pas de ce qui a été construit aujourd'hui (`Membres.tsx`, le hub Individus/Groupes). Le travail d'aujourd'hui n'est réutilisé que pour ses pièces détachées valables (voir plus bas).

## Vocabulaire final (verrouillé)

| Mot | Sens unique, partout |
|---|---|
| **Client** | L'entreprise facturée. Remplace "Groupe" dans tout le texte affiché. |
| **Contact** | Une personne côté client, avec accès au portail. Mot déjà établi avant les chantiers d'aujourd'hui — conservé tel quel plutôt que d'inventer "Membre client". |
| **Membre** | Une personne de l'équipe interne (studio). Jamais utilisé pour une personne côté client. |
| **Équipe** | L'organisation interne au complet (page de gestion des membres internes). Jamais utilisé pour un sous-ensemble (ex: la liste de participants d'un projet). |
| **Membres** (dans un projet) | L'onglet d'un projet montrant qui y a accès — mélange de Membres internes et de Contacts. Remplace l'actuel onglet "Équipe" du projet, qui collisionnait avec le sens ci-dessus. |

Corrections de texte identifiées en cours de route, à appliquer dans le même chantier :
- Le courriel/écran d'acceptation d'invitation client dit actuellement "vous rejoignez l'équipe de {{client}}" — à corriger (ex: "vous avez maintenant accès à l'espace de {{client}}") pour ne pas laisser croire qu'on rejoint l'équipe interne du studio.
- La page de tarifs mélange "utilisateur" et "membre" pour le même concept (nombre de sièges) — uniformiser sur "membre".

## Structure de navigation

Retour à trois éléments distincts dans le menu principal, à la place du hub "Membres" actuel :

- **Clients** — reprend `Clients.tsx` (liste) + `FicheClient.tsx` (fiche détaillée) tels qu'ils existaient avant aujourd'hui : mêmes informations, même apparence, mêmes onglets (Aperçu, Contacts, Projets, Finances, Fichiers).
- **Équipe** — reprend `MonEquipe.tsx` (la page, pas seulement sa fenêtre d'invitation) comme page routée pour gérer l'équipe interne : rôles, permissions, invitations. Reste son propre bouton de menu, pas caché dans Paramètres.
- **Paramètres** — inchangé, garde les vrais réglages (facturation, personnalisation, sécurité).

**Retiré :** `Membres.tsx` (le hub Individus/Groupes construit aujourd'hui) et sa page "Tous les membres" — jugée redondante une fois que Clients et Équipe ont chacun leur propre page claire, et que la recherche de membres à l'intérieur d'un projet couvre déjà le besoin de "chercher n'importe qui".

**Pièces réutilisées du travail d'aujourd'hui** (ce ne sont pas des pertes, juste pas la fondation) :
- Le sélecteur de membres avec recherche + ajout en bloc par client, construit dans `ProjectMembres.tsx`'s `AddMemberModal` — devient la base du nouveau sélecteur du wizard de création de projet (voir plus bas), au lieu d'être reconstruit.
- Le filtre par permission et l'application réelle des permissions en session normale (corrigés aujourd'hui, restent en place, aucun lien avec la structure de nav).
- Le correctif du compte de projets actifs figé (`Membres.tsx` — devient obsolète avec la suppression de ce fichier, mais le même correctif s'applique à `Clients.tsx` puisqu'il utilisait déjà la même logique corrigée).

## Modèle projet ↔ client ↔ membres

Aucun changement du modèle de données (`Project.clientId?`, `Project.members`) — il était déjà correct. Le travail porte sur l'interface et deux comportements.

### Le nouvel assistant de création de projet

Étape "Infos" — deux sections séparées, deux barres de recherche distinctes :

1. **Client** (optionnel) — sélection simple, un seul choix possible, comme avant. Peut rester vide (projet personnel/interne).
2. **Membres** — recherche et ajout individuel de n'importe qui (interne ou contact, peu importe le client). Dès qu'un client est choisi en (1), un bouton apparaît ici : **"Ajouter tous les contacts de [Client]"**, qui ajoute son carnet en bloc sans empêcher d'en retirer ou d'en ajouter d'autres ensuite.

### Bouton "Nouveau projet" sur la fiche client

Actuellement absent — c'est une régression par rapport à l'ancienne expérience où créer un projet depuis la fiche d'un client était direct. Ajouté sur `FicheClient.tsx`, pré-remplit automatiquement le champ Client de l'assistant.

### Filtre "Sans client" sur la page Projets

La liste globale des projets permet déjà de filtrer par client, mais n'a aucune option pour isoler les projets personnels/internes. Ajoutée.

### Changer ou retirer le client d'un projet

Ne modifie jamais automatiquement la liste des membres. Mais si des membres actuels du projet sont aussi des contacts du client qu'on retire/remplace, une confirmation apparaît au moment du changement :

> "Ce projet a {{n}} membres qui viennent du carnet de {{ancien client}}. Retirer leur accès maintenant que le client change ?"

Avec deux choix : les retirer, ou les garder (ex: un collaborateur externe qui continue peu importe qui facture). Ceci remplace le comportement actuel qui ne fait ni l'un ni l'autre silencieusement.

### Demandes d'approbation

`RequestApprovalButton.tsx` notifie actuellement *tous* les contacts du client du projet (`getClientExternalTeam(project.clientId)`), peu importe qui est réellement membre du projet — donc ajouter un seul contact notifie tout le carnet du client, et un projet sans client ne notifie personne silencieusement. Corrigé pour notifier uniquement les membres réels du projet (`project.members`), cohérent avec le reste du modèle et sans branche spéciale pour un projet sans client.

## Nettoyage inclus dans ce chantier

- Suppression de `Membres.tsx`, de sa route `/membres`, et des routes qui en dépendent uniquement (`/membres/individus/:id` si son contenu utile est absorbé par la fiche Équipe/Client appropriée — à confirmer en plan d'implémentation).
- Restauration de la route `/clients` et `/clients/:id` comme entrées principales (déjà existantes, juste reconnectées à la nav).
- Restauration d'une route pour `MonEquipe()` (ex: `/equipe`), reconnectée au menu.
- Fiche client : remplacer le flux d'activité inventé (`getClientActivities()`, données de démo codées en dur) par le vrai flux d'activité filtré par client.
- Aligner le comportement archiver/supprimer un client : actuellement archiver cascade-archive tous ses projets, alors que supprimer les détache sans les toucher (changé aujourd'hui). Recommandation par défaut : archiver ne devrait pas non plus toucher aux projets (même principe non destructif) — **à confirmer explicitement en revue du plan**, ce point n'a pas été retranché verbalement par l'utilisateur pendant le brainstorming.
- Suppression du code mort identifié par l'audit (fonctions/composants de `MonEquipe.tsx`/`Clients.tsx` qui n'avaient plus d'appelant à cause du hub, redeviennent utilisés ; celles qui restent réellement mortes après restauration sont retirées).
- Suppression des clés i18n orphelines correspondantes.

## Explicitement hors scope de ce chantier

- **Regroupement visuel des projets par client dans la vue globale Fichiers/Calendrier** — évoqué en cours de discussion, intéressant, mais pas retranché avec l'utilisateur comme faisant partie de ce chantier-ci. À reprendre séparément si voulu.
- Tout ce qui a été livré aujourd'hui sans lien avec ce sujet (Stripe en mode réel, migration RLS de sécurité, verrouillage par plan, corrections de bugs de logo/téléphone/etc.) — **intact, non touché**.

## Tests

Comme pour tout le reste du projet : Claude vérifie en mode démo et par revue de code ; les parcours nécessitant un vrai compte (accepter une invitation contact, voir l'effet réel du changement de client sur un vrai contact) restent à tester manuellement par l'utilisateur, ajoutés à `docs/tests-manuels.md` une fois le chantier livré.
