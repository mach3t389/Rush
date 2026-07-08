import React, { useState, useRef, useCallback, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useParams, useSearchParams, useNavigate } from 'react-router-dom';
import { SFPill, SFAvatar, SFButton, SFIcon } from '../components/ui';
import { VIDEO_COMMENTS, VIDEO_VERSIONS, USERS } from '../data/mock';
import { getProjects } from '../data/projectStore';
import { getResources, updateResource, subscribeResources } from '../data/resourceStore';
import { RequestApprovalButton } from '../components/RequestApprovalButton';
import { getResourceContent, setResourceContent } from '../data/resourceContentStore';
import { setFileContent, getFileContent } from '../data/fileContentStore';
import { markResourceRead } from '../data/notificationStore';
import { incrementCommentCount } from '../data/commentStore';
import { addDeliverable } from '../data/taskStore';
import { STATUS_COLOR } from '../data/status';
import type { Resource, Status } from '../types';

// ── Types ──────────────────────────────────────────────────────────────────────

type DrawTool = 'point' | 'circle' | 'arrow';

type ReviewStatus = 'open' | 'review' | 'approved' | 'closed';

interface Annotation {
  tool: DrawTool;
  x1: number; y1: number;
  x2: number; y2: number;
  color: string;
}

interface Reply {
  id: string;
  author: typeof USERS.lea;
  text: string;
}

interface LocalComment {
  id: string;
  versionId: string;
  author: typeof USERS.lea;
  text: string;
  timeLabel: string | null;
  timeSeconds: number | null;
  status: 'open' | 'resolved';
  annotation?: Annotation;
  replies: Reply[];
}

interface VideoTask {
  id: string;
  title: string;
  timeLabel?: string;
  done: boolean;
  priority: 'high' | 'normal' | 'low';
}

interface LocalVersion {
  v: string;
  status: Status;
  label: string;
  date: string;
  author: typeof USERS.lea;
  size?: number; // octets — taille du fichier de la version (visible dans la vue Stockage)
  mediaFileId?: string; // clé fileContentStore du média réel déposé (vidéo/audio)
  mediaName?: string;
  mediaType?: string;   // type MIME du média déposé
}

// Tailles plausibles par type d'upload + index de version (déterministe → stable).
const VERSION_BASE_BYTES: Record<string, number> = {
  video: 1_900_000_000, photo: 22_000_000, audio: 78_000_000, file: 5_200_000,
};
function mockVersionSize(subtype: string | undefined, idx: number): number {
  const base = VERSION_BASE_BYTES[subtype ?? 'video'] ?? VERSION_BASE_BYTES.video;
  return Math.round(base * (0.8 + idx * 0.13));
}

// ── Helpers ────────────────────────────────────────────────────────────────────

