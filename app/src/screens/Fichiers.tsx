import React, { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFIcon, SFButton } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import {
  getFolders, getFiles, addFolder, deleteFolder, renameFolder,
  addFile, deleteFile, renameFile, subscribeFileStore,
  trashFolder, trashFile, archiveFolder, archiveFile,
  restoreFolder, restoreFile,
  getTrashedFolders, getTrashedFiles, getArchivedFolders, getArchivedFiles,
  formatFileSize, emptyTrash, moveFile, moveFileFull,
  type FileFolder, type FileItem, type FileItemType,
} from '../data/fileStore';
import { addResource } from '../data/resourceStore';
import { findProject, getProjects } from '../data/projectStore';
import { usePersistedState } from '../hooks/usePersistedState';
import type { ResourceType } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode   = 'grid' | 'list' | 'columns';
type SpecialView = null | 'archives' | 'trash';

// ── Resource types available for creation ──────────────────────────────────────

const RESOURCE_TYPES: { type: ResourceType; label: string; icon: string; color: string }[] = [
  { type: 'screenplay',   label: 'Scénario',     icon: 'file-text',   color: '#e85b5b' },
  { type: 'moodboard',    label: 'Moodboard',    icon: 'image',       color: '#5b8af5' },
  { type: 'video_review', label: 'Révision',     icon: 'film',        color: '#a05be8' },
  { type: 'document',     label: 'Document',     icon: 'file',        color: '#5bc4e8' },
  { type: 'checklist',    label: 'Checklist',    icon: 'list-checks', color: '#34c98a' },
  { type: 'form',         label: 'Formulaire',   icon: 'clipboard',   color: '#f5d05b' },
  { type: 'inspirations', label: 'Inspirations', icon: 'sparkles',    color: '#c45be8' },
];

interface RevisionSelection {
  resourceType: ResourceType;
  mediaSubtype?: 'video' | 'photo' | 'file' | 'audio';
  subtypeLabel: string;
  eyebrow: string;
}

const REVISION_SUBTYPES: { resourceType: ResourceType; mediaSubtype?: 'video' | 'photo' | 'file' | 'audio'; label: string; icon: string; color: string; desc: string }[] = [
  { resourceType: 'video_review', mediaSubtype: 'video', label: 'Vidéo',    icon: 'video',     color: '#a05be8', desc: 'Commentaires horodatés sur une vidéo' },
  { resourceType: 'video_review', mediaSubtype: 'photo', label: 'Photo',    icon: 'image',     color: '#5b8af5', desc: 'Annotations sur une image ou un visuel' },
  { resourceType: 'video_review', mediaSubtype: 'audio', label: 'Audio',    icon: 'music',     color: '#4ec994', desc: 'Révision d\'un fichier audio avec commentaires horodatés' },
  { resourceType: 'video_review', mediaSubtype: 'file',  label: 'Document', icon: 'file-text', color: '#5bc4e8', desc: 'Révision d\'un document ou d\'un fichier' },
  { resourceType: 'web_review',                          label: 'Site web', icon: 'globe',     color: '#f5975b', desc: 'Annotations sur un site web ou une page en ligne' },
];

const RESOURCE_EYEBROW: Partial<Record<ResourceType, string>> = {
  screenplay: 'SCÉNARIO', moodboard: 'MOODBOARD', video_review: 'RÉVISION',
  document: 'DOCUMENT', checklist: 'CHECKLIST', web_review: 'WEB REVIEW',
  form: 'FORMULAIRE', inspirations: 'INSPIRATIONS',
};

// ── File type icons ────────────────────────────────────────────────────────────

const TYPE_META: Record<FileItemType | 'folder', { icon: string; color: string }> = {
  folder:      { icon: 'folder',    color: '#f5c842' },
  pdf:         { icon: 'file-text', color: '#e85b5b' },
  image:       { icon: 'image',     color: '#5b8af5' },
  video:       { icon: 'video',     color: '#a05be8' },
  audio:       { icon: 'music',     color: '#34c98a' },
  zip:         { icon: 'archive',   color: '#f5975b' },
  doc:         { icon: 'file-text', color: '#5bc4e8' },
  spreadsheet: { icon: 'table',     color: '#34c98a' },
  resource:    { icon: 'layers',    color: '#c45be8' },
  other:       { icon: 'file',      color: '#888'    },
};

const RESOURCE_TYPE_META: Record<string, { icon: string; color: string; label: string }> = {
  screenplay:   { icon: 'clapperboard',  color: '#f59e0b', label: 'Scénario'     },
  video_review: { icon: 'film',          color: '#8b5cf6', label: 'Révision'     },
  web_review:   { icon: 'globe',         color: '#3b82f6', label: 'Site web'     },
  moodboard:    { icon: 'grid-2x2',      color: '#ec4899', label: 'Moodboard'   },
  document:     { icon: 'file-text',     color: '#6366f1', label: 'Document'     },
  checklist:    { icon: 'list-checks',   color: '#10b981', label: 'Checklist'    },
  inspirations: { icon: 'sparkles',      color: '#f97316', label: 'Inspirations' },
  form:         { icon: 'clipboard-list',color: '#14b8a6', label: 'Formulaire'   },
  file:         { icon: 'hard-drive',    color: '#6b7280', label: 'Fichier'      },
};

