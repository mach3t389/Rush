import React, { useState, useEffect, useLayoutEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation, Trans } from 'react-i18next';
import { SFIcon, SFButton } from '../components/ui';
import {
  getFolders, getFiles, addFolder, deleteFolder, renameFolder,
  addFile, deleteFile, renameFile, subscribeFileStore,
  getChildFolders, getRootFoldersForProject, getRootFoldersForClient,
  getGlobalRootFolders, getFilesInFolder, getFolderPath, formatFileSize,
  fileTypeFromExt, moveFile, moveFolder,
  trashFolder, trashFile, archiveFolder, archiveFile,
  restoreFolder, restoreFile, emptyTrash,
  getTrashedFolders, getTrashedFiles, getArchivedFolders, getArchivedFiles,
  type FileFolder, type FileItem, type FileItemType,
} from '../data/fileStore';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { getClients, subscribeClients } from '../data/clientStore';
import { getPinnedIds, togglePin, subscribePinned } from '../data/pinnedStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { loadCustomResourceTemplates, saveCustomResourceTemplates, loadAllResourceTemplates, type ResourceTemplate, type FolderNode } from '../data/templates';
import { addResource, getResources, subscribeResources, updateResource } from '../data/resourceStore';
import { getAllCommentCounts, subscribeCommentCounts } from '../data/commentStore';
import { STATUS_COLOR } from '../data/status';
import { getResourceContent, setResourceContent } from '../data/resourceContentStore';
import { setFileContent, getFileContent, removeFileContent, hasFileContent } from '../data/fileContentStore';
import type { Project, ResourceType } from '../types';

// ── Resource types ─────────────────────────────────────────────────────────────

const RESOURCE_TYPES: { type: ResourceType; labelKey: string; icon: string; color: string }[] = [
  { type: 'document',     labelKey: 'files.resourceDocument',     icon: 'file',        color: '#5bc4e8' },
  { type: 'moodboard',    labelKey: 'files.resourceMoodboard',    icon: 'image',       color: '#5b8af5' },
  { type: 'video_review', labelKey: 'files.resourceReview',       icon: 'film',        color: '#a05be8' },
  { type: 'screenplay',   labelKey: 'files.resourceScreenplay',   icon: 'file-text',   color: '#e85b5b' },
  { type: 'checklist',    labelKey: 'files.resourceChecklist',    icon: 'list-checks', color: '#34c98a' },
  { type: 'form',         labelKey: 'files.resourceForm',         icon: 'clipboard',   color: '#f5d05b' },
  { type: 'inspirations', labelKey: 'files.resourceInspirations', icon: 'sparkles',    color: '#c45be8' },
];

interface RevisionSelection {
  resourceType: ResourceType;
  mediaSubtype?: 'video' | 'photo' | 'file' | 'audio';
  subtypeLabel: string;
  eyebrow: string;
}

const REVISION_SUBTYPES: { resourceType: ResourceType; mediaSubtype?: 'video' | 'photo' | 'file' | 'audio'; labelKey: string; subtypeEyebrowKey: string; icon: string; color: string; descKey: string }[] = [
  { resourceType: 'video_review', mediaSubtype: 'video', labelKey: 'files.subtypeVideo',    subtypeEyebrowKey: 'files.eyebrowVideo',    icon: 'video',     color: '#a05be8', descKey: 'files.subtypeVideoDesc' },
  { resourceType: 'video_review', mediaSubtype: 'photo', labelKey: 'files.subtypePhoto',    subtypeEyebrowKey: 'files.eyebrowPhoto',    icon: 'image',     color: '#5b8af5', descKey: 'files.subtypePhotoDesc' },
  { resourceType: 'video_review', mediaSubtype: 'audio', labelKey: 'files.subtypeAudio',    subtypeEyebrowKey: 'files.eyebrowAudio',    icon: 'music',     color: '#4ec994', descKey: 'files.subtypeAudioDesc' },
  { resourceType: 'video_review', mediaSubtype: 'file',  labelKey: 'files.subtypeDocument', subtypeEyebrowKey: 'files.eyebrowDocument', icon: 'file-text', color: '#5bc4e8', descKey: 'files.subtypeDocumentDesc' },
  { resourceType: 'web_review',                          labelKey: 'files.subtypeWebsite',  subtypeEyebrowKey: 'files.eyebrowWebsite',  icon: 'globe',     color: '#f5975b', descKey: 'files.subtypeWebsiteDesc' },
];

const RESOURCE_EYEBROW: Partial<Record<ResourceType, string>> = {
  screenplay: 'files.eyebrowScreenplay', moodboard: 'files.eyebrowMoodboard', video_review: 'files.eyebrowReview',
  document: 'files.eyebrowDocument', checklist: 'files.eyebrowChecklist', web_review: 'files.eyebrowWebReview',
  form: 'files.eyebrowForm', inspirations: 'files.eyebrowInspirations',
};

// ── Revision subtype picker ────────────────────────────────────────────────────

