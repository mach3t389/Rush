# Storage Overage Enforcement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bloquer les nouveaux uploads (FileBrowser + ressources média) quand le studio a dépassé son quota de stockage, avec toast + modale d'upgrade.

**Architecture:** Ajouter un helper `isStorageOverLimit()` dans `storageStore.ts`, un nouveau reason `'storage'` dans `upgradePromptStore.ts`, les clés i18n correspondantes, puis poser un guard au début de chaque fonction d'upload (3 endroits : `processUploadedFiles` dans FichiersGlobal, `assignMediaToActive` dans VideoReview, `storeUploaded` dans DocumentReview).

**Tech Stack:** React 19, TypeScript, i18next, stores singleton (abonnement manuel).

## Global Constraints

- Aucune migration SQL — tout est côté client
- Respecter le pattern `requestUpgrade({ reason: ... })` existant dans `upgradePromptStore.ts`
- Tous les textes UI via `t('namespace.key')` — jamais de string en dur
- `tsc -p tsconfig.app.json --noEmit` doit passer à 0 erreur après chaque tâche
- Pas de tests automatisés — vérification manuelle via `npm run dev` dans `app/`

---

## Fichiers touchés

| Fichier | Action |
|---|---|
| `app/src/data/storageStore.ts` | Ajouter `isStorageOverLimit()` |
| `app/src/data/upgradePromptStore.ts` | Ajouter `'storage'` à `UpgradeReason` + `canUploadFile()` helper |
| `app/src/components/UpgradePromptModal.tsx` | Ajouter cas `storage` dans title/body |
| `app/src/locales/fr.json` | Ajouter clés `upgradePrompt.storageTitle/Body` + `notifications.storageOverLimit` |
| `app/src/locales/en.json` | Idem en anglais |
| `app/src/screens/FichiersGlobal.tsx` | Guard dans `processUploadedFiles` |
| `app/src/screens/VideoReview.tsx` | Guard dans `assignMediaToActive` |
| `app/src/screens/DocumentReview.tsx` | Guard dans `storeUploaded` |

---

## Task 1 — Helper `isStorageOverLimit` + reason `'storage'`

**Files:**
- Modify: `app/src/data/storageStore.ts`
- Modify: `app/src/data/upgradePromptStore.ts`

**Interfaces:**
- Produces:
  - `isStorageOverLimit(usedBytes: number, limitGB: number): boolean` (storageStore)
  - `canUploadFile(): boolean` (upgradePromptStore) — retourne `true` si l'upload peut continuer, `false` + déclenche `requestUpgrade({ reason: 'storage' })` si dépassé
  - `UpgradeReason` étendu avec `| { reason: 'storage' }`

- [ ] **Ajouter `isStorageOverLimit` dans `storageStore.ts`**

À la fin de `app/src/data/storageStore.ts`, après `checkStorageThreshold` :

```typescript
export function isStorageOverLimit(usedBytes: number, limitGB: number): boolean {
  if (limitGB <= 0) return false;
  return usedBytes >= limitGB * 1024 * 1024 * 1024;
}
```

- [ ] **Étendre `UpgradeReason` dans `upgradePromptStore.ts`**

Remplacer la ligne :
```typescript
export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' } | { reason: 'projects' } | { reason: 'membersGratuit' };
```
Par :
```typescript
export type UpgradeReason = { feature: GatedFeature } | { reason: 'seats' } | { reason: 'projects' } | { reason: 'membersGratuit' } | { reason: 'storage' };
```

- [ ] **Ajouter `canUploadFile()` dans `upgradePromptStore.ts`**

Ajouter les imports nécessaires en tête du fichier (après les imports existants) :
```typescript
import { getTotalStorageUsedBytes } from './storageStore';
import { isStorageOverLimit } from './storageStore';
import { getCurrentPlan, getCurrentStorageTier } from './planStore';
import { getStorageLimitGB } from './planFeatures';
import { showToast } from './toastStore';
```

