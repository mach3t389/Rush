# Composant SFModal partagé — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Create a shared `SFModal` component in `app/src/components/ui/` for the "centered dialog with dimmed backdrop" pattern, and migrate 9 confirmed hand-rolled instances of this exact pattern across 6 files onto it — standardizing border-radius, backdrop opacity, and shadow, and adding real Escape-key-to-close support (currently absent everywhere).

**Architecture:** `SFModal` is a `children`-based component (no rigid header/footer slot API) so migration is a mechanical wrapper swap: replace the existing `fixed+backdrop+box` JSX with `<SFModal>`, keep all inner content (titles, forms, buttons) untouched. An optional `title` prop renders a standard title+close-X header for the simple cases; modals with richer custom headers omit `title` and keep rendering their own header as children.

**Tech Stack:** React 19 + TypeScript, no new dependencies.

## Global Constraints

- No automated test suite in this repo — verification is via the Preview browser tool and `npx tsc --noEmit -p tsconfig.app.json` (the bare `tsc --noEmit` is a false pass in this repo — the root tsconfig is a project-references-only stub; always use `-p tsconfig.app.json`).
- All user-facing text must already go through `t()` — this plan does not add any new user-facing strings.
- **Scope is limited to the 9 confirmed sites below.** Drawers/side-panels (`MonEquipe.tsx`, `ProfileEditPanel.tsx`, the panel at `TravailOverview.tsx:167-170`), anchored dropdown/popover menus, and the larger creation-modals in `Modeles.tsx`/`FichiersGlobal.tsx` are explicitly OUT OF SCOPE — do not touch them.
- Standardized values (replace the varied 10/14/16/18 border-radius, 0.45/0.5/0.55 backdrop opacity, and varied box-shadow opacities found across sites): `borderRadius: 14`, backdrop `rgba(0,0,0,0.5)`, `boxShadow: '0 16px 48px rgba(0,0,0,0.6)'`. Do not preserve the old per-site values — the whole point of this component is to stop that variation.

---

### Task 1: Create `SFModal` component

**Files:**
- Create: `app/src/components/ui/SFModal.tsx`
- Modify: `app/src/components/ui/index.ts`

**Interfaces:**
- Produces: `export function SFModal({ open, onClose, title, width, maxHeight, zIndex, padding, closeOnBackdrop, closeOnEscape, children }: SFModalProps): JSX.Element | null`. Tasks 2-6 all consume this exact signature.

- [ ] **Step 1: Create the component**

```tsx
import { useEffect, type ReactNode } from 'react';
import { SFIcon } from './SFIcon';

interface SFModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number | string;
  maxHeight?: string;
  zIndex?: number;
  padding?: number | string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
}

export function SFModal({
  open,
  onClose,
  title,
  width = 400,
  maxHeight,
  zIndex = 400,
  padding = 24,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
}: SFModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={closeOnBackdrop ? onClose : undefined} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)',
        borderRadius: 14, padding, width, maxHeight,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        overflow: maxHeight ? 'hidden' : 'visible',
      }}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>{title}</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}>
              <SFIcon name="x" size={15} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Export it from the barrel file**

In `app/src/components/ui/index.ts`, replace:

```ts
export { SFIcon } from './SFIcon';
export { SFPill } from './SFPill';
export { SFButton } from './SFButton';
export { SFCard } from './SFCard';
export { SFAvatar, SFAvatarGroup } from './SFAvatar';
export { SFBar } from './SFBar';
export { DatePickerDropdown, TimePickerDropdown, TimeButton, TaskDatePopover, toYMD, parseYMD, formatDisplay, fmtTaskDate, isOverdue, dueDateColor, TODAY_DP, FR_MONTHS } from './DatePicker';
```

with:

```ts
export { SFIcon } from './SFIcon';
export { SFPill } from './SFPill';
export { SFButton } from './SFButton';
export { SFCard } from './SFCard';
export { SFAvatar, SFAvatarGroup } from './SFAvatar';
export { SFBar } from './SFBar';
export { SFModal } from './SFModal';
export { DatePickerDropdown, TimePickerDropdown, TimeButton, TaskDatePopover, toYMD, parseYMD, formatDisplay, fmtTaskDate, isOverdue, dueDateColor, TODAY_DP, FR_MONTHS } from './DatePicker';
```

- [ ] **Step 3: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "components/ui/SFModal.tsx"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git add app/src/components/ui/SFModal.tsx app/src/components/ui/index.ts
git commit -m "feat: add shared SFModal component for centered dialogs"
```

