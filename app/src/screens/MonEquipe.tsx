import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon, SFAvatar, PageHeader, SFCard, SFModal, CategoryFilterDropdown } from '../components/ui';
import { USERS, PROJECTS } from '../data/mock';
import { loadPhoto, loadPermissions, PERMISSION_PRESETS, PERMISSION_DEFS, matchPreset, savePermissions, type PermissionKey } from '../components/profile/ProfileEditPanel';
import type { AccessLevel, PendingInvitation } from '../data/teamStore';
import { enterViewAs } from '../data/viewAsStore';
import { isDemoSession } from '../data/authStore';
import { getTeamMembers, subscribeTeam, createInvitation, sendTeamInvitationEmail, getMyAccessLevel, getPendingInvitations, cancelInvitation, resendInvitation, updateMemberFields, removeMember, isTeamOwner } from '../data/teamStore';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { usePlan, getCurrentBillingSeats } from '../data/planStore';
import { PLAN_LIMITS } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
import { usePersistedState } from '../hooks/usePersistedState';

// ── Mock extra info for team members ─────────────────────────────────────────

const MEMBER_EMAIL: Record<string, string> = {
  lea:    'lea.marchand@rushflow.com',
  sarah:  'sarah.martin@rushflow.com',
  thomas: 'thomas.robert@rushflow.com',
  julie:  'julie.bernard@rushflow.com',
  marc:   'marc.dufour@rushflow.com',
};

const MEMBER_SINCE: Record<string, string> = {
  lea:    'Janv. 2022',
  sarah:  'Mars 2022',
  thomas: 'Juin 2023',
  julie:  'Sept. 2022',
  marc:   'Fév. 2024',
};

const MEMBER_PHONE: Record<string, string> = {
  lea:    '+1 514 555-0101',
  sarah:  '+1 514 555-0102',
  thomas: '+1 514 555-0103',
  julie:  '+1 514 555-0104',
  marc:   '+1 514 555-0105',
};

type TeamMember = typeof USERS[string] & { email: string; since: string; phone: string; activeProjects: number; accessLevel: AccessLevel };

// Owner/admin have full access by construction (same rule enforced in
// ViewAsPermissionGate/Sidebar) regardless of their stored permissions
// array, so they're always filed under the Administrateur preset.
// getTeamMembers() already branches on isDemoSession internally, so this
// map works for both the demo and real team-building paths below.
const ACCESS_LEVEL_BY_ID: Record<string, AccessLevel> = Object.fromEntries(
  getTeamMembers().map(m => [m.id, m.accessLevel])
);

const INTERNAL_TEAM: TeamMember[] = Object.values(USERS)
  .filter(u => u.role !== 'Cliente')
  .map(u => ({
    ...u,
    email: MEMBER_EMAIL[u.id] ?? `${u.id}@rushflow.com`,
    since: MEMBER_SINCE[u.id] ?? 'Récemment',
    phone: MEMBER_PHONE[u.id] ?? '—',
    activeProjects: PROJECTS.filter(p => p.members.some(m => m.id === u.id)).length,
    accessLevel: ACCESS_LEVEL_BY_ID[u.id] ?? 'member',
  }));

function getRealTeam(): TeamMember[] {
  const projects = getProjects();
  return getTeamMembers().map(m => ({
    id: m.id,
    name: m.name,
    initials: m.initials,
    avatarColor: m.avatarColor,
    role: m.role,
    email: m.email,
    since: m.joinedAt ? new Date(m.joinedAt).toLocaleDateString('fr-FR', { month: 'short', year: 'numeric' }) : '—',
    phone: '—',
    activeProjects: projects.filter(p => p.members.some(pm => pm.id === m.id)).length,
    accessLevel: m.accessLevel,
  }));
}

// ── Invite modal ──────────────────────────────────────────────────────────────

