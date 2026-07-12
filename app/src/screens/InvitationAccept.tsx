import { useParams, Link } from 'react-router-dom';
import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getInvitationDetails, acceptInvitation, declineInvitation, type InvitationDetails } from '../data/invitationStore';
import { isDemoSession } from '../data/authStore';
import { addNotif } from '../data/notificationStore';

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

function InvalidCard({ t }: { t: (k: string) => string }) {
  return (
    <>
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
    </>
  );
}

export function InvitationAccept() {
  const { token } = useParams<{ token: string }>();
  const { t } = useTranslation();

  // The invited contact opens this route fully unauthenticated, often on a
  // device that never had the studio's own browser storage — the details
  // must be fetched live (from Supabase for real sessions), not read
  // synchronously from local state.
  const [details, setDetails] = useState<InvitationDetails | null | undefined>(() => (token ? undefined : null));

  useEffect(() => {
    if (!token) return;
    let cancelled = false;
    void getInvitationDetails(token).then(d => { if (!cancelled) setDetails(d); });
    return () => { cancelled = true; };
  }, [token]);

  if (details === undefined) return <Shell><SFIcon name="loader" size={32} color="var(--text-3)" /></Shell>;
  if (!details || !token) return <Shell><InvalidCard t={t} /></Shell>;

  const { outcome, clientId, clientName, contactId, contactName, portalPermissions, studioName } = details;

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
          {t('invitation.acceptedDesc', { client: clientName })}
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

  const accept = () => {
    void acceptInvitation(clientId, contactId, token).then(() => {
      // Real sessions: skipped — the anonymous invitee has no studio
      // session, and addNotif's Supabase path requires one (getStudioId()).
      // The studio still sees the contact's status flip to "active" live
      // via clientTeamStore; only the activity-feed toast is skipped.
      if (isDemoSession()) {
        addNotif({ kind: 'invitation', actor: contactName, text: `a rejoint l'équipe de ${clientName}`, clientId, timestamp: Date.now() });
      }
      setDetails(d => (d ? { ...d, outcome: 'accepted' } : d));
    });
  };

  const decline = () => {
    void declineInvitation(clientId, contactId, token).then(() => {
      setDetails(d => (d ? { ...d, outcome: 'declined' } : d));
    });
  };

  const permRows: { active: boolean; label: string }[] = [
    { active: portalPermissions.approve, label: t('invitation.permApprove') },
    { active: portalPermissions.comment, label: t('invitation.permComment') },
    { active: portalPermissions.download, label: t('invitation.permDownload') },
  ].filter(p => p.active);

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
        {t('invitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
        {t('invitation.pendingDesc', { contact: contactName, client: clientName, studio: studioName })}
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