function FileTypeIcon({ type, resourceType, size = 24 }: { type: FileItemType | 'folder'; resourceType?: ResourceType; size?: number }) {
  const rm = resourceType ? RESOURCE_TYPE_META[resourceType] : undefined;
  const m = rm ?? TYPE_META[type] ?? TYPE_META.other;
  return (
    <div style={{ width: size + 10, height: size + 10, borderRadius: 9, background: m.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <SFIcon name={m.icon} size={size * 0.72} color={m.color} />
    </div>
  );
}

// ── Rename input ───────────────────────────────────────────────────────────────

function RenameInput({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onSave(val.trim() || value); if (e.key === 'Escape') onCancel(); }}
      onBlur={() => onSave(val.trim() || value)}
      onClick={e => e.stopPropagation()}
      style={{ width: '100%', fontSize: 11, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', color: 'var(--text)', fontFamily: 'var(--ff-text)', outline: 'none' }}
    />
  );
}

// ── Shared context menu / dropdown ─────────────────────────────────────────────

interface CtxItem {
  label: string; icon: string; action: () => void;
  danger?: boolean; separator?: boolean; header?: boolean; color?: string;
}

function Menu({ items, pos, onClose }: { items: CtxItem[]; pos: { x: number; y: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  // Keep menu inside viewport
  const style: React.CSSProperties = {
    position: 'fixed', left: Math.min(pos.x, window.innerWidth - 220), top: Math.min(pos.y, window.innerHeight - 420),
    background: 'var(--surface-2)', border: '1px solid var(--border)',
    borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
    zIndex: 500, minWidth: 210, padding: '4px 0', overflow: 'hidden',
  };

  return (
    <div ref={ref} style={style}>
      {items.map((item, i) =>
        item.separator
          ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
          : item.header
            ? <p key={i} style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '8px 14px 4px', fontWeight: 700 }}>{item.label}</p>
            : (
              <button key={i} onClick={() => { item.action(); onClose(); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: item.danger ? 'var(--danger)' : 'var(--text)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'none')}
              >
                <SFIcon name={item.icon} size={13} color={item.color ?? (item.danger ? 'var(--danger)' : 'var(--text-2)')} />
                {item.label}
              </button>
            )
      )}
    </div>
  );
}

// ── Modals ─────────────────────────────────────────────────────────────────────

function NewFolderModal({ onSave, onClose }: { onSave: (name: string) => void; onClose: () => void }) {
  const [name, setName] = useState('Nouveau dossier');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Nouveau dossier</h3>
        <input ref={ref} value={name} onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(name.trim() || 'Nouveau dossier'); onClose(); } if (e.key === 'Escape') onClose(); }}
          style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1.5px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--ff-text)', boxSizing: 'border-box' }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" onClick={() => { onSave(name.trim() || 'Nouveau dossier'); onClose(); }}>Créer</SFButton>
        </div>
      </div>
    </div>
  );
}

function NewResourceModal({ def, isWebReview, onSave, onClose }: { def: typeof RESOURCE_TYPES[number]; isWebReview?: boolean; onSave: (name: string, webUrl?: string) => void; onClose: () => void }) {
  const [step, setStep] = useState<'url' | 'name'>(isWebReview ? 'url' : 'name');
  const [webUrl, setWebUrl] = useState('');
  const [name, setName] = useState('');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.focus(); }, [step]);
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
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Nouvelle révision — Site web</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{step === 'url' ? 'Entrez l\'URL du site à réviser' : 'Donnez un nom à cette ressource'}</p>
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
                placeholder="https://monsite.com"
                style={{ width: '100%', padding: '10px 14px 10px 36px', borderRadius: 9, border: '1.5px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--ff-mono)', boxSizing: 'border-box' }}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
              <SFButton variant="primary" onClick={() => { if (webUrl.trim()) setStep('name'); }} disabled={!webUrl.trim()}>Continuer</SFButton>
            </div>
          </>
        )}
        {step === 'name' && (
          <>
            <input ref={ref} value={name} onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handle(); if (e.key === 'Escape') onClose(); }}
              placeholder="Nom de la ressource…"
              style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1.5px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--ff-text)', boxSizing: 'border-box' }}
            />
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
              <SFButton variant="ghost" onClick={isWebReview ? () => setStep('url') : onClose}>{isWebReview ? 'Retour' : 'Annuler'}</SFButton>
              <SFButton variant="primary" onClick={handle} disabled={!name.trim()}>Créer</SFButton>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Revision subtype picker ────────────────────────────────────────────────────

