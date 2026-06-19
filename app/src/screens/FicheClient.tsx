import React, { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { createPortal } from 'react-dom';
import { SFPill, SFBar, SFAvatarGroup, SFButton, SFIcon, SFAvatar } from '../components/ui';
import { PROJECTS, USERS } from '../data/mock';
import { findClient, updateClient, subscribeClients } from '../data/clientStore';
import { STATUS_COLOR } from '../data/status';
import { PERMISSION_DEFS, DEFAULT_PERMISSIONS, PERMISSION_PRESETS, matchPreset, type PermissionKey } from '../components/profile/ProfileEditPanel';
import { isPinned, togglePin, subscribePinned } from '../data/pinnedStore';
import { ProjectCard } from '../components/ProjectCard';
import type { Client, Status } from '../types/index';

// ── Client contacts (shared store) ───────────────────────────────────────────

import { getClientContacts, type ClientContact as ClientMember } from '../data/clientContactsStore';
import { getClientTeam, setClientTeam, addClientTeamMember, removeClientTeamMember } from '../data/clientTeamStore';

function getStoredApprover(clientId: string): string | null {
  try { return localStorage.getItem(`sf_approver_id_${clientId}`); } catch { return null; }
}
function setStoredApprover(clientId: string, member: ClientMember | null) {
  try {
    if (member) {
      localStorage.setItem(`sf_approver_id_${clientId}`, member.id);
      localStorage.setItem(`sf_approver_data_${clientId}`, JSON.stringify(member));
    } else {
      localStorage.removeItem(`sf_approver_id_${clientId}`);
      localStorage.removeItem(`sf_approver_data_${clientId}`);
    }
  } catch { /* noop */ }
}
export function getClientApprover(clientId: string): ClientMember | null {
  try {
    const raw = localStorage.getItem(`sf_approver_data_${clientId}`);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}


const INTERNAL_TEAM = Object.values(USERS).filter(u => u.role !== 'Cliente');

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteModal({ onClose, onInvite }: { onClose: () => void; onInvite: (m: ClientMember) => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');

  const submit = () => {
    if (!name.trim() || !email.trim()) return;
    const initials = name.trim().split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
    onInvite({ id: `ext${Date.now()}`, name: name.trim(), role: role.trim() || 'Contact client', email: email.trim(), status: 'invited', initials, color: '#3b4f8f' });
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Inviter une personne</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        {[
          { label: 'Nom complet *', val: name, set: setName, placeholder: 'Ex: Sophie Martin' },
          { label: 'Adresse courriel *', val: email, set: setEmail, placeholder: 'sophie@client.fr' },
          { label: 'Rôle / poste', val: role, set: setRole, placeholder: 'Ex: Directrice marketing' },
        ].map(f => (
          <div key={f.label} style={{ marginBottom: 14 }}>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
            <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
          </div>
        ))}
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>
          Un courriel d'invitation sera envoyé avec un lien pour rejoindre le portail client.
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" onClick={submit} disabled={!name.trim() || !email.trim()}>Envoyer l'invitation</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Assign internal member modal ──────────────────────────────────────────────

function AssignInternalModal({ existingIds, onClose, onAssign }: { existingIds: string[]; onClose: () => void; onAssign: (m: ClientMember) => void }) {
  const available = INTERNAL_TEAM.filter(u => !existingIds.includes(u.id));
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 24, width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 18 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Assigner un membre interne</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        {available.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', padding: '20px 0' }}>Tous les membres internes sont déjà assignés.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {available.map(u => (
              <button key={u.id} onClick={() => {
                onAssign({ id: `int${Date.now()}`, name: u.name, role: u.role, email: `${u.id}@studioflow.fr`, status: 'active', initials: u.initials, color: u.avatarColor, internal: true, userId: u.id });
                onClose();
              }} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <SFAvatar initials={u.initials} bg={u.avatarColor} size={34} />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600 }}>{u.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{u.role}</p>
                </div>
                <SFIcon name="plus" size={14} color="var(--text-3)" style={{ marginLeft: 'auto' }} />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Équipe tab ────────────────────────────────────────────────────────────────

function EquipeTab({ clientId }: { clientId: string }) {
  const [members, setMembers] = useState<ClientMember[]>(() => getClientTeam(clientId));
  const [showInvite, setShowInvite] = useState(false);
  const [showAssign, setShowAssign] = useState(false);
  const [resent, setResent] = useState<string | null>(null);
  const [approverId, setApproverId] = useState<string | null>(() => getStoredApprover(clientId));

  const removeMember = (id: string) => {
    removeClientTeamMember(clientId, id);
    setMembers(getClientTeam(clientId));
    if (approverId === id) { setApproverId(null); setStoredApprover(clientId, null); }
  };


  const resendInvite = (id: string) => {
    setResent(id);
    setTimeout(() => setResent(null), 2000);
  };

  const toggleApprover = (m: ClientMember) => {
    const isRemoving = approverId === m.id;
    const next = isRemoving ? null : m.id;
    setApproverId(next);
    setStoredApprover(clientId, isRemoving ? null : m);
  };

  const clientMembers = members.filter(m => !m.internal);
  const internalMembers = members.filter(m => m.internal);
  const internalIds = internalMembers.map(m => m.userId ?? '').filter(Boolean);

  const statusBadge = (status: ClientMember['status']) => {
    const cfg = { active: { label: 'Actif', color: 'var(--ok)' }, invited: { label: 'Invitation envoyée', color: 'var(--warn)' }, pending: { label: 'En attente', color: 'var(--text-3)' } }[status];
    return (
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.06em', color: cfg.color, background: cfg.color + '18', padding: '2px 7px', borderRadius: 5 }}>
        {cfg.label}
      </span>
    );
  };

  const [panelMember, setPanelMember] = useState<ClientMember | null>(null);

  const MemberRow = ({ m, canBeApprover }: { m: ClientMember; canBeApprover?: boolean }) => {
    const isApprover = approverId === m.id;
    return (
      <div
        onClick={() => setPanelMember(m)}
        style={{
          display: 'flex', alignItems: 'center', gap: 14, padding: '12px 16px',
          borderRadius: 11, background: 'var(--surface)',
          border: `1px solid ${isApprover ? 'var(--accent)' : 'var(--border)'}`,
          boxShadow: isApprover ? '0 0 0 1px var(--accent)' : 'none',
          transition: 'border-color 0.15s, box-shadow 0.15s',
          cursor: 'pointer',
        }}
        onMouseEnter={e => { if (!isApprover) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
        onMouseLeave={e => { if (!isApprover) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
      >
        <div style={{ position: 'relative' }}>
          <SFAvatar initials={m.initials} bg={m.color} size={38} />
          {m.internal && (
            <div style={{ position: 'absolute', bottom: -2, right: -2, width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SFIcon name="building-2" size={7} color="var(--on-accent)" />
            </div>
          )}
          {isApprover && (
            <div style={{ position: 'absolute', top: -4, right: -4, width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', border: '2px solid var(--surface)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SFIcon name="shield-check" size={8} color="var(--on-accent)" />
            </div>
          )}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <p style={{ fontSize: 13, fontWeight: 600 }}>{m.name}</p>
            {statusBadge(m.status)}
            {isApprover && (
              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.06em', color: 'var(--on-accent)', background: 'var(--accent)', padding: '2px 7px', borderRadius: 5 }}>
                <SFIcon name="shield-check" size={9} color="var(--on-accent)" />
                APPROBATEUR FINAL
              </span>
            )}
          </div>
          <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{m.role}</p>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{m.email}</p>
        </div>
        <SFIcon name="chevron-right" size={15} color="var(--text-3)" />
      </div>
    );
  };

  const MemberEditPanel = ({ m, canBeApprover, onClose }: { m: ClientMember; canBeApprover?: boolean; onClose: () => void }) => {
    const isApprover = approverId === m.id;
    const storageKey = `sf_client_member_${m.id}`;
    const permKey = `sf_client_perms_${m.id}`;
    const photoKey = `sf_client_photo_${m.id}`;

    const [name, setName] = useState(m.name);
    const [email, setEmail] = useState(m.email);
    const [role, setRole] = useState(m.role);
    const [photo, setPhoto] = useState<string | null>(() => { try { return localStorage.getItem(photoKey); } catch { return null; } });
    const [resent, setResent] = useState(false);
    const [confirmDelete, setConfirmDelete] = useState(false);
    const [activeTab, setActiveTab] = useState<'profil' | 'permissions'>('profil');
    const [perms, setPerms] = useState<PermissionKey[]>(() => {
      try {
        const raw = localStorage.getItem(permKey);
        if (raw) return JSON.parse(raw);
      } catch { /* noop */ }
      return DEFAULT_PERMISSIONS[m.role] ?? ['request_approval'];
    });
    const photoRef = useRef<HTMLInputElement>(null);

    const save = () => {
      try {
        localStorage.setItem(storageKey, JSON.stringify({ name, email, role }));
        localStorage.setItem(permKey, JSON.stringify(perms));
      } catch { /* noop */ }
      setClientTeam(clientId, getClientTeam(clientId).map(x => x.id === m.id ? { ...x, name, email, role } : x));
      setMembers(getClientTeam(clientId));
      onClose();
    };

    const onPhotoFile = (e: React.ChangeEvent<HTMLInputElement>) => {
      const f = e.target.files?.[0];
      if (!f) return;
      const reader = new FileReader();
      reader.onload = ev => {
        const url = ev.target?.result as string;
        setPhoto(url);
        try { localStorage.setItem(photoKey, url); } catch { /* noop */ }
      };
      reader.readAsDataURL(f);
    };

    const togglePerm = (key: PermissionKey) => {
      setPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);
    };

    const permGroups = PERMISSION_DEFS.reduce<Record<string, typeof PERMISSION_DEFS>>((acc, p) => {
      (acc[p.group] ??= []).push(p);
      return acc;
    }, {});

    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 500, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
        onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
        <div style={{ width: 420, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          {/* Header */}
          <div style={{ padding: '20px 20px 0', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Fiche membre</h3>
              <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
            </div>
            {/* Avatar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
              <div style={{ position: 'relative', cursor: 'pointer' }} onClick={() => photoRef.current?.click()}>
                {photo ? (
                  <img src={photo} alt={name} style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', border: '2px solid var(--border)' }} />
                ) : (
                  <SFAvatar initials={m.initials} bg={m.color} size={56} />
                )}
                <div style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', opacity: 0, transition: 'opacity 0.15s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.opacity = '1'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.opacity = '0'; }}>
                  <SFIcon name="camera" size={16} color="#fff" />
                </div>
                <input ref={photoRef} type="file" accept="image/*" onChange={onPhotoFile} style={{ display: 'none' }} />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontSize: 14, fontWeight: 700 }}>{name}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{role}</p>
                <div style={{ display: 'flex', gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                  {statusBadge(m.status)}
                  {isApprover && (
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.06em', color: 'var(--on-accent)', background: 'var(--accent)', padding: '2px 7px', borderRadius: 5 }}>
                      <SFIcon name="shield-check" size={9} color="var(--on-accent)" />
                      APPROBATEUR FINAL
                    </span>
                  )}
                </div>
              </div>
            </div>
            {/* Tabs */}
            <div style={{ display: 'flex', gap: 16 }}>
              {(['profil', 'permissions'] as const).map(t => (
                <button key={t} onClick={() => setActiveTab(t)} style={{ fontSize: 13, fontWeight: 500, color: activeTab === t ? 'var(--text)' : 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 8, borderBottom: activeTab === t ? '2px solid var(--accent)' : '2px solid transparent', textTransform: 'capitalize' }}>
                  {t === 'profil' ? 'Profil' : 'Autorisations'}
                </button>
              ))}
            </div>
          </div>

          {/* Body */}
          <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            {activeTab === 'profil' ? (
              <>
                {[
                  { label: 'Nom complet', val: name, set: setName },
                  { label: 'Adresse courriel', val: email, set: setEmail },
                  { label: 'Rôle / fonction', val: role, set: setRole },
                ].map(f => (
                  <div key={f.label}>
                    <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                    <input value={f.val} onChange={e => f.set(e.target.value)}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
                  </div>
                ))}

                {canBeApprover && (
                  <div style={{ padding: '12px 14px', borderRadius: 10, border: `1px solid ${isApprover ? 'var(--accent)' : 'var(--border)'}`, background: isApprover ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 12, cursor: 'pointer' }}
                    onClick={() => toggleApprover(m)}>
                    <div style={{ width: 32, height: 32, borderRadius: '50%', background: isApprover ? 'var(--accent)' : 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFIcon name="shield-check" size={15} color={isApprover ? 'var(--on-accent)' : 'var(--text-3)'} />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: isApprover ? 'var(--accent)' : 'var(--text)' }}>Approbateur final</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{isApprover ? 'Retirer comme approbateur final' : 'Désigner comme approbateur final'}</p>
                    </div>
                    <div style={{ width: 20, height: 20, borderRadius: 5, border: `2px solid ${isApprover ? 'var(--accent)' : 'var(--border)'}`, background: isApprover ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {isApprover && <SFIcon name="check" size={11} color="var(--on-accent)" />}
                    </div>
                  </div>
                )}

                {m.status !== 'active' && (
                  <button
                    onClick={() => { resendInvite(m.id); setResent(true); setTimeout(() => setResent(false), 2000); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: resent ? 'rgba(0,200,100,0.08)' : 'var(--surface-2)', cursor: 'pointer', color: resent ? 'var(--ok)' : 'var(--text-2)', fontSize: 13, fontFamily: 'var(--ff-text)', transition: 'all 0.2s', width: '100%', textAlign: 'left' }}>
                    <SFIcon name={resent ? 'check' : 'send'} size={15} color={resent ? 'var(--ok)' : 'var(--text-3)'} />
                    {resent ? 'Invitation renvoyée !' : "Renvoyer l'invitation"}
                  </button>
                )}
              </>
            ) : (
              <>
                {/* Presets */}
                {(() => {
                  const activePreset = matchPreset(perms);
                  return (
                    <div>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Presets</p>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                        {PERMISSION_PRESETS.map(preset => {
                          const active = activePreset === preset.key;
                          return (
                            <button key={preset.key} onClick={() => setPerms(preset.perms)}
                              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'all 0.12s', fontFamily: 'var(--ff-text)' }}
                              onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                              onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                            >
                              <div style={{ flex: 1 }}>
                                <p style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{preset.label}</p>
                                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{preset.desc}</p>
                              </div>
                              <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
                                {active && <SFIcon name="check" size={10} color="var(--on-accent)" />}
                              </div>
                            </button>
                          );
                        })}
                        {!activePreset && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'rgba(249,255,0,0.04)' }}>
                            <SFIcon name="sliders" size={13} color="var(--accent)" />
                            <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>Personnalisé</p>
                          </div>
                        )}
                      </div>
                      <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Détail des autorisations</p>
                    </div>
                  );
                })()}
                {Object.entries(permGroups).map(([group, items]) => (
                  <div key={group}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{group}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {items.map(p => {
                        const on = perms.includes(p.key);
                        return (
                          <div key={p.key} onClick={() => togglePerm(p.key)}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)', cursor: 'pointer', transition: 'all 0.15s' }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 600 }}>{p.label}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{p.desc}</p>
                            </div>
                            <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? 'var(--accent)' : 'var(--surface-3)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, position: 'relative', transition: 'all 0.15s', flexShrink: 0 }}>
                              <div style={{ position: 'absolute', top: 2, left: on ? 18 : 2, width: 14, height: 14, borderRadius: '50%', background: on ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
            {confirmDelete ? (
              <>
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>Confirmer le retrait ?</span>
                <SFButton variant="ghost" onClick={() => setConfirmDelete(false)}>Annuler</SFButton>
                <SFButton variant="ghost" onClick={() => { removeMember(m.id); onClose(); }} style={{ color: 'var(--danger)' }}>Retirer</SFButton>
              </>
            ) : (
              <>
                <button onClick={() => setConfirmDelete(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 12px', borderRadius: 8, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', color: 'var(--danger)', fontSize: 12, fontFamily: 'var(--ff-text)', transition: 'all 0.15s' }}
                  onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'rgba(255,60,60,0.08)'; el.style.borderColor = 'var(--danger)'; }}
                  onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'none'; el.style.borderColor = 'var(--border)'; }}>
                  <SFIcon name="user-minus" size={13} color="var(--danger)" />
                  Retirer du projet
                </button>
                <div style={{ flex: 1 }} />
                <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
                <SFButton variant="primary" onClick={save}>Enregistrer</SFButton>
              </>
            )}
          </div>
        </div>
      </div>
    );
  };

  return (
    <>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>

        {/* Client contacts section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contacts client</p>
              <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Personnes côté client avec accès au portail.</p>
            </div>
            <SFButton variant="secondary" icon="user-plus" onClick={() => setShowInvite(true)}>Inviter</SFButton>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {clientMembers.length === 0 ? (
              <div style={{ padding: '24px', borderRadius: 11, border: '1.5px dashed var(--border-2)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <SFIcon name="user-plus" size={22} color="var(--text-3)" />
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucun contact client — invitez des personnes</p>
                <SFButton variant="ghost" icon="send" onClick={() => setShowInvite(true)}>Envoyer une invitation</SFButton>
              </div>
            ) : clientMembers.map(m => <MemberRow key={m.id} m={m} canBeApprover />)}
          </div>
        </div>

        {/* Internal team section */}
        <div>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Équipe interne</p>
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--accent)', display: 'block' }} />
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-2)', marginTop: 2 }}>Membres de votre studio travaillant sur ce client.</p>
            </div>
            <SFButton variant="secondary" icon="users" onClick={() => setShowAssign(true)}>Assigner</SFButton>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {internalMembers.length === 0 ? (
              <div style={{ padding: '20px', borderRadius: 11, border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', gap: 10, color: 'var(--text-3)' }}>
                <SFIcon name="users" size={18} color="var(--text-3)" />
                <p style={{ fontSize: 13 }}>Aucun membre interne assigné</p>
              </div>
            ) : internalMembers.map(m => <MemberRow key={m.id} m={m} />)}
          </div>
        </div>
      </div>

      {showInvite && <InviteModal onClose={() => setShowInvite(false)} onInvite={m => { addClientTeamMember(clientId, m); setMembers(getClientTeam(clientId)); }} />}
      {showAssign && <AssignInternalModal existingIds={internalIds} onClose={() => setShowAssign(false)} onAssign={m => { addClientTeamMember(clientId, m); setMembers(getClientTeam(clientId)); }} />}
      {panelMember && (
        <MemberEditPanel
          m={panelMember}
          canBeApprover={!panelMember.internal}
          onClose={() => setPanelMember(null)}
        />
      )}
    </>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

const PROJECT_STATUS_OPTIONS = [
  { value: 'info',    label: 'En cours'          },
  { value: 'ok',      label: 'En avance'         },
  { value: 'warn',    label: 'En attente client' },
  { value: 'danger',  label: 'En retard'         },
  { value: 'review',  label: 'En révision'       },
  { value: 'neutral', label: 'Complété'          },
] as const;

const PROJECT_STATUS_COLOR: Record<string, string> = {
  info: 'var(--info)', ok: 'var(--ok)', warn: 'var(--warn)',
  danger: 'var(--danger)', review: 'var(--review)', neutral: 'var(--text-3)',
};

function ClientProjectRow({ p, status, statusLabel, onNavigate, onStatusChange, onArchive }: {
  p: typeof PROJECTS[0];
  status: string; statusLabel: string;
  onNavigate: () => void;
  onStatusChange: (status: string, label: string) => void;
  onArchive: () => void;
}) {
  const [hovered, setHovered] = useState(false);
  const [pinned, setPinned] = useState(() => isPinned(p.id));
  const [menuOpen, setMenuOpen] = useState(false);
  const [statusSubOpen, setStatusSubOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  useEffect(() => subscribePinned(() => setPinned(isPinned(p.id))), [p.id]);

  useEffect(() => {
    if (!menuOpen) { setStatusSubOpen(false); return; }
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  return (
    <div
      onClick={onNavigate}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: `1px solid ${hovered ? 'var(--border-2)' : 'var(--border)'}`, padding: 16, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.12s', position: 'relative' }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontWeight: 600, fontSize: 14 }}>{p.name}</span>
          <SFPill status="neutral" small>{p.phaseLabel}</SFPill>
        </div>
        <SFBar value={p.progress} height={3} />
        <div style={{ display: 'flex', gap: 14, marginTop: 8, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>
          <span>{p.taskCount} tâches</span>
          <span>{p.deliverableCount} livrables</span>
          <span>{p.members.length} membres</span>
        </div>
      </div>
      <SFAvatarGroup avatars={p.members.map(m => ({ initials: m.initials, bg: m.avatarColor, name: m.name }))} size={24} />
      <div style={{ textAlign: 'right', flexShrink: 0 }}>
        <SFPill status={status as any} small>{statusLabel}</SFPill>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{p.deliveryDate}</p>
      </div>
      {/* Star pin button */}
      <button
        onClick={e => { e.stopPropagation(); togglePin(p.id); }}
        title={pinned ? 'Désépingler' : 'Épingler dans la barre latérale'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 4, borderRadius: 6, color: pinned ? 'var(--accent)' : 'var(--text-3)', opacity: pinned || hovered ? 1 : 0, transition: 'opacity 0.15s, color 0.15s', display: 'flex', flexShrink: 0 }}
      >
        <SFIcon name="star" size={15} fill={pinned ? 'currentColor' : 'none'} />
      </button>
      {/* ⋯ menu */}
      <div ref={menuRef} style={{ position: 'relative', flexShrink: 0 }} onClick={e => e.stopPropagation()}>
        <button
          onClick={() => setMenuOpen(v => !v)}
          style={{ background: menuOpen ? 'var(--surface-3)' : 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', borderRadius: 6, color: 'var(--text-3)', opacity: menuOpen || hovered ? 1 : 0, transition: 'opacity 0.15s', display: 'flex' }}
        >
          <SFIcon name="more-horizontal" size={15} />
        </button>
        {menuOpen && (
          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 200, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 190, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
            {/* Status submenu trigger */}
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setStatusSubOpen(v => !v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: statusSubOpen ? 'var(--surface-2)' : 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => { if (!statusSubOpen) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!statusSubOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SFIcon name="circle" size={13} color="var(--text-3)" />
                  Changer le statut
                </div>
                <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
              </button>
              {statusSubOpen && (
                <div style={{ position: 'absolute', top: 0, right: 'calc(100% + 4px)', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', zIndex: 201 }}>
                  {PROJECT_STATUS_OPTIONS.map(o => (
                    <button key={o.value} onClick={() => { onStatusChange(o.value, o.label); setMenuOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: status === o.value ? 'var(--surface-2)' : 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = status === o.value ? 'var(--surface-2)' : 'transparent'; }}
                    >
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: PROJECT_STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />
                      {o.label}
                    </button>
                  ))}
                </div>
              )}
            </div>
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            <button
              onClick={() => { onArchive(); setMenuOpen(false); }}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'color-mix(in srgb, var(--danger) 10%, transparent)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <SFIcon name="archive" size={13} />
              Archiver le projet
            </button>
          </div>
        )}
      </div>
      <SFIcon name="chevron-right" size={16} color="var(--text-3)" />
    </div>
  );
}

// ── Activité tab ──────────────────────────────────────────────────────────────

type ActivityType = 'task' | 'upload' | 'comment' | 'approve' | 'client' | 'invoice' | 'member';

interface ClientActivity {
  id: string;
  day: string;
  type: ActivityType;
  actorName: string;
  actorInitials: string;
  actorColor: string;
  action: string;
  target: string;
  detail?: string;
  time: string;
  projectName?: string;
  projectColor?: string;
}

const ACTIVITY_ICON: Record<ActivityType, { icon: string; color: string; bg: string }> = {
  task:    { icon: 'check-circle',  color: '#1a6b4a', bg: 'rgba(26,107,74,0.15)'  },
  upload:  { icon: 'upload-cloud',  color: '#3b4f8f', bg: 'rgba(59,79,143,0.15)'  },
  comment: { icon: 'message-circle',color: '#5c3d8f', bg: 'rgba(92,61,143,0.15)'  },
  approve: { icon: 'check-circle',  color: '#1a6b4a', bg: 'rgba(26,107,74,0.15)'  },
  client:  { icon: 'user',          color: '#7d4e57', bg: 'rgba(125,78,87,0.15)'   },
  invoice: { icon: 'file-text',     color: '#a85f3e', bg: 'rgba(168,95,62,0.15)'  },
  member:  { icon: 'user-plus',     color: '#2a7a8a', bg: 'rgba(42,122,138,0.15)' },
};

function getClientActivities(projects: typeof PROJECTS): ClientActivity[] {
  return [
    { id: 'a1', day: "Aujourd'hui", type: 'comment', actorName: 'Sarah Martin',   actorInitials: 'SM', actorColor: '#3b4f8f', action: 'a commenté sur', target: 'Rough Cut — V4', detail: '"L\'intro est un peu longue…"', time: 'Il y a 12 min', projectName: projects[0]?.name, projectColor: projects[0]?.clientColor },
    { id: 'a2', day: "Aujourd'hui", type: 'upload',  actorName: 'Thomas Robert',  actorInitials: 'TR', actorColor: '#5c3d8f', action: 'a uploadé', target: 'Rough Cut — V4', detail: 'V4 · 03:28 · 2.1 Go', time: 'Il y a 2h', projectName: projects[0]?.name, projectColor: projects[0]?.clientColor },
    { id: 'a3', day: "Aujourd'hui", type: 'task',    actorName: 'Julie Bernard',  actorInitials: 'JB', actorColor: '#1a6b4a', action: 'a complété', target: 'Repérage des lieux de tournage', detail: 'Section Préproduction', time: 'Il y a 3h', projectName: projects[0]?.name, projectColor: projects[0]?.clientColor },
    { id: 'a4', day: 'Hier',        type: 'approve', actorName: 'Marc Dufour',    actorInitials: 'MD', actorColor: '#7d4e57', action: 'a approuvé', target: 'Brief créatif client', detail: 'Document PDF · Validé', time: 'Hier, 16:42', projectName: projects[0]?.name, projectColor: projects[0]?.clientColor },
    { id: 'a5', day: 'Hier',        type: 'comment', actorName: 'Sarah Martin',   actorInitials: 'SM', actorColor: '#3b4f8f', action: 'a créé une tâche depuis', target: 'Commentaire 00:42', detail: '→ Couper l\'intro de 3 secondes', time: 'Hier, 14:10', projectName: projects[0]?.name, projectColor: projects[0]?.clientColor },
    { id: 'a6', day: 'Hier',        type: 'invoice', actorName: 'Léa Marchand',   actorInitials: 'LM', actorColor: '#5c3d8f', action: 'a envoyé', target: 'FAC-2025-058 — Solde 50%', detail: '4 500 $ · Échéance 30 juin', time: 'Hier, 11:00' },
    { id: 'a7', day: 'Il y a 3 j',  type: 'upload',  actorName: 'Thomas Robert',  actorInitials: 'TR', actorColor: '#5c3d8f', action: 'a modifié', target: 'Scénario — V3', detail: 'Révision dialogues scènes 3 à 7', time: '9 juin, 11:25', projectName: projects[0]?.name, projectColor: projects[0]?.clientColor },
    { id: 'a8', day: 'Il y a 3 j',  type: 'member',  actorName: 'Léa Marchand',   actorInitials: 'LM', actorColor: '#5c3d8f', action: 'a ajouté', target: 'Julie Bernard', detail: 'Rôle : Monteuse', time: '9 juin, 09:14', projectName: projects[0]?.name, projectColor: projects[0]?.clientColor },
    { id: 'a9', day: 'Il y a 1 sem',type: 'client',  actorName: 'Marie Lefebvre', actorInitials: 'ML', actorColor: '#2a7a8a', action: 'a consulté le portail', target: 'Portail client', detail: 'Révision vidéo — 8 min', time: '4 juin, 15:30' },
    { id: 'a10',day: 'Il y a 1 sem',type: 'invoice', actorName: 'Léa Marchand',   actorInitials: 'LM', actorColor: '#5c3d8f', action: 'a reçu le paiement', target: 'FAC-2025-042 — Acompte 50%', detail: '4 500 $ · Payé', time: '4 juin, 10:00' },
  ];
}

const ACTIVITY_TYPE_LABEL: Record<ActivityType, string> = {
  task: 'Tâches', upload: 'Fichiers', comment: 'Commentaires', approve: 'Approbations',
  client: 'Portail', invoice: 'Facturation', member: 'Équipe',
};

function ActiviteTab({ projects }: { projects: typeof PROJECTS }) {
  const [filter, setFilter] = useState<ActivityType | 'all'>('all');

  const BASE_ACTIVITIES = getClientActivities(projects);

  const filtered = filter === 'all' ? BASE_ACTIVITIES : BASE_ACTIVITIES.filter(a => a.type === filter);

  // ── Summary stats for the right panel ──
  const weekCount = BASE_ACTIVITIES.filter(a => a.day === "Aujourd'hui" || a.day === 'Hier' || a.day === 'Il y a 3 j').length;
  const typeCounts = BASE_ACTIVITIES.reduce<Record<string, number>>((acc, a) => { acc[a.type] = (acc[a.type] ?? 0) + 1; return acc; }, {});
  const maxTypeCount = Math.max(1, ...Object.values(typeCounts));
  const contributors = Object.values(
    BASE_ACTIVITIES.reduce<Record<string, { name: string; initials: string; color: string; count: number }>>((acc, a) => {
      const k = a.actorName;
      acc[k] = acc[k] ?? { name: a.actorName, initials: a.actorInitials, color: a.actorColor, count: 0 };
      acc[k].count += 1;
      return acc;
    }, {})
  ).sort((a, b) => b.count - a.count).slice(0, 5);

  const byDay = filtered.reduce<Record<string, ClientActivity[]>>((acc, a) => {
    (acc[a.day] = acc[a.day] ?? []).push(a);
    return acc;
  }, {});
  const days = Object.keys(byDay);

  const FILTER_OPTIONS: { key: ActivityType | 'all'; label: string }[] = [
    { key: 'all',     label: 'Tout' },
    { key: 'task',    label: 'Tâches' },
    { key: 'upload',  label: 'Fichiers' },
    { key: 'comment', label: 'Commentaires' },
    { key: 'approve', label: 'Approbations' },
    { key: 'invoice', label: 'Facturation' },
    { key: 'client',  label: 'Portail' },
  ];

  return (
    <div style={{ display: 'flex', gap: 24, alignItems: 'flex-start' }}>
      {/* Left: feed */}
      <div style={{ flex: 1, minWidth: 0 }}>
      {/* Filter pills */}
      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 20 }}>
        {FILTER_OPTIONS.map(f => (
          <button key={f.key} onClick={() => setFilter(f.key)} style={{
            padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500,
            background: filter === f.key ? 'var(--accent)' : 'var(--surface-2)',
            color: filter === f.key ? 'var(--on-accent)' : 'var(--text-2)',
          }}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Activity feed */}
      {days.length === 0 && (
        <p style={{ color: 'var(--text-3)', fontSize: 13, textAlign: 'center', paddingTop: 40 }}>Aucune activité pour ce filtre.</p>
      )}
      {days.map(day => (
        <div key={day} style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 10 }}>{day}</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            {byDay[day].map(item => {
              const meta = ACTIVITY_ICON[item.type];
              return (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--surface)', border: '1px solid var(--border)' }}>
                  {/* Type icon */}
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <SFIcon name={meta.icon} size={14} color={meta.color} />
                  </div>
                  {/* Content */}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                      <SFAvatar name={item.actorName} initials={item.actorInitials} color={item.actorColor} size={18} />
                      <span style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)' }}>{item.actorName}</span>
                      <span style={{ fontSize: 12, color: 'var(--text-3)' }}>{item.action}</span>
                      <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{item.target}</span>
                    </div>
                    {(item.detail || item.projectName) && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 4, flexWrap: 'wrap' }}>
                        {item.projectName && (
                          <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 20, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                            <i style={{ width: 6, height: 6, borderRadius: '50%', background: item.projectColor, display: 'block' }} />
                            <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{item.projectName}</span>
                          </span>
                        )}
                        {item.detail && (
                          <span style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{item.detail}</span>
                        )}
                      </div>
                    )}
                  </div>
                  {/* Time */}
                  <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', flexShrink: 0, marginTop: 2 }}>{item.time}</span>
                </div>
              );
            })}
          </div>
        </div>
      ))}
      </div>

      {/* Right: summary panel — sticky so it stays visible as the feed scrolls */}
      <div style={{ width: 290, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, position: 'sticky', top: 0, alignSelf: 'flex-start' }}>
        {/* Activity volume */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Résumé d'activité</p>
          <div style={{ display: 'flex', gap: 10 }}>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 9, background: 'var(--surface-2)' }}>
              <p style={{ fontSize: 22, fontWeight: 700, color: 'var(--accent)', lineHeight: 1 }}>{weekCount}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 5 }}>Cette semaine</p>
            </div>
            <div style={{ flex: 1, textAlign: 'center', padding: '10px 0', borderRadius: 9, background: 'var(--surface-2)' }}>
              <p style={{ fontSize: 22, fontWeight: 700, lineHeight: 1 }}>{BASE_ACTIVITIES.length}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 5 }}>Total</p>
            </div>
          </div>
        </div>

        {/* Breakdown by type */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Répartition</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(Object.keys(typeCounts) as ActivityType[])
              .sort((a, b) => typeCounts[b] - typeCounts[a])
              .map(type => {
                const meta = ACTIVITY_ICON[type];
                return (
                  <button key={type} onClick={() => setFilter(f => f === type ? 'all' : type)}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textAlign: 'left', width: '100%', opacity: filter === 'all' || filter === type ? 1 : 0.4 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0, display: 'block' }} />
                    <span style={{ fontSize: 11, color: 'var(--text-2)', width: 88, flexShrink: 0 }}>{ACTIVITY_TYPE_LABEL[type]}</span>
                    <span style={{ flex: 1, height: 5, borderRadius: 3, background: 'var(--surface-3)', position: 'relative', overflow: 'hidden' }}>
                      <span style={{ position: 'absolute', inset: 0, width: `${(typeCounts[type] / maxTypeCount) * 100}%`, background: meta.color, borderRadius: 3 }} />
                    </span>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', width: 14, textAlign: 'right', flexShrink: 0 }}>{typeCounts[type]}</span>
                  </button>
                );
              })}
          </div>
        </div>

        {/* Top contributors */}
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Contributeurs</p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {contributors.map(c => (
              <div key={c.name} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SFAvatar name={c.name} initials={c.initials} color={c.color} size={26} />
                <span style={{ flex: 1, fontSize: 12, color: 'var(--text)' }}>{c.name}</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 7px', borderRadius: 5 }}>{c.count}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

type ClientTab = 'apercu' | 'projets' | 'equipe' | 'activite' | 'documents' | 'fichiers';

const fmtMoney = (n: number) => `${n.toLocaleString('fr-CA')} $`;

// ── Client finances (mock) ─────────────────────────────────────────────────────

interface ClientInvoice { id: string; ref: string; label: string; amount: number; status: 'paid' | 'pending' | 'overdue'; date: string; }
interface ClientFinance { billed: number; paid: number; pending: number; invoices: ClientInvoice[]; }

const FINANCE_TABLE: Record<string, ClientFinance> = {
  c1: { billed: 18000, paid: 9000, pending: 9000, invoices: [
    { id: 'f1', ref: 'FAC-2025-058', label: 'Solde 50% — Campagne Été',         amount: 4500, status: 'pending', date: 'Échéance 30 juin' },
    { id: 'f2', ref: 'FAC-2025-031', label: 'Film institutionnel — Solde',       amount: 4500, status: 'overdue', date: 'En retard · 5 juin' },
    { id: 'f3', ref: 'FAC-2025-042', label: 'Acompte 50% — Campagne Été',        amount: 4500, status: 'paid',    date: 'Payé 4 juin' },
    { id: 'f4', ref: 'FAC-2025-018', label: 'Film institutionnel — Acompte',     amount: 4500, status: 'paid',    date: 'Payé 12 mai' },
  ] },
  c2: { billed: 12000, paid: 6000, pending: 6000, invoices: [
    { id: 'f5', ref: 'FAC-2025-051', label: 'Les Bâtisseurs — Tranche 2',        amount: 6000, status: 'pending', date: 'Échéance 20 juil' },
    { id: 'f6', ref: 'FAC-2025-022', label: 'Les Bâtisseurs — Tranche 1',        amount: 6000, status: 'paid',    date: 'Payé 18 mai' },
  ] },
};

function getClientFinance(clientId: string, activeProjects: number): ClientFinance {
  if (FINANCE_TABLE[clientId]) return FINANCE_TABLE[clientId];
  const billed = Math.max(1, activeProjects) * 6000;
  const paid = Math.round(billed / 2);
  return {
    billed, paid, pending: billed - paid,
    invoices: [
      { id: 'fd1', ref: 'FAC-2025-100', label: 'Acompte projet', amount: paid, status: 'paid',    date: 'Payé' },
      { id: 'fd2', ref: 'FAC-2025-101', label: 'Solde projet',   amount: billed - paid, status: 'pending', date: 'À venir' },
    ],
  };
}

const INVOICE_STATUS: Record<ClientInvoice['status'], { label: string; color: string }> = {
  paid:    { label: 'Payé',      color: 'var(--ok)' },
  pending: { label: 'En attente', color: 'var(--warn)' },
  overdue: { label: 'En retard',  color: 'var(--danger)' },
};

// ── Client documents (mock, persisted) ─────────────────────────────────────────

type DocCategory = 'contrat' | 'brief' | 'marque' | 'facture' | 'autre';
type DocFileType = 'pdf' | 'doc' | 'image' | 'sheet' | 'zip';

interface ClientDocument {
  id: string; name: string; category: DocCategory; fileType: DocFileType;
  size: string; date: string; uploadedBy: string;
}

const DOC_CATEGORIES: { key: DocCategory; label: string; icon: string }[] = [
  { key: 'contrat', label: 'Contrats',           icon: 'file-signature' },
  { key: 'brief',   label: 'Briefs',             icon: 'clipboard-list' },
  { key: 'marque',  label: 'Identité de marque', icon: 'palette' },
  { key: 'facture', label: 'Factures',           icon: 'receipt' },
  { key: 'autre',   label: 'Autres',             icon: 'folder' },
];

const DOC_FILE_META: Record<DocFileType, { icon: string; color: string }> = {
  pdf:   { icon: 'file-text',  color: '#c0392b' },
  doc:   { icon: 'file-text',  color: '#3b4f8f' },
  image: { icon: 'image',      color: '#5c3d8f' },
  sheet: { icon: 'table',      color: '#1a6b4a' },
  zip:   { icon: 'file-archive', color: '#a85f3e' },
};

const DOC_SEEDS: Record<string, ClientDocument[]> = {
  c1: [
    { id: 'd1', name: 'Contrat-cadre Nova Films 2025.pdf', category: 'contrat', fileType: 'pdf',   size: '1.2 Mo',  date: '12 jan 2025', uploadedBy: 'Léa Marchand' },
    { id: 'd2', name: 'Brief créatif — Campagne Été.pdf',   category: 'brief',   fileType: 'pdf',   size: '840 Ko',  date: '3 mars 2025', uploadedBy: 'Sarah Martin' },
    { id: 'd3', name: 'Charte graphique Nova.pdf',           category: 'marque',  fileType: 'pdf',   size: '4.6 Mo',  date: '3 mars 2025', uploadedBy: 'Sarah Martin' },
    { id: 'd4', name: 'Logos & déclinaisons.zip',            category: 'marque',  fileType: 'zip',   size: '22 Mo',   date: '3 mars 2025', uploadedBy: 'Thomas Robert' },
    { id: 'd5', name: 'FAC-2025-058 — Solde 50%.pdf',        category: 'facture', fileType: 'pdf',   size: '210 Ko',  date: '10 juin 2025', uploadedBy: 'Léa Marchand' },
    { id: 'd6', name: 'Plan de tournage.xlsx',               category: 'autre',   fileType: 'sheet', size: '88 Ko',   date: '20 avr 2025', uploadedBy: 'Thomas Robert' },
  ],
  c2: [
    { id: 'd7', name: 'Contrat Studio Bleu.pdf',             category: 'contrat', fileType: 'pdf',  size: '980 Ko',  date: '8 fév 2025',  uploadedBy: 'Léa Marchand' },
    { id: 'd8', name: 'Brief — Les Bâtisseurs.docx',         category: 'brief',   fileType: 'doc',  size: '120 Ko',  date: '15 fév 2025', uploadedBy: 'Julie Bernard' },
  ],
};

function loadDocuments(clientId: string): ClientDocument[] {
  try {
    const raw = localStorage.getItem(`sf_client_docs_${clientId}`);
    if (raw) return JSON.parse(raw);
  } catch { /* noop */ }
  return DOC_SEEDS[clientId] ?? [];
}
function saveDocuments(clientId: string, docs: ClientDocument[]) {
  try { localStorage.setItem(`sf_client_docs_${clientId}`, JSON.stringify(docs)); } catch { /* noop */ }
}

// ── Aperçu (dashboard) tab ─────────────────────────────────────────────────────

const cardStyle: React.CSSProperties = { background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: 16 };
const cardTitleStyle: React.CSSProperties = { fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' };

function ApercuTab({ client, projects, clientId, onGoTab }: {
  client: NonNullable<ReturnType<typeof findClient>>;
  projects: typeof PROJECTS;
  clientId: string;
  onGoTab: (t: ClientTab) => void;
}) {
  const navigate = useNavigate();
  const contacts = getClientContacts(clientId);
  const finance = getClientFinance(clientId, client.activeProjects);
  const recentActivity = getClientActivities(projects).slice(0, 4);

  const activeCount = projects.filter(p => p.status !== 'neutral').length;
  const deliverables = projects.reduce((n, p) => n + p.deliverableCount, 0);
  const avgProgress = projects.length ? Math.round(projects.reduce((n, p) => n + p.progress, 0) / projects.length) : 0;

  const [notes, setNotes] = useState(() => { try { return localStorage.getItem(`sf_client_notes_${clientId}`) ?? ''; } catch { return ''; } });
  const saveNotes = (v: string) => { setNotes(v); try { localStorage.setItem(`sf_client_notes_${clientId}`, v); } catch { /* noop */ } };

  const paidPct = finance.billed ? (finance.paid / finance.billed) * 100 : 0;

  const KPIS = [
    { label: 'Projets',     value: String(projects.length), sub: `${activeCount} actifs`,  icon: 'folder',        onClick: () => onGoTab('projets') },
    { label: 'Livrables',   value: String(deliverables),    sub: 'au total',               icon: 'package',       onClick: () => onGoTab('projets') },
    { label: 'Progression', value: `${avgProgress}%`,       sub: 'moyenne',                icon: 'trending-up',   onClick: undefined },
    { label: 'À encaisser', value: fmtMoney(finance.pending), sub: 'en attente',           icon: 'wallet',        onClick: undefined },
  ];

  const SectionHeader = ({ title, action, onAction }: { title: string; action?: string; onAction?: () => void }) => (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 14 }}>
      <p style={cardTitleStyle}>{title}</p>
      {action && (
        <button onClick={onAction} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          {action}<SFIcon name="arrow-right" size={11} color="inherit" />
        </button>
      )}
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* KPI row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {KPIS.map(k => (
          <div key={k.label} onClick={k.onClick}
            style={{ ...cardStyle, cursor: k.onClick ? 'pointer' : 'default', transition: 'border-color 0.12s' }}
            onMouseEnter={e => { if (k.onClick) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
              <SFIcon name={k.icon} size={14} color="var(--text-3)" />
              <span style={cardTitleStyle}>{k.label}</span>
            </div>
            <p style={{ fontSize: 26, fontWeight: 700, lineHeight: 1 }}>{k.value}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 5 }}>{k.sub}</p>
          </div>
        ))}
      </div>

      {/* Two columns */}
      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.7fr) minmax(290px, 1fr)', gap: 16, alignItems: 'start' }}>
        {/* Left column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Projects */}
          <div style={cardStyle}>
            <SectionHeader title="Projets" action="Voir tout" onAction={() => onGoTab('projets')} />
            {projects.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Aucun projet pour ce client.</p>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {projects.slice(0, 4).map(p => (
                  <div key={p.id} onClick={() => navigate(`/projets/${p.id}`)}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', cursor: 'pointer', transition: 'border-color 0.12s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                        <span style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                        <SFPill status="neutral" small>{p.phaseLabel}</SFPill>
                      </div>
                      <SFBar value={p.progress} height={3} />
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0 }}>
                      <SFPill status={p.status as any} small>{p.statusLabel}</SFPill>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>{p.deliveryDate}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Finances */}
          <div style={cardStyle}>
            <SectionHeader title="Finances" action="Factures" onAction={() => onGoTab('documents')} />
            <div style={{ display: 'flex', gap: 16, marginBottom: 14 }}>
              {[
                { label: 'Facturé',    value: finance.billed,  color: 'var(--text)' },
                { label: 'Payé',       value: finance.paid,    color: 'var(--ok)' },
                { label: 'En attente', value: finance.pending, color: 'var(--warn)' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1 }}>
                  <p style={{ fontSize: 17, fontWeight: 700, color: s.color }}>{fmtMoney(s.value)}</p>
                  <p style={{ ...cardTitleStyle, marginTop: 3 }}>{s.label}</p>
                </div>
              ))}
            </div>
            {/* Paid vs pending bar */}
            <div style={{ height: 6, borderRadius: 3, background: 'var(--warn)', overflow: 'hidden', marginBottom: 14 }}>
              <div style={{ width: `${paidPct}%`, height: '100%', background: 'var(--ok)' }} />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {finance.invoices.slice(0, 4).map(inv => {
                const meta = INVOICE_STATUS[inv.status];
                return (
                  <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: meta.color, flexShrink: 0, display: 'block' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{inv.label}</p>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{inv.ref} · {inv.date}</p>
                    </div>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, fontWeight: 600, flexShrink: 0 }}>{fmtMoney(inv.amount)}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>

        {/* Right column */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {/* Client info */}
          <div style={cardStyle}>
            <p style={{ ...cardTitleStyle, marginBottom: 12 }}>Informations</p>
            {[
              { icon: 'briefcase', label: 'Secteur',       value: client.sector },
              { icon: 'map-pin',   label: 'Ville',         value: client.city },
              { icon: 'calendar',  label: 'Client depuis', value: client.since },
              { icon: 'mail',      label: 'Courriel',      value: `contact@${client.name.toLowerCase().replace(/[^a-z]/g, '')}.com` },
              { icon: 'globe',     label: 'Site web',      value: `${client.name.toLowerCase().replace(/[^a-z]/g, '')}.com` },
            ].map(row => (
              <div key={row.label} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <SFIcon name={row.icon} size={13} color="var(--text-3)" />
                <span style={{ fontSize: 11, color: 'var(--text-3)', width: 86, flexShrink: 0 }}>{row.label}</span>
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, textAlign: 'right', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Team snapshot */}
          <div style={cardStyle}>
            <SectionHeader title="Équipe" action="Gérer" onAction={() => onGoTab('equipe')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contacts.slice(0, 4).map(m => (
                <div key={m.id} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <SFAvatar initials={m.initials} bg={m.color} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)' }}>{m.role}</p>
                  </div>
                  {m.internal && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--accent)', background: 'rgba(249,255,0,0.1)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.05em' }}>STUDIO</span>}
                </div>
              ))}
              {contacts.length > 4 && (
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>+{contacts.length - 4} autres</p>
              )}
            </div>
          </div>

          {/* Recent activity */}
          <div style={cardStyle}>
            <SectionHeader title="Activité récente" action="Voir tout" onAction={() => onGoTab('activite')} />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {recentActivity.map(a => {
                const meta = ACTIVITY_ICON[a.type];
                return (
                  <div key={a.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9 }}>
                    <div style={{ width: 24, height: 24, borderRadius: 7, background: meta.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFIcon name={meta.icon} size={12} color={meta.color} />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.4 }}>
                        <span style={{ fontWeight: 600, color: 'var(--text)' }}>{a.actorName.split(' ')[0]}</span> {a.action} <span style={{ color: 'var(--text)' }}>{a.target}</span>
                      </p>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 2 }}>{a.time}</p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Notes */}
          <div style={cardStyle}>
            <p style={{ ...cardTitleStyle, marginBottom: 10 }}>Notes internes</p>
            <textarea
              value={notes}
              onChange={e => saveNotes(e.target.value)}
              placeholder="Préférences du client, historique, points d'attention…"
              rows={4}
              style={{ width: '100%', padding: '9px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', resize: 'vertical', fontFamily: 'var(--ff-text)', colorScheme: 'dark', boxSizing: 'border-box', lineHeight: 1.5 }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Documents tab ──────────────────────────────────────────────────────────────

function DocumentsTab({ clientId }: { clientId: string }) {
  const [docs, setDocs] = useState<ClientDocument[]>(() => loadDocuments(clientId));
  const [filter, setFilter] = useState<DocCategory | 'all'>('all');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');
  const [newCategory, setNewCategory] = useState<DocCategory>('contrat');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');

  const persist = (next: ClientDocument[]) => { setDocs(next); saveDocuments(clientId, next); };

  const startRename = (d: ClientDocument) => { setEditingId(d.id); setEditingName(d.name); };
  const commitRename = () => {
    if (!editingId) return;
    const name = editingName.trim();
    if (name) persist(docs.map(d => d.id === editingId ? { ...d, name, fileType: fileTypeFromName(name) } : d));
    setEditingId(null);
  };

  const fileTypeFromName = (name: string): DocFileType => {
    const ext = name.split('.').pop()?.toLowerCase() ?? '';
    if (['pdf'].includes(ext)) return 'pdf';
    if (['doc', 'docx', 'txt', 'rtf'].includes(ext)) return 'doc';
    if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext)) return 'image';
    if (['xls', 'xlsx', 'csv'].includes(ext)) return 'sheet';
    if (['zip', 'rar', '7z'].includes(ext)) return 'zip';
    return 'doc';
  };

  const addDoc = () => {
    const name = newName.trim();
    if (!name) return;
    const doc: ClientDocument = {
      id: `d${Date.now()}`, name, category: newCategory,
      fileType: fileTypeFromName(name),
      size: `${(Math.random() * 4 + 0.2).toFixed(1)} Mo`,
      date: new Date().toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' }),
      uploadedBy: 'Léa Marchand',
    };
    persist([doc, ...docs]);
    setNewName(''); setNewCategory('contrat'); setShowAdd(false);
  };

  const removeDoc = (id: string) => persist(docs.filter(d => d.id !== id));

  const filtered = filter === 'all' ? docs : docs.filter(d => d.category === filter);
  const countByCat = (k: DocCategory) => docs.filter(d => d.category === k).length;

  const catMeta = (k: DocCategory) => DOC_CATEGORIES.find(c => c.key === k)!;

  return (
    <div>
      {/* Context banner */}
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 14px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 18 }}>
        <SFIcon name="info" size={14} color="var(--text-3)" style={{ marginTop: 1, flexShrink: 0 }} />
        <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
          Cette section regroupe les documents liés à <strong>l'entreprise cliente</strong> — contrats, briefs de marque, NDA, etc. —
          et non les livrables de projets spécifiques, qui se trouvent dans les <strong>Ressources</strong> de chaque projet.
        </p>
      </div>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexWrap: 'wrap', gap: 10 }}>
        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
          <button onClick={() => setFilter('all')} style={{ padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filter === 'all' ? 'var(--accent)' : 'var(--surface-2)', color: filter === 'all' ? 'var(--on-accent)' : 'var(--text-2)' }}>
            Tous ({docs.length})
          </button>
          {DOC_CATEGORIES.map(c => (
            <button key={c.key} onClick={() => setFilter(c.key)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 11px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 12, fontWeight: 500, background: filter === c.key ? 'var(--accent)' : 'var(--surface-2)', color: filter === c.key ? 'var(--on-accent)' : 'var(--text-2)' }}>
              <SFIcon name={c.icon} size={11} color="inherit" />{c.label} ({countByCat(c.key)})
            </button>
          ))}
        </div>
        <SFButton variant="primary" icon="upload" onClick={() => setShowAdd(true)}>Téléverser</SFButton>
      </div>

      {/* Document list */}
      {filtered.length === 0 ? (
        <div style={{ padding: '48px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 10 }}>
          <SFIcon name="folder-open" size={30} color="var(--text-3)" />
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucun document {filter !== 'all' ? `dans « ${catMeta(filter).label} »` : ''}</p>
          <SFButton variant="ghost" icon="upload" onClick={() => setShowAdd(true)}>Téléverser un document</SFButton>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {filtered.map(d => {
            const fm = DOC_FILE_META[d.fileType];
            const cm = catMeta(d.category);
            return (
              <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', borderRadius: 11, background: 'var(--surface)', border: '1px solid var(--border)', transition: 'border-color 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <div style={{ width: 38, height: 38, borderRadius: 9, background: `${fm.color}1a`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name={fm.icon} size={17} color={fm.color} />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  {editingId === d.id ? (
                    <input
                      autoFocus
                      value={editingName}
                      onChange={e => setEditingName(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setEditingId(null); }}
                      onBlur={commitRename}
                      onClick={e => e.stopPropagation()}
                      style={{ width: '100%', fontSize: 13, fontWeight: 600, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', boxSizing: 'border-box' }}
                    />
                  ) : (
                    <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{d.name}</p>
                  )}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 3, flexWrap: 'wrap' }}>
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', padding: '1px 7px', borderRadius: 5 }}>
                      <SFIcon name={cm.icon} size={9} color="var(--text-3)" />{cm.label}
                    </span>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{d.size} · {d.date} · {d.uploadedBy}</span>
                  </div>
                </div>
                <button title="Renommer" onClick={e => { e.stopPropagation(); startRename(d); }} style={{ display: 'flex', padding: 7, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                  <SFIcon name="pencil" size={14} />
                </button>
                <button title="Télécharger" style={{ display: 'flex', padding: 7, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
                  <SFIcon name="download" size={14} />
                </button>
                <button title="Supprimer" onClick={() => removeDoc(d.id)} style={{ display: 'flex', padding: 7, borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                  <SFIcon name="trash-2" size={14} />
                </button>
              </div>
            );
          })}
        </div>
      )}

      {/* Add document modal */}
      {showAdd && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
          onClick={e => { if (e.target === e.currentTarget) setShowAdd(false); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: 440, boxShadow: '0 20px 60px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '18px 22px', borderBottom: '1px solid var(--border)' }}>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>Téléverser un document</h3>
              <button onClick={() => setShowAdd(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
            </div>
            <div style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ border: '1.5px dashed var(--border-2)', borderRadius: 12, padding: '22px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
                <SFIcon name="upload-cloud" size={22} color="var(--accent)" />
                <p style={{ fontSize: 12, color: 'var(--text-2)' }}>Glissez un fichier ici</p>
              </div>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Nom du fichier *</label>
                <input value={newName} autoFocus onChange={e => setNewName(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addDoc(); }}
                  placeholder="ex. Contrat 2025.pdf"
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
              </div>
              <div>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>Catégorie</label>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DOC_CATEGORIES.map(c => (
                    <button key={c.key} onClick={() => setNewCategory(c.key)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 11px', borderRadius: 9, border: `1px solid ${newCategory === c.key ? 'var(--accent)' : 'var(--border)'}`, background: newCategory === c.key ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', color: newCategory === c.key ? 'var(--accent)' : 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                      <SFIcon name={c.icon} size={12} color="inherit" />{c.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', padding: '14px 22px', borderTop: '1px solid var(--border)' }}>
              <SFButton variant="ghost" onClick={() => setShowAdd(false)}>Annuler</SFButton>
              <SFButton variant="primary" icon="check" onClick={addDoc} disabled={!newName.trim()}>Ajouter</SFButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Client Edit Panel ─────────────────────────────────────────────────────────

const AVATAR_COLORS_FC = ['#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8', '#2d5a7d', '#a85f3e', '#2a7a8a', '#404040', '#8a2a6e', '#4a7a2a'];
const inputStyleFC: React.CSSProperties = { width: '100%', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' };
function SectionFC({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>{label}</p>
      {children}
    </div>
  );
}
function FieldFC({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.06em', display: 'block', marginBottom: 5 }}>{label}</label>
      {children}
    </div>
  );
}

function ClientEditPanel({ client, onClose }: {
  client: Client;
  onClose: () => void;
}) {
  const [lName,        setLName]        = useState(client.name);
  const [lSector,      setLSector]      = useState(client.sector);
  const [lCity,        setLCity]        = useState(client.city === '—' ? '' : client.city);
  const [lStatus,      setLStatus]      = useState<Status>(client.status);
  const [lStatusLabel, setLStatusLabel] = useState(client.statusLabel);
  const [lColor,       setLColor]       = useState(client.avatarColor ?? AVATAR_COLORS_FC[0]);
  const [lAddress,     setLAddress]     = useState(client.address ?? '');
  const [lPhone,       setLPhone]       = useState(client.phone ?? '');
  const [lEmail,       setLEmail]       = useState(client.email ?? '');
  const [lEmailCompta, setLEmailCompta] = useState(client.emailCompta ?? '');
  const [lWebsite,     setLWebsite]     = useState(client.website ?? '');
  const [lNotes,       setLNotes]       = useState(client.notes ?? '');

  const commit = (patch: Partial<Client>) => {
    const finalName = ((patch.name ?? lName) as string).trim() || client.name;
    const initials  = finalName.split(' ').map((w: string) => w[0]).join('').toUpperCase().slice(0, 2) || client.initials;
    updateClient(client.id, {
      name: finalName, initials,
      sector:      patch.sector      ?? lSector,
      city:        ((patch.city ?? lCity) as string).trim() || '—',
      status:      patch.status      ?? lStatus,
      statusLabel: patch.statusLabel ?? lStatusLabel,
      avatarColor: patch.avatarColor ?? lColor,
      address:     patch.address     ?? lAddress,
      phone:       patch.phone       ?? lPhone,
      email:       patch.email       ?? lEmail,
      emailCompta: patch.emailCompta ?? lEmailCompta,
      website:     patch.website     ?? lWebsite,
      notes:       patch.notes       ?? lNotes,
    });
  };


  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}
    >
      <div style={{ width: 400, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{ width: 34, height: 34, borderRadius: 9, background: lColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0, transition: 'background 0.15s' }}>
              {lName.trim().split(' ').map(w => w[0]).join('').toUpperCase().slice(0, 2) || client.initials}
            </div>
            <div>
              <h3 style={{ fontSize: 15, fontWeight: 700 }}>{lName || client.name}</h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Modifier le client</p>
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, flexShrink: 0 }}>
            <SFIcon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* ── Identité ── */}
          <SectionFC label="Identité">
            <FieldFC label="Nom du client">
              <input autoFocus value={lName} onChange={e => setLName(e.target.value)}
                onBlur={e => commit({ name: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                style={{ ...inputStyleFC, fontWeight: 600 }} />
            </FieldFC>
            <FieldFC label="Sous-titre">
              <input value={lSector} onChange={e => setLSector(e.target.value)}
                onBlur={e => commit({ sector: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Ex: Agence créative, Startup IA…" style={inputStyleFC} />
            </FieldFC>
            <FieldFC label="Statut">
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {PROJECT_STATUS_OPTIONS.map(opt => (
                  <button key={opt.value}
                    onClick={() => { setLStatus(opt.value as Status); setLStatusLabel(opt.label); commit({ status: opt.value as Status, statusLabel: opt.label }); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '6px 10px', borderRadius: 8, border: `1px solid ${lStatus === opt.value ? (STATUS_COLOR[opt.value] ?? 'var(--border)') : 'var(--border)'}`, background: lStatus === opt.value ? 'var(--surface-3)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--ff-text)' }}
                  >
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[opt.value] ?? 'var(--text-3)', flexShrink: 0 }} />
                    {opt.label}
                    {lStatus === opt.value && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                  </button>
                ))}
              </div>
            </FieldFC>
            <FieldFC label="Couleur avatar">
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
                {AVATAR_COLORS_FC.map(c => (
                  <button key={c} onClick={() => { setLColor(c); commit({ avatarColor: c }); }}
                    style={{ width: 26, height: 26, borderRadius: 7, background: c, border: lColor === c ? '3px solid white' : '3px solid transparent', outline: lColor === c ? `2px solid ${c}` : 'none', outlineOffset: 2, cursor: 'pointer', padding: 0, transform: lColor === c ? 'scale(1.15)' : 'none', transition: 'transform 0.1s', flexShrink: 0 }}
                  />
                ))}
              </div>
            </FieldFC>
          </SectionFC>

          {/* ── Coordonnées ── */}
          <SectionFC label="Coordonnées">
            <FieldFC label="Adresse">
              <input value={lAddress} onChange={e => setLAddress(e.target.value)}
                onBlur={e => commit({ address: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Ex: 123 rue Saint-Denis, Montréal" style={inputStyleFC} />
            </FieldFC>
            <FieldFC label="Ville">
              <input value={lCity} onChange={e => setLCity(e.target.value)}
                onBlur={e => commit({ city: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Ex: Montréal" style={inputStyleFC} />
            </FieldFC>
            <FieldFC label="Site web">
              <input value={lWebsite} onChange={e => setLWebsite(e.target.value)}
                onBlur={e => commit({ website: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Ex: https://acme.com" style={inputStyleFC} />
            </FieldFC>
          </SectionFC>

          {/* ── Contact principal ── */}
          <SectionFC label="Contact principal">
            <FieldFC label="Téléphone">
              <input value={lPhone} onChange={e => setLPhone(e.target.value)}
                onBlur={e => commit({ phone: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Ex: +1 514 555-0100" style={inputStyleFC} type="tel" />
            </FieldFC>
            <FieldFC label="Courriel">
              <input value={lEmail} onChange={e => setLEmail(e.target.value)}
                onBlur={e => commit({ email: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Ex: contact@acme.com" style={inputStyleFC} type="email" />
            </FieldFC>
            <FieldFC label="Courriel comptabilité">
              <input value={lEmailCompta} onChange={e => setLEmailCompta(e.target.value)}
                onBlur={e => commit({ emailCompta: e.target.value })}
                onKeyDown={e => { if (e.key === 'Enter') (e.target as HTMLInputElement).blur(); }}
                placeholder="Ex: compta@acme.com" style={inputStyleFC} type="email" />
            </FieldFC>
          </SectionFC>

          {/* ── Notes ── */}
          <SectionFC label="Notes internes">
            <textarea value={lNotes} onChange={e => setLNotes(e.target.value)}
              onBlur={e => commit({ notes: e.target.value })}
              placeholder="Contexte, préférences, informations importantes…"
              rows={4}
              style={{ ...inputStyleFC, resize: 'vertical', lineHeight: 1.6, colorScheme: 'dark' } as React.CSSProperties} />
          </SectionFC>

        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Fichiers client tab ────────────────────────────────────────────────────────

function FichiersClientTab({ projects }: { projects: any[] }) {
  const navigate = useNavigate();
  if (projects.length === 0) {
    return (
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, padding: '60px 0', color: 'var(--text-3)' }}>
        <SFIcon name="folder-open" size={40} color="var(--border-2)" />
        <p style={{ fontSize: 14, fontWeight: 500 }}>Aucun projet</p>
        <p style={{ fontSize: 12 }}>Créez un projet pour accéder à ses fichiers</p>
      </div>
    );
  }
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
        Accéder aux fichiers par projet
      </p>
      {projects.map(p => (
        <button key={p.id} onClick={() => navigate(`/projets/${p.id}/fichiers`)}
          style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '14px 18px', borderRadius: 12, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.12s, background 0.12s' }}
          onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
          onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
        >
          <div style={{ width: 40, height: 40, borderRadius: 10, background: (p.clientColor ?? 'var(--accent)') + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name="folder" size={20} color={p.clientColor ?? 'var(--accent)'} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{p.statusLabel || 'Aucun statut'}</p>
          </div>
          <SFIcon name="chevron-right" size={16} color="var(--text-3)" />
        </button>
      ))}
    </div>
  );
}

export function FicheClient() {
  const { clientId } = useParams();
  const navigate = useNavigate();
  const [clientData, setClientData] = useState(() => findClient(clientId ?? '') ?? findClient('c1')!);
  const client = clientData;
  const projects = PROJECTS.filter(p => p.clientId === client.id);

  useEffect(() => {
    return subscribeClients(() => {
      const updated = findClient(clientId ?? '') ?? findClient('c1')!;
      setClientData(updated);
    });
  }, [clientId]);
  const [searchParams, setSearchParams] = useSearchParams();
  const tab = (searchParams.get('tab') as ClientTab) ?? 'apercu';
  const setTab = (t: ClientTab) => setSearchParams({ tab: t }, { replace: true });
  const [filterTab, setFilterTab] = useState<'all' | 'active' | 'done' | 'archived'>('all');
  const [projectOverrides, setProjectOverrides] = useState<Record<string, { status?: string; statusLabel?: string; archived?: boolean }>>({});
  const [clientArchived, setClientArchived] = useState(false);
  const [clientMenuOpen, setClientMenuOpen] = useState(false);
  const [clientEditOpen, setClientEditOpen] = useState(() => searchParams.get('edit') === 'true');
  const clientMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!clientMenuOpen) return;
    const close = (e: MouseEvent) => {
      if (clientMenuRef.current && !clientMenuRef.current.contains(e.target as Node)) setClientMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [clientMenuOpen]);

  const getProjectStatus = (p: typeof PROJECTS[0]) => ({
    status: projectOverrides[p.id]?.status ?? p.status,
    statusLabel: projectOverrides[p.id]?.statusLabel ?? p.statusLabel,
    archived: projectOverrides[p.id]?.archived ?? false,
  });

  const filteredProjects = projects.filter(p => {
    const ov = getProjectStatus(p);
    if (filterTab === 'archived') return ov.archived;
    if (ov.archived) return false;
    if (filterTab === 'active') return ov.status !== 'ok' && ov.status !== 'neutral';
    if (filterTab === 'done') return ov.status === 'ok' || ov.status === 'neutral';
    return true;
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Breadcrumb */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', flexShrink: 0 }}>
        <button onClick={() => navigate('/clients')} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer' }}>Clients</button>
        <span>/</span>
        <span style={{ color: 'var(--text-2)' }}>{client.name}</span>
      </div>

      {/* Client header */}
      <div style={{ padding: '20px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 60, height: 60, borderRadius: 12, background: client.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
              {client.initials}
            </div>
            <div>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 6 }}>
                CLIENT · {client.sector} · {client.city}
              </p>
              <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>{client.name}</h1>
              <div style={{ display: 'flex', gap: 16, marginTop: 8, fontSize: 12, color: 'var(--text-2)' }}>
                <span>{projects.length} projet{projects.length !== 1 ? 's' : ''}</span>
                <span>{projects.filter(p => p.status !== 'neutral').length} actif{projects.filter(p => p.status !== 'neutral').length !== 1 ? 's' : ''}</span>
                <span>Client depuis {client.since}</span>
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {clientArchived && (
              <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '4px 10px', letterSpacing: '0.05em' }}>
                ARCHIVÉ
              </span>
            )}
            <SFButton variant="primary" icon="plus">Nouveau projet</SFButton>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 20, marginTop: 16 }}>
          {([['apercu', 'Aperçu'], ['projets', 'Projets'], ['equipe', 'Équipe'], ['activite', 'Activité'], ['documents', 'Documents'], ['fichiers', 'Fichiers']] as const).map(([key, label]) => (
            <button key={key} onClick={() => setTab(key)} style={{ fontSize: 13, fontWeight: 500, color: tab === key ? 'var(--text)' : 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 6, borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Content */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 14 }}>
        {tab === 'apercu' && <ApercuTab client={client} projects={projects} clientId={client.id} onGoTab={setTab} />}

        {tab === 'projets' && (
          <>
            <div style={{ display: 'flex', gap: 4 }}>
              {([['all', 'Tous'], ['active', 'En cours'], ['done', 'Complétés'], ['archived', 'Archivés']] as const).map(([val, label]) => (
                <button key={val} onClick={() => setFilterTab(val)} style={{ padding: '5px 10px', borderRadius: 9, border: 'none', background: filterTab === val ? 'var(--surface-3)' : 'transparent', color: filterTab === val ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer' }}>
                  {label}
                </button>
              ))}
            </div>
            {filteredProjects.length === 0 && (
              <div style={{ padding: '40px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8 }}>
                <SFIcon name="folder" size={28} color="var(--text-3)" />
                <p style={{ fontSize: 13, color: 'var(--text-3)' }}>
                  {filterTab === 'archived' ? 'Aucun projet archivé' : 'Aucun projet dans cette catégorie'}
                </p>
              </div>
            )}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, width: '100%' }}>
              {filteredProjects.map(p => (
                <ProjectCard key={p.id} p={p} />
              ))}
            </div>
          </>
        )}

        {tab === 'equipe' && <EquipeTab clientId={client.id} />}

        {tab === 'activite' && <ActiviteTab projects={projects} />}

        {tab === 'documents' && <DocumentsTab clientId={client.id} />}

        {tab === 'fichiers' && <FichiersClientTab projects={projects} />}
      </div>

      {clientEditOpen && (
        <ClientEditPanel
          client={client}
          onClose={() => setClientEditOpen(false)}
        />
      )}
    </div>
  );
}
