import { useState, useRef, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFIcon, SFButton, SFPill, SFAvatar } from '../components/ui';
import { getResources, updateResource } from '../data/resourceStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import { PROJECTS } from '../data/mock';

interface Annotation {
  id: string;
  // Page-absolute pixel coordinates (from top-left of the scrollable page, not the viewport)
  x: number;
  y: number;
  text: string;
  author: string;
  authorInitials: string;
  authorColor: string;
  resolved: boolean;
  createdAt: string;
}

// Demo annotations stored in page-pixel coordinates
const DEMO_ANNOTATIONS: Annotation[] = [
  { id: 'a1', x: 300, y: 150, text: 'Le logo est trop petit sur mobile. Agrandir à 48px minimum.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: false, createdAt: 'Il y a 2h' },
  { id: 'a2', x: 650, y: 380, text: 'Cette section manque de contraste. Tester avec un fond plus foncé.', author: 'Marc Dupont', authorInitials: 'MD', authorColor: '#1a6b4a', resolved: false, createdAt: 'Il y a 45 min' },
  { id: 'a3', x: 420, y: 620, text: 'CTA bien placé, approuvé.', author: 'Léa Marchand', authorInitials: 'LM', authorColor: '#3b4f8f', resolved: true, createdAt: 'Hier' },
];

function Pin({
  screenLeft,
  screenTop,
  ann,
  index,
  selected,
  onClick,
}: {
  screenLeft: number;
  screenTop: number;
  ann: Annotation;
  index: number;
  selected: boolean;
  onClick: () => void;
}) {
  // Hide pins that are scrolled out of the visible area
  if (screenLeft < -5 || screenLeft > 105 || screenTop < -5 || screenTop > 105) return null;
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      title={ann.text}
      style={{
        position: 'absolute',
        left: `${screenLeft}%`,
        top: `${screenTop}%`,
        transform: 'translate(-50%, -50%)',
        width: 22,
        height: 22,
        borderRadius: '50%',
        background: ann.resolved
          ? 'rgba(34,197,94,0.2)'
          : selected
          ? 'var(--accent)'
          : 'rgba(249,200,0,0.2)',
        border: `2px solid ${ann.resolved ? 'rgba(34,197,94,0.8)' : selected ? 'var(--accent)' : 'rgba(249,200,0,0.85)'}`,
        cursor: 'pointer',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: selected ? 20 : 10,
        transition: 'box-shadow 0.12s',
        boxShadow: selected ? '0 0 0 3px rgba(249,200,0,0.25)' : '0 2px 8px rgba(0,0,0,0.4)',
        fontFamily: 'var(--ff-mono)',
        fontSize: 9,
        fontWeight: 700,
        color: ann.resolved ? 'rgba(34,197,94,0.9)' : selected ? '#000' : 'rgba(249,200,0,0.95)',
        padding: 0,
        flexShrink: 0,
      }}
    >
      {ann.resolved ? '✓' : index + 1}
    </button>
  );
}

