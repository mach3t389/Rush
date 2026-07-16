import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getInvitationDetails, acceptClientAccount, type InvitationDetails } from '../data/invitationStore';
import { registerClient, login, logout } from '../data/authStore';
import { supabase } from '../data/supabaseClient';
import { resetClientSessionCache } from '../data/clientSessionStore';

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 440 }}>
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

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '11px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)',
  outline: 'none',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-2)',
  display: 'block', marginBottom: 6, fontFamily: 'var(--ff-text)',
};

export function ClientInvitationAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadState, setLoadState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [invitation, setInvitation] = useState<InvitationDetails | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined);

  const [mode, setMode] = useState<'choose' | 'login' | 'register'>('choose');
  const [name, setName] = useState('');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!token) { setLoadState('invalid'); return; }
      const info = await getInvitationDetails(token);
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!info || info.outcome !== 'pending') { setLoadState('invalid'); return; }
      setInvitation(info);
      setSessionEmail(user?.email ?? null);
      setLoadState('ready');
    })();
    return () => { cancelled = true; };
  }, [token]);

  const acceptAsCurrentSession = async () => {
    setSubmitting(true);
    setError('');
    try {
      await acceptClientAccount(token);
      // The client-identity cache (clientSessionStore.ts) may have already
      // resolved "not a client" earlier in this tab's session — e.g. if this
      // same browser tab visited the studio AppShell first under the same
      // Supabase account before accepting this invitation. That stale
      // negative would otherwise persist and send this now-linked client
      // account back into the studio shell instead of /mon-espace.
      resetClientSessionCache();
      navigate('/mon-espace', { replace: true });
    } catch {
      setError(t('clientInvitation.joinFailed'));
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const result = await login(invitation!.contactEmail, password);
    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }
    await acceptAsCurrentSession();
  };

  const handleRegister = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!invitation) return;
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setSubmitting(true);
    setError('');

    const result = await registerClient({
      name,
      email: invitation.contactEmail,
      password,
    });

    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }

    try {
      await acceptClientAccount(token);
    } catch {
      setError(t('clientInvitation.joinFailed'));
      setSubmitting(false);
      return;
    }

    // See the matching comment in acceptAsCurrentSession above — the
    // client-identity cache may already hold a stale "not a client" result.
    resetClientSessionCache();
    navigate('/mon-espace', { replace: true });
  };

  if (loadState === 'loading' || sessionEmail === undefined) {
    return <Shell><p style={{ textAlign: 'center', color: 'var(--text-3)' }}>…</p></Shell>;
  }

  if (loadState === 'invalid') {
    return (
      <Shell>
        <div style={{ textAlign: 'center' }}>
          <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
          <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
            {t('clientInvitation.invalidTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
            {t('clientInvitation.invalidDesc')}
          </p>
          <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            {t('clientInvitation.backToLogin')}
          </Link>
        </div>
      </Shell>
    );
  }

  if (sessionEmail !== null) {
    const emailMatches = sessionEmail.toLowerCase() === invitation!.contactEmail.toLowerCase();

    if (!emailMatches) {
      return (
        <Shell>
          <div style={{ textAlign: 'center' }}>
            <SFIcon name="circle-alert" size={36} color="var(--danger)" />
            <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '18px 0 10px' }}>
              {t('clientInvitation.wrongAccountTitle')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
              {t('clientInvitation.wrongAccountDesc', { invited: invitation!.contactEmail, current: sessionEmail })}
            </p>
            <button
              onClick={async () => { await logout(); window.location.reload(); }}
              style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('clientInvitation.switchAccount')}
            </button>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('clientInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('clientInvitation.pendingDescLoggedIn', { studio: invitation!.studioName })}
        </p>
        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <SFIcon name="circle-alert" size={14} color="var(--danger)" />
            <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
          </div>
        )}
        <button
          onClick={acceptAsCurrentSession}
          disabled={submitting}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: submitting ? 'var(--surface-3)' : 'var(--accent)',
            color: submitting ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '…' : t('clientInvitation.joinButton')}
        </button>
      </Shell>
    );
  }

  if (mode === 'choose') {
    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('clientInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('clientInvitation.pendingDesc', { studio: invitation!.studioName })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => setMode('login')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('clientInvitation.haveAccount')}
          </button>
          <button
            onClick={() => setMode('register')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('clientInvitation.createAccount')}
          </button>
        </div>
      </Shell>
    );
  }

  if (mode === 'login') {
    return (
      <Shell>
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 20, textAlign: 'center' }}>
          {t('auth.loginTitle')}
        </h1>
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('auth.email')}</label>
            <input value={invitation!.contactEmail} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>{t('auth.password')}</label>
            <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="current-password" style={inputStyle} />
          </div>
          {error && (
            <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SFIcon name="circle-alert" size={14} color="var(--danger)" />
              <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
            </div>
          )}
          <button
            type="submit"
            disabled={submitting || !password.trim()}
            style={{
              width: '100%', padding: '13px', borderRadius: 11, border: 'none',
              background: submitting || !password.trim() ? 'var(--surface-3)' : 'var(--accent)',
              color: submitting || !password.trim() ? 'var(--text-3)' : 'var(--on-accent)',
              fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            }}
          >
            {submitting ? '…' : t('clientInvitation.joinButton')}
          </button>
        </form>
      </Shell>
    );
  }

  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
        {t('clientInvitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
        {t('clientInvitation.pendingDesc', { studio: invitation!.studioName })}
      </p>

      <form onSubmit={handleRegister}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.fullName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('auth.fullNamePlaceholder')} autoComplete="name" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.email')}</label>
          <input value={invitation!.contactEmail} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.password')}</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.confirmPassword')}</label>
          <input type="password" value={confirm} onChange={e => setConfirm(e.target.value)} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" style={inputStyle} />
        </div>

        {error && (
          <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
            <SFIcon name="circle-alert" size={14} color="var(--danger)" />
            <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
          </div>
        )}

        <button
          type="submit"
          disabled={submitting || !name.trim() || !password.trim() || !confirm.trim()}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: submitting || !name.trim() ? 'var(--surface-3)' : 'var(--accent)',
            color: submitting || !name.trim() ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
            cursor: submitting ? 'not-allowed' : 'pointer',
          }}
        >
          {submitting ? '…' : t('clientInvitation.joinButton')}
        </button>
      </form>
    </Shell>
  );
}
