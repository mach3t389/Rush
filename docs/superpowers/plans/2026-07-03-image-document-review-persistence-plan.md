# Persistance ImageReview & DocumentReview — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Wire `ImageReview.tsx` and `DocumentReview.tsx` into the existing `resourceContentStore`/`fileContentStore` persistence pattern, so their content (rounds, comments, uploaded media) survives a page reload — matching the 7 editors already wired.

**Architecture:** Reproduce the exact idiom already used in `VideoReview.tsx` (`VideoReviewBody`, lines 175-356): a `*Content` interface holding the serializable state, loaded via `getResourceContent<T>(resourceId)` at mount, saved via a debounced (400ms) `useEffect` that skips the first render and flushes on unmount. For `ImageReview`, additionally migrate uploaded images from raw `URL.createObjectURL()` blobs (which don't survive reload and can even be revoked mid-session) to `fileContentStore`, exactly as `VideoReview` already does for its media and `DocumentReview` already does for its document file.

**Tech Stack:** React 19 + TypeScript, existing `app/src/data/resourceContentStore.ts` and `app/src/data/fileContentStore.ts` (no changes to either — their API is already sufficient).

## Global Constraints

- No automated test suite in this repo — verification is via the Preview browser tool and `npx tsc --noEmit -p tsconfig.app.json` (the bare `tsc --noEmit` is a false pass in this repo; always use `-p tsconfig.app.json`).
- All user-facing text must already go through `t()` — this plan does not add any new user-facing strings, so no new i18n keys are needed.
- Persisted content types must be plain JSON-serializable data (no functions, no `Date` instances) — `RevisionComment`/`RevisionReply`/`typeof USERS.lea` are already plain objects (verified in `app/src/components/RevisionComments.tsx` and `app/src/data/mock.ts`), so no conversion is needed.
- Debounce delay is 400ms, matching `VideoReview.tsx:348`. Do not use a different value.

---

### Task 1: `ImageReview.tsx` — persistence + real image storage

**Files:**
- Modify: `app/src/screens/ImageReview.tsx`

**Interfaces:**
- Consumes: `getResourceContent<T>(resourceId: string): T | undefined`, `setResourceContent<T>(resourceId: string, content: T): void` from `app/src/data/resourceContentStore.ts`; `setFileContent(id: string, file: File): void`, `getFileContent(id: string): string | null` from `app/src/data/fileContentStore.ts`.
- Produces: nothing consumed by other tasks (Task 2 is independent).

- [ ] **Step 1: Add imports**

In `app/src/screens/ImageReview.tsx`, replace the import block (lines 1-16):

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { SFAvatar, SFButton, SFIcon } from '../components/ui';
import { USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import { getResources, updateResource } from '../data/resourceStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import { markResourceRead } from '../data/notificationStore';
import { incrementCommentCount } from '../data/commentStore';
import { getResourceContent, setResourceContent } from '../data/resourceContentStore';
import { setFileContent, getFileContent } from '../data/fileContentStore';
import {
  AnnotationLayer, RevisionCommentSidebar,
  type RevisionComment, type RevisionAnnotation,
  annoColor,
} from '../components/RevisionComments';
import type { Status } from '../types';
```

(Only the two new lines — `getResourceContent, setResourceContent` and `setFileContent, getFileContent` — are added; everything else is unchanged.)

- [ ] **Step 2: Add `fileId` to `MockImage` and a `resolveImageSrc` helper**

Replace the `MockImage` interface (lines 20-25) and add a helper right after it:

```tsx
interface MockImage {
  id: string;
  label: string;
  bg: string;
  fileId?: string; // référence fileContentStore pour les images uploadées
  aspect: string; // CSS aspect-ratio
}

// Résout l'URL affichable d'une image uploadée (fileContentStore), sinon undefined
// (les images de seed n'ont pas de fileId et gardent leur `bg` littéral en fallback).
function resolveImageSrc(img: MockImage): string | undefined {
  if (!img.fileId) return undefined;
  return getFileContent(img.fileId) ?? undefined;
}
```

- [ ] **Step 3: Add the persisted content type**

Right after the `STATUS_LABEL` constant (after line 46), add:

```tsx
interface ImageReviewContent {
  rounds?: LocalRound[];
  activeRound?: string;
  comments?: RevisionComment[];
}
```

- [ ] **Step 4: Update `ImageViewer` to use `resolveImageSrc`**

Replace the `ImageViewer` function body (lines 84-109):

```tsx
  const src = resolveImageSrc(image);
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', userSelect: 'none' }}>
      {/* Placeholder image */}
      <div style={{
        aspectRatio: image.aspect, width: '100%', position: 'relative',
        background: src ? 'var(--surface-2)' : image.bg,
      }}>
        {src ? (
          <img src={src} alt={image.label} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', position: 'absolute', inset: 0 }} />
        ) : (
          <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
            <SFIcon name="image" size={32} color="rgba(255,255,255,0.2)" />
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8, fontFamily: 'var(--ff-mono)' }}>{image.label}</p>
          </div>
        )}
        <AnnotationLayer
          comments={comments}
          activeId={activeId}
          onSelect={onActivate}
          drawing={drawing}
          onPlace={onPlace}
          assetId={image.id}
        />
      </div>
    </div>
  );
