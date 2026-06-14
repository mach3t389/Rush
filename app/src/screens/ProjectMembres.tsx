import React, { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFAvatar, SFIcon, SFButton } from '../components/ui';
import { PROJECTS, USERS } from '../data/mock';
import { getClientExternalTeam } from '../data/clientTeamStore';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import type { User } from '../types';

// ── Local state store (session-only, per project) ─────────────────────────────

const projectMembersStore: Record<string, User[]> = {};

function getMembers(projectId: string, defaultMembers: User[]): User[] {
  if (!projectMembersStore[projectId]) {
    projectMembersStore[projectId] = [...defaultMembers];
  }
  return projectMembersStore[projectId];
}

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
  const [search, setSearch] = useState('');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const q = search.toLowerCase();

  const allUsers: Record<string, User> = {};
  Object.values(USERS).forEach(u => { allUsers[u.id] = u; });

  const internalPool = Object.values(USERS).filter(u =>
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
    if (users.length > 0) onAdd(users);
  };

  const rowStyle = (id: string): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 10, width: '100%',
    padding: '8px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', textAlign: 'left',
    background: picked.has(id) ? 'color-mix(in srgb, var(--accent) 10%, transparent)' : 'transparent',
    outline: picked.has(id) ? '1px solid color-mix(in srgb, var(--accent) 30%, transparent)' : 'none',
    transition: 'background 0.1s',
  });

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)',
        border: '1px solid var(--border-2)', borderRadius: 16,
        padding: '20px', width: 360, maxHeight: '70vh',
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.7)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>Ajouter à l'équipe</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>

        <div style={{ position: 'relative', marginBottom: 12 }}>
          <SFIcon name="search" size={13} style={{ position: 'absolute', left: 9, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
          <input
            autoFocus
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher..."
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
                Équipe interne
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
                Contacts client
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
                  ? 'Aucun résultat'
                  : clientExternals.length === 0
                    ? 'Aucun contact client dans l\'équipe de ce client. Ajoutez-en depuis la fiche client.'
                    : 'Tous les membres disponibles sont déjà dans ce projet.'}
              </p>
            </div>
          )}
        </div>

        {/* Footer confirm */}
        <div style={{ marginTop: 14, paddingTop: 14, borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '7px 14px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
            Annuler
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
            {picked.size > 1 ? `Ajouter (${picked.size})` : 'Ajouter'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Member card ───────────────────────────────────────────────────────────────

function MemberCard({ user, onRemove, isOwner, selected, onToggleSelect }: {
  user: User; onRemove: () => void; isOwner: boolean;
  selected: boolean; onToggleSelect: () => void;
}) {
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
              ADMIN
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
          title="Retirer du projet"
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

const sectionLabel = (text: string) => (
  <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, marginTop: 4 }}>
    {text}
  </p>
);

// ── Main screen ───────────────────────────────────────────────────────────────

export function ProjectMembres() {
  const { projectId = '' } = useParams<{ projectId: string }>();
  const navigate = useNavigate();

  const project = PROJECTS.find(p => p.id === projectId);
  const [members, setMembers] = useState<User[]>(() =>
    getMembers(projectId, project?.members ?? [])
  );
  const [showAdd, setShowAdd] = useState(false);

  if (!project) {
    return (
      <div style={{ padding: 40, color: 'var(--text-3)' }}>
        Projet introuvable.{' '}
        <button onClick={() => navigate('/projets')} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)' }}>
          Retour
        </button>
      </div>
    );
  }

  const currentIds = new Set(members.map(m => m.id));
  const ownerUser = USERS.lea;
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const selectableIds = members.filter(m => m.id !== ownerUser.id).map(m => m.id);
  const allSelected = selectableIds.length > 0 && selectableIds.every(id => selected.has(id));

  const toggleSelectAll = () => {
    setSelected(allSelected ? new Set() : new Set(selectableIds));
  };

  const handleAdd = (users: User[]) => {
    const updated = [...members, ...users];
    projectMembersStore[projectId] = updated;
    setMembers(updated);
  };

  const handleRemove = (userId: string) => {
    const updated = members.filter(m => m.id !== userId);
    projectMembersStore[projectId] = updated;
    setMembers(updated);
    setSelected(prev => { const next = new Set(prev); next.delete(userId); return next; });
  };

  const handleRemoveSelected = () => {
    const updated = members.filter(m => !selected.has(m.id));
    projectMembersStore[projectId] = updated;
    setMembers(updated);
    setSelected(new Set());
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <ProjectHeaderBar projectId={projectId}>
        <SFButton variant="primary" icon="user-plus" onClick={() => setShowAdd(true)}>Ajouter à l'équipe</SFButton>
      </ProjectHeaderBar>

      {/* Body */}
      <div style={{ flex: 1, overflowY: 'auto', padding: 24 }}>
        <div>
          {/* Stats row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 20 }}>
            <span style={{ fontSize: 13, color: 'var(--text-3)' }}>
              {members.length} membre{members.length !== 1 ? 's' : ''}
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
                  {allSelected ? 'Tout désélectionner' : 'Tout sélectionner'}
                </button>
              </>
            )}
          </div>

          {/* Member list — individual cards, sectioned */}
          {members.length === 0 ? (
            <div style={{ padding: '48px 20px', textAlign: 'center', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12 }}>
              <SFIcon name="users" size={28} style={{ color: 'var(--text-3)', marginBottom: 10 }} />
              <p style={{ fontSize: 13, color: 'var(--text-3)', margin: 0 }}>Aucun membre dans ce projet</p>
              <button onClick={() => setShowAdd(true)} style={{ marginTop: 8, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--accent)', fontSize: 12, padding: 0, fontFamily: 'var(--ff-text)' }}>
                Ajouter à l'équipe
              </button>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
              {/* Équipe interne — admin + internal members together */}
              {members.filter(m => m.role !== 'Cliente').length > 0 && (
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Équipe interne</p>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
                      </div>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Membres de votre studio travaillant sur ce projet.</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {members.filter(m => m.role !== 'Cliente').map(m => (
                      <MemberCard key={m.id} user={m} onRemove={() => handleRemove(m.id)} isOwner={m.id === ownerUser.id} selected={selected.has(m.id)} onToggleSelect={() => toggleSelect(m.id)} />
                    ))}
                  </div>
                </div>
              )}
              {/* Contacts client */}
              {members.filter(m => m.role === 'Cliente').length > 0 && (
                <div>
                  <div style={{ marginBottom: 12 }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contacts client</p>
                    <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Personnes côté client avec accès au projet.</p>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {members.filter(m => m.role === 'Cliente').map(m => (
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
            {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
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
            Retirer du projet
          </button>
          <button
            onClick={() => setSelected(new Set())}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, display: 'flex' }}
            title="Annuler la sélection"
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