function RevisionPickerModal({ onSelect, onClose }: {
  onSelect: (sel: RevisionSelection) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#a05be822', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="film" size={18} color="#a05be8" />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{t('files.newRevision')}</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{t('files.newRevisionQuestion')}</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          {REVISION_SUBTYPES.map(s => (
            <button key={s.labelKey} onClick={() => {
              onSelect({ resourceType: s.resourceType, mediaSubtype: s.mediaSubtype, subtypeLabel: t(s.labelKey), eyebrow: t('files.revisionEyebrow', { subtype: t(s.subtypeEyebrowKey) }) });
              onClose();
            }}
              style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px', borderRadius: 10, border: '1.5px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.12s, background 0.12s' }}
              onMouseEnter={e => { e.currentTarget.style.borderColor = s.color; e.currentTarget.style.background = s.color + '11'; }}
              onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 9, background: s.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <SFIcon name={s.icon} size={19} color={s.color} />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{t(s.labelKey)}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{t(s.descKey)}</p>
              </div>
              <SFIcon name="chevron-right" size={14} color="var(--text-3)" style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <SFButton variant="ghost" onClick={onClose}>{t('files.cancel')}</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── New resource modal ────────────────────────────────────────────────────────

function NewResourceModal({ def, isWebReview, onSave, onClose }: { def: typeof RESOURCE_TYPES[number]; isWebReview?: boolean; onSave: (name: string, webUrl?: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [step, setStep] = React.useState<'url' | 'name'>(isWebReview ? 'url' : 'name');
  const [webUrl, setWebUrl] = React.useState('');
  const [name, setName] = React.useState('');
  const ref = React.useRef<HTMLInputElement>(null);
  React.useEffect(() => { ref.current?.focus(); }, [step]);
  const handle = () => { if (!name.trim()) return; onSave(name.trim(), isWebReview ? webUrl.trim() : undefined); onClose(); };
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20 }}>
          <div style={{ width: 40, height: 40, borderRadius: 10, background: def.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <SFIcon name={def.icon} size={20} color={def.color} />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{isWebReview ? t('files.webReviewTitle') : t('files.newResourceTitle', { label: t(def.labelKey) })}</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{step === 'url' ? t('files.enterUrlToReview') : t('files.nameThisResource')}</p>
          </div>
        </div>
        {step === 'url' && (
          <>
            <div style={{ position: 'relative' }}>
              <span style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}>
                <SFIcon name="globe" size={14} color="var(--text-3)" />
              </span>
              <input ref={ref} value={webUrl} onChange={e => setWebUrl(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && webUrl.trim()) setStep('name'); if (e.key === 'Escape') onClose(); }}
                placeholder={t('files.urlPlaceholder')}
                style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 9, border: '1.5px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--ff-mono)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <SFButton variant="ghost" onClick={onClose}>{t('files.cancel')}</SFButton>
              <SFButton variant="primary" onClick={() => { if (webUrl.trim()) setStep('name'); }} disabled={!webUrl.trim()}>{t('files.continueAction')}</SFButton>
            </div>
          </>
        )}
        {step === 'name' && (
          <>
            <input ref={ref} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') onClose(); }}
              placeholder={t('files.resourceNamePlaceholder')}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1.5px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--ff-text)', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <SFButton variant="ghost" onClick={isWebReview ? () => setStep('url') : onClose}>{isWebReview ? t('files.back') : t('files.cancel')}</SFButton>
              <SFButton variant="primary" onClick={handle} disabled={!name.trim()}>{t('files.create')}</SFButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list' | 'columns' | 'stockage';
type SortBy   = 'name' | 'date' | 'size' | 'type';

export interface NavLocation {
  scope: 'root' | 'global' | 'project' | 'client' | 'clients';
  scopeId?: string;   // projectId or clientId
  folderId: string | null;
}

// ── File type icons + colors ───────────────────────────────────────────────────

const TYPE_META: Record<FileItemType | 'folder', { icon: string; color: string; labelKey: string }> = {
  folder:      { icon: 'folder',       color: '#f5c842', labelKey: 'files.typeFolder'      },
  pdf:         { icon: 'file-text',    color: '#e85b5b', labelKey: 'files.typePdf'         },
  image:       { icon: 'image',        color: '#5b8af5', labelKey: 'files.typeImage'       },
  video:       { icon: 'video',        color: '#a05be8', labelKey: 'files.typeVideo'       },
  audio:       { icon: 'music',        color: '#34c98a', labelKey: 'files.typeAudio'       },
  zip:         { icon: 'archive',      color: '#f5975b', labelKey: 'files.typeArchive'     },
  doc:         { icon: 'file-text',    color: '#5bc4e8', labelKey: 'files.typeDocument'    },
  spreadsheet: { icon: 'table',        color: '#34c98a', labelKey: 'files.typeSpreadsheet' },
  resource:    { icon: 'layers',       color: '#c45be8', labelKey: 'files.typeResource'    },
  other:       { icon: 'file',         color: '#888',    labelKey: 'files.typeFile'        },
};

// Derived from RESOURCE_TYPES so colors are always in sync; extras for types not in the creation menu
const RESOURCE_TYPE_META: Record<string, { icon: string; color: string; labelKey: string }> = {
  ...Object.fromEntries(RESOURCE_TYPES.map(rt => [rt.type, { icon: rt.icon, color: rt.color, labelKey: rt.labelKey }])),
  screenplay:   { icon: 'clapperboard',  color: '#e85b5b', labelKey: 'files.metaScreenplay' },
  web_review:   { icon: 'globe',         color: '#3b82f6', labelKey: 'files.metaWebsite'    },
  file:         { icon: 'hard-drive',    color: '#6b7280', labelKey: 'files.metaFile'       },
};

// Icône de base d'une révision selon le type de fichier révisé (au lieu d'un « film » générique)
const REVIEW_SUBTYPE_ICON: Record<string, string> = {
  video: 'video',      // caméra
  photo: 'image',      // photo
  audio: 'music',      // note de musique
  file:  'file-text',  // document
};

// Résout le sous-type de média d'un fichier-ressource (stocké sur le fichier, sinon sur la ressource)
function fileMediaSubtype(file: FileItem): 'video' | 'photo' | 'file' | 'audio' | undefined {
  return file.mediaSubtype ?? getResources().find(r => r.id === file.resourceId)?.mediaSubtype;
}

function FileTypeIcon({ type, resourceType, mediaSubtype, size = 28 }: { type: FileItemType | 'folder'; resourceType?: ResourceType; mediaSubtype?: 'video' | 'photo' | 'file' | 'audio'; size?: number }) {
  const { t } = useTranslation();
  const rm = resourceType ? RESOURCE_TYPE_META[resourceType] : undefined;
  const meta = rm ?? TYPE_META[type] ?? TYPE_META.other;
  // Les ressources de révision (vidéo/photo/audio/document, site web) portent un badge « révision »
  const isReview = resourceType === 'video_review' || resourceType === 'web_review';
  // Pour une révision de média, l'icône reflète le fichier révisé, pas un « film » générique
  const iconName = resourceType === 'video_review'
    ? (REVIEW_SUBTYPE_ICON[mediaSubtype ?? ''] ?? 'film')
    : meta.icon;
  const badge = Math.max(13, Math.round(size * 0.6));
  return (
    <div style={{
      position: 'relative',
      width: size + 8, height: size + 8,
      borderRadius: 8,
      background: meta.color + '22',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <SFIcon name={iconName} size={size * 0.75} color={meta.color} />
      {isReview && (
        <div
          title={t('files.reviewBadge')}
          style={{
            position: 'absolute', right: -3, bottom: -3,
            width: badge, height: badge, borderRadius: '50%',
            background: 'var(--accent)', border: '2px solid var(--surface-2)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
          }}
        >
          <SFIcon name="pencil" size={Math.round(badge * 0.6)} color="var(--on-accent)" />
        </div>
      )}
    </div>
  );
}

// ── Resource status options ────────────────────────────────────────────────────

const RESOURCE_STATUS_OPTIONS: { status: import('../types').Status; labelKey: string }[] = [
  { status: 'info',    labelKey: 'files.statusInProgress' },
  { status: 'review',  labelKey: 'files.statusInReview' },
  { status: 'warn',    labelKey: 'files.statusTodo' },
  { status: 'ok',      labelKey: 'files.statusDone' },
  { status: 'danger',  labelKey: 'files.statusBlocked' },
  { status: 'neutral', labelKey: 'files.statusWaiting' },
];

function StatusDropdown({ resourceId, status, statusLabel, onClose }: { resourceId: string; status: string; statusLabel: string; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{ position: 'absolute', zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', padding: '4px 0', minWidth: 160 }}>
      {RESOURCE_STATUS_OPTIONS.map(opt => (
        <button key={opt.status} onClick={() => { updateResource(resourceId, { status: opt.status, statusLabel: t(opt.labelKey) }); onClose(); }}
          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', background: opt.status === status ? 'var(--surface-2)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
          onMouseEnter={e => { if (opt.status !== status) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { if (opt.status !== status) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
          <span style={{ width: 8, height: 8, borderRadius: '50%', background: STATUS_COLOR[opt.status], flexShrink: 0 }} />
          <span style={{ fontSize: 11, color: opt.status === status ? 'var(--text)' : 'var(--text-2)', fontWeight: opt.status === status ? 600 : 400 }}>{t(opt.labelKey)}</span>
          {opt.status === status && <span style={{ marginLeft: 'auto' }}><SFIcon name="check" size={11} color="var(--accent)" /></span>}
        </button>
      ))}
    </div>
  );
}

function InlineStatusPicker({ resourceId, status, statusLabel }: { resourceId: string; status: string; statusLabel: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div style={{ position: 'relative' }}>
      <button onClick={e => { e.stopPropagation(); setOpen(v => !v); }}
        style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: '1px solid var(--border-2)', borderRadius: 7, padding: '3px 8px', cursor: 'pointer', transition: 'background 0.1s' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[status] ?? 'var(--text-3)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: 'var(--text-2)', fontWeight: 500 }}>{statusLabel}</span>
        <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
      </button>
      {open && <StatusDropdown resourceId={resourceId} status={status} statusLabel={statusLabel} onClose={() => setOpen(false)} />}
    </div>
  );
}

// ── Context menu ───────────────────────────────────────────────────────────────

interface CtxMenuItem { label: string; icon: string; action: () => void; danger?: boolean; separator?: boolean; header?: boolean; color?: string }

function ContextMenu({ items, pos, onClose }: { items: CtxMenuItem[]; pos: { x: number; y: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  // Position recalée pour que le menu reste entièrement visible dans la fenêtre
  const [coords, setCoords] = useState<{ left: number; top: number; maxHeight?: number }>({ left: pos.x, top: pos.y });

  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  // Après rendu, mesurer le menu et le rabattre vers le haut/la gauche s'il déborde
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const { width, height } = el.getBoundingClientRect();
    const vw = window.innerWidth, vh = window.innerHeight;

    let left = pos.x;
    if (left + width + margin > vw) left = Math.max(margin, pos.x - width); // bascule à gauche du curseur
    left = Math.min(left, vw - width - margin);
    left = Math.max(margin, left);

    const spaceBelow = vh - pos.y;
    const spaceAbove = pos.y;
    let top = pos.y;
    let maxHeight: number | undefined;
    if (height + margin > spaceBelow) {
      // Pas assez de place en dessous : ouvrir vers le haut si plus d'espace, sinon clamp + scroll
      if (spaceAbove > spaceBelow) {
        top = Math.max(margin, pos.y - height);
        maxHeight = pos.y - margin;
      } else {
        top = Math.min(pos.y, vh - height - margin);
        maxHeight = vh - top - margin;
      }
    }
    top = Math.max(margin, top);
    setCoords({ left, top, maxHeight });
  }, [pos.x, pos.y, items.length]);

  return (
    <div ref={ref} style={{
      position: 'fixed', left: coords.left, top: coords.top,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      zIndex: 500, minWidth: 180, padding: '4px 0',
      maxHeight: coords.maxHeight, overflowX: 'hidden',
      overflowY: coords.maxHeight ? 'auto' : 'hidden',
    }}>
      {items.map((item, i) => item.separator
        ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        : item.header
        ? <p key={i} style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 14px 3px', fontWeight: 700 }}>{item.label}</p>
        : (
          <button key={i}
            onClick={() => { item.action(); onClose(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 10,
              width: '100%', padding: '8px 14px', border: 'none',
              background: 'none', cursor: 'pointer', textAlign: 'left',
              fontSize: 13, fontFamily: 'var(--ff-text)',
              color: item.danger ? 'var(--danger)' : 'var(--text)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <SFIcon name={item.icon} size={13} color={item.danger ? 'var(--danger)' : item.color ?? 'var(--text-2)'} />
            {item.label}
          </button>
        )
      )}
    </div>
  );
}

// ── Rename inline ──────────────────────────────────────────────────────────────

function RenameInput({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <input
      ref={ref}
      value={val}
      onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onSave(val.trim() || value); if (e.key === 'Escape') onCancel(); }}
      onBlur={() => onSave(val.trim() || value)}
      onClick={e => e.stopPropagation()}
      style={{
        width: '100%', fontSize: 11, fontWeight: 500,
        background: 'var(--surface)', border: '1px solid var(--accent)',
        borderRadius: 4, padding: '2px 6px', color: 'var(--text)',
        fontFamily: 'var(--ff-text)', outline: 'none',
      }}
    />
  );
}

// ── New folder modal ───────────────────────────────────────────────────────────

function NewFolderModal({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState(t('files.newFolderDefault'));
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{t('files.newFolder')}</h3>
        <input
          ref={ref}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(name.trim() || t('files.newFolderDefault')); onClose(); } if (e.key === 'Escape') onClose(); }}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 9,
            border: '1.5px solid var(--accent)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 14, outline: 'none',
            fontFamily: 'var(--ff-text)', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <SFButton variant="ghost" onClick={onClose}>{t('files.cancel')}</SFButton>
          <SFButton variant="primary" onClick={() => { onSave(name.trim() || t('files.newFolderDefault')); onClose(); }}>{t('files.create')}</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── File preview modal ────────────────────────────────────────────────────────

const PREVIEW_ICONS: Partial<Record<FileItemType, string>> = {
  pdf: 'file-text', video: 'film', audio: 'music', image: 'image',
  doc: 'file', spreadsheet: 'table', zip: 'archive', other: 'file',
};

const BTN_STYLE: React.CSSProperties = {
  display: 'flex', alignItems: 'center', justifyContent: 'center',
  gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid rgba(255,255,255,0.1)',
  background: 'rgba(255,255,255,0.06)', color: 'var(--text-2)', cursor: 'pointer',
  fontSize: 12, fontFamily: 'var(--ff-text)', transition: 'background 0.12s',
};

function PreviewBtn({ icon, label, onClick, disabled }: { icon: string; label?: string; onClick: () => void; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled}
      style={{ ...BTN_STYLE, opacity: disabled ? 0.3 : 1, cursor: disabled ? 'default' : 'pointer' }}
      onMouseEnter={e => { if (!disabled) e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
      onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
    >
      <SFIcon name={icon} size={13} />
      {label && <span>{label}</span>}
    </button>
  );
}

function FilePreviewModal({ file, files, onNavigate, onClose }: {
  file: FileItem;
  files: FileItem[];
  onNavigate: (f: FileItem) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const url = getFileContent(file.id);
  const icon = PREVIEW_ICONS[file.type] ?? 'file';

  // Navigation globale (toutes vues : ←/→)
  const idx = files.findIndex(f => f.id === file.id);
  const hasPrev = idx > 0;
  const hasNext = idx < files.length - 1;

  // Navigation audio — uniquement parmi les fichiers audio du dossier
  const audioFiles = files.filter(f => f.type === 'audio');
  const audioIdx = audioFiles.findIndex(f => f.id === file.id);

  // Image zoom & pan
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const [panning, setPanning] = useState(false);
  const dragRef = useRef<{ mx: number; my: number; px: number; py: number } | null>(null);
  const imgWrapRef = useRef<HTMLDivElement>(null);

  // Reset zoom/pan à chaque changement de fichier
  useEffect(() => { setZoom(1); setPan({ x: 0, y: 0 }); }, [file.id]);

  // Raccourcis clavier
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { onClose(); return; }
      if (e.key === 'ArrowLeft'  && hasPrev) onNavigate(files[idx - 1]);
      if (e.key === 'ArrowRight' && hasNext)  onNavigate(files[idx + 1]);
      if (file.type === 'image') {
        if (e.key === '+' || e.key === '=') setZoom(z => Math.min(6, z * 1.2));
        if (e.key === '-') setZoom(z => Math.max(0.2, z / 1.2));
        if (e.key === '0') { setZoom(1); setPan({ x: 0, y: 0 }); }
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [file, files, idx, hasPrev, hasNext, onNavigate, onClose]);

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const factor = e.deltaY < 0 ? 1.12 : 0.88;
    setZoom(z => Math.max(0.2, Math.min(6, z * factor)));
  };
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    dragRef.current = { mx: e.clientX, my: e.clientY, px: pan.x, py: pan.y };
    setPanning(true);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!panning || !dragRef.current) return;
    setPan({ x: dragRef.current.px + e.clientX - dragRef.current.mx, y: dragRef.current.py + e.clientY - dragRef.current.my });
  };
  const handleMouseUp = () => { setPanning(false); dragRef.current = null; };

  const handleFullscreen = () => { imgWrapRef.current?.requestFullscreen?.(); };

  const HEADER: React.CSSProperties = { display: 'flex', alignItems: 'center', gap: 10, padding: '10px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)', flexShrink: 0, fontFamily: 'var(--ff-text)' };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.92)', zIndex: 900, display: 'flex', flexDirection: 'column', fontFamily: 'var(--ff-text)' }}>

      {/* Header */}
      <div style={HEADER}>
        {/* Nav ← → */}
        <PreviewBtn icon="chevron-left" onClick={() => hasPrev && onNavigate(files[idx - 1])} disabled={!hasPrev} />
        <PreviewBtn icon="chevron-right" onClick={() => hasNext && onNavigate(files[idx + 1])} disabled={!hasNext} />

        <SFIcon name={icon} size={15} color="var(--text-3)" />
        <span style={{ flex: 1, fontSize: 13, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
        <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', flexShrink: 0 }}>{formatFileSize(file.size)}</span>
        {idx >= 0 && files.length > 1 && (
          <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', flexShrink: 0 }}>{idx + 1} / {files.length}</span>
        )}

        {/* Image controls */}
        {file.type === 'image' && url && (<>
          <PreviewBtn icon="zoom-out" onClick={() => setZoom(z => Math.max(0.2, z / 1.2))} />
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', minWidth: 38, textAlign: 'center' }}>{Math.round(zoom * 100)}%</span>
          <PreviewBtn icon="zoom-in" onClick={() => setZoom(z => Math.min(6, z * 1.2))} />
          <PreviewBtn icon="minimize-2" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }} />
          <PreviewBtn icon="maximize-2" onClick={handleFullscreen} />
        </>)}

        {url && (
          <a href={url} download={file.name} style={{ ...BTN_STYLE, textDecoration: 'none' }}>
            <SFIcon name="download" size={13} /><span>{t('files.download')}</span>
          </a>
        )}
        <button onClick={onClose} style={{ ...BTN_STYLE, border: 'none' }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.12)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}>
          <SFIcon name="x" size={16} />
        </button>
      </div>

      {/* Body */}
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: file.type === 'pdf' ? 0 : 24, position: 'relative' }}>
        {!url ? (
          <div style={{ textAlign: 'center' }}>
            <SFIcon name={icon} size={52} color="var(--text-3)" />
            <p style={{ marginTop: 12, fontSize: 13, color: 'var(--text-2)', fontWeight: 500 }}>{t('files.noContentAvailable')}</p>
            <p style={{ fontSize: 11, marginTop: 6, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('files.dragFileToLoad')}</p>
          </div>

        ) : file.type === 'pdf' ? (
          <iframe src={url} style={{ width: '100%', height: '100%', border: 'none' }} title={file.name} />

        ) : file.type === 'image' ? (
          <div ref={imgWrapRef}
            onWheel={handleWheel} onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseUp}
            style={{ width: '100%', height: '100%', overflow: 'hidden', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: panning ? 'grabbing' : zoom > 1 ? 'grab' : 'zoom-in' }}
          >
            <img src={url} alt={file.name} draggable={false}
              style={{ maxWidth: zoom === 1 ? '100%' : 'none', maxHeight: zoom === 1 ? '100%' : 'none', transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`, transformOrigin: 'center', transition: panning ? 'none' : 'transform 0.1s', userSelect: 'none', pointerEvents: 'none', borderRadius: zoom === 1 ? 8 : 0 }}
            />
          </div>

        ) : file.type === 'video' ? (
          <video controls src={url} autoPlay
            style={{ maxWidth: '100%', maxHeight: '100%', borderRadius: 8, background: '#000', outline: 'none' }} />

        ) : file.type === 'audio' ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24, minWidth: 320 }}>
            {/* Art */}
            <div style={{ width: 120, height: 120, borderRadius: '50%', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)', boxShadow: '0 0 40px rgba(249,255,0,0.08)' }}>
              <SFIcon name="music" size={44} color="var(--accent)" />
            </div>
            <div style={{ textAlign: 'center' }}>
              <p style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>{file.name.replace(/\.[^.]+$/, '')}</p>
              <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{file.ext.toUpperCase()} · {formatFileSize(file.size)}</p>
            </div>
            <audio controls src={url} autoPlay style={{ width: 320 }} />
            {/* Prev / Next among audio files */}
            {audioFiles.length > 1 && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <PreviewBtn icon="skip-back" onClick={() => audioIdx > 0 && onNavigate(audioFiles[audioIdx - 1])} disabled={audioIdx <= 0} />
                <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', minWidth: 50, textAlign: 'center' }}>{audioIdx + 1} / {audioFiles.length}</span>
                <PreviewBtn icon="skip-forward" onClick={() => audioIdx < audioFiles.length - 1 && onNavigate(audioFiles[audioIdx + 1])} disabled={audioIdx >= audioFiles.length - 1} />
              </div>
            )}
          </div>

        ) : (
          <div style={{ textAlign: 'center' }}>
            <SFIcon name={icon} size={52} color="var(--text-3)" />
            <p style={{ marginTop: 14, fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>{file.name}</p>
            <p style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', marginTop: 4 }}>{formatFileSize(file.size)}</p>
            <a href={url} download={file.name}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 7, marginTop: 20, padding: '10px 20px', borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', textDecoration: 'none', fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="download" size={14} /> {t('files.download')}
            </a>
          </div>
        )}
      </div>
    </div>
  );
}

// ── Add file modal (simulated — no actual upload backend) ──────────────────────

const FILE_TYPE_OPTIONS: { type: FileItemType; labelKey: string; ext: string }[] = [
  { type: 'pdf',    labelKey: 'files.fileTypePdf',   ext: 'pdf'  },
  { type: 'image',  labelKey: 'files.fileTypeImage', ext: 'jpg'  },
  { type: 'video',  labelKey: 'files.fileTypeVideo', ext: 'mp4'  },
  { type: 'audio',  labelKey: 'files.fileTypeAudio', ext: 'mp3'  },
  { type: 'doc',    labelKey: 'files.fileTypeDoc',   ext: 'docx' },
  { type: 'zip',    labelKey: 'files.fileTypeZip',   ext: 'zip'  },
  { type: 'other',  labelKey: 'files.fileTypeOther', ext: 'bin'  },
];

function AddFileModal({ onSave, onClose }: { onSave: (name: string, type: FileItemType, ext: string) => void; onClose: () => void }) {
  const { t } = useTranslation();
  const [name, setName] = useState('');
  const [selectedType, setSelectedType] = useState<typeof FILE_TYPE_OPTIONS[0]>(FILE_TYPE_OPTIONS[0]);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, []);

  const handleSave = () => {
    if (!name.trim()) return;
    const n = name.trim();
    const hasExt = n.includes('.');
    onSave(hasExt ? n : `${n}.${selectedType.ext}`, selectedType.type, hasExt ? n.split('.').pop()! : selectedType.ext);
    onClose();
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>{t('files.addFile')}</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('files.fileName')}</label>
            <input
              ref={ref}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              placeholder={t('files.fileNamePlaceholder', { ext: selectedType.ext })}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('files.fileType')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 6 }}>
              {FILE_TYPE_OPTIONS.map(opt => {
                const meta = TYPE_META[opt.type];
                const sel = selectedType.type === opt.type;
                return (
                  <button key={opt.type} onClick={() => setSelectedType(opt)} style={{
                    display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5,
                    padding: '8px 6px', borderRadius: 8, cursor: 'pointer',
                    border: `1.5px solid ${sel ? 'var(--accent)' : 'var(--border)'}`,
                    background: sel ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                  }}>
                    <SFIcon name={meta.icon} size={16} color={meta.color} />
                    <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>{t(opt.labelKey)}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <SFButton variant="ghost" onClick={onClose}>{t('files.cancel')}</SFButton>
          <SFButton variant="primary" onClick={handleSave} disabled={!name.trim()}>{t('files.add')}</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Tree node ──────────────────────────────────────────────────────────────────

function TreeNode({
  folder, depth, selected, onSelect, collapsed, projectColor,
}: {
  folder: FileFolder;
  depth: number;
  selected: boolean;
  onSelect: (f: FileFolder) => void;
  collapsed: boolean;
  projectColor?: string;
}) {
  const allFolders = getFolders();
  const children = allFolders.filter(f => f.parentId === folder.id);
  const [expanded, setExpanded] = useState(false);

  return (
    <div>
      <div
        onClick={() => { setExpanded(e => !e); onSelect(folder); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 6,
          padding: `5px 8px 5px ${12 + depth * 14}px`,
          borderRadius: 7, cursor: 'pointer',
          background: selected ? 'var(--surface-3)' : 'transparent',
          borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
        }}
        onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
      >
        {children.length > 0 && (
          <SFIcon name={expanded ? 'chevron-down' : 'chevron-right'} size={10} color="var(--text-3)" />
        )}
        {children.length === 0 && <div style={{ width: 10 }} />}
        <SFIcon name="folder" size={13} color={projectColor ?? 'var(--text-3)'} />
        {!collapsed && <span style={{ fontSize: 12, color: selected ? 'var(--text)' : 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{folder.name}</span>}
      </div>
      {expanded && children.map(child => (
        <TreeNode key={child.id} folder={child} depth={depth + 1} selected={selected && false} onSelect={onSelect} collapsed={collapsed} projectColor={projectColor} />
      ))}
    </div>
  );
}

// ── Left sidebar tree ──────────────────────────────────────────────────────────

function FileTree({
  location, onNavigate, collapsed, lockedScope,
}: {
  location: NavLocation;
  onNavigate: (loc: NavLocation) => void;
  collapsed: boolean;
  lockedScope?: NavLocation;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(getProjects);
  const [folders, setFolders] = useState(getFolders);
  const [pinnedIds, setPinnedIds] = useState(getPinnedIds);
  const [expandedProjects, setExpandedProjects] = useState<Set<string>>(new Set());

  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);
  useEffect(() => subscribeFileStore(() => setFolders(getFolders())), []);
  useEffect(() => subscribePinned(() => setPinnedIds(getPinnedIds())), []);

  const globalRoots = folders.filter(f => !f.projectId && !f.clientId && f.parentId === null && !f.state);

  const toggleProject = (id: string) => setExpandedProjects(s => { const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n; });
  const [hoveredProjectId, setHoveredProjectId] = React.useState<string | null>(null);

  const SectionLabel = ({ children }: { children: React.ReactNode }) => collapsed ? null : (
    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em', padding: '12px 10px 4px', fontWeight: 700 }}>{children}</p>
  );

  const isRootActive = location.scope === 'root';
  const ITEM_STYLE = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8,
    padding: collapsed ? '6px 0' : '6px 10px',
    justifyContent: collapsed ? 'center' : 'flex-start',
    borderRadius: 7, cursor: 'pointer',
    background: active ? 'var(--surface-3)' : 'transparent',
    borderLeft: !collapsed && active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text)' : 'var(--text-2)',
    fontSize: 12, fontWeight: active ? 600 : 400,
  });

  // Render an expandable project row + its root folders (shared between locked and unlocked).
  const renderProjectRow = (p: ReturnType<typeof getProjects>[number]) => {
    const exp = expandedProjects.has(p.id);
    const projActive = location.scope === 'project' && location.scopeId === p.id && !location.folderId;
    const projFolders = folders.filter(f => f.projectId === p.id && f.parentId === null && !f.state);
    const isHovered = hoveredProjectId === p.id;
    const isPinned = pinnedIds.includes(p.id);
    return (
      <div key={p.id}>
        <div
          style={{ ...ITEM_STYLE(projActive), justifyContent: 'flex-start', position: 'relative', paddingRight: collapsed ? undefined : 32 }}
          onMouseEnter={e => { setHoveredProjectId(p.id); if (!projActive) e.currentTarget.style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { setHoveredProjectId(null); if (!projActive) e.currentTarget.style.background = 'transparent'; }}
        >
          {!collapsed && projFolders.length > 0 && (
            <div onClick={e => { e.stopPropagation(); toggleProject(p.id); }} style={{ cursor: 'pointer', flexShrink: 0 }}>
              <SFIcon name={exp ? 'chevron-down' : 'chevron-right'} size={10} color="var(--text-3)" />
            </div>
          )}
          {(!collapsed && projFolders.length === 0) && <div style={{ width: 10 }} />}
          <div
            onClick={() => { onNavigate({ scope: 'project', scopeId: p.id, folderId: null }); if (!exp && projFolders.length) toggleProject(p.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 7, flex: 1, minWidth: 0, cursor: 'pointer' }}
          >
            <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor, flexShrink: 0 }} />
            {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>}
          </div>
          {!collapsed && (
            <button
              onClick={(e) => { e.stopPropagation(); togglePin(p.id); }}
              title={isPinned ? t('files.unpin') : t('files.pin')}
              style={{
                // Positionné en absolu pour ne jamais modifier la hauteur de la ligne
                position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)',
                width: 20, height: 20, borderRadius: 4,
                background: isPinned ? 'var(--accent)' : 'rgba(0,0,0,0.2)', border: 'none', cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                transition: 'background 0.1s, opacity 0.1s',
                // Visible uniquement au survol ; l'espace reste réservé (position absolue) pour une hauteur constante
                opacity: isHovered ? 1 : 0,
                pointerEvents: isHovered ? 'auto' : 'none',
              }}
              onMouseEnter={e => { e.currentTarget.style.background = isPinned ? 'rgba(249,255,0,0.8)' : 'rgba(0,0,0,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isPinned ? 'var(--accent)' : 'rgba(0,0,0,0.2)'; }}
            >
              <SFIcon name="star" size={11} color={isPinned ? 'var(--on-accent)' : 'var(--text-3)'} fill={isPinned ? 'currentColor' : 'none'} />
            </button>
          )}
        </div>
        {exp && !collapsed && projFolders.map(f => {
          const active = location.scope === 'project' && location.scopeId === p.id && location.folderId === f.id;
          return (
            <div key={f.id}
              onClick={() => onNavigate({ scope: 'project', scopeId: p.id, folderId: f.id })}
              style={{ ...ITEM_STYLE(active), paddingLeft: 28 }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <SFIcon name="folder" size={11} color={p.clientColor} />
              <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 11 }}>{f.name}</span>
            </div>
          );
        })}
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '8px 4px' : '8px 6px' }}>

        {/* Locked-scope subtree: only the scoped project / client projects */}
        {lockedScope && lockedScope.scope === 'project' && (() => {
          const p = projects.find(p => p.id === lockedScope.scopeId);
          return p ? renderProjectRow(p) : null;
        })()}
        {lockedScope && lockedScope.scope === 'client' && (
          <>{projects.filter(p => p.clientId === lockedScope.scopeId).map(p => renderProjectRow(p))}</>
        )}

        {/* Root — hidden when locked */}
        {!lockedScope && <div
          onClick={() => onNavigate({ scope: 'root', folderId: null })}
          style={ITEM_STYLE(isRootActive)}
          onMouseEnter={e => { if (!isRootActive) e.currentTarget.style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { if (!isRootActive) e.currentTarget.style.background = 'transparent'; }}
        >
          <SFIcon name="hard-drive" size={13} color={isRootActive ? 'var(--accent)' : 'var(--text-3)'} />
          {!collapsed && <span>{t('files.allFiles')}</span>}
        </div>}

        {/* Clients link - child of root (rendu avant les dossiers globaux pour cohérence avec la vue colonnes) */}
        {!lockedScope && !collapsed && (
          <div
            onClick={() => onNavigate({ scope: 'clients', folderId: null })}
            style={{ ...ITEM_STYLE(location.scope === 'clients'), paddingLeft: '28px' }}
            onMouseEnter={e => { if (location.scope !== 'clients') e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (location.scope !== 'clients') e.currentTarget.style.background = 'transparent'; }}
          >
            <SFIcon name="users" size={12} color={location.scope === 'clients' ? 'var(--accent)' : 'var(--text-3)'} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{t('files.clients')}</span>
          </div>
        )}

        {/* Global folders (Archives) - children of root */}
        {!lockedScope && globalRoots.filter(f => !['folder-templates', 'folder-archives', 'folder-trash'].includes(f.id)).map(f => {
          const active = location.scope === 'global' && location.folderId === f.id;
          return (
            <div key={f.id}
              onClick={() => onNavigate({ scope: 'global', folderId: f.id })}
              style={{ ...ITEM_STYLE(active), paddingLeft: collapsed ? (collapsed ? '6px' : '28px') : '28px' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <SFIcon name="folder" size={12} color={active ? 'var(--accent)' : 'var(--text-3)'} />
              {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{f.name}</span>}
            </div>
          );
        })}

        {/* All Projects — hidden when locked (the scoped subtree is rendered at the top instead) */}
        {!lockedScope && projects.length > 0 && (
          <>
            <SectionLabel>{t('files.projectsSection')}</SectionLabel>
            {projects.map(p => renderProjectRow(p))}
          </>
        )}

        {/* Separator */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />

        {/* Archives & Trash */}
        {[
          { id: 'folder-archives', nameKey: 'files.archives', icon: 'archive' },
          { id: 'folder-trash', nameKey: 'files.trash', icon: 'trash-2' },
        ].map(item => {
          const active = location.scope === 'global' && location.folderId === item.id;
          return (
            <div key={item.id}
              onClick={() => onNavigate({ scope: 'global', scopeId: undefined, folderId: item.id })}
              style={ITEM_STYLE(active)}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <SFIcon name={item.icon} size={13} color={active ? 'var(--accent)' : 'var(--text-3)'} />
              {!collapsed && <span>{t(item.nameKey)}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// -- Storage view (WinDirStat-style) --

interface StorageVersion { id: string; name: string; subtitle?: string; size: number }

interface StorageItem {
  id: string;
  name: string;
  subtitle?: string;
  isFolder: boolean;
  size: number;
  count: number;
  color: string;
  icon: string;
  onClick?: () => void;
  folderItem?: FileFolder;
  fileItem?: FileItem;
  versions?: StorageVersion[];
}

// Versions (avec tailles) d'une ressource à upload (révision vidéo/photo/audio/fichier), lues sans entrer dans la ressource.
const FALLBACK_VERSION_BYTES = [1_600_000_000, 1_900_000_000, 2_150_000_000]; // V1·V2·V3 simulées si la ressource n'a jamais été ouverte
function resourceVersionSizes(file: FileItem, t: (key: string) => string): StorageVersion[] | undefined {
  if (file.type !== 'resource' || !file.resourceId || file.resourceType !== 'video_review') return undefined;
  const content = getResourceContent<{ versions?: { v: string; label?: string; size?: number }[] }>(file.resourceId);
  if (content?.versions?.length) {
    return content.versions.map(v => ({ id: `${file.id}-${v.v}`, name: v.v, subtitle: v.label, size: v.size ?? 0 }));
  }
  // Repli : versions simulées stables (la persistance réelle prend le relais dès que la ressource est ouverte).
  return FALLBACK_VERSION_BYTES.map((sz, i) => ({ id: `${file.id}-V${i + 1}`, name: `V${i + 1}`, subtitle: i === 0 ? t('files.versionInitial') : t('files.versionRevision'), size: sz }));
}

function buildSizeMap(folders: FileFolder[], files: FileItem[]): Map<string, { size: number; count: number }> {
  const map = new Map<string, { size: number; count: number }>();
  folders.forEach(f => map.set(f.id, { size: 0, count: 0 }));
  files.forEach(f => {
    if (f.parentFolderId && map.has(f.parentFolderId)) {
      const cur = map.get(f.parentFolderId)!;
      map.set(f.parentFolderId, { size: cur.size + (f.size ?? 0), count: cur.count + 1 });
    }
  });
  const visited = new Set<string>();
  const folderIds = new Set(folders.map(f => f.id));
  const compute = (id: string): { size: number; count: number } => {
    if (visited.has(id)) return map.get(id) ?? { size: 0, count: 0 };
    visited.add(id);
    let { size, count } = map.get(id) ?? { size: 0, count: 0 };
    folders.filter(f => f.parentId === id).forEach(child => {
      const r = compute(child.id);
      size += r.size;
      count += r.count;
    });
    map.set(id, { size, count });
    return { size, count };
  };
  folders.filter(f => !f.parentId || !folderIds.has(f.parentId)).forEach(f => compute(f.id));
  return map;
}

const fmtSz = (n: number): string => {
  if (n >= 1e9) return `${(n / 1e9).toFixed(1)} Go`;
  if (n >= 1e6) return `${(n / 1e6).toFixed(1)} Mo`;
  if (n >= 1e3) return `${(n / 1e3).toFixed(0)} Ko`;
  return `${n} o`;
};

function VersionRow({ v, vpct, canDelete, onDelete }: {
  v: StorageVersion; vpct: number; canDelete: boolean; onDelete: () => void;
}) {
  const { t } = useTranslation();
  const [hov, setHov] = React.useState(false);
  return (
    <div
      onMouseEnter={() => setHov(true)}
      onMouseLeave={() => setHov(false)}
      style={{ display: 'grid', gridTemplateColumns: '1fr 220px 60px 70px 36px', gap: 8, padding: '4px 20px', borderBottom: '1px solid var(--border)', background: hov ? 'rgba(255,255,255,0.02)' : 'var(--surface)', alignItems: 'center' }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, paddingLeft: 32 }}>
        <SFIcon name="git-commit-horizontal" size={12} color="var(--text-3)" />
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--accent)', flexShrink: 0 }}>{v.name}</span>
        {v.subtitle && <span style={{ fontSize: 11, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.subtitle}</span>}
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <div style={{ flex: 1, height: 4, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${vpct}%`, background: 'var(--text-3)', borderRadius: 3 }} />
        </div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)', flexShrink: 0, minWidth: 56, textAlign: 'right' }}>{fmtSz(v.size)}</span>
      </div>
      <span />
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{vpct >= 0.1 ? `${vpct.toFixed(1)}%` : '<0.1%'}</span>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {canDelete && (
          <button
            onClick={onDelete}
            title={t('files.deleteVersionTooltip')}
            style={{ opacity: hov ? 1 : 0, width: 24, height: 24, borderRadius: 5, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'opacity 0.1s' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          >
            <SFIcon name="trash-2" size={11} color="var(--danger)" />
          </button>
        )}
      </div>
    </div>
  );
}

export function StorageView({
  folders, files, projects, clients, location, onNavigate, context = 'active',
}: {
  folders: FileFolder[];
  files: FileItem[];
  projects: ReturnType<typeof getProjects>;
  clients: ReturnType<typeof getClients>;
  location: NavLocation;
  onNavigate: (loc: NavLocation) => void;
  context?: 'active' | 'trashed' | 'archived';
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [hoveredId, setHoveredId] = React.useState<string | null>(null);
  const [confirmingId, setConfirmingId] = React.useState<string | null>(null);
  const [expandedIds, setExpandedIds] = React.useState<Set<string>>(new Set());
  const [ctx, setCtx] = React.useState<{ pos: { x: number; y: number }; items: CtxMenuItem[] } | null>(null);
  const [storageSelIds, setStorageSelIds] = React.useState<Set<string>>(new Set());
  const [storageLast, setStorageLast] = React.useState<string | null>(null);

  const handleStorageClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey && storageLast) {
      e.preventDefault();
      const a = storageOrderedIds.indexOf(storageLast);
      const b = storageOrderedIds.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setStorageSelIds(new Set(storageOrderedIds.slice(lo, hi + 1)));
      } else { setStorageSelIds(new Set([id])); }
      setStorageLast(id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setStorageSelIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
      setStorageLast(id);
      return;
    }
    setStorageSelIds(new Set([id]));
    setStorageLast(id);
  };

  const trashStorageSelected = () => {
    storageSelIds.forEach(id => {
      const item = items.find(i => i.id === id);
      if (!item) return;
      if (context !== 'active') {
        if (item.isFolder && item.folderItem) restoreFolder(item.folderItem.id);
        else if (item.fileItem) restoreFile(item.fileItem.id);
      } else {
        if (item.isFolder && item.folderItem) trashFolder(item.folderItem.id);
        else if (item.fileItem) trashFile(item.fileItem.id);
      }
    });
    setStorageSelIds(new Set());
    setStorageLast(null);
  };

  const noSelectOnModifier = (e: React.MouseEvent) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); };

  const openResource = (file: FileItem) => {
    if (!file.resourceId) return;
    const pid = file.projectId ?? getFiles().find(f => f.resourceId === file.resourceId)?.projectId;
    // Ressource liée à un projet → route projet ; sinon route ressource globale (sans projectId)
    navigate(pid ? `/projets/${pid}/ressources/${file.resourceId}` : `/ressources/${file.resourceId}`);
  };

  const deleteVersion = (item: StorageItem, versionId: string) => {
    const resourceId = item.fileItem?.resourceId;
    if (!resourceId) return;
    const content = getResourceContent<{ versions?: { v: string; [k: string]: unknown }[] }>(resourceId);
    if (!content?.versions) return;
    const vKey = versionId.replace(`${item.fileItem!.id}-`, '');
    setResourceContent(resourceId, { ...content, versions: content.versions.filter(v => v.v !== vKey) });
  };

  const openItemCtx = (e: React.MouseEvent, item: StorageItem) => {
    e.preventDefault();
    const menuItems: CtxMenuItem[] = [];
    if (item.fileItem?.resourceId) {
      menuItems.push({ label: t('files.openResource'), icon: 'external-link', action: () => item.fileItem && openResource(item.fileItem) });
      menuItems.push({ label: '', icon: '', action: () => {}, separator: true });
    } else if (item.isFolder && item.onClick) {
      menuItems.push({ label: t('files.open'), icon: 'folder-open', action: item.onClick });
      menuItems.push({ label: '', icon: '', action: () => {}, separator: true });
    }
    if (context !== 'active') {
      if (item.isFolder && item.folderItem) menuItems.push({ label: t('files.restore'), icon: 'rotate-ccw', action: () => { restoreFolder(item.folderItem!.id); } });
      else if (item.fileItem) menuItems.push({ label: t('files.restore'), icon: 'rotate-ccw', action: () => { restoreFile(item.fileItem!.id); } });
    } else {
      if (item.isFolder && item.folderItem) menuItems.push({ label: t('files.moveToTrash'), icon: 'trash-2', danger: true, action: () => { trashFolder(item.folderItem!.id); } });
      else if (item.fileItem) menuItems.push({ label: t('files.moveToTrash'), icon: 'trash-2', danger: true, action: () => { trashFile(item.fileItem!.id); } });
    }
    if (menuItems.length > 0) setCtx({ pos: { x: e.clientX, y: e.clientY }, items: menuItems });
  };

  const sizeMap = React.useMemo(() => buildSizeMap(folders, files), [folders, files]);

  const projectSizeMap = React.useMemo(() => {
    const map = new Map<string, { size: number; count: number }>();
    files.forEach(f => {
      if (f.projectId) {
        const cur = map.get(f.projectId) ?? { size: 0, count: 0 };
        map.set(f.projectId, { size: cur.size + (f.size ?? 0), count: cur.count + 1 });
      }
    });
    return map;
  }, [files]);

  const items: StorageItem[] = React.useMemo(() => {
    const { scope, scopeId, folderId } = location;

    if (scope === 'root') {
      return projects
        .map(p => {
          const sz = projectSizeMap.get(p.id) ?? { size: 0, count: 0 };
          const client = clients.find(c => c.id === p.clientId);
          return {
            id: p.id, name: p.name, subtitle: client?.name,
            isFolder: true, size: sz.size, count: sz.count,
            color: p.clientColor ?? '#6366f1',
            icon: 'folder',
            onClick: () => onNavigate({ scope: 'project', scopeId: p.id, folderId: null }),
          };
        })
        .filter(i => i.size > 0)
        .sort((a, b) => b.size - a.size);
    }

    let currentFolders: FileFolder[] = [];
    let currentFiles: FileItem[] = [];

    if (scope === 'project') {
      if (!folderId) {
        currentFolders = folders.filter(f => f.projectId === scopeId && !f.parentId);
        currentFiles   = files.filter(f => f.projectId === scopeId && !f.parentFolderId);
      } else {
        currentFolders = folders.filter(f => f.parentId === folderId);
        currentFiles   = files.filter(f => f.parentFolderId === folderId);
      }
    } else if (scope === 'client') {
      if (!folderId) {
        currentFolders = folders.filter(f => f.clientId === scopeId && !f.parentId);
        currentFiles   = files.filter(f => f.clientId === scopeId && !f.parentFolderId);
      } else {
        currentFolders = folders.filter(f => f.parentId === folderId);
        currentFiles   = files.filter(f => f.parentFolderId === folderId);
      }
    } else if (scope === 'global') {
      currentFolders = folders.filter(f => !f.projectId && !f.clientId && f.parentId === folderId);
      currentFiles   = files.filter(f => !f.projectId && !f.clientId && f.parentFolderId === folderId);
    } else if (scope === 'clients') {
      currentFolders = [];
      currentFiles   = [];
    }

    const folderItems: StorageItem[] = currentFolders.map(f => {
      const sz = sizeMap.get(f.id) ?? { size: 0, count: 0 };
      return {
        id: f.id, name: f.name, isFolder: true,
        size: sz.size, count: sz.count,
        color: '#f5c842', icon: 'folder',
        folderItem: f,
        onClick: () => onNavigate({ ...location, folderId: f.id }),
      };
    });

    const fileItems: StorageItem[] = currentFiles.map(f => {
      const rm = f.resourceType ? RESOURCE_TYPE_META[f.resourceType] : undefined;
      const meta = rm ?? TYPE_META[f.type] ?? TYPE_META.other;
      const versions = resourceVersionSizes(f, t);
      const size = versions ? versions.reduce((s, v) => s + v.size, 0) : (f.size ?? 0);
      return {
        id: f.id, name: f.name, isFolder: false,
        size, count: versions ? versions.length : 0,
        color: meta.color, icon: meta.icon,
        fileItem: f,
        versions,
      };
    });

    return [...folderItems, ...fileItems].sort((a, b) => b.size - a.size);
  }, [location, folders, files, projects, clients, sizeMap, projectSizeMap, onNavigate, t]);

  const storageOrderedIds = React.useMemo(() => items.map(i => i.id), [items]);

  const totalSize  = items.reduce((s, i) => s + i.size, 0);
  const totalCount = files.length;

  const handleAction = (item: StorageItem) => {
    if (context !== 'active') {
      if (item.isFolder && item.folderItem) restoreFolder(item.folderItem.id);
      else if (item.fileItem) restoreFile(item.fileItem.id);
    } else {
      if (item.isFolder && item.folderItem) trashFolder(item.folderItem.id);
      else if (item.fileItem) trashFile(item.fileItem.id);
    }
    setConfirmingId(null);
  };

  const actionIcon  = context !== 'active' ? 'rotate-ccw' : 'trash-2';
  const actionColor = context !== 'active' ? 'var(--ok)' : 'var(--danger)';

  return (
    <>
    <div style={{ flex: 1, minWidth: 0, height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Context banner */}
      {context !== 'active' && (
        <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 8, padding: '7px 20px', background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <SFIcon name={context === 'trashed' ? 'trash-2' : 'archive'} size={13} color="var(--text-2)" />
          <span style={{ fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}>
            {t('files.storageView')} &mdash; <strong>{context === 'trashed' ? t('files.trash') : t('files.archives')}</strong>
          </span>
        </div>
      )}

      {/* Summary strip */}
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', gap: 16, padding: '10px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <span style={{ fontSize: 20, fontWeight: 700, color: totalSize > 0 ? 'var(--text)' : 'var(--text-3)' }}>
          {totalSize > 0 ? fmtSz(totalSize) : t('files.empty')}
        </span>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>
          {t('files.itemsCount', { count: items.length })} &bull; {t('files.filesCount', { count: totalCount })}
        </span>
        {storageSelIds.size > 0 && (
          <button
            onClick={trashStorageSelected}
            title={context !== 'active' ? t('files.restoreCountTooltip', { count: storageSelIds.size }) : t('files.trashCountTooltip', { count: storageSelIds.size })}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', marginLeft: 'auto' }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = context !== 'active' ? 'var(--ok)' : 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = context !== 'active' ? 'rgba(34,197,94,0.1)' : 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          >
            <SFIcon name={context !== 'active' ? 'rotate-ccw' : 'trash-2'} size={13} color={context !== 'active' ? 'var(--ok)' : 'var(--danger)'} />
            {storageSelIds.size > 1 && (
              <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 15, height: 15, borderRadius: 8, background: context !== 'active' ? 'var(--ok)' : 'var(--danger)', color: '#fff', fontSize: 9, fontFamily: 'var(--ff-mono)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {storageSelIds.size}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Column headers */}
      <div style={{ flexShrink: 0, display: 'grid', gridTemplateColumns: '1fr 220px 60px 70px 36px', gap: 8, padding: '6px 20px', background: 'var(--surface-2)', borderBottom: '1px solid var(--border)' }}>
        {[t('files.colName'), t('files.colSize'), t('files.colItems'), '%', ''].map((h, hi) => (
          <span key={hi} style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</span>
        ))}
      </div>

      {/* Scrollable rows */}
      <div style={{ flex: 1, overflowY: 'auto', minHeight: 0 }}>
        {items.length === 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12 }}>
            <SFIcon name="chart-bar" size={36} color="var(--text-2)" />
            <p style={{ fontSize: 13, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>{t('files.noFileInLocation')}</p>
          </div>
        ) : items.map(item => {
          const pct = totalSize > 0 ? item.size / totalSize * 100 : 0;
          const isHov = hoveredId === item.id;
          const isCfm = confirmingId === item.id;
          const isExpanded = expandedIds.has(item.id);
          const isStorageSel = storageSelIds.has(item.id);
          return (
            <React.Fragment key={item.id}>
            <div
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              onMouseDown={noSelectOnModifier}
              onClick={e => handleStorageClick(e, item.id)}
              onContextMenu={e => openItemCtx(e, item)}
              style={{
                display: 'grid', gridTemplateColumns: '1fr 220px 60px 70px 36px',
                gap: 8, padding: '6px 20px',
                borderBottom: '1px solid var(--border)',
                background: isStorageSel ? 'rgba(249,255,0,0.06)' : isHov ? 'var(--surface-2)' : 'transparent',
                outline: isStorageSel ? '1px solid rgba(249,255,0,0.3)' : 'none',
                outlineOffset: '-1px',
                alignItems: 'center',
                transition: 'background 0.08s',
                cursor: 'default',
              }}
            >
              {/* Name */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 0 }}>
                {item.versions ? (
                  <button
                    onClick={() => setExpandedIds(prev => { const n = new Set(prev); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; })}
                    title={isExpanded ? t('files.collapseVersions') : t('files.viewVersions')}
                    style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 0, color: 'var(--text-3)', flexShrink: 0 }}
                  >
                    <SFIcon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={13} />
                  </button>
                ) : <span style={{ width: 13, flexShrink: 0 }} />}
                <div
                  style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1, cursor: (item.onClick || (!item.isFolder && item.fileItem?.resourceId)) ? 'pointer' : 'default' }}
                  onClick={e => {
                    if (!item.isFolder && item.fileItem?.resourceId) {
                      if (e.detail === 2) openResource(item.fileItem);
                      return;
                    }
                    item.onClick?.();
                  }}
                >
                  {item.isFolder || !item.fileItem
                    ? <SFIcon name={item.icon} size={15} color={item.color} />
                    : <FileTypeIcon type={item.fileItem.type} resourceType={item.fileItem.resourceType} mediaSubtype={fileMediaSubtype(item.fileItem)} size={15} />}
                  <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: item.isFolder ? 600 : 400 }}>
                    {item.name}
                  </span>
                  {item.subtitle && (
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>
                      {item.subtitle}
                    </span>
                  )}
                  {item.versions && (
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 5, padding: '1px 6px', flexShrink: 0 }}>
                      {t('files.versionsCount', { count: item.versions.length })}
                    </span>
                  )}
                </div>
              </div>

              {/* Bar + size */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 5, background: 'var(--surface-3)', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: item.color, borderRadius: 3 }} />
                </div>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text)', flexShrink: 0, minWidth: 56, textAlign: 'right' }}>
                  {fmtSz(item.size)}
                </span>
              </div>

              {/* Count */}
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                {item.isFolder && item.count > 0 ? item.count : ''}
              </span>

              {/* Percentage */}
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-3)' }}>
                {pct >= 0.1 ? `${pct.toFixed(1)}%` : '<0.1%'}
              </span>

              {/* Action */}
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {isCfm ? (
                  <div style={{ display: 'flex', gap: 3 }}>
                    <button
                      onClick={() => handleAction(item)}
                      style={{ padding: '2px 7px', borderRadius: 4, border: `1px solid ${actionColor}`, background: 'transparent', color: actionColor, fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-text)', fontWeight: 600 }}
                    >
                      {context !== 'active' ? t('files.restore') : t('files.ok')}
                    </button>
                    <button
                      onClick={() => setConfirmingId(null)}
                      style={{ padding: '2px 7px', borderRadius: 4, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 10, cursor: 'pointer' }}
                    >
                      X
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={() => setConfirmingId(item.id)}
                    style={{ opacity: isHov ? 1 : 0, width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', transition: 'opacity 0.1s' }}
                  >
                    <SFIcon name={actionIcon} size={12} color={actionColor} />
                  </button>
                )}
              </div>
            </div>

            {/* Sous-lignes : versions de la ressource */}
            {item.versions && isExpanded && item.versions.map(v => {
              const vpct = totalSize > 0 ? v.size / totalSize * 100 : 0;
              const canDelete = !!getResourceContent(item.fileItem?.resourceId ?? '');
              return (
                <VersionRow
                  key={v.id} v={v} vpct={vpct} canDelete={canDelete}
                  onDelete={() => deleteVersion(item, v.id)}
                />
              );
            })}
            </React.Fragment>
          );
        })}
      </div>

      {/* Treemap footer */}
      <div style={{ flexShrink: 0, height: 180, borderTop: '2px solid var(--border)', display: 'flex', overflow: 'hidden' }}>
        {items.filter(i => i.size > 0).map(item => {
          const pct = totalSize > 0 ? item.size / totalSize : 0;
          return (
            <div
              key={item.id}
              onClick={item.onClick}
              title={`${item.name} — ${fmtSz(item.size)} (${(pct * 100).toFixed(1)}%)`}
              style={{
                flex: `${Math.max(pct * 100, 0.5)} 0 0`,
                background: item.color + 'cc',
                border: '2px solid var(--bg)',
                cursor: item.onClick ? 'pointer' : 'default',
                display: 'flex', flexDirection: 'column', justifyContent: 'flex-end',
                padding: 7, overflow: 'hidden', position: 'relative',
                transition: 'filter 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.filter = 'brightness(1.3)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.filter = 'none'; }}
            >
              {pct > 0.05 && (
                <>
                  <p style={{ fontSize: 11, fontWeight: 700, color: '#fff', textShadow: '0 1px 3px rgba(0,0,0,0.7)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {item.name}
                  </p>
                  {pct > 0.1 && (
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'rgba(255,255,255,0.8)', marginTop: 2 }}>
                      {fmtSz(item.size)}
                    </p>
                  )}
                </>
              )}
            </div>
          );
        })}
        {items.filter(i => i.size > 0).length === 0 && (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{t('files.noData')}</span>
          </div>
        )}
      </div>
    </div>
    {ctx && <ContextMenu items={ctx.items} pos={ctx.pos} onClose={() => setCtx(null)} />}
    </>
  );
}

