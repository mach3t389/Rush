import type React from 'react';
import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFAvatar, SFIcon, SFLoadingState } from '../components/ui';
import { findTeamMember, subscribeTeam } from '../data/teamStore';
import { getAllClientContacts, subscribeAllClientContacts } from '../data/clientTeamStore';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { ActivityFeed, type FeedActivity } from '../components/ActivityFeed';
import { getProjectActivities } from './ProjectActivite';
import { subscribeNotifs } from '../data/notificationStore';
import { isDemoSession } from '../data/authStore';
import { supabase } from '../data/supabaseClient';
import { ProjectsListView } from '../components/ProjectsListView';
import { ProjetCalendrier } from './ProjetCalendrier';
import { FileBrowser } from './FichiersGlobal';
import { getInvoices, subscribeInvoices, removeInvoice, setInvoiceStatus, formatMoney, isInvoicesLoading, type Invoice } from '../data/financeStore';
import { InvoiceDetailPanel, StatusPill, fmtDate } from './Finances';
import type { Project } from '../types';

type IndividuTab = 'apercu' | 'projets' | 'calendrier' | 'fichiers' | 'finances' | 'activite';

const TABS: { key: IndividuTab; labelKey: string }[] = [
  { key: 'apercu', labelKey: 'client.tabOverview' },
  { key: 'projets', labelKey: 'client.tabProjects' },
  { key: 'calendrier', labelKey: 'client.tabCalendar' },
  { key: 'fichiers', labelKey: 'client.tabFiles' },
  { key: 'finances', labelKey: 'nav.finances' },
  { key: 'activite', labelKey: 'client.tabActivity' },
];

export function FicheIndividu() {
  const { t } = useTranslation();
  const { id } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as IndividuTab) ?? 'apercu';
  const setTab = (next: IndividuTab) => setSearchParams({ tab: next }, { replace: true });

  const [, forceUpdate] = useState(0);
  useEffect(() => subscribeTeam(() => forceUpdate(n => n + 1)), []);
  useEffect(() => subscribeAllClientContacts(() => forceUpdate(n => n + 1)), []);

  const [projects, setProjects] = useState<Project[]>(() => getProjects());
  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);

  // External contacts' assigned projects come from the `project_client_access`
  // table (see projectClientAccessStore.ts), not from projects.members — that
  // JSONB array only covers internal team members. No client-side lookup
  // function existed for "which projects can this one contact access", so we
  // query the table directly here, mirroring the column names
  // projectClientAccessStore.ts already writes (project_id, client_contact_id).
  const [externalProjectIds, setExternalProjectIds] = useState<string[] | null>(null);

  const internal = id ? findTeamMember(id) : undefined;
  const external = !internal && id ? getAllClientContacts().find(c => c.id === id) : undefined;
  const person = internal ?? external;

  useEffect(() => {
    if (!external || !id) { setExternalProjectIds(null); return; }
    if (isDemoSession()) {
      setExternalProjectIds(projects.filter(p => p.clientId === external.clientId).map(p => p.id));
      return;
    }
    let cancelled = false;
    supabase
      .from('project_client_access')
      .select('project_id')
      .eq('client_contact_id', id)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) { console.error('FicheIndividu: project_client_access fetch failed', error); setExternalProjectIds([]); return; }
        setExternalProjectIds((data ?? []).map(row => row.project_id as string));
      });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [external?.id, isDemoSession()]);

  useEffect(() => subscribeNotifs(() => forceUpdate(n => n + 1)), []);

  const assignedProjects = internal
    ? projects.filter(p => p.members.some(m => m.id === id))
    : projects.filter(p => (externalProjectIds ?? []).includes(p.id));
  const assignedProjectIds = assignedProjects.map(p => p.id).join(',');

  const [activities, setActivities] = useState<FeedActivity[]>([]);
  useEffect(() => {
    setActivities(assignedProjectIds ? assignedProjectIds.split(',').flatMap(pid => getProjectActivities(pid)) : []);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [assignedProjectIds]);

  if (!person) return <div style={{ padding: 24 }}>{t('common.loading')}</div>;

  const avatarColor = 'avatarColor' in person ? person.avatarColor : person.color;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '24px 24px 0' }}>
        <button onClick={() => navigate('/membres')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-mono)', marginBottom: 20 }}>
          <SFIcon name="arrow-left" size={12} /> {t('membres.title')}
        </button>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <SFAvatar initials={person.initials} bg={avatarColor} size={44} />
          <div>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 20, fontWeight: 800 }}>{person.name}</h1>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{person.email}</p>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)', marginTop: 20 }}>
          {TABS.map(({ key, labelKey }) => (
            <button key={key} onClick={() => setTab(key)} style={{
              padding: '10px 16px', background: 'none', border: 'none', cursor: 'pointer',
              fontFamily: 'var(--ff-text)', fontSize: 13, fontWeight: 600,
              color: tab === key ? 'var(--text)' : 'var(--text-3)',
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {t(labelKey)}
            </button>
          ))}
        </div>
      </div>

      <div style={{
        flex: 1, overflow: tab === 'calendrier' ? 'hidden' : 'auto',
        padding: tab === 'calendrier' || tab === 'fichiers' ? 0 : 24,
        display: 'flex', flexDirection: 'column', gap: 14,
      }}>

      {tab === 'apercu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {internal ? t('membres.sectionTeam') : t('membres.tabGroupes')}
            </p>
            <p style={{ fontSize: 13 }}>{('role' in person && person.role) ? person.role : '—'}</p>
            {external && (
              <p
                onClick={() => navigate(`/clients/${external.clientId}`)}
                style={{ fontSize: 12, color: 'var(--text-2)', cursor: external.clientId ? 'pointer' : 'default' }}
              >
                {external.clientName || t('membres.noGroupLabel')}
              </p>
            )}
          </div>
        </div>
      )}

      {tab === 'projets' && (
        <ProjectsListView projectIds={assignedProjects.map(p => p.id)} />
      )}

      {tab === 'calendrier' && (
        <ProjetCalendrier embedded projectIds={assignedProjects.map(p => p.id)} />
      )}
      {tab === 'fichiers' && (
        <FileBrowser projectIdsFilter={assignedProjects.map(p => p.id)} />
      )}
      {tab === 'finances' && (
        <FinancesTabForPerson projectIds={assignedProjects.map(p => p.id)} />
      )}

      {tab === 'activite' && <ActivityFeed activities={activities} />}
      </div>
    </div>
  );
}

