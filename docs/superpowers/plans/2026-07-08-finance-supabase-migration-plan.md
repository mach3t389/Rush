# Migration Finance vers Supabase Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Migrer `financeStore.ts` (factures, méthodes de paiement, paramètres par défaut de facturation, PDF de factures) de `localStorage` vers Supabase, scopé par studio, en gardant les 3 comptes de démonstration inchangés.

**Architecture:** Même pattern que les 11 chantiers Phase 2 précédents (voir `notificationStore.ts`, `clientStore.ts`) : sessions démo inchangées en `localStorage` ; sessions réelles chargées en mémoire au premier accès (`getStudioId()` + Supabase), lectures synchrones depuis le cache, écritures optimistes (cache mis à jour immédiatement, appel Supabase en arrière-plan). Les PDF de factures ne créent pas de nouvelle table : ils délèguent au système de stockage de fichiers déjà construit (`fileContentStore.ts`, Cloudflare R2), avec un champ `hasPdf` mis en cache directement sur chaque facture pour éviter tout appel réseau superflu dans les listes.

**Tech Stack:** React 19 + TypeScript, Supabase (Postgres + RLS), Cloudflare R2 (déjà en place).

## Global Constraints

- Sessions démo : comportement `localStorage` inchangé, byte pour byte (mêmes clés `sf_invoices`/`sf_payment_methods`/`sf_invoice_defaults`, même logique de migration `migrateInvoices`/`migrateDefaults`).
- Toutes les fonctions exportées par `financeStore.ts` gardent leur signature actuelle, à une seule exception : `savePdf(invoiceId: string, file: File)` (avant : `dataUrl: string`) — nécessaire pour brancher sur `fileContentStore.setFileContent`.
- Tous les identifiants de table sont `text` générés côté client (jamais `uuid`/`gen_random_uuid()`), comme partout ailleurs dans le projet.
- Les champs de date (`issued_date`, `due_date`, `sent_date`, `paid_date`) sont `text`, pas `date` — l'application les traite comme des chaînes `AAAA-MM-JJ`.
- Chaque nouvelle table a une policy RLS scopée par `studio_id in (select my_studio_ids())` ET un `grant select, insert, update, delete ... to authenticated` dans la même étape (oublier le GRANT est un piège déjà rencontré plusieurs fois dans ce projet).
- Aucune des fonctions d'écriture de `financeStore.ts` ne remplace une liste entière par une nouvelle (toutes sont des opérations élément-par-élément) — le bug de "cache écrasé avant calcul de ce qui a été supprimé" déjà rencontré deux fois dans ce projet ne s'applique donc pas ici ; à confirmer explicitement en revue.
- Pas de suite de tests automatisés dans ce projet — chaque tâche se vérifie par `npx tsc --noEmit -p tsconfig.app.json` (depuis `app/`, référence actuelle : 185 erreurs préexistantes sans lien avec ce chantier) et par vérification manuelle via le serveur de preview.

---

### Task 1: Schéma Supabase (manuel)

**Files:** aucun fichier de code — SQL exécuté manuellement par l'utilisateur dans l'éditeur SQL Supabase.

**Interfaces:**
- Produces: tables `invoices`, `payment_methods`, `invoice_defaults`, consommées par la Task 2.

- [ ] **Step 1: Fournir le SQL à exécuter**

```sql
create table invoices (
  id text primary key,
  studio_id uuid not null references studios(id),
  number text not null,
  client_id text not null,
  project_id text,
  title text not null,
  amount numeric not null,
  tax_lines jsonb not null default '[]',
  tax numeric not null default 0,
  total numeric not null default 0,
  currency text not null default 'CAD',
  status text not null default 'draft',
  issued_date text not null default '',
  due_date text not null default '',
  sent_date text,
  payment_terms_days integer,
  notes text,
  internal_note text,
  paid_date text,
  paid_amount numeric,
  has_pdf boolean not null default false,
  comments jsonb not null default '[]',
  created_at timestamptz not null default now()
);

alter table invoices enable row level security;

create policy "studio members can manage their invoices"
  on invoices for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on invoices to authenticated;

create table payment_methods (
  id text primary key,
  studio_id uuid not null references studios(id),
  type text not null,
  name text not null,
  icon text not null,
  details text not null default '',
  fee_percent numeric,
  fee_label text,
  is_recommended boolean not null default false,
  is_enabled boolean not null default true,
  stripe_link text,
  sort_order integer not null default 0
);

alter table payment_methods enable row level security;

create policy "studio members can manage their payment methods"
  on payment_methods for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on payment_methods to authenticated;

create table invoice_defaults (
  studio_id uuid primary key references studios(id),
  tax_lines jsonb not null default '[]',
  payment_terms_days integer not null default 30,
  currency text not null default 'CAD',
  notes text not null default '',
  number_prefix text not null default 'INV'
);

alter table invoice_defaults enable row level security;

create policy "studio members can manage their invoice defaults"
  on invoice_defaults for all
  using (studio_id in (select my_studio_ids()))
  with check (studio_id in (select my_studio_ids()));

grant select, insert, update, delete on invoice_defaults to authenticated;
```

- [ ] **Step 2: Confirmation utilisateur**

L'utilisateur exécute ce SQL dans l'éditeur SQL de son projet Supabase et confirme que les 3 tables sont créées sans erreur avant de passer à la Task 2.

---

### Task 2: `financeStore.ts` — réécriture complète

**Files:**
- Modify: `app/src/data/financeStore.ts` (réécriture complète du fichier)

**Interfaces:**
- Consumes: `isDemoSession`, `onLogout` (`./authStore`), `getStudioId` (`./studioStore`), `supabase` (`./supabaseClient`), `setFileContent`, `getFileContent`, `removeFileContent` (`./fileContentStore`).
- Produces: toutes les fonctions déjà exportées aujourd'hui, signatures inchangées sauf `savePdf(invoiceId: string, file: File): void`. Nouveau champ optionnel `hasPdf?: boolean` sur `Invoice`, consommé par la Task 3 et la Task 4.

