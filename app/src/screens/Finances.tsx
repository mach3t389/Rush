import React, { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFButton, DatePickerDropdown, formatDisplay } from '../components/ui';
import { getClients } from '../data/clientStore';
import { getProjects } from '../data/projectStore';
import { getCurrentUser } from '../data/authStore';
import { loadProfile } from '../components/profile/ProfileEditPanel';
import {
  getInvoices, addInvoice, updateInvoice, removeInvoice, subscribeInvoices, findInvoice,
  setInvoiceStatus, addInvoiceComment,
  savePdf, loadPdf, removePdf, formatMoney, nextInvoiceNumber, addDays,
  getInvoiceDefaults, computeTaxLines, TAX_PRESETS,
  type Invoice, type InvoiceStatus, type InvoiceComment, type TaxLine,
} from '../data/financeStore';
import { subscribeUploadStatus } from '../data/fileContentStore';
import { Link } from 'react-router-dom';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';

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

function RevenueChart({ invoices }: { invoices: Invoice[] }) {
  const { t } = useTranslation();
  const [mode,   setMode]   = useState<ChartMode>('issuedDate');
  const [period, setPeriod] = useState<6 | 12>(6);
  const months = getLastNMonths(period);

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

  const maxVal = Math.max(1, ...data.map(d => d.total));
  const W = 480; const H = 80;
  const PAD = { t: 4, r: 8, b: 20, l: 44 };
  const chartW = W - PAD.l - PAD.r;
  const chartH = H - PAD.t - PAD.b;
  const slotW  = chartW / period;
  const barW   = slotW * 0.52;

  const yTicks = [0, 0.5, 1].map(p => ({ pct: p, val: maxVal * p, y: PAD.t + chartH * (1 - p) }));

  return (
    <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px', flex: 2, minWidth: 0 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8, gap: 8 }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', margin: 0, flexShrink: 0 }}>{t('finance.chartTitle')}</p>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          {/* Période */}
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {([6, 12] as const).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ fontSize: 10, padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-mono)', background: period === p ? 'var(--surface-3)' : 'var(--surface-2)', color: period === p ? 'var(--text)' : 'var(--text-3)', fontWeight: period === p ? 600 : 400 }}>
                {p === 6 ? t('finance.chart6months') : t('finance.chart12months')}
              </button>
            ))}
          </div>
          {/* Mode date */}
          <div style={{ display: 'flex', borderRadius: 7, overflow: 'hidden', border: '1px solid var(--border)' }}>
            {CHART_MODES.map(m => (
              <button key={m.key} onClick={() => setMode(m.key)} style={{ fontSize: 10, padding: '3px 8px', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-mono)', background: mode === m.key ? 'var(--surface-3)' : 'var(--surface-2)', color: mode === m.key ? 'var(--text)' : 'var(--text-3)', fontWeight: mode === m.key ? 600 : 400 }}>
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
              <text x={cx} y={H - 3} textAnchor="middle" style={{ fontSize: '6px', fill: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{d.label}</text>
            </g>
          );
        })}
      </svg>
      <div style={{ display: 'flex', gap: 10, marginTop: 5 }}>
        {([['var(--ok)', t('finance.statusPaid')], ['var(--warn)', t('finance.statusSent')], ['var(--danger)', t('finance.statusOverdue')], ['var(--border-2)', t('finance.statusDraft')]] as [string, string][]).map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
            <span style={{ width: 6, height: 6, borderRadius: 1, background: color, display: 'block', flexShrink: 0 }} />
            <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{label}</span>
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
  open, invoice, onClose, onEdit,
}: {
  open: boolean; invoice: Invoice | null; onClose: () => void; onEdit: () => void;
}) {
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

  const handleComment = () => {
    const text = commentText.trim();
    if (!text) return;
    const currentUser = getCurrentUser();
    const profile = currentUser ? loadProfile(currentUser.id) : null;
    const name = profile?.name ?? 'Léa Marchand';
    const initials = name.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2);
    const comment: InvoiceComment = {
      id: `cmt_${Date.now()}`,
      author: name,
      initials,
      authorColor: '#5c3d8f',
      text,
      ts: Date.now(),
    };
    addInvoiceComment(invoice.id, comment);
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
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{formatMoney(invoice.amount, invoice.currency)}</span>
                </div>
                {invoice.taxLines.filter(l => l.enabled && l.rate > 0).map(l => (
                  <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l.name} <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10 }}>({l.rate}%)</span></span>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>{formatMoney(Math.round(invoice.amount * l.rate / 100 * 100) / 100, invoice.currency)}</span>
                  </div>
                ))}
                {invoice.taxLines.filter(l => l.enabled && l.rate > 0).length === 0 && (
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('finance.taxLines')}</span>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12 }}>—</span>
                  </div>
                )}
                <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 6 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t('finance.total')}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 14, fontWeight: 700 }}>{formatMoney(invoice.total, invoice.currency)}</span>
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

  const effectiveClientId  = lockedClientId  ?? defaultClientId  ?? (allClients[0]?.id ?? '');
  const effectiveProjectId = lockedProjectId ?? defaultProjectId ?? '';

  useEffect(() => {
    if (!open) return;
    if (invoice) {
      setNumber(invoice.number);       setTitle(invoice.title);
      setClientId(invoice.clientId);   setProjectId(invoice.projectId ?? '');
      setIssuedDate(invoice.issuedDate); setDueDate(invoice.dueDate);
      setAmount(String(invoice.amount)); setTaxLines(invoice.taxLines.map(l => ({ ...l })));
      setCurrency(invoice.currency);   setStatus(invoice.status);
      setPayTermsDays(invoice.paymentTermsDays ?? 30);
      setNotes(invoice.notes ?? '');   setInternalNote(invoice.internalNote ?? '');
      setHasExistingPdf(!!invoice.hasPdf); setNewPdfFile(null); setPdfName(invoice.hasPdf ? 'facture.pdf' : '');
      setCustomDue(false);
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
    }
  }, [open, invoice]);

  const amtNum = parseFloat(amount) || 0;
  const { tax: taxAmt, total } = computeTaxLines(amtNum, taxLines);

  const setTaxLineField = (idx: number, field: keyof TaxLine, value: string | number | boolean) =>
    setTaxLines(prev => prev.map((l, i) => i === idx ? { ...l, [field]: value } : l));
  const addTaxLine = () =>
    setTaxLines(prev => [...prev, { id: `tax_${Date.now()}`, name: '', rate: 0, enabled: true }]);
  const removeTaxLine = (idx: number) =>
    setTaxLines(prev => prev.filter((_, i) => i !== idx));

  const clientProjects = allProjects.filter(p => p.clientId === clientId);
  const lockedClientName  = lockedClientId  ? (allClients.find(c => c.id === lockedClientId)?.name  ?? lockedClientId)  : null;
  const lockedProjectName = lockedProjectId ? (allProjects.find(p => p.id === lockedProjectId)?.name ?? lockedProjectId) : null;

  const applyTerms = (days: number) => {
    setPayTermsDays(days);
    setCustomDue(days === -1);
    if (days > 0 && issuedDate) setDueDate(addDays(issuedDate, days));
  };

  const handlePdfChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setNewPdfFile(file);
    setPdfName(file.name);
    setHasExistingPdf(false);
  };

  const handleSave = () => {
    if (!title.trim() || !clientId || !amount) return;
    const id = invoice?.id ?? `inv_${Date.now()}`;
    const inv: Invoice = {
      id, number, title: title.trim(), clientId,
      projectId: projectId || undefined,
      amount: amtNum, taxLines, tax: taxAmt, total,
      currency, status, issuedDate, dueDate,
      paymentTermsDays: payTermsDays > 0 ? payTermsDays : undefined,
      notes: notes.trim() || undefined,
      internalNote: internalNote.trim() || undefined,
      ...(invoice?.paidDate ? { paidDate: invoice.paidDate, paidAmount: invoice.paidAmount } : {}),
      ...(invoice?.sentDate ? { sentDate: invoice.sentDate } : {}),
      comments: invoice?.comments,
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
            <label style={labelStyle}>{t('finance.invoiceTitle')}</label>
            <input value={title} onChange={e => setTitle(e.target.value)} placeholder={t('finance.titlePlaceholder')} style={inputStyle} />
          </div>

          {/* Client */}
          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <label style={labelStyle}>{t('finance.clientLabel')}</label>
            {lockedClientName ? (
              <div style={lockDisplay}><SFIcon name="lock" size={11} color="var(--text-3)" />{lockedClientName}</div>
            ) : (
              <select value={clientId} onChange={e => { setClientId(e.target.value); setProjectId(''); }} style={{ ...inputStyle, cursor: 'pointer' }}>
                <option value="">{t('finance.selectClient')}</option>
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
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
              {PAYMENT_TERMS_OPTIONS.map(opt => {
                const active = opt.days === -1 ? customDue : (payTermsDays === opt.days && !customDue);
                return (
                  <button key={opt.days} onClick={() => applyTerms(opt.days)} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 7, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'var(--accent)' : 'transparent', color: active ? 'var(--on-accent)' : 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontWeight: active ? 600 : 400 }}>
                    {opt.label}
                  </button>
                );
              })}
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
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: line.enabled ? 'var(--text-2)' : 'var(--text-3)', width: 72, textAlign: 'right', flexShrink: 0 }}>
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
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-2)' }}>{formatMoney(amtNum, currency)}</span>
              </div>
              {taxLines.filter(l => l.enabled && l.rate > 0).map(l => (
                <div key={l.id} style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{l.name || t('finance.taxLines')} ({l.rate}%)</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-2)' }}>{formatMoney(Math.round(amtNum * l.rate / 100 * 100) / 100, currency)}</span>
                </div>
              ))}
              <div style={{ display: 'flex', justifyContent: 'space-between', borderTop: '1px solid var(--border)', paddingTop: 5 }}>
                <span style={{ fontSize: 13, fontWeight: 600 }}>{t('finance.total')}</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 15, fontWeight: 700 }}>{formatMoney(total, currency)}</span>
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
              <button onClick={() => fileRef.current?.click()} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', width: '100%', justifyContent: 'center' }}>
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
          <SFButton variant="primary" onClick={handleSave} disabled={!title.trim() || !clientId || !amount}>{t('finance.save')}</SFButton>
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

