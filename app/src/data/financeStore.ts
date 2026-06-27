import { loadPersisted, savePersisted } from './persist';

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

// ── Mock data ─────────────────────────────────────────────────────────────────

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

// ── Store state ───────────────────────────────────────────────────────────────

const INVOICES_KEY = 'sf_invoices';
const METHODS_KEY  = 'sf_payment_methods';

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

let _invoices: Invoice[]       = migrateInvoices(loadPersisted(INVOICES_KEY, [...MOCK_INVOICES]));
let _methods:  PaymentMethod[] = loadPersisted(METHODS_KEY,  [...DEFAULT_METHODS]);

const _iListeners = new Set<() => void>();
const _mListeners = new Set<() => void>();

function persistI() { savePersisted(INVOICES_KEY, _invoices); }
function persistM() { savePersisted(METHODS_KEY,  _methods); }

// ── Invoices ──────────────────────────────────────────────────────────────────

export function getInvoices():                     Invoice[]           { return _invoices; }
export function getInvoicesByClient(cid: string):  Invoice[]           { return _invoices.filter(i => i.clientId === cid); }
export function getInvoicesByProject(pid: string): Invoice[]           { return _invoices.filter(i => i.projectId === pid); }
export function findInvoice(id: string):           Invoice | undefined { return _invoices.find(i => i.id === id); }

export function addInvoice(inv: Invoice): void {
  _invoices = [inv, ..._invoices];
  persistI();
  _iListeners.forEach(fn => fn());
}
export function updateInvoice(id: string, patch: Partial<Invoice>): void {
  _invoices = _invoices.map(i => i.id === id ? { ...i, ...patch } : i);
  persistI();
  _iListeners.forEach(fn => fn());
}
export function removeInvoice(id: string): void {
  _invoices = _invoices.filter(i => i.id !== id);
  removePdf(id);
  persistI();
  _iListeners.forEach(fn => fn());
}
export function subscribeInvoices(fn: () => void): () => void {
  _iListeners.add(fn);
  return () => _iListeners.delete(fn);
}

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
  _invoices = _invoices.map(i =>
    i.id === invoiceId ? { ...i, comments: [...(i.comments ?? []), comment] } : i
  );
  persistI();
  _iListeners.forEach(fn => fn());
}

// ── Payment methods ───────────────────────────────────────────────────────────

export function getPaymentMethods():        PaymentMethod[] { return _methods; }
export function getEnabledPaymentMethods(): PaymentMethod[] { return [..._methods].filter(m => m.isEnabled).sort((a, b) => a.sortOrder - b.sortOrder); }

export function addPaymentMethod(m: PaymentMethod): void {
  _methods = [..._methods, m];
  persistM();
  _mListeners.forEach(fn => fn());
}
export function updatePaymentMethod(id: string, patch: Partial<PaymentMethod>): void {
  _methods = _methods.map(m => m.id === id ? { ...m, ...patch } : m);
  persistM();
  _mListeners.forEach(fn => fn());
}
export function removePaymentMethod(id: string): void {
  _methods = _methods.filter(m => m.id !== id);
  persistM();
  _mListeners.forEach(fn => fn());
}
export function subscribePaymentMethods(fn: () => void): () => void {
  _mListeners.add(fn);
  return () => _mListeners.delete(fn);
}

// ── PDF storage ───────────────────────────────────────────────────────────────

export function savePdf(invoiceId: string, dataUrl: string): void {
  try { localStorage.setItem(`sf_inv_pdf_${invoiceId}`, dataUrl); } catch { /* quota */ }
}
export function loadPdf(invoiceId: string): string | null {
  try { return localStorage.getItem(`sf_inv_pdf_${invoiceId}`); } catch { return null; }
}
export function removePdf(invoiceId: string): void {
  try { localStorage.removeItem(`sf_inv_pdf_${invoiceId}`); } catch { /* noop */ }
}

// ── Invoice defaults ──────────────────────────────────────────────────────────

const DEFAULTS_KEY = 'sf_invoice_defaults';
const FACTORY_DEFAULTS: InvoiceDefaults = {
  taxLines: TAX_PRESETS.QC.lines.map(l => ({ ...l })),
  paymentTermsDays: 30,
  currency: 'CAD',
  notes: '',
  numberPrefix: 'INV',
};

let _defaults: InvoiceDefaults = migrateDefaults(loadPersisted(DEFAULTS_KEY, { ...FACTORY_DEFAULTS }));
const _dListeners = new Set<() => void>();

export function getInvoiceDefaults(): InvoiceDefaults { return _defaults; }
export function setInvoiceDefaults(patch: Partial<InvoiceDefaults>): void {
  _defaults = { ..._defaults, ...patch };
  savePersisted(DEFAULTS_KEY, _defaults);
  _dListeners.forEach(fn => fn());
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
  const prefix = _defaults.numberPrefix.trim() || 'INV';
  const nums = _invoices
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