Puis ajouter la fonction à la fin du fichier :
```typescript
export function canUploadFile(): boolean {
  const usedBytes = getTotalStorageUsedBytes();
  const limitGB = getStorageLimitGB(getCurrentPlan(), getCurrentStorageTier());
  if (isStorageOverLimit(usedBytes, limitGB)) {
    requestUpgrade({ reason: 'storage' });
    return false;
  }
  return true;
}
```

- [ ] **Vérifier TypeScript**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Attendu : 0 erreur

- [ ] **Commit**

```bash
git add app/src/data/storageStore.ts app/src/data/upgradePromptStore.ts
git commit -m "feat(storage): add isStorageOverLimit helper and 'storage' upgrade reason"
```

---

## Task 2 — Clés i18n

**Files:**
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`

**Interfaces:**
- Produces:
  - `t('upgradePrompt.storageTitle')` → titre de la modale
  - `t('upgradePrompt.storageBody')` → corps de la modale
  - `t('notifications.storageOverLimit')` → texte du toast (clé dans le namespace `notifications` existant)

- [ ] **Ajouter les clés françaises dans `fr.json`**

Dans le bloc `"upgradePrompt"` (actuellement ligne ~2578, après `"membersGratuitBody"`), ajouter avant la fermeture `}` :

```json
"storageTitle": "Stockage insuffisant",
"storageBody": "Vous avez atteint la limite de stockage de votre plan. Supprimez des fichiers ou passez à un plan supérieur pour continuer à importer."
```

Dans le bloc `"notifications"` (chercher `"storageLimit"` existant, aux alentours de la ligne 232), ajouter une clé voisine :

```json
"storageOverLimit": "Limite de stockage atteinte — supprimez des fichiers ou upgradez votre plan"
```

- [ ] **Ajouter les clés anglaises dans `en.json`**

Même emplacement dans les blocs correspondants :

```json
// dans "upgradePrompt" :
"storageTitle": "Storage limit reached",
"storageBody": "You've reached the storage limit of your plan. Delete files or upgrade to continue uploading."

// dans "notifications" :
"storageOverLimit": "Storage limit reached — delete files or upgrade your plan"
```

- [ ] **Vérifier TypeScript**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Attendu : 0 erreur

- [ ] **Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json
git commit -m "feat(storage): add i18n keys for storage overage UI"
```

---

## Task 3 — `UpgradePromptModal` — cas `storage`

**Files:**
- Modify: `app/src/components/UpgradePromptModal.tsx`

**Interfaces:**
- Consumes: `UpgradeReason` étendu (Task 1), clés i18n (Task 2)
- Produces: modale affichée avec titre/corps corrects quand `reason === 'storage'`

- [ ] **Ajouter les branches `storage` dans les blocs `title` et `body`**

Dans `UpgradePromptModal.tsx`, les blocs actuels sont :
```typescript
const title = reason === 'seats' ? t('upgradePrompt.seatsTitle')
  : reason === 'projects' ? t('upgradePrompt.projectsTitle')
  : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitTitle')
  : t('upgradePrompt.featureTitle');
const body = reason === 'seats' ? t('upgradePrompt.seatsBody')
  : reason === 'projects' ? t('upgradePrompt.projectsBody')
  : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitBody')
  : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });
```

Remplacer par :
```typescript
const title = reason === 'seats' ? t('upgradePrompt.seatsTitle')
  : reason === 'projects' ? t('upgradePrompt.projectsTitle')
  : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitTitle')
  : reason === 'storage' ? t('upgradePrompt.storageTitle')
  : t('upgradePrompt.featureTitle');
const body = reason === 'seats' ? t('upgradePrompt.seatsBody')
  : reason === 'projects' ? t('upgradePrompt.projectsBody')
  : reason === 'membersGratuit' ? t('upgradePrompt.membersGratuitBody')
  : reason === 'storage' ? t('upgradePrompt.storageBody')
  : t('upgradePrompt.featureBody', { feature: t(FEATURE_LABEL_KEYS[(prompt as { feature: GatedFeature }).feature]) });
```

