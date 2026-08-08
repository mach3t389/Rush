import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFButton, DatePickerDropdown, formatDisplay, PageHeader, CategoryFilterDropdown } from '../components/ui';
import { getClients, subscribeClients } from '../data/clientStore';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { getCurrentUser } from '../data/authStore';
import { addWatcher, addWatchers } from '../data/watchers';
import { loadProfile } from '../components/profile/ProfileEditPanel';
import { WatchersRow } from '../components/WatchersRow';
import {
  getInvoices, addInvoice, updateInvoice, removeInvoice, removeInvoices, reorderInvoices, subscribeInvoices, findInvoice,
  setInvoiceStatus, addInvoiceComment,
  savePdf, loadPdf, removePdf, formatMoney, nextInvoiceNumber, addDays,
  getInvoiceDefaults, computeTaxLines, TAX_PRESETS,
  type Invoice, type InvoiceStatus, type InvoiceComment, type TaxLine,
} from '../data/financeStore';
import { subscribeUploadStatus } from '../data/fileContentStore';
import { Link } from 'react-router-dom';
import { usePlan } from '../data/planStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { canUseFeature } from '../data/planFeatures';
import { useClampedMenuPosition } from '../hooks/useClampedMenuPosition';
import { BillingRequestPanel } from '../components/finance/BillingRequestPanel';
import { getNorthbookAccountingMode, listBillingRequests, listNorthbookAccountingDocuments, openNorthbookAccountingDocumentPdf, type BillingRequest, type NorthbookAccountingDocument } from '../data/northbookIntegrationStore';

// Sentinel value for the client filter dropdown — selects invoices/projects
// with no client at all (client-less projects), distinct from "" which means
// "no filter applied / all clients".
const NO_CLIENT_FILTER = '__no_client__';

// ── Status config ─────────────────────────────────────────────────────────────

export const STATUS_CFG: Record<InvoiceStatus, { labelKey: string; bg: string; fg: string }> = {
  draft:     { labelKey: 'finance.statusDraft',     bg: 'var(--surface-3)',       fg: 'var(--text-3)'  },
  sent:      { labelKey: 'finance.statusSent',      bg: 'rgba(33,121,243,0.12)', fg: 'var(--info)'    },
  viewed:    { labelKey: 'finance.statusViewed',    bg: 'rgba(149,82,214,0.12)', fg: 'var(--review)'  },
  paid:      { labelKey: 'finance.statusPaid',      bg: 'rgba(34,197,90,0.12)',  fg: 'var(--ok)'      },
  overdue:   { labelKey: 'finance.statusOverdue',   bg: 'rgba(239,68,68,0.12)', fg: 'var(--danger)'  },
  cancelled: { labelKey: 'finance.statusCancelled', bg: 'var(--surface-3)',       fg: 'var(--text-3)'  },
};

// ── Helpers ───────────────────────────────────────────────────────────────────

export function fmtDate(iso: string): string {
  if (!iso) return '—';
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('fr-CA', { year: 'numeric', month: 'short', day: 'numeric' });
}

function todayIso(): string { return new Date().toISOString().slice(0, 10); }

function timeAgo(ts: number): string {
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return "À l'instant";
  if (mins < 60)  return `Il y a ${mins} min`;
  const h = Math.floor(mins / 60);
  if (h < 24)     return `Il y a ${h}h`;
  if (h < 48)     return 'Hier';
  return `Il y a ${Math.floor(h / 24)} j`;
}

function getLastNMonths(n: number): { label: string; year: number; month: number }[] {
  const now = new Date();
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(now.getFullYear(), now.getMonth() - (n - 1 - i), 1);
    return { label: d.toLocaleDateString('fr-CA', { month: 'short' }), year: d.getFullYear(), month: d.getMonth() };
  });
}

// Janvier → décembre de l'année courante — distinct des "12 derniers mois"
// glissants, qui chevauchent deux années civiles la majeure partie du temps.
function getCalendarYearMonths(year: number): { label: string; year: number; month: number }[] {
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(year, i, 1);
    return { label: d.toLocaleDateString('fr-CA', { month: 'short' }), year, month: i };
  });
}

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
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} onClick={e => e.stopPropagation()} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
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

// ── RevenueChart ──────────────────────────────────────────────────────────────

type ChartMode = 'issuedDate' | 'sentDate' | 'paidDate';

const CHART_MODES: Array<{ key: ChartMode; labelKey: string }> = [
  { key: 'issuedDate', labelKey: 'finance.chartByIssuedDate' },
  { key: 'sentDate',   labelKey: 'finance.chartBySentDate'   },
  { key: 'paidDate',   labelKey: 'finance.chartByPaidDate'   },
];

type ChartPeriod = 6 | 12 | 'year';