function FinancesLocked() {
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

export function Finances() {
  const { t } = useTranslation();
  const [invoices,      setInvoices]      = useState<Invoice[]>(getInvoices);
  const [filter,        setFilter]        = useState<InvoiceStatus | 'all'>('all');
  const [search,        setSearch]        = useState('');
  const [clientFilter,  setClientFilter]  = useState('');
  const [projectFilter, setProjectFilter] = useState('');
  const [dateFrom,      setDateFrom]      = useState('');
  const [dateTo,        setDateTo]        = useState('');
  const [dateFromAnchor, setDateFromAnchor] = useState<DOMRect | null>(null);
  const [dateToAnchor,   setDateToAnchor]   = useState<DOMRect | null>(null);
  const [dateField,     setDateField]     = useState<'issuedDate' | 'dueDate' | 'paidDate'>('issuedDate');
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [editInvoice,   setEditInvoice]   = useState<Invoice | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);

  useEffect(() => subscribeInvoices(() => setInvoices(getInvoices())), []);

  const plan = usePlan();
  if (!canUseFeature(plan, 'finances')) {
    return <FinancesLocked />;
  }

  const allClients  = getClients();
  const allProjects = getProjects();
  const clientMap   = Object.fromEntries(allClients.map(c  => [c.id, c]));
  const projectMap  = Object.fromEntries(allProjects.map(p => [p.id, p]));

  const clientFilterProjects = clientFilter ? allProjects.filter(p => p.clientId === clientFilter) : [];

  const revenue     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.filter(i => ['sent', 'viewed'].includes(i.status)).reduce((s, i) => s + i.total, 0);
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);
  const draftCount  = invoices.filter(i => i.status === 'draft').length;
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
  const paidCount   = invoices.filter(i => i.status === 'paid').length;
  const payRate     = invoices.length > 0 ? Math.round((paidCount / invoices.length) * 100) : 0;

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

  const filtered = invoices.filter(inv => {
    if (filter !== 'all' && inv.status !== filter) return false;
    if (clientFilter && inv.clientId !== clientFilter) return false;
    if (projectFilter && inv.projectId !== projectFilter) return false;
    if (hasDateFilter) {
      const d = (inv[dateField] ?? '') as string;
      if (dateFrom && d < dateFrom) return false;
      if (dateTo   && d > dateTo)   return false;
    }
    if (search) {
      const q = search.toLowerCase();
      const c = clientMap[inv.clientId];
      const p = inv.projectId ? projectMap[inv.projectId] : null;
      if (![inv.number, inv.title, c?.name ?? '', p?.name ?? ''].join(' ').toLowerCase().includes(q)) return false;
    }
    return true;
  });

  const clearAllFilters = () => {
    setFilter('all'); setClientFilter(''); setProjectFilter('');
    setSearch(''); setDateFrom(''); setDateTo('');
  };

  const openAdd     = () => { setEditInvoice(null); setPanelOpen(true); };
  const openEdit    = (inv: Invoice) => { setEditInvoice(inv); setPanelOpen(true); };
  const openDetail  = (inv: Invoice) => setDetailInvoice(inv);
  const closeForm   = () => { setPanelOpen(false); if (editInvoice) setDetailInvoice(findInvoice(editInvoice.id) ?? editInvoice); };

  const thStyle: React.CSSProperties = { fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' };
  const actionBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 5, borderRadius: 6 };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
        <div>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{t('nav.finances')}</p>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22, margin: 0 }}>{t('finance.title')}</h1>
        </div>
        <SFButton variant="primary" icon="plus" onClick={openAdd}>{t('finance.newInvoice')}</SFButton>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr) repeat(3, 1fr)', gap: 10, marginBottom: 20 }}>
          {[
            { labelKey: 'finance.kpiRevenue',    value: formatMoney(revenue),        icon: 'trending-up',  iconColor: 'var(--ok)',     valueColor: 'var(--ok)' },
            { labelKey: 'finance.kpiOutstanding', value: formatMoney(outstanding),    icon: 'clock',        iconColor: 'var(--warn)',   valueColor: 'var(--text)' },
            { labelKey: 'finance.kpiOverdue',     value: formatMoney(overdue),        icon: 'alert-circle', iconColor: 'var(--danger)', valueColor: overdue > 0 ? 'var(--danger)' : 'var(--text)' },
            { labelKey: 'finance.kpiDraft',       value: String(draftCount),          icon: 'file-text',    iconColor: 'var(--text-3)', valueColor: 'var(--text)' },
            { labelKey: 'finance.kpiTotalInvoiced',value: formatMoney(totalInvoiced), icon: 'layers',       iconColor: 'var(--info)',   valueColor: 'var(--text)' },
            { labelKey: 'finance.kpiPayRate',     value: `${payRate}%`,               icon: 'percent',      iconColor: 'var(--ok)',     valueColor: payRate >= 70 ? 'var(--ok)' : 'var(--text)' },
          ].map(k => (
            <div key={k.labelKey} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '12px 14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                <SFIcon name={k.icon} size={12} color={k.iconColor} />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t(k.labelKey)}</span>
              </div>
              <p style={{ fontSize: 18, fontWeight: 700, color: k.valueColor, fontFamily: 'var(--ff-mono)' }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Charts row — 2/3 barres + 1/3 donut */}
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 12, marginBottom: 20 }}>
          <RevenueChart invoices={invoices} />
          <StatusDonut invoices={invoices} />
        </div>

        {/* Filter bar — status pills */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 10, flexWrap: 'wrap' }}>
          {STATUS_FILTERS.map(f => (
            <button key={f.key} onClick={() => setFilter(f.key as InvoiceStatus | 'all')} style={{ fontSize: 12, fontWeight: 500, padding: '5px 12px', borderRadius: 8, cursor: 'pointer', transition: 'all 0.1s', border: `1px solid ${filter === f.key ? 'var(--accent)' : 'var(--border)'}`, background: filter === f.key ? 'var(--accent)' : 'transparent', color: filter === f.key ? 'var(--on-accent)' : 'var(--text-2)' }}>
              {t(f.labelKey)}
            </button>
          ))}
        </div>

        {/* Filter bar — client / project / date / search */}
        <div style={{ display: 'flex', gap: 8, marginBottom: 6, flexWrap: 'wrap', alignItems: 'center' }}>
          {/* Client */}
          <select value={clientFilter} onChange={e => { setClientFilter(e.target.value); setProjectFilter(''); }} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: clientFilter ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', outline: 'none' }}>
            <option value="">{t('finance.allClients')}</option>
            {allClients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          {/* Project */}
          <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)} disabled={!clientFilter} style={{ fontSize: 12, padding: '6px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: projectFilter ? 'var(--text)' : 'var(--text-3)', cursor: clientFilter ? 'pointer' : 'default', outline: 'none', opacity: clientFilter ? 1 : 0.5 }}>
            <option value="">{t('finance.allProjects')}</option>
            {clientFilterProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <div style={{ flex: 1 }} />
          {/* Search */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span style={{ position: 'absolute', left: 9, pointerEvents: 'none', display: 'flex' }}><SFIcon name="search" size={13} color="var(--text-3)" /></span>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('finance.search')} style={{ fontSize: 12, padding: '6px 10px 6px 28px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', width: 200 }} />
          </div>
        </div>

        {/* Date filter row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, flexWrap: 'wrap' }}>
          {/* Date field selector */}
          <div style={{ display: 'flex', borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', flexShrink: 0 }}>
            {(['issuedDate', 'dueDate', 'paidDate'] as const).map(field => (
              <button key={field} onClick={() => setDateField(field)} style={{ fontSize: 11, padding: '5px 10px', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-mono)', transition: 'all 0.1s', background: dateField === field ? 'var(--surface-3)' : 'var(--surface-2)', color: dateField === field ? 'var(--text)' : 'var(--text-3)', fontWeight: dateField === field ? 600 : 400 }}>
                {t(`finance.date${field.charAt(0).toUpperCase()}${field.slice(1)}` as any)}
              </button>
            ))}
          </div>
          {/* Presets */}
          {(['thisMonth', 'lastMonth', 'thisQuarter', 'thisYear'] as const).map(preset => (
            <button key={preset} onClick={() => applyDatePreset(preset)} style={{ fontSize: 11, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap' }}>
              {t(`finance.preset${preset.charAt(0).toUpperCase()}${preset.slice(1)}` as any)}
            </button>
          ))}
          {/* From / To inputs */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('finance.dateFrom')}</span>
            <button onClick={e => setDateFromAnchor(dateFromAnchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
              style={{ fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${dateFrom ? 'var(--accent)' : 'var(--border)'}`, background: dateFromAnchor ? 'var(--surface-3)' : 'var(--surface-2)', color: dateFrom ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', minWidth: 80 }}>
              {dateFrom ? formatDisplay(dateFrom) : '—'}
            </button>
            {dateFromAnchor && <DatePickerDropdown value={dateFrom} onChange={v => { setDateFrom(v); setDateFromAnchor(null); }} onClose={() => setDateFromAnchor(null)} anchorRect={dateFromAnchor} zIndex={500} />}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('finance.dateTo')}</span>
            <button onClick={e => setDateToAnchor(dateToAnchor ? null : (e.currentTarget as HTMLElement).getBoundingClientRect())}
              style={{ fontSize: 11, padding: '5px 8px', borderRadius: 8, border: `1px solid ${dateTo ? 'var(--accent)' : 'var(--border)'}`, background: dateToAnchor ? 'var(--surface-3)' : 'var(--surface-2)', color: dateTo ? 'var(--text)' : 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', minWidth: 80 }}>
              {dateTo ? formatDisplay(dateTo) : '—'}
            </button>
            {dateToAnchor && <DatePickerDropdown value={dateTo} onChange={v => { setDateTo(v); setDateToAnchor(null); }} onClose={() => setDateToAnchor(null)} anchorRect={dateToAnchor} zIndex={500} />}
          </div>
          {hasDateFilter && (
            <button onClick={() => { setDateFrom(''); setDateTo(''); }} style={{ display: 'flex', alignItems: 'center', padding: '5px 7px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}>
              <SFIcon name="x" size={12} />
            </button>
          )}
          <div style={{ flex: 1 }} />
          {/* Results count + clear all */}
          {filtered.length !== invoices.length && (
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{filtered.length} / {invoices.length}</span>
          )}
          {hasAnyFilter && (
            <button onClick={clearAllFilters} style={{ fontSize: 11, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5 }}>
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
            <SFButton variant="secondary" icon="plus" onClick={openAdd}>{t('finance.addInvoice')}</SFButton>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '140px 120px 130px 1fr 110px 100px 100px 100px', padding: '8px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
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
              const client  = clientMap[inv.clientId];
              const project = inv.projectId ? projectMap[inv.projectId] : null;
              const hasPdf  = !!inv.hasPdf;
              const isLate  = inv.status === 'overdue';
              const confirming = deleteId === inv.id;
              const commentCount = inv.comments?.length ?? 0;

              return (
                <div key={inv.id}
                  style={{ display: 'grid', gridTemplateColumns: '140px 120px 130px 1fr 110px 100px 100px 100px', padding: '11px 16px', borderBottom: i < filtered.length - 1 ? '1px solid var(--border)' : 'none', background: isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                  onMouseEnter={e => { if (!isLate) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)'; }}
                  onClick={() => openDetail(inv)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>{inv.number}</span>
                    {commentCount > 0 && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', borderRadius: 20, padding: '0 4px', color: 'var(--text-3)' }}>{commentCount}</span>}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{client?.name ?? '—'}</span>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{project?.name ?? '—'}</span>
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{inv.title}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, fontWeight: 600, textAlign: 'right', paddingRight: 10 }}>{formatMoney(inv.total, inv.currency)}</span>
                  <span><StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} /></span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-3)' }}>{fmtDate(inv.dueDate)}</span>

                  <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                    {hasPdf && (
                      <button title={t('finance.viewPdf')} onClick={() => openDetail(inv)} style={actionBtn}>
                        <SFIcon name="file-text" size={13} />
                      </button>
                    )}
                    {confirming ? (
                      <div style={{ display: 'flex', gap: 2 }}>
                        <button onClick={() => { removeInvoice(inv.id); setDeleteId(null); }} style={{ ...actionBtn, color: 'var(--danger)', fontSize: 10, fontWeight: 600, padding: '2px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>{t('finance.confirmDeleteShort')}</button>
                        <button onClick={() => setDeleteId(null)} style={{ ...actionBtn, fontSize: 10, padding: '2px 6px' }}>{t('finance.cancel')}</button>
                      </div>
                    ) : (
                      <button title={t('finance.deleteInvoice')} onClick={e => { e.stopPropagation(); setDeleteId(inv.id); }} style={actionBtn}
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
      <InvoiceDetailPanel
        open={detailInvoice !== null}
        invoice={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onEdit={() => { openEdit(detailInvoice!); setDetailInvoice(null); }}
      />
    </div>
  );
}
