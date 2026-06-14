import React, { useState, useRef } from 'react';
import { SFIcon, SFButton } from '../components/ui';

// ── Types ─────────────────────────────────────────────────────────────────────

type FileType = 'folder' | 'video' | 'image' | 'document' | 'audio' | 'archive' | 'other';

interface FsItem {
  id: string;
  name: string;
  type: FileType;
  size?: string;
  modified: string;
  parentId: string | null;
  starred?: boolean;
}

// ── Mock data ─────────────────────────────────────────────────────────────────

const INITIAL_ITEMS: FsItem[] = [
  { id: 'f-root-1', name: 'Campagne Été 2025',    type: 'folder',   modified: '10 juin 2026',  parentId: null },
  { id: 'f-root-2', name: 'Clip Horizon',          type: 'folder',   modified: '8 juin 2026',   parentId: null },
  { id: 'f-root-3', name: 'Les Bâtisseurs',        type: 'folder',   modified: '5 juin 2026',   parentId: null },
  { id: 'f-root-4', name: 'Brief créatif v3.pdf',  type: 'document', size: '2.4 Mo',  modified: '9 juin 2026',   parentId: null, starred: true },
  { id: 'f-root-5', name: 'Contrat signé.pdf',     type: 'document', size: '890 Ko',  modified: '1 juin 2026',   parentId: null },

  { id: 'f1-1', name: 'Rushes J1',               type: 'folder',   modified: '2 juin 2026',   parentId: 'f-root-1' },
  { id: 'f1-2', name: 'Rushes J2',               type: 'folder',   modified: '4 juin 2026',   parentId: 'f-root-1' },
  { id: 'f1-3', name: 'Montage V1.mp4',          type: 'video',    size: '1.2 Go',  modified: '7 juin 2026',   parentId: 'f-root-1', starred: true },
  { id: 'f1-4', name: 'Montage V2.mp4',          type: 'video',    size: '1.4 Go',  modified: '9 juin 2026',   parentId: 'f-root-1' },
  { id: 'f1-5', name: 'Script final.docx',       type: 'document', size: '120 Ko',  modified: '3 juin 2026',   parentId: 'f-root-1' },
  { id: 'f1-6', name: 'Moodboard.png',           type: 'image',    size: '4.8 Mo',  modified: '1 juin 2026',   parentId: 'f-root-1' },

  { id: 'f1-1-1', name: 'CLIP_001.mp4',          type: 'video',    size: '820 Mo',  modified: '2 juin 2026',   parentId: 'f1-1' },
  { id: 'f1-1-2', name: 'CLIP_002.mp4',          type: 'video',    size: '640 Mo',  modified: '2 juin 2026',   parentId: 'f1-1' },
  { id: 'f1-1-3', name: 'CLIP_003.mp4',          type: 'video',    size: '1.1 Go',  modified: '2 juin 2026',   parentId: 'f1-1' },
  { id: 'f1-1-4', name: 'BTS_photos.zip',        type: 'archive',  size: '340 Mo',  modified: '2 juin 2026',   parentId: 'f1-1' },

  { id: 'f2-1', name: 'Tournage',               type: 'folder',   modified: '5 juin 2026',   parentId: 'f-root-2' },
  { id: 'f2-2', name: 'Final_Horizon.mp4',      type: 'video',    size: '2.1 Go',  modified: '8 juin 2026',   parentId: 'f-root-2', starred: true },
  { id: 'f2-3', name: 'Sous-titres FR.srt',     type: 'document', size: '12 Ko',   modified: '7 juin 2026',   parentId: 'f-root-2' },
  { id: 'f2-4', name: 'Musique-sync.mp3',       type: 'audio',    size: '8.4 Mo',  modified: '6 juin 2026',   parentId: 'f-root-2' },
];

// ── File type config ──────────────────────────────────────────────────────────

