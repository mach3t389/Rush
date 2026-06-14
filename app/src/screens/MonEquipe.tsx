import { useState } from 'react';
import { SFButton, SFIcon, SFAvatar } from '../components/ui';
import { USERS, PROJECTS } from '../data/mock';
import { ProfileEditPanel, loadPhoto } from '../components/profile/ProfileEditPanel';

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

// ── Invite modal ──────────────────────────────────────────────────────────────

function InviteTeamModal({ onClose }: { onClose: () => void }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('');
  const [sent, setSent] = useState(false);

  const submit = () => {
    if (!name.trim() || !email.trim()) return;
    setSent(true);
    setTimeout(onClose, 1500);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 400 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>Inviter un membre</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        {sent ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12, padding: '20px 0' }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'rgba(0,200,100,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <SFIcon name="check" size={24} color="var(--ok)" />
            </div>
            <p style={{ fontSize: 14, fontWeight: 600 }}>Invitation envoyée !</p>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{email}</p>
          </div>
        ) : (
          <>
            {[
              { label: 'Nom complet *', val: name, set: setName, placeholder: 'Ex: Camille Dupont' },
              { label: 'Adresse courriel *', val: email, set: setEmail, placeholder: 'camille@studioflow.fr' },
              { label: 'Rôle', val: role, set: setRole, placeholder: 'Ex: Motion designer' },
            ].map(f => (
              <div key={f.label} style={{ marginBottom: 14 }}>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 5 }}>{f.label}</label>
                <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder}
                  style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }} />
              </div>
            ))}
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>
              La personne recevra un courriel pour créer son compte et rejoindre votre espace studio.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
              <SFButton variant="primary" onClick={submit} disabled={!name.trim() || !email.trim()}>Envoyer l'invitation</SFButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Member detail panel ───────────────────────────────────────────────────────

function MemberPanel({ member, onClose }: { member: TeamMember; onClose: () => void }) {
  const memberProjects = PROJECTS.filter(p => p.members.some(m => m.id === member.id));
  const [showEdit, setShowEdit] = useState(false);
  const photoUrl = loadPhoto(member.id);

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
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Contact</p>
            {[
              { icon: 'mail', value: member.email },
              { icon: 'phone', value: member.phone },
              { icon: 'calendar', value: `Membre depuis ${member.since}` },
            ].map(row => (
              <div key={row.icon} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <SFIcon name={row.icon} size={13} color="var(--text-3)" />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>{row.value}</span>
              </div>
            ))}
          </div>

          {/* Active projects */}
          <div>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Projets actifs ({memberProjects.length})</p>
            {memberProjects.length === 0 ? (
              <p style={{ fontSize: 12, color: 'var(--text-3)' }}>Aucun projet actif</p>
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
          <SFButton variant="ghost" icon="mail">Contacter</SFButton>
          <SFButton variant="ghost" icon="send">Renvoyer invitation</SFButton>
          <div style={{ marginLeft: 'auto' }}>
            <SFButton variant="primary" icon="pencil" onClick={() => setShowEdit(true)}>Modifier le profil</SFButton>
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
  const [search, setSearch] = useState('');
  const [selectedMember, setSelectedMember] = useState<TeamMember | null>(null);
  const [showInvite, setShowInvite] = useState(false);

  const filtered = INTERNAL_TEAM.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase()) ||
    m.role.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Header */}
      <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22 }}>Équipe interne</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            {INTERNAL_TEAM.length} membres internes · Studio StudioFlow
          </p>
        </div>
        <SFButton variant="primary" icon="user-plus" onClick={() => setShowInvite(true)}>Inviter un membre</SFButton>
      </div>

      {/* Search */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        <div style={{ position: 'relative', maxWidth: 360 }}>
          <div style={{ position: 'absolute', left: 10, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
            <SFIcon name="search" size={14} color="var(--text-3)" />
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher un membre..."
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
                      {member.activeProjects} projet{member.activeProjects !== 1 ? 's' : ''}
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
            <SFIcon name="user-plus" size={18} color="inherit" />
            <span style={{ fontSize: 13, fontFamily: 'var(--ff-text)' }}>Inviter un membre</span>
          </div>
        </div>
      </div>

      {selectedMember && <MemberPanel member={selectedMember} onClose={() => setSelectedMember(null)} />}
      {showInvite && <InviteTeamModal onClose={() => setShowInvite(false)} />}
    </div>
  );
}
