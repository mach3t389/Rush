import React, { useState, useRef, useEffect } from 'react';
import { SFPill, SFAvatar, SFBar, SFButton, SFIcon, DatePickerDropdown, TimePickerDropdown, formatDisplay, fmtTaskDate, isOverdue } from './ui';
import { USERS, PROJECTS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import { getSections } from '../data/taskStore';
import { getResources, updateResource, subscribeResources } from '../data/resourceStore';
import type { Task, Priority, ResourceType, DeliverableFormat, DeliverableType, Status } from '../types';
import { ResourceBody } from '../screens/ResourceDetail';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<Priority, string> = {
  high:   'var(--danger)',
  normal: 'var(--warn)',
  low:    'var(--info)',
  none:   'var(--border-2)',
};
const PRIORITY_LABEL: Record<Priority, string> = {
  high:   'Élevée',
  normal: 'Moyenne',
  low:    'Basse',
  none:   'Aucune',
};
const PRIORITY_OPTIONS: Priority[] = ['high', 'normal', 'low', 'none'];


const PANEL_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: '',       label: 'Aucun statut' },
  { value: 'warn',   label: 'À faire'      },
  { value: 'info',   label: 'En cours'     },
  { value: 'ok',     label: 'Complété'     },
  { value: 'danger', label: 'En retard'    },
  { value: 'review', label: 'En révision'  },
];

const RESOURCE_STATUS_OPTIONS: { status: Status; label: string }[] = [
  { status: 'ok',      label: 'Terminé'     },
  { status: 'info',    label: 'En cours'    },
  { status: 'warn',    label: 'À faire'     },
  { status: 'review',  label: 'En révision' },
  { status: 'danger',  label: 'Bloqué'      },
  { status: 'neutral', label: 'En attente'  },
];

const FORMAT_OPTIONS: { value: DeliverableFormat; label: string; ratio: string }[] = [
  { value: '16:9',    label: '16:9',    ratio: '16/9' },
  { value: '9:16',    label: '9:16',    ratio: '9/16' },
  { value: '1:1',     label: '1:1',     ratio: '1/1' },
  { value: '4:3',     label: '4:3',     ratio: '4/3' },
  { value: '2.35:1',  label: '2.35:1',  ratio: '2.35/1' },
  { value: 'custom',  label: 'Personnalisé', ratio: '4/3' },
];

const DELIVERABLE_TYPE_OPTIONS: { value: DeliverableType; label: string; icon: string }[] = [
  { value: 'video',     label: 'Vidéo',     icon: 'video'       },
  { value: 'photo',     label: 'Photo',     icon: 'image'       },
  { value: 'audio',     label: 'Audio',     icon: 'music'       },
  { value: 'document',  label: 'Document',  icon: 'file-text'   },
  { value: 'web',       label: 'Site web',  icon: 'globe'       },
  { value: 'graphique', label: 'Graphique', icon: 'pen-tool'    },
  { value: 'service',   label: 'Service',   icon: 'briefcase'   },
  { value: 'produit',   label: 'Produit',   icon: 'package-2'   },
  { value: 'autre',     label: 'Autre',     icon: 'circle-dashed'},
];

const RESOURCE_TYPE_LABELS: Record<ResourceType, string> = {
  screenplay:   'Scénarisation',
  video_review: 'Révision',
  moodboard:    'Moodboard',
  document:     'Document',
  checklist:    'Checklist',
  inspirations: 'Inspirations',
  file:         'Fichier',
  form:         'Formulaire',
};

const TYPE_ICON: Record<ResourceType, string> = {
  screenplay:   'clapperboard',
  video_review: 'video',
  moodboard:    'grid-2x2',
  document:     'file',
  checklist:    'list-checks',
  inspirations: 'image',
  file:         'hard-drive',
  form:         'clipboard-list',
};

const TEAM = Object.values(USERS);

// ── Types ─────────────────────────────────────────────────────────────────────

export interface CommentObj {
  id: string;
  text: string;
  author: { initials: string; bg: string; name: string };
  replies: CommentObj[];
}

export interface LocalSubtask {
  id: string;
  title: string;
  checked: boolean;
  priority: Priority;
  status: string;
  statusLabel: string;
  assignee: typeof TEAM[0] | null;
  dueDate: string;
  comments: CommentObj[];
}

// ── Dropdown helper ───────────────────────────────────────────────────────────

function ddItem(onClick: () => void, children: React.ReactNode, active?: boolean) {
  return (
    <button
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
        padding: '7px 10px', borderRadius: 7, border: 'none',
        background: active ? 'var(--surface-3)' : 'transparent',
        color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)',
        cursor: 'pointer', textAlign: 'left',
      }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      {children}
    </button>
  );
}

// ── Rect-based InlineDropdown (for panel) ─────────────────────────────────────

