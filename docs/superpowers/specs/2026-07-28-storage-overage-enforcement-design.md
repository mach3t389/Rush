# Storage Overage Enforcement — Design Spec

**Date :** 2026-07-28  
**Statut :** À implémenter

---

## Problème

Quand un studio downgrade de plan (ex. Agence → Studio), ou achète moins de stockage supplémentaire, son quota diminue. Aujourd'hui rien ne bloque les nouveaux uploads : le studio peut continuer à ajouter des fichiers indéfiniment au-delà de sa limite. Seule l'alerte à 90% existe (`storageStore.ts`), mais elle ne bloque rien.

---

## Comportement cible

### Ce qui est bloqué quand `usedGB >= limitGB`

- Upload de fichiers réels dans le FileBrowser (drag & drop OS + bouton "Importer un fichier")
- Upload d'un fichier média dans une ressource (vidéo, image, document uploadé — `mediaSubtype: 'file'`)

### Ce qui n'est PAS bloqué

- Création de ressources textuelles / structurelles (scénario, moodboard, storyboard, document vide, web review) — elles ne stockent pas de bytes binaires
- Upload du logo studio (quelques Ko, négligeable)
- Lecture, téléchargement, ou modification du contenu existant — aucun verrouillage rétroactif

### Feedback UI

Toast rouge bref + modale `UpgradePromptModal` avec un message dédié "stockage" — exactement le même pattern que le blocage de création de projet sur plan Gratuit (`requestUpgrade({ reason: 'projects' })`).

---

## Architecture

### 1. `storageStore.ts` — nouvelle fonction helper

```typescript
export function isStorageOverLimit(usedBytes: number, limitGB: number): boolean {
  if (limitGB <= 0) return false;
  return usedBytes >= limitGB * 1024 * 1024 * 1024;
}
```

Prend `usedBytes` (déjà disponible via `getTotalStorageUsedBytes()`) et `limitGB` (déjà calculé via `getStorageLimitGB(plan, storageTier)`). Séparé de `checkStorageThreshold` existant pour ne pas mélanger les deux logiques (alerte 90% vs blocage 100%).

### 2. `upgradePromptStore.ts` — nouveau reason type

Ajouter `'storage'` à l'union `UpgradeReason` :

```typescript
export type UpgradeReason =
  | { feature: GatedFeature }
  | { reason: 'seats' }
  | { reason: 'projects' }
  | { reason: 'membersGratuit' }
  | { reason: 'storage' };   // ← nouveau
```

### 3. `UpgradePromptModal.tsx` — nouveau cas `storage`

Ajouter les branches `reason === 'storage'` dans les blocs `title` et `body`, qui pointent vers deux nouvelles clés i18n :

- `upgradePrompt.storageTitle` → "Stockage insuffisant"
- `upgradePrompt.storageBody` → "Vous avez atteint la limite de stockage de votre plan. Libérez de l'espace ou passez à un plan supérieur pour continuer à uploader."

### 4. `FichiersGlobal.tsx` — guard dans `processUploadedFiles`

C'est l'unique point d'entrée des vrais uploads fichiers (drag & drop OS + input[type=file]). Ajouter un check en tête de fonction avant la boucle :

```typescript
const processUploadedFiles = useCallback((files: File[]) => {
  // Guard stockage
  if (isStorageOverLimit(getTotalStorageUsedBytes(), storageLimitGB)) {
    showToast({ type: 'error', message: t('storage.overLimitToast') });
    requestUpgrade({ reason: 'storage' });
    return;
  }
  // ... reste inchangé
}, [...]);
```

`storageLimitGB` est déjà calculé dans `FichiersGlobal` (ou sinon, le calculer avec `getStorageLimitGB(plan, storageTier)` depuis `planFeatures.ts`). Si pas encore présent, le dériver de `authStore`/`studioStore` — même pattern que la barre de stockage sidebar.

### 5. Upload média dans les ressources

Les ressources avec contenu binaire uploadé (vidéo, image, `mediaSubtype: 'file'` dans `DocumentReview.tsx` et `VideoReview.tsx`) passent aussi par `setFileContent`. Repérer l'appel `setFileContent` dans ces écrans et y ajouter le même guard avant l'appel.

À identifier précisément lors de l'implémentation en cherchant `setFileContent` dans `VideoReview.tsx` et `DocumentReview.tsx`.

### 6. Clés i18n — `fr.json` / `en.json`

```json
// upgradePrompt namespace :
"storageTitle": "Stockage insuffisant",
"storageBody": "Vous avez atteint la limite de stockage de votre plan. Supprimez des fichiers ou passez à un plan supérieur pour continuer à uploader.",

// storage namespace (nouvelle clé toast) :
"overLimitToast": "Limite de stockage atteinte — supprimez des fichiers ou upgradez votre plan"
```

---

## Ce qui ne change pas

- `checkStorageThreshold` (alerte 90%, notification cloche) — inchangé, continue à tourner indépendamment
- La barre de stockage sidebar — déjà rouge/warn au-delà de 90%, aucune modification
- Les stores Supabase (aucune table nouvelle, aucune migration nécessaire)
- La logique de billing Stripe — le check est purement côté client contre la valeur de limite déjà connue

---

## Périmètre hors-scope

- Grace period / délai de tolérance (rajouterait un état "en grâce" + minuteur + notifications répétées — complexité disproportionnée pour le gain)
- Facturation à la carte du dépassement (requiert Stripe metered billing — chantier séparé si jamais)
- Blocage du logo studio (quelques Ko, ne justifie pas le friction)
- Vérification côté serveur (le plan est déjà connu côté client ; les fonctions API Vercel pourraient aussi vérifier mais c'est de la défense en profondeur secondaire)