---

### Task 2: Migrate `ImageReview.tsx` (3 sites)

**Files:**
- Modify: `app/src/screens/ImageReview.tsx`

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (Task 1).

- [ ] **Step 1: Add the import**

Find the existing import line:

```tsx
import { SFAvatar, SFButton, SFIcon } from '../components/ui';
```

Replace with:

```tsx
import { SFAvatar, SFButton, SFIcon, SFModal } from '../components/ui';
```

- [ ] **Step 2: Migrate the "add round" modal**

Replace:

```tsx
      {/* Add round modal */}
      {addRoundOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setAddRoundOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{t('review.newReviewRound')}</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              {t('review.newRoundDesc', { round: `R${rounds.length + 1}` })}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="secondary" onClick={() => setAddRoundOpen(false)}>{t('review.cancel')}</SFButton>
              <SFButton variant="primary" icon="plus" onClick={addRound}>{t('review.createRound')}</SFButton>
            </div>
          </div>
        </div>
      )}
```

with:

```tsx
      {/* Add round modal */}
      <SFModal open={addRoundOpen} onClose={() => setAddRoundOpen(false)} width={360}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>{t('review.newReviewRound')}</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
          {t('review.newRoundDesc', { round: `R${rounds.length + 1}` })}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="secondary" onClick={() => setAddRoundOpen(false)}>{t('review.cancel')}</SFButton>
          <SFButton variant="primary" icon="plus" onClick={addRound}>{t('review.createRound')}</SFButton>
        </div>
      </SFModal>
```

- [ ] **Step 3: Migrate the "upload" modal**

Replace:

```tsx
      {/* Upload modal */}
      {uploadModalOpen && pendingFiles.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => { setUploadModalOpen(false); setPendingFiles([]); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.65)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
              {t('review.imagesToAdd', { count: pendingFiles.length })}
            </h3>
            {/* File list preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 160, overflowY: 'auto' }}>
              {pendingFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 36, height: 28, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-3)' }}>
                    <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 1 }}>
                      {f.size >= 1e6 ? `${(f.size / 1e6).toFixed(1)} Mo` : `${Math.round(f.size / 1e3)} Ko`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>{t('review.whereToAddImages')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => addFilesToRound(activeRound)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <SFIcon name="layers" size={18} color="var(--text-2)" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('review.currentRound', { label: round.label })}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('review.addImagesToThisRound')}</p>
                </div>
              </button>
              <button onClick={addFilesAsNewRound} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <SFIcon name="plus-circle" size={18} color="var(--text-2)" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Nouvelle ronde (R{rounds.length + 1})</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Crée une nouvelle ronde avec ces images</p>
                </div>
              </button>
            </div>
            <button onClick={() => { setUploadModalOpen(false); setPendingFiles([]); }} style={{ marginTop: 16, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}
```

with:

