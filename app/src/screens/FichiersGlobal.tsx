import React, { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFIcon, SFButton } from '../components/ui';
import {
  getFolders, getFiles, addFolder, deleteFolder, renameFolder,
  addFile, deleteFile, renameFile, subscribeFileStore,
  getChildFolders, getRootFoldersForProject, getRootFoldersForClient,
  getGlobalRootFolders, getFilesInFolder, getFolderPath, formatFileSize,
  fileTypeFromExt,
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
import { addResource } from '../data/resourceStore';
import type { Project, ResourceType } from '../types';

// ── Resource types ─────────────────────────────────────────────────────────────

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
  mediaSubtype?: 'video' | 'photo' | 'file';
  subtypeLabel: string;
  eyebrow: string;
}

const REVISION_SUBTYPES: { resourceType: ResourceType; mediaSubtype?: 'video' | 'photo' | 'file'; label: string; icon: string; color: string; desc: string }[] = [
  { resourceType: 'video_review', mediaSubtype: 'video', label: 'Vidéo',    icon: 'video',     color: '#a05be8', desc: 'Commentaires horodatés sur une vidéo' },
  { resourceType: 'video_review', mediaSubtype: 'photo', label: 'Photo',    icon: 'image',     color: '#5b8af5', desc: 'Annotations sur une image ou un visuel' },
  { resourceType: 'video_review', mediaSubtype: 'file',  label: 'Document', icon: 'file-text', color: '#5bc4e8', desc: 'Révision d\'un document ou d\'un fichier' },
  { resourceType: 'web_review',                          label: 'Site web', icon: 'globe',     color: '#f5975b', desc: 'Annotations sur un site web ou une page en ligne' },
];

const RESOURCE_EYEBROW: Partial<Record<ResourceType, string>> = {
  screenplay: 'SCÉNARIO', moodboard: 'MOODBOARD', video_review: 'RÉVISION',
  document: 'DOCUMENT', checklist: 'CHECKLIST', web_review: 'WEB REVIEW',
  form: 'FORMULAIRE', inspirations: 'INSPIRATIONS',
};

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

// ── New resource modal ────────────────────────────────────────────────────────

