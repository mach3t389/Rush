import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SFButton, SFIcon } from '../components/ui';
import { USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import { getResources, updateResource } from '../data/resourceStore';
import { setFileContent, getFileContent } from '../data/fileContentStore';
import { markResourceRead } from '../data/notificationStore';
import { incrementCommentCount } from '../data/commentStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import {
  AnnotationLayer, RevisionCommentSidebar,
  type RevisionComment, type RevisionAnnotation,
} from '../components/RevisionComments';
import type { Status } from '../types';

// ── Mock document pages ───────────────────────────────────────────────────────

interface MockPage { id: string; label: string; bg: string; }

const PAGE_PALETTES = [
  'linear-gradient(180deg,#1a2030 0%,#1e2840 100%)',
  'linear-gradient(180deg,#1e1a2e 0%,#26203a 100%)',
  'linear-gradient(180deg,#1a2620 0%,#1e3028 100%)',
];
const makePage = (n: number): MockPage => ({
  id: `page-${n}`, label: `Page ${n}`,
  bg: PAGE_PALETTES[(n - 1) % PAGE_PALETTES.length],
});
const DOC_PAGES: MockPage[] = Array.from({ length: 8 }, (_, i) => makePage(i + 1));

// ── Mock text lines inside a page ─────────────────────────────────────────────

const LINE_PATTERNS = [
  [70,90,60,0,40,88,92,75,80,0,88,76,82,0,65],
  [80,50,95,0,35,70,85,90,0,60,88,74,0,55,80],
  [65,90,78,0,42,85,70,0,88,60,95,0,50,80,72],
];

function MockDocContent({ pageNum }: { pageNum: number }) {
  const lines = LINE_PATTERNS[(pageNum - 1) % LINE_PATTERNS.length];
  return (
    <div style={{ padding: '28px 36px', display: 'flex', flexDirection: 'column', gap: 5 }}>
      {lines.map((w, i) => w === 0
        ? <div key={i} style={{ height: 10 }} />
        : <div key={i} style={{
            height: i === 4 || i === 5 ? 5 : 4, width: `${w}%`, borderRadius: 2,
            background: i === 4 || i === 5 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)',
            flexShrink: 0,
          }} />
      )}
    </div>
  );
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface UploadedFile { name: string; size: number; type: string; fileId?: string; }

interface DocRound {
  v: string; label: string; date: string; status: Status;
  file?: UploadedFile;
}

const TODAY_FR = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

// On démarre sur une version vide : l'utilisateur glisse son document à l'intérieur.
const INITIAL_ROUNDS: DocRound[] = [
  { v: 'V1', label: 'Version initiale', date: TODAY_FR, status: 'review' },
];


function fmtSize(bytes: number) {
  if (bytes >= 1e6) return `${(bytes / 1e6).toFixed(1)} Mo`;
  return `${Math.round(bytes / 1e3)} Ko`;
}

// ── Upload modal ───────────────────────────────────────────────────────────────

function UploadModal({
  pending,
  roundCount,
  onAddToVersion,
  onNewVersion,
  onClose,
}: {
  pending: UploadedFile;
  roundCount: number;
  onAddToVersion: () => void;
  onNewVersion: () => void;
  onClose: () => void;
}) {
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.65)' }}>
        <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Fichier à ajouter</h3>

        {/* File chip */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', marginBottom: 20 }}>
          <SFIcon name="file-text" size={20} color="var(--accent)" />
          <div style={{ flex: 1, minWidth: 0 }}>
            <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{pending.name}</p>
            <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 2 }}>{fmtSize(pending.size)}</p>
          </div>
        </div>

        <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 14 }}>Où souhaitez-vous ajouter ce fichier ?</p>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <button onClick={onAddToVersion} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left',
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SFIcon name="layers" size={18} color="var(--text-2)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Version actuelle (V{roundCount})</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Remplace le fichier de cette version</p>
            </div>
          </button>
          <button onClick={onNewVersion} style={{
            display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10,
            border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left',
          }}
            onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
            onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
          >
            <SFIcon name="plus-circle" size={18} color="var(--text-2)" />
            <div>
              <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Nouvelle version (V{roundCount + 1})</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Crée une nouvelle version avec ce fichier</p>
            </div>
          </button>
        </div>

        <button onClick={onClose} style={{ marginTop: 16, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
          Annuler
        </button>
      </div>
    </div>
  );
}

// ── Page thumbnail strip ───────────────────────────────────────────────────────