function RevenueChart({ invoices }: { invoices: Invoice[] }) {
  const { t } = useTranslation();
  const [mode,   setMode]   = useState<ChartMode>('issuedDate');
  const [period, setPeriod] = useState<ChartPeriod>(6);
  const months = period === 'year' ? getCalendarYearMonths(new Date().getFullYear()) : getLastNMonths(period);

  const data = months.map(m => {
    const mi = invoices.filter(i => {
      const d = mode === 'issuedDate' ? i.issuedDate : mode === 'sentDate' ? i.sentDate : i.paidDate;
      if (!d) return false;
      const dt = new Date(d);
      return dt.getFullYear() === m.year && dt.getMonth() === m.month;
    });
    const paid        = mi.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
    const outstanding = mode !== 'paidDate' ? mi.filter(i => ['sent', 'viewed'].includes(i.status)).reduce((s, i) => s + i.total, 0) : 0;
    const overdue     = mode !== 'paidDate' ? mi.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0) : 0;
    const draft       = mode === 'issuedDate' ? mi.filter(i => i.status === 'draft').reduce((s, i) => s + i.total, 0) : 0;
    return { label: m.label, paid, outstanding, overdue, draft, total: paid + outstanding + overdue + draft };
  });

  // A 1$ floor made an empty chart show fractional ticks that rounded to
  // duplicate labels ("1" then "1" then "0"). 100$ keeps ticks meaningful
  // (0/50/100) when there's no real data yet, without affecting real charts
  // (their own max always exceeds it).
  const maxVal = Math.max(100, ...data.map(d => d.total));
  const W = 480; const H = 80;
  const PAD = { t: 4, r: 8, b: 20, l: 44 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const slotW  = chartW / months.length;
  const barW   = slotW * 0.52;

  const yTicks = [0, 0.5, 1].map(p => ({ pct: p, val: maxVal * p, y: PAD.t + chartH * (1 - p) }));

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', flex: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, gap: 8 }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flexShrink: 0 }}>
          {period === 'year' ? t('finance.chartTitleYear', { year: new Date().getFullYear() }) : period === 12 ? t('finance.chartTitle12') : t('finance.chartTitle')}
        </p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Période */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 9, padding: 2, border: '1px solid var(--border)' }}>
            {([6, 12, 'year'] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-text)', background: period === p ? 'var(--surface)' : 'transparent', color: period === p ? 'var(--text)' : 'var(--text-3)', fontWeight: period === p ? 600 : 400, boxShadow: period === p ? '0 1px 4px rgba(0,0,0,0.3)' : 'none', transition: 'all 0.1s' }}>
                {p === 6 ? t('finance.chart6months') : p === 12 ? t('finance.chart12months') : t('finance.chartYear')}
              </button>
            ))}
          </div>
          {/* Mode date */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 9, padding: 2, border: '1px solid var(--border)' }}>
            {CHART_MODES.map(m => (
              <button key={m.key} onClick={() => setMode(m.key)} style={{ fontSize: 11, padding: '4px 9px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-text)', background: mode === m.key ? 'var(--surface)' : 'transparent', color: mode === m.key ? 'var(--text)' : 'var(--text-3)', fontWeight: mode === m.key ? 600 : 400, boxShadow: mode === m.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none', transition: 'all 0.1s' }}>
                {t(m.labelKey)}
              </button>
            ))}
          </div>
        </div>
      </div>
      <svg viewBox={`0 0 ${W} ${H}`} style={{ width: '100%', height: 'auto', display: 'block' }}>
        {yTicks.map(({ val, y, pct }) => (
          <g key={pct}>
            <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border)" strokeWidth={0.5} />
            <text x={PAD.l - 4} y={y + 3} textAnchor="end" style={{ fontSize: '7px', fill: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
              {val >= 1000 ? `${(val / 1000).toFixed(0)}k` : val.toFixed(0)}
            </text>
          </g>
        ))}
        {data.map((d, i) => {
          const cx = PAD.l + i * slotW + slotW / 2;
          const bx = cx - barW / 2;
          const base = PAD.t + chartH;
          const ph = (d.paid / maxVal) * chartH;
          const oh = (d.outstanding / maxVal) * chartH;
          const rh = (d.overdue / maxVal) * chartH;
          const dh = (d.draft / maxVal) * chartH;
          return (
            <g key={i}>
              {dh > 0 && <rect x={bx} y={base - dh - ph - oh - rh} width={barW} height={dh} fill="var(--border-2)" rx={1} />}
              {rh > 0 && <rect x={bx} y={base - rh - ph - oh} width={barW} height={rh} fill="var(--danger)" opacity={0.75} rx={1} />}
              {oh > 0 && <rect x={bx} y={base - oh - ph} width={barW} height={oh} fill="var(--warn)" opacity={0.75} rx={1} />}
              {ph > 0 && <rect x={bx} y={base - ph} width={barW} height={ph} fill="var(--ok)" opacity={0.85} rx={1} />}
              <text x={cx} y={H - 3} textAnchor="middle" style={{ fontSize: '8px', fill: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 12, marginTop: 8, paddingLeft: `${(PAD.l / W) * 100}%` }}>
        {([['var(--ok)', t('finance.statusPaid')], ['var(--warn)', t('finance.statusSent')], ['var(--danger)', t('finance.statusOverdue')], ['var(--border-2)', t('finance.statusDraft')]] as [string, string][]).map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ width: 7, height: 7, borderRadius: 2, background: color, display: 'block', flexShrink: 0 }} />
            <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── StatusDonut ───────────────────────────────────────────────────────────────

function arcPath(cx: number, cy: number, R: number, r: number, startAngle: number, endAngle: number): string {
  const cos = Math.cos, sin = Math.sin;
  const x1 = cx + R * cos(startAngle), y1 = cy + R * sin(startAngle);
  const x2 = cx + R * cos(endAngle),   y2 = cy + R * sin(endAngle);
  const x3 = cx + r * cos(endAngle),   y3 = cy + r * sin(endAngle);
  const x4 = cx + r * cos(startAngle), y4 = cy + r * sin(startAngle);
  const large = endAngle - startAngle > Math.PI ? 1 : 0;
  return `M ${x1} ${y1} A ${R} ${R} 0 ${large} 1 ${x2} ${y2} L ${x3} ${y3} A ${r} ${r} 0 ${large} 0 ${x4} ${y4} Z`;
}

function StatusDonut({ invoices }: { invoices: Invoice[] }) {
  const { t } = useTranslation();

  const paid        = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.filter(i => ['sent', 'viewed'].includes(i.status)).reduce((s, i) => s + i.total, 0);
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const draft       = invoices.filter(i => i.status === 'draft').reduce((s, i) => s + i.total, 0);

  const segments = [
    { value: paid,        color: 'var(--ok)',      label: t('finance.statusPaid')    },
    { value: outstanding, color: 'var(--warn)',     label: t('finance.donutOutstanding') },
    { value: overdue,     color: 'var(--danger)',   label: t('finance.statusOverdue') },
    { value: draft,       color: 'var(--border-2)', label: t('finance.statusDraft')  },
  ].filter(s => s.value > 0);

  const total = segments.reduce((s, seg) => s + seg.value, 0);

  const cx = 70, cy = 70, R = 60, r = 36;
  const GAP = 0.025;
  let angle = -Math.PI / 2;
  const paths = segments.map(seg => {
    const sweep = (seg.value / total) * (2 * Math.PI) - GAP;
    const start = angle + GAP / 2;
    const end   = start + sweep;
    angle += (seg.value / total) * (2 * Math.PI);
    return { d: arcPath(cx, cy, R, r, start, end), color: seg.color, label: seg.label, pct: Math.round(seg.value / total * 100) };
  });

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', flex: 1, minWidth: 0 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: '0 0 8px' }}>{t('finance.donutTitle')}</p>
      {total === 0 ? (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 120, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontSize: 11 }}>—</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <svg viewBox="0 0 140 140" style={{ width: '100%', maxWidth: 140, height: 'auto' }}>
            {paths.map((p, i) => <path key={i} d={p.d} fill={p.color} opacity={0.88} />)}
            <text x={cx} y={cy - 5} textAnchor="middle" style={{ fontFamily: 'var(--ff-mono)', fontSize: '8px', fill: 'var(--text-3)' }}>{t('finance.statusPaid')}</text>
            <text x={cx} y={cy + 10} textAnchor="middle" style={{ fontFamily: 'var(--ff-mono)', fontSize: '13px', fontWeight: 700, fill: 'var(--ok)' }}>{Math.round(paid / total * 100)}%</text>
          </svg>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px 12px', justifyContent: 'center' }}>
            {paths.map((p, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                <span style={{ width: 7, height: 7, borderRadius: 2, background: p.color, flexShrink: 0, display: 'block' }} />
                <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{p.label}</span>
                <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-2)', fontWeight: 600 }}>{p.pct}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── InvoiceDetailPanel ────────────────────────────────────────────────────────

export function InvoiceDetailPanel({
  open, invoice, onClose, onEdit, autoOpenPdf, onAutoOpenedPdf,
}: {
  open: boolean; invoice: Invoice | null; onClose: () => void; onEdit: () => void;
  // Set when opened via the table row's PDF icon — jumps straight to the
  // PDF viewer instead of leaving the user to find "Voir le PDF" themselves.
  autoOpenPdf?: boolean; onAutoOpenedPdf?: () => void;
}) {
  const { t } = useTranslation();
  const [tab, setTab] = useState<'details' | 'comments'>('details');
  const [commentText, setCommentText] = useState('');
  const [pdfOpen, setPdfOpen] = useState(false);
  const [uploadTick, setUploadTick] = useState(0);
  const bottomRef = useRef<HTMLDivElement>(null);

  // getClients()/getProjects() are synchronous caches that start empty in a
  // real session until their background Supabase fetch resolves — without
  // these subscriptions this panel could render with blank project/client
  // names forever if opened before that fetch finished.
  const [, forceClientsProjectsTick] = useState(0);
  useEffect(() => subscribeClients(() => forceClientsProjectsTick(n => n + 1)), []);
  useEffect(() => subscribeProjects(() => forceClientsProjectsTick(n => n + 1)), []);

  const allClients  = getClients();
  const allProjects = getProjects();

  useEffect(() => { if (open) { setTab('details'); setCommentText(''); } }, [open, invoice?.id]);
  useEffect(() => { if (tab === 'comments') bottomRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [tab, invoice?.comments?.length]);
  useEffect(() => subscribeUploadStatus(() => setUploadTick(n => n + 1)), []);
  useEffect(() => {
    if (open && autoOpenPdf && invoice?.hasPdf) { setPdfOpen(true); onAutoOpenedPdf?.(); }
  }, [open, autoOpenPdf, invoice?.hasPdf]);

  if (!open || !invoice) return null;

  const client  = allClients.find(c => c.id === invoice.clientId);
  const project = invoice.projectId ? allProjects.find(p => p.id === invoice.projectId) : null;
  const hasPdf  = !!invoice.hasPdf;
  const terms   = invoice.paymentTermsDays ?? 30;

  const handleComment = () => {
    const text = commentText.trim();
    if (!text) return;
    const currentUser = getCurrentUser();
    const profile = currentUser ? loadProfile(currentUser.id) : null;
    const name = profile?.name ?? currentUser?.name ?? 'Léa Marchand';
    const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
    const comment: InvoiceComment = {
      id: `cmt_${Date.now()}`,
      author: name,
      initials,
      authorColor: currentUser?.avatarColor ?? '#5c3d8f',
      text,
      ts: Date.now(),
    };
    addInvoiceComment(invoice.id, comment, currentUser?.id);
    setCommentText('');
  };

  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 12, padding: '6px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' };
  const labelStyle: React.CSSProperties = { fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block', marginBottom: 4 };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.3)' }} />
      {pdfOpen && hasPdf && (
        <>
          <div onClick={() => setPdfOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 310, background: 'rgba(0,0,0,0.7)' }} />
          <div style={{ position: 'fixed', top: '4%', left: '50%', transform: 'translateX(-50%)', width: 'min(900px,92vw)', height: '90vh', zIndex: 311, background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '10px 14px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{invoice.number} — {invoice.title}</span>
              <button onClick={() => setPdfOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={18} /></button>
            </div>
            <iframe key={uploadTick} src={loadPdf(invoice.id) ?? ''} style={{ flex: 1, border: 'none', width: '100%' }} title="PDF" />
          </div>
        </>
      )}
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

          <div style={{ fontFamily: 'var(--ff-text)', fontSize: 27, fontWeight: 700, color: invoice.status === 'overdue' ? 'var(--danger)' : 'var(--text)', marginBottom: 12 }}>
            {formatMoney(invoice.total, invoice.currency)}
          </div>

          {/* Action buttons */}
          {hasPdf && (
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              <SFButton variant="secondary" icon="file-text" onClick={() => setPdfOpen(true)}>{t('finance.viewPdf')}</SFButton>
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {(['details', 'comments'] as const).map(k => (
            <button key={k} onClick={() => setTab(k)} style={{ flex: 1, padding: '10px 0', background: 'none', border: 'none', borderBottom: tab === k ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, cursor: 'pointer', fontSize: 12, fontWeight: tab === k ? 600 : 400, color: tab === k ? 'var(--text)' : 'var(--text-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, fontFamily: 'var(--ff-text)' }}>
              {k === 'details' ? t('finance.tabDetails') : t('finance.tabComments')}
              {k === 'comments' && (invoice.comments?.length ?? 0) > 0 && (
                <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', borderRadius: 20, padding: '1px 5px' }}>{invoice.comments!.length}</span>
              )}
            </button>
          ))}
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflowY: 'auto', padding: 20 }}>
          {tab === 'details' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
              {/* Client + Project */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>{t('finance.clientLabel')}</label>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{client?.name ?? '—'}</p>
                </div>
                <div>
                  <label style={labelStyle}>{t('finance.projectLabel')}</label>
                  <p style={{ fontSize: 13, fontWeight: 500 }}>{project?.name ?? '—'}</p>
                </div>
              </div>

              {/* Dates */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                <div>
                  <label style={labelStyle}>{t('finance.issuedDate')}</label>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{fmtDate(invoice.issuedDate)}</p>
                </div>
                <div>
                  <label style={labelStyle}>{t('finance.dueDate')}</label>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: invoice.status === 'overdue' ? 'var(--danger)' : 'var(--text)' }}>{fmtDate(invoice.dueDate)}</p>
                </div>
                {invoice.sentDate && (
                  <div>
                    <label style={labelStyle}>{t('finance.sentDate')}</label>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{fmtDate(invoice.sentDate)}</p>
                  </div>
                )}
                {invoice.paidDate && (
                  <div>
                    <label style={labelStyle}>{t('finance.paidDate')}</label>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--ok)' }}>{fmtDate(invoice.paidDate)}</p>
                  </div>
                )}
              </div>

              {/* Payment terms */}
              <div>
                <label style={labelStyle}>{t('finance.paymentTerms')}</label>
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Net {terms}</p>
              </div>

              {/* Amount breakdown */}
              <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '12px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('finance.subtotal')}</span>
                  <span style={{ fontFamily: 'var(--ff-text)', fontSize: 12 }}>{formatMoney(invoice.amount, invoice.currency)}</span>
                </div>
                {invoice.taxLines.filter(l => l.enabled && l.rate > 0).map(l => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l.name} <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10 }}>({l.rate}%)</span></span>
                    <span style={{ fontFamily: 'var(--ff-text)', fontSize: 12 }}>{formatMoney(Math.round(invoice.amount * l.rate / 100 * 100) / 100, invoice.currency)}</span>
                  </div>
                ))}
                {invoice.taxLines.filter(l => l.enabled && l.rate > 0).length === 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('finance.taxLines')}</span>
                    <span style={{ fontFamily: 'var(--ff-text)', fontSize: 12 }}>—</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('finance.total')}</span>
                  <span style={{ fontFamily: 'var(--ff-text)', fontSize: 14, fontWeight: 700 }}>{formatMoney(invoice.total, invoice.currency)}</span>
                </div>
              </div>

              {/* Notes */}
              {invoice.notes && (
                <div>
                  <label style={labelStyle}>{t('finance.notes')}</label>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{invoice.notes}</p>
                </div>
              )}
              {invoice.internalNote && (
                <div style={{ background: 'rgba(249,255,0,0.05)', border: '1px solid rgba(249,255,0,0.15)', borderRadius: 8, padding: '10px 12px' }}>
                  <label style={{ ...labelStyle, color: 'var(--accent)' }}>{t('finance.internalNote')}</label>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{invoice.internalNote}</p>
                </div>
              )}
            </div>
          )}

          {tab === 'comments' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <WatchersRow
                watchers={invoice.watchers ?? []}
                onAdd={id => updateInvoice(invoice.id, { watchers: addWatcher(invoice.watchers, id) })}
                onRemove={id => updateInvoice(invoice.id, { watchers: (invoice.watchers ?? []).filter(w => w !== id) })}
              />
              {(!invoice.comments || invoice.comments.length === 0) && (
                <div style={{ textAlign: 'center', padding: '32px 0', color: 'var(--text-3)' }}>
                  <SFIcon name="message-circle" size={28} color="var(--text-3)" />
                  <p style={{ fontSize: 13, marginTop: 8 }}>{t('finance.noComments')}</p>
                </div>
              )}
              {invoice.comments?.map(c => (
                <div key={c.id} style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
                  <div style={{ width: 30, height: 30, borderRadius: '50%', background: c.authorColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                    {c.initials}
                  </div>
                  <div style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 12px' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 5 }}>
                      <span style={{ fontSize: 12, fontWeight: 600 }}>{c.author}</span>
                      <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{timeAgo(c.ts)}</span>
                    </div>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{c.text}</p>
                  </div>
                </div>
              ))}
              <div ref={bottomRef} />
            </div>
          )}
        </div>

        {/* Comment input */}
        {tab === 'comments' && (
          <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', flexShrink: 0, display: 'flex', gap: 8 }}>
            <textarea
              value={commentText}
              onChange={e => setCommentText(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleComment(); } }}
              placeholder={t('finance.commentPlaceholder')}
              rows={2}
              style={{ ...inputStyle, flex: 1, resize: 'none', fontFamily: 'var(--ff-text)' } as React.CSSProperties}
            />
            <button
              onClick={handleComment}
              disabled={!commentText.trim()}
              style={{ padding: '0 14px', borderRadius: 8, border: 'none', background: commentText.trim() ? 'var(--accent)' : 'var(--surface-3)', color: commentText.trim() ? 'var(--on-accent)' : 'var(--text-3)', cursor: commentText.trim() ? 'pointer' : 'default', display: 'flex', alignItems: 'center', flexShrink: 0 }}
            >
              <SFIcon name="send" size={15} color={commentText.trim() ? 'var(--on-accent)' : 'var(--text-3)'} />
            </button>
          </div>
        )}
      </div>
    </>
  );
}

// ── InvoiceFormPanel ──────────────────────────────────────────────────────────

const PAYMENT_TERMS_OPTIONS = [
  { days: 15,  label: 'Net 15' },
  { days: 30,  label: 'Net 30' },
  { days: 45,  label: 'Net 45' },
  { days: 60,  label: 'Net 60' },
  { days: -1,  label: 'Perso'  },
];

export function InvoiceFormPanel({
  open, invoice, defaultClientId, defaultProjectId, lockedClientId, lockedProjectId, onClose,
}: {
  open: boolean;
  invoice: Invoice | null;
  defaultClientId?: string;
  defaultProjectId?: string;
  lockedClientId?: string;
  lockedProjectId?: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [, forceClientsProjectsTick] = useState(0);
  useEffect(() => subscribeClients(() => forceClientsProjectsTick(n => n + 1)), []);
  useEffect(() => subscribeProjects(() => forceClientsProjectsTick(n => n + 1)), []);
  const allClients  = getClients();
  const allProjects = getProjects();
  const fileRef = useRef<HTMLInputElement>(null);

  const [number,        setNumber]        = useState('');
  const [title,         setTitle]         = useState('');
  const [clientId,      setClientId]      = useState('');
  const [projectId,     setProjectId]     = useState('');
  const [issuedDate,    setIssuedDate]    = useState('');
  const [dueDate,       setDueDate]       = useState('');
  const [issuedAnchor,  setIssuedAnchor]  = useState<DOMRect | null>(null);
  const [dueAnchor,     setDueAnchor]     = useState<DOMRect | null>(null);
  const [amount,        setAmount]        = useState('');
  const [taxLines,      setTaxLines]      = useState<TaxLine[]>([]);
  const [currency,      setCurrency]      = useState('CAD');
  const [status,        setStatus]        = useState<InvoiceStatus>('draft');
  const [payTermsDays,  setPayTermsDays]  = useState(30);
  const [customDue,     setCustomDue]     = useState(false);
  const [notes,         setNotes]         = useState('');
  const [internalNote,  setInternalNote]  = useState('');
  const [hasExistingPdf, setHasExistingPdf] = useState(false);
  const [newPdfFile,     setNewPdfFile]     = useState<File | null>(null);
  const [pdfName,        setPdfName]        = useState('');
  const [pdfDragOver,    setPdfDragOver]    = useState(false);
  const [attemptedSave,  setAttemptedSave]  = useState(false);
  const [titleTouched,   setTitleTouched]   = useState(false);

  const effectiveClientId  = lockedClientId  ?? defaultClientId  ?? '';
  const effectiveProjectId = lockedProjectId ?? defaultProjectId ?? '';

  useEffect(() => {
    if (!open) return;
    if (invoice) {
      setNumber(invoice.number);       setTitle(invoice.title);
      setClientId(invoice.clientId ?? ''); setProjectId(invoice.projectId ?? '');
      setIssuedDate(invoice.issuedDate); setDueDate(invoice.dueDate);
      setAmount(String(invoice.amount)); setTaxLines(invoice.taxLines.map(l => ({ ...l })));
      setCurrency(invoice.currency);   setStatus(invoice.status);
      setPayTermsDays(invoice.paymentTermsDays ?? 30);
      setNotes(invoice.notes ?? '');   setInternalNote(invoice.internalNote ?? '');
      setHasExistingPdf(!!invoice.hasPdf); setNewPdfFile(null); setPdfName(invoice.hasPdf ? 'facture.pdf' : '');
      setCustomDue(false);      setAttemptedSave(false); setTitleTouched(false);
    } else {
      const defs = getInvoiceDefaults();
      setNumber(nextInvoiceNumber());  setTitle('');
      setClientId(effectiveClientId);  setProjectId(effectiveProjectId);
      const today = todayIso();
      setIssuedDate(today);            setDueDate(addDays(today, defs.paymentTermsDays));
      setAmount('');                   setTaxLines(defs.taxLines.map(l => ({ ...l })));
      setCurrency(defs.currency);      setStatus('draft');
      setPayTermsDays(defs.paymentTermsDays); setCustomDue(false);
      setNotes(defs.notes);            setInternalNote('');
      setHasExistingPdf(false);        setNewPdfFile(null); setPdfName('');
      setAttemptedSave(false); setTitleTouched(false);
    }
  }, [open, invoice]);

  // Nom de fichier → intitulé lisible : retire l'extension, remplace
  // tirets/underscores par des espaces, met en majuscule le premier mot.
  const titleFromFilename = (filename: string): string => {
    const base = filename.replace(/\.pdf$/i, '').replace(/[-_]+/g, ' ').trim();
    return base ? base.charAt(0).toUpperCase() + base.slice(1) : base;
  };

  const amtNum = parseFloat(amount) || 0;
  const { tax: taxAmt, total } = computeTaxLines(amtNum, taxLines);

  const setTaxLineField = (idx: number, field: keyof TaxLine, value: string | number | boolean) =>
    setTaxLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  const addTaxLine = () =>
    setTaxLines(prev => [...prev, { id: `tax_${Date.now()}`, name: '', rate: 0, enabled: true }]);
  const removeTaxLine = (idx: number) =>
    setTaxLines(prev => prev.filter((_, i) => i !== idx));

  const clientProjects = clientId
    ? allProjects.filter(p => p.clientId === clientId && p.financeEnabled)
    : allProjects.filter(p => !p.clientId && p.financeEnabled);
  const lockedClientName  = lockedClientId  ? (allClients.find(c => c.id === lockedClientId)?.name  ?? lockedClientId)  : null;
  const lockedProjectName = lockedProjectId ? (allProjects.find(p => p.id === lockedProjectId)?.name ?? lockedProjectId) : null;

  const applyTerms = (days: number) => {
    setPayTermsDays(days);
    setCustomDue(days === -1);
    if (days > 0 && issuedDate) setDueDate(addDays(issuedDate, days));
  };

  const applyPdfFile = (file: File) => {
    setNewPdfFile(file);
    setPdfName(file.name);
    setHasExistingPdf(false);
    if (!title.trim()) setTitle(titleFromFilename(file.name));
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    applyPdfFile(file);
  };

  const handlePdfDrop = (e: React.DragEvent<HTMLButtonElement>) => {
    e.preventDefault();
    setPdfDragOver(false);
    const file = [...e.dataTransfer.files].find(f => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'));
    if (file) applyPdfFile(file);
  };

  const handleSave = () => {
    setAttemptedSave(true);
    if (!title.trim() || !amount) return;
    const id = invoice?.id ?? `inv_${Date.now()}`;
    const project = projectId ? allProjects.find(p => p.id === projectId) : undefined;
    const inv: Invoice = {
      id, number, title: title.trim(), clientId: clientId || null,
      projectId: projectId || undefined,
      amount: amtNum, taxLines, tax: taxAmt, total,
      currency, status, issuedDate, dueDate,
      paymentTermsDays: payTermsDays > 0 ? payTermsDays : undefined,
      notes: notes.trim() || undefined,
      internalNote: internalNote.trim() || undefined,
      ...(invoice?.paidDate ? { paidDate: invoice.paidDate, paidAmount: invoice.paidAmount } : {}),
      ...(invoice?.sentDate ? { sentDate: invoice.sentDate } : {}),
      comments: invoice?.comments,
      watchers: invoice?.watchers ?? addWatchers([], [getCurrentUser()?.id, ...(project?.members.map(m => m.id) ?? [])]),
    };
    if (invoice) { updateInvoice(id, inv); } else { addInvoice(inv); }
    if (newPdfFile) savePdf(id, newPdfFile);
    else if (invoice?.hasPdf && !hasExistingPdf) removePdf(id);
    onClose();
  };

  if (!open) return null;

  const inputStyle: React.CSSProperties = { width: '100%', fontSize: 13, padding: '7px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' };
  const labelStyle: React.CSSProperties = { fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 5, display: 'block' };
  const lockDisplay: React.CSSProperties = { ...inputStyle, color: 'var(--text-2)', display: 'flex', alignItems: 'center', gap: 6, userSelect: 'none', opacity: 0.8 };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.3)' }} />
      <div style={{ position: 'fixed', top: 0, right: 0, bottom: 0, width: 460, zIndex: 201, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 16, margin: 0 }}>
            {invoice ? t('finance.editInvoice') : t('finance.addInvoice')}
          </h2>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
            <SFIcon name="x" size={18} />
          </button>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {/* N° */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.invoiceNumber')}</label>
            <input value={number} onChange={e => setNumber(e.target.value)} style={inputStyle} />
          </div>

          {/* Intitulé */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.invoiceTitle')} <span style={{ color: 'var(--danger)' }}>*</span></label>
            <input value={title} onChange={e => setTitle(e.target.value)} onBlur={() => setTitleTouched(true)} placeholder={t('finance.titlePlaceholder')}
              style={{ ...inputStyle, ...((titleTouched || attemptedSave) && !title.trim() ? { borderColor: 'var(--danger)' } : {}) }} />
          </div>

          {/* Client */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.clientLabel')}</label>
            {lockedClientName ? (
              <div style={lockDisplay}><SFIcon name="lock" size={11} color="var(--text-3)" />{lockedClientName}</div>
            ) : (
              <select value={clientId} onChange={e => { setClientId(e.target.value); setProjectId(''); }} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">{t('finance.noClientOption')}</option>
                {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            )}
          </div>

          {/* Projet */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.projectLabel')}{!lockedProjectId && <span style={{ fontFamily: 'var(--ff-text)', textTransform: 'none', letterSpacing: 0, fontWeight: 400 }}> ({t('finance.optional')})</span>}</label>
            {lockedProjectName ? (
              <div style={lockDisplay}><SFIcon name="lock" size={11} color="var(--text-3)" />{lockedProjectName}</div>
            ) : (
              <select value={projectId} onChange={e => setProjectId(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">{t('finance.noProject')}</option>
                {clientProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
            )}
          </div>

          {/* Conditions de paiement */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle}>{t('finance.paymentTerms')}</label>
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', alignItems: 'center' }}>
              {PAYMENT_TERMS_OPTIONS.map(opt => {
                const active = opt.days === -1 ? customDue : (payTermsDays === opt.days && !customDue);
                return (
                  <button key={opt.days} onClick={() => applyTerms(opt.days)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--on-accent)' : 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontWeight: active ? 600 : 400 }}>
                    {opt.label}
                  </button>
                );
              })}
              {customDue && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>Net</span>
                  <input
                    type="number" min="0" autoFocus
                    value={payTermsDays > 0 ? payTermsDays : ''}
                    onChange={e => {
                      const n = parseInt(e.target.value, 10);
                      const days = Number.isFinite(n) && n >= 0 ? n : 0;
                      setPayTermsDays(days);
                      if (days > 0 && issuedDate) setDueDate(addDays(issuedDate, days));
                    }}
                    placeholder="0"
                    style={{ width: 52, fontSize: 11, padding: '4px 6px', borderRadius: 7, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--ff-mono)' }}
                  />
                  <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('finance.days')}</span>
                </div>
              )}
            </div>
          </div>

          {/* Dates */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>{t('finance.issuedDate')}</label>
              <button onClick={e => setIssuedAnchor(issuedAnchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
                style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-mono)', background: issuedAnchor ? 'var(--surface-3)' : undefined }}>
                {issuedDate ? formatDisplay(issuedDate) : <span style={{ color: 'var(--text-3)' }}>—</span>}
              </button>
              {issuedAnchor && (
                <DatePickerDropdown
                  value={issuedDate}
                  onChange={v => { setIssuedDate(v); setIssuedAnchor(null); if (!customDue && payTermsDays > 0) setDueDate(addDays(v, payTermsDays)); }}
                  onClose={() => setIssuedAnchor(null)}
                  anchorRect={issuedAnchor}
                  zIndex={400}
                />
              )}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>{t('finance.dueDate')}</label>
              <button onClick={e => setDueAnchor(dueAnchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
                style={{ ...inputStyle, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-mono)', background: dueAnchor ? 'var(--surface-3)' : undefined }}>
                {dueDate ? formatDisplay(dueDate) : <span style={{ color: 'var(--text-3)' }}>—</span>}
              </button>
              {dueAnchor && (
                <DatePickerDropdown
                  value={dueDate}
                  onChange={v => { setDueDate(v); setDueAnchor(null); setCustomDue(true); }}
                  onClose={() => setDueAnchor(null)}
                  anchorRect={dueAnchor}
                  zIndex={400}
                />
              )}
            </div>
          </div>

          {/* Montant + Devise */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 90px', gap: 12 }}>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>{t('finance.amount')}</label>
              <input type="number" min="0" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} placeholder="0.00" style={inputStyle} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column' }}>
              <label style={labelStyle}>{t('finance.currency')}</label>
              <select value={currency} onChange={e => setCurrency(e.target.value)} style={{ ...inputStyle, cursor: 'pointer' }}>
                {['CAD', 'USD', 'EUR', 'GBP', 'CHF', 'AUD'].map(c => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
          </div>

          {/* Lignes de taxe */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
              <label style={labelStyle}>{t('finance.taxLines')}</label>
              <select
                defaultValue=""
                onChange={e => {
                  const key = e.target.value;
                  const preset = TAX_PRESETS[key as keyof typeof TAX_PRESETS];
                  if (preset) setTaxLines(preset.lines.map(l => ({ ...l })));
                  e.target.value = '';
                }}
                style={{ fontSize: 11, padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-text)', maxWidth: 200 }}
              >
                <option value="" disabled>{t('finance.applyPreset')}</option>
                {Object.entries(TAX_PRESETS).map(([key, preset]) => (
                  <option key={key} value={key}>{preset.label}</option>
                ))}
              </select>
            </div>
            {taxLines.map((line, idx) => (
              <div key={line.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                {/* Toggle actif */}
                <button
                  type="button"
                  onClick={() => setTaxLineField(idx, 'enabled', !line.enabled)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2, color: line.enabled ? 'var(--ok)' : 'var(--text-3)', display: 'flex', flexShrink: 0 }}
                >
                  <SFIcon name={line.enabled ? 'toggle-right' : 'toggle-left'} size={18} />
                </button>
                {/* Nom */}
                <input
                  value={line.name}
                  onChange={e => setTaxLineField(idx, 'name', e.target.value)}
                  placeholder={t('finance.taxName')}
                  style={{ ...inputStyle, flex: 1, padding: '6px 8px', fontSize: 12, opacity: line.enabled ? 1 : 0.5 }}
                />
                {/* Taux */}
                <input
                  type="number" min="0" step="0.001"
                  value={line.rate}
                  onChange={e => setTaxLineField(idx, 'rate', parseFloat(e.target.value) || 0)}
                  style={{ ...inputStyle, width: 64, padding: '6px 8px', fontSize: 12, textAlign: 'right', opacity: line.enabled ? 1 : 0.5 }}
                />
                <span style={{ fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>%</span>
                {/* Montant calculé */}
                {amtNum > 0 && (
                  <span style={{ fontFamily: 'var(--ff-text)', fontSize: 11, color: line.enabled ? 'var(--text-2)' : 'var(--text-3)', width: 72, textAlign: 'right', flexShrink: 0 }}>
                    {formatMoney(line.enabled ? Math.round(amtNum * line.rate / 100 * 100) / 100 : 0, currency)}
                  </span>
                )}
                {/* Supprimer */}
                <button
                  type="button"
                  onClick={() => removeTaxLine(idx)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 3, flexShrink: 0 }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  <SFIcon name="x" size={13} />
                </button>
              </div>
            ))}
            <button
              type="button"
              onClick={addTaxLine}
              style={{ alignSelf: 'flex-start', fontSize: 11, padding: '4px 10px', borderRadius: 7, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--ff-mono)' }}
            >
              {t('finance.addTax')}
            </button>
          </div>

          {/* Totaux */}
          {amtNum > 0 && (
            <div style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 5 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('finance.subtotal')}</span>
                <span style={{ fontFamily: 'var(--ff-text)', fontSize: 12, color: 'var(--text-2)' }}>{formatMoney(amtNum, currency)}</span>
              </div>
              {taxLines.filter(l => l.enabled && l.rate > 0).map(l => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l.name || t('finance.taxLines')} ({l.rate}%)</span>
                  <span style={{ fontFamily: 'var(--ff-text)', fontSize: 12, color: 'var(--text-2)' }}>{formatMoney(Math.round(amtNum * l.rate / 100 * 100) / 100, currency)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t('finance.total')}</span>
                <span style={{ fontFamily: 'var(--ff-text)', fontSize: 15, fontWeight: 700 }}>{formatMoney(total, currency)}</span>
              </div>
            </div>
          )}

          {/* PDF upload */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.pdfFile')}</label>
            <input ref={fileRef} type="file" accept=".pdf,application/pdf" style={{ display: 'none' }} onChange={handlePdfChange} />
            {(hasExistingPdf || newPdfFile) ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                <SFIcon name="file-text" size={14} color="var(--text-3)" />
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{pdfName || 'facture.pdf'}</span>
                <button onClick={() => { setHasExistingPdf(false); setNewPdfFile(null); setPdfName(''); if (fileRef.current) fileRef.current.value = ''; }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 2 }}>
                  <SFIcon name="x" size={13} />
                </button>
              </div>
            ) : (
              <button
                onClick={() => fileRef.current?.click()}
                onDragOver={e => { e.preventDefault(); setPdfDragOver(true); }}
                onDragLeave={() => setPdfDragOver(false)}
                onDrop={handlePdfDrop}
                style={{
                  display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8,
                  border: `1px dashed ${pdfDragOver ? 'var(--accent)' : 'var(--border-2)'}`,
                  background: pdfDragOver ? 'rgba(249,255,0,0.05)' : 'transparent',
                  color: pdfDragOver ? 'var(--accent)' : 'var(--text-3)',
                  fontSize: 12, cursor: 'pointer', width: '100%', justifyContent: 'center',
                }}
              >
                <SFIcon name="upload" size={14} />
                {t('finance.choosePdf')}
              </button>
            )}
          </div>

          {/* Notes */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.notes')}</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} placeholder={t('finance.notesPlaceholder')} style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />
          </div>

          {/* Note interne */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.internalNote')}</label>
            <textarea value={internalNote} onChange={e => setInternalNote(e.target.value)} rows={2} placeholder={t('finance.internalNotePlaceholder')} style={{ ...inputStyle, resize: 'vertical', minHeight: 56 }} />
          </div>
        </div>

        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <SFButton variant="ghost" onClick={onClose}>{t('finance.cancel')}</SFButton>
          <SFButton variant="primary" onClick={handleSave} disabled={!title.trim() || !amount}>{t('finance.save')}</SFButton>
        </div>
      </div>
    </>
  );
}

// ── Finances (global dashboard) ───────────────────────────────────────────────

const STATUS_FILTERS: Array<{ key: InvoiceStatus | 'all'; labelKey: string }> = [
  { key: 'all',     labelKey: 'finance.filterAll'     },
  { key: 'draft',   labelKey: 'finance.filterDraft'   },
  { key: 'sent',    labelKey: 'finance.filterSent'    },
  { key: 'viewed',  labelKey: 'finance.filterViewed'  },
  { key: 'paid',    labelKey: 'finance.filterPaid'    },
  { key: 'overdue', labelKey: 'finance.filterOverdue' },
];

export function FinancesLocked() {
  const { t } = useTranslation();
  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 16, padding: 24 }}>
      <div style={{ width: 56, height: 56, borderRadius: 16, background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SFIcon name="lock" size={24} color="var(--accent)" />
      </div>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--ff-display)', marginBottom: 8 }}>{t('finance.lockedTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('finance.lockedBody')}</p>
      </div>
      <Link to="/parametres?section=plan" style={{ padding: '11px 20px', borderRadius: 9, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, textDecoration: 'none', fontFamily: 'var(--ff-text)' }}>
        {t('finance.lockedCta')}
      </Link>
    </div>
  );
}

// ── Move invoice(s) to another project ───────────────────────────────────────
// Moving updates both projectId and clientId (to the target project's own
// client) so an invoice never ends up pointing at a project/client mismatch.

function MoveInvoicesModal({ count, projects, onMove, onClose }: {
  count: number;
  projects: ReturnType<typeof getProjects>;
  onMove: (projectId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const filtered = projects.filter(p => !p.archived && p.financeEnabled && p.name.toLowerCase().includes(search.toLowerCase()));

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 600 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, zIndex: 601, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.75)', overflow: 'hidden', display: 'flex', flexDirection: 'column', maxHeight: '70vh' }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{t('finance.moveInvoicesTitle', { count })}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        <div style={{ padding: '12px 20px 0' }}>
          <input autoFocus value={search} onChange={e => setSearch(e.target.value)} placeholder={t('members.searchPlaceholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)' }} />
        </div>
        <div style={{ padding: '10px 12px 16px', display: 'flex', flexDirection: 'column', gap: 4, overflowY: 'auto' }}>
          {filtered.map(p => (
            <button key={p.id} onClick={() => onMove(p.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
              onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
            >
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor, display: 'block', flexShrink: 0 }} />
              <span style={{ fontSize: 13 }}>{p.name}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)', marginLeft: 'auto', fontFamily: 'var(--ff-mono)' }}>{p.clientName}</span>
            </button>
          ))}
          {filtered.length === 0 && (
            <p style={{ padding: '8px 10px', fontSize: 12, color: 'var(--text-3)' }}>{t('members.noResults')}</p>
          )}
        </div>
      </div>
    </>
  );
}

// ── Row / bulk context menu ──────────────────────────────────────────────────

function InvoiceContextMenu({ pos, count, onOpen, onMove, onDelete, onClose }: {
  pos: { x: number; y: number };
  count: number;
  onOpen?: () => void;
  onMove: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const coords = useClampedMenuPosition(ref, pos);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  const item = (label: React.ReactNode, action: () => void, danger = false) => (
    <button onClick={() => { action(); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >{label}</button>
  );
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left: coords.left, top: coords.top, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 200, padding: '4px 0', overflow: 'hidden', maxHeight: coords.maxHeight, overflowY: coords.maxHeight ? 'auto' : 'hidden' }}>
      {onOpen && item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>{t('tasks.openDetail')}</span></>, onOpen)}
      {item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>{t('taskPanel.moveToProject')}</span></>, onMove)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{count > 1 ? t('finance.deleteInvoicesCount', { count }) : t('finance.deleteInvoice')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

export function Finances() {
  const { t } = useTranslation();
  const [invoices,      setInvoices]      = useState<Invoice[]>(getInvoices);
  const [filter,        setFilter]        = usePersistedState<InvoiceStatus | 'all'>('sf_finances_status_filter', 'all');
  const [search,        setSearch]        = useState('');
  const [clientFilter,  setClientFilter]  = usePersistedState('sf_finances_client_filter', '');
  const [projectFilter, setProjectFilter] = usePersistedState('sf_finances_project_filter', '');
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');
  const [dateFromAnchor, setDateFromAnchor] = useState<DOMRect | null>(null);
  const [dateToAnchor,   setDateToAnchor]   = useState<DOMRect | null>(null);
  const [dateField,     setDateField]     = useState<'issuedDate' | 'dueDate' | 'paidDate'>('issuedDate');
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [editInvoice,   setEditInvoice]   = useState<Invoice | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [autoOpenPdf, setAutoOpenPdf] = useState(false);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);
  const [multiSelIds,   setMultiSelIds]   = useState<Set<string>>(new Set());
  const [bulkDeleteConfirm, setBulkDeleteConfirm] = useState(false);
  const [bulkMoveOpen,  setBulkMoveOpen]  = useState(false);
  const [ctxMenu,       setCtxMenu]       = useState<{ x: number; y: number; ids: string[] } | null>(null);
  const [dragId,        setDragId]        = useState<string | null>(null);
  const [dragOverId,    setDragOverId]    = useState<string | null>(null);
  const [accountingMode, setAccountingMode] = useState<'native' | 'northbook'>('native');
  const [accountingCurrency, setAccountingCurrency] = useState('CAD');
  const [billingRequests, setBillingRequests] = useState<BillingRequest[]>([]);
  const [northbookDocuments, setNorthbookDocuments] = useState<NorthbookAccountingDocument[]>([]);
  const [billingRequestOpen, setBillingRequestOpen] = useState(false);
  const anchorIdRef = useRef<string | null>(null);

  useEffect(() => subscribeInvoices(() => setInvoices(getInvoices())), []);
  const refreshBillingRequests = React.useCallback(() => {
    void listBillingRequests().then(setBillingRequests).catch(() => setBillingRequests([]));
    void listNorthbookAccountingDocuments().then(setNorthbookDocuments).catch(() => setNorthbookDocuments([]));
  }, []);
  useEffect(() => {
    void getNorthbookAccountingMode().then(result => {
      setAccountingMode(result.accountingMode);
      setAccountingCurrency(result.accountingCurrency);
      if (result.accountingMode === 'northbook') refreshBillingRequests();
    });
  }, [refreshBillingRequests]);

  // Must be declared before the plan-lock early return below — a hook
  // declared after a conditional return is skipped on renders that take
  // that branch, which changes the hook count between renders and crashes
  // with React error #310.
  const [, forceClientsProjectsTick] = useState(0);
  useEffect(() => subscribeClients(() => forceClientsProjectsTick(n => n + 1)), []);
  useEffect(() => subscribeProjects(() => forceClientsProjectsTick(n => n + 1)), []);

  const plan = usePlan();
  if (!canUseFeature(plan, 'finances')) {
    return <FinancesLocked />;
  }

  const allClients  = getClients();
  const allProjects = getProjects();
  const clientMap   = Object.fromEntries(allClients.map(c  => [c.id, c]));
  const projectMap  = Object.fromEntries(allProjects.map(p => [p.id, p]));
  const financeInvoices: Invoice[] = accountingMode === 'northbook' ? northbookDocuments : invoices;

  const clientFilterProjects = clientFilter === NO_CLIENT_FILTER
    ? allProjects.filter(p => !p.clientId && p.financeEnabled)
    : clientFilter
    ? allProjects.filter(p => p.clientId === clientFilter && p.financeEnabled)
    : allProjects.filter(p => p.financeEnabled);

  const revenue     = financeInvoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const outstanding = financeInvoices.filter(i => ['sent', 'viewed'].includes(i.status)).reduce((s, i) => s + i.total, 0);
  const overdue     = financeInvoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const draftCount  = financeInvoices.filter(i => i.status === 'draft').length;
  const totalInvoiced = financeInvoices.reduce((s, i) => s + i.total, 0);
  const paidCount   = financeInvoices.filter(i => i.status === 'paid').length;
  const payRate     = financeInvoices.length > 0 ? Math.round((paidCount / financeInvoices.length) * 100) : 0;

  const applyDatePreset = (key: 'thisMonth' | 'lastMonth' | 'thisQuarter' | 'thisYear') => {
    const now = new Date();
    const y = now.getFullYear();
    const m = now.getMonth();
    let from = '', to = '';
    if (key === 'thisMonth') {
      from = new Date(y, m, 1).toISOString().slice(0, 10);
      to   = new Date(y, m + 1, 0).toISOString().slice(0, 10);
    } else if (key === 'lastMonth') {
      from = new Date(y, m - 1, 1).toISOString().slice(0, 10);
      to   = new Date(y, m, 0).toISOString().slice(0, 10);
    } else if (key === 'thisQuarter') {
      const q = Math.floor(m / 3);
      from = new Date(y, q * 3, 1).toISOString().slice(0, 10);
      to   = new Date(y, q * 3 + 3, 0).toISOString().slice(0, 10);
    } else {
      from = `${y}-01-01`;
      to   = `${y}-12-31`;
    }
    setDateFrom(from); setDateTo(to);
  };

  const hasDateFilter = dateFrom !== '' || dateTo !== '';
  const hasAnyFilter  = filter !== 'all' || clientFilter !== '' || projectFilter !== '' || search !== '' || hasDateFilter;

  // sortOrder is only set once the user has manually reordered at least
  // once (see reorderInvoices) — until then, keep the store's own order.
  const orderedInvoices = financeInvoices.some(i => i.sortOrder !== undefined)
    ? [...financeInvoices].sort((a, b) => (a.sortOrder ?? Infinity) - (b.sortOrder ?? Infinity))
    : financeInvoices;

  const filtered = orderedInvoices.filter(inv => {
    if (filter !== 'all' && inv.status !== filter) return false;
    if (clientFilter === NO_CLIENT_FILTER && inv.clientId) return false;
    if (clientFilter && clientFilter !== NO_CLIENT_FILTER && inv.clientId !== clientFilter) return false;
    if (projectFilter && inv.projectId !== projectFilter) return false;
    if (hasDateFilter) {
      const d = (inv[dateField] ?? '') as string;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const c = inv.clientId ? clientMap[inv.clientId] : null;
      const p = inv.projectId ? projectMap[inv.projectId] : null;
      if (![inv.number, inv.title, c?.name ?? '', p?.name ?? ''].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const clearAllFilters = () => {
    setFilter('all'); setClientFilter(''); setProjectFilter('');
    setSearch(''); setDateFrom(''); setDateTo('');
  };

  const openAdd     = () => {
    if (accountingMode === 'northbook') { setBillingRequestOpen(true); return; }
    setEditInvoice(null); setPanelOpen(true);
  };
  const openEdit    = (inv: Invoice) => { setEditInvoice(inv); setPanelOpen(true); };
  const openDetail  = (inv: Invoice) => setDetailInvoice(inv);
  const closeForm   = () => { setPanelOpen(false); if (editInvoice) setDetailInvoice(findInvoice(editInvoice.id) ?? editInvoice); };

  // Ctrl/Cmd = toggle one, Shift = range from the last-clicked row, plain
  // click = open the detail panel (same as before multi-select existed).
  const handleRowClick = (inv: Invoice, e: React.MouseEvent) => {
    const orderedIds = filtered.map(i => i.id);
    if (e.shiftKey && anchorIdRef.current) {
      const a = orderedIds.indexOf(anchorIdRef.current);
      const b = orderedIds.indexOf(inv.id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setMultiSelIds(new Set(orderedIds.slice(lo, hi + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setMultiSelIds(prev => {
        const next = new Set(prev);
        next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id);
        return next;
      });
      anchorIdRef.current = inv.id;
      return;
    }
    if (multiSelIds.size > 0) { setMultiSelIds(new Set()); return; }
    openDetail(inv);
  };

  const openRowContextMenu = (inv: Invoice, e: React.MouseEvent) => {
    e.preventDefault();
    if (!multiSelIds.has(inv.id)) setMultiSelIds(new Set([inv.id]));
    setCtxMenu({ x: e.clientX, y: e.clientY, ids: multiSelIds.has(inv.id) ? [...multiSelIds] : [inv.id] });
  };

  const moveInvoicesToProject = (ids: string[], projectId: string) => {
    const project = allProjects.find(p => p.id === projectId);
    if (!project) return;
    ids.forEach(id => updateInvoice(id, { projectId: project.id, clientId: project.clientId ?? null }));
  };

  const bulkDelete = () => {
    removeInvoices([...multiSelIds]);
    setMultiSelIds(new Set());
    setBulkDeleteConfirm(false);
  };

  // Only meaningful against the full, unfiltered order — reordering a
  // filtered subset wouldn't map cleanly onto the other invoices' positions.
  const canReorder = !hasAnyFilter;
  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const current = [...orderedInvoices];
    const srcIdx = current.findIndex(i => i.id === dragId);
    const dstIdx = current.findIndex(i => i.id === targetId);
    if (srcIdx === -1 || dstIdx === -1) { setDragId(null); setDragOverId(null); return; }
    const [moved] = current.splice(srcIdx, 1);
    current.splice(dstIdx, 0, moved);
    reorderInvoices(current.map(i => i.id));
    setDragId(null);
    setDragOverId(null);
  };

  const thStyle: React.CSSProperties = { fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' };
  const actionBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 5, borderRadius: 6 };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title={t('finance.title')}
        actions={<SFButton variant="primary" icon={accountingMode === 'northbook' ? 'send' : 'plus'} onClick={openAdd}>{accountingMode === 'northbook' ? 'Demander une facturation' : t('finance.newInvoice')}</SFButton>}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <span style={{ position: 'absolute', left: 9, pointerEvents: 'none', display: 'flex' }}><SFIcon name="search" size={13} color="var(--text-3)" /></span>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('finance.search')} style={{ fontSize: 12, padding: '6px 10px 6px 28px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', width: 200 }} />
        </div>
        <CategoryFilterDropdown
          value={filter}
          onChange={setFilter}
          categoryLabel={t('finance.statusLabel')}
          options={STATUS_FILTERS.map(f => ({ value: f.key, label: t(f.labelKey) }))}
        />
        </div>
      </PageHeader>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {accountingMode === 'northbook' && (
          <section style={{ marginBottom: 18, background: 'linear-gradient(100deg, color-mix(in srgb, #174a35 15%, var(--surface)), var(--surface))', border: '1px solid color-mix(in srgb, var(--ok) 30%, var(--border))', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <SFIcon name="book-open" size={17} color="var(--ok)" />
              <div style={{ flex: 1 }}><p style={{ fontSize: 12, fontWeight: 650 }}>Comptabilité gérée par Northbook</p><p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{billingRequests.filter(request => request.status === 'submitted').length} demande(s) en attente · {accountingCurrency}</p></div>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--ok)' }}>SYNCHRONISÉ</span>
            </div>
            {billingRequests.length > 0 && <div style={{ display: 'flex', gap: 8, overflowX: 'auto', marginTop: 11, paddingTop: 11, borderTop: '1px solid var(--border)' }}>
              {billingRequests.slice(0, 6).map(request => <div key={request.id} style={{ minWidth: 190, padding: '8px 10px', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9 }}><p style={{ fontSize: 11, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{request.title}</p><p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', marginTop: 3, textTransform: 'uppercase' }}>{request.status}</p></div>)}
            </div>}
          </section>
        )}

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { labelKey: 'finance.kpiRevenue',    value: formatMoney(revenue),        icon: 'trending-up',  iconColor: 'var(--ok)',     valueColor: 'var(--ok)' },
            { labelKey: 'finance.kpiOutstanding', value: formatMoney(outstanding),    icon: 'clock',        iconColor: 'var(--warn)',   valueColor: 'var(--text)' },
            { labelKey: 'finance.kpiOverdue',     value: formatMoney(overdue),        icon: 'circle-alert', iconColor: 'var(--danger)', valueColor: overdue > 0 ? 'var(--danger)' : 'var(--text)' },
            { labelKey: 'finance.kpiDraft',       value: String(draftCount),          icon: 'file-text',    iconColor: 'var(--text-3)', valueColor: 'var(--text)' },
            { labelKey: 'finance.kpiTotalInvoiced',value: formatMoney(totalInvoiced), icon: 'layers',       iconColor: 'var(--info)',   valueColor: 'var(--text)' },
            { labelKey: 'finance.kpiPayRate',     value: `${payRate}%`,               icon: 'percent',      iconColor: 'var(--ok)',     valueColor: payRate >= 70 ? 'var(--ok)' : 'var(--text)' },
          ].map(k => (
            <div key={k.labelKey} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <SFIcon name={k.icon} size={12} color={k.iconColor} />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t(k.labelKey)}</span>
              </div>
              <p style={{ fontSize: 19, fontWeight: 700, color: k.valueColor, fontFamily: 'var(--ff-text)' }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Charts row — 2/3 barres + 1/3 donut */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
          <RevenueChart invoices={financeInvoices} />
          <StatusDonut invoices={financeInvoices} />
        </div>

        {/* Filter bar — client / project */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Client */}
          <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setProjectFilter(''); }} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: clientFilter ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t('finance.allClients')}</option>
            <option value={NO_CLIENT_FILTER}>{t('finance.noClientFilterOption')}</option>
            {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {/* Project */}
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: projectFilter ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t('finance.allProjects')}</option>
            {clientFilterProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>

        {/* Date filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {/* Date field selector */}
          <div style={{ display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 9, padding: 2, border: '1px solid var(--border)', flexShrink: 0 }}>
            {(['issuedDate', 'dueDate', 'paidDate'] as const).map(field => (
              <button key={field} onClick={() => setDateField(field)} style={{ fontSize: 12, padding: '5px 11px', borderRadius: 7, border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-text)', transition: 'all 0.1s', background: dateField === field ? 'var(--surface)' : 'transparent', color: dateField === field ? 'var(--text)' : 'var(--text-3)', fontWeight: dateField === field ? 600 : 400, boxShadow: dateField === field ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}>
                {t(`finance.date${field.charAt(0).toUpperCase()}${field.slice(1)}` as any)}
              </button>
            ))}
          </div>
          {/* Presets */}
          {(['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'] as const).map(preset => (
            <button key={preset} onClick={() => applyDatePreset(preset)}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-text)', fontWeight: 500, whiteSpace: 'nowrap', transition: 'background 0.12s, color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
            >
              {t(`finance.preset${preset.charAt(0).toUpperCase()}${preset.slice(1)}` as any)}
            </button>
          ))}
          {/* From / To inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>{t('finance.dateFrom')}</span>
            <button onClick={e => setDateFromAnchor(dateFromAnchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, border: `1px solid ${dateFrom ? 'var(--accent)' : 'var(--border)'}`, background: dateFromAnchor ? 'var(--surface-3)' : 'var(--surface-2)', color: dateFrom ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--ff-text)', minWidth: 84 }}>
              {dateFrom ? formatDisplay(dateFrom) : '—'}
            </button>
            {dateFromAnchor && <DatePickerDropdown value={dateFrom} onChange={v => { setDateFrom(v); setDateFromAnchor(null); }} onClose={() => setDateFromAnchor(null)} anchorRect={dateFromAnchor} zIndex={500} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>{t('finance.dateTo')}</span>
            <button onClick={e => setDateToAnchor(dateToAnchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
              style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, border: `1px solid ${dateTo ? 'var(--accent)' : 'var(--border)'}`, background: dateToAnchor ? 'var(--surface-3)' : 'var(--surface-2)', color: dateTo ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--ff-text)', minWidth: 84 }}>
              {dateTo ? formatDisplay(dateTo) : '—'}
            </button>
            {dateToAnchor && <DatePickerDropdown value={dateTo} onChange={v => { setDateTo(v); setDateToAnchor(null); }} onClose={() => setDateToAnchor(null)} anchorRect={dateToAnchor} zIndex={500} />}
          </div>
          {hasDateFilter && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ display: 'flex', alignItems: 'center', padding: 6, borderRadius: 999, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
              <SFIcon name="x" size={12} />
            </button>
          )}
          <div style={{ flex: 1 }} />
          {/* Results count + clear all */}
          {filtered.length !== financeInvoices.length && (
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{filtered.length} / {financeInvoices.length}</span>
          )}
          {hasAnyFilter && (
            <button onClick={clearAllFilters} style={{ fontSize: 12, padding: '5px 12px', borderRadius: 999, border: 'none', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5, fontFamily: 'var(--ff-text)', fontWeight: 500 }}>
              <SFIcon name="funnel-x" size={12} />
              {t('finance.clearFilters')}
            </button>
          )}
        </div>

        {/* Table */}
        {filtered.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--text-3)', gap: 10 }}>
            <SFIcon name="receipt" size={32} color="var(--text-3)" />
            <p style={{ fontSize: 14, fontWeight: 500 }}>{t('finance.noInvoices')}</p>
            <p style={{ fontSize: 12 }}>{t('finance.noInvoicesDesc')}</p>
            <SFButton variant="secondary" icon={accountingMode === 'northbook' ? 'send' : 'plus'} onClick={openAdd}>{accountingMode === 'northbook' ? 'Demander une facturation' : t('finance.addInvoice')}</SFButton>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '28px 140px 120px 130px 1fr 110px 100px 100px 100px', padding: '8px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <span />
              <span style={thStyle}>{t('finance.colNumber')}</span>
              <span style={thStyle}>{t('finance.colClient')}</span>
              <span style={thStyle}>{t('finance.colProject')}</span>
              <span style={thStyle}>{t('finance.colTitle')}</span>
              <span style={{ ...thStyle, textAlign: 'right', paddingRight: 10 }}>{t('finance.colAmount')}</span>
              <span style={{ ...thStyle, paddingLeft: 4 }}>{t('finance.colStatus')}</span>
              <span style={thStyle}>{t('finance.colDue')}</span>
              <span />
            </div>
            {filtered.map((inv, i) => {
              const client  = inv.clientId ? clientMap[inv.clientId] : null;
              const project = inv.projectId ? projectMap[inv.projectId] : null;
              const hasPdf  = !!inv.hasPdf;
              const isLate  = inv.status === 'overdue';
              const confirming = deleteId === inv.id;
              const commentCount = inv.comments?.length ?? 0;
              const selected = multiSelIds.has(inv.id);

              return (
                <div key={inv.id}
                  draggable={canReorder}
                  onDragStart={() => setDragId(inv.id)}
                  onDragOver={e => { if (canReorder) { e.preventDefault(); setDragOverId(inv.id); } }}
                  onDrop={() => canReorder && handleDrop(inv.id)}
                  onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                  style={{ display: 'grid', gridTemplateColumns: '28px 140px 120px 130px 1fr 110px 100px 100px 100px', padding: '11px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', background: selected ? 'rgba(249,255,0,0.08)' : dragOverId === inv.id ? 'var(--surface-3)' : isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)', outline: selected ? '1px solid rgba(249,255,0,0.35)' : 'none', outlineOffset: '-1px', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isLate && !selected) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = selected ? 'rgba(249,255,0,0.08)' : isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)'; }}
                  onClick={e => { if (accountingMode !== 'northbook') handleRowClick(inv, e); }}
                  onContextMenu={e => { if (accountingMode !== 'northbook') openRowContextMenu(inv, e); }}
                >
                  <div
                    onClick={e => {
                      e.stopPropagation();
                      setMultiSelIds(prev => { const next = new Set(prev); next.has(inv.id) ? next.delete(inv.id) : next.add(inv.id); return next; });
                      anchorIdRef.current = inv.id;
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: canReorder ? 'grab' : 'default' }}
                  >
                    {canReorder && !selected ? (
                      <SFIcon name="grip-vertical" size={12} color="var(--text-3)" style={{ opacity: 0.5 }} />
                    ) : (
                      <span style={{ width: 15, height: 15, borderRadius: 4, border: selected ? 'none' : '1.5px solid var(--border-2)', background: selected ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        {selected && <SFIcon name="check" size={10} color="var(--on-accent)" />}
                      </span>
                    )}
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>{inv.number}</span>
                    {commentCount > 0 && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', borderRadius: 20, padding: '0 4px', color: 'var(--text-3)' }}>{commentCount}</span>}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{client?.name ?? '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{project?.name ?? '—'}</span>
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{inv.title}</span>
                  <span style={{ fontSize: 13, fontWeight: 600, textAlign: 'right', paddingRight: 10 }}>{formatMoney(inv.total, inv.currency)}</span>
                  <span><StatusPill status={inv.status} onChange={accountingMode === 'northbook' ? undefined : s => setInvoiceStatus(inv.id, s)} /></span>
                  <span style={{ fontSize: 12, color: isLate ? 'var(--danger)' : 'var(--text-3)' }}>{fmtDate(inv.dueDate)}</span>

                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', alignItems: 'center' }} onClick={e => e.stopPropagation()}>
                    {hasPdf && (
                      <button title={t('finance.viewPdf')} onClick={() => {
                        if (accountingMode === 'northbook') {
                          void openNorthbookAccountingDocumentPdf(inv.id);
                        } else {
                          setAutoOpenPdf(true);
                          openDetail(inv);
                        }
                      }}
                        style={{ ...actionBtn, width: 28, height: 28, justifyContent: 'center', border: '1px solid var(--border)', background: 'var(--surface-2)' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                        <SFIcon name="file-text" size={14} />
                      </button>
                    )}
                    {accountingMode === 'northbook' ? (
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--ok)' }}>NORTHBOOK</span>
                    ) : confirming ? (
                      <div style={{ display: 'flex', gap: 4 }}>
                        <button onClick={() => { removeInvoice(inv.id); setDeleteId(null); }} style={{ ...actionBtn, color: 'var(--danger)', fontSize: 10, fontWeight: 600, padding: '4px 8px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{t('finance.confirmDeleteShort')}</button>
                        <button onClick={() => setDeleteId(null)} style={{ ...actionBtn, fontSize: 10, padding: '4px 8px' }}>{t('finance.cancel')}</button>
                      </div>
                    ) : (
                      <button title={t('finance.deleteInvoice')} onClick={e => { e.stopPropagation(); setDeleteId(inv.id); }}
                        style={{ ...actionBtn, width: 28, height: 28, justifyContent: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                        <SFIcon name="trash-2" size={13} />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <InvoiceFormPanel open={panelOpen} invoice={editInvoice} onClose={closeForm} />
      <BillingRequestPanel
        open={billingRequestOpen}
        currency={accountingCurrency}
        clients={allClients}
        projects={allProjects}
        onClose={() => setBillingRequestOpen(false)}
        onCreated={refreshBillingRequests}
      />
      <InvoiceDetailPanel
        open={detailInvoice !== null}
        invoice={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onEdit={() => { openEdit(detailInvoice!); setDetailInvoice(null); }}
        autoOpenPdf={autoOpenPdf}
        onAutoOpenedPdf={() => setAutoOpenPdf(false)}
      />

      {/* Multi-select floating action bar */}
      {multiSelIds.size > 0 && createPortal(
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.55)', zIndex: 400 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>{t('finance.invoiceCount', { count: multiSelIds.size })}</span>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          {bulkDeleteConfirm ? (
            <>
              <span style={{ fontSize: 12, color: 'var(--danger)' }}>{t('finance.deleteInvoicesConfirm', { count: multiSelIds.size })}</span>
              <button onClick={bulkDelete} style={{ padding: '6px 12px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.yes')}</button>
              <button onClick={() => setBulkDeleteConfirm(false)} style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.no')}</button>
            </>
          ) : (
            <>
              <button onClick={() => setBulkMoveOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
                <SFIcon name="move-right" size={13} />
                {t('taskPanel.moveToProject')}
              </button>
              <button onClick={() => setBulkDeleteConfirm(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', cursor: 'pointer', color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
                <SFIcon name="trash-2" size={13} />
                {t('tasks.delete')}
              </button>
            </>
          )}
          <button onClick={() => { setMultiSelIds(new Set()); setBulkDeleteConfirm(false); }} style={{ display: 'flex', alignItems: 'center', padding: '4px', borderRadius: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <SFIcon name="x" size={14} />
          </button>
        </div>,
        document.body,
      )}

      {bulkMoveOpen && (
        <MoveInvoicesModal
          count={multiSelIds.size}
          projects={allProjects}
          onMove={projectId => { moveInvoicesToProject([...multiSelIds], projectId); setBulkMoveOpen(false); setMultiSelIds(new Set()); }}
          onClose={() => setBulkMoveOpen(false)}
        />
      )}

      {ctxMenu && (
        <InvoiceContextMenu
          pos={ctxMenu}
          count={ctxMenu.ids.length}
          onOpen={ctxMenu.ids.length === 1 ? () => { const inv = invoices.find(i => i.id === ctxMenu.ids[0]); if (inv) openDetail(inv); setCtxMenu(null); } : undefined}
          onMove={() => { setBulkMoveOpen(true); setCtxMenu(null); }}
          onDelete={() => { setBulkDeleteConfirm(true); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
