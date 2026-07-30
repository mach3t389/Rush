import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useNavigate } from 'react-router-dom';
import { SFPill, SFBar, SFAvatar, SFButton, SFIcon, AssigneeGroup } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { findProject, getProjects, subscribeProjects, updateProject } from '../data/projectStore';
import { getDeliverables, addDeliverable, updateTask, deleteTask, subscribeStore, getSections, getProjectStats } from '../data/taskStore';
import { getDeliverableDisplay, DELIVERABLE_STATUS_OPTIONS } from '../data/deliverableStatus';
import { getProjectColor } from '../data/pinnedStore';
import { ProjectEditPanel, type EditUpdates } from '../components/ProjectCard';
import { getClientApprover } from './FicheClient';
import { getProjectActivities } from './ProjectActivite';
import { getResources, subscribeResources } from '../data/resourceStore';
import { getInvoicesByProject, subscribeInvoices, setInvoiceStatus, type Invoice } from '../data/financeStore';
import { StatusPill } from './Finances';
import { getFiles, subscribeFileStore, type FileItem } from '../data/fileStore';
import { showToast } from '../data/toastStore';
import { getProjectContent, setProjectContent, subscribeProjectContent, VISION_SECTION_ID, getDefaultVisionSection, type CustomOverviewSection } from '../data/projectContentStore';
import { loadAllResourceTemplates, loadCustomResourceTemplates, saveCustomResourceTemplates, type ResourceTemplate } from '../data/templates';
import { TemplateMenuButton } from '../components/TemplateMenuButton';
import { addNotif, subscribeNotifs } from '../data/notificationStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { getStudioInfo } from '../data/studioStore';
import { isDemoSession } from '../data/authStore';
import { sendEmail } from '../data/emailStore';
import { InlineDropdown, ddItem, PRIORITY_OPTIONS, PRIORITY_LABEL_KEY, PRIORITY_COLOR } from './Travail';
import { OverviewSectionForm } from '../components/OverviewSectionForm';
import type { Task, DeliverableFormat, DeliverableType, ResourceType, Priority } from '../types';

// Icônes par type de ressource (pour les ressources liées aux livrables)
const RES_ICON: Record<ResourceType, string> = {
  screenplay: 'scroll-text', video_review: 'clapperboard', moodboard: 'layout-grid',
  document: 'file-text', inspirations: 'sparkles',
  form: 'clipboard-list', web_review: 'globe',
};

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

