import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SFButton, SFIcon, PageHeader } from '../components/ui';
import { USERS } from '../data/mock';
import { addProject, createTemplateDraft } from '../data/projectStore';
import { getClients } from '../data/clientStore';
import { setSections } from '../data/taskStore';
import { addFolderTree } from '../data/fileStore';
import { setProjectContent } from '../data/projectContentStore';
import { getCurrentUser } from '../data/authStore';
import { addWatchers } from '../data/watchers';
import { confirmDialog } from '../data/confirmStore';
import type { ProjectTemplate, FormTemplate, FormField, FormFieldType, FormFieldValue, FormResponse, FormInstance, ResourceTemplate, ResourceTemplateType, DocumentSection, SceneBlock, ReviewRound, MoodboardRef } from '../data/templates';
import { loadAllTemplates, saveCustomTemplates, loadAllFormTemplates, saveCustomFormTemplates, getVisibleBuiltInFormTemplates, BUILT_IN_FORM_TEMPLATES, loadAllResourceTemplates, saveCustomResourceTemplates, hideTemplate, getHiddenTemplateIds, unhideTemplate, subscribeHiddenTemplates, resolveTasksSections, ensureDefaultTemplatesSeeded } from '../data/templates';
import { getFormInstances, createFormInstance, updateFormInstance, deleteFormInstance, subscribeFormStore } from '../data/formStore';
import { getFavoriteTemplateIds, toggleTemplateFavorite, subscribeTemplateFavorites } from '../data/templateFavoritesStore';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
import type { Priority, ResourceType, Resource, Task, Project, SectionData } from '../types';
import { DocumentView, ScreenplayView, MoodboardView, FormView } from './ResourceDetail';
import type { ScriptEl, ScriptElType, FormQuestion, FormQType } from './ResourceDetail';
import { VideoReviewBody } from './VideoReview';
import { KIND_LABEL_KEY } from '../components/OverviewSectionForm';
import { usePersistedState } from '../hooks/usePersistedState';

// ── Form field ↔ FormQuestion converters ──────────────────────────────────────

const FIELD_TO_QTYPE: Record<FormFieldType, FormQType> = {
  text: 'short', textarea: 'long', choice: 'choice', multi: 'checkbox',
  rating: 'rating', date: 'date', number: 'short', file: 'upload',
};
const QTYPE_TO_FIELD: Record<FormQType, FormFieldType> = {
  short: 'text', long: 'textarea', choice: 'choice', checkbox: 'multi',
  dropdown: 'choice', date: 'date', rating: 'rating', scale: 'rating',
  upload: 'file', section: 'text',
};

function fieldsToQuestions(fields: FormField[]): FormQuestion[] {
  return fields.map(f => ({
    id: f.id,
    type: FIELD_TO_QTYPE[f.type] ?? 'short',
    title: f.label,
    description: '',
    required: f.required ?? false,
    options: (f.options ?? []).map((o, i) => ({ id: `o${i}-${f.id}`, label: o })),
    ratingMax: f.ratingMax ?? 5,
    scaleMin: 1, scaleMax: 5, scaleMinLabel: '', scaleMaxLabel: '',
    placeholder: f.placeholder ?? '',
  }));
}

function questionsToFields(questions: FormQuestion[]): FormField[] {
  return questions.map(q => ({
    id: q.id,
    type: QTYPE_TO_FIELD[q.type],
    label: q.title,
    placeholder: q.placeholder || undefined,
    required: q.required || undefined,
    options: q.options.length ? q.options.map(o => o.label) : undefined,
    ratingMax: (q.type === 'rating' || q.type === 'scale') ? q.ratingMax : undefined,
  }));
}

// ── Template resource view helpers ────────────────────────────────────────────

export function documentSectionsToHTML(sections: DocumentSection[]): string {
  return sections.map(sec =>
    `<h2>${sec.title}</h2><p>${sec.body.replace(/\n/g, '</p><p>')}</p>`
  ).join('\n');
}

// Best-effort reverse of documentSectionsToHTML: split saved HTML on <h2> headings
// into {title, body} pairs, so a document template saved via the live editor still
// has a documentSections list (used for item counts / previews in Modeles.tsx).
export function htmlToDocumentSections(html: string): DocumentSection[] {
  if (!html.trim()) return [];
  const parts = html.split(/<h2[^>]*>/i).filter(Boolean);
  // If there's no <h2> at all, treat the whole thing as a single untitled section.
  if (parts.length === (html.match(/<h2[^>]*>/gi)?.length ?? 0) && parts.length === 0) return [];
  if (!/<h2[^>]*>/i.test(html)) {
    const body = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
    return body ? [{ title: 'Section', body }] : [];
  }
  return parts.map(part => {
    const closeIdx = part.indexOf('</h2>');
    const title = (closeIdx >= 0 ? part.slice(0, closeIdx) : part).replace(/<[^>]+>/g, '').trim();
    const rest = closeIdx >= 0 ? part.slice(closeIdx + 5) : '';
    const body = rest.replace(/<\/p>\s*<p>/gi, '\n').replace(/<[^>]+>/g, '').trim();
    return { title: title || 'Section', body };
  }).filter(sec => sec.title || sec.body);
}

export function sceneBlocksToElements(blocks: SceneBlock[]): ScriptEl[] {
  return blocks.flatMap(b => [
    { id: b.id + '_scene', type: 'scene' as ScriptElType, text: `${b.location} — ${b.time}` },
    { id: b.id + '_action', type: 'action' as ScriptElType, text: b.action },
  ]);
}

export function elementsToSceneBlocks(elements: ScriptEl[]): SceneBlock[] {
  const blocks: SceneBlock[] = [];
  let i = 0;
  while (i < elements.length) {
    const el = elements[i];
    if (el.type === 'scene') {
      const parts = el.text.split(' — ');
      const location = parts[0] ?? el.text;
      const time = parts.slice(1).join(' — ') || '';
      const nextEl = elements[i + 1];
      const action = nextEl?.type === 'action' ? nextEl.text : '';
      blocks.push({ id: el.id.replace('_scene', '').replace(/_scene$/, '') || `sc-${i}`, location, time, action });
      i += action ? 2 : 1;
    } else {
      i++;
    }
  }
  return blocks;
}

// ── TemplateResourceView ───────────────────────────────────────────────────────

function TemplateResourceView({ tpl, onClose, onSave }: {
  tpl: ResourceTemplate;
  onClose: () => void;
  onSave: (updated: ResourceTemplate) => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(tpl.name);
  const [editingName, setEditingName] = useState(false);
  const [dirty, setDirty] = useState(false);

  const docContentRef = useRef<(() => string) | null>(null);
  const screenplayContentRef = useRef<(() => ScriptEl[]) | null>(null);

  const fakeResource: Resource = {
    id: tpl.id, type: tpl.type as ResourceType,
    eyebrow: tpl.type, title: name,
    status: 'neutral', statusLabel: t('models.templateBadge'), meta: '',
  };

  const handleSave = () => {
    const updated: ResourceTemplate = { ...tpl, name };
    if (tpl.type === 'document' && docContentRef.current) {
      updated.rawHTML = docContentRef.current();
    }
    if (tpl.type === 'screenplay' && screenplayContentRef.current) {
      updated.sceneBlocks = elementsToSceneBlocks(screenplayContentRef.current());
    }
    onSave(updated);
    setDirty(false);
  };

  const seedHTML = tpl.rawHTML ?? (tpl.documentSections ? documentSectionsToHTML(tpl.documentSections) : undefined);
  const seedElements = tpl.rawElements
    ? (JSON.parse(tpl.rawElements) as ScriptEl[])
    : tpl.sceneBlocks ? sceneBlocksToElements(tpl.sceneBlocks) : undefined;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
          <SFIcon name="arrow-left" size={13} />
          {t('nav.models')}
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: `${tpl.color}22`, color: tpl.color, fontSize: 10, fontFamily: 'var(--ff-mono)', border: `1px solid ${tpl.color}44`, flexShrink: 0 }}>
          <SFIcon name={tpl.icon} size={10} />
          {t(RES_TYPE_LABEL_KEYS[tpl.type])}
        </span>
        {editingName ? (
          <input autoFocus value={name}
            onChange={e => { setName(e.target.value); setDirty(true); }}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false); }}
            style={{ flex: 1, fontSize: 15, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--accent)', borderRadius: 7, padding: '4px 10px', color: 'var(--text)', fontFamily: 'var(--ff-text)', outline: 'none' }}
          />
        ) : (
          <span onClick={() => setEditingName(true)}
            style={{ flex: 1, fontSize: 15, fontWeight: 600, cursor: 'text', padding: '4px 6px', borderRadius: 7, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={t('models.clickToRename')}
          >
            {name}
          </span>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          <SFButton variant={dirty ? 'primary' : 'secondary'} icon="save" onClick={handleSave}>
            {dirty ? t('models.saveDirty') : t('models.save')}
          </SFButton>
          <button onClick={onClose} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tpl.type === 'document' && <DocumentView resource={fakeResource} seedHTML={seedHTML} contentRef={docContentRef} onEdit={() => setDirty(true)} />}
        {tpl.type === 'screenplay' && <ScreenplayView resource={fakeResource} seedElements={seedElements} contentRef={screenplayContentRef} onEdit={() => setDirty(true)} />}
        {tpl.type === 'moodboard' && <MoodboardView resource={fakeResource} />}
        {tpl.type === 'video_review' && <VideoReviewBody resource={fakeResource} />}
      </div>
    </div>
  );
}

// ── Shared constants ───────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<Priority, string> = { high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)' };

const TAG_COLORS: Record<string, string> = {
  'Vidéo': '#3b4f8f', 'Social media': '#7d4e57', 'Court format': '#1a6b4a',
  'Corporate': '#3b4f8f', 'Long format': '#5b3ea8', 'Interview': '#a85f3e',
  'Photo': '#7d4e57', 'Portrait': '#5b3ea8', 'Produit': '#1a6b4a',
  'Motion': '#5b3ea8', 'Animation': '#3b4f8f', '2D/3D': '#1a6b4a', 'Libre': '#444',
  'Démarrage': '#3b4f8f', 'Créatif': '#5b3ea8', 'Musique': '#7d4e57', 'Postproduction': '#1a6b4a',
  'Rétroaction': '#1a6b4a', 'Client': '#2a7a8a', 'Post-projet': '#a85f3e',
  'Vente': '#a85f3e', 'Prospect': '#7d4e57', 'Devis': '#3b4f8f',
  'Stratégie': '#2a7a8a', 'Production': '#7d4e57', 'Tournage': '#a85f3e', 'Logistique': '#444',
  'Révision': '#2a7a8a', 'Livrable': '#1a6b4a', 'Branding': '#4a3428', 'Design': '#5b3ea8', 'Identité': '#7d4e57',
};

const FORM_FIELD_TYPE_LABEL_KEYS: Record<FormFieldType, string> = {
  text: 'models.fieldTypeText', textarea: 'models.fieldTypeTextarea', choice: 'models.fieldTypeChoice',
  multi: 'models.fieldTypeMulti', rating: 'models.fieldTypeRating', date: 'models.fieldTypeDate', number: 'models.fieldTypeNumber', file: 'models.fieldTypeFile',
};