function RevisionPickerModal({ onSelect, onClose }: {
  onSelect: (sel: RevisionSelection) => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 420, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
          <div style={{ width: 36, height: 36, borderRadius: 9, background: '#a05be822', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <SFIcon name="film" size={18} color="#a05be8" />
          </div>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Nouvelle révision</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>Quel type de contenu souhaitez-vous réviser ?</p>
          </div>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginTop: 20 }}>
          {REVISION_SUBTYPES.map(s => (
            <button key={s.label} onClick={() => {
              onSelect({ resourceType: s.resourceType, mediaSubtype: s.mediaSubtype, subtypeLabel: s.label, eyebrow: `RÉVISION ${s.label.toUpperCase()}` });
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
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{s.label}</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{s.desc}</p>
              </div>
              <SFIcon name="chevron-right" size={14} color="var(--text-3)" style={{ marginLeft: 'auto', flexShrink: 0 }} />
            </button>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 16 }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Move modal ─────────────────────────────────────────────────────────────────

function MoveModal({ fileIds, currentProjectId, onMove, onClose }: {
  fileIds: string[];
  currentProjectId: string;
  onMove: (targetFolderId: string | null, targetProjectId?: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'project' | 'other'>('project');
  const [selectedProjectId, setSelectedProjectId] = useState<string>(currentProjectId);
  const [selectedFolderId, setSelectedFolderId] = useState<string | null | '__root__'>('__root__');
  const allProjects = getProjects();
  const allFolders = getFolders();

  const projectFolders = allFolders.filter(f => f.projectId === selectedProjectId && !f.state);

  const buildFolderTree = (parentId: string | null, depth: number): { folder: FileFolder; depth: number }[] => {
    const children = projectFolders.filter(f => f.parentId === parentId);
    return children.flatMap(f => [{ folder: f, depth }, ...buildFolderTree(f.id, depth + 1)]);
  };
  const folderTree = buildFolderTree(null, 0);

  const handleConfirm = () => {
    const folderId = selectedFolderId === '__root__' ? null : selectedFolderId as string | null;
    const projId = selectedProjectId !== currentProjectId ? selectedProjectId : undefined;
    onMove(folderId, projId);
  };

  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border-2)', width: 400, maxHeight: '80vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>Déplacer vers</h3>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{fileIds.length} fichier{fileIds.length > 1 ? 's' : ''} sélectionné{fileIds.length > 1 ? 's' : ''}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {([['project', 'Ce projet'], ['other', 'Autre projet']] as const).map(([key, label]) => (
            <button key={key} onClick={() => { setTab(key); setSelectedFolderId('__root__'); if (key === 'project') setSelectedProjectId(currentProjectId); }}
              style={{ flex: 1, padding: '10px 4px', fontSize: 12, fontWeight: tab === key ? 600 : 400, color: tab === key ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              {label}
            </button>
          ))}
        </div>

        {/* Project selector — only in "other" tab */}
        {tab === 'other' && (
          <div style={{ padding: '10px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Projet</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 120, overflowY: 'auto' }}>
              {allProjects.filter(p => p.id !== currentProjectId).map(p => (
                <button key={p.id} onClick={() => { setSelectedProjectId(p.id); setSelectedFolderId('__root__'); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 8, border: `1px solid ${selectedProjectId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: selectedProjectId === p.id ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}>
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor ?? '#888', flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: selectedProjectId === p.id ? 'var(--accent)' : 'var(--text)', fontWeight: selectedProjectId === p.id ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</span>
                  {selectedProjectId === p.id && <SFIcon name="check" size={12} color="var(--accent)" />}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Folder list */}
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px' }}>
          {/* Root option */}
          <button onClick={() => setSelectedFolderId('__root__')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', borderRadius: 8, border: 'none', background: selectedFolderId === '__root__' ? 'rgba(249,255,0,0.07)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
            onMouseEnter={e => { if (selectedFolderId !== '__root__') (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (selectedFolderId !== '__root__') (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
            <SFIcon name="hard-drive" size={14} color={selectedFolderId === '__root__' ? 'var(--accent)' : 'var(--text-3)'} />
            <span style={{ fontSize: 12, color: selectedFolderId === '__root__' ? 'var(--accent)' : 'var(--text)', fontWeight: selectedFolderId === '__root__' ? 600 : 400 }}>Racine du projet</span>
            {selectedFolderId === '__root__' && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
          </button>
          {/* Folder tree */}
          {folderTree.map(({ folder, depth }) => (
            <button key={folder.id} onClick={() => setSelectedFolderId(folder.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 12px', paddingLeft: 12 + depth * 16, borderRadius: 8, border: 'none', background: selectedFolderId === folder.id ? 'rgba(249,255,0,0.07)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
              onMouseEnter={e => { if (selectedFolderId !== folder.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (selectedFolderId !== folder.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
              <SFIcon name="folder" size={14} color={selectedFolderId === folder.id ? 'var(--accent)' : 'var(--text-3)'} />
              <span style={{ fontSize: 12, color: selectedFolderId === folder.id ? 'var(--accent)' : 'var(--text)', fontWeight: selectedFolderId === folder.id ? 600 : 400, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
              {selectedFolderId === folder.id && <SFIcon name="check" size={12} color="var(--accent)" />}
            </button>
          ))}
          {folderTree.length === 0 && (
            <p style={{ padding: '12px', fontSize: 11, color: 'var(--text-3)', textAlign: 'center' }}>Aucun dossier dans ce projet</p>
          )}
        </div>

        {/* Footer */}
        <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" icon="folder-input" onClick={handleConfirm} disabled={tab === 'other' && selectedProjectId === currentProjectId}>
            Déplacer ici
          </SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export function Fichiers() {
  const { projectId } = useParams<{ projectId: string }>();
  const navigate = useNavigate();
  const project = projectId ? findProject(projectId) : null;
  const projectColor = project?.clientColor ?? 'var(--accent)';

  const [rawFolders, setRawFolders] = useState(getFolders);
  const [rawFiles, setRawFiles]     = useState(getFiles);
  useEffect(() => subscribeFileStore(() => { setRawFolders(getFolders()); setRawFiles(getFiles()); }), []);

  const allFolders = rawFolders.filter(f => !f.state && f.projectId === projectId);
  const allFiles   = rawFiles.filter(f => !f.state && f.projectId === projectId);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [specialView, setSpecialView]         = useState<SpecialView>(null);
  const [viewMode, setViewMode]               = usePersistedState<ViewMode>('sf_view_fichiers_projet', 'grid');
  const [sortBy, setSortBy]                   = usePersistedState<'name' | 'date' | 'size' | 'type'>('sf_sort_fichiers_projet', 'name');
  const [typeFilter, setTypeFilter]           = useState<FileItemType | 'all' | 'resource'>('all');
  const [search, setSearch]                   = useState('');
  const [renamingId, setRenamingId]           = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder]           = useState(false);
  const [newResourceDef, setNewResourceDef]         = useState<typeof RESOURCE_TYPES[number] | null>(null);
  const [showRevisionPicker, setShowRevisionPicker] = useState(false);
  const [pendingRevision, setPendingRevision]       = useState<RevisionSelection | null>(null);
  const [ctx, setCtx]                                 = useState<{ pos: { x: number; y: number }; items: CtxItem[] } | null>(null);
  const [newMenuPos, setNewMenuPos]           = useState<{ x: number; y: number } | null>(null);
  // Columns view: colSelections[k] = folderId selected at depth k (reveals column k+1)
  const [colSelections, setColSelections]     = useState<string[]>([]);
  // Multi-select & drag state
  const [selectedIds, setSelectedIds]         = useState<Set<string>>(new Set());
  const [lastSelectedId, setLastSelectedId]   = useState<string | null>(null);
  const [dragging, setDragging]               = useState<string[] | null>(null);
  const [dragOverFolderId, setDragOverFolderId] = useState<string | null>(null);
  const [moveModal, setMoveModal]             = useState<{ fileIds: string[] } | null>(null);
  const colsRef   = useRef<HTMLDivElement>(null);
  const newBtnRef = useRef<HTMLButtonElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // ── Current view items ───────────────────────────────────────────────────────

  const currentFolders = (() => {
    if (specialView === 'trash')    return getTrashedFolders().filter(f => f.projectId === projectId);
    if (specialView === 'archives') return getArchivedFolders().filter(f => f.projectId === projectId);
    return allFolders.filter(f => f.parentId === currentFolderId);
  })();

  const currentFiles = (() => {
    if (specialView === 'trash')    return getTrashedFiles().filter(f => f.projectId === projectId);
    if (specialView === 'archives') return getArchivedFiles().filter(f => f.projectId === projectId);
    return allFiles.filter(f => f.parentFolderId === currentFolderId);
  })();

  const filteredFolders = currentFolders.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  const filteredFiles = currentFiles
    .filter(f => {
      if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
      if (typeFilter === 'all') return true;
      if (typeFilter === 'resource') return f.type === 'resource';
      return f.type === typeFilter;
    })
    .sort((a, b) => {
      if (sortBy === 'name') return a.name.localeCompare(b.name);
      if (sortBy === 'date') return (b.updatedAt ?? '').localeCompare(a.updatedAt ?? '');
      if (sortBy === 'size') return (b.size ?? 0) - (a.size ?? 0);
      if (sortBy === 'type') return a.type.localeCompare(b.type);
      return 0;
    });

  // ── Breadcrumb ───────────────────────────────────────────────────────────────

  const buildPath = (folderId: string | null): FileFolder[] => {
    if (!folderId) return [];
    const f = rawFolders.find(f => f.id === folderId);
    if (!f) return [];
    return [...buildPath(f.parentId), f];
  };
  const path = buildPath(currentFolderId);

  const goTo = (folderId: string | null) => { setCurrentFolderId(folderId); setSpecialView(null); setSelectedIds(new Set()); };

  const handleFileClick = (e: React.MouseEvent, file: FileItem) => {
    if (e.shiftKey && lastSelectedId) {
      // Shift+click: range select
      const allIds = filteredFiles.map(f => f.id);
      const idx1 = allIds.indexOf(lastSelectedId);
      const idx2 = allIds.indexOf(file.id);
      const [start, end] = idx1 < idx2 ? [idx1, idx2] : [idx2, idx1];
      setSelectedIds(new Set(allIds.slice(start, end + 1)));
    } else if (e.ctrlKey || e.metaKey) {
      // Ctrl/Cmd+click: toggle select
      const next = new Set(selectedIds);
      if (next.has(file.id)) next.delete(file.id); else next.add(file.id);
      setSelectedIds(next);
      setLastSelectedId(file.id);
    } else {
      // Plain click: open resource, or select single non-resource
      setSelectedIds(new Set());
      setLastSelectedId(file.id);
      if (file.type === 'resource' && file.resourceId) openResource(file);
    }
  };

  // ── Auto-scroll columns ──────────────────────────────────────────────────────

  useEffect(() => {
    if (viewMode === 'columns' && colsRef.current) {
      colsRef.current.scrollTo({ left: colsRef.current.scrollWidth, behavior: 'smooth' });
    }
  }, [colSelections.length, viewMode]);

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleNewFolder = (name: string) =>
    addFolder({ name, parentId: currentFolderId, projectId: projectId ?? undefined });

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    Array.from(e.target.files ?? []).forEach(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      const type: FileItemType =
        ['mp4','mov','avi','mkv'].includes(ext) ? 'video' :
        ['jpg','jpeg','png','gif','webp','avif'].includes(ext) ? 'image' :
        ['mp3','wav','aac','flac'].includes(ext) ? 'audio' :
        ['zip','rar','7z'].includes(ext) ? 'zip' :
        ['pdf'].includes(ext) ? 'pdf' :
        ['doc','docx','txt','pptx'].includes(ext) ? 'doc' :
        ['xls','xlsx','csv'].includes(ext) ? 'spreadsheet' : 'other';
      addFile({ name: f.name, type, ext, size: f.size, parentFolderId: currentFolderId, projectId: projectId ?? undefined });
    });
    e.target.value = '';
  };

  const handleDropFiles = (files: File[]) => {
    files.forEach(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      const type: FileItemType =
        ['mp4','mov','avi','mkv'].includes(ext) ? 'video' :
        ['jpg','jpeg','png','gif','webp','avif'].includes(ext) ? 'image' :
        ['mp3','wav','aac','flac'].includes(ext) ? 'audio' :
        ['zip','rar','7z'].includes(ext) ? 'zip' :
        ['pdf'].includes(ext) ? 'pdf' :
        ['doc','docx','txt','pptx'].includes(ext) ? 'doc' :
        ['xls','xlsx','csv'].includes(ext) ? 'spreadsheet' : 'other';
      addFile({ name: f.name, type, ext, size: f.size, parentFolderId: currentFolderId, projectId: projectId ?? undefined });
    });
  };

  const handleCreateResource = (def: typeof RESOURCE_TYPES[number], name: string, webUrl?: string) => {
    const resourceId = `res-${Date.now()}`;
    const isRevision = def.type === 'video_review' && pendingRevision;
    const actualType: ResourceType = isRevision ? pendingRevision!.resourceType : def.type;
    addResource({
      id: resourceId,
      type: actualType,
      eyebrow: isRevision ? pendingRevision!.eyebrow : (RESOURCE_EYEBROW[def.type] ?? def.label.toUpperCase()),
      title: name,
      status: 'info',
      statusLabel: 'En cours',
      meta: '',
      ...(isRevision && pendingRevision!.mediaSubtype ? { mediaSubtype: pendingRevision!.mediaSubtype } : {}),
      ...(actualType === 'web_review' && webUrl ? { webUrl } : {}),
    });
    addFile({ name, type: 'resource', ext: 'res', parentFolderId: currentFolderId, projectId: projectId ?? undefined, resourceId, resourceType: actualType });
    setPendingRevision(null);
  };

  const openResource = (file: FileItem) => {
    if (file.resourceId && projectId) navigate(`/projets/${projectId}/ressources/${file.resourceId}`);
  };

  // ── Menu items (shared by + Nouveau button and background right-click) ────────

  const newMenuItems = (): CtxItem[] => [
    { label: 'Nouveau dossier',       icon: 'folder-plus', action: () => setShowNewFolder(true) },
    { label: 'Importer des fichiers', icon: 'upload',      action: () => fileInputRef.current?.click() },
    { label: '', icon: '', action: () => {}, separator: true },
    { label: 'Ressources',            icon: '',            action: () => {}, header: true },
    ...RESOURCE_TYPES.map(def => ({
      label: def.label, icon: def.icon, color: def.color,
      action: () => def.type === 'video_review' ? setShowRevisionPicker(true) : setNewResourceDef(def),
    })),
  ];

  // ── Context menus ─────────────────────────────────────────────────────────────

  const handleFolderCtx = (e: React.MouseEvent, folder: FileFolder) => {
    e.preventDefault(); e.stopPropagation();
    const items: CtxItem[] = folder.state === 'trashed' ? [
      { label: 'Restaurer', icon: 'rotate-ccw', action: () => restoreFolder(folder.id) },
      { label: '', icon: '', action: () => {}, separator: true },
      { label: 'Supprimer définitivement', icon: 'trash-2', action: () => { if (confirm(`Supprimer « ${folder.name} » ?`)) deleteFolder(folder.id); }, danger: true },
    ] : folder.state === 'archived' ? [
      { label: 'Désarchiver', icon: 'rotate-ccw', action: () => restoreFolder(folder.id) },
      { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFolder(folder.id), danger: true },
    ] : [
      { label: 'Ouvrir',  icon: 'folder-open', action: () => goTo(folder.id) },
      { label: 'Renommer', icon: 'pencil',     action: () => setRenamingId(folder.id) },
      { label: '', icon: '', action: () => {}, separator: true },
      { label: 'Archiver',              icon: 'archive',  action: () => archiveFolder(folder.id) },
      { label: 'Mettre à la corbeille', icon: 'trash-2',  action: () => trashFolder(folder.id), danger: true },
    ];
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items });
  };

  const handleFileCtx = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault(); e.stopPropagation();
    const items: CtxItem[] = file.state === 'trashed' ? [
      { label: 'Restaurer', icon: 'rotate-ccw', action: () => restoreFile(file.id) },
      { label: '', icon: '', action: () => {}, separator: true },
      { label: 'Supprimer définitivement', icon: 'trash-2', action: () => { if (confirm(`Supprimer « ${file.name} » ?`)) deleteFile(file.id); }, danger: true },
    ] : file.state === 'archived' ? [
      { label: 'Désarchiver', icon: 'rotate-ccw', action: () => restoreFile(file.id) },
      { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFile(file.id), danger: true },
    ] : [
      ...(file.type === 'resource' && file.resourceId ? [{ label: 'Ouvrir la ressource', icon: 'external-link', action: () => openResource(file) }] : []),
      { label: 'Renommer', icon: 'pencil', action: () => setRenamingId(file.id) },
      { label: 'Déplacer vers...', icon: 'folder-input', action: () => {
        const ids = selectedIds.has(file.id) ? Array.from(selectedIds) : [file.id];
        setMoveModal({ fileIds: ids });
      }},
      { label: '', icon: '', action: () => {}, separator: true },
      { label: 'Archiver',              icon: 'archive', action: () => archiveFile(file.id) },
      { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFile(file.id), danger: true },
    ];
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items });
  };

  const handleBgCtx = (e: React.MouseEvent) => {
    if (!canAdd) return;
    e.preventDefault();
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items: newMenuItems() });
  };

  // ── Derived ───────────────────────────────────────────────────────────────────

  const isSpecial = specialView !== null;
  const canAdd    = !isSpecial;
  const rootFolders = allFolders.filter(f => f.parentId === null);

  // ── Sidebar style ─────────────────────────────────────────────────────────────

  const SIDE_ITEM = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
    borderRadius: 7, cursor: 'pointer', fontSize: 12,
    background: active ? 'var(--surface-3)' : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text)' : 'var(--text-2)', fontWeight: active ? 600 : 400,
  });

  // ── List row style ────────────────────────────────────────────────────────────

  const ROW: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '34px 1fr 100px 100px 90px',
    alignItems: 'center', gap: 12, padding: '7px 14px', borderRadius: 8,
  };

  // ── Grid cards ────────────────────────────────────────────────────────────────

  const FolderCard = ({ folder }: { folder: FileFolder }) => {
    const isDragOver = dragOverFolderId === folder.id;
    const childCount = allFolders.filter(f => f.parentId === folder.id).length
                     + allFiles.filter(f => f.parentFolderId === folder.id).length;
    return (
      <div
        onDoubleClick={() => !isSpecial && goTo(folder.id)}
        onContextMenu={e => handleFolderCtx(e, folder)}
        onDragOver={e => { e.preventDefault(); setDragOverFolderId(folder.id); }}
        onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverFolderId(null); }}
        onDrop={e => { e.preventDefault(); if (dragging) dragging.forEach(id => moveFile(id, folder.id)); setDragging(null); setDragOverFolderId(null); }}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 12px', borderRadius: 12, cursor: 'pointer', border: isDragOver ? '1.5px solid var(--accent)' : '1.5px solid var(--border)', background: isDragOver ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', transition: 'border-color 0.12s, background 0.12s' }}
        onMouseEnter={e => { if (!isDragOver) { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)'; } }}
        onMouseLeave={e => { if (!isDragOver) { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; } }}
      >
        <SFIcon name="folder" size={36} color={projectColor} />
        <div style={{ textAlign: 'center', width: '100%' }}>
          {renamingId === folder.id
            ? <RenameInput value={folder.name} onSave={v => { renameFolder(folder.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
            : <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</p>
          }
          {childCount > 0 && <p style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{childCount} élément{childCount !== 1 ? 's' : ''}</p>}
        </div>
      </div>
    );
  };

  const FileCard = ({ file }: { file: FileItem }) => {
    const isRes = file.type === 'resource';
    const rm = file.resourceType ? RESOURCE_TYPE_META[file.resourceType] : undefined;
    const accentColor = rm?.color ?? '#c45be8';
    const isSelected = selectedIds.has(file.id);
    const isDragged = dragging?.includes(file.id) && dragOverFolderId !== null;
    return (
      <div
        draggable={!isSpecial}
        onDragStart={e => { const ids = selectedIds.has(file.id) ? Array.from(selectedIds) : [file.id]; setDragging(ids); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => setDragging(null)}
        onClick={e => handleFileClick(e, file)}
        onContextMenu={e => handleFileCtx(e, file)}
        style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 12px', borderRadius: 12, cursor: 'pointer', border: isSelected ? '1.5px solid var(--accent)' : `1.5px solid ${isRes ? `color-mix(in srgb, ${accentColor} 35%, var(--border))` : 'var(--border)'}`, background: isSelected ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', transition: 'border-color 0.12s', opacity: isDragged ? 0.45 : 1 }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.borderColor = isRes ? accentColor : 'var(--border-2)'; }}
        onMouseLeave={e => { if (!isSelected) e.currentTarget.style.borderColor = isRes ? `color-mix(in srgb, ${accentColor} 35%, var(--border))` : 'var(--border)'; }}
      >
        <FileTypeIcon type={file.type} resourceType={file.resourceType} size={30} />
        <div style={{ textAlign: 'center', width: '100%' }}>
          {renamingId === file.id
            ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
            : <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
          }
          {isRes
            ? <p style={{ fontSize: 9, color: accentColor, fontFamily: 'var(--ff-mono)', marginTop: 2, textTransform: 'uppercase', letterSpacing: '0.06em' }}>{rm?.label ?? 'Ressource'}</p>
            : <p style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{formatFileSize(file.size)}</p>
          }
        </div>
      </div>
    );
  };

  // ── List rows ─────────────────────────────────────────────────────────────────

  const FolderRow = ({ folder }: { folder: FileFolder }) => (
    <div onDoubleClick={() => !isSpecial && goTo(folder.id)} onContextMenu={e => handleFolderCtx(e, folder)}
      style={ROW} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <SFIcon name="folder" size={20} color={projectColor} />
      {renamingId === folder.id
        ? <RenameInput value={folder.name} onSave={v => { renameFolder(folder.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
        : <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
      }
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>Dossier</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>—</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{folder.createdAt}</span>
    </div>
  );

  const FileRow = ({ file }: { file: FileItem }) => {
    const isRes = file.type === 'resource';
    const rm = file.resourceType ? RESOURCE_TYPE_META[file.resourceType] : undefined;
    const isSelected = selectedIds.has(file.id);
    const isDragged = dragging?.includes(file.id) && dragOverFolderId !== null;
    return (
      <div
        draggable={!isSpecial}
        onDragStart={e => { const ids = selectedIds.has(file.id) ? Array.from(selectedIds) : [file.id]; setDragging(ids); e.dataTransfer.effectAllowed = 'move'; }}
        onDragEnd={() => setDragging(null)}
        onClick={e => handleFileClick(e, file)}
        onContextMenu={e => handleFileCtx(e, file)}
        style={{ ...ROW, background: isSelected ? 'rgba(249,255,0,0.06)' : 'transparent', boxShadow: isSelected ? 'inset 2px 0 0 var(--accent)' : 'none', cursor: 'pointer', opacity: isDragged ? 0.45 : 1 }}
        onMouseEnter={e => { if (!isSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { e.currentTarget.style.background = isSelected ? 'rgba(249,255,0,0.06)' : 'transparent'; }}
      >
        <FileTypeIcon type={file.type} resourceType={file.resourceType} size={18} />
        {renamingId === file.id
          ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
          : <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
        }
        <span style={{ fontSize: 11, color: rm ? rm.color : 'var(--text-3)', fontFamily: 'var(--ff-mono)', textTransform: 'uppercase' }}>
          {rm ? rm.label : file.ext}
        </span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{isRes ? '—' : formatFileSize(file.size)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{file.updatedAt}</span>
      </div>
    );
  };

  // ── Column panel ──────────────────────────────────────────────────────────────

  const getColItems = (depth: number) => {
    const parentId = depth === 0 ? null : (colSelections[depth - 1] ?? null);
    return {
      folders: allFolders.filter(f => f.parentId === parentId && (!search || f.name.toLowerCase().includes(search.toLowerCase()))),
      files: allFiles.filter(f => {
        if (f.parentFolderId !== parentId) return false;
        if (search && !f.name.toLowerCase().includes(search.toLowerCase())) return false;
        if (typeFilter === 'all') return true;
        if (typeFilter === 'resource') return f.type === 'resource';
        return f.type === typeFilter;
      }),
    };
  };

  const ColPanel = ({ depth }: { depth: number }) => {
    const { folders, files } = getColItems(depth);
    const selectedId = colSelections[depth];

    const rowStyle = (id: string): React.CSSProperties => ({
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
      cursor: 'pointer', borderRadius: 7, transition: 'background 0.1s',
      background: selectedId === id ? 'var(--accent)' : 'transparent',
    });
    const textColor = (id: string) => selectedId === id ? 'var(--on-accent)' : 'var(--text)';
    const iconColor = (id: string, fallback: string) => selectedId === id ? 'var(--on-accent)' : fallback;

    return (
      <div style={{ width: 220, flexShrink: 0, height: '100%', overflowY: 'auto', borderRight: '1px solid var(--border)', padding: '8px 6px', background: depth % 2 === 0 ? 'var(--surface)' : 'var(--bg)' }}>
        {folders.map(f => (
          <div key={f.id}
            onClick={() => setColSelections(prev => [...prev.slice(0, depth), f.id])}
            style={rowStyle(f.id)}
            onMouseEnter={e => { if (selectedId !== f.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (selectedId !== f.id) e.currentTarget.style.background = 'transparent'; }}
            onContextMenu={e => handleFolderCtx(e, f)}
          >
            <SFIcon name="folder" size={14} color={iconColor(f.id, projectColor)} />
            <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: textColor(f.id) }}>{f.name}</span>
            <SFIcon name="chevron-right" size={10} color={iconColor(f.id, 'var(--text-3)')} />
          </div>
        ))}
        {files.map(f => {
          const isRes = f.type === 'resource';
          const rm = f.resourceType ? RESOURCE_TYPE_META[f.resourceType] : undefined;
          const m = rm ?? TYPE_META[f.type] ?? TYPE_META.other;
          const isFileSel = selectedIds.has(f.id);
          return (
            <div key={f.id}
              onClick={e => handleFileClick(e, f)}
              onContextMenu={e => handleFileCtx(e, f)}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px', cursor: 'pointer', borderRadius: 7, transition: 'background 0.1s', background: isFileSel ? 'rgba(249,255,0,0.1)' : 'transparent', boxShadow: isFileSel ? 'inset 2px 0 0 var(--accent)' : 'none' }}
              onMouseEnter={e => { if (!isFileSel) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = isFileSel ? 'rgba(249,255,0,0.1)' : 'transparent'; }}
            >
              <SFIcon name={m.icon} size={14} color={isFileSel ? 'var(--accent)' : m.color} />
              <span style={{ flex: 1, fontSize: 12, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: isFileSel ? 'var(--accent)' : 'var(--text)' }}>{f.name}</span>
              {isRes && <span style={{ fontSize: 9, color: isFileSel ? 'var(--accent)' : m.color, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.05em', flexShrink: 0 }}>{rm?.label ?? 'RES'}</span>}
            </div>
          );
        })}
        {folders.length === 0 && files.length === 0 && (
          <p style={{ padding: '12px', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>Dossier vide</p>
        )}
      </div>
    );
  };

  // ── Render ────────────────────────────────────────────────────────────────────

  const isEmpty = filteredFolders.length === 0 && filteredFiles.length === 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId ?? ''} />

      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left sidebar */}
        <aside style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
          <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>

            <div onClick={() => goTo(null)} style={SIDE_ITEM(!specialView && currentFolderId === null)}
              onMouseEnter={e => { if (specialView || currentFolderId !== null) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (specialView || currentFolderId !== null) e.currentTarget.style.background = 'transparent'; }}
            >
              <SFIcon name="hard-drive" size={13} color={!specialView && currentFolderId === null ? 'var(--accent)' : 'var(--text-3)'} />
              <span>Tous les fichiers</span>
            </div>

            {rootFolders.map(f => {
              const active = !specialView && currentFolderId === f.id;
              return (
                <div key={f.id} onClick={() => goTo(f.id)} style={{ ...SIDE_ITEM(active), paddingLeft: 26 }}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <SFIcon name="folder" size={12} color={projectColor} />
                  <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
                </div>
              );
            })}

            <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />

            {([
              { key: 'archives', label: 'Archives', icon: 'archive' },
              { key: 'trash',    label: 'Corbeille', icon: 'trash-2' },
            ] as const).map(item => {
              const active = specialView === item.key;
              return (
                <div key={item.key} onClick={() => { setSpecialView(item.key); setCurrentFolderId(null); }} style={SIDE_ITEM(active)}
                  onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
                >
                  <SFIcon name={item.icon} size={13} color={active ? 'var(--accent)' : 'var(--text-3)'} />
                  <span>{item.label}</span>
                </div>
              );
            })}
          </div>
        </aside>

        {/* Main area */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

          {/* Toolbar */}
          <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>

            {/* Breadcrumb */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
              <button onClick={() => goTo(null)}
                style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: !specialView && currentFolderId === null ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
                Fichiers
              </button>
              {specialView && (
                <>
                  <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text)' }}>
                    {specialView === 'archives' ? 'Archives' : 'Corbeille'}
                  </span>
                </>
              )}
              {!specialView && path.map((seg, i) => (
                <React.Fragment key={seg.id}>
                  <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
                  <button onClick={() => goTo(seg.id)}
                    style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: i === path.length - 1 ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', cursor: i === path.length - 1 ? 'default' : 'pointer', padding: '2px 4px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {seg.name}
                  </button>
                </React.Fragment>
              ))}
            </div>

            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px' }}>
              <SFIcon name="search" size={13} color="var(--text-3)" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Rechercher…"
                style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--ff-text)', width: 130 }} />
            </div>

            {/* Sort */}
            <div style={{ position: 'relative' }}>
              <select value={sortBy} onChange={e => setSortBy(e.target.value as typeof sortBy)}
                style={{ appearance: 'none', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 28px 5px 10px', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--ff-text)', cursor: 'pointer', outline: 'none' }}>
                <option value="name">Nom</option>
                <option value="date">Date</option>
                <option value="size">Taille</option>
                <option value="type">Type</option>
              </select>
              <SFIcon name="chevrons-up-down" size={11} color="var(--text-3)" style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' } as React.CSSProperties} />
            </div>

            {/* View toggle */}
            <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 2, border: '1px solid var(--border)', gap: 1 }}>
              {(['grid', 'list', 'columns'] as const).map(v => (
                <button key={v} title={v === 'grid' ? 'Grille' : v === 'list' ? 'Liste' : 'Colonnes'}
                  onClick={() => { if (v === 'columns') setColSelections([]); setViewMode(v); }}
                  style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === v ? 'var(--surface)' : 'transparent', color: viewMode === v ? 'var(--text)' : 'var(--text-3)', boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.3)' : 'none' }}>
                  <SFIcon name={v === 'grid' ? 'layout-grid' : v === 'list' ? 'list' : 'panel-right'} size={14} />
                </button>
              ))}
            </div>

            {/* Vider corbeille */}
            {specialView === 'trash' && (getTrashedFiles().filter(f => f.projectId === projectId).length > 0 || getTrashedFolders().filter(f => f.projectId === projectId).length > 0) && (
              <button onClick={() => emptyTrash()}
                style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 8, border: 'none', background: 'color-mix(in srgb, var(--danger) 15%, transparent)', color: 'var(--danger)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)', flexShrink: 0 }}>
                <SFIcon name="trash-2" size={13} color="var(--danger)" />
                Vider la corbeille
              </button>
            )}

            {/* + Nouveau */}
            {canAdd && (
              <>
                <button ref={newBtnRef}
                  onClick={() => {
                    const rect = newBtnRef.current?.getBoundingClientRect();
                    if (rect) setNewMenuPos({ x: rect.left, y: rect.bottom + 6 });
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '7px 14px', borderRadius: 9, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ff-text)', flexShrink: 0 }}>
                  <SFIcon name="plus" size={14} color="var(--on-accent)" />
                  Nouveau
                  <SFIcon name="chevron-down" size={11} color="var(--on-accent)" />
                </button>
                <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
              </>
            )}
          </div>

          {/* Type filter pills */}
          {!isSpecial && (
            <div style={{ display: 'flex', gap: 4, padding: '6px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, overflowX: 'auto' }}>
              {([
                ['all',        'Tous',         null],
                ['resource',   'Ressources',   'sparkles'],
                ['pdf',        'PDF',          'file-text'],
                ['image',      'Images',       'image'],
                ['video',      'Vidéos',       'video'],
                ['audio',      'Audio',        'music'],
                ['doc',        'Documents',    'file'],
                ['spreadsheet','Tableurs',     'table'],
                ['zip',        'Archives',     'archive'],
              ] as [typeof typeFilter, string, string | null][]).map(([val, label, icon]) => (
                <button key={val} onClick={() => setTypeFilter(val)}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 10px', borderRadius: 20, border: 'none', cursor: 'pointer', whiteSpace: 'nowrap', fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.05em', textTransform: 'uppercase', background: typeFilter === val ? 'var(--surface-3)' : 'transparent', color: typeFilter === val ? 'var(--text)' : 'var(--text-3)', transition: 'background 0.1s' }}>
                  {icon && <SFIcon name={icon} size={10} />}
                  {label}
                </button>
              ))}
            </div>
          )}

          {/* Selection toolbar */}
          {selectedIds.size > 0 && (
            <div style={{ padding: '6px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(249,255,0,0.06)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', fontWeight: 600 }}>{selectedIds.size} sélectionné{selectedIds.size > 1 ? 's' : ''}</span>
              <button onClick={() => setMoveModal({ fileIds: Array.from(selectedIds) })}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}>
                <SFIcon name="folder-input" size={11} />Déplacer
              </button>
              <button onClick={() => { Array.from(selectedIds).forEach(id => archiveFile(id)); setSelectedIds(new Set()); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}>
                <SFIcon name="archive" size={11} />Archiver
              </button>
              <button onClick={() => { Array.from(selectedIds).forEach(id => trashFile(id)); setSelectedIds(new Set()); }}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 10px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'rgba(229,72,77,0.08)', cursor: 'pointer', fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--ff-text)' }}>
                <SFIcon name="trash-2" size={11} />Corbeille
              </button>
              <button onClick={() => setSelectedIds(new Set())} style={{ marginLeft: 'auto', display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>
                <SFIcon name="x" size={11} />Annuler
              </button>
            </div>
          )}

          {/* Content area */}
          {viewMode === 'columns' ? (
            <div ref={colsRef} style={{ flex: 1, display: 'flex', overflow: 'auto' }} onContextMenu={handleBgCtx}>
              <ColPanel depth={0} />
              {colSelections.map((_, i) => <ColPanel key={i} depth={i + 1} />)}
            </div>
          ) : (
            <div
              style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? 20 : 0 }}
              onContextMenu={handleBgCtx}
              onClick={e => { if (e.target === e.currentTarget) setSelectedIds(new Set()); }}
              onDragOver={e => e.preventDefault()}
              onDrop={e => { e.preventDefault(); if (canAdd) handleDropFiles(Array.from(e.dataTransfer.files)); }}
            >
              {isEmpty ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-3)', padding: 40 }}>
                  <SFIcon name={specialView === 'trash' ? 'trash-2' : specialView === 'archives' ? 'archive' : 'folder-open'} size={48} color="var(--border-2)" />
                  <p style={{ fontSize: 14, fontWeight: 500 }}>{isSpecial ? 'Vide' : 'Aucun fichier'}</p>
                  {!isSpecial && <p style={{ fontSize: 12, textAlign: 'center' }}>Glissez des fichiers ici, ou clic droit pour créer</p>}
                </div>
              ) : viewMode === 'grid' ? (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
                  {filteredFolders.map(f => <FolderCard key={f.id} folder={f} />)}
                  {filteredFiles.map(f => <FileCard key={f.id} file={f} />)}
                </div>
              ) : (
                <div>
                  <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 100px 100px 90px', gap: 12, padding: '6px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', position: 'sticky', top: 0 }}>
                    <div />
                    {['Nom', 'Type', 'Taille', 'Modifié'].map(h => (
                      <span key={h} style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</span>
                    ))}
                  </div>
                  {filteredFolders.map(f => <FolderRow key={f.id} folder={f} />)}
                  {filteredFiles.map(f => <FileRow key={f.id} file={f} />)}
                </div>
              )}
            </div>
          )}

          {/* Status bar */}
          <div style={{ padding: '5px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {filteredFolders.length} dossier{filteredFolders.length !== 1 ? 's' : ''} · {filteredFiles.length} fichier{filteredFiles.length !== 1 ? 's' : ''}
            </span>
            {project && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{project.name}</span>}
          </div>
        </div>
      </div>

      {/* Modals & menus */}
      {showNewFolder && <NewFolderModal onSave={handleNewFolder} onClose={() => setShowNewFolder(false)} />}
      {showRevisionPicker && (
        <RevisionPickerModal
          onSelect={sel => { setPendingRevision(sel); setNewResourceDef(RESOURCE_TYPES.find(d => d.type === 'video_review')!); }}
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
      {ctx && <Menu items={ctx.items} pos={ctx.pos} onClose={() => setCtx(null)} />}
      {newMenuPos && <Menu items={newMenuItems()} pos={newMenuPos} onClose={() => setNewMenuPos(null)} />}
      {moveModal && (
        <MoveModal
          fileIds={moveModal.fileIds}
          currentProjectId={projectId ?? ''}
          onMove={(targetFolderId, targetProjectId) => {
            moveModal.fileIds.forEach(id => {
              if (targetProjectId && targetProjectId !== projectId) {
                moveFileFull(id, targetFolderId, targetProjectId);
              } else {
                moveFile(id, targetFolderId);
              }
            });
            setSelectedIds(new Set());
            setMoveModal(null);
          }}
          onClose={() => setMoveModal(null)}
        />
      )}
    </div>
  );
}
