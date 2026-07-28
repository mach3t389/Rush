import { useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { getResources } from '../data/resourceStore';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { TemplateMenuButton } from '../components/TemplateMenuButton';
import { findProject } from '../data/projectStore';
import { loadAllResourceTemplates, saveCustomResourceTemplates, loadCustomResourceTemplates } from '../data/templates';
import type { ResourceTemplate, ResourceTemplateType } from '../data/templates';
import { getResourceContent, setResourceContent } from '../data/resourceContentStore';
import { documentSectionsToHTML, sceneBlocksToElements, elementsToSceneBlocks } from './Modeles';
import type { ScriptEl } from './ResourceDetail';
import { USERS } from '../data/mock';
import { VideoReview } from './VideoReview';
import { ImageReview } from './ImageReview';
import { DocumentReview } from './DocumentReview';
import { WebReview } from './WebReview';
import { ResourceDetail } from './ResourceDetail';

export function ResourceRouter() {
  const { t } = useTranslation();
  const { projectId, resourceId } = useParams();
  const resource = getResources().find(r => r.id === resourceId);
  const project = projectId ? findProject(projectId) : undefined;
  const [reloadTick, setReloadTick] = useState(0);

  const templateType = resource?.type as ResourceTemplateType | undefined;
  const isDraftableType = templateType === 'document' || templateType === 'screenplay' || templateType === 'moodboard' || templateType === 'video_review';

  const handleLoad = (templateId: string) => {
    if (!resourceId || !templateType) return;
    const tpl = loadAllResourceTemplates().find(t2 => t2.id === templateId && t2.type === templateType);
    if (!tpl) return;
    if (!confirm(t('templateMenuConfirmReplace', { defaultValue: 'Remplacer le contenu actuel par ce modèle ?' }))) return;
    if (templateType === 'document') {
      const html = tpl.rawHTML ?? (tpl.documentSections ? documentSectionsToHTML(tpl.documentSections) : '');
      setResourceContent(resourceId, { html });
    } else if (templateType === 'screenplay') {
      const elements = tpl.rawElements ? (JSON.parse(tpl.rawElements) as ScriptEl[]) : (tpl.sceneBlocks ? sceneBlocksToElements(tpl.sceneBlocks) : []);
      setResourceContent(resourceId, { versions: [{ id: 'v1', label: 'V1', date: new Date().toISOString().split('T')[0], elements }], activeId: 'v1' });
    } else if (templateType === 'moodboard') {
      const items = (tpl.moodboardRefs ?? []).map((r, i) => ({
        id: r.id, type: 'postit' as const,
        x: 40 + (i % 4) * 220, y: 40 + Math.floor(i / 4) * 180, w: 200, h: 160,
        text: r.note ? `${r.title}\n${r.note}` : r.title, postitColor: '#f9ff00',
      }));
      setResourceContent(resourceId, { items, arrows: [], comments: [] });
    } else if (templateType === 'video_review') {
      const versions = (tpl.reviewRounds ?? []).map(r => ({
        v: r.id, status: 'review' as const, label: r.label,
        date: new Date().toISOString().split('T')[0], author: USERS.lea,
      }));
      setResourceContent(resourceId, { versions, activeVersion: versions[0]?.v, comments: [], tasks: [], reviewStatus: 'review' as const });
    }
    setReloadTick(n => n + 1);
  };

  const handleSave = () => {
    if (!resourceId || !templateType || !resource) return;
    const origin = project?.draftOriginTemplateId
      ? loadAllResourceTemplates().find(t2 => t2.id === project.draftOriginTemplateId && t2.type === templateType)
      : undefined;
    let patch: Partial<ResourceTemplate> = {};
    if (templateType === 'document') {
      const c = getResourceContent<{ html?: string }>(resourceId);
      patch = { rawHTML: c?.html ?? '' };
    } else if (templateType === 'screenplay') {
      const c = getResourceContent<{ versions: { id: string; elements: ScriptEl[] }[]; activeId: string }>(resourceId);
      const active = c?.versions.find(v => v.id === c.activeId) ?? c?.versions[0];
      patch = { sceneBlocks: elementsToSceneBlocks(active?.elements ?? []) };
    } else if (templateType === 'moodboard') {
      const c = getResourceContent<{ items: { id: string; text?: string }[] }>(resourceId);
      patch = { moodboardRefs: (c?.items ?? []).map(it => ({ id: it.id, title: (it.text ?? '').split('\n')[0] ?? '', note: (it.text ?? '').split('\n').slice(1).join('\n') })) };
    } else if (templateType === 'video_review') {
      const c = getResourceContent<{ versions: { v: string; label: string }[] }>(resourceId);
      patch = { reviewRounds: (c?.versions ?? []).map(v => ({ id: v.v, label: v.label, description: '' })) };
    }
    const name = prompt(t('templateMenuPromptName', { defaultValue: 'Nom du modèle' }), origin?.name ?? resource.title) ?? undefined;
    if (!name) return;
    const tpl: ResourceTemplate = {
      id: origin?.id ?? `res-${Date.now()}`,
      type: templateType,
      name,
      description: origin?.description ?? '',
      color: origin?.color ?? '#6b7280',
      icon: origin?.icon ?? 'file',
      tags: origin?.tags ?? [],
      builtIn: false,
      createdAt: origin?.createdAt ?? new Date().toISOString().split('T')[0],
      ...patch,
    };
    const existing = loadCustomResourceTemplates();
    const updated = origin ? existing.map(t2 => t2.id === tpl.id ? tpl : t2) : [...existing, tpl];
    saveCustomResourceTemplates(updated);
  };

  let detail: React.ReactElement;
  if (resource?.type === 'video_review') {
    if (resource.mediaSubtype === 'photo') detail = <ImageReview />;
    else if (resource.mediaSubtype === 'file') detail = <DocumentReview />;
    else detail = <VideoReview />;
  } else if (resource?.type === 'web_review') {
    detail = <WebReview />;
  } else {
    detail = <ResourceDetail />;
  }

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId ?? ''}>
        {project?.isTemplateDraft && isDraftableType && (
          <TemplateMenuButton
            loadOptions={loadAllResourceTemplates().filter(t2 => t2.type === templateType).map(t2 => ({ id: t2.id, name: t2.name, icon: t2.icon }))}
            onLoad={handleLoad}
            onSave={handleSave}
            loadLabel={t('templateMenuLoad')}
            saveLabel={t('templateMenuSave')}
          />
        )}
      </ProjectHeaderBar>
      <div style={{ flex: 1, overflow: 'hidden' }} key={reloadTick}>
        {detail}
      </div>
    </div>
  );
}