function InlineDropdown({ onClose, children, anchorRect, minWidth = 160, zIndex = 100 }: {
  onClose: () => void;
  children: React.ReactNode;
  anchorRect?: DOMRect | null;
  minWidth?: number;
  zIndex?: number;
}) {
  const dropRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<React.CSSProperties>({ visibility: 'hidden' });
  React.useLayoutEffect(() => {
    if (!dropRef.current || !anchorRect) return;
    const h = dropRef.current.offsetHeight;
    const w = dropRef.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = anchorRect.bottom + 4 + h > vh && anchorRect.top >= h + 4 ? anchorRect.top - h - 4 : anchorRect.bottom + 4;
    const left = Math.max(8, Math.min(anchorRect.left, vw - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [anchorRect]);
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>
  );
}

// ── SubTask grid constants ─────────────────────────────────────────────────────

const SUB_GRID = '22px 1fr 32px 90px 100px 24px';

const subColLabel = (label: string) => (
  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', whiteSpace: 'nowrap', display: 'block' }}>{label}</span>
);

// ── SubTaskRow ────────────────────────────────────────────────────────────────

function SubTaskRow({ sub, onToggle, onUpdate, onDelete }: {
  sub: LocalSubtask;
  onToggle: () => void;
  onUpdate: (patch: Partial<LocalSubtask>) => void;
  onDelete: () => void;
}) {
  const [editing, setEditing] = useState(sub.title === '');
  const [editTitle, setEditTitle] = useState(sub.title);
  const [hovered, setHovered] = useState(false);
  const [dropOpen, setDropOpen] = useState<'assignee' | 'priority' | 'date' | null>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);

  const openDrop = (key: typeof dropOpen, e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setDropOpen(prev => prev === key ? null : key);
    setDropRect(e.currentTarget.getBoundingClientRect());
  };

  const fmtDate = (d: string) => {
    if (!d) return '—';
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('fr-CA', { day: 'numeric', month: 'short' });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      style={{ display: 'grid', gridTemplateColumns: SUB_GRID, alignItems: 'center', gap: 16, padding: '6px 8px', borderRadius: 8, background: hovered ? 'var(--surface-2)' : 'transparent', transition: 'background 0.1s' }}
    >
      {/* Checkbox */}
      <button onClick={onToggle}
        style={{ width: 15, height: 15, borderRadius: '50%', cursor: 'pointer', border: sub.checked ? 'none' : '1.5px solid var(--border-2)', background: sub.checked ? 'var(--ok)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'center', flexShrink: 0 }}>
        {sub.checked && <SFIcon name="check" size={8} color="white" />}
      </button>

      {/* Title */}
      {editing ? (
        <input autoFocus value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onBlur={() => { onUpdate({ title: editTitle }); setEditing(false); }}
          onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') { onUpdate({ title: editTitle }); setEditing(false); } }}
          placeholder="Nouvelle sous-tâche"
          style={{ fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-3)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--ff-text)', width: '100%' }}
        />
      ) : (
        <span onClick={() => { setEditTitle(sub.title); setEditing(true); }}
          style={{ fontSize: 12, textDecoration: sub.checked ? 'line-through' : 'none', color: sub.title ? (sub.checked ? 'var(--text-3)' : 'var(--text-2)') : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', fontStyle: sub.title ? 'normal' : 'italic' }}>
          {sub.title || 'Nouvelle sous-tâche'}
        </span>
      )}

      {/* Priority */}
      <div style={{ position: 'relative' }}>
        <button onClick={e => openDrop('priority', e)} title={`Priorité : ${PRIORITY_LABEL[sub.priority]}`}
          style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, width: '100%' }}>
          <span style={{ width: 9, height: 9, borderRadius: '50%', background: PRIORITY_COLOR[sub.priority], flexShrink: 0, display: 'block' }} />
        </button>
        {dropOpen === 'priority' && (
          <InlineDropdown onClose={() => setDropOpen(null)} anchorRect={dropRect} zIndex={600}>
            {PRIORITY_OPTIONS.map(p => ddItem(() => { onUpdate({ priority: p }); setDropOpen(null); },
              <><span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{PRIORITY_LABEL[p]}</>,
              sub.priority === p
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Assignee */}
      <div style={{ position: 'relative' }}>
        <button onClick={e => openDrop('assignee', e)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
          {sub.assignee
            ? <SFAvatar initials={sub.assignee.initials} bg={sub.assignee.avatarColor} size={18} />
            : <span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={9} color="var(--text-3)" /></span>
          }
        </button>
        {dropOpen === 'assignee' && (
          <InlineDropdown onClose={() => setDropOpen(null)} anchorRect={dropRect} minWidth={180} zIndex={600}>
            {ddItem(() => { onUpdate({ assignee: null }); setDropOpen(null); },
              <><span style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={9} color="var(--text-3)" /></span>Non assigné</>,
              sub.assignee === null
            )}
            {TEAM.map(u => ddItem(() => { onUpdate({ assignee: u }); setDropOpen(null); },
              <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
              sub.assignee?.id === u.id
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Date */}
      <div style={{ position: 'relative' }}>
        <button onClick={e => openDrop('date', e)}
          style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
          <SFIcon name="calendar" size={10} color={sub.dueDate ? 'var(--text-2)' : 'var(--text-3)'} />
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: sub.dueDate ? 'var(--text-2)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>{fmtDate(sub.dueDate)}</span>
        </button>
        {dropOpen === 'date' && (
          <DatePickerDropdown value={sub.dueDate} onChange={v => { onUpdate({ dueDate: v }); setDropOpen(null); }} onClose={() => setDropOpen(null)} anchorRect={dropRect} zIndex={600} />
        )}
      </div>

      {/* Delete */}
      <button onClick={e => { e.stopPropagation(); onDelete(); }} title="Supprimer"
        style={{ visibility: hovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, justifySelf: 'center' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
        <SFIcon name="trash-2" size={11} />
      </button>
    </div>
  );
}

// ── TaskPanel ─────────────────────────────────────────────────────────────────

export function TaskPanel({ task, onClose, onUpdate, onMove, sectionLabel, autoFocusComments, inline }: {
  task: Task;
  onClose: () => void;
  onUpdate?: (patch: Partial<Task>) => void;
  onMove?: (newProjectId: string, newSectionLabel: string) => void;
  sectionLabel?: string;
  autoFocusComments?: boolean;
  inline?: boolean;
}) {
  const [resources, setResources] = useState(getResources);
  React.useEffect(() => subscribeResources(() => setResources(getResources())), []);
  const [description, setDescription] = useState('');
  const [dateDebut, setDateDebut] = useState(task.dueDate ?? '');
  const [heureDebut, setHeureDebut] = useState(task.startTime ?? '');
  const [dateFin, setDateFin] = useState(task.endDate ?? '');
  const [heureFin, setHeureFin] = useState(task.endTime ?? '');
  const [datePickerOpen, setDatePickerOpen] = useState<'debut' | 'fin' | null>(null);
  const [datePickerRect, setDatePickerRect] = useState<DOMRect | null>(null);
  const [comment, setComment] = useState('');
  const [comments, setComments] = useState<CommentObj[]>([]);
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [mentionRect, setMentionRect] = useState<DOMRect | null>(null);
  const commentInputRef = useRef<HTMLInputElement>(null);
  const commentsAnchorRef = useRef<HTMLDivElement>(null);
  const descRef = useRef<HTMLTextAreaElement>(null);

  React.useEffect(() => {
    if (!autoFocusComments) return;
    const timer = setTimeout(() => {
      commentsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      commentsAnchorRef.current?.style && (commentsAnchorRef.current.style.animation = 'highlight-flash 2s ease forwards');
      commentsAnchorRef.current?.addEventListener('animationend', () => {
        if (commentsAnchorRef.current) commentsAnchorRef.current.style.animation = '';
      }, { once: true });
      commentInputRef.current?.focus();
    }, 200);
    return () => clearTimeout(timer);
  }, [autoFocusComments]);

  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto';
      descRef.current.style.height = descRef.current.scrollHeight + 'px';
    }
  }, [description]);

  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [replyText, setReplyText] = useState('');
  const [localSubtasks, setLocalSubtasks] = useState<LocalSubtask[]>(
    task.subtasks?.map(s => ({
      id: s.id, title: s.title, checked: s.checked,
      priority: s.priority, status: s.status as string, statusLabel: s.statusLabel,
      assignee: task.assignee ?? null, dueDate: '', comments: [] as CommentObj[],
    })) ?? []
  );
  const [hideCompletedSubs, setHideCompletedSubs] = useState(false);

  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editStatus, setEditStatus] = useState(task.status as string);
  const [editStatusLabel, setEditStatusLabel] = useState(task.statusLabel);
  const [editAssignee, setEditAssignee] = useState<typeof TEAM[0] | null>(task.assignee);
  const [linkedResources, setLinkedResources] = useState<string[]>(task.linkedResources ?? []);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [resPickerRect, setResPickerRect] = useState<DOMRect | null>(null);
  const [panelOpen, setPanelOpen] = useState<'assignee' | 'priority' | 'status' | 'heureDebut' | 'heureFin' | 'format' | null>(null);
  const [panelDropRect, setPanelDropRect] = useState<DOMRect | null>(null);
  const [fullscreenResource, setFullscreenResource] = useState<string | null>(null);
  const [resStatusDrop, setResStatusDrop] = useState<string | null>(null);
  const [resStatusRect, setResStatusRect] = useState<DOMRect | null>(null);
  const [fsStatusDropOpen, setFsStatusDropOpen] = useState(false);
  const [fsStatusRect, setFsStatusRect] = useState<DOMRect | null>(null);
  const [isDeliverable, setIsDeliverable] = useState(task.deliverable ?? false);
  const [deliverableExpanded, setDeliverableExpanded] = useState(false);
  const [deliverableType, setDeliverableType] = useState<DeliverableType>(task.deliverableType ?? 'video');
  const [format, setFormat] = useState<DeliverableFormat>(task.format ?? '16:9');
  const [customW, setCustomW] = useState(task.customWidth ?? 1920);
  const [customH, setCustomH] = useState(task.customHeight ?? 1080);
  const [deliverableDuration, setDeliverableDuration] = useState(task.deliverableDuration ?? '');
  const [deliverableQuantity, setDeliverableQuantity] = useState(task.deliverableQuantity ?? 1);
  const [deliverableNote, setDeliverableNote] = useState(task.deliverableNote ?? '');
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleValue, setTitleValue] = useState(task.title);
  const titleInputRef = useRef<HTMLTextAreaElement>(null);
  const [breadProjectId, setBreadProjectId] = useState(task.projectId);
  const [breadSection, setBreadSection] = useState(sectionLabel ?? '');
  const [breadProjectOpen, setBreadProjectOpen] = useState(false);
  const [breadSectionOpen, setBreadSectionOpen] = useState(false);

  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      const el = titleInputRef.current;
      el.focus();
      el.setSelectionRange(el.value.length, el.value.length);
    }
  }, [editingTitle]);

  const commitTitle = () => {
    const val = titleValue.trim() || task.title;
    setTitleValue(val);
    setEditingTitle(false);
    onUpdate?.({ title: val });
  };

  const breadProjectData = PROJECTS.find(p => p.id === breadProjectId);
  const breadSections = getSections(breadProjectId);

  const panelSectionLabel = (label: string) => (
    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</p>
  );

  const openPanelDrop = (key: typeof panelOpen, e: React.MouseEvent<HTMLButtonElement>) => {
    setPanelOpen(prev => prev === key ? null : key);
    setPanelDropRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
  };

  const updateSub = (id: string, patch: Partial<LocalSubtask>) =>
    setLocalSubtasks(prev => {
      const next = prev.map(s => s.id === id ? { ...s, ...patch } : s);
      onUpdate?.({ subtasks: next as unknown as Task[] });
      return next;
    });

  const addSubtask = () => {
    const sub: LocalSubtask = { id: `sub-${Date.now()}`, title: '', checked: false, priority: 'normal', status: '', statusLabel: '', assignee: null, dueDate: '', comments: [] };
    setLocalSubtasks(prev => {
      const next = [...prev, sub];
      onUpdate?.({ subtasks: next as unknown as Task[] });
      return next;
    });
  };

  const ME = { initials: USERS.lea.initials, bg: USERS.lea.avatarColor, name: USERS.lea.name };

  const handleCommentChange = (val: string, inputEl: HTMLInputElement | null) => {
    setComment(val);
    const match = val.match(/@(\w*)$/);
    if (match) { setMentionQuery(match[1]); if (inputEl) setMentionRect(inputEl.getBoundingClientRect()); }
    else setMentionQuery(null);
  };

  const pickMention = (name: string) => {
    setComment(prev => prev.replace(/@\w*$/, `@${name} `));
    setMentionQuery(null);
    commentInputRef.current?.focus();
  };

  const submitComment = () => {
    if (!comment.trim()) return;
    setComments(prev => [...prev, { id: `c-${Date.now()}`, text: comment.trim(), author: ME, replies: [] }]);
    setComment('');
    setMentionQuery(null);
  };

  const submitReply = (commentId: string) => {
    if (!replyText.trim()) return;
    setComments(prev => prev.map(c => c.id === commentId
      ? { ...c, replies: [...c.replies, { id: `r-${Date.now()}`, text: replyText.trim(), author: ME, replies: [] }] }
      : c
    ));
    setReplyText('');
    setReplyingTo(null);
  };

  const convertToSubtask = (c: CommentObj) => {
    const sub: LocalSubtask = { id: `sub-${Date.now()}`, title: c.text, checked: false, priority: 'normal', status: '', statusLabel: '', assignee: task.assignee ?? null, comments: [] };
    setLocalSubtasks(prev => [...prev, sub]);
    setComments(prev => prev.filter(x => x.id !== c.id));
  };

  const renderMentions = (text: string) => text.split(/(@\S+)/g).map((part, i) =>
    part.startsWith('@')
      ? <span key={i} style={{ color: 'var(--accent)', fontWeight: 600 }}>{part}</span>
      : part
  );

  const secLabel = (text: string) => (
    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>
      {text}
    </p>
  );

  const divider = <div style={{ height: 1, background: 'var(--border)' }} />;

  // Close on click outside the panel (only in overlay/fixed mode)
  const panelRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (inline) return;
    const handler = (e: MouseEvent) => {
      const t = e.target as Element | null;
      // Ignore clicks inside portaled children (DatePicker, TimePicker dropdowns)
      if (t?.closest('[data-panel-child]')) return;
      if (panelRef.current && !panelRef.current.contains(t)) onClose();
    };
    // Delay to avoid closing immediately on the click that opened the panel
    const t = setTimeout(() => document.addEventListener('mousedown', handler), 0);
    return () => { clearTimeout(t); document.removeEventListener('mousedown', handler); };
  }, [onClose, inline]);

  return (
    <>
      {/* Panel */}
      <div ref={panelRef} style={inline ? {
        width: 440,
        flexShrink: 0,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        borderLeft: '1px solid var(--border)',
      } : {
        position: 'fixed',
        right: 0,
        top: 0,
        bottom: 0,
        width: 760,
        zIndex: 200,
        background: 'var(--surface)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '-16px 0 48px rgba(0,0,0,0.7)',
        borderLeft: '1px solid var(--border)',
      }}>

        {/* Header */}
        <div style={{ padding: '14px 20px 12px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {/* Breadcrumb + close */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, minWidth: 0, overflow: 'visible' }}>
              <i style={{ width: 8, height: 8, borderRadius: '50%', background: breadProjectData?.clientColor ?? task.projectColor, flexShrink: 0, display: 'block' }} />
              {/* Project picker */}
              <div style={{ position: 'relative' }}>
                <button onClick={() => { setBreadProjectOpen(p => !p); setBreadSectionOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 5,
                    fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)', fontWeight: 500, whiteSpace: 'nowrap' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                >
                  {breadProjectData?.name ?? task.projectName}
                  <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                </button>
                {breadProjectOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 400, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 4 }}>
                    {PROJECTS.map(p => (
                      <button key={p.id} onClick={() => {
                        const newSections = getSections(p.id);
                        const firstSection = newSections[0]?.label ?? '';
                        setBreadProjectId(p.id);
                        setBreadSection(firstSection);
                        setBreadProjectOpen(false);
                        onMove?.(p.id, firstSection);
                      }} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: p.id === breadProjectId ? 'var(--surface-3)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left' }}>
                        <i style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor, flexShrink: 0, display: 'block' }} />
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text)' }}>{p.name}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {/* Section picker */}
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>›</span>
              <div style={{ position: 'relative' }}>
                <button onClick={() => { setBreadSectionOpen(p => !p); setBreadProjectOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 5,
                    fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', whiteSpace: 'nowrap' }}
                  onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'}
                  onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'none'}
                >
                  {breadSection || 'Section'}
                  <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                </button>
                {breadSectionOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 400, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 4 }}>
                    {breadSections.length === 0
                      ? <span style={{ display: 'block', padding: '6px 10px', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>Aucune section</span>
                      : breadSections.map(s => (
                        <button key={s.label} onClick={() => {
                          setBreadSection(s.label);
                          setBreadSectionOpen(false);
                          onMove?.(breadProjectId, s.label);
                        }} style={{ display: 'block', width: '100%', padding: '6px 10px', background: s.label === breadSection ? 'var(--surface-3)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text)' }}>
                          {s.label}
                        </button>
                      ))
                    }
                  </div>
                )}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <button
                onClick={() => commentsAnchorRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
                title="Aller aux commentaires"
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
              >
                <SFIcon name="message-circle" size={13} />
                {comments.length > 0 && <span>{comments.length}</span>}
              </button>
              <button onClick={onClose} style={{ color: 'var(--text-3)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: 4, flexShrink: 0, borderRadius: 6 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
              >
                <SFIcon name="x" size={16} />
              </button>
            </div>
          </div>
          {/* Task title — click to edit */}
          {editingTitle ? (
            <textarea
              ref={titleInputRef}
              value={titleValue}
              onChange={e => setTitleValue(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTitle(); }
                if (e.key === 'Escape') { setTitleValue(task.title); setEditingTitle(false); }
              }}
              rows={2}
              style={{
                width: '100%', fontSize: 16, fontWeight: 700, lineHeight: 1.4,
                marginBottom: 10, padding: '4px 8px', borderRadius: 8,
                border: '1px solid var(--accent)', background: 'var(--surface-3)',
                color: 'var(--text)', fontFamily: 'var(--ff-text)',
                resize: 'none', outline: 'none', boxSizing: 'border-box',
              }}
            />
          ) : (
            <h3
              onClick={() => { setTitleValue(titleValue); setEditingTitle(true); }}
              title="Cliquer pour modifier"
              style={{
                fontSize: 16, fontWeight: 700, lineHeight: 1.4, marginBottom: 10,
                cursor: 'text', borderRadius: 8, padding: '4px 8px', margin: '0 -8px 10px',
                transition: 'background 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {titleValue}
            </h3>
          )}
          {/* Metadata row */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
            {/* Assigné */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Assigné à</span>
              <div style={{ position: 'relative' }}>
                <button onClick={e => openPanelDrop('assignee', e)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  {editAssignee
                    ? <SFAvatar initials={editAssignee.initials} bg={editAssignee.avatarColor} size={20} />
                    : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={11} color="var(--text-3)" /></span>
                  }
                  <span style={{ fontSize: 12, fontWeight: 500, color: 'var(--text)' }}>{editAssignee?.name ?? 'Non assigné'}</span>
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
                {panelOpen === 'assignee' && (
                  <InlineDropdown onClose={() => setPanelOpen(null)} anchorRect={panelDropRect} minWidth={180} zIndex={300}>
                    {ddItem(() => { setEditAssignee(null); setPanelOpen(null); onUpdate?.({ assignee: undefined }); },
                      <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>Non assigné</>,
                      editAssignee === null
                    )}
                    {TEAM.map(u => ddItem(() => { setEditAssignee(u); setPanelOpen(null); onUpdate?.({ assignee: u }); },
                      <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
                      editAssignee?.id === u.id
                    ))}
                  </InlineDropdown>
                )}
              </div>
            </div>
            {/* Priorité */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Priorité</span>
              <div style={{ position: 'relative' }}>
                <button onClick={e => openPanelDrop('priority', e)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[editPriority], flexShrink: 0, display: 'block' }} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[editPriority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{PRIORITY_LABEL[editPriority]}</span>
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
                {panelOpen === 'priority' && (
                  <InlineDropdown onClose={() => setPanelOpen(null)} anchorRect={panelDropRect} zIndex={300}>
                    {PRIORITY_OPTIONS.map(p => ddItem(() => { setEditPriority(p); setPanelOpen(null); onUpdate?.({ priority: p, priorityLabel: PRIORITY_LABEL[p] }); },
                      <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{PRIORITY_LABEL[p]}</>,
                      editPriority === p
                    ))}
                  </InlineDropdown>
                )}
              </div>
            </div>
            {/* Statut */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Statut</span>
              <div style={{ position: 'relative' }}>
                <button onClick={e => openPanelDrop('status', e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {editStatus
                    ? <SFPill status={editStatus as Task['status']} small>{editStatusLabel}</SFPill>
                    : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>Aucun</span>
                  }
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
                {panelOpen === 'status' && (
                  <InlineDropdown onClose={() => setPanelOpen(null)} anchorRect={panelDropRect} zIndex={300}>
                    {PANEL_STATUS_OPTIONS.map(o => ddItem(() => { setEditStatus(o.value); setEditStatusLabel(o.label); setPanelOpen(null); onUpdate?.({ status: o.value as Task['status'], statusLabel: o.label }); },
                      <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{o.label}</>,
                      editStatus === o.value
                    ))}
                  </InlineDropdown>
                )}
              </div>
            </div>
          </div>

          {/* Dates — compact inline row */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 8, flexWrap: 'wrap' }}>
            <SFIcon name="calendar" size={11} color="var(--text-3)" />
            <button
              onClick={e => { setDatePickerOpen(o => o === 'debut' ? null : 'debut'); setDatePickerRect((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, color: dateDebut ? (isOverdue(dateDebut) ? 'var(--danger)' : 'var(--text)') : 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}
            >
              {dateDebut ? formatDisplay(dateDebut) : 'Début'}
            </button>
            {dateDebut && (
              <button onClick={e => openPanelDrop('heureDebut', e)}
                style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, color: heureDebut ? 'var(--text)' : 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}
              >{heureDebut || '--:--'}</button>
            )}
            <span style={{ color: 'var(--text-3)', fontSize: 11 }}>→</span>
            <button
              onClick={e => { setDatePickerOpen(o => o === 'fin' ? null : 'fin'); setDatePickerRect((e.currentTarget as HTMLElement).getBoundingClientRect()); }}
              style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '3px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, color: dateFin ? 'var(--text)' : 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}
            >
              {dateFin ? formatDisplay(dateFin) : 'Fin'}
            </button>
            {dateFin && (
              <button onClick={e => openPanelDrop('heureFin', e)}
                style={{ padding: '3px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 11, color: heureFin ? 'var(--text)' : 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}
              >{heureFin || '--:--'}</button>
            )}
          </div>

          {/* DatePicker popups */}
          {datePickerOpen === 'debut' && (
            <DatePickerDropdown value={dateDebut} onChange={v => { setDateDebut(v); onUpdate?.({ dueDate: v }); setDatePickerOpen(null); }} onClose={() => setDatePickerOpen(null)} anchorRect={datePickerRect} zIndex={300} />
          )}
          {datePickerOpen === 'fin' && (
            <DatePickerDropdown value={dateFin} onChange={v => { setDateFin(v); onUpdate?.({ endDate: v }); setDatePickerOpen(null); }} onClose={() => setDatePickerOpen(null)} anchorRect={datePickerRect} zIndex={300} />
          )}
          {panelOpen === 'heureDebut' && (
            <TimePickerDropdown value={heureDebut} onChange={v => { setHeureDebut(v); onUpdate?.({ startTime: v }); setPanelOpen(null); }} onClose={() => setPanelOpen(null)} anchorRect={panelDropRect} zIndex={310} />
          )}
          {panelOpen === 'heureFin' && (
            <TimePickerDropdown value={heureFin} onChange={v => { setHeureFin(v); onUpdate?.({ endTime: v }); setPanelOpen(null); }} onClose={() => setPanelOpen(null)} anchorRect={panelDropRect} zIndex={310} />
          )}
        </div>

        {/* Body — single scrollable column */}
        <div style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Livrable toggle + format */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {secLabel('Livrable client')}
              {!isDeliverable ? (
                <button
                  onClick={() => { setIsDeliverable(true); setDeliverableExpanded(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="package" size={12} />
                  Marquer comme livrable
                </button>
              ) : (
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  {/* Compact summary chip — click to expand/collapse editor */}
                  <button
                    onClick={() => setDeliverableExpanded(v => !v)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 8, border: '1px solid var(--accent)', background: 'rgba(249,255,0,0.08)', color: 'var(--accent)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-mono)', letterSpacing: '0.03em' }}
                  >
                    <SFIcon name={DELIVERABLE_TYPE_OPTIONS.find(t => t.value === deliverableType)?.icon ?? 'package'} size={11} color="var(--accent)" />
                    {DELIVERABLE_TYPE_OPTIONS.find(t => t.value === deliverableType)?.label}
                    {(deliverableType === 'video' || deliverableType === 'photo') && (
                      <><span style={{ color: 'rgba(249,255,0,0.45)', margin: '0 1px' }}>·</span>
                      <span style={{ color: 'rgba(249,255,0,0.7)' }}>{format === 'custom' ? `${customW}×${customH}` : format}</span></>
                    )}
                    {(deliverableType === 'video' || deliverableType === 'audio') && deliverableDuration && (
                      <><span style={{ color: 'rgba(249,255,0,0.45)', margin: '0 1px' }}>·</span>
                      <span style={{ color: 'rgba(249,255,0,0.7)' }}>{deliverableDuration}</span></>
                    )}
                    {deliverableType === 'photo' && deliverableQuantity > 1 && (
                      <><span style={{ color: 'rgba(249,255,0,0.45)', margin: '0 1px' }}>·</span>
                      <span style={{ color: 'rgba(249,255,0,0.7)' }}>{deliverableQuantity} photos</span></>
                    )}
                    {deliverableNote && (
                      <><span style={{ color: 'rgba(249,255,0,0.45)', margin: '0 1px' }}>·</span>
                      <span style={{ color: 'rgba(249,255,0,0.55)', maxWidth: 120, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deliverableNote}</span></>
                    )}
                    <SFIcon name={deliverableExpanded ? 'chevron-up' : 'chevron-down'} size={10} color="var(--accent)" />
                  </button>
                  {/* Disable button */}
                  <button
                    onClick={() => { setIsDeliverable(false); setDeliverableExpanded(false); }}
                    title="Désactiver le livrable"
                    style={{ display: 'flex', alignItems: 'center', padding: 3, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--danger)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  >
                    <SFIcon name="x" size={11} />
                  </button>
                </div>
              )}
            </div>

            {/* Expanded editor */}
            {isDeliverable && deliverableExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {/* Type pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {DELIVERABLE_TYPE_OPTIONS.map(t => (
                    <button key={t.value} onClick={() => setDeliverableType(t.value)}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 7, border: `1px solid ${deliverableType === t.value ? 'var(--accent)' : 'var(--border)'}`, background: deliverableType === t.value ? 'rgba(249,255,0,0.08)' : 'var(--surface)', cursor: 'pointer' }}>
                      <SFIcon name={t.icon} size={11} color={deliverableType === t.value ? 'var(--accent)' : 'var(--text-3)'} />
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: deliverableType === t.value ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{t.label}</span>
                    </button>
                  ))}
                </div>
                {/* Format pills — only for video/photo */}
                {(deliverableType === 'video' || deliverableType === 'photo') && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    {FORMAT_OPTIONS.map(f => (
                      <button key={f.value} onClick={() => setFormat(f.value)}
                        style={{ padding: '3px 9px', borderRadius: 7, border: `1px solid ${format === f.value ? 'var(--accent)' : 'var(--border)'}`, background: format === f.value ? 'rgba(249,255,0,0.08)' : 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: 9, color: format === f.value ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.04em' }}>
                        {f.label}
                      </button>
                    ))}
                    {format === 'custom' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                        <input type="number" value={customW} onChange={e => setCustomW(Number(e.target.value))}
                          style={{ width: 72, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-mono)', outline: 'none' }} />
                        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>×</span>
                        <input type="number" value={customH} onChange={e => setCustomH(Number(e.target.value))}
                          style={{ width: 72, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-mono)', outline: 'none' }} />
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>px</span>
                      </div>
                    )}
                  </div>
                )}
                {/* Champs spécifiques au type */}
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                  {(deliverableType === 'video' || deliverableType === 'audio') && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, width: 68 }}>Durée</span>
                      <input
                        type="text"
                        value={deliverableDuration}
                        onChange={e => setDeliverableDuration(e.target.value)}
                        placeholder="ex : 1:30"
                        style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-mono)', outline: 'none' }}
                      />
                    </div>
                  )}
                  {deliverableType === 'photo' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, width: 68 }}>Quantité</span>
                      <input
                        type="number"
                        min={1}
                        value={deliverableQuantity}
                        onChange={e => setDeliverableQuantity(Number(e.target.value))}
                        style={{ width: 80, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-mono)', outline: 'none' }}
                      />
                      <span style={{ fontSize: 11, color: 'var(--text-3)' }}>photos</span>
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, width: 68, paddingTop: 5 }}>Note</span>
                    <textarea
                      value={deliverableNote}
                      onChange={e => setDeliverableNote(e.target.value)}
                      placeholder={deliverableType === 'document' || deliverableType === 'web' ? 'ex : 5 pages de destination' : 'Note personnalisée…'}
                      rows={2}
                      style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)', outline: 'none', resize: 'none', lineHeight: 1.5 }}
                    />
                  </div>
                </div>
                {/* Confirmer — referme l'éditeur en chip compact */}
                <div style={{ display: 'flex', justifyContent: 'flex-end', paddingTop: 2 }}>
                  <button
                    onClick={() => setDeliverableExpanded(false)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 12px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                  >
                    <SFIcon name="check" size={11} color="var(--on-accent)" />
                    Confirmer
                  </button>
                </div>
              </div>
            )}
          </div>

          {divider}

          {/* Description */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {secLabel('Description')}
            <textarea
              ref={descRef}
              value={description}
              onChange={e => { setDescription(e.target.value); }}
              placeholder="Ajouter une description..."
              rows={2}
              style={{
                width: '100%', padding: '8px 12px', borderRadius: 10,
                border: '1px solid var(--border)', background: 'var(--surface-2)',
                color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
                resize: 'none', outline: 'none', lineHeight: 1.6, boxSizing: 'border-box',
                overflow: 'hidden', minHeight: 56,
              }}
            />
          </div>

          {divider}

          {/* Ressources liées — toujours visible */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {panelSectionLabel(`Ressources liées${linkedResources.length ? ` (${linkedResources.length})` : ''}`)}
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => { setResourcePickerOpen(o => !o); setResPickerRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect()); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 5,
                    padding: '4px 10px', borderRadius: 7,
                    border: '1px solid var(--border-2)', background: 'var(--surface-2)',
                    color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)',
                  }}
                >
                  <SFIcon name="plus" size={11} />
                  Lier
                </button>

                {/* Resource picker dropdown */}
                {resourcePickerOpen && (() => {
                  const dropH = 440;
                  const spaceBelow = resPickerRect ? window.innerHeight - resPickerRect.bottom - 8 : 0;
                  const openUp = resPickerRect && spaceBelow < dropH;
                  const topPos = openUp
                    ? (resPickerRect!.top - dropH - 6)
                    : (resPickerRect ? resPickerRect.bottom + 6 : 100);
                  return (
                    <>
                      <div onClick={() => setResourcePickerOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
                      <div style={{ position: 'fixed', top: Math.max(8, topPos), right: resPickerRect ? window.innerWidth - resPickerRect.right : 20, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14, boxShadow: '0 12px 40px rgba(0,0,0,0.6)', minWidth: 300, maxWidth: 340, display: 'flex', flexDirection: 'column', maxHeight: Math.min(dropH, window.innerHeight - 24) }}>
                        {/* Scrollable resource list */}
                        <div style={{ overflowY: 'auto', flex: 1, padding: 6 }}>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 10px 4px' }}>Ressources existantes</p>
                          {resources.map(r => {
                            const linked = linkedResources.includes(r.id);
                            return (
                              <button key={r.id} onClick={() => { setLinkedResources(prev => linked ? prev.filter(id => id !== r.id) : [...prev, r.id]); }}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: linked ? 'rgba(249,255,0,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => { if (!linked) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                                onMouseLeave={e => { if (!linked) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <SFIcon name={TYPE_ICON[r.type]} size={13} color="var(--text-3)" />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>{r.eyebrow}</p>
                                </div>
                                {linked && <SFIcon name="check" size={13} color="var(--accent)" />}
                              </button>
                            );
                          })}
                        </div>
                        {/* Sticky "Créer" section at bottom */}
                        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 10px 12px', flexShrink: 0, background: 'var(--surface)' }}>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Créer une nouvelle ressource</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {(Object.keys(RESOURCE_TYPE_LABELS) as ResourceType[]).map(type => (
                              <button key={type} onClick={() => setResourcePickerOpen(false)}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                                <SFIcon name={TYPE_ICON[type]} size={11} />
                                {RESOURCE_TYPE_LABELS[type]}
                              </button>
                            ))}
                          </div>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
            </div>

            {/* Linked resources list */}
            {linkedResources.length > 0
              ? resources.filter(r => linkedResources.includes(r.id)).map(r => (
                <div key={r.id} style={{ position: 'relative' }}>
                  <div
                    onClick={() => setFullscreenResource(r.id)}
                    style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', transition: 'border-color 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                    onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
                  >
                    <div style={{ width: 30, height: 30, borderRadius: 7, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <SFIcon name={TYPE_ICON[r.type]} size={14} color="var(--text-3)" />
                    </div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>{r.eyebrow}</p>
                      <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                      {r.type === 'checklist' && r.progress !== undefined && (
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4 }}>
                          <SFBar value={r.progress} height={3} />
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>{r.progress}%</span>
                        </div>
                      )}
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setResStatusDrop(prev => prev === r.id ? null : r.id); setResStatusRect(e.currentTarget.getBoundingClientRect()); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
                      title="Changer le statut"
                    >
                      <SFPill status={r.status} small>{r.statusLabel}</SFPill>
                      <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                    </button>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); setFullscreenResource(r.id); }}
                        title="Ouvrir en plein écran"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                      >
                        <SFIcon name="maximize-2" size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); setLinkedResources(prev => prev.filter(id => id !== r.id)); }}
                        title="Retirer la ressource"
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.background = 'rgba(255,60,60,0.08)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'none'; }}
                      >
                        <SFIcon name="x" size={13} />
                      </button>
                    </div>
                  </div>
                  {resStatusDrop === r.id && resStatusRect && (
                    <InlineDropdown onClose={() => setResStatusDrop(null)} anchorRect={resStatusRect} minWidth={160} zIndex={700}>
                      {RESOURCE_STATUS_OPTIONS.map(opt => (
                        <button key={opt.status}
                          onClick={() => { updateResource(r.id, { status: opt.status, statusLabel: opt.label }); setResStatusDrop(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: r.status === opt.status ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', borderRadius: 7 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = r.status === opt.status ? 'var(--surface-2)' : 'transparent')}
                        >
                          <SFPill status={opt.status} small>{opt.label}</SFPill>
                        </button>
                      ))}
                    </InlineDropdown>
                  )}
                </div>
              ))
              : <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune ressource liée</p>
            }
          </div>

          {/* Sous-tâches */}
          {divider}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 2 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              {panelSectionLabel(`Sous-tâches${localSubtasks.length ? ` (${localSubtasks.filter(s => s.checked).length}/${localSubtasks.length})` : ''}`)}
              {localSubtasks.some(s => s.checked) && (
                <button
                  onClick={() => setHideCompletedSubs(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, border: '1px solid var(--border)', background: hideCompletedSubs ? 'rgba(249,255,0,0.07)' : 'transparent', color: hideCompletedSubs ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}
                  title={hideCompletedSubs ? 'Afficher les sous-tâches terminées' : 'Masquer les sous-tâches terminées'}
                >
                  <SFIcon name={hideCompletedSubs ? 'eye-off' : 'eye'} size={12}  />
                  {hideCompletedSubs ? 'Terminées masquées' : 'Masquer terminées'}
                </button>
              )}
            </div>
            {localSubtasks.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: SUB_GRID, gap: 16, padding: '4px 8px 6px', marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
                <span />{subColLabel('Titre')}{subColLabel('Prio')}{subColLabel('Assigné')}{subColLabel('Échéance')}<span />
              </div>
            )}
            {localSubtasks.filter(sub => !hideCompletedSubs || !sub.checked).map(sub => (
              <SubTaskRow key={sub.id} sub={sub}
                onToggle={() => updateSub(sub.id, { checked: !sub.checked })}
                onUpdate={patch => updateSub(sub.id, patch)}
                onDelete={() => setLocalSubtasks(prev => prev.filter(s => s.id !== sub.id))}
              />
            ))}
            <button onClick={addSubtask}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', marginTop: 2 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <SFIcon name="plus" size={12} />Ajouter une sous-tâche
            </button>
          </div>

          {divider}

          {/* Commentaires */}
          <div ref={commentsAnchorRef} style={{ display: 'flex', flexDirection: 'column', gap: 12, borderRadius: 9 }}>
            {panelSectionLabel(`Commentaires${comments.length ? ` (${comments.length})` : ''}`)}

            {comments.map(c => (
              <div key={c.id}>
                {/* Main comment */}
                <div style={{ display: 'flex', gap: 10 }}>
                  <SFAvatar initials={c.author.initials} bg={c.author.bg} size={26} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ background: 'var(--surface-2)', borderRadius: 10, padding: '8px 12px', fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      {renderMentions(c.text)}
                    </div>
                    <div style={{ display: 'flex', gap: 10, marginTop: 4, paddingLeft: 4 }}>
                      <button onClick={() => { setReplyingTo(c.id); setReplyText(''); }}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', padding: 0, fontFamily: 'var(--ff-text)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                      >Répondre</button>
                      <button onClick={() => convertToSubtask(c)}
                        style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', padding: 0, fontFamily: 'var(--ff-text)' }}
                        onMouseEnter={e => (e.currentTarget.style.color = 'var(--accent)')}
                        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                      >
                        <SFIcon name="git-branch" size={11} />→ Sous-tâche
                      </button>
                    </div>
                  </div>
                </div>

                {/* Replies */}
                {c.replies.map(r => (
                  <div key={r.id} style={{ display: 'flex', gap: 8, marginLeft: 34, marginTop: 6 }}>
                    <SFAvatar initials={r.author.initials} bg={r.author.bg} size={22} />
                    <div style={{ background: 'var(--surface-2)', borderRadius: 9, padding: '6px 10px', fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5 }}>
                      {renderMentions(r.text)}
                    </div>
                  </div>
                ))}

                {/* Inline reply input */}
                {replyingTo === c.id && (
                  <div style={{ display: 'flex', gap: 8, marginLeft: 34, marginTop: 6 }}>
                    <SFAvatar initials={ME.initials} bg={ME.bg} size={22} />
                    <div style={{ flex: 1, display: 'flex', gap: 5 }}>
                      <input
                        autoFocus
                        value={replyText}
                        onChange={e => setReplyText(e.target.value)}
                        onKeyDown={e => { if (e.key === 'Enter') submitReply(c.id); if (e.key === 'Escape') setReplyingTo(null); }}
                        placeholder="Répondre…"
                        style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)' }}
                      />
                      <button onClick={() => submitReply(c.id)}
                        style={{ padding: '5px 12px', borderRadius: 8, border: 'none', background: replyText.trim() ? 'var(--accent)' : 'var(--surface-3)', color: replyText.trim() ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 11, fontWeight: 600, cursor: replyText.trim() ? 'pointer' : 'default', fontFamily: 'var(--ff-text)' }}>
                        Envoyer
                      </button>
                      <button onClick={() => setReplyingTo(null)}
                        style={{ padding: '5px 8px', borderRadius: 8, border: 'none', background: 'none', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                        Annuler
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))}

            {/* New comment input */}
            <div style={{ display: 'flex', gap: 8, position: 'relative' }}>
              <SFAvatar initials={ME.initials} bg={ME.bg} size={26} />
              <div style={{ flex: 1, display: 'flex', gap: 6 }}>
                <input
                  ref={commentInputRef}
                  value={comment}
                  onChange={e => handleCommentChange(e.target.value, e.currentTarget)}
                  onKeyDown={e => { if (e.key === 'Enter' && !mentionQuery) submitComment(); }}
                  placeholder="Ajouter un commentaire… (@ pour mentionner)"
                  style={{ flex: 1, padding: '7px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)' }}
                />
                <button onClick={submitComment}
                  style={{ padding: '7px 14px', borderRadius: 9, border: 'none', background: comment.trim() ? 'var(--accent)' : 'var(--surface-3)', color: comment.trim() ? 'var(--on-accent)' : 'var(--text-3)', fontSize: 12, fontWeight: 600, cursor: comment.trim() ? 'pointer' : 'default', transition: 'all 0.12s', fontFamily: 'var(--ff-text)' }}>
                  Envoyer
                </button>
              </div>

              {/* @mention dropdown */}
              {mentionQuery !== null && (() => {
                const filtered = TEAM.filter(u => u.name.toLowerCase().includes(mentionQuery.toLowerCase()));
                if (!filtered.length) return null;
                return (
                  <>
                    <div onClick={() => setMentionQuery(null)} style={{ position: 'fixed', inset: 0, zIndex: 490 }} />
                    <div style={{ position: 'fixed', bottom: mentionRect ? window.innerHeight - mentionRect.top + 6 : 80, left: mentionRect?.left ?? 100, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 200, padding: 4 }}>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '4px 8px 2px' }}>Mentionner</p>
                      {filtered.map(u => (
                        <button key={u.id} onClick={() => pickMention(u.name)}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                        >
                          <SFAvatar initials={u.initials} bg={u.avatarColor} size={22} />
                          <span style={{ fontSize: 13, color: 'var(--text)' }}>{u.name}</span>
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{u.role}</span>
                        </button>
                      ))}
                    </div>
                  </>
                );
              })()}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div style={{ padding: '10px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, flexShrink: 0 }}>
          <SFButton variant="secondary" size="sm" icon="square-pen" style={{ flex: 1, justifyContent: 'center' }}>Modifier</SFButton>
          <SFButton variant="ghost" size="sm" icon="trash-2" style={{ color: 'var(--danger)' }} />
        </div>
      </div>

      {/* Resource fullscreen overlay — uses the same ResourceBody as the full resource page */}
      {fullscreenResource && (() => { // eslint-disable-line
        const res = resources.find(r => r.id === fullscreenResource);
        if (!res) return null;
        return (
          <div style={{ position: 'fixed', inset: 0, zIndex: 600, background: 'var(--bg)', display: 'flex', flexDirection: 'column' }}>
            {/* Topbar */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 20px', borderBottom: '1px solid var(--border)', background: 'var(--surface)', flexShrink: 0 }}>
              <div style={{ width: 32, height: 32, borderRadius: 8, background: 'var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <SFIcon name={TYPE_ICON[res.type]} size={15} color="var(--text-2)" />
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{res.eyebrow}</p>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{res.title}</p>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => { setFsStatusDropOpen(o => !o); setFsStatusRect(e.currentTarget.getBoundingClientRect()); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  title="Changer le statut"
                >
                  <SFPill status={res.status} small>{res.statusLabel}</SFPill>
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
                {fsStatusDropOpen && fsStatusRect && (
                  <InlineDropdown onClose={() => setFsStatusDropOpen(false)} anchorRect={fsStatusRect} minWidth={160} zIndex={700}>
                    {RESOURCE_STATUS_OPTIONS.map(opt => (
                      <button key={opt.status}
                        onClick={() => { updateResource(res.id, { status: opt.status, statusLabel: opt.label }); setFsStatusDropOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: res.status === opt.status ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', borderRadius: 7 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = res.status === opt.status ? 'var(--surface-2)' : 'transparent')}
                      >
                        <SFPill status={opt.status} small>{opt.label}</SFPill>
                      </button>
                    ))}
                  </InlineDropdown>
                )}
              </div>
              <button
                onClick={() => { setFullscreenResource(null); setFsStatusDropOpen(false); }}
                style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 34, height: 34, borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', flexShrink: 0 }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
                title="Fermer (revenir à la tâche)"
              >
                <SFIcon name="x" size={16} />
              </button>
            </div>
            {/* Full resource body — identical to the resource detail page */}
            <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
              <ResourceBody resource={res} />
            </div>
          </div>
        );
      })()}
    </>
  );
}