```tsx
      {/* Upload modal */}
      <SFModal open={uploadModalOpen && pendingFiles.length > 0} onClose={() => { setUploadModalOpen(false); setPendingFiles([]); }} width={380}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
          {t('review.imagesToAdd', { count: pendingFiles.length })}
        </h3>
        {/* File list preview */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 160, overflowY: 'auto' }}>
          {pendingFiles.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <div style={{ width: 36, height: 28, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-3)' }}>
                <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 1 }}>
                  {f.size >= 1e6 ? `${(f.size / 1e6).toFixed(1)} Mo` : `${Math.round(f.size / 1e3)} Ko`}
                </p>
              </div>
            </div>
          ))}
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>{t('review.whereToAddImages')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={() => addFilesToRound(activeRound)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
            <SFIcon name="layers" size={18} color="var(--text-2)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{t('review.currentRound', { label: round.label })}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('review.addImagesToThisRound')}</p>
            </div>
          </button>
          <button onClick={addFilesAsNewRound} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
            <SFIcon name="plus-circle" size={18} color="var(--text-2)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Nouvelle ronde (R{rounds.length + 1})</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Crée une nouvelle ronde avec ces images</p>
            </div>
          </button>
        </div>
        <button onClick={() => { setUploadModalOpen(false); setPendingFiles([]); }} style={{ marginTop: 16, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
          Annuler
        </button>
      </SFModal>
```

**Note:** the original code guarded the whole block on `uploadModalOpen && pendingFiles.length > 0`. `SFModal`'s `open` prop takes that same boolean expression directly — behavior is unchanged (still renders nothing when either condition is false).

- [ ] **Step 4: Migrate the "delete round" confirmation**

Replace:

```tsx
      {/* Delete round confirmation */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Supprimer la ronde ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              La ronde <strong>{rounds.find(r => r.v === deleteTarget)?.label}</strong> et toutes ses images seront supprimées.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</SFButton>
              <SFButton variant="primary" style={{ background: 'var(--danger)', color: 'white' }} onClick={() => deleteRound(deleteTarget!)}>Supprimer</SFButton>
            </div>
          </div>
        </div>
      )}
```

with:

```tsx
      {/* Delete round confirmation */}
      <SFModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} width={340}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Supprimer la ronde ?</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
          La ronde <strong>{rounds.find(r => r.v === deleteTarget)?.label}</strong> et toutes ses images seront supprimées.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</SFButton>
          <SFButton variant="primary" style={{ background: 'var(--danger)', color: 'white' }} onClick={() => deleteRound(deleteTarget!)}>Supprimer</SFButton>
        </div>
      </SFModal>
```

