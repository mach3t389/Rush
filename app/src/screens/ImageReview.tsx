import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { SFAvatar, SFButton, SFIcon } from '../components/ui';
import { PROJECTS, USERS } from '../data/mock';
import { getResources } from '../data/resourceStore';
import { markResourceRead } from '../data/notificationStore';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import {
  AnnotationLayer, RevisionCommentSidebar,
  type RevisionComment, type RevisionAnnotation,
  annoColor,
} from '../components/RevisionComments';
import type { Status } from '../types';

// ── Mock image seeds ──────────────────────────────────────────────────────────

interface MockImage {
  id: string;
  label: string;
  bg: string;
  aspect: string; // CSS aspect-ratio
}

const SEED_IMAGES: MockImage[] = [
  { id: 'img1', label: 'Plan 001 — Extérieur jour',   bg: 'linear-gradient(135deg,#1a2840 0%,#2d4a6e 100%)', aspect: '16/9' },
  { id: 'img2', label: 'Plan 002 — Portrait studio',   bg: 'linear-gradient(135deg,#2d1a40 0%,#5c3d8f 100%)', aspect: '3/4' },
  { id: 'img3', label: 'Plan 003 — Produit table',     bg: 'linear-gradient(135deg,#1a3a2d 0%,#2d6e4a 100%)', aspect: '1/1' },
  { id: 'img4', label: 'Plan 004 — Ambiance bureau',   bg: 'linear-gradient(135deg,#3a2a1a 0%,#7a5a2d 100%)', aspect: '16/9' },
  { id: 'img5', label: 'Plan 005 — Gros plan détail',  bg: 'linear-gradient(135deg,#1a1a3a 0%,#3d4a8f 100%)', aspect: '4/3' },
  { id: 'img6', label: 'Plan 006 — Vue aérienne',      bg: 'linear-gradient(135deg,#2a1a1a 0%,#8f3d3d 100%)', aspect: '16/9' },
];

interface LocalRound {
  v: string;
  label: string;
  date: string;
  author: typeof USERS.lea;
  status: Status;
  images: MockImage[];
}

const SEED_ROUNDS: LocalRound[] = [
  { v: 'R1', label: 'Ronde 1', date: '2 juin', author: USERS.lea,   status: 'ok',     images: SEED_IMAGES.slice(0, 4) },
  { v: 'R2', label: 'Ronde 2', date: '8 juin', author: USERS.sarah, status: 'review', images: SEED_IMAGES },
];

const STATUS_COLOR: Record<Status, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', danger: 'var(--danger)',
  info: 'var(--info)', review: 'var(--accent)', neutral: 'var(--text-3)',
};
const STATUS_LABEL: Record<Status, string> = {
  ok: 'Approuvé', warn: 'À réviser', danger: 'Bloqué',
  info: 'En cours', review: 'En révision', neutral: 'En attente',
};

// ── Grid layout helpers ───────────────────────────────────────────────────────

function parseRatio(aspect: string): number {
  const [w, h] = aspect.split('/').map(Number);
  return w / h;
}

// Each grid cell = 1 col × 1 row unit (BASE_ROW_H px tall).
// Landscape images span 2 cols × 1 row; portrait span 1 col × 2 rows; square 1×1.
function gridSpan(aspect: string): { colSpan: number; rowSpan: number } {
  const r = parseRatio(aspect);
  if (r >= 1.4)  return { colSpan: 2, rowSpan: 1 }; // landscape  (16/9, 4/3)
  if (r <= 0.8)  return { colSpan: 1, rowSpan: 2 }; // portrait   (3/4, 2/3)
  return           { colSpan: 1, rowSpan: 1 };        // square     (1/1)
}

const GRID_COLS    = 4;   // number of equal columns
const BASE_ROW_H   = 180; // px per row unit

// ── ImageViewer ───────────────────────────────────────────────────────────────