function secsToLabel(s: number): string {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${String(sec).padStart(2, '0')}`;
}

const DEFAULT_TOTAL = 208;

// Plausible upload dates for the seeded versions
const VERSION_SEED_DATES: Record<string, string> = {
  V1: '2 juin', V2: '5 juin', V3: '8 juin', V4: '10 juin',
};

const TODAY_LABEL = new Date().toLocaleDateString('fr-FR', { day: 'numeric', month: 'long' });

const REVIEW_STATUSES: { key: ReviewStatus; labelKey: string; status: 'review' | 'ok' | 'warn' | 'neutral' }[] = [
  { key: 'open',     labelKey: 'review.statusOpen',     status: 'neutral' },
  { key: 'review',   labelKey: 'review.statusInReview', status: 'review'  },
  { key: 'approved', labelKey: 'review.statusApproved', status: 'ok'      },
  { key: 'closed',   labelKey: 'review.statusClosed',   status: 'warn'    },
];

const TEAM = Object.values(USERS);

// ── Annotation SVG overlay ────────────────────────────────────────────────────

function AnnotationLayer({
  annotations, activeId, pending, drawing, drawTool, repositioning,
  onMouseDown, onMouseMove, onMouseUp, onClick,
}: {
  annotations: { id: string; annotation: Annotation }[];
  activeId: string | null;
  pending: Annotation | null;
  drawing: Annotation | null;
  drawTool: DrawTool | null;
  repositioning?: boolean;
  onMouseDown: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseMove: (e: React.MouseEvent<SVGSVGElement>) => void;
  onMouseUp: (e: React.MouseEvent<SVGSVGElement>) => void;
  onClick?: (e: React.MouseEvent<SVGSVGElement>) => void;
}) {
  const renderAnnotation = (ann: Annotation, key: string, opacity = 1, dashed = false) => {
    const strokeProps = { stroke: ann.color, strokeWidth: 2.5, fill: 'none', strokeDasharray: dashed ? '6 3' : undefined, opacity };
    const x1 = `${ann.x1 * 100}%`; const y1 = `${ann.y1 * 100}%`;
    const x2 = `${ann.x2 * 100}%`; const y2 = `${ann.y2 * 100}%`;
    if (ann.tool === 'point') {
      return (
        <g key={key} opacity={opacity}>
          <circle cx={x1} cy={y1} r="14" fill={ann.color} fillOpacity={0.2} stroke={ann.color} strokeWidth={2.5} strokeDasharray={dashed ? '6 3' : undefined} />
          <circle cx={x1} cy={y1} r="4" fill={ann.color} />
          <line x1={`${ann.x1 * 100 - 2}%`} y1={y1} x2={`${ann.x1 * 100 + 2}%`} y2={y1} stroke={ann.color} strokeWidth={2} opacity={0.7} />
          <line x1={x1} y1={`${ann.y1 * 100 - 2}%`} x2={x1} y2={`${ann.y1 * 100 + 2}%`} stroke={ann.color} strokeWidth={2} opacity={0.7} />
        </g>
      );
    }
    if (ann.tool === 'circle') {
      const cx = (ann.x1 + ann.x2) / 2 * 100; const cy = (ann.y1 + ann.y2) / 2 * 100;
      const rx = Math.abs(ann.x2 - ann.x1) / 2 * 100; const ry = Math.abs(ann.y2 - ann.y1) / 2 * 100;
      return <ellipse key={key} cx={`${cx}%`} cy={`${cy}%`} rx={`${rx}%`} ry={`${ry}%`} fill={ann.color} fillOpacity={0.1} {...strokeProps} />;
    }
    if (ann.tool === 'arrow') {
      const markerId = `arrow-${key.replace(/[^a-z0-9]/gi, '')}`;
      return (
        <g key={key}>
          <defs>
            <marker id={markerId} markerWidth="10" markerHeight="7" refX="9" refY="3.5" orient="auto">
              <polygon points="0 0, 10 3.5, 0 7" fill={ann.color} opacity={opacity} />
            </marker>
          </defs>
          <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={ann.color} strokeWidth={2.5} strokeDasharray={dashed ? '6 3' : undefined} markerEnd={`url(#${markerId})`} opacity={opacity} />
        </g>
      );
    }
    return null;
  };

  return (
    <svg
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', cursor: (drawTool || repositioning) ? 'crosshair' : 'default', userSelect: 'none', pointerEvents: (drawTool || repositioning) ? 'auto' : 'none', zIndex: 2 }}
      onMouseDown={onMouseDown} onMouseMove={onMouseMove} onMouseUp={onMouseUp} onClick={onClick}
    >
      {annotations.map(({ id, annotation }) => renderAnnotation(annotation, id, activeId === id ? 1 : 0.65))}
      {pending && renderAnnotation(pending, 'pending', 1)}
      {drawing && renderAnnotation(drawing, 'drawing', 0.8, true)}
    </svg>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

interface VideoReviewContent {
  comments?: LocalComment[];
  versions?: LocalVersion[];
  activeVersion?: string;
  tasks?: VideoTask[];
}

export function VideoReviewBody({ resource, projectId, persistKey }: { resource: Resource; projectId?: string; persistKey?: string }) {
  const { t } = useTranslation();
  const persisted = persistKey ? getResourceContent<VideoReviewContent>(persistKey) : undefined;
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const [shared, setShared] = useState(false);

  const handleShare = () => {
    const url = window.location.href;
    if (navigator.clipboard?.writeText) navigator.clipboard.writeText(url).catch(() => {});
    setShared(true);
    setTimeout(() => setShared(false), 2000);
  };

  const [tab, setTab] = useState<'comments' | 'tasks'>('comments');

  // Focus comments panel when arriving from a notification link
  useEffect(() => {
    if (searchParams.get('focus') !== 'comments') return;
    setSearchParams({}, { replace: true });
    setTab('comments');
    setTimeout(() => {
      const el = document.getElementById('vr-comments-panel');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el.style.animation = 'highlight-flash 2s ease forwards';
      el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
    }, 120);
  }, []);

  const [localTitle, setLocalTitle] = useState(resource.title);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(resource.title);
  const [localDesc, setLocalDesc] = useState(resource.description ?? '');
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(resource.description ?? '');
  useEffect(() => { setLocalTitle(resource.title); setTitleVal(resource.title); }, [resource.title]);
  useEffect(() => { setLocalDesc(resource.description ?? ''); setDescVal(resource.description ?? ''); }, [resource.description]);

  const commitTitle = () => {
    const trimmed = titleVal.trim();
    if (trimmed && trimmed !== localTitle) { updateResource(resource.id, { title: trimmed }); setLocalTitle(trimmed); }
    else setTitleVal(localTitle);
    setEditingTitle(false);
  };
  const commitDesc = () => {
    const trimmed = descVal.trim();
    updateResource(resource.id, { description: trimmed || undefined });
    setLocalDesc(trimmed);
    setEditingDesc(false);
  };

  const isAudio = resource.mediaSubtype === 'audio';

  const [isFullscreen, setIsFullscreen] = useState(false);
  const [versionDropOpen, setVersionDropOpen] = useState(false);
  const [controlsVisible, setControlsVisible] = useState(true);
  const hideControlsTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [taskCreatedFlash, setTaskCreatedFlash] = useState(false);
  const [playing, setPlaying]     = useState(false);
  const [currentTime, setCurrentTime] = useState(63);
  const [muted, setMuted]         = useState(false);
  const [volume, setVolume]       = useState(1);
  const [showVolume, setShowVolume] = useState(false);

  // Versions (local, so they can be added / removed)
  const [versions, setVersions] = useState<LocalVersion[]>(() => {
    if (persisted?.versions) return persisted.versions.map((v, i) => ({ ...v, size: v.size ?? mockVersionSize(resource.mediaSubtype, i) }));
    if (persistKey) return [{ v: 'V1', status: 'review', label: 'Version initiale', date: TODAY_LABEL, author: USERS.lea, size: mockVersionSize(resource.mediaSubtype, 0) }];
    return VIDEO_VERSIONS.map((v, i) => ({
      v: v.v, status: v.status, label: v.label,
      date: VERSION_SEED_DATES[v.v] ?? '', author: USERS.lea,
      size: mockVersionSize(resource.mediaSubtype, i),
    }));
  });
  const initialActive = persisted?.activeVersion
    ?? (persistKey ? 'V1' : (VIDEO_VERSIONS.find(v => v.active)?.v ?? VIDEO_VERSIONS[VIDEO_VERSIONS.length - 1]?.v ?? 'V1'));
  const [activeVersion, setVersion] = useState(initialActive);

  // ── Média réel déposé (vidéo/audio) par version — session uniquement (blob en mémoire) ──
  const mediaRef = useRef<HTMLVideoElement | HTMLAudioElement>(null);
  const mediaFileInputRef = useRef<HTMLInputElement>(null);
  const [mediaDuration, setMediaDuration] = useState<number | null>(null);
  const [isMediaDragging, setIsMediaDragging] = useState(false);
  const activeVer = versions.find(v => v.v === activeVersion);
  const mediaUrl = activeVer?.mediaFileId ? getFileContent(activeVer.mediaFileId) : null;
  // Durée réelle du média si présent, sinon durée simulée par défaut
  const TOTAL = mediaUrl && mediaDuration ? mediaDuration : DEFAULT_TOTAL;

  // Dépose / remplace le média de la version active
  const assignMediaToActive = (file: File) => {
    const fileId = `media-${persistKey ?? resource.id}-${activeVersion}-${Date.now()}`;
    setFileContent(fileId, file);
    setVersions(prev => prev.map(v => v.v === activeVersion
      ? { ...v, mediaFileId: fileId, mediaName: file.name, mediaType: file.type, size: file.size }
      : v));
    setMediaDuration(null);
    setCurrentTime(0);
    setPlaying(false);
  };

  // Réinitialise la durée/lecture au changement de version (média différent)
  useEffect(() => { setMediaDuration(null); setCurrentTime(0); setPlaying(false); }, [activeVersion]);

  const [addVersionOpen, setAddVersionOpen] = useState(false);
  const [newVersionNote, setNewVersionNote] = useState('');
  const [versionToDelete, setVersionToDelete] = useState<LocalVersion | null>(null);
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editVersionKey, setEditVersionKey]     = useState('');
  const [editVersionLabel, setEditVersionLabel] = useState('');
  const [commentText, setCommentText] = useState('');
  const [withTimestamp, setWithTimestamp] = useState(true);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
  const [reviewStatus, setReviewStatus] = useState<ReviewStatus>('review');
  const [statusDropOpen, setStatusDropOpen] = useState(false);
  const [statusDropRect, setStatusDropRect] = useState<DOMRect | null>(null);
  const statusDropRef = useRef<HTMLButtonElement>(null);

  // Drawing
  const [drawTool, setDrawTool]   = useState<DrawTool | null>(null);
  const [pendingAnnotation, setPendingAnnotation] = useState<Annotation | null>(null);
  const [liveAnnotation, setLiveAnnotation]       = useState<Annotation | null>(null);
  const [repositioningAnnotationId, setRepositioningAnnotationId] = useState<string | null>(null);
  const drawStart = useRef<{ x: number; y: number } | null>(null);
  const videoFrameRef = useRef<HTMLDivElement>(null);

  const TOOL_COLORS: Record<DrawTool, string> = {
    point:  '#f9ff00',
    circle: '#00c2ff',
    arrow:  '#ff6b35',
  };

  const [comments, setComments] = useState<LocalComment[]>(() =>
    persisted?.comments ?? (persistKey ? [] : VIDEO_COMMENTS.map(c => ({
      id: c.id,
      versionId: 'V1',
      author: c.author as typeof USERS.lea,
      text: c.text,
      timeLabel: c.timeLabel,
      timeSeconds: c.timeSeconds,
      status: c.resolved ? 'resolved' : 'open',
      replies: [],
    })))
  );

  // Reply state per comment
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');

  // @mention support
  const [commentMentionQuery, setCommentMentionQuery] = useState<string | null>(null);
  const [commentMentionRect, setCommentMentionRect] = useState<DOMRect | null>(null);
  const [replyMentionQuery, setReplyMentionQuery] = useState<string | null>(null);
  const [replyMentionRect, setReplyMentionRect] = useState<DOMRect | null>(null);

  const [tasks, setTasks] = useState<VideoTask[]>(() =>
    persisted?.tasks ?? (persistKey ? [] : [
      { id: 'vt1', title: "Couper l'intro de 3 secondes", timeLabel: '0:08', done: false, priority: 'high' },
      { id: 'vt2', title: 'Mixer le volume de la musique', timeLabel: '1:14', done: false, priority: 'normal' },
    ])
  );

  // ── Persistance du contenu de révision par ressource ───────────────────────
  const vrPersistTimer = useRef<number | null>(null);
  const vrMounted = useRef(false);
  const vrSnapshotRef = useRef<VideoReviewContent | null>(null);
  useEffect(() => {
    const snapshot: VideoReviewContent = { comments, versions, activeVersion, tasks };
    vrSnapshotRef.current = snapshot;
    if (!persistKey) return;
    if (!vrMounted.current) { vrMounted.current = true; return; } // ne pas écrire au montage
    if (vrPersistTimer.current) clearTimeout(vrPersistTimer.current);
    vrPersistTimer.current = window.setTimeout(() => setResourceContent(persistKey, snapshot), 400);
  }, [persistKey, comments, versions, activeVersion, tasks]);
  // Flush la dernière modification en attente au démontage.
  useEffect(() => () => {
    if (persistKey && vrPersistTimer.current && vrSnapshotRef.current) {
      clearTimeout(vrPersistTimer.current);
      setResourceContent(persistKey, vrSnapshotRef.current);
    }
  }, [persistKey]);

  // ── Playback engine (simulated — advances currentTime in real wall-clock time) ──
  // Uses setInterval with a timestamp delta so playback stays accurate even when the
  // tab is backgrounded (rAF would freeze; intervals keep ticking).
  useEffect(() => {
    if (!playing || mediaUrl) return; // média réel : la lecture est pilotée par l'élément <video>/<audio>
    let last = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      setCurrentTime(t => {
        const next = t + dt;
        if (next >= TOTAL) { setPlaying(false); return TOTAL; }
        return next;
      });
    }, 100);
    return () => window.clearInterval(id);
  }, [playing, mediaUrl, TOTAL]);

  // Média réel : synchronise l'état `playing` avec l'élément <video>/<audio>
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !mediaUrl) return;
    if (playing) { el.play().catch(() => {}); } else { el.pause(); }
  }, [playing, mediaUrl]);

  // Positionne le média à `t` (état + élément réel)
  const seekTo = (t: number) => {
    const clamped = Math.max(0, Math.min(TOTAL, t));
    setCurrentTime(clamped);
    if (mediaRef.current && mediaUrl) mediaRef.current.currentTime = clamped;
    setActiveCommentId(null);
  };

  // Spacebar toggles play/pause (unless typing in a field)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = document.activeElement;
      const typing = el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA');
      if (e.key === 'Escape') {
        setRepositioningAnnotationId(null);
        setDrawTool(null);
        setPendingAnnotation(null);
      }
      if (e.code === 'Space' && !typing) {
        e.preventDefault();
        setCurrentTime(t => (t >= TOTAL ? 0 : t));
        setPlaying(p => !p);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const togglePlay = () => {
    if (mediaRef.current && mediaUrl && currentTime >= TOTAL) mediaRef.current.currentTime = 0;
    setCurrentTime(t => (t >= TOTAL ? 0 : t));
    setPlaying(p => {
      const next = !p;
      if (!next) { // pausing → always show controls
        if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
        setControlsVisible(true);
      }
      return next;
    });
  };

  const seekBy = (delta: number) => seekTo(currentTime + delta);

  const toggleMute = () => {
    const next = !muted;
    setMuted(next);
    if (mediaRef.current) mediaRef.current.muted = next;
  };

  const changeVolume = (v: number) => {
    setVolume(v);
    if (mediaRef.current) mediaRef.current.volume = v;
    if (v === 0) { setMuted(true); if (mediaRef.current) mediaRef.current.muted = true; }
    else if (muted) { setMuted(false); if (mediaRef.current) mediaRef.current.muted = false; }
  };

  useEffect(() => {
    if (!mediaRef.current) return;
    mediaRef.current.muted = muted;
    mediaRef.current.volume = volume;
  }, [mediaUrl]);

  // ── Version management ──
  const nextVersionName = () => {
    const nums = versions.map(v => parseInt(v.v.replace(/\D/g, ''), 10)).filter(n => !Number.isNaN(n));
    return `V${(nums.length ? Math.max(...nums) : 0) + 1}`;
  };

  const addVersion = () => {
    const name = nextVersionName();
    const newV: LocalVersion = {
      v: name, status: 'review', label: newVersionNote.trim() || t('review.statusInReview'),
      date: TODAY_LABEL, author: USERS.lea,
      size: mockVersionSize(resource.mediaSubtype, versions.length),
    };
    setVersions(p => [...p, newV]);
    setVersion(name);
    setNewVersionNote('');
    setAddVersionOpen(false);
  };

  const confirmDeleteVersion = () => {
    if (!versionToDelete) return;
    const target = versionToDelete;
    setVersions(prev => {
      const next = prev.filter(v => v.v !== target.v);
      if (activeVersion === target.v && next.length) setVersion(next[next.length - 1].v);
      return next;
    });
    setVersionToDelete(null);
  };

  const getNormPos = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    const svg = e.currentTarget as SVGSVGElement;
    const rect = svg.getBoundingClientRect();
    return {
      x: Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width)),
      y: Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height)),
    };
  }, []);

  const handleSvgMouseDown = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawTool) return;
    const { x, y } = getNormPos(e);
    drawStart.current = { x, y };
    setLiveAnnotation({ tool: drawTool, x1: x, y1: y, x2: x, y2: y, color: TOOL_COLORS[drawTool] });
  }, [drawTool, getNormPos]);

  const handleSvgMouseMove = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawTool || !drawStart.current) return;
    const { x, y } = getNormPos(e);
    setLiveAnnotation({ tool: drawTool, x1: drawStart.current.x, y1: drawStart.current.y, x2: x, y2: y, color: TOOL_COLORS[drawTool] });
  }, [drawTool, getNormPos]);

  const handleSvgMouseUp = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!drawTool || !drawStart.current) return;
    const { x, y } = getNormPos(e);
    setPendingAnnotation({ tool: drawTool, x1: drawStart.current.x, y1: drawStart.current.y, x2: x, y2: y, color: TOOL_COLORS[drawTool] });
    setLiveAnnotation(null);
    drawStart.current = null;
    setDrawTool(null);
    setTimeout(() => document.getElementById('vr-comment-input')?.focus(), 50);
  }, [drawTool, getNormPos]);

  const handleSvgClickForReposition = useCallback((e: React.MouseEvent<SVGSVGElement>) => {
    if (!repositioningAnnotationId) return;
    e.stopPropagation();
    const { x, y } = getNormPos(e);
    setComments(prev => prev.map(c => {
      if (c.id !== repositioningAnnotationId || !c.annotation) return c;
      const ann = c.annotation;
      const cx = (ann.x1 + ann.x2) / 2;
      const cy = (ann.y1 + ann.y2) / 2;
      const dx = x - cx; const dy = y - cy;
      return { ...c, annotation: { ...ann, x1: ann.x1 + dx, y1: ann.y1 + dy, x2: ann.x2 + dx, y2: ann.y2 + dy } };
    }));
    setRepositioningAnnotationId(null);
  }, [repositioningAnnotationId, getNormPos]);

  const removeAnnotationFromComment = (commentId: string) => {
    setComments(prev => prev.map(c => c.id === commentId ? { ...c, annotation: undefined } : c));
  };

  const deleteComment = (commentId: string) => {
    setComments(prev => prev.filter(c => c.id !== commentId));
    if (activeCommentId === commentId) setActiveCommentId(null);
  };

  const addComment = () => {
    if (!commentText.trim()) return;
    const ts = withTimestamp ? Math.round(currentTime) : null;
    const newC: LocalComment = {
      id: `c${Date.now()}`,
      versionId: activeVersion,
      author: USERS.lea,
      text: commentText.trim(),
      timeLabel: ts !== null ? secsToLabel(ts) : null,
      timeSeconds: ts,
      status: 'open',
      annotation: pendingAnnotation ?? undefined,
      replies: [],
    };
    setComments(p => [newC, ...p]);
    setCommentText('');
    setPendingAnnotation(null);
    setActiveCommentId(newC.id);
    if (resourceId) incrementCommentCount(resourceId);
  };

  const cycleCommentStatus = (id: string) =>
    setComments(p => p.map(c => c.id === id ? { ...c, status: c.status === 'resolved' ? 'open' : 'resolved' } : c));

  const convertToTask = (c: LocalComment) => {
    const newTask: VideoTask = { id: `vt${Date.now()}`, title: c.text.slice(0, 80), timeLabel: c.timeLabel ?? undefined, done: false, priority: 'normal' };
    setTasks(p => [...p, newTask]);
    if (projectId) {
      const project = getProjects().find(p => p.id === projectId);
      addDeliverable(projectId, {
        id: newTask.id,
        title: newTask.title,
        projectId: projectId,
        projectName: project?.name ?? '',
        projectColor: project?.clientColor ?? '#888',
        assignee: USERS.lea,
        status: '' as any,
        statusLabel: '',
        priority: 'normal',
        priorityLabel: 'Normal',
        dueDate: '',
        checked: false,
      });
    }
    setTaskCreatedFlash(true);
    setTimeout(() => setTaskCreatedFlash(false), 2000);
  };

  const addReply = (commentId: string) => {
    if (!replyText.trim()) return;
    const reply: Reply = { id: `r${Date.now()}`, author: USERS.lea, text: replyText.trim() };
    setComments(p => p.map(c => c.id === commentId ? { ...c, replies: [...c.replies, reply] } : c));
    setReplyText('');
    setReplyingTo(null);
  };

  const jumpToComment = (c: LocalComment) => {
    if (c.timeSeconds !== null) {
      setCurrentTime(c.timeSeconds);
      if (mediaRef.current && mediaUrl) mediaRef.current.currentTime = c.timeSeconds;
    }
    setActiveCommentId(c.id);
    setTab('comments');
  };

  const versionComments = comments.filter(c => c.versionId === activeVersion);
  const timedComments = versionComments.filter(c => c.timeSeconds !== null && c.status !== 'resolved').sort((a, b) => a.timeSeconds! - b.timeSeconds!);
  const goNextComment = () => { const next = timedComments.find(c => c.timeSeconds! > currentTime + 0.3); if (next) jumpToComment(next); };
  const goPrevComment = () => { const prev = [...timedComments].reverse().find(c => c.timeSeconds! < currentTime - 0.3); if (prev) jumpToComment(prev); };

  const showControls = () => {
    setControlsVisible(true);
    if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current);
    hideControlsTimer.current = setTimeout(() => {
      if (playing) setControlsVisible(false);
    }, 2500);
  };

  const removeMediaFromVersion = () => {
    setVersions(prev => prev.map(v => v.v === activeVersion ? { ...v, mediaFileId: undefined, mediaName: undefined, mediaType: undefined } : v));
    setComments(prev => prev.filter(c => c.versionId !== activeVersion));
    setMediaDuration(null); setCurrentTime(0); setPlaying(false);
  };

  const saveVersionEdit = () => {
    if (!editingVersionId) return;
    const newKey = editVersionKey.trim() || editingVersionId;
    setVersions(prev => prev.map(v => v.v === editingVersionId ? { ...v, v: newKey, label: editVersionLabel.trim() || v.label } : v));
    if (activeVersion === editingVersionId) setVersion(newKey);
    setEditingVersionId(null);
  };

  const openStatusDrop = () => {
    if (statusDropRef.current) {
      setStatusDropRect(statusDropRef.current.getBoundingClientRect());
      setStatusDropOpen(true);
    }
  };

  const handleCommentChange = (val: string, el: HTMLInputElement | null) => {
    setCommentText(val);
    const m = val.match(/@(\w*)$/);
    if (m) { setCommentMentionQuery(m[1]); if (el) setCommentMentionRect(el.getBoundingClientRect()); }
    else setCommentMentionQuery(null);
  };

  const pickCommentMention = (name: string) => {
    setCommentText(prev => prev.replace(/@\w*$/, `@${name} `));
    setCommentMentionQuery(null);
  };

  const handleReplyChange = (val: string, el: HTMLInputElement | null) => {
    setReplyText(val);
    const m = val.match(/@(\w*)$/);
    if (m) { setReplyMentionQuery(m[1]); if (el) setReplyMentionRect(el.getBoundingClientRect()); }
    else setReplyMentionQuery(null);
  };

  const pickReplyMention = (name: string) => {
    setReplyText(prev => prev.replace(/@\w*$/, `@${name} `));
    setReplyMentionQuery(null);
  };

  const renderMentions = (text: string) => text.split(/(@\S+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : part
  );

  // Only show annotations for the selected comment or those matching the current playback position (±0.5s)
  const annotatedComments = versionComments
    .filter(c => c.annotation && c.status !== 'resolved' && (
      c.id === activeCommentId ||
      (c.timeSeconds !== null && Math.abs(c.timeSeconds - currentTime) <= 0.5)
    ))
    .map(c => ({ id: c.id, annotation: c.annotation! }));
  const unresolvedCount   = versionComments.filter(c => c.status !== 'resolved').length;
  const openTaskCount     = tasks.filter(t => !t.done).length;

  const currentStatusMeta = REVIEW_STATUSES.find(s => s.key === reviewStatus)!;

  return (
    <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden', ...(isFullscreen ? { position: 'fixed', inset: 0, zIndex: 300, background: 'var(--bg)' } : {}) }}>

      {/* ── Versions dropdown + Annotation bar at top ── */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
        {/* Back button */}
        <button onClick={() => navigate(-1)} title={t('review.back')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
          <SFIcon name="arrow-left" size={14} />
        </button>
        {/* Compact version dropdown */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setVersionDropOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-2)', whiteSpace: 'nowrap' }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[versions.find(v => v.v === activeVersion)?.status ?? 'review'], flexShrink: 0 }} />
            <span style={{ color: 'var(--accent)', fontWeight: 600 }}>{activeVersion}</span>
            <span style={{ color: 'var(--text-3)', fontSize: 9 }}>{versions.find(v => v.v === activeVersion)?.label}</span>
            <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
          </button>
          {versionDropOpen && (
            <>
              <div onClick={() => setVersionDropOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 98 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 4px)', left: 0, zIndex: 99, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 280, padding: '4px 0', overflow: 'hidden' }}>
                {versions.map(v => (
                  <div key={v.v}>
                    {editingVersionId === v.v ? (
                      /* ── Inline edit form ── */
                      <div style={{ padding: '8px 12px', display: 'flex', flexDirection: 'column', gap: 6, background: 'var(--surface-2)' }}>
                        <div style={{ display: 'flex', gap: 6 }}>
                          <div style={{ flex: '0 0 60px' }}>
                            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 3 }}>{t('review.versionNumber')}</p>
                            <input value={editVersionKey} onChange={e => setEditVersionKey(e.target.value)}
                              style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--accent)', fontSize: 11, fontFamily: 'var(--ff-mono)', fontWeight: 700, outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
                          </div>
                          <div style={{ flex: 1 }}>
                            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', marginBottom: 3 }}>{t('review.notesLabel')}</p>
                            <input autoFocus value={editVersionLabel} onChange={e => setEditVersionLabel(e.target.value)}
                              onKeyDown={e => { if (e.key === 'Enter') saveVersionEdit(); if (e.key === 'Escape') setEditingVersionId(null); }}
                              placeholder={t('review.notesPlaceholder')}
                              style={{ width: '100%', padding: '5px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 11, outline: 'none', colorScheme: 'dark', boxSizing: 'border-box' }} />
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 5, justifyContent: 'flex-end' }}>
                          <button onClick={() => setEditingVersionId(null)} style={{ padding: '4px 10px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 10, cursor: 'pointer' }}>{t('review.cancel')}</button>
                          <button onClick={saveVersionEdit} style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 10, fontWeight: 600, cursor: 'pointer' }}>{t('review.save')}</button>
                        </div>
                        {/* Video actions for this version */}
                        {v.mediaFileId && (
                          <div style={{ display: 'flex', gap: 6, paddingTop: 4, borderTop: '1px solid var(--border)' }}>
                            <button onClick={() => { mediaFileInputRef.current?.click(); setEditingVersionId(null); }}
                              style={{ flex: 1, padding: '5px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4 }}>
                              <SFIcon name="refresh-cw" size={10} />{t('review.replaceVideo')}
                            </button>
                            <button onClick={() => { removeMediaFromVersion(); setEditingVersionId(null); }}
                              style={{ padding: '5px 8px', borderRadius: 6, border: '1px solid rgba(229,72,77,0.3)', background: 'transparent', color: 'var(--danger)', fontSize: 10, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}>
                              <SFIcon name="trash-2" size={10} />{t('review.delete')}
                            </button>
                          </div>
                        )}
                      </div>
                    ) : (
                      /* ── Normal version row ── */
                      <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.vrd-action').forEach(x => x.style.opacity = '1'); }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).querySelectorAll<HTMLElement>('.vrd-action').forEach(x => x.style.opacity = '0'); }}>
                        <button onClick={() => { setVersion(v.v); setVersionDropOpen(false); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: activeVersion === v.v ? 'var(--surface-2)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left', paddingRight: 60 }}>
                          <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[v.status], flexShrink: 0 }} />
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: activeVersion === v.v ? 'var(--accent)' : 'var(--text)', fontWeight: activeVersion === v.v ? 600 : 400, flexShrink: 0 }}>{v.v}</span>
                          <span style={{ fontSize: 11, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{v.label || '—'}</span>
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', flexShrink: 0 }}>{v.date}</span>
                        </button>
                        {/* Edit button */}
                        <button className="vrd-action" onClick={e => { e.stopPropagation(); setEditingVersionId(v.v); setEditVersionKey(v.v); setEditVersionLabel(v.label || ''); }}
                          title={t('review.edit')}
                          style={{ position: 'absolute', right: versions.length > 1 ? 28 : 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 3, borderRadius: 4, opacity: 0, transition: 'opacity 0.12s' }}>
                          <SFIcon name="pencil" size={11} />
                        </button>
                        {/* Delete version button */}
                        {versions.length > 1 && (
                          <button className="vrd-action" onClick={e => { e.stopPropagation(); setVersionToDelete(v); setVersionDropOpen(false); }}
                            title={t('review.deleteVersion')}
                            style={{ position: 'absolute', right: 6, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--danger)', display: 'flex', padding: 3, borderRadius: 4, opacity: 0, transition: 'opacity 0.12s' }}>
                            <SFIcon name="x" size={11} />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
                <div style={{ borderTop: '1px solid var(--border)', padding: '4px 0 2px' }}>
                  <button onClick={() => { setAddVersionOpen(true); setVersionDropOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px', background: 'transparent', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-text)' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
                    <SFIcon name="upload" size={12} color="var(--accent)" />
                    {t('review.uploadVersion')}
                  </button>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Divider */}
        {!isAudio && <div style={{ width: 1, height: 28, background: 'var(--border)', flexShrink: 0 }} />}

        {/* Annotation tools — video/photo only */}
        {!isAudio && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginRight: 2 }}>{t('review.annotate')}</span>
            {([
              { tool: 'point' as DrawTool,  icon: 'mouse-pointer-2', label: t('review.toolPoint'),  color: TOOL_COLORS.point  },
              { tool: 'circle' as DrawTool, icon: 'circle',          label: t('review.toolCircle'), color: TOOL_COLORS.circle },
              { tool: 'arrow' as DrawTool,  icon: 'arrow-up-right',  label: t('review.toolArrow'),  color: TOOL_COLORS.arrow  },
            ] as const).map(({ tool, icon, label, color }) => (
              <button key={tool} onClick={() => setDrawTool(t => t === tool ? null : tool)}
                title={label}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, border: `1px solid ${drawTool === tool ? color : 'var(--border)'}`, background: drawTool === tool ? `${color}18` : 'var(--surface-2)', color: drawTool === tool ? color : 'var(--text-2)', fontSize: 11, cursor: 'pointer', transition: 'all 0.12s' }}>
                <SFIcon name={icon} size={12}  />
                {label}
              </button>
            ))}
            {pendingAnnotation && (
              <button onClick={() => setPendingAnnotation(null)}
                style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '4px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer' }}>
                <SFIcon name="trash-2" size={11} />{t('review.clear')}
              </button>
            )}
          </div>
        )}

        <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{secsToLabel(currentTime)} / 03:28</span>

        {/* Divider before share actions */}
        <div style={{ width: 1, height: 20, background: 'var(--border)', flexShrink: 0 }} />

        {/* Share */}
        <button onClick={handleShare} title={shared ? t('review.linkCopied') : t('review.copyLink')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: `1px solid ${shared ? 'var(--ok)' : 'var(--border)'}`, background: shared ? 'rgba(78,201,148,0.12)' : 'var(--surface-2)', cursor: 'pointer', color: shared ? 'var(--ok)' : 'var(--text-2)', flexShrink: 0, transition: 'all 0.15s' }}
          onMouseEnter={e => { if (!shared) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; } }}
          onMouseLeave={e => { if (!shared) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; } }}>
          <SFIcon name={shared ? 'check' : 'share-2'} size={12}  />
        </button>

        {/* Request approval */}
        <RequestApprovalButton resource={resource} projectId={projectId} />

        {/* Fullscreen */}
        <button onClick={() => setIsFullscreen(f => !f)} title={isFullscreen ? t('review.exitFullscreen') : t('review.fullscreen')}
          style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}>
          <SFIcon name={isFullscreen ? 'minimize-2' : 'maximize-2'} size={13}  />
        </button>
      </div>

      {/* ── Body row ── */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>

        {/* ── Left: player ── */}
        <div
          style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', padding: '16px 16px 12px', position: 'relative', cursor: playing && !controlsVisible ? 'none' : 'default' }}
          onMouseMove={showControls}
          onMouseLeave={() => { if (playing) setControlsVisible(false); }}
          onDragOver={e => { if (e.dataTransfer.types.includes('Files')) { e.preventDefault(); setIsMediaDragging(true); } }}
          onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setIsMediaDragging(false); }}
          onDrop={e => { e.preventDefault(); setIsMediaDragging(false); const f = Array.from(e.dataTransfer.files)[0]; if (f) assignMediaToActive(f); }}
        >
          {/* Overlay de dépôt de fichier */}
          {isMediaDragging && (
            <div style={{ position: 'absolute', inset: 12, zIndex: 60, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'rgba(249,255,0,0.06)', border: '2px dashed var(--accent)', borderRadius: 12, pointerEvents: 'none' }}>
              <div style={{ textAlign: 'center' }}>
                <SFIcon name="upload" size={30} color="var(--accent)" />
                <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--accent)', marginTop: 8 }}>{mediaUrl ? t('review.dropToReplaceMedia', { version: activeVersion }) : t('review.dropToAddMedia', { version: activeVersion })}</p>
              </div>
            </div>
          )}
          {/* Input fichier caché pour le bouton « Importer » */}
          <input ref={mediaFileInputRef} type="file" accept={isAudio ? 'audio/*' : 'video/*'} style={{ display: 'none' }}
            onChange={e => { const f = e.target.files?.[0]; if (f) assignMediaToActive(f); e.target.value = ''; }} />

          {/* Audio player — shown instead of video frame for audio subtypes */}
          {isAudio ? (
            <div onClick={() => { if (mediaUrl) togglePlay(); else mediaFileInputRef.current?.click(); }}
              style={{ borderRadius: 12, background: '#0c0f0a', border: '1px solid var(--border)', flexShrink: 0, cursor: 'pointer', padding: '28px 24px', display: 'flex', flexDirection: 'column', gap: 20, userSelect: 'none' }}>
              {mediaUrl && (
                <audio ref={mediaRef as React.RefObject<HTMLAudioElement>} src={mediaUrl} style={{ display: 'none' }}
                  onLoadedMetadata={e => setMediaDuration((e.target as HTMLAudioElement).duration || null)}
                  onTimeUpdate={e => setCurrentTime((e.target as HTMLAudioElement).currentTime)}
                  onEnded={() => setPlaying(false)} />
              )}
              {/* File info row */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
                <div style={{ width: 48, height: 48, borderRadius: 10, background: 'rgba(78,201,148,0.12)', border: '1px solid rgba(78,201,148,0.3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  <SFIcon name={playing ? 'pause' : 'music'} size={22} color="#4ec994" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: 'var(--ff-text)', fontSize: 14, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{activeVer?.mediaName ?? resource?.title ?? 'Audio'}</div>
                  <div style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', marginTop: 3 }}>
                    {mediaUrl ? `${activeVersion} · ${secsToLabel(currentTime)} / ${secsToLabel(TOTAL)}` : `${activeVersion} · ${t('review.dropAudioHint')}`}
                  </div>
                </div>
                {playing && (
                  <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 24 }}>
                    {[0.4,0.7,1,0.6,0.9,0.5,0.8,0.45,0.75,0.6,0.95,0.55].map((h, i) => (
                      <div key={i} style={{ width: 3, borderRadius: 2, background: '#4ec994', opacity: 0.7 + (i % 3) * 0.1,
                        height: `${h * 100}%`, animation: `audio-bar ${0.4 + (i % 4) * 0.15}s ease-in-out infinite alternate` }} />
                    ))}
                  </div>
                )}
              </div>
              {/* Waveform visualization */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 1, height: 56, position: 'relative' }}>
                {Array.from({ length: 80 }, (_, i) => {
                  const h = 20 + Math.abs(Math.sin(i * 0.7 + i * i * 0.02) * 80);
                  const played = i / 80 <= currentTime / TOTAL;
                  return (
                    <div key={i} onClick={e => { e.stopPropagation(); seekTo(Math.round((i / 80) * TOTAL)); }}
                      style={{ flex: 1, height: `${h}%`, borderRadius: 2, background: played ? '#4ec994' : 'rgba(255,255,255,0.1)', transition: 'background 0.05s', cursor: 'pointer' }} />
                  );
                })}
                {/* Playhead */}
                <div style={{ position: 'absolute', top: 0, bottom: 0, left: `${(currentTime / TOTAL) * 100}%`, width: 2, background: '#4ec994', boxShadow: '0 0 6px #4ec994', pointerEvents: 'none', borderRadius: 2 }} />
                {/* Comment markers */}
                {versionComments.filter(c => c.timeSeconds !== null && c.status !== 'resolved').map(c => (
                  <div key={c.id}
                    onClick={e => { e.stopPropagation(); jumpToComment(c); }}
                    title={`${c.timeLabel} — ${c.author.name}: ${c.text.slice(0, 40)}`}
                    style={{ position: 'absolute', bottom: -6, left: `${(c.timeSeconds! / TOTAL) * 100}%`, transform: 'translateX(-50%)', width: activeCommentId === c.id ? 10 : 7, height: activeCommentId === c.id ? 10 : 7, borderRadius: '50%', background: 'var(--accent)', border: `2px solid var(--bg)`, cursor: 'pointer', zIndex: 2 }} />
                ))}
              </div>
            </div>
          ) : (
          /* Video frame */
          <div ref={videoFrameRef}
            onClick={() => { if (drawTool) return; if (mediaUrl) togglePlay(); else mediaFileInputRef.current?.click(); }}
            style={{ borderRadius: 12, background: '#0a0a0a', flex: 1, minHeight: 0, position: 'relative', border: '1px solid var(--border)', overflow: 'hidden', cursor: drawTool ? 'crosshair' : 'pointer' }}>
            {mediaUrl ? (
              <video ref={mediaRef as React.RefObject<HTMLVideoElement>} src={mediaUrl}
                style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'contain', background: '#000', zIndex: 0 }}
                onLoadedMetadata={e => setMediaDuration((e.target as HTMLVideoElement).duration || null)}
                onTimeUpdate={e => setCurrentTime((e.target as HTMLVideoElement).currentTime)}
                onEnded={() => setPlaying(false)} />
            ) : (
              <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.03) 0 2px, transparent 2px 11px)' }} />
            )}
            {/* État vide : invitation à déposer une vidéo */}
            {!mediaUrl && !drawTool && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 10, zIndex: 2, pointerEvents: 'none' }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(249,255,0,0.14)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SFIcon name="upload" size={24} color="var(--accent)" />
                </div>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)', background: 'rgba(0,0,0,0.5)', padding: '3px 10px', borderRadius: 6, letterSpacing: '0.06em' }}>
                  {activeVersion} — {t('review.dropVideoHint')}
                </span>
              </div>
            )}

            {/* Burned-in timecode — uniquement quand un média est présent */}
            {mediaUrl && (
              <div style={{ position: 'absolute', top: 10, left: 12, fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'rgba(255,255,255,0.55)', background: 'rgba(0,0,0,0.45)', padding: '2px 7px', borderRadius: 5, letterSpacing: '0.08em', pointerEvents: 'none', zIndex: 4 }}>
                {activeVersion} · {secsToLabel(currentTime)} / {secsToLabel(TOTAL)}
              </div>
            )}


            {/* Center overlay — only when media present, paused & not drawing */}
            {mediaUrl && !drawTool && !playing && (
              <div style={{ position: 'absolute', inset: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', flexDirection: 'column', gap: 10, pointerEvents: 'none', zIndex: 1 }}>
                <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'rgba(249,255,0,0.14)', border: '1px solid var(--accent)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SFIcon name="play" size={24} color="var(--accent)" />
                </div>
              </div>
            )}
            {drawTool && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', border: `1px solid ${TOOL_COLORS[drawTool]}`, borderRadius: 8, padding: '5px 14px', pointerEvents: 'none', zIndex: 5 }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: TOOL_COLORS[drawTool] }}>
                  {drawTool === 'point' ? t('review.drawPointHint') : drawTool === 'circle' ? t('review.drawCircleHint') : t('review.drawArrowHint')}
                </span>
              </div>
            )}
            {pendingAnnotation && !drawTool && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.75)', border: '1px solid var(--accent)', borderRadius: 8, padding: '5px 14px', pointerEvents: 'none', zIndex: 5 }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--accent)' }}>{t('review.annotationReady')}</span>
              </div>
            )}
            {repositioningAnnotationId && !drawTool && (
              <div style={{ position: 'absolute', top: 12, left: '50%', transform: 'translateX(-50%)', background: 'rgba(0,0,0,0.8)', border: '1px solid var(--info)', borderRadius: 8, padding: '5px 14px', zIndex: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                <SFIcon name="move" size={12} color="var(--info)" />
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--info)' }}>{t('review.repositionHint')}</span>
                <button onClick={() => setRepositioningAnnotationId(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}>
                  <SFIcon name="x" size={12} color="var(--text-3)" />
                </button>
              </div>
            )}
            <AnnotationLayer
              annotations={annotatedComments} activeId={activeCommentId}
              pending={pendingAnnotation} drawing={liveAnnotation} drawTool={drawTool}
              repositioning={!!repositioningAnnotationId}
              onMouseDown={handleSvgMouseDown} onMouseMove={handleSvgMouseMove} onMouseUp={handleSvgMouseUp}
              onClick={handleSvgClickForReposition}
            />

            {/* ── Video controls overlay (inside video frame so they show in fullscreen) ── */}
            <div
              onMouseEnter={() => { if (hideControlsTimer.current) clearTimeout(hideControlsTimer.current); setControlsVisible(true); }}
              onMouseLeave={() => { if (playing) { hideControlsTimer.current = setTimeout(() => setControlsVisible(false), 800); } }}
              onClick={e => e.stopPropagation()}
              style={{ position: 'absolute', bottom: 0, left: 0, right: 0, background: 'linear-gradient(to top, rgba(0,0,0,0.82) 0%, rgba(0,0,0,0.45) 60%, transparent 100%)', padding: '40px 16px 14px', display: 'flex', flexDirection: 'column', gap: 8, opacity: controlsVisible ? 1 : 0, transition: 'opacity 0.4s', pointerEvents: controlsVisible ? 'auto' : 'none', zIndex: 10 }}>
            {/* Scrubber bar */}
            <div style={{ flex: 1, height: 36, display: 'flex', alignItems: 'center', cursor: 'pointer', position: 'relative' }}
              onClick={e => {
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                seekTo((e.clientX - rect.left) / rect.width * TOTAL);
              }}
              onMouseMove={e => {
                if (e.buttons !== 1) return;
                const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
                seekTo((e.clientX - rect.left) / rect.width * TOTAL);
              }}>
              {/* Track */}
              <div style={{ position: 'absolute', left: 0, right: 0, height: 6, borderRadius: 999, background: 'rgba(255,255,255,0.12)' }}>
                <div style={{ width: `${(currentTime / TOTAL) * 100}%`, height: '100%', borderRadius: 999, background: 'var(--accent)' }} />
                {versionComments.filter(c => c.timeSeconds !== null && c.status !== 'resolved').map(c => (
                  <div key={c.id}
                    title={`${c.timeLabel} — ${c.author.name}: ${c.text.slice(0, 40)}`}
                    onClick={e => { e.stopPropagation(); jumpToComment(c); }}
                    style={{ position: 'absolute', top: '50%', left: `${(c.timeSeconds! / TOTAL) * 100}%`, transform: 'translate(-50%, -50%)', width: activeCommentId === c.id ? 14 : 10, height: activeCommentId === c.id ? 14 : 10, borderRadius: '50%', background: c.annotation ? c.annotation.color : 'var(--accent)', border: `2px solid ${activeCommentId === c.id ? 'white' : 'var(--bg)'}`, zIndex: activeCommentId === c.id ? 3 : 1, transition: 'all 0.15s', cursor: 'pointer' }}
                  />
                ))}
                {tasks.filter(t => t.timeLabel && !t.done).map(t => {
                  const [m, s] = (t.timeLabel ?? '0:0').split(':').map(Number);
                  const secs = m * 60 + s;
                  return <div key={t.id} title={t.title} style={{ position: 'absolute', top: '50%', left: `${(secs / TOTAL) * 100}%`, transform: 'translate(-50%, -50%)', width: 8, height: 8, borderRadius: 2, background: 'var(--warn)', border: '2px solid var(--bg)', zIndex: 1 }} />;
                })}
                {/* Playhead thumb */}
                <div style={{ position: 'absolute', top: '50%', left: `${(currentTime / TOTAL) * 100}%`, transform: 'translate(-50%, -50%)', width: 16, height: 16, borderRadius: '50%', background: 'var(--accent)', border: '3px solid var(--bg)', zIndex: 2, boxShadow: '0 0 8px rgba(249,255,0,0.5)' }} />
              </div>
            </div>
            {/* Transport controls — 3 sections */}
            <div style={{ display: 'flex', alignItems: 'center' }}>
              {/* Left: timecode */}
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, minWidth: 96 }}>
                {secsToLabel(currentTime)} / {secsToLabel(TOTAL)}
              </span>

              {/* Center: transport controls */}
              <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8 }}>
                {/* Prev comment */}
                <button onClick={goPrevComment} title={t('review.prevComment')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: timedComments.some(c => c.timeSeconds! < currentTime - 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: timedComments.some(c => c.timeSeconds! < currentTime - 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="chevron-left" size={12} />
                  <SFIcon name="message-circle" size={13} />
                </button>
                {/* Rewind -15s */}
                <button onClick={() => seekBy(-15)} title={t('review.rewind15')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, color: 'var(--text-2)' }}>
                  <SFIcon name="arrow-left" size={13} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, fontWeight: 700 }}>15s</span>
                </button>
                {/* Play/Pause — large, centered */}
                <button onClick={togglePlay} title={playing ? t('review.pauseSpace') : t('review.playSpace')}
                  style={{ width: 46, height: 46, borderRadius: '50%', background: 'var(--accent)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', flexShrink: 0, boxShadow: '0 0 18px rgba(249,255,0,0.25)' }}>
                  <SFIcon name={playing ? 'pause' : currentTime >= TOTAL ? 'rotate-ccw' : 'play'} size={20} color="var(--on-accent)" />
                </button>
                {/* Forward +15s */}
                <button onClick={() => seekBy(15)} title={t('review.forward15')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', gap: 4, cursor: 'pointer', flexShrink: 0, color: 'var(--text-2)' }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, fontWeight: 700 }}>15s</span>
                  <SFIcon name="arrow-right" size={13} />
                </button>
                {/* Next comment */}
                <button onClick={goNextComment} title={t('review.nextComment')}
                  style={{ height: 32, padding: '0 10px', borderRadius: 8, background: 'var(--surface-3)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 4, cursor: timedComments.some(c => c.timeSeconds! > currentTime + 0.3) ? 'pointer' : 'default', flexShrink: 0, color: 'var(--text-2)', opacity: timedComments.some(c => c.timeSeconds! > currentTime + 0.3) ? 1 : 0.35 }}>
                  <SFIcon name="message-circle" size={13} />
                  <SFIcon name="chevron-right" size={12} />
                </button>
              </div>

              {/* Right: volume + fullscreen */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 96, justifyContent: 'flex-end' }}>
                {/* Volume / Mute */}
                <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}
                  onMouseEnter={() => setShowVolume(true)}
                  onMouseLeave={() => setShowVolume(false)}>
                  <button onClick={toggleMute} title={muted ? t('review.unmute') : t('review.mute')}
                    style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: muted ? 'var(--text-3)' : 'var(--text-2)', flexShrink: 0 }}>
                    <SFIcon name={muted || volume === 0 ? 'volume-x' : volume < 0.5 ? 'volume-1' : 'volume-2'} size={16} />
                  </button>
                  {showVolume && (
                    <div style={{ position: 'absolute', bottom: '100%', left: '50%', transform: 'translateX(-50%)', marginBottom: 6, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: '10px 8px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, zIndex: 50 }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>{Math.round((muted ? 0 : volume) * 100)}%</span>
                      <input
                        type="range" min={0} max={1} step={0.02} value={muted ? 0 : volume}
                        onChange={e => changeVolume(Number(e.target.value))}
                        style={{ writingMode: 'vertical-lr', direction: 'rtl', height: 80, width: 4, accentColor: 'var(--accent)', cursor: 'pointer' } as React.CSSProperties}
                      />
                    </div>
                  )}
                </div>
                {/* Fullscreen */}
                <button
                  onClick={() => {
                    const el = videoFrameRef.current;
                    if (!el) return;
                    if (!document.fullscreenElement) el.requestFullscreen().catch(() => setIsFullscreen(f => !f));
                    else document.exitFullscreen().catch(() => setIsFullscreen(f => !f));
                  }}
                  title={isFullscreen ? t('review.exitFullscreen') : t('review.fullscreen')}
                  style={{ width: 32, height: 32, borderRadius: 8, background: 'transparent', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}>
                  <SFIcon name={isFullscreen ? 'minimize-2' : 'maximize-2'} size={15} />
                </button>
              </div>
            </div>
          </div>
          </div>
          )}

        </div>

        {/* ── Right: comments panel ── */}
        <div id="vr-comments-panel" style={{ width: 380, borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden', flexShrink: 0 }}>

          {/* Resource summary */}
          <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.1em' }}>{t('review.videoLabel')} · {activeVersion}</p>
                {editingTitle ? (
                  <input
                    autoFocus
                    value={titleVal}
                    onChange={e => setTitleVal(e.target.value)}
                    onBlur={commitTitle}
                    onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleVal(localTitle); setEditingTitle(false); } }}
                    style={{ fontSize:13, fontWeight:600, background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:5, padding:'1px 6px', outline:'none', color:'var(--text)', width:'100%', marginTop:2 }}
                  />
                ) : (
                  <p onClick={() => setEditingTitle(true)} title={t('review.clickToRename')} style={{ fontWeight: 600, fontSize: 13, marginTop: 2, cursor:'text', display:'inline-flex', alignItems:'center', gap:5 }}>
                    {localTitle}
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
                    style={{ fontSize:11, color:'var(--text-2)', background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:5, padding:'2px 6px', outline:'none', resize:'none', width:'100%', fontFamily:'var(--ff-text)', marginTop:3, display:'block' }}
                    rows={2}
                  />
                ) : (
                  <p onClick={() => setEditingDesc(true)} title={t('review.clickToEditDescription')} style={{ fontSize:11, color: localDesc ? 'var(--text-2)' : 'var(--text-3)', cursor:'text', marginTop:3, fontStyle: localDesc ? 'normal' : 'italic' }}>
                    {localDesc || t('review.addDescription')}
                  </p>
                )}
              </div>
              {/* Status dropdown */}
              <div style={{ position: 'relative' }}>
                <button
                  ref={statusDropRef}
                  onClick={openStatusDrop}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <SFPill status={currentStatusMeta.status} small>{t(currentStatusMeta.labelKey)}</SFPill>
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12 }}>
              {[
                { label: t('review.comments'), value: versionComments.length },
                { label: t('review.open'), value: unresolvedCount, color: 'var(--warn)' },
                { label: t('review.tasks'), value: openTaskCount, color: 'var(--info)' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '6px 0', borderRadius: 8, background: 'var(--surface-2)' }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 14, fontWeight: 700, color: s.color ?? 'var(--text)' }}>{s.value}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 2 }}>{s.label}</p>
                </div>
              ))}
            </div>
          </div>

          {/* Tabs */}
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
            {([
              ['comments', `${t('review.comments')} (${unresolvedCount})`],
              ['tasks',    `${t('review.tasks')} (${openTaskCount})`],
            ] as const).map(([key, label]) => (
              <button key={key} onClick={() => setTab(key)}
                style={{ flex: 1, padding: '10px 4px', fontSize: 11, fontWeight: tab === key ? 600 : 400, color: tab === key ? 'var(--text)' : 'var(--text-3)', background: 'none', border: 'none', borderBottom: tab === key ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                {label}
              </button>
            ))}
          </div>

          {/* Comment list */}
          <div style={{ flex: 1, overflow: 'auto' }}>

            {tab === 'comments' && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                {versionComments.length === 0 && (
                  <div style={{ padding: '28px 16px', textAlign: 'center' }}>
                    <div style={{ fontSize: 13, color: 'var(--text-3)', marginBottom: 14 }}>{t('review.noCommentsYet')}</div>
                    <div style={{ padding: '10px 12px', borderRadius: 8, background: 'var(--surface-2)', border: '1px solid var(--border)', textAlign: 'left' }}>
                      <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.55 }}>
                        💬 {t('review.videoCommentHint')}<br />
                        {t('review.mentionHintBefore')} <span style={{ fontFamily: 'var(--ff-mono)', background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 4, fontSize: 10 }}>@{t('review.firstNameToken')}</span> {t('review.mentionHintAfter')}
                      </p>
                    </div>
                  </div>
                )}
                {versionComments.map(c => {
                  const isActive = activeCommentId === c.id;
                  return (
                    <div key={c.id}>
                      <div
                        onClick={() => jumpToComment(c)}
                        className="comment-row"
                        style={{ display: 'flex', gap: 10, padding: '12px 16px', borderBottom: c.replies.length > 0 || replyingTo === c.id ? 'none' : '1px solid var(--border)', opacity: c.status === 'resolved' ? 0.5 : 1, background: isActive ? 'rgba(249,255,0,0.04)' : 'transparent', borderLeft: isActive ? '3px solid var(--accent)' : '3px solid transparent', cursor: 'pointer', transition: 'background 0.1s', position: 'relative' }}
                        onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.comment-delete')!.style.opacity = '1'; }}
                        onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = isActive ? 'rgba(249,255,0,0.04)' : 'transparent'; (e.currentTarget as HTMLElement).querySelector<HTMLElement>('.comment-delete')!.style.opacity = '0'; }}
                      >
                        <SFAvatar initials={c.author.initials} bg={c.author.avatarColor} size={26} />
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                            <span style={{ fontWeight: 600, fontSize: 12 }}>{c.author.name.split(' ')[0]}</span>
                            {c.timeLabel !== null ? (
                              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', background: 'rgba(249,255,0,0.1)', padding: '1px 6px', borderRadius: 5 }}>{c.timeLabel}</span>
                            ) : (
                              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-2)', padding: '1px 6px', borderRadius: 5, border: '1px solid var(--border)' }}>{t('review.general')}</span>
                            )}
                            {c.annotation && (
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, fontFamily: 'var(--ff-mono)', fontSize: 9, color: c.annotation.color, background: `${c.annotation.color}18`, borderRadius: 5, border: `1px solid ${c.annotation.color}44`, overflow: 'hidden' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 3, padding: '1px 6px' }}>
                                  <SFIcon name={c.annotation.tool === 'circle' ? 'circle' : c.annotation.tool === 'arrow' ? 'arrow-up-right' : 'mouse-pointer-2'} size={9} color={c.annotation.color} />
                                  {c.annotation.tool === 'circle' ? t('review.shapeCircle') : c.annotation.tool === 'arrow' ? t('review.shapeArrow') : t('review.shapePoint')}
                                </span>
                                <button
                                  onClick={e => { e.stopPropagation(); setRepositioningAnnotationId(c.id); setActiveCommentId(c.id); }}
                                  title={t('review.moveAnnotation')}
                                  style={{ background: `${c.annotation.color}22`, border: 'none', borderLeft: `1px solid ${c.annotation.color}44`, padding: '2px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center', color: c.annotation.color }}>
                                  <SFIcon name="move" size={9} color={c.annotation.color} />
                                </button>
                                <button
                                  onClick={e => { e.stopPropagation(); removeAnnotationFromComment(c.id); }}
                                  title={t('review.removeAnnotation')}
                                  style={{ background: 'rgba(255,80,80,0.12)', border: 'none', borderLeft: `1px solid ${c.annotation.color}44`, padding: '2px 5px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                                  <SFIcon name="x" size={9} color="var(--danger)" />
                                </button>
                              </span>
                            )}
                            {/* Status pill — click to cycle */}
                            <button
                              onClick={e => { e.stopPropagation(); cycleCommentStatus(c.id); }}
                              title={c.status === 'resolved' ? t('review.markAsOpen') : t('review.markAsResolved')}
                              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '1px 7px', borderRadius: 5, border: `1px solid ${c.status === 'resolved' ? 'var(--ok)' : 'var(--border-2)'}`, background: c.status === 'resolved' ? 'rgba(72,199,142,0.12)' : 'var(--surface-3)', color: c.status === 'resolved' ? 'var(--ok)' : 'var(--text-3)', fontSize: 9, fontFamily: 'var(--ff-mono)', cursor: 'pointer', letterSpacing: '0.04em', textTransform: 'uppercase' }}>
                              {c.status === 'resolved' ? <SFIcon name="check-circle" size={9} color="var(--ok)" /> : <SFIcon name="circle-dot" size={9} color="var(--text-3)" />}
                              {c.status === 'resolved' ? t('review.resolved') : t('review.openStatus')}
                            </button>
                          </div>
                          <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 6 }}>{renderMentions(c.text)}</p>
                          <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }} onClick={e => e.stopPropagation()}>
                            <button onClick={() => { setReplyingTo(r => r === c.id ? null : c.id); setReplyText(''); setReplyMentionQuery(null); }}
                              style={{ fontSize: 11, color: 'var(--text-3)', background: 'none', border: '1px solid var(--border)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                              {t('review.reply')}
                            </button>
                            {taskCreatedFlash ? (
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--ok)', background: 'rgba(72,199,142,0.10)', border: '1px solid rgba(72,199,142,0.3)', borderRadius: 6, padding: '2px 8px' }}>
                                <SFIcon name="check" size={10} color="var(--ok)" />{t('review.taskCreated')}
                              </span>
                            ) : (
                              <button onClick={() => convertToTask(c)}
                                style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 11, color: 'var(--info)', background: 'rgba(100,160,255,0.07)', border: '1px solid rgba(100,160,255,0.25)', borderRadius: 6, padding: '2px 8px', cursor: 'pointer' }}>
                                <SFIcon name="plus" size={10} color="var(--info)" /><SFIcon name="check-square" size={10} color="var(--info)" />{t('review.task')}
                              </button>
                            )}
                          </div>
                        </div>
                        {/* Trash — apparaît au survol */}
                        <button
                          className="comment-delete"
                          onClick={e => { e.stopPropagation(); deleteComment(c.id); }}
                          title={t('review.deleteComment')}
                          style={{ opacity: 0, transition: 'opacity 0.15s', background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', color: 'var(--text-3)', flexShrink: 0, alignSelf: 'flex-start', marginTop: 2 }}
                          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
                          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                        >
                          <SFIcon name="trash-2" size={13} />
                        </button>
                      </div>

                      {/* Replies */}
                      {(c.replies.length > 0 || replyingTo === c.id) && (
                        <div style={{ borderLeft: '3px solid transparent', borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                          {c.replies.map(r => (
                            <div key={r.id} style={{ display: 'flex', gap: 8, padding: '6px 16px 0 42px' }}>
                              <SFAvatar initials={r.author.initials} bg={r.author.avatarColor} size={20} />
                              <div>
                                <span style={{ fontWeight: 600, fontSize: 11 }}>{r.author.name.split(/\s/)[0]}</span>
                                <p style={{ fontSize: 11, color: 'var(--text-2)', lineHeight: 1.5, marginTop: 1 }}>{r.text}</p>
                              </div>
                            </div>
                          ))}
                          {replyingTo === c.id && (
                            <div style={{ display: 'flex', gap: 6, padding: '6px 16px 0 42px', position: 'relative' }} onClick={e => e.stopPropagation()}>
                              {replyMentionQuery !== null && (
                                <div style={{ position: 'fixed', bottom: replyMentionRect ? window.innerHeight - replyMentionRect.top + 4 : 60, left: replyMentionRect?.left ?? 80, zIndex: 1100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden', minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                                  {TEAM.filter(u => u.name.toLowerCase().includes(replyMentionQuery.toLowerCase())).map(u => (
                                    <button key={u.id} onMouseDown={e => { e.preventDefault(); pickReplyMention(u.name); }}
                                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left' }}
                                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                                      onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                                      <span style={{ width: 22, height: 22, borderRadius: '50%', background: u.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, flexShrink: 0 }}>{u.initials}</span>
                                      {u.name}
                                    </button>
                                  ))}
                                </div>
                              )}
                              <input
                                autoFocus
                                value={replyText}
                                onChange={e => handleReplyChange(e.target.value, e.target)}
                                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addReply(c.id); } if (e.key === 'Escape') { setReplyingTo(null); setReplyMentionQuery(null); } }}
                                placeholder={t('review.replyPlaceholder')}
                                style={{ flex: 1, padding: '5px 9px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
                              />
                              <button onClick={() => addReply(c.id)}
                                style={{ width: 28, height: 28, borderRadius: 7, background: replyText.trim() ? 'var(--accent)' : 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: replyText.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
                                <SFIcon name="send" size={11} color={replyText.trim() ? 'var(--on-accent)' : 'var(--text-3)'} />
                              </button>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}

            {tab === 'tasks' && (
              <div style={{ padding: '8px 0' }}>
                {tasks.map(t => (
                  <div key={t.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '10px 16px', borderBottom: '1px solid var(--border)', opacity: t.done ? 0.5 : 1 }}>
                    <button onClick={() => setTasks(p => p.map(x => x.id === t.id ? { ...x, done: !x.done } : x))}
                      style={{ width: 17, height: 17, borderRadius: '50%', flexShrink: 0, border: t.done ? 'none' : '1.5px solid var(--border-2)', background: t.done ? 'var(--ok)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', marginTop: 2 }}>
                      {t.done && <SFIcon name="check" size={9} color="white" />}
                    </button>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontSize: 12, fontWeight: 500, textDecoration: t.done ? 'line-through' : 'none', color: t.done ? 'var(--text-3)' : 'var(--text)', marginBottom: 3 }}>{t.title}</p>
                      {t.timeLabel && (
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', background: 'rgba(249,255,0,0.07)', padding: '1px 6px', borderRadius: 5, cursor: 'pointer' }}
                          onClick={() => { const [m, s] = (t.timeLabel ?? '0:0').split(':').map(Number); setCurrentTime(m * 60 + s); }}>
                          {t.timeLabel}
                        </span>
                      )}
                    </div>
                    <button onClick={() => setTasks(p => p.filter(x => x.id !== t.id))}
                      style={{ display: 'flex', padding: 3, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLElement).style.color = 'var(--danger)'}
                      onMouseLeave={e => (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'}>
                      <SFIcon name="trash-2" size={12} />
                    </button>
                  </div>
                ))}
                {tasks.length === 0 && (
                  <div style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-3)', fontSize: 12 }}>{t('review.convertCommentsToTasks')}</div>
                )}
              </div>
            )}

          </div>

          {/* Comment compose */}
          {tab === 'comments' && (
            <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', flexShrink: 0, background: 'var(--surface)' }}>
              {pendingAnnotation && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8, padding: '5px 10px', borderRadius: 8, border: `1px solid ${pendingAnnotation.color}55`, background: `${pendingAnnotation.color}0d` }}>
                  <SFIcon name={pendingAnnotation.tool === 'circle' ? 'circle' : pendingAnnotation.tool === 'arrow' ? 'arrow-up-right' : 'mouse-pointer-2'} size={13} color={pendingAnnotation.color} />
                  <span style={{ flex: 1, fontFamily: 'var(--ff-mono)', fontSize: 10, color: pendingAnnotation.color }}>{t('review.annotationAttached')}</span>
                  <button onClick={() => setPendingAnnotation(null)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}>
                    <SFIcon name="x" size={11} />
                  </button>
                </div>
              )}
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 8 }}>
                <button onClick={() => setWithTimestamp(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 6, border: `1px solid ${withTimestamp ? 'var(--accent)' : 'var(--border)'}`, background: withTimestamp ? 'rgba(249,255,0,0.07)' : 'transparent', color: withTimestamp ? 'var(--accent)' : 'var(--text-3)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-mono)' }}>
                  <SFIcon name="clock" size={10}  />
                  {withTimestamp ? secsToLabel(currentTime) : t('review.general')}
                </button>
              </div>
              <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
                {commentMentionQuery !== null && (
                  <div style={{ position: 'fixed', bottom: commentMentionRect ? window.innerHeight - commentMentionRect.top + 4 : 80, left: commentMentionRect?.left ?? 80, zIndex: 1100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, overflow: 'hidden', minWidth: 180, boxShadow: '0 4px 20px rgba(0,0,0,0.4)' }}>
                    {TEAM.filter(u => u.name.toLowerCase().includes(commentMentionQuery.toLowerCase())).map(u => (
                      <button key={u.id} onMouseDown={e => { e.preventDefault(); pickCommentMention(u.name); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 12px', background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: 'var(--text)', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'none')}>
                        <span style={{ width: 22, height: 22, borderRadius: '50%', background: u.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 9, color: 'white', fontWeight: 700, flexShrink: 0 }}>{u.initials}</span>
                        {u.name}
                      </button>
                    ))}
                  </div>
                )}
                <input
                  id="vr-comment-input"
                  value={commentText}
                  onChange={e => handleCommentChange(e.target.value, e.target)}
                  onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } if (e.key === 'Escape') setCommentMentionQuery(null); }}
                  placeholder={withTimestamp ? t('review.commentAtTime', { time: secsToLabel(currentTime) }) : t('review.commentGeneral')}
                  style={{ flex: 1, padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
                />
                <button onClick={addComment}
                  style={{ width: 34, height: 34, borderRadius: 9, background: commentText.trim() ? 'var(--accent)' : 'var(--surface-3)', border: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: commentText.trim() ? 'pointer' : 'default', flexShrink: 0 }}>
                  <SFIcon name="send" size={13} color={commentText.trim() ? 'var(--on-accent)' : 'var(--text-3)'} />
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Status dropdown portal */}
      {statusDropOpen && statusDropRect && (
        <>
          <div style={{ position: 'fixed', inset: 0, zIndex: 999 }} onClick={() => setStatusDropOpen(false)} />
          <div style={{ position: 'fixed', top: statusDropRect.bottom + 4, right: window.innerWidth - statusDropRect.right, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 4px 20px rgba(0,0,0,0.35)', overflow: 'hidden', minWidth: 160 }}>
            {REVIEW_STATUSES.map(s => (
              <button key={s.key} onClick={() => { setReviewStatus(s.key); setStatusDropOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '9px 14px', background: s.key === reviewStatus ? 'var(--surface-3)' : 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                <SFPill status={s.status} small>{t(s.labelKey)}</SFPill>
                {s.key === reviewStatus && <SFIcon name="check" size={11} color="var(--accent)" />}
              </button>
            ))}
          </div>
        </>
      )}

      {/* Add-version modal */}
      {addVersionOpen && (
        <>
          <div onClick={() => setAddVersionOpen(false)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 420, zIndex: 1201, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', overflow: 'hidden' }}>
            <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginBottom: 2 }}>{resource?.title ?? t('review.untitledResource')}</p>
                <h2 style={{ fontSize: 15, fontWeight: 700 }}>{t('review.uploadVersion')}</h2>
              </div>
              <button onClick={() => setAddVersionOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
            </div>
            <div style={{ padding: '20px', display: 'flex', flexDirection: 'column', gap: 14 }}>
              {/* Drop zone (mock) */}
              <div style={{ border: '1.5px dashed var(--border-2)', borderRadius: 12, padding: '24px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, background: 'var(--surface-2)' }}>
                <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SFIcon name="cloud-upload" size={20} color="var(--accent)" />
                </div>
                <p style={{ fontSize: 12, color: 'var(--text-2)', textAlign: 'center' }}>{t('review.dropVideoFile')}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('review.willBeSavedAs')} <span style={{ color: 'var(--accent)' }}>{nextVersionName()}</span></p>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{t('review.versionNoteOptional')}</label>
                <input
                  autoFocus
                  value={newVersionNote}
                  onChange={e => setNewVersionNote(e.target.value)}
                  onKeyDown={e => { if (e.key === 'Enter') addVersion(); if (e.key === 'Escape') setAddVersionOpen(false); }}
                  placeholder={t('review.versionNotePlaceholder')}
                  style={{ width: '100%', padding: '8px 11px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark', boxSizing: 'border-box' }}
                />
              </div>
            </div>
            <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <SFButton variant="ghost" size="sm" onClick={() => setAddVersionOpen(false)}>{t('review.cancel')}</SFButton>
              <SFButton variant="primary" size="sm" icon="plus" onClick={addVersion}>{t('review.createNamed', { name: nextVersionName() })}</SFButton>
            </div>
          </div>
        </>
      )}

      {/* Delete-version confirmation */}
      {versionToDelete && (
        <>
          <div onClick={() => setVersionToDelete(null)} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 1200 }} />
          <div style={{ position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)', width: 380, zIndex: 1201, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, boxShadow: '0 24px 80px rgba(0,0,0,0.7)', padding: '22px', textAlign: 'center' }}>
            <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'rgba(229,72,77,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
              <SFIcon name="trash-2" size={20} color="var(--danger)" />
            </div>
            <h2 style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>{t('review.deleteVersionConfirm', { version: versionToDelete.v })}</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 18, lineHeight: 1.5 }}>
              {t('review.deleteVersionDesc', { label: versionToDelete.label })}
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'center' }}>
              <SFButton variant="ghost" size="sm" onClick={() => setVersionToDelete(null)}>{t('review.cancel')}</SFButton>
              <SFButton variant="primary" size="sm" icon="trash-2" onClick={confirmDeleteVersion} style={{ background: 'var(--danger)', color: 'white' }}>{t('review.delete')}</SFButton>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

// ── Page wrapper with topbar + routing ────────────────────────────────────────

export function VideoReview() {
  const { t } = useTranslation();
  const { projectId, resourceId } = useParams();
  const [, setTick] = useState(0);
  useEffect(() => subscribeResources(() => setTick(t => t + 1)), []);
  useEffect(() => { if (resourceId) markResourceRead(resourceId); }, [resourceId]);

  const resources = getResources();
  const resource = resources.find(r => r.id === resourceId);

  // Tous les hooks ci-dessus sont appelés inconditionnellement (règles des hooks) ;
  // l'early-return doit venir après.
  if (!resource) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
      <SFIcon name="film" size={36} color="var(--text-3)" />
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>{t('review.resourceNotFound')}</p>
      <p style={{ fontSize: 12 }}>{t('review.idNoMatchBefore')} <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--ff-mono)' }}>{resourceId}</code> {t('review.idNoMatchAfter')}</p>
    </div>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <VideoReviewBody key={resource.id} resource={resource} projectId={projectId} persistKey={resource.id} />
    </div>
  );
}