// ── Move-to modal ─────────────────────────────────────────────────────────────

function MoveToModal({ fileIds, folderIds, allFolders, projectId, clientId, onMove, onClose }: {
  fileIds: string[];
  folderIds: string[];
  allFolders: FileFolder[];
  projectId?: string;
  clientId?: string;
  onMove: (targetFolderId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [search, setSearch] = useState('');
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);

  const excluded = new Set(folderIds);

  // Build folder path string for display
  const folderPath = (f: FileFolder): string => {
    const parts: string[] = [];
    let cur = f;
    for (let i = 0; i < 6; i++) {
      const parent = cur.parentId ? allFolders.find(p => p.id === cur.parentId) : null;
      if (!parent) break;
      parts.unshift(parent.name);
      cur = parent;
    }
    return parts.length > 0 ? parts.join(' / ') : (projectId ? t('files.rootProject') : t('files.root'));
  };

  // Split into: same-scope folders first, then "other" folders
  const inScope = (f: FileFolder) => {
    if (projectId) return f.projectId === projectId;
    if (clientId) return f.clientId === clientId;
    return !f.projectId && !f.clientId; // global
  };

  const q = search.toLowerCase();
  const base = allFolders.filter(f => !excluded.has(f.id) && !f.state && (q === '' || f.name.toLowerCase().includes(q)));
  const scopeFolders = base.filter(f => inScope(f));
  const otherFolders = (projectId || clientId) ? base.filter(f => !inScope(f)) : [];

  const count = fileIds.length + folderIds.length;

  const FolderRow = ({ f, badge }: { f: FileFolder; badge?: string }) => {
    const isSelected = selectedTarget === f.id;
    return (
      <div
        onClick={() => setSelectedTarget(isSelected ? null : f.id)}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, cursor: 'pointer', background: isSelected ? 'rgba(249,255,0,0.08)' : 'transparent', border: isSelected ? '1px solid rgba(249,255,0,0.4)' : '1px solid transparent', marginBottom: 2 }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        <SFIcon name="folder" size={15} color={isSelected ? 'var(--accent)' : 'var(--text-3)'} />
        <div style={{ flex: 1, minWidth: 0 }}>
          <p style={{ fontSize: 13, color: 'var(--text)', fontWeight: isSelected ? 600 : 400, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
          <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folderPath(f)}</p>
        </div>
        {badge && <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 4, padding: '1px 6px', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{badge}</span>}
        {isSelected && <SFIcon name="check" size={14} color="var(--accent)" />}
      </div>
    );
  };

  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 9999, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, width: 'min(520px, 92vw)', maxHeight: '80vh', display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 24px 64px rgba(0,0,0,0.6)' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Header */}
        <div style={{ padding: '18px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ fontWeight: 700, fontSize: 14, color: 'var(--text)', marginBottom: 4 }}>
            {t('files.moveItemsCount', { count })}
          </p>
          <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>{t('files.chooseDestinationFolder')}</p>
          <div style={{ marginTop: 12, display: 'flex', alignItems: 'center', gap: 8, background: 'var(--surface-2)', borderRadius: 9, padding: '6px 12px', border: '1px solid var(--border)' }}>
            <SFIcon name="search" size={13} color="var(--text-3)" />
            <input
              autoFocus
              value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder={t('files.searchFolderPlaceholder')}
              style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}
            />
          </div>
        </div>

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 10px' }}>
          {scopeFolders.length === 0 && otherFolders.length === 0 && (
            <p style={{ padding: '20px 12px', color: 'var(--text-3)', fontSize: 12, textAlign: 'center', fontFamily: 'var(--ff-text)' }}>{t('files.noFolderFound')}</p>
          )}

          {/* Same-scope folders (always shown first, no section label if no "other" section) */}
          {scopeFolders.map(f => <FolderRow key={f.id} f={f} />)}

          {/* Other folders — only shown when there are scoped folders too, or search yields cross-scope results */}
          {otherFolders.length > 0 && (
            <>
              <div style={{ padding: '10px 12px 4px', display: 'flex', alignItems: 'center', gap: 8 }}>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
                <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0 }}>{t('files.otherProjects')}</span>
                <div style={{ flex: 1, height: 1, background: 'var(--border)' }} />
              </div>
              {otherFolders.map(f => <FolderRow key={f.id} f={f} badge={f.projectId ? t('files.badgeOtherProject') : t('files.badgeGlobal')} />)}
            </>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 20px', borderTop: '1px solid var(--border)', display: 'flex', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
          <SFButton variant="ghost" onClick={onClose}>{t('files.cancel')}</SFButton>
          <SFButton variant="primary" onClick={() => selectedTarget && onMove(selectedTarget)} style={{ opacity: selectedTarget ? 1 : 0.4, pointerEvents: selectedTarget ? 'auto' : 'none' }}>
            {t('files.moveHere')}
          </SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export function FileBrowser({ initialNav, embedded = false, locked = false }: { initialNav?: NavLocation; embedded?: boolean; locked?: boolean }) {
  const { t } = useTranslation();
  const effectiveNav = initialNav ?? { scope: 'root' as const, folderId: null };
  const lockedScope: NavLocation | undefined = locked && initialNav ? initialNav : undefined;
  const navigate = useNavigate();
  // Persistance de la position de navigation — clé distincte par contexte
  const navKey = locked && initialNav
    ? `sf_nav_${(initialNav as { scope: string; scopeId?: string }).scope}_${'scopeId' in initialNav ? (initialNav as { scopeId: string }).scopeId : 'root'}`
    : 'sf_nav_global';
  const [persistedNav, setPersistedNav] = usePersistedState<NavLocation>(navKey, effectiveNav);
  const [lockedNav, setLockedNav] = useState<NavLocation>(() => persistedNav);
  // Règle : vue locked → état local synchronisé avec persistance ; vue libre → persisté
  const location: NavLocation = locked ? lockedNav : persistedNav;
  const setLocation = locked
    ? (nav: NavLocation | ((prev: NavLocation) => NavLocation)) => {
        const resolved = typeof nav === 'function' ? nav(lockedNav) : nav;
        setLockedNav(resolved);
        setPersistedNav(resolved);
      }
    : setPersistedNav;
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('sf_view_fichiers', 'grid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [sortOpen, setSortOpen] = useState(false);
  const [filterType, setFilterType] = useState<FileItemType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [treeWidth] = useState(220);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [rawFolders, setRawFolders] = useState(getFolders);
  const [rawFiles, setRawFiles]     = useState(getFiles);
  const [projects, setProjects]     = useState(getProjects);
  const [clients, setClients]       = useState(getClients);
  const [pinnedIds, setPinnedIds]   = useState(getPinnedIds);
  const [allResources, setAllResources] = useState(getResources);
  const [commentCounts, setCommentCounts] = useState(getAllCommentCounts);

  // Vues normales : on ne montre que les items actifs (ni archivés, ni en corbeille).
  // Les vues Corbeille / Archives lisent directement le store via getTrashed*/getArchived*.
  const allFolders = rawFolders.filter(f => !f.state);
  const allFiles   = rawFiles.filter(f => !f.state);

  useEffect(() => subscribeFileStore(() => { setRawFolders(getFolders()); setRawFiles(getFiles()); }), []);
  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);
  useEffect(() => subscribeClients(() => setClients(getClients())), []);
  useEffect(() => subscribePinned(() => setPinnedIds(getPinnedIds())), []);
  useEffect(() => subscribeResources(() => setAllResources(getResources())), []);
  useEffect(() => subscribeCommentCounts(() => setCommentCounts(getAllCommentCounts())), []);

  // Compute which folders have comment notifications (resource files with comments, bubbled up)
  const foldersWithComments = React.useMemo(() => {
    const folderSet = new Set<string>();
    const resourceFiles = allFiles.filter(f => f.type === 'resource' && f.resourceId);
    for (const file of resourceFiles) {
      const count = commentCounts[file.resourceId!] ?? 0;
      if (count === 0) continue;
      // Bubble up through folder ancestors
      let folderId = file.parentFolderId;
      while (folderId) {
        folderSet.add(folderId);
        const parent = allFolders.find(f => f.id === folderId);
        folderId = parent?.parentId ?? null;
      }
    }
    return folderSet;
  }, [allFiles, allFolders, commentCounts]);

  // Ouvre une ressource en naviguant vers sa route, avec fallback si projectId manquant
  const openResource = useCallback((file: FileItem) => {
    if (!file.resourceId) return;
    const pid = file.projectId ?? getFiles().find(f => f.resourceId === file.resourceId)?.projectId;
    // Ressource liée à un projet → route projet ; sinon route ressource globale (sans projectId)
    navigate(pid ? `/projets/${pid}/ressources/${file.resourceId}` : `/ressources/${file.resourceId}`);
  }, [navigate]);

  // Modals
  const [showNewFolder, setShowNewFolder]             = useState(false);
  const [showAddFile, setShowAddFile]                 = useState(false);
  const [renamingId, setRenamingId]                   = useState<string | null>(null);
  const [previewFile, setPreviewFile]                 = useState<FileItem | null>(null);
  const [infoFile,    setInfoFile]                    = useState<FileItem | null>(null);
  const [isDraggingOver, setIsDraggingOver]           = useState(false);
  const fileInputRef                                  = useRef<HTMLInputElement>(null);
  const [newBtnOpen, setNewBtnOpen]                   = useState(false);
  const [newResourceDef, setNewResourceDef]           = useState<typeof RESOURCE_TYPES[number] | null>(null);
  const [showRevisionPicker, setShowRevisionPicker] = useState(false);
  const [pendingRevision, setPendingRevision]       = useState<RevisionSelection | null>(null);
  const newBtnRef = useRef<HTMLButtonElement>(null);
  const [showSaveTemplateModal, setShowSaveTemplateModal] = useState(false);
  const [templateName, setTemplateName] = useState('');
  const [templateProjectId, setTemplateProjectId] = useState<string | null>(null);

  // Context menu
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; items: CtxMenuItem[] } | null>(null);

  // Multi-selection of files
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId] = useState<string | null>(null);
  const [selectedVirtualId, setSelectedVirtualId] = useState<string | null>(null);

  // Drag-and-drop between folders
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const dragPayload = useRef<{ fileIds: string[]; folderIds: string[] } | null>(null);

  // Move-to modal
  const [moveModal, setMoveModal] = useState<{ fileIds: string[]; folderIds: string[]; projectId?: string; clientId?: string } | null>(null);

  const openMoveModal = (fileIds: string[], folderIds: string[]) => {
    setMoveModal({
      fileIds,
      folderIds,
      projectId: location.scope === 'project' ? location.scopeId : undefined,
      clientId: location.scope === 'client' ? location.scopeId : undefined,
    });
  };

  const handleFileDragStart = (e: React.DragEvent, fileId: string) => {
    // If the dragged file is part of selection, drag the whole selection; otherwise just this file
    const ids = selectedIds.has(fileId) ? [...selectedIds] : [fileId];
    dragPayload.current = { fileIds: ids, folderIds: [] };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', ids.join(','));
  };

  const handleFolderDragStart = (e: React.DragEvent, folderId: string) => {
    dragPayload.current = { fileIds: [], folderIds: [folderId] };
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', folderId);
  };

  const handleFolderDragOver = (e: React.DragEvent, folderId: string) => {
    if (!dragPayload.current) return;
    // Don't allow dropping a folder into itself
    if (dragPayload.current.folderIds.includes(folderId)) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    setDragOverFolderId(folderId);
  };

  const handleFolderDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDragOverFolderId(null);
    const payload = dragPayload.current;
    dragPayload.current = null;
    if (!payload) return;
    payload.fileIds.forEach(id => moveFile(id, targetFolderId));
    payload.folderIds.forEach(id => {
      if (id !== targetFolderId) moveFolder(id, targetFolderId);
    });
    setSelectedIds(new Set());
  };

  const handleDragEnd = () => {
    setDragOverFolderId(null);
    dragPayload.current = null;
  };

  // Raccourcis clavier : Enter ouvre la ressource sélectionnée, Escape vide la sélection
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || (e.target as HTMLElement)?.isContentEditable) return;
      if (e.key === 'Enter' && selectedIds.size === 1) {
        const fileId = [...selectedIds][0];
        const file = getFiles().find(f => f.id === fileId);
        if (file?.resourceId) { e.preventDefault(); openResource(file); }
      }
      if (e.key === 'Escape') { if (previewFile) { setPreviewFile(null); return; } setSelectedIds(new Set()); setLastSelectedId(null); setSelectedVirtualId(null); setCtx(null); }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [selectedIds, openResource, previewFile]);

  // ── Compute current folder contents ─────────────────────────────────────────

  const isTrashView    = location.scope === 'global' && location.folderId === 'folder-trash';
  const isArchivesView = location.scope === 'global' && location.folderId === 'folder-archives';
  const isSpecialView  = isTrashView || isArchivesView;

  // When locked, restrict trash/archives to items of the scoped project/client.
  const scopeFilterFolders = (arr: FileFolder[]): FileFolder[] =>
    !lockedScope ? arr
      : lockedScope.scope === 'project' ? arr.filter(f => f.projectId === lockedScope.scopeId)
      : arr.filter(f => f.clientId === lockedScope.scopeId);
  const scopeFilterFiles = (arr: FileItem[]): FileItem[] =>
    !lockedScope ? arr
      : lockedScope.scope === 'project' ? arr.filter(f => f.projectId === lockedScope.scopeId)
      : arr.filter(f => f.clientId === lockedScope.scopeId);

  const currentFolders = (() => {
    const { scope, scopeId, folderId } = location;
    if (isTrashView)    return scopeFilterFolders(getTrashedFolders());
    if (isArchivesView) return scopeFilterFolders(getArchivedFolders());
    if (scope === 'root') {
      // Show all project root folders + client root folders + global root folders
      return []; // We'll show a special root view
    }
    if (scope === 'global') {
      return allFolders.filter(f => !f.projectId && !f.clientId && f.parentId === folderId);
    }
    if (scope === 'project') {
      return allFolders.filter(f => f.projectId === scopeId && f.parentId === folderId);
    }
    if (scope === 'client') {
      return allFolders.filter(f => f.clientId === scopeId && f.parentId === folderId);
    }
    return [];
  })();

  const currentFiles = (() => {
    const { scope, scopeId, folderId } = location;
    if (isTrashView)    return scopeFilterFiles(getTrashedFiles());
    if (isArchivesView) return scopeFilterFiles(getArchivedFiles());
    if (scope === 'root') return [];
    if (scope === 'global') return allFiles.filter(f => !f.projectId && !f.clientId && f.parentFolderId === folderId);
    if (scope === 'project') return allFiles.filter(f => f.projectId === scopeId && f.parentFolderId === folderId);
    if (scope === 'client') return allFiles.filter(f => f.clientId === scopeId && f.parentFolderId === folderId);
    return [];
  })();

  // Root view: show projects + clients as virtual top-level "folders"
  const rootProjects = projects;
  const rootClients  = clients;
  // Filter out "Modèles" and "Archives" from the main list - they're in sidebar instead
  const globalRootFolders = allFolders.filter(f =>
    !f.projectId && !f.clientId && f.parentId === null &&
    f.name !== 'Modèles' && f.name !== 'Archives'
  );

  // Filter & sort files
  const filteredFiles = currentFiles.filter(f => {
    if (filterType !== 'all' && f.type !== filterType) return false;
    if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
    return true;
  }).sort((a, b) => {
    if (sortBy === 'name') return a.name.localeCompare(b.name);
    if (sortBy === 'date') return b.updatedAt.localeCompare(a.updatedAt);
    if (sortBy === 'size') return (b.size ?? 0) - (a.size ?? 0);
    return a.type.localeCompare(b.type);
  });

  const filteredFolders = currentFolders.filter(f =>
    !search || f.name.toLowerCase().includes(search.toLowerCase())
  );

  // ── Breadcrumb ───────────────────────────────────────────────────────────────

  const buildBreadcrumb = (): { label: string; onClick: () => void }[] => {
    const crumbs: { label: string; onClick: () => void }[] = [
      { label: 'Fichiers', onClick: () => setLocation({ scope: 'root', folderId: null }) },
    ];

    if (location.scope === 'project') {
      const p = projects.find(p => p.id === location.scopeId);
      const c = p ? clients.find(c => c.id === p.clientId) : null;

      // Add client first
      if (c) {
        crumbs.push({
          label: c.name,
          onClick: () => setLocation({ scope: 'client', scopeId: c.id, folderId: null })
        });
      }
      // Then add project
      if (p) {
        crumbs.push({
          label: p.name,
          onClick: () => setLocation({ scope: 'project', scopeId: p.id, folderId: null })
        });
      }
    } else if (location.scope === 'client') {
      const c = clients.find(c => c.id === location.scopeId);
      if (c) {
        crumbs.push({
          label: c.name,
          onClick: () => setLocation({ scope: 'client', scopeId: c.id, folderId: null })
        });
      }
    } else if (location.scope === 'global') {
      const f = allFolders.find(f => f.id === location.folderId);
      if (f) {
        crumbs.push({
          label: f.name,
          onClick: () => setLocation({ scope: 'global', folderId: f.id })
        });
      }
    }

    if (location.folderId) {
      const path = getFolderPath(location.folderId);
      path.forEach((f, i) => {
        crumbs.push({
          label: f.name,
          onClick: () => setLocation({ ...location, folderId: i === path.length - 1 ? f.id : (path[i].parentId ?? null) }),
        });
      });
    }
    return crumbs;
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleNewFolder = (name: string) => {
    const { scope, scopeId, folderId } = location;
    addFolder({
      name,
      parentId: folderId,
      projectId: scope === 'project' ? scopeId : undefined,
      clientId:  scope === 'client'  ? scopeId : undefined,
    });
  };

  const handleAddFile = (name: string, type: FileItemType, ext: string) => {
    const { scope, scopeId, folderId } = location;
    addFile({
      name, type, ext,
      parentFolderId: folderId,
      projectId: scope === 'project' ? scopeId : undefined,
      clientId:  scope === 'client'  ? scopeId : undefined,
    });
  };

  // Traite des fichiers réels déposés (drag-and-drop OS ou input[type=file])
  const processUploadedFiles = useCallback((files: File[]) => {
    const { scope, scopeId, folderId } = location;
    for (const file of files) {
      const ext = (file.name.split('.').pop() ?? '').toLowerCase();
      const type = fileTypeFromExt(ext);
      const newFile = addFile({
        name: file.name, type, ext,
        size: file.size,
        parentFolderId: folderId,
        projectId: scope === 'project' ? scopeId : undefined,
        clientId:  scope === 'client'  ? scopeId : undefined,
      });
      setFileContent(newFile.id, file);
    }
  }, [location]);

  const handleCreateResource = (def: typeof RESOURCE_TYPES[number], name: string, webUrl?: string) => {
    const { scope, scopeId, folderId } = location;
    const projectId = scope === 'project' ? scopeId : undefined;
    const resourceId = `res-${Date.now()}`;
    const isRevision = def.type === 'video_review' && pendingRevision;
    const actualType: ResourceType = isRevision ? pendingRevision!.resourceType : def.type;
    addResource({
      id: resourceId,
      type: actualType,
      eyebrow: isRevision ? pendingRevision!.eyebrow : (RESOURCE_EYEBROW[def.type] ?? t(def.labelKey).toUpperCase()),
      title: name,
      status: 'info',
      statusLabel: 'En cours',
      meta: '',
      ...(isRevision && pendingRevision!.mediaSubtype ? { mediaSubtype: pendingRevision!.mediaSubtype } : {}),
      ...(actualType === 'web_review' && webUrl ? { webUrl } : {}),
    });
    addFile({ name, type: 'resource', ext: 'res', parentFolderId: folderId, projectId, resourceId, resourceType: actualType,
      ...(isRevision && pendingRevision!.mediaSubtype ? { mediaSubtype: pendingRevision!.mediaSubtype } : {}) });
    setPendingRevision(null);
  };

  const handleFolderCtx = (e: React.MouseEvent, folder: FileFolder) => {
    e.preventDefault();
    e.stopPropagation();
    let items: CtxMenuItem[];
    if (folder.state === 'trashed') {
      items = [
        { label: 'Restaurer', icon: 'rotate-ccw', action: () => restoreFolder(folder.id) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Supprimer définitivement', icon: 'trash-2', action: () => { if (confirm(`Supprimer définitivement « ${folder.name} » et tout son contenu ? Cette action est irréversible.`)) deleteFolder(folder.id); }, danger: true },
      ];
    } else if (folder.state === 'archived') {
      items = [
        { label: 'Désarchiver', icon: 'rotate-ccw', action: () => restoreFolder(folder.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFolder(folder.id), danger: true },
      ];
    } else {
      items = [
        { label: 'Ouvrir', icon: 'folder-open', action: () => setLocation({ ...location, folderId: folder.id }) },
        { label: 'Renommer', icon: 'pencil', action: () => setRenamingId(folder.id) },
        { label: 'Déplacer vers…', icon: 'folder-input', action: () => openMoveModal([], [folder.id]) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Archiver', icon: 'archive', action: () => archiveFolder(folder.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFolder(folder.id), danger: true },
      ];
    }
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items });
  };

  const handleFileCtx = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
    e.stopPropagation();
    let items: CtxMenuItem[];
    if (file.state === 'trashed') {
      items = [
        { label: 'Restaurer', icon: 'rotate-ccw', action: () => restoreFile(file.id) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Supprimer définitivement', icon: 'trash-2', action: () => { if (confirm(`Supprimer définitivement « ${file.name} » ? Cette action est irréversible.`)) deleteFile(file.id); }, danger: true },
      ];
    } else if (file.state === 'archived') {
      items = [
        { label: 'Désarchiver', icon: 'rotate-ccw', action: () => restoreFile(file.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFile(file.id), danger: true },
      ];
    } else {
      // If multiple items are selected and this file is among them, move the whole selection
      const isInSelection = selectedIds.has(file.id) && selectedIds.size > 1;
      const allSelectedFileIds = isInSelection ? [...selectedIds].filter(id => allFiles.some(f => f.id === id)) : [file.id];
      items = [
        { label: 'Obtenir les infos', icon: 'info', action: () => setInfoFile(file) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Renommer', icon: 'pencil', action: () => setRenamingId(file.id) },
        ...(file.resourceId ? [{ label: 'Ouvrir la ressource', icon: 'external-link', action: () => openResource(file) }] : []),
        { label: 'Déplacer vers…', icon: 'folder-input', action: () => openMoveModal(allSelectedFileIds, []) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Archiver', icon: 'archive', action: () => archiveFile(file.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFile(file.id), danger: true },
      ];
    }
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items });
  };

  const handleNavigateFolder = (folder: FileFolder) => {
    // Dans la corbeille / les archives, on ne descend pas dans un dossier
    // (son contenu y est aussi, mais filtré des vues normales) — clic droit pour agir.
    if (folder.state) return;
    setSelectedIds(new Set());
    setLastSelectedId(null);
    // Un dossier global (sans projet ni client) doit passer en scope 'global' :
    // sinon, si on est à la racine, la vue racine ignore folderId et on ne
    // « rentre » jamais dans le dossier (bug sur les dossiers créés à la racine).
    if (!folder.projectId && !folder.clientId) {
      setLocation({ scope: 'global', folderId: folder.id });
    } else {
      setLocation(loc => ({ ...loc, folderId: folder.id }));
    }
  };

  const handleNavigateProject = (p: Project) => {
    setLocation({ scope: 'project', scopeId: p.id, folderId: null });
  };

  // ── "Nouveau" menu items (shared between the + button dropdown and the
  //    background right-click context menu) ──────────────────────────────────
  const newMenuItems = (): CtxMenuItem[] => {
    const items: CtxMenuItem[] = [
      { label: 'Nouveau dossier', icon: 'folder-plus', action: () => setShowNewFolder(true) },
    ];
    if (canAddFile) {
      items.push({ label: 'Importer un fichier', icon: 'upload', action: () => fileInputRef.current?.click() });
    }
    items.push({ label: '', icon: '', action: () => {}, separator: true });
    items.push({ label: 'Ressources', icon: '', action: () => {}, header: true });
    RESOURCE_TYPES.forEach(def => {
      items.push({
        label: t(def.labelKey), icon: def.icon, color: def.color,
        action: () => { if (def.type === 'video_review') setShowRevisionPicker(true); else setNewResourceDef(def); },
      });
    });
    return items;
  };

  // Background right-click on the main content area → open the "Nouveau" menu.
  const handleBgCtx = (e: React.MouseEvent) => {
    if (!canAdd) return;
    e.preventDefault();
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items: newMenuItems() });
  };

  // Prevents native browser text-selection on shift/ctrl+click before React handles it.
  const noSelectOnModifier = (e: React.MouseEvent) => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); };

  // Unified click handler — dossiers et fichiers, shift/ctrl multi-select.
  // La liste ordonnée dossiers-puis-fichiers reflète l'affichage pour shift-range.
  const orderedItemIds = [...filteredFolders.map(f => f.id), ...filteredFiles.map(f => f.id)];

  const handleItemClick = (e: React.MouseEvent, id: string) => {
    if (e.shiftKey && lastSelectedId) {
      e.preventDefault();
      const a = orderedItemIds.indexOf(lastSelectedId);
      const b = orderedItemIds.indexOf(id);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedIds(new Set(orderedItemIds.slice(lo, hi + 1)));
      } else {
        setSelectedIds(new Set([id]));
      }
      setLastSelectedId(id);
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      e.preventDefault();
      setSelectedIds(prev => {
        const next = new Set(prev);
        next.has(id) ? next.delete(id) : next.add(id);
        return next;
      });
      setLastSelectedId(id);
      return;
    }
    // Clic simple → sélection (double-clic gère la navigation)
    setSelectedIds(new Set([id]));
    setLastSelectedId(id);
    setSelectedVirtualId(null);
  };

  const trashSelected = () => {
    selectedIds.forEach(id => {
      if (filteredFolders.some(f => f.id === id) || allFolders.some(f => f.id === id)) trashFolder(id);
      else trashFile(id);
    });
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  // ── Project color lookup ─────────────────────────────────────────────────────

  const projectColor = (projectId?: string) => projects.find(p => p.id === projectId)?.clientColor ?? 'var(--text-3)';
  const clientColor  = (clientId?: string)  => clients.find(c => c.id === clientId)?.avatarColor ?? 'var(--text-3)';

  // ── Grid card ────────────────────────────────────────────────────────────────

  const FolderCard = ({ folder }: { folder: FileFolder }) => {
    const isRenaming = renamingId === folder.id;
    const isSelected = selectedIds.has(folder.id);
    const isDragOver = dragOverFolderId === folder.id;
    const childCount = allFolders.filter(f => f.parentId === folder.id).length
                     + allFiles.filter(f => f.parentFolderId === folder.id).length;
    return (
      <div
        draggable
        onDragStart={e => handleFolderDragStart(e, folder.id)}
        onDragEnd={handleDragEnd}
        onDragOver={e => handleFolderDragOver(e, folder.id)}
        onDragLeave={() => setDragOverFolderId(null)}
        onDrop={e => handleFolderDrop(e, folder.id)}
        onMouseDown={noSelectOnModifier}
        onClick={e => {
          if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { handleNavigateFolder(folder); return; }
          handleItemClick(e, folder.id);
        }}
        onContextMenu={e => handleFolderCtx(e, folder)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
          border: isDragOver ? '1.5px solid var(--accent)' : isSelected ? '1.5px solid var(--accent)' : '1.5px solid var(--border)',
          background: isDragOver ? 'rgba(249,255,0,0.1)' : isSelected ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)',
          transition: 'border-color 0.12s, background 0.12s',
        }}
        onMouseEnter={e => { if (!isSelected && !isDragOver) { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)'; } }}
        onMouseLeave={e => { if (!isSelected && !isDragOver) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; } }}
      >
        <SFIcon name="folder" size={36} color={folder.projectId ? projectColor(folder.projectId) : folder.clientId ? clientColor(folder.clientId) : 'var(--accent)'} />
        <div style={{ textAlign: 'center', width: '100%' }}>
          {isRenaming
            ? <RenameInput value={folder.name} onSave={v => { renameFolder(folder.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
            : <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</p>
          }
          {childCount > 0 && <p style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{childCount} élément{childCount > 1 ? 's' : ''}</p>}
        </div>
      </div>
    );
  };

  const FileCard = ({ file }: { file: FileItem }) => {
    const isRenaming = renamingId === file.id;
    const isRes = file.type === 'resource' && !!file.resourceId;
    const rm = file.resourceType ? RESOURCE_TYPE_META[file.resourceType] : undefined;
    const accentColor = rm?.color ?? '#c45be8';
    const isSelected = selectedIds.has(file.id);
    const baseBorder = isRes ? `color-mix(in srgb, ${accentColor} 35%, var(--border))` : 'var(--border)';
    return (
      <div
        draggable
        onDragStart={e => handleFileDragStart(e, file.id)}
        onDragEnd={handleDragEnd}
        onMouseDown={noSelectOnModifier}
        onClick={e => {
          if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            if (isRes) { openResource(file); return; }
            setPreviewFile(file); return;
          }
          handleItemClick(e, file.id);
        }}
        onContextMenu={e => handleFileCtx(e, file)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
          border: isSelected ? '1.5px solid var(--accent)' : `1.5px solid ${baseBorder}`,
          background: isSelected ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', transition: 'border-color 0.12s',
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = isRes ? accentColor : 'var(--border-2)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = baseBorder; }}
      >
        <FileTypeIcon type={file.type} resourceType={file.resourceType} mediaSubtype={fileMediaSubtype(file)} size={32} />
        <div style={{ textAlign: 'center', width: '100%' }}>
          {isRenaming
            ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
            : <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
          }
          <p style={{ fontSize: 9, color: rm ? rm.color : 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
            {rm ? rm.label : (file.ext || formatFileSize(file.size) || '—')}
          </p>
        </div>
      </div>
    );
  };

  // ── List row ─────────────────────────────────────────────────────────────────

  const ROW: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '36px 1fr 100px 110px 90px 90px 32px',
    alignItems: 'center', gap: 12,
    padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
  };

  const FolderRow = ({ folder }: { folder: FileFolder }) => {
    const isRenaming = renamingId === folder.id;
    const isSelected = selectedIds.has(folder.id);
    const isDragOver = dragOverFolderId === folder.id;
    const childCount = allFolders.filter(f => f.parentId === folder.id).length
                     + allFiles.filter(f => f.parentFolderId === folder.id).length;
    return (
      <div
        draggable
        onDragStart={e => handleFolderDragStart(e, folder.id)}
        onDragEnd={handleDragEnd}
        onDragOver={e => handleFolderDragOver(e, folder.id)}
        onDragLeave={() => setDragOverFolderId(null)}
        onDrop={e => handleFolderDrop(e, folder.id)}
        onMouseDown={noSelectOnModifier}
        onClick={e => {
          if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey) { handleNavigateFolder(folder); return; }
          handleItemClick(e, folder.id);
        }}
        onContextMenu={e => handleFolderCtx(e, folder)}
        style={{ ...ROW, ...(isDragOver ? { background: 'rgba(249,255,0,0.1)', outline: '1px solid var(--accent)', outlineOffset: '-1px' } : isSelected ? { background: 'rgba(249,255,0,0.06)', outline: '1px solid var(--accent)', outlineOffset: '-1px' } : {}) }}
        onMouseEnter={e => { if (!isSelected && !isDragOver) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!isSelected && !isDragOver) e.currentTarget.style.background = 'transparent'; }}
      >
        <SFIcon name="folder" size={20} color={folder.projectId ? projectColor(folder.projectId) : 'var(--accent)'} />
        {isRenaming
          ? <RenameInput value={folder.name} onSave={v => { renameFolder(folder.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
          : <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              {folder.name}
              {foldersWithComments.has(folder.id) && (
                <span title="Commentaires non lus" style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--accent)', flexShrink: 0, display: 'inline-block' }} />
              )}
            </span>
        }
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>Dossier</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>—</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{childCount > 0 ? `${childCount} élément${childCount > 1 ? 's' : ''}` : '—'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{folder.createdAt}</span>
      </div>
    );
  };

  const FileRow = ({ file }: { file: FileItem }) => {
    const isRenaming = renamingId === file.id;
    const isRes = file.type === 'resource' && !!file.resourceId;
    const rm = file.resourceType ? RESOURCE_TYPE_META[file.resourceType] : undefined;
    const isSelected = selectedIds.has(file.id);
    const resource = isRes ? allResources.find(r => r.id === file.resourceId) : undefined;
    const commentCount = isRes && file.resourceId ? (commentCounts[file.resourceId] ?? 0) : 0;
    const [statusDropOpen, setStatusDropOpen] = useState(false);
    return (
      <div
        draggable
        onDragStart={e => handleFileDragStart(e, file.id)}
        onDragEnd={handleDragEnd}
        onMouseDown={noSelectOnModifier}
        onClick={e => {
          if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
            if (isRes) { openResource(file); return; }
            setPreviewFile(file); return;
          }
          handleItemClick(e, file.id);
        }}
        onContextMenu={e => handleFileCtx(e, file)}
        style={{
          ...ROW, cursor: 'pointer',
          ...(isSelected ? { background: 'rgba(249,255,0,0.06)', outline: '1px solid var(--accent)', outlineOffset: '-1px' } : {}),
        }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
      >
        <FileTypeIcon type={file.type} resourceType={file.resourceType} mediaSubtype={fileMediaSubtype(file)} size={18} />
        {isRenaming
          ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
          : <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0 }}>{file.name}</span>
              {commentCount > 0 && (
                <span title={`${commentCount} commentaire${commentCount > 1 ? 's' : ''}`} style={{ flexShrink: 0, minWidth: 18, height: 16, borderRadius: 10, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 700, display: 'inline-flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>
                  {commentCount}
                </span>
              )}
            </span>
        }
        <span style={{ fontSize: 11, color: rm ? rm.color : 'var(--text-3)', fontFamily: 'var(--ff-mono)', textTransform: 'uppercase' }}>
          {rm ? rm.label : file.ext}
        </span>
        {/* Colonne statut — cliquable pour les ressources */}
        {resource ? (
          <div style={{ position: 'relative' }}>
            <button onClick={e => { e.stopPropagation(); setStatusDropOpen(v => !v); }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 5, background: 'transparent', border: '1px solid transparent', borderRadius: 6, padding: '2px 6px', cursor: 'pointer', transition: 'border-color 0.12s' }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'transparent'; }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: STATUS_COLOR[resource.status] ?? 'var(--text-3)', flexShrink: 0 }} />
              <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{resource.statusLabel}</span>
              <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
            </button>
            {statusDropOpen && file.resourceId && (
              <StatusDropdown resourceId={file.resourceId} status={resource.status} statusLabel={resource.statusLabel} onClose={() => setStatusDropOpen(false)} />
            )}
          </div>
        ) : (
          <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>—</span>
        )}
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{isRes ? '—' : formatFileSize(file.size)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{file.updatedAt}</span>
      </div>
    );
  };

  // ── Root view cards / rows ────────────────────────────────────────────────────

  const VirtualRow = ({ id, label, icon, color, onClick, count, sublabel }: { id: string; label: string; icon: string; color: string; onClick: () => void; count?: number; sublabel?: string }) => {
    const isSelected = selectedVirtualId === id;
    return (
    <div
      onClick={e => {
        setSelectedVirtualId(id);
        setSelectedIds(new Set());
        if (e.detail >= 2) onClick();
      }}
      style={{ ...ROW, background: isSelected ? 'rgba(249,255,0,0.06)' : 'transparent', outline: isSelected ? '1px solid rgba(249,255,0,0.2)' : 'none', outlineOffset: '-1px', transition: 'background 0.1s' }}
      onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!isSelected) e.currentTarget.style.background = 'transparent'; }}
    >
      <div style={{ width: 28, height: 28, borderRadius: 6, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SFIcon name={icon} size={15} color={color} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{sublabel ?? 'Dossier'}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>—</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{count !== undefined ? `${count} dossier${count !== 1 ? 's' : ''}` : '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>—</span>
    </div>
  );};

  const VirtualCard = ({ id, label, icon, color, onClick, count }: { id: string; label: string; icon: string; color: string; onClick: () => void; count?: number }) => {
    const isSelected = selectedVirtualId === id;
    return (
      <div
        onClick={e => {
          setSelectedVirtualId(id);
          setSelectedIds(new Set());
          if (e.detail >= 2) onClick();
        }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
          border: isSelected ? `1.5px solid ${color}88` : '1.5px solid var(--border)',
          background: isSelected ? color + '18' : 'var(--surface-2)',
          transition: 'border-color 0.12s, background 0.12s',
        }}
        onMouseEnter={e => { if (!isSelected) { e.currentTarget.style.borderColor = color + '55'; e.currentTarget.style.background = color + '0d'; } }}
        onMouseLeave={e => { if (!isSelected) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; } }}
      >
        <SFIcon name={icon} size={32} color={color} />
        <div style={{ textAlign: 'center' }}>
          <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{label}</p>
          {count !== undefined && <p style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{count} dossier{count > 1 ? 's' : ''}</p>}
        </div>
      </div>
    );
  };

  // Project card with pin & menu buttons
  const ProjectCard = ({ project }: { project: Project }) => {
    const [showPin, setShowPin] = React.useState(false);
    const [showMenu, setShowMenu] = React.useState(false);
    const isPinned = pinnedIds.includes(project.id);
    return (
      <div style={{ position: 'relative' }}>
        <VirtualCard
          id={`project-${project.id}`}
          label={project.name}
          icon="folder"
          color={project.clientColor}
          onClick={() => setLocation({ scope: 'project', scopeId: project.id, folderId: null })}
          count={allFolders.filter(f => f.projectId === project.id && f.parentId === null).length}
        />
        <button
          onClick={(e) => { e.stopPropagation(); togglePin(project.id); }}
          style={{
            position: 'absolute', top: 8, right: 8,
            width: 24, height: 24, borderRadius: 6,
            background: isPinned ? 'var(--accent)' : 'rgba(0,0,0,0.3)',
            border: 'none', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', transition: 'background 0.1s',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = isPinned ? 'rgba(249,255,0,0.8)' : 'rgba(0,0,0,0.5)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = isPinned ? 'var(--accent)' : 'rgba(0,0,0,0.3)'; }}
        >
          <SFIcon name="star" size={12} color={isPinned ? 'var(--on-accent)' : 'var(--text-2)'} fill={isPinned ? 'currentColor' : 'none'} />
        </button>
        <button
          onClick={(e) => { e.stopPropagation(); setShowMenu(!showMenu); }}
          style={{
            position: 'absolute', top: 8, right: 36,
            width: 24, height: 24, borderRadius: 6,
            background: showMenu ? 'rgba(0,0,0,0.5)' : 'rgba(0,0,0,0.3)',
            border: 'none', cursor: 'pointer', display: 'flex',
            alignItems: 'center', justifyContent: 'center', transition: 'all 0.1s',
            opacity: showPin || showMenu ? 1 : 0,
            pointerEvents: showPin || showMenu ? 'auto' : 'none',
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.5)'; }}
          onMouseLeave={e => { if (!showMenu) e.currentTarget.style.background = 'rgba(0,0,0,0.3)'; }}
        >
          <SFIcon name="more-vertical" size={12} color="var(--text-2)" />
        </button>
        {showMenu && (
          <div style={{
            position: 'absolute', top: 32, right: 0,
            background: 'var(--surface-2)', border: '1px solid var(--border)',
            borderRadius: 8, padding: '4px 0', minWidth: 180,
            boxShadow: '0 4px 12px rgba(0,0,0,0.2)', zIndex: 100,
          }}>
            <button
              onClick={(e) => { e.stopPropagation(); setShowSaveTemplateModal(true); setTemplateProjectId(project.id); setShowMenu(false); }}
              style={{
                width: '100%', padding: '8px 12px', border: 'none', background: 'none',
                cursor: 'pointer', textAlign: 'left', fontSize: 13, color: 'var(--text)',
                display: 'flex', alignItems: 'center', gap: 8,
              }}
              onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-3)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <SFIcon name="save" size={14} color="var(--text-2)" />
              Sauvegarder comme modèle
            </button>
          </div>
        )}
        <div
          onMouseEnter={() => setShowPin(true)}
          onMouseLeave={() => { setShowPin(false); if (!showMenu) setShowMenu(false); }}
          style={{ position: 'absolute', inset: 0, borderRadius: 12, cursor: 'pointer' }}
        />
      </div>
    );
  };

  // ── Column view (Miller columns) ─────────────────────────────────────────────

  const getColumnItems = (loc: NavLocation): { folders: FileFolder[]; files: FileItem[]; projects?: Project[] } => {
    const { scope, scopeId, folderId } = loc;
    if (scope === 'root') {
      // Root column shows global folders (except Templates, Archives, Trash) and clients as virtual items
      const globalFolders = allFolders.filter(f => !f.projectId && !f.clientId && f.parentId === null && !['folder-templates', 'folder-archives', 'folder-trash'].includes(f.id));
      const rootFiles = allFiles.filter(f => !f.projectId && !f.clientId && f.parentFolderId === null);
      return { folders: globalFolders, files: rootFiles };
    }
    if (scope === 'client' && folderId === null) {
      // Client root — show projects belonging to this client
      const clientProjects = projects.filter(p => p.clientId === scopeId);
      return { folders: [], files: [], projects: clientProjects };
    }
    if (scope === 'global') {
      return {
        folders: allFolders.filter(f => !f.projectId && !f.clientId && f.parentId === folderId),
        files: allFiles.filter(f => !f.projectId && !f.clientId && f.parentFolderId === folderId),
      };
    }
    if (scope === 'project') {
      return {
        folders: allFolders.filter(f => f.projectId === scopeId && f.parentId === folderId),
        files: allFiles.filter(f => f.projectId === scopeId && f.parentFolderId === folderId),
      };
    }
    if (scope === 'client' && folderId !== null) {
      return {
        folders: allFolders.filter(f => f.clientId === scopeId && f.parentId === folderId),
        files: allFiles.filter(f => f.clientId === scopeId && f.parentFolderId === folderId),
      };
    }
    return { folders: [], files: [] };
  };

  const ColPanel = ({ loc, depth, selectedId, onSelect }: {
    loc: NavLocation; depth: number; selectedId?: string; onSelect: (childLoc: NavLocation) => void;
  }) => {
    const { folders, files, projects: columnProjects } = getColumnItems(loc);
    const [hoveredColProjectId, setHoveredColProjectId] = React.useState<string | null>(null);
    const [localSelectedFileId, setLocalSelectedFileId] = React.useState<string | null>(null);

    const folderColor = (f: FileFolder) => {
      if (f.projectId) return projectColor(f.projectId);
      if (f.clientId) return clientColor(f.clientId);
      return 'var(--accent)';
    };

    // Ordered list of all items in this column for shift-range select
    const colOrderedIds = [...folders.map(f => f.id), ...files.map(f => f.id)];

    const handleColClick = (e: React.MouseEvent, id: string, onNavigate?: () => void) => {
      if (e.shiftKey && lastSelectedId) {
        e.preventDefault();
        const a = colOrderedIds.indexOf(lastSelectedId);
        const b = colOrderedIds.indexOf(id);
        if (a !== -1 && b !== -1) {
          const [lo, hi] = a < b ? [a, b] : [b, a];
          setSelectedIds(new Set(colOrderedIds.slice(lo, hi + 1)));
        } else { setSelectedIds(new Set([id])); }
        setLastSelectedId(id);
        return;
      }
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        setSelectedIds(prev => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });
        setLastSelectedId(id);
        return;
      }
      // Simple clic: sélectionner; double-clic: naviguer
      setSelectedIds(new Set([id]));
      setLastSelectedId(id);
      if (e.detail >= 2) onNavigate?.();
    };

    const isColSel = (id: string) => selectedIds.has(id);

    const rowStyle = (id: string): React.CSSProperties => ({
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
      cursor: 'pointer', borderRadius: 7,
      background: selectedId === id ? 'var(--accent)' : isColSel(id) ? 'rgba(249,255,0,0.08)' : 'transparent',
      outline: isColSel(id) && selectedId !== id ? '1px solid rgba(249,255,0,0.3)' : 'none',
      outlineOffset: '-1px',
      transition: 'background 0.1s',
      position: 'relative',
    });

    const nameStyle = (id: string): React.CSSProperties => ({
      fontSize: 12, fontFamily: 'var(--ff-text)', flex: 1,
      overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      color: selectedId === id ? 'var(--on-accent)' : 'var(--text)',
    });

    return (
      <div style={{
        width: 220, flexShrink: 0, height: '100%', overflowY: 'auto',
        borderRight: '1px solid var(--border)', padding: '8px 6px',
        background: depth % 2 === 0 ? 'var(--surface)' : 'var(--bg)',
      }}>
        {/* Root: show Clients folder */}
        {loc.scope === 'root' && (
          <div
            style={rowStyle('clients-folder')}
            onMouseDown={noSelectOnModifier}
            onClick={e => handleColClick(e, 'clients-folder', () => onSelect({ scope: 'clients', folderId: null }))}
            onMouseEnter={e => { if (selectedId !== 'clients-folder' && !isColSel('clients-folder')) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (selectedId !== 'clients-folder' && !isColSel('clients-folder')) e.currentTarget.style.background = 'transparent'; }}
          >
            <SFIcon name="users" size={14} color={selectedId === 'clients-folder' ? 'var(--on-accent)' : 'var(--accent)'} />
            <span style={nameStyle('clients-folder')}>Clients</span>
            <SFIcon name="chevron-right" size={10} color={selectedId === 'clients-folder' ? 'var(--on-accent)' : 'var(--text-3)'} />
          </div>
        )}
        {/* Clients list: show all clients */}
        {loc.scope === 'clients' && loc.folderId === null && (
          <>{clients.map(c => {
            const id = 'client-' + c.id;
            return (
              <div key={id}
                style={rowStyle(id)}
                onMouseDown={noSelectOnModifier}
                onClick={e => handleColClick(e, id, () => onSelect({ scope: 'client', scopeId: c.id, folderId: null }))}
                onMouseEnter={e => { if (selectedId !== id && !isColSel(id)) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (selectedId !== id && !isColSel(id)) e.currentTarget.style.background = 'transparent'; }}
              >
                <SFIcon name="user" size={14} color={selectedId === id ? 'var(--on-accent)' : c.avatarColor} />
                <span style={nameStyle(id)}>{c.name}</span>
                <SFIcon name="chevron-right" size={10} color={selectedId === id ? 'var(--on-accent)' : 'var(--text-3)'} />
              </div>
            );
          })}</>
        )}
        {/* Client root: show projects of this client */}
        {loc.scope === 'client' && loc.folderId === null && columnProjects && columnProjects.length > 0 && (
          <>{columnProjects.map(p => {
            const id = 'proj-' + p.id;
            const isPinned = pinnedIds.includes(p.id);
            const isHovered = hoveredColProjectId === p.id;
            return (
              <div key={id}
                style={rowStyle(id)}
                onMouseDown={noSelectOnModifier}
                onClick={e => handleColClick(e, id, () => onSelect({ scope: 'project', scopeId: p.id, folderId: null }, id))}
                onMouseEnter={e => { setHoveredColProjectId(p.id); if (selectedId !== id && !isColSel(id)) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { setHoveredColProjectId(null); if (selectedId !== id && !isColSel(id)) e.currentTarget.style.background = 'transparent'; }}
              >
                <SFIcon name="folder" size={14} color={selectedId === id ? 'var(--on-accent)' : p.clientColor} />
                <span style={nameStyle(id)}>{p.name}</span>
                {isHovered && (
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(p.id); }}
                    style={{
                      width: 18, height: 18, borderRadius: 4, background: 'rgba(0,0,0,0.2)',
                      border: 'none', cursor: 'pointer', display: 'flex',
                      alignItems: 'center', justifyContent: 'center', flexShrink: 0,
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
                  >
                    <SFIcon name="star" size={10} color="var(--accent)" />
                  </button>
                )}
                <SFIcon name="chevron-right" size={10} color={selectedId === id ? 'var(--on-accent)' : 'var(--text-3)'} />
              </div>
            );
          })}</>
        )}
        {loc.scope === 'client' && loc.folderId === null && (!columnProjects || columnProjects.length === 0) && (
          <p style={{ padding: '12px 12px', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>Aucun projet</p>
        )}
        {/* Folders */}
        {folders.map(f => {
          const isDO = dragOverFolderId === f.id;
          return (
          <div key={f.id}
            draggable
            onDragStart={e => handleFolderDragStart(e, f.id)}
            onDragEnd={handleDragEnd}
            onDragOver={e => handleFolderDragOver(e, f.id)}
            onDragLeave={() => setDragOverFolderId(null)}
            onDrop={e => handleFolderDrop(e, f.id)}
            style={{ ...rowStyle(f.id), ...(isDO ? { background: 'rgba(249,255,0,0.12)', outline: '1px solid var(--accent)', outlineOffset: '-1px' } : {}) }}
            onMouseDown={noSelectOnModifier}
            onClick={e => handleColClick(e, f.id, () => onSelect(
              (!f.projectId && !f.clientId)
                ? { scope: 'global', folderId: f.id }
                : { ...loc, folderId: f.id },
              f.id,
            ))}
            onContextMenu={e => handleFolderCtx(e, f)}
            onMouseEnter={e => { if (selectedId !== f.id && !isColSel(f.id) && !isDO) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (selectedId !== f.id && !isColSel(f.id) && !isDO) e.currentTarget.style.background = 'transparent'; }}
          >
            <SFIcon name="folder" size={14} color={selectedId === f.id ? 'var(--on-accent)' : folderColor(f)} />
            {renamingId === f.id
              ? <RenameInput value={f.name} onSave={v => { renameFolder(f.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
              : <span style={nameStyle(f.id)}>{f.name}</span>}
            <SFIcon name="chevron-right" size={10} color={selectedId === f.id ? 'var(--on-accent)' : 'var(--text-3)'} />
          </div>
          );
        })}
        {/* Files — clic simple = sélection locale, double-clic = ouvre la ressource */}
        {files.map(f => {
          const isRes = f.type === 'resource' && !!f.resourceId;
          const rm = f.resourceType ? RESOURCE_TYPE_META[f.resourceType] : undefined;
          const meta = rm ?? TYPE_META[f.type] ?? TYPE_META.other;
          const isLocSel = isColSel(f.id) || localSelectedFileId === f.id;
          const localRowStyle: React.CSSProperties = {
            ...rowStyle(f.id),
            background: isLocSel ? 'rgba(249,255,0,0.08)' : 'transparent',
            outline: isLocSel ? '1px solid rgba(249,255,0,0.3)' : 'none',
            outlineOffset: '-1px',
            cursor: isRes ? 'pointer' : 'default',
          };
          return (
            <div key={f.id}
              draggable
              onDragStart={e => handleFileDragStart(e, f.id)}
              onDragEnd={handleDragEnd}
              style={localRowStyle}
              onMouseDown={noSelectOnModifier}
              onClick={e => {
                if (e.detail === 2 && !e.shiftKey && !e.ctrlKey && !e.metaKey && isRes) {
                  openResource(f);
                  return;
                }
                handleColClick(e, f.id);
              }}
              onContextMenu={e => handleFileCtx(e, f)}
              onMouseEnter={e => { if (!isLocSel) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!isLocSel) e.currentTarget.style.background = 'transparent'; }}
            >
              <FileTypeIcon type={f.type} resourceType={f.resourceType} mediaSubtype={fileMediaSubtype(f)} size={14} />
              {renamingId === f.id
                ? <RenameInput value={f.name} onSave={v => { renameFile(f.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
                : <span style={{ ...nameStyle(f.id), color: isLocSel ? 'var(--text)' : nameStyle(f.id).color }}>{f.name}</span>}
              {isRes && renamingId !== f.id && <span style={{ fontSize: 9, color: meta.color, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{rm?.label ?? 'RES'}</span>}
            </div>
          );
        })}
        {folders.length === 0 && files.length === 0 && loc.scope !== 'root' && (
          <p style={{ padding: '12px 12px', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>Dossier vide</p>
        )}
      </div>
    );
  };

  // ── Breadcrumb component ─────────────────────────────────────────────────────

  // Get current location - in columns view, use last columnSelection; otherwise use location
  const getCurrentLocation = (): NavLocation => {
    if (viewMode === 'columns' && columnSelections.length > 0) {
      return columnSelections[columnSelections.length - 1];
    }
    return location;
  };

  // Build breadcrumb based on current location
  const buildBreadcrumbForLocation = (loc: NavLocation): { label: string; onClick: () => void }[] => {
    // Locked scope: start at the scoped project/client root — no "Fichiers"/"Clients"
    // higher-level crumbs that would let the user escape the scope.
    if (lockedScope) {
      const crumbs: { label: string; onClick: () => void }[] = [];
      const seedColumns = (l: NavLocation) => {
        if (viewMode === 'columns') setColumnSelections([l]); else setLocation(l);
      };
      if (lockedScope.scope === 'project') {
        const p = projects.find(p => p.id === lockedScope.scopeId);
        const base: NavLocation = { scope: 'project', scopeId: lockedScope.scopeId, folderId: null };
        crumbs.push({ label: p?.name ?? 'Projet', onClick: () => seedColumns(base) });
      } else {
        const c = clients.find(c => c.id === lockedScope.scopeId);
        const base: NavLocation = { scope: 'client', scopeId: lockedScope.scopeId, folderId: null };
        crumbs.push({ label: c?.name ?? 'Client', onClick: () => seedColumns(base) });
      }
      if (loc.folderId) {
        const path = getFolderPath(loc.folderId);
        path.forEach((f, i) => {
          crumbs.push({
            label: f.name,
            onClick: () => {
              const newLocation = { ...loc, folderId: i === path.length - 1 ? f.id : (path[i].parentId ?? null) };
              if (viewMode === 'columns') {
                setColumnSelections([...columnSelections.slice(0, -1), newLocation]);
              } else {
                setLocation(newLocation);
              }
            },
          });
        });
      }
      return crumbs;
    }

    const crumbs: { label: string; onClick: () => void }[] = [
      { label: 'Fichiers', onClick: () => {
        if (viewMode === 'columns') {
          setColumnSelections([]);
        } else {
          setLocation({ scope: 'root', folderId: null });
        }
      }},
    ];

    if (loc.scope === 'project') {
      const p = projects.find(p => p.id === loc.scopeId);
      const c = p ? clients.find(c => c.id === p.clientId) : null;

      // Add "Clients" link
      crumbs.push({
        label: 'Clients',
        onClick: () => {
          if (viewMode === 'columns') {
            setColumnSelections([{ scope: 'clients', folderId: null }]);
          } else {
            setLocation({ scope: 'clients', folderId: null });
          }
        }
      });

      // Add client name
      if (c) {
        crumbs.push({
          label: c.name,
          onClick: () => {
            if (viewMode === 'columns') {
              setColumnSelections([{ scope: 'clients', folderId: null }, { scope: 'client', scopeId: c.id, folderId: null }]);
            } else {
              setLocation({ scope: 'client', scopeId: c.id, folderId: null });
            }
          }
        });
      }
      // Add project name
      if (p) {
        crumbs.push({
          label: p.name,
          onClick: () => {
            if (viewMode === 'columns') {
              setColumnSelections([{ scope: 'clients', folderId: null }, { scope: 'client', scopeId: c?.id, folderId: null }, { scope: 'project', scopeId: p.id, folderId: null }]);
            } else {
              setLocation({ scope: 'project', scopeId: p.id, folderId: null });
            }
          }
        });
      }
    } else if (loc.scope === 'client') {
      const c = clients.find(c => c.id === loc.scopeId);

      // Add "Clients" link
      crumbs.push({
        label: 'Clients',
        onClick: () => {
          if (viewMode === 'columns') {
            setColumnSelections([{ scope: 'clients', folderId: null }]);
          } else {
            setLocation({ scope: 'clients', folderId: null });
          }
        }
      });

      // Add client name
      if (c) {
        crumbs.push({
          label: c.name,
          onClick: () => {
            if (viewMode === 'columns') {
              setColumnSelections([{ scope: 'clients', folderId: null }, { scope: 'client', scopeId: c.id, folderId: null }]);
            } else {
              setLocation({ scope: 'client', scopeId: c.id, folderId: null });
            }
          }
        });
      }
    } else if (loc.scope === 'clients') {
      // Add "Clients" as current location
      crumbs.push({
        label: 'Clients',
        onClick: () => {
          if (viewMode === 'columns') {
            setColumnSelections([{ scope: 'clients', folderId: null }]);
          } else {
            setLocation({ scope: 'clients', folderId: null });
          }
        }
      });
    }

    if (loc.folderId) {
      const path = getFolderPath(loc.folderId);
      path.forEach((f, i) => {
        crumbs.push({
          label: f.name,
          onClick: () => {
            const newLocation = { ...loc, folderId: i === path.length - 1 ? f.id : (path[i].parentId ?? null) };
            if (viewMode === 'columns') {
              setColumnSelections([...columnSelections.slice(0, -1), newLocation]);
            } else {
              setLocation(newLocation);
            }
          },
        });
      });
    }
    return crumbs;
  };

  // Column view state: array of selected NavLocations at each depth
  const [columnSelections, setColumnSelections] = useState<NavLocation[]>([]);
  const colsContainerRef = useRef<HTMLDivElement>(null);

  // Now we can safely call getCurrentLocation and buildBreadcrumbForLocation
  const currentLocation = getCurrentLocation();
  const breadcrumb = buildBreadcrumbForLocation(currentLocation);

  const selectColumn = (depth: number, loc: NavLocation) => {
    setColumnSelections(prev => [...prev.slice(0, depth), loc]);
    setSelectedIds(new Set());
    setLastSelectedId(null);
  };

  // Auto-scroll columns container to the right whenever a new column appears
  useEffect(() => {
    if (viewMode === 'columns' && colsContainerRef.current) {
      const el = colsContainerRef.current;
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  }, [columnSelections.length, viewMode]);

  // When switching to columns view, seed from current location
  // When locked, the location that matches the locked scope root is already represented
  // by column 0 — seeding it again would duplicate the first column.
  const isLockedRoot = (loc: NavLocation) =>
    !!lockedScope && loc.scope === lockedScope.scope && loc.scopeId === lockedScope.scopeId && !loc.folderId;

  const handleSetViewMode = (m: ViewMode) => {
    if (m === 'columns' && viewMode !== 'columns') {
      if (location.scope !== 'root' && !isLockedRoot(location)) {
        setColumnSelections([location]);
      } else {
        setColumnSelections([]);
      }
    }
    setViewMode(m);
  };

  // Navigation depuis l'arbre gauche : met aussi à jour les colonnes en vue colonnes
  const handleTreeNavigate = (loc: NavLocation) => {
    setLocation(loc);
    if (viewMode === 'columns') {
      setColumnSelections(loc.scope === 'root' || isLockedRoot(loc) ? [] : [loc]);
    }
  };

  // Seul le niveau "liste des clients" est virtuel (on n'y ajoute pas un client).
  // Les roots de projet/client sont de vrais espaces de travail → ajout possible en vue globale ET verrouillée (parité).
  const isAtVirtualRoot = location.scope === 'clients';
  const canAdd = !isAtVirtualRoot && !isSpecialView;
  // Un fichier a besoin d'un emplacement concret : pas à la racine globale (sauf en mode verrouillé où la racine = le projet/client).
  const canAddFile = canAdd && (location.scope !== 'root' || !!lockedScope);

  // Convert folder structure to FolderNode[]
  const folderStructureToNodes = (projectId: string): FolderNode[] => {
    const rootFolders = getRootFoldersForProject(projectId);
    const buildNode = (folderId: string): FolderNode => {
      const folder = allFolders.find(f => f.id === folderId);
      if (!folder) return { id: folderId, name: 'Unknown' };
      const children = getChildFolders(folderId, projectId);
      return {
        id: folder.id,
        name: folder.name,
        children: children.length > 0 ? children.map(c => buildNode(c.id)) : undefined,
      };
    };
    return rootFolders.map(f => buildNode(f.id));
  };

  // Save folder structure as template
  const handleSaveTemplate = (projectId: string, templateName: string) => {
    const project = projects.find(p => p.id === projectId);
    if (!project) return;

    const structure = folderStructureToNodes(projectId);
    const newTemplate: ResourceTemplate = {
      id: `res-file-template-${Date.now()}`,
      type: 'file',
      name: templateName,
      description: `Modèle de structure de dossiers du projet "${project.name}"`,
      color: project.clientColor ?? '#888',
      icon: 'folder',
      tags: ['Structure de dossiers', project.name],
      createdAt: new Date().toISOString().slice(0, 10),
      folderStructure: structure,
    };

    const custom = loadCustomResourceTemplates();
    custom.push(newTemplate);
    saveCustomResourceTemplates(custom);

    setShowSaveTemplateModal(false);
    setTemplateName('');
    setTemplateProjectId(null);
    // You could show a toast notification here
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Top bar */}
      <div style={{ flexShrink: 0, padding: '0 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, height: 52 }}>
        {/* Toggle sidebar collapse */}
        <button
          onClick={() => setSidebarCollapsed(v => !v)}
          title={sidebarCollapsed ? 'Afficher la barre latérale' : 'Masquer la barre latérale'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 8px',
            borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}
          onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
        >
          <SFIcon name={sidebarCollapsed ? 'panel-left-open' : 'panel-left-close'} size={16} color="var(--text-2)" />
        </button>

        {/* Remonter d'un niveau (parent du fil d'Ariane) */}
        {(() => {
          const parent = breadcrumb.length > 1 ? breadcrumb[breadcrumb.length - 2] : null;
          return (
            <button
              onClick={() => parent?.onClick()}
              disabled={!parent}
              title="Remonter d'un niveau"
              style={{
                background: 'none', border: 'none', cursor: parent ? 'pointer' : 'default', padding: '4px 8px',
                borderRadius: 6, display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, opacity: parent ? 1 : 0.35,
              }}
              onMouseEnter={e => { if (parent) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'none'; }}
            >
              <SFIcon name="arrow-left" size={16} color="var(--text-2)" />
            </button>
          );
        })()}

        {/* Breadcrumb */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0, overflowX: 'auto', paddingRight: 8 }}>
          {breadcrumb.map((crumb, i) => (
            <React.Fragment key={i}>
              {i > 0 && <SFIcon name="chevron-right" size={12} color="var(--text-3)" style={{ flexShrink: 0 }} />}
              <button
                onClick={crumb.onClick}
                style={{
                  background: 'none', border: 'none', cursor: i < breadcrumb.length - 1 ? 'pointer' : 'default',
                  fontSize: 13, fontWeight: i === breadcrumb.length - 1 ? 700 : 400,
                  color: i === breadcrumb.length - 1 ? 'var(--text)' : 'var(--text-3)',
                  fontFamily: 'var(--ff-text)', padding: '0 4px', borderRadius: 4,
                  flexShrink: 0, whiteSpace: 'nowrap',
                }}
                onMouseEnter={e => { if (i < breadcrumb.length - 1) e.currentTarget.style.color = 'var(--text)'; }}
                onMouseLeave={e => { if (i < breadcrumb.length - 1) e.currentTarget.style.color = 'var(--text-3)'; }}
                title={crumb.label}
              >
                {crumb.label}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Bouton corbeille (sélection active) */}
        {selectedIds.size > 0 && (
          <button
            onClick={trashSelected}
            title={`Mettre ${selectedIds.size} élément${selectedIds.size > 1 ? 's' : ''} à la corbeille`}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', flexShrink: 0 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'rgba(239,68,68,0.1)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
          >
            <SFIcon name="trash-2" size={14} color="var(--danger)" />
            {selectedIds.size > 1 && (
              <span style={{ position: 'absolute', top: -5, right: -5, minWidth: 16, height: 16, borderRadius: 8, background: 'var(--danger)', color: '#fff', fontSize: 9, fontFamily: 'var(--ff-mono)', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 3px' }}>
                {selectedIds.size}
              </span>
            )}
          </button>
        )}

        {/* Search */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '5px 12px' }}>
          <SFIcon name="search" size={13} color="var(--text-3)" />
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Rechercher…"
            style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--ff-text)', width: 140 }}
          />
        </div>

        {/* Sort */}
        {(() => {
          const SORT_OPTS: { value: SortBy; label: string; icon: string }[] = [
            { value: 'name', label: 'Nom',    icon: 'arrow-down-a-z' },
            { value: 'date', label: 'Date',   icon: 'calendar'     },
            { value: 'size', label: 'Taille', icon: 'chart-bar'    },
            { value: 'type', label: 'Type',   icon: 'shapes'       },
          ];
          const current = SORT_OPTS.find(o => o.value === sortBy) ?? SORT_OPTS[0];
          return (
            <div style={{ position: 'relative' }}>
              <button
                onClick={() => setSortOpen(o => !o)}
                style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 9, padding: '6px 11px', fontSize: 12, color: 'var(--text-2)', fontFamily: 'var(--ff-text)', cursor: 'pointer', minWidth: 96 }}
              >
                <SFIcon name={current.icon} size={13} color="var(--text-3)" />
                <span style={{ flex: 1, textAlign: 'left' }}>{current.label}</span>
                <SFIcon name="chevron-down" size={12} color="var(--text-3)" />
              </button>
              {sortOpen && (
                <>
                  <div onClick={() => setSortOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 100 }} />
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 101, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, minWidth: 150, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                    {SORT_OPTS.map(opt => (
                      <button
                        key={opt.value}
                        onClick={() => { setSortBy(opt.value); setSortOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: sortBy === opt.value ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', textAlign: 'left', fontSize: 12, color: sortBy === opt.value ? 'var(--text)' : 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
                      >
                        <SFIcon name={opt.icon} size={13} color={sortBy === opt.value ? 'var(--accent)' : 'var(--text-3)'} />
                        {opt.label}
                        {sortBy === opt.value && <SFIcon name="check" size={11} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
            </div>
          );
        })()}

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
          {([['grid', 'layout-grid'], ['list', 'list'], ['columns', 'columns-3'], ['stockage', 'chart-bar']] as [ViewMode, string][]).map(([m, icon]) => (
            <button key={m} onClick={() => handleSetViewMode(m)} style={{
              background: viewMode === m ? 'var(--surface-3)' : 'none',
              border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}>
              <SFIcon name={icon} size={13} color={viewMode === m ? 'var(--accent)' : 'var(--text-2)'} />
            </button>
          ))}
        </div>

        {/* Empty trash button — only in Corbeille view with content */}
        {isTrashView && (filteredFolders.length > 0 || filteredFiles.length > 0) && (
          <button
            onClick={() => { if (confirm('Vider la corbeille ? Tous les éléments seront définitivement supprimés. Cette action est irréversible.')) emptyTrash(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '7px 14px', borderRadius: 9,
              background: 'transparent', color: 'var(--danger)',
              border: '1px solid var(--danger)', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(232,91,91,0.12)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
          >
            <SFIcon name="trash-2" size={14} color="var(--danger)" />
            Vider la corbeille
          </button>
        )}

        {/* New button — hidden at project/client virtual root */}
        {canAdd && (
          <div style={{ position: 'relative' }}>
            <button
              ref={newBtnRef}
              onClick={() => setNewBtnOpen(o => !o)}
              style={{
                display: 'flex', alignItems: 'center', gap: 7,
                padding: '7px 14px', borderRadius: 9,
                background: 'var(--accent)', color: 'var(--on-accent)',
                border: 'none', cursor: 'pointer', fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)',
              }}
            >
              <SFIcon name="plus" size={14} color="var(--on-accent)" />
              Nouveau
              <SFIcon name="chevron-down" size={11} color="var(--on-accent)" />
            </button>
            {newBtnOpen && (
              <>
                <div onClick={() => setNewBtnOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 390 }} />
                <div style={{ position: 'absolute', top: '110%', right: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.4)', zIndex: 400, minWidth: 210, padding: '4px 0', overflow: 'hidden' }}>
                  {newMenuItems().map((item, i) => item.separator
                    ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    : item.header
                    ? <p key={i} style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 14px 3px', fontWeight: 700 }}>{item.label}</p>
                    : (
                      <button key={i} onClick={() => { item.action(); setNewBtnOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)', textAlign: 'left' }}
                        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                        onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                        <SFIcon name={item.icon} size={14} color={item.color ?? 'var(--text-2)'} />
                        {item.label}
                      </button>
                    )
                  )}
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left tree */}
        <div style={{ width: sidebarCollapsed ? 0 : treeWidth, flexShrink: 0, borderRight: sidebarCollapsed ? 'none' : '1px solid var(--border)', overflowY: 'auto', overflowX: 'hidden', background: 'var(--surface)', transition: 'width 0.2s', display: sidebarCollapsed ? 'none' : 'block' }}>
          <FileTree location={location} onNavigate={handleTreeNavigate} collapsed={sidebarCollapsed} lockedScope={lockedScope} />
        </div>

        {/* ── Stockage view ── */}
        {viewMode === 'stockage' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onContextMenu={handleBgCtx}>
          <StorageView
            folders={isTrashView ? scopeFilterFolders(getTrashedFolders()) : isArchivesView ? scopeFilterFolders(getArchivedFolders()) : scopeFilterFolders(allFolders)}
            files={isTrashView ? scopeFilterFiles(getTrashedFiles()) : isArchivesView ? scopeFilterFiles(getArchivedFiles()) : scopeFilterFiles(allFiles)}
            context={isTrashView ? 'trashed' : isArchivesView ? 'archived' : 'active'}
            projects={projects}
            clients={clients}
            location={location}
            onNavigate={setLocation}
          />
          </div>
        )}

        {/* ── Column view (Miller columns) ── */}
        {viewMode === 'columns' && (
          <div ref={colsContainerRef} onContextMenu={handleBgCtx} style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', height: '100%' }}>
            {/* Column 0: root (or the locked scope when scoped) */}
            <ColPanel
              loc={lockedScope ?? { scope: 'root', folderId: null }}
              depth={0}
              selectedId={columnSelections[0]
                ? (columnSelections[0].scope === 'clients' ? 'clients-folder' : columnSelections[0].scope === 'project' ? 'proj-' + columnSelections[0].scopeId : columnSelections[0].scope === 'client' ? 'client-' + columnSelections[0].scopeId : columnSelections[0].folderId ?? undefined)
                : undefined}
              onSelect={(childLoc) => selectColumn(0, childLoc)}
            />
            {/* Subsequent columns */}
            {columnSelections.map((sel, i) => (
              <ColPanel
                key={i}
                loc={sel}
                depth={i + 1}
                selectedId={columnSelections[i + 1]
                  ? (columnSelections[i + 1].scope === 'project' ? 'proj-' + columnSelections[i + 1].scopeId : columnSelections[i + 1].scope === 'client' ? 'client-' + columnSelections[i + 1].scopeId : columnSelections[i + 1].folderId ?? undefined)
                  : undefined}
                onSelect={(childLoc) => selectColumn(i + 1, childLoc)}
              />
            ))}
          </div>
        )}

        {/* Main content (grid / list) */}
        <div
          onContextMenu={handleBgCtx}
          onClick={e => { if (e.target === e.currentTarget) { setSelectedIds(new Set()); setLastSelectedId(null); } }}
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDraggingOver(true); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDraggingOver(false); }}
          onDrop={e => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.types.includes('Files')) processUploadedFiles(Array.from(e.dataTransfer.files)); }}
          style={{ flex: 1, overflowY: 'auto', padding: 24, display: (viewMode === 'columns' || viewMode === 'stockage') ? 'none' : undefined, position: 'relative' }}
        >
          {/* Drop overlay */}
          {isDraggingOver && (
            <div style={{ position: 'absolute', inset: 0, zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(249,255,0,0.04)', border: '2px dashed var(--accent)', borderRadius: 12, pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <SFIcon name="upload" size={32} color="var(--accent)" />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginTop: 8 }}>Déposer pour importer</p>
              </div>
            </div>
          )}

          {/* ── Root view ── */}
          {location.scope === 'root' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
              {viewMode === 'list' && (
                <div>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Naviguer</p>
                  {/* List header */}
                  <div style={{ ...ROW, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <div />
                    <span>Nom</span><span>Type</span><span>Contenu</span><span>Modifié</span>
                  </div>
                  {/* Global folders — vrais dossiers : FolderRow donne clic droit (renommer / corbeille) + double-clic pour naviguer */}
                  {allFolders.filter(f => !f.projectId && !f.clientId && f.parentId === null && !['folder-templates', 'folder-archives', 'folder-trash'].includes(f.id)).map(f => (
                    <FolderRow key={f.id} folder={f} />
                  ))}
                  {/* Clients row */}
                  <VirtualRow key="clients-folder" id="vrow-clients" label="Clients" icon="users" color="var(--accent)"
                    onClick={() => setLocation({ scope: 'clients', folderId: null })}
                    count={clients.length} sublabel="Dossier" />
                  {/* Fichiers/ressources créés directement à la racine (sans projet ni client) */}
                  {allFiles.filter(f => !f.projectId && !f.clientId && f.parentFolderId === null).map(f => (
                    <FileRow key={f.id} file={f} />
                  ))}
                </div>
              )}

              {viewMode === 'grid' && (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                  {/* Global folders (except Templates, Archives, Trash) */}
                  {allFolders.filter(f => !f.projectId && !f.clientId && f.parentId === null && !['folder-templates', 'folder-archives', 'folder-trash'].includes(f.id)).map(f => (
                    <FolderCard key={f.id} folder={f} />
                  ))}

                  {/* Clients folder */}
                  <VirtualCard
                    key="clients-folder"
                    id="vcard-clients"
                    label="Clients"
                    icon="users"
                    color="var(--accent)"
                    onClick={() => setLocation({ scope: 'clients', folderId: null })}
                    count={clients.length}
                  />
                  {/* Fichiers/ressources créés directement à la racine (sans projet ni client) */}
                  {allFiles.filter(f => !f.projectId && !f.clientId && f.parentFolderId === null).map(f => (
                    <FileCard key={f.id} file={f} />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Clients list view ── */}
          {location.scope === 'clients' && location.folderId === null && (
            <div>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Liste des clients</p>
              {viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                  {clients.map(c => (
                    <VirtualCard
                      key={c.id}
                      id={`client-${c.id}`}
                      label={c.name}
                      icon="user"
                      color={c.avatarColor}
                      onClick={() => setLocation({ scope: 'client', scopeId: c.id, folderId: null })}
                      count={projects.filter(p => p.clientId === c.id).length}
                    />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ ...ROW, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <div />
                    <span>Nom</span><span>Type</span><span>Projets</span><span>Modifié</span>
                  </div>
                  {clients.map(c => (
                    <VirtualRow key={c.id} id={`client-${c.id}`} label={c.name} icon="user" color={c.avatarColor}
                      onClick={() => setLocation({ scope: 'client', scopeId: c.id, folderId: null })}
                      count={projects.filter(p => p.clientId === c.id).length} sublabel="Client" />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* ── Client projects view ── */}
          {location.scope === 'client' && location.folderId === null && (
            <div>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 14 }}>Projets du client</p>
              {viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                  {projects.filter(p => p.clientId === location.scopeId).map(p => (
                    <ProjectCard key={p.id} project={p} />
                  ))}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  <div style={{ ...ROW, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <div />
                    <span>Nom</span><span>Type</span><span>Contenu</span><span>Modifié</span>
                  </div>
                  {projects.filter(p => p.clientId === location.scopeId).map(p => {
                    const isPinned = pinnedIds.includes(p.id);
                    return (
                      <div key={p.id}
                        style={{ ...ROW, position: 'relative', background: selectedVirtualId === `project-${p.id}` ? 'rgba(249,255,0,0.06)' : 'transparent', outline: selectedVirtualId === `project-${p.id}` ? '1px solid rgba(249,255,0,0.2)' : 'none', outlineOffset: '-1px', transition: 'background 0.1s' } as any}
                        onClick={e => { setSelectedVirtualId(`project-${p.id}`); setSelectedIds(new Set()); if (e.detail >= 2) setLocation({ scope: 'project', scopeId: p.id, folderId: null }); }}
                        onMouseEnter={e => { if (selectedVirtualId !== `project-${p.id}`) e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onMouseLeave={e => { if (selectedVirtualId !== `project-${p.id}`) e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <SFIcon name="folder" size={14} color={p.clientColor} />
                        </div>
                        <span style={{ flex: 1, fontSize: 13 }}>{p.name}</span>
                        <span style={{ color: 'var(--text-3)', fontSize: 11 }}>Projet</span>
                        <span style={{ color: 'var(--text-3)', fontSize: 11, minWidth: 60 }}>{allFolders.filter(f => f.projectId === p.id && f.parentId === null).length}</span>
                        <span style={{ color: 'var(--text-3)', fontSize: 11, minWidth: 80 }}>—</span>
                        <button
                          onClick={(e) => { e.stopPropagation(); togglePin(p.id); }}
                          style={{
                            width: 24, height: 24, borderRadius: 4, background: 'rgba(0,0,0,0.2)',
                            border: 'none', cursor: 'pointer', display: 'flex',
                            alignItems: 'center', justifyContent: 'center',
                          }}
                          onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
                        >
                          <SFIcon name="star" size={12} color={isPinned ? 'var(--accent)' : 'var(--text-3)'} fill={isPinned ? 'currentColor' : 'none'} />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* ── Folder contents ── */}
          {location.scope !== 'root' && !(location.scope === 'client' && location.folderId === null) && !(location.scope === 'clients' && location.folderId === null) && (
            <>
              {/* Header for special views (Corbeille / Archives) */}
              {isSpecialView && (
                <div style={{ marginBottom: 18 }}>
                  <h2 style={{ fontSize: 16, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                    <SFIcon name={isTrashView ? 'trash-2' : 'archive'} size={16} color="var(--text-2)" />
                    {isTrashView ? 'Corbeille' : 'Archives'}
                  </h2>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>
                    {isTrashView
                      ? 'Les éléments supprimés sont conservés ici. Clic droit sur un élément pour le restaurer ou le supprimer définitivement.'
                      : 'Les éléments archivés sont conservés ici, hors de la vue principale. Clic droit sur un élément pour le désarchiver.'}
                  </p>
                </div>
              )}

              {/* Type filter pills — masqué dans les vues spéciales */}
              {!isSpecialView && (
                <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
                  {(['all', 'pdf', 'image', 'video', 'audio', 'doc', 'zip', 'other'] as const).map(t => (
                    <button key={t} onClick={() => setFilterType(t)} style={{
                      padding: '4px 12px', borderRadius: 999, fontSize: 11,
                      border: `1.5px solid ${filterType === t ? 'var(--accent)' : 'var(--border)'}`,
                      background: filterType === t ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                      color: filterType === t ? 'var(--text)' : 'var(--text-3)',
                      cursor: 'pointer', fontFamily: 'var(--ff-mono)',
                    }}>
                      {t === 'all' ? 'Tout' : TYPE_META[t]?.label ?? t}
                    </button>
                  ))}
                </div>
              )}

              {filteredFolders.length === 0 && filteredFiles.length === 0 ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: '60px 0', color: 'var(--text-3)' }}>
                  <SFIcon name={isTrashView ? 'trash-2' : isArchivesView ? 'archive' : 'folder-open'} size={40} color="var(--text-3)" />
                  <p style={{ fontSize: 14 }}>
                    {isTrashView ? 'La corbeille est vide' : isArchivesView ? 'Aucun élément archivé' : 'Ce dossier est vide'}
                  </p>
                  {!isSpecialView && <SFButton variant="ghost" icon="folder-plus" onClick={() => setShowNewFolder(true)}>Nouveau dossier</SFButton>}
                </div>
              ) : viewMode === 'grid' ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {filteredFolders.length > 0 && (
                    <div>
                      {filteredFiles.length > 0 && <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Dossiers</p>}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                        {filteredFolders.map(f => <FolderCard key={f.id} folder={f} />)}
                      </div>
                    </div>
                  )}
                  {filteredFiles.length > 0 && (
                    <div>
                      {filteredFolders.length > 0 && <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 12 }}>Fichiers</p>}
                      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                        {filteredFiles.map(f => <FileCard key={f.id} file={f} />)}
                      </div>
                    </div>
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {/* List header */}
                  <div style={{ ...ROW, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.07em', paddingBottom: 8, borderBottom: '1px solid var(--border)', marginBottom: 4 }}>
                    <div />
                    <span>Nom</span><span>Type</span><span>Statut</span><span>Taille</span><span>Modifié</span>
                  </div>
                  {filteredFolders.map(f => <FolderRow key={f.id} folder={f} />)}
                  {filteredFiles.map(f => <FileRow key={f.id} file={f} />)}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Modals */}
      {showNewFolder && <NewFolderModal onSave={handleNewFolder} onClose={() => setShowNewFolder(false)} />}
      {showAddFile   && <AddFileModal   onSave={handleAddFile}   onClose={() => setShowAddFile(false)} />}
      {showRevisionPicker && (
        <RevisionPickerModal
          onSelect={sel => { setPendingRevision(sel); setShowRevisionPicker(false); setNewResourceDef(RESOURCE_TYPES.find(d => d.type === 'video_review')!); }}
          onClose={() => setShowRevisionPicker(false)}
        />
      )}
      {newResourceDef && (
        <NewResourceModal
          def={newResourceDef}
          isWebReview={pendingRevision?.resourceType === 'web_review'}
          onSave={(name, webUrl) => handleCreateResource(newResourceDef, name, webUrl)}
          onClose={() => { setNewResourceDef(null); setPendingRevision(null); }}
        />
      )}
      {showSaveTemplateModal && templateProjectId && (
        <SaveTemplateModal
          projectName={projects.find(p => p.id === templateProjectId)?.name ?? 'Projet'}
          templateName={templateName}
          onNameChange={setTemplateName}
          onSave={() => handleSaveTemplate(templateProjectId, templateName)}
          onClose={() => { setShowSaveTemplateModal(false); setTemplateName(''); setTemplateProjectId(null); }}
        />
      )}

      {/* Context menu */}
      {ctx && <ContextMenu pos={ctx.pos} items={ctx.items} onClose={() => setCtx(null)} />}

      {/* Move-to modal */}
      {moveModal && (
        <MoveToModal
          fileIds={moveModal.fileIds}
          folderIds={moveModal.folderIds}
          allFolders={allFolders}
          projectId={moveModal.projectId}
          clientId={moveModal.clientId}
          onMove={(targetFolderId) => {
            moveModal.fileIds.forEach(id => moveFile(id, targetFolderId));
            moveModal.folderIds.forEach(id => moveFolder(id, targetFolderId));
            setMoveModal(null);
            setSelectedIds(new Set());
          }}
          onClose={() => setMoveModal(null)}
        />
      )}

      {/* File info modal */}
      {infoFile && (() => {
        const f = infoFile;
        const isRes = f.type === 'resource' && !!f.resourceId;
        const rm2 = f.resourceType ? RESOURCE_TYPE_META[f.resourceType] : undefined;
        const resource = isRes ? allResources.find(r => r.id === f.resourceId) : undefined;
        const cc = isRes && f.resourceId ? (commentCounts[f.resourceId] ?? 0) : 0;
        const rows: { label: string; value: string; color?: string }[] = [
          { label: 'Type', value: rm2 ? rm2.label : (f.ext?.toUpperCase() || 'Fichier'), color: rm2?.color },
          ...(resource ? [{ label: 'Statut', value: resource.statusLabel, color: STATUS_COLOR[resource.status] ?? undefined }] : []),
          ...(!isRes && f.size ? [{ label: 'Taille', value: formatFileSize(f.size) }] : []),
          ...(cc > 0 ? [{ label: 'Commentaires', value: String(cc), color: 'var(--accent)' }] : []),
          { label: 'Modifié', value: f.updatedAt || '—' },
          { label: 'Ajouté', value: f.createdAt || '—' },
        ];
        return (
          <div onClick={() => setInfoFile(null)} style={{ position: 'fixed', inset: 0, zIndex: 200, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '24px 28px', minWidth: 320, maxWidth: 400, boxShadow: '0 24px 64px rgba(0,0,0,0.7)' }}>
              {/* Header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20 }}>
                <FileTypeIcon type={f.type} resourceType={f.resourceType} mediaSubtype={fileMediaSubtype(f)} size={36} />
                <div style={{ minWidth: 0, flex: 1 }}>
                  <p style={{ fontSize: 14, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</p>
                  {rm2 && <p style={{ fontSize: 10, color: rm2.color, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 2 }}>{rm2.label}</p>}
                </div>
                <button onClick={() => setInfoFile(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, borderRadius: 6, flexShrink: 0 }}>
                  <SFIcon name="x" size={14} />
                </button>
              </div>
              {/* Info rows */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 0, borderRadius: 10, border: '1px solid var(--border)' }}>
                {rows.map((row, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 14px', background: i % 2 === 0 ? 'var(--surface-2)' : 'transparent', borderBottom: i < rows.length - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{row.label}</span>
                    {row.label === 'Statut' && resource && f.resourceId ? (
                      <InlineStatusPicker resourceId={f.resourceId} status={resource.status} statusLabel={resource.statusLabel} />
                    ) : (
                      <span style={{ fontSize: 11, color: row.color ?? 'var(--text-2)', fontFamily: row.label === 'Taille' || row.label === 'Commentaires' ? 'var(--ff-mono)' : 'var(--ff-text)', fontWeight: row.color ? 500 : 400 }}>
                        {row.value}
                      </span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        );
      })()}

      {/* File preview modal */}
      {previewFile && <FilePreviewModal file={previewFile} files={filteredFiles} onNavigate={setPreviewFile} onClose={() => setPreviewFile(null)} />}

      {/* Hidden file input for OS file picker */}
      <input
        ref={fileInputRef}
        type="file"
        multiple
        style={{ display: 'none' }}
        onChange={e => { processUploadedFiles(Array.from(e.target.files ?? [])); e.target.value = ''; }}
      />
    </div>
  );
}

export function FichiersGlobal() {
  return <FileBrowser />;
}

// ── Save template modal ────────────────────────────────────────────────────────

function SaveTemplateModal({ projectName, templateName, onNameChange, onSave, onClose }: {
  projectName: string;
  templateName: string;
  onNameChange: (name: string) => void;
  onSave: () => void;
  onClose: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);

  const isValid = templateName.trim().length > 0;

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 8 }}>Sauvegarder comme modèle</h3>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>Enregistrez la structure de dossiers du projet <strong>{projectName}</strong> comme modèle réutilisable.</p>

        <label style={{ display: 'block', fontSize: 12, fontWeight: 600, color: 'var(--text-2)', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6, fontFamily: 'var(--ff-mono)' }}>Nom du modèle</label>
        <input
          ref={ref}
          value={templateName}
          onChange={e => onNameChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && isValid) { onSave(); } if (e.key === 'Escape') onClose(); }}
          placeholder="ex. Structure vidéo production"
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 9,
            border: '1.5px solid var(--border)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 14, outline: 'none',
            fontFamily: 'var(--ff-text)', boxSizing: 'border-box', marginBottom: 20,
          }}
        />

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" onClick={onSave} disabled={!isValid}>Sauvegarder</SFButton>
        </div>
      </div>
    </div>
  );
}