```

- [ ] **Step 5: Load persisted content and wire the persisted initial state**

In `export function ImageReview()`, right after the `resource` lookup (after line 119, before `localTitle` state), add:

```tsx
  const persisted = resourceId ? getResourceContent<ImageReviewContent>(resourceId) : undefined;
```

Then replace these three state initializers (lines 139, 140, 143):

```tsx
  const [rounds, setRounds] = useState<LocalRound[]>(persisted?.rounds ?? SEED_ROUNDS);
  const [activeRound, setActiveRound] = useState(persisted?.activeRound ?? SEED_ROUNDS[SEED_ROUNDS.length - 1].v);
```

and:

```tsx
  const [comments, setComments] = useState<RevisionComment[]>(persisted?.comments ?? []);
```

(All other state declarations on the surrounding lines — `selectedImageId`, `viewMode`, `activeCommentId`, `drawing`, `pendingAnno`, `addRoundOpen`, `deleteTarget`, `uploadModalOpen`, `isFullscreen`, `roundDropOpen`, `pendingFiles`, `isImgDragging`, `fileInputRef` — are unchanged.)

- [ ] **Step 6: Add the debounced persistence effect**

Right after the existing `useEffect(() => { if (resourceId) markResourceRead(resourceId); }, [resourceId]);` (line 169), add:

```tsx

  // ── Persistance du contenu de révision par ressource ───────────────────────
  const irPersistTimer = useRef<number | null>(null);
  const irMounted = useRef(false);
  const irSnapshotRef = useRef<ImageReviewContent | null>(null);
  useEffect(() => {
    const snapshot: ImageReviewContent = { rounds, activeRound, comments };
    irSnapshotRef.current = snapshot;
    if (!resourceId) return;
    if (!irMounted.current) { irMounted.current = true; return; } // ne pas écrire au montage
    if (irPersistTimer.current) clearTimeout(irPersistTimer.current);
    irPersistTimer.current = window.setTimeout(() => setResourceContent(resourceId, snapshot), 400);
  }, [resourceId, rounds, activeRound, comments]);
  // Flush la dernière modification en attente au démontage.
  useEffect(() => () => {
    if (resourceId && irPersistTimer.current && irSnapshotRef.current) {
      clearTimeout(irPersistTimer.current);
      setResourceContent(resourceId, irSnapshotRef.current);
    }
  }, [resourceId]);
```

- [ ] **Step 7: Migrate the 3 upload sites to `fileContentStore`**

Replace `dropImagesToActive` (lines 157-167):

```tsx
  const dropImagesToActive = (files: File[]) => {
    const imgs = files.filter(f => f.type.startsWith('image/'));
    if (!imgs.length) return;
    const newImages: MockImage[] = imgs.map((f, i) => {
      const fileId = `img-${resourceId}-${Date.now()}-${i}`;
      setFileContent(fileId, f);
      return {
        id: `upload-${Date.now()}-${i}`,
        label: f.name.replace(/\.[^.]+$/, ''),
        bg: 'var(--surface-2)',
        fileId,
        aspect: '4/3',
      };
    });
    setRounds(prev => prev.map(r => r.v === activeRound ? { ...r, images: [...r.images, ...newImages] } : r));
  };
```

Replace `addFilesToRound` (lines 183-197):

```tsx
  const addFilesToRound = (targetRound: string) => {
    const newImages: MockImage[] = pendingFiles.map((f, i) => {
      const fileId = `img-${resourceId}-${Date.now()}-${i}`;
      setFileContent(fileId, f);
      return {
        id: `upload-${Date.now()}-${i}`,
        label: f.name.replace(/\.[^.]+$/, ''),
        bg: 'var(--surface-2)',
        fileId,
        aspect: '4/3',
      };
    });
    setRounds(prev => prev.map(r => r.v === targetRound
      ? { ...r, images: [...r.images, ...newImages] }
      : r
    ));
    setPendingFiles([]);
    setUploadModalOpen(false);
  };
