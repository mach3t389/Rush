import { useEffect, useState, useCallback } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { SFIcon, SFButton } from '../../components/ui';
import {
  getMyClientProjects, getMyClientDeliverables,
  approveClientDeliverable, requestClientDeliverableCorrections,
  type ClientProject, type ClientDeliverable,
} from '../../data/clientSessionStore';
import {
  getPreviewClientProjects, getPreviewClientDeliverables,
} from '../../data/viewAsClientDataStore';
import { getViewAsUser } from '../../data/viewAsStore';
import {
  getProjectContent, subscribeProjectContent,
  type CustomOverviewSection, type CustomSectionValue, type ChecklistItem, type GalleryImage,
} from '../../data/projectContentStore';
import { getResources } from '../../data/resourceStore';

const PHASE_ORDER = ['preproduction', 'production', 'postproduction', 'livraison'];

// Kinds montrés au client sur cette page — Vision + tout module personnalisé
// (Champs/Note/Checklist/Galerie/Liens) qu'un studio ajoute. Les modules
// système Livrables/Factures/Fichiers ont déjà leurs propres onglets client
// dédiés (pas dupliqués ici) ; Notes internes est volontairement exclu, par
// nature réservé à l'équipe.
const CLIENT_VISIBLE_KINDS = new Set(['vision', 'fields', 'note', 'checklist', 'gallery', 'links']);

// Rendu lecture seule d'un module d'Aperçu — même contenu que
// TravailOverview.tsx (studio), sans aucune capacité d'édition
// (pas d'input, pas de bouton, pas de suppression/glisser-déposer).
function ClientModuleBody({ section, value }: { section: CustomOverviewSection; value: CustomSectionValue | undefined }) {
  const { t } = useTranslation();
  if (section.kind === 'note') {
    const text = (value as string) ?? '';
    return text.trim()
      ? <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{text}</p>
      : <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('clientProject.apercuModuleEmpty')}</p>;
  }
  if (section.kind === 'fields' || section.kind === 'vision') {
    const values = (value as Record<string, string>) ?? {};
    const fields = section.fields ?? [];
    if (fields.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('clientProject.apercuModuleEmpty')}</p>;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {fields.map(field => (
          <div key={field.id} style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{field.label}</span>
            <p style={{ fontSize: 13, color: values[field.id] ? 'var(--text-2)' : 'var(--text-3)', lineHeight: 1.6, whiteSpace: 'pre-wrap', fontStyle: values[field.id] ? 'normal' : 'italic' }}>
              {values[field.id] || '—'}
            </p>
          </div>
        ))}
      </div>
    );
  }
  if (section.kind === 'checklist') {
    const items = (value as ChecklistItem[]) ?? [];
    if (items.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('clientProject.apercuModuleEmpty')}</p>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {items.map(item => (
          <div key={item.id} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ width: 16, height: 16, borderRadius: '50%', border: item.checked ? 'none' : '1.5px solid var(--border-2)', background: item.checked ? 'var(--ok)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {item.checked && <SFIcon name="check" size={10} color="white" />}
            </div>
            <span style={{ fontSize: 13, color: item.checked ? 'var(--text-3)' : 'var(--text-2)', textDecoration: item.checked ? 'line-through' : 'none' }}>{item.text}</span>
          </div>
        ))}
      </div>
    );
  }
  if (section.kind === 'gallery') {
    const images = (value as GalleryImage[]) ?? [];
    if (images.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('clientProject.apercuModuleEmpty')}</p>;
    return (
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10 }}>
        {images.map(img => (
          <div key={img.id} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
            <img src={img.dataUrl} alt={img.caption} style={{ width: '100%', height: 100, objectFit: 'cover', display: 'block' }} />
            {img.caption && <p style={{ padding: '6px 8px', fontSize: 11, color: 'var(--text-3)' }}>{img.caption}</p>}
          </div>
        ))}
      </div>
    );
  }
  if (section.kind === 'links') {
    const linkedIds = (value as string[]) ?? [];
    const resources = getResources();
    const linked = linkedIds.map(id => resources.find(r => r.id === id)).filter((r): r is NonNullable<typeof r> => !!r);
    if (linked.length === 0) return <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('clientProject.apercuModuleEmpty')}</p>;
    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
        {linked.map(r => (
          <div key={r.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <SFIcon name="link" size={13} color="var(--text-3)" />
            <span style={{ fontSize: 13, color: 'var(--text-2)' }}>{r.title}</span>
          </div>
        ))}
      </div>
    );
  }
  return null;
}