function PageThumb({ page, pageNum, isActive, commentCount, onClick }: {
  page: MockPage; pageNum: number; isActive: boolean; commentCount: number; onClick: () => void;
}) {
  return (
    <button onClick={onClick} style={{
      padding: 0, border: `2px solid ${isActive ? 'var(--accent)' : 'transparent'}`,
      borderRadius: 6, cursor: 'pointer', background: 'none', position: 'relative', transition: 'border-color 0.12s', textAlign: 'left',
    }}>
      <div style={{ aspectRatio: '3/4', background: page.bg, borderRadius: 4, overflow: 'hidden', position: 'relative' }}>
        <div style={{ padding: '6px 8px', display: 'flex', flexDirection: 'column', gap: 3 }}>
          {[70, 90, 60, 0, 45, 85, 78].map((w, li) => w === 0
            ? <div key={li} style={{ height: 4 }} />
            : <div key={li} style={{ height: 2, width: `${w}%`, borderRadius: 1, background: li === 4 ? 'rgba(255,255,255,0.22)' : 'rgba(255,255,255,0.09)' }} />
          )}
        </div>
        {commentCount > 0 && (
          <div style={{ position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', fontSize: 8, fontWeight: 700, color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-mono)' }}>
            {commentCount}
          </div>
        )}
      </div>
      <p style={{ fontSize: 8, color: isActive ? 'var(--accent)' : 'var(--text-3)', fontFamily: 'var(--ff-mono)', textAlign: 'center', padding: '2px 0' }}>{pageNum}</p>
    </button>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function DocumentReview() {
  const { resourceId = '' } = useParams<{ projectId: string; resourceId: string }>();
  const resource = getResources().find(r => r.id === resourceId);

  const [localTitle, setLocalTitle] = useState(resource?.title ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(resource?.title ?? '');
  const [localDesc, setLocalDesc] = useState(resource?.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(resource?.description ?? '');

  const commitTitle = () => {
    const trimmed = titleVal.trim();
    if (trimmed && resource) { updateResource(resource.id, { title: trimmed }); setLocalTitle(trimmed); }
    else setTitleVal(localTitle);
    setEditingTitle(false);
  };
  const commitDesc = () => {
    if (resource) { const t = descVal.trim(); updateResource(resource.id, { description: t || undefined }); setLocalDesc(t); }
    setEditingDesc(false);
  };

  const [rounds, setRounds] = useState<DocRound[]>(INITIAL_ROUNDS);
  const [activeRound, setActiveRound] = useState(INITIAL_ROUNDS[INITIAL_ROUNDS.length - 1].v);
  const [isDocDragging, setIsDocDragging] = useState(false);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'page' | 'scroll'>('page');
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [pendingAnno, setPendingAnno] = useState<RevisionAnnotation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<UploadedFile | null>(null);
  const [pageInput, setPageInput] = useState('');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [versionDropOpen, setVersionDropOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (resourceId) markResourceRead(resourceId); }, [resourceId]);

  const pages = DOC_PAGES;
  const totalPages = pages.length;
  const round = rounds.find(r => r.v === activeRound) ?? rounds[rounds.length - 1];
  // Contenu réel du document de la version active (PDF/image déposé)
  const roundContent = round?.file?.fileId ? getFileContent(round.file.fileId) : null;
  const roundIsImage = !!round?.file?.type?.startsWith('image/');
  const roundIsPdf = !!round?.file && (round.file.type === 'application/pdf' || round.file.name.toLowerCase().endsWith('.pdf'));
  // Vue réelle (fichier déposé) ou état vide (version sans fichier) ⇒ on remplace le visualiseur mock
  const showRealViewer = !!roundContent || !round?.file;

  const visibleComments = comments.filter(c =>
    viewMode === 'scroll'
      ? !c.annotation || true  // show all in scroll mode
      : c.annotation?.page === currentPage || (!c.annotation && c.contextLabel === activeRound)
  );

  const pageCommentCount = (p: number) => comments.filter(c => c.annotation?.page === p && c.status === 'open').length;

  const handlePlace = (x: number, y: number, page?: number) => {
    setPendingAnno({ x, y, page: page ?? currentPage });
    setDrawing(false);
  };

  const handleAddComment = (text: string) => {
    const nc: RevisionComment = {
      id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [],
      ...(pendingAnno ? { annotation: pendingAnno } : { contextLabel: activeRound }),
    };
    setComments(prev => [...prev, nc]);
    setPendingAnno(null);
    setActiveCommentId(nc.id);
    if (resourceId) incrementCommentCount(resourceId);
  };

  const handleResolve = (id: string) => setComments(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'resolved' ? 'open' : 'resolved' } : c));
  const handleReply = (id: string, text: string) => setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `r${Date.now()}`, author: USERS.lea, text }] } : c));

  const goTo = (n: number) => setCurrentPage(Math.max(1, Math.min(totalPages, n)));

  // Stocke le contenu réel d'un fichier et renvoie ses métadonnées (avec fileId)
  const storeUploaded = (f: File): UploadedFile => {
    const fileId = `doc-${resourceId}-${Date.now()}`;
    setFileContent(fileId, f);
    return { name: f.name, size: f.size, type: f.type, fileId };
  };

  // Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingUpload(storeUploaded(f));
    e.target.value = '';
  };

  // Glisser-déposer un document directement dans la version active
  const dropToActive = (f: File) => {
    const uploaded = storeUploaded(f);
    setRounds(prev => prev.map(r => r.v === activeRound ? { ...r, file: uploaded } : r));
  };

  const nextVersionName = () => `V${rounds.length + 1}`;

  // Crée une nouvelle version VIDE (sans fichier) — on y glissera le document ensuite
  const addEmptyVersion = () => {
    const next = nextVersionName();
    setRounds(prev => [...prev, { v: next, label: `Version ${rounds.length + 1}`, date: TODAY_FR, status: 'review' }]);
    setActiveRound(next);
  };

  const addToCurrentVersion = () => {
    if (!pendingUpload) return;
    setRounds(prev => prev.map(r => r.v === activeRound ? { ...r, file: pendingUpload } : r));
    setPendingUpload(null);
  };

  const addAsNewVersion = () => {
    if (!pendingUpload) return;
    const next = nextVersionName();
    setRounds(prev => [...prev, { v: next, label: `Version ${rounds.length + 1}`, date: TODAY_FR, status: 'review', file: pendingUpload }]);
    setActiveRound(next);
    setPendingUpload(null);
  };

  const deleteRound = (v: string) => {
    const updated = rounds.filter(r => r.v !== v);
    setRounds(updated);
    if (activeRound === v) setActiveRound(updated[updated.length - 1]?.v ?? '');
    setDeleteTarget(null);
  };

  // Scroll view: jump to page when thumbnail clicked
  const scrollToPage = (pageNum: number) => {
    const el = scrollRef.current?.querySelector(`[data-page="${pageNum}"]`) as HTMLElement | null;
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    setCurrentPage(pageNum);
  };

  // Track visible page in scroll mode
  useEffect(() => {
    if (viewMode !== 'scroll' || !scrollRef.current) return;
    const container = scrollRef.current;
    const onScroll = () => {
      const els = container.querySelectorAll('[data-page]');
      for (const el of Array.from(els)) {
        const rect = el.getBoundingClientRect();
        const cRect = container.getBoundingClientRect();
        if (rect.top >= cRect.top - 40) {
          setCurrentPage(Number((el as HTMLElement).dataset.page));
          break;
        }
      }
    };
    container.addEventListener('scroll', onScroll, { passive: true });
    return () => container.removeEventListener('scroll', onScroll);
  }, [viewMode]);

  if (!resource) return <div style={{ padding: 32, color: 'var(--text-3)' }}>Ressource introuvable.</div>;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(isFullscreen ? { position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg)' } : {}) }}>
      {/* ── Single unified header bar ── */}
      <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*" style={{ display: 'none' }} onChange={handleFileChange} />

        {/* Icon */}
        <div style={{ width: 30, height: 30, borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
          <SFIcon name="file-text" size={15} color="var(--accent)" />
        </div>

        {/* Title + description */}
        <div style={{ flex: 1, minWidth: 0, maxWidth: 260 }}>
          {editingTitle ? (
            <input autoFocus value={titleVal} onChange={e => setTitleVal(e.target.value)} onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleVal(localTitle); setEditingTitle(false); } }}
              style={{ fontSize: 13, fontWeight: 700, background: 'var(--surface-2)', border: '1px solid var(--accent)', borderRadius: 6, padding: '2px 8px', outline: 'none', color: 'var(--text)', fontFamily: 'var(--ff-display)', width: '100%' }} />
          ) : (
            <p onClick={() => setEditingTitle(true)} title="Renommer"
              style={{ fontSize: 13, fontWeight: 700, cursor: 'text', display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{localTitle || resource.title}</span>
              <SFIcon name="pencil" size={10} color="var(--text-3)" />
            </p>
          )}
          {editingDesc ? (
            <textarea autoFocus value={descVal} onChange={e => setDescVal(e.target.value)} onBlur={commitDesc}
              onKeyDown={e => { if (e.key === 'Escape') { setDescVal(localDesc); setEditingDesc(false); } }}
              style={{ fontSize: 10, background: 'var(--surface-2)', border: '1px solid var(--accent)', borderRadius: 4, padding: '1px 6px', outline: 'none', resize: 'none', width: '100%', fontFamily: 'var(--ff-text)', display: 'block' }} rows={1} />
          ) : (
            <p onClick={() => setEditingDesc(true)} title="Modifier la description"
              style={{ fontSize: 10, color: 'var(--text-3)', cursor: 'text', fontStyle: 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {localDesc || 'Ajouter une description…'}
            </p>
          )}
        </div>

        {/* Divider */}
        <div style={{ width: 1, height: 26, background: 'var(--border)', flexShrink: 0 }} />

        {/* Compact version dropdown */}
        <div style={{ position: 'relative', flexShrink: 0 }}>
          <button onClick={() => setVersionDropOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[round.status], flexShrink: 0 }} />
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{activeRound}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 9 }}>{round.label}</span>
            {round.file && <SFIcon name="paperclip" size={9} color="var(--text-3)" />}
            <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
          </button>
          {versionDropOpen && (
            <>
              <div onClick={() => setVersionDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 99, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 240, padding: '4px 0', overflow: 'hidden' }}>
                {rounds.map(r => (
                  <div key={r.v} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                    onMouseEnter={e => { const x = (e.currentTarget as HTMLElement).querySelector('.drd-del') as HTMLElement | null; if (x) x.style.opacity = '1'; }}
                    onMouseLeave={e => { const x = (e.currentTarget as HTMLElement).querySelector('.drd-del') as HTMLElement | null; if (x) x.style.opacity = '0'; }}>
                    <button onClick={() => { setActiveRound(r.v); setVersionDropOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: activeRound === r.v ? 'var(--surface-2)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', paddingRight: rounds.length > 1 ? 36 : 14 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[r.status], flexShrink: 0 }} />
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: activeRound === r.v ? 'var(--accent)' : 'var(--text)', fontWeight: activeRound === r.v ? 600 : 400 }}>{r.v}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.label}</span>
                      {r.file && <SFIcon name="paperclip" size={9} color="var(--text-3)" />}
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', marginLeft: 'auto', flexShrink: 0 }}>{r.date}</span>
                    </button>
                    {rounds.length > 1 && (
                      <button className="drd-del" onClick={e => { e.stopPropagation(); setDeleteTarget(r.v); setVersionDropOpen(false); }}
                        style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: 3, borderRadius: 4, opacity: 0, transition: 'opacity 0.12s' }}>
                        <SFIcon name="x" size={11} />
                      </button>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0 2px' }}>
                  <button onClick={() => { addEmptyVersion(); setVersionDropOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <SFIcon name="plus" size={12} color="var(--accent)" />
                    Nouvelle version vide
                  </button>
                  <button onClick={() => { fileInputRef.current?.click(); setVersionDropOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <SFIcon name="upload" size={12} color="var(--accent)" />
                    Téléverser une version
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* File info for active round */}
        {round.file && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '3px 8px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', flexShrink: 0, maxWidth: 180 }}>
            <SFIcon name="paperclip" size={11} color="var(--text-3)" />
            <span style={{ fontSize: 10, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{round.file.name}</span>
          </div>
        )}

        {/* Spacer */}
        <div style={{ flex: 1 }} />

        {resource && <RequestApprovalButton resource={resource} size="sm" />}

        {/* View toggle — icon only */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', padding: 2, flexShrink: 0 }}>
          {([['page', 'file-text', 'Page par page'], ['scroll', 'align-justify', 'Défilement']] as const).map(([mode, icon, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)} title={label}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 26, height: 24, borderRadius: 6, border: 'none', cursor: 'pointer', background: viewMode === mode ? 'var(--surface)' : 'transparent', color: viewMode === mode ? 'var(--text)' : 'var(--text-3)', boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.3)' : 'none', transition: 'all 0.12s' }}>
              <SFIcon name={icon} size={12}  />
            </button>
          ))}
        </div>

        {/* Upload icon button */}
        <button onClick={() => fileInputRef.current?.click()} title="Téléverser une version"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
          <SFIcon name="upload" size={13}  />
        </button>

        {/* Fullscreen button */}
        <button onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
          <SFIcon name={isFullscreen ? 'minimize-2' : 'maximize-2'} size={13}  />
        </button>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: page thumbnail strip — masqué quand un fichier réel est affiché */}
        {!showRealViewer && (
        <div style={{ width: 110, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', padding: '8px 6px', display: 'flex', flexDirection: 'column', gap: 4, background: 'var(--surface)' }}>
          {pages.map((pg, idx) => {
            const pgNum = idx + 1;
            return (
              <PageThumb
                key={pg.id} page={pg} pageNum={pgNum}
                isActive={pgNum === currentPage}
                commentCount={pageCommentCount(pgNum)}
                onClick={() => viewMode === 'scroll' ? scrollToPage(pgNum) : goTo(pgNum)}
              />
            );
          })}
        </div>
        )}

        {/* Center: document viewer */}
        {showRealViewer ? (
          /* ── Fichier réel déposé ou état vide (glisser-déposer) ── */
          <div
            style={{ flex: 1, position: 'relative', background: 'var(--bg)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}
            onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsDocDragging(true); } }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsDocDragging(false); }}
            onDrop={e => { e.preventDefault(); setIsDocDragging(false); const f = Array.from(e.dataTransfer.files)[0]; if (f) dropToActive(f); }}
          >
            {isDocDragging && (
              <div style={{ position: 'absolute', inset: 16, zIndex: 40, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(249,255,0,0.06)', border: '2px dashed var(--accent)', borderRadius: 12, pointerEvents: 'none' }}>
                <div style={{ textAlign: 'center' }}>
                  <SFIcon name="upload" size={30} color="var(--accent)" />
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginTop: 8 }}>Déposer pour {roundContent ? 'remplacer' : 'ajouter'} le document de {activeRound}</p>
                </div>
              </div>
            )}
            {roundContent ? (
              roundIsImage ? (
                <div style={{ flex: 1, overflow: 'auto', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 24 }}>
                  <img src={roundContent} alt={round?.file?.name} style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain', borderRadius: 6, boxShadow: '0 4px 32px rgba(0,0,0,0.5)' }} />
                </div>
              ) : roundIsPdf ? (
                <iframe title={round?.file?.name} src={roundContent} style={{ flex: 1, width: '100%', border: 'none', background: '#fff' }} />
              ) : (
                <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                  <SFIcon name="file" size={40} color="var(--text-3)" />
                  <p style={{ fontSize: 13, color: 'var(--text-2)' }}>{round?.file?.name}</p>
                  <a href={roundContent} download={round?.file?.name} style={{ fontSize: 12, color: 'var(--accent)' }}>Télécharger</a>
                </div>
              )
            ) : (
              /* Version vide : invitation à déposer un document */
              <div onClick={() => fileInputRef.current?.click()}
                style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, cursor: 'pointer' }}>
                <div style={{ width: 64, height: 64, borderRadius: '50%', background: 'rgba(249,255,0,0.12)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SFIcon name="upload" size={28} color="var(--accent)" />
                </div>
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text)' }}>{activeRound} — Glissez un document ici</p>
                <p style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>PDF, image, ou cliquez pour importer</p>
              </div>
            )}
          </div>
        ) : viewMode === 'page' ? (
          /* ── Page-by-page view ── */
          <div style={{ flex: 1, overflowY: 'auto', padding: '20px 32px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20 }}>
            {/* Navigation controls */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, alignSelf: 'stretch', justifyContent: 'center' }}>
              <button onClick={() => goTo(currentPage - 1)} disabled={currentPage <= 1} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: currentPage <= 1 ? 'default' : 'pointer', opacity: currentPage <= 1 ? 0.4 : 1 }}>
                <SFIcon name="chevron-left" size={13} />
              </button>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                <input
                  type="text"
                  value={pageInput || String(currentPage)}
                  onFocus={() => setPageInput(String(currentPage))}
                  onBlur={() => { if (pageInput) { goTo(parseInt(pageInput, 10) || currentPage); setPageInput(''); } }}
                  onChange={e => setPageInput(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') { goTo(parseInt(pageInput, 10) || currentPage); setPageInput(''); (e.target as HTMLInputElement).blur(); } }}
                  style={{ width: 36, textAlign: 'center', padding: '3px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-mono)' }}
                />
                <span style={{ fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>/ {totalPages}</span>
              </div>
              <button onClick={() => goTo(currentPage + 1)} disabled={currentPage >= totalPages} style={{ padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: currentPage >= totalPages ? 'default' : 'pointer', opacity: currentPage >= totalPages ? 0.4 : 1 }}>
                <SFIcon name="chevron-right" size={13} />
              </button>
            </div>

            {/* Single page */}
            <div style={{ width: '100%', maxWidth: 680, position: 'relative', flexShrink: 0 }}>
              <div style={{ background: pages[currentPage - 1].bg, borderRadius: 6, boxShadow: '0 4px 32px rgba(0,0,0,0.5)', aspectRatio: '3/4', position: 'relative', overflow: 'hidden' }}>
                <MockDocContent pageNum={currentPage} />
                <AnnotationLayer
                  comments={comments} activeId={activeCommentId}
                  onSelect={setActiveCommentId} drawing={drawing}
                  onPlace={(x, y) => handlePlace(x, y, currentPage)}
                  page={currentPage}
                />
              </div>
            </div>

            <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>← → pour naviguer · Cliquez sur Annoter pour ajouter une note</p>
          </div>
        ) : (
          /* ── Scroll view ── */
          <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 32px', background: 'var(--bg)', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 24 }}>
            {pages.map((pg, idx) => {
              const pgNum = idx + 1;
              const pgComments = comments.filter(c => c.annotation?.page === pgNum);
              return (
                <div key={pg.id} data-page={pgNum} style={{ width: '100%', maxWidth: 680, flexShrink: 0 }}>
                  {/* Page label */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em' }}>PAGE {pgNum}</span>
                    {pageCommentCount(pgNum) > 0 && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', background: 'var(--accent)', color: 'var(--on-accent)', padding: '1px 5px', borderRadius: 10 }}>
                        {pageCommentCount(pgNum)} note{pageCommentCount(pgNum) > 1 ? 's' : ''}
                      </span>
                    )}
                  </div>
                  {/* Page */}
                  <div style={{ background: pg.bg, borderRadius: 6, boxShadow: '0 4px 24px rgba(0,0,0,0.4)', aspectRatio: '3/4', position: 'relative', overflow: 'hidden' }}>
                    <MockDocContent pageNum={pgNum} />
                    <AnnotationLayer
                      comments={comments} activeId={activeCommentId}
                      onSelect={id => { setActiveCommentId(id); setCurrentPage(pgNum); }}
                      drawing={drawing && currentPage === pgNum}
                      onPlace={(x, y) => handlePlace(x, y, pgNum)}
                      page={pgNum}
                    />
                  </div>
                </div>
              );
            })}
            <div style={{ height: 40 }} />
          </div>
        )}

        {/* Right: comment sidebar */}
        <RevisionCommentSidebar
          comments={visibleComments}
          activeId={activeCommentId}
          onActivate={id => {
            setActiveCommentId(id);
            if (id) {
              const c = comments.find(x => x.id === id);
              if (c?.annotation?.page) {
                if (viewMode === 'scroll') scrollToPage(c.annotation.page);
                else goTo(c.annotation.page);
              }
            }
          }}
          onAdd={handleAddComment}
          onResolve={handleResolve}
          onReply={handleReply}
          pendingAnnotation={!!pendingAnno}
          onCancelPending={() => setPendingAnno(null)}
          drawing={drawing}
          onToggleDrawing={() => { setDrawing(d => !d); setPendingAnno(null); }}
          contextLabel={viewMode === 'scroll' ? 'Tout le document' : `Page ${currentPage}`}
        />
      </div>

      {/* Upload modal */}
      {pendingUpload && (
        <UploadModal
          pending={pendingUpload}
          roundCount={rounds.length}
          onAddToVersion={addToCurrentVersion}
          onNewVersion={addAsNewVersion}
          onClose={() => setPendingUpload(null)}
        />
      )}

      {/* Delete version confirmation */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Supprimer la version ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              La <strong>{rounds.find(r => r.v === deleteTarget)?.label}</strong> et tous ses commentaires seront supprimés.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="secondary" onClick={() => setDeleteTarget(null)}>Annuler</SFButton>
              <SFButton variant="primary" style={{ background: 'var(--danger)', color: 'white' }} onClick={() => deleteRound(deleteTarget!)}>Supprimer</SFButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