```

Replace `addFilesAsNewRound` (lines 199-215):

```tsx
  const addFilesAsNewRound = () => {
    const next = `R${rounds.length + 1}`;
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const newImages: MockImage[] = pendingFiles.map((f, i) => {
      const fileId = `img-${resourceId}-${Date.now()}-${i}`;
      setFileContent(fileId, f);
      return {
        id: `upload-${Date.now()}-${i}`,
        label: f.name.replace(/\.[^.]+$/, ''),
        bg: 'var(--surface-2)',
        fileId,
        aspect: '4/3',
      };
    });
    setRounds(prev => [...prev, {
      v: next, label: `Ronde ${rounds.length + 1}`, date: today,
      author: USERS.lea, status: 'review', images: newImages,
    }]);
    setActiveRound(next);
    setPendingFiles([]);
    setUploadModalOpen(false);
  };
```

- [ ] **Step 8: Update the gallery grid tile to use `resolveImageSrc`**

Inside the gallery grid `.map(img => ...)` block, the tile currently checks `img.bg.startsWith('blob:') || img.bg.startsWith('data:')` (lines 468-477):

```tsx
                        {/* Fill the grid cell completely */}
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                          {img.bg.startsWith('blob:') || img.bg.startsWith('data:') ? (
                            <img src={img.bg} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: img.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <SFIcon name="image" size={28} color="rgba(255,255,255,0.15)" />
                            </div>
                          )}
                        </div>
```

Replace with:

```tsx
                        {/* Fill the grid cell completely */}
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                          {resolveImageSrc(img) ? (
                            <img src={resolveImageSrc(img)} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: img.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <SFIcon name="image" size={28} color="rgba(255,255,255,0.15)" />
                            </div>
                          )}
                        </div>
```

- [ ] **Step 9: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/ImageReview.tsx"`
Expected: no output.

- [ ] **Step 10: Commit**

```bash
git add app/src/screens/ImageReview.tsx
git commit -m "feat: persist ImageReview content and store uploaded images via fileContentStore"
```

---

### Task 2: `DocumentReview.tsx` — persistence

**Files:**
- Modify: `app/src/screens/DocumentReview.tsx`

**Interfaces:**
- Consumes: `getResourceContent<T>(resourceId: string): T | undefined`, `setResourceContent<T>(resourceId: string, content: T): void` from `app/src/data/resourceContentStore.ts`. (`setFileContent`/`getFileContent` from `fileContentStore` are already imported in this file — no change needed there.)
- Produces: nothing consumed by other tasks.

- [ ] **Step 1: Add the resourceContentStore import**

In `app/src/screens/DocumentReview.tsx`, the current imports are (lines 1-15):

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFButton, SFIcon } from '../components/ui';
import { USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import { getResources, updateResource } from '../data/resourceStore';
import { setFileContent, getFileContent } from '../data/fileContentStore';
import { markResourceRead } from '../data/notificationStore';
import { incrementCommentCount } from '../data/commentStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import {
  AnnotationLayer, RevisionCommentSidebar,
  type RevisionComment, type RevisionAnnotation,
} from '../components/RevisionComments';
import type { Status } from '../types';
```

Add `import { getResourceContent, setResourceContent } from '../data/resourceContentStore';` right after the `fileContentStore` import line:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFButton, SFIcon } from '../components/ui';
import { USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import { getResources, updateResource } from '../data/resourceStore';
import { setFileContent, getFileContent } from '../data/fileContentStore';
import { getResourceContent, setResourceContent } from '../data/resourceContentStore';
import { markResourceRead } from '../data/notificationStore';
import { incrementCommentCount } from '../data/commentStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import {
  AnnotationLayer, RevisionCommentSidebar,
  type RevisionComment, type RevisionAnnotation,
} from '../components/RevisionComments';
import type { Status } from '../types';
```

- [ ] **Step 2: Add the persisted content type**

Right after the `fmtSize` helper function (after line 83, before the `UploadModal` component), add:

```tsx
interface DocumentReviewContent {
  rounds?: DocRound[];
  activeRound?: string;
  comments?: RevisionComment[];
  currentPage?: number;
}
```

- [ ] **Step 3: Load persisted content and wire the persisted initial state**

In `export function DocumentReview()`, right after the `resource` lookup (after line 187, before `localTitle` state), add:

