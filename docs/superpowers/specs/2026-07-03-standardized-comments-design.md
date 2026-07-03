# Standardisation du système de commentaires

## Contexte

L'utilisateur a observé que chaque type de ressource a sa propre boîte de commentaires, avec des fonctionnalités et un look différents. Un composant partagé existe déjà — `RevisionCommentSidebar` (`app/src/components/RevisionComments.tsx`) — mais n'est utilisé que par 2 des 9 éditeurs de ressources (`ImageReview`, `DocumentReview`).

**État des lieux (vérifié dans le code) :**

| Éditeur(s) | Implémentation actuelle | Réponses | Résoudre | @mentions | Suppression |
|---|---|---|---|---|---|
| ImageReview, DocumentReview | `RevisionCommentSidebar` (partagé) | ✅ | ✅ | placeholder seulement* | ✅ |
| VideoReview | bespoke, intégré aux onglets | ✅ | ✅ | ✅ (réel, avec dropdown) | ✅ |
| WebReview | bespoke | ❌ | ✅ (partiel) | ❌ | ✅ |
| ScriptView, MoodboardView, ChecklistView, InspirationsView, FormView | **`ScriptCommentSidebar`** — un seul composant bespoke partagé entre ces 5 éditeurs (`ResourceDetail.tsx`) | ❌ | ✅ | ❌ | ❌ |
| Document (éditeur riche, onglet Commentaires) | bespoke, ancrage DOM | ❌ | partiel | ❌ | ❌ |

*`RevisionCommentSidebar` n'a en réalité **pas** de vraie autocomplétion @mention — seulement un texte d'indice dans le placeholder. `VideoReview`, lui, a une vraie autocomplétion fonctionnelle (regex `@(\w*)$`, dropdown filtré sur l'équipe, remplacement du texte). C'est un écart de fonctionnalité réel qu'il faut combler AVANT de migrer d'autres éditeurs vers le composant partagé, sinon on régresserait par rapport à `VideoReview`.

## Objectif

Unifier le look et les fonctionnalités de base (réponses, résoudre/rouvrir, @mentions, suppression) de la boîte de commentaires sur **7 des 9 types de ressources**, sans toucher aux mécaniques d'annotation propres à chaque média (positionnement des épingles, ancrage DOM, dessin sur vidéo) qui doivent rester différentes par nature.

## Portée

**Inclus dans ce chantier :**
1. Ajouter une vraie autocomplétion @mention à `RevisionCommentSidebar`/`CommentCard` (port du pattern déjà validé dans `VideoReview.tsx`).
2. Migrer `ScriptCommentSidebar` (`app/src/screens/ResourceDetail.tsx`) pour qu'il utilise `RevisionCommentSidebar` en interne — corrige d'un coup les 5 éditeurs qui l'utilisent (Scénario, Moodboard, Checklist, Inspirations, Formulaire).
3. Migrer l'onglet Commentaires de l'éditeur de document riche (`DocumentView`, `ResourceDetail.tsx`) vers `RevisionCommentSidebar`.
4. Migrer la sidebar de commentaires de `WebReview.tsx` vers `RevisionCommentSidebar`, en conservant son système d'épingles positionnelles sur la page web (mappées sur `RevisionAnnotation.x/y`, déjà le même schéma que `RevisionComments.tsx` utilise pour les images).

**Explicitement différé (décision assumée, pas un oubli) :**
- **`VideoReview.tsx`** n'est **pas** migré dans ce chantier. Il a déjà une parité fonctionnelle complète (réponses, résoudre, @mentions réelles, suppression) — seul le look diffère (intégré aux onglets plutôt qu'une sidebar dédiée). Le migrer apporterait un gain purement cosmétique pour un risque de régression élevé sur un écran complexe (outils de dessin, gestion vidéo/audio, timeline). À reconsidérer dans un futur chantier séparé si l'utilisateur le souhaite.
- **Persistance des commentaires** pour Scénario/Moodboard/Checklist/Inspirations/Formulaire : ces 5 éditeurs perdent actuellement leurs commentaires au rechargement (`useState` local, jamais persisté). Ce chantier ne change pas ça — il ne fait qu'unifier le look/les fonctionnalités. Ajouter la persistance serait un complément naturel (même pattern que le chantier `resource-content-persistence` tout juste terminé) mais reste un chantier séparé pour ne pas faire grossir la portée ici.
- **Bug pré-existant non touché** : `RevisionComments.tsx` appelle déjà `SFAvatar` avec des props qui n'existent pas sur son interface (`name`/`color` au lieu de `initials`/`bg`) — 2 erreurs TypeScript pré-existantes dans le baseline. Ce chantier ne corrige pas ce bug (hors scope), il ne fait qu'ajouter des consommateurs au composant existant.