function Card({ children, title, icon, action, collapsible, defaultOpen = true, persistKey }: {
  children: React.ReactNode; title: string; icon: string; action?: React.ReactNode;
  collapsible?: boolean; defaultOpen?: boolean; persistKey?: string;
}) {
  const [localOpen, setLocalOpen] = useState(defaultOpen);
  const [persistedOpen, setPersistedOpen] = usePersistedState(`sf_overview_section_open_${persistKey}`, defaultOpen);
  const open = persistKey ? persistedOpen : localOpen;
  const setOpen = persistKey ? setPersistedOpen : setLocalOpen;
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

const OVERVIEW_TEMPLATE_COLORS = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B'];

function SaveOverviewTemplateModal({ projectName, customSections, originTemplate, onClose }: {
  projectName: string;
  customSections: CustomOverviewSection[];
  originTemplate?: ResourceTemplate;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(originTemplate?.name ?? projectName);
  const [description, setDescription] = useState(originTemplate?.description ?? '');
  const [color, setColor] = useState(originTemplate?.color ?? OVERVIEW_TEMPLATE_COLORS[0]);
  const [tags, setTags] = useState(originTemplate?.tags?.join(', ') ?? '');
  const [saved, setSaved] = useState(false);

  // La section Vision est unique à chaque projet — jamais incluse dans un modèle réutilisable.
  const reusableSections = customSections.filter(s => s.id !== VISION_SECTION_ID);

  const handleSave = () => {
    if (!name.trim()) return;
    const tpl: ResourceTemplate = {
      id: originTemplate?.id ?? `res-${Date.now()}`,
      type: 'overview',
      name: name.trim(),
      description: description.trim(),
      color,
      icon: 'layout-grid',
      tags: tags.split(',').map(x => x.trim()).filter(Boolean),
      builtIn: false,
      createdAt: originTemplate?.createdAt ?? new Date().toISOString().split('T')[0],
      overviewSections: reusableSections,
    };
    const existing = loadCustomResourceTemplates();
    const updated = originTemplate
      ? existing.map(t2 => t2.id === tpl.id ? tpl : t2)
      : [...existing, tpl];
    saveCustomResourceTemplates(updated);
    setSaved(true);
    setTimeout(onClose, 1400);
  };

  const fStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 9,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
    outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
  };
  const lStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.07em',
  };

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 460, zIndex: 201, background: 'var(--surface)',
        border: '1px solid var(--border-2)', borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,0.75)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t('templateModal.titleStep1')}</h2>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t('templateModal.sectionsCount', { count: reusableSections.length })}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={16} />
          </button>
        </div>

        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={lStyle}>{t('templateModal.nameLabel')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('templateModal.namePlaceholder')} style={fStyle} autoFocus />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={lStyle}>{t('templateModal.descriptionLabel')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={t('templateModal.descriptionPlaceholder')} style={{ ...fStyle, resize: 'none' }} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={lStyle}>{t('templateModal.colorLabel')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {OVERVIEW_TEMPLATE_COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={lStyle}>{t('templateModal.tagsLabel')}</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder={t('templateModal.tagsPlaceholder')} style={fStyle} />
            </div>
          </div>
        </div>

        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', flexShrink: 0 }}>
          {saved ? (
            <span style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--ok)', fontSize: 13, fontWeight: 600 }}>
              <SFIcon name="check" size={14} />{t('templateModal.templateSaved')}
            </span>
          ) : (
            <SFButton variant="primary" disabled={!name.trim()} onClick={handleSave}>{t('templateModal.createTemplate')}</SFButton>
          )}
        </div>
      </div>
    </>
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
  const stats = getProjectStats(project);
  const originTemplate = project.draftOriginTemplateId
    ? loadAllResourceTemplates().find(t2 => t2.id === project.draftOriginTemplateId && t2.type === 'overview')
    : undefined;

  const completed = !!project.completed;
  const [editOpen, setEditOpen] = useState(false);

  const [approvalModal, setApprovalModal] = useState(false);
  const [approvalSent, setApprovalSent] = useState(false);
  const [deliverables, setDeliverables] = useState<Task[]>(() => getDeliverables(project.id));
  const [resources, setResources] = useState(getResources);
  const [invoices, setInvoices] = useState<Invoice[]>(() => getInvoicesByProject(project.id));
  const [files, setFiles] = useState<FileItem[]>(() => getFiles().filter(f => f.projectId === project.id));
  const [addingDeliverable, setAddingDeliverable] = useState(false);
  const [newDlTitle, setNewDlTitle] = useState('');
  const [newDlFormat, setNewDlFormat] = useState<DeliverableFormat>('16:9');
  const [newDlType, setNewDlType] = useState<DeliverableType>('video');
  // Which section of the project's own Kanban a new deliverable lands in —
  // was silently hardcoded to a "Livraison" section it created behind the
  // scenes; now the user picks, defaulting to an existing "Livraison"
  // section if there is one, else the project's first section.
  const [newDlSection, setNewDlSection] = useState('');
  const [newDlSectionCustom, setNewDlSectionCustom] = useState('');
  const [editingDlId, setEditingDlId] = useState<string | null>(null);
  const [dlTitleDraft, setDlTitleDraft] = useState('');
  // Single open-dropdown tracker for every deliverable row control (link
  // resource / type / format / assignee / priority / status) — the popups
  // render via InlineDropdown (a portal, fixed-positioned from anchorRect),
  // which is what lets them escape the Card's `overflow: hidden` instead of
  // being clipped at the row's edge.
  const [openDl, setOpenDl] = useState<{ id: string; field: 'link' | 'type' | 'format' | 'priority' | 'status' } | null>(null);
  const [dlDropRect, setDlDropRect] = useState<DOMRect | null>(null);
  const openDlDrop = (id: string, field: NonNullable<typeof openDl>['field'], e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setDlDropRect(e.currentTarget.getBoundingClientRect());
    setOpenDl(prev => (prev?.id === id && prev.field === field) ? null : { id, field });
  };

  useEffect(() => {
    return subscribeStore(() => setDeliverables(getDeliverables(project.id)));
  }, [project.id]);

  useEffect(() => subscribeResources(() => setResources(getResources())), []);
  useEffect(() => subscribeInvoices(() => setInvoices(getInvoicesByProject(project.id))), [project.id]);
  useEffect(() => subscribeFileStore(() => setFiles(getFiles().filter(f => f.projectId === project.id))), [project.id]);
  const [, forceActivityTick] = useState(0);
  useEffect(() => subscribeNotifs(() => forceActivityTick(n => n + 1)), []);

  const [notes, setNotes] = useState('');
  const [customSections, setCustomSections] = useState<CustomOverviewSection[]>([]);
  const [customSectionData, setCustomSectionData] = useState<Record<string, string | Record<string, string>>>({});
  const [addingSectionOpen, setAddingSectionOpen] = useState(false);
  const [saveOverviewTemplateModalOpen, setSaveOverviewTemplateModalOpen] = useState(false);
  const [editingSectionId, setEditingSectionId] = useState<string | null>(null);
  const [sectionMenuOpenId, setSectionMenuOpenId] = useState<string | null>(null);

  const handleAddSection = (section: CustomOverviewSection) => {
    setCustomSections(prev => [...prev, section]);
    setAddingSectionOpen(false);
  };
  const handleEditSection = (updated: CustomOverviewSection) => {
    setCustomSections(prev => prev.map(s => s.id === updated.id ? updated : s));
    setEditingSectionId(null);
  };
  const handleDeleteSection = (id: string) => {
    if (!confirm(t('overview.confirmDeleteSection'))) return;
    setCustomSections(prev => prev.filter(s => s.id !== id));
    setCustomSectionData(prev => { const next = { ...prev }; delete next[id]; return next; });
    setSectionMenuOpenId(null);
  };
  // Une section verrouillée (Vision) reste toujours en première position — on ne
  // permute jamais par-dessus elle, ce qui garde ce garde-fou correct même si
  // handleMoveSection est un jour appelé depuis un contexte qui l'oublierait.
  const handleMoveSection = (id: string, dir: 'up' | 'down') => {
    setCustomSections(prev => {
      const idx = prev.findIndex(s => s.id === id);
      const swapIdx = dir === 'up' ? idx - 1 : idx + 1;
      if (idx < 0 || swapIdx < 0 || swapIdx >= prev.length || prev[swapIdx].locked) return prev;
      const next = [...prev];
      [next[idx], next[swapIdx]] = [next[swapIdx], next[idx]];
      return next;
    });
  };

  // Charger un modèle d'Aperçu (ou "aucun modèle" via id '__none__') — remplace les
  // sections personnalisées mais préserve toujours la section Vision (verrouillée)
  // et sa valeur actuelle, comportement déjà correct, juste ré-entré via le menu partagé.
  const applyTemplateById = (id: string | null) => {
    const tpl = id && id !== '__none__'
      ? loadAllResourceTemplates().find(tp => tp.id === id && tp.type === 'overview')
      : null;
    if (id && id !== '__none__' && !tpl) return;
    if (!confirm(t('overview.confirmChangeOverviewTemplate'))) return;
    const vision = customSections.find(s => s.id === VISION_SECTION_ID) ?? getDefaultVisionSection();
    const newSections = [vision, ...(tpl?.overviewSections ?? []).filter(s => s.id !== VISION_SECTION_ID)];
    setCustomSections(newSections);
    setCustomSectionData(prev => {
      const next: Record<string, string | Record<string, string>> = {};
      if (prev[VISION_SECTION_ID] !== undefined) next[VISION_SECTION_ID] = prev[VISION_SECTION_ID];
      return next;
    });
    updateProject(project.id, { overviewTemplateId: tpl?.id ?? null });
  };

  // Load persisted content whenever the viewed project changes — TravailOverview
  // isn't remounted on /projets/:id/overview navigation (see the project.id-keyed
  // effects above), so this can't just be the useState initializer.
  const loadedContentRef = useRef<{
    projectId: string; notes: string;
    customSections: CustomOverviewSection[]; customSectionData: Record<string, string | Record<string, string>>;
  } | null>(null);
  // Miroir synchrone de l'état courant — lu depuis le callback d'abonnement
  // (qui ne doit pas se ré-enregistrer à chaque frappe).
  const stateRef = useRef({ notes, customSections, customSectionData });
  stateRef.current = { notes, customSections, customSectionData };

  const applyLoadedContent = useCallback(() => {
    const c = getProjectContent(project.id);
    const loadedNotes = c.notes ?? '';
    const loadedSections = (c.customSections ?? []).some(s => s.id === VISION_SECTION_ID)
      ? (c.customSections ?? [])
      : [getDefaultVisionSection(), ...(c.customSections ?? [])];
    const loadedData = c.customSectionData ?? {};
    setNotes(loadedNotes);
    setCustomSections(loadedSections);
    setCustomSectionData(loadedData);
    loadedContentRef.current = { projectId: project.id, notes: loadedNotes, customSections: loadedSections, customSectionData: loadedData };
  }, [project.id]);

  useEffect(() => { applyLoadedContent(); }, [applyLoadedContent]);

  // Session réelle : `getProjectContent` est synchrone et renvoie {} tant que le
  // fetch Supabase n'a pas résolu. Sans ça, la 1re lecture « à froid » restait
  // vide et une édition faite entre-temps écrasait le contenu serveur.
  // On ne ré-applique que si l'utilisateur n'a rien modifié depuis le chargement.
  useEffect(() => subscribeProjectContent(() => {
    const loaded = loadedContentRef.current;
    if (!loaded || loaded.projectId !== project.id) return;
    const cur = stateRef.current;
    const pristine =
      loaded.notes === cur.notes &&
      JSON.stringify(loaded.customSections) === JSON.stringify(cur.customSections) &&
      JSON.stringify(loaded.customSectionData) === JSON.stringify(cur.customSectionData);
    if (!pristine) return; // édition en cours — ne pas l'écraser
    applyLoadedContent();
  }), [project.id, applyLoadedContent]);

  // Debounced save — skipped when the current values are exactly what was
  // just loaded (avoids re-saving on mount / project switch).
  useEffect(() => {
    const loaded = loadedContentRef.current;
    if (!loaded || loaded.projectId !== project.id) return;
    if (
      loaded.notes === notes &&
      JSON.stringify(loaded.customSections) === JSON.stringify(customSections) &&
      JSON.stringify(loaded.customSectionData) === JSON.stringify(customSectionData)
    ) return;
    const timer = window.setTimeout(() => setProjectContent(project.id, { notes, customSections, customSectionData }), 500);
    return () => clearTimeout(timer);
  }, [notes, customSections, customSectionData, project.id]);

  const toggleCompleted = () => {
    updateProject(project.id, { completed: !completed });
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
          <TemplateMenuButton
            icon="layout-panel-top"
            loadOptions={[
              { id: '__none__', name: t('overview.overviewTemplateNoneNew'), icon: 'x' },
              ...loadAllResourceTemplates().filter((tpl): tpl is ResourceTemplate => tpl.type === 'overview').map(tpl => ({ id: tpl.id, name: tpl.name, icon: tpl.icon })),
            ]}
            onLoad={applyTemplateById}
            onSave={() => setSaveOverviewTemplateModalOpen(true)}
            loadLabel={t('templateMenuLoad')}
            saveLabel={t('templateMenuSave')}
          />
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
              <SFIcon name="circle-check" size={15} color="var(--ok)" />
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
              <SFIcon name="circle-check" size={18} color="var(--ok)" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--ok)' }}>{t('overview.projectMarkedDone')}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>{t('overview.projectArchivedDesc')}</p>
              </div>
              <button onClick={toggleCompleted} style={{ marginLeft: 'auto', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                <SFIcon name="x" size={14} />
              </button>
            </div>
          )}

          {/* ── Factures ── */}
          <Card title={t('overview.invoicesTitle')} icon="receipt" action={<SFButton variant="ghost" size="sm" icon="plus" onClick={() => navigate(`/projets/${project.id}/finances`)}>{t('overview.newInvoice')}</SFButton>}>
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
              <SFButton variant="ghost" size="sm" icon="plus" onClick={() => {
                setAddingDeliverable(true); setNewDlTitle(''); setNewDlFormat('16:9');
                const existing = getSections(project.id);
                setNewDlSection(existing.find(s => s.label === 'Livraison')?.label ?? existing[0]?.label ?? 'Livraison');
                setNewDlSectionCustom('');
              }}>
                {t('overview.add')}
              </SFButton>
            }
          >
            {/* Column headers */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 100px 36px 100px 90px 28px', gap: 10, padding: '6px 18px', borderBottom: '1px solid var(--border)', background: 'var(--surface-2)' }}>
              {[t('overview.colDeliverable'), t('overview.colType'), t('overview.colFormat'), t('overview.colPriority'), t('overview.colAssignee'), t('overview.colStatus'), '', ''].map((h, i) => (
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
              const isPickerOpen = openDl?.id === dl.id && openDl.field === 'format';
              const isTypeOpen = openDl?.id === dl.id && openDl.field === 'type';
              const isStatusOpen = openDl?.id === dl.id && openDl.field === 'status';
              const priority: Priority = dl.priority ?? 'none';
              const linkedIds = dl.linkedResources ?? [];
              const linkedRes = resources.filter(r => linkedIds.includes(r.id));
              const isLinkOpen = openDl?.id === dl.id && openDl.field === 'link';
              const toggleResource = (rid: string) => updateTask(project.id, dl.id, {
                linkedResources: linkedIds.includes(rid) ? linkedIds.filter(id => id !== rid) : [...linkedIds, rid],
              });
              const isEditingTitle = editingDlId === dl.id;
              const commitDlTitle = () => {
                const val = dlTitleDraft.trim();
                setEditingDlId(null);
                if (val && val !== dl.title) updateTask(project.id, dl.id, { title: val });
              };
              const handleDeleteDl = () => {
                const snapshot = dl;
                deleteTask(project.id, dl.id);
                showToast({
                  type: 'task',
                  message: 'Livrable supprimé',
                  onUndo: () => addDeliverable(project.id, snapshot),
                });
              };
              return (
                <div key={dl.id} style={{ display: 'grid', gridTemplateColumns: '1fr 110px 120px 100px 36px 100px 90px 28px', gap: 10, alignItems: 'center', padding: '11px 18px', borderBottom: '1px solid var(--border)', transition: 'background 0.1s', position: 'relative' }}
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
                        {isEditingTitle ? (
                          <input
                            autoFocus
                            value={dlTitleDraft}
                            onChange={e => setDlTitleDraft(e.target.value)}
                            onBlur={commitDlTitle}
                            onKeyDown={e => {
                              if (e.key === 'Enter') { e.preventDefault(); commitDlTitle(); }
                              if (e.key === 'Escape') setEditingDlId(null);
                              e.stopPropagation();
                            }}
                            onClick={e => e.stopPropagation()}
                            style={{ fontSize: 13, fontWeight: 500, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-3)', color: 'var(--text)', fontFamily: 'var(--ff-text)', outline: 'none', boxSizing: 'content-box', width: `${Math.max(4, dlTitleDraft.length + 1)}ch`, maxWidth: '100%' }}
                          />
                        ) : (
                          <p
                            onClick={e => { e.stopPropagation(); setDlTitleDraft(dl.title); setEditingDlId(dl.id); }}
                            title={t('overview.editTitle')}
                            style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text' }}
                          >{dl.title}</p>
                        )}
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
                    <div style={{ flexShrink: 0 }}>
                      <button onClick={e => openDlDrop(dl.id, 'link', e)}
                        title={t('overview.linkExistingResource')}
                        style={{ display: 'flex', alignItems: 'center', gap: 4, background: isLinkOpen ? 'rgba(249,255,0,0.08)' : 'var(--surface-3)', border: `1px solid ${isLinkOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 8px', cursor: 'pointer', color: linkedRes.length ? 'var(--accent)' : 'var(--text-3)' }}>
                        <SFIcon name="paperclip" size={12} color={linkedRes.length ? 'var(--accent)' : 'var(--text-3)'} />
                        {linkedRes.length > 0 && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10 }}>{linkedRes.length}</span>}
                      </button>
                      {isLinkOpen && (
                        <InlineDropdown onClose={() => setOpenDl(null)} anchorRect={dlDropRect} minWidth={280} zIndex={1000}>
                          <div style={{ maxHeight: 320, overflowY: 'auto', width: 280 }}>
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
                                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>{r.eyebrow.startsWith('files.') ? t(r.eyebrow) : r.eyebrow}</p>
                                  </div>
                                  {on && <SFIcon name="check" size={13} color="var(--accent)" />}
                                </button>
                              );
                            })}
                          </div>
                        </InlineDropdown>
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
                  <div>
                    <button onClick={e => openDlDrop(dl.id, 'type', e)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-3)', border: `1px solid ${isTypeOpen ? 'var(--accent)' : 'var(--border)'}`, borderRadius: 8, padding: '4px 10px', cursor: 'pointer', color: 'var(--text-2)', fontSize: 11, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
                      <SFIcon name={dlType.icon} size={12} color="var(--text-3)" />
                      {t(dlType.labelKey)}
                      <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                    </button>
                    {isTypeOpen && (
                      <InlineDropdown onClose={() => setOpenDl(null)} anchorRect={dlDropRect} minWidth={150}>
                        {DELIVERABLE_TYPES.map(dt => (
                          <button key={dt.value} onClick={() => { updateTask(project.id, dl.id, { deliverableType: dt.value }); setOpenDl(null); }}
                            style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none', background: dl.deliverableType === dt.value ? 'rgba(249,255,0,0.07)' : 'transparent', color: dl.deliverableType === dt.value ? 'var(--accent)' : 'var(--text)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)', textAlign: 'left' }}
                            onMouseEnter={e => { if (dl.deliverableType !== dt.value) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                            onMouseLeave={e => { if (dl.deliverableType !== dt.value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                            <SFIcon name={dt.icon} size={13} color={dl.deliverableType === dt.value ? 'var(--accent)' : 'var(--text-3)'} />
                            {t(dt.labelKey)}
                            {dl.deliverableType === dt.value && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                          </button>
                        ))}
                      </InlineDropdown>
                    )}
                  </div>

                  {/* Format — clickable dropdown */}
                  <div>
                    <button onClick={e => openDlDrop(dl.id, 'format', e)}
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
                      <InlineDropdown onClose={() => setOpenDl(null)} anchorRect={dlDropRect} minWidth={260}>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, width: 260, padding: 3 }}>
                          {FORMAT_OPTIONS.map(f => (
                            <button key={f.value}
                              onClick={() => { updateTask(project.id, dl.id, { format: f.value }); setOpenDl(null); }}
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
                      </InlineDropdown>
                    )}
                  </div>

                  {/* Priorité — clickable dropdown */}
                  <div>
                    <button onClick={e => openDlDrop(dl.id, 'priority', e)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px' }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
                      {priority !== 'none' && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(PRIORITY_LABEL_KEY[priority])}</span>}
                      <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                    </button>
                    {openDl?.id === dl.id && openDl.field === 'priority' && (
                      <InlineDropdown onClose={() => setOpenDl(null)} anchorRect={dlDropRect}>
                        {PRIORITY_OPTIONS.map(p => ddItem(() => { updateTask(project.id, dl.id, { priority: p, priorityLabel: t(PRIORITY_LABEL_KEY[p]) }); setOpenDl(null); },
                          <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>,
                          priority === p
                        ))}
                      </InlineDropdown>
                    )}
                  </div>

                  {/* Assignés */}
                  <div>
                    <AssigneeGroup
                      assignees={dl.assignees}
                      size={24}
                      onChange={next => updateTask(project.id, dl.id, { assignees: next })}
                    />
                  </div>

                  {/* Statut — clickable dropdown */}
                  <div>
                    <button onClick={e => openDlDrop(dl.id, 'status', e)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px' }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 600, color: st.color }}>{t(st.labelKey)}</span>
                      <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                    </button>
                    {isStatusOpen && (
                      <InlineDropdown onClose={() => setOpenDl(null)} anchorRect={dlDropRect}>
                        {DELIVERABLE_STATUS_OPTIONS.map(o => ddItem(() => { updateTask(project.id, dl.id, { status: o.value as Task['status'], statusLabel: t(o.labelKey) }); setOpenDl(null); },
                          <><span style={{ width: 7, height: 7, borderRadius: '50%', background: o.color, display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>,
                          dl.status === o.value
                        ))}
                      </InlineDropdown>
                    )}
                  </div>

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

                  <button
                    onClick={e => { e.stopPropagation(); handleDeleteDl(); }}
                    title={t('overview.deleteDeliverable')}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'none', border: 'none', borderRadius: 7, padding: 6, cursor: 'pointer', color: 'var(--text-3)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <SFIcon name="trash-2" size={13} />
                  </button>
                </div>
              );
            })}

            {/* Inline add form */}
            {addingDeliverable && (
              <div style={{ padding: '12px 18px', borderTop: deliverables.length ? '1px solid var(--border)' : 'none', background: 'rgba(249,255,0,0.03)', display: 'flex', flexDirection: 'column', gap: 10 }}>
                {(() => {
                  const submitNewDl = () => {
                    if (!newDlTitle.trim()) return;
                    const task: Task = {
                      id: `dl-${Date.now()}`,
                      title: newDlTitle.trim(),
                      projectId: project.id,
                      projectName: project.name,
                      projectColor: project.clientColor,
                      assignees: [],
                      status: '' as Task['status'],
                      statusLabel: t(DELIVERABLE_STATUS_OPTIONS.find(o => o.value === '')!.labelKey),
                      priority: 'none',
                      priorityLabel: t(PRIORITY_LABEL_KEY.none),
                      dueDate: '—',
                      dueDateRed: false,
                      checked: false,
                      subtasks: [],
                      deliverable: true,
                      deliverableType: newDlType,
                      format: newDlFormat,
                    };
                    addDeliverable(project.id, task, (newDlSectionCustom.trim() || newDlSection).trim() || undefined);
                    setAddingDeliverable(false);
                    setNewDlTitle('');
                  };
                  return (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        autoFocus
                        value={newDlTitle}
                        onChange={e => setNewDlTitle(e.target.value)}
                        onKeyDown={e => {
                          if (e.key === 'Enter') { e.preventDefault(); submitNewDl(); }
                          if (e.key === 'Escape') setAddingDeliverable(false);
                        }}
                        placeholder="Nom du livrable…"
                        style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', outline: 'none', boxSizing: 'border-box' }}
                      />
                      <SFButton variant="primary" size="sm" icon="check" disabled={!newDlTitle.trim()} onClick={submitNewDl}>
                        {t('overview.add')}
                      </SFButton>
                    </div>
                  );
                })()}
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Type :</span>
                  {DELIVERABLE_TYPES.map(dt => (
                    <button key={dt.value} onClick={() => setNewDlType(dt.value)} title={t(dt.labelKey)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 7, border: `1px solid ${newDlType === dt.value ? 'var(--accent)' : 'var(--border)'}`, background: newDlType === dt.value ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', color: newDlType === dt.value ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                      <SFIcon name={dt.icon} size={11} />
                      {t(dt.labelKey)}
                    </button>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Section :</span>
                  {getSections(project.id).map(s => (
                    <button key={s.label} onClick={() => { setNewDlSection(s.label); setNewDlSectionCustom(''); }}
                      style={{ padding: '4px 9px', borderRadius: 7, border: `1px solid ${!newDlSectionCustom && newDlSection === s.label ? 'var(--accent)' : 'var(--border)'}`, background: !newDlSectionCustom && newDlSection === s.label ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', color: !newDlSectionCustom && newDlSection === s.label ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                      {s.label}
                    </button>
                  ))}
                  <input
                    value={newDlSectionCustom}
                    onChange={e => setNewDlSectionCustom(e.target.value)}
                    placeholder={t('taskPanel.orCreateSection')}
                    style={{ width: 160, padding: '4px 9px', borderRadius: 7, border: '1px dashed var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
                  />
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

          {/* ── Sections personnalisées ── */}
          {customSections.map((section, sectionIdx) => (
            <Card key={section.id} title={section.title} icon={section.icon} collapsible defaultOpen={true} persistKey={`${project.id}_${section.id}`}
              action={
                <div style={{ display: 'flex', alignItems: 'center', gap: 2 }}>
                  {!section.locked && (
                    <>
                      <button onClick={() => handleMoveSection(section.id, 'up')}
                        disabled={sectionIdx === 0 || customSections[sectionIdx - 1].locked}
                        title={t('overview.moveSectionUp')}
                        style={{ background: 'none', border: 'none', display: 'flex', padding: 4, borderRadius: 6, color: 'var(--text-3)', cursor: (sectionIdx === 0 || customSections[sectionIdx - 1].locked) ? 'default' : 'pointer', opacity: (sectionIdx === 0 || customSections[sectionIdx - 1].locked) ? 0.3 : 1 }}>
                        <SFIcon name="chevron-up" size={14} />
                      </button>
                      <button onClick={() => handleMoveSection(section.id, 'down')}
                        disabled={sectionIdx === customSections.length - 1}
                        title={t('overview.moveSectionDown')}
                        style={{ background: 'none', border: 'none', display: 'flex', padding: 4, borderRadius: 6, color: 'var(--text-3)', cursor: sectionIdx === customSections.length - 1 ? 'default' : 'pointer', opacity: sectionIdx === customSections.length - 1 ? 0.3 : 1 }}>
                        <SFIcon name="chevron-down" size={14} />
                      </button>
                    </>
                  )}
                <div style={{ position: 'relative' }}>
                  <button onClick={() => setSectionMenuOpenId(sectionMenuOpenId === section.id ? null : section.id)}
                    title={t('overview.sectionOptions')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}>
                    <SFIcon name="ellipsis" size={15} />
                  </button>
                  {sectionMenuOpenId === section.id && (
                    <>
                      <div onClick={() => setSectionMenuOpenId(null)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
                      <div style={{ position: 'absolute', top: 'calc(100% + 4px)', right: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                        <button onClick={() => { setEditingSectionId(section.id); setSectionMenuOpenId(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                          <SFIcon name="square-pen" size={12} /> {t('overview.renameSection')}
                        </button>
                        {!section.locked && (
                          <button onClick={() => handleDeleteSection(section.id)}
                            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'none', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left' }}>
                            <SFIcon name="trash-2" size={12} /> {t('overview.deleteSection')}
                          </button>
                        )}
                      </div>
                    </>
                  )}
                </div>
                </div>
              }
            >
              <div style={{ padding: '14px 18px' }}>
                {section.kind === 'note' ? (
                  <textarea
                    value={(customSectionData[section.id] as string) ?? ''}
                    onChange={e => setCustomSectionData(prev => ({ ...prev, [section.id]: e.target.value }))}
                    rows={5}
                    style={{ width: '100%', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box', colorScheme: 'dark' }}
                  />
                ) : (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                    {(section.fields ?? []).map(field => {
                      const values = (customSectionData[section.id] as Record<string, string>) ?? {};
                      const onChange = (v: string) => setCustomSectionData(prev => ({
                        ...prev,
                        [section.id]: { ...(prev[section.id] as Record<string, string> ?? {}), [field.id]: v },
                      }));
                      return (
                        <VisionField
                          key={field.id}
                          label={field.label}
                          placeholder=""
                          value={values[field.id] ?? ''}
                          onChange={onChange}
                          multiline={field.multiline}
                        />
                      );
                    })}
                  </div>
                )}
              </div>
            </Card>
          ))}

          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setAddingSectionOpen(true)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '9px 16px', borderRadius: 10, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="plus" size={13} /> {t('overview.addSection')}
            </button>
          </div>

          {saveOverviewTemplateModalOpen && (
            <SaveOverviewTemplateModal
              projectName={project.name}
              customSections={customSections}
              originTemplate={originTemplate}
              onClose={() => setSaveOverviewTemplateModalOpen(false)}
            />
          )}

          {addingSectionOpen && (
            <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}
              onMouseDown={e => { if (e.target === e.currentTarget) setAddingSectionOpen(false); }}>
              <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                <OverviewSectionForm onSave={handleAddSection} onCancel={() => setAddingSectionOpen(false)} />
              </div>
            </div>
          )}

          {editingSectionId && (() => {
            const section = customSections.find(s => s.id === editingSectionId);
            if (!section) return null;
            return (
              <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 500 }}
                onMouseDown={e => { if (e.target === e.currentTarget) setEditingSectionId(null); }}>
                <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', width: 420, boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
                  <OverviewSectionForm initial={section} onSave={handleEditSection} onCancel={() => setEditingSectionId(null)} />
                </div>
              </div>
            );
          })()}

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
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)' }}>{stats.progress}%</span>
                </div>
                <SFBar value={stats.progress} height={5} />
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
                    <SFIcon name="circle-check" size={12} color="var(--ok)" />
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>
                      {stats.doneCount}/{stats.taskCount}
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
                  <SFBar value={totalInvoiced === 0 ? 0 : Math.round((totalPaid / totalInvoiced) * 100)} height={4} />
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
          color={project.clientColor}
          name={project.name}
          status={project.status}
          statusLabel={project.statusLabel}
          phase={project.phase}
          phaseLabel={project.phaseLabel}
          deliveryDate={project.deliveryDate}
          onClose={() => setEditOpen(false)}
          onSave={(u: EditUpdates) => {
            // Same shared project.clientColor field as the other project
            // edit panels (ProjectCard/ProjectsListView/ProjectHeaderBar) —
            // this used to write to the per-user sidebar color override
            // (pinnedStore) instead, so it "worked" but silently diverged
            // from what everyone else on the team saw for this project.
            updateProject(project.id, {
              name: u.name, clientColor: u.color, status: u.status, statusLabel: u.statusLabel,
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
            onMouseDown={e => { if (e.target === e.currentTarget) setApprovalModal(false); }}>
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
                      onClick={() => {
                        addNotif({
                          kind: 'approval',
                          actor: getStudioInfo().name || 'Rush',
                          text: `a demandé l'approbation finale du projet « ${project.name} »`,
                          timestamp: Date.now(),
                          projectId: project.id,
                        });
                        if (!isDemoSession() && approver.email) {
                          const studioName = getStudioInfo().name || 'Rush';
                          const link = `${window.location.origin}/projets/${project.id}/overview`;
                          void sendEmail(
                            approver.email,
                            `${studioName} vous demande d'approuver le projet « ${project.name} »`,
                            `<div style="font-family: sans-serif; max-width: 480px; margin: 0 auto;">
                              <p>Bonjour ${approver.name || ''},</p>
                              <p><strong>${studioName}</strong> vous demande d'approuver la livraison finale du projet <strong>${project.name}</strong>.</p>
                              <p><a href="${link}" style="display: inline-block; padding: 10px 20px; background: #f9ff00; color: #14140a; text-decoration: none; border-radius: 8px; font-weight: 600;">Voir le projet</a></p>
                            </div>`
                          );
                        }
                        setApprovalSent(true);
                      }}
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
