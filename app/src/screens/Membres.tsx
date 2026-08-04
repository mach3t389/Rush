import { useState, useEffect } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton, PageHeader, SFModal, LifecycleFilterDropdown } from '../components/ui';
import { usePersistedState } from '../hooks/usePersistedState';
import { getTeamMembers, subscribeTeam, removeMember, type TeamMemberInfo } from '../data/teamStore';
import { getAllClientContacts, subscribeAllClientContacts, removeClientTeamMember, addClientTeamMember } from '../data/clientTeamStore';
import { getClients, subscribeClients } from '../data/clientStore';
import { confirmDialog } from '../data/confirmStore';
import { InviteTeamModal } from './MonEquipe';
import { InviteModal } from './FicheClient';
import { NewClientModal, ClientCard, ClientEditPanel } from './Clients';
import { isPinnedClient, subscribePinnedClients } from '../data/pinnedStore';
import type { Client } from '../types/index';
import { createInvitation as createClientInvitation, getInvitationLink, sendClientInvitationEmail } from '../data/invitationStore';
import { DEFAULT_PORTAL_PERMISSIONS, PORTAL_PRESETS, matchPortalPreset, type ClientContact } from '../data/clientContactsStore';
import { PERMISSION_PRESETS, matchPreset, loadPermissions } from '../components/profile/ProfileEditPanel';

type MembresTab = 'individus' | 'groupes';

interface UnifiedPerson {
  id: string;
  name: string;
  email: string;
  initials: string;
  color: string;
  isInternal: boolean;
  groupId?: string;
  groupName?: string;
  permKey: string;      // preset key — 'admin'/'gestionnaire'/... for team, 'approver'/... for group contacts
  permLabelKey: string; // i18n key for the badge/filter label
}

interface PersonSection {
  key: string;
  label: string;
  people: UnifiedPerson[];
}

