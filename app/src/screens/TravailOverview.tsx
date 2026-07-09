import React, { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { SFPill, SFBar, SFAvatar, SFButton, SFIcon } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { USERS } from '../data/mock';
import { findProject, getProjects, subscribeProjects, updateProject } from '../data/projectStore';
import { getDeliverables, addDeliverable, updateTask, subscribeStore, getSections } from '../data/taskStore';
import { getDeliverableDisplay } from '../data/deliverableStatus';
import { getProjectColor, setProjectColor } from '../data/pinnedStore';
import { ProjectEditPanel, type EditUpdates } from '../components/ProjectCard';
import { getClientApprover } from './FicheClient';
import { getProjectActivities } from './ProjectActivite';
import { getResources, subscribeResources } from '../data/resourceStore';
import { getInvoicesByProject, subscribeInvoices, setInvoiceStatus, type Invoice } from '../data/financeStore';
import { StatusPill } from './Finances';
import { getFiles, subscribeFileStore, type FileItem } from '../data/fileStore';
import type { Task, DeliverableFormat, DeliverableType, ResourceType } from '../types';

// Icônes par type de ressource (pour les ressources liées aux livrables)
const RES_ICON: Record<ResourceType, string> = {
  screenplay: 'scroll-text', video_review: 'clapperboard', moodboard: 'layout-grid',
  document: 'file-text', checklist: 'list-checks', inspirations: 'sparkles',
  file: 'folder', form: 'clipboard-list', web_review: 'globe',
};

// ── Vision state type ──────────────────────────────────────────────────────────

interface VisionState {
  concept: string;
  tonalite: string;
  publicCible: string;
  objectifs: string;
  references: string;
}

const DELIVERABLE_TYPES: { value: DeliverableType; labelKey: string; icon: string }[] = [
  { value: 'video',     labelKey: 'overview.delivVideo',    icon: 'video'        },
  { value: 'photo',     labelKey: 'overview.delivPhoto',    icon: 'image'        },
  { value: 'audio',     labelKey: 'overview.delivAudio',    icon: 'music'        },
  { value: 'document',  labelKey: 'overview.delivDocument', icon: 'file-text'    },
  { value: 'web',       labelKey: 'overview.delivWeb',      icon: 'globe'        },
  { value: 'graphique', labelKey: 'overview.delivGraphic',  icon: 'pen-tool'     },
  { value: 'service',   labelKey: 'overview.delivService',  icon: 'briefcase'    },
  { value: 'produit',   labelKey: 'overview.delivProduct',  icon: 'package-2'    },
  { value: 'autre',     labelKey: 'overview.delivOther',    icon: 'circle-dashed'},
];

const FORMAT_OPTIONS: { value: DeliverableFormat; label: string; ratio: string }[] = [
  { value: '16:9',   label: '16:9',        ratio: '16/9'   },
  { value: '9:16',   label: '9:16',        ratio: '9/16'   },
  { value: '1:1',    label: '1:1',         ratio: '1/1'    },
  { value: '4:3',    label: '4:3',         ratio: '4/3'    },
  { value: '2.35:1', label: '2.35:1',      ratio: '2.35/1' },
  { value: 'custom', label: 'Perso.',      ratio: '4/3'    },
];

const FILE_TYPE_ICON: Record<string, string> = {
  pdf: 'file-text', image: 'image', video: 'video', audio: 'music',
  zip: 'archive', doc: 'file-text', spreadsheet: 'table', resource: 'sparkles', other: 'file',
};

function formatFileSize(bytes?: number): string {
  if (!bytes) return '';
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} Ko`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} Go`;
}

function formatFileDate(iso: string): string {
  return new Date(iso).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' });
}

// ── Activity ───────────────────────────────────────────────────────────────────

const ACTIVITY_ICON: Record<string, string> = {
  comment: 'message-circle',
  upload:  'cloud-upload',
  task:    'check-circle',
  approve: 'shield-check',
  client:  'user',
  member:  'user-plus',
};
const ACTIVITY_COLOR: Record<string, string> = {
  comment: 'var(--info)',
  upload:  'var(--accent)',
  task:    'var(--ok)',
  approve: 'var(--ok)',
  client:  'var(--review)',
  member:  'var(--info)',
};

// ── Shared ─────────────────────────────────────────────────────────────────────


function loadCompleted(projectId: string): boolean {
  try { return JSON.parse(localStorage.getItem(`sf_project_completed_${projectId}`) ?? 'false'); } catch { return false; }
}