const FILE_CONFIG: Record<FileType, { icon: string; color: string; bg: string }> = {
  folder:   { icon: 'folder',        color: 'var(--warn)',   bg: 'rgba(255,160,0,0.12)'  },
  video:    { icon: 'video',         color: 'var(--info)',   bg: 'rgba(100,160,255,0.12)' },
  image:    { icon: 'image',         color: 'var(--review)', bg: 'rgba(180,100,255,0.12)' },
  document: { icon: 'file-text',     color: 'var(--text-2)', bg: 'var(--surface-3)'       },
  audio:    { icon: 'music',         color: 'var(--ok)',     bg: 'rgba(0,200,100,0.12)'  },
  archive:  { icon: 'archive',       color: 'var(--text-3)', bg: 'var(--surface-3)'       },
  other:    { icon: 'file',          color: 'var(--text-3)', bg: 'var(--surface-3)'       },
};

function formatType(type: FileType): string {
  return { folder: 'Dossier', video: 'Vidéo', image: 'Image', document: 'Document', audio: 'Audio', archive: 'Archive', other: 'Fichier' }[type];
}

// ── Context menu ──────────────────────────────────────────────────────────────

function ContextMenu({ x, y, item, onRename, onDelete, onStar, onClose }: {
  x: number; y: number; item: FsItem;
  onRename: () => void; onDelete: () => void; onStar: () => void; onClose: () => void;
}) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 799 }} />
      <div style={{
        position: 'fixed', top: y, left: x, zIndex: 800,
        background: 'var(--surface)', border: '1px solid var(--border-2)',
        borderRadius: 11, padding: 5, minWidth: 180,
        boxShadow: '0 12px 36px rgba(0,0,0,0.6)',
      }}>
        {[
          { icon: 'pencil',     label: 'Renommer',          action: () => { onRename(); onClose(); } },
          { icon: item.starred ? 'star-off' : 'star', label: item.starred ? 'Retirer favori' : 'Ajouter aux favoris', action: () => { onStar(); onClose(); } },
          { icon: 'download',   label: 'Télécharger',       action: onClose, disabled: item.type === 'folder' },
          null,
          { icon: 'trash-2',   label: 'Supprimer',         action: () => { onDelete(); onClose(); }, danger: true },
        ].map((opt, i) =>
          opt === null
            ? <div key={i} style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            : (
              <button key={opt.label} onClick={opt.action} disabled={opt.disabled}
                style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: opt.danger ? 'var(--danger)' : opt.disabled ? 'var(--text-3)' : 'var(--text)', fontSize: 13, cursor: opt.disabled ? 'default' : 'pointer', fontFamily: 'var(--ff-text)', textAlign: 'left' }}
                onMouseEnter={e => { if (!opt.disabled) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <SFIcon name={opt.icon} size={14} color={opt.danger ? 'var(--danger)' : opt.disabled ? 'var(--text-3)' : 'var(--text-2)'} />
                {opt.label}
              </button>
            )
        )}
      </div>
    </>
  );
}

// ── Folder tree (left sidebar) ────────────────────────────────────────────────