function NewResourceModal({ def, isWebReview, onSave, onClose }: { def: typeof RESOURCE_TYPES[number]; isWebReview?: boolean; onSave: (name: string, webUrl?: string) => void; onClose: () => void }) {
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
            <h3 style={{ fontSize: 15, fontWeight: 700 }}>{isWebReview ? 'Révision — Site web' : `Nouveau ${def.label}`}</h3>
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

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list' | 'columns';
type SortBy   = 'name' | 'date' | 'size' | 'type';

interface NavLocation {
  scope: 'root' | 'global' | 'project' | 'client' | 'clients';
  scopeId?: string;   // projectId or clientId
  folderId: string | null;
}

// ── File type icons + colors ───────────────────────────────────────────────────

const TYPE_META: Record<FileItemType | 'folder', { icon: string; color: string; label: string }> = {
  folder:      { icon: 'folder',       color: '#f5c842', label: 'Dossier'     },
  pdf:         { icon: 'file-text',    color: '#e85b5b', label: 'PDF'         },
  image:       { icon: 'image',        color: '#5b8af5', label: 'Image'       },
  video:       { icon: 'video',        color: '#a05be8', label: 'Vidéo'       },
  audio:       { icon: 'music',        color: '#34c98a', label: 'Audio'       },
  zip:         { icon: 'archive',      color: '#f5975b', label: 'Archive'     },
  doc:         { icon: 'file-text',    color: '#5bc4e8', label: 'Document'    },
  spreadsheet: { icon: 'table',        color: '#34c98a', label: 'Tableur'     },
  resource:    { icon: 'layers',       color: '#c45be8', label: 'Ressource'   },
  other:       { icon: 'file',         color: '#888',    label: 'Fichier'     },
};

function FileTypeIcon({ type, size = 28 }: { type: FileItemType | 'folder'; size?: number }) {
  const meta = TYPE_META[type] ?? TYPE_META.other;
  return (
    <div style={{
      width: size + 8, height: size + 8,
      borderRadius: 8,
      background: meta.color + '22',
      display: 'flex', alignItems: 'center', justifyContent: 'center',
      flexShrink: 0,
    }}>
      <SFIcon name={meta.icon} size={size * 0.75} color={meta.color} />
    </div>
  );
}

// ── Context menu ───────────────────────────────────────────────────────────────

interface CtxMenuItem { label: string; icon: string; action: () => void; danger?: boolean; separator?: boolean }

function ContextMenu({ items, pos, onClose }: { items: CtxMenuItem[]; pos: { x: number; y: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div ref={ref} style={{
      position: 'fixed', left: pos.x, top: pos.y,
      background: 'var(--surface-2)', border: '1px solid var(--border)',
      borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)',
      zIndex: 500, minWidth: 180, padding: '4px 0', overflow: 'hidden',
    }}>
      {items.map((item, i) => item.separator
        ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
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
            <SFIcon name={item.icon} size={13} color={item.danger ? 'var(--danger)' : 'var(--text-2)'} />
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
  const [name, setName] = useState('Nouveau dossier');
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}
      onClick={e => { if (e.target === e.currentTarget) onClose(); }}>
      <div style={{ background: 'var(--surface)', borderRadius: 14, border: '1px solid var(--border)', padding: '24px 28px', width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.5)' }}>
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Nouveau dossier</h3>
        <input
          ref={ref}
          value={name}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') { onSave(name.trim() || 'Nouveau dossier'); onClose(); } if (e.key === 'Escape') onClose(); }}
          style={{
            width: '100%', padding: '10px 14px', borderRadius: 9,
            border: '1.5px solid var(--accent)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 14, outline: 'none',
            fontFamily: 'var(--ff-text)', boxSizing: 'border-box',
          }}
        />
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 16 }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" onClick={() => { onSave(name.trim() || 'Nouveau dossier'); onClose(); }}>Créer</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Add file modal (simulated — no actual upload backend) ──────────────────────

const FILE_TYPE_OPTIONS: { type: FileItemType; label: string; ext: string }[] = [
  { type: 'pdf',    label: 'Document PDF',       ext: 'pdf'  },
  { type: 'image',  label: 'Image',              ext: 'jpg'  },
  { type: 'video',  label: 'Vidéo',              ext: 'mp4'  },
  { type: 'audio',  label: 'Audio',              ext: 'mp3'  },
  { type: 'doc',    label: 'Document texte',     ext: 'docx' },
  { type: 'zip',    label: 'Archive ZIP',        ext: 'zip'  },
  { type: 'other',  label: 'Autre',              ext: 'bin'  },
];

function AddFileModal({ onSave, onClose }: { onSave: (name: string, type: FileItemType, ext: string) => void; onClose: () => void }) {
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
        <h3 style={{ fontSize: 15, fontWeight: 700, marginBottom: 16 }}>Ajouter un fichier</h3>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Nom du fichier</label>
            <input
              ref={ref}
              value={name}
              onChange={e => setName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleSave(); if (e.key === 'Escape') onClose(); }}
              placeholder={`ex. Contrat_client.${selectedType.ext}`}
              style={{ width: '100%', padding: '10px 14px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', boxSizing: 'border-box' }}
            />
          </div>
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Type de fichier</label>
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
                    <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>{opt.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 20 }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" onClick={handleSave} disabled={!name.trim()}>Ajouter</SFButton>
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
  location, onNavigate, collapsed,
}: {
  location: NavLocation;
  onNavigate: (loc: NavLocation) => void;
  collapsed: boolean;
}) {
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

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%', overflow: 'hidden' }}>
      <div style={{ flex: 1, overflowY: 'auto', padding: collapsed ? '8px 4px' : '8px 6px' }}>

        {/* Root */}
        <div
          onClick={() => onNavigate({ scope: 'root', folderId: null })}
          style={ITEM_STYLE(isRootActive)}
          onMouseEnter={e => { if (!isRootActive) e.currentTarget.style.background = 'var(--surface-2)'; }}
          onMouseLeave={e => { if (!isRootActive) e.currentTarget.style.background = 'transparent'; }}
        >
          <SFIcon name="hard-drive" size={13} color={isRootActive ? 'var(--accent)' : 'var(--text-3)'} />
          {!collapsed && <span>Tous les fichiers</span>}
        </div>

        {/* Global folders (Archives) - children of root */}
        {globalRoots.filter(f => !['folder-templates', 'folder-archives', 'folder-trash'].includes(f.id)).map(f => {
          const active = location.scope === 'global' && location.folderId === f.id;
          return (
            <div key={f.id}
              onClick={() => onNavigate({ scope: 'global', folderId: f.id })}
              style={{ ...ITEM_STYLE(active), paddingLeft: collapsed ? (collapsed ? '6px' : '28px') : '28px' }}
              onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
            >
              <SFIcon name="folder" size={12} color={active ? 'var(--on-accent)' : 'var(--text-3)'} />
              {!collapsed && <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{f.name}</span>}
            </div>
          );
        })}

        {/* Clients link - child of root */}
        {!collapsed && (
          <div
            onClick={() => onNavigate({ scope: 'clients', folderId: null })}
            style={{ ...ITEM_STYLE(location.scope === 'clients'), paddingLeft: '28px' }}
            onMouseEnter={e => { if (location.scope !== 'clients') e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (location.scope !== 'clients') e.currentTarget.style.background = 'transparent'; }}
          >
            <SFIcon name="users" size={12} color={location.scope === 'clients' ? 'var(--on-accent)' : 'var(--text-3)'} />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>Clients</span>
          </div>
        )}

        {/* Pinned Projects */}
        {pinnedIds.length > 0 && (
          <>
            <SectionLabel>Projets épinglés</SectionLabel>
            {projects.filter(p => pinnedIds.includes(p.id)).map(p => {
          const exp = expandedProjects.has(p.id);
          const projActive = location.scope === 'project' && location.scopeId === p.id && !location.folderId;
          const projFolders = folders.filter(f => f.projectId === p.id && f.parentId === null && !f.state);
          const isHovered = hoveredProjectId === p.id;
          return (
            <div key={p.id}>
              <div
                style={{ ...ITEM_STYLE(projActive), justifyContent: 'flex-start', position: 'relative' }}
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
                {!collapsed && isHovered && (
                  <button
                    onClick={(e) => { e.stopPropagation(); togglePin(p.id); }}
                    style={{
                      flexShrink: 0, width: 20, height: 20, borderRadius: 4,
                      background: 'rgba(0,0,0,0.2)', border: 'none', cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background 0.1s',
                    }}
                    onMouseEnter={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.4)'; }}
                    onMouseLeave={e => { e.currentTarget.style.background = 'rgba(0,0,0,0.2)'; }}
                  >
                    <SFIcon name="star" size={11} color="var(--accent)" fill="currentColor" />
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
            })}
          </>
        )}

        {/* Separator */}
        <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />

        {/* Archives & Trash */}
        {[
          { id: 'folder-archives', name: 'Archives', icon: 'archive' },
          { id: 'folder-trash', name: 'Corbeille', icon: 'trash-2' },
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
              {!collapsed && <span>{item.name}</span>}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────────

export function FichiersGlobal() {
  const navigate = useNavigate();
  const [location, setLocation] = useState<NavLocation>({ scope: 'root', folderId: null });
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('sf_view_fichiers', 'grid');
  const [sortBy, setSortBy] = useState<SortBy>('name');
  const [filterType, setFilterType] = useState<FileItemType | 'all'>('all');
  const [search, setSearch] = useState('');
  const [treeWidth] = useState(220);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  const [rawFolders, setRawFolders] = useState(getFolders);
  const [rawFiles, setRawFiles]     = useState(getFiles);
  const [projects, setProjects]     = useState(getProjects);
  const [clients, setClients]       = useState(getClients);
  const [pinnedIds, setPinnedIds]   = useState(getPinnedIds);

  // Vues normales : on ne montre que les items actifs (ni archivés, ni en corbeille).
  // Les vues Corbeille / Archives lisent directement le store via getTrashed*/getArchived*.
  const allFolders = rawFolders.filter(f => !f.state);
  const allFiles   = rawFiles.filter(f => !f.state);

  useEffect(() => subscribeFileStore(() => { setRawFolders(getFolders()); setRawFiles(getFiles()); }), []);
  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);
  useEffect(() => subscribeClients(() => setClients(getClients())), []);
  useEffect(() => subscribePinned(() => setPinnedIds(getPinnedIds())), []);

  // Modals
  const [showNewFolder, setShowNewFolder]             = useState(false);
  const [showAddFile, setShowAddFile]                 = useState(false);
  const [renamingId, setRenamingId]                   = useState<string | null>(null);
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

  // ── Compute current folder contents ─────────────────────────────────────────

  const isTrashView    = location.scope === 'global' && location.folderId === 'folder-trash';
  const isArchivesView = location.scope === 'global' && location.folderId === 'folder-archives';
  const isSpecialView  = isTrashView || isArchivesView;

  const currentFolders = (() => {
    const { scope, scopeId, folderId } = location;
    if (isTrashView)    return getTrashedFolders();
    if (isArchivesView) return getArchivedFolders();
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
    if (isTrashView)    return getTrashedFiles();
    if (isArchivesView) return getArchivedFiles();
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

  const handleCreateResource = (def: typeof RESOURCE_TYPES[number], name: string, webUrl?: string) => {
    const { scope, scopeId, folderId } = location;
    const projectId = scope === 'project' ? scopeId : undefined;
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
    addFile({ name, type: 'resource', ext: 'res', parentFolderId: folderId, projectId, resourceId });
    setPendingRevision(null);
  };

  const handleFolderCtx = (e: React.MouseEvent, folder: FileFolder) => {
    e.preventDefault();
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
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Archiver', icon: 'archive', action: () => archiveFolder(folder.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFolder(folder.id), danger: true },
      ];
    }
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items });
  };

  const handleFileCtx = (e: React.MouseEvent, file: FileItem) => {
    e.preventDefault();
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
      items = [
        { label: 'Renommer', icon: 'pencil', action: () => setRenamingId(file.id) },
        ...(file.resourceId ? [{ label: 'Ouvrir la ressource', icon: 'external-link', action: () => navigate(`/projets/${file.projectId}/ressources/${file.resourceId}`) }] : []),
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

  // ── Project color lookup ─────────────────────────────────────────────────────

  const projectColor = (projectId?: string) => projects.find(p => p.id === projectId)?.clientColor ?? 'var(--text-3)';
  const clientColor  = (clientId?: string)  => clients.find(c => c.id === clientId)?.avatarColor ?? 'var(--text-3)';

  // ── Grid card ────────────────────────────────────────────────────────────────

  const FolderCard = ({ folder }: { folder: FileFolder }) => {
    const isRenaming = renamingId === folder.id;
    const childCount = allFolders.filter(f => f.parentId === folder.id).length
                     + allFiles.filter(f => f.parentFolderId === folder.id).length;
    return (
      <div
        onDoubleClick={() => handleNavigateFolder(folder)}
        onContextMenu={e => handleFolderCtx(e, folder)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
          border: '1.5px solid var(--border)', background: 'var(--surface-2)',
          transition: 'border-color 0.12s, background 0.12s',
        }}
        onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
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
    return (
      <div
        onContextMenu={e => handleFileCtx(e, file)}
        onDoubleClick={() => { if (isRes && file.projectId) navigate(`/projets/${file.projectId}/ressources/${file.resourceId}`); }}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
          padding: '16px 12px', borderRadius: 12, cursor: isRes ? 'pointer' : 'default',
          border: `1.5px solid ${isRes ? 'color-mix(in srgb, #c45be8 35%, var(--border))' : 'var(--border)'}`,
          background: 'var(--surface-2)', transition: 'border-color 0.12s',
        }}
        onMouseEnter={e => e.currentTarget.style.borderColor = isRes ? '#c45be8' : 'var(--border-2)'}
        onMouseLeave={e => e.currentTarget.style.borderColor = isRes ? 'color-mix(in srgb, #c45be8 35%, var(--border))' : 'var(--border)'}
      >
        <FileTypeIcon type={file.type} size={32} />
        <div style={{ textAlign: 'center', width: '100%' }}>
          {isRenaming
            ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
            : <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
          }
          <p style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{formatFileSize(file.size)}</p>
        </div>
      </div>
    );
  };

  // ── List row ─────────────────────────────────────────────────────────────────

  const ROW: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '36px 1fr 100px 120px 90px 32px',
    alignItems: 'center', gap: 12,
    padding: '7px 14px', borderRadius: 8, cursor: 'pointer',
  };

  const FolderRow = ({ folder }: { folder: FileFolder }) => {
    const isRenaming = renamingId === folder.id;
    const childCount = allFolders.filter(f => f.parentId === folder.id).length
                     + allFiles.filter(f => f.parentFolderId === folder.id).length;
    return (
      <div
        onDoubleClick={() => handleNavigateFolder(folder)}
        onContextMenu={e => handleFolderCtx(e, folder)}
        style={ROW}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <SFIcon name="folder" size={20} color={folder.projectId ? projectColor(folder.projectId) : 'var(--accent)'} />
        {isRenaming
          ? <RenameInput value={folder.name} onSave={v => { renameFolder(folder.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
          : <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</span>
        }
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>Dossier</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{childCount > 0 ? `${childCount} élément${childCount > 1 ? 's' : ''}` : '—'}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{folder.createdAt}</span>
      </div>
    );
  };

  const FileRow = ({ file }: { file: FileItem }) => {
    const isRenaming = renamingId === file.id;
    const isRes = file.type === 'resource' && !!file.resourceId;
    return (
      <div
        onContextMenu={e => handleFileCtx(e, file)}
        onDoubleClick={() => { if (isRes && file.projectId) navigate(`/projets/${file.projectId}/ressources/${file.resourceId}`); }}
        style={{ ...ROW, cursor: isRes ? 'pointer' : 'default' }}
        onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'}
        onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
      >
        <FileTypeIcon type={file.type} size={18} />
        {isRenaming
          ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
          : <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
        }
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', textTransform: 'uppercase' }}>{file.ext}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{formatFileSize(file.size)}</span>
        <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{file.updatedAt}</span>
      </div>
    );
  };

  // ── Root view cards / rows ────────────────────────────────────────────────────

  const VirtualRow = ({ label, icon, color, onClick, count, sublabel }: { label: string; icon: string; color: string; onClick: () => void; count?: number; sublabel?: string }) => (
    <div
      onClick={onClick}
      style={{ ...ROW, background: 'transparent', transition: 'background 0.1s' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
    >
      <div style={{ width: 28, height: 28, borderRadius: 6, background: color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SFIcon name={icon} size={15} color={color} />
      </div>
      <span style={{ fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{sublabel ?? 'Dossier'}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{count !== undefined ? `${count} dossier${count !== 1 ? 's' : ''}` : '—'}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>—</span>
    </div>
  );

  const VirtualCard = ({ label, icon, color, onClick, count }: { label: string; icon: string; color: string; onClick: () => void; count?: number }) => (
    <div
      onDoubleClick={onClick}
      onClick={onClick}
      style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8,
        padding: '16px 12px', borderRadius: 12, cursor: 'pointer',
        border: '1.5px solid var(--border)', background: 'var(--surface-2)',
        transition: 'border-color 0.12s, background 0.12s',
      }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = color + '88'; e.currentTarget.style.background = color + '11'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
    >
      <SFIcon name={icon} size={32} color={color} />
      <div style={{ textAlign: 'center' }}>
        <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 120 }}>{label}</p>
        {count !== undefined && <p style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{count} dossier{count > 1 ? 's' : ''}</p>}
      </div>
    </div>
  );

  // Project card with pin & menu buttons
  const ProjectCard = ({ project }: { project: Project }) => {
    const [showPin, setShowPin] = React.useState(false);
    const [showMenu, setShowMenu] = React.useState(false);
    const isPinned = pinnedIds.includes(project.id);
    return (
      <div style={{ position: 'relative' }}>
        <VirtualCard
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
      return { folders: globalFolders, files: [] };
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

    const folderColor = (f: FileFolder) => {
      if (f.projectId) return projectColor(f.projectId);
      if (f.clientId) return clientColor(f.clientId);
      return 'var(--accent)';
    };

    const rowStyle = (id: string): React.CSSProperties => ({
      display: 'flex', alignItems: 'center', gap: 10, padding: '7px 12px',
      cursor: 'pointer', borderRadius: 7,
      background: selectedId === id ? 'var(--accent)' : 'transparent',
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
            onClick={() => onSelect({ scope: 'clients', folderId: null })}
            onMouseEnter={e => { if (selectedId !== 'clients-folder') e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (selectedId !== 'clients-folder') e.currentTarget.style.background = 'transparent'; }}
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
                onClick={() => onSelect({ scope: 'client', scopeId: c.id, folderId: null })}
                onMouseEnter={e => { if (selectedId !== id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (selectedId !== id) e.currentTarget.style.background = 'transparent'; }}
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
                onClick={() => onSelect({ scope: 'project', scopeId: p.id, folderId: null }, id)}
                onMouseEnter={e => { setHoveredColProjectId(p.id); if (selectedId !== id) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { setHoveredColProjectId(null); if (selectedId !== id) e.currentTarget.style.background = 'transparent'; }}
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
        {folders.map(f => (
          <div key={f.id}
            style={rowStyle(f.id)}
            onClick={() => onSelect(
              (!f.projectId && !f.clientId)
                ? { scope: 'global', folderId: f.id }
                : { ...loc, folderId: f.id },
              f.id,
            )}
            onMouseEnter={e => { if (selectedId !== f.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (selectedId !== f.id) e.currentTarget.style.background = 'transparent'; }}
          >
            <SFIcon name="folder" size={14} color={selectedId === f.id ? 'var(--on-accent)' : folderColor(f)} />
            <span style={nameStyle(f.id)}>{f.name}</span>
            <SFIcon name="chevron-right" size={10} color={selectedId === f.id ? 'var(--on-accent)' : 'var(--text-3)'} />
          </div>
        ))}
        {/* Files */}
        {files.map(f => {
          const meta = TYPE_META[f.type] ?? TYPE_META.other;
          return (
            <div key={f.id}
              style={{ ...rowStyle(f.id), cursor: 'default' }}
              onMouseEnter={e => { if (selectedId !== f.id) e.currentTarget.style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (selectedId !== f.id) e.currentTarget.style.background = 'transparent'; }}
            >
              <SFIcon name={meta.icon} size={14} color={selectedId === f.id ? 'var(--on-accent)' : meta.color} />
              <span style={nameStyle(f.id)}>{f.name}</span>
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
  };

  // Auto-scroll columns container to the right whenever a new column appears
  useEffect(() => {
    if (viewMode === 'columns' && colsContainerRef.current) {
      const el = colsContainerRef.current;
      el.scrollTo({ left: el.scrollWidth, behavior: 'smooth' });
    }
  }, [columnSelections.length, viewMode]);

  // When switching to columns view, seed from current location
  const handleSetViewMode = (m: ViewMode) => {
    if (m === 'columns' && viewMode !== 'columns') {
      if (location.scope !== 'root') {
        setColumnSelections([location]);
      } else {
        setColumnSelections([]);
      }
    }
    setViewMode(m);
  };

  // Hide "+ Nouveau" at project/client root (virtual level — can't add projects or clients)
  const isAtVirtualRoot = (location.scope === 'project' || location.scope === 'client') && location.folderId === null;
  const canAdd = !isAtVirtualRoot && !isSpecialView;
  const canAddFile = !isAtVirtualRoot && location.scope !== 'root' && !isSpecialView;

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
          <SFIcon name={sidebarCollapsed ? 'chevron-right' : 'chevron-left'} size={16} color="var(--text-2)" />
        </button>

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
        <select
          value={sortBy}
          onChange={e => setSortBy(e.target.value as SortBy)}
          style={{ background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '5px 10px', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--ff-mono)', cursor: 'pointer', outline: 'none' }}
        >
          <option value="name">Nom</option>
          <option value="date">Date</option>
          <option value="size">Taille</option>
          <option value="type">Type</option>
        </select>

        {/* View toggle */}
        <div style={{ display: 'flex', gap: 2, background: 'var(--surface-2)', borderRadius: 8, padding: 3, border: '1px solid var(--border)' }}>
          {([['grid', 'layout-grid'], ['list', 'list'], ['columns', 'columns-3']] as [ViewMode, string][]).map(([m, icon]) => (
            <button key={m} onClick={() => handleSetViewMode(m)} style={{
              background: viewMode === m ? 'var(--surface-3)' : 'none',
              border: 'none', borderRadius: 6, padding: '4px 8px', cursor: 'pointer',
              display: 'flex', alignItems: 'center',
            }}>
              <SFIcon name={icon} size={13} color={viewMode === m ? 'var(--text)' : 'var(--text-3)'} />
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
                  {/* Dossier + Fichier */}
                  {[
                    { icon: 'folder-plus', label: 'Nouveau dossier',   show: true,       onClick: () => { setShowNewFolder(true); setNewBtnOpen(false); } },
                    { icon: 'upload',      label: 'Importer un fichier', show: canAddFile, onClick: () => { setShowAddFile(true);  setNewBtnOpen(false); } },
                  ].filter(i => i.show).map(item => (
                    <button key={item.label} onClick={item.onClick} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <SFIcon name={item.icon} size={14} color="var(--text-2)" />
                      {item.label}
                    </button>
                  ))}
                  {/* Separator + Resources section */}
                  <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 14px 3px', fontWeight: 700 }}>Ressources</p>
                  {RESOURCE_TYPES.map(def => (
                    <button key={def.type} onClick={() => { if (def.type === 'video_review') { setShowRevisionPicker(true); } else { setNewResourceDef(def); } setNewBtnOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 14px', border: 'none', background: 'none', cursor: 'pointer', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)', textAlign: 'left' }}
                      onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-3)'}
                      onMouseLeave={e => e.currentTarget.style.background = 'none'}>
                      <SFIcon name={def.icon} size={13} color={def.color} />
                      {def.label}
                    </button>
                  ))}
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
          <FileTree location={location} onNavigate={setLocation} collapsed={sidebarCollapsed} />
        </div>

        {/* ── Column view (Miller columns) ── */}
        {viewMode === 'columns' && (
          <div ref={colsContainerRef} style={{ flex: 1, display: 'flex', overflowX: 'auto', overflowY: 'hidden', height: '100%' }}>
            {/* Column 0: always root */}
            <ColPanel
              loc={{ scope: 'root', folderId: null }}
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
        <div style={{ flex: 1, overflowY: 'auto', padding: 24, display: viewMode === 'columns' ? 'none' : undefined }}>

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
                  {/* Global folders */}
                  {allFolders.filter(f => !f.projectId && !f.clientId && f.parentId === null && !['folder-templates', 'folder-archives', 'folder-trash'].includes(f.id)).map(f => (
                    <VirtualRow key={f.id} label={f.name} icon="folder" color={f.color ?? 'var(--text-3)'}
                      onClick={() => setLocation({ scope: 'global', folderId: f.id })}
                      count={allFolders.filter(c => c.parentId === f.id).length} sublabel="Dossier" />
                  ))}
                  {/* Clients row */}
                  <VirtualRow key="clients-folder" label="Clients" icon="users" color="var(--accent)"
                    onClick={() => setLocation({ scope: 'clients', folderId: null })}
                    count={clients.length} sublabel="Dossier" />
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
                    label="Clients"
                    icon="users"
                    color="var(--accent)"
                    onClick={() => setLocation({ scope: 'clients', folderId: null })}
                    count={clients.length}
                  />
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
                    <VirtualRow key={c.id} label={c.name} icon="user" color={c.avatarColor}
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
                        style={{ ...ROW, position: 'relative', group: 'item' } as any}
                        onClick={() => setLocation({ scope: 'project', scopeId: p.id, folderId: null })}
                        onMouseEnter={e => { e.currentTarget.style.background = 'var(--surface-2)'; }}
                        onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
                      >
                        <div style={{ width: 24, height: 24, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <SFIcon name="folder" size={14} color={p.clientColor} />
                        </div>
                        <span style={{ flex: 1 }}>{p.name}</span>
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
                    <span>Nom</span><span>Type</span><span>Taille</span><span>Modifié</span>
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
    </div>
  );
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
