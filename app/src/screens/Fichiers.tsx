import React, { useState, useEffect, useRef } from 'react';
import { useParams } from 'react-router-dom';
import { SFIcon, SFButton } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import {
  getFolders, getFiles, addFolder, deleteFolder, renameFolder,
  addFile, deleteFile, renameFile, subscribeFileStore,
  trashFolder, trashFile, archiveFolder, archiveFile,
  restoreFolder, restoreFile,
  getTrashedFolders, getTrashedFiles, getArchivedFolders, getArchivedFiles,
  formatFileSize,
  type FileFolder, type FileItem, type FileItemType,
} from '../data/fileStore';
import { findProject } from '../data/projectStore';
import { usePersistedState } from '../hooks/usePersistedState';

// ── Types ──────────────────────────────────────────────────────────────────────

type ViewMode = 'grid' | 'list';
type SpecialView = null | 'archives' | 'trash';

// ── File type icons + colors ───────────────────────────────────────────────────

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

function FileTypeIcon({ type, size = 24 }: { type: FileItemType | 'folder'; size?: number }) {
  const meta = TYPE_META[type] ?? TYPE_META.other;
  return (
    <div style={{ width: size + 10, height: size + 10, borderRadius: 9, background: meta.color + '22', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
      <SFIcon name={meta.icon} size={size * 0.72} color={meta.color} />
    </div>
  );
}

// ── Rename inline ──────────────────────────────────────────────────────────────

function RenameInput({ value, onSave, onCancel }: { value: string; onSave: (v: string) => void; onCancel: () => void }) {
  const [val, setVal] = useState(value);
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => { ref.current?.select(); }, []);
  return (
    <input ref={ref} value={val} onChange={e => setVal(e.target.value)}
      onKeyDown={e => { if (e.key === 'Enter') onSave(val.trim() || value); if (e.key === 'Escape') onCancel(); }}
      onBlur={() => onSave(val.trim() || value)}
      onClick={e => e.stopPropagation()}
      style={{ width: '100%', fontSize: 11, fontWeight: 500, background: 'var(--surface)', border: '1px solid var(--accent)', borderRadius: 4, padding: '2px 6px', color: 'var(--text)', fontFamily: 'var(--ff-text)', outline: 'none' }}
    />
  );
}

// ── Context menu ───────────────────────────────────────────────────────────────

interface CtxItem { label: string; icon: string; action: () => void; danger?: boolean; separator?: boolean }

function ContextMenu({ items, pos, onClose }: { items: CtxItem[]; pos: { x: number; y: number }; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  return (
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 180, padding: '4px 0' }}>
      {items.map((item, i) => item.separator
        ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
        : (
          <button key={i} onClick={() => { item.action(); onClose(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: item.danger ? 'var(--danger)' : 'var(--text)' }}
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

// ── Main screen ────────────────────────────────────────────────────────────────

export function Fichiers() {
  const { projectId } = useParams<{ projectId: string }>();
  const project = projectId ? findProject(projectId) : null;
  const projectColor = project?.clientColor ?? 'var(--accent)';

  const [rawFolders, setRawFolders] = useState(getFolders);
  const [rawFiles, setRawFiles]     = useState(getFiles);
  useEffect(() => subscribeFileStore(() => { setRawFolders(getFolders()); setRawFiles(getFiles()); }), []);

  // Active folders/files for this project (no state = active)
  const allFolders = rawFolders.filter(f => !f.state && f.projectId === projectId);
  const allFiles   = rawFiles.filter(f => !f.state && f.projectId === projectId);

  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  const [specialView, setSpecialView] = useState<SpecialView>(null);
  const [viewMode, setViewMode] = usePersistedState<ViewMode>('sf_view_fichiers_projet', 'grid');
  const [search, setSearch]     = useState('');
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [showNewFolder, setShowNewFolder] = useState(false);
  const [ctx, setCtx] = useState<{ pos: { x: number; y: number }; items: CtxItem[] } | null>(null);
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
  const filteredFiles   = currentFiles.filter(f => !search || f.name.toLowerCase().includes(search.toLowerCase()));

  // ── Breadcrumb ───────────────────────────────────────────────────────────────

  const buildPath = (folderId: string | null): FileFolder[] => {
    if (!folderId) return [];
    const f = rawFolders.find(f => f.id === folderId);
    if (!f) return [];
    return [...buildPath(f.parentId), f];
  };
  const path = buildPath(currentFolderId);

  const navigate = (folderId: string | null) => {
    setCurrentFolderId(folderId);
    setSpecialView(null);
  };

  // ── Actions ──────────────────────────────────────────────────────────────────

  const handleNewFolder = (name: string) => {
    addFolder({ name, parentId: currentFolderId, projectId: projectId ?? undefined });
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    files.forEach(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      const type: FileItemType =
        ['mp4','mov','avi','mkv'].includes(ext) ? 'video' :
        ['jpg','jpeg','png','gif','webp','avif'].includes(ext) ? 'image' :
        ['mp3','wav','aac','flac'].includes(ext) ? 'audio' :
        ['zip','rar','7z','tar'].includes(ext) ? 'zip' :
        ['pdf'].includes(ext) ? 'pdf' :
        ['doc','docx','txt','pptx'].includes(ext) ? 'doc' :
        ['xls','xlsx','csv'].includes(ext) ? 'spreadsheet' : 'other';
      addFile({ name: f.name, type, ext, size: f.size, parentFolderId: currentFolderId, projectId: projectId ?? undefined });
    });
    e.target.value = '';
  };

  const handleFolderCtx = (e: React.MouseEvent, folder: FileFolder) => {
    e.preventDefault();
    let items: CtxItem[];
    if (folder.state === 'trashed') {
      items = [
        { label: 'Restaurer', icon: 'rotate-ccw', action: () => restoreFolder(folder.id) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Supprimer définitivement', icon: 'trash-2', action: () => { if (confirm(`Supprimer définitivement « ${folder.name} » ?`)) deleteFolder(folder.id); }, danger: true },
      ];
    } else if (folder.state === 'archived') {
      items = [
        { label: 'Désarchiver', icon: 'rotate-ccw', action: () => restoreFolder(folder.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFolder(folder.id), danger: true },
      ];
    } else {
      items = [
        { label: 'Ouvrir', icon: 'folder-open', action: () => navigate(folder.id) },
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
    let items: CtxItem[];
    if (file.state === 'trashed') {
      items = [
        { label: 'Restaurer', icon: 'rotate-ccw', action: () => restoreFile(file.id) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Supprimer définitivement', icon: 'trash-2', action: () => { if (confirm(`Supprimer définitivement « ${file.name} » ?`)) deleteFile(file.id); }, danger: true },
      ];
    } else if (file.state === 'archived') {
      items = [
        { label: 'Désarchiver', icon: 'rotate-ccw', action: () => restoreFile(file.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFile(file.id), danger: true },
      ];
    } else {
      items = [
        { label: 'Renommer', icon: 'pencil', action: () => setRenamingId(file.id) },
        { label: '', icon: '', action: () => {}, separator: true },
        { label: 'Archiver', icon: 'archive', action: () => archiveFile(file.id) },
        { label: 'Mettre à la corbeille', icon: 'trash-2', action: () => trashFile(file.id), danger: true },
      ];
    }
    setCtx({ pos: { x: e.clientX, y: e.clientY }, items });
  };

  const isSpecial = specialView !== null;
  const canAdd = !isSpecial;

  // ── Left sidebar ─────────────────────────────────────────────────────────────

  const SIDE_ITEM = (active: boolean): React.CSSProperties => ({
    display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px',
    borderRadius: 7, cursor: 'pointer', fontSize: 12,
    background: active ? 'var(--surface-3)' : 'transparent',
    borderLeft: active ? '2px solid var(--accent)' : '2px solid transparent',
    color: active ? 'var(--text)' : 'var(--text-2)', fontWeight: active ? 600 : 400,
  });

  const rootFolders = allFolders.filter(f => f.parentId === null);

  // ── Render ───────────────────────────────────────────────────────────────────

  const ROW: React.CSSProperties = {
    display: 'grid', gridTemplateColumns: '34px 1fr 90px 110px 90px',
    alignItems: 'center', gap: 12, padding: '7px 14px', borderRadius: 8,
  };

  const FolderCard = ({ folder }: { folder: FileFolder }) => (
    <div
      onDoubleClick={() => !isSpecial && navigate(folder.id)}
      onContextMenu={e => handleFolderCtx(e, folder)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 12px', borderRadius: 12, cursor: 'pointer', border: '1.5px solid var(--border)', background: 'var(--surface-2)', transition: 'border-color 0.12s, background 0.12s' }}
      onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--border-2)'; e.currentTarget.style.background = 'var(--surface-3)'; }}
      onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.background = 'var(--surface-2)'; }}
    >
      <SFIcon name="folder" size={36} color={projectColor} />
      <div style={{ textAlign: 'center', width: '100%' }}>
        {renamingId === folder.id
          ? <RenameInput value={folder.name} onSave={v => { renameFolder(folder.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
          : <p style={{ fontSize: 11, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{folder.name}</p>
        }
      </div>
    </div>
  );

  const FileCard = ({ file }: { file: FileItem }) => (
    <div
      onContextMenu={e => handleFileCtx(e, file)}
      style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '16px 12px', borderRadius: 12, cursor: 'default', border: '1.5px solid var(--border)', background: 'var(--surface-2)', transition: 'border-color 0.12s' }}
      onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--border-2)'}
      onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--border)'}
    >
      <FileTypeIcon type={file.type} size={30} />
      <div style={{ textAlign: 'center', width: '100%' }}>
        {renamingId === file.id
          ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
          : <p style={{ fontSize: 11, fontWeight: 500, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</p>
        }
        <p style={{ fontSize: 9, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{formatFileSize(file.size)}</p>
      </div>
    </div>
  );

  const FolderRow = ({ folder }: { folder: FileFolder }) => (
    <div onDoubleClick={() => !isSpecial && navigate(folder.id)} onContextMenu={e => handleFolderCtx(e, folder)}
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

  const FileRow = ({ file }: { file: FileItem }) => (
    <div onContextMenu={e => handleFileCtx(e, file)}
      style={ROW} onMouseEnter={e => e.currentTarget.style.background = 'var(--surface-2)'} onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
      <FileTypeIcon type={file.type} size={18} />
      {renamingId === file.id
        ? <RenameInput value={file.name} onSave={v => { renameFile(file.id, v); setRenamingId(null); }} onCancel={() => setRenamingId(null)} />
        : <span style={{ fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{file.name}</span>
      }
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', textTransform: 'uppercase' }}>{file.ext}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{formatFileSize(file.size)}</span>
      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{file.updatedAt}</span>
    </div>
  );

  const isEmpty = filteredFolders.length === 0 && filteredFiles.length === 0;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId ?? ''} />
    <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

      {/* Left sidebar */}
      <aside style={{ width: 200, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ flex: 1, overflowY: 'auto', padding: '8px 6px' }}>

          {/* Root */}
          <div onClick={() => navigate(null)} style={SIDE_ITEM(!specialView && currentFolderId === null)}
            onMouseEnter={e => { if (specialView || currentFolderId !== null) e.currentTarget.style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (specialView || currentFolderId !== null) e.currentTarget.style.background = 'transparent'; }}
          >
            <SFIcon name="hard-drive" size={13} color={!specialView && currentFolderId === null ? 'var(--accent)' : 'var(--text-3)'} />
            <span>Tous les fichiers</span>
          </div>

          {/* Root folders */}
          {rootFolders.map(f => {
            const active = !specialView && currentFolderId === f.id;
            return (
              <div key={f.id} onClick={() => navigate(f.id)} style={{ ...SIDE_ITEM(active), paddingLeft: 26 }}
                onMouseEnter={e => { if (!active) e.currentTarget.style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!active) e.currentTarget.style.background = 'transparent'; }}
              >
                <SFIcon name="folder" size={12} color={projectColor} />
                <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{f.name}</span>
              </div>
            );
          })}

          <div style={{ height: 1, background: 'var(--border)', margin: '10px 0' }} />

          {/* Archives & Trash */}
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
            <button onClick={() => navigate(null)}
              style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: !specialView && currentFolderId === null ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px' }}>
              Fichiers
            </button>
            {specialView && (
              <>
                <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text)' }}>{specialView === 'archives' ? 'Archives' : 'Corbeille'}</span>
              </>
            )}
            {!specialView && path.map((seg, i) => (
              <React.Fragment key={seg.id}>
                <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
                <button onClick={() => navigate(seg.id)}
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
              style={{ background: 'none', border: 'none', outline: 'none', fontSize: 12, color: 'var(--text)', fontFamily: 'var(--ff-text)', width: 140 }} />
          </div>

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 2, border: '1px solid var(--border)', gap: 1 }}>
            {(['grid', 'list'] as const).map(v => (
              <button key={v} onClick={() => setViewMode(v)}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === v ? 'var(--surface)' : 'transparent', color: viewMode === v ? 'var(--text)' : 'var(--text-3)', boxShadow: viewMode === v ? '0 1px 3px rgba(0,0,0,0.3)' : 'none' }}>
                <SFIcon name={v === 'grid' ? 'layout-grid' : 'list'} size={14} />
              </button>
            ))}
          </div>

          {canAdd && (
            <>
              <SFButton variant="secondary" icon="folder-plus" onClick={() => setShowNewFolder(true)}>Nouveau dossier</SFButton>
              <SFButton variant="primary" icon="upload" onClick={() => fileInputRef.current?.click()}>Importer</SFButton>
              <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
            </>
          )}
        </div>

        {/* Drop zone + content */}
        <div
          style={{ flex: 1, overflowY: 'auto', padding: viewMode === 'grid' ? 20 : 0 }}
          onDragOver={e => { e.preventDefault(); }}
          onDrop={e => {
            e.preventDefault();
            if (!canAdd) return;
            const files = Array.from(e.dataTransfer.files);
            files.forEach(f => {
              const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
              const type: FileItemType =
                ['mp4','mov','avi','mkv'].includes(ext) ? 'video' :
                ['jpg','jpeg','png','gif','webp','avif'].includes(ext) ? 'image' :
                ['mp3','wav','aac','flac'].includes(ext) ? 'audio' :
                ['zip','rar','7z','tar'].includes(ext) ? 'zip' :
                ['pdf'].includes(ext) ? 'pdf' :
                ['doc','docx','txt','pptx'].includes(ext) ? 'doc' :
                ['xls','xlsx','csv'].includes(ext) ? 'spreadsheet' : 'other';
              addFile({ name: f.name, type, ext, size: f.size, parentFolderId: currentFolderId, projectId: projectId ?? undefined });
            });
          }}
        >
          {isEmpty ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-3)', padding: 40 }}>
              <SFIcon name={isSpecial ? (specialView === 'trash' ? 'trash-2' : 'archive') : 'folder-open'} size={48} color="var(--border-2)" />
              <p style={{ fontSize: 14, fontWeight: 500 }}>{isSpecial ? 'Vide' : 'Aucun fichier'}</p>
              {!isSpecial && (
                <>
                  <p style={{ fontSize: 12, textAlign: 'center' }}>Glissez des fichiers ici ou cliquez sur Importer</p>
                  <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                    <SFButton variant="secondary" icon="folder-plus" onClick={() => setShowNewFolder(true)}>Nouveau dossier</SFButton>
                    <SFButton variant="primary" icon="upload" onClick={() => fileInputRef.current?.click()}>Importer</SFButton>
                  </div>
                </>
              )}
            </div>
          ) : viewMode === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
              {filteredFolders.map(f => <FolderCard key={f.id} folder={f} />)}
              {filteredFiles.map(f => <FileCard key={f.id} file={f} />)}
            </div>
          ) : (
            <div>
              <div style={{ display: 'grid', gridTemplateColumns: '34px 1fr 90px 110px 90px', gap: 12, padding: '6px 14px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
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

        {/* Status bar */}
        <div style={{ padding: '5px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            {filteredFolders.length} dossier{filteredFolders.length !== 1 ? 's' : ''} · {filteredFiles.length} fichier{filteredFiles.length !== 1 ? 's' : ''}
          </span>
          {project && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{project.name}</span>}
        </div>
      </div>

      {/* Modals */}
      {showNewFolder && <NewFolderModal onSave={handleNewFolder} onClose={() => setShowNewFolder(false)} />}
      {ctx && <ContextMenu items={ctx.items} pos={ctx.pos} onClose={() => setCtx(null)} />}
    </div>
    </div>
  );
}
