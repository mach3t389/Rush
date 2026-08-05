import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { updatePassword } from '../data/authStore';
import { supabase } from '../data/supabaseClient';

// Reached via the "Reset password" email link (see resetPassword()'s
// redirectTo in authStore.ts). Supabase-js auto-detects the recovery token
// in the URL and turns it into a real session before this component mounts
// — without a screen like this one to actually call updateUser(), that
// session just logs the user into the app with their OLD password still
// active (the exact bug this screen exists to fix).
export function ResetPassword() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [checking, setChecking] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [done, setDone] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    let cancelled = false;
    supabase.auth.getSession().then(({ data: { session } }) => {
      if (cancelled) return;
      setHasSession(!!session);
      setChecking(false);
    });
    return () => { cancelled = true; };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setSubmitting(true);
    setError('');
    const result = await updatePassword(password);
    if (result.ok) {
      setDone(true);
      setTimeout(() => navigate('/', { replace: true }), 1500);
    } else {
      setError(t(result.error!));
      setSubmitting(false);
    }
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)', outline: 'none',
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
          <img src="/favicon.svg" alt="Rushflow" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rushflow</span>
        </Link>

        {checking ? (
          <p style={{ textAlign: 'center', color: 'var(--text-3)' }}>…</p>
        ) : !hasSession ? (
          /* ── Invalid/expired link ────────────────────────────────────── */
          <div style={{ textAlign: 'center' }}>
            <SFIcon name="link-2-off" size={40} color="var(--text-3)" />
            <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '20px 0 10px' }}>
              {t('auth.resetLinkInvalidTitle')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
              {t('auth.resetLinkInvalidDesc')}
            </p>
            <Link to="/forgot-password" style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              {t('auth.forgotTitle')}
            </Link>
          </div>
        ) : done ? (
          /* ── Success state ───────────────────────────────────────────── */
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 64, height: 64, borderRadius: '50%',
              background: 'rgba(249,255,0,0.1)', border: '1px solid rgba(249,255,0,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <SFIcon name="check" size={28} color="var(--accent)" />
            </div>
            <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
              {t('auth.passwordUpdated')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6 }}>
              {t('auth.passwordUpdatedDesc')}
            </p>
          </div>
        ) : (
          /* ── Form ─────────────────────────────────────────────────────── */
          <>
            <h1 style={{ fontSize: 26, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 8, letterSpacing: '-0.5px' }}>
              {t('auth.resetPasswordTitle')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 36 }}>
              {t('auth.resetPasswordSubtitle')}
            </p>

            <form onSubmit={handleSubmit}>
              <div style={{ marginBottom: 16 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                  {t('auth.newPassword')}
                </label>
                <input
                  type="password" value={password} autoFocus autoComplete="new-password"
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  style={inputStyle}
                />
              </div>

              <div style={{ marginBottom: 24 }}>
                <label style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-2)', display: 'block', marginBottom: 6 }}>
                  {t('auth.confirmPassword')}
                </label>
                <input
                  type="password" value={confirm} autoComplete="new-password"
                  onChange={e => setConfirm(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  style={inputStyle}
                />
              </div>

              {error && (
                <div style={{
                  padding: '10px 14px', borderRadius: 9, marginBottom: 16,
                  background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)',
                  display: 'flex', alignItems: 'center', gap: 8,
                }}>
                  <SFIcon name="circle-alert" size={14} color="var(--danger)" />
                  <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
                </div>
              )}

              <button
                type="submit" disabled={submitting || !password.trim() || !confirm.trim()}
                style={{
                  width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                  background: submitting || !password.trim() || !confirm.trim() ? 'var(--surface-3)' : 'var(--accent)',
                  color: submitting || !password.trim() || !confirm.trim() ? 'var(--text-3)' : 'var(--on-accent)',
                  fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
                  cursor: submitting ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s',
                }}
              >
                {submitting ? '…' : t('auth.resetPasswordButton')}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
