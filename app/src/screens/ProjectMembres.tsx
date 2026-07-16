import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFAvatar, SFIcon, SFButton, SFModal, SFLoadingState } from '../components/ui';
import { USERS } from '../data/mock';
import { getClientExternalTeam, addClientTeamMember, subscribeClientTeam } from '../data/clientTeamStore';
import { syncProjectClientAccess } from '../data/projectClientAccessStore';
import { DEFAULT_PORTAL_PERMISSIONS } from '../data/clientContactsStore';
import { findProject, updateProject, subscribeProjects, isProjectsLoading } from '../data/projectStore';
import { isDemoSession } from '../data/authStore';
import { getTeamMembers, isTeamOwner } from '../data/teamStore';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { PERMISSION_PRESETS, savePermissions, type PermissionKey } from '../components/profile/ProfileEditPanel';
import type { User } from '../types';

// ── Role badge ────────────────────────────────────────────────────────────────

const ROLE_COLORS: Record<string, string> = {
  Admin:          '#5c3d8f',
  'Dir. créative':'#3b4f8f',
  'Chef de projet':'#1a6b4a',
  Monteuse:       '#7d4e57',
  Producteur:     '#a85f3e',
  Cliente:        '#2a7a8a',
  Freelance:      '#3d7a3d',
};

function RoleBadge({ role }: { role: string }) {
  const color = ROLE_COLORS[role] ?? '#555';
  return (
    <span style={{
      fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 600,
      letterSpacing: '0.05em', textTransform: 'uppercase',
      padding: '2px 7px', borderRadius: 20,
      background: `${color}22`, color,
      border: `1px solid ${color}44`,
    }}>
      {role}
    </span>
  );
}

// ── Add member modal ──────────────────────────────────────────────────────────

