import { useEffect, useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getInvitationByToken, acceptInvitation, type TeamInvitationInfo } from '../data/teamStore';
import { register, login, logout } from '../data/authStore';
import { supabase } from '../data/supabaseClient';

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

export function TeamInvitationAccept() {
  const { token = '' } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { t } = useTranslation();

  const [loadState, setLoadState] = useState<'loading' | 'invalid' | 'ready'>('loading');
  const [invitation, setInvitation] = useState<TeamInvitationInfo | null>(null);
  const [sessionEmail, setSessionEmail] = useState<string | null | undefined>(undefined); // undefined = not checked yet

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
      const info = await getInvitationByToken(token);
      const { data: { user } } = await supabase.auth.getUser();
      if (cancelled) return;
      if (!info || info.status !== 'pending') { setLoadState('invalid'); return; }
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
      await acceptInvitation(token);
      navigate('/', { replace: true });
    } catch {
      setError(t('teamInvitation.joinFailed'));
      setSubmitting(false);
    }
  };

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setSubmitting(true);
    setError('');
    const result = await login(invitation!.email, password);
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

    const result = await register({
      studioName: invitation.studioName,
      name,
      email: invitation.email,
      password,
    });

    if (!result.ok) {
      setError(t(result.error!));
      setSubmitting(false);
      return;
    }

    try {
      await acceptInvitation(token);
    } catch {
      // Account was created but studio membership wasn't recorded — do NOT
      // navigate into the app, or the next store call would create them a
      // brand-new empty studio instead of joining this one.
      setError(t('teamInvitation.joinFailed'));
      setSubmitting(false);
      return;
    }

    navigate('/', { replace: true });
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
            {t('teamInvitation.invalidTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
            {t('teamInvitation.invalidDesc')}
          </p>
          <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
            {t('teamInvitation.backToLogin')}
          </Link>
        </div>
      </Shell>
    );
  }

  // Already logged in.
  if (sessionEmail !== null) {
    const emailMatches = sessionEmail.toLowerCase() === invitation!.email.toLowerCase();

    if (!emailMatches) {
      return (
        <Shell>
          <div style={{ textAlign: 'center' }}>
            <SFIcon name="circle-alert" size={36} color="var(--danger)" />
            <h1 style={{ fontSize: 20, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '18px 0 10px' }}>
              {t('teamInvitation.wrongAccountTitle')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
              {t('teamInvitation.wrongAccountDesc', { invited: invitation!.email, current: sessionEmail })}
            </p>
            <button
              onClick={async () => { await logout(); window.location.reload(); }}
              style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
            >
              {t('teamInvitation.switchAccount')}
            </button>
          </div>
        </Shell>
      );
    }

    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('teamInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('teamInvitation.pendingDesc', { studio: invitation!.studioName, role: invitation!.role })}
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
          {submitting ? '…' : t('teamInvitation.joinButton')}
        </button>
      </Shell>
    );
  }

  // Not logged in — choose login or register, then choice-specific form.
  if (mode === 'choose') {
    return (
      <Shell>
        <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
          {t('teamInvitation.pendingTitle')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
          {t('teamInvitation.pendingDesc', { studio: invitation!.studioName, role: invitation!.role })}
        </p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          <button
            onClick={() => setMode('login')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('teamInvitation.haveAccount')}
          </button>
          <button
            onClick={() => setMode('register')}
            style={{ width: '100%', padding: '13px', borderRadius: 11, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text)', fontSize: 14, fontWeight: 700, cursor: 'pointer' }}
          >
            {t('teamInvitation.createAccount')}
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
            <input value={invitation!.email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
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
            {submitting ? '…' : t('teamInvitation.joinButton')}
          </button>
        </form>
      </Shell>
    );
  }

  // mode === 'register' — identical to the original always-register flow.
  return (
    <Shell>
      <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 6, textAlign: 'center', letterSpacing: '-0.4px' }}>
        {t('teamInvitation.pendingTitle')}
      </h1>
      <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 28, textAlign: 'center' }}>
        {t('teamInvitation.pendingDesc', { studio: invitation!.studioName, role: invitation!.role })}
      </p>

      <form onSubmit={handleRegister}>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.fullName')}</label>
          <input value={name} onChange={e => setName(e.target.value)} placeholder={t('auth.fullNamePlaceholder')} autoComplete="name" style={inputStyle} />
        </div>
        <div style={{ marginBottom: 14 }}>
          <label style={labelStyle}>{t('auth.email')}</label>
          <input value={invitation!.email} disabled style={{ ...inputStyle, opacity: 0.6, cursor: 'not-allowed' }} />
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
          {submitting ? '…' : t('teamInvitation.joinButton')}
        </button>
      </form>
    </Shell>
  );
}