export function WebReview() {
  const navigate = useNavigate();
  const { projectId, resourceId } = useParams();
  const resource = getResources().find(r => r.id === resourceId);
  const project = PROJECTS.find(p => p.id === projectId) ?? PROJECTS[0];

  const [localTitle, setLocalTitle] = useState(resource?.title ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(resource?.title ?? '');
  const [localDesc, setLocalDesc] = useState(resource?.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(resource?.description ?? '');
  const [editingUrl, setEditingUrl] = useState(false);
  const [urlVal, setUrlVal] = useState(resource?.webUrl ?? '');

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
  const commitUrl = () => {
    const trimmed = urlVal.trim();
    const normalized = trimmed && !trimmed.startsWith('http') ? 'https://' + trimmed : trimmed;
    if (normalized && resource) {
      updateResource(resource.id, { webUrl: normalized });
      setUrlVal(normalized);
    } else {
      setUrlVal(resource?.webUrl ?? '');
    }
    setEditingUrl(false);
  };

  const [annotations, setAnnotations] = useState<Annotation[]>(DEMO_ANNOTATIONS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addingPin, setAddingPin] = useState(false);
  // pendingPos stored in page-pixel coordinates
  const [pendingPos, setPendingPos] = useState<{ x: number; y: number } | null>(null);
  const [draftText, setDraftText] = useState('');
  const [showResolved, setShowResolved] = useState(true);
  const [sidebarTab, setSidebarTab] = useState<'annotations' | 'info'>('annotations');
  const [iframeBlocked, setIframeBlocked] = useState(false);
  const [iframeLoading, setIframeLoading] = useState(true);
  const [isFullscreen, setIsFullscreen] = useState(false);
  // Track iframe scroll position to keep annotation pins anchored to page content
  const [iframeScroll, setIframeScroll] = useState({ x: 0, y: 0 });

  const canvasRef = useRef<HTMLDivElement>(null);
  const draftRef = useRef<HTMLTextAreaElement>(null);
  const iframeRef = useRef<HTMLIFrameElement>(null);

  const url = resource?.webUrl ?? 'https://example.com';
  const host = url.replace(/^https?:\/\//, '').split('/')[0];
  const proxyUrl = `/web-proxy/${encodeURIComponent(url)}`;

  useEffect(() => {
    if (pendingPos && draftRef.current) draftRef.current.focus();
  }, [pendingPos]);

  useEffect(() => {
    setIframeBlocked(false);
    setIframeLoading(true);
    setIframeScroll({ x: 0, y: 0 });
    const timer = setTimeout(() => setIframeLoading(false), 8000);
    return () => clearTimeout(timer);
  }, [proxyUrl]);

  // Attach scroll listener to iframe document so pins follow page content
  useEffect(() => {
    if (iframeLoading) return;
    const doc = iframeRef.current?.contentDocument;
    if (!doc) return;
    const target = doc.scrollingElement ?? doc.documentElement;
    const onScroll = () => setIframeScroll({ x: target.scrollLeft, y: target.scrollTop });
    doc.addEventListener('scroll', onScroll, { passive: true });
    return () => doc.removeEventListener('scroll', onScroll);
  }, [iframeLoading]);

  // Convert page-pixel coords to screen % of the canvas viewport
  const toScreenPct = (pageX: number, pageY: number) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect || rect.width === 0) return { left: 0, top: 0 };
    const left = ((pageX - iframeScroll.x) / rect.width) * 100;
    const top = ((pageY - iframeScroll.y) / rect.height) * 100;
    return { left, top };
  };

  const handleCanvasClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    const doc = iframeRef.current?.contentDocument;
    const target = doc?.scrollingElement ?? doc?.documentElement;
    const scrollX = target?.scrollLeft ?? 0;
    const scrollY = target?.scrollTop ?? 0;
    // Store as page-absolute pixels so pins stay anchored when scrolling
    const pageX = (e.clientX - rect.left) + scrollX;
    const pageY = (e.clientY - rect.top) + scrollY;
    setPendingPos({ x: pageX, y: pageY });
  };

  const commitAnnotation = () => {
    if (!pendingPos || !draftText.trim()) return;
    const ann: Annotation = {
      id: `a${Date.now()}`,
      x: pendingPos.x,
      y: pendingPos.y,
      text: draftText.trim(),
      author: 'Moi',
      authorInitials: 'MO',
      authorColor: '#5b3ea8',
      resolved: false,
      createdAt: 'À l\'instant',
    };
    setAnnotations(prev => [...prev, ann]);
    setSelectedId(ann.id);
    setPendingPos(null);
    setDraftText('');
    setAddingPin(false);
  };

  const toggleResolved = (id: string) => {
    setAnnotations(prev => prev.map(a => a.id === id ? { ...a, resolved: !a.resolved } : a));
  };

  const deleteAnnotation = (id: string) => {
    setAnnotations(prev => prev.filter(a => a.id !== id));
    if (selectedId === id) setSelectedId(null);
  };

  const visible = annotations.filter(a => showResolved || !a.resolved);
  const openCount = annotations.filter(a => !a.resolved).length;

  // Pending pin screen position
  const pendingScreen = pendingPos ? toScreenPct(pendingPos.x, pendingPos.y) : null;

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(isFullscreen ? { position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg)' } : {}) }}>
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'flex-end', gap: 8, flexShrink: 0 }}>
        {/* Back button */}
        <button onClick={() => navigate(-1)} title="Retour"
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0, marginRight: 'auto' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
          <SFIcon name="arrow-left" size={14} />
        </button>
        {resource && (
          <SFPill status={resource.status} small>{resource.statusLabel}</SFPill>
        )}
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={e => e.stopPropagation()}
          style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-mono)', textDecoration: 'none', cursor: 'pointer' }}
        >
          <SFIcon name="external-link" size={12} />
          {host}
        </a>
        <SFButton
          variant={addingPin ? 'primary' : 'ghost'}
          size="sm"
          icon="message-circle"
          onClick={() => { setAddingPin(o => !o); setPendingPos(null); setDraftText(''); }}
        >
          {addingPin ? 'Annuler' : 'Annoter'}
        </SFButton>
        {resource && <RequestApprovalButton resource={resource} projectId={projectId} />}
        <button onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? 'Quitter le plein écran' : 'Plein écran'}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
          <SFIcon name={isFullscreen ? 'minimize-2' : 'maximize-2'} size={14}  />
        </button>
      </div>

      <div style={{ flex: 1, minHeight: 0, display: 'flex', overflow: 'hidden' }}>
        {/* Canvas area */}
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', background: 'var(--surface-2)' }}>
          {/* Browser chrome bar */}
          <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <div style={{ display: 'flex', gap: 5 }}>
              {['#ff5f57','#febc2e','#28c840'].map(c => <div key={c} style={{ width: 10, height: 10, borderRadius: '50%', background: c }} />)}
            </div>
            <div style={{ flex: 1, background: 'var(--surface-2)', borderRadius: 6, height: 26, display: 'flex', alignItems: 'center', padding: '0 10px', gap: 6, border: '1px solid var(--border)' }}>
              <SFIcon name="lock" size={10} color="var(--text-3)" />
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{url}</span>
            </div>
            <SFIcon name="refresh-cw" size={13} color="var(--text-3)" />
          </div>

          {/* Annotation hint */}
          {addingPin && (
            <div style={{ flexShrink: 0, background: 'color-mix(in srgb, var(--accent) 10%, transparent)', borderBottom: '1px solid color-mix(in srgb, var(--accent) 30%, transparent)', padding: '7px 16px', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SFIcon name="crosshair" size={13} color="var(--accent)" />
              <span style={{ fontSize: 12, color: 'var(--accent)', fontWeight: 500 }}>Cliquez sur la capture pour placer une annotation</span>
            </div>
          )}

          {/* Page canvas */}
          <div
            ref={canvasRef}
            style={{
              flex: 1,
              minHeight: 0,
              position: 'relative',
              overflow: 'hidden',
              background: 'var(--surface-2)',
            }}
          >
            {/* Real iframe */}
            {!iframeBlocked && (
              <iframe
                ref={iframeRef}
                key={proxyUrl}
                src={proxyUrl}
                title={resource?.title ?? 'Site web'}
                sandbox="allow-same-origin allow-scripts allow-forms allow-popups allow-popups-to-escape-sandbox"
                style={{
                  width: '100%',
                  height: '100%',
                  border: 'none',
                  display: 'block',
                  pointerEvents: addingPin ? 'none' : 'auto',
                  opacity: iframeLoading ? 0 : 1,
                  transition: 'opacity 0.2s',
                }}
                onLoad={() => {
                  setIframeLoading(false);
                  try {
                    const doc = iframeRef.current?.contentDocument;
                    const body = doc?.body?.textContent ?? '';
                    if (body.startsWith('Proxy error:')) setIframeBlocked(true);
                  } catch {
                    setIframeBlocked(true);
                  }
                }}
                onError={() => { setIframeBlocked(true); setIframeLoading(false); }}
              />
            )}

            {/* Loading spinner */}
            {iframeLoading && !iframeBlocked && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12 }}>
                <div style={{ width: 28, height: 28, border: '2px solid var(--border)', borderTopColor: 'var(--accent)', borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>Chargement de {host}…</span>
              </div>
            )}

            {/* Blocked / error state */}
            {iframeBlocked && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 14, padding: 32, textAlign: 'center' }}>
                <SFIcon name="shield-off" size={36} color="var(--text-3)" />
                <div>
                  <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)', marginBottom: 6 }}>Ce site bloque l'intégration</p>
                  <p style={{ fontSize: 12, color: 'var(--text-3)', lineHeight: 1.6, maxWidth: 320 }}>
                    <strong style={{ color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>{host}</strong> utilise un en-tête <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 4 }}>X-Frame-Options</code> qui empêche l'affichage dans un iframe. Les annotations restent disponibles ci-dessous.
                  </p>
                </div>
                <a
                  href={url}
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '8px 16px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-mono)', textDecoration: 'none' }}
                >
                  <SFIcon name="external-link" size={12} />
                  Ouvrir dans un nouvel onglet
                </a>
              </div>
            )}

            {/* Annotation click-capture overlay (only active in annotating mode) */}
            {addingPin && !pendingPos && (
              <div
                onClick={handleCanvasClick}
                style={{ position: 'absolute', inset: 0, cursor: 'crosshair', zIndex: 5 }}
              />
            )}

            {/* Annotation pins overlay — positions recomputed from page coords + scroll offset */}
            {visible.map((ann, i) => {
              const { left, top } = toScreenPct(ann.x, ann.y);
              return (
                <Pin
                  key={ann.id}
                  screenLeft={left}
                  screenTop={top}
                  ann={ann}
                  index={i}
                  selected={selectedId === ann.id}
                  onClick={() => setSelectedId(selectedId === ann.id ? null : ann.id)}
                />
              );
            })}

            {/* Pending pin (draft) */}
            {pendingPos && pendingScreen && (
              <div
                style={{
                  position: 'absolute',
                  left: `${pendingScreen.left}%`,
                  top: `${pendingScreen.top}%`,
                  transform: 'translate(-50%, -50%)',
                  zIndex: 30,
                }}
                onClick={e => e.stopPropagation()}
              >
                <div style={{ width: 22, height: 22, borderRadius: '50%', background: 'rgba(249,200,0,0.3)', border: '2px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: 4 }}>
                  <SFIcon name="plus" size={10} color="var(--accent)" />
                </div>
                <div style={{
                  position: 'absolute', left: '50%', top: 28,
                  transform: 'translateX(-50%)',
                  background: 'var(--surface)', border: '1px solid var(--border-2)',
                  borderRadius: 10, padding: 12, width: 240,
                  boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
                }}>
                  <textarea
                    ref={draftRef}
                    value={draftText}
                    onChange={e => setDraftText(e.target.value)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitAnnotation(); }
                      if (e.key === 'Escape') { setPendingPos(null); setDraftText(''); }
                    }}
                    placeholder="Votre annotation… (Entrée pour valider)"
                    rows={3}
                    style={{
                      width: '100%', boxSizing: 'border-box', resize: 'none',
                      border: '1px solid var(--border-2)', borderRadius: 7,
                      background: 'var(--surface-2)', color: 'var(--text)',
                      fontSize: 12, fontFamily: 'var(--ff-text)', lineHeight: 1.5,
                      padding: '7px 10px', outline: 'none', marginBottom: 8,
                    }}
                  />
                  <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }}>
                    <button onClick={() => { setPendingPos(null); setDraftText(''); }} style={{ padding: '5px 10px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Annuler</button>
                    <button onClick={commitAnnotation} disabled={!draftText.trim()} style={{ padding: '5px 12px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: '#000', fontSize: 11, fontWeight: 600, cursor: draftText.trim() ? 'pointer' : 'not-allowed', opacity: draftText.trim() ? 1 : 0.5, fontFamily: 'var(--ff-text)' }}>Ajouter</button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Sidebar */}
        <div style={{ width: 300, flexShrink: 0, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', background: 'var(--surface)', overflow: 'hidden' }}>
          {/* Sidebar tabs */}
          <div style={{ flexShrink: 0, borderBottom: '1px solid var(--border)', display: 'flex' }}>
            {(['annotations', 'info'] as const).map(t => (
              <button
                key={t}
                onClick={() => setSidebarTab(t)}
                style={{
                  flex: 1, padding: '11px 0', border: 'none', background: 'none', cursor: 'pointer',
                  fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                  color: sidebarTab === t ? 'var(--text)' : 'var(--text-3)',
                  borderBottom: sidebarTab === t ? '2px solid var(--accent)' : '2px solid transparent',
                  transition: 'color 0.12s',
                }}
              >
                {t === 'annotations' ? `Annotations ${openCount > 0 ? `(${openCount})` : ''}` : 'Infos'}
              </button>
            ))}
          </div>

          {sidebarTab === 'annotations' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <div style={{ padding: '10px 14px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {annotations.length} annotations
                </span>
                <button
                  onClick={() => setShowResolved(o => !o)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: 10, color: showResolved ? 'var(--text-2)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                >
                  <SFIcon name={showResolved ? 'eye' : 'eye-off'} size={11} />
                  Résolues
                </button>
              </div>

              {visible.length === 0 && (
                <div style={{ padding: '32px 20px', textAlign: 'center' }}>
                  <SFIcon name="message-circle" size={28} color="var(--text-3)" />
                  <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10, lineHeight: 1.5 }}>Aucune annotation visible.<br />Cliquez sur "Annoter" pour en ajouter.</p>
                </div>
              )}

              {visible.map((ann, i) => (
                <div
                  key={ann.id}
                  onClick={() => setSelectedId(selectedId === ann.id ? null : ann.id)}
                  style={{
                    padding: '12px 14px', borderBottom: '1px solid var(--border)',
                    cursor: 'pointer',
                    background: selectedId === ann.id ? 'var(--surface-2)' : 'transparent',
                    transition: 'background 0.12s',
                    opacity: ann.resolved ? 0.6 : 1,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', flexShrink: 0,
                      background: ann.resolved ? 'rgba(34,197,94,0.15)' : 'rgba(249,200,0,0.15)',
                      border: `1.5px solid ${ann.resolved ? 'rgba(34,197,94,0.6)' : 'rgba(249,200,0,0.6)'}`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontFamily: 'var(--ff-mono)', fontSize: 9, fontWeight: 700,
                      color: ann.resolved ? 'rgba(34,197,94,0.9)' : 'rgba(249,200,0,0.95)',
                    }}>
                      {ann.resolved ? '✓' : i + 1}
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, color: 'var(--text)', lineHeight: 1.5, marginBottom: 6, textDecoration: ann.resolved ? 'line-through' : 'none' }}>{ann.text}</p>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <SFAvatar initials={ann.authorInitials} bg={ann.authorColor} size={16} />
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>{ann.author} · {ann.createdAt}</span>
                      </div>
                    </div>
                  </div>
                  {selectedId === ann.id && (
                    <div style={{ display: 'flex', gap: 6, marginTop: 10, paddingLeft: 28 }}>
                      <button
                        onClick={e => { e.stopPropagation(); toggleResolved(ann.id); }}
                        style={{ flex: 1, padding: '5px 0', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface-3)', color: ann.resolved ? 'var(--ok)' : 'var(--text-2)', fontSize: 10, fontFamily: 'var(--ff-mono)', cursor: 'pointer', textTransform: 'uppercase', letterSpacing: '0.05em' }}
                      >
                        {ann.resolved ? 'Réouvrir' : 'Résoudre'}
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); deleteAnnotation(ann.id); }}
                        style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border-2)', background: 'var(--surface-3)', color: 'var(--danger)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center' }}
                      >
                        <SFIcon name="trash-2" size={12} />
                      </button>
                    </div>
                  )}
                </div>
              ))}
            </div>
          )}

          {sidebarTab === 'info' && (
            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 16 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <div>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Ressource</p>
                  {editingTitle ? (
                    <input
                      autoFocus
                      value={titleVal}
                      onChange={e => setTitleVal(e.target.value)}
                      onBlur={commitTitle}
                      onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleVal(localTitle); setEditingTitle(false); } }}
                      style={{ fontSize:13, fontWeight:600, background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:5, padding:'1px 6px', outline:'none', color:'var(--text)', width:'100%' }}
                    />
                  ) : (
                    <p onClick={() => setEditingTitle(true)} title="Cliquer pour renommer" style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)', cursor:'text', display:'inline-flex', alignItems:'center', gap:5 }}>
                      {localTitle || (resource?.title ?? 'Site web')}
                      <SFIcon name="pencil" size={10} color="var(--text-3)" />
                    </p>
                  )}
                  {editingDesc ? (
                    <textarea
                      autoFocus
                      value={descVal}
                      onChange={e => setDescVal(e.target.value)}
                      onBlur={commitDesc}
                      onKeyDown={e => { if (e.key === 'Escape') { setDescVal(localDesc); setEditingDesc(false); } }}
                      style={{ fontSize:11, color:'var(--text-2)', background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:5, padding:'2px 6px', outline:'none', resize:'none', width:'100%', fontFamily:'var(--ff-text)', marginTop:4, display:'block' }}
                      rows={2}
                    />
                  ) : (
                    <p onClick={() => setEditingDesc(true)} title="Cliquer pour modifier la description" style={{ fontSize:11, color: localDesc ? 'var(--text-2)' : 'var(--text-3)', cursor:'text', marginTop:4, fontStyle: localDesc ? 'normal' : 'italic' }}>
                      {localDesc || 'Ajouter une description...'}
                    </p>
                  )}
                  {resource && <div style={{ marginTop: 6 }}><SFPill status={resource.status} small>{resource.statusLabel}</SFPill></div>}
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>URL</p>
                  {editingUrl ? (
                    <input
                      autoFocus
                      value={urlVal}
                      onChange={e => setUrlVal(e.target.value)}
                      onBlur={commitUrl}
                      onKeyDown={e => { if (e.key === 'Enter') commitUrl(); if (e.key === 'Escape') { setUrlVal(resource?.webUrl ?? ''); setEditingUrl(false); } }}
                      placeholder="https://www.exemple.com"
                      style={{ width: '100%', boxSizing: 'border-box', fontSize: 12, fontFamily: 'var(--ff-mono)', background: 'var(--surface-2)', border: '1px solid var(--accent)', borderRadius: 6, padding: '5px 8px', outline: 'none', color: 'var(--text)' }}
                    />
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <a href={url} target="_blank" rel="noopener noreferrer" style={{ fontSize: 12, color: 'var(--accent)', fontFamily: 'var(--ff-mono)', wordBreak: 'break-all', textDecoration: 'none', flex: 1 }}>{url}</a>
                      <button
                        onClick={() => { setUrlVal(url); setEditingUrl(true); }}
                        title="Changer l'URL"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, borderRadius: 4, display: 'flex', alignItems: 'center', flexShrink: 0 }}
                      >
                        <SFIcon name="pencil" size={11} />
                      </button>
                    </div>
                  )}
                </div>
                <div>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6 }}>Statut des annotations</p>
                  <div style={{ display: 'flex', gap: 10 }}>
                    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--text)' }}>{annotations.filter(a => !a.resolved).length}</p>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Ouvertes</p>
                    </div>
                    <div style={{ flex: 1, padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'center' }}>
                      <p style={{ fontSize: 18, fontWeight: 700, color: 'var(--ok)' }}>{annotations.filter(a => a.resolved).length}</p>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>Résolues</p>
                    </div>
                  </div>
                </div>
                <div style={{ paddingTop: 8, borderTop: '1px solid var(--border)' }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 8 }}>Changer le statut</p>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    {[
                      { status: 'ok' as const, label: 'Terminé' },
                      { status: 'info' as const, label: 'En cours' },
                      { status: 'warn' as const, label: 'À faire' },
                      { status: 'review' as const, label: 'En révision' },
                      { status: 'danger' as const, label: 'Bloqué' },
                    ].map(opt => (
                      <button
                        key={opt.status}
                        onClick={() => resource && updateResource(resource.id, { status: opt.status, statusLabel: opt.label })}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}
                      >
                        <SFPill status={opt.status} small>{opt.label}</SFPill>
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
