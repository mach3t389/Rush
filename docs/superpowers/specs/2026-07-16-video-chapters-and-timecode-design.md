# Chapitres vidéo + entrée manuelle de timecode

**Écran concerné :** `app/src/screens/VideoReview.tsx` (`VideoReviewBody`)

## Contexte

`VideoReview.tsx` a déjà une barre de progression (scrubber) avec des repères
pour les commentaires et les tâches, un fil temporel actif, et des boutons
"commentaire précédent/suivant" pour naviguer. Il n'existe aujourd'hui aucun
concept de chapitre, et le temps affiché (`MM:SS / MM:SS`) est un texte
statique, non cliquable.

## Portée

Quatre morceaux liés, tous dans le même écran :

1. Extraction automatique des chapitres intégrés dans le fichier vidéo.
2. Affichage des chapitres sur la timeline (repères + nom au survol).
3. Boutons "chapitre précédent / suivant" dans la barre de contrôle.
4. Entrée manuelle d'un timecode exact en cliquant sur l'affichage du temps.

## 1. Extraction des chapitres

**Format ciblé :** piste de chapitres façon QuickTime (référence de piste
`chap`) — c'est ce que produisent Premiere, Final Cut et DaVinci quand on
exporte avec des marqueurs de chapitre. C'est le format le plus standard et
le plus répandu pour ce cas d'usage.

**Librairie :** nouvelle dépendance `mp4box.js` (parsing de la structure
binaire ISO-BMFF/MP4 côté client — aucune API navigateur native ne l'expose).

**Mécanique :**
- Au chargement d'une vidéo (`mediaUrl` résolu), on démarre une extraction en
  arrière-plan, sans bloquer la lecture.
- On récupère seulement le **début du fichier** via une requête HTTP `Range`
  (2 Mo au premier essai — ajustable pendant l'implémentation si trop de
  fichiers réels ont leur `moov` plus loin) et on alimente `mp4box.js`
  incrémentalement jusqu'à ce que la structure `moov` (métadonnées) soit
  trouvée ou que la limite de 2 Mo soit atteinte sans succès.
- Si une piste de chapitres est trouvée, on extrait la liste
  `{ label: string; timeSeconds: number }[]`.
- Résultat mis en cache sur la **version** de la vidéo (voir Modèle de
  données ci-dessous) — l'extraction ne se refait pas à chaque ouverture de
  l'écran, seulement quand une nouvelle version est déposée.

**Limites acceptées (scope volontairement réduit pour cette v1) :**
- Si les métadonnées `moov` ne sont pas trouvées dans les premiers Mo
  récupérés (rare — la plupart des exports "fast start" les placent au
  début), on n'essaie pas de récupérer la fin du fichier. Zéro chapitre
  affiché dans ce cas, pas d'erreur visible à l'utilisateur.
- Seuls les conteneurs MP4/MOV sont supportés. Les autres formats (webm,
  etc.) sont ignorés silencieusement — pas de chapitres, pas d'erreur.
- Toute erreur de fetch/parsing est interceptée et traitée comme "zéro
  chapitre trouvé" — l'extraction ne doit jamais bloquer ni faire planter la
  lecture vidéo.

## 2. Affichage sur la timeline

Sur la barre de progression existante (le scrubber en bas, celui qui
contient déjà les points de commentaires et les repères de tâches), on
ajoute un repère vertical fin à chaque temps de chapitre :
- Couleur neutre (`var(--text-3)` ou `var(--border-2)`) pour rester
  visuellement distinct des points de commentaires (accent jaune) et des
  repères de tâches (couleur warn).
- Info-bulle au survol affichant le nom du chapitre — même mécanisme que le
  `title` déjà utilisé sur les points de commentaires.
- Clic sur un repère de chapitre = saut direct à ce temps (réutilise
  `seekTo()`).

## 3. Navigation par boutons

Ajout d'une paire de boutons "chapitre précédent / chapitre suivant" dans la
barre de contrôle du bas, juste à côté des boutons existants "commentaire
précédent/suivant" — même style visuel (icône chevron + icône dédiée),
grisée/désactivée quand la vidéo courante n'a aucun chapitre (même
comportement que les boutons de commentaires aujourd'hui quand il n'y a pas
de commentaire dans le sens demandé).

## 4. Entrée manuelle du timecode

Le texte `{secsToLabel(currentTime)} / {secsToLabel(TOTAL)}` en bas à gauche
de la barre de contrôle devient cliquable :
- Au clic, se transforme en champ de saisie texte pré-rempli avec le temps
  courant.
- Formats acceptés en entrée : `SS`, `MM:SS`, ou `H:MM:SS` (tolérant, pas de
  format strict imposé).
- `Entrée` : parse la valeur, la borne à `[0, TOTAL]`, appelle `seekTo()`,
  referme le champ.
- `Échap` ou perte de focus sans changement : annule, revient à l'affichage
  texte.

## Modèle de données

`LocalVersion` (déjà défini dans `VideoReview.tsx`) gagne un champ optionnel :

```ts
interface Chapter {
  id: string;
  label: string;
  timeSeconds: number;
}

interface LocalVersion {
  // ... champs existants
  chapters?: Chapter[]; // résultat de l'extraction, mis en cache par version
}
```

Comme `versions` fait déjà partie du snapshot `VideoReviewContent` persisté
via `setResourceContent`/`getResourceContent`, les chapitres extraits
survivent automatiquement à un rechargement de page sans mécanisme de
sauvegarde séparé.

## Vérification

Ce projet n'a pas de suite de tests automatisés (vérification par serveur de
preview, voir CLAUDE.md). Pour cette fonctionnalité, la vérification sera
manuelle et nécessite **un vrai fichier vidéo connu pour contenir des
chapitres QuickTime** — sans un tel fichier, impossible de confirmer
visuellement que l'extraction fonctionne (un fichier sans chapitres est un
résultat valide mais ne prouve rien). L'utilisateur devra fournir un fichier
de ce type tôt dans l'implémentation pour valider l'extraction avant de
continuer sur l'affichage/navigation.

Points à vérifier en direct dans le navigateur :
- Extraction réussie sur un fichier contenant des chapitres → repères
  visibles sur la timeline, boutons de navigation actifs.
- Fichier sans chapitres (ou format non supporté) → aucun repère, boutons
  grisés, aucune erreur visible, lecture vidéo normale.
- Clic sur un repère de chapitre → saut au bon temps.
- Boutons précédent/suivant → sautent au chapitre attendu.
- Entrée manuelle de timecode (formats `SS`, `MM:SS`, `H:MM:SS`) → saut au
  bon temps, bornage correct si le temps entré dépasse la durée totale.
- Rechargement de la page → chapitres toujours présents (pas de
  ré-extraction), grâce au cache par version.