// ── Finances tab (aggregated across an individual's assigned projects) ─────────
// Mirrors FicheClient.tsx's own FinancesTab (same KPI cards, same row layout),
// but there's no single clientId to scope by or to attach a new invoice to —
// invoices belong to a project, and a person can span several. Read/manage
// existing invoices across those projects; no "new invoice" creation here.
function FinancesTabForPerson({ projectIds }: { projectIds: string[] }) {
  const { t } = useTranslation();
  const idsKey = projectIds.join(',');
  const [invoices, setInvoices] = useState<Invoice[]>(() => getInvoices().filter(i => i.projectId && projectIds.includes(i.projectId)));
  const [detailInvoice, setDetailInvoice] = useState<Invoice | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => subscribeInvoices(() => setInvoices(getInvoices().filter(i => i.projectId && idsKey.split(',').filter(Boolean).includes(i.projectId!)))), [idsKey]);
  const [, forceProjectsRerender] = useState(0);
  useEffect(() => subscribeProjects(() => forceProjectsRerender(n => n + 1)), []);

  const allProjects = getProjects();
  const projectMap = Object.fromEntries(allProjects.map(p => [p.id, p]));

  const revenue     = invoices.filter(i => i.status === 'paid').reduce((s, i) => s + i.total, 0);
  const outstanding = invoices.filter(i => i.status === 'sent' || i.status === 'viewed').reduce((s, i) => s + i.total, 0);
  const overdue     = invoices.filter(i => i.status === 'overdue').reduce((s, i) => s + i.total, 0);

  const openDetail = (inv: Invoice) => setDetailInvoice(inv);
  const thStyle: React.CSSProperties = { fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' };
  const actionBtn: React.CSSProperties = { background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center', padding: 5, borderRadius: 6 };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16, padding: 24 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('nav.finances')}</p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
        {[
          { labelKey: 'finance.kpiRevenue',     value: formatMoney(revenue),     icon: 'trending-up',  iconColor: 'var(--ok)',    valueColor: 'var(--ok)' },
          { labelKey: 'finance.kpiOutstanding', value: formatMoney(outstanding), icon: 'clock',         iconColor: 'var(--warn)',  valueColor: 'var(--text)' },
          { labelKey: 'finance.kpiOverdue',     value: formatMoney(overdue),     icon: 'circle-alert',  iconColor: 'var(--danger)', valueColor: overdue > 0 ? 'var(--danger)' : 'var(--text)' },
        ].map(k => (
          <div key={k.labelKey} style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '14px 16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
              <SFIcon name={k.icon} size={13} color={k.iconColor} />
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t(k.labelKey)}</span>
            </div>
            <p style={{ fontSize: 20, fontWeight: 700, color: k.valueColor, fontFamily: 'var(--ff-mono)' }}>{k.value}</p>
          </div>
        ))}
      </div>

      {invoices.length === 0 ? (
        isInvoicesLoading() ? (
          <SFLoadingState />
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '48px 0', color: 'var(--text-3)', gap: 10 }}>
            <SFIcon name="receipt" size={28} color="var(--text-3)" />
            <p style={{ fontSize: 13 }}>{t('finance.noInvoicesProject')}</p>
          </div>
        )
      ) : (
        <div style={{ border: '1px solid var(--border)', borderRadius: 12, overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr 120px 100px 100px 80px', padding: '8px 16px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)', alignItems: 'center' }}>
            <span style={thStyle}>{t('finance.colNumber')}</span>
            <span style={thStyle}>{t('finance.colProject')}</span>
            <span style={thStyle}>{t('finance.colTitle')}</span>
            <span style={{ ...thStyle, textAlign: 'right' }}>{t('finance.colAmount')}</span>
            <span style={thStyle}>{t('finance.colStatus')}</span>
            <span style={thStyle}>{t('finance.colDue')}</span>
            <span />
          </div>
          {invoices.map((inv, i) => {
            const isLate      = inv.status === 'overdue';
            const confirming  = deleteId === inv.id;
            const projectName = inv.projectId ? (projectMap[inv.projectId]?.name ?? inv.projectId) : '—';
            const commentCount = inv.comments?.length ?? 0;
            return (
              <div key={inv.id}
                style={{ display: 'grid', gridTemplateColumns: '140px 140px 1fr 120px 100px 100px 90px', padding: '11px 16px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', background: isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                onMouseEnter={e => { if (!isLate) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isLate ? 'rgba(239,68,68,0.04)' : 'var(--surface)'; }}
                onClick={() => openDetail(inv)}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>{inv.number}</span>
                  {commentCount > 0 && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', borderRadius: 20, padding: '0 4px', color: 'var(--text-3)' }}>{commentCount}</span>}
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{projectName}</span>
                <span style={{ fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', paddingRight: 8 }}>{inv.title}</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, fontWeight: 600, textAlign: 'right', paddingRight: 12 }}>{formatMoney(inv.total, inv.currency)}</span>
                <span><StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} /></span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: isLate ? 'var(--danger)' : 'var(--text-3)' }}>{fmtDate(inv.dueDate)}</span>
                <div style={{ display: 'flex', gap: 1, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                  {confirming ? (
                    <div style={{ display: 'flex', gap: 2 }}>
                      <button onClick={() => { removeInvoice(inv.id); setDeleteId(null); }} style={{ ...actionBtn, color: 'var(--danger)', fontSize: 10, fontWeight: 600, padding: '2px 6px', background: 'rgba(239,68,68,0.1)', borderRadius: 6 }}>
                        {t('finance.confirmDeleteShort')}
                      </button>
                      <button onClick={() => setDeleteId(null)} style={{ ...actionBtn, fontSize: 10, padding: '2px 6px' }}>{t('finance.cancel')}</button>
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

      <InvoiceDetailPanel
        open={detailInvoice !== null}
        invoice={detailInvoice}
        onClose={() => setDetailInvoice(null)}
        onEdit={() => setDetailInvoice(null)}
      />
    </div>
  );
}
