import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { getMyClientInvoices, type ClientInvoice } from '../../data/clientSessionStore';
import { getPreviewClientInvoices } from '../../data/viewAsClientDataStore';
import { getViewAsUser } from '../../data/viewAsStore';
import { formatMoney } from '../../data/financeStore';
import { fmtDate } from '../Finances';

const STATUS_LABEL_KEY: Record<string, string> = {
  draft: 'clientProject.financesStatusDraft',
  sent: 'clientProject.financesStatusSent',
  viewed: 'clientProject.financesStatusViewed',
  paid: 'clientProject.financesStatusPaid',
  overdue: 'clientProject.financesStatusOverdue',
  cancelled: 'clientProject.financesStatusCancelled',
};

export function ClientProjectFinances() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [invoices, setInvoices] = useState<ClientInvoice[] | null>(null);

  const viewAs = getViewAsUser();
  const isPreview = viewAs?.type === 'external';

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const list = isPreview ? await getPreviewClientInvoices(projectId) : await getMyClientInvoices(projectId);
      if (!cancelled) setInvoices(list);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  if (!projectId) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px' }}>
        {invoices === null && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>…</p>}
        {invoices !== null && invoices.length === 0 && (
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientProject.financesEmpty')}</p>
        )}
        {invoices !== null && invoices.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {invoices.map(inv => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ flex: 1 }}>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{inv.title}</p>
                  <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginTop: 2 }}>{inv.number}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('clientProject.financesAmount')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>{formatMoney(inv.total, inv.currency)}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('clientProject.financesStatus')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>{t(STATUS_LABEL_KEY[inv.status] ?? 'clientProject.financesStatusDraft')}</p>
                </div>
                <div style={{ textAlign: 'right' }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{t('clientProject.financesDue')}</p>
                  <p style={{ fontSize: 13, color: 'var(--text)' }}>{fmtDate(inv.dueDate)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
