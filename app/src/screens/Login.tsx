import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { login, DEMO_ACCOUNTS } from '../data/authStore';

const inputStyle: React.CSSProperties = {
  width: '100%', boxSizing: 'border-box',
  padding: '11px 14px', borderRadius: 10,
  border: '1px solid var(--border)', background: 'var(--surface-2)',
  color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)',
  outline: 'none', transition: 'border-color 0.15s',
};

const labelStyle: React.CSSProperties = {
  fontSize: 11, fontWeight: 600, color: 'var(--text-2)',
  display: 'block', marginBottom: 6, fontFamily: 'var(--ff-text)',
};

export function Login() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [email, setEmail]       = useState('');
  const [password, setPassword] = useState('');
  const [showPw, setShowPw]     = useState(false);
  const [error, setError]       = useState('');
  const [loading, setLoading]   = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');
    setTimeout(() => {
      const result = login(email, password);
      if (result.ok) {
        navigate('/', { replace: true });
      } else {
        setError(t(result.error!));
        setLoading(false);
      }
    }, 400);
  };

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Left panel — branding ─────────────────────────────────────────── */}
      <div style={{
        width: '42%', minWidth: 340, flexShrink: 0,
        background: '#0b0b0b',
        borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column',
        justifyContent: 'space-between',
        padding: '48px 52px',
      }}>
        {/* Logo */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{
            width: 36, height: 36, borderRadius: 10,
            background: 'var(--accent)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}>
            <SFIcon name="play" size={16} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>
            Rush
          </span>
        </div>

        {/* Tagline */}
        <div>
          <p style={{ fontSize: 28, fontWeight: 700, lineHeight: 1.3, color: 'var(--text)', fontFamily: 'var(--ff-display)', marginBottom: 16, letterSpacing: '-0.5px' }}>
            {t('auth.tagline')}
          </p>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {['Projets', 'Clients', 'Fichiers', 'Portail'].map(tag => (
              <span key={tag} style={{
                fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 6, padding: '3px 9px', letterSpacing: '0.04em',
              }}>{tag}</span>
            ))}
          </div>
        </div>

        {/* Demo accounts */}
        <div>
          <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 10 }}>
            {t('auth.demoAccounts')} · {t('auth.demoHint')}
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {DEMO_ACCOUNTS.map(acc => (
              <button
                key={acc.email}
                onClick={() => { setEmail(acc.email); setPassword('demo'); setError(''); }}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 12px', borderRadius: 9, cursor: 'pointer',
                  background: email === acc.email ? 'rgba(249,255,0,0.08)' : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${email === acc.email ? 'rgba(249,255,0,0.3)' : 'rgba(255,255,255,0.07)'}`,
                  transition: 'all 0.15s', textAlign: 'left',
                }}
                onMouseEnter={e => { if (email !== acc.email) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { if (email !== acc.email) (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.03)'; }}
              >
                <div style={{
                  width: 30, height: 30, borderRadius: '50%', background: acc.color,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0,
                }}>
                  {acc.initials}
                </div>
                <div>
                  <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', margin: 0 }}>{acc.name}</p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--ff-mono)' }}>{acc.role}</p>
                </div>
              </button>
            ))}
          </div>

          {/* Pricing link */}
          <Link to="/pricing" style={{
            display: 'inline-flex', alignItems: 'center', gap: 5, marginTop: 16,
            fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'rgba(255,255,255,0.3)',
            textDecoration: 'none', letterSpacing: '0.04em', transition: 'color 0.15s',
          }}
            onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--accent)'}
            onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.3)'}>
            {t('pricing.openPricing')} →
          </Link>
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div style={{
        flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: '40px 32px', overflowY: 'auto',
      }}>
        <div style={{ width: '100%', maxWidth: 400 }}>

          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', fontFamily: 'var(--ff-display)', marginBottom: 6 }}>
            {t('auth.loginTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 36 }}>
            {t('auth.loginSubtitle')}
          </p>

          <form onSubmit={handleSubmit}>

            {/* Email */}
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t('auth.email')}</label>
              <input
                type="email" value={email} autoFocus autoComplete="email"
                onChange={e => setEmail(e.target.value)}
                placeholder={t('auth.emailPlaceholder')}
                style={inputStyle}
                onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
              />
            </div>

            {/* Password */}
            <div style={{ marginBottom: 10 }}>
              <label style={labelStyle}>{t('auth.password')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete="current-password"
                  style={{ ...inputStyle, paddingRight: 56 }}
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                />
                <button
                  type="button" onClick={() => setShowPw(p => !p)}
                  style={{
                    position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
                    background: 'none', border: 'none', cursor: 'pointer',
                    color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-mono)', padding: '2px 4px',
                  }}
                >
                  {showPw ? t('auth.hidePassword') : t('auth.showPassword')}
                </button>
              </div>
            </div>

            {/* Forgot password */}
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 24 }}>
              <Link to="/forgot-password" style={{ fontSize: 12, color: 'var(--text-3)', textDecoration: 'none' }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                {t('auth.forgotPasswordLink')}
              </Link>
            </div>

            {/* Error */}
            {error && (
              <div style={{
                padding: '10px 14px', borderRadius: 9, marginBottom: 16,
                background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}>
                <SFIcon name="alert-circle" size={14} color="var(--danger)" />
                <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
              </div>
            )}

            {/* Submit */}
            <button
              type="submit"
              disabled={loading || !email.trim() || !password.trim()}
              style={{
                width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                background: loading || !email.trim() || !password.trim() ? 'var(--surface-3)' : 'var(--accent)',
                color: loading || !email.trim() || !password.trim() ? 'var(--text-3)' : 'var(--on-accent)',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
                cursor: loading || !email.trim() || !password.trim() ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {loading ? '…' : t('auth.loginButton')}
            </button>
          </form>

          {/* Divider */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, margin: '28px 0' }}>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
            <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>ou</span>
            <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
          </div>

          {/* Sign up link */}
          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)' }}>
            {t('auth.noAccount')}{' '}
            <Link to="/register" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              {t('auth.signUp')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