const FORM_FIELD_TYPE_ICONS: Record<FormFieldType, string> = {
  text: 'type', textarea: 'align-left', choice: 'circle-dot',
  multi: 'check-square', rating: 'star', date: 'calendar', number: 'hash', file: 'paperclip',
};

const COLORS = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B', '#E85BB8', '#5BE8A8'];

// Simulated project context for AI pre-fill
const SAMPLE_AI_CONTEXT: Record<string, string> = {
  clientName: 'Nova Films',
  projectName: 'Campagne été 2026',
  projectDescription: 'Vidéo promotionnelle pour le lancement de la nouvelle gamme de produits estivaux.',
  deliveryDate: '15 août 2026',
  sector: 'Production audiovisuelle',
};

function fieldStyle(extra?: React.CSSProperties): React.CSSProperties {
  return {
    width: '100%', padding: '8px 10px', borderRadius: 9,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
    outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
    ...extra,
  };
}

function labelStyle(): React.CSSProperties {
  return { fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' };
}

// ── Inline editable field (title / description in detail panels) ──────────────

function InlineEditable({ value, onChange, onBlur, multiline, fontSize, fontWeight, color, placeholder, rows }: {
  value: string; onChange: (v: string) => void; onBlur: () => void;
  multiline?: boolean; fontSize?: number; fontWeight?: number; color?: string;
  placeholder?: string; rows?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [hovered, setHovered] = useState(false);
  const active = focused || hovered;
  const base: React.CSSProperties = {
    width: '100%', fontFamily: 'var(--ff-text)', fontSize: fontSize ?? 13, fontWeight: fontWeight ?? 400,
    color: color ?? 'var(--text)', background: active ? 'var(--surface-3)' : 'transparent',
    border: `1px solid ${focused ? 'var(--accent)' : active ? 'var(--border)' : 'transparent'}`,
    borderRadius: 6, padding: '3px 28px 3px 6px', outline: 'none', display: 'block',
    resize: 'none', lineHeight: 1.5, transition: 'background 0.12s, border-color 0.12s',
    marginLeft: -6, boxSizing: 'border-box',
  };
  return (
    <div style={{ position: 'relative' }} onMouseEnter={() => setHovered(true)} onMouseLeave={() => setHovered(false)}>
      {multiline
        ? <textarea value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur(); }} rows={rows ?? 2} placeholder={placeholder} style={base} />
        : <input value={value} onChange={e => onChange(e.target.value)} onFocus={() => setFocused(true)} onBlur={() => { setFocused(false); onBlur(); }} placeholder={placeholder} style={base} />
      }
      {!focused && (
        <div style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none', opacity: hovered ? 1 : 0, transition: 'opacity 0.12s' }}>
          <SFIcon name="square-pen" size={11} color="var(--text-3)" />
        </div>
      )}
    </div>
  );
}

// ── Template Detail sidebar ────────────────────────────────────────────────────

