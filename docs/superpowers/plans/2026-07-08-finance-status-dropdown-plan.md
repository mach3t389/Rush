# Finance — Statut par menu déroulant Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Remplacer les 3 mécanismes incohérents de changement de statut de facture (icônes de ligne, boutons du panneau de détail, `<select>` caché dans le formulaire de modification) par un badge de statut cliquable unique (menu déroulant, comme le statut d'une tâche), partagé par les 3 écrans Finance, et repositionner le bouton "Modifier" en haut du panneau de détail à côté du bouton fermer.

**Architecture:** `financeStore.ts` gagne une fonction `setInvoiceStatus(id, newStatus)` qui centralise la logique métier (recalcul des dates à l'envoi, date/montant de paiement). Le composant partagé `StatusPill` (exporté par `Finances.tsx`, réutilisé par `ProjetFinances.tsx` et `FicheClient.tsx`) devient interactif via une prop `onChange` optionnelle, avec un menu déroulant copié localement (même pattern que `ProjectTaskRow.tsx`). Les 3 écrans branchent ce badge sur `setInvoiceStatus` et suppriment leurs anciens boutons d'action de statut, désormais redondants.

**Tech Stack:** React 19 + TypeScript, styles inline avec tokens CSS (`var(--...)`), pas de test automatisé — vérification via le serveur de preview (Vite).

## Global Constraints

- Pas de nouveau fichier — le dropdown est copié localement dans `Finances.tsx` (convention du projet : chaque gros fichier définit sa propre copie du pattern `InlineDropdown`, voir `ProjectTaskRow.tsx`, `Travail.tsx`, `Taches.tsx`).
- Pas de nouvelle clé i18n — toutes les clés `finance.status*` et `finance.editInvoice`/`finance.viewPdf` existent déjà dans `fr.json`/`en.json`.
- Icône d'édition : `square-pen` partout (jamais `edit-2`), conformément à la convention du reste de la plateforme (`ProjectCard.tsx`, `Clients.tsx`, `FicheClient.tsx`).
- Aucun changement de schéma de données, aucune migration Supabase — tout reste dans `financeStore.ts` (`localStorage`), la migration backend de Finance est explicitement hors scope.
- Pas de suite de tests automatisés dans ce projet (`npm run dev`/`npm run build` seulement) — chaque tâche se vérifie par `npx tsc --noEmit -p tsconfig.app.json` (exécuté depuis `app/`) et par une vérification manuelle dans le serveur de preview.

---

### Task 1: `financeStore.ts` — fonction `setInvoiceStatus`

**Files:**
- Modify: `app/src/data/financeStore.ts:191-205`

**Interfaces:**
- Consumes: `Invoice`, `InvoiceStatus` (types déjà définis dans ce fichier), `_invoices` (état module déjà existant), `sendInvoice` et `updateInvoice` (fonctions déjà exportées par ce fichier, ligne 191 et 175).
- Produces: `export function setInvoiceStatus(id: string, newStatus: InvoiceStatus): void` — utilisée par les Tasks 2, 3, 4.

- [ ] **Step 1: Ajouter `setInvoiceStatus` juste après `sendInvoice`**

Dans `app/src/data/financeStore.ts`, le bloc actuel (lignes 191-205) est :

```ts
export function sendInvoice(id: string): void {
  const inv = _invoices.find(i => i.id === id);
  if (!inv) return;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const terms = inv.paymentTermsDays ?? 30;
  const due = new Date(today);
  due.setDate(due.getDate() + terms);
  updateInvoice(id, {
    status: 'sent',
    sentDate: todayStr,
    issuedDate: inv.issuedDate || todayStr,
    dueDate: due.toISOString().slice(0, 10),
  });
}

export function addInvoiceComment(invoiceId: string, comment: InvoiceComment): void {
```

Remplacer par (ajout de `setInvoiceStatus` entre les deux fonctions existantes, rien d'autre ne change) :

```ts
export function sendInvoice(id: string): void {
  const inv = _invoices.find(i => i.id === id);
  if (!inv) return;
  const today = new Date();
  const todayStr = today.toISOString().slice(0, 10);
  const terms = inv.paymentTermsDays ?? 30;
  const due = new Date(today);
  due.setDate(due.getDate() + terms);
  updateInvoice(id, {
    status: 'sent',
    sentDate: todayStr,
    issuedDate: inv.issuedDate || todayStr,
    dueDate: due.toISOString().slice(0, 10),
  });
}

export function setInvoiceStatus(id: string, newStatus: InvoiceStatus): void {
  const inv = _invoices.find(i => i.id === id);
  if (!inv || inv.status === newStatus) return;

  if (newStatus === 'sent' && inv.status === 'draft') {
    sendInvoice(id);
    return;
  }
  if (newStatus === 'paid') {
    updateInvoice(id, { status: 'paid', paidDate: new Date().toISOString().slice(0, 10), paidAmount: inv.total });
    return;
  }
  updateInvoice(id, { status: newStatus });
}

export function addInvoiceComment(invoiceId: string, comment: InvoiceComment): void {
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: même nombre d'erreurs que la référence actuelle du projet (185) — aucune nouvelle erreur introduite par ce fichier. `setInvoiceStatus` n'est pas encore appelée ailleurs, donc pas d'avertissement "unused" possible côté TypeScript (c'est une fonction exportée).

- [ ] **Step 3: Commit**

```bash
git add app/src/data/financeStore.ts
git commit -m "feat: add setInvoiceStatus to centralize invoice status transitions"
```

---

### Task 2: `Finances.tsx` — badge de statut interactif, suppression des anciens mécanismes, repositionnement du bouton Modifier

**Files:**
- Modify: `app/src/screens/Finances.tsx`

**Interfaces:**
- Consumes: `setInvoiceStatus(id: string, newStatus: InvoiceStatus): void` (Task 1, `../data/financeStore`).
- Produces: `StatusPill({ status, onChange? }: { status: InvoiceStatus; onChange?: (s: InvoiceStatus) => void })` — nouvelle signature exportée, consommée telle quelle par les Tasks 3 et 4 (import inchangé : `import { ..., StatusPill, ... } from './Finances'`).

- [ ] **Step 1: Mettre à jour l'import de `financeStore`**

Le bloc actuel (lignes 7-13) :

```ts
import {
  getInvoices, addInvoice, updateInvoice, removeInvoice, subscribeInvoices,
  sendInvoice as doSendInvoice, addInvoiceComment,
  savePdf, loadPdf, formatMoney, nextInvoiceNumber, addDays,
  getInvoiceDefaults, computeTaxLines, TAX_PRESETS,
  type Invoice, type InvoiceStatus, type InvoiceComment, type TaxLine,
} from '../data/financeStore';
```

Remplacer par :

```ts
import {
  getInvoices, addInvoice, updateInvoice, removeInvoice, subscribeInvoices,
  setInvoiceStatus, addInvoiceComment,
  savePdf, loadPdf, formatMoney, nextInvoiceNumber, addDays,
  getInvoiceDefaults, computeTaxLines, TAX_PRESETS,
  type Invoice, type InvoiceStatus, type InvoiceComment, type TaxLine,
} from '../data/financeStore';
```

(`sendInvoice as doSendInvoice` est retiré — plus aucun appelant direct dans ce fichier après les steps suivants ; `setInvoiceStatus` est ajouté.)

- [ ] **Step 2: Remplacer `StatusPill` par la version interactive avec menu déroulant**

Le bloc actuel (lignes 55-65) :

```tsx
// ── StatusPill ────────────────────────────────────────────────────────────────

export function StatusPill({ status }: { status: InvoiceStatus }) {
  const { t } = useTranslation();
  const cfg = STATUS_CFG[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: cfg.bg, color: cfg.fg, fontFamily: 'var(--ff-mono)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {t(cfg.labelKey)}
    </span>
  );
}
```

Remplacer par :

```tsx
// ── StatusPill ────────────────────────────────────────────────────────────────

const ALL_INVOICE_STATUSES: InvoiceStatus[] = ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'];

function FinanceInlineDropdown({ onClose, children, anchorRect, minWidth = 160, zIndex = 250 }: {
  onClose: () => void;
  children: React.ReactNode;
  anchorRect?: DOMRect | null;
  minWidth?: number;
  zIndex?: number;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });
  React.useLayoutEffect(() => {
    if (!dropRef.current || !anchorRect) return;
    const h = dropRef.current.offsetHeight;
    const w = dropRef.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = anchorRect.bottom + 4 + h > vh && anchorRect.top >= h + 4 ? anchorRect.top - h - 4 : anchorRect.bottom + 4;
    const left = Math.max(8, Math.min(anchorRect.left, vw - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [anchorRect]);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>
  );
}

export function StatusPill({ status, onChange }: { status: InvoiceStatus; onChange?: (s: InvoiceStatus) => void }) {
  const { t } = useTranslation();
  const cfg = STATUS_CFG[status];
  const [open, setOpen] = useState(false);
  const [anchor, setAnchor] = useState<DOMRect | null>(null);

  const pill = (
    <span style={{ fontSize: 11, fontWeight: 600, padding: '3px 9px', borderRadius: 20, background: cfg.bg, color: cfg.fg, fontFamily: 'var(--ff-mono)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>
      {t(cfg.labelKey)}
    </span>
  );

  if (!onChange) return pill;

  return (
    <div style={{ position: 'relative', display: 'inline-block' }}>
      <button
        onClick={e => { e.stopPropagation(); setAnchor((e.currentTarget as HTMLElement).getBoundingClientRect()); setOpen(o => !o); }}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
      >
        {pill}
        <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
      </button>
      {open && (
        <FinanceInlineDropdown onClose={() => setOpen(false)} anchorRect={anchor}>
          {ALL_INVOICE_STATUSES.map(s => (
            <button key={s} onClick={e => { e.stopPropagation(); onChange(s); setOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: s === status ? 'var(--surface-3)' : 'transparent', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { if (s !== status) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (s !== status) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_CFG[s].fg, display: 'block', flexShrink: 0 }} />
              {t(STATUS_CFG[s].labelKey)}
            </button>
          ))}
        </FinanceInlineDropdown>
      )}
    </div>
  );
}
```

`useRef` est déjà importé en haut du fichier (`import React, { useState, useEffect, useRef } from 'react';`), aucun nouvel import React nécessaire.

- [ ] **Step 3: `InvoiceDetailPanel` — retirer `canSend`/`canPay`/`handleSend`/`handleMarkPaid`, brancher le badge, déplacer le bouton Modifier**

Le bloc actuel (dans `InvoiceDetailPanel`, juste après `if (!open || !invoice) return null;`) :

```tsx
  if (!open || !invoice) return null;

  const client  = allClients.find(c => c.id === invoice.clientId);
  const project = invoice.projectId ? allProjects.find(p => p.id === invoice.projectId) : null;
  const hasPdf  = loadPdf(invoice.id) !== null;
  const canSend = invoice.status === 'draft';
  const canPay  = !['paid', 'cancelled', 'draft'].includes(invoice.status);
  const terms   = invoice.paymentTermsDays ?? 30;

  const handleSend = () => { doSendInvoice(invoice.id); };
  const handleMarkPaid = () => {
    updateInvoice(invoice.id, { status: 'paid', paidDate: todayIso(), paidAmount: invoice.total });
  };

  const handleComment = () => {
```

Remplacer par :

```tsx
  if (!open || !invoice) return null;

  const client  = allClients.find(c => c.id === invoice.clientId);
  const project = invoice.projectId ? allProjects.find(p => p.id === invoice.projectId) : null;
  const hasPdf  = loadPdf(invoice.id) !== null;
  const terms   = invoice.paymentTermsDays ?? 30;

  const handleComment = () => {
```

Puis, le bloc du header (juste après le bloc précédent, incluant le `<div>` conteneur du panneau) :

```tsx
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{invoice.number}</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--ff-display)', margin: '4px 0 6px' }}>{invoice.title}</h2>
              <StatusPill status={invoice.status} />
            </div>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 4 }}>
              <SFIcon name="x" size={18} />
            </button>
          </div>

          <div style={{ fontFamily: 'var(--ff-mono)', fontSize: 26, fontWeight: 700, color: invoice.status === 'overdue' ? 'var(--danger)' : 'var(--text)', marginBottom: 12 }}>
            {formatMoney(invoice.total, invoice.currency)}
          </div>

          {/* Action buttons */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {canSend && (
              <SFButton variant="primary" icon="send" onClick={handleSend}>{t('finance.sendInvoice')}</SFButton>
            )}
            {canPay && (
              <SFButton variant="secondary" icon="check-circle" onClick={handleMarkPaid}>{t('finance.markPaid')}</SFButton>
            )}
            {hasPdf && (
              <SFButton variant="ghost" icon="file-text" onClick={() => setPdfOpen(true)}>{t('finance.viewPdf')}</SFButton>
            )}
            <SFButton variant="ghost" icon="edit-2" onClick={onEdit}>{t('finance.editInvoice')}</SFButton>
          </div>
        </div>
```

Remplacer par :

```tsx
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 480, zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
            <div>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{invoice.number}</span>
              <h2 style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--ff-display)', margin: '4px 0 6px' }}>{invoice.title}</h2>
              <StatusPill status={invoice.status} onChange={s => setInvoiceStatus(invoice.id, s)} />
            </div>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
              <button onClick={onEdit} title={t('finance.editInvoice')}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-2)', flexShrink: 0, background: 'var(--surface-3)', color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
                onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent)'; el.style.color = 'var(--on-accent)'; el.style.borderColor = 'transparent'; }}
                onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface-3)'; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)'; }}
              >
                <SFIcon name="square-pen" size={13} />
              </button>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 4 }}>
                <SFIcon name="x" size={18} />
              </button>
            </div>
          </div>

          <div style={{ fontFamily: 'var(--ff-mono)', fontSize: 26, fontWeight: 700, color: invoice.status === 'overdue' ? 'var(--danger)' : 'var(--text)', marginBottom: 12 }}>
            {formatMoney(invoice.total, invoice.currency)}
          </div>

          {/* Action buttons */}
          {hasPdf && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SFButton variant="ghost" icon="file-text" onClick={() => setPdfOpen(true)}>{t('finance.viewPdf')}</SFButton>
            </div>
          )}
        </div>
