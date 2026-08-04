# Hub "Membres" + unification Groupe/Client — Design

## Contexte

Ce chantier prolonge celui du client optionnel sur un projet (livré le 2026-08-03). Le problème de départ : `project_client_access` accorde déjà l'accès par contact et par projet, mais deux mécanismes de propagation automatique donnent l'illusion d'un système plus complexe qu'il ne l'est vraiment — `syncNewProjectAcrossClientContacts` ajoute automatiquement tous les contacts d'un client à chaque nouveau projet de ce client, et `syncClientContactAcrossProjects` ajoute automatiquement un nouveau contact à tous les projets existants du client. Retirer ces deux propagations est l'objectif central du chantier.

En creusant ce sujet, un deuxième problème est ressorti : la gestion des personnes est dispersée dans l'app — l'équipe interne du studio se gère depuis Paramètres, les contacts d'un client depuis sa fiche, et l'assignation à un projet depuis l'écran du projet. Ce chantier règle les deux en même temps.

## Décision centrale : Groupe = Client, même donnée

Après plusieurs itérations, la décision retenue est la plus simple possible : **un "Groupe" n'est pas une nouvelle entité en base de données — c'est un nouveau nom et une nouvelle porte d'entrée pour ce qui est déjà la table `clients`.** Aucune nouvelle table, aucune fusion de schéma à faire : Finances, le portail client, et les règles de sécurité RLS auditées le 2026-08-03 continuent de fonctionner exactement comme avant, parce que rien ne change en dessous.

Ce qui change, uniquement :
1. Un nouveau point d'entrée unifié, la page **Membres**, avec deux onglets : **Individus** et **Groupes**.
2. La création d'un groupe (= client) devient plus légère — secteur/ville/etc. redeviennent optionnels, un groupe minimal ne demande qu'un nom.
3. Une vue détaillée pour un **individu**, symétrique à celle qui existe déjà pour un client (aujourd'hui `FicheClient.tsx`) — projets assignés, calendrier agrégé, fichiers, finances, activité — mais scopée à cette seule personne plutôt qu'à un groupe.
4. Retrait des deux propagations automatiques ci-dessus.

## Page "Membres" (`/membres`)

Nouvel élément de navigation de premier niveau, au même titre que Projets/Clients/Calendrier.

### Onglet Individus

Liste unifiée de toutes les personnes du studio, internes (`studio_members`) et externes (`client_contacts`, toutes entités confondues), avec :
- Une colonne Type (Interne / Contact externe) et, pour un contact externe, le groupe (client) auquel il appartient.
- Un filtre Tous / Interne / Externe.
- Gestion complète directement depuis cette page : inviter (réutilise les fonctions d'invitation déjà existantes — `teamStore.createInvitation` pour l'interne, `invitationStore.sendClientInvitationEmail` pour l'externe, aucune nouvelle logique d'invitation), modifier, retirer.
- Créer un nouveau contact externe depuis ici demande de choisir à quel groupe (client) il appartient — obligatoire, comme aujourd'hui.
- Cliquer sur une personne ouvre sa **vue détaillée** (voir plus bas).

### Onglet Groupes

Liste de tous les groupes (= tous les clients actuels, sans distinction — un "client" créé avant ce chantier et un "groupe" créé après sont la même chose). Cliquer sur un groupe ouvre la **même vue détaillée qu'aujourd'hui `FicheClient.tsx`** — rien de nouveau à construire ici, seulement un nouveau chemin de navigation vers l'écran existant.

Créer un nouveau groupe utilise le même formulaire que "Nouveau client" aujourd'hui, mais avec secteur/ville rendus optionnels — un groupe minimal ne demande qu'un nom.

## Vue détaillée d'un individu (nouveau)

Miroir de la fiche groupe/client, scopée à une seule personne : les projets où cette personne est membre (interne) ou a un accès (`project_client_access`, externe), un calendrier agrégeant les événements de ces projets, les fichiers, les finances (si pertinent — un contact externe voit les factures des projets auxquels il a accès ; un membre interne voit celles des projets où il est assigné), l'activité récente liée à ces mêmes projets.

## Paramètres → Équipe

L'onglet "Équipe" actuel dans Paramètres redirige vers `/membres` (onglet Individus, filtre Interne) plutôt que de garder une interface de gestion séparée — sinon on recrée la dispersion que ce chantier règle.

## Navigation "Clients" existante

La route `/clients` et `/clients/:id` (fiche client) restent fonctionnelles telles quelles — rien ne casse pour les liens déjà en place ailleurs dans l'app (fil d'Ariane des projets, etc.). L'élément de navigation "Clients" dans la barre latérale est retiré, son contenu étant maintenant accessible via Membres → Groupes (même écran, nouveau chemin d'accès — pas de duplication).

## Assignation à un projet (onglet Équipe d'un projet)

- On peut ajouter des **individus** et des **groupes** simultanément à un même projet.
- Ajouter un groupe ajoute chacun de ses membres actuels au projet, exactement comme s'ils avaient été ajoutés un par un (membres internes → `project.members`, contacts externes → `project_client_access`, via les mécanismes déjà existants).
- **Ce n'est pas un lien vivant** : modifier le groupe plus tard (ajout/retrait d'une personne) ne touche pas rétroactivement les projets où il a déjà été assigné. Chaque assignation est un geste explicite, figé au moment où il est posé — c'est le principe central de ce chantier.
- La liste des personnes ayant accès à un projet affiche clairement la provenance de chacune ("via le groupe X" ou "ajouté directement"), pour éviter toute confusion sur qui vient d'où.

## Retrait de la propagation automatique

- `syncNewProjectAcrossClientContacts` (ajout automatique de tous les contacts d'un client à chaque nouveau projet) est retiré.
- `syncClientContactAcrossProjects` (ajout automatique d'un nouveau contact à tous les projets existants du client) est retiré.
- Toute assignation devient un geste explicite : personne par personne, ou via un groupe (bulk, mais toujours déclenché manuellement).

## Sécurité des données / migration

Aucune nouvelle table, aucune donnée déplacée ou supprimée :
- `clients` reste la même table, juste accessible sous un nouveau nom ("Groupe") depuis un nouveau chemin.
- `client_contacts` et `studio_members` restent les mêmes tables, juste listées ensemble dans l'onglet Individus.
- Les lignes déjà existantes dans `project_client_access` (accordées historiquement par la propagation automatique) ne sont **pas** retirées rétroactivement — seule la propagation future s'arrête. Un accès déjà accordé reste accordé tant que personne ne le retire explicitement.
- Le seul changement de validation : les champs secteur/ville deviennent optionnels à la création d'un client/groupe (déjà probablement optionnels en base — à confirmer lors du plan d'implémentation ; si NOT NULL, une migration légère les rend nullable).

## Hors scope

- Fusionner réellement Client et Groupe en une seule table/type de données — explicitement rejeté : le renommage/la nouvelle porte d'entrée suffit, sans le risque de reconstruire Finances/portail/RLS.
- Modifier le fonctionnement du portail client ou de la facturation — aucun changement ici.