export function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [link, setLink] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [sending, setSending] = useState(false);
  const [perms, setPerms] = useState<PermissionKey[]>(PERMISSION_PRESETS[2].perms);

  const submit = async () => {
    if (!name.trim() || !email.trim()) return;
    setSending(true);
    // Demo sessions never really create a member row to attach permissions
    // to, so keep saving them under the invite email — matches prior
    // behavior. Real sessions pass the chosen permissions straight through
    // createInvitation so they land on the studio_members row once accepted
    // (they used to be saved under the invite email, a key nothing ever
    // read back once the real member existed under their own user id).
    if (isDemoSession()) savePermissions(email.trim(), perms);
    // Access level is derived from the chosen permission preset rather than
    // picked separately — the "Administrateur" preset IS full/admin access,
    // so a standalone access-level selector could contradict it (e.g. picking
    // "Membre" up top with the "Administrateur" permissions bundle below,
    // leaving someone with every granular permission but no ability to
    // manage other members' permissions, since that's gated on access level).
    const accessLevel = matchPreset(perms) === 'admin' ? 'admin' : 'member';
    const result = await createInvitation(email.trim(), role.trim() || 'Membre', accessLevel, perms);
    setLink(result.link);
    sendTeamInvitationEmail(email.trim(), role.trim() || 'Membre', result.link);
    setSending(false);
    if (isDemoSession()) setTimeout(onClose, 1500);
  };

  const copyLink = async () => {
    if (!link) return;
    await navigator.clipboard.writeText(link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{t('team.inviteMember')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        {link && isDemoSession() ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,200,100,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SFIcon name="check" size={24} color="var(--ok)" />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>{t('team.invitationSent')}</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{email}</p>
          </div>
        ) : link ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{t('team.linkReadyHint')}</p>
            <div style={{ display: 'flex', gap: 8 }}>
              <input readOnly value={link} style={{ flex: 1, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-mono)' }} />
              <SFButton variant="primary" icon={copied ? 'check' : 'copy'} onClick={copyLink}>
                {copied ? t('team.linkCopied') : t('team.copyLink')}
              </SFButton>
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" onClick={onClose}>{t('team.done')}</SFButton>
            </div>
          </div>
        ) : (
          <>
            {[
              { label: t('team.fullNameRequired'), val: name, set: setName, placeholder: t('team.fullNamePlaceholder') },
              { label: t('team.emailRequired'), val: email, set: setEmail, placeholder: t('team.emailPlaceholder') },
              { label: t('team.role'), val: role, set: setRole, placeholder: t('team.rolePlaceholder') },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
              </div>
            ))}
            <div style={{ marginBottom: 16 }}>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>
                {t('team.permissions')}
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2, 1fr)', gap: 6 }}>
                {PERMISSION_PRESETS.map(p => {
                  const active = JSON.stringify([...perms].sort()) === JSON.stringify([...p.perms].sort());
                  return (
                    <button
                      key={p.key}
                      type="button"
                      onClick={() => setPerms(p.perms)}
                      style={{
                        padding: '8px 10px', borderRadius: 9, cursor: 'pointer', textAlign: 'left',
                        border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                        background: active ? 'color-mix(in srgb, var(--accent) 12%, var(--surface-2))' : 'var(--surface-2)',
                        transition: 'all 0.1s',
                      }}
                    >
                      <p style={{ fontSize: 11, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', margin: 0 }}>{t(p.labelKey)}</p>
                      <p style={{ fontSize: 9, color: 'var(--text-3)', margin: '2px 0 0', fontFamily: 'var(--ff-mono)', lineHeight: 1.4 }}>{t(p.descKey)}</p>
                    </button>
                  );
                })}
              </div>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>
              {isDemoSession() ? t('team.inviteHint') : t('team.inviteHintReal')}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" onClick={onClose}>{t('team.cancel')}</SFButton>
              <SFButton variant="primary" onClick={submit} disabled={!name.trim() || !email.trim() || sending}>
                {sending ? '…' : t('team.sendInvitation')}
              </SFButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Member detail panel ───────────────────────────────────────────────────────

// Floating centered modal, matching FicheClient.tsx's MemberEditPanel line
// for line (same tabs, same preset+toggle permission UI, same footer
// remove-with-confirm pattern) — the two screens are the same kind of object
// (a person with permissions) and should read as one design, not two.
function MemberPanel({ member, onClose, isOwner, canManage }: { member: TeamMember; onClose: () => void; isOwner: boolean; canManage: boolean }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [, forceProjectsRerenderPanel] = useState(0);
  useEffect(() => subscribeProjects(() => forceProjectsRerenderPanel(n => n + 1)), []);
  const memberProjects = getProjects().filter(p => p.members.some(m => m.id === member.id));
  const photoUrl = loadPhoto(member.id);

  const [activeTab, setActiveTab] = useState<'profil' | 'permissions'>('profil');
  const [name, setName] = useState(member.name);
  const [email, setEmail] = useState(member.email);
  const [role, setRole] = useState(member.role);
  const [accessLevel, setAccessLevel] = useState<AccessLevel>(member.accessLevel);
  const [perms, setPerms] = useState<PermissionKey[]>(() => loadPermissions(member.id, member.role));
  const [confirmDelete, setConfirmDelete] = useState(false);

  const permGroups = PERMISSION_DEFS.reduce<Record<string, typeof PERMISSION_DEFS>>((acc, p) => {
    (acc[p.group] ??= []).push(p);
    return acc;
  }, {});
  const togglePerm = (key: PermissionKey) => setPerms(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const handleViewAs = () => {
    enterViewAs({
      type: 'internal',
      id: member.id,
      name: member.name,
      initials: member.initials,
      avatarColor: member.avatarColor,
      role: member.role,
      permissions: perms,
    });
    onClose();
    navigate('/');
  };

  const save = () => {
    updateMemberFields(member.id, { name, email, role, accessLevel });
    savePermissions(member.id, perms);
    onClose();
  };

  return (
    <SFModal open onClose={onClose} title={t('team.memberCard')} width={420} height={640} maxHeight="85vh" padding={24}>
      <div style={{ margin: '0 -24px -24px', display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '0 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: member.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
              {photoUrl ? <img src={photoUrl} alt={name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <SFAvatar initials={member.initials} bg={member.avatarColor} size={56} />}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 14, fontWeight: 700 }}>{name}</p>
              <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{role}</p>
              {isOwner && (
                <span style={{ display: 'inline-flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.06em', color: 'var(--accent)', background: 'rgba(249,255,0,0.1)', padding: '2px 7px', borderRadius: 5, marginTop: 6 }}>
                  <SFIcon name="crown" size={9} color="var(--accent)" />
                  {t('team.owner')}
                </span>
              )}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 16 }}>
            {(['profil', 'permissions'] as const).map(tab => (
              <button key={tab} onClick={() => setActiveTab(tab)} style={{ fontSize: 13, fontWeight: 500, color: activeTab === tab ? 'var(--text)' : 'var(--text-2)', background: 'none', border: 'none', cursor: 'pointer', paddingBottom: 8, borderBottom: activeTab === tab ? '2px solid var(--accent)' : '2px solid transparent' }}>
                {tab === 'profil' ? t('client.tabProfile') : t('client.tabPermissions')}
              </button>
            ))}
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
          {activeTab === 'profil' ? (
            <>
              {[
                { label: t('client.fullName'), val: name, set: setName },
                { label: t('client.emailAddress'), val: email, set: setEmail },
                { label: t('client.roleFunction'), val: role, set: setRole },
              ].map(f => (
                <div key={f.label}>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                  <input value={f.val} onChange={e => f.set(e.target.value)} disabled={!canManage}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
                </div>
              ))}

              {!isOwner && canManage && (
                <div>
                  <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('team.accessLevel')}</label>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {(['admin', 'member'] as const).map(lvl => {
                      const active = accessLevel === lvl;
                      return (
                        <button key={lvl} onClick={() => setAccessLevel(lvl)}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}>
                          <p style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)', flex: 1 }}>{lvl === 'admin' ? t('team.accessAdmin') : t('team.accessMember')}</p>
                          <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                            {active && <SFIcon name="check" size={10} color="var(--on-accent)" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{t('team.activeProjectsCount', { count: memberProjects.length })}</p>
                {memberProjects.length === 0 ? (
                  <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('team.noActiveProjects')}</p>
                ) : memberProjects.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', marginBottom: 6 }}>
                    <i style={{ width: 9, height: 9, borderRadius: '50%', background: p.clientColor, flexShrink: 0, display: 'block' }} />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                    </div>
                    <SFPillSmall status={p.status}>{p.statusLabel}</SFPillSmall>
                  </div>
                ))}
              </div>
            </>
          ) : (
            <>
              {(() => {
                const activePreset = matchPreset(perms);
                return (
                  <div>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('client.presets')}</p>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {PERMISSION_PRESETS.map(preset => {
                        const active = activePreset === preset.key;
                        return (
                          <button key={preset.key} onClick={() => canManage && setPerms(preset.perms)} disabled={!canManage}
                            style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', borderRadius: 10, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', cursor: canManage ? 'pointer' : 'default', textAlign: 'left', fontFamily: 'var(--ff-text)' }}>
                            <div style={{ flex: 1 }}>
                              <p style={{ fontSize: 13, fontWeight: 600, color: active ? 'var(--accent)' : 'var(--text)' }}>{t(preset.labelKey)}</p>
                              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(preset.descKey)}</p>
                            </div>
                            <div style={{ width: 18, height: 18, borderRadius: '50%', border: `2px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                              {active && <SFIcon name="check" size={10} color="var(--on-accent)" />}
                            </div>
                          </button>
                        );
                      })}
                      {!activePreset && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'rgba(249,255,0,0.04)' }}>
                          <SFIcon name="sliders-horizontal" size={13} color="var(--accent)" />
                          <p style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 600 }}>{t('client.custom')}</p>
                        </div>
                      )}
                    </div>
                    <div style={{ height: 1, background: 'var(--border)', margin: '14px 0' }} />
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t('client.permissionDetails')}</p>
                  </div>
                );
              })()}
              {Object.entries(permGroups).map(([group, items]) => (
                <div key={group}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>{t(items[0].groupKey)}</p>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map(p => {
                      const on = perms.includes(p.key);
                      return (
                        <div key={p.key} onClick={() => canManage && togglePerm(p.key)}
                          style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 9, border: `1px solid ${on ? 'var(--accent)' : 'var(--border)'}`, background: on ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)', cursor: canManage ? 'pointer' : 'default' }}>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontSize: 13, fontWeight: 600 }}>{t(p.labelKey)}</p>
                            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(p.descKey)}</p>
                          </div>
                          <div style={{ width: 36, height: 20, borderRadius: 10, background: on ? 'var(--accent)' : 'var(--surface-3)', border: `1px solid ${on ? 'var(--accent)' : 'var(--border-2)'}`, position: 'relative', flexShrink: 0 }}>
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
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
          {confirmDelete ? (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{t('team.removeMemberConfirm')}</span>
              <SFButton variant="ghost" onClick={() => setConfirmDelete(false)}>{t('client.cancel')}</SFButton>
              <SFButton variant="ghost" onClick={() => { void removeMember(member.id); onClose(); }} style={{ color: 'var(--danger)' }}>{t('client.remove')}</SFButton>
            </div>
          ) : (
            <>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                {canManage && !isOwner && (
                  <SFButton variant="ghost" icon="user-minus" onClick={() => setConfirmDelete(true)} style={{ color: 'var(--danger)' }}>
                    {t('team.removeFromTeam')}
                  </SFButton>
                )}
                <div style={{ flex: 1 }} />
                <SFButton variant="ghost" icon="mail" onClick={() => window.open(`mailto:${email}`)}>{t('team.contactAction')}</SFButton>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SFButton variant="ghost" icon="eye" onClick={handleViewAs} style={{ width: '100%', justifyContent: 'center' }}>{t('viewAs.viewAs')}</SFButton>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8 }}>
                <SFButton variant="ghost" onClick={onClose}>{t('client.cancel')}</SFButton>
                {canManage && <SFButton variant="primary" onClick={save}>{t('client.save')}</SFButton>}
              </div>
            </>
          )}
        </div>
      </div>
    </SFModal>
  );
}

// tiny pill without importing SFPill to avoid circular issues
function SFPillSmall({ status, children }: { status: string; children: React.ReactNode }) {
  const COLOR: Record<string, string> = { ok: 'var(--ok)', info: 'var(--info)', warn: 'var(--warn)', danger: 'var(--danger)', neutral: 'var(--text-3)', review: 'var(--review)' };
  const c = COLOR[status] ?? 'var(--text-3)';
  return <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: c, background: c + '18', padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{children}</span>;
}

// ── Pending invitation chip ──────────────────────────────────────────────────
// Compact, fit-content pill (not a full-width row) so a handful of pending
// invitations don't dominate the page — with resend/cancel actions right on
// the chip, no extra menu or page needed.
function PendingInvitationChip({ invitation, onCancelled }: { invitation: PendingInvitation; onCancelled: () => void }) {
  const { t } = useTranslation();
  const [resent, setResent] = useState(false);
  const [cancelling, setCancelling] = useState(false);

  const handleResend = () => {
    resendInvitation(invitation);
    setResent(true);
    setTimeout(() => setResent(false), 2000);
  };

  const handleCancel = async () => {
    setCancelling(true);
    try {
      await cancelInvitation(invitation.token);
      onCancelled();
    } catch {
      setCancelling(false);
    }
  };

  const iconBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    width: 22, height: 22, borderRadius: 6, border: 'none',
    background: 'transparent', cursor: cancelling ? 'default' : 'pointer', flexShrink: 0,
  };

  return (
    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '5px 6px 5px 12px', borderRadius: 999, border: '1px solid var(--border)', background: 'var(--surface-2)', opacity: cancelling ? 0.5 : 1 }}>
      <SFIcon name="mail" size={12} color="var(--text-3)" />
      <span style={{ fontSize: 12, fontWeight: 500 }}>{invitation.email}</span>
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase' }}>{invitation.role}</span>
      <span style={{ fontSize: 9, fontWeight: 600, color: 'var(--warn)', padding: '1px 7px', borderRadius: 999, background: 'color-mix(in srgb, var(--warn) 14%, transparent)' }}>
        {t('team.invitationPending')}
      </span>
      <button
        type="button" title={t('team.resendInvitation')} disabled={cancelling}
        onClick={handleResend}
        style={iconBtnStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <SFIcon name={resent ? 'check' : 'send'} size={12} color={resent ? 'var(--ok)' : 'var(--text-3)'} />
      </button>
      <button
        type="button" title={t('team.cancelInvitation')} disabled={cancelling}
        onClick={handleCancel}
        style={iconBtnStyle}
        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
      >
        <SFIcon name="x" size={12} color="var(--danger)" />
      </button>
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function MonEquipe() {
  const { t } = useTranslation();
  const plan = usePlan();
  const [search, setSearch] = useState('');
  const [permFilter, setPermFilter] = usePersistedState<string>('sf_monequipe_perm_filter', 'all');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [, forceRerender] = useState(0);
  const [pendingInvitations, setPendingInvitations] = useState<PendingInvitation[]>([]);

  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);
  useEffect(() => subscribeProjects(() => forceRerender(n => n + 1)), []);
  useEffect(() => {
    let cancelled = false;
    getPendingInvitations().then(list => { if (!cancelled) setPendingInvitations(list); });
    return () => { cancelled = true; };
  }, [showInvite]);

  const team = isDemoSession() ? INTERNAL_TEAM : getRealTeam();

  // Same preset-matching rule as the former Membres hub: owner/admin are
  // always filed under the Administrateur preset (full access by
  // construction), everyone else matches by their stored permissions array.
  const teamWithPerm = team.map(m => {
    const presetKey = m.accessLevel !== 'member' ? 'admin' : matchPreset(loadPermissions(m.id, m.role));
    const preset = PERMISSION_PRESETS.find(p => p.key === presetKey);
    return { member: m, permKey: presetKey ?? 'custom', permLabelKey: preset?.labelKey ?? 'membres.permCustom' };
  });
  const permFilterOptions = Array.from(
    new Map(teamWithPerm.map(p => [p.permKey, p.permLabelKey])).entries()
  );

  const openInviteModal = () => {
    // Gratuit has no paid seats at all — hard cap at PLAN_LIMITS.gratuit.maxSeats (2).
    // Studio/Agence: the real ceiling is what's already been purchased via billing,
    // not the plan's maximum — buying more seats (chantier A) raises this.
    const seatLimit = plan === 'gratuit' ? PLAN_LIMITS.gratuit.maxSeats : getCurrentBillingSeats();
    if (team.length >= seatLimit) {
      requestUpgrade(plan === 'gratuit' ? { reason: 'membersGratuit' } : { reason: 'seats' });
      return;
    }
    setShowInvite(true);
  };
  const filtered = teamWithPerm
    .filter(p => permFilter === 'all' || p.permKey === permFilter)
    .filter(({ member: m }) =>
      m.name.toLowerCase().includes(search.toLowerCase()) ||
      m.role.toLowerCase().includes(search.toLowerCase())
    );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header — shared PageHeader, same title/subtitle size and surface
          background as Clients.tsx/Projets, instead of a hand-rolled block
          that drifted from both (22px title vs 20px, no explicit surface
          background). */}
      <PageHeader title={t('team.title')} subtitle={t('team.subtitle', { count: team.length })}
        actions={<SFButton variant="primary" icon="user-plus" onClick={() => openInviteModal()}>{t('team.inviteMember')}</SFButton>}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ position: 'relative', flex: 1, maxWidth: 340 }}>
            <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
              <SFIcon name="search" size={14} color="var(--text-3)" />
            </div>
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('team.searchPlaceholder')}
              style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
          </div>
          {permFilterOptions.length > 1 && (
            <CategoryFilterDropdown
              value={permFilter}
              onChange={setPermFilter}
              categoryLabel={t('common.activityFilterLabel')}
              icon="shield"
              options={[{ value: 'all', label: t('membres.permFilterAll') }, ...permFilterOptions.map(([key, labelKey]) => ({ value: key, label: t(labelKey) }))]}
            />
          )}
        </div>
      </PageHeader>

      {/* Team grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        {pendingInvitations.length > 0 && (
          <div style={{ marginBottom: 20 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>
              {t('team.pendingInvitations', { count: pendingInvitations.length })}
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {pendingInvitations.map(inv => (
                <PendingInvitationChip
                  key={inv.token}
                  invitation={inv}
                  onCancelled={() => setPendingInvitations(list => list.filter(i => i.token !== inv.token))}
                />
              ))}
            </div>
          </div>
        )}
        {/* Same fixed 3-column grid as Clients.tsx's ClientCard grid (was
            auto-fill/minmax, which let 4+ narrower cards fit per row on a
            wide screen — a real, measurable layout difference, not just a
            style nuance). Card content below also mirrors ClientCard's
            structure line-for-line (header row, border-top stat row,
            bottom pill row) instead of a same-badge-different-layout
            approximation. */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map(({ member, permLabelKey }) => (
            <SFCard key={member.id} padding={18} gap={12} onClick={() => setSelectedMember(member)}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 40, height: 40, borderRadius: 9, background: member.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 14, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {member.initials}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontWeight: 600, fontSize: 14 }}>{member.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.04em', textTransform: 'uppercase', marginTop: 2 }}>
                    {member.role}
                  </p>
                </div>
              </div>

              <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, display: 'flex', gap: 14, fontSize: 11, color: 'var(--text-2)' }}>
                <span>{t('team.projectCount', { count: member.activeProjects })}</span>
                <span>{member.since}</span>
              </div>

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span style={{
                  fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase',
                  letterSpacing: '0.05em', border: '1px solid var(--border)', borderRadius: 999, padding: '3px 8px', flexShrink: 0,
                }}>
                  {t(permLabelKey)}
                </span>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />
              </div>
            </SFCard>
          ))}
        </div>
      </div>

      {selectedMember && (
        <MemberPanel
          member={selectedMember}
          onClose={() => setSelectedMember(null)}
          isOwner={isTeamOwner(selectedMember.id)}
          canManage={getMyAccessLevel() !== 'member'}
        />
      )}
      {showInvite && <InviteTeamModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
