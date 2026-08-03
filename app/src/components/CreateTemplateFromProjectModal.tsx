import { useState, useEffect } from 'react';
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { SFButton, SFIcon, SFCheckbox } from './ui';
import { getSections, isSectionsLoading, subscribeStore } from '../data/taskStore';
import { getFolderTreeForProject, getFilesInFolder, isFilesLoading, subscribeFileStore, type FolderTreeNodeWithId } from '../data/fileStore';
import { getResourceContent } from '../data/resourceContentStore';
import { getProjectContent, isProjectContentLoading, subscribeProjectContent } from '../data/projectContentStore';
import { isDemoSession } from '../data/authStore';
import { loadCustomTemplates, saveCustomTemplates, loadAllTemplates, type ProjectTemplate, type TemplateSection, type TemplateTask, type FolderNode, type TemplateResourceFile } from '../data/templates';
import type { Project, Task } from '../types';

export const TEMPLATE_COLORS = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B'];
// Icônes courantes pour des modèles de projets audiovisuels/créatifs — pas une
// liste exhaustive de l'icon set Lucide, juste un choix curaté raisonnable.
export const TEMPLATE_ICONS = ['layout-template', 'film', 'clapperboard', 'video', 'camera', 'image', 'mic', 'megaphone', 'palette', 'briefcase'];

interface TaskCaptureOptions {
  subtasks: boolean;
  description: boolean;
  priority: boolean;
  assignees: boolean;
  dueDate: boolean;
}

function attachResources(nodes: FolderTreeNodeWithId[], projectId: string): FolderNode[] {
  return nodes.map(node => {
    const filesInFolder = getFilesInFolder(node.id, projectId);
    const resources: TemplateResourceFile[] = filesInFolder
      .filter(f => f.type === 'resource' && f.resourceId)
      .map(f => ({
        name: f.name,
        resourceType: f.resourceType!,
        content: getResourceContent(f.resourceId!),
      }));
    return {
      id: node.id,
      name: node.name,
      children: node.children ? attachResources(node.children, projectId) : undefined,
      resources: resources.length ? resources : undefined,
    };
  });
}

function mapTask(t: Task, opts: TaskCaptureOptions): TemplateTask {
  return {
    title: t.title,
    priority: opts.priority ? t.priority : 'normal',
    description: opts.description ? t.description : undefined,
    dueDate: opts.dueDate ? t.dueDate : undefined,
    assignees: opts.assignees ? t.assignees : undefined,
    subtasks: opts.subtasks ? (t.subtasks ?? []).map(st => mapTask(st, opts)) : [],
  };
}

export function CreateTemplateFromProjectModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const { t } = useTranslation();
  const resolvedOriginTemplate = project.draftOriginTemplateId
    ? loadAllTemplates().find(tpl => tpl.id === project.draftOriginTemplateId)
    : undefined;
  // Only treat it as an "origin template" for update purposes if it's an actual
  // custom template (present in loadCustomTemplates()). A built-in origin can't be
  // updated — there is nothing to match against on save.
  const originTemplate = resolvedOriginTemplate && !resolvedOriginTemplate.builtIn ? resolvedOriginTemplate : undefined;

  const [mode, setMode] = useState<'update' | 'new'>(originTemplate ? 'update' : 'new');
  const [name, setName] = useState(originTemplate?.name ?? project.name);
  const [description, setDescription] = useState(originTemplate?.description ?? '');
  const [color, setColor] = useState(originTemplate?.color ?? TEMPLATE_COLORS[0]);
  const [icon, setIcon] = useState(originTemplate?.icon ?? TEMPLATE_ICONS[0]);
  const [tags, setTags] = useState(originTemplate?.tags?.join(', ') ?? '');
  const [includeTasks, setIncludeTasks] = useState(true);
  const [includeSections, setIncludeSections] = useState(true);
  const [includeTasksInner, setIncludeTasksInner] = useState(true);
  const [includeSubtasks, setIncludeSubtasks] = useState(true);
  const [includeDescription, setIncludeDescription] = useState(true);
  const [includePriority, setIncludePriority] = useState(true);
  const [includeAssignees, setIncludeAssignees] = useState(true);
  const [includeDueDate, setIncludeDueDate] = useState(true);

  const [includeFiles, setIncludeFiles] = useState(true);
  const [includeFolderStructure, setIncludeFolderStructure] = useState(true);
  const [includeDocuments, setIncludeDocuments] = useState(true);

  const [includeOverview, setIncludeOverview] = useState(true);
  const [includeModules, setIncludeModules] = useState(true);
  const [includeContent, setIncludeContent] = useState(true);
  const [saved, setSaved] = useState(false);

  // En session réelle, taskStore/fileStore/projectContentStore peuplent leur
  // cache via un fetch Supabase déclenché en arrière-plan au premier appel de
  // getSections()/getFolderTreeForProject()/getProjectContent() — cliquer
  // "Enregistrer" avant que ce fetch résolve capturerait silencieusement un
  // modèle incomplet. On se réabonne aux trois stores pour re-render dès que
  // le fetch résout, et on désactive Enregistrer tant que l'un des trois est
  // encore en cours de chargement pour ce projet.
  const [, forceTick] = useState(0);
  useEffect(() => {
    const unsubs = [
      subscribeStore(() => forceTick(t => t + 1)),
      subscribeFileStore(() => forceTick(t => t + 1)),
      subscribeProjectContent(() => forceTick(t => t + 1)),
    ];
    return () => unsubs.forEach(fn => fn());
  }, []);
  const dataStillLoading = !isDemoSession()
    && (isSectionsLoading(project.id) || isFilesLoading() || isProjectContentLoading(project.id));

  // Cocher un champ de tâche coche aussi ses ancêtres (Tâches internes → Sections → Tâches racine).
  const checkTaskField = (setter: (v: boolean) => void) => {
    setter(true); setIncludeTasksInner(true); setIncludeSections(true); setIncludeTasks(true);
  };
  const uncheckTasksRoot = () => {
    setIncludeTasks(false); setIncludeSections(false); setIncludeTasksInner(false);
    setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
    setIncludeAssignees(false); setIncludeDueDate(false);
  };
  const uncheckSections = () => {
    setIncludeSections(false); setIncludeTasksInner(false);
    setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
    setIncludeAssignees(false); setIncludeDueDate(false);
  };
  const uncheckTasksInner = () => {
    setIncludeTasksInner(false);
    setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
    setIncludeAssignees(false); setIncludeDueDate(false);
  };

  const checkDocuments = () => { setIncludeDocuments(true); setIncludeFolderStructure(true); setIncludeFiles(true); };
  const uncheckFiles = () => { setIncludeFiles(false); setIncludeFolderStructure(false); setIncludeDocuments(false); };
  const uncheckFolderStructure = () => { setIncludeFolderStructure(false); setIncludeDocuments(false); };

  const checkContent = () => { setIncludeContent(true); setIncludeModules(true); setIncludeOverview(true); };
  const uncheckOverview = () => { setIncludeOverview(false); setIncludeModules(false); setIncludeContent(false); };
  const uncheckModules = () => { setIncludeModules(false); setIncludeContent(false); };

  const checkAll = () => {
    setIncludeTasks(true); setIncludeSections(true); setIncludeTasksInner(true);
    setIncludeSubtasks(true); setIncludeDescription(true); setIncludePriority(true);
    setIncludeAssignees(true); setIncludeDueDate(true);
    setIncludeFiles(true); setIncludeFolderStructure(true); setIncludeDocuments(true);
    setIncludeOverview(true); setIncludeModules(true); setIncludeContent(true);
  };
  const uncheckAll = () => {
    setIncludeTasks(false); setIncludeSections(false); setIncludeTasksInner(false);
    setIncludeSubtasks(false); setIncludeDescription(false); setIncludePriority(false);
    setIncludeAssignees(false); setIncludeDueDate(false);
    setIncludeFiles(false); setIncludeFolderStructure(false); setIncludeDocuments(false);
    setIncludeOverview(false); setIncludeModules(false); setIncludeContent(false);
  };

  const handleSave = () => {
    if (!name.trim() || dataStillLoading) return;
    const captureOpts: TaskCaptureOptions = {
      subtasks: includeSubtasks,
      description: includeDescription,
      priority: includePriority,
      assignees: includeAssignees,
      dueDate: includeDueDate,
    };
    const sections: TemplateSection[] | undefined = includeSections
      ? getSections(project.id).map(s => ({ label: s.label, tasks: includeTasksInner ? s.tasks.map(t => mapTask(t, captureOpts)) : [] }))
      : undefined;
    const rawFolderTree = includeFolderStructure ? getFolderTreeForProject(project.id) : undefined;
    const folderStructure = rawFolderTree
      ? (includeDocuments ? attachResources(rawFolderTree, project.id) : rawFolderTree.map(n => ({ id: n.id, name: n.name, children: n.children })))
      : undefined;
    const overviewSections = includeModules ? getProjectContent(project.id).customSections : undefined;
    const overviewSectionData = includeContent ? getProjectContent(project.id).customSectionData : undefined;

    const targetId = mode === 'update' && originTemplate ? originTemplate.id : `tpl-${Date.now()}`;
    const tpl: ProjectTemplate = {
      id: targetId,
      name: name.trim(),
      description,
      color,
      icon,
      tags: tags.split(',').map(x => x.trim()).filter(Boolean),
      builtIn: false,
      createdAt: originTemplate?.createdAt ?? new Date().toISOString().split('T')[0],
      sections,
      folderStructure,
      overviewSections,
      overviewSectionData,
    };
    const existing = loadCustomTemplates();
    const updated = mode === 'update' && originTemplate
      ? existing.map(t2 => t2.id === targetId ? tpl : t2)
      : [...existing, tpl];
    saveCustomTemplates(updated);
    setSaved(true);
  };

  if (saved) {
    return (
      <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 420, textAlign: 'center' }}>
          <SFIcon name="check-circle-2" size={32} color="var(--ok)" />
          <p style={{ marginTop: 12, fontSize: 14, color: 'var(--text)' }}>{t('projectTemplates.saveSuccess')}</p>
          <SFButton variant="primary" onClick={onClose} style={{ marginTop: 16 }}>{t('common.close')}</SFButton>
        </div>
      </div>
    );
  }

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
      <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 16, padding: 28, width: 720, maxWidth: '90vw', maxHeight: '90vh', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <h2 style={{ fontSize: 17, fontFamily: 'var(--ff-display)', color: 'var(--text)', margin: 0 }}>{t('projectTemplates.createFromProjectTitle')}</h2>

        {originTemplate && (
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={() => setMode('update')} style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: `1px solid ${mode === 'update' ? 'var(--accent)' : 'var(--border)'}`, background: mode === 'update' ? 'rgba(249,255,0,0.08)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
              {t('projectTemplates.updateExisting', { name: originTemplate.name })}
            </button>
            <button onClick={() => setMode('new')} style={{ flex: 1, padding: '8px 12px', borderRadius: 9, border: `1px solid ${mode === 'new' ? 'var(--accent)' : 'var(--border)'}`, background: mode === 'new' ? 'rgba(249,255,0,0.08)' : 'transparent', color: 'var(--text)', cursor: 'pointer', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
              {t('projectTemplates.createNew')}
            </button>
          </div>
        )}

        <input value={name} onChange={e => setName(e.target.value)} placeholder={t('projectTemplates.namePlaceholder')} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }} />
        <textarea value={description} onChange={e => setDescription(e.target.value)} placeholder={t('projectTemplates.descriptionPlaceholder')} rows={2} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', resize: 'vertical' }} />
        <input value={tags} onChange={e => setTags(e.target.value)} placeholder={t('projectTemplates.tagsPlaceholder')} style={{ padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }} />
        <div style={{ display: 'flex', gap: 6 }}>
          {TEMPLATE_COLORS.map(c => (
            <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: 7, background: c, border: color === c ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer' }} />
          ))}
        </div>
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          {TEMPLATE_ICONS.map(ic => (
            <button key={ic} onClick={() => setIcon(ic)} style={{ width: 28, height: 28, borderRadius: 7, background: icon === ic ? color : 'var(--surface-2)', border: icon === ic ? '2px solid var(--text)' : '2px solid transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
              <SFIcon name={ic} size={14} color={icon === ic ? 'rgba(255,255,255,0.9)' : 'var(--text-3)'} />
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 24, padding: '10px 0', borderTop: '1px solid var(--border)', borderBottom: '1px solid var(--border)' }}>

          {/* Colonne gauche : Tâches */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Row label={t('projectTemplates.includeTasks')} checked={includeTasks} onToggle={v => v ? setIncludeTasks(true) : uncheckTasksRoot()} />
            <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Row label={t('projectTemplates.includeSections')} checked={includeSections} disabled={!includeTasks}
                onToggle={v => v ? (setIncludeSections(true), setIncludeTasks(true)) : uncheckSections()} />
              <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Row label={t('projectTemplates.includeTasksInner')} checked={includeTasksInner} disabled={!includeSections}
                  onToggle={v => v ? (setIncludeTasksInner(true), setIncludeSections(true), setIncludeTasks(true)) : uncheckTasksInner()} />
                <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <Row label={t('projectTemplates.includeSubtasks')} checked={includeSubtasks} disabled={!includeTasksInner}
                    onToggle={v => v ? checkTaskField(setIncludeSubtasks) : setIncludeSubtasks(false)} />
                  <Row label={t('projectTemplates.includeTaskDescription')} checked={includeDescription} disabled={!includeTasksInner}
                    onToggle={v => v ? checkTaskField(setIncludeDescription) : setIncludeDescription(false)} />
                  <Row label={t('projectTemplates.includePriority')} checked={includePriority} disabled={!includeTasksInner}
                    onToggle={v => v ? checkTaskField(setIncludePriority) : setIncludePriority(false)} />
                  <Row label={t('projectTemplates.includeAssignees')} checked={includeAssignees} disabled={!includeTasksInner}
                    onToggle={v => v ? checkTaskField(setIncludeAssignees) : setIncludeAssignees(false)} />
                  <Row label={t('projectTemplates.includeDueDate')} checked={includeDueDate} disabled={!includeTasksInner}
                    onToggle={v => v ? checkTaskField(setIncludeDueDate) : setIncludeDueDate(false)} />
                </div>
              </div>
            </div>
          </div>

          {/* Colonne droite : Fichiers au-dessus d'Aperçu */}
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
            <Row label={t('projectTemplates.includeFiles')} checked={includeFiles} onToggle={v => v ? setIncludeFiles(true) : uncheckFiles()} />
            <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Row label={t('projectTemplates.includeFolderStructure')} checked={includeFolderStructure} disabled={!includeFiles}
                onToggle={v => v ? (setIncludeFolderStructure(true), setIncludeFiles(true)) : uncheckFolderStructure()} />
              <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Row label={t('projectTemplates.includeDocuments')} checked={includeDocuments} disabled={!includeFolderStructure}
                  onToggle={v => v ? checkDocuments() : setIncludeDocuments(false)} />
              </div>
            </div>

            <Row label={t('projectTemplates.includeOverview')} checked={includeOverview} onToggle={v => v ? setIncludeOverview(true) : uncheckOverview()} style={{ marginTop: 14 }} />
            <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
              <Row label={t('projectTemplates.includeModules')} checked={includeModules} disabled={!includeOverview}
                onToggle={v => v ? (setIncludeModules(true), setIncludeOverview(true)) : uncheckModules()} />
              <div style={{ marginLeft: 22, display: 'flex', flexDirection: 'column', gap: 2 }}>
                <Row label={t('projectTemplates.includeContent')} checked={includeContent} disabled={!includeModules}
                  onToggle={v => v ? checkContent() : setIncludeContent(false)} />
              </div>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 6, marginTop: -8 }}>
          <button onClick={checkAll} style={{ background: 'none', border: 'none', color: 'var(--accent)', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>{t('projectTemplates.checkAll')}</button>
          <span style={{ color: 'var(--text-3)', fontSize: 11 }}>·</span>
          <button onClick={uncheckAll} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', padding: 0, fontSize: 11, textDecoration: 'underline' }}>{t('projectTemplates.uncheckAll')}</button>
        </div>

        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 10 }}>
          {dataStillLoading && <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{t('projectTemplates.dataStillLoading')}</span>}
          <SFButton variant="secondary" onClick={onClose}>{t('common.cancel')}</SFButton>
          <SFButton variant="primary" onClick={handleSave} disabled={dataStillLoading}>{t('common.save')}</SFButton>
        </div>
      </div>
    </div>
  );
}

function Row({ label, checked, onToggle, disabled, style }: {
  label: string; checked: boolean; onToggle: (v: boolean) => void; disabled?: boolean; style?: CSSProperties;
}) {
  return (
    <div
      onClick={disabled ? undefined : () => onToggle(!checked)}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '3px 0', cursor: disabled ? 'default' : 'pointer', opacity: disabled ? 0.5 : 1, ...style }}
    >
      <SFCheckbox checked={checked} disabled={disabled} onChange={onToggle} size={15} />
      <span style={{ fontSize: 13, color: 'var(--text)' }}>{label}</span>
    </div>
  );
}