- [ ] **Vérifier TypeScript**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Attendu : 0 erreur

- [ ] **Commit**

```bash
git add app/src/components/UpgradePromptModal.tsx
git commit -m "feat(storage): show storage overage message in UpgradePromptModal"
```

---

## Task 4 — Guard dans `FichiersGlobal.tsx`

**Files:**
- Modify: `app/src/screens/FichiersGlobal.tsx`

**Interfaces:**
- Consumes: `canUploadFile()` (Task 1), `t('notifications.storageOverLimit')` (Task 2)

- [ ] **Ajouter les imports**

En tête de `FichiersGlobal.tsx`, ajouter parmi les imports existants :

```typescript
import { canUploadFile } from '../data/upgradePromptStore';
import { showToast } from '../data/toastStore';
```

(Vérifier que `showToast` et `useTranslation` ne sont pas déjà importés — si oui, ne pas dupliquer.)

- [ ] **Ajouter le guard dans `processUploadedFiles`**

La fonction commence actuellement autour de la ligne 2033. Ajouter le guard en tout début, avant la déstructuration de `addTargetLoc` :

```typescript
const processUploadedFiles = useCallback((files: File[]) => {
  if (!canUploadFile()) {
    showToast({ type: 'error', message: t('notifications.storageOverLimit') });
    return;
  }
  const { scope, scopeId, folderId } = addTargetLoc ?? location;
  // ... reste inchangé
}, [location, addTargetLoc]);
```

Note : `t` est déjà disponible dans ce composant via `useTranslation()`.

- [ ] **Vérifier TypeScript**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Attendu : 0 erreur

- [ ] **Commit**

```bash
git add app/src/screens/FichiersGlobal.tsx
git commit -m "feat(storage): block file uploads in FileBrowser when storage limit exceeded"
```

---

## Task 5 — Guard dans `VideoReview.tsx`

**Files:**
- Modify: `app/src/screens/VideoReview.tsx`

**Interfaces:**
- Consumes: `canUploadFile()` (Task 1), `showToast` (toastStore)

- [ ] **Ajouter les imports**

En tête de `VideoReview.tsx`, ajouter :

```typescript
import { canUploadFile } from '../data/upgradePromptStore';
import { showToast } from '../data/toastStore';
```

(Vérifier si déjà présents.)

- [ ] **Ajouter le guard dans `assignMediaToActive`**

La fonction actuellement (autour de la ligne 289) :

```typescript
const assignMediaToActive = (file: File) => {
  const fileId = `media-${persistKey ?? resource.id}-${activeVersion}-${Date.now()}`;
  setFileContent(fileId, file);
  // ...
};
```

Remplacer par :

```typescript
const assignMediaToActive = (file: File) => {
  if (!canUploadFile()) {
    showToast({ type: 'error', message: t('notifications.storageOverLimit') });
    return;
  }
  const fileId = `media-${persistKey ?? resource.id}-${activeVersion}-${Date.now()}`;
  setFileContent(fileId, file);
  // ... reste inchangé
};
```

Note : vérifier que `t` est disponible dans ce composant (il doit y avoir un `useTranslation()` ou récupérer `t` via le hook). Si `t` n'est pas encore utilisé dans `VideoReview.tsx`, ajouter :
```typescript
import { useTranslation } from 'react-i18next';
// et dans le corps du composant :
const { t } = useTranslation();
```

- [ ] **Vérifier TypeScript**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Attendu : 0 erreur

- [ ] **Commit**

```bash
git add app/src/screens/VideoReview.tsx
git commit -m "feat(storage): block media upload in VideoReview when storage limit exceeded"
```

---

## Task 6 — Guard dans `DocumentReview.tsx`

**Files:**
- Modify: `app/src/screens/DocumentReview.tsx`