- [ ] **Step 1: Remplacer le contenu complet du fichier**

Remplacer tout le contenu de `app/src/data/financeStore.ts` par :

```ts
// Reactive finance store — invoices, payment methods, invoice defaults.
//
// Demo sessions (isDemoSession() === true): unchanged localStorage behavior,
// exactly as before this migration.
// Real sessions: backed by Supabase, scoped to the caller's studio — every
// team member in a studio sees the same invoices, payment methods, and
// billing defaults. Bulk-fetched into an in-memory cache on first access
// (mirroring resourceStore.ts/notificationStore.ts), synchronous reads from
// cache, optimistic writes (cache updated immediately, Supabase call fired
// in the background).
//
// Invoice PDFs are not stored in this file's own tables — they delegate to
// fileContentStore.ts (the same Cloudflare R2-backed storage already used
// for project files/videos), keyed by `invoice-pdf-<id>`. Each invoice keeps
// a simple `hasPdf` boolean so invoice lists can show/hide the PDF icon
// without asking the file-storage system about every row.

import { loadPersisted, savePersisted } from './persist';
import { isDemoSession, onLogout } from './authStore';
import { getStudioId } from './studioStore';
import { supabase } from './supabaseClient';
import { setFileContent, getFileContent, removeFileContent } from './fileContentStore';

export type InvoiceStatus = 'draft' | 'sent' | 'viewed' | 'paid' | 'overdue' | 'cancelled';
export type PaymentMethodType = 'bank_transfer' | 'interac' | 'stripe' | 'paypal' | 'cheque' | 'cash' | 'custom';

// ── Tax lines ─────────────────────────────────────────────────────────────────

export interface TaxLine {
  id: string;
  name: string;
  rate: number;
  enabled: boolean;
}

export interface TaxPreset {
  label: string;
  lines: TaxLine[];
}

export const TAX_PRESETS: Record<string, TaxPreset> = {
  QC:   { label: 'Québec (TPS + TVQ)',        lines: [{ id:'tps', name:'TPS',      rate:5,      enabled:true }, { id:'tvq', name:'TVQ',      rate:9.975, enabled:true }] },
  ON:   { label: 'Ontario (HST)',              lines: [{ id:'hst', name:'HST',      rate:13,     enabled:true }] },
  BC:   { label: 'Colombie-Britannique',       lines: [{ id:'gst', name:'GST',      rate:5,      enabled:true }, { id:'pst', name:'PST',      rate:7,     enabled:true }] },
  AB:   { label: 'Alberta (GST)',              lines: [{ id:'gst', name:'GST',      rate:5,      enabled:true }] },
  MB:   { label: 'Manitoba (GST + RST)',       lines: [{ id:'gst', name:'GST',      rate:5,      enabled:true }, { id:'rst', name:'RST',      rate:7,     enabled:true }] },
  SK:   { label: 'Saskatchewan (GST + PST)',   lines: [{ id:'gst', name:'GST',      rate:5,      enabled:true }, { id:'pst', name:'PST',      rate:6,     enabled:true }] },
  ATL:  { label: 'Atlantique (HST 15%)',       lines: [{ id:'hst', name:'HST',      rate:15,     enabled:true }] },
  FR:   { label: 'France (TVA 20%)',           lines: [{ id:'tva', name:'TVA',      rate:20,     enabled:true }] },
  CH:   { label: 'Suisse (TVA 8.1%)',          lines: [{ id:'tva', name:'TVA',      rate:8.1,    enabled:true }] },
  BE:   { label: 'Belgique (TVA 21%)',         lines: [{ id:'tva', name:'TVA',      rate:21,     enabled:true }] },
  UK:   { label: 'Royaume-Uni (VAT 20%)',      lines: [{ id:'vat', name:'VAT',      rate:20,     enabled:true }] },
  EU:   { label: 'UE — TVA générique (20%)',   lines: [{ id:'vat', name:'VAT',      rate:20,     enabled:true }] },
  AU:   { label: 'Australie (GST 10%)',        lines: [{ id:'gst', name:'GST',      rate:10,     enabled:true }] },
  US:   { label: 'États-Unis (sans taxe fixe)',lines: [{ id:'tax', name:'Sales Tax',rate:0,      enabled:true }] },
  NONE: { label: 'Sans taxe',                  lines: [] },
};

export function computeTaxLines(amount: number, lines: TaxLine[]): { tax: number; total: number } {
  const tax   = lines.filter(l => l.enabled).reduce((s, l) => s + Math.round(amount * l.rate / 100 * 100) / 100, 0);
  const total = Math.round((amount + tax) * 100) / 100;
  return { tax, total };
}

// ── Types ─────────────────────────────────────────────────────────────────────

export interface InvoiceComment {
  id: string;
  author: string;
  initials: string;
  authorColor: string;
  text: string;
  ts: number;
}

export interface Invoice {
  id: string;
  number: string;
  clientId: string;
  projectId?: string;
  title: string;
  amount: number;
  taxLines: TaxLine[];
  tax: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  issuedDate: string;
  dueDate: string;
  sentDate?: string;
  paymentTermsDays?: number;
  notes?: string;
  internalNote?: string;
  paidDate?: string;
  paidAmount?: number;
  hasPdf?: boolean;
  comments?: InvoiceComment[];
}

export interface InvoiceDefaults {
  taxLines: TaxLine[];
  paymentTermsDays: number;
  currency: string;
  notes: string;
  numberPrefix: string;
}

export interface PaymentMethod {
  id: string;
  type: PaymentMethodType;
  name: string;
  icon: string;
  details: string;
  feePercent?: number;
  feeLabel?: string;
  isRecommended: boolean;
  isEnabled: boolean;
  stripeLink?: string;
  sortOrder: number;
}

// ── Mock data (demo sessions only) ──────────────────────────────────────────────

const QC_TAXES = TAX_PRESETS.QC.lines;

const MOCK_INVOICES: Invoice[] = [
  { id:'inv1', number:'INV-2026-001', clientId:'c1', projectId:'pj1', title:'Campagne Été 2025 — Acompte 50%',  amount:4250, taxLines:QC_TAXES, tax:636.44,  total:4886.44, currency:'CAD', status:'paid',    issuedDate:'2026-03-01', dueDate:'2026-03-15', sentDate:'2026-03-01', paymentTermsDays:30, paidDate:'2026-03-12', paidAmount:4886.44, comments:[{ id:'c1a', author:'Léa Marchand', initials:'LM', authorColor:'#5c3d8f', text:'Paiement reçu par virement bancaire. Merci !', ts: Date.now() - 86400000 * 95 }] },
  { id:'inv2', number:'INV-2026-002', clientId:'c1', projectId:'pj1', title:'Campagne Été 2025 — Solde 50%',    amount:4250, taxLines:QC_TAXES, tax:636.44,  total:4886.44, currency:'CAD', status:'sent',    issuedDate:'2026-05-15', dueDate:'2026-06-14', sentDate:'2026-05-15', paymentTermsDays:30 },
  { id:'inv3', number:'INV-2026-003', clientId:'c2', projectId:'pj2', title:'Les Bâtisseurs — Acompte 30%',     amount:3000, taxLines:QC_TAXES, tax:449.25,  total:3449.25, currency:'CAD', status:'paid',    issuedDate:'2026-02-10', dueDate:'2026-02-24', sentDate:'2026-02-10', paymentTermsDays:14, paidDate:'2026-02-20', paidAmount:3449.25 },
  { id:'inv4', number:'INV-2026-004', clientId:'c4', projectId:'pj3', title:'Film institutionnel — Production', amount:6500, taxLines:QC_TAXES, tax:973.38,  total:7473.38, currency:'CAD', status:'overdue', issuedDate:'2026-04-01', dueDate:'2026-05-01', sentDate:'2026-04-01', paymentTermsDays:30, comments:[{ id:'c4a', author:'Léa Marchand', initials:'LM', authorColor:'#5c3d8f', text:'Relance envoyée par courriel le 15 mai. En attente de réponse.', ts: Date.now() - 86400000 * 30 }] },
  { id:'inv5', number:'INV-2026-005', clientId:'c5', projectId:'pj4', title:'Clip Horizon — Forfait complet',   amount:5500, taxLines:QC_TAXES, tax:823.63,  total:6323.63, currency:'CAD', status:'viewed',  issuedDate:'2026-06-01', dueDate:'2026-07-01', sentDate:'2026-06-01', paymentTermsDays:30 },
  { id:'inv6', number:'INV-2026-006', clientId:'c2', projectId:'pj6', title:'Brand Film Q4 — Solde final',      amount:8000, taxLines:QC_TAXES, tax:1198.00, total:9198.00, currency:'CAD', status:'paid',    issuedDate:'2026-01-10', dueDate:'2026-01-24', sentDate:'2026-01-10', paymentTermsDays:14, paidDate:'2026-01-22', paidAmount:9198.00 },
  { id:'inv7', number:'INV-2026-007', clientId:'c3', projectId:'pj5', title:'Motion Design Pack — Acompte',     amount:2800, taxLines:QC_TAXES, tax:419.30,  total:3219.30, currency:'CAD', status:'draft',   issuedDate:'2026-06-20', dueDate:'2026-07-20', paymentTermsDays:30 },
];

const DEFAULT_METHODS: PaymentMethod[] = [
  { id:'pm1', type:'bank_transfer', name:'Virement bancaire',  icon:'landmark',    details:'Institution: Banque XYZ\nNom du compte: Studio Rush\nNº transit: 00000  •  Nº institution: 000\nNº compte: 0000000000', feePercent:0,   isRecommended:true,  isEnabled:true,  sortOrder:0 },
  { id:'pm2', type:'interac',       name:'Interac e-Transfer', icon:'mail',        details:'Envoyer à: paiement@studio-rush.ca\nQuestion: studio  •  Réponse: rush', feePercent:0, isRecommended:false, isEnabled:true, sortOrder:1 },
  { id:'pm3', type:'stripe',        name:'Carte de crédit',    icon:'credit-card', details:'Paiement sécurisé par carte Visa, Mastercard ou Amex.', feePercent:2.9, feeLabel:'+2.9% de frais', isRecommended:false, isEnabled:true, sortOrder:2, stripeLink:'' },
  { id:'pm4', type:'paypal',        name:'PayPal',             icon:'wallet',      details:'Envoyer à: payments@studio-rush.ca', feePercent:3.5, feeLabel:'+3.5% de frais', isRecommended:false, isEnabled:false, sortOrder:3 },
];

// ── Demo-session working set ─────────────────────────────────────────────────

const INVOICES_KEY = 'sf_invoices';
const METHODS_KEY  = 'sf_payment_methods';
const DEFAULTS_KEY = 'sf_invoice_defaults';

const FACTORY_DEFAULTS: InvoiceDefaults = {
  taxLines: TAX_PRESETS.QC.lines.map(l => ({ ...l })),
  paymentTermsDays: 30,
  currency: 'CAD',
  notes: '',
  numberPrefix: 'INV',
};

// Migrate persisted invoices that still have the old taxRate: number shape
function migrateInvoices(raw: unknown[]): Invoice[] {
  return raw.map((inv: unknown) => {
    const i = inv as Record<string, unknown>;
    if (!Array.isArray(i.taxLines)) {
      const rate = typeof i.taxRate === 'number' ? i.taxRate : 14.975;
      i.taxLines = rate > 0
        ? [{ id: 'tax', name: 'Tax', rate, enabled: true }]
        : [];
      delete i.taxRate;
    }
    return i as unknown as Invoice;
  });
}

// Migrate persisted defaults that still have the old taxRate: number shape
function migrateDefaults(raw: unknown): InvoiceDefaults {
  const d = raw as Record<string, unknown>;
  if (!Array.isArray(d.taxLines)) {
    const rate = typeof d.taxRate === 'number' ? d.taxRate : 14.975;
    d.taxLines = rate > 0
      ? [{ id: 'tax', name: 'Tax', rate, enabled: true }]
      : [];
    delete d.taxRate;
  }
  return d as unknown as InvoiceDefaults;
}

let _demoInvoices: Invoice[]       = migrateInvoices(loadPersisted(INVOICES_KEY, [...MOCK_INVOICES]));
let _demoMethods:  PaymentMethod[] = loadPersisted(METHODS_KEY,  [...DEFAULT_METHODS]);
let _demoDefaults: InvoiceDefaults = migrateDefaults(loadPersisted(DEFAULTS_KEY, { ...FACTORY_DEFAULTS }));

function persistDemoInvoices() { savePersisted(INVOICES_KEY, _demoInvoices); }
function persistDemoMethods()  { savePersisted(METHODS_KEY,  _demoMethods); }

const _iListeners = new Set<() => void>();
const _mListeners = new Set<() => void>();
const _dListeners = new Set<() => void>();

// ── Real-session working set ──────────────────────────────────────────────────

let _supabaseInvoices: Invoice[] = [];
let _supabaseInvoicesFetchStarted = false;
let _supabaseMethods: PaymentMethod[] = [];
let _supabaseMethodsFetchStarted = false;
let _supabaseDefaults: InvoiceDefaults | null = null;
let _supabaseDefaultsFetchStarted = false;

export function resetFinanceCache(): void {
  _supabaseInvoices = [];
  _supabaseInvoicesFetchStarted = false;
  _supabaseMethods = [];
  _supabaseMethodsFetchStarted = false;
  _supabaseDefaults = null;
  _supabaseDefaultsFetchStarted = false;
}
onLogout(resetFinanceCache);

interface InvoiceRow {
  id: string;
  studio_id: string;
  number: string;
  client_id: string;
  project_id: string | null;
  title: string;
  amount: number;
  tax_lines: TaxLine[];
  tax: number;
  total: number;
  currency: string;
  status: InvoiceStatus;
  issued_date: string;
  due_date: string;
  sent_date: string | null;
  payment_terms_days: number | null;
  notes: string | null;
  internal_note: string | null;
  paid_date: string | null;
  paid_amount: number | null;
  has_pdf: boolean;
  comments: InvoiceComment[];
}

function toInvoice(row: InvoiceRow): Invoice {
  return {
    id: row.id,
    number: row.number,
    clientId: row.client_id,
    projectId: row.project_id ?? undefined,
    title: row.title,
    amount: row.amount,
    taxLines: row.tax_lines,
    tax: row.tax,
    total: row.total,
    currency: row.currency,
    status: row.status,
    issuedDate: row.issued_date,
    dueDate: row.due_date,
    sentDate: row.sent_date ?? undefined,
    paymentTermsDays: row.payment_terms_days ?? undefined,
    notes: row.notes ?? undefined,
    internalNote: row.internal_note ?? undefined,
    paidDate: row.paid_date ?? undefined,
    paidAmount: row.paid_amount ?? undefined,
    hasPdf: row.has_pdf,
    comments: row.comments ?? [],
  };
}

function toInvoiceRow(inv: Invoice, studioId: string): InvoiceRow & { studio_id: string } {
  return {
    id: inv.id,
    studio_id: studioId,
    number: inv.number,
    client_id: inv.clientId,
    project_id: inv.projectId ?? null,
    title: inv.title,
    amount: inv.amount,
    tax_lines: inv.taxLines,
    tax: inv.tax,
    total: inv.total,
    currency: inv.currency,
    status: inv.status,
    issued_date: inv.issuedDate,
    due_date: inv.dueDate,
    sent_date: inv.sentDate ?? null,
    payment_terms_days: inv.paymentTermsDays ?? null,
    notes: inv.notes ?? null,
    internal_note: inv.internalNote ?? null,
    paid_date: inv.paidDate ?? null,
    paid_amount: inv.paidAmount ?? null,
    has_pdf: inv.hasPdf ?? false,
    comments: inv.comments ?? [],
  };
}

async function fetchSupabaseInvoices(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('invoices')
      .select('*')
      .eq('studio_id', studioId)
      .order('created_at', { ascending: false });
    if (error) { console.error('fetchSupabaseInvoices failed', error); return; }
    _supabaseInvoices = (data as InvoiceRow[]).map(toInvoice);
    _iListeners.forEach(fn => fn());
  } catch (err) {
    console.error('fetchSupabaseInvoices failed', err);
  }
}

function ensureSupabaseInvoicesFetchStarted(): void {
  if (_supabaseInvoicesFetchStarted) return;
  _supabaseInvoicesFetchStarted = true;
  void fetchSupabaseInvoices();
}

async function addSupabaseInvoice(inv: Invoice): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('invoices').insert(toInvoiceRow(inv, studioId));
  if (error) console.error('addSupabaseInvoice failed', error);
}

async function updateSupabaseInvoice(id: string, inv: Invoice): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('invoices').update(toInvoiceRow(inv, studioId)).eq('id', id);
  if (error) console.error('updateSupabaseInvoice failed', error);
}

async function removeSupabaseInvoice(id: string): Promise<void> {
  const { error } = await supabase.from('invoices').delete().eq('id', id);
  if (error) console.error('removeSupabaseInvoice failed', error);
}

interface PaymentMethodRow {
  id: string;
  studio_id: string;
  type: PaymentMethodType;
  name: string;
  icon: string;
  details: string;
  fee_percent: number | null;
  fee_label: string | null;
  is_recommended: boolean;
  is_enabled: boolean;
  stripe_link: string | null;
  sort_order: number;
}

function toMethod(row: PaymentMethodRow): PaymentMethod {
  return {
    id: row.id,
    type: row.type,
    name: row.name,
    icon: row.icon,
    details: row.details,
    feePercent: row.fee_percent ?? undefined,
    feeLabel: row.fee_label ?? undefined,
    isRecommended: row.is_recommended,
    isEnabled: row.is_enabled,
    stripeLink: row.stripe_link ?? undefined,
    sortOrder: row.sort_order,
  };
}

function toMethodRow(m: PaymentMethod, studioId: string): PaymentMethodRow {
  return {
    id: m.id,
    studio_id: studioId,
    type: m.type,
    name: m.name,
    icon: m.icon,
    details: m.details,
    fee_percent: m.feePercent ?? null,
    fee_label: m.feeLabel ?? null,
    is_recommended: m.isRecommended,
    is_enabled: m.isEnabled,
    stripe_link: m.stripeLink ?? null,
    sort_order: m.sortOrder,
  };
}

async function fetchSupabaseMethods(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('payment_methods')
      .select('*')
      .eq('studio_id', studioId)
      .order('sort_order', { ascending: true });
    if (error) { console.error('fetchSupabaseMethods failed', error); return; }
    _supabaseMethods = (data as PaymentMethodRow[]).map(toMethod);
    _mListeners.forEach(fn => fn());
  } catch (err) {
    console.error('fetchSupabaseMethods failed', err);
  }
}

function ensureSupabaseMethodsFetchStarted(): void {
  if (_supabaseMethodsFetchStarted) return;
  _supabaseMethodsFetchStarted = true;
  void fetchSupabaseMethods();
}

async function addSupabaseMethod(m: PaymentMethod): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('payment_methods').insert(toMethodRow(m, studioId));
  if (error) console.error('addSupabaseMethod failed', error);
}

async function updateSupabaseMethod(id: string, m: PaymentMethod): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('payment_methods').update(toMethodRow(m, studioId)).eq('id', id);
  if (error) console.error('updateSupabaseMethod failed', error);
}

async function removeSupabaseMethod(id: string): Promise<void> {
  const { error } = await supabase.from('payment_methods').delete().eq('id', id);
  if (error) console.error('removeSupabaseMethod failed', error);
}

interface InvoiceDefaultsRow {
  studio_id: string;
  tax_lines: TaxLine[];
  payment_terms_days: number;
  currency: string;
  notes: string;
  number_prefix: string;
}

function toDefaults(row: InvoiceDefaultsRow): InvoiceDefaults {
  return {
    taxLines: row.tax_lines,
    paymentTermsDays: row.payment_terms_days,
    currency: row.currency,
    notes: row.notes,
    numberPrefix: row.number_prefix,
  };
}

async function fetchSupabaseDefaults(): Promise<void> {
  try {
    const studioId = await getStudioId();
    const { data, error } = await supabase
      .from('invoice_defaults')
      .select('*')
      .eq('studio_id', studioId)
      .maybeSingle();
    if (error) { console.error('fetchSupabaseDefaults failed', error); return; }
    _supabaseDefaults = data ? toDefaults(data as InvoiceDefaultsRow) : null;
    _dListeners.forEach(fn => fn());
  } catch (err) {
    console.error('fetchSupabaseDefaults failed', err);
  }
}

function ensureSupabaseDefaultsFetchStarted(): void {
  if (_supabaseDefaultsFetchStarted) return;
  _supabaseDefaultsFetchStarted = true;
  void fetchSupabaseDefaults();
}

async function saveSupabaseDefaults(defaults: InvoiceDefaults): Promise<void> {
  const studioId = await getStudioId();
  const { error } = await supabase.from('invoice_defaults').upsert({
    studio_id: studioId,
    tax_lines: defaults.taxLines,
    payment_terms_days: defaults.paymentTermsDays,
    currency: defaults.currency,
    notes: defaults.notes,
    number_prefix: defaults.numberPrefix,
  });
  if (error) console.error('saveSupabaseDefaults failed', error);
}

// ── Invoices — public API (unchanged signatures) ────────────────────────────────

export function getInvoices(): Invoice[] {
  if (isDemoSession()) return _demoInvoices;
  ensureSupabaseInvoicesFetchStarted();
  return _supabaseInvoices;
}
export function getInvoicesByClient(cid: string):  Invoice[] { return getInvoices().filter(i => i.clientId === cid); }
export function getInvoicesByProject(pid: string): Invoice[] { return getInvoices().filter(i => i.projectId === pid); }
export function findInvoice(id: string): Invoice | undefined { return getInvoices().find(i => i.id === id); }

export function addInvoice(inv: Invoice): void {
  if (isDemoSession()) {
    _demoInvoices = [inv, ..._demoInvoices];
    persistDemoInvoices();
    _iListeners.forEach(fn => fn());
    return;
  }
  _supabaseInvoices = [inv, ..._supabaseInvoices];
  _iListeners.forEach(fn => fn());
  void addSupabaseInvoice(inv);
}

export function updateInvoice(id: string, patch: Partial<Invoice>): void {
  if (isDemoSession()) {
    _demoInvoices = _demoInvoices.map(i => i.id === id ? { ...i, ...patch } : i);
    persistDemoInvoices();
    _iListeners.forEach(fn => fn());
    return;
  }
  const current = _supabaseInvoices.find(i => i.id === id);
  if (!current) { console.error('updateInvoice: invoice not found in cache', id); return; }
  const merged = { ...current, ...patch };
  _supabaseInvoices = _supabaseInvoices.map(i => i.id === id ? merged : i);
  _iListeners.forEach(fn => fn());
  void updateSupabaseInvoice(id, merged);
}

export function removeInvoice(id: string): void {
  removeFileContent(pdfKey(id));
  if (isDemoSession()) {
    _demoInvoices = _demoInvoices.filter(i => i.id !== id);
    persistDemoInvoices();
    _iListeners.forEach(fn => fn());
    return;
  }
  _supabaseInvoices = _supabaseInvoices.filter(i => i.id !== id);
  _iListeners.forEach(fn => fn());
  void removeSupabaseInvoice(id);
}

export function subscribeInvoices(fn: () => void): () => void {
  _iListeners.add(fn);
  return () => _iListeners.delete(fn);
}

export function sendInvoice(id: string): void {
  const inv = getInvoices().find(i => i.id === id);
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
  const inv = getInvoices().find(i => i.id === id);
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
  const inv = getInvoices().find(i => i.id === invoiceId);
  if (!inv) return;
  updateInvoice(invoiceId, { comments: [...(inv.comments ?? []), comment] });
}

// ── Payment methods — public API (unchanged signatures) ─────────────────────────

export function getPaymentMethods(): PaymentMethod[] {
  if (isDemoSession()) return _demoMethods;
  ensureSupabaseMethodsFetchStarted();
  return _supabaseMethods;
}
export function getEnabledPaymentMethods(): PaymentMethod[] {
  return [...getPaymentMethods()].filter(m => m.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder);
}

export function addPaymentMethod(m: PaymentMethod): void {
  if (isDemoSession()) {
    _demoMethods = [..._demoMethods, m];
    persistDemoMethods();
    _mListeners.forEach(fn => fn());
    return;
  }
  _supabaseMethods = [..._supabaseMethods, m];
  _mListeners.forEach(fn => fn());
  void addSupabaseMethod(m);
}

export function updatePaymentMethod(id: string, patch: Partial<PaymentMethod>): void {
  if (isDemoSession()) {
    _demoMethods = _demoMethods.map(m => m.id === id ? { ...m, ...patch } : m);
    persistDemoMethods();
    _mListeners.forEach(fn => fn());
    return;
  }
  const current = _supabaseMethods.find(m => m.id === id);
  if (!current) { console.error('updatePaymentMethod: method not found in cache', id); return; }
  const merged = { ...current, ...patch };
  _supabaseMethods = _supabaseMethods.map(m => m.id === id ? merged : m);
  _mListeners.forEach(fn => fn());
  void updateSupabaseMethod(id, merged);
}

export function removePaymentMethod(id: string): void {
  if (isDemoSession()) {
    _demoMethods = _demoMethods.filter(m => m.id !== id);
    persistDemoMethods();
    _mListeners.forEach(fn => fn());
    return;
  }
  _supabaseMethods = _supabaseMethods.filter(m => m.id !== id);
  _mListeners.forEach(fn => fn());
  void removeSupabaseMethod(id);
}

export function subscribePaymentMethods(fn: () => void): () => void {
  _mListeners.add(fn);
  return () => _mListeners.delete(fn);
}

// ── PDF storage (delegates to fileContentStore.ts / Cloudflare R2) ─────────────

function pdfKey(invoiceId: string): string {
  return `invoice-pdf-${invoiceId}`;
}

export function savePdf(invoiceId: string, file: File): void {
  setFileContent(pdfKey(invoiceId), file);
  updateInvoice(invoiceId, { hasPdf: true });
}
export function loadPdf(invoiceId: string): string | null {
  return getFileContent(pdfKey(invoiceId));
}
export function removePdf(invoiceId: string): void {
  removeFileContent(pdfKey(invoiceId));
  updateInvoice(invoiceId, { hasPdf: false });
}

// ── Invoice defaults — public API (unchanged signatures) ────────────────────────

export function getInvoiceDefaults(): InvoiceDefaults {
  if (isDemoSession()) return _demoDefaults;
  ensureSupabaseDefaultsFetchStarted();
  return _supabaseDefaults ?? FACTORY_DEFAULTS;
}
export function setInvoiceDefaults(patch: Partial<InvoiceDefaults>): void {
  if (isDemoSession()) {
    _demoDefaults = { ..._demoDefaults, ...patch };
    savePersisted(DEFAULTS_KEY, _demoDefaults);
    _dListeners.forEach(fn => fn());
    return;
  }
  const merged = { ...(_supabaseDefaults ?? FACTORY_DEFAULTS), ...patch };
  _supabaseDefaults = merged;
  _dListeners.forEach(fn => fn());
  void saveSupabaseDefaults(merged);
}
export function subscribeInvoiceDefaults(fn: () => void): () => void {
  _dListeners.add(fn);
  return () => _dListeners.delete(fn);
}

// ── Utilities ─────────────────────────────────────────────────────────────────

export function formatMoney(amount: number, currency = 'CAD'): string {
  return new Intl.NumberFormat('fr-CA', { style: 'currency', currency, maximumFractionDigits: 2 }).format(amount);
}

export function nextInvoiceNumber(): string {
  const year = new Date().getFullYear();
  const defaults = getInvoiceDefaults();
  const prefix = defaults.numberPrefix.trim() || 'INV';
  const nums = getInvoices()
    .map(i => parseInt((i.number.match(/(\d+)$/) ?? ['0'])[0]))
    .filter(n => !isNaN(n));
  const next = nums.length > 0 ? Math.max(...nums) + 1 : 1;
  return `${prefix}-${year}-${String(next).padStart(3, '0')}`;
}

export function addDays(iso: string, days: number): string {
  const d = new Date(iso);
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}
```