## Conception

### 1. Autocomplétion @mention dans `RevisionComments.tsx`

Port fidèle du pattern de `VideoReview.tsx` (lignes ~325-329, ~631-654, ~1371-1385) :
- État `mentionQuery: string | null` + `mentionRect: DOMRect | null` dans `CommentCard` (pour le champ réponse) et dans `RevisionCommentSidebar` (pour le champ d'ajout principal).
- Détection : `const m = val.match(/@(\w*)$/); if (m) { setMentionQuery(m[1]); setMentionRect(el.getBoundingClientRect()); } else setMentionQuery(null);`
- Sélection : `setText(prev => prev.replace(/@\w*$/, `@${name} `)); setMentionQuery(null);`
- Liste des utilisateurs : `Object.values(USERS)` (déjà importé dans `RevisionComments.tsx`).
- Rendu du texte des commentaires : les `@mentions` dans le texte affiché sont mises en surbrillance (`var(--accent)`, `fontWeight:600`), reprenant `renderMentions()` de `VideoReview.tsx` (ligne ~653).

### 2. `ScriptCommentSidebar` → wrapper autour de `RevisionCommentSidebar`

`ScriptCommentSidebar` garde sa signature externe (`{ resourceId }`) — aucun des 5 call sites ne change. En interne, il convertit son état local `ScriptComment[]` (`{id, author: string, text, ts, resolved}`) vers/depuis `RevisionComment[]` et délègue le rendu à `RevisionCommentSidebar`. Pas d'annotation positionnelle (ces 5 éditeurs n'ont pas de canevas/image à annoter) — tous les commentaires sont "généraux" (pas de `annotation`), exactement comme le flux "quick add" déjà supporté par `RevisionCommentSidebar` pour les commentaires sans position.

### 3. Onglet Commentaires de `DocumentView`

Remplace la liste de commentaires bespoke par `RevisionCommentSidebar`. L'ancrage DOM existant (surlignage `<mark data-comment-id>` dans le texte riche) est conservé tel quel — seule la liste/carte de commentaires change, pas le mécanisme de création d'ancre.

### 4. Sidebar de `WebReview`

Remplace la liste de commentaires bespoke par `RevisionCommentSidebar`. Le système d'épingles positionnelles sur la page web existant (coordonnées page-absolues + suivi du scroll) est conservé — seules les positions sont mappées vers `RevisionAnnotation.x/y` (déjà le schéma pourcentage utilisé par les images), la logique de placement des épingles elle-même ne change pas.

## Hors scope

- Migration de `VideoReview.tsx` (voir "Explicitement différé" ci-dessus).
- Persistance des commentaires pour les 5 éditeurs `ScriptCommentSidebar` (comportement actuel : perdu au rechargement, inchangé par ce chantier).
- Correction du bug pré-existant `SFAvatar` dans `RevisionComments.tsx`.

## Tests / vérification

Pas de suite de tests automatisés (vérification via le serveur de preview, comme documenté dans `CLAUDE.md`). Vérification manuelle prévue après chaque tâche :
1. Autocomplétion @mention : taper `@` dans le champ de commentaire d'`ImageReview` (déjà câblé sur `RevisionCommentSidebar`), confirmer que le dropdown apparaît et filtre par nom.
2. `ScriptCommentSidebar` : ouvrir un Scénario, Moodboard, Checklist, Inspirations et Formulaire — confirmer que le nouveau look de commentaires (réponses, résoudre, mentions, suppression) apparaît de façon identique sur les 5.
3. `DocumentView` : ajouter un commentaire ancré sur du texte sélectionné, confirmer que l'ancrage fonctionne toujours et que la carte de commentaire a le nouveau look.
4. `WebReview` : placer une épingle sur la page web annotée, confirmer que la position et le nouveau look de la carte fonctionnent ensemble.
5. `npx tsc --noEmit -p tsconfig.app.json` : aucune nouvelle erreur sur les fichiers touchés.
