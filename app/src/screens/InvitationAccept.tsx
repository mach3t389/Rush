import { useParams, Link } from 'react-router-dom';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getInvitation, resolveInvitation } from '../data/invitationStore';
import { findClient } from '../data/clientStore';
import { getClientTeam, setClientTeam, removeClientTeamMember } from '../data/clientTeamStore';
import { STUDIO_NAME_KEY } from '../data/authStore';
import { addNotif } from '../data/notificationStore';
import { DEFAULT_PORTAL_PERMISSIONS } from '../data/clientContactsStore';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 40 }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={14} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </div>
        {children}
      </div>
    </div>
  );
}

export function InvitationAccept() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();

  const [snapshot] = useState(() => {
    if (!token) return null;
    const invitation = getInvitation(token);
    if (!invitation) return null;
    const client = findClient(invitation.clientId);
    if (!client) return null;
    const contact = getClientTeam(invitation.clientId).find(c => c.id === invitation.contactId);
    // A resolved invitation's contact may no longer exist in the live store
    // (declined invitations remove the contact) — only a still-pending
    // invitation needs the contact record to render (name, permissions).
    if (invitation.outcome === 'pending' && !contact) return null;
    return { invitation, client, contact };
  });

  const [outcome, setOutcome] = useState<'pending' | 'accepted' | 'declined'>(
    snapshot?.invitation.outcome ?? 'pending'
  );

  if (!snapshot) {
    return (
      <Shell>
        <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
          {t('invitation.invalidTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('invitation.invalidDesc')}
        </p>
        <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
          {t('invitation.backToLogin')}
        </Link>
      </Shell>
    );
  }

  const { invitation, client, contact } = snapshot;
  const studioName = localStorage.getItem(STUDIO_NAME_KEY) ?? 'StudioFlow Production';

  if (outcome === 'accepted') {
    return (
      <Shell>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <SFIcon name="check" size={28} color="var(--accent)" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
          {t('invitation.acceptedTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {t('invitation.acceptedDesc', { client: client.name })}
        </p>
      </Shell>
    );
  }

  if (outcome === 'declined') {
    return (
      <Shell>
        <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 24px' }}>
          <SFIcon name="x" size={28} color="var(--text-3)" />
        </div>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
          {t('invitation.declinedTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
          {t('invitation.declinedDesc')}
        </p>
      </Shell>
    );
  }

  if (!contact) {
    return (
      <Shell>
        <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
          {t('invitation.invalidTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('invitation.invalidDesc')}
        </p>
        <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
          {t('invitation.backToLogin')}
        </Link>
      </Shell>
    );
  }

  const perms = contact.portalPermissions ?? DEFAULT_PORTAL_PERMISSIONS;

  const accept = () => {
    setClientTeam(
      invitation.clientId,
      getClientTeam(invitation.clientId).map(m => (m.id === contact.id ? { ...m, status: 'active' as const } : m))
    );
    resolveInvitation(invitation.token, 'accepted');
    addNotif({
      kind: 'invitation',
      actor: contact.name,
      text: `a rejoint l'équipe de ${client.name}`,
      clientId: client.id,
      timestamp: Date.now(),
    });
    setOutcome('accepted');
  };

  const decline = () => {
    removeClientTeamMember(invitation.clientId, contact.id);
    resolveInvitation(invitation.token, 'declined');
    setOutcome('declined');
  };

  const permRows: { active: boolean; label: string }[] = [
    { active: perms.approve, label: t('invitation.permApprove') },
    { active: perms.comment, label: t('invitation.permComment') },
    { active: perms.download, label: t('invitation.permDownload') },
  ].filter(p => p.active);

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
        {t('invitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
        {t('invitation.pendingDesc', { contact: contact.name, client: client.name, studio: studioName })}
      </p>

      {permRows.length > 0 && (
        <div style={{ textAlign: 'left', background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 12, padding: '16px 18px', marginBottom: 28 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>
            {t('invitation.permissionsTitle')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {permRows.map(p => (
              <div key={p.label} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <SFIcon name="check" size={13} color="var(--ok)" />
                <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{p.label}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 10 }}>
        <button onClick={decline} style={{ flex: 1, padding: '13px', borderRadius: 11, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 14, fontWeight: 600, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
          {t('invitation.decline')}
        </button>
        <button onClick={accept} style={{ flex: 2, padding: '13px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
          {t('invitation.accept')}
        </button>
      </div>
    </Shell>
  );
}
