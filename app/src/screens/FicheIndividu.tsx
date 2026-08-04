import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFAvatar, SFIcon } from '../components/ui';
import { findTeamMember, subscribeTeam } from '../data/teamStore';
import { getAllClientContacts, subscribeAllClientContacts } from '../data/clientTeamStore';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { ActivityFeed, type FeedActivity } from '../components/ActivityFeed';
import { getProjectActivities } from './ProjectActivite';
import { subscribeNotifs } from '../data/notificationStore';
import { isDemoSession } from '../data/authStore';
import { supabase } from '../data/supabaseClient';
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
    <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <button onClick={() => navigate('/membres')} style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-mono)' }}>
        <SFIcon name="arrow-left" size={12} /> {t('membres.title')}
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
        <SFAvatar initials={person.initials} bg={avatarColor} size={44} />
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontSize: 20, fontWeight: 800 }}>{person.name}</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{person.email}</p>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 4, borderBottom: '1px solid var(--border)' }}>
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

      {tab === 'apercu' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <div style={{ padding: 14, borderRadius: 10, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {internal ? t('membres.typeInternal') : t('membres.typeExternal')}
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
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {assignedProjects.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-3)', padding: '20px 0', textAlign: 'center' }}>{t('membres.noProjectsFound')}</p>
          )}
          {assignedProjects.map(p => (
            <div key={p.id} onClick={() => navigate(`/projets/${p.id}`)} style={{ padding: 12, borderRadius: 10, border: '1px solid var(--border)', cursor: 'pointer' }}>
              {p.name}
            </div>
          ))}
        </div>
      )}

      {tab === 'calendrier' && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t('common.comingSoon')}</div>
      )}
      {tab === 'fichiers' && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t('common.comingSoon')}</div>
      )}
      {tab === 'finances' && (
        <div style={{ padding: '40px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>{t('common.comingSoon')}</div>
      )}

      {tab === 'activite' && <ActivityFeed activities={activities} />}
    </div>
  );
}
