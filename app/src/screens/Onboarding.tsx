import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getCurrentUser } from '../data/authStore';
import { getLogoFull, setLogoFull, getLogoSquare, setLogoSquare } from '../data/studioLogoStore';
import { updateStudioInfo } from '../data/studioStore';

// ── Step progress bar ─────────────────────────────────────────────────────────

function StepBar({ current, total }: { current: number; total: number }) {
  return (
    <div style={{ display: 'flex', gap: 6 }}>
      {Array.from({ length: total }, (_, i) => (
        <div key={i} style={{
          flex: 1, height: 3, borderRadius: 2,
          background: i < current ? 'var(--accent)' : i === current ? 'rgba(249,255,0,0.35)' : 'var(--border)',
          transition: 'background 0.3s',
        }} />
      ))}
    </div>
  );
}

// ── Logo upload widget ────────────────────────────────────────────────────────

function LogoUpload({
  label, desc, getter, setter, size,
}: { label: string; desc: string; getter: () => string | null; setter: (v: string | null) => void; size: [number, number] }) {
  const { t } = useTranslation();
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(() => getter());

  const handleFile = (file: File) => {
    const reader = new FileReader();
    reader.onload = ev => {
      const data = ev.target?.result as string;
      setPreview(data);
      setter(data);
    };
    reader.readAsDataURL(file);
  };

  return (
    <div style={{ marginBottom: 20 }}>
      <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 4, color: 'var(--text)' }}>{label}</p>
      <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 10, fontFamily: 'var(--ff-mono)' }}>{desc}</p>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={e => { e.preventDefault(); (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; }}
        onDragLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
        onDrop={e => {
          e.preventDefault();
          (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)';
          const file = e.dataTransfer.files[0];
          if (file) handleFile(file);
        }}
        style={{
          width: size[0], maxWidth: '100%', height: size[1],
          border: '1.5px dashed var(--border-2)', borderRadius: 12,
          background: 'var(--surface-2)', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          overflow: 'hidden', transition: 'border-color 0.15s',
          position: 'relative',
        }}
      >
        {preview ? (
          <>
            <img src={preview} alt={label} style={{ maxWidth: '90%', maxHeight: '80%', objectFit: 'contain' }} />
            <button
              onClick={e => { e.stopPropagation(); setPreview(null); setter(null); }}
              style={{
                position: 'absolute', top: 6, right: 6, width: 22, height: 22, borderRadius: '50%',
                background: 'rgba(0,0,0,0.6)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}
            >
              <SFIcon name="x" size={11} color="#fff" />
            </button>
          </>
        ) : (
          <div style={{ textAlign: 'center' }}>
            <SFIcon name="image-plus" size={22} color="var(--text-3)" />
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 6, fontFamily: 'var(--ff-mono)' }}>{t('onboarding.logoClick')}</p>
            <p style={{ fontSize: 10, color: 'var(--border-2)', marginTop: 2, fontFamily: 'var(--ff-mono)' }}>{t('onboarding.logoFormats')}</p>
          </div>
        )}
      </div>
      <input ref={inputRef} type="file" accept="image/*" style={{ display: 'none' }}
        onChange={e => { const f = e.target.files?.[0]; if (f) handleFile(f); }} />
    </div>
  );
}

// ── Main onboarding component ─────────────────────────────────────────────────

