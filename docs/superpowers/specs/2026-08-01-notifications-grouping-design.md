# Regroupement des notifications en-app — design

## Constat

Chaque commentaire (non-mention) crée aujourd'hui sa propre notification
individuelle. Si trois personnes commentent la même vidéo dans la même
heure, un observateur reçoit trois notifications distinctes plutôt qu'une
seule ligne résumant l'activité — c'est le bruit décrit par l'utilisateur
("je ne veux pas recevoir dix notifications"). Ce chantier corrige ça pour
le canal **en-app** uniquement ; le regroupement des courriels est traité
séparément par le chantier 3 (récap quotidien), pas dupliqué ici.

## Design retenu

### Mécanique : mise à jour d'une notification existante, pas de fenêtre de temps

Plutôt qu'un système basé sur une fenêtre de temps (regrouper tout ce qui
arrive en X minutes — nécessiterait une tâche planifiée côté serveur, absente
de ce projet), la règle est plus simple : **si une notification non lue
existe déjà pour le même item + le même type d'événement, la nouvelle
activité met à jour cette notification au lieu d'en créer une nouvelle.**
Dès que l'utilisateur la marque lue, le prochain événement reparties sur une
notification fraîche. Aucune tâche planifiée, aucun état supplémentaire à
gérer — juste une recherche avant écriture au moment de créer la
notification.

**Clé de regroupement :** `(taskId ?? resourceId, kind)` — un groupe par
item concerné, par type d'événement. Un commentaire et une nouvelle version
sur la même ressource restent deux notifications séparées ; deux
commentaires sur la même ressource se regroupent.

**Les mentions ne sont jamais regroupées.** Comme c'est déjà le cas pour
l'affichage dans l'onglet Activité (`groupNotifs()`), une mention reste
toujours sa propre notification individuelle — c'est un événement personnel
et important, pas une activité générique à compter.

### Contenu de la notification groupée

`AppNotif` gagne un champ `count?: number` (absent ou `1` = notification
simple, `2+` = groupée). Le texte affiché change de forme selon le
compteur :

- 1 personne : `"Sarah a commenté « Vidéo X »"`
- 2 personnes : `"Sarah et Thomas ont commenté « Vidéo X »"`
- 3+ personnes : `"Sarah et 2 autres ont commenté « Vidéo X »"`

`actor` devient une liste de noms distincts accumulés (pas juste le
dernier), pour permettre ce texte. `timestamp` est mis à jour à chaque
nouvel événement dans le groupe (reflète l'activité la plus récente).

### Destinataires (`recipientIds`)

Puisque les observateurs d'un item peuvent grandir avec le temps (chantier
1), une notification groupée met à jour ses `recipientIds` avec la liste
courante des observateurs à chaque nouvel événement — la version la plus
à jour est toujours utilisée, pas figée au moment de la création du groupe.

### Ce qui ne change pas

- Le regroupement cosmétique déjà existant dans l'onglet Activité
  (`groupNotifs()`, purement à l'affichage) reste tel quel — il continuera
  de fonctionner correctement sur des notifications déjà groupées à
  l'écriture, sans changement nécessaire de son côté.
- Le comportement courriel de `commentNotify.ts` (chantier 1) — chaque
  courriel individuel reste envoyé pour l'instant ; le chantier 3
  introduira l'option de recevoir un récap plutôt que des courriels
  individuels.
- Aucune notification déjà existante n'est rétroactivement fusionnée — le
  regroupement ne s'applique qu'aux nouvelles notifications créées après ce
  chantier.

## Hors scope

- Regroupement des courriels — chantier 3.
- Regroupement entre projets/items différents — reste un événement par
  item, jamais un résumé multi-items ("5 nouvelles activités dans 3
  projets").
- Regroupement des notifications `approval`/`deliverableApproved`/
  `invitation`/`storageLimit`/`taskCompleted` — ces types restent
  individuels ; seuls `comment` (et son équivalent implicite sur les
  factures) sont concernés par ce chantier, cohérent avec le fait que ce
  sont les seuls à pouvoir légitimement se répéter souvent sur le même
  item en peu de temps.