export function Membres() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as MembresTab) ?? 'individus';
  const setTab = (next: MembresTab) => setSearchParams({ tab: next }, { replace: true });

  const [team, setTeam] = useState<TeamMemberInfo[]>(() => getTeamMembers());
  useEffect(() => subscribeTeam(() => setTeam(getTeamMembers())), []);

  const [contacts, setContacts] = useState<(ClientContact & { clientId: string; clientName: string })[]>(() => getAllClientContacts());
  useEffect(() => subscribeAllClientContacts(() => setContacts(getAllClientContacts())), []);

  const [clients, setClients] = useState(() => getClients());
  useEffect(() => subscribeClients(() => setClients(getClients())), []);

  const [, forcePinnedRerender] = useState(0);
  useEffect(() => subscribePinnedClients(() => forcePinnedRerender(n => n + 1)), []);

  const [showInviteChoice, setShowInviteChoice] = useState(false);
  const [showInviteTeam, setShowInviteTeam] = useState(false);
  const [showChooseClient, setShowChooseClient] = useState(false);
  const [inviteClientId, setInviteClientId] = useState<string | null>(null);
  const [showNewGroup, setShowNewGroup] = useState(false);
  const [editingClient, setEditingClient] = useState<Client | null>(null);
  const liveEditingClient = editingClient ? (clients.find(c => c.id === editingClient.id) ?? editingClient) : null;
  const [groupFilter, setGroupFilter] = usePersistedState<'active' | 'archived' | 'all'>('sf_membres_group_filter', 'active');
  const [permFilter, setPermFilter] = usePersistedState<string>('sf_membres_perm_filter', 'all');

  // An archived group used to simply vanish from this tab with no way back
  // in — no filter to see it, so no way to unarchive or permanently delete
  // it either (that action lives on the card's own "…" menu, which never
  // got a chance to render). Mirrors Clients.tsx's own all/active/archived
  // filter so archived groups stay reachable from here too.
  const visibleGroups = clients.filter(c => {
    if (groupFilter === 'archived') return !!c.archived;
    if (groupFilter === 'active') return !c.archived;
    return true;
  });

  const internalPeople: UnifiedPerson[] = team.map(m => {
    // Owner/admin have full access by construction (same rule enforced in
    // ViewAsPermissionGate/Sidebar) regardless of their stored permissions
    // array, so they're always filed under the Administrateur preset here.
    const presetKey = m.accessLevel !== 'member' ? 'admin' : matchPreset(loadPermissions(m.id, m.role));
    const preset = PERMISSION_PRESETS.find(p => p.key === presetKey);
    return {
      id: m.id, name: m.name, email: m.email, initials: m.initials, color: m.avatarColor, isInternal: true,
      permKey: presetKey ?? 'custom', permLabelKey: preset?.labelKey ?? 'membres.permCustom',
    };
  });
  const externalPeople: UnifiedPerson[] = contacts.filter(c => !c.internal).map(c => {
    const presetKey = matchPortalPreset(c.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS);
    const preset = PORTAL_PRESETS.find(p => p.key === presetKey);
    return {
      id: c.id, name: c.name, email: c.email, initials: c.initials, color: c.color, isInternal: false,
      groupId: c.clientId, groupName: c.clientName,
      permKey: presetKey ?? 'custom', permLabelKey: preset?.labelKey ?? 'membres.permCustom',
    };
  });

  // Distinct permission presets actually in use, for the filter dropdown —
  // team and group-contact presets use different key spaces (admin/
  // gestionnaire/... vs approver/collaborator/...) but that's fine, each
  // person only ever matches one of the two depending on isInternal.
  const allPeopleForFilterOptions = [...internalPeople, ...externalPeople];
  const permFilterOptions = Array.from(
    new Map(allPeopleForFilterOptions.map(p => [p.permKey, p.permLabelKey])).entries()
  );
  const matchesPermFilter = (p: UnifiedPerson) => permFilter === 'all' || p.permKey === permFilter;

  // People are grouped by provenance (the "Équipe" section, then one
  // section per group/client) rather than filtered by an Interne/Externe
  // toggle — provenance is what the user actually cares about, and this
  // reads the same way the AddMemberModal's pools do.
  const sections: PersonSection[] = [
    ...(internalPeople.length > 0 ? [{ key: 'team', label: t('membres.sectionTeam'), people: internalPeople.filter(matchesPermFilter) }] : []),
    ...clients
      .filter(c => !c.archived)
      .map(c => ({ key: c.id, label: c.name, people: externalPeople.filter(p => p.groupId === c.id).filter(matchesPermFilter) })),
  ].filter(s => s.people.length > 0);
  const hasNoPeople = sections.length === 0;

  const inviteClientContact = inviteClientId ? clients.find(c => c.id === inviteClientId) : undefined;
  const existingEmailsForClient = inviteClientId
    ? contacts.filter(c => c.clientId === inviteClientId).map(c => c.email.toLowerCase())
    : [];

  const handleRemove = async (p: UnifiedPerson) => {
    const ok = await confirmDialog(
      p.isInternal
        ? (t('membres.removeMemberConfirm', { name: p.name }) as string)
        : (t('membres.removeContactConfirm', { name: p.name }) as string),
      { danger: true }
    );
    if (!ok) return;
    if (p.isInternal) {
      await removeMember(p.id);
      setTeam(getTeamMembers());
    } else if (p.groupId) {
      removeClientTeamMember(p.groupId, p.id);
      setContacts(getAllClientContacts());
    }
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {liveEditingClient && <ClientEditPanel client={liveEditingClient} onClose={() => setEditingClient(null)} />}
      <PageHeader
        title={t('membres.title')}
        subtitle={tab === 'individus'
          ? t('membres.countIndividus', { count: internalPeople.length + externalPeople.length })
          : t('clients.count', { count: visibleGroups.length })}
        actions={tab === 'individus' ? (
          <SFButton variant="primary" icon="user-plus" onClick={() => setShowInviteChoice(true)}>
            {t('membres.inviteMember')}
          </SFButton>
        ) : (
          <SFButton variant="primary" icon="plus" onClick={() => setShowNewGroup(true)}>
            {t('membres.newGroup')}
          </SFButton>
        )}
      >
        <div style={{ display: 'flex', gap: 18 }}>
          {(['individus', 'groupes'] as const).map(key => (
            <button key={key} onClick={() => setTab(key)} style={{
              fontSize: 13, fontWeight: 500, color: tab === key ? 'var(--text)' : 'var(--text-2)',
              background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 6,
              borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent',
            }}>
              {t(key === 'individus' ? 'membres.tabIndividus' : 'membres.tabGroupes')}
            </button>
          ))}
        </div>
      </PageHeader>

      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
        {tab === 'individus' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
            {permFilterOptions.length > 1 && (
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                <button onClick={() => setPermFilter('all')} style={{
                  padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                  border: `1px solid ${permFilter === 'all' ? 'var(--accent)' : 'var(--border)'}`,
                  background: permFilter === 'all' ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                  color: permFilter === 'all' ? 'var(--accent)' : 'var(--text-2)',
                }}>
                  {t('membres.permFilterAll')}
                </button>
                {permFilterOptions.map(([key, labelKey]) => (
                  <button key={key} onClick={() => setPermFilter(key)} style={{
                    padding: '5px 12px', borderRadius: 999, fontSize: 11, fontWeight: 500, cursor: 'pointer',
                    border: `1px solid ${permFilter === key ? 'var(--accent)' : 'var(--border)'}`,
                    background: permFilter === key ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                    color: permFilter === key ? 'var(--accent)' : 'var(--text-2)',
                  }}>
                    {t(labelKey)}
                  </button>
                ))}
              </div>
            )}
            {hasNoPeople && (
              <p style={{ fontSize: 13, color: 'var(--text-3)', padding: '20px 0', textAlign: 'center' }}>{t('membres.noPeopleFound')}</p>
            )}
            {sections.map(section => (
              <div key={section.key} style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>
                  {section.label}
                </p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {section.people.map(p => (
                    <div key={`${p.isInternal ? 'int' : 'ext'}-${p.id}`} onClick={() => navigate(`/membres/individus/${p.id}`)} style={{
                      display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10,
                      border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer',
                    }}>
                      <SFAvatar initials={p.initials} bg={p.color} size={32} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</p>
                        <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{p.email}</p>
                      </div>
                      <span style={{
                        fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase',
                        letterSpacing: '0.05em', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', flexShrink: 0,
                      }}>
                        {t(p.permLabelKey)}
                      </span>
                      <button
                        onClick={e => { e.stopPropagation(); handleRemove(p); }}
                        title={t(p.isInternal ? 'membres.removeMemberConfirm' : 'membres.removeContactConfirm', { name: p.name }) as string}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}
                      >
                        <SFIcon name="trash-2" size={14} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}

        {tab === 'groupes' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <LifecycleFilterDropdown
              value={groupFilter}
              onChange={setGroupFilter}
              categoryLabel={t('common.activityFilterLabel')}
              labels={{ all: t('clients.filterAll'), active: t('clients.filterActive'), archived: t('clients.filterArchived') }}
            />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
            {visibleGroups.length === 0 && (
              <p style={{ fontSize: 13, color: 'var(--text-3)', padding: '20px 0', textAlign: 'center', gridColumn: '1 / -1' }}>{t('clients.noClientsFound')}</p>
            )}
            {visibleGroups.map(c => (
              <ClientCard
                key={c.id}
                client={c}
                pinned={isPinnedClient(c.id)}
                onEdit={() => setEditingClient(c)}
                onClick={() => navigate(`/clients/${c.id}`)}
              />
            ))}
          </div>
          </div>
        )}
      </div>

      <SFModal open={showInviteChoice} onClose={() => setShowInviteChoice(false)} title={t('membres.inviteChooseType')} width={380}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button
            onClick={() => { setShowInviteChoice(false); setShowInviteTeam(true); }}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
          >
            <SFIcon name="user-plus" size={16} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{t('membres.inviteInternal')}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('membres.inviteInternalDesc')}</p>
            </div>
          </button>
          <button
            onClick={() => { setShowInviteChoice(false); setShowChooseClient(true); }}
            disabled={clients.length === 0}
            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: clients.length === 0 ? 'not-allowed' : 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)', opacity: clients.length === 0 ? 0.5 : 1 }}
          >
            <SFIcon name="users" size={16} />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600 }}>{t('membres.inviteExternal')}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('membres.inviteExternalDesc')}</p>
            </div>
          </button>
          {clients.length === 0 && (
            <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('membres.noClientsForInvite')}</p>
          )}
        </div>
      </SFModal>

      <SFModal open={showChooseClient} onClose={() => setShowChooseClient(false)} title={t('membres.inviteChooseClient')} width={380}>
        <select
          defaultValue=""
          onChange={e => { if (e.target.value) { setInviteClientId(e.target.value); setShowChooseClient(false); } }}
          style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
        >
          <option value="" disabled>{t('membres.inviteChooseClientPlaceholder')}</option>
          {clients.filter(c => !c.archived).map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <SFButton variant="ghost" onClick={() => setShowChooseClient(false)}>{t('membres.cancel')}</SFButton>
        </div>
      </SFModal>

      {showInviteTeam && <InviteTeamModal onClose={() => setShowInviteTeam(false)} />}

      {showNewGroup && <NewClientModal onClose={() => setShowNewGroup(false)} />}

      {inviteClientId && inviteClientContact && (
        <InviteModal
          existingEmails={existingEmailsForClient}
          onClose={() => setInviteClientId(null)}
          onInvite={async m => {
            addClientTeamMember(inviteClientId, m);
            setContacts(getAllClientContacts());
            const invitation = await createClientInvitation(inviteClientId, m.id);
            const link = getInvitationLink(invitation.token);
            sendClientInvitationEmail(m.email, m.name, link);
            return link;
          }}
        />
      )}
    </div>
  );
}
