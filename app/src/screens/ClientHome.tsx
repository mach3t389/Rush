import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getMyClientProjects, type ClientProject } from '../data/clientSessionStore';
import { logout } from '../data/authStore';

export function ClientHome() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ClientProject[] | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const list = await getMyClientProjects();
      if (!cancelled) setProjects(list);
    })();
    return () => { cancelled = true; };
  }, []);

  const handleLogout = async () => {
    await logout();
    navigate('/login', { replace: true });
  };

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '48px 32px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
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

        {projects === null && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>…</p>
        )}

        {projects !== null && projects.length === 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('clientHome.empty')}</p>
        )}

        {projects !== null && projects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/mon-espace/projets/${p.id}`)}
                style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 18px', borderRadius: 12, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.clientColor, flexShrink: 0 }} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{p.name}</p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{p.phaseLabel}</span>
                    <div style={{ flex: 1, maxWidth: 140, height: 5, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${p.progress}%`, background: 'var(--accent)', borderRadius: 3 }} />
                    </div>
                    <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{p.progress}%</span>
                  </div>
                </div>
                <div style={{ textAlign: 'right', flexShrink: 0 }}>
                  <p style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 2 }}>
                    {t('clientHome.cardDelivery')}
                  </p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)' }}>{p.deliveryDate}</p>
                </div>
                <SFIcon name="chevron-right" size={16} color="var(--text-3)" />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