function VisionField({ label, placeholder, value, onChange, multiline }: {
  label: string; placeholder: string; value: string;
  onChange: (v: string) => void; multiline?: boolean;
}) {
  const base: React.CSSProperties = {
    width: '100%', background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 9, color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
    outline: 'none', resize: 'none', lineHeight: 1.6, boxSizing: 'border-box',
    padding: '8px 10px', colorScheme: 'dark', transition: 'border-color 0.15s',
  };
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</span>
      {multiline
        ? <textarea
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            rows={3}
            style={base}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
        : <input
            value={value}
            onChange={e => onChange(e.target.value)}
            placeholder={placeholder}
            style={{ ...base, padding: '7px 10px' }}
            onFocus={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
            onBlur={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          />
      }
    </div>
  );
}

function Card({ children, title, icon, action, collapsible, defaultOpen = true }: {
  children: React.ReactNode; title: string; icon: string; action?: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <div
        style={{ padding: '13px 18px', borderBottom: open ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'center', justifyContent: 'space-between', cursor: collapsible ? 'pointer' : 'default' }}
        onClick={collapsible ? () => setOpen(v => !v) : undefined}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SFIcon name={icon} size={14} color="var(--text-2)" />
          <span style={{ fontWeight: 600, fontSize: 13 }}>{title}</span>
          {collapsible && (
            <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={13} color="var(--text-3)" />
          )}
        </div>
        <div onClick={e => e.stopPropagation()}>{action}</div>
      </div>
      {open && children}
    </div>
  );
}

// ── Screen ─────────────────────────────────────────────────────────────────────

export function TravailOverview() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [, forceUpdate] = useState(0);
  useEffect(() => subscribeProjects(() => forceUpdate(n => n + 1)), []);
  const project = findProject(projectId ?? '') ?? getProjects()[0];

  const [completed, setCompleted] = useState(() => loadCompleted(project.id));
  const [editOpen, setEditOpen] = useState(false);

  const [approvalModal, setApprovalModal] = useState(false);
  const [approvalSent, setApprovalSent] = useState(false);
  const [deliverables, setDeliverables] = useState<Task[]>(() => getDeliverables(project.id));
  const [resources, setResources] = useState(getResources);
  const [invoices, setInvoices] = useState<Invoice[]>(() => getInvoicesByProject(project.id));
  const [files, setFiles] = useState<FileItem[]>(() => getFiles().filter(f => f.projectId === project.id));
  const [linkPickerOpen, setLinkPickerOpen] = useState<string | null>(null);
  const [addingDeliverable, setAddingDeliverable] = useState(false);
  const [newDlTitle, setNewDlTitle] = useState('');
  const [newDlFormat, setNewDlFormat] = useState<DeliverableFormat>('16:9');
  const [newDlType, setNewDlType] = useState<DeliverableType>('video');
  const [formatPickerOpen, setFormatPickerOpen] = useState<string | null>(null);
  const [typePickerOpen, setTypePickerOpen] = useState<string | null>(null);

  useEffect(() => {
    return subscribeStore(() => setDeliverables(getDeliverables(project.id)));
  }, [project.id]);

  useEffect(() => subscribeResources(() => setResources(getResources())), []);
  useEffect(() => subscribeInvoices(() => setInvoices(getInvoicesByProject(project.id))), [project.id]);
  useEffect(() => subscribeFileStore(() => setFiles(getFiles().filter(f => f.projectId === project.id))), [project.id]);

  const [vision, setVision] = useState<VisionState>({
    concept: '',
    tonalite: '',
    publicCible: '',
    objectifs: '',
    references: '',
  });
  const [notes, setNotes] = useState('');

  const toggleCompleted = () => {
    const next = !completed;
    setCompleted(next);
    localStorage.setItem(`sf_project_completed_${project.id}`, JSON.stringify(next));
  };

  // Phase dérivée des sections de Tâches : la phase courante = la 1re section non terminée.
  const projectSections = getSections(project.id);
  const firstOpenIdx = projectSections.findIndex(s => !s.completed);
  const currentPhaseLabel = completed
    ? t('overview.done')
    : firstOpenIdx >= 0
      ? projectSections[firstOpenIdx].label
      : projectSections.length > 0 ? t('overview.done') : '—';

  const totalInvoiced = invoices.reduce((s, f) => s + f.total, 0);
  const totalPaid     = invoices.filter(f => f.status === 'paid').reduce((s, f) => s + f.total, 0);

  const recentFiles = files
    .filter(f => !f.state)
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .slice(0, 5);

  const activities = getProjectActivities(project.id);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Topbar */}
      <div style={{ flexShrink: 0 }}>
        <ProjectHeaderBar projectId={project.id}>
          {(() => {
            const approver = getClientApprover(project.clientId);
            if (approver) return (
              <button
                onClick={() => { setApprovalSent(false); setApprovalModal(true); }}
                style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'rgba(249,255,0,0.08)', color: 'var(--accent)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
              >
                <SFIcon name="shield-check" size={15} color="var(--accent)" />
                {t('approval.requestApproval')}
              </button>
            );
            return null;
          })()}
          {completed ? (
            <button onClick={toggleCompleted} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 10, border: '1px solid rgba(0,200,100,0.3)', background: 'rgba(0,200,100,0.1)', color: 'var(--ok)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="check-circle" size={15} color="var(--ok)" />
              {t('overview.projectDone')}
            </button>
          ) : (
            <SFButton variant="secondary" icon="check-circle" onClick={toggleCompleted}>{t('overview.markAsDone')}</SFButton>
          )}
        </ProjectHeaderBar>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '24px', display: 'flex', gap: 24, alignItems: 'flex-start' }}>

        {/* Left column — main content */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Completed banner */}
          {completed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 16px', borderRadius: 12, border: '1px solid rgba(0,200,100,0.25)', background: 'rgba(0,200,100,0.06)' }}>
              <SFIcon name="check-circle" size={18} color="var(--ok)" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>{t('overview.projectMarkedDone')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('overview.projectArchivedDesc')}</p>
              </div>
              <button onClick={toggleCompleted} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                <SFIcon name="x" size={14} />
              </button>
            </div>
          )}

          {/* ── Vision & positionnement ── */}
          <Card title={t('overview.visionTitle')} icon="compass" collapsible defaultOpen={false}>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 16 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <VisionField label={t('overview.visionConcept')} placeholder={t('overview.visionConceptPlaceholder')} value={vision.concept} onChange={v => setVision(p => ({ ...p, concept: v }))} multiline />
                <VisionField label={t('overview.visionTone')} placeholder={t('overview.visionTonePlaceholder')} value={vision.tonalite} onChange={v => setVision(p => ({ ...p, tonalite: v }))} multiline />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <VisionField label={t('overview.visionAudience')} placeholder={t('overview.visionAudiencePlaceholder')} value={vision.publicCible} onChange={v => setVision(p => ({ ...p, publicCible: v }))} multiline />
                <VisionField label={t('overview.visionGoals')} placeholder={t('overview.visionGoalsPlaceholder')} value={vision.objectifs} onChange={v => setVision(p => ({ ...p, objectifs: v }))} multiline />
              </div>
              <VisionField label={t('overview.visionReferences')} placeholder={t('overview.visionReferencesPlaceholder')} value={vision.references} onChange={v => setVision(p => ({ ...p, references: v }))} multiline />
            </div>
          </Card>

          {/* ── Factures ── */}
          <Card title={t('overview.invoicesTitle')} icon="receipt" action={<SFButton variant="ghost" size="sm" icon="plus">{t('overview.newInvoice')}</SFButton>}>
            {/* Summary strip */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 0, borderBottom: '1px solid var(--border)' }}>
              {[
                { label: t('overview.totalInvoiced'), value: `${totalInvoiced.toLocaleString('fr-CA')} $`, color: 'var(--text)' },
                { label: t('overview.received'),      value: `${totalPaid.toLocaleString('fr-CA')} $`,     color: 'var(--ok)' },
                { label: t('overview.pending'),       value: `${(totalInvoiced - totalPaid).toLocaleString('fr-CA')} $`, color: 'var(--warn)' },
              ].map(s => (
                <div key={s.label} style={{ padding: '12px 18px', borderRight: '1px solid var(--border)' }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 4 }}>{s.label}</p>
                  <p style={{ fontSize: 16, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: s.color }}>{s.value}</p>
                </div>
              ))}
            </div>
            {invoices.length === 0 ? (
              <div style={{ padding: '24px 18px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('overview.noInvoices')}</p>
              </div>
            ) : invoices.map((inv, i) => (
              <div key={inv.id} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 18px', borderBottom: i < invoices.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => navigate(`/projets/${project.id}/finances`)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 34, height: 34, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name="file-text" size={15} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{inv.number}</span>
                    <span style={{ fontSize: 13, fontWeight: 500 }}>{inv.title}</span>
                  </div>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('overview.dueDate', { date: formatFileDate(inv.dueDate) })}</p>
                </div>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 14, fontWeight: 700, color: 'var(--text)', flexShrink: 0 }}>{inv.total.toLocaleString('fr-CA')} $</span>
                <span onClick={e => e.stopPropagation()} style={{ flexShrink: 0 }}>
                  <StatusPill status={inv.status} onChange={s => setInvoiceStatus(inv.id, s)} />
                </span>
              </div>
            ))}
          </Card>

          {/* ── Livrables client ── */}
          <Card title={`${t('overview.clientDeliverables')}${deliverables.length ? ` (${deliverables.length})` : ''}`} icon="package"
            action={
              <SFButton variant="ghost" size="sm" icon="plus" onClick={() => { setAddingDeliverable(true); setNewDlTitle(''); setNewDlFormat('16:9'); }}>
                {t('overview.add')}
              </SFButton>
            }
          >
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 36px 100px 90px', gap: 10, padding: '6px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {[t('overview.colDeliverable'), t('overview.colType'), t('overview.colFormat'), '', t('overview.colStatus'), ''].map((h, i) => (
                <span key={i} style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
              ))}
            </div>

            {deliverables.length === 0 && !addingDeliverable && (
              <div style={{ padding: '24px 18px', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                <SFIcon name="package" size={24} color="var(--border-2)" />
                <p style={{ marginTop: 10, marginBottom: 10 }}>{t('overview.noDeliverables')}</p>
                <button onClick={() => { setAddingDeliverable(true); setNewDlTitle(''); }}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 14px', borderRadius: 9, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                  <SFIcon name="plus" size={12} /> {t('overview.createDeliverable')}
                </button>
              </div>
            )}

            {deliverables.map((dl) => {
              const st = getDeliverableDisplay(dl);
              const fmt = FORMAT_OPTIONS.find(f => f.value === dl.format);
              const dlType = DELIVERABLE_TYPES.find(dt => dt.value === dl.deliverableType) ?? DELIVERABLE_TYPES[0];
              const isPickerOpen = formatPickerOpen === dl.id;
              const isTypeOpen = typePickerOpen === dl.id;
              const linkedIds = dl.linkedResources ?? [];
              const linkedRes = resources.filter(r => linkedIds.includes(r.id));
              const isLinkOpen = linkPickerOpen === dl.id;
              const toggleResource = (rid: string) => updateTask(project.id, dl.id, {
                linkedResources: linkedIds.includes(rid) ? linkedIds.filter(id => id !== rid) : [...linkedIds, rid],
              });
              return (
                <div key={dl.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 36px 100px 90px', gap: 10, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--border)', transition: 'background 0.1s', position: 'relative' }}
                  onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                >
                  {/* Label + sous-tâches + ressources liées */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0, cursor: 'pointer', flex: 1 }}
                      onClick={() => navigate(`/projets/${project.id}`)}>
                      <div style={{ width: 28, height: 28, borderRadius: 7, background: `${st.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <SFIcon name={st.icon} size={13} color={st.color} />
                      </div>
                      <div style={{ minWidth: 0 }}>
                        <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dl.title}</p>
                        {dl.subtasks && dl.subtasks.length > 0 && (
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 1 }}>
                            {t('overview.subtasksCount', { done: dl.subtasks.filter(s => s.checked).length, total: dl.subtasks.length })}
                          </p>
                        )}
                        {/* Chips ressources liées */}
                        {linkedRes.length > 0 && (
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 5 }}>
                            {linkedRes.map(r => (
                              <span key={r.id}
                                onClick={e => { e.stopPropagation(); navigate(`/projets/${project.id}/ressources/${r.id}`); }}
                                title={t('overview.openResource', { title: r.title })}
                                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: 160, padding: '2px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', cursor: 'pointer' }}>
                                <SFIcon name={RES_ICON[r.type] ?? 'file'} size={10} color="var(--text-3)" />
                                <span style={{ fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</span>
                                <span onClick={(e: React.MouseEvent) => { e.stopPropagation(); toggleResource(r.id); }}
                                  title={t('overview.remove')} style={{ display: 'inline-flex', flexShrink: 0 }}>
                                  <SFIcon name="x" size={9} color="var(--text-3)" />
                                </span>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Bouton lier une ressource existante */}
                    <div style={{ position: 'relative', flexShrink: 0 }}>
                      <button onClick={e => { e.stopPropagation(); setLinkPickerOpen(isLinkOpen ? null : dl.id); setTypePickerOpen(null); setFormatPickerOpen(null); }}
                        title={t('overview.linkExistingResource')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: isLinkOpen ? 'rgba(249,255,0,0.08)' : 'var(--surface-3)', border: `1px solid ${isLinkOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: linkedRes.length ? 'var(--accent)' : 'var(--text-3)' }}>
                        <SFIcon name="paperclip" size={12} color={linkedRes.length ? 'var(--accent)' : 'var(--text-3)'} />
                        {linkedRes.length > 0 && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10 }}>{linkedRes.length}</span>}
                      </button>
                      {isLinkOpen && (
                        <>
                          <div onClick={() => setLinkPickerOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
                          <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 6, boxShadow: '0 10px 32px rgba(0,0,0,0.5)', width: 280, maxHeight: 320, overflowY: 'auto' }}>
                            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 8px 4px' }}>{t('overview.existingResources')}</p>
                            {resources.length === 0 && (
                              <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '8px', textAlign: 'center' }}>{t('overview.noResourcesHint')}</p>
                            )}
                            {resources.map(r => {
                              const on = linkedIds.includes(r.id);
                              return (
                                <button key={r.id} onClick={() => toggleResource(r.id)}
                                  style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 8px', borderRadius: 8, border: 'none', background: on ? 'rgba(249,255,0,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
                                  onMouseEnter={e => { if (!on) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                                  onMouseLeave={e => { if (!on) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                                  <div style={{ width: 26, height: 26, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                    <SFIcon name={RES_ICON[r.type] ?? 'file'} size={12} color="var(--text-3)" />
                                  </div>
                                  <div style={{ flex: 1, minWidth: 0 }}>
                                    <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>{r.eyebrow}</p>
                                  </div>
                                  {on && <SFIcon name="check" size={13} color="var(--accent)" />}
                                </button>
                              );
                            })}
                          </div>
                        </>
                      )}
                    </div>

                    {/* Bouton partager avec le client */}
                    <button onClick={e => { e.stopPropagation(); updateTask(project.id, dl.id, { sharedWithClient: !dl.sharedWithClient }); }}
                      title={dl.sharedWithClient ? t('overview.unshareWithClient') : t('overview.shareWithClient')}
                      style={{ display: 'flex', alignItems: 'center', gap: 4, background: dl.sharedWithClient ? 'rgba(249,255,0,0.08)' : 'var(--surface-3)', border: `1px solid ${dl.sharedWithClient ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: dl.sharedWithClient ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
                      <SFIcon name={dl.sharedWithClient ? 'eye' : 'eye-off'} size={12} color={dl.sharedWithClient ? 'var(--accent)' : 'var(--text-3)'} />
                    </button>
                  </div>

                  {/* Type — clickable dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={e => { e.stopPropagation(); setTypePickerOpen(isTypeOpen ? null : dl.id); setFormatPickerOpen(null); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-3)', border: `1px solid ${isTypeOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
                      <SFIcon name={dlType.icon} size={12} color="var(--text-3)" />
                      {t(dlType.labelKey)}
                      <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                    </button>
                    {isTypeOpen && (
                      <>
                        <div onClick={() => setTypePickerOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 11, padding: 5, boxShadow: '0 10px 32px rgba(0,0,0,0.5)', minWidth: 150 }}>
                          {DELIVERABLE_TYPES.map(dt => (
                            <button key={dt.value} onClick={() => { updateTask(project.id, dl.id, { deliverableType: dt.value }); setTypePickerOpen(null); }}
                              style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none', background: dl.deliverableType === dt.value ? 'rgba(249,255,0,0.07)' : 'transparent', color: dl.deliverableType === dt.value ? 'var(--accent)' : 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)', textAlign: 'left' }}
                              onMouseEnter={e => { if (dl.deliverableType !== dt.value) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                              onMouseLeave={e => { if (dl.deliverableType !== dt.value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                              <SFIcon name={dt.icon} size={13} color={dl.deliverableType === dt.value ? 'var(--accent)' : 'var(--text-3)'} />
                              {t(dt.labelKey)}
                              {dl.deliverableType === dt.value && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                            </button>
                          ))}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Format — clickable dropdown */}
                  <div style={{ position: 'relative' }}>
                    <button onClick={e => { e.stopPropagation(); setFormatPickerOpen(isPickerOpen ? null : dl.id); setTypePickerOpen(null); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-3)', border: `1px solid ${isPickerOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap' }}>
                      {fmt ? (
                        <>
                          <div style={{ width: 14, aspectRatio: fmt.ratio, border: '1.5px solid var(--text-3)', borderRadius: 2, flexShrink: 0 }} />
                          {fmt.value === 'custom' ? t('overview.formatCustom') : fmt.label}
                        </>
                      ) : <span style={{ color: 'var(--text-3)' }}>—</span>}
                      <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                    </button>
                    {isPickerOpen && (
                      <>
                        <div onClick={() => setFormatPickerOpen(null)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
                        <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 8, boxShadow: '0 10px 32px rgba(0,0,0,0.5)', display: 'flex', flexWrap: 'wrap', gap: 6, width: 260 }}>
                          {FORMAT_OPTIONS.map(f => (
                            <button key={f.value}
                              onClick={() => { updateTask(project.id, dl.id, { format: f.value }); setFormatPickerOpen(null); }}
                              style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5, padding: '8px 10px', borderRadius: 8, border: `1px solid ${dl.format === f.value ? 'var(--accent)' : 'var(--border)'}`, background: dl.format === f.value ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', cursor: 'pointer', minWidth: 60 }}>
                              <div style={{ width: 22, aspectRatio: f.ratio, border: `2px solid ${dl.format === f.value ? 'var(--accent)' : 'var(--border-2)'}`, borderRadius: 2 }} />
                              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: dl.format === f.value ? 'var(--accent)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>{f.label}</span>
                            </button>
                          ))}
                          {dl.format === 'custom' && (
                            <div style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 6, paddingTop: 6, borderTop: '1px solid var(--border)' }}>
                              <input type="number" defaultValue={dl.customWidth ?? 1920}
                                onBlur={e => updateTask(project.id, dl.id, { customWidth: Number(e.target.value) })}
                                style={{ width: 70, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-mono)', outline: 'none' }} />
                              <span style={{ color: 'var(--text-3)', fontSize: 12 }}>×</span>
                              <input type="number" defaultValue={dl.customHeight ?? 1080}
                                onBlur={e => updateTask(project.id, dl.id, { customHeight: Number(e.target.value) })}
                                style={{ width: 70, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-mono)', outline: 'none' }} />
                              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>px</span>
                            </div>
                          )}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Assignee avatar */}
                  <SFAvatar initials={dl.assignee?.initials ?? '?'} bg={dl.assignee?.avatarColor ?? '#555'} size={24} />

                  {/* Statut */}
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 600, color: st.color }}>{t(st.labelKey)}</span>

                  {/* Actions */}
                  <button
                    onClick={e => { e.stopPropagation(); navigate(`/projets/${project.id}`); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer', color: 'var(--text-3)', fontSize: 10, fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                  >
                    <SFIcon name="list-checks" size={11} />
                    Tâches
                  </button>
                </div>
              );
            })}

            {/* Inline add form */}
            {addingDeliverable && (
              <div style={{ padding: '12px 18px', borderTop: deliverables.length ? '1px solid var(--border)' : 'none', background: 'rgba(249,255,0,0.03)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                <input
                  autoFocus
                  value={newDlTitle}
                  onChange={e => setNewDlTitle(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newDlTitle.trim()) {
                      const task: Task = {
                        id: `dl-${Date.now()}`,
                        title: newDlTitle.trim(),
                        projectId: project.id,
                        projectName: project.name,
                        projectColor: project.clientColor,
                        assignee: USERS.lea,
                        status: 'warn',
                        statusLabel: 'À livrer',
                        priority: 'normal',
                        priorityLabel: 'Moyenne',
                        dueDate: '—',
                        dueDateRed: false,
                        checked: false,
                        subtasks: [],
                        deliverable: true,
                        deliverableType: newDlType,
                        format: newDlFormat,
                      };
                      addDeliverable(project.id, task);
                      setAddingDeliverable(false);
                      setNewDlTitle('');
                    }
                    if (e.key === 'Escape') setAddingDeliverable(false);
                  }}
                  placeholder="Nom du livrable… (Entrée pour valider)"
                  style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', outline: 'none', boxSizing: 'border-box' }}
                />
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type :</span>
                  {DELIVERABLE_TYPES.map(t => (
                    <button key={t.value} onClick={() => setNewDlType(t.value)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 7, border: `1px solid ${newDlType === t.value ? 'var(--accent)' : 'var(--border)'}`, background: newDlType === t.value ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', color: newDlType === t.value ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                      <SFIcon name={t.icon} size={11}  />
                      {t.label}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Format :</span>
                  {FORMAT_OPTIONS.map(f => (
                    <button key={f.value} onClick={() => setNewDlFormat(f.value)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 7, border: `1px solid ${newDlFormat === f.value ? 'var(--accent)' : 'var(--border)'}`, background: newDlFormat === f.value ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', color: newDlFormat === f.value ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-mono)' }}>
                      <div style={{ width: 12, aspectRatio: f.ratio, border: `1.5px solid currentColor`, borderRadius: 1 }} />
                      {f.label}
                    </button>
                  ))}
                  <button onClick={() => setAddingDeliverable(false)} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}>
                    <SFIcon name="x" size={14} />
                  </button>
                </div>
              </div>
            )}
          </Card>

          {/* ── Fichiers ── */}
          <Card title="Fichiers" icon="folder" action={<SFButton variant="ghost" size="sm" icon="upload" onClick={() => navigate(`/projets/${project.id}/fichiers`)}>Importer</SFButton>}>
            {recentFiles.length === 0 ? (
              <div style={{ padding: '24px 18px', textAlign: 'center' }}>
                <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{t('overview.noFiles')}</p>
              </div>
            ) : recentFiles.map((doc, i) => (
              <div key={doc.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 18px', borderBottom: i < recentFiles.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer', transition: 'background 0.1s' }}
                onClick={() => navigate(`/projets/${project.id}/fichiers`)}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 34, height: 34, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name={FILE_TYPE_ICON[doc.type] ?? 'file'} size={15} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{doc.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{doc.ext.toUpperCase()}{doc.size ? ` · ${formatFileSize(doc.size)}` : ''} · {formatFileDate(doc.updatedAt)}</p>
                </div>
              </div>
            ))}
          </Card>

          {/* ── Notes internes ── */}
          <Card title="Notes internes" icon="sticky-note">
            <div style={{ padding: '14px 18px' }}>
              <textarea
                value={notes}
                onChange={e => setNotes(e.target.value)}
                placeholder="Ajouter des notes de projet, contexte, instructions importantes..."
                rows={5}
                style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', colorScheme: 'dark' }}
              />
            </div>
          </Card>

        </div>

        {/* Right column — sidebar (order: -1 = visually on the left) */}
        <div style={{ width: 320, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 16, order: -1 }}>

          {/* Infos du projet */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Infos du projet</span>
              <button onClick={() => setEditOpen(true)} title="Modifier le projet"
                style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)' }}
                onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
              >
                <SFIcon name="square-pen" size={12} />
                Modifier
              </button>
            </div>
            <div style={{ padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Identité — nom du projet (client en sous-titre) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div style={{ width: 30, height: 30, borderRadius: 8, background: getProjectColor(project.id, project.clientColor), flexShrink: 0 }} />
                <div style={{ minWidth: 0 }}>
                  <p style={{ fontSize: 14, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{project.clientName}</p>
                </div>
              </div>
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Statut</p>
                <SFPill status={completed ? 'ok' : project.status} small>{completed ? 'Terminé' : project.statusLabel}</SFPill>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Phase actuelle</p>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--accent)' }}>{currentPhaseLabel}</span>
                </div>
                {projectSections.length > 0 ? (
                  <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                    {projectSections.map((step, i) => {
                      const isCurrent = !completed && i === firstOpenIdx;
                      const isDone = completed || step.completed;
                      return (
                        <span key={step.label + i} style={{
                          display: 'flex', alignItems: 'center', gap: 4,
                          padding: '4px 9px', borderRadius: 7,
                          border: `1px solid ${isCurrent ? 'var(--accent)' : 'var(--border)'}`,
                          background: isCurrent ? 'rgba(249,255,0,0.08)' : 'transparent',
                          color: isCurrent ? 'var(--accent)' : isDone ? 'var(--text-2)' : 'var(--text-3)',
                          fontSize: 11, fontFamily: 'var(--ff-text)',
                        }}>
                          {isDone && <SFIcon name="check" size={10} color="var(--ok)" />}
                          {step.label}
                        </span>
                      );
                    })}
                  </div>
                ) : (
                  <p style={{ fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune section dans Tâches</p>
                )}
              </div>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Progression</p>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)' }}>{project.progress}%</span>
                </div>
                <SFBar value={project.progress} height={5} />
              </div>
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Date de livraison</p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, color: project.deliveryDate ? 'var(--text-2)' : 'var(--text-3)' }}>
                  <SFIcon name="calendar" size={13} color="var(--text-3)" />
                  {project.deliveryDate || 'Non définie'}
                </div>
              </div>
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Budget</p>
                <p style={{ fontSize: 13, fontFamily: 'var(--ff-mono)', color: project.budget ? 'var(--text-2)' : 'var(--text-3)', fontStyle: project.budget ? 'normal' : 'italic' }}>
                  {project.budget ? `${project.budget.toLocaleString('fr-CA')} $` : 'Non défini'}
                </p>
              </div>
              {project.description && (
                <div>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Description</p>
                  <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>{project.description}</p>
                </div>
              )}
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Tâches</p>
                <div style={{ display: 'flex', gap: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <SFIcon name="check-circle" size={12} color="var(--ok)" />
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                      {Math.round(project.taskCount * project.progress / 100)}/{project.taskCount}
                    </span>
                  </div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <SFIcon name="package" size={12} color="var(--info)" />
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                      {deliverables.filter(d => d.status === 'ok').length}/{deliverables.length} livrables
                    </span>
                  </div>
                </div>
              </div>
              {/* Budget factures */}
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Facturation</p>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: 'var(--text-3)' }}>Reçu</span>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--ok)', fontWeight: 600 }}>{totalPaid.toLocaleString('fr-CA')} $</span>
                  </div>
                  <SFBar value={Math.round((totalPaid / totalInvoiced) * 100)} height={4} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'right' }}>
                    sur {totalInvoiced.toLocaleString('fr-CA')} $ facturés
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Équipe */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Équipe</span>
              <SFButton variant="ghost" size="sm" icon="user-plus" onClick={() => navigate(`/projets/${project.id}/membres`)}>Inviter</SFButton>
            </div>
            <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 2 }}>
              {project.members.map(member => (
                <div key={member.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                  <SFAvatar initials={member.initials} bg={member.avatarColor} size={28} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 13, fontWeight: 500 }}>{member.name}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)' }}>{member.role}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Activité récente */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '13px 18px', borderBottom: '1px solid var(--border)' }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>Activité récente</span>
            </div>
            <div style={{ padding: '10px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              {activities.length === 0 ? (
                <p style={{ fontSize: 12, color: 'var(--text-3)', padding: '4px 0' }}>{t('overview.noActivity')}</p>
              ) : activities.slice(0, 5).map(item => (
                <div key={item.id} style={{ display: 'flex', gap: 10 }}>
                  <div style={{ width: 28, height: 28, borderRadius: '50%', flexShrink: 0, background: `${ACTIVITY_COLOR[item.type] ?? 'var(--text-3)'}20`, border: `1px solid ${ACTIVITY_COLOR[item.type] ?? 'var(--text-3)'}40`, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SFIcon name={ACTIVITY_ICON[item.type] ?? 'activity'} size={13} color={ACTIVITY_COLOR[item.type] ?? 'var(--text-3)'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, lineHeight: 1.4, color: 'var(--text-2)' }}>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{item.actorName.split(' ')[0]}</span>
                      {' '}{item.action}{' '}
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{item.target}</span>
                    </p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 3, fontFamily: 'var(--ff-mono)' }}>{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </div>

      {editOpen && (
        <ProjectEditPanel
          p={project}
          color={getProjectColor(project.id, project.clientColor)}
          name={project.name}
          status={project.status}
          statusLabel={project.statusLabel}
          phase={project.phase}
          phaseLabel={project.phaseLabel}
          deliveryDate={project.deliveryDate}
          onClose={() => setEditOpen(false)}
          onSave={(u: EditUpdates) => {
            setProjectColor(project.id, u.color);
            updateProject(project.id, {
              name: u.name, status: u.status, statusLabel: u.statusLabel,
              deliveryDate: u.deliveryDate, budget: u.budget, description: u.description,
            });
            forceUpdate(n => n + 1);
          }}
        />
      )}

      {approvalModal && (() => {
        const approver = getClientApprover(project.clientId);
        if (!approver) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}
            onClick={e => { if (e.target === e.currentTarget) setApprovalModal(false); }}>
            <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: 28, width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ width: 36, height: 36, borderRadius: 10, background: 'rgba(249,255,0,0.12)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SFIcon name="shield-check" size={18} color="var(--accent)" />
                  </div>
                  <h3 style={{ fontSize: 15, fontWeight: 700 }}>Demande d'approbation</h3>
                </div>
                <button onClick={() => setApprovalModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                  <SFIcon name="x" size={16} />
                </button>
              </div>

              {approvalSent ? (
                <div style={{ textAlign: 'center', padding: '16px 0 8px' }}>
                  <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(0,200,100,0.12)', border: '1px solid var(--ok)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
                    <SFIcon name="check" size={24} color="var(--ok)" />
                  </div>
                  <p style={{ fontSize: 14, fontWeight: 600, marginBottom: 6 }}>Demande envoyée !</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{approver.name} a reçu une notification pour approuver le projet <strong style={{ color: 'var(--text-2)' }}>{project.name}</strong>.</p>
                  <button onClick={() => setApprovalModal(false)} style={{ marginTop: 20, padding: '8px 24px', borderRadius: 10, border: 'none', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Fermer</button>
                </div>
              ) : (
                <>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.6 }}>
                    Une demande d'approbation finale sera envoyée à l'approbateur désigné pour ce client.
                  </p>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 11, border: '1px solid var(--accent)', background: 'rgba(249,255,0,0.05)', marginBottom: 20 }}>
                    <div style={{ width: 38, height: 38, borderRadius: '50%', background: approver.color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 13, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{approver.initials}</div>
                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                        <p style={{ fontSize: 13, fontWeight: 600 }}>{approver.name}</p>
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--on-accent)', background: 'var(--accent)', padding: '2px 6px', borderRadius: 4, letterSpacing: '0.06em' }}>APPROBATEUR</span>
                      </div>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{approver.role} · {approver.email}</p>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                    <button onClick={() => setApprovalModal(false)} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Annuler</button>
                    <button
                      onClick={() => setApprovalSent(true)}
                      style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 18px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                    >
                      <SFIcon name="send" size={14} color="var(--on-accent)" />
                      Envoyer la demande
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
