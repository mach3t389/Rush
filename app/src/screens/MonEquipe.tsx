import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon, SFAvatar } from '../components/ui';
import { USERS, PROJECTS } from '../data/mock';
import { ProfileEditPanel, loadPhoto, loadPermissions, PERMISSION_PRESETS, savePermissions, type PermissionKey } from '../components/profile/ProfileEditPanel';
import { enterViewAs } from '../data/viewAsStore';
import { isDemoSession } from '../data/authStore';
import { getTeamMembers, subscribeTeam, createInvitation } from '../data/teamStore';
import { getProjects } from '../data/projectStore';

// ── Mock extra info for team members ─────────────────────────────────────────

const MEMBER_EMAIL: Record<string, string> = {
  lea:    'lea.marchand@studioflow.fr',
  sarah:  'sarah.martin@studioflow.fr',
  thomas: 'thomas.robert@studioflow.fr',
  julie:  'julie.bernard@studioflow.fr',
  marc:   'marc.dufour@studioflow.fr',
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

const ROLE_COLOR: Record<string, string> = {
  'Admin':          '#5c3d8f',
  'Dir. créative':  '#3b4f8f',
  'Chef de projet': '#1a6b4a',
  'Monteuse':       '#7d4e57',
  'Producteur':     '#a85f3e',
};

type TeamMember = typeof USERS[string] & { email: string; since: string; phone: string; activeProjects: number };

const INTERNAL_TEAM: TeamMember[] = Object.values(USERS)
  .filter(u => u.role !== 'Cliente')
  .map(u => ({
    ...u,
    email: MEMBER_EMAIL[u.id] ?? `${u.id}@studioflow.fr`,
    since: MEMBER_SINCE[u.id] ?? 'Récemment',
    phone: MEMBER_PHONE[u.id] ?? '—',
    activeProjects: PROJECTS.filter(p => p.members.some(m => m.id === u.id)).length,
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
  }));
}

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteTeamModal({ onClose }: { onClose: () => void }) {
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
    savePermissions(email.trim(), perms);
    const result = await createInvitation(email.trim(), role.trim() || 'Membre');
    setLink(result.link);
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
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
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

function MemberPanel({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const memberProjects = getProjects().filter(p => p.members.some(m => m.id === member.id));
  const [showEdit, setShowEdit] = useState(false);
  const photoUrl = loadPhoto(member.id);

  const handleViewAs = () => {
    const permissions = loadPermissions(member.id, member.role);
    enterViewAs({
      type: 'internal',
      id: member.id,
      name: member.name,
      initials: member.initials,
      avatarColor: member.avatarColor,
      role: member.role,
      permissions,
    });
    onClose();
    navigate('/');
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', justifyContent: 'flex-end' }}
      onMouseDown={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.45)' }} />
      <div style={{ position: 'relative', width: 420, height: '100%', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '-12px 0 40px rgba(0,0,0,0.6)', borderLeft: '1px solid var(--border)' }}>
        {/* Header */}
        <div style={{ padding: '24px 24px 20px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 16 }}>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}><SFIcon name="x" size={16} /></button>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: member.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, fontWeight: 700, color: '#fff', overflow: 'hidden', flexShrink: 0 }}>
              {photoUrl ? <img src={photoUrl} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} /> : <SFAvatar initials={member.initials} bg={member.avatarColor} size={56} />}
            </div>
            <div>
              <p style={{ fontSize: 18, fontWeight: 700 }}>{member.name}</p>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, padding: '2px 8px', borderRadius: 6, background: (ROLE_COLOR[member.role] ?? '#404040') + '22', color: ROLE_COLOR[member.role] ?? 'var(--text-3)', letterSpacing: '0.05em' }}>{member.role}</span>
            </div>
          </div>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Contact info */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('team.contact')}</p>
            {[
              { icon: 'mail', value: member.email },
              { icon: 'phone', value: member.phone },
              { icon: 'calendar', value: t('team.memberSince', { date: member.since }) },
            ].map(row => (
              <div key={row.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SFIcon name={row.icon} size={13} color="var(--text-3)" />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Active projects */}
          <div>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>{t('team.activeProjectsCount', { count: memberProjects.length })}</p>
            {memberProjects.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('team.noActiveProjects')}</p>
            ) : memberProjects.map(p => (
              <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', marginBottom: 6 }}>
                <i style={{ width: 9, height: 9, borderRadius: '50%', background: p.clientColor, flexShrink: 0, display: 'block' }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{p.clientName}</p>
                </div>
                <SFPillSmall status={p.status}>{p.statusLabel}</SFPillSmall>
              </div>
            ))}
          </div>
        </div>

        {/* Footer actions */}
        <div style={{ padding: '14px 24px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <SFButton variant="ghost" icon="mail">{t('team.contactAction')}</SFButton>
          <SFButton variant="ghost" icon="send">{t('team.resendInvitation')}</SFButton>
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
            <SFButton variant="ghost" icon="eye" onClick={handleViewAs}>{t('viewAs.viewAs')}</SFButton>
            <SFButton variant="primary" icon="pencil" onClick={() => setShowEdit(true)}>{t('team.editProfile')}</SFButton>
          </div>
        </div>
      </div>

      {showEdit && (
        <ProfileEditPanel
          userId={member.id}
          initialName={member.name}
          initialRole={member.role}
          initialEmail={member.email}
          initialPhone={member.phone}
          initialInitials={member.initials}
          initialColor={member.avatarColor}
          isAdmin
          onClose={() => setShowEdit(false)}
        />
      )}
    </div>
  );
}

// tiny pill without importing SFPill to avoid circular issues
function SFPillSmall({ status, children }: { status: string; children: React.ReactNode }) {
  const COLOR: Record<string, string> = { ok: 'var(--ok)', info: 'var(--info)', warn: 'var(--warn)', danger: 'var(--danger)', neutral: 'var(--text-3)', review: 'var(--review)' };
  const c = COLOR[status] ?? 'var(--text-3)';
  return <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: c, background: c + '18', padding: '2px 6px', borderRadius: 5, whiteSpace: 'nowrap', letterSpacing: '0.05em' }}>{children}</span>;
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function MonEquipe() {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);
  const [, forceRerender] = useState(0);

  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);

  const team = isDemoSession() ? INTERNAL_TEAM : getRealTeam();
  const filtered = team.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>{t('team.title')}</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            {t('team.subtitle', { count: team.length })}
          </p>
        </div>
        <SFButton variant="primary" icon="user-plus" onClick={() => setShowInvite(true)}>{t('team.inviteMember')}</SFButton>
      </div>

      {/* Search */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <SFIcon name="search" size={14} color="var(--text-3)" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder={t('team.searchPlaceholder')}
            style={{ width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box' }} />
        </div>
      </div>

      {/* Team grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(320px, 1fr))', gap: 12 }}>
          {filtered.map(member => {
            const roleColor = ROLE_COLOR[member.role] ?? '#404040';
            return (
              <div
                key={member.id}
                onClick={() => setSelectedMember(member)}
                style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 16, transition: 'border-color 0.12s' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
              >
                <SFAvatar initials={member.initials} bg={member.avatarColor} size={48} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 3 }}>{member.name}</p>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, padding: '2px 7px', borderRadius: 5, background: roleColor + '22', color: roleColor, letterSpacing: '0.05em' }}>{member.role}</span>
                  <div style={{ display: 'flex', gap: 12, marginTop: 8, fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <SFIcon name="folder" size={10} color="var(--text-3)" />
                      {t('team.projectCount', { count: member.activeProjects })}
                    </span>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                      <SFIcon name="calendar" size={10} color="var(--text-3)" />
                      {member.since}
                    </span>
                  </div>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0 }} />
                  <SFIcon name="chevron-right" size={14} color="var(--text-3)" />
                </div>
              </div>
            );
          })}

          {/* Invite placeholder card */}
          <div
            onClick={() => setShowInvite(true)}
            style={{ background: 'transparent', borderRadius: 14, border: '1.5px dashed var(--border-2)', padding: '18px 20px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)', minHeight: 90, transition: 'border-color 0.12s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
          >
            <SFIcon name="user-plus" size={18}  />
            <span style={{ fontSize: 13, fontFamily: 'var(--ff-text)' }}>{t('team.inviteMember')}</span>
          </div>
        </div>
      </div>

      {selectedMember && <MemberPanel member={selectedMember} onClose={() => setSelectedMember(null)} />}
      {showInvite && <InviteTeamModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