- [ ] **Step 2: Vérifier la compilation TypeScript**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: des erreurs vont apparaître dans `Finances.tsx`/`ProjetFinances.tsx` (Task 3/4 pas encore faites — `pdfDataUrl` n'existe plus, `savePdf` attend un `File` pas un `string`) ; aucune nouvelle erreur ne doit provenir de `financeStore.ts` lui-même. Vérifier que les seules erreurs nouvelles pointent vers `Finances.tsx`/`ProjetFinances.tsx`.

- [ ] **Step 3: Commit**

```bash
git add app/src/data/financeStore.ts
git commit -m "feat: financeStore.ts real Supabase persistence for invoices, payment methods, defaults"
```

---

### Task 3: `Finances.tsx` — brancher le PDF sur le nouveau `savePdf`/`loadPdf`, ajouter `hasPdf`

**Files:**
- Modify: `app/src/screens/Finances.tsx`

**Interfaces:**
- Consumes: `savePdf(invoiceId: string, file: File): void`, `loadPdf(invoiceId: string): string | null` (Task 2, `../data/financeStore`), `subscribeUploadStatus(fn: () => void): () => void` (déjà exporté par `../data/fileContentStore`).

- [ ] **Step 1: Importer `subscribeUploadStatus` et `removePdf`**

Le bloc d'import actuel de `financeStore` :

```ts
import {
  getInvoices, addInvoice, updateInvoice, removeInvoice, subscribeInvoices,
  setInvoiceStatus, addInvoiceComment,
  savePdf, loadPdf, formatMoney, nextInvoiceNumber, addDays,
  getInvoiceDefaults, computeTaxLines, TAX_PRESETS,
  type Invoice, type InvoiceStatus, type InvoiceComment, type TaxLine,
} from '../data/financeStore';
```

Remplacer par (ajout de `removePdf`, utilisé par le Step 4 ci-dessous) :

```ts
import {
  getInvoices, addInvoice, updateInvoice, removeInvoice, subscribeInvoices,
  setInvoiceStatus, addInvoiceComment,
  savePdf, loadPdf, removePdf, formatMoney, nextInvoiceNumber, addDays,
  getInvoiceDefaults, computeTaxLines, TAX_PRESETS,
  type Invoice, type InvoiceStatus, type InvoiceComment, type TaxLine,
} from '../data/financeStore';
```

Puis ajouter, avec les autres imports du fichier :

```ts
import { subscribeUploadStatus } from '../data/fileContentStore';
```

- [ ] **Step 2: `InvoiceDetailPanel` — `hasPdf` depuis le champ, re-rendu quand l'URL du PDF devient disponible**

Le bloc actuel :

```tsx
  const { t } = useTranslation();
  const [tab, setTab] = useState<'details' | 'comments'>('details');
  const [commentText, setCommentText] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  const allClients  = getClients();
  const allProjects = getProjects();

  useEffect(() => { if (open) { setTab('details'); setCommentText(''); } }, [open, invoice?.id]);
  useEffect(() => { if (tab === 'comments') bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [tab, invoice?.comments?.length]);

  if (!open || !invoice) return null;

  const client  = allClients.find(c => c.id === invoice.clientId);
  const project = invoice.projectId ? allProjects.find(p => p.id === invoice.projectId) : null;
  const hasPdf  = loadPdf(invoice.id) !== null;
  const terms   = invoice.paymentTermsDays ?? 30;
```

Remplacer par :

```tsx
  const { t } = useTranslation();
  const [tab, setTab] = useState<'details' | 'comments'>('details');
  const [commentText, setCommentText] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [uploadTick, setUploadTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  const allClients  = getClients();
  const allProjects = getProjects();

  useEffect(() => { if (open) { setTab('details'); setCommentText(''); } }, [open, invoice?.id]);
  useEffect(() => { if (tab === 'comments') bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [tab, invoice?.comments?.length]);
  useEffect(() => subscribeUploadStatus(() => setUploadTick(n => n + 1)), []);

  if (!open || !invoice) return null;

  const client  = allClients.find(c => c.id === invoice.clientId);
  const project = invoice.projectId ? allProjects.find(p => p.id === invoice.projectId) : null;
  const hasPdf  = !!invoice.hasPdf;
  const terms   = invoice.paymentTermsDays ?? 30;
```

Puis, dans le même composant, le bloc de l'aperçu PDF :

```tsx
            <iframe src={loadPdf(invoice.id)!} style={{ flex: 1, border: 'none', width: '100%' }} title="PDF" />
```

Remplacer par (le `key={uploadTick}` force l'iframe à se recharger dès que le lien signé devient disponible, pour une session réelle où le premier appel peut renvoyer `null` le temps d'un aller-retour réseau) :

```tsx
            <iframe key={uploadTick} src={loadPdf(invoice.id) ?? ''} style={{ flex: 1, border: 'none', width: '100%' }} title="PDF" />
```

- [ ] **Step 3: `Finances()` (tableau global) — `hasPdf` depuis le champ**

Le bloc actuel (dans la boucle `.map` du tableau) :

```tsx
              const hasPdf  = loadPdf(inv.id) !== null;
```

Remplacer par :

```tsx
              const hasPdf  = !!inv.hasPdf;
```

- [ ] **Step 4: `InvoiceFormPanel` — remplacer l'état `pdfDataUrl` par `hasExistingPdf`/`newPdfFile`**

Le bloc actuel :

```tsx
  const [pdfDataUrl,    setPdfDataUrl]    = useState<string | null>(null);
  const [pdfName,       setPdfName]       = useState('');
```

Remplacer par :

```tsx
  const [hasExistingPdf, setHasExistingPdf] = useState(false);
  const [newPdfFile,     setNewPdfFile]     = useState<File | null>(null);
  const [pdfName,        setPdfName]        = useState('');
```

Le bloc actuel (dans l'effet d'initialisation du formulaire) :

```tsx
      const existing = loadPdf(invoice.id);
      setPdfDataUrl(existing); setPdfName(existing ? 'facture.pdf' : '');
      setCustomDue(false);
```

Remplacer par :

```tsx
      setHasExistingPdf(!!invoice.hasPdf); setNewPdfFile(null); setPdfName(invoice.hasPdf ? 'facture.pdf' : '');
      setCustomDue(false);
```

Le bloc actuel (branche « nouvelle facture » du même effet) :

```tsx
      setPdfDataUrl(null);             setPdfName('');
```

Remplacer par :

```tsx
      setHasExistingPdf(false);        setNewPdfFile(null); setPdfName('');
```

Le bloc actuel :

```tsx
  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setPdfName(file.name);
    const reader = new FileReader();
    reader.onload = () => setPdfDataUrl(reader.result as string);
    reader.readAsDataURL(file);
  };
```

Remplacer par :

```tsx
  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewPdfFile(file);
    setPdfName(file.name);
    setHasExistingPdf(false);
  };
```

Le bloc actuel (fin de `handleSave`) :

```tsx
    if (invoice) { updateInvoice(id, inv); } else { addInvoice(inv); }
    if (pdfDataUrl) savePdf(id, pdfDataUrl);
    onClose();
```

Remplacer par :

```tsx
    if (invoice) { updateInvoice(id, inv); } else { addInvoice(inv); }
    if (newPdfFile) savePdf(id, newPdfFile);
    else if (invoice?.hasPdf && !hasExistingPdf) removePdf(id);
    onClose();
```

- [ ] **Step 5: `InvoiceFormPanel` — bloc d'affichage du champ PDF**

Le bloc actuel :

```tsx
            {pdfDataUrl ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <SFIcon name="file-text" size={14} color="var(--text-3)" />
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfName || 'facture.pdf'}</span>
                <button onClick={() => { setPdfDataUrl(null); setPdfName(''); if (fileRef.current) fileRef.current.value = ''; }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 2 }}>
                  <SFIcon name="x" size={13} />
                </button>
              </div>
            ) : (
```

Remplacer par :

```tsx
            {(hasExistingPdf || newPdfFile) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <SFIcon name="file-text" size={14} color="var(--text-3)" />
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfName || 'facture.pdf'}</span>
                <button onClick={() => { setHasExistingPdf(false); setNewPdfFile(null); setPdfName(''); if (fileRef.current) fileRef.current.value = ''; }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 2 }}>
                  <SFIcon name="x" size={13} />
                </button>
              </div>
            ) : (
```

- [ ] **Step 6: Vérifier la compilation TypeScript**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: retour à 185 erreurs (la référence exacte du projet) — plus aucune erreur liée à `pdfDataUrl` (n'existe plus) ni au type de `savePdf`.

- [ ] **Step 7: Vérification visuelle**

Démarrer `npm run dev` (ou réutiliser le serveur), ouvrir `/finances`. Créer une facture, y attacher un PDF, sauvegarder — la ligne du tableau affiche l'icône PDF. Ouvrir le détail, cliquer « Voir le PDF » — le PDF s'affiche. Rouvrir en modification, retirer le PDF, sauvegarder — l'icône PDF disparaît de la ligne.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/Finances.tsx
git commit -m "feat: wire invoice PDF upload/view to the real file-storage backend"
```

---

### Task 4: `ProjetFinances.tsx` — `hasPdf` depuis le champ

**Files:**
- Modify: `app/src/screens/ProjetFinances.tsx`

**Interfaces:**
- Consumes: `Invoice.hasPdf` (Task 2/3, via `../data/financeStore` — type déjà importé dans ce fichier).

- [ ] **Step 1: Retirer `loadPdf` de l'import (devient inutilisé)**

Le bloc d'import actuel (ligne 6-9) :

```ts
import {
  getInvoicesByProject, subscribeInvoices, removeInvoice, findInvoice,
  setInvoiceStatus, loadPdf, formatMoney, type Invoice,
} from '../data/financeStore';
```

Remplacer par :

```ts
import {
  getInvoicesByProject, subscribeInvoices, removeInvoice, findInvoice,
  setInvoiceStatus, formatMoney, type Invoice,
} from '../data/financeStore';
```

(Confirmé par recherche dans le fichier : `loadPdf` n'a qu'un seul site d'appel, remplacé au Step 2 ci-dessous — son retrait de l'import ne casse rien d'autre.)

- [ ] **Step 2: Remplacer le calcul de `hasPdf`**

Le bloc actuel (dans la boucle `.map` du tableau) :

```tsx
              const hasPdf     = loadPdf(inv.id) !== null;
```

Remplacer par :

```tsx
              const hasPdf     = !!inv.hasPdf;
```

- [ ] **Step 3: Vérifier la compilation TypeScript**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 185 erreurs (référence du projet), aucune nouvelle erreur, aucun avertissement d'import inutilisé pour `loadPdf`.

- [ ] **Step 4: Vérification visuelle**

Ouvrir la page Finance d'un projet ayant une facture avec PDF attaché (ex. `INV-2026-001` du projet `pj1` après le test de la Task 3) — l'icône PDF apparaît bien sur la ligne.

- [ ] **Step 5: Commit**

```bash
git add app/src/screens/ProjetFinances.tsx
git commit -m "fix: read hasPdf from the invoice record in ProjetFinances.tsx"
```

---

### Task 5: Vérification manuelle de bout en bout

**Files:** aucun (vérification seulement).

- [ ] **Step 1: Vérification TypeScript et lint finale**

Run (depuis `app/`): `npx tsc --noEmit -p tsconfig.app.json`
Expected: 185 erreurs (référence du projet), aucune régression.

Run (depuis `app/`): `npm run lint`
Expected: 339 problèmes (référence du projet), aucune régression.

- [ ] **Step 2: Régression démo**

Avec un compte de démonstration (Léa/Sarah/Thomas), sur `/finances` : créer une facture, la modifier, changer son statut, ajouter un commentaire, attacher puis retirer un PDF. Tout doit se comporter exactement comme avant ce chantier (localStorage inchangé).

- [ ] **Step 3: Session réelle — persistance et partage**

Avec un compte réel : créer une facture, changer son statut, ajouter une méthode de paiement, modifier les paramètres par défaut de facturation, attacher un PDF à une facture. Recharger la page (F5) — tout doit persister. Si un deuxième compte du même studio est disponible, vérifier qu'il voit les mêmes factures/méthodes/paramètres.

- [ ] **Step 4: Isolation entre studios**

Avec deux studios différents, confirmer qu'un studio ne voit jamais les factures/méthodes de paiement/paramètres d'un autre studio.

- [ ] **Step 5: PDF — accès et absence de limite**

Attacher un PDF de plus de 3 Mo à une facture en session réelle (impossible avant ce chantier) — confirmer qu'il s'attache et s'affiche correctement, contrairement à la limite `localStorage` d'avant.

- [ ] **Step 6: Revue finale**

Relire `git diff` des 3 fichiers modifiés pour confirmer : aucune référence résiduelle à `pdfDataUrl`, `_invoices`/`_methods`/`_defaults` (renommés en `_demoInvoices`/`_demoMethods`/`_demoDefaults`), et que `Portail.tsx`/`Parametres.tsx`/`FicheClient.tsx` n'ont pas eu besoin de modification (leurs appels à `financeStore.ts` utilisent des signatures inchangées).

- [ ] **Step 7: Commit final (si des ajustements ont été faits pendant la vérification)**

```bash
git add -A
git commit -m "fix: adjustments from end-to-end verification of Finance Supabase migration"
```

(Ne committer que s'il y a effectivement eu des changements pendant cette étape — sinon, sauter ce commit.)