- [ ] **Step 5: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/ImageReview.tsx"`
Expected: no NEW output compared to the pre-task baseline (compare against `git show <base-commit>:app/src/screens/ImageReview.tsx` piped through the same command if unsure).

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/ImageReview.tsx
git commit -m "refactor: migrate ImageReview modals to shared SFModal"
```

---

### Task 3: Migrate `DocumentReview.tsx` (2 sites)

**Files:**
- Modify: `app/src/screens/DocumentReview.tsx`

**Interfaces:**
- Consumes: `SFModal` from `../components/ui`.

- [ ] **Step 1: Add the import**

Find the existing import:

```tsx
import { SFButton, SFIcon } from '../components/ui';
```

Replace with:

```tsx
import { SFButton, SFIcon, SFModal } from '../components/ui';
```

- [ ] **Step 2: Migrate `UploadModal`**

Replace:

```tsx
function UploadModal({
  pending,
  roundCount,
  onAddToVersion,
  onNewVersion,
  onClose,
}: {
  pending: UploadedFile;
  roundCount: number;
  onAddToVersion: () => void;
  onNewVersion: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.65)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Fichier à ajouter</h3>

        {/* File chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', marginBottom: 20 }}>
          <SFIcon name="file-text" size={20} color="var(--accent)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pending.name}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{fmtSize(pending.size)}</p>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>Où souhaitez-vous ajouter ce fichier ?</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onAddToVersion} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left',
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SFIcon name="layers" size={18} color="var(--text-2)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Version actuelle (V{roundCount})</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Remplace le fichier de cette version</p>
            </div>
          </button>
          <button onClick={onNewVersion} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left',
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SFIcon name="plus-circle" size={18} color="var(--text-2)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Nouvelle version (V{roundCount + 1})</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Crée une nouvelle version avec ce fichier</p>
            </div>
          </button>
        </div>

        <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
          Annuler
        </button>
      </div>
    </div>
  );
}
```

with:

```tsx
function UploadModal({
  pending,
  roundCount,
  onAddToVersion,
  onNewVersion,
  onClose,
}: {
  pending: UploadedFile;
  roundCount: number;
  onAddToVersion: () => void;
  onNewVersion: () => void;
  onClose: () => void;
}) {
  return (
    <SFModal open onClose={onClose} width={380}>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Fichier à ajouter</h3>

      {/* File chip */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', marginBottom: 20 }}>
        <SFIcon name="file-text" size={20} color="var(--accent)" />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pending.name}</p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{fmtSize(pending.size)}</p>
        </div>
      </div>

      <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>Où souhaitez-vous ajouter ce fichier ?</p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <button onClick={onAddToVersion} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left',
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <SFIcon name="layers" size={18} color="var(--text-2)" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Version actuelle (V{roundCount})</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Remplace le fichier de cette version</p>
          </div>
        </button>
        <button onClick={onNewVersion} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
          border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left',
        }}
          onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
        >
          <SFIcon name="plus-circle" size={18} color="var(--text-2)" />
          <div>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Nouvelle version (V{roundCount + 1})</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Crée une nouvelle version avec ce fichier</p>
          </div>
        </button>
      </div>

      <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
        Annuler
      </button>
    </SFModal>
  );
}
```

**Note:** `UploadModal` is only ever rendered from its call site (around line 894) inside a `{pendingUpload && (<UploadModal .../>)}` guard — so the component itself is never mounted when it shouldn't be visible, meaning `open` can safely be the literal `true` here (shorthand for `open={true}`).

- [ ] **Step 3: Migrate the "delete version" confirmation**

Replace:

```tsx
      {/* Delete version confirmation */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Supprimer la version ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              La <strong>{rounds.find(r => r.v === deleteTarget)?.label}</strong> et tous ses commentaires seront supprimés.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</SFButton>
              <SFButton variant="primary" style={{ background: 'var(--danger)', color: 'white' }} onClick={() => deleteRound(deleteTarget!)}>Supprimer</SFButton>
            </div>
          </div>
        </div>
      )}
```

with:

```tsx
      {/* Delete version confirmation */}
      <SFModal open={!!deleteTarget} onClose={() => setDeleteTarget(null)} width={340}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Supprimer la version ?</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
          La <strong>{rounds.find(r => r.v === deleteTarget)?.label}</strong> et tous ses commentaires seront supprimés.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</SFButton>
          <SFButton variant="primary" style={{ background: 'var(--danger)', color: 'white' }} onClick={() => deleteRound(deleteTarget!)}>Supprimer</SFButton>
        </div>
      </SFModal>
