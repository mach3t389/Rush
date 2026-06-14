import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SFButton, SFIcon } from '../components/ui';
import { PROJECTS, USERS } from '../data/mock';
import { getResources } from '../data/resourceStore';
import { markResourceRead } from '../data/notificationStore';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
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

interface UploadedFile { name: string; size: number; type: string; }

interface DocRound {
  v: string; label: string; date: string; status: Status;
  file?: UploadedFile;
}

const SEED_ROUNDS: DocRound[] = [
  { v: 'V1', label: 'Version 1', date: '3 juin',  status: 'ok',
    file: { name: 'brief_v1.pdf', size: 1240000, type: 'application/pdf' } },
  { v: 'V2', label: 'Version 2', date: '10 juin', status: 'review',
    file: { name: 'brief_v2_final.pdf', size: 1580000, type: 'application/pdf' } },
];

const STATUS_COLOR: Record<Status, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)',
  info: 'var(--info)', review: 'var(--accent)', neutral: 'var(--text-3)',
};

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
  const { projectId = '', resourceId = '' } = useParams<{ projectId: string; resourceId: string }>();
  const resource = getResources().find(r => r.id === resourceId);
  const project = PROJECTS.find(p => p.id === projectId);

  const [rounds, setRounds] = useState<DocRound[]>(SEED_ROUNDS);
  const [activeRound, setActiveRound] = useState(SEED_ROUNDS[SEED_ROUNDS.length - 1].v);
  const [currentPage, setCurrentPage] = useState(1);
  const [viewMode, setViewMode] = useState<'page' | 'scroll'>('page');
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [pendingAnno, setPendingAnno] = useState<RevisionAnnotation | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [pendingUpload, setPendingUpload] = useState<UploadedFile | null>(null);
  const [pageInput, setPageInput] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { if (resourceId) markResourceRead(resourceId); }, [resourceId]);

  const pages = DOC_PAGES;
  const totalPages = pages.length;
  const round = rounds.find(r => r.v === activeRound) ?? rounds[rounds.length - 1];

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
  };

  const handleResolve = (id: string) => setComments(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'resolved' ? 'open' : 'resolved' } : c));
  const handleReply = (id: string, text: string) => setComments(prev => prev.map(c => c.id === id ? { ...c, replies: [...c.replies, { id: `r${Date.now()}`, author: USERS.lea, text }] } : c));

  const goTo = (n: number) => setCurrentPage(Math.max(1, Math.min(totalPages, n)));

  // Upload
  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setPendingUpload({ name: f.name, size: f.size, type: f.type });
    e.target.value = '';
  };

  const addToCurrentVersion = () => {
    if (!pendingUpload) return;
    setRounds(prev => prev.map(r => r.v === activeRound ? { ...r, file: pendingUpload } : r));
    setPendingUpload(null);
  };

  const addAsNewVersion = () => {
    if (!pendingUpload) return;
    const next = `V${rounds.length + 1}`;
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    setRounds(prev => [...prev, { v: next, label: `Version ${rounds.length + 1}`, date: today, status: 'review', file: pendingUpload }]);
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

  if (!resource || !project) return <div style={{ padding: 32, color: 'var(--text-3)' }}>Ressource introuvable.</div>;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId}>
        <input ref={fileInputRef} type="file" accept=".pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,image/*" style={{ display: 'none' }} onChange={handleFileChange} />
        <SFButton variant="ghost" size="sm" icon="upload" onClick={() => fileInputRef.current?.click()}
          style={{ border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-2)' }}>
          Téléverser
        </SFButton>
        <SFButton variant="primary" icon="plus" onClick={() => fileInputRef.current?.click()}>Nouvelle version</SFButton>
      </ProjectHeaderBar>

      {/* Version bar */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0, marginRight: 4 }}>Versions</span>

        {rounds.map(r => {
          const active = r.v === activeRound;
          return (
            <div key={r.v} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { const btn = (e.currentTarget as HTMLElement).querySelector('.rd-del') as HTMLElement; if (btn) btn.style.opacity = '1'; }}
              onMouseLeave={e => { const btn = (e.currentTarget as HTMLElement).querySelector('.rd-del') as HTMLElement; if (btn) btn.style.opacity = '0'; }}>
              <button onClick={() => setActiveRound(r.v)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px', paddingRight: rounds.length > 1 ? 28 : 12,
                borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                color: active ? 'var(--accent)' : 'var(--text-2)', fontSize: 12, cursor: 'pointer',
                fontFamily: 'var(--ff-text)', fontWeight: active ? 600 : 400,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[r.status], flexShrink: 0 }} />
                {r.label}
                {r.file && <SFIcon name="paperclip" size={10} color={active ? 'var(--accent)' : 'var(--text-3)'} />}
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: active ? 'var(--accent)' : 'var(--text-3)', opacity: 0.8 }}>{r.date}</span>
              </button>
              {rounds.length > 1 && (
                <button className="rd-del" onClick={() => setDeleteTarget(r.v)} style={{
                  position: 'absolute', right: 5, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)',
                  display: 'flex', padding: 2, borderRadius: 4, opacity: 0, transition: 'opacity 0.12s',
                }}>
                  <SFIcon name="x" size={11} />
                </button>
              )}
            </div>
          );
        })}

        {/* File info for active round */}
        {round.file && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 8, padding: '3px 10px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
            <SFIcon name="file-text" size={11} color="var(--text-3)" />
            <span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)', maxWidth: 160, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{round.file.name}</span>
            <span style={{ fontSize: 10, color: 'var(--text-3)' }}>{fmtSize(round.file.size)}</span>
          </div>
        )}

        {/* View toggle */}
        <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', padding: 2 }}>
          {([['page', 'file-text', 'Page par page'], ['scroll', 'align-justify', 'Défilement']] as const).map(([mode, icon, label]) => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === mode ? 'var(--surface)' : 'transparent',
              color: viewMode === mode ? 'var(--text)' : 'var(--text-3)',
              fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: viewMode === mode ? 600 : 400,
              boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              transition: 'all 0.12s',
            }}>
              <SFIcon name={icon} size={12} />
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* Left: page thumbnail strip */}
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

        {/* Center: document viewer */}
        {viewMode === 'page' ? (
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