function FolderTree({ items, currentId, onNavigate }: { items: FsItem[]; currentId: string | null; onNavigate: (id: string | null) => void }) {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const toggle = (id: string) => setExpanded(prev => {
    const n = new Set(prev);
    n.has(id) ? n.delete(id) : n.add(id);
    return n;
  });

  const renderNode = (parentId: string | null, depth: number): React.ReactNode => {
    const folders = items.filter(i => i.parentId === parentId && i.type === 'folder');
    if (!folders.length) return null;
    return folders.map(f => {
      const hasChildren = items.some(i => i.parentId === f.id && i.type === 'folder');
      const isExpanded = expanded.has(f.id);
      const isActive = currentId === f.id;
      return (
        <React.Fragment key={f.id}>
          <div
            onClick={() => { onNavigate(f.id); if (hasChildren) toggle(f.id); }}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: `5px 8px 5px ${12 + depth * 14}px`, borderRadius: 7, cursor: 'pointer', background: isActive ? 'var(--surface-3)' : 'transparent', color: isActive ? 'var(--text)' : 'var(--text-2)', fontSize: 13, userSelect: 'none' }}
            onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            {hasChildren
              ? <SFIcon name={isExpanded ? 'chevron-down' : 'chevron-right'} size={11} color="var(--text-3)" />
              : <span style={{ width: 11 }} />}
            <SFIcon name={isExpanded ? 'folder-open' : 'folder'} size={14} color="var(--warn)" />
            <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontSize: 12 }}>{f.name}</span>
          </div>
          {isExpanded && renderNode(f.id, depth + 1)}
        </React.Fragment>
      );
    });
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 1 }}>
      <div
        onClick={() => onNavigate(null)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 8px', borderRadius: 7, cursor: 'pointer', background: currentId === null ? 'var(--surface-3)' : 'transparent', color: currentId === null ? 'var(--text)' : 'var(--text-2)', fontSize: 12, marginBottom: 4 }}
        onMouseEnter={e => { if (currentId !== null) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (currentId !== null) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <SFIcon name="hard-drive" size={14} color={currentId === null ? 'var(--text)' : 'var(--text-3)'} />
        Tous les fichiers
      </div>
      {renderNode(null, 0)}
    </div>
  );
}

// ── Main screen ───────────────────────────────────────────────────────────────

export function Fichiers() {
  const [items, setItems] = useState<FsItem[]>(INITIAL_ITEMS);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [view, setView] = useState<'grid' | 'list'>('grid');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal, setRenameVal] = useState('');
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number; item: FsItem } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<FsItem | null>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const currentItems = items.filter(i => i.parentId === currentId);

  // Breadcrumb path
  const buildPath = (id: string | null): FsItem[] => {
    if (!id) return [];
    const item = items.find(i => i.id === id);
    if (!item) return [];
    return [...buildPath(item.parentId), item];
  };
  const path = buildPath(currentId);

  const navigate = (id: string | null) => {
    setCurrentId(id);
    setSelected(new Set());
    setCreatingFolder(false);
  };

  const startRename = (item: FsItem) => {
    setRenamingId(item.id);
    setRenameVal(item.name);
  };

  const commitRename = () => {
    if (renamingId && renameVal.trim()) {
      setItems(prev => prev.map(i => i.id === renamingId ? { ...i, name: renameVal.trim() } : i));
    }
    setRenamingId(null);
  };

  const deleteItem = (item: FsItem) => {
    const collectIds = (id: string): string[] => {
      const children = items.filter(i => i.parentId === id).flatMap(c => collectIds(c.id));
      return [id, ...children];
    };
    const toDelete = new Set(collectIds(item.id));
    setItems(prev => prev.filter(i => !toDelete.has(i.id)));
    setConfirmDelete(null);
  };

  const toggleStar = (id: string) => setItems(prev => prev.map(i => i.id === id ? { ...i, starred: !i.starred } : i));

  const createFolder = () => {
    const name = newFolderName.trim() || 'Nouveau dossier';
    setItems(prev => [...prev, { id: `f-${Date.now()}`, name, type: 'folder', modified: "Aujourd'hui", parentId: currentId }]);
    setCreatingFolder(false);
    setNewFolderName('');
  };

  const handleUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    const newItems: FsItem[] = files.map(f => {
      const ext = f.name.split('.').pop()?.toLowerCase() ?? '';
      const type: FileType = ['mp4','mov','avi','mkv'].includes(ext) ? 'video'
        : ['jpg','jpeg','png','gif','webp'].includes(ext) ? 'image'
        : ['mp3','wav','aac'].includes(ext) ? 'audio'
        : ['zip','rar','7z','tar'].includes(ext) ? 'archive'
        : ['pdf','doc','docx','txt','pptx','xlsx'].includes(ext) ? 'document' : 'other';
      const size = f.size > 1e9 ? `${(f.size/1e9).toFixed(1)} Go` : f.size > 1e6 ? `${(f.size/1e6).toFixed(1)} Mo` : `${Math.round(f.size/1e3)} Ko`;
      return { id: `upload-${Date.now()}-${Math.random()}`, name: f.name, type, size, modified: "Aujourd'hui", parentId: currentId };
    });
    setItems(prev => [...prev, ...newItems]);
    e.target.value = '';
  };

  const onContextMenu = (e: React.MouseEvent, item: FsItem) => {
    e.preventDefault();
    e.stopPropagation();
    setContextMenu({ x: Math.min(e.clientX, window.innerWidth - 200), y: Math.min(e.clientY, window.innerHeight - 240), item });
  };

  const folders = currentItems.filter(i => i.type === 'folder');
  const files = currentItems.filter(i => i.type !== 'folder');

  // ── Render ──────────────────────────────────────────────────────────────────

  const GridCard = ({ item }: { item: FsItem }) => {
    const cfg = FILE_CONFIG[item.type];
    const isRenaming = renamingId === item.id;
    return (
      <div
        onDoubleClick={() => item.type === 'folder' ? navigate(item.id) : startRename(item)}
        onClick={e => { if (!isRenaming) setSelected(prev => { const n = new Set(e.ctrlKey || e.metaKey ? prev : []); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; }); }}
        onContextMenu={e => onContextMenu(e, item)}
        style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9,
          padding: '16px 12px 12px', borderRadius: 12, cursor: 'pointer',
          background: selected.has(item.id) ? 'rgba(249,255,0,0.06)' : 'var(--surface)',
          border: `1px solid ${selected.has(item.id) ? 'var(--accent)' : 'var(--border)'}`,
          transition: 'border-color 0.1s, background 0.1s', userSelect: 'none',
          position: 'relative',
        }}
        onMouseEnter={e => { if (!selected.has(item.id)) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
        onMouseLeave={e => { if (!selected.has(item.id)) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
      >
        {item.starred && <SFIcon name="star" size={11} color="var(--warn)" style={{ position: 'absolute', top: 8, right: 8 }} />}
        <div style={{ width: 48, height: 48, borderRadius: 12, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SFIcon name={cfg.icon} size={24} color={cfg.color} />
        </div>
        {isRenaming ? (
          <input
            autoFocus
            value={renameVal}
            onChange={e => setRenameVal(e.target.value)}
            onBlur={commitRename}
            onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
            onClick={e => e.stopPropagation()}
            style={{ width: '100%', textAlign: 'center', fontSize: 12, padding: '2px 6px', borderRadius: 5, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--ff-text)' }}
          />
        ) : (
          <p style={{ fontSize: 12, fontWeight: 500, textAlign: 'center', lineHeight: 1.35, wordBreak: 'break-word', color: 'var(--text)' }}>{item.name}</p>
        )}
        {item.size && <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{item.size}</p>}
      </div>
    );
  };

  const ListRow = ({ item }: { item: FsItem }) => {
    const cfg = FILE_CONFIG[item.type];
    const isRenaming = renamingId === item.id;
    return (
      <div
        onDoubleClick={() => item.type === 'folder' ? navigate(item.id) : startRename(item)}
        onClick={e => { if (!isRenaming) setSelected(prev => { const n = new Set(e.ctrlKey || e.metaKey ? prev : []); n.has(item.id) ? n.delete(item.id) : n.add(item.id); return n; }); }}
        onContextMenu={e => onContextMenu(e, item)}
        style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--border)', background: selected.has(item.id) ? 'rgba(249,255,0,0.04)' : 'transparent', cursor: 'pointer', userSelect: 'none' }}
        onMouseEnter={e => { if (!selected.has(item.id)) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { if (!selected.has(item.id)) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <div style={{ width: 32, height: 32, borderRadius: 8, background: cfg.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SFIcon name={cfg.icon} size={16} color={cfg.color} />
        </div>
        {isRenaming ? (
          <input autoFocus value={renameVal} onChange={e => setRenameVal(e.target.value)}
            onBlur={commitRename} onKeyDown={e => { if (e.key === 'Enter') commitRename(); if (e.key === 'Escape') setRenamingId(null); }}
            onClick={e => e.stopPropagation()}
            style={{ flex: 1, fontSize: 13, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--ff-text)' }}
          />
        ) : (
          <span style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center', gap: 6 }}>
            {item.name}
            {item.starred && <SFIcon name="star" size={11} color="var(--warn)" />}
          </span>
        )}
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', width: 80, textAlign: 'right', flexShrink: 0 }}>{item.size ?? formatType(item.type)}</span>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', width: 120, textAlign: 'right', flexShrink: 0 }}>{item.modified}</span>
        <button onClick={e => { e.stopPropagation(); startRename(item); }} title="Renommer"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 5, borderRadius: 6 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
        ><SFIcon name="pencil" size={13} /></button>
        <button onClick={e => { e.stopPropagation(); setConfirmDelete(item); }} title="Supprimer"
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 5, borderRadius: 6 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.08)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
        ><SFIcon name="trash-2" size={13} /></button>
      </div>
    );
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>

      {/* Left sidebar — folder tree */}
      <aside style={{ width: 220, flexShrink: 0, borderRight: '1px solid var(--border)', background: 'var(--surface)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <div style={{ padding: '14px 12px 10px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 10 }}>Fichiers</p>
          <FolderTree items={items} currentId={currentId} onNavigate={navigate} />
        </div>
        <div style={{ padding: '12px', flexShrink: 0 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 8 }}>Favoris</p>
          {items.filter(i => i.starred).map(i => (
            <button key={i.id} onClick={() => i.type === 'folder' ? navigate(i.id) : undefined}
              style={{ display: 'flex', alignItems: 'center', gap: 7, width: '100%', padding: '5px 6px', borderRadius: 7, border: 'none', background: 'transparent', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', textAlign: 'left' }}
              onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'}
              onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
            >
              <SFIcon name={FILE_CONFIG[i.type].icon} size={13} color={FILE_CONFIG[i.type].color} />
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{i.name}</span>
            </button>
          ))}
        </div>
      </aside>

      {/* Main area */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Toolbar */}
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, flexShrink: 0 }}>
          {/* Breadcrumb */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, flex: 1, minWidth: 0 }}>
            <button onClick={() => navigate(null)}
              style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: currentId === null ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', cursor: currentId === null ? 'default' : 'pointer', padding: '2px 4px' }}>
              Fichiers
            </button>
            {path.map((seg, i) => (
              <React.Fragment key={seg.id}>
                <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
                <button onClick={() => navigate(seg.id)}
                  style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: i === path.length - 1 ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', cursor: i === path.length - 1 ? 'default' : 'pointer', padding: '2px 4px', maxWidth: 140, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {seg.name}
                </button>
              </React.Fragment>
            ))}
          </div>

          {selected.size > 0 && (
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
          )}

          {/* View toggle */}
          <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 8, padding: 2, border: '1px solid var(--border)', gap: 1 }}>
            {(['grid', 'list'] as const).map(v => (
              <button key={v} onClick={() => setView(v)} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 26, borderRadius: 6, border: 'none', cursor: 'pointer', background: view === v ? 'var(--surface)' : 'transparent', color: view === v ? 'var(--text)' : 'var(--text-3)', transition: 'all 0.1s', boxShadow: view === v ? '0 1px 3px rgba(0,0,0,0.3)' : 'none' }}>
                <SFIcon name={v === 'grid' ? 'layout-grid' : 'list'} size={14} />
              </button>
            ))}
          </div>

          <SFButton variant="secondary" icon="folder-plus" onClick={() => setCreatingFolder(true)}>Nouveau dossier</SFButton>
          <SFButton variant="primary" icon="upload" onClick={() => fileInputRef.current?.click()}>Importer</SFButton>
          <input ref={fileInputRef} type="file" multiple style={{ display: 'none' }} onChange={handleUpload} />
        </div>

        {/* File area */}
        <div style={{ flex: 1, overflowY: 'auto', padding: view === 'grid' ? '20px' : '0' }} onClick={() => setSelected(new Set())}>
          {currentItems.length === 0 && !creatingFolder ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', gap: 12, color: 'var(--text-3)' }}>
              <SFIcon name="folder-open" size={48} color="var(--border-2)" />
              <p style={{ fontSize: 14, fontWeight: 500 }}>Ce dossier est vide</p>
              <p style={{ fontSize: 12 }}>Importez des fichiers ou créez un sous-dossier</p>
              <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
                <SFButton variant="secondary" icon="folder-plus" onClick={() => setCreatingFolder(true)}>Nouveau dossier</SFButton>
                <SFButton variant="primary" icon="upload" onClick={() => fileInputRef.current?.click()}>Importer des fichiers</SFButton>
              </div>
            </div>
          ) : view === 'grid' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 12 }}>
              {creatingFolder && (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 9, padding: '16px 12px 12px', borderRadius: 12, border: '1px solid var(--accent)', background: 'rgba(249,255,0,0.04)' }}>
                  <div style={{ width: 48, height: 48, borderRadius: 12, background: 'rgba(255,160,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <SFIcon name="folder" size={24} color="var(--warn)" />
                  </div>
                  <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                    onBlur={createFolder}
                    onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
                    placeholder="Nom du dossier"
                    style={{ width: '100%', textAlign: 'center', fontSize: 12, padding: '3px 6px', borderRadius: 5, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--ff-text)' }}
                  />
                </div>
              )}
              {folders.map(i => <GridCard key={i.id} item={i} />)}
              {files.map(i => <GridCard key={i.id} item={i} />)}
            </div>
          ) : (
            <div>
              {/* List header */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '6px 16px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
                <div style={{ width: 32, flexShrink: 0 }} />
                <span style={{ flex: 1, fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Nom</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', width: 80, textAlign: 'right', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Taille</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', width: 120, textAlign: 'right', flexShrink: 0, textTransform: 'uppercase', letterSpacing: '0.06em' }}>Modifié</span>
                <div style={{ width: 60, flexShrink: 0 }} />
              </div>
              {creatingFolder && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '9px 16px', borderBottom: '1px solid var(--border)', background: 'rgba(249,255,0,0.03)' }}>
                  <div style={{ width: 32, height: 32, borderRadius: 8, background: 'rgba(255,160,0,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SFIcon name="folder" size={16} color="var(--warn)" />
                  </div>
                  <input autoFocus value={newFolderName} onChange={e => setNewFolderName(e.target.value)}
                    onBlur={createFolder}
                    onKeyDown={e => { if (e.key === 'Enter') createFolder(); if (e.key === 'Escape') setCreatingFolder(false); }}
                    placeholder="Nom du dossier"
                    style={{ flex: 1, fontSize: 13, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--ff-text)' }}
                  />
                </div>
              )}
              {folders.map(i => <ListRow key={i.id} item={i} />)}
              {files.map(i => <ListRow key={i.id} item={i} />)}
            </div>
          )}
        </div>

        {/* Status bar */}
        <div style={{ padding: '6px 20px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
            {folders.length} dossier{folders.length !== 1 ? 's' : ''} · {files.length} fichier{files.length !== 1 ? 's' : ''}
          </span>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>14.2 Go / 50 Go utilisés</span>
        </div>
      </div>

      {/* Context menu */}
      {contextMenu && (
        <ContextMenu
          x={contextMenu.x} y={contextMenu.y} item={contextMenu.item}
          onRename={() => startRename(contextMenu.item)}
          onDelete={() => { setConfirmDelete(contextMenu.item); }}
          onStar={() => toggleStar(contextMenu.item.id)}
          onClose={() => setContextMenu(null)}
        />
      )}

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 900 }}
          onClick={e => { if (e.target === e.currentTarget) setConfirmDelete(null); }}>
          <div style={{ background: 'var(--surface)', borderRadius: 16, border: '1px solid var(--border)', padding: '24px 28px', width: 380, boxShadow: '0 20px 60px rgba(0,0,0,0.6)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div style={{ width: 40, height: 40, borderRadius: 10, background: 'rgba(255,60,60,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <SFIcon name="trash-2" size={20} color="var(--danger)" />
              </div>
              <div>
                <p style={{ fontSize: 14, fontWeight: 700 }}>Supprimer {confirmDelete.type === 'folder' ? 'le dossier' : 'le fichier'}</p>
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 2 }}>Cette action est irréversible</p>
              </div>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20, lineHeight: 1.5 }}>
              Voulez-vous vraiment supprimer <strong>«{confirmDelete.name}»</strong>{confirmDelete.type === 'folder' ? ' et tout son contenu' : ''} ?
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button onClick={() => setConfirmDelete(null)} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Annuler</button>
              <button onClick={() => deleteItem(confirmDelete)} style={{ padding: '8px 18px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Supprimer</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