```

- [ ] **Step 4: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/DocumentReview.tsx"`
Expected: no NEW output compared to the pre-task baseline.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/DocumentReview.tsx
git commit -m "refactor: migrate DocumentReview modals to shared SFModal"
```

---

### Task 4: Migrate `ProjectTaskRow.tsx` and `Travail.tsx` (near-identical `MoveTaskModal`, 2 sites)

**Files:**
- Modify: `app/src/components/ProjectTaskRow.tsx`
- Modify: `app/src/screens/Travail.tsx`

**Interfaces:**
- Consumes: `SFModal` from `../components/ui` (relative path differs per file's location — see each step).

Both files contain a `MoveTaskModal` component with an almost-identical body (same header/close-X/section-list shape). Migrate both in this one task since each change is small and mechanical.

- [ ] **Step 1: `ProjectTaskRow.tsx` — add the import**

In `app/src/components/ProjectTaskRow.tsx`, replace:

```tsx
import { SFPill, SFAvatar, SFIcon, DatePickerDropdown, parseYMD, formatDisplay, isOverdue } from './ui';
```

with:

```tsx
import { SFPill, SFAvatar, SFIcon, SFModal, DatePickerDropdown, parseYMD, formatDisplay, isOverdue } from './ui';
```

- [ ] **Step 2: `ProjectTaskRow.tsx` — migrate `MoveTaskModal`**

Replace:

```tsx
export function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '20px', minWidth: 320, maxWidth: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t('taskPanel.moveTask')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--ff-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('taskPanel.taskLabel', { title: task.title })}</p>
        <div style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, marginTop: 14 }}>{t('taskPanel.availableSections')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sections.map(s => (
            <button
              key={s.label}
              onClick={() => { onMove(s.label); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <SFIcon name="layers" size={13} color="var(--text-3)" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('taskPanel.taskCount', { count: s.tasks.length })}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

with:

```tsx
export function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <SFModal open onClose={onClose} title={t('taskPanel.moveTask')} width={400}>
      <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--ff-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('taskPanel.taskLabel', { title: task.title })}</p>
      <div style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, marginTop: 14 }}>{t('taskPanel.availableSections')}</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {sections.map(s => (
          <button
            key={s.label}
            onClick={() => { onMove(s.label); onClose(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SFIcon name="layers" size={13} color="var(--text-3)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('taskPanel.taskCount', { count: s.tasks.length })}</p>
            </div>
          </button>
        ))}
      </div>
    </SFModal>
  );
}
```

**Note:** the original wrapper used `minWidth: 320, maxWidth: 400` (a flexible range); `SFModal` only supports a fixed `width`. Using `width={400}` (the original `maxWidth`) is the closest single-value equivalent and keeps the content comfortably readable — this is a minor, acceptable visual simplification consistent with the plan's standardization goal, not a functional change.

- [ ] **Step 3: `Travail.tsx` — add the import**

In `app/src/screens/Travail.tsx`, replace:

```tsx
import { SFPill, SFAvatar, SFBar, SFButton, SFIcon, TaskDatePopover, DatePickerDropdown, TimePickerDropdown, TimeButton, toYMD, parseYMD, fmtTaskDate, formatDisplay, isOverdue, TODAY_DP } from '../components/ui';
```

with:

```tsx
import { SFPill, SFAvatar, SFBar, SFButton, SFIcon, SFModal, TaskDatePopover, DatePickerDropdown, TimePickerDropdown, TimeButton, toYMD, parseYMD, fmtTaskDate, formatDisplay, isOverdue, TODAY_DP } from '../components/ui';
```

- [ ] **Step 4: `Travail.tsx` — migrate `MoveTaskModal`**

Replace:

```tsx
function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
  const otherSections = sections;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '20px', minWidth: 320, maxWidth: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>Déplacer la tâche</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--ff-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10 as unknown as number }}>Tâche : {task.title}</p>
        <div style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, marginTop: 14 }}>Sections disponibles</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {otherSections.map(s => (
            <button
              key={s.label}
              onClick={() => { onMove(s.label); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <SFIcon name="layers" size={13} color="var(--text-3)" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{s.tasks.length} tâche{s.tasks.length !== 1 ? 's' : ''}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
```

with:

```tsx
function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
  const otherSections = sections;
  return (
    <SFModal open onClose={onClose} title="Déplacer la tâche" width={400}>
      <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--ff-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Tâche : {task.title}</p>
      <div style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, marginTop: 14 }}>Sections disponibles</div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {otherSections.map(s => (
          <button
            key={s.label}
            onClick={() => { onMove(s.label); onClose(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.1s' }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SFIcon name="layers" size={13} color="var(--text-3)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</p>
              <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{s.tasks.length} tâche{s.tasks.length !== 1 ? 's' : ''}</p>
            </div>
          </button>
        ))}
      </div>
    </SFModal>
  );
}
```

**Note:** the original had a duplicate `fontSize` key in the "Tâche : {task.title}" paragraph's style object (`fontSize: 12, ..., fontSize: 10 as unknown as number` — the second one wins at runtime, an object-literal-duplicate-key bug). The rewritten version keeps only the effective value (`fontSize: 10`) and drops the dead first key and the `as unknown as number` cast, matching what the browser actually rendered before — this is a corrected pre-existing bug encountered during a verbatim copy, not a behavior change (no visible difference; still 10, still the pre-existing dead code removed).

- [ ] **Step 5: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "components/ProjectTaskRow.tsx|screens/Travail.tsx"`
Expected: no NEW output compared to the pre-task baseline for either file.

- [ ] **Step 6: Commit**

```bash
git add app/src/components/ProjectTaskRow.tsx app/src/screens/Travail.tsx
git commit -m "refactor: migrate ProjectTaskRow and Travail MoveTaskModal to shared SFModal"
```

---

### Task 5: Migrate `ProjectMembres.tsx` (`AddMemberModal`)

**Files:**
- Modify: `app/src/screens/ProjectMembres.tsx`

**Interfaces:**
- Consumes: `SFModal` from `../components/ui`.

- [ ] **Step 1: Add the import**

Find the existing import:

```tsx
import { SFAvatar, SFIcon, SFButton } from '../components/ui';
```

Replace with:

```tsx
import { SFAvatar, SFIcon, SFButton, SFModal } from '../components/ui';
```

- [ ] **Step 2: Migrate `AddMemberModal`'s wrapper**

This modal's body (the search input, the internal/external member lists, the permission presets, the footer) is long and entirely UNCHANGED by this task — only the outer wrapper (the two lines that build `fixed+backdrop+box` and its matching closing tags) needs to change.

Replace the opening of the function's return statement:

```tsx
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)',
        border: '1px solid var(--border-2)', borderRadius: 16,
        padding: '20px', width: 360, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t('members.addToTeam')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
```

with:

```tsx
  return (
    <SFModal open onClose={onClose} title={t('members.addToTeam')} width={360} maxHeight="70vh">
        <div style={{ position: 'relative', marginBottom: 12 }}>
```

And replace the function's closing tags — find:

```tsx
        {/* Footer confirm */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
            {t('members.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={picked.size === 0}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', cursor: picked.size === 0 ? 'not-allowed' : 'pointer',
              background: picked.size === 0 ? 'var(--surface-3)' : 'var(--accent)',
              color: picked.size === 0 ? 'var(--text-3)' : 'var(--on-accent)',
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--ff-text)', transition: 'background 0.1s',
            }}
          >
            {picked.size > 1 ? t('members.addCount', { count: picked.size }) : t('members.add')}
          </button>
        </div>
      </div>
    </div>
  );
}
```

with:

```tsx
        {/* Footer confirm */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
            {t('members.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={picked.size === 0}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', cursor: picked.size === 0 ? 'not-allowed' : 'pointer',
              background: picked.size === 0 ? 'var(--surface-3)' : 'var(--accent)',
              color: picked.size === 0 ? 'var(--text-3)' : 'var(--on-accent)',
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--ff-text)', transition: 'background 0.1s',
            }}
          >
            {picked.size > 1 ? t('members.addCount', { count: picked.size }) : t('members.add')}
          </button>
        </div>
    </SFModal>
  );
}
```

**Note:** everything between `<div style={{ position: 'relative', marginBottom: 12 }}>` (the search box) and the "Footer confirm" comment — the internal/external member lists, the empty-state message, and the permission presets grid — is NOT shown again here because it does not change at all; only the two ends of the JSX tree (the opening wrapper and the closing tags) are touched by this task.

- [ ] **Step 3: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/ProjectMembres.tsx"`
Expected: no NEW output compared to the pre-task baseline.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/ProjectMembres.tsx
git commit -m "refactor: migrate ProjectMembres AddMemberModal to shared SFModal"
```

---

### Task 6: Migrate `TravailOverview.tsx` (`FormResponseModal`)

**Files:**
- Modify: `app/src/screens/TravailOverview.tsx`

**Interfaces:**
- Consumes: `SFModal` from `../components/ui`.

**Note on scope:** `TravailOverview.tsx` has TWO overlay patterns in this file — a slide-in side panel (around line 167-170, using `alignItems: 'stretch'` and `marginLeft: 'auto'`) which is OUT OF SCOPE (it's a drawer, not a centered dialog — do not touch it), and the `FormResponseModal` centered dialog (around line 308-359) which IS in scope. Only migrate `FormResponseModal`.

This modal has a custom two-line header (title + response-count subtitle) that does not fit `SFModal`'s single-string `title` prop, so it keeps rendering its own header as a child — `SFModal` is used here with `padding={0}` (since the header and body sections each manage their own padding for the full-bleed border-bottom under the header and under the response-tabs row) and no `title` prop.

- [ ] **Step 1: Add the import**

In `app/src/screens/TravailOverview.tsx`, replace:

```tsx
import { SFPill, SFBar, SFAvatar, SFButton, SFIcon } from '../components/ui';
```

with:

```tsx
import { SFPill, SFBar, SFAvatar, SFButton, SFIcon, SFModal } from '../components/ui';
```

- [ ] **Step 2: Migrate `FormResponseModal`**

Replace:

```tsx
function FormResponseModal({ form, onClose }: { form: ProjectForm; onClose: () => void }) {
  const { t } = useTranslation();
  const [activeResponse, setActiveResponse] = useState(0);
  const resp = form.responses[activeResponse];
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 18, width: 560, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 20px 60px rgba(0,0,0,0.7)' }}>
        <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{form.title}</h3>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('overview.responseCount', { count: form.responses.length })}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 6 }}><SFIcon name="x" size={16} /></button>
        </div>
        {form.responses.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t('overview.noResponsesYet')}</div>
        ) : (
          <>
            {form.responses.length > 1 && (
              <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
                {form.responses.map((r, i) => (
                  <button key={r.id} onClick={() => setActiveResponse(i)}
                    style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: activeResponse === i ? 'var(--surface-3)' : 'transparent', color: activeResponse === i ? 'var(--text)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                    {r.respondent.split(' (')[0]}
                  </button>
                ))}
              </div>
            )}
            <div style={{ overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <SFIcon name="user" size={14} color="var(--text-3)" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{resp.respondent}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('overview.submittedOn', { date: resp.submittedAt })}</p>
                </div>
              </div>
              {form.fields.map(field => (
                <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{field.label}</span>
                  <div style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13, color: resp.answers[field.id] ? 'var(--text)' : 'var(--text-3)', fontStyle: resp.answers[field.id] ? 'normal' : 'italic' }}>
                    {resp.answers[field.id] || t('overview.noAnswer')}
                  </div>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}
```

with:

```tsx
function FormResponseModal({ form, onClose }: { form: ProjectForm; onClose: () => void }) {
  const { t } = useTranslation();
  const [activeResponse, setActiveResponse] = useState(0);
  const resp = form.responses[activeResponse];
  return (
    <SFModal open onClose={onClose} width={560} maxHeight="80vh" padding={0}>
      <div style={{ padding: '18px 24px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{form.title}</h3>
          <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('overview.responseCount', { count: form.responses.length })}</p>
        </div>
        <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 6 }}><SFIcon name="x" size={16} /></button>
      </div>
      {form.responses.length === 0 ? (
        <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t('overview.noResponsesYet')}</div>
      ) : (
        <>
          {form.responses.length > 1 && (
            <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexShrink: 0 }}>
              {form.responses.map((r, i) => (
                <button key={r.id} onClick={() => setActiveResponse(i)}
                  style={{ padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: activeResponse === i ? 'var(--surface-3)' : 'transparent', color: activeResponse === i ? 'var(--text)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                  {r.respondent.split(' (')[0]}
                </button>
              ))}
            </div>
          )}
          <div style={{ overflow: 'auto', padding: '20px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
              <SFIcon name="user" size={14} color="var(--text-3)" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600 }}>{resp.respondent}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('overview.submittedOn', { date: resp.submittedAt })}</p>
              </div>
            </div>
            {form.fields.map(field => (
              <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{field.label}</span>
                <div style={{ padding: '8px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', fontSize: 13, color: resp.answers[field.id] ? 'var(--text)' : 'var(--text-3)', fontStyle: resp.answers[field.id] ? 'normal' : 'italic' }}>
                  {resp.answers[field.id] || t('overview.noAnswer')}
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </SFModal>
  );
}
```

- [ ] **Step 3: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "screens/TravailOverview.tsx"`
Expected: no NEW output compared to the pre-task baseline.

- [ ] **Step 4: Commit**

```bash
git add app/src/screens/TravailOverview.tsx
git commit -m "refactor: migrate TravailOverview FormResponseModal to shared SFModal"
```

---

### Task 7: Manual end-to-end verification

**Files:** none (no code changes — browser verification only).

**Interfaces:** none.

- [ ] **Step 1: Confirm the out-of-scope drawer in `TravailOverview.tsx` is untouched**

Run: `git diff <merge-base>..HEAD -- app/src/screens/TravailOverview.tsx | grep -c "alignItems: 'stretch'"`
Expected: this line should not appear in the diff at all (search the diff for context lines only, not `+`/`-` changes) — confirm the drawer's wrapper JSX (around the original line 167-170) has zero changes.

- [ ] **Step 2: Manual browser sweep**

Via the Preview tool, sign in and exercise each of the 9 migrated dialogs:
- `ImageReview` (open an image resource): "Nouvelle ronde" button → confirm the add-round dialog opens with the new consistent look; open the upload dialog by dropping a file with multiple pending files then triggering upload-target choice; open a round's delete confirmation via the round dropdown's trash icon.
- `DocumentReview` (open a document resource): trigger the upload-target dialog by dropping a file when a version already exists; trigger a version's delete confirmation.
- `ProjectTaskRow`/`Travail` (open Projets → a project → Tâches, or the equivalent task list view): right-click or use a task's menu to trigger "Déplacer" — confirm the move-task dialog opens correctly on both surfaces.
- `ProjectMembres` (open a project → Équipe): click the add-member action — confirm the taller (`maxHeight: 70vh`) dialog opens, search filters correctly, permission presets are clickable, and the footer confirm button is enabled only when a member is picked.
- `TravailOverview` (open a project's Aperçu, find a Formulaire resource with responses): open a form's response viewer — confirm the custom two-line header, response tabs (if multiple responses), and full-bleed layout all render correctly with no padding gaps or double-padding artifacts.

For at least 3 of the above, additionally confirm: pressing **Escape** closes the dialog (new behavior, verify it actually works); clicking the dimmed backdrop still closes it (preserved behavior).

- [ ] **Step 3: Full typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -c "error TS"`
Compare against the pre-task-1 baseline error count (record it before Task 1 starts). Expected: same count or lower — zero new errors across all 7 touched files (`SFModal.tsx`, `ui/index.ts`, `ImageReview.tsx`, `DocumentReview.tsx`, `ProjectTaskRow.tsx`, `Travail.tsx`, `ProjectMembres.tsx`, `TravailOverview.tsx`).

- [ ] **Step 4: Lint**

Run (from `app/`): `npm run lint 2>&1 | grep -A6 "SFModal.tsx\|ImageReview.tsx\|DocumentReview.tsx\|ProjectTaskRow.tsx\|screens/Travail.tsx\|ProjectMembres.tsx\|TravailOverview.tsx"`
Expected: no new findings (compare any output against the merge-base version of each file — this repo has pre-existing lint debt unrelated to this change).
