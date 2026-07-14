import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { createAdditionalStudio } from '../data/studioStore';
import { logout } from '../data/authStore';

export function NoOrganization() {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleCreate = async () => {
    const trimmed = name.trim();
    if (!trimmed || submitting) return;
    setSubmitting(true);
    try {
      await createAdditionalStudio(trimmed);
      window.location.href = '/';
    } catch (err) {
      console.error('Failed to create organisation', err);
      setSubmitting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 32 }}>
      <div style={{ width: '100%', maxWidth: 440, textAlign: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10, marginBottom: 32 }}>
          <img src="/favicon.svg" alt="Rush" style={{ width: 32, height: 32 }} />
          <span style={{ fontSize: 18, fontWeight: 800, fontFamily: 'var(--ff-display)' }}>Rush</span>
        </div>

        <SFIcon name="building-2" size={36} color="var(--text-3)" />
        <h1 style={{ fontSize: 22, fontWeight: 800, fontFamily: 'var(--ff-display)', margin: '16px 0 10px' }}>
          {t('noOrganization.title')}
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-3)', lineHeight: 1.6, marginBottom: 24 }}>
          {t('noOrganization.desc')}
        </p>

        <input
          value={name}
          onChange={e => setName(e.target.value)}
          placeholder={t('noOrganization.namePlaceholder')}
          style={{
            width: '100%', boxSizing: 'border-box', padding: '11px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)',
            fontSize: 14, outline: 'none', marginBottom: 14,
          }}
        />
        <button
          onClick={handleCreate}
          disabled={!name.trim() || submitting}
          style={{
            width: '100%', padding: '13px', borderRadius: 11, border: 'none',
            background: !name.trim() || submitting ? 'var(--surface-3)' : 'var(--accent)',
            color: !name.trim() || submitting ? 'var(--text-3)' : 'var(--on-accent)',
            fontSize: 14, fontWeight: 700, cursor: submitting ? 'not-allowed' : 'pointer',
            marginBottom: 20,
          }}
        >
          {submitting ? '…' : t('noOrganization.createButton')}
        </button>

        <button
          onClick={() => { void logout(); window.location.href = '/login'; }}
          style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', textDecoration: 'underline' }}
        >
          {t('noOrganization.logout')}
        </button>
      </div>
    </div>
  );
}
