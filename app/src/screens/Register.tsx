import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { register } from '../data/authStore';

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

export function Register() {
  const { t } = useTranslation();
  const navigate = useNavigate();

  const [studioName, setStudioName] = useState('');
  const [name, setName]             = useState('');
  const [email, setEmail]           = useState('');
  const [password, setPassword]     = useState('');
  const [confirm, setConfirm]       = useState('');
  const [showPw, setShowPw]         = useState(false);
  const [error, setError]           = useState('');
  const [loading, setLoading]       = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password !== confirm) { setError(t('auth.passwordMismatch')); return; }
    setLoading(true);
    setError('');
    setTimeout(() => {
      const result = register({ studioName, name, email, password });
      if (result.ok) {
        navigate('/onboarding', { replace: true });
      } else {
        setError(t(result.error!));
        setLoading(false);
      }
    }, 400);
  };

  const isValid = studioName.trim() && name.trim() && email.trim() && password.trim() && confirm.trim();

  const Field = ({
    label, value, onChange, type = 'text', placeholder, autoComplete, extra,
  }: {
    label: string; value: string; onChange: (v: string) => void;
    type?: string; placeholder: string; autoComplete?: string; extra?: React.ReactNode;
  }) => (
    <div style={{ marginBottom: 14 }}>
      <label style={labelStyle}>{label}</label>
      <div style={{ position: 'relative' }}>
        <input
          type={type} value={value} placeholder={placeholder}
          autoComplete={autoComplete}
          onChange={e => onChange(e.target.value)}
          style={inputStyle}
          onFocus={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
          onBlur={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--border)'}
        />
        {extra}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', height: '100vh', background: 'var(--bg)', overflow: 'hidden' }}>

      {/* ── Left panel ────────────────────────────────────────────────────── */}
      <div style={{
        width: '42%', minWidth: 320, flexShrink: 0,
        background: '#0b0b0b', borderRight: '1px solid var(--border)',
        display: 'flex', flexDirection: 'column', justifyContent: 'center',
        padding: '48px 52px', gap: 40,
      }}>
        {/* Logo */}
        <Link to="/login" style={{ display: 'flex', alignItems: 'center', gap: 10, textDecoration: 'none', width: 'fit-content' }}>
          <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="play" size={16} color="#0b0b0b" />
          </div>
          <span style={{ fontSize: 20, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
        </Link>

        <div>
          <p style={{ fontSize: 24, fontWeight: 700, lineHeight: 1.35, color: 'var(--text)', fontFamily: 'var(--ff-display)', marginBottom: 20, letterSpacing: '-0.4px' }}>
            {t('auth.registerSubtitle')}
          </p>

          {/* Feature list */}
          {[
            { icon: 'folder-kanban', label: 'Projets & clients' },
            { icon: 'files',         label: 'Gestion des fichiers' },
            { icon: 'globe',         label: 'Portail client intégré' },
            { icon: 'sparkles',      label: 'Assistant IA' },
          ].map(f => (
            <div key={f.icon} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 12 }}>
              <div style={{
                width: 28, height: 28, borderRadius: 7,
                background: 'rgba(249,255,0,0.08)', border: '1px solid rgba(249,255,0,0.15)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0,
              }}>
                <SFIcon name={f.icon} size={13} color="var(--accent)" />
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}>{f.label}</span>
            </div>
          ))}
        </div>
      </div>

      {/* ── Right panel — form ────────────────────────────────────────────── */}
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '32px', overflowY: 'auto' }}>
        <div style={{ width: '100%', maxWidth: 420 }}>

          <h1 style={{ fontSize: 26, fontWeight: 800, letterSpacing: '-0.5px', fontFamily: 'var(--ff-display)', marginBottom: 6 }}>
            {t('auth.registerTitle')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 32 }}>
            {t('auth.registerSubtitle')}
          </p>

          <form onSubmit={handleSubmit}>

            <Field label={t('auth.studioName')} value={studioName} onChange={setStudioName}
              placeholder={t('auth.studioNamePlaceholder')} autoComplete="organization" />
            <Field label={t('auth.fullName')} value={name} onChange={setName}
              placeholder={t('auth.fullNamePlaceholder')} autoComplete="name" />
            <Field label={t('auth.email')} value={email} onChange={setEmail}
              type="email" placeholder={t('auth.emailPlaceholder')} autoComplete="email" />

            {/* Password with show/hide */}
            <div style={{ marginBottom: 14 }}>
              <label style={labelStyle}>{t('auth.password')}</label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder={t('auth.passwordPlaceholder')}
                  autoComplete="new-password"
                  style={{ ...inputStyle, paddingRight: 56 }}
                  onFocus={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                  onBlur={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--border)'}
                />
                <button type="button" onClick={() => setShowPw(p => !p)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-mono)', padding: '2px 4px' }}>
                  {showPw ? t('auth.hidePassword') : t('auth.showPassword')}
                </button>
              </div>
            </div>

            <Field label={t('auth.confirmPassword')} value={confirm} onChange={setConfirm}
              type={showPw ? 'text' : 'password'} placeholder={t('auth.passwordPlaceholder')} autoComplete="new-password" />

            {/* Error */}
            {error && (
              <div style={{ padding: '10px 14px', borderRadius: 9, marginBottom: 16, background: 'rgba(255,80,80,0.1)', border: '1px solid rgba(255,80,80,0.25)', display: 'flex', alignItems: 'center', gap: 8 }}>
                <SFIcon name="alert-circle" size={14} color="var(--danger)" />
                <span style={{ fontSize: 12, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>{error}</span>
              </div>
            )}

            <button
              type="submit" disabled={loading || !isValid}
              style={{
                width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                background: loading || !isValid ? 'var(--surface-3)' : 'var(--accent)',
                color: loading || !isValid ? 'var(--text-3)' : 'var(--on-accent)',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
                cursor: loading || !isValid ? 'not-allowed' : 'pointer',
                transition: 'all 0.15s', marginTop: 8,
              }}
            >
              {loading ? '…' : t('auth.registerButton')}
            </button>
          </form>

          <p style={{ textAlign: 'center', fontSize: 13, color: 'var(--text-3)', marginTop: 28 }}>
            {t('auth.alreadyAccount')}{' '}
            <Link to="/login" style={{ color: 'var(--accent)', fontWeight: 600, textDecoration: 'none' }}>
              {t('auth.signIn')}
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
