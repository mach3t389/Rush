import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getMyClientProjectIds } from '../data/clientSessionStore';
import { logout } from '../data/authStore';

export function ClientHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projectIds, setProjectIds] = useState<string[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const ids = await getMyClientProjectIds();
      if (!cancelled) setProjectIds(ids);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '48px 32px' }}>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 32 }}>
          <div>
            <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', color: 'var(--text)', marginBottom: 4 }}>
              {t('clientHome.title')}
            </h1>
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientHome.subtitle')}</p>
          </div>
          <button
            onClick={handleLogout}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          >
            <SFIcon name="log-out" size={14} color="var(--text)" />
            {t('clientHome.logout')}
          </button>
        </div>

        {projectIds === null && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>…</p>
        )}

        {projectIds !== null && projectIds.length === 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('clientHome.empty')}</p>
        )}

        {projectIds !== null && projectIds.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {projectIds.map(id => (
              <div key={id} style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-mono)' }}>
                {id}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