export function ClientProjectApercu() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [project, setProject] = useState<ClientProject | null>(null);
  const [deliverables, setDeliverables] = useState<ClientDeliverable[] | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [customSections, setCustomSections] = useState<CustomOverviewSection[]>(() => projectId ? (getProjectContent(projectId).customSections ?? []) : []);
  const [customSectionData, setCustomSectionData] = useState<Record<string, CustomSectionValue>>(() => projectId ? (getProjectContent(projectId).customSectionData ?? {}) : {});

  useEffect(() => {
    if (!projectId) return;
    const sync = () => {
      const content = getProjectContent(projectId);
      setCustomSections(content.customSections ?? []);
      setCustomSectionData(content.customSectionData ?? {});
    };
    sync();
    return subscribeProjectContent(sync);
  }, [projectId]);

  const viewAs = getViewAsUser();
  const isPreview = viewAs?.type === 'external';

  const load = useCallback(async () => {
    if (!projectId) return;
    const [projects, dels] = isPreview
      ? await Promise.all([
          getPreviewClientProjects(viewAs!.clientId!),
          getPreviewClientDeliverables(projectId),
        ])
      : await Promise.all([
          getMyClientProjects(),
          getMyClientDeliverables(projectId),
        ]);
    setProject(projects.find(p => p.id === projectId) ?? null);
    setDeliverables(dels);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  const handleApprove = async (d: ClientDeliverable) => {
    if (!projectId) return;
    setActingId(d.id);
    const result = await approveClientDeliverable(d.id);
    if (result.ok) {
      setActionError(null);
      await load();
    } else {
      setActionError(t('portal.actionFailed'));
    }
    setActingId(null);
  };

  const handleCorrections = async (d: ClientDeliverable) => {
    if (!projectId) return;
    setActingId(d.id);
    const result = await requestClientDeliverableCorrections(d.id);
    if (result.ok) {
      setActionError(null);
      await load();
    } else {
      setActionError(t('portal.actionFailed'));
    }
    setActingId(null);
  };

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
          {actionError && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#a85f3e18', border: '1px solid #a85f3e44', marginBottom: 12 }}>
              <SFIcon name="triangle-alert" size={13} color="#a85f3e" />
              <span style={{ fontSize: 12, color: '#a85f3e' }}>{actionError}</span>
            </div>
          )}
          {deliverables === null && <p style={{ fontSize: 13, color: 'var(--text-3)' }}>…</p>}
          {deliverables !== null && deliverables.length === 0 && (
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('clientProject.apercuNoDeliverables')}</p>
          )}
          {deliverables !== null && deliverables.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {deliverables.map(d => (
                <div key={d.id} style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                    <SFIcon name="package" size={14} color="var(--text-3)" />
                    <span style={{ fontSize: 13, color: 'var(--text)', flex: 1 }}>{d.title}</span>
                    {d.status && <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{d.status}</span>}
                  </div>
                  {d.correctionsRequested && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 8, background: '#a85f3e18', border: '1px solid #a85f3e44' }}>
                      <SFIcon name="triangle-alert" size={13} color="#a85f3e" />
                      <span style={{ fontSize: 12, color: '#a85f3e' }}>{t('portal.correctionsRequestedNote')}</span>
                    </div>
                  )}
                  {d.status === 'review' && !isPreview && (
                    <div style={{ display: 'flex', gap: 10 }}>
                      <SFButton variant="primary" icon="check" size="sm" disabled={actingId === d.id} onClick={() => handleApprove(d)} style={{ flex: 1, justifyContent: 'center' }}>
                        {t('portal.approve')}
                      </SFButton>
                      {!d.correctionsRequested && (
                        <SFButton variant="secondary" icon="message-circle" size="sm" disabled={actingId === d.id} onClick={() => handleCorrections(d)} style={{ flex: 1, justifyContent: 'center' }}>
                          {t('portal.requestCorrections')}
                        </SFButton>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modules d'Aperçu (Vision + modules personnalisés) — Livrables/
            Factures/Fichiers ont déjà leurs propres onglets, Notes internes
            reste réservé à l'équipe : voir CLIENT_VISIBLE_KINDS plus haut. */}
        {customSections.filter(s => CLIENT_VISIBLE_KINDS.has(s.kind)).map(section => (
          <div key={section.id}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
              <SFIcon name={section.icon} size={13} color="var(--text-3)" />
              <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                {section.title}
              </p>
            </div>
            <div style={{ padding: '14px 16px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)' }}>
              <ClientModuleBody section={section} value={customSectionData[section.id]} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
