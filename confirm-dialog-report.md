# Confirm dialog unification — report

## Files changed

1. `app/src/data/confirmStore.ts` (new) — singleton store mirroring `toastStore.ts` pattern: `confirmDialog(message, opts)` returns a `Promise<boolean>`, resolved by `resolveConfirm(ok)`. `getConfirmRequest()`/`subscribeConfirm()` for the host component.
2. `app/src/components/ConfirmDialogHost.tsx` (new) — renders an `SFModal` (width 400, `closeOnBackdrop={false}`) with the message, a `secondary` "Annuler" `SFButton`, and a `primary` "Confirmer" `SFButton`. When `danger` is set, the confirm button gets `style={{ background: 'var(--danger)', borderColor: 'var(--danger)', color: '#fff' }}` (verified this matches `SFButton`'s actual prop signature — `variant`, `style` override supported).
3. `app/src/components/layout/AppShell.tsx` — mounted `<ConfirmDialogHost />` right next to `<ToastBar />`.
4. `app/src/locales/fr.json` / `en.json` — added `common.confirm`: "Confirmer" / "Confirm" (the `common` namespace already had `common.cancel`).
5. `app/src/components/ProjectHeaderBar.tsx`
6. `app/src/screens/FichiersGlobal.tsx`
7. `app/src/screens/Modeles.tsx`
8. `app/src/screens/ResourceRouter.tsx`
9. `app/src/screens/TravailOverview.tsx`

## Call sites — before / after

### ProjectHeaderBar.tsx (~line 271)
Before:
```tsx
onClick={() => {
  if (!confirm(t('projectTemplates.confirmDiscardDraft'))) return;
  removeProject(project.id);
  navigate('/modeles');
}}
```
After: inline arrow made `async`, `confirm` → `await confirmDialog(...)`. No `danger` flag (matches spec — not listed as one of the destructive-styled ones, though arguably could be; left as-is per instructions). No caller adjustment needed (inline JSX handler, nothing downstream depends on synchronous completion).

### FichiersGlobal.tsx (3 sites)
- Line ~2112 — delete folder from trash: `action: () => {...}` → `action: async () => {...}`, `confirm(...)` → `await confirmDialog(msg, { danger: true })`.
- Line ~2152 — delete file from trash: same pattern, `{ danger: true }`.
- Line ~3352 — empty trash button `onClick`: same pattern, `{ danger: true }`.

All three are plain inline callbacks passed to context-menu `action` fields or a raw `onClick`; the `CtxMenuItem.action` type is `() => void`, which TypeScript accepts an `async () => Promise<void>` function for (void-returning function types accept any return value). No caller relies on synchronous completion.

### Modeles.tsx (4 sites)
- Line ~369 (`TemplateCard`-like delete button): `onClick={() => {...}}` → `async`, `{ danger: true }`.
- Line ~580 (hide built-in form template): `onClick={() => {...}}` → `async`; **no** `danger: true` (per spec — hiding a built-in is reversible, not delete).
- Line ~805 (`handleDelete` for a form response, `'Supprimer cette réponse ?'`): the function itself (`const handleDelete = (id: string) => {...}`) made `async`. Its only caller is `onClick={() => handleDelete(inst.id)}` (line ~846) — a fire-and-forget inline handler, so making `handleDelete` async doesn't break anything (nothing after the call site depends on the delete having completed synchronously). `{ danger: true }` added.
- Line ~1119 (second resource-template delete button, duplicate of the ~369 pattern for a different component): `async`, `{ danger: true }`.

### ResourceRouter.tsx (~line 40)
`const handleLoad = (templateId: string) => {...}` → `async`. Its only caller is `TemplateMenuButton`'s `onLoad` prop, typed `onLoad: (id: string) => void` — accepts the async function fine (void-return compatibility), and the button just calls `onLoad(opt.id); closeAll();` without depending on completion order. No `danger: true` (content-replace warning, not delete).

### TravailOverview.tsx (~line 488)
`const handleDeleteSection = (id: string) => {...}` → `async`. Called from two `onDelete={() => handleDeleteSection(section.id)}` sites (lines ~724, ~1178), both fire-and-forget inline handlers — no adjustment needed there. `{ danger: true }` added (destructive section delete).

## Async-conversion caller check

Every one of the 10 call sites turned out to be either:
- a directly-inline JSX arrow function (`onClick={() => {...}}` / `action: () => {...}`), or
- a named handler (`handleDelete`, `handleDeleteSection`, `handleLoad`) whose only callers are themselves fire-and-forget inline arrows (`onClick={() => handler(x)}`).

No call site had code *after* the invocation that assumed the confirm+action had already completed synchronously (e.g. no code immediately reading updated state right after calling one of these handlers). So no caller-side logic needed restructuring beyond adding `async`.

## Typecheck

```
cd app && npx tsc --noEmit -p tsconfig.app.json
```
No output — clean pass.

## Concerns

- `ProjectHeaderBar.tsx`'s discard-draft confirm was left without `danger: true` per the task spec's exact list (only FichiersGlobal/Modeles-delete/TravailOverview sites were flagged danger). This is a destructive action (discards + navigates away) — worth a follow-up discussion if the team wants it styled as danger too, but I followed the given classification exactly rather than second-guessing it.
- Did not visually verify the modal in a running browser (no dev server was started); typecheck is the only verification performed, per the task's stated verification method (`npx tsc --noEmit -p tsconfig.app.json`).
