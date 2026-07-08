import React, { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFButton } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import {
  getInvoicesByProject, subscribeInvoices, removeInvoice, findInvoice,
  setInvoiceStatus, loadPdf, formatMoney, type Invoice,
} from '../data/financeStore';
import { getClients } from '../data/clientStore';
import { findProject } from '../data/projectStore';
import { InvoiceFormPanel, InvoiceDetailPanel, StatusPill, fmtDate } from './Finances';

export function ProjetFinances() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const project    = findProject(projectId);
  const allClients = getClients();
  const clientMap  = Object.fromEntries(allClients.map(c => [c.id, c]));

  const [invoices,      setInvoices]      = useState<Invoice[]>(() => getInvoicesByProject(projectId));
  const [panelOpen,     setPanelOpen]     = useState(false);
  const [editInvoice,   setEditInvoice]   = useState<Invoice | null>(null);
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [deleteId,      setDeleteId]      = useState<string | null>(null);

  useEffect(() => subscribeInvoices(() => setInvoices(getInvoicesByProject(projectId))), [projectId]);

  const revenue     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'viewed').reduce((s, i) => s + i.total, 0);
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);

  const openAdd    = () => { setEditInvoice(null); setPanelOpen(true); };
  const openEdit   = (inv: Invoice) => { setEditInvoice(inv); setPanelOpen(true); };
  const openDetail = (inv: Invoice) => setDetailInvoice(inv);
  const closeForm  = () => { setPanelOpen(false); if (editInvoice) setDetailInvoice(findInvoice(editInvoice.id) ?? editInvoice); };

  const thStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.08em',
  };
  const actionBtn: React.CSSProperties = {
    background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
    display: 'flex', alignItems: 'center', padding: 5, borderRadius: 6,
  };
  const kpiCard: React.CSSProperties = {
    background: 'var(--surface)', border: '1px solid var(--border)',
    borderRadius: 12, padding: '14px 16px',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId}>
        <SFButton variant="primary" icon="plus" onClick={openAdd}>{t('finance.newInvoice')}</SFButton>
      </ProjectHeaderBar>

      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>

        {/* KPI row */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24, maxWidth: 600 }}>
          {[
            { labelKey: 'finance.kpiRevenue',    value: formatMoney(revenue),     icon: 'trending-up',  iconColor: 'var(--ok)',     valueColor: 'var(--ok)' },
            { labelKey: 'finance.kpiOutstanding', value: formatMoney(outstanding), icon: 'clock',        iconColor: 'var(--warn)',   valueColor: 'var(--text)' },
            { labelKey: 'finance.kpiOverdue',     value: formatMoney(overdue),     icon: 'alert-circle', iconColor: 'var(--danger)', valueColor: overdue > 0 ? 'var(--danger)' : 'var(--text)' },
          ].map(k => (
            <div key={k.labelKey} style={kpiCard}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                <SFIcon name={k.icon} size={13} color={k.iconColor} />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t(k.labelKey)}</span>
              </div>
              <p style={{ fontSize: 20, fontWeight: 700, color: k.valueColor, fontFamily: 'var(--ff-mono)' }}>{k.value}</p>
            </div>
          ))}
        </div>

        {/* Invoice list */}
        {invoices.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '64px 0', color: 'var(--text-3)', gap: 10 }}>
            <SFIcon name="receipt" size={32} color="var(--text-3)" />
            <p style={{ fontSize: 14, fontWeight: 500 }}>{t('finance.noInvoices')}</p>
            <p style={{ fontSize: 12 }}>{t('finance.noInvoicesProject')}</p>
            <SFButton variant="secondary" icon="plus" onClick={openAdd}>{t('finance.addInvoice')}</SFButton>
          </div>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '150px 130px 1fr 130px 110px 110px 90px', padding: '8px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
              <span style={thStyle}>{t('finance.colNumber')}</span>
              <span style={thStyle}>{t('finance.colClient')}</span>
              <span style={thStyle}>{t('finance.colTitle')}</span>
              <span style={{ ...thStyle, textAlign: 'right' }}>{t('finance.colAmount')}</span>
              <span style={thStyle}>{t('finance.colStatus')}</span>
              <span style={thStyle}>{t('finance.colDue')}</span>
              <span />
            </div>

            {invoices.map((inv, i) => {
              const client     = clientMap[inv.clientId];
              const hasPdf     = loadPdf(inv.id) !== null;
              const isLate     = inv.status === 'overdue';
              const confirming = deleteId === inv.id;
              const commentCount = inv.comments?.length ?? 0;

              return (
                <div key={inv.id}
                  style={{
                    display: 'grid', gridTemplateColumns: '150px 130px 1fr 130px 110px 110px 90px',
                    padding: '11px 16px',
                    borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none',
                    background: isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)',
                    alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s',
                  }}
                  onMouseEnter={e => { if (!isLate) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)'; }}
                  onClick={() => openDetail(inv)}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>{inv.number}</span>
                    {commentCount > 0 && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', borderRadius: 20, padding: '0 4px', color: 'var(--text-3)' }}>{commentCount}</span>
                    )}
                  </div>
                  <span style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{client?.name ?? '—'}</span>
                  <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{inv.title}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, fontWeight: 600, textAlign: 'right', paddingRight: 12 }}>{formatMoney(inv.total, inv.currency)}</span>
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
                        <button onClick={() => { removeInvoice(inv.id); setDeleteId(null); }}
                          style={{ ...actionBtn, color: 'var(--danger)', fontSize: 10, fontWeight: 600, padding: '2px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                          {t('finance.confirmDeleteShort')}
                        </button>
                        <button onClick={() => setDeleteId(null)} style={{ ...actionBtn, fontSize: 10, padding: '2px 6px' }}>
                          {t('finance.cancel')}
                        </button>
                      </div>
                    ) : (
                      <button title={t('finance.deleteInvoice')} onClick={() => setDeleteId(inv.id)} style={actionBtn}
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

      <InvoiceFormPanel
        open={panelOpen}
        invoice={editInvoice}
        lockedClientId={project?.clientId}
        lockedProjectId={projectId}
        onClose={closeForm}
      />
      <InvoiceDetailPanel
        open={detailInvoice !== null}
        invoice={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onEdit={() => { openEdit(detailInvoice!); setDetailInvoice(null); }}
      />
    </div>
  );
}
