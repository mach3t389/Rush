import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { SFIcon } from '../../components/ui';
import {
  getMyClientProjects, getMyClientDeliverables,
  type ClientProject, type ClientDeliverable,
} from '../../data/clientSessionStore';
import { getPreviewClientProjects, getPreviewClientDeliverables } from '../../data/viewAsClientDataStore';
import { getViewAsUser } from '../../data/viewAsStore';

const PHASE_ORDER = ['preproduction', 'production', 'postproduction', 'livraison'];

export function ClientProjectApercu() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [project, setProject] = useState<ClientProject | null>(null);
  const [deliverables, setDeliverables] = useState<ClientDeliverable[] | null>(null);

  const viewAs = getViewAsUser();
  const isPreview = viewAs?.type === 'external';

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    (async () => {
      const [projects, dels] = isPreview
        ? await Promise.all([
            getPreviewClientProjects(viewAs!.clientId!),
            getPreviewClientDeliverables(projectId),
          ])
        : await Promise.all([
            getMyClientProjects(),
            getMyClientDeliverables(projectId),
          ]);
      if (cancelled) return;
      setProject(projects.find(p => p.id === projectId) ?? null);
      setDeliverables(dels);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  if (!projectId) return null;
  const currentPhaseIdx = project ? PHASE_ORDER.indexOf(project.phase) : -1;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'auto', padding: '24px 32px', display: 'flex', flexDirection: 'column', gap: 24 }}>
        {project && (
          <div style={{ border: '1px solid var(--border)', borderRadius: 12, background: 'var(--surface)', padding: 20 }}>
            <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
              {t('clientProject.apercuPhaseLabel')}
            </p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              {PHASE_ORDER.map((phase, i) => (
                <div key={phase} style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{
                    width: 22, height: 22, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
                    background: i <= currentPhaseIdx ? 'var(--accent)' : 'var(--surface-3)',
                    color: i <= currentPhaseIdx ? 'var(--on-accent)' : 'var(--text-3)',
                    fontSize: 10, fontWeight: 700, flexShrink: 0,
                  }}>
                    {i < currentPhaseIdx ? <SFIcon name="check" size={11} /> : i + 1}
                  </div>
                  {i < PHASE_ORDER.length - 1 && (
                    <div style={{ flex: 1, height: 2, background: i < currentPhaseIdx ? 'var(--accent)' : 'var(--surface-3)' }} />
                  )}
                </div>
              ))}
            </div>
            <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 10 }}>{project.phaseLabel}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{ height: '100%', width: `${project.progress}%`, background: 'var(--accent)', borderRadius: 3 }} />
              </div>
              <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{project.progress}%</span>
            </div>
          </div>
        )}

        <div>
          <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 12 }}>
            {t('clientProject.apercuDeliverables')}
          </p>
          {deliverables === null && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>…</p>}
          {deliverables !== null && deliverables.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientProject.apercuNoDeliverables')}</p>
          )}
          {deliverables !== null && deliverables.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {deliverables.map(d => (
                <div key={d.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <SFIcon name="package" size={14} color="var(--text-3)" />
                  <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{d.title}</span>
                  {d.status && <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{d.status}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