export function Onboarding() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const user = getCurrentUser();

  const TOTAL = 4;
  const [step, setStep] = useState(0);

  // Step 1 state
  const [studioName, setStudioName] = useState(user?.studioName ?? '');
  const [sector, setSector]         = useState('');
  const [website, setWebsite]       = useState('');

  // Step 3 state — invite list
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteRole, setInviteRole]   = useState('');
  const [invites, setInvites]         = useState<{ email: string; role: string }[]>([]);

  const addInvite = () => {
    if (!inviteEmail.trim()) return;
    setInvites(prev => [...prev, { email: inviteEmail.trim(), role: inviteRole.trim() }]);
    setInviteEmail('');
    setInviteRole('');
  };

  const saveStep1 = () => {
    updateStudioInfo({
      ...(studioName.trim() ? { name: studioName.trim() } : {}),
      sector: sector.trim(),
      website: website.trim(),
    });
  };

  const next = () => {
    if (step === 0) saveStep1();
    if (step < TOTAL - 1) setStep(s => s + 1);
  };

  const finish = () => {
    saveStep1();
    navigate('/', { replace: true });
  };

  const inputStyle: React.CSSProperties = {
    width: '100%', boxSizing: 'border-box',
    padding: '11px 14px', borderRadius: 10,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 14, fontFamily: 'var(--ff-text)', outline: 'none',
  };

  const labelStyle: React.CSSProperties = {
    fontSize: 11, fontWeight: 600, color: 'var(--text-2)',
    display: 'block', marginBottom: 6, fontFamily: 'var(--ff-text)',
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '40px 24px' }}>

      {/* Logo */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 48 }}>
        <img src="/favicon.svg" alt="Rush" style={{ width: 32, height: 32 }} />
        <span style={{ fontSize: 18, fontWeight: 800, letterSpacing: '-0.5px', color: 'var(--text)', fontFamily: 'var(--ff-display)' }}>Rush</span>
      </div>

      {/* Card */}
      <div style={{ width: '100%', maxWidth: 540, background: 'var(--surface)', borderRadius: 18, border: '1px solid var(--border)', padding: '36px 40px', boxShadow: '0 24px 60px rgba(0,0,0,0.4)' }}>

        {/* Progress */}
        <div style={{ marginBottom: 32 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 }}>
            <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
              {t('onboarding.stepOf', { current: step + 1, total: TOTAL })}
            </span>
            {step < 2 && (
              <button onClick={() => setStep(s => s + 1)} style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                {t('onboarding.skip')} →
              </button>
            )}
          </div>
          <StepBar current={step} total={TOTAL} />
        </div>

        {/* ── Step 0 : Studio info ──────────────────────────────────────── */}
        {step === 0 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 8, letterSpacing: '-0.4px' }}>
              {t('onboarding.step1Title')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 28, lineHeight: 1.6 }}>
              {t('onboarding.step1Desc')}
            </p>

            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t('onboarding.studioName')}</label>
              <input autoFocus value={studioName} onChange={e => setStudioName(e.target.value)}
                placeholder={t('onboarding.studioNamePlaceholder')} style={inputStyle}
                onFocus={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                onBlur={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--border)'} />
            </div>
            <div style={{ marginBottom: 16 }}>
              <label style={labelStyle}>{t('onboarding.sector')}</label>
              <input value={sector} onChange={e => setSector(e.target.value)}
                placeholder={t('onboarding.sectorPlaceholder')} style={inputStyle}
                onFocus={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                onBlur={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--border)'} />
            </div>
            <div style={{ marginBottom: 0 }}>
              <label style={labelStyle}>{t('onboarding.website')}</label>
              <input value={website} onChange={e => setWebsite(e.target.value)}
                placeholder={t('onboarding.websitePlaceholder')} type="url" style={inputStyle}
                onFocus={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                onBlur={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--border)'} />
            </div>
          </div>
        )}

        {/* ── Step 1 : Logos ────────────────────────────────────────────── */}
        {step === 1 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 8, letterSpacing: '-0.4px' }}>
              {t('onboarding.step2Title')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 28, lineHeight: 1.6 }}>
              {t('onboarding.step2Desc')}
            </p>
            <LogoUpload label={t('onboarding.logoFull')} desc={t('onboarding.logoFullDesc')} getter={getLogoFull} setter={setLogoFull} size={[320, 100]} />
            <LogoUpload label={t('onboarding.logoSquare')} desc={t('onboarding.logoSquareDesc')} getter={getLogoSquare} setter={setLogoSquare} size={[100, 100]} />
          </div>
        )}

        {/* ── Step 2 : Invite team ──────────────────────────────────────── */}
        {step === 2 && (
          <div>
            <h2 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 8, letterSpacing: '-0.4px' }}>
              {t('onboarding.step3Title')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 28, lineHeight: 1.6 }}>
              {t('onboarding.step3Desc')}
            </p>

            {/* Invite form */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
              <div style={{ flex: 1 }}>
                <input value={inviteEmail} onChange={e => setInviteEmail(e.target.value)}
                  placeholder={t('onboarding.inviteEmailPlaceholder')} type="email"
                  style={{ ...inputStyle, fontSize: 12 }}
                  onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); addInvite(); } }}
                  onFocus={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                  onBlur={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--border)'} />
              </div>
              <div style={{ width: 130 }}>
                <input value={inviteRole} onChange={e => setInviteRole(e.target.value)}
                  placeholder={t('onboarding.inviteRolePlaceholder')}
                  style={{ ...inputStyle, fontSize: 12 }}
                  onFocus={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--accent)'}
                  onBlur={ev => (ev.target as HTMLInputElement).style.borderColor = 'var(--border)'} />
              </div>
              <button onClick={addInvite} disabled={!inviteEmail.trim()}
                style={{
                  padding: '0 16px', height: 42, borderRadius: 10, border: 'none',
                  background: !inviteEmail.trim() ? 'var(--surface-3)' : 'var(--accent)',
                  color: !inviteEmail.trim() ? 'var(--text-3)' : 'var(--on-accent)',
                  fontSize: 13, fontWeight: 600, cursor: !inviteEmail.trim() ? 'not-allowed' : 'pointer',
                  flexShrink: 0,
                }}>
                {t('onboarding.inviteAdd')}
              </button>
            </div>

            {/* Invite list */}
            {invites.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                {invites.map((inv, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', marginBottom: 6 }}>
                    <SFIcon name="mail" size={13} color="var(--text-3)" />
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 12, color: 'var(--text)', margin: 0 }}>{inv.email}</p>
                      {inv.role && <p style={{ fontSize: 10, color: 'var(--text-3)', margin: 0, fontFamily: 'var(--ff-mono)' }}>{inv.role}</p>}
                    </div>
                    <button onClick={() => setInvites(prev => prev.filter((_, j) => j !== i))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 5 }}>
                      <SFIcon name="x" size={12} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', lineHeight: 1.5 }}>
              {t('onboarding.inviteHint')}
            </p>
          </div>
        )}

        {/* ── Step 3 : Done ─────────────────────────────────────────────── */}
        {step === 3 && (
          <div style={{ textAlign: 'center' }}>
            <div style={{
              width: 72, height: 72, borderRadius: '50%',
              background: 'rgba(249,255,0,0.1)', border: '2px solid rgba(249,255,0,0.25)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              margin: '0 auto 24px',
            }}>
              <SFIcon name="check" size={32} color="var(--accent)" />
            </div>

            <h2 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', marginBottom: 10, letterSpacing: '-0.4px' }}>
              {t('onboarding.step4Title')}
            </h2>
            <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 32 }}>
              {t('onboarding.step4Desc')}
            </p>

            {/* Feature preview cards */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10, marginBottom: 36 }}>
              {[
                { icon: 'folder-kanban', key: 'feature1' },
                { icon: 'globe',         key: 'feature2' },
                { icon: 'files',         key: 'feature3' },
              ].map(f => (
                <div key={f.key} style={{
                  padding: '16px 12px', borderRadius: 12,
                  background: 'var(--surface-2)', border: '1px solid var(--border)',
                  textAlign: 'center',
                }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: 9,
                    background: 'rgba(249,255,0,0.08)', border: '1px solid rgba(249,255,0,0.15)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    margin: '0 auto 10px',
                  }}>
                    <SFIcon name={f.icon} size={16} color="var(--accent)" />
                  </div>
                  <p style={{ fontSize: 11, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>
                    {t(`onboarding.${f.key}`)}
                  </p>
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', lineHeight: 1.4 }}>
                    {t(`onboarding.${f.key}Desc`)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* ── Navigation buttons ────────────────────────────────────────── */}
        <div style={{ display: 'flex', gap: 10, marginTop: step === 3 ? 0 : 32 }}>
          {step > 0 && step < 3 && (
            <button onClick={() => setStep(s => s - 1)}
              style={{
                padding: '12px 20px', borderRadius: 10, border: '1px solid var(--border)',
                background: 'var(--surface-2)', color: 'var(--text-2)',
                fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)',
              }}>
              {t('onboarding.back')}
            </button>
          )}
          {step < 3 ? (
            <button onClick={next} disabled={step === 0 && !studioName.trim()}
              style={{
                flex: 1, padding: '13px', borderRadius: 11, border: 'none',
                background: step === 0 && !studioName.trim() ? 'var(--surface-3)' : 'var(--accent)',
                color: step === 0 && !studioName.trim() ? 'var(--text-3)' : 'var(--on-accent)',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)',
                cursor: step === 0 && !studioName.trim() ? 'not-allowed' : 'pointer',
              }}>
              {t('onboarding.next')}
            </button>
          ) : (
            <button onClick={finish}
              style={{
                width: '100%', padding: '13px', borderRadius: 11, border: 'none',
                background: 'var(--accent)', color: 'var(--on-accent)',
                fontSize: 14, fontWeight: 700, fontFamily: 'var(--ff-text)', cursor: 'pointer',
              }}>
              {t('onboarding.finish')}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