function TemplateDetail({ tpl, onEdit, onDuplicate, onDelete, onCreateProject, onRename }: {
  tpl: ProjectTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCreateProject: () => void;
  onRename?: (name: string, description: string) => void;
}) {
  const { t } = useTranslation();
  const tplSections = resolveTasksSections(tpl);
  const totalTasks = tplSections.reduce((s, sec) => s + sec.tasks.length, 0);
  const [editName, setEditName] = useState(tpl.name);
  const [editDesc, setEditDesc] = useState(tpl.description);
  useEffect(() => { setEditName(tpl.name); setEditDesc(tpl.description); }, [tpl.id]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        {/* Header: Icon + Title + Description + Stats */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name={tpl.icon} size={24} color="rgba(255,255,255,0.9)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: 4 }}><InlineEditable value={editName} onChange={setEditName} onBlur={() => onRename?.(editName, editDesc)} fontSize={16} fontWeight={700} placeholder={t('models.templateNamePlaceholder')} /></div>
            <div style={{ marginBottom: 6 }}><InlineEditable value={editDesc} onChange={setEditDesc} onBlur={() => onRename?.(editName, editDesc)} multiline rows={2} fontSize={12} color="var(--text-3)" placeholder={t('models.templateDescPlaceholder')} /></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {tpl.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${TAG_COLORS[tag] ?? '#3b4f8f'}22`, color: TAG_COLORS[tag] ?? 'var(--text-3)', border: `1px solid ${TAG_COLORS[tag] ?? '#3b4f8f'}44`, whiteSpace: 'nowrap' }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[{ label: t('models.sections'), value: tplSections.length }, { label: t('models.tasks'), value: totalTasks }].map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--text)' }}>{s.value || '—'}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tplSections.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>{t('models.noSectionBlank')}</p>}
        {tplSections.map((sec, i) => (
          <div key={i}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 6 }}>
              <div style={{ width: 8, height: 8, borderRadius: 2, background: tpl.color, flexShrink: 0 }} />
              <span style={{ fontWeight: 600, fontSize: 12 }}>{sec.label}</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{sec.tasks.length}</span>
            </div>
            <div style={{ paddingLeft: 15, display: 'flex', flexDirection: 'column', gap: 3 }}>
              {sec.tasks.slice(0, 4).map((t, ti) => (
                <div key={ti} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <span style={{ width: 5, height: 5, borderRadius: '50%', background: PRIORITY_COLOR[t.priority], flexShrink: 0, display: 'block' }} />
                  <span style={{ fontSize: 11, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
                </div>
              ))}
              {sec.tasks.length > 4 && <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', paddingLeft: 11 }}>{t('models.moreOthers', { count: sec.tasks.length - 4 })}</span>}
            </div>
          </div>
        ))}
      </div>
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <SFButton variant="primary" icon="plus" onClick={onCreateProject} style={{ width: '100%', justifyContent: 'center' }}>{t('models.createProjectFromTemplate')}</SFButton>
        <div style={{ display: 'flex', gap: 6 }}>
          <SFButton variant="secondary" size="sm" icon="square-pen" onClick={onEdit} style={{ flex: 1, justifyContent: 'center' }}>
            {t('models.edit')}
          </SFButton>
          <SFButton variant="secondary" size="sm" icon="copy" onClick={onDuplicate} style={{ flex: 1, justifyContent: 'center' }}>{t('models.duplicate')}</SFButton>
          <SFButton
            variant="ghost" size="sm"
            icon="trash-2"
            onClick={async () => {
              if (!(await confirmDialog(t('models.deleteConfirm'), { danger: true }))) return;
              onDelete();
            }}
            style={{ color: 'var(--danger)' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Create Project Modal ───────────────────────────────────────────────────────

function CreateProjectModal({ template, onClose }: { template: ProjectTemplate; onClose: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const clients = getClients();
  const [name, setName] = useState('');
  const [clientId, setClientId] = useState(clients[0]?.id ?? '');
  const templateSections = resolveTasksSections(template);

  const handleCreate = () => {
    if (!name.trim()) return;
    const client = clients.find(c => c.id === clientId) ?? clients[0];
    const members = Object.values(USERS).filter(u => u.role !== 'Cliente');
    const owner = members[0] ?? USERS.lea;
    const color = template.color || 'var(--accent)';
    const projectId = `pj${Date.now()}`;

    const newProject: Project = {
      id: projectId,
      name: name.trim(),
      clientId: client?.id ?? '',
      clientName: client?.name ?? t('models.noClient'),
      clientColor: color,
      phase: 'preproduction',
      phaseLabel: t('projects.phasePreproduction'),
      progress: 0,
      taskCount: templateSections.reduce((n, s) => n + s.tasks.length, 0),
      deliverableCount: 0,
      members,
      deliveryDate: '—',
      status: 'info',
      statusLabel: t('projects.statusInProgress'),
      modifiedAt: t('clients.justNow'),
    };

    // Materialize the template's sections + tasks into the project task store.
    const sections: SectionData[] = templateSections.map(sec => ({
      label: sec.label,
      progress: 0,
      tasks: sec.tasks.map((tt, i): Task => ({
        id: `${projectId}-${sec.label}-${i}`,
        title: tt.title,
        projectId,
        projectName: newProject.name,
        projectColor: color,
        assignees: tt.assignees?.length ? tt.assignees : (owner ? [owner] : []),
        status: 'warn',
        statusLabel: t('models.statusWaiting'),
        priority: tt.priority ?? 'normal',
        priorityLabel: tt.priority === 'high' ? t('models.priorityHigh') : tt.priority === 'low' ? t('models.priorityLow') : t('models.priorityNormal'),
        dueDate: tt.dueDate ?? '',
        checked: false,
        subtasks: [],
        watchers: addWatchers([], [getCurrentUser()?.id, owner?.id]),
      })),
    }));
    if (sections.length) setSections(projectId, sections);

    // Materialize the template's folder structure, if any.
    if (template.folderStructure?.length) addFolderTree(template.folderStructure, { projectId });

    addProject(newProject).then(() => {
      if (template.overviewSections?.length) setProjectContent(projectId, { customSections: template.overviewSections });
    });
    onClose();
    navigate(`/projets/${projectId}`);
  };
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 200 }} />
      <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 460, zIndex: 201, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{t('projects.templateLabel', { name: template.name })}</p>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t('models.createNewProject')}</h2>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle()}>{t('projects.projectNameLabel')}</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder={t('models.projectNameExample')} autoFocus style={fieldStyle()} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle()}>{t('projects.client')}</label>
            <select value={clientId} onChange={e => setClientId(e.target.value)} style={{ ...fieldStyle(), colorScheme: 'dark', cursor: 'pointer' }}>
              {clients.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>{t('models.projectWillInclude')}</p>
            <div style={{ display: 'flex', gap: 14 }}>
              {[{ icon: 'layers', val: t('models.sectionsCount', { count: templateSections.length }) }, { icon: 'check-square', val: t('models.tasksCount', { count: templateSections.reduce((s, sec) => s + sec.tasks.length, 0) }) }].map(s => (
                <div key={s.val} style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <SFIcon name={s.icon} size={12} color="var(--text-3)" />
                  <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>{s.val}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="ghost" size="sm" onClick={onClose}>{t('models.cancel')}</SFButton>
          <SFButton variant="primary" size="sm" icon="plus" onClick={handleCreate} style={{ opacity: name.trim() ? 1 : 0.5 }}>{t('models.createProject')}</SFButton>
        </div>
      </div>
    </>
  );
}

// ── Form Template Detail sidebar ───────────────────────────────────────────────

function FormTemplateDetail({ tpl, onEdit, onDuplicate, onDelete, onFill, onRename, currentTab, onTabChange }: {
  tpl: FormTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onFill: () => void;
  onRename?: (name: string, description: string) => void;
  currentTab?: 'apercu' | 'reponses';
  onTabChange?: (tab: 'apercu' | 'reponses') => void;
}) {
  const { t } = useTranslation();
  const [editName, setEditName] = useState(tpl.name);
  const [editDesc, setEditDesc] = useState(tpl.description);
  useEffect(() => { setEditName(tpl.name); setEditDesc(tpl.description); }, [tpl.id]);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        {/* Header: Icon + Title + Description + Stats + Tabs */}
        <div style={{ display: 'flex', gap: 14, marginBottom: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name={tpl.icon} size={24} color="rgba(255,255,255,0.9)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            {tpl.builtIn
              ? <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{tpl.name}</h2>
              : <div style={{ marginBottom: 4 }}><InlineEditable value={editName} onChange={setEditName} onBlur={() => onRename?.(editName, editDesc)} fontSize={16} fontWeight={700} placeholder={t('models.formNamePlaceholder')} /></div>}
            {tpl.builtIn
              ? <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 6 }}>{tpl.description}</p>
              : <div style={{ marginBottom: 6 }}><InlineEditable value={editDesc} onChange={setEditDesc} onBlur={() => onRename?.(editName, editDesc)} multiline rows={2} fontSize={12} color="var(--text-3)" placeholder={t('models.formDescPlaceholder')} /></div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {tpl.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${TAG_COLORS[tag] ?? '#3b4f8f'}22`, color: TAG_COLORS[tag] ?? 'var(--text-3)', border: `1px solid ${TAG_COLORS[tag] ?? '#3b4f8f'}44`, whiteSpace: 'nowrap' }}>{tag}</span>
                ))}
              </div>
              {tpl.builtIn && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600 }}>{t('models.builtIn')}</span>}
            </div>
          </div>
          {/* Tabs on the right */}
          {currentTab !== undefined && onTabChange && (
            <div style={{ display: 'flex', gap: 4, alignSelf: 'flex-start', flexShrink: 0 }}>
              {(['apercu', 'reponses'] as const).map(tabKey => (
                <button key={tabKey} onClick={() => onTabChange(tabKey)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: 500, background: currentTab === tabKey ? 'var(--surface-2)' : 'transparent', color: currentTab === tabKey ? 'var(--text)' : 'var(--text-3)', transition: 'all 0.1s' }}>
                  {tabKey === 'apercu' ? 'Aperçu' : 'Réponses'}
                </button>
              ))}
            </div>
          )}
        </div>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[{ label: t('models.fields'), value: tpl.fields.length }, { label: t('models.required'), value: tpl.fields.filter(f => f.required).length }].map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--text)' }}>{s.value}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Fields preview */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>{t('models.fieldsPreview')}</p>
        {tpl.fields.map((field, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ width: 24, height: 24, borderRadius: 7, background: `${tpl.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SFIcon name={FORM_FIELD_TYPE_ICONS[field.type]} size={12} color={tpl.color} />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{field.label}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t(FORM_FIELD_TYPE_LABEL_KEYS[field.type])}{field.required ? ` · ${t('models.requiredSuffix')}` : ''}{field.aiKey ? ' · IA' : ''}</p>
            </div>
          </div>
        ))}
      </div>

      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <SFButton variant="primary" icon="clipboard-list" onClick={onFill} style={{ width: '100%', justifyContent: 'center' }}>{t('models.fillForm')}</SFButton>
        <div style={{ display: 'flex', gap: 6 }}>
          <SFButton variant="secondary" size="sm" icon="square-pen" onClick={onEdit} style={{ flex: 1, justifyContent: 'center' }}>
            {tpl.builtIn ? t('models.editCopy') : t('models.edit')}
          </SFButton>
          <SFButton variant="secondary" size="sm" icon="copy" onClick={onDuplicate} style={{ flex: 1, justifyContent: 'center' }}>{t('models.duplicate')}</SFButton>
          <SFButton
            variant="ghost" size="sm"
            icon={tpl.builtIn ? 'eye-off' : 'trash-2'}
            onClick={async () => {
              if (tpl.builtIn && !(await confirmDialog(t('models.hideBuiltInConfirm')))) return;
              onDelete();
            }}
            style={{ color: tpl.builtIn ? 'var(--text-3)' : 'var(--danger)' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Form Filler (modal) ────────────────────────────────────────────────────────

function FormFiller({ template, instance, onClose }: {
  template: FormTemplate;
  instance?: FormInstance;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const initResponses = useCallback((): FormResponse[] => {
    if (instance) return instance.responses;
    return template.fields.map(f => ({ fieldId: f.id, value: f.type === 'multi' ? [] : f.type === 'rating' ? 0 : '', aiSuggested: false }));
  }, [template, instance]);

  const [responses, setResponses] = useState<FormResponse[]>(initResponses);
  const [aiApplied, setAiApplied] = useState(false);
  const [savedMsg, setSavedMsg] = useState('');
  const [, setStatus] = useState<'draft' | 'completed'>(instance?.status ?? 'draft');

  const getValue = (fieldId: string): FormFieldValue => {
    return responses.find(r => r.fieldId === fieldId)?.value ?? '';
  };
  const isAiSuggested = (fieldId: string) => responses.find(r => r.fieldId === fieldId)?.aiSuggested ?? false;

  const setValue = (fieldId: string, value: FormFieldValue) => {
    setResponses(prev => prev.map(r => r.fieldId === fieldId ? { ...r, value, aiSuggested: false } : r));
  };

  const applyAI = () => {
    setResponses(prev => prev.map(r => {
      const field = template.fields.find(f => f.id === r.fieldId);
      if (field?.aiKey && SAMPLE_AI_CONTEXT[field.aiKey] && !r.value) {
        return { ...r, value: SAMPLE_AI_CONTEXT[field.aiKey], aiSuggested: true };
      }
      return r;
    }));
    setAiApplied(true);
  };

  const aiMatchCount = template.fields.filter(f => f.aiKey && SAMPLE_AI_CONTEXT[f.aiKey]).length;
  const alreadyAnswered = responses.filter(r => {
    const field = template.fields.find(f => f.id === r.fieldId);
    return field?.aiKey && SAMPLE_AI_CONTEXT[field.aiKey] && r.value;
  }).length;

  const handleSave = (s: 'draft' | 'completed') => {
    setStatus(s);
    if (instance) {
      updateFormInstance(instance.id, responses, s);
    } else {
      createFormInstance({
        id: `fi-${Date.now()}`,
        templateId: template.id,
        templateName: template.name,
        templateColor: template.color,
        responses, status: s,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });
    }
    setSavedMsg(s === 'completed' ? t('models.formSubmitted') : t('models.draftSaved'));
    setTimeout(() => setSavedMsg(''), 2000);
    if (s === 'completed') setTimeout(() => onClose(), 600);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
          <SFIcon name="arrow-left" size={13} />{t('nav.models')}
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: `${template.color}22`, color: template.color, fontSize: 10, fontFamily: 'var(--ff-mono)', border: `1px solid ${template.color}44`, flexShrink: 0 }}>
          <SFIcon name={template.icon} size={10} />{t('models.resForm')}
        </span>
        <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', padding: '4px 6px' }}>{template.name}</span>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          {aiMatchCount > 0 && !aiApplied && (
            <button onClick={applyAI} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: '1px solid rgba(249,255,0,0.3)', background: 'rgba(249,255,0,0.07)', color: 'var(--accent)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="sparkles" size={13} />{t('models.aiPrefill', { count: aiMatchCount - alreadyAnswered })}
            </button>
          )}
          {aiApplied && <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--accent)', fontFamily: 'var(--ff-mono)' }}><SFIcon name="check" size={11} />{t('models.aiApplied')}</span>}
          {savedMsg && <span style={{ fontSize: 11, color: 'var(--ok)', fontFamily: 'var(--ff-mono)' }}>{savedMsg}</span>}
          <SFButton variant="secondary" size="sm" icon="save" onClick={() => handleSave('draft')}>{t('models.draft')}</SFButton>
          <SFButton variant="primary" size="sm" icon="send" onClick={() => handleSave('completed')}>{t('models.submit')}</SFButton>
          <button onClick={onClose} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
      </div>

      {/* Fields */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 0' }}>
        <div style={{ maxWidth: 660, margin: '0 auto', padding: '0 40px', display: 'flex', flexDirection: 'column', gap: 20 }}>
          {template.fields.map((field, idx) => {
            const val = getValue(field.id);
            const ai = isAiSuggested(field.id);
            return (
              <div key={field.id}>
                {field.section && idx > 0 && template.fields[idx - 1].section !== field.section && (
                  <div style={{ borderTop: '1px solid var(--border)', paddingTop: 16, marginBottom: 16 }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{field.section}</p>
                  </div>
                )}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 7 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                    <label style={{ fontSize: 13, fontWeight: 500, flex: 1 }}>
                      {field.label}
                      {field.required && <span style={{ color: 'var(--danger)', marginLeft: 3 }}>*</span>}
                    </label>
                    {ai && (
                      <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: 'var(--accent)', fontFamily: 'var(--ff-mono)', background: 'rgba(249,255,0,0.08)', padding: '2px 7px', borderRadius: 5, border: '1px solid rgba(249,255,0,0.2)' }}>
                        <SFIcon name="sparkles" size={10} /> IA
                      </span>
                    )}
                  </div>

                  {/* Text */}
                  {field.type === 'text' && (
                    <input value={val as string} onChange={e => setValue(field.id, e.target.value)} placeholder={field.placeholder ?? ''} style={fieldStyle(ai ? { borderColor: 'rgba(249,255,0,0.35)', background: 'rgba(249,255,0,0.04)' } : {})} />
                  )}

                  {/* Textarea */}
                  {field.type === 'textarea' && (
                    <textarea value={val as string} onChange={e => setValue(field.id, e.target.value)} placeholder={field.placeholder ?? ''} rows={3} style={fieldStyle({ resize: 'vertical', ...(ai ? { borderColor: 'rgba(249,255,0,0.35)', background: 'rgba(249,255,0,0.04)' } : {}) })} />
                  )}

                  {/* Number */}
                  {field.type === 'number' && (
                    <input type="number" value={val as string} onChange={e => setValue(field.id, e.target.value)} placeholder={field.placeholder ?? ''} style={fieldStyle()} />
                  )}

                  {/* Date */}
                  {field.type === 'date' && (
                    <input type="date" value={val as string} onChange={e => setValue(field.id, e.target.value)} style={fieldStyle()} />
                  )}

                  {/* File */}
                  {field.type === 'file' && (
                    <div style={{ padding: '14px', borderRadius: 9, border: '1px dashed var(--border-2)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, cursor: 'pointer', color: 'var(--text-3)', fontSize: 12 }}>
                      <SFIcon name="upload" size={14} />
                      {t('models.clickToSelectFile')}
                    </div>
                  )}

                  {/* Choice */}
                  {field.type === 'choice' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(field.options ?? []).map(opt => (
                        <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', padding: '7px 10px', borderRadius: 8, border: `1px solid ${val === opt ? template.color : 'var(--border)'}`, background: val === opt ? `${template.color}12` : 'var(--surface-2)', transition: 'all 0.1s' }}>
                          <input type="radio" name={field.id} value={opt} checked={val === opt} onChange={() => setValue(field.id, opt)} style={{ accentColor: template.color, flexShrink: 0 }} />
                          <span style={{ fontSize: 13 }}>{opt}</span>
                        </label>
                      ))}
                    </div>
                  )}

                  {/* Multi */}
                  {field.type === 'multi' && (
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {(field.options ?? []).map(opt => {
                        const checked = (val as string[]).includes(opt);
                        return (
                          <label key={opt} style={{ display: 'flex', alignItems: 'center', gap: 9, cursor: 'pointer', padding: '7px 10px', borderRadius: 8, border: `1px solid ${checked ? template.color : 'var(--border)'}`, background: checked ? `${template.color}12` : 'var(--surface-2)', transition: 'all 0.1s' }}>
                            <input type="checkbox" checked={checked} onChange={e => { const arr = val as string[]; setValue(field.id, e.target.checked ? [...arr, opt] : arr.filter(o => o !== opt)); }} style={{ accentColor: template.color, flexShrink: 0 }} />
                            <span style={{ fontSize: 13 }}>{opt}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {/* Rating */}
                  {field.type === 'rating' && (
                    <div style={{ display: 'flex', gap: 6 }}>
                      {Array.from({ length: field.ratingMax ?? 5 }, (_, i) => i + 1).map(n => (
                        <button key={n} onClick={() => setValue(field.id, n)} style={{ width: 36, height: 36, borderRadius: 9, border: `1px solid ${(val as number) >= n ? template.color : 'var(--border)'}`, background: (val as number) >= n ? `${template.color}22` : 'var(--surface-2)', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s' }}>
                          <SFIcon name="star" size={16} color={(val as number) >= n ? template.color : 'var(--border-2)'} />
                        </button>
                      ))}
                      {(val as number) > 0 && (
                        <span style={{ alignSelf: 'center', fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-3)', marginLeft: 4 }}>{val}/{field.ratingMax ?? 5}</span>
                      )}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

// ── Form Instances panel ───────────────────────────────────────────────────────

function FormInstancesPanel({ templateId, onFillNew, onEditInstance }: {
  templateId: string;
  templateName: string;
  templateColor: string;
  onFillNew: () => void;
  onEditInstance: (inst: FormInstance) => void;
}) {
  const [instances, setInstances] = useState<FormInstance[]>(() => getFormInstances().filter(i => i.templateId === templateId));

  useEffect(() => {
    return subscribeFormStore(() => {
      setInstances(getFormInstances().filter(i => i.templateId === templateId));
    });
  }, [templateId]);

  const handleDelete = async (id: string) => {
    if (!(await confirmDialog('Supprimer cette réponse ?', { danger: true }))) return;
    deleteFormInstance(id);
  };

  if (instances.length === 0) return (
    <div style={{ padding: '24px 20px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
      <div style={{ width: 40, height: 40, borderRadius: 12, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SFIcon name="inbox" size={20} color="var(--text-3)" />
      </div>
      <p style={{ fontSize: 12, color: 'var(--text-3)', textAlign: 'center' }}>Aucune réponse enregistrée pour ce formulaire.</p>
      <SFButton variant="secondary" size="sm" icon="plus" onClick={onFillNew}>Première réponse</SFButton>
    </div>
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6, padding: '0 0 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 20px 4px' }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{instances.length} réponse{instances.length > 1 ? 's' : ''}</p>
        <button onClick={onFillNew} style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)' }}>
          <SFIcon name="plus" size={12} /> Nouvelle réponse
        </button>
      </div>
      {instances.map(inst => (
        <div key={inst.id} style={{ margin: '0 12px', padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
              <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', padding: '1px 6px', borderRadius: 5, background: inst.status === 'completed' ? 'rgba(26,107,74,0.2)' : 'rgba(100,100,100,0.15)', color: inst.status === 'completed' ? '#4caf81' : 'var(--text-3)' }}>
                {inst.status === 'completed' ? 'Soumis' : 'Brouillon'}
              </span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                {new Date(inst.updatedAt).toLocaleDateString('fr-CA', { day: 'numeric', month: 'short', year: 'numeric' })}
              </span>
            </div>
            <p style={{ fontSize: 11, color: 'var(--text-2)' }}>
              {inst.linkedProjectName ?? inst.linkedClientName ?? `${inst.responses.filter(r => r.value && r.value !== '' && (r.value as string[]).length !== 0).length}/${inst.responses.length} champs remplis`}
            </p>
          </div>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => onEditInstance(inst)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }} title="Modifier">
              <SFIcon name="square-pen" size={13} />
            </button>
            <button onClick={() => handleDelete(inst.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }} title="Supprimer" onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
              <SFIcon name="trash-2" size={13} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── Template List Item ─────────────────────────────────────────────────────────

type DragItemProps = {
  canDrag?: boolean;
  isDragging?: boolean;
  isDragOver?: boolean;
  onDragStart?: () => void;
  onDragOver?: (e: React.DragEvent) => void;
  onDrop?: () => void;
  onDragEnd?: () => void;
};

function GripHandle({ visible }: { visible: boolean }) {
  return (
    <div style={{ color: visible ? 'var(--text-4)' : 'transparent', transition: 'color 0.12s', flexShrink: 0, cursor: 'grab', display: 'flex', alignItems: 'center', paddingLeft: 2 }}>
      <SFIcon name="grip-vertical" size={13} />
    </div>
  );
}

function TemplateListItem({ tpl, selected, onClick, canDrag, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, favorite, onToggleFavorite }: {
  tpl: ProjectTemplate; selected: boolean; onClick: () => void; favorite?: boolean; onToggleFavorite?: () => void;
} & DragItemProps) {
  const tplSections = resolveTasksSections(tpl);
  const totalTasks = tplSections.reduce((s, sec) => s + sec.tasks.length, 0);
  const [hovered, setHovered] = useState(false);
  return (
    <div
      draggable={canDrag}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={e => { e.preventDefault(); onDrop?.(); }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: isDragging ? 0.4 : 1, borderTop: isDragOver ? '2px solid var(--accent)' : '2px solid transparent', transition: 'opacity 0.12s', borderRadius: 10, display: 'flex', alignItems: 'center' }}
    >
      <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '9px 10px', paddingLeft: canDrag ? 6 : 10, borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', background: selected ? 'var(--surface-2)' : hovered ? 'var(--surface-2)' : 'transparent', borderLeft: selected ? `3px solid ${tpl.color}` : '3px solid transparent', transition: 'background 0.1s' }}>
        {canDrag && <GripHandle visible={hovered} />}
        <div style={{ width: 32, height: 32, borderRadius: 9, background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SFIcon name={tpl.icon} size={15} color="rgba(255,255,255,0.85)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</p>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
            {tplSections.length > 0 ? `${tplSections.length} sections · ${totalTasks} tâches` : 'Projet vierge'}
          </p>
        </div>
      </button>
      <button onClick={e => { e.stopPropagation(); onToggleFavorite?.(); }} title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', flexShrink: 0, opacity: hovered || favorite ? 1 : 0, transition: 'opacity 0.15s' }}
      >
        <SFIcon name="star" size={13} color={favorite ? '#f5c542' : 'var(--text-3)'} />
      </button>
    </div>
  );
}

function FormTemplateListItem({ tpl, selected, onClick, canDrag, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, favorite, onToggleFavorite }: {
  tpl: FormTemplate; selected: boolean; onClick: () => void; favorite?: boolean; onToggleFavorite?: () => void;
} & DragItemProps) {
  const [hovered, setHovered] = useState(false);
  return (
    <div
      draggable={canDrag}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={e => { e.preventDefault(); onDrop?.(); }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: isDragging ? 0.4 : 1, borderTop: isDragOver ? '2px solid var(--accent)' : '2px solid transparent', transition: 'opacity 0.12s', borderRadius: 10, display: 'flex', alignItems: 'center' }}
    >
      <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '9px 10px', paddingLeft: canDrag ? 6 : 10, borderRadius: 10, border: 'none', cursor: 'pointer', textAlign: 'left', background: selected ? 'var(--surface-2)' : hovered ? 'var(--surface-2)' : 'transparent', borderLeft: selected ? `3px solid ${tpl.color}` : '3px solid transparent', transition: 'background 0.1s' }}>
        {canDrag && <GripHandle visible={hovered} />}
        <div style={{ width: 32, height: 32, borderRadius: 9, background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SFIcon name={tpl.icon} size={15} color="rgba(255,255,255,0.85)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</p>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>
            {tpl.fields.length} champs · {tpl.fields.filter(f => f.required).length} obligatoires
          </p>
        </div>
      </button>
      <button onClick={e => { e.stopPropagation(); onToggleFavorite?.(); }} title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', flexShrink: 0, opacity: hovered || favorite ? 1 : 0, transition: 'opacity 0.15s' }}
      >
        <SFIcon name="star" size={13} color={favorite ? '#f5c542' : 'var(--text-3)'} />
      </button>
    </div>
  );
}

// ── Resource template constants ───────────────────────────────────────────────

const RES_TYPE_LABEL_KEYS: Record<ResourceTemplateType, string> = {
  document: 'models.resDocument', screenplay: 'models.resTypeScreenplay',
  video_review: 'models.resTypeVideoReview', file: 'models.resTypeFile', moodboard: 'models.resMoodboard',
  overview: 'models.resOverview', tasks: 'models.resTypeTasks',
};
const RES_TYPE_ICONS: Record<ResourceTemplateType, string> = {
  document: 'file-text', screenplay: 'clapperboard',
  video_review: 'video', file: 'folder', moodboard: 'grid-2x2',
  overview: 'layout-grid', tasks: 'list-checks',
};

// ── ResourceTemplateListItem ───────────────────────────────────────────────────

function ResourceTemplateListItem({ tpl, selected, onClick, canDrag, isDragging, isDragOver, onDragStart, onDragOver, onDrop, onDragEnd, favorite, onToggleFavorite }: {
  tpl: ResourceTemplate; selected: boolean; onClick: () => void; favorite?: boolean; onToggleFavorite?: () => void;
} & DragItemProps) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  return (
    <div
      draggable={canDrag}
      onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; onDragStart?.(); }}
      onDragOver={e => { e.preventDefault(); onDragOver?.(e); }}
      onDrop={e => { e.preventDefault(); onDrop?.(); }}
      onDragEnd={onDragEnd}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{ opacity: isDragging ? 0.4 : 1, borderTop: isDragOver ? '2px solid var(--accent)' : '2px solid transparent', transition: 'opacity 0.12s', borderRadius: 9, display: 'flex', alignItems: 'center' }}
    >
      <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1, minWidth: 0, padding: '9px 10px', paddingLeft: canDrag ? 6 : 10, borderRadius: 9, border: 'none', cursor: 'pointer', background: selected ? 'var(--surface-3)' : hovered ? 'var(--surface-2)' : 'transparent', textAlign: 'left', borderLeft: selected ? `3px solid ${tpl.color}` : '3px solid transparent' }}>
        {canDrag && <GripHandle visible={hovered} />}
        <div style={{ width: 30, height: 30, borderRadius: 8, background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SFIcon name={tpl.icon} size={14} color="rgba(255,255,255,0.9)" />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t(RES_TYPE_LABEL_KEYS[tpl.type])}</p>
        </div>
      </button>
      <button onClick={e => { e.stopPropagation(); onToggleFavorite?.(); }} title={favorite ? 'Retirer des favoris' : 'Ajouter aux favoris'}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 6px', flexShrink: 0, opacity: hovered || favorite ? 1 : 0, transition: 'opacity 0.15s' }}
      >
        <SFIcon name="star" size={13} color={favorite ? '#f5c542' : 'var(--text-3)'} />
      </button>
    </div>
  );
}

// ── ResourceTemplateDetail ─────────────────────────────────────────────────────

function ResourceTemplateDetail({ tpl, onOpen, onDuplicate, onDelete, onRename }: {
  tpl: ResourceTemplate;
  onOpen: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onRename?: (name: string, description: string) => void;
}) {
  const { t } = useTranslation();
  const itemCount = tpl.documentSections?.length ?? tpl.sceneBlocks?.length ?? tpl.reviewRounds?.length ?? tpl.folderStructure?.length ?? tpl.moodboardRefs?.length ?? tpl.overviewSections?.length ?? tpl.sections?.length ?? 0;
  const [editName, setEditName] = useState(tpl.name);
  const [editDesc, setEditDesc] = useState(tpl.description);
  useEffect(() => { setEditName(tpl.name); setEditDesc(tpl.description); }, [tpl.id]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      {/* Header */}
      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 14, marginBottom: 10 }}>
          <div style={{ width: 56, height: 56, borderRadius: 14, background: tpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name={tpl.icon} size={24} color="rgba(255,255,255,0.9)" />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ marginBottom: 4 }}><InlineEditable value={editName} onChange={setEditName} onBlur={() => onRename?.(editName, editDesc)} fontSize={16} fontWeight={700} placeholder="Nom du modèle…" /></div>
            <div style={{ marginBottom: 6 }}><InlineEditable value={editDesc} onChange={setEditDesc} onBlur={() => onRename?.(editName, editDesc)} multiline rows={2} fontSize={12} color="var(--text-3)" placeholder="Description du modèle…" /></div>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${tpl.color}22`, color: tpl.color, border: `1px solid ${tpl.color}44`, whiteSpace: 'nowrap', fontWeight: 500 }}>{t(RES_TYPE_LABEL_KEYS[tpl.type])}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {tpl.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${TAG_COLORS[tag] ?? '#3b4f8f'}22`, color: TAG_COLORS[tag] ?? 'var(--text-3)', border: `1px solid ${TAG_COLORS[tag] ?? '#3b4f8f'}44`, whiteSpace: 'nowrap' }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* Content preview */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Aperçu · {itemCount} élément{itemCount !== 1 ? 's' : ''}
        </p>
        {tpl.type === 'document' && (tpl.documentSections ?? []).map((sec, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{sec.title}</p>
            {sec.body && <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{sec.body}</p>}
          </div>
        ))}
        {tpl.type === 'screenplay' && (tpl.sceneBlocks ?? []).map((scene, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: tpl.color }}>Scène {i + 1}</p>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{scene.location}</p>
            {scene.action && <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{scene.action}</p>}
          </div>
        ))}
        {tpl.type === 'video_review' && (tpl.reviewRounds ?? []).map((round, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: `${tpl.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 700, color: tpl.color }}>{i + 1}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text)' }}>{round.label}</span>
          </div>
        ))}
        {tpl.type === 'file' && (tpl.folderStructure ?? []).map((folder, i) => (
          <div key={i} style={{ padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <SFIcon name="folder" size={13} color={tpl.color} />
              <span style={{ fontSize: 12, fontWeight: 500 }}>{folder.name}</span>
            </div>
            {folder.children?.map((child, ci) => (
              <div key={ci} style={{ display: 'flex', alignItems: 'center', gap: 6, paddingLeft: 18, marginTop: 3 }}>
                <SFIcon name="folder" size={11} color="var(--text-3)" />
                <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{child.name}</span>
              </div>
            ))}
          </div>
        ))}
        {tpl.type === 'overview' && (tpl.overviewSections ?? []).map(section => (
          <div key={section.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <SFIcon name={section.icon} size={13} color={tpl.color} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{section.title}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{(section.kind === 'fields' || section.kind === 'vision') ? `${section.fields?.length ?? 0} ${t('overview.sectionKindFields').toLowerCase()}` : t(KIND_LABEL_KEY[section.kind])}</span>
          </div>
        ))}
        {tpl.type === 'tasks' && (tpl.sections ?? []).map((section, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <SFIcon name="list-checks" size={13} color={tpl.color} />
            <span style={{ fontSize: 12, fontWeight: 500, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{section.label}</span>
            <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{section.tasks?.length ?? 0} tâches</span>
          </div>
        ))}
        {tpl.type === 'moodboard' && (tpl.moodboardRefs ?? []).map((ref, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ width: 32, height: 24, borderRadius: 5, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SFIcon name="image" size={12} color="var(--text-3)" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.title || ref.note || `Référence ${i + 1}`}</span>
          </div>
        ))}
        {itemCount === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucun contenu dans ce modèle.</p>}
      </div>

      {/* Actions */}
      <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <button onClick={onOpen} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, width: '100%', padding: '10px 16px', borderRadius: 10, border: `1px solid ${tpl.color}55`, background: `${tpl.color}10`, color: tpl.color, fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)', transition: 'all 0.1s' }}
          onMouseEnter={e => (e.currentTarget.style.background = `${tpl.color}20`)}
          onMouseLeave={e => (e.currentTarget.style.background = `${tpl.color}10`)}
        >
          <SFIcon name={tpl.icon} size={15} />
          Ouvrir / modifier le contenu
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <SFButton variant="secondary" size="sm" icon="copy" onClick={onDuplicate} style={{ flex: 1, justifyContent: 'center' }}>
            Dupliquer
          </SFButton>
          <SFButton
            variant="ghost" size="sm"
            icon="trash-2"
            onClick={async () => {
              if (!(await confirmDialog(t('models.deleteConfirm'), { danger: true }))) return;
              onDelete();
            }}
            style={{ color: 'var(--danger)' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── ResourceTemplateEditor ─────────────────────────────────────────────────────

function ResourceTemplateEditor({ template, onSave, onClose }: {
  template: Partial<ResourceTemplate>;
  onSave: (t: ResourceTemplate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(template.name ?? '');
  const [description, setDescription] = useState(template.description ?? '');
  const [color, setColor] = useState(template.color ?? '#5B8AF5');
  const [tags, setTags] = useState(template.tags?.join(', ') ?? '');
  const [type] = useState<ResourceTemplateType>(template.type ?? 'document');

  // document
  const [docSections, setDocSections] = useState<DocumentSection[]>(template.documentSections ?? []);
  const [newSecTitle, setNewSecTitle] = useState('');
  // screenplay
  const [scenes, setScenes] = useState<SceneBlock[]>(template.sceneBlocks ?? []);
  // video_review
  const [rounds, setRounds] = useState<ReviewRound[]>(template.reviewRounds ?? []);
  // moodboard
  const [refs, setRefs] = useState<MoodboardRef[]>(template.moodboardRefs ?? []);

  const handleSave = () => {
    if (!name.trim()) return;
    const base = { id: template.id ?? `res-${Date.now()}`, type, name: name.trim(), description: description.trim(), color, icon: RES_TYPE_ICONS[type], tags: tags.split(',').map(t => t.trim()).filter(Boolean), builtIn: false, createdAt: template.createdAt ?? new Date().toISOString().split('T')[0] };
    let content: Partial<ResourceTemplate> = {};
    if (type === 'document') content = { documentSections: docSections };
    if (type === 'screenplay') content = { sceneBlocks: scenes };
    if (type === 'video_review') content = { reviewRounds: rounds };
    if (type === 'moodboard') content = { moodboardRefs: refs };
    onSave({ ...base, ...content });
  };

  const inp = (val: string, set: (v: string) => void, placeholder?: string, multi?: boolean): React.ReactNode => multi
    ? <textarea value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={{ ...fieldStyle(), minHeight: 70, resize: 'vertical' }} />
    : <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={fieldStyle()} />;

  const renderContentEditor = () => {
    if (type === 'document') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>Sections du document</p>
        {docSections.map((sec, i) => (
          <div key={i} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={sec.title} onChange={e => setDocSections(p => p.map((s, j) => j === i ? { ...s, title: e.target.value } : s))} placeholder="Titre de la section" style={fieldStyle({ flex: 1 })} />
              <button onClick={() => setDocSections(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}><SFIcon name="trash-2" size={13} /></button>
            </div>
            <textarea value={sec.body} onChange={e => setDocSections(p => p.map((s, j) => j === i ? { ...s, body: e.target.value } : s))} placeholder="Contenu / instructions…" style={{ ...fieldStyle(), minHeight: 60, resize: 'vertical' }} />
          </div>
        ))}
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newSecTitle} onChange={e => setNewSecTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newSecTitle.trim()) { setDocSections(p => [...p, { title: newSecTitle.trim(), body: '' }]); setNewSecTitle(''); } }} placeholder="Nouvelle section…" style={fieldStyle({ flex: 1 })} />
          <SFButton variant="secondary" size="sm" icon="plus" onClick={() => { if (newSecTitle.trim()) { setDocSections(p => [...p, { title: newSecTitle.trim(), body: '' }]); setNewSecTitle(''); } }}>Ajouter</SFButton>
        </div>
      </div>
    );
    if (type === 'screenplay') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>Scènes</p>
        {scenes.map((sc, i) => (
          <div key={sc.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={sc.location} onChange={e => setScenes(p => p.map((s, j) => j === i ? { ...s, location: e.target.value } : s))} placeholder="INT./EXT. LIEU — MOMENT" style={fieldStyle({ flex: 1, fontFamily: 'var(--ff-mono)', fontSize: 11 })} />
              <input value={sc.time} onChange={e => setScenes(p => p.map((s, j) => j === i ? { ...s, time: e.target.value } : s))} placeholder="0:00–0:30" style={fieldStyle({ width: 90 })} />
              <button onClick={() => setScenes(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}><SFIcon name="trash-2" size={13} /></button>
            </div>
            <textarea value={sc.action} onChange={e => setScenes(p => p.map((s, j) => j === i ? { ...s, action: e.target.value } : s))} placeholder="Description de l'action…" style={{ ...fieldStyle(), minHeight: 50, resize: 'vertical' }} />
          </div>
        ))}
        <SFButton variant="secondary" size="sm" icon="plus" onClick={() => setScenes(p => [...p, { id: `sc${Date.now()}`, location: '', time: '', action: '' }])}>Ajouter une scène</SFButton>
      </div>
    );
    if (type === 'video_review') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>Rounds de révision</p>
        {rounds.map((r, i) => (
          <div key={r.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ width: 22, height: 22, borderRadius: '50%', background: color, color: '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, flexShrink: 0 }}>{i + 1}</div>
              <input value={r.label} onChange={e => setRounds(p => p.map((rv, j) => j === i ? { ...rv, label: e.target.value } : rv))} placeholder="Label du round…" style={fieldStyle({ flex: 1 })} />
              <button onClick={() => setRounds(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}><SFIcon name="trash-2" size={13} /></button>
            </div>
            <textarea value={r.description} onChange={e => setRounds(p => p.map((rv, j) => j === i ? { ...rv, description: e.target.value } : rv))} placeholder="Description des objectifs de ce round…" style={{ ...fieldStyle(), minHeight: 50, resize: 'vertical' }} />
          </div>
        ))}
        <SFButton variant="secondary" size="sm" icon="plus" onClick={() => setRounds(p => [...p, { id: `r${Date.now()}`, label: `V${p.length + 1}`, description: '' }])}>Ajouter un round</SFButton>
      </div>
    );
    if (type === 'moodboard') return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        <p style={labelStyle()}>Références visuelles</p>
        {refs.map((ref, i) => (
          <div key={ref.id} style={{ border: '1px solid var(--border)', borderRadius: 9, padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
            <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <input value={ref.title} onChange={e => setRefs(p => p.map((r, j) => j === i ? { ...r, title: e.target.value } : r))} placeholder="Titre de la référence" style={fieldStyle({ flex: 1 })} />
              <button onClick={() => setRefs(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}><SFIcon name="trash-2" size={13} /></button>
            </div>
            <textarea value={ref.note} onChange={e => setRefs(p => p.map((r, j) => j === i ? { ...r, note: e.target.value } : r))} placeholder="Description, notes, liens…" style={{ ...fieldStyle(), minHeight: 50, resize: 'vertical' }} />
          </div>
        ))}
        <SFButton variant="secondary" size="sm" icon="plus" onClick={() => setRefs(p => [...p, { id: `m${Date.now()}`, title: '', note: '' }])}>Ajouter une référence</SFButton>
      </div>
    );
    return null;
  };

  const [editingName, setEditingName] = useState(false);
  const typeBadgeColor = color;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
          <SFIcon name="arrow-left" size={13} />Modèles
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: `${typeBadgeColor}22`, color: typeBadgeColor, fontSize: 10, fontFamily: 'var(--ff-mono)', border: `1px solid ${typeBadgeColor}44`, flexShrink: 0 }}>
          <SFIcon name={RES_TYPE_ICONS[type]} size={10} />{t(RES_TYPE_LABEL_KEYS[type])}
        </span>
        {editingName ? (
          <input autoFocus value={name} onChange={e => setName(e.target.value)}
            onBlur={() => setEditingName(false)}
            onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') setEditingName(false); }}
            style={{ flex: 1, fontSize: 15, fontWeight: 600, background: 'var(--surface-2)', border: '1px solid var(--accent)', borderRadius: 7, padding: '4px 10px', color: 'var(--text)', fontFamily: 'var(--ff-text)', outline: 'none' }}
          />
        ) : (
          <span onClick={() => setEditingName(true)}
            style={{ flex: 1, fontSize: 15, fontWeight: 600, cursor: 'text', padding: '4px 6px', borderRadius: 7, color: name ? 'var(--text)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
          >{name || 'Nom du modèle…'}</span>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          <SFButton variant="ghost" size="sm" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" size="sm" icon="save" onClick={handleSave} style={{ opacity: name.trim() ? 1 : 0.5 }}>{template.id ? 'Enregistrer' : 'Créer le modèle'}</SFButton>
        </div>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 0' }}>
        <div style={{ maxWidth: 860, margin: '0 auto', padding: '0 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <p style={labelStyle()}>Description</p>
            {inp(description, setDescription, "Décrivez l'utilisation de ce modèle…", true)}
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <p style={labelStyle()}>Couleur</p>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {COLORS.map(c => <button key={c} onClick={() => setColor(c)} style={{ width: 22, height: 22, borderRadius: 6, background: c, border: color === c ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', transform: color === c ? 'scale(1.2)' : 'scale(1)', transition: 'transform 0.1s' }} />)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={labelStyle()}>Tags (séparés par des virgules)</p>
              {inp(tags, setTags, 'ex. Tournage, Production')}
            </div>
          </div>
          <div style={{ borderTop: '1px solid var(--border)', paddingTop: 18 }}>{renderContentEditor()}</div>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

type UnifiedTypeFilter = 'projets' | 'formulaires' | ResourceTemplateType;

const TYPE_PILLS: { key: UnifiedTypeFilter; labelKey: string; icon: string }[] = [
  { key: 'projets', labelKey: 'models.navProjects', icon: 'layout-template' },
  { key: 'formulaires', labelKey: 'models.navForms', icon: 'clipboard-list' },
  { key: 'document', labelKey: 'models.resDocument', icon: 'file-text' },
  { key: 'screenplay', labelKey: 'models.resTypeScreenplay', icon: 'clapperboard' },
  { key: 'video_review', labelKey: 'models.resReviewShort', icon: 'video' },
  { key: 'file', labelKey: 'models.resTypeFile', icon: 'folder' },
  { key: 'overview', labelKey: 'models.resTypeOverview', icon: 'layout-grid' },
  { key: 'tasks', labelKey: 'models.resTypeTasks', icon: 'list-checks' },
  { key: 'moodboard', labelKey: 'models.resMoodboard', icon: 'grid-2x2' },
];

export function Modeles() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const plan = usePlan();
  const [typeFilter, setTypeFilter] = usePersistedState<UnifiedTypeFilter>('sf_modeles_type_filter', 'projets');
  const [searchQuery, setSearchQuery] = useState('');
  const [resNavExpanded, setResNavExpanded] = useState(true);

  // ── Seed des modèles de départ pour les studios existants (idempotent) ──
  useEffect(() => { void ensureDefaultTemplatesSeeded(); }, []);

  // ── Favorites
  const [favorites, setFavorites] = useState<Set<string>>(getFavoriteTemplateIds);
  useEffect(() => subscribeTemplateFavorites(() => setFavorites(getFavoriteTemplateIds())), []);
  const toggleFav = (id: string) => { toggleTemplateFavorite(id); setFavorites(getFavoriteTemplateIds()); };

  // ── Formulaires intégrés masqués (préférence locale) — seul type qui garde le masquage ──
  const countHiddenForms = () => {
    const formIds = new Set(BUILT_IN_FORM_TEMPLATES.map(t => t.id));
    return getHiddenTemplateIds().filter(id => formIds.has(id)).length;
  };
  const [hiddenCount, setHiddenCount] = useState(countHiddenForms);
  useEffect(() => subscribeHiddenTemplates(() => setHiddenCount(countHiddenForms())), []);

  // ── Project templates state
  const [templates, setTemplates] = useState(loadAllTemplates);
  const [lastSelectedTplId, setLastSelectedTplId] = usePersistedState<string | null>('sf_modeles_selected_tpl_id', null);
  const [selectedTpl, setSelectedTpl] = useState<ProjectTemplate | null>(() => {
    const all = loadAllTemplates();
    return all.find(t => t.id === lastSelectedTplId) ?? all[0] ?? null;
  });
  useEffect(() => { setLastSelectedTplId(selectedTpl?.id ?? null); }, [selectedTpl?.id]);
  const [createProjectFrom, setCreateProjectFrom] = useState<ProjectTemplate | null>(null);
  const [dragTplId, setDragTplId] = useState<string | null>(null);
  const [dragOverTplId, setDragOverTplId] = useState<string | null>(null);

  // ── Resource templates state
  const [resourceTemplates, setResourceTemplates] = useState(loadAllResourceTemplates);
  const [lastSelectedResId, setLastSelectedResId] = usePersistedState<string | null>('sf_modeles_selected_res_id', null);
  const [selectedRes, setSelectedRes] = useState<ResourceTemplate | null>(() => {
    const all = loadAllResourceTemplates();
    return all.find(t => t.id === lastSelectedResId) ?? all[0] ?? null;
  });
  useEffect(() => { setLastSelectedResId(selectedRes?.id ?? null); }, [selectedRes?.id]);
  const [resEditorOpen, setResEditorOpen] = useState(false);
  const [resEditorData, setResEditorData] = useState<Partial<ResourceTemplate>>({});
  const [templateResViewTpl, setTemplateResViewTpl] = useState<ResourceTemplate | null>(null);
  const [dragResId, setDragResId] = useState<string | null>(null);
  const [dragOverResId, setDragOverResId] = useState<string | null>(null);

  // ── Form templates state
  const [formTemplates, setFormTemplates] = useState(loadAllFormTemplates);
  const [lastSelectedFormId, setLastSelectedFormId] = usePersistedState<string | null>('sf_modeles_selected_form_id', null);
  const [selectedForm, setSelectedForm] = useState<FormTemplate | null>(() => {
    const all = loadAllFormTemplates();
    return all.find(t => t.id === lastSelectedFormId) ?? all.find(t => !t.builtIn) ?? all[0] ?? null;
  });
  useEffect(() => { setLastSelectedFormId(selectedForm?.id ?? null); }, [selectedForm?.id]);
  const [formViewOpen, setFormViewOpen] = useState(false);
  const [formViewData, setFormViewData] = useState<Partial<FormTemplate>>({});
  const [formFillerOpen, setFormFillerOpen] = useState(false);
  const [formFillerInstance, setFormFillerInstance] = useState<FormInstance | undefined>();
  const [formDetailTab, setFormDetailTab] = useState<'apercu' | 'reponses'>('apercu');
  const [formBuiltInsCollapsed, setFormBuiltInsCollapsed] = useState(false);
  const [dragFormId, setDragFormId] = useState<string | null>(null);
  const [dragOverFormId, setDragOverFormId] = useState<string | null>(null);

  const resetHiddenTemplates = () => {
    getHiddenTemplateIds().forEach(id => unhideTemplate(id));
    setFormTemplates(loadAllFormTemplates());
  };

  // ── Project template handlers
  async function openProjectTemplateDraft(tpl: ProjectTemplate) {
    const draftId = await createTemplateDraft(tpl.name, tpl.id);
    if (tpl.sections?.length) setSections(draftId, tpl.sections.map(sec => ({
      label: sec.label,
      progress: 0,
      tasks: sec.tasks.map((tt, i): Task => ({
        id: `${draftId}-${sec.label}-${i}`,
        title: tt.title,
        projectId: draftId,
        projectName: tpl.name,
        projectColor: tpl.color,
        assignees: tt.assignees ?? [],
        status: 'warn',
        statusLabel: 'En attente',
        priority: tt.priority ?? 'normal',
        priorityLabel: tt.priority === 'high' ? 'Élevée' : tt.priority === 'low' ? 'Basse' : 'Normale',
        dueDate: tt.dueDate ?? '',
        checked: false,
        subtasks: [],
      })),
    })));
    if (tpl.folderStructure?.length) addFolderTree(tpl.folderStructure, { projectId: draftId });
    if (tpl.overviewSections?.length) setProjectContent(draftId, { customSections: tpl.overviewSections });
    navigate(`/projets/${draftId}`);
  }

  const saveTpl = (tpl: ProjectTemplate) => {
    const existing = templates.findIndex(t => t.id === tpl.id);
    const updated = existing >= 0 ? templates.map(t => t.id === tpl.id ? tpl : t) : [...templates, tpl];
    saveCustomTemplates(updated);
    setTemplates(updated);
    setSelectedTpl(tpl);
  };

  const duplicateTpl = (tpl: ProjectTemplate) => saveTpl({ ...tpl, id: `tpl-${Date.now()}`, name: `${tpl.name} (copie)`, createdAt: new Date().toISOString().split('T')[0] });

  const deleteTpl = (tpl: ProjectTemplate) => {
    const custom = templates.filter(t => t.id !== tpl.id);
    saveCustomTemplates(custom);
    setTemplates(custom);
    setSelectedTpl(custom[0] ?? null);
  };

  const renameTpl = (id: string, name: string, description: string) => {
    const updated = templates.map(t => t.id === id ? { ...t, name, description } : t);
    saveCustomTemplates(updated);
    setTemplates(updated);
    setSelectedTpl(prev => prev?.id === id ? { ...prev, name, description } : prev);
  };

  const reorderTpl = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    const srcIdx = templates.findIndex(t => t.id === srcId);
    const dstIdx = templates.findIndex(t => t.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const newTemplates = [...templates];
    const [removed] = newTemplates.splice(srcIdx, 1);
    newTemplates.splice(dstIdx, 0, removed);
    saveCustomTemplates(newTemplates);
    setTemplates(newTemplates);
  };

  // ── Form template handlers
  const saveForm = (tpl: FormTemplate) => {
    const custom = formTemplates.filter(t => !t.builtIn);
    const existing = custom.findIndex(t => t.id === tpl.id);
    const updated = existing >= 0 ? custom.map(t => t.id === tpl.id ? tpl : t) : [...custom, tpl];
    saveCustomFormTemplates(updated);
    setFormTemplates([...getVisibleBuiltInFormTemplates(), ...updated]);
    setSelectedForm(tpl);
    setFormViewOpen(false);
  };

  const duplicateForm = (tpl: FormTemplate) => saveForm({ ...tpl, id: `form-${Date.now()}`, name: `${tpl.name} (copie)`, builtIn: false, createdAt: new Date().toISOString().split('T')[0] });

  const deleteForm = (tpl: FormTemplate) => {
    if (tpl.builtIn) {
      hideTemplate(tpl.id);
      const next = formTemplates.filter(t => t.id !== tpl.id);
      setFormTemplates(next);
      setSelectedForm(next[0] ?? null);
      return;
    }
    const custom = formTemplates.filter(t => !t.builtIn && t.id !== tpl.id);
    saveCustomFormTemplates(custom);
    const builtIn = getVisibleBuiltInFormTemplates();
    setFormTemplates([...builtIn, ...custom]);
    setSelectedForm(builtIn[0] ?? custom[0] ?? null);
  };

  const renameForm = (id: string, name: string, description: string) => {
    const updated = formTemplates.map(t => t.id === id ? { ...t, name, description } : t);
    const custom = updated.filter(t => !t.builtIn);
    saveCustomFormTemplates(custom);
    setFormTemplates(updated);
    setSelectedForm(prev => prev?.id === id ? { ...prev, name, description } : prev);
  };

  const reorderForm = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    const custom = formTemplates.filter(t => !t.builtIn);
    const builtIn = formTemplates.filter(t => t.builtIn);
    const srcIdx = custom.findIndex(t => t.id === srcId);
    const dstIdx = custom.findIndex(t => t.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const newCustom = [...custom];
    const [removed] = newCustom.splice(srcIdx, 1);
    newCustom.splice(dstIdx, 0, removed);
    saveCustomFormTemplates(newCustom);
    setFormTemplates([...newCustom, ...builtIn]);
  };

  const openFiller = (instance?: FormInstance) => {
    setFormFillerInstance(instance);
    setFormFillerOpen(true);
  };

  // ── Resource template handlers
  const saveRes = (tpl: ResourceTemplate) => {
    const existing = resourceTemplates.findIndex(t => t.id === tpl.id);
    const updated = existing >= 0 ? resourceTemplates.map(t => t.id === tpl.id ? tpl : t) : [...resourceTemplates, tpl];
    saveCustomResourceTemplates(updated);
    setResourceTemplates(updated);
    setSelectedRes(tpl);
    setResEditorOpen(false);
  };

  const duplicateRes = (tpl: ResourceTemplate) => saveRes({ ...tpl, id: `res-${Date.now()}`, name: `${tpl.name} (copie)`, createdAt: new Date().toISOString().split('T')[0] });

  const renameRes = (id: string, name: string, description: string) => {
    const updated = resourceTemplates.map(t => t.id === id ? { ...t, name, description } : t);
    saveCustomResourceTemplates(updated);
    setResourceTemplates(updated);
    setSelectedRes(prev => prev?.id === id ? { ...prev, name, description } : prev);
  };

  const reorderRes = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    const srcIdx = resourceTemplates.findIndex(t => t.id === srcId);
    const dstIdx = resourceTemplates.findIndex(t => t.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const newResourceTemplates = [...resourceTemplates];
    const [removed] = newResourceTemplates.splice(srcIdx, 1);
    newResourceTemplates.splice(dstIdx, 0, removed);
    saveCustomResourceTemplates(newResourceTemplates);
    setResourceTemplates(newResourceTemplates);
  };

  const deleteRes = (tpl: ResourceTemplate) => {
    const custom = resourceTemplates.filter(t => t.id !== tpl.id);
    saveCustomResourceTemplates(custom);
    setResourceTemplates(custom);
    setSelectedRes(null);
  };

  const isResType = (f: UnifiedTypeFilter): f is ResourceTemplateType =>
    f !== 'projets' && f !== 'formulaires';

  const filteredTpl = templates.filter(t =>
    !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const filteredForms = formTemplates.filter(t =>
    !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()))
  );
  const filteredRes = resourceTemplates.filter(t => {
    const matchType = !isResType(typeFilter) || t.type === typeFilter;
    const matchSearch = !searchQuery || t.name.toLowerCase().includes(searchQuery.toLowerCase()) || t.tags.some(tag => tag.toLowerCase().includes(searchQuery.toLowerCase()));
    return matchType && matchSearch;
  });

  const handleNew = () => {
    if (!canUseFeature(plan, 'customTemplates')) {
      requestUpgrade({ feature: 'customTemplates' });
      return;
    }
    if (typeFilter === 'projets') {
      const tpl: ProjectTemplate = { id: `tpl-${Date.now()}`, name: 'Nouveau modèle', description: '', color: '#6366f1', icon: 'layout-template', tags: [], builtIn: false, createdAt: new Date().toISOString().split('T')[0] };
      saveTpl(tpl);
      void openProjectTemplateDraft(tpl);
    }
    else if (typeFilter === 'formulaires') { setFormViewData({}); setFormViewOpen(true); }
    else { setResEditorData({ type: typeFilter }); setResEditorOpen(true); }
  };

  const topbarCount = typeFilter === 'projets'
    ? `${templates.length} modèles de projets`
    : typeFilter === 'formulaires'
    ? `${formTemplates.length} modèles de formulaires`
    : `${resourceTemplates.filter(r => r.type === typeFilter).length} modèles — ${(() => { const p = TYPE_PILLS.find(p => p.key === typeFilter); return p ? t(p.labelKey) : ''; })()}`;

  const searchInputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px 7px 30px', borderRadius: 9,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 12, outline: 'none',
    fontFamily: 'var(--ff-text)', colorScheme: 'dark', boxSizing: 'border-box',
  };

  const sectionLabelStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 8px 4px',
  };

  const collapsibleBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    background: 'none', border: 'none', cursor: 'pointer', padding: '10px 8px 4px', color: 'var(--text-3)',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <PageHeader
        title="Modèles"
        subtitle={topbarCount}
        actions={
          <>
            {hiddenCount > 0 && (
              <button onClick={resetHiddenTemplates} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', textDecoration: 'underline', padding: 0 }}>
                {hiddenCount} modèle{hiddenCount > 1 ? 's' : ''} masqué{hiddenCount > 1 ? 's' : ''} — Réafficher
              </button>
            )}
            <SFButton
              variant="secondary"
              icon={typeFilter === 'projets' ? 'layout-template' : typeFilter === 'formulaires' ? 'clipboard-list' : 'layers'}
              onClick={handleNew}
            >
              {typeFilter === 'formulaires' ? 'Nouveau formulaire' : 'Nouveau modèle'}
            </SFButton>
          </>
        }
      />

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>

        {/* ── Left panel (always visible) ── */}
        <div style={{ width: 280, borderRight: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>
          {/* Search */}
          <div style={{ padding: '10px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ position: 'relative' }}>
              <div style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <SFIcon name="search" size={13} color="var(--text-3)" />
              </div>
              <input
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder="Rechercher…"
                style={searchInputStyle}
              />
            </div>
          </div>

          {/* Tree navigation */}
          {(() => {
            const navItem = (key: UnifiedTypeFilter, icon: string, label: string, count: number, indent = false) => {
              const active = typeFilter === key;
              return (
                <button key={key} onClick={() => {
                  setTypeFilter(key);
                  setSearchQuery('');
                  if (key === 'projets') setSelectedTpl(templates[0] ?? null);
                  else if (key === 'formulaires') setSelectedForm(formTemplates.find(t => !t.builtIn) ?? formTemplates[0] ?? null);
                  else setSelectedRes(resourceTemplates.find(t => t.type === key) ?? null);
                }} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: indent ? '6px 12px 6px 28px' : '7px 12px',
                  border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: active ? 'var(--surface-2)' : 'transparent',
                  borderLeft: `2px solid ${active ? 'var(--accent)' : 'transparent'}`,
                  color: active ? 'var(--text)' : 'var(--text-2)',
                  fontSize: indent ? 12 : 13, fontFamily: 'var(--ff-text)',
                  fontWeight: active ? 600 : 400, transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  <SFIcon name={icon} size={indent ? 12 : 13} color={active ? 'var(--accent)' : 'var(--text-3)'} />
                  <span style={{ flex: 1 }}>{label}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-4)', minWidth: 16, textAlign: 'right' }}>{count}</span>
                </button>
              );
            };
            const RES_TYPES: { key: UnifiedTypeFilter; icon: string; label: string; count: number }[] = [
              { key: 'formulaires',  icon: 'clipboard-list', label: 'Formulaires',    count: formTemplates.length },
              { key: 'document',     icon: 'file-text',      label: 'Document',       count: resourceTemplates.filter(t => t.type === 'document').length },
              { key: 'screenplay',   icon: 'clapperboard',   label: 'Scénario',       count: resourceTemplates.filter(t => t.type === 'screenplay').length },
              { key: 'video_review', icon: 'video',          label: 'Révision vidéo', count: resourceTemplates.filter(t => t.type === 'video_review').length },
              { key: 'moodboard',    icon: 'grid-2x2',       label: 'Moodboard',      count: resourceTemplates.filter(t => t.type === 'moodboard').length },
            ];
            const resActive = isResType(typeFilter) || typeFilter === 'formulaires';
            const totalRes = formTemplates.length + resourceTemplates.length;
            return (
              <div style={{ borderBottom: '1px solid var(--border)', flexShrink: 0, paddingTop: 4, paddingBottom: 4 }}>
                {navItem('projets', 'layout-template', 'Projets', templates.length)}
                {/* Resources group header */}
                <button onClick={() => setResNavExpanded(v => !v)} style={{
                  display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                  padding: '7px 12px', border: 'none', cursor: 'pointer', textAlign: 'left',
                  background: 'transparent', borderLeft: `2px solid ${resActive && !resNavExpanded ? 'var(--accent)' : 'transparent'}`,
                  color: resActive ? 'var(--text)' : 'var(--text-2)', fontSize: 13,
                  fontFamily: 'var(--ff-text)', fontWeight: resActive ? 600 : 400, transition: 'background 0.1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
                onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                >
                  <SFIcon name="layers" size={13} color={resActive ? 'var(--accent)' : 'var(--text-3)'} />
                  <span style={{ flex: 1 }}>Ressources</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-4)', marginRight: 6 }}>{totalRes}</span>
                  <SFIcon name={resNavExpanded ? 'chevron-down' : 'chevron-right'} size={11} color="var(--text-4)" />
                </button>
                {resNavExpanded && RES_TYPES.map(rt =>
                  navItem(rt.key, rt.icon, rt.label, rt.count, true)
                )}
              </div>
            );
          })()}

          {/* List content */}
          <div style={{ flex: 1, overflow: 'auto', padding: '8px' }}>

            {/* PROJETS */}
            {typeFilter === 'projets' && (
              <>
                {filteredTpl.length > 0 && (
                  <>
                    <p style={sectionLabelStyle}>Mes modèles</p>
                    {[...filteredTpl].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
                      <TemplateListItem key={tpl.id} tpl={tpl} selected={selectedTpl?.id === tpl.id} onClick={() => setSelectedTpl(tpl)}
                        canDrag isDragging={dragTplId === tpl.id} isDragOver={dragOverTplId === tpl.id}
                        onDragStart={() => setDragTplId(tpl.id)}
                        onDragOver={() => setDragOverTplId(tpl.id)}
                        onDrop={() => { if (dragTplId) reorderTpl(dragTplId, tpl.id); setDragOverTplId(null); }}
                        onDragEnd={() => { setDragTplId(null); setDragOverTplId(null); }}
                        favorite={favorites.has(tpl.id)} onToggleFavorite={() => toggleFav(tpl.id)}
                      />
                    ))}
                  </>
                )}
              </>
            )}

            {/* FORMULAIRES */}
            {typeFilter === 'formulaires' && (
              <>
                {filteredForms.filter(t => !t.builtIn).length > 0 ? (
                  <>
                    <p style={sectionLabelStyle}>Mes formulaires</p>
                    {[...filteredForms.filter(t => !t.builtIn)].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
                      <FormTemplateListItem key={tpl.id} tpl={tpl} selected={selectedForm?.id === tpl.id} onClick={() => { setSelectedForm(tpl); setFormDetailTab('apercu'); }}
                        canDrag isDragging={dragFormId === tpl.id} isDragOver={dragOverFormId === tpl.id}
                        onDragStart={() => setDragFormId(tpl.id)}
                        onDragOver={() => setDragOverFormId(tpl.id)}
                        onDrop={() => { if (dragFormId) reorderForm(dragFormId, tpl.id); setDragOverFormId(null); }}
                        onDragEnd={() => { setDragFormId(null); setDragOverFormId(null); }}
                        favorite={favorites.has(tpl.id)} onToggleFavorite={() => toggleFav(tpl.id)}
                      />
                    ))}
                  </>
                ) : null}
                <button onClick={() => setFormBuiltInsCollapsed(v => !v)} style={collapsibleBtnStyle}>
                  <SFIcon name={formBuiltInsCollapsed ? 'chevron-right' : 'chevron-down'} size={11} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Intégrés ({filteredForms.filter(t => t.builtIn).length})
                  </span>
                </button>
                {!formBuiltInsCollapsed && [...filteredForms.filter(t => t.builtIn)].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
                  <FormTemplateListItem key={tpl.id} tpl={tpl} selected={selectedForm?.id === tpl.id} onClick={() => { setSelectedForm(tpl); setFormDetailTab('apercu'); }}
                    favorite={favorites.has(tpl.id)} onToggleFavorite={() => toggleFav(tpl.id)} />
                ))}
              </>
            )}

            {/* RESSOURCES (any resource type) */}
            {isResType(typeFilter) && (
              <>
                {filteredRes.length > 0 && (
                  <>
                    <p style={sectionLabelStyle}>Mes modèles</p>
                    {[...filteredRes].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
                      <ResourceTemplateListItem key={tpl.id} tpl={tpl} selected={selectedRes?.id === tpl.id} onClick={() => setSelectedRes(tpl)}
                        canDrag isDragging={dragResId === tpl.id} isDragOver={dragOverResId === tpl.id}
                        onDragStart={() => setDragResId(tpl.id)}
                        onDragOver={() => setDragOverResId(tpl.id)}
                        onDrop={() => { if (dragResId) reorderRes(dragResId, tpl.id); setDragOverResId(null); }}
                        onDragEnd={() => { setDragResId(null); setDragOverResId(null); }}
                        favorite={favorites.has(tpl.id)} onToggleFavorite={() => toggleFav(tpl.id)}
                      />
                    ))}
                  </>
                )}
              </>
            )}

          </div>
        </div>

        {/* ── Right panel ── */}
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>

          {/* PROJETS detail */}
          {typeFilter === 'projets' && (
            selectedTpl
              ? <TemplateDetail tpl={selectedTpl}
                  onEdit={() => void openProjectTemplateDraft(selectedTpl)}
                  onDuplicate={() => duplicateTpl(selectedTpl)}
                  onDelete={() => deleteTpl(selectedTpl)}
                  onCreateProject={() => setCreateProjectFrom(selectedTpl)}
                  onRename={(name, desc) => renameTpl(selectedTpl.id, name, desc)}
                />
              : <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sélectionnez un modèle</div>
          )}

          {/* FORMULAIRES detail */}
          {typeFilter === 'formulaires' && (
            selectedForm ? (
              <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                {formDetailTab === 'apercu'
                  ? <FormTemplateDetail tpl={selectedForm}
                      currentTab={formDetailTab}
                      onTabChange={setFormDetailTab}
                      onEdit={() => { setFormViewData(selectedForm.builtIn ? { ...selectedForm, id: `form-${Date.now()}`, name: `${selectedForm.name} (copie)`, builtIn: false } : selectedForm); setFormViewOpen(true); }}
                      onDuplicate={() => duplicateForm(selectedForm)}
                      onDelete={() => deleteForm(selectedForm)}
                      onFill={() => openFiller()}
                      onRename={(name, desc) => renameForm(selectedForm.id, name, desc)}
                    />
                  : <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
                      <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
                        <div>
                          <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{selectedForm.name}</h2>
                          <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4 }}>{selectedForm.description}</p>
                        </div>
                        <div style={{ display: 'flex', gap: 4, flexShrink: 0 }}>
                          {(['apercu', 'reponses'] as const).map(tabKey => (
                            <button key={tabKey} onClick={() => setFormDetailTab(tabKey)} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: 500, background: formDetailTab === tabKey ? 'var(--surface-2)' : 'transparent', color: formDetailTab === tabKey ? 'var(--text)' : 'var(--text-3)', transition: 'all 0.1s' }}>
                              {tabKey === 'apercu' ? 'Aperçu' : 'Réponses'}
                            </button>
                          ))}
                        </div>
                      </div>
                      <div style={{ flex: 1, overflow: 'auto' }}>
                        <FormInstancesPanel templateId={selectedForm.id} templateName={selectedForm.name} templateColor={selectedForm.color} onFillNew={() => openFiller()} onEditInstance={inst => openFiller(inst)} />
                      </div>
                    </div>
                }
              </div>
            ) : (
              <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>Sélectionnez un formulaire</div>
            )
          )}

          {/* RESSOURCES detail */}
          {isResType(typeFilter) && (
            selectedRes
              ? <ResourceTemplateDetail tpl={selectedRes}
                  onOpen={() => setTemplateResViewTpl(selectedRes)}
                  onDuplicate={() => duplicateRes(selectedRes)}
                  onDelete={() => deleteRes(selectedRes)}
                  onRename={(name, desc) => renameRes(selectedRes.id, name, desc)}
                />
              : <div style={{ height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
                  <SFIcon name={TYPE_PILLS.find(p => p.key === typeFilter)?.icon ?? 'layers'} size={28} color="var(--border-2)" />
                  <p style={{ fontSize: 13 }}>Sélectionnez un modèle</p>
                </div>
          )}

        </div>
      </div>

      {/* Modals */}
      {formViewOpen && (() => {
        const tpl = formViewData as FormTemplate;
        const fakeResource = { id: tpl.id ?? 'new', title: tpl.name ?? 'Nouveau formulaire', type: 'form' as const, status: 'info' as const, projectId: '', projectName: '', projectColor: '', linkedResources: [], createdAt: '' };
        const handleSaveTemplate = (questions: FormQuestion[]) => {
          const fields = questionsToFields(questions);
          const updated: FormTemplate = {
            id: tpl.id ?? `form-${Date.now()}`,
            name: tpl.name ?? 'Nouveau formulaire',
            description: tpl.description ?? '',
            color: tpl.color ?? '#6366f1',
            icon: tpl.icon ?? 'clipboard-list',
            tags: tpl.tags ?? [],
            fields,
            builtIn: false,
            createdAt: tpl.createdAt ?? new Date().toISOString().split('T')[0],
          };
          saveForm(updated);
        };
        const initQuestions = tpl.fields?.length ? fieldsToQuestions(tpl.fields) : undefined;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
            <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
              <button onClick={() => setFormViewOpen(false)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)' }}>
                <SFIcon name="arrow-left" size={13} />Modèles
              </button>
              <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
              <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: `${tpl.color ?? '#6366f1'}22`, color: tpl.color ?? '#6366f1', fontSize: 10, fontFamily: 'var(--ff-mono)', border: `1px solid ${tpl.color ?? '#6366f1'}44`, flexShrink: 0 }}>
                <SFIcon name={tpl.icon ?? 'clipboard-list'} size={10} />Formulaire
              </span>
              <span style={{ flex: 1, fontSize: 15, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name || 'Nouveau formulaire'}</span>
              <button onClick={() => setFormViewOpen(false)} style={{ width: 28, height: 28, borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)' }}>
                <SFIcon name="x" size={15} />
              </button>
            </div>
            <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
              <FormView
                resource={fakeResource as any}
                templateMode
                initialQuestions={initQuestions}
                onSaveTemplate={handleSaveTemplate}
              />
            </div>
          </div>
        );
      })()}
      {resEditorOpen && <ResourceTemplateEditor template={resEditorData} onSave={saveRes} onClose={() => setResEditorOpen(false)} />}
      {templateResViewTpl && (
        <TemplateResourceView
          tpl={templateResViewTpl}
          onClose={() => setTemplateResViewTpl(null)}
          onSave={updated => {
            saveRes(updated);
            setTemplateResViewTpl(updated);
          }}
        />
      )}
      {createProjectFrom && <CreateProjectModal template={createProjectFrom} onClose={() => setCreateProjectFrom(null)} />}
      {formFillerOpen && selectedForm && <FormFiller template={selectedForm} instance={formFillerInstance} onClose={() => { setFormFillerOpen(false); setFormFillerInstance(undefined); }} />}
    </div>
  );
}

