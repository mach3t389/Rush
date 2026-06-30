import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';

export function ForgotPassword() {
  const { t } = useTranslation();
  const [email, setEmail] = useState('');
  const [sent, setSent]   = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!email.trim()) return;
    setLoading(true);
    setTimeout(() => { setSent(true); setLoading(false); }, 600);
  };

  return (
    <div style={{
      minHeight: '100vh', background: 'var(--bg)',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '32px',
    }}>
      <div style={{ width: '100%', maxWidth: 400 }}>

        {/* Logo */}
        <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', marginBottom: 48, width: 'fit-content' }}>
          <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={14} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </Link>

        {sent ? (
          /* ── Success state ─────────────────────────────────────────────── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <SFIcon name="mail-check" size={28} color="var(--accent)" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
              {t('auth.resetEmailSent')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 12 }}>
              {t('auth.resetEmailSentDesc')}
            </p>
            <p style={{ fontSize: 12, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginBottom: 32, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 8, padding: '8px 14px', display: 'inline-block' }}>
              {email}
            </p>
            <br />
            <Link to="/login" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              {t('auth.backToLogin')}
            </Link>
          </div>
        ) : (
          /* ── Form ─────────────────────────────────────────────────────── */
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 8, letterSpacing: '-0.5px' }}>
              {t('auth.forgotTitle')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 36 }}>
              {t('auth.forgotSubtitle')}
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                  {t('auth.email')}
                </label>
                <input
                  type="email" value={email} autoFocus
                  onChange={e => setEmail(e.target.value)}
                  placeholder={t('auth.emailPlaceholder')}
                  style={{
                    width: '100%', boxSizing: 'border-box',
                    padding: '11px 14px', borderRadius: 10,
                    border: '1px solid var(--border)', background: 'var(--surface-2)',
                    color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)', outline: 'none',
                  }}
                  onFocus={e => (e.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                  onBlur={e => (e.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                />
              </div>

              <button
                type="submit" disabled={loading || !email.trim()}
                style={{
                  width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                  background: loading || !email.trim() ? 'var(--surface-3)' : 'var(--accent)',
                  color: loading || !email.trim() ? 'var(--text-3)' : 'var(--on-accent)',
                  fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
                  cursor: loading || !email.trim() ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s', marginBottom: 24,
                }}
              >
                {loading ? '…' : t('auth.sendResetButton')}
              </button>
            </form>

            <Link to="/login" style={{ fontSize: 13, color: 'var(--text-3)', textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 4 }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--text)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
              {t('auth.backToLogin')}
            </Link>
          </>
        )}
      </div>
    </div>
  );
}