```

- [ ] **Step 4: `InvoiceFormPanel` — retirer le champ `<select>` de statut**

Le bloc actuel :

```tsx
  const statuses: InvoiceStatus[] = ['draft', 'sent', 'viewed', 'paid', 'overdue', 'cancelled'];
  const lockDisplay: React.CSSProperties = { ...inputStyle, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', opacity: 0.8 };
```

Remplacer par (retrait de la ligne `statuses`, `lockDisplay` inchangé) :

```tsx
  const lockDisplay: React.CSSProperties = { ...inputStyle, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', opacity: 0.8 };
```

Puis, le bloc actuel :

```tsx
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* N° + Statut */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>{t('finance.invoiceNumber')}</label>
              <input value={number} onChange={e => setNumber(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>{t('finance.statusLabel')}</label>
              <select value={status} onChange={e => setStatus(e.target.value as InvoiceStatus)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {statuses.map(s => <option key={s} value={s}>{t(`finance.status${s.charAt(0).toUpperCase()}${s.slice(1)}`)}</option>)}
              </select>
            </div>
          </div>
```

Remplacer par :

```tsx
        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* N° */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.invoiceNumber')}</label>
            <input value={number} onChange={e => setNumber(e.target.value)} style={inputStyle} />
          </div>
```

Ne pas toucher au state `status`/`setStatus` (déclaré plus haut dans `InvoiceFormPanel`, ligne ~527) : il reste nécessaire pour préserver la valeur de statut existante lors de la sauvegarde (`invoice.status` au chargement, `'draft'` à la création) — c'est `handleSave` qui écrit `status` dans l'objet `Invoice` reconstruit ; comme il n'y a plus de `<select>`, ce state ne change plus jamais après le chargement initial, donc le statut d'une facture ne peut plus être modifié par le formulaire (comportement voulu).

- [ ] **Step 5: `Finances()` (tableau global) — retirer `handleMarkPaid`/`handleSend`, brancher le badge, retirer les boutons de ligne, uniformiser le padding**

Le bloc actuel :

```tsx
  const handleMarkPaid = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const inv = invoices.find(i => i.id === id);
    if (inv) updateInvoice(id, { status: 'paid', paidDate: todayIso(), paidAmount: inv.total });
  };

  const handleSend = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    doSendInvoice(id);
  };

  const thStyle: React.CSSProperties = { fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' };
```

Remplacer par :

```tsx
  const thStyle: React.CSSProperties = { fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' };
```

Le bloc actuel (ligne de tableau, padding + StatusPill) :

```tsx
                <div key={inv.id}
                  style={{ display: 'grid', gridTemplateColumns: '140px 120px 130px 1fr 110px 100px 100px 100px', padding: '10px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', background: isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
```

Remplacer par :

```tsx
                <div key={inv.id}
                  style={{ display: 'grid', gridTemplateColumns: '140px 120px 130px 1fr 110px 100px 100px 100px', padding: '11px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', background: isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
```

Le bloc actuel :

```tsx
                  <span><StatusPill status={inv.status} /></span>
```

Remplacer par (celui de la ligne de tableau `Finances()`, pas celui du détail déjà fait au Step 3) :

```tsx
                  <span><StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} /></span>
```

Le bloc actuel (boutons d'action de ligne) :

```tsx
                  <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {inv.status === 'draft' && (
                      <button title={t('finance.sendInvoice')} onClick={e => handleSend(inv.id, e)} style={actionBtn}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--info)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                        <SFIcon name="send" size={13} />
                      </button>
                    )}
                    {hasPdf && (
                      <button title={t('finance.viewPdf')} onClick={() => openDetail(inv)} style={actionBtn}>
                        <SFIcon name="file-text" size={13} />
                      </button>
                    )}
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'draft' && (
                      <button title={t('finance.markPaid')} onClick={e => handleMarkPaid(inv.id, e)} style={actionBtn}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ok)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                        <SFIcon name="check-circle" size={13} />
                      </button>
                    )}
                    {confirming ? (
```

Remplacer par :

```tsx
                  <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {hasPdf && (
                      <button title={t('finance.viewPdf')} onClick={() => openDetail(inv)} style={actionBtn}>
                        <SFIcon name="file-text" size={13} />
                      </button>
                    )}
                    {confirming ? (
```

- [ ] **Step 6: Vérifier la compilation TypeScript**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur liée à `Finances.tsx` — en particulier aucune référence résiduelle à `doSendInvoice`, `canSend`, `canPay`, `handleSend`, `handleMarkPaid`, `statuses` (tous supprimés), et aucun import inutilisé signalé pour `sendInvoice as doSendInvoice` (déjà retiré au Step 1).

- [ ] **Step 7: Vérification visuelle rapide dans le serveur de preview**

Démarrer `npm run dev` (ou réutiliser le serveur déjà lancé), ouvrir `/finances`. Vérifier : le badge de statut d'une ligne s'ouvre en menu déroulant au clic, choisir un autre statut le change immédiatement dans le tableau ; ouvrir le détail d'une facture, le bouton crayon apparaît à côté du X en haut, cliquer dessus ouvre bien le formulaire de modification ; dans ce formulaire, le champ Statut n'apparaît plus.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/Finances.tsx
git commit -m "feat: interactive status dropdown + repositioned edit button in Finances.tsx"
```

---

### Task 3: `ProjetFinances.tsx` — brancher le badge interactif, retirer les boutons redondants

**Files:**
- Modify: `app/src/screens/ProjetFinances.tsx`

**Interfaces:**
- Consumes: `setInvoiceStatus` (Task 1, `../data/financeStore`), `StatusPill` avec la nouvelle prop `onChange` (Task 2, `./Finances`).

- [ ] **Step 1: Mettre à jour l'import de `financeStore`**

Le bloc actuel (lignes 6-9) :

```ts
import {
  getInvoicesByProject, subscribeInvoices, updateInvoice, removeInvoice,
  sendInvoice as doSendInvoice, loadPdf, formatMoney, type Invoice,
} from '../data/financeStore';
```

Remplacer par :

```ts
import {
  getInvoicesByProject, subscribeInvoices, removeInvoice,
  setInvoiceStatus, loadPdf, formatMoney, type Invoice,
} from '../data/financeStore';
```

(`updateInvoice` et `sendInvoice as doSendInvoice` retirés — plus aucun appelant dans ce fichier après les steps suivants ; `setInvoiceStatus` ajouté.)

- [ ] **Step 2: Retirer le helper `today` devenu inutile**

Le bloc actuel :

```tsx
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const today       = () => new Date().toISOString().slice(0, 10);

  const openAdd    = () => { setEditInvoice(null); setPanelOpen(true); };
```

Remplacer par :

```tsx
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);

  const openAdd    = () => { setEditInvoice(null); setPanelOpen(true); };
```

- [ ] **Step 3: Brancher le badge et retirer les boutons Envoyer/Marquer payée**

Le bloc actuel :

```tsx
                  <span><StatusPill status={inv.status} /></span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-3)' }}>{fmtDate(inv.dueDate)}</span>

                  <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {inv.status === 'draft' && (
                      <button title={t('finance.sendInvoice')} onClick={() => doSendInvoice(inv.id)} style={actionBtn}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--info)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                        <SFIcon name="send" size={13} />
                      </button>
                    )}
                    {hasPdf && (
                      <button title={t('finance.viewPdf')} onClick={() => openDetail(inv)} style={actionBtn}>
                        <SFIcon name="file-text" size={13} />
                      </button>
                    )}
                    {inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'draft' && (
                      <button title={t('finance.markPaid')} onClick={() => updateInvoice(inv.id, { status: 'paid', paidDate: today(), paidAmount: inv.total })} style={actionBtn}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ok)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                        <SFIcon name="check-circle" size={13} />
                      </button>
                    )}
                    {confirming ? (
```

Remplacer par :

```tsx
                  <span><StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} /></span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-3)' }}>{fmtDate(inv.dueDate)}</span>

                  <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {hasPdf && (
                      <button title={t('finance.viewPdf')} onClick={() => openDetail(inv)} style={actionBtn}>
                        <SFIcon name="file-text" size={13} />
                      </button>
                    )}
                    {confirming ? (
```

- [ ] **Step 4: Vérifier la compilation TypeScript**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur liée à `ProjetFinances.tsx` — aucune référence résiduelle à `updateInvoice`, `doSendInvoice`, `today`.

- [ ] **Step 5: Vérification visuelle rapide**

Ouvrir la page Finance d'un projet (`/projets/:id`, onglet Finances). Vérifier que le badge de statut est cliquable et fonctionne comme sur la page globale, et que la ligne a la même hauteur que dans `/finances`.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/ProjetFinances.tsx
git commit -m "feat: wire interactive status dropdown into ProjetFinances.tsx"
```

---

### Task 4: `FicheClient.tsx` — brancher le badge interactif, retirer les boutons redondants

**Files:**
- Modify: `app/src/screens/FicheClient.tsx`

**Interfaces:**
- Consumes: `setInvoiceStatus` (Task 1, `../data/financeStore`), `StatusPill` avec la nouvelle prop `onChange` (Task 2, `./Finances`).

- [ ] **Step 1: Mettre à jour l'import de `financeStore`**

Le bloc actuel (ligne 21) :

```ts
import { getInvoicesByClient, subscribeInvoices, updateInvoice, removeInvoice, sendInvoice as doSendInvoice, formatMoney, type Invoice } from '../data/financeStore';
```

Remplacer par :

```ts
import { getInvoicesByClient, subscribeInvoices, removeInvoice, setInvoiceStatus, formatMoney, type Invoice } from '../data/financeStore';
```

- [ ] **Step 2: Retirer le helper `today` devenu inutile**

Le bloc actuel (dans `FinancesTab`) :

```tsx
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const today       = () => new Date().toISOString().slice(0, 10);

  const openAdd    = () => { setEditInvoice(null); setPanelOpen(true); };
```

Remplacer par :

```tsx
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);

  const openAdd    = () => { setEditInvoice(null); setPanelOpen(true); };
```

- [ ] **Step 3: Brancher le badge et retirer les boutons Envoyer/Marquer payée**

Le bloc actuel :

```tsx
                <span><StatusPill status={inv.status} /></span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-3)' }}>{fmtDate(inv.dueDate)}</span>
                <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  {inv.status === 'draft' && (
                    <button title={t('finance.sendInvoice')} onClick={() => doSendInvoice(inv.id)} style={actionBtn}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--info)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                      <SFIcon name="send" size={13} />
                    </button>
                  )}
                  {inv.status !== 'paid' && inv.status !== 'cancelled' && inv.status !== 'draft' && (
                    <button title={t('finance.markPaid')} onClick={() => updateInvoice(inv.id, { status: 'paid', paidDate: today(), paidAmount: inv.total })} style={actionBtn}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--ok)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                      <SFIcon name="check-circle" size={13} />
                    </button>
                  )}
                  {confirming ? (
```

Remplacer par :

```tsx
                <span><StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} /></span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-3)' }}>{fmtDate(inv.dueDate)}</span>
                <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  {confirming ? (
```

- [ ] **Step 4: Vérifier la compilation TypeScript**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: aucune erreur liée à `FicheClient.tsx` — aucune référence résiduelle à `updateInvoice`, `doSendInvoice`, `today` dans `FinancesTab`. (Ces trois noms peuvent être utilisés ailleurs dans ce très gros fichier pour d'autres fonctionnalités que Finance — si le compilateur signale un usage réel ailleurs, ne pas le retirer de l'import ; vérifier par `grep -n "updateInvoice\|doSendInvoice\|today(" app/src/screens/FicheClient.tsx` qu'aucun autre appel ne subsiste avant de conclure à une erreur.)

- [ ] **Step 5: Vérification visuelle rapide**

Ouvrir une fiche client, onglet Finances. Vérifier que le badge de statut fonctionne comme sur les deux autres pages.

- [ ] **Step 6: Commit**

```bash
git add app/src/screens/FicheClient.tsx
git commit -m "feat: wire interactive status dropdown into FicheClient.tsx finances tab"
```

---

### Task 5: Vérification manuelle de bout en bout

**Files:** aucun (vérification seulement).

**Interfaces:** aucune nouvelle — vérifie l'intégration des Tasks 1 à 4.

- [ ] **Step 1: Vérification TypeScript finale**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: même total qu'à la baseline du projet (185 erreurs) — aucune régression cumulée sur les 4 fichiers touchés.

- [ ] **Step 2: Lint**

Run (depuis `app/`): `npm run lint`
Expected: même total qu'à la baseline du projet — aucune nouvelle erreur/avertissement introduit par ce chantier (en particulier pas d'import inutilisé oublié).

- [ ] **Step 3: Scénario complet dans le serveur de preview**

Avec `npm run dev` lancé, dans l'ordre :
1. Aller sur `/finances`. Cliquer le badge de statut d'une facture `draft`, choisir "Envoyée" — vérifier que la date d'échéance se met à jour (comportement `sendInvoice` préservé) et que la facture disparaît du filtre "Brouillon" si actif.
2. Cliquer le badge d'une facture `sent`, choisir "Payée" — vérifier que la facture passe en vert et qu'ouvrir son détail affiche une date de paiement à aujourd'hui.
3. Ouvrir le détail d'une facture — vérifier que le bouton crayon est bien à côté du X en haut (pas mêlé aux autres boutons), et que cliquer dessus ouvre le formulaire de modification sans champ Statut visible.
4. Depuis ce même détail, changer le statut via le badge du header — vérifier que le panneau de détail se met à jour sans se refermer.
5. Aller sur la page Finance d'un projet ayant des factures — répéter le clic sur un badge de statut, vérifier le même comportement, et vérifier visuellement (ou via `preview_inspect`) que la hauteur de ligne est identique à celle de `/finances`.
6. Aller sur une fiche client, onglet Finances — répéter le clic sur un badge de statut, vérifier le même comportement.
7. Recharger la page (F5) après chaque changement de statut — vérifier que le changement persiste (`localStorage`).

- [ ] **Step 4: Revue finale**

Relire les 4 fichiers modifiés (`git diff`) pour confirmer : aucune icône `edit-2` restante dans ces fichiers, aucun appel résiduel à `doSendInvoice`/`updateInvoice` pour un changement de statut (seul `InvoiceFormPanel.handleSave` doit encore appeler `updateInvoice`, pour les champs autres que le statut), et le padding de ligne est `11px 16px` dans les 3 tableaux.

- [ ] **Step 5: Commit final (si des ajustements ont été faits pendant la vérification)**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification of finance status dropdown"
```

(Ne committer que s'il y a effectivement eu des changements pendant cette étape — sinon, ce commit est à sauter.)