function ImageViewer({
  image,
  comments,
  activeId,
  onActivate,
  drawing,
  onPlace,
}: {
  image: MockImage;
  comments: RevisionComment[];
  activeId: string | null;
  onActivate: (id: string | null) => void;
  drawing: boolean;
  onPlace: (x: number, y: number) => void;
}) {
  return (
    <div style={{ position: 'relative', borderRadius: 10, overflow: 'hidden', userSelect: 'none' }}>
      {/* Placeholder image */}
      <div style={{
        aspectRatio: image.aspect, width: '100%', position: 'relative',
        background: image.bg.startsWith('blob:') || image.bg.startsWith('data:') ? 'var(--surface-2)' : image.bg,
      }}>
        {image.bg.startsWith('blob:') || image.bg.startsWith('data:') ? (
          <img src={image.bg} alt={image.label} style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block', position: 'absolute', inset: 0 }} />
        ) : (
          <div style={{ textAlign: 'center', pointerEvents: 'none' }}>
            <SFIcon name="image" size={32} color="rgba(255,255,255,0.2)" />
            <p style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 8, fontFamily: 'var(--ff-mono)' }}>{image.label}</p>
          </div>
        )}
        <AnnotationLayer
          comments={comments}
          activeId={activeId}
          onSelect={onActivate}
          drawing={drawing}
          onPlace={onPlace}
          assetId={image.id}
        />
      </div>
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function ImageReview() {
  const { projectId = '', resourceId = '' } = useParams<{ projectId: string; resourceId: string }>();
  const resources = getResources();
  const resource = resources.find(r => r.id === resourceId);
  const project = PROJECTS.find(p => p.id === projectId);

  const [rounds, setRounds] = useState<LocalRound[]>(SEED_ROUNDS);
  const [activeRound, setActiveRound] = useState(SEED_ROUNDS[SEED_ROUNDS.length - 1].v);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'gallery' | 'single'>('gallery');
  const [comments, setComments] = useState<RevisionComment[]>([]);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [drawing, setDrawing] = useState(false);
  const [pendingAnno, setPendingAnno] = useState<RevisionAnnotation | null>(null);
  const [addRoundOpen, setAddRoundOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [uploadModalOpen, setUploadModalOpen] = useState(false);
  const [pendingFiles, setPendingFiles] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => { if (resourceId) markResourceRead(resourceId); }, [resourceId]);

  const round = rounds.find(r => r.v === activeRound) ?? rounds[rounds.length - 1];
  const selectedImage = round.images.find(img => img.id === selectedImageId) ?? round.images[0];
  const contextLabel = selectedImage ? selectedImage.label : undefined;

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setPendingFiles(files);
    setUploadModalOpen(true);
    e.target.value = '';
  };

  const addFilesToRound = (targetRound: string) => {
    const newImages: MockImage[] = pendingFiles.map((f, i) => ({
      id: `upload-${Date.now()}-${i}`,
      label: f.name.replace(/\.[^.]+$/, ''),
      // Use real object URL so uploaded images render
      bg: URL.createObjectURL(f),
      aspect: '4/3',
    }));
    setRounds(prev => prev.map(r => r.v === targetRound
      ? { ...r, images: [...r.images, ...newImages] }
      : r
    ));
    setPendingFiles([]);
    setUploadModalOpen(false);
  };

  const addFilesAsNewRound = () => {
    const next = `R${rounds.length + 1}`;
    const today = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });
    const newImages: MockImage[] = pendingFiles.map((f, i) => ({
      id: `upload-${Date.now()}-${i}`,
      label: f.name.replace(/\.[^.]+$/, ''),
      bg: URL.createObjectURL(f),
      aspect: '4/3',
    }));
    setRounds(prev => [...prev, {
      v: next, label: `Ronde ${rounds.length + 1}`, date: today,
      author: USERS.lea, status: 'review', images: newImages,
    }]);
    setActiveRound(next);
    setPendingFiles([]);
    setUploadModalOpen(false);
  };

  // Clicking an image in gallery view opens single view
  const openSingle = (imgId: string) => {
    setSelectedImageId(imgId);
    setViewMode('single');
  };

  // Filter comments to current round + image
  const visibleComments = comments.filter(c => {
    if (!c.annotation) return c.contextLabel === round.v; // round-level comments
    return c.annotation.assetId === selectedImage?.id;
  });

  const handlePlace = (x: number, y: number) => {
    if (!selectedImage) return;
    setPendingAnno({ x, y, assetId: selectedImage.id });
    setDrawing(false);
  };

  const handleAddComment = (text: string) => {
    const newComment: RevisionComment = {
      id: `c${Date.now()}`,
      author: USERS.lea,
      text,
      status: 'open',
      replies: [],
      ...(pendingAnno ? { annotation: pendingAnno } : { contextLabel: round.v }),
    };
    setComments(prev => [...prev, newComment]);
    setPendingAnno(null);
    setActiveCommentId(newComment.id);
  };

  const handleResolve = (id: string) => {
    setComments(prev => prev.map(c => c.id === id ? { ...c, status: c.status === 'resolved' ? 'open' : 'resolved' } : c));
  };

  const handleReply = (id: string, text: string) => {
    setComments(prev => prev.map(c => c.id === id ? {
      ...c, replies: [...c.replies, { id: `r${Date.now()}`, author: USERS.lea, text }],
    } : c));
  };

  const addRound = () => {
    const next = `R${rounds.length + 1}`;
    const newRound: LocalRound = {
      v: next, label: `Ronde ${rounds.length + 1}`,
      date: new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' }),
      author: USERS.lea, status: 'review', images: [],
    };
    setRounds(prev => [...prev, newRound]);
    setActiveRound(next);
    setAddRoundOpen(false);
  };

  const deleteRound = (v: string) => {
    const updated = rounds.filter(r => r.v !== v);
    setRounds(updated);
    if (activeRound === v) setActiveRound(updated[updated.length - 1]?.v ?? '');
    setDeleteTarget(null);
  };

  if (!resource || !project) return <div style={{ padding: 32, color: 'var(--text-3)' }}>Ressource introuvable.</div>;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <ProjectHeaderBar projectId={projectId}>
        <input ref={fileInputRef} type="file" accept="image/*" multiple style={{ display: 'none' }} onChange={handleFileChange} />
        <SFButton variant="ghost" size="sm" icon="upload" onClick={() => fileInputRef.current?.click()}
          style={{ border: '1px solid var(--border)', borderRadius: 9, color: 'var(--text-2)' }}>
          Ajouter des images
        </SFButton>
        <SFButton variant="primary" icon="plus" onClick={() => setAddRoundOpen(true)}>Nouvelle ronde</SFButton>
      </ProjectHeaderBar>

      {/* Round selector + view toggle */}
      <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 6, alignItems: 'center', overflowX: 'auto', flexShrink: 0 }}>
        <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', flexShrink: 0, marginRight: 4 }}>Rondes</span>
        {rounds.map(r => {
          const active = r.v === activeRound;
          return (
            <div key={r.v} style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
              onMouseEnter={e => { const btn = (e.currentTarget as HTMLElement).querySelector('.rd-del') as HTMLElement; if (btn) btn.style.opacity = '1'; }}
              onMouseLeave={e => { const btn = (e.currentTarget as HTMLElement).querySelector('.rd-del') as HTMLElement; if (btn) btn.style.opacity = '0'; }}>
              <button onClick={() => setActiveRound(r.v)} style={{
                display: 'flex', alignItems: 'center', gap: 6, padding: '5px 12px',
                borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                background: active ? 'color-mix(in srgb, var(--accent) 12%, transparent)' : 'var(--surface-2)',
                color: active ? 'var(--accent)' : 'var(--text-2)', fontSize: 12, cursor: 'pointer',
                fontFamily: 'var(--ff-text)', fontWeight: active ? 600 : 400, paddingRight: 28,
              }}>
                <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[r.status], flexShrink: 0 }} />
                {r.label}
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

        {/* Spacer + view toggle */}
        <div style={{ marginLeft: 'auto', flexShrink: 0, display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 8, border: '1px solid var(--border)', padding: 2 }}>
          {(['gallery', 'single'] as const).map(mode => (
            <button key={mode} onClick={() => setViewMode(mode)} style={{
              display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 6, border: 'none', cursor: 'pointer',
              background: viewMode === mode ? 'var(--surface)' : 'transparent',
              color: viewMode === mode ? 'var(--text)' : 'var(--text-3)',
              fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: viewMode === mode ? 600 : 400,
              boxShadow: viewMode === mode ? '0 1px 3px rgba(0,0,0,0.3)' : 'none',
              transition: 'all 0.12s',
            }}>
              <SFIcon name={mode === 'gallery' ? 'layout-grid' : 'square'} size={12} />
              {mode === 'gallery' ? 'Galerie' : 'Individuel'}
            </button>
          ))}
        </div>
      </div>

      {/* Main layout */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {viewMode === 'gallery' ? (
          /* ── Gallery view ── */
          <>
            <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg)' }}>
              {round.images.length === 0 ? (
                <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                  <SFIcon name="image" size={40} color="var(--text-3)" />
                  <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Aucune image dans cette ronde</p>
                </div>
              ) : (
                <div style={{
                  display: 'grid',
                  gridTemplateColumns: `repeat(${GRID_COLS}, 1fr)`,
                  gridAutoRows: `${BASE_ROW_H}px`,
                  gridAutoFlow: 'dense',
                  gap: 10,
                }}>
                  {round.images.map(img => {
                    const { colSpan, rowSpan } = gridSpan(img.aspect);
                    const nComments = comments.filter(c => c.annotation?.assetId === img.id && c.status === 'open').length;
                    return (
                      <div
                        key={img.id}
                        onClick={() => openSingle(img.id)}
                        style={{
                          gridColumn: `span ${colSpan}`,
                          gridRow: `span ${rowSpan}`,
                          borderRadius: 10, overflow: 'hidden', cursor: 'pointer',
                          border: '1px solid var(--border)', position: 'relative',
                          transition: 'border-color 0.12s, transform 0.12s',
                        }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.transform = 'translateY(-2px)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.transform = 'none'; }}
                      >
                        {/* Fill the grid cell completely */}
                        <div style={{ width: '100%', height: '100%', position: 'relative' }}>
                          {img.bg.startsWith('blob:') || img.bg.startsWith('data:') ? (
                            <img src={img.bg} alt={img.label} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block' }} />
                          ) : (
                            <div style={{ width: '100%', height: '100%', background: img.bg, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                              <SFIcon name="image" size={28} color="rgba(255,255,255,0.15)" />
                            </div>
                          )}
                        </div>

                        {/* Comment badge */}
                        {nComments > 0 && (
                          <div style={{ position: 'absolute', top: 8, right: 8, display: 'flex', alignItems: 'center', gap: 4, background: 'var(--accent)', borderRadius: 20, padding: '3px 8px' }}>
                            <SFIcon name="message-circle" size={11} color="var(--on-accent)" />
                            <span style={{ fontSize: 10, fontWeight: 700, color: 'var(--on-accent)', fontFamily: 'var(--ff-mono)' }}>{nComments}</span>
                          </div>
                        )}

                        {/* Hover caption overlay */}
                        <div style={{
                          position: 'absolute', bottom: 0, left: 0, right: 0,
                          padding: '20px 12px 10px',
                          background: 'linear-gradient(to top, rgba(0,0,0,0.6) 0%, transparent 100%)',
                          display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between',
                        }}>
                          <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {img.label}
                          </p>
                          <SFIcon name="expand" size={12} color="rgba(255,255,255,0.6)" />
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Sidebar in gallery mode: shows all comments across all images */}
            <RevisionCommentSidebar
              comments={comments.filter(c => !c.annotation || round.images.some(img => img.id === c.annotation?.assetId))}
              activeId={activeCommentId}
              onActivate={id => { setActiveCommentId(id); if (id) { const c = comments.find(x => x.id === id); if (c?.annotation?.assetId) openSingle(c.annotation.assetId); } }}
              onAdd={text => { const nc: RevisionComment = { id: `c${Date.now()}`, author: USERS.lea, text, status: 'open', replies: [], contextLabel: round.v }; setComments(prev => [...prev, nc]); setActiveCommentId(nc.id); }}
              onResolve={handleResolve}
              onReply={handleReply}
              pendingAnnotation={false}
              onCancelPending={() => {}}
              drawing={false}
              onToggleDrawing={() => openSingle(round.images[0]?.id ?? '')}
              contextLabel={round.label}
            />
          </>
        ) : (
          /* ── Single image view ── */
          <>
            <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

              {/* Thumbnail strip */}
              <div style={{ width: 130, flexShrink: 0, overflowY: 'auto', borderRight: '1px solid var(--border)', padding: 8, display: 'flex', flexDirection: 'column', gap: 5, background: 'var(--surface)' }}>
                {round.images.length === 0 && (
                  <div style={{ padding: '20px 6px', textAlign: 'center' }}>
                    <SFIcon name="image" size={20} color="var(--text-3)" />
                    <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>Aucune image</p>
                  </div>
                )}
                {round.images.map(img => {
                  const isSelected = img.id === selectedImage?.id;
                  const imgCommentCount = comments.filter(c => c.annotation?.assetId === img.id && c.status === 'open').length;
                  return (
                    <button key={img.id} onClick={() => setSelectedImageId(img.id)} style={{
                      padding: 0, border: `2px solid ${isSelected ? 'var(--accent)' : 'transparent'}`,
                      borderRadius: 7, cursor: 'pointer', background: 'none', position: 'relative',
                      transition: 'border-color 0.12s',
                    }}>
                      <div style={{ aspectRatio: '4/3', background: img.bg, borderRadius: 5, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <SFIcon name="image" size={14} color="rgba(255,255,255,0.22)" />
                      </div>
                      {imgCommentCount > 0 && (
                        <div style={{ position: 'absolute', top: 3, right: 3, width: 14, height: 14, borderRadius: '50%', background: 'var(--accent)', fontSize: 8, fontWeight: 700, color: 'var(--on-accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-mono)' }}>
                          {imgCommentCount}
                        </div>
                      )}
                      <p style={{ fontSize: 8, color: 'var(--text-3)', padding: '2px 3px', textAlign: 'left', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', fontFamily: 'var(--ff-mono)' }}>
                        {img.label.split('—')[0].trim()}
                      </p>
                    </button>
                  );
                })}
              </div>

              {/* Main viewer */}
              <div style={{ flex: 1, overflowY: 'auto', padding: 24, background: 'var(--bg)' }}>
                {!selectedImage ? (
                  <div style={{ height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 12 }}>
                    <SFIcon name="image" size={40} color="var(--text-3)" />
                    <p style={{ color: 'var(--text-3)', fontSize: 13 }}>Sélectionnez une image à gauche</p>
                  </div>
                ) : (
                  <div style={{ maxWidth: 900, margin: '0 auto' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                        <button onClick={() => setViewMode('gallery')} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0, fontSize: 11, fontFamily: 'var(--ff-text)' }}>
                          <SFIcon name="arrow-left" size={12} />
                          Galerie
                        </button>
                        <span style={{ color: 'var(--border-2)' }}>·</span>
                        <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>{selectedImage.label}</p>
                      </div>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                        {round.images.indexOf(selectedImage) + 1} / {round.images.length}
                      </span>
                    </div>
                    <ImageViewer
                      image={selectedImage}
                      comments={comments}
                      activeId={activeCommentId}
                      onActivate={setActiveCommentId}
                      drawing={drawing}
                      onPlace={handlePlace}
                    />
                    {/* Dot navigation */}
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 10, marginTop: 14 }}>
                      {round.images.map(img => (
                        <button key={img.id} onClick={() => setSelectedImageId(img.id)} style={{
                          width: 8, height: 8, borderRadius: '50%', border: 'none', cursor: 'pointer', padding: 0,
                          background: img.id === selectedImage.id ? 'var(--accent)' : 'var(--surface-3)',
                          transition: 'background 0.12s',
                        }} title={img.label} />
                      ))}
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Right: comment sidebar */}
            <RevisionCommentSidebar
              comments={visibleComments}
              activeId={activeCommentId}
              onActivate={setActiveCommentId}
              onAdd={handleAddComment}
              onResolve={handleResolve}
              onReply={handleReply}
              pendingAnnotation={!!pendingAnno}
              onCancelPending={() => setPendingAnno(null)}
              drawing={drawing}
              onToggleDrawing={() => { setDrawing(d => !d); setPendingAnno(null); }}
              contextLabel={contextLabel}
            />
          </>
        )}
      </div>

      {/* Add round modal */}
      {addRoundOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setAddRoundOpen(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>Nouvelle ronde de révision</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              Une nouvelle ronde sera créée ({`R${rounds.length + 1}`}). Vous pourrez y téléverser de nouvelles images.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="secondary" onClick={() => setAddRoundOpen(false)}>Annuler</SFButton>
              <SFButton variant="primary" icon="plus" onClick={addRound}>Créer la ronde</SFButton>
            </div>
          </div>
        </div>
      )}

      {/* Upload modal */}
      {uploadModalOpen && pendingFiles.length > 0 && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => { setUploadModalOpen(false); setPendingFiles([]); }} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 380, boxShadow: '0 16px 48px rgba(0,0,0,0.65)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 16 }}>
              {pendingFiles.length} image{pendingFiles.length > 1 ? 's' : ''} à ajouter
            </h3>
            {/* File list preview */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 160, overflowY: 'auto' }}>
              {pendingFiles.map((f, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                  <div style={{ width: 36, height: 28, borderRadius: 5, overflow: 'hidden', flexShrink: 0, background: 'var(--surface-3)' }}>
                    <img src={URL.createObjectURL(f)} alt="" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 600, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</p>
                    <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 1 }}>
                      {f.size >= 1e6 ? `${(f.size / 1e6).toFixed(1)} Mo` : `${Math.round(f.size / 1e3)} Ko`}
                    </p>
                  </div>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 12, color: 'var(--text-2)', marginBottom: 12 }}>Où ajouter ces images ?</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <button onClick={() => addFilesToRound(activeRound)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <SFIcon name="layers" size={18} color="var(--text-2)" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Ronde actuelle ({round.label})</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Ajoute les images à cette ronde</p>
                </div>
              </button>
              <button onClick={addFilesAsNewRound} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 14px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}>
                <SFIcon name="plus-circle" size={18} color="var(--text-2)" />
                <div>
                  <p style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Nouvelle ronde (R{rounds.length + 1})</p>
                  <p style={{ fontSize: 11, color: 'var(--text-3)' }}>Crée une nouvelle ronde avec ces images</p>
                </div>
              </button>
            </div>
            <button onClick={() => { setUploadModalOpen(false); setPendingFiles([]); }} style={{ marginTop: 16, width: '100%', padding: '7px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
              Annuler
            </button>
          </div>
        </div>
      )}

      {/* Delete round confirmation */}
      {deleteTarget && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 400, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <div onClick={() => setDeleteTarget(null)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
          <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, padding: 24, width: 340, boxShadow: '0 16px 48px rgba(0,0,0,0.6)' }}>
            <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 12 }}>Supprimer la ronde ?</h3>
            <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 20 }}>
              La ronde <strong>{rounds.find(r => r.v === deleteTarget)?.label}</strong> et toutes ses images seront supprimées.
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
