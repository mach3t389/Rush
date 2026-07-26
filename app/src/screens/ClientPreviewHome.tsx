import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../components/ui';
import { getPreviewClientProjects } from '../data/viewAsClientDataStore';
import type { ClientProject } from '../data/clientSessionStore';

// Admin-facing equivalent of ClientHome.tsx for the "voir en tant que
// client" preview — deliberately a separate file rather than a shared one:
// this screen takes a :clientId route param (ClientHome has no such param,
// it resolves the client from the real authenticated session) and has no
// logout button (the admin exits via the ViewAsBanner, not by logging out).
export function ClientPreviewHome() {
  const { clientId } = useParams<{ clientId: string }>();
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [projects, setProjects] = useState<ClientProject[] | null>(null);

  useEffect(() => {
    if (!clientId) return;
    let cancelled = false;
    (async () => {
      const list = await getPreviewClientProjects(clientId);
      if (!cancelled) setProjects(list);
    })();
    return () => { cancelled = true; };
  }, [clientId]);

  if (!clientId) return null;

  return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)', padding: '48px 32px' }}>
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ marginBottom: 32 }}>
          <h1 style={{ fontSize: 24, fontWeight: 800, fontFamily: 'var(--ff-display)', color: 'var(--text)', marginBottom: 4 }}>
            {t('clientPreview.title')}
          </h1>
          <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientPreview.subtitle')}</p>
        </div>

        {projects === null && <p style={{ color: 'var(--text-3)', fontSize: 13 }}>…</p>}

        {projects !== null && projects.length === 0 && (
          <p style={{ color: 'var(--text-3)', fontSize: 13 }}>{t('clientPreview.empty')}</p>
        )}

        {projects !== null && projects.length > 0 && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {projects.map(p => (
              <div
                key={p.id}
                onClick={() => navigate(`/apercu-client/${clientId}/projets/${p.id}`)}
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
                    {t('clientPreview.cardDelivery')}
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