function AddMemberModal({ currentIds, clientId, onAdd, onClose }: {
  currentIds: Set<string>;
  clientId: string;
  onAdd: (users: User[]) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [perms, setPerms] = useState<PermissionKey[]>(PERMISSION_PRESETS[2].perms);
  const q = search.toLowerCase();

  const allUsers: Record<string, User> = {};
  Object.values(USERS).forEach(u => { allUsers[u.id] = u; });

  const internalTeam = isDemoSession() ? Object.values(USERS) : getTeamMembers();
  const internalPool = internalTeam.filter(u =>
    !currentIds.has(u.id) && u.name.toLowerCase().includes(q)
  );

  // External pool: only people already added to this client's team in FicheClient
  const clientExternals = getClientExternalTeam(clientId);
  const externalPool = clientExternals
    .filter(c => !currentIds.has(c.id) && c.name.toLowerCase().includes(q))
    .map(c => ({ id: c.id, name: c.name, initials: c.initials, avatarColor: c.color, role: c.role } as User));

  externalPool.forEach(u => { allUsers[u.id] = u; });

  const toggle = (id: string) => setPicked(prev => {
    const next = new Set(prev);
    next.has(id) ? next.delete(id) : next.add(id);
    return next;
  });

  const handleConfirm = () => {
    const users = [...picked].map(id => allUsers[id]).filter(Boolean);
    if (users.length > 0) {
      users.forEach(u => savePermissions(u.id, perms));
      onAdd(users);
    }
  };

  const rowStyle = (id: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
    background: picked.has(id) ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
    outline: picked.has(id) ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : 'none',
    transition: 'background 0.1s',
  });

  return (
    <SFModal open onClose={onClose} title={t('members.addToTeam')} width={360} maxHeight="70vh">
        <div style={{ position: 'relative', marginBottom: 12 }}>
          <div style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <SFIcon name="search" size={13} color="var(--text-3)" />
          </div>
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder={t('members.searchPlaceholder')}
            style={{
              width: '100%', boxSizing: 'border-box',
              padding: '7px 10px 7px 30px', borderRadius: 8,
              border: '1px solid var(--border)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)',
              outline: 'none',
            }}
          />
        </div>

        <div style={{ overflowY: 'auto', flex: 1 }}>
          {internalPool.length > 0 && (
            <>
              <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 6px 6px', marginTop: 4 }}>
                {t('members.internalTeam')}
              </p>
              {internalPool.map(u => (
                <button key={u.id} onClick={() => toggle(u.id)} style={rowStyle(u.id)}>
                  <div style={{ width: 28, height: 28, position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      background: picked.has(u.id) ? 'var(--accent)' : 'var(--surface-3)',
                      border: `2px solid ${picked.has(u.id) ? 'var(--accent)' : 'var(--border-2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: picked.has(u.id) ? 1 : 0, transition: 'opacity 0.1s', zIndex: 1,
                    }}>
                      <SFIcon name="check" size={12} color="var(--on-accent)" />
                    </div>
                    <div style={{ opacity: picked.has(u.id) ? 0 : 1, transition: 'opacity 0.1s' }}>
                      <SFAvatar name={u.name} initials={u.initials} color={u.avatarColor} size={28} />
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{u.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{u.role}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {externalPool.length > 0 && (
            <>
              <div style={{ height: 1, background: 'var(--border)', margin: '8px 0' }} />
              <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 6px 6px' }}>
                {t('members.clientContacts')}
              </p>
              {externalPool.map(u => (
                <button key={u.id} onClick={() => toggle(u.id)} style={rowStyle(u.id)}>
                  <div style={{ width: 28, height: 28, position: 'relative', flexShrink: 0 }}>
                    <div style={{
                      position: 'absolute', inset: 0, borderRadius: '50%',
                      background: picked.has(u.id) ? 'var(--accent)' : 'var(--surface-3)',
                      border: `2px solid ${picked.has(u.id) ? 'var(--accent)' : 'var(--border-2)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      opacity: picked.has(u.id) ? 1 : 0, transition: 'opacity 0.1s', zIndex: 1,
                    }}>
                      <SFIcon name="check" size={12} color="var(--on-accent)" />
                    </div>
                    <div style={{ opacity: picked.has(u.id) ? 0 : 1, transition: 'opacity 0.1s' }}>
                      <SFAvatar name={u.name} initials={u.initials} color={u.avatarColor} size={28} />
                    </div>
                  </div>
                  <div>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{u.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0 }}>{u.role}</p>
                  </div>
                </button>
              ))}
            </>
          )}

          {internalPool.length === 0 && externalPool.length === 0 && (
            <div style={{ textAlign: 'center', padding: '24px 0' }}>
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>
                {search
                  ? t('members.noResults')
                  : clientExternals.length === 0
                    ? t('members.noClientContacts')
                    : t('members.allMembersAdded')}
              </p>
            </div>
          )}
        </div>

        {/* Permission presets */}
        <div style={{ marginTop: 12, paddingTop: 12, borderTop: '1px solid var(--border)' }}>
          <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
            {t('members.permissions')}
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 5 }}>
            {PERMISSION_PRESETS.map(p => {
              const active = JSON.stringify([...perms].sort()) === JSON.stringify([...p.perms].sort());
              return (
                <button
                  key={p.key}
                  type="button"
                  onClick={() => setPerms(p.perms)}
                  style={{
                    padding: '7px 9px', borderRadius: 8, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                    transition: 'all 0.1s',
                  }}
                >
                  <p style={{ fontSize: 10, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', margin: 0 }}>{t(p.labelKey)}</p>
                  <p style={{ fontSize: 9, color: 'var(--text-3)', margin: '1px 0 0', fontFamily: 'var(--ff-mono)', lineHeight: 1.35 }}>{t(p.descKey)}</p>
                </button>
              );
            })}
          </div>
        </div>

        {/* Footer confirm */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
            {t('members.cancel')}
          </button>
          <button
            onClick={handleConfirm}
            disabled={picked.size === 0}
            style={{
              padding: '7px 16px', borderRadius: 8, border: 'none', cursor: picked.size === 0 ? 'not-allowed' : 'pointer',
              background: picked.size === 0 ? 'var(--surface-3)' : 'var(--accent)',
              color: picked.size === 0 ? 'var(--text-3)' : 'var(--on-accent)',
              fontSize: 12, fontWeight: 600, fontFamily: 'var(--ff-text)', transition: 'background 0.1s',
            }}
          >
            {picked.size > 1 ? t('members.addCount', { count: picked.size }) : t('members.add')}
          </button>
        </div>
    </SFModal>
  );
}

// ── Member card ───────────────────────────────────────────────────────────────

function MemberCard({ user, onRemove, isOwner, selected, onToggleSelect }: {
  user: User; onRemove: () => void; isOwner: boolean;
  selected: boolean; onToggleSelect: () => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const showCheckbox = hovered || selected;

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={!isOwner ? onToggleSelect : undefined}
      style={{
        display: 'flex', alignItems: 'center', gap: 14,
        padding: '12px 16px', borderRadius: 11,
        background: selected ? 'color-mix(in srgb, var(--accent) 6%, var(--surface))' : 'var(--surface)',
        border: `1px solid ${selected ? 'color-mix(in srgb, var(--accent) 40%, transparent)' : hovered && !isOwner ? 'var(--border-2)' : 'var(--border)'}`,
        boxShadow: selected ? '0 0 0 1px color-mix(in srgb, var(--accent) 20%, transparent)' : 'none',
        cursor: isOwner ? 'default' : 'pointer',
        transition: 'border-color 0.12s, background 0.12s, box-shadow 0.12s',
      }}
    >
      {/* Avatar / checkbox toggle */}
      <div style={{ width: 38, height: 38, position: 'relative', flexShrink: 0 }}>
        <div style={{
          position: 'absolute', inset: 0, borderRadius: '50%',
          background: selected ? 'var(--accent)' : 'var(--surface-3)',
          border: `2px solid ${selected ? 'var(--accent)' : 'var(--border-2)'}`,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          opacity: (!isOwner && showCheckbox) ? 1 : 0,
          transition: 'opacity 0.12s', zIndex: 1,
        }}>
          {selected && <SFIcon name="check" size={15} color="var(--on-accent)" />}
        </div>
        <div style={{ opacity: (!isOwner && showCheckbox) ? 0 : 1, transition: 'opacity 0.12s' }}>
          <SFAvatar name={user.name} initials={user.initials} color={user.avatarColor} size={38} />
        </div>
      </div>

      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{user.name}</span>
          {isOwner && (
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.06em', color: 'var(--text-3)', background: 'var(--surface-3)', padding: '2px 7px', borderRadius: 5 }}>
              {t('members.admin')}
            </span>
          )}
        </div>
        <div style={{ marginTop: 3 }}>
          <RoleBadge role={user.role} />
        </div>
      </div>

      {!isOwner && !selected && (
        <button
          onClick={e => { e.stopPropagation(); onRemove(); }}
          title={t('members.removeFromProject')}
          style={{
            opacity: hovered ? 1 : 0, background: 'none', border: 'none', cursor: 'pointer',
            color: 'var(--text-3)', padding: 5, borderRadius: 6, display: 'flex',
            transition: 'opacity 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="user-minus" size={14} />
        </button>
      )}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function ProjectMembres() {
  const { t } = useTranslation();
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const project = findProject(projectId);
  const [members, setMembers] = useState<User[]>(project?.members ?? []);
  const [showAdd, setShowAdd] = useState(false);

  // project.members can still be empty when this mounts before the
  // real session's background project fetch resolves — without this,
  // the list never picks up the real members once they arrive.
  useEffect(() => subscribeProjects(() => {
    const p = findProject(projectId);
    if (p) setMembers(p.members ?? []);
  }), [projectId]);

  // externalIds below is recomputed from getClientExternalTeam(project.clientId)
  // on every render, but that cache is populated by a background fetch — without
  // subscribing here, a fresh page load can render the Contacts client / Équipe
  // interne split using a stale/empty pool until some unrelated re-render happens
  // to pick up the resolved cache.
  const [, forceClientTeamRerender] = useState(0);
  useEffect(() => subscribeClientTeam(() => forceClientTeamRerender(n => n + 1)), [projectId]);

  if (!project) {
    return (
      <div style={{ padding: 40, color: 'var(--text-3)' }}>
        {t('members.projectNotFound')}{' '}
        <button onClick={() => navigate('/projets')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)' }}>
          {t('members.back')}
        </button>
      </div>
    );
  }

  const currentIds = new Set(members.map(m => m.id));
  // Which of `members` are external client contacts vs internal team —
  // determined by id membership in the client's contact pool, not by
  // comparing `role` to the literal string 'Cliente'. An external contact's
  // `role` is their own job title (e.g. "Vidéaste"), never actually the
  // string "Cliente" outside of demo/mock data, so the old role-string
  // check misclassified every real external contact as internal.
  const externalIds = new Set(getClientExternalTeam(project.clientId).map(c => c.id));
  const isOwnerId = (id: string) => isDemoSession() ? id === USERS.lea.id : isTeamOwner(id);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectableIds = members.filter(m => !isOwnerId(m.id)).map(m => m.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const persistMembers = (updated: User[]) => {
    setMembers(updated);
    updateProject(projectId, { members: updated });
    syncProjectClientAccess(projectId, project.clientId, updated);
  };

  const handleAdd = (users: User[]) => {
    persistMembers([...members, ...users]);
    // Un membre de l'équipe interne ajouté à un projet client rejoint aussi l'équipe
    // du client (sens unique — l'inverse ne modifie pas les projets du client).
    users.forEach(u => addClientTeamMember(project.clientId, {
      id: u.id, name: u.name, role: u.role, email: '', status: 'active',
      initials: u.initials, color: u.avatarColor, internal: true, userId: u.id,
      portalPermissions: { ...DEFAULT_PORTAL_PERMISSIONS },
    }));
  };

  const handleRemove = (userId: string) => {
    persistMembers(members.filter(m => m.id !== userId));
    setSelected(prev => { const next = new Set(prev); next.delete(userId); return next; });
  };

  const handleRemoveSelected = () => {
    persistMembers(members.filter(m => !selected.has(m.id)));
    setSelected(new Set());
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <ProjectHeaderBar projectId={projectId}>
        <SFButton variant="primary" icon="user-plus" onClick={() => setShowAdd(true)}>{t('members.addToTeam')}</SFButton>
      </ProjectHeaderBar>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div>
          {/* Stats row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {t('members.memberCount', { count: members.length })}
            </span>
            <span style={{ color: 'var(--border-2)', fontSize: 13 }}>·</span>
            <div style={{ display: 'flex', gap: 4 }}>
              {members.slice(0, 5).map(m => (
                <SFAvatar key={m.id} name={m.name} initials={m.initials} color={m.avatarColor} size={20} />
              ))}
              {members.length > 5 && (
                <span style={{ fontSize: 11, color: 'var(--text-3)', alignSelf: 'center', marginLeft: 2 }}>+{members.length - 5}</span>
              )}
            </div>
            {selectableIds.length > 0 && (
              <>
                <span style={{ color: 'var(--border-2)', fontSize: 13 }}>·</span>
                <button
                  onClick={toggleSelectAll}
                  style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--ff-text)' }}
                >
                  {allSelected ? t('members.deselectAll') : t('members.selectAll')}
                </button>
              </>
            )}
          </div>

          {/* Member list — individual cards, sectioned */}
          {members.length === 0 ? (
            isProjectsLoading() ? (
              <SFLoadingState />
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, padding: '64px 0', color: 'var(--text-3)' }}>
                <SFIcon name="users" size={32} color="var(--text-3)" />
                <p style={{ fontSize: 14, fontWeight: 500 }}>{t('members.noMembers')}</p>
                <SFButton variant="secondary" icon="user-plus" onClick={() => setShowAdd(true)}>{t('members.addToTeam')}</SFButton>
              </div>
            )
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Équipe interne — admin + internal members together */}
              {members.filter(m => !externalIds.has(m.id)).length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('members.internalTeam')}</p>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('members.internalTeamDesc')}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {members.filter(m => !externalIds.has(m.id)).map(m => (
                      <MemberCard key={m.id} user={m} onRemove={() => handleRemove(m.id)} isOwner={isOwnerId(m.id)} selected={selected.has(m.id)} onToggleSelect={() => toggleSelect(m.id)} />
                    ))}
                  </div>
                </div>
              )}
              {/* Contacts client */}
              {members.filter(m => externalIds.has(m.id)).length > 0 && (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('members.clientContacts')}</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>{t('members.clientContactsDesc')}</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {members.filter(m => externalIds.has(m.id)).map(m => (
                      <MemberCard key={m.id} user={m} onRemove={() => handleRemove(m.id)} isOwner={false} selected={selected.has(m.id)} onToggleSelect={() => toggleSelect(m.id)} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div style={{
          position: 'absolute', bottom: 24, left: '50%', transform: 'translateX(-50%)',
          display: 'flex', alignItems: 'center', gap: 10,
          background: 'var(--surface)', border: '1px solid var(--border-2)',
          borderRadius: 14, padding: '10px 16px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
          zIndex: 50,
          animation: 'fadeSlideUp 0.15s ease',
        }}>
          <span style={{ fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>
            {t('members.selectedCount', { count: selected.size })}
          </span>
          <div style={{ width: 1, height: 18, background: 'var(--border-2)' }} />
          <button
            onClick={handleRemoveSelected}
            style={{
              display: 'flex', alignItems: 'center', gap: 6,
              padding: '6px 12px', borderRadius: 8, border: 'none', cursor: 'pointer',
              background: 'color-mix(in srgb, var(--danger) 12%, transparent)',
              color: 'var(--danger)', fontSize: 12, fontWeight: 600,
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--danger) 20%, transparent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--danger) 12%, transparent)'; }}
          >
            <SFIcon name="user-minus" size={13} />
            {t('members.removeFromProject')}
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex' }}
            title={t('members.clearSelection')}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
          >
            <SFIcon name="x" size={14} />
          </button>
        </div>
      )}

      {showAdd && (
        <AddMemberModal
          currentIds={currentIds}
          clientId={project.clientId}
          onAdd={users => { handleAdd(users); setShowAdd(false); }}
          onClose={() => setShowAdd(false)}
        />
      )}
    </div>
  );
}
