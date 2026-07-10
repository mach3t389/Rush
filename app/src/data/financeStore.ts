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
import { createLoadingFlag } from './loadingFlag';

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
const _invoicesLoading = createLoadingFlag();
let _supabaseMethods: PaymentMethod[] = [];
let _supabaseMethodsFetchStarted = false;
let _supabaseDefaults: InvoiceDefaults | null = null;
let _supabaseDefaultsFetchStarted = false;

export function resetFinanceCache(): void {
  _supabaseInvoices = [];
  _supabaseInvoicesFetchStarted = false;
  _invoicesLoading.reset();
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
    if (error) { console.error('fetchSupabaseInvoices failed', error); _invoicesLoading.markLoaded(); _iListeners.forEach(fn => fn()); return; }
    _supabaseInvoices = (data as InvoiceRow[]).map(toInvoice);
    _invoicesLoading.markLoaded();
    _iListeners.forEach(fn => fn());
  } catch (err) {
    console.error('fetchSupabaseInvoices failed', err);
    _invoicesLoading.markLoaded();
    _iListeners.forEach(fn => fn());
  }
}

function ensureSupabaseInvoicesFetchStarted(): void {
  if (_supabaseInvoicesFetchStarted) return;
  _supabaseInvoicesFetchStarted = true;
  void fetchSupabaseInvoices();
}

export function isInvoicesLoading(): boolean {
  if (isDemoSession()) return false;
  ensureSupabaseInvoicesFetchStarted();
  return _invoicesLoading.isLoading();
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