```tsx
  const persisted = resourceId ? getResourceContent<DocumentReviewContent>(resourceId) : undefined;
```

Then replace these state initializers (lines 207, 208, 210, 212):

```tsx
  const [rounds, setRounds] = useState<DocRound[]>(persisted?.rounds ?? INITIAL_ROUNDS);
  const [activeRound, setActiveRound] = useState(persisted?.activeRound ?? INITIAL_ROUNDS[INITIAL_ROUNDS.length - 1].v);
```

```tsx
  const [currentPage, setCurrentPage] = useState(persisted?.currentPage ?? 1);
```

```tsx
  const [comments, setComments] = useState<RevisionComment[]>(persisted?.comments ?? []);
```

(All other state on the surrounding lines — `isDocDragging`, `viewMode`, `activeCommentId`, `drawing`, `pendingAnno`, `deleteTarget`, `pendingUpload`, `pageInput`, `isFullscreen`, `darkPage`, `versionDropOpen`, `fileInputRef`, `scrollRef`, `rightTab`, `aiMessages`, `aiInput`, `aiLoading`, `aiListening`, `aiModel`, and the associated refs — are unchanged, per the spec's decision to leave the AI panel and its active tab non-persisted.)

- [ ] **Step 4: Add the debounced persistence effect**

Right after the existing `useEffect(() => { if (resourceId) markResourceRead(resourceId); }, [resourceId]);` (line 236), add:

```tsx

  // ── Persistance du contenu de révision par ressource ───────────────────────
  const drPersistTimer = useRef<number | null>(null);
  const drMounted = useRef(false);
  const drSnapshotRef = useRef<DocumentReviewContent | null>(null);
  useEffect(() => {
    const snapshot: DocumentReviewContent = { rounds, activeRound, comments, currentPage };
    drSnapshotRef.current = snapshot;
    if (!resourceId) return;
    if (!drMounted.current) { drMounted.current = true; return; } // ne pas écrire au montage
    if (drPersistTimer.current) clearTimeout(drPersistTimer.current);
    drPersistTimer.current = window.setTimeout(() => setResourceContent(resourceId, snapshot), 400);
  }, [resourceId, rounds, activeRound, comments, currentPage]);
  // Flush la dernière modification en attente au démontage.
  useEffect(() => () => {
    if (resourceId && drPersistTimer.current && drSnapshotRef.current) {
      clearTimeout(drPersistTimer.current);
      setResourceContent(resourceId, drSnapshotRef.current);
    }
  }, [resourceId]);
```

- [ ] **Step 5: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/DocumentReview.tsx"`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/DocumentReview.tsx
git commit -m "feat: persist DocumentReview content (rounds, comments, current page)"
```

---

### Task 3: Manual end-to-end verification

**Files:** none (no code changes — browser verification only).

**Interfaces:** none.

- [ ] **Step 1: Verify ImageReview**

Via the Preview tool: sign in, navigate to a project's Fichiers, open (or create) an image resource so it routes to `/projets/:id/ressources/:resourceId` and renders `ImageReview`. Drag-and-drop an image file onto the drop zone. Confirm it appears in the gallery grid. Switch to single view, add a comment. Reload the page (`window.location.reload()` via `preview_eval`, or navigate away and back). Confirm: the uploaded image is still visible (not broken), the comment is still present, and the active round/view state is preserved.

- [ ] **Step 2: Verify DocumentReview**

Navigate to a document resource so it routes to `DocumentReview`. Drag-and-drop a PDF or image file. Navigate to page 2 (if the mock has multiple pages). Add a comment. Reload the page. Confirm: the uploaded file is still visible, `currentPage` is still 2, and the comment is still present.

- [ ] **Step 3: Confirm no regressions in existing wired editors**

Spot-check one already-wired editor (e.g. `VideoReview` on `/projets/:id/ressources/:resourceId` for a video resource) still persists correctly after this change — this task modifies unrelated files, so no regression is expected, but this step confirms `resourceContentStore`/`fileContentStore` weren't accidentally broken by an import or type change.

- [ ] **Step 4: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Compare against the pre-task baseline error count (record it before Task 1 starts). Expected: same count or lower — zero new errors in `ImageReview.tsx` or `DocumentReview.tsx`.

- [ ] **Step 5: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep -A5 "ImageReview.tsx\|DocumentReview.tsx"`
Expected: no new findings (compare any output against the merge-base version of each file, since this repo has pre-existing lint debt unrelated to this change).
