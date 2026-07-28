import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { FileBrowser } from './FichiersGlobal';
import { SFButton, SFIcon } from '../components/ui';
import { findProject } from '../data/projectStore';
import { getFolderTreeForProject, addFolderTree } from '../data/fileStore';
import { loadCustomResourceTemplates, saveCustomResourceTemplates, loadAllResourceTemplates, type ResourceTemplate } from '../data/templates';
import { TemplateMenuButton } from '../components/TemplateMenuButton';

const TEMPLATE_COLORS = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B'];

// Mirrors Travail.tsx's "+ Modèle" flow (same button label/fields), but
// captures the project's current folder tree into a "Fichiers" resource
// template instead of its sections/tasks.
function SaveFolderTemplateModal({ projectId, projectName, originTemplate, onClose }: {
  projectId: string;
  projectName: string;
  originTemplate?: ResourceTemplate;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [name, setName] = useState(originTemplate?.name ?? projectName);
  const [description, setDescription] = useState(originTemplate?.description ?? '');
  const [color, setColor] = useState(originTemplate?.color ?? TEMPLATE_COLORS[0]);
  const [tags, setTags] = useState(originTemplate?.tags?.join(', ') ?? '');
  const [saved, setSaved] = useState(false);

  const tree = getFolderTreeForProject(projectId);

  const handleSave = () => {
    if (!name.trim()) return;
    const tpl: ResourceTemplate = {
      id: originTemplate?.id ?? `res-${Date.now()}`,
      type: 'file',
      name: name.trim(),
      description: description.trim(),
      color,
      icon: 'folder',
      tags: tags.split(',').map(x => x.trim()).filter(Boolean),
      builtIn: false,
      createdAt: originTemplate?.createdAt ?? new Date().toISOString().split('T')[0],
      folderStructure: tree,
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

  const countFolders = (nodes: typeof tree): number => nodes.reduce((s, n) => s + 1 + (n.children ? countFolders(n.children) : 0), 0);

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
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t('models.foldersCount', { count: countFolders(tree) })}</p>
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
                {TEMPLATE_COLORS.map(c => (
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

export function Fichiers() {
  const { t } = useTranslation();
  const { projectId } = useParams<{ projectId: string }>();
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  if (!projectId) return null;
  const project = findProject(projectId);
  const originTemplate = project?.draftOriginTemplateId
    ? loadAllResourceTemplates().find(t2 => t2.id === project.draftOriginTemplateId && t2.type === 'file')
    : undefined;

  const handleLoadFileTemplate = (templateId: string) => {
    const tpl = loadAllResourceTemplates().find(t2 => t2.id === templateId && t2.type === 'file');
    if (!tpl) return;
    addFolderTree(tpl.folderStructure ?? [], { projectId });
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0 }}>
        <ProjectHeaderBar projectId={projectId}>
          <TemplateMenuButton
            icon="layout-template"
            loadOptions={loadAllResourceTemplates().filter(tpl => tpl.type === 'file').map(tpl => ({ id: tpl.id, name: tpl.name, icon: tpl.icon }))}
            onLoad={handleLoadFileTemplate}
            onSave={() => setSaveTemplateOpen(true)}
            loadLabel={t('templateMenuLoad')}
            saveLabel={t('templateMenuSave')}
          />
        </ProjectHeaderBar>
      </div>
      <div style={{ flex: 1, minHeight: 0, overflow: 'hidden' }}>
        <FileBrowser
          initialNav={{ scope: 'project', scopeId: projectId, folderId: null }}
          locked
          key={projectId}
        />
      </div>
      {saveTemplateOpen && project && (
        <SaveFolderTemplateModal
          projectId={projectId}
          projectName={project.name}
          originTemplate={originTemplate}
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}
    </div>
  );
}
