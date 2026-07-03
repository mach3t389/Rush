# Persistance du contenu — ImageReview & DocumentReview

## Contexte

Le pattern `persistKey` + `resourceContentStore` sauvegarde déjà le contenu de révision (rondes/versions, commentaires, tâches) pour 7 des 9 éditeurs de ressources : `DocumentView`, `VideoReview`, `MoodboardView`, `ChecklistView`, `ScreenplayView`, `InspirationsView`, `FormView`. Il ne reste que **`ImageReview`** et **`DocumentReview`** : tout leur état (rondes, image/fichier déposé, commentaires, annotations) vit uniquement en `useState` React et disparaît au rechargement de la page.

De plus, `ImageReview` a un problème plus profond que la simple absence de persistance : les images déposées par glisser-déposer sont stockées via `URL.createObjectURL(file)` — une URL de blob en mémoire, qui peut devenir invalide même sans recharger la page (le navigateur peut libérer le blob). `VideoReview` a déjà résolu ce problème pour les vidéos/audios réels en passant par `fileContentStore` (base64 en `localStorage` pour les fichiers ≤ 3 Mo), référencé par un `fileId` plutôt qu'une URL brute.

## Objectif

Appliquer le pattern `persistKey`/`resourceContentStore` aux deux éditeurs restants, en reproduisant fidèlement l'implémentation déjà validée dans `VideoReview.tsx` (debounce 400 ms, flush au démontage, ne pas écrire au montage). Pour `ImageReview`, migrer aussi le stockage des images uploadées vers `fileContentStore` (comme `VideoReview` le fait déjà pour ses médias, et comme `DocumentReview` le fait déjà pour son fichier).

## Portée

- `app/src/screens/ImageReview.tsx`
- `app/src/screens/DocumentReview.tsx`

Ces deux composants sont montés directement par le routeur (`ResourceRouter`) et lisent déjà `resourceId` via `useParams()` — contrairement à `VideoReview`, il n'y a pas de séparation wrapper/`*Body` à reproduire ; `resourceId` sert directement de `persistKey` à l'intérieur du composant existant.

## Conception

### `ImageReview.tsx`

**Contenu persisté :**
```ts
interface ImageReviewContent {
  rounds?: LocalRound[];
  activeRound?: string;
  comments?: RevisionComment[];
}
```

**Chargement :** au montage, `getResourceContent<ImageReviewContent>(resourceId)` remplace les seeds (`SEED_ROUNDS`, `activeRound`, `comments: []`) si une valeur persistée existe — même idiome que `VideoReview` (`persisted?.xxx ?? default`).

**Sauvegarde :** `useEffect` sur `[rounds, activeRound, comments]`, debounce 400 ms via `setTimeout`/`clearTimeout`, ne rien écrire au tout premier rendu (flag `mounted` comme dans `VideoReview`), flush immédiat au démontage (effet de nettoyage séparé).

**Migration des images vers `fileContentStore` :**
- `MockImage` gagne un champ optionnel `fileId?: string`.
- Aux 3 points d'upload (`dropImagesToActive`, `addFilesToRound`, `addFilesAsNewRound`) : remplacer `bg: URL.createObjectURL(f)` par `setFileContent(fileId, f)` + `fileId` stocké sur l'image ; `bg` n'est alors plus renseigné pour les images uploadées (seules les images de seed/placeholder gardent un `bg` littéral).
- Un helper `resolveImageSrc(img: MockImage): string | undefined` retourne `getFileContent(img.fileId)` si `fileId` est présent, sinon `undefined` (fallback vers le placeholder existant). `ImageViewer` et la grille galerie l'utilisent pour décider entre `<img src=...>` et le placeholder SFIcon.
- Comme les `fileId` sont stockés dans `rounds` (persisté), et que `fileContentStore` persiste lui-même le base64 (≤ 3 Mo) sous sa propre clé, une image uploadée référencée par un round persisté redevient visible après rechargement — exactement le mécanisme déjà utilisé par `VideoReview` pour ses médias.

### `DocumentReview.tsx`

**Contenu persisté :**
```ts
interface DocumentReviewContent {
  rounds?: DocRound[];
  activeRound?: string;
  comments?: RevisionComment[];
  currentPage?: number;
}
```

Le fichier déposé passe déjà par `fileContentStore` (`DocRound.file.fileId`, déjà en place) — il ne manque que la persistance de l'état autour de ce fichier (rondes, ronde active, commentaires, page courante). Même idiome de chargement/sauvegarde que `ImageReview`/`VideoReview`.

Le panneau IA (`aiMessages`) et l'onglet actif (`rightTab`) restent non persistés, par cohérence avec le précédent déjà établi dans `DocumentView` (`rightTab` réinitialisé à chaque ouverture).

## Hors scope

- Pas de changement à `fileContentStore.ts` ou `resourceContentStore.ts` (API déjà suffisante).
- Pas de migration des données existantes (aucune donnée à migrer : ces deux écrans n'ont jamais rien persisté).
- Pas de changement au panneau IA de `DocumentReview`.

## Tests / vérification

Pas de suite de tests automatisés dans ce projet (vérification via le serveur de preview, comme documenté dans `CLAUDE.md`). Vérification manuelle prévue après implémentation :
1. `ImageReview` : déposer une image, ajouter un commentaire, recharger la page → image et commentaire toujours présents.
2. `DocumentReview` : déposer un fichier, changer de page courante, ajouter un commentaire, recharger la page → fichier, page et commentaire toujours présents.
3. `npx tsc --noEmit -p tsconfig.app.json` : aucune nouvelle erreur sur les deux fichiers touchés.