**Interfaces:**
- Consumes: `canUploadFile()` (Task 1)

**Note :** `DocumentReview.tsx` n'utilise pas i18n (convention préexistante — strings françaises en dur). Le toast d'erreur ici sera donc une string en dur en français, cohérent avec le reste du fichier.

- [ ] **Ajouter les imports**

```typescript
import { canUploadFile } from '../data/upgradePromptStore';
import { showToast } from '../data/toastStore';
```

- [ ] **Ajouter le guard dans `storeUploaded`**

La fonction actuellement (autour de la ligne 315) :

```typescript
const storeUploaded = (f: File): UploadedFile => {
  const fileId = `doc-${resourceId}-${Date.now()}`;
  setFileContent(fileId, f);
  return { name: f.name, size: f.size, type: f.type, fileId };
};
```

Remplacer par :

```typescript
const storeUploaded = (f: File): UploadedFile | null => {
  if (!canUploadFile()) {
    showToast({ type: 'error', message: 'Limite de stockage atteinte — supprimez des fichiers ou upgradez votre plan' });
    return null;
  }
  const fileId = `doc-${resourceId}-${Date.now()}`;
  setFileContent(fileId, f);
  return { name: f.name, size: f.size, type: f.type, fileId };
};
```

- [ ] **Adapter les appelants de `storeUploaded`**

La fonction retourne maintenant `UploadedFile | null`. Les deux appelants sont `handleFileChange` et le handler de drag & drop dans ce fichier. Chercher tous les appels à `storeUploaded(` et ajouter un guard sur `null` :

Pour `handleFileChange` (autour de la ligne 322) :
```typescript
const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
  const f = e.target.files?.[0];
  if (!f) return;
  const uploaded = storeUploaded(f);
  if (!uploaded) return;
  setPendingUpload(uploaded);
  e.target.value = '';
};
```

Pour le drag & drop (chercher l'autre appel à `storeUploaded` dans le fichier et appliquer le même pattern `if (!uploaded) return;`).

- [ ] **Vérifier TypeScript**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Attendu : 0 erreur

- [ ] **Commit**

```bash
git add app/src/screens/DocumentReview.tsx
git commit -m "feat(storage): block document upload in DocumentReview when storage limit exceeded"
```

---

## Task 7 — Vérification manuelle

Pas de tests automatisés dans ce projet. Vérifier le comportement en session démo (mode simulé) :

- [ ] **Lancer le serveur de dev**

```bash
cd app && npm run dev
```

- [ ] **Simuler un dépassement**

Dans la console du navigateur (DevTools), injecter temporairement une valeur de dépassement pour tester sans vraiment uploader des Go :

```javascript
// Remplace la fonction getTotalStorageUsedBytes pour renvoyer une valeur > limite
// La limite démo = getStorageLimitGB('gratuit', 0) = 5 Go = 5368709120 bytes
// Inject 6 Go
```

Alternative plus simple : modifier temporairement le seuil dans `isStorageOverLimit` pour tester à 0 octets utilisés (threshold à 0), vérifier le comportement, puis remettre.

**Comportement attendu :**
1. Drag & drop d'un fichier dans Fichiers → toast rouge + modale "Stockage insuffisant"
2. Clic sur "Importer un fichier" + sélection → même comportement
3. Dépôt d'une vidéo dans VideoReview → même comportement
4. Upload d'un document dans DocumentReview → même comportement
5. Création d'un scénario vide (ressource texte) → **pas bloqué**, fonctionne normalement
6. Clic "Voir les plans" dans la modale → navigue vers `/parametres?section=plan`

- [ ] **Vérifier TypeScript final**

```bash
cd app && npx tsc -p tsconfig.app.json --noEmit
```
Attendu : 0 erreur

- [ ] **Commit final**

```bash
git add -A
git commit -m "feat(storage): storage overage enforcement — bloc uploads quand quota dépassé"
```
