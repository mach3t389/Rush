import React, { useState, useCallback, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router-dom';
import { SFButton, SFIcon, formatDisplay } from '../components/ui';
import { USERS } from '../data/mock';
import { addProject } from '../data/projectStore';
import { getClients } from '../data/clientStore';
import { setSections } from '../data/taskStore';
import { addFolderTree } from '../data/fileStore';
import type { ProjectTemplate, TemplateSection, TemplateTask, FormTemplate, FormField, FormFieldType, FormFieldValue, FormResponse, FormInstance, ResourceTemplate, ResourceTemplateType, ChecklistItem, DocumentSection, SceneBlock, ReviewRound, FolderNode, MoodboardRef } from '../data/templates';
import { loadAllTemplates, loadCustomTemplates, saveCustomTemplates, BUILT_IN_TEMPLATES, loadAllFormTemplates, loadCustomFormTemplates, saveCustomFormTemplates, BUILT_IN_FORM_TEMPLATES, loadAllResourceTemplates, loadCustomResourceTemplates, saveCustomResourceTemplates, BUILT_IN_RESOURCE_TEMPLATES } from '../data/templates';
import { getFormInstances, createFormInstance, updateFormInstance, deleteFormInstance, subscribeFormStore } from '../data/formStore';
import { getFavoriteTemplateIds, toggleTemplateFavorite, subscribeTemplateFavorites } from '../data/templateFavoritesStore';
import type { Priority, ResourceType, Resource, Task, User, Project, SectionData } from '../types';
import { TaskPanel } from '../components/TaskPanel';
import { ProjectTaskRow, ColHeader } from '../components/ProjectTaskRow';
import { ChecklistView, DocumentView, ScreenplayView, MoodboardView, FileView, FormView, InspirationsView, mkQ as mkFormQ } from './ResourceDetail';
import type { ScriptEl, ScriptElType, FormQuestion, FormQType } from './ResourceDetail';
import { VideoReviewBody } from './VideoReview';

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

function documentSectionsToHTML(sections: DocumentSection[]): string {
  return sections.map(sec =>
    `<h2>${sec.title}</h2><p>${sec.body.replace(/\n/g, '</p><p>')}</p>`
  ).join('\n');
}

function sceneBlocksToElements(blocks: SceneBlock[]): ScriptEl[] {
  return blocks.flatMap(b => [
    { id: b.id + '_scene', type: 'scene' as ScriptElType, text: `${b.location} — ${b.time}` },
    { id: b.id + '_action', type: 'action' as ScriptElType, text: b.action },
  ]);
}

function elementsToSceneBlocks(elements: ScriptEl[]): SceneBlock[] {
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

  const checklistContentRef = useRef<(() => { id: string; text: string }[]) | null>(null);
  const docContentRef = useRef<(() => string) | null>(null);
  const screenplayContentRef = useRef<(() => ScriptEl[]) | null>(null);

  const fakeResource: Resource = {
    id: tpl.id, type: tpl.type as ResourceType,
    eyebrow: tpl.type, title: name,
    status: 'neutral', statusLabel: t('models.templateBadge'), meta: '',
  };

  const handleSave = () => {
    const updated: ResourceTemplate = { ...tpl, name };
    if (tpl.type === 'checklist' && checklistContentRef.current) {
      updated.checklistItems = checklistContentRef.current();
    }
    if (tpl.type === 'document' && docContentRef.current) {
      updated.rawHTML = docContentRef.current();
    }
    if (tpl.type === 'screenplay' && screenplayContentRef.current) {
      updated.sceneBlocks = elementsToSceneBlocks(screenplayContentRef.current());
    }
    onSave(updated);
    setDirty(false);
  };

  const seedItems = tpl.checklistItems;
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
          <span onClick={() => { if (!tpl.builtIn) setEditingName(true); }}
            style={{ flex: 1, fontSize: 15, fontWeight: 600, cursor: tpl.builtIn ? 'default' : 'text', padding: '4px 6px', borderRadius: 7, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
            title={tpl.builtIn ? undefined : t('models.clickToRename')}
          >
            {name}
          </span>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          {tpl.builtIn ? (
            <SFButton variant="secondary" icon="copy" onClick={() => {
              const copy: ResourceTemplate = { ...tpl, id: `res-${Date.now()}`, name: `${tpl.name} (copie)`, builtIn: false, rawHTML: docContentRef.current?.() ?? tpl.rawHTML };
              onSave(copy);
            }}>{t('models.saveCopy')}</SFButton>
          ) : (
            <SFButton variant={dirty ? 'primary' : 'secondary'} icon="save" onClick={handleSave}>
              {dirty ? t('models.saveDirty') : t('models.save')}
            </SFButton>
          )}
          <button onClick={onClose} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
      </div>
      {/* Content */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        {tpl.type === 'checklist' && <ChecklistView resource={fakeResource} seedItems={seedItems} contentRef={checklistContentRef} />}
        {tpl.type === 'document' && <DocumentView resource={fakeResource} seedHTML={seedHTML} contentRef={docContentRef} onEdit={() => setDirty(true)} />}
        {tpl.type === 'screenplay' && <ScreenplayView resource={fakeResource} seedElements={seedElements} contentRef={screenplayContentRef} onEdit={() => setDirty(true)} />}
        {tpl.type === 'moodboard' && <MoodboardView resource={fakeResource} />}
        {tpl.type === 'file' && <FileView resource={fakeResource} seedFolderStructure={tpl.folderStructure} />}
        {tpl.type === 'video_review' && <VideoReviewBody resource={fakeResource} />}
        {tpl.type === 'inspirations' && <InspirationsView resource={fakeResource} />}
        {tpl.type === 'form' && <FormView resource={fakeResource} templateMode initialQuestions={fieldsToQuestions(tpl.fields ?? [])} />}
      </div>
    </div>
  );
}

// ── Shared constants ───────────────────────────────────────────────────────────

const PRIORITY_LABEL_KEY: Record<Priority, string> = { high: 'models.priorityHigh', normal: 'models.priorityNormal', low: 'models.priorityLow', none: 'models.priorityNone' };
const PRIORITY_COLOR: Record<Priority, string> = { high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)' };
const STATUS_OPTIONS: { value: string; labelKey: string; color: string }[] = [
  { value: '', labelKey: 'models.statusNone', color: 'var(--text-3)' },
  { value: 'info', labelKey: 'models.statusInProgress', color: 'var(--info)' },
  { value: 'warn', labelKey: 'models.statusWaiting', color: 'var(--warn)' },
  { value: 'ok', labelKey: 'models.statusCompleted', color: 'var(--ok)' },
  { value: 'danger', labelKey: 'models.statusOverdue', color: 'var(--danger)' },
  { value: 'review', labelKey: 'models.statusInReview', color: 'var(--text-2)' },
];
const USERS_LIST = Object.values(USERS);

const RESOURCE_LABEL_KEYS: Record<ResourceType, string> = {
  screenplay: 'models.resScript', video_review: 'models.resReviewShort', moodboard: 'models.resMoodboard',
  document: 'models.resDocument', checklist: 'models.resChecklist', inspirations: 'models.resInspirations', file: 'models.resFile', form: 'models.resForm',
};
const RESOURCE_ICON: Record<ResourceType, string> = {
  screenplay: 'file-text', video_review: 'video', moodboard: 'grid-2x2',
  document: 'file', checklist: 'list-checks', inspirations: 'image', file: 'paperclip', form: 'clipboard-list',
};

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

const COLORS = ['#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8', '#a85f3e', '#2a7a8a', '#7a6a2a', '#4a3428', '#2d5a7d'];

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

// ── Project Template Editor (modal) ────────────────────────────────────────────

function TemplateEditor({ template, onSave, onClose }: {
  template: Partial<ProjectTemplate>;
  onSave: (t: ProjectTemplate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(template.name ?? '');
  const [description, setDescription] = useState(template.description ?? '');
  const [color, setColor] = useState(template.color ?? '#3b4f8f');
  const [tags, setTags] = useState(template.tags?.join(', ') ?? '');
  const [sections, setSections] = useState<TemplateSection[]>(template.sections ?? []);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [expandedSection, setExpandedSection] = useState<number | null>(0);
  const [expandedTask, setExpandedTask] = useState<Record<string, boolean>>({});
  const [newTaskTitle, setNewTaskTitle] = useState<Record<number, string>>({});

  const addSection = () => {
    if (!newSectionLabel.trim()) return;
    setSections(p => [...p, { label: newSectionLabel.trim(), tasks: [] }]);
    setNewSectionLabel('');
    setExpandedSection(sections.length);
  };

  const removeSection = (i: number) => setSections(p => p.filter((_, idx) => idx !== i));

  const addTask = (sIdx: number) => {
    const title = newTaskTitle[sIdx]?.trim();
    if (!title) return;
    setSections(p => p.map((s, i) => i === sIdx ? { ...s, tasks: [...s.tasks, { title, priority: 'normal' as Priority }] } : s));
    setNewTaskTitle(p => ({ ...p, [sIdx]: '' }));
  };

  const removeTask = (sIdx: number, tIdx: number) =>
    setSections(p => p.map((s, i) => i === sIdx ? { ...s, tasks: s.tasks.filter((_, ti) => ti !== tIdx) } : s));

  const updateTask = (sIdx: number, tIdx: number, patch: Partial<TemplateTask>) =>
    setSections(p => p.map((s, i) => i === sIdx ? { ...s, tasks: s.tasks.map((t, ti) => ti === tIdx ? { ...t, ...patch } : t) } : s));

  const toggleTask = (sIdx: number, tIdx: number) => {
    const key = `${sIdx}-${tIdx}`;
    setExpandedTask(p => ({ ...p, [key]: !p[key] }));
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: template.id ?? `tpl-${Date.now()}`,
      name: name.trim(), description: description.trim(), color,
      icon: template.icon ?? 'folder',
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      sections, resources: template.resources ?? [],
      builtIn: false,
      createdAt: template.createdAt ?? new Date().toISOString().split('T')[0],
    });
  };

  const [editingName, setEditingName] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
          <SFIcon name="arrow-left" size={13} />{t('nav.models')}
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: 10, fontFamily: 'var(--ff-mono)', border: '1px solid var(--border-2)', flexShrink: 0 }}>
          <SFIcon name="layout-template" size={10} />{t('models.badgeProject')}
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
          >{name || t('models.templateNamePlaceholder')}</span>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          <SFButton variant="ghost" size="sm" onClick={onClose}>{t('models.cancel')}</SFButton>
          <SFButton variant="primary" size="sm" icon="check" onClick={handleSave} style={{ opacity: name.trim() ? 1 : 0.5 }}>{template.id ? t('models.saveAction') : t('models.createTemplate')}</SFButton>
        </div>
      </div>
      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle()}>{t('models.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={t('models.describeTemplateShort')} style={fieldStyle({ resize: 'none' })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle()}>{t('models.color')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => (
                  <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', outline: 'none', flexShrink: 0 }} />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle()}>{t('models.tagsComma')}</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder={t('models.tagsPlaceholderVideo')} style={fieldStyle()} />
            </div>
          </div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={labelStyle()}>{t('models.sectionsAndTasks')}</label>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t('models.tasksDotSections', { tasks: sections.reduce((s, sec) => s + sec.tasks.length, 0), sections: sections.length })}</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {sections.map((sec, sIdx) => (
                <div key={sIdx} style={{ border: '1px solid var(--border)', borderRadius: 10, overflow: 'hidden' }}>
                  <div onClick={() => setExpandedSection(expandedSection === sIdx ? null : sIdx)} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', background: 'var(--surface-2)', cursor: 'pointer' }}>
                    <SFIcon name={expandedSection === sIdx ? 'chevron-down' : 'chevron-right'} size={13} color="var(--text-3)" />
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1 }}>{sec.label}</span>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t('models.tasksCount', { count: sec.tasks.length })}</span>
                    <button onClick={e => { e.stopPropagation(); removeSection(sIdx); }} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                      <SFIcon name="x" size={13} />
                    </button>
                  </div>
                  {expandedSection === sIdx && (
                    <div style={{ padding: '10px 14px', display: 'flex', flexDirection: 'column', gap: 6 }}>
                      {sec.tasks.map((tk, tIdx) => {
                        const taskKey = `${sIdx}-${tIdx}`;
                        const isExp = !!expandedTask[taskKey];
                        const statusOpt = STATUS_OPTIONS.find(o => o.value === (tk.status ?? '')) ?? STATUS_OPTIONS[0];
                        const selStyle: React.CSSProperties = { background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 6, color: 'var(--text)', fontSize: 11, padding: '3px 5px', colorScheme: 'dark', cursor: 'pointer', fontFamily: 'var(--ff-text)' };
                        return (
                          <div key={tIdx} style={{ border: '1px solid var(--border)', borderRadius: 8, overflow: 'hidden', background: isExp ? 'var(--surface-2)' : 'transparent' }}>
                            {/* Row header */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px' }}>
                              <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[tk.priority], flexShrink: 0, display: 'block' }} />
                              <input
                                value={tk.title}
                                onChange={e => updateTask(sIdx, tIdx, { title: e.target.value })}
                                style={{ flex: 1, fontSize: 12, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--ff-text)' }}
                                placeholder={t('models.taskTitlePlaceholder')}
                              />
                              {tk.assignee && (
                                <span title={tk.assignee.name} style={{ width: 18, height: 18, borderRadius: '50%', background: tk.assignee.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#fff', fontWeight: 700, flexShrink: 0 }}>
                                  {tk.assignee.initials}
                                </span>
                              )}
                              {tk.status && (
                                <span style={{ width: 7, height: 7, borderRadius: '50%', background: statusOpt.color, flexShrink: 0, display: 'block' }} title={t(statusOpt.labelKey)} />
                              )}
                              {tk.dueDate && (
                                <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{tk.dueDate}</span>
                              )}
                              <button onClick={() => toggleTask(sIdx, tIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2, transition: 'transform 0.15s', transform: isExp ? 'rotate(180deg)' : 'none' }}>
                                <SFIcon name="chevron-down" size={11} />
                              </button>
                              <button onClick={() => removeTask(sIdx, tIdx)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--border-2)', display: 'flex', padding: 2 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--border-2)')}>
                                <SFIcon name="x" size={12} />
                              </button>
                            </div>
                            {/* Expanded detail */}
                            {isExp && (
                              <div style={{ padding: '0 10px 10px 10px', display: 'flex', flexDirection: 'column', gap: 8, borderTop: '1px solid var(--border)' }}>
                                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr 1fr', gap: 6, paddingTop: 8 }}>
                                  {/* Priority */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('models.priorityLabel')}</span>
                                    <select value={tk.priority} onChange={e => updateTask(sIdx, tIdx, { priority: e.target.value as Priority })} style={selStyle}>
                                      {(['high', 'normal', 'low'] as Priority[]).map(p => <option key={p} value={p}>{t(PRIORITY_LABEL_KEY[p])}</option>)}
                                    </select>
                                  </div>
                                  {/* Status */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('models.statusLabel')}</span>
                                    <select value={tk.status ?? ''} onChange={e => {
                                      const opt = STATUS_OPTIONS.find(o => o.value === e.target.value);
                                      updateTask(sIdx, tIdx, { status: opt?.value || undefined, statusLabel: opt ? t(opt.labelKey) : undefined });
                                    }} style={selStyle}>
                                      {STATUS_OPTIONS.map(o => <option key={o.value} value={o.value}>{t(o.labelKey)}</option>)}
                                    </select>
                                  </div>
                                  {/* Assignee */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('models.assigneeLabel')}</span>
                                    <select value={tk.assignee?.id ?? ''} onChange={e => {
                                      const u = USERS_LIST.find(u => u.id === e.target.value);
                                      updateTask(sIdx, tIdx, { assignee: u ? { id: u.id, name: u.name, initials: u.initials, avatarColor: u.avatarColor } : undefined });
                                    }} style={selStyle}>
                                      <option value="">{t('models.assigneeNone')}</option>
                                      {USERS_LIST.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}
                                    </select>
                                  </div>
                                  {/* Due date */}
                                  <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('models.dueDateLabel')}</span>
                                    <input
                                      value={tk.dueDate ?? ''}
                                      onChange={e => updateTask(sIdx, tIdx, { dueDate: e.target.value || undefined })}
                                      placeholder={t('models.dueDatePlaceholder')}
                                      style={{ ...selStyle, border: '1px solid var(--border)', borderRadius: 6 }}
                                    />
                                  </div>
                                </div>
                                {/* Description */}
                                <div style={{ display: 'flex', flexDirection: 'column', gap: 3 }}>
                                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('models.description')}</span>
                                  <textarea
                                    value={tk.description ?? ''}
                                    onChange={e => updateTask(sIdx, tIdx, { description: e.target.value || undefined })}
                                    rows={2}
                                    placeholder={t('models.taskNotesPlaceholder')}
                                    style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-text)', outline: 'none', resize: 'vertical', colorScheme: 'dark', boxSizing: 'border-box' }}
                                  />
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                      <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                        <input value={newTaskTitle[sIdx] ?? ''} onChange={e => setNewTaskTitle(p => ({ ...p, [sIdx]: e.target.value }))} onKeyDown={e => { if (e.key === 'Enter') addTask(sIdx); }} placeholder={t('models.addTaskPlaceholder')} style={{ flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }} />
                        <button onClick={() => addTask(sIdx)} style={{ padding: '5px 10px', borderRadius: 7, border: 'none', background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer' }}><SFIcon name="plus" size={12} /></button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              <div style={{ display: 'flex', gap: 6 }}>
                <input value={newSectionLabel} onChange={e => setNewSectionLabel(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') addSection(); }} placeholder={t('models.newSectionPlaceholder')} style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }} />
                <SFButton variant="secondary" size="sm" icon="plus" onClick={addSection}>{t('models.section')}</SFButton>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Template Detail sidebar ────────────────────────────────────────────────────

function TemplateDetail({ tpl, onEdit, onDuplicate, onDelete, onCreateProject, onPreview, onRename }: {
  tpl: ProjectTemplate;
  onEdit: () => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onCreateProject: () => void;
  onPreview: () => void;
  onRename?: (name: string, description: string) => void;
}) {
  const { t } = useTranslation();
  const totalTasks = tpl.sections.reduce((s, sec) => s + sec.tasks.length, 0);
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
            {tpl.builtIn
              ? <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4 }}>{tpl.name}</h2>
              : <div style={{ marginBottom: 4 }}><InlineEditable value={editName} onChange={setEditName} onBlur={() => onRename?.(editName, editDesc)} fontSize={16} fontWeight={700} placeholder={t('models.templateNamePlaceholder')} /></div>}
            {tpl.builtIn
              ? <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 6 }}>{tpl.description}</p>
              : <div style={{ marginBottom: 6 }}><InlineEditable value={editDesc} onChange={setEditDesc} onBlur={() => onRename?.(editName, editDesc)} multiline rows={2} fontSize={12} color="var(--text-3)" placeholder={t('models.templateDescPlaceholder')} /></div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ display: 'flex', gap: 3 }}>
                {tpl.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${TAG_COLORS[tag] ?? '#3b4f8f'}22`, color: TAG_COLORS[tag] ?? 'var(--text-3)', border: `1px solid ${TAG_COLORS[tag] ?? '#3b4f8f'}44`, whiteSpace: 'nowrap' }}>{tag}</span>
                ))}
              </div>
              {tpl.builtIn && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600 }}>{t('models.builtIn')}</span>}
            </div>
          </div>
        </div>
        {/* Stats row */}
        <div style={{ display: 'flex', gap: 12 }}>
          {[{ label: t('models.sections'), value: tpl.sections.length }, { label: t('models.tasks'), value: totalTasks }].map((s) => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <p style={{ fontSize: 18, fontWeight: 700, fontFamily: 'var(--ff-mono)', color: 'var(--text)' }}>{s.value || '—'}</p>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 12 }}>
        {tpl.sections.length === 0 && <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', textAlign: 'center', padding: '20px 0' }}>{t('models.noSectionBlank')}</p>}
        {tpl.sections.map((sec, i) => (
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
        {tpl.resources.length > 0 && (
          <div style={{ marginTop: 6 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{t('models.includedResources')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {tpl.resources.map((r, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <SFIcon name={RESOURCE_ICON[r.type]} size={12} color="var(--text-3)" />
                  <span style={{ fontSize: 11, color: 'var(--text-2)' }}>{r.title}</span>
                  <span style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>({t(RESOURCE_LABEL_KEYS[r.type])})</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
      <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8, flexShrink: 0 }}>
        <SFButton variant="primary" icon="plus" onClick={onCreateProject} style={{ width: '100%', justifyContent: 'center' }}>{t('models.createProjectFromTemplate')}</SFButton>
        <SFButton variant="secondary" icon="eye" onClick={onPreview} style={{ width: '100%', justifyContent: 'center' }}>{t('models.viewAsProject')}</SFButton>
        <div style={{ display: 'flex', gap: 6 }}>
          <SFButton variant="secondary" size="sm" icon="square-pen" onClick={onEdit} style={{ flex: 1, justifyContent: 'center' }}>
            {tpl.builtIn ? t('models.editCopy') : t('models.edit')}
          </SFButton>
          <SFButton variant="secondary" size="sm" icon="copy" onClick={onDuplicate} style={{ flex: 1, justifyContent: 'center' }}>{t('models.duplicate')}</SFButton>
          {!tpl.builtIn && <SFButton variant="ghost" size="sm" icon="trash-2" onClick={onDelete} style={{ color: 'var(--danger)' }} />}
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
      taskCount: template.sections.reduce((n, s) => n + s.tasks.length, 0),
      deliverableCount: 0,
      members,
      deliveryDate: '—',
      status: 'info',
      statusLabel: t('projects.statusInProgress'),
      modifiedAt: t('clients.justNow'),
      folderStructureTemplateId: template.defaultFolderStructureId ?? undefined,
    };

    // Materialize the template's sections + tasks into the project task store.
    const sections: SectionData[] = template.sections.map(sec => ({
      label: sec.label,
      progress: 0,
      tasks: sec.tasks.map((tt, i): Task => ({
        id: `${projectId}-${sec.label}-${i}`,
        title: tt.title,
        projectId,
        projectName: newProject.name,
        projectColor: color,
        assignee: owner,
        status: 'warn',
        statusLabel: t('models.statusWaiting'),
        priority: tt.priority ?? 'normal',
        priorityLabel: tt.priority === 'high' ? t('models.priorityHigh') : tt.priority === 'low' ? t('models.priorityLow') : t('models.priorityNormal'),
        dueDate: '',
        checked: false,
        subtasks: [],
      })),
    }));
    if (sections.length) setSections(projectId, sections);

    // Materialize the default folder structure if the template defines one.
    if (template.defaultFolderStructureId) {
      const fileTpl = loadAllResourceTemplates().find(t => t.id === template.defaultFolderStructureId);
      if (fileTpl?.folderStructure?.length) addFolderTree(fileTpl.folderStructure, { projectId });
    }

    addProject(newProject);
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
              {[{ icon: 'layers', val: t('models.sectionsCount', { count: template.sections.length }) }, { icon: 'check-square', val: t('models.tasksCount', { count: template.sections.reduce((s, sec) => s + sec.tasks.length, 0) }) }, { icon: 'file', val: t('models.resourcesCount', { count: template.resources.length }) }].map(s => (
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
          {!tpl.builtIn && <SFButton variant="ghost" size="sm" icon="trash-2" onClick={onDelete} style={{ color: 'var(--danger)' }} />}
        </div>
      </div>
    </div>
  );
}

// ── Form Template Editor (modal) ───────────────────────────────────────────────

function FormTemplateEditor({ template, onSave, onClose }: {
  template: Partial<FormTemplate>;
  onSave: (t: FormTemplate) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(template.name ?? '');
  const [description, setDescription] = useState(template.description ?? '');
  const [color, setColor] = useState(template.color ?? '#3b4f8f');
  const [tags, setTags] = useState(template.tags?.join(', ') ?? '');
  const [fields, setFields] = useState<FormField[]>(template.fields ?? []);
  const [editingField, setEditingField] = useState<FormField | null>(null);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);
  const [addType, setAddType] = useState<FormFieldType>('text');

  const openNewField = () => {
    const newF: FormField = { id: `f-${Date.now()}`, type: addType, label: '' };
    setEditingField(newF);
    setEditingIdx(null);
  };

  const openEditField = (f: FormField, idx: number) => {
    setEditingField({ ...f });
    setEditingIdx(idx);
  };

  const saveField = () => {
    if (!editingField || !editingField.label.trim()) return;
    if (editingIdx !== null) {
      setFields(p => p.map((f, i) => i === editingIdx ? editingField : f));
    } else {
      setFields(p => [...p, editingField]);
    }
    setEditingField(null);
    setEditingIdx(null);
  };

  const removeField = (i: number) => setFields(p => p.filter((_, idx) => idx !== i));
  const moveField = (i: number, dir: -1 | 1) => {
    const j = i + dir;
    if (j < 0 || j >= fields.length) return;
    const arr = [...fields];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    setFields(arr);
  };

  const handleSave = () => {
    if (!name.trim()) return;
    onSave({
      id: template.id ?? `form-${Date.now()}`,
      name: name.trim(), description: description.trim(), color,
      icon: template.icon ?? 'clipboard-list',
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      fields, builtIn: false,
      createdAt: template.createdAt ?? new Date().toISOString().split('T')[0],
    });
  };

  const [editingName, setEditingName] = useState(false);

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, display: 'flex', flexDirection: 'column', background: 'var(--bg)', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
          <SFIcon name="arrow-left" size={13} />{t('nav.models')}
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <span style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, background: 'var(--surface-3)', color: 'var(--text-2)', fontSize: 10, fontFamily: 'var(--ff-mono)', border: '1px solid var(--border-2)', flexShrink: 0 }}>
          <SFIcon name="clipboard-list" size={10} />{t('models.resForm')}
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
          >{name || t('models.formNamePlaceholder')}</span>
        )}
        <div style={{ display: 'flex', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          <SFButton variant="ghost" size="sm" onClick={onClose}>{t('models.cancel')}</SFButton>
          <SFButton variant="primary" size="sm" icon="check" onClick={handleSave} style={{ opacity: name.trim() ? 1 : 0.5 }}>{template.id ? t('models.saveAction') : t('models.createForm')}</SFButton>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'auto', padding: '28px 0' }}>
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <label style={labelStyle()}>{t('models.description')}</label>
            <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={t('models.describeFormUsage')} style={fieldStyle({ resize: 'none' })} />
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={labelStyle()}>{t('models.color')}</label>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {COLORS.map(c => <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', outline: 'none', flexShrink: 0 }} />)}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={labelStyle()}>{t('models.tagsComma')}</label>
              <input value={tags} onChange={e => setTags(e.target.value)} placeholder={t('models.tagsPlaceholderClient')} style={fieldStyle()} />
            </div>
          </div>

          {/* Fields list */}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <label style={labelStyle()}>{t('models.fieldsCount', { count: fields.length })}</label>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {fields.map((f, i) => (
                <div key={f.id} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <div style={{ width: 22, height: 22, borderRadius: 6, background: `${color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SFIcon name={FORM_FIELD_TYPE_ICONS[f.type]} size={11} color={color} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.label || <em style={{ color: 'var(--text-3)' }}>{t('models.untitled')}</em>}</p>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t(FORM_FIELD_TYPE_LABEL_KEYS[f.type])}{f.required ? ` · ${t('models.requiredSuffix')}` : ''}</p>
                  </div>
                  <div style={{ display: 'flex', gap: 2 }}>
                    <button onClick={() => moveField(i, -1)} disabled={i === 0} style={{ background: 'none', border: 'none', cursor: i === 0 ? 'default' : 'pointer', color: i === 0 ? 'var(--border-2)' : 'var(--text-3)', display: 'flex', padding: 3 }}><SFIcon name="chevron-up" size={12} /></button>
                    <button onClick={() => moveField(i, 1)} disabled={i === fields.length - 1} style={{ background: 'none', border: 'none', cursor: i === fields.length - 1 ? 'default' : 'pointer', color: i === fields.length - 1 ? 'var(--border-2)' : 'var(--text-3)', display: 'flex', padding: 3 }}><SFIcon name="chevron-down" size={12} /></button>
                    <button onClick={() => openEditField(f, i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 3 }}><SFIcon name="square-pen" size={12} /></button>
                    <button onClick={() => removeField(i)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 3 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}><SFIcon name="x" size={12} /></button>
                  </div>
                </div>
              ))}
              {/* Add field row */}
              <div style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <select value={addType} onChange={e => setAddType(e.target.value as FormFieldType)} style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text)', fontSize: 12, outline: 'none', colorScheme: 'dark', cursor: 'pointer' }}>
                  {(Object.keys(FORM_FIELD_TYPE_LABEL_KEYS) as FormFieldType[]).map(ft => (
                    <option key={ft} value={ft}>{t(FORM_FIELD_TYPE_LABEL_KEYS[ft])}</option>
                  ))}
                </select>
                <SFButton variant="secondary" size="sm" icon="plus" onClick={openNewField}>{t('models.addField')}</SFButton>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Field editor sub-modal */}
      {editingField && (
        <>
          <div onClick={() => setEditingField(null)} style={{ position: 'fixed', inset: 0, zIndex: 210, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 460, zIndex: 211, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, boxShadow: '0 16px 60px rgba(0,0,0,0.8)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <h3 style={{ fontSize: 14, fontWeight: 700 }}>{editingIdx !== null ? t('models.editField') : t('models.newField')}</h3>
              <button onClick={() => setEditingField(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={15} /></button>
            </div>
            <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle()}>{t('models.typeLabel')}</label>
                <select value={editingField.type} onChange={e => setEditingField(f => f ? { ...f, type: e.target.value as FormFieldType, options: undefined } : f)} style={fieldStyle({ cursor: 'pointer' })}>
                  {(Object.keys(FORM_FIELD_TYPE_LABEL_KEYS) as FormFieldType[]).map(ft => <option key={ft} value={ft}>{t(FORM_FIELD_TYPE_LABEL_KEYS[ft])}</option>)}
                </select>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                <label style={labelStyle()}>{t('models.questionLabelRequired')}</label>
                <input value={editingField.label} onChange={e => setEditingField(f => f ? { ...f, label: e.target.value } : f)} placeholder={t('models.questionLabelPlaceholder')} style={fieldStyle()} autoFocus />
              </div>
              {(editingField.type === 'text' || editingField.type === 'textarea' || editingField.type === 'number') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={labelStyle()}>{t('models.placeholderLabel')}</label>
                  <input value={editingField.placeholder ?? ''} onChange={e => setEditingField(f => f ? { ...f, placeholder: e.target.value } : f)} placeholder={t('models.placeholderFieldPlaceholder')} style={fieldStyle()} />
                </div>
              )}
              {(editingField.type === 'choice' || editingField.type === 'multi') && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={labelStyle()}>{t('models.optionsOnePerLine')}</label>
                  <textarea value={(editingField.options ?? []).join('\n')} onChange={e => setEditingField(f => f ? { ...f, options: e.target.value.split('\n') } : f)} rows={5} placeholder={'Option A\nOption B\nOption C'} style={fieldStyle({ resize: 'vertical' })} />
                </div>
              )}
              {editingField.type === 'rating' && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
                  <label style={labelStyle()}>{t('models.maximum')}</label>
                  <select value={editingField.ratingMax ?? 5} onChange={e => setEditingField(f => f ? { ...f, ratingMax: Number(e.target.value) } : f)} style={fieldStyle({ cursor: 'pointer' })}>
                    {[3, 4, 5, 7, 10].map(n => <option key={n} value={n}>{t('models.starsCount', { count: n })}</option>)}
                  </select>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
                  <input type="checkbox" checked={!!editingField.required} onChange={e => setEditingField(f => f ? { ...f, required: e.target.checked } : f)} style={{ accentColor: 'var(--accent)', width: 14, height: 14 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{t('models.requiredField')}</span>
                </label>
              </div>
            </div>
            <div style={{ padding: '12px 18px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" size="sm" onClick={() => setEditingField(null)}>{t('models.cancel')}</SFButton>
              <SFButton variant="primary" size="sm" icon="check" onClick={saveField} style={{ opacity: editingField.label.trim() ? 1 : 0.5 }}>{t('models.saveAction')}</SFButton>
            </div>
          </div>
        </>
      )}
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
  const [status, setStatus] = useState<'draft' | 'completed'>(instance?.status ?? 'draft');

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

function FormInstancesPanel({ templateId, templateName, templateColor, onFillNew, onEditInstance }: {
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

  const handleDelete = (id: string) => {
    if (!confirm('Supprimer cette réponse ?')) return;
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
  const totalTasks = tpl.sections.reduce((s, sec) => s + sec.tasks.length, 0);
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
            {tpl.sections.length > 0 ? `${tpl.sections.length} sections · ${totalTasks} tâches` : 'Projet vierge'}
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

// ── Template Project View (full-screen overlay, identical to Travail) ──────────

type LTask = {
  id: string; title: string; priority: Priority;
  description?: string; subtasks?: LTask[];
  status?: string; statusLabel?: string;
  dueDate?: string;
  assignee?: { id: string; name: string; initials: string; avatarColor: string };
};
type LSection = { id: string; label: string; tasks: LTask[]; };

function toLocalSections(sections: TemplateSection[]): LSection[] {
  return sections.map((s, si) => ({
    id: `sec-${si}-${s.label}`,
    label: s.label,
    tasks: s.tasks.map((t, ti) => ({
      id: `t-${si}-${ti}-${t.title}`,
      title: t.title,
      priority: t.priority,
      description: t.description,
      subtasks: t.subtasks?.map((st, sti) => ({ id: `st-${si}-${ti}-${sti}`, title: st.title, priority: st.priority, description: st.description, status: st.status, statusLabel: st.statusLabel, dueDate: st.dueDate, assignee: st.assignee })),
      status: t.status,
      statusLabel: t.statusLabel,
      dueDate: t.dueDate,
      assignee: t.assignee,
    })),
  }));
}

function fromLocalSections(sections: LSection[]): TemplateSection[] {
  return sections.map(s => ({
    label: s.label,
    tasks: s.tasks.map(t => ({
      title: t.title,
      priority: t.priority,
      description: t.description,
      subtasks: t.subtasks?.map(st => ({ title: st.title, priority: st.priority, description: st.description, status: st.status, statusLabel: st.statusLabel, dueDate: st.dueDate, assignee: st.assignee })),
      status: t.status,
      statusLabel: t.statusLabel,
      dueDate: t.dueDate,
      assignee: t.assignee,
    })),
  }));
}

// Adapt a local template task into a full Task so it can render in the shared
// ProjectTaskRow (the exact same row used in a real project's task list).
function lTaskToTask(lt: LTask): Task {
  return {
    id: lt.id,
    title: lt.title,
    projectId: '', projectName: 'Modèle', projectColor: 'var(--text-3)',
    assignee: (lt.assignee ?? null) as unknown as Task['assignee'],
    status: (lt.status ?? '') as Task['status'],
    statusLabel: lt.statusLabel ?? '',
    priority: lt.priority,
    priorityLabel: lt.priority,
    dueDate: lt.dueDate ?? '',
    dueDateRed: false,
    checked: false,
    description: lt.description,
    subtasks: lt.subtasks?.map(lTaskToTask),
    activityCount: 0,
  };
}

// Convert a Partial<Task> patch coming from ProjectTaskRow back into a local LTask patch.
function taskPatchToLPatch(patch: Partial<Task>): Partial<LTask> {
  const lp: Partial<LTask> = {};
  if (patch.title !== undefined) lp.title = patch.title;
  if (patch.priority !== undefined) lp.priority = patch.priority;
  if (patch.status !== undefined) { lp.status = (patch.status as string) || undefined; lp.statusLabel = patch.statusLabel || undefined; }
  if (patch.dueDate !== undefined) lp.dueDate = patch.dueDate || undefined;
  if (patch.assignee !== undefined) {
    const a = patch.assignee as Task['assignee'] | null;
    lp.assignee = a ? { id: a.id, name: a.name, initials: a.initials, avatarColor: a.avatarColor } : undefined;
  }
  return lp;
}

type LResource = { id: string; type: ResourceType; title: string; templateId?: string };

const RESOURCE_TYPE_ICONS_TPV: Record<ResourceType, string> = {
  screenplay: 'clapperboard', video_review: 'video', moodboard: 'grid-2x2',
  document: 'file-text', checklist: 'list-checks', inspirations: 'lightbulb',
  file: 'folder', form: 'clipboard-list',
};
const RESOURCE_TYPE_LABEL_KEYS_TPV: Record<ResourceType, string> = {
  screenplay: 'models.resTypeScreenplay', video_review: 'models.resTypeVideoReview', moodboard: 'models.resMoodboard',
  document: 'models.resDocument', checklist: 'models.resChecklist', inspirations: 'models.resInspirations',
  file: 'models.resTypeFile', form: 'models.resForm',
};

// Priority badge for board cards
function TPVPriBadge({ priority }: { priority: Priority }) {
  const MAP: Record<Priority, { label: string; color: string }> = {
    urgent: { label: 'Urgent', color: '#ef4444' },
    high: { label: 'Élevée', color: '#f97316' },
    normal: { label: 'Normale', color: '#6b7280' },
    low: { label: 'Faible', color: '#3b82f6' },
  };
  const { label, color } = MAP[priority] ?? MAP.normal;
  return (
    <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${color}22`, color, border: `1px solid ${color}44` }}>{label}</span>
  );
}

function TemplateProjectView({ tpl: initialTpl, onClose, onSave }: {
  tpl: ProjectTemplate;
  onClose: () => void;
  onSave: (updated: ProjectTemplate) => void;
}) {
  const [sections, setSections] = useState<LSection[]>(() => toLocalSections(initialTpl.sections));
  const [tplName, setTplName] = useState(initialTpl.name);
  const [tplDescription, setTplDescription] = useState(initialTpl.description ?? '');
  const [resources, setResources] = useState<LResource[]>(() =>
    (initialTpl.resources ?? []).map((r, i) => ({ id: `r-${Date.now()}-${i}`, ...r }))
  );
  const [activeTab, setActiveTab] = useState<'overview' | 'tasks' | 'resources'>('tasks');
  const [viewMode, setViewMode] = useState<'list' | 'board' | 'calendar'>('list');
  const [selectedTask, setSelectedTask] = useState<LTask | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSecLabel, setNewSecLabel] = useState('');
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [savedFlash, setSavedFlash] = useState(false);
  const [showAddResource, setShowAddResource] = useState(false);
  const [resTypeFilter, setResTypeFilter] = useState<ResourceType | null>(null);

  // Section drag
  const dragSecRef = useRef<string | null>(null);
  const [dragOverSec, setDragOverSec] = useState<string | null>(null);
  const dragTaskRef = useRef<{ sectionId: string; taskId: string } | null>(null);
  const [dragOverTask, setDragOverTask] = useState<string | null>(null);
  const dragSecHandleActive = useRef(false);

  const mutate = (next: LSection[]) => { setSections(next); setDirty(true); };

  const handleSave = () => {
    onSave({
      ...initialTpl,
      name: tplName,
      description: tplDescription,
      sections: fromLocalSections(sections),
      resources: resources.map(({ id: _id, ...r }) => r),
    });
    setDirty(false);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2000);
  };

  const addSection = () => {
    const label = newSecLabel.trim();
    if (!label) return;
    mutate([...sections, { id: `sec-${Date.now()}`, label, tasks: [] }]);
    setNewSecLabel(''); setAddingSection(false);
  };

  const updateSection = (id: string, patch: Partial<LSection>) => {
    mutate(sections.map(s => s.id === id ? { ...s, ...patch } : s));
  };

  const removeSection = (id: string) => mutate(sections.filter(s => s.id !== id));

  const addTask = (sectionId: string) => {
    const title = (newTaskInputs[sectionId] ?? '').trim();
    if (!title) return;
    const newTask: LTask = { id: `t-${Date.now()}`, title, priority: 'normal' };
    mutate(sections.map(s => s.id === sectionId ? { ...s, tasks: [...s.tasks, newTask] } : s));
    setNewTaskInputs(p => ({ ...p, [sectionId]: '' }));
  };

  const updateTask = (sectionId: string, taskId: string, patch: Partial<LTask>) => {
    mutate(sections.map(s => s.id === sectionId ? { ...s, tasks: s.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) } : s));
  };

  const deleteTask = (sectionId: string, taskId: string) => {
    mutate(sections.map(s => s.id === sectionId ? { ...s, tasks: s.tasks.filter(t => t.id !== taskId) } : s));
  };

  const reorderSection = (fromId: string, toId: string) => {
    if (fromId === toId) return;
    const from = sections.find(s => s.id === fromId)!;
    const rest = sections.filter(s => s.id !== fromId);
    const toIdx = rest.findIndex(s => s.id === toId);
    mutate([...rest.slice(0, toIdx), from, ...rest.slice(toIdx)]);
  };

  const reorderTask = (sectionId: string, fromId: string, toId: string) => {
    if (fromId === toId) return;
    mutate(sections.map(s => {
      if (s.id !== sectionId) return s;
      const from = s.tasks.find(t => t.id === fromId)!;
      const rest = s.tasks.filter(t => t.id !== fromId);
      const toIdx = rest.findIndex(t => t.id === toId);
      return { ...s, tasks: [...rest.slice(0, toIdx), from, ...rest.slice(toIdx)] };
    }));
  };

  // keep dragSecHandleActive separate (not needed in new render — kept for section drag)

  const allResTpls = loadAllResourceTemplates();

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
        <button onClick={onClose} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12, fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap' }}>
          <SFIcon name="arrow-left" size={13} />Modèles
        </button>
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />
        <div style={{ width: 26, height: 26, borderRadius: 8, background: initialTpl.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SFIcon name={initialTpl.icon} size={13} color="rgba(255,255,255,0.9)" />
        </div>
        <input
          value={tplName}
          onChange={e => { setTplName(e.target.value); setDirty(true); }}
          placeholder="Nom du modèle…"
          style={{ flex: 1, fontSize: 15, fontWeight: 600, background: 'transparent', border: 'none', outline: 'none', color: tplName ? 'var(--text)' : 'var(--text-3)', fontFamily: 'var(--ff-text)', minWidth: 0 }}
        />
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', flexShrink: 0 }}>
          {savedFlash && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--ok)', display: 'flex', alignItems: 'center', gap: 4 }}><SFIcon name="check" size={11} />Enregistré</span>}
          <SFButton variant={dirty ? 'primary' : 'secondary'} size="sm" icon="save" onClick={handleSave}>
            {dirty ? 'Sauvegarder *' : 'Sauvegarder'}
          </SFButton>
          <button onClick={onClose} style={{ padding: '6px 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', alignItems: 'center' }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ padding: '0 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', flexShrink: 0, gap: 0 }}>
        {([
          { key: 'overview', label: "Vue d'ensemble" },
          { key: 'tasks',    label: 'Tâches' },
          { key: 'resources', label: 'Ressources' },
        ] as const).map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ padding: '10px 16px', border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--ff-text)', fontWeight: activeTab === tab.key ? 600 : 400, color: activeTab === tab.key ? 'var(--text)' : 'var(--text-3)', borderBottom: activeTab === tab.key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom: -1, transition: 'color 0.15s' }}>
            {tab.label}
          </button>
        ))}
        {activeTab === 'tasks' && (
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
            {([
              { key: 'list',     icon: 'list',          label: 'Liste'      },
              { key: 'board',    icon: 'layout-kanban', label: 'Board'      },
              { key: 'calendar', icon: 'calendar',      label: 'Calendrier' },
            ] as const).map(v => (
              <button key={v.key} onClick={() => { if (v.key !== 'calendar') { setViewMode(v.key); setSelectedTask(null); } }} title={v.key === 'calendar' ? 'Disponible dans un projet réel' : v.label}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: 'none', cursor: v.key === 'calendar' ? 'not-allowed' : 'pointer',
                  background: viewMode === v.key ? 'var(--surface)' : 'transparent',
                  color: v.key === 'calendar' ? 'var(--border-2)' : viewMode === v.key ? 'var(--text)' : 'var(--text-3)',
                  fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: viewMode === v.key ? 600 : 400,
                  boxShadow: viewMode === v.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none',
                  opacity: v.key === 'calendar' ? 0.5 : 1,
                }}>
                <SFIcon name={v.icon} size={13} />{v.label}
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ── Vue d'ensemble ─────────────────────────────────────────────────────── */}
      {activeTab === 'overview' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '32px' }}>
          <div style={{ maxWidth: 720, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 24 }}>
            {/* Stats row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12 }}>
              {[
                { icon: 'layers', label: 'Sections', value: sections.length },
                { icon: 'check-square', label: 'Tâches', value: sections.reduce((n, s) => n + s.tasks.length, 0) },
                { icon: 'paperclip', label: 'Ressources', value: resources.length },
              ].map(card => (
                <div key={card.label} style={{ padding: '18px 20px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                    <SFIcon name={card.icon} size={14} color="var(--text-3)" />
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{card.label}</span>
                  </div>
                  <span style={{ fontSize: 26, fontWeight: 700, color: 'var(--text)', lineHeight: 1 }}>{card.value}</span>
                </div>
              ))}
            </div>
            {/* Description */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Description du modèle</label>
              <textarea
                value={tplDescription}
                onChange={e => { setTplDescription(e.target.value); setDirty(true); }}
                placeholder="Décrivez ce modèle de projet…"
                rows={5}
                style={{ padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', resize: 'vertical', colorScheme: 'dark', lineHeight: 1.6 }}
              />
            </div>
            {/* Tags */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tags</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(initialTpl.tags ?? []).map(tag => (
                  <span key={tag} style={{ padding: '3px 10px', borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>{tag}</span>
                ))}
                {(initialTpl.tags ?? []).length === 0 && <span style={{ color: 'var(--text-3)', fontSize: 12 }}>Aucun tag</span>}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Tâches ─────────────────────────────────────────────────────────────── */}
      {activeTab === 'tasks' && (
        <div style={{ flex: 1, overflow: 'hidden', display: 'flex' }}>
          {/* List view */}
          {viewMode === 'list' && (
            <div style={{ flex: 1, overflowY: 'auto', padding: '24px 0' }}>
              <div style={{ maxWidth: 1100, width: '100%', margin: '0 auto', padding: '0 32px', display: 'flex', flexDirection: 'column', gap: 16 }}>
                {sections.length === 0 && !addingSection && (
                  <div style={{ padding: '60px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                    Aucune section — ajoutez une section pour commencer
                  </div>
                )}
                {sections.map(sec => (
                  <div key={sec.id}
                    draggable
                    onDragStart={e => { if (!dragSecHandleActive.current) { e.preventDefault(); return; } dragSecRef.current = sec.id; }}
                    onDragEnd={() => { dragSecRef.current = null; setDragOverSec(null); dragSecHandleActive.current = false; }}
                    onDragOver={e => { if (dragSecRef.current && dragSecRef.current !== sec.id) { e.preventDefault(); setDragOverSec(sec.id); } }}
                    onDrop={e => { e.preventDefault(); if (dragSecRef.current) reorderSection(dragSecRef.current, sec.id); dragSecRef.current = null; setDragOverSec(null); }}
                    style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: `1px solid ${dragOverSec === sec.id ? 'var(--border-2)' : 'var(--border)'}`, overflow: 'hidden', transition: 'border-color 0.15s' }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)' }}>
                      <div onMouseDown={() => { dragSecHandleActive.current = true; }} onMouseUp={() => { dragSecHandleActive.current = false; }}
                        style={{ color: 'var(--border-2)', cursor: 'grab', display: 'flex', flexShrink: 0 }}>
                        <SFIcon name="grip-vertical" size={14} />
                      </div>
                      <div style={{ width: 17, height: 17, borderRadius: '50%', flexShrink: 0, border: '1.5px solid var(--border-2)', background: 'transparent' }} />
                      <input value={sec.label} onChange={e => updateSection(sec.id, { label: e.target.value })}
                        style={{ fontWeight: 600, fontSize: 13, flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontFamily: 'var(--ff-text)' }} />
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>({sec.tasks.length} tâches)</span>
                      <button onClick={() => removeSection(sec.id)}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 5 }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                        <SFIcon name="trash-2" size={13} />
                      </button>
                    </div>
                    <ColHeader />
                    {sec.tasks.map(task => (
                      <div key={task.id}
                        onDragOver={e => { if (dragTaskRef.current?.sectionId === sec.id) { e.preventDefault(); setDragOverTask(task.id); } }}
                        onDrop={e => { e.preventDefault(); if (dragTaskRef.current?.sectionId === sec.id) reorderTask(sec.id, dragTaskRef.current.taskId, task.id); dragTaskRef.current = null; setDragOverTask(null); }}
                        style={{ borderTop: dragOverTask === task.id ? '2px solid var(--accent)' : '2px solid transparent', marginTop: dragOverTask === task.id ? -2 : 0 }}
                      >
                        <ProjectTaskRow
                          task={lTaskToTask(task)}
                          selected={selectedTask?.id === task.id}
                          onSelect={() => setSelectedTask(task)}
                          onUpdate={patch => {
                            const lp = taskPatchToLPatch(patch);
                            if (Object.keys(lp).length === 0) return;
                            updateTask(sec.id, task.id, lp);
                            setSelectedTask(t => t && t.id === task.id ? { ...t, ...lp } : t);
                          }}
                          onTaskDragStart={() => { dragTaskRef.current = { sectionId: sec.id, taskId: task.id }; }}
                          onTaskDragEnd={() => { dragTaskRef.current = null; setDragOverTask(null); }}
                          onDelete={() => { deleteTask(sec.id, task.id); setSelectedTask(t => t?.id === task.id ? null : t); }}
                        />
                      </div>
                    ))}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 16px' }}>
                      <span style={{ width: 28 }} />
                      <input value={newTaskInputs[sec.id] ?? ''}
                        onChange={e => setNewTaskInputs(p => ({ ...p, [sec.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addTask(sec.id); }}
                        placeholder="+ Ajouter une tâche…"
                        style={{ flex: 1, padding: '6px 8px', background: 'transparent', border: 'none', color: 'var(--text-3)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)' }}
                        onFocus={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.background = 'var(--surface-2)'; e.currentTarget.style.borderRadius = '7px'; }}
                        onBlur={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
                      />
                      {(newTaskInputs[sec.id] ?? '').trim() && (
                        <button onClick={() => addTask(sec.id)} style={{ padding: '4px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, cursor: 'pointer' }}>Ajouter</button>
                      )}
                    </div>
                  </div>
                ))}
                {addingSection ? (
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center', padding: '10px 16px', border: '1px dashed var(--border-2)', borderRadius: 12 }}>
                    <input autoFocus value={newSecLabel}
                      onChange={e => setNewSecLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSecLabel(''); } }}
                      placeholder="Nom de la section…"
                      style={{ flex: 1, padding: '7px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
                    />
                    <SFButton variant="primary" size="sm" icon="check" onClick={addSection}>Ajouter</SFButton>
                    <SFButton variant="ghost" size="sm" onClick={() => { setAddingSection(false); setNewSecLabel(''); }}>Annuler</SFButton>
                  </div>
                ) : (
                  <button onClick={() => setAddingSection(true)} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderRadius: 12, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                    <SFIcon name="plus" size={14} /> Ajouter une section
                  </button>
                )}
                <div style={{ height: 40 }} />
              </div>
            </div>
          )}
          {/* Board view */}
          {viewMode === 'board' && (
            <div style={{ flex: 1, overflowX: 'auto', overflowY: 'hidden', padding: '24px' }}>
              <div style={{ display: 'flex', gap: 16, height: '100%', alignItems: 'flex-start' }}>
                {sections.map(sec => (
                  <div key={sec.id} style={{ minWidth: 260, width: 260, flexShrink: 0, display: 'flex', flexDirection: 'column', gap: 8, maxHeight: '100%' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '8px 10px', background: 'var(--surface)', borderRadius: 10, border: '1px solid var(--border)' }}>
                      <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text)' }}>{sec.label}</span>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '2px 6px', borderRadius: 6 }}>{sec.tasks.length}</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, overflowY: 'auto', flex: 1 }}>
                      {sec.tasks.map(task => (
                        <div key={task.id} onClick={() => setSelectedTask(task)}
                          style={{ padding: '12px', borderRadius: 10, background: selectedTask?.id === task.id ? 'var(--surface-3)' : 'var(--surface)', border: `1px solid ${selectedTask?.id === task.id ? 'var(--border-2)' : 'var(--border)'}`, cursor: 'pointer', transition: 'border-color 0.15s' }}
                          onMouseEnter={e => { if (selectedTask?.id !== task.id) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                          onMouseLeave={e => { if (selectedTask?.id !== task.id) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}>
                          <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)', marginBottom: 8, lineHeight: 1.4 }}>{task.title || <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Sans titre</span>}</p>
                          {task.description && <p style={{ fontSize: 11, color: 'var(--text-3)', marginBottom: 8, lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as const }}>{task.description}</p>}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                            <TPVPriBadge priority={task.priority} />
                            {task.status && (() => {
                              const opt = STATUS_OPTIONS.find(o => o.value === task.status) ?? STATUS_OPTIONS[0];
                              return <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${opt.color}22`, color: opt.color, border: `1px solid ${opt.color}44` }}>{task.statusLabel ?? opt.label}</span>;
                            })()}
                            {task.assignee && (
                              <span title={task.assignee.name} style={{ width: 18, height: 18, borderRadius: '50%', background: task.assignee.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 8, color: '#fff', fontWeight: 700, flexShrink: 0 }}>{task.assignee.initials}</span>
                            )}
                            {task.dueDate && (
                              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{task.dueDate}</span>
                            )}
                            {(task.subtasks ?? []).length > 0 && (
                              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
                                <SFIcon name="git-branch" size={10} />{task.subtasks!.length}
                              </span>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                    <div style={{ padding: '4px 0' }}>
                      <input value={newTaskInputs[sec.id] ?? ''}
                        onChange={e => setNewTaskInputs(p => ({ ...p, [sec.id]: e.target.value }))}
                        onKeyDown={e => { if (e.key === 'Enter') addTask(sec.id); }}
                        placeholder="+ Ajouter une tâche…"
                        style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', boxSizing: 'border-box' }}
                        onFocus={e => { e.currentTarget.style.color = 'var(--text)'; e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onBlur={e => { e.currentTarget.style.color = 'var(--text-3)'; e.currentTarget.style.background = 'transparent'; }}
                      />
                    </div>
                  </div>
                ))}
                {/* Add section column */}
                {addingSection ? (
                  <div style={{ minWidth: 260, display: 'flex', flexDirection: 'column', gap: 8 }}>
                    <input autoFocus value={newSecLabel}
                      onChange={e => setNewSecLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSecLabel(''); } }}
                      placeholder="Nom de la section…"
                      style={{ padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
                    />
                    <div style={{ display: 'flex', gap: 6 }}>
                      <SFButton variant="primary" size="sm" icon="check" onClick={addSection}>Ajouter</SFButton>
                      <SFButton variant="ghost" size="sm" onClick={() => { setAddingSection(false); setNewSecLabel(''); }}>Annuler</SFButton>
                    </div>
                  </div>
                ) : (
                  <button onClick={() => setAddingSection(true)}
                    style={{ minWidth: 220, height: 44, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8, padding: '0 16px', borderRadius: 10, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)', flexShrink: 0 }}>
                    <SFIcon name="plus" size={14} /> Nouvelle section
                  </button>
                )}
              </div>
            </div>
          )}
          {/* Task detail panel — shared by list + board */}
          {selectedTask && (() => {
            const adaptedTask: Task = {
              id: selectedTask.id,
              title: selectedTask.title,
              priority: selectedTask.priority,
              priorityLabel: selectedTask.priority,
              description: selectedTask.description,
              subtasks: (selectedTask.subtasks ?? []).map(s => ({
                id: s.id,
                title: s.title,
                priority: s.priority,
                priorityLabel: s.priority,
                status: (s.status ?? 'neutral') as Task['status'],
                statusLabel: s.statusLabel ?? '—',
                projectId: '',
                projectName: 'Modèle',
                projectColor: 'var(--text-3)',
                assignee: (s.assignee ?? null) as unknown as Task['assignee'],
                dueDate: s.dueDate ?? '',
                dueDateRed: false,
                checked: false,
                activityCount: 0,
              })),
              status: (selectedTask.status ?? 'neutral') as Task['status'],
              statusLabel: selectedTask.statusLabel ?? '—',
              projectId: '',
              projectName: 'Modèle',
              projectColor: 'var(--text-3)',
              assignee: (selectedTask.assignee ?? null) as unknown as Task['assignee'],
              dueDate: selectedTask.dueDate ?? '',
              dueDateRed: false,
              checked: false,
              activityCount: 0,
            };
            return (
              <TaskPanel
                task={adaptedTask}
                onClose={() => setSelectedTask(null)}
                sectionLabel="Modèle"
                onUpdate={patch => {
                  const lPatch: Partial<LTask> = {};
                  if (patch.title !== undefined) lPatch.title = patch.title;
                  if (patch.priority !== undefined) lPatch.priority = patch.priority;
                  if ((patch as { description?: string }).description !== undefined) lPatch.description = (patch as { description?: string }).description;
                  if (patch.status !== undefined) { lPatch.status = patch.status; lPatch.statusLabel = patch.statusLabel; }
                  if (patch.dueDate !== undefined) lPatch.dueDate = patch.dueDate || undefined;
                  if (patch.assignee !== undefined) {
                    const a = patch.assignee as Task['assignee'] | null;
                    lPatch.assignee = a ? { id: a.id, name: a.name, initials: a.initials, avatarColor: a.avatarColor } : undefined;
                  }
                  if (patch.subtasks !== undefined) {
                    lPatch.subtasks = (patch.subtasks as Task[]).map(s => ({
                      id: s.id, title: s.title, priority: s.priority,
                      status: s.status, statusLabel: s.statusLabel,
                      dueDate: s.dueDate || undefined,
                      assignee: s.assignee ? { id: s.assignee.id, name: s.assignee.name, initials: s.assignee.initials, avatarColor: s.assignee.avatarColor } : undefined,
                    }));
                  }
                  if (Object.keys(lPatch).length > 0) {
                    setSelectedTask(t => t ? { ...t, ...lPatch } : t);
                    sections.forEach(s => s.tasks.forEach(t => {
                      if (t.id === selectedTask.id) updateTask(s.id, t.id, lPatch);
                    }));
                  }
                }}
              />
            );
          })()}
        </div>
      )}

      {/* ── Ressources ─────────────────────────────────────────────────────────── */}
      {activeTab === 'resources' && (
        <div style={{ flex: 1, overflowY: 'auto', padding: '24px 32px' }}>
          <div style={{ maxWidth: 820, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
            {/* Header row */}
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontWeight: 700, fontSize: 16, color: 'var(--text)' }}>Ressources du modèle</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 3 }}>Les ressources seront créées automatiquement à partir de ces modèles lorsqu'un projet est créé.</p>
              </div>
              <SFButton variant="primary" size="sm" icon="plus" onClick={() => setShowAddResource(true)}>Ajouter une ressource</SFButton>
            </div>
            {/* Existing resources */}
            {resources.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>
                <SFIcon name="paperclip" size={28} color="var(--border-2)" />
                <p style={{ marginTop: 12 }}>Aucune ressource — ajoutez des modèles de ressources pour les inclure automatiquement.</p>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                {resources.map(res => (
                  <div key={res.id} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', background: 'var(--surface)', borderRadius: 12, border: '1px solid var(--border)' }}>
                    <div style={{ width: 36, height: 36, borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFIcon name={RESOURCE_TYPE_ICONS_TPV[res.type] ?? 'file'} size={16} color="var(--text-2)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{res.title}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{RESOURCE_TYPE_LABELS_TPV[res.type]}</p>
                    </div>
                    <button onClick={() => { setResources(r => r.filter(x => x.id !== res.id)); setDirty(true); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 6, borderRadius: 7 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                      <SFIcon name="trash-2" size={14} />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Add resource modal ─────────────────────────────────────────────────── */}
      {showAddResource && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 10, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
          onClick={e => { if (e.target === e.currentTarget) setShowAddResource(false); }}>
          <div style={{ width: 560, maxHeight: '70vh', background: 'var(--bg)', borderRadius: 16, border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontWeight: 700, fontSize: 15 }}>Ajouter une ressource</p>
              <button onClick={() => setShowAddResource(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
                <SFIcon name="x" size={15} />
              </button>
            </div>
            {/* Type filter pills */}
            <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              <button onClick={() => setResTypeFilter(null)}
                style={{ padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-mono)', background: resTypeFilter === null ? 'var(--accent)' : 'var(--surface-2)', color: resTypeFilter === null ? 'var(--on-accent)' : 'var(--text-2)' }}>
                Tous
              </button>
              {(['checklist','document','screenplay','video_review','file','moodboard','form'] as ResourceType[]).map(t => (
                <button key={t} onClick={() => setResTypeFilter(f => f === t ? null : t)}
                  style={{ padding: '4px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-mono)', background: resTypeFilter === t ? 'var(--accent)' : 'var(--surface-2)', color: resTypeFilter === t ? 'var(--on-accent)' : 'var(--text-2)' }}>
                  {RESOURCE_TYPE_LABELS_TPV[t]}
                </button>
              ))}
            </div>
            {/* Resource list */}
            <div style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 4 }}>
              {allResTpls
                .filter(r => resTypeFilter === null || r.type === resTypeFilter)
                .map(r => (
                  <button key={r.id} onClick={() => {
                    const newRes: LResource = { id: `r-${Date.now()}`, type: r.type as ResourceType, title: r.name, templateId: r.id };
                    setResources(prev => [...prev, newRes]);
                    setDirty(true);
                    setShowAddResource(false);
                  }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: r.color, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFIcon name={r.icon} size={14} color="rgba(255,255,255,0.9)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{r.name}</p>
                      <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{RESOURCE_TYPE_LABELS_TPV[r.type as ResourceType]}</p>
                    </div>
                    <SFIcon name="plus" size={14} color="var(--text-3)" />
                  </button>
                ))}
              {/* Custom: add blank resource by type */}
              {(['checklist','document','screenplay','video_review','file','moodboard','form'] as ResourceType[])
                .filter(t => resTypeFilter === null || t === resTypeFilter)
                .map(t => (
                  <button key={`blank-${t}`} onClick={() => {
                    const newRes: LResource = { id: `r-${Date.now()}`, type: t, title: RESOURCE_TYPE_LABELS_TPV[t] };
                    setResources(prev => [...prev, newRes]);
                    setDirty(true);
                    setShowAddResource(false);
                  }}
                    style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: '1px dashed var(--border-2)', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'}>
                    <div style={{ width: 32, height: 32, borderRadius: 9, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFIcon name={RESOURCE_TYPE_ICONS_TPV[t]} size={14} color="var(--text-3)" />
                    </div>
                    <div style={{ flex: 1 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-2)' }}>Nouveau {RESOURCE_TYPE_LABELS_TPV[t]} (vide)</p>
                    </div>
                    <SFIcon name="plus" size={14} color="var(--text-3)" />
                  </button>
                ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Resource template constants ───────────────────────────────────────────────

const RES_TYPE_LABEL_KEYS: Record<ResourceTemplateType, string> = {
  checklist: 'models.resChecklist', document: 'models.resDocument', screenplay: 'models.resTypeScreenplay',
  video_review: 'models.resTypeVideoReview', file: 'models.resTypeFile', moodboard: 'models.resMoodboard',
};
const RES_TYPE_ICONS: Record<ResourceTemplateType, string> = {
  checklist: 'list-checks', document: 'file-text', screenplay: 'clapperboard',
  video_review: 'video', file: 'folder', moodboard: 'grid-2x2',
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
  const itemCount = tpl.checklistItems?.length ?? tpl.documentSections?.length ?? tpl.sceneBlocks?.length ?? tpl.reviewRounds?.length ?? tpl.folderStructure?.length ?? tpl.moodboardRefs?.length ?? 0;
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
            {tpl.builtIn
              ? <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{tpl.name}</h2>
              : <div style={{ marginBottom: 4 }}><InlineEditable value={editName} onChange={setEditName} onBlur={() => onRename?.(editName, editDesc)} fontSize={16} fontWeight={700} placeholder="Nom du modèle…" /></div>}
            {tpl.builtIn
              ? <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.4, marginBottom: 6 }}>{tpl.description}</p>
              : <div style={{ marginBottom: 6 }}><InlineEditable value={editDesc} onChange={setEditDesc} onBlur={() => onRename?.(editName, editDesc)} multiline rows={2} fontSize={12} color="var(--text-3)" placeholder="Description du modèle…" /></div>}
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${tpl.color}22`, color: tpl.color, border: `1px solid ${tpl.color}44`, whiteSpace: 'nowrap', fontWeight: 500 }}>{t(RES_TYPE_LABEL_KEYS[tpl.type])}</span>
              <div style={{ display: 'flex', gap: 3 }}>
                {tpl.tags.map(tag => (
                  <span key={tag} style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: `${TAG_COLORS[tag] ?? '#3b4f8f'}22`, color: TAG_COLORS[tag] ?? 'var(--text-3)', border: `1px solid ${TAG_COLORS[tag] ?? '#3b4f8f'}44`, whiteSpace: 'nowrap' }}>{tag}</span>
                ))}
              </div>
              {tpl.builtIn && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '2px 6px', borderRadius: 5, background: 'var(--accent)', color: 'var(--on-accent)', fontWeight: 600 }}>{t('models.builtIn')}</span>}
            </div>
          </div>
        </div>
      </div>
      {/* Content preview */}
      <div style={{ flex: 1, overflow: 'auto', padding: '14px 20px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 4 }}>
          Aperçu · {itemCount} élément{itemCount !== 1 ? 's' : ''}
        </p>
        {tpl.type === 'checklist' && (tpl.checklistItems ?? []).map((item, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid var(--border-2)', flexShrink: 0 }} />
            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.text}</span>
          </div>
        ))}
        {tpl.type === 'document' && (tpl.documentSections ?? []).map((sec, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{sec.title}</p>
            {sec.body && <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{sec.body}</p>}
          </div>
        ))}
        {tpl.type === 'screenplay' && (tpl.sceneBlocks ?? []).map((scene, i) => (
          <div key={i} style={{ padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <p style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', color: tpl.color }}>Scène {i + 1}</p>
            <p style={{ fontSize: 12, fontWeight: 600, marginBottom: 3 }}>{scene.heading}</p>
            {scene.action && <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' as any }}>{scene.action}</p>}
          </div>
        ))}
        {tpl.type === 'video_review' && (tpl.reviewRounds ?? []).map((round, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ width: 22, height: 22, borderRadius: 6, background: `${tpl.color}22`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 700, color: tpl.color }}>{i + 1}</span>
            </div>
            <span style={{ fontSize: 12, color: 'var(--text)' }}>{round.name}</span>
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
        {tpl.type === 'moodboard' && (tpl.moodboardRefs ?? []).map((ref, i) => (
          <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, background: 'var(--surface-2)' }}>
            <div style={{ width: 32, height: 24, borderRadius: 5, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SFIcon name="image" size={12} color="var(--text-3)" />
            </div>
            <span style={{ fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ref.label || ref.url || `Référence ${i + 1}`}</span>
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
          {tpl.builtIn ? 'Visualiser le contenu' : 'Ouvrir / modifier le contenu'}
        </button>
        <div style={{ display: 'flex', gap: 6 }}>
          <SFButton variant="secondary" size="sm" icon="copy" onClick={onDuplicate} style={{ flex: 1, justifyContent: 'center' }}>
            {tpl.builtIn ? 'Modifier une copie' : 'Dupliquer'}
          </SFButton>
          {!tpl.builtIn && <SFButton variant="ghost" size="sm" icon="trash-2" onClick={onDelete} style={{ color: 'var(--danger)' }} />}
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
  const [type] = useState<ResourceTemplateType>(template.type ?? 'checklist');

  // checklist
  const [items, setItems] = useState<ChecklistItem[]>(template.checklistItems ?? []);
  const [newItem, setNewItem] = useState('');
  // document
  const [docSections, setDocSections] = useState<DocumentSection[]>(template.documentSections ?? []);
  const [newSecTitle, setNewSecTitle] = useState('');
  // screenplay
  const [scenes, setScenes] = useState<SceneBlock[]>(template.sceneBlocks ?? []);
  // video_review
  const [rounds, setRounds] = useState<ReviewRound[]>(template.reviewRounds ?? []);
  // file
  const [folderJson, setFolderJson] = useState(() => JSON.stringify(template.folderStructure ?? [], null, 2));
  // moodboard
  const [refs, setRefs] = useState<MoodboardRef[]>(template.moodboardRefs ?? []);

  const handleSave = () => {
    if (!name.trim()) return;
    const base = { id: template.id ?? `res-${Date.now()}`, type, name: name.trim(), description: description.trim(), color, icon: RES_TYPE_ICONS[type], tags: tags.split(',').map(t => t.trim()).filter(Boolean), builtIn: false, createdAt: template.createdAt ?? new Date().toISOString().split('T')[0] };
    let content: Partial<ResourceTemplate> = {};
    if (type === 'checklist') content = { checklistItems: items };
    if (type === 'document') content = { documentSections: docSections };
    if (type === 'screenplay') content = { sceneBlocks: scenes };
    if (type === 'video_review') content = { reviewRounds: rounds };
    if (type === 'file') { try { content = { folderStructure: JSON.parse(folderJson) }; } catch { content = { folderStructure: [] }; } }
    if (type === 'moodboard') content = { moodboardRefs: refs };
    onSave({ ...base, ...content });
  };

  const inp = (val: string, set: (v: string) => void, placeholder?: string, multi?: boolean): React.ReactNode => multi
    ? <textarea value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={{ ...fieldStyle(), minHeight: 70, resize: 'vertical' }} />
    : <input value={val} onChange={e => set(e.target.value)} placeholder={placeholder} style={fieldStyle()} />;

  const renderContentEditor = () => {
    if (type === 'checklist') return (
      <div>
        <p style={labelStyle()}>Éléments de la checklist</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 8 }}>
          {items.map((item, i) => (
            <div key={item.id} style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
              <div style={{ width: 14, height: 14, borderRadius: 4, border: '1.5px solid var(--border-2)', flexShrink: 0 }} />
              <input value={item.text} onChange={e => setItems(p => p.map((it, j) => j === i ? { ...it, text: e.target.value } : it))} style={{ ...fieldStyle(), flex: 1 }} />
              <button onClick={() => setItems(p => p.filter((_, j) => j !== i))} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4 }} onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}><SFIcon name="x" size={13} /></button>
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <input value={newItem} onChange={e => setNewItem(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && newItem.trim()) { setItems(p => [...p, { id: `c${Date.now()}`, text: newItem.trim() }]); setNewItem(''); } }} placeholder="Nouvel élément…" style={fieldStyle({ flex: 1 })} />
          <SFButton variant="secondary" size="sm" icon="plus" onClick={() => { if (newItem.trim()) { setItems(p => [...p, { id: `c${Date.now()}`, text: newItem.trim() }]); setNewItem(''); } }}>Ajouter</SFButton>
        </div>
      </div>
    );
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
    if (type === 'file') return (
      <div>
        <p style={labelStyle()}>Structure de dossiers (JSON)</p>
        <textarea value={folderJson} onChange={e => setFolderJson(e.target.value)} style={{ ...fieldStyle(), minHeight: 160, fontFamily: 'var(--ff-mono)', fontSize: 11, resize: 'vertical' }} />
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 4 }}>Format : {'[{"id":"f1","name":"Dossier","children":[...]}]'}</p>
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
        <div style={{ maxWidth: 680, margin: '0 auto', padding: '0 40px', display: 'flex', flexDirection: 'column', gap: 22 }}>
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
  { key: 'checklist', labelKey: 'models.resChecklist', icon: 'list-checks' },
  { key: 'document', labelKey: 'models.resDocument', icon: 'file-text' },
  { key: 'screenplay', labelKey: 'models.resTypeScreenplay', icon: 'clapperboard' },
  { key: 'video_review', labelKey: 'models.resReviewShort', icon: 'video' },
  { key: 'file', labelKey: 'models.resTypeFile', icon: 'folder' },
  { key: 'moodboard', labelKey: 'models.resMoodboard', icon: 'grid-2x2' },
];

export function Modeles() {
  const [typeFilter, setTypeFilter] = useState<UnifiedTypeFilter>('projets');
  const [searchQuery, setSearchQuery] = useState('');
  const [resNavExpanded, setResNavExpanded] = useState(true);

  // ── Favorites
  const [favorites, setFavorites] = useState<Set<string>>(getFavoriteTemplateIds);
  useEffect(() => subscribeTemplateFavorites(() => setFavorites(getFavoriteTemplateIds())), []);
  const toggleFav = (id: string) => { toggleTemplateFavorite(id); setFavorites(getFavoriteTemplateIds()); };

  // ── Project templates state
  const [templates, setTemplates] = useState(loadAllTemplates);
  const [selectedTpl, setSelectedTpl] = useState<ProjectTemplate | null>(() => { const all = loadAllTemplates(); return all.find(t => !t.builtIn) ?? all[0] ?? null; });
  const [tplEditorOpen, setTplEditorOpen] = useState(false);
  const [tplEditorData, setTplEditorData] = useState<Partial<ProjectTemplate>>({});
  const [createProjectFrom, setCreateProjectFrom] = useState<ProjectTemplate | null>(null);
  const [previewTpl, setPreviewTpl] = useState<ProjectTemplate | null>(null);
  const [builtInsCollapsed, setBuiltInsCollapsed] = useState(true);
  const [dragTplId, setDragTplId] = useState<string | null>(null);
  const [dragOverTplId, setDragOverTplId] = useState<string | null>(null);

  // ── Resource templates state
  const [resourceTemplates, setResourceTemplates] = useState(loadAllResourceTemplates);
  const [selectedRes, setSelectedRes] = useState<ResourceTemplate | null>(() => { const all = loadAllResourceTemplates(); return all.find(t => !t.builtIn) ?? all[0] ?? null; });
  const [resEditorOpen, setResEditorOpen] = useState(false);
  const [resEditorData, setResEditorData] = useState<Partial<ResourceTemplate>>({});
  const [resBuiltInsCollapsed, setResBuiltInsCollapsed] = useState(true);
  const [templateResViewTpl, setTemplateResViewTpl] = useState<ResourceTemplate | null>(null);
  const [dragResId, setDragResId] = useState<string | null>(null);
  const [dragOverResId, setDragOverResId] = useState<string | null>(null);

  // ── Form templates state
  const [formTemplates, setFormTemplates] = useState(loadAllFormTemplates);
  const [selectedForm, setSelectedForm] = useState<FormTemplate | null>(() => { const all = loadAllFormTemplates(); return all.find(t => !t.builtIn) ?? all[0] ?? null; });
  const [formViewOpen, setFormViewOpen] = useState(false);
  const [formViewData, setFormViewData] = useState<Partial<FormTemplate>>({});
  const [formFillerOpen, setFormFillerOpen] = useState(false);
  const [formFillerInstance, setFormFillerInstance] = useState<FormInstance | undefined>();
  const [formDetailTab, setFormDetailTab] = useState<'apercu' | 'reponses'>('apercu');
  const [formBuiltInsCollapsed, setFormBuiltInsCollapsed] = useState(true);
  const [dragFormId, setDragFormId] = useState<string | null>(null);
  const [dragOverFormId, setDragOverFormId] = useState<string | null>(null);

  // ── Project template handlers
  const saveTpl = (tpl: ProjectTemplate) => {
    const custom = templates.filter(t => !t.builtIn);
    const existing = custom.findIndex(t => t.id === tpl.id);
    const updated = existing >= 0 ? custom.map(t => t.id === tpl.id ? tpl : t) : [...custom, tpl];
    saveCustomTemplates(updated);
    setTemplates([...BUILT_IN_TEMPLATES, ...updated]);
    setSelectedTpl(tpl);
  };

  const duplicateTpl = (tpl: ProjectTemplate) => saveTpl({ ...tpl, id: `tpl-${Date.now()}`, name: `${tpl.name} (copie)`, builtIn: false, createdAt: new Date().toISOString().split('T')[0] });

  const deleteTpl = (tpl: ProjectTemplate) => {
    const custom = templates.filter(t => !t.builtIn && t.id !== tpl.id);
    saveCustomTemplates(custom);
    setTemplates([...BUILT_IN_TEMPLATES, ...custom]);
    setSelectedTpl(BUILT_IN_TEMPLATES[0]);
  };

  const renameTpl = (id: string, name: string, description: string) => {
    const updated = templates.map(t => t.id === id ? { ...t, name, description } : t);
    const custom = updated.filter(t => !t.builtIn);
    saveCustomTemplates(custom);
    setTemplates(updated);
    setSelectedTpl(prev => prev?.id === id ? { ...prev, name, description } : prev);
  };

  const reorderTpl = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    const custom = templates.filter(t => !t.builtIn);
    const builtIn = templates.filter(t => t.builtIn);
    const srcIdx = custom.findIndex(t => t.id === srcId);
    const dstIdx = custom.findIndex(t => t.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const newCustom = [...custom];
    const [removed] = newCustom.splice(srcIdx, 1);
    newCustom.splice(dstIdx, 0, removed);
    saveCustomTemplates(newCustom);
    setTemplates([...newCustom, ...builtIn]);
  };

  // ── Form template handlers
  const saveForm = (tpl: FormTemplate) => {
    const custom = formTemplates.filter(t => !t.builtIn);
    const existing = custom.findIndex(t => t.id === tpl.id);
    const updated = existing >= 0 ? custom.map(t => t.id === tpl.id ? tpl : t) : [...custom, tpl];
    saveCustomFormTemplates(updated);
    setFormTemplates([...BUILT_IN_FORM_TEMPLATES, ...updated]);
    setSelectedForm(tpl);
    setFormViewOpen(false);
  };

  const duplicateForm = (tpl: FormTemplate) => saveForm({ ...tpl, id: `form-${Date.now()}`, name: `${tpl.name} (copie)`, builtIn: false, createdAt: new Date().toISOString().split('T')[0] });

  const deleteForm = (tpl: FormTemplate) => {
    const custom = formTemplates.filter(t => !t.builtIn && t.id !== tpl.id);
    saveCustomFormTemplates(custom);
    setFormTemplates([...BUILT_IN_FORM_TEMPLATES, ...custom]);
    setSelectedForm(BUILT_IN_FORM_TEMPLATES[0]);
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
    const custom = resourceTemplates.filter(t => !t.builtIn);
    const existing = custom.findIndex(t => t.id === tpl.id);
    const updated = existing >= 0 ? custom.map(t => t.id === tpl.id ? tpl : t) : [...custom, tpl];
    saveCustomResourceTemplates(updated);
    setResourceTemplates([...BUILT_IN_RESOURCE_TEMPLATES, ...updated]);
    setSelectedRes(tpl);
    setResEditorOpen(false);
  };

  const duplicateRes = (tpl: ResourceTemplate) => saveRes({ ...tpl, id: `res-${Date.now()}`, name: `${tpl.name} (copie)`, builtIn: false, createdAt: new Date().toISOString().split('T')[0] });

  const renameRes = (id: string, name: string, description: string) => {
    const updated = resourceTemplates.map(t => t.id === id ? { ...t, name, description } : t);
    const custom = updated.filter(t => !t.builtIn);
    saveCustomResourceTemplates(custom);
    setResourceTemplates(updated);
    setSelectedRes(prev => prev?.id === id ? { ...prev, name, description } : prev);
  };

  const reorderRes = (srcId: string, dstId: string) => {
    if (srcId === dstId) return;
    const custom = resourceTemplates.filter(t => !t.builtIn);
    const builtIn = resourceTemplates.filter(t => t.builtIn);
    const srcIdx = custom.findIndex(t => t.id === srcId);
    const dstIdx = custom.findIndex(t => t.id === dstId);
    if (srcIdx < 0 || dstIdx < 0) return;
    const newCustom = [...custom];
    const [removed] = newCustom.splice(srcIdx, 1);
    newCustom.splice(dstIdx, 0, removed);
    saveCustomResourceTemplates(newCustom);
    setResourceTemplates([...newCustom, ...builtIn]);
  };

  const deleteRes = (tpl: ResourceTemplate) => {
    const custom = resourceTemplates.filter(t => !t.builtIn && t.id !== tpl.id);
    saveCustomResourceTemplates(custom);
    setResourceTemplates([...BUILT_IN_RESOURCE_TEMPLATES, ...custom]);
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
    if (typeFilter === 'projets') { setPreviewTpl({ id: `tpl-${Date.now()}`, name: 'Nouveau modèle', description: '', color: '#6366f1', icon: 'layout-template', tags: [], sections: [], resources: [], builtIn: false, createdAt: new Date().toISOString().split('T')[0] }); }
    else if (typeFilter === 'formulaires') { setFormViewData({}); setFormViewOpen(true); }
    else { setResEditorData({ type: typeFilter }); setResEditorOpen(true); }
  };

  const topbarCount = typeFilter === 'projets'
    ? `${templates.length} modèles de projets`
    : typeFilter === 'formulaires'
    ? `${formTemplates.length} modèles de formulaires`
    : `${resourceTemplates.filter(t => t.type === typeFilter).length} modèles — ${TYPE_PILLS.find(p => p.key === typeFilter)?.label}`;

  const searchInputStyle: React.CSSProperties = {
    width: '100%', padding: '7px 10px 7px 30px', borderRadius: 9,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 12, outline: 'none',
    fontFamily: 'var(--ff-text)', colorScheme: 'dark', boxSizing: 'border-box',
  };

  const pillStyle = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 5,
    padding: '4px 9px', borderRadius: 7, border: 'none', cursor: 'pointer',
    fontFamily: 'var(--ff-mono)', fontSize: 9, letterSpacing: '0.05em', textTransform: 'uppercase',
    background: active ? 'var(--accent)' : 'var(--surface-3)',
    color: active ? 'var(--on-accent)' : 'var(--text-3)',
    transition: 'all 0.1s', whiteSpace: 'nowrap',
  });

  const sectionLabelStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 8px 4px',
  };

  const emptyCreateStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 8, width: '100%',
    padding: '9px 10px', borderRadius: 9, border: '1px dashed var(--border-2)',
    background: 'transparent', color: 'var(--text-3)', fontSize: 12,
    cursor: 'pointer', marginTop: 6, fontFamily: 'var(--ff-text)',
  };

  const collapsibleBtnStyle: React.CSSProperties = {
    display: 'flex', alignItems: 'center', gap: 6, width: '100%',
    background: 'none', border: 'none', cursor: 'pointer', padding: '10px 8px 4px', color: 'var(--text-3)',
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <div style={{ padding: '14px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0, gap: 16 }}>
        <div>
          <h1 style={{ fontSize: 18, fontWeight: 700, marginBottom: 2 }}>Modèles</h1>
          <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{topbarCount}</p>
        </div>
        <SFButton
          variant="secondary"
          icon={typeFilter === 'projets' ? 'layout-template' : typeFilter === 'formulaires' ? 'clipboard-list' : 'layers'}
          onClick={handleNew}
        >
          {typeFilter === 'formulaires' ? 'Nouveau formulaire' : 'Nouveau modèle'}
        </SFButton>
      </div>

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
                  if (key === 'projets') setSelectedTpl(templates.find(t => !t.builtIn) ?? templates[0] ?? null);
                  else if (key === 'formulaires') setSelectedForm(formTemplates.find(t => !t.builtIn) ?? formTemplates[0] ?? null);
                  else { const customs = resourceTemplates.filter(t => t.type === key && !t.builtIn); setSelectedRes(customs[0] ?? resourceTemplates.find(t => t.type === key) ?? null); }
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
              { key: 'checklist',    icon: 'list-checks',    label: 'Checklist',      count: resourceTemplates.filter(t => t.type === 'checklist').length },
              { key: 'document',     icon: 'file-text',      label: 'Document',       count: resourceTemplates.filter(t => t.type === 'document').length },
              { key: 'screenplay',   icon: 'clapperboard',   label: 'Scénario',       count: resourceTemplates.filter(t => t.type === 'screenplay').length },
              { key: 'video_review', icon: 'video',          label: 'Révision vidéo', count: resourceTemplates.filter(t => t.type === 'video_review').length },
              { key: 'file',         icon: 'folder',         label: 'Fichiers',       count: resourceTemplates.filter(t => t.type === 'file').length },
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
                {filteredTpl.filter(t => !t.builtIn).length > 0 ? (
                  <>
                    <p style={sectionLabelStyle}>Mes modèles</p>
                    {[...filteredTpl.filter(t => !t.builtIn)].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
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
                ) : null}
                <button onClick={() => setBuiltInsCollapsed(v => !v)} style={collapsibleBtnStyle}>
                  <SFIcon name={builtInsCollapsed ? 'chevron-right' : 'chevron-down'} size={11} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Intégrés ({filteredTpl.filter(t => t.builtIn).length})
                  </span>
                </button>
                {!builtInsCollapsed && [...filteredTpl.filter(t => t.builtIn)].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
                  <TemplateListItem key={tpl.id} tpl={tpl} selected={selectedTpl?.id === tpl.id} onClick={() => setSelectedTpl(tpl)}
                    favorite={favorites.has(tpl.id)} onToggleFavorite={() => toggleFav(tpl.id)} />
                ))}
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
                {filteredRes.filter(t => !t.builtIn).length > 0 ? (
                  <>
                    <p style={sectionLabelStyle}>Mes modèles</p>
                    {[...filteredRes.filter(t => !t.builtIn)].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
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
                ) : null}
                <button onClick={() => setResBuiltInsCollapsed(v => !v)} style={collapsibleBtnStyle}>
                  <SFIcon name={resBuiltInsCollapsed ? 'chevron-right' : 'chevron-down'} size={11} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Intégrés ({filteredRes.filter(t => t.builtIn).length})
                  </span>
                </button>
                {!resBuiltInsCollapsed && [...filteredRes.filter(t => t.builtIn)].sort((a,b)=>(favorites.has(b.id)?1:0)-(favorites.has(a.id)?1:0)).map(tpl => (
                  <ResourceTemplateListItem key={tpl.id} tpl={tpl} selected={selectedRes?.id === tpl.id} onClick={() => setSelectedRes(tpl)}
                    favorite={favorites.has(tpl.id)} onToggleFavorite={() => toggleFav(tpl.id)} />
                ))}
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
                  onEdit={() => setPreviewTpl(selectedTpl.builtIn ? { ...selectedTpl, id: `tpl-${Date.now()}`, name: `${selectedTpl.name} (copie)`, builtIn: false, createdAt: new Date().toISOString().split('T')[0] } : selectedTpl)}
                  onDuplicate={() => duplicateTpl(selectedTpl)}
                  onDelete={() => deleteTpl(selectedTpl)}
                  onCreateProject={() => setCreateProjectFrom(selectedTpl)}
                  onPreview={() => setPreviewTpl(selectedTpl)}
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
        const isNew = !tpl.id;
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
            if (updated.builtIn) {
              saveRes({ ...updated, builtIn: false });
            } else {
              saveRes(updated);
            }
            setTemplateResViewTpl(updated.builtIn ? null : updated);
          }}
        />
      )}
      {createProjectFrom && <CreateProjectModal template={createProjectFrom} onClose={() => setCreateProjectFrom(null)} />}
      {formFillerOpen && selectedForm && <FormFiller template={selectedForm} instance={formFillerInstance} onClose={() => { setFormFillerOpen(false); setFormFillerInstance(undefined); }} />}

      {/* Template project view (full-screen overlay) */}
      {previewTpl && (
        <TemplateProjectView
          tpl={previewTpl}
          onClose={() => setPreviewTpl(null)}
          onSave={updated => {
            saveTpl(updated);
            setPreviewTpl(updated);
          }}
        />
      )}
    </div>
  );
}

