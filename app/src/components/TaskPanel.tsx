import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFIcon, DatePickerDropdown, TimePickerDropdown, formatDisplay, isOverdue, AssigneeGroup } from './ui';
import { USERS } from '../data/mock';
import { getProjects } from '../data/projectStore';
import { STATUS_COLOR } from '../data/status';
import { getSections } from '../data/taskStore';
import { getResources, updateResource, subscribeResources } from '../data/resourceStore';
import { getCurrentUser } from '../data/authStore';
import { useClampedMenuPosition } from '../hooks/useClampedMenuPosition';
import type { Task, Priority, ResourceType, DeliverableFormat, DeliverableType, Status, TaskComment, User } from '../types';
import { ResourceBody } from '../screens/ResourceDetail';
import { showToast } from '../data/toastStore';
import { RevisionCommentSidebar, type RevisionComment } from './RevisionComments';
import { notifyComment } from '../data/commentNotify';
import { WatchersRow } from './WatchersRow';
import { addWatcher } from '../data/watchers';

// ── Constants ─────────────────────────────────────────────────────────────────

const PRIORITY_COLOR: Record<Priority, string> = {
  high:   'var(--danger)',
  normal: 'var(--warn)',
  low:    'var(--info)',
  none:   'var(--border-2)',
};
const PRIORITY_LABEL_KEY: Record<Priority, string> = {
  high:   'priority.high',
  normal: 'priority.medium',
  low:    'priority.low',
  none:   'priority.none',
};
const PRIORITY_OPTIONS: Priority[] = ['high', 'normal', 'low', 'none'];


const PANEL_STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '',       labelKey: 'tasks.noStatus'   },
  { value: 'warn',   labelKey: 'tasks.todo'       },
  { value: 'info',   labelKey: 'tasks.inProgress' },
  { value: 'ok',     labelKey: 'tasks.completed'  },
  { value: 'danger', labelKey: 'tasks.overdue'    },
  { value: 'review', labelKey: 'tasks.inReview'   },
];

const RESOURCE_STATUS_OPTIONS: { status: Status; labelKey: string }[] = [
  { status: 'ok',      labelKey: 'resources.completed'  },
  { status: 'info',    labelKey: 'resources.inProgress' },
  { status: 'warn',    labelKey: 'resources.todo'       },
  { status: 'review',  labelKey: 'resources.inReview'   },
  { status: 'danger',  labelKey: 'resources.blocked'    },
  { status: 'neutral', labelKey: 'resources.waiting'    },
];

const FORMAT_OPTIONS: { value: DeliverableFormat; labelKey?: string; label?: string; ratio: string }[] = [
  { value: '16:9',    label: '16:9',    ratio: '16/9' },
  { value: '9:16',    label: '9:16',    ratio: '9/16' },
  { value: '1:1',     label: '1:1',     ratio: '1/1' },
  { value: '4:3',     label: '4:3',     ratio: '4/3' },
  { value: '2.35:1',  label: '2.35:1',  ratio: '2.35/1' },
  { value: 'custom',  labelKey: 'taskPanel.formatCustom', ratio: '4/3' },
];

const DELIVERABLE_TYPE_OPTIONS: { value: DeliverableType; labelKey: string; icon: string }[] = [
  { value: 'video',     labelKey: 'taskPanel.delivVideo',      icon: 'video'       },
  { value: 'photo',     labelKey: 'taskPanel.delivPhoto',      icon: 'image'       },
  { value: 'audio',     labelKey: 'taskPanel.delivAudio',      icon: 'music'       },
  { value: 'document',  labelKey: 'taskPanel.delivDocument',   icon: 'file-text'   },
  { value: 'web',       labelKey: 'taskPanel.delivWeb',        icon: 'globe'       },
  { value: 'graphique', labelKey: 'taskPanel.delivGraphic',    icon: 'pen-tool'    },
  { value: 'service',   labelKey: 'taskPanel.delivService',    icon: 'briefcase'   },
  { value: 'produit',   labelKey: 'taskPanel.delivProduct',    icon: 'package-2'   },
  { value: 'autre',     labelKey: 'taskPanel.delivOther',      icon: 'circle-dashed'},
];

const RESOURCE_TYPE_LABEL_KEY: Record<ResourceType, string> = {
  screenplay:   'resources.scenography',
  video_review: 'resources.review',
  moodboard:    'resources.moodboard',
  document:     'resources.document',
  inspirations: 'resources.inspirations',
  form:         'resources.form',
  web_review:   'resources.webReview',
};

const TYPE_ICON: Record<ResourceType, string> = {
  screenplay:   'clapperboard',
  video_review: 'video',
  moodboard:    'grid-2x2',
  document:     'file',
  inspirations: 'image',
  form:         'clipboard-list',
  web_review:   'globe',
};

// ── Types ─────────────────────────────────────────────────────────────────────

export type CommentObj = TaskComment;

export interface LocalSubtask {
  id: string;
  title: string;
  checked: boolean;
  priority: Priority;
  status: string;
  statusLabel: string;
  assignees: User[];
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
  // Portaled to document.body — TaskPanel is a sliding side panel, and a
  // `position: fixed` popover left in-tree gets trapped inside whatever
  // ancestor establishes a containing block (transform/animation on the
  // panel itself), clipping/misordering it against later siblings (e.g. a
  // fields popover opened on an early subtask row rendering behind rows
  // and sections further down). Portaling escapes that entirely, same fix
  // already applied to the other InlineDropdown instances in this codebase.
  return createPortal(
    <>
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>,
    document.body,
  );
}

// ── SubTask grid constants ─────────────────────────────────────────────────────

// Priority/assignee/date used to each get their own column, which starved
// the title of width in the panel's ~400px content area. They now live
// behind a single "fields" button (see SubTaskRow) so title gets almost
// the full row.
const SUB_GRID = '22px minmax(120px, 1fr) auto 24px';

const subColLabel = (label: string) => (
  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', overflow: 'hidden', whiteSpace: 'nowrap', display: 'block' }}>{label}</span>
);

// ── SubTaskRow ────────────────────────────────────────────────────────────────

function SubTaskRow({ sub, onUpdate, onDelete, onPasteMultiple, onEnterNext, selected, onSelect, onContextMenu }: {
  sub: LocalSubtask;
  onUpdate: (patch: Partial<LocalSubtask>) => void;
  onDelete: () => void;
  onPasteMultiple: (lines: string[]) => void;
  onEnterNext?: (title: string) => void;
  selected?: boolean;
  onSelect?: (e: React.MouseEvent) => void;
  onContextMenu?: (e: React.MouseEvent) => void;
}) {
  const { t } = useTranslation();
  const [editing, setEditing] = useState(sub.title === '');
  const [editTitle, setEditTitle] = useState(sub.title);
  const [hovered, setHovered] = useState(false);
  // Optimistic local checkbox state, same delayed-commit + undo pattern as
  // a regular task row — keeping it here (rather than a plain onToggle
  // callback) is what lets a subtask's completion be undone too.
  const [checked, setChecked] = useState(sub.checked);
  const completeTimer = useRef<number | null>(null);
  useEffect(() => { setChecked(sub.checked); }, [sub.checked]);
  const toggleChecked = () => {
    const next = !checked;
    setChecked(next);
    if (completeTimer.current) { clearTimeout(completeTimer.current); completeTimer.current = null; }
    if (next) {
      completeTimer.current = window.setTimeout(() => { onUpdate({ checked: true }); }, 1100);
      showToast({
        type: 'subtask',
        message: t('taskPanel.subtaskCompleted'),
        onUndo: () => {
          if (completeTimer.current) { clearTimeout(completeTimer.current); completeTimer.current = null; }
          setChecked(false);
          onUpdate({ checked: false });
        },
      });
    } else {
      onUpdate({ checked: false });
    }
  };
  // Priority/assignee/date all live inside one "fields" popover; `dropOpen`
  // is only for the nested date picker launched from within it.
  const [fieldsOpen, setFieldsOpen] = useState(false);
  const [fieldsRect, setFieldsRect] = useState<DOMRect | null>(null);
  const [dropOpen, setDropOpen] = useState<'date' | null>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const editTitleRef = useRef<HTMLInputElement>(null);
  const hasFields = sub.priority !== 'none' || sub.assignees.length > 0 || !!sub.dueDate;

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

  // Compact form for the inline row indicator — no label, smallest legible format.
  const fmtDateCompact = (d: string) => {
    const dt = new Date(d + 'T00:00:00');
    return dt.toLocaleDateString('fr-CA', { day: 'numeric', month: 'numeric' });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); }}
      onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
      onClick={e => {
        if (editing) return;
        if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
        onSelect?.(e);
      }}
      onContextMenu={e => {
        if (!onContextMenu) return;
        e.preventDefault();
        onContextMenu(e);
      }}
      data-subtask-row
      style={{ display: 'grid', gridTemplateColumns: SUB_GRID, alignItems: 'center', gap: 10, padding: '6px 8px', borderRadius: 8, background: selected ? 'rgba(249,255,0,0.08)' : hovered ? 'var(--surface-2)' : 'transparent', outline: selected ? '1px solid rgba(249,255,0,0.35)' : 'none', outlineOffset: '-1px', transition: 'background 0.1s', cursor: onSelect ? 'default' : undefined, userSelect: 'none' }}
    >
      {/* Checkbox */}
      <button onClick={toggleChecked}
        style={{ width: 16, height: 16, borderRadius: '50%', cursor: 'pointer', border: checked ? 'none' : '1.5px solid var(--border-2)', background: checked ? 'var(--ok)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', justifySelf: 'center', flexShrink: 0 }}>
        {checked && <SFIcon name="check" size={10} color="white" />}
      </button>

      {/* Title — single-line input, same as a regular task row: box width
          hugs the text, triple-click selects all, Escape discards, blur
          only commits a non-empty change. */}
      {editing ? (
        <input ref={editTitleRef} autoFocus value={editTitle}
          onChange={e => setEditTitle(e.target.value)}
          onBlur={() => {
            const trimmed = editTitle.trim();
            if (trimmed && trimmed !== sub.title) onUpdate({ title: trimmed });
            else setEditTitle(sub.title);
            setEditing(false);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter') {
              e.preventDefault();
              const trimmed = editTitle.trim();
              setEditing(false);
              if (trimmed) {
                // Like AddTaskRow: Enter on a titled row commits the title
                // AND opens a fresh blank row right after it, as one atomic
                // update — so a checklist can be typed line by line.
                onEnterNext?.(trimmed);
              } else {
                setEditTitle(sub.title);
              }
            }
            if (e.key === 'Escape') { setEditTitle(sub.title); setEditing(false); }
          }}
          onPaste={e => {
            const text = e.clipboardData.getData('text');
            const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
            if (lines.length <= 1) return;
            e.preventDefault();
            setEditing(false);
            onPasteMultiple(lines);
          }}
          placeholder={t('tasks.newSubtask')}
          style={{ gridColumn: '2 / 4', justifySelf: 'start', fontSize: 12, padding: '2px 6px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-3)', color: 'var(--text)', outline: 'none', fontFamily: 'var(--ff-text)', boxSizing: 'content-box', width: `${Math.max(editTitle ? 2 : t('tasks.newSubtask').length + 2, editTitle.length + 1)}ch`, maxWidth: '100%' }}
        />
      ) : (
        <span onClick={() => { setEditTitle(sub.title); setEditing(true); }}
          onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
          style={{ justifySelf: 'start', maxWidth: '100%', fontSize: 12, textDecoration: checked ? 'line-through' : 'none', color: sub.title ? (checked ? 'var(--text-3)' : 'var(--text-2)') : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'text', fontStyle: sub.title ? 'normal' : 'italic' }}>
          {sub.title || t('tasks.newSubtask')}
        </span>
      )}

      {/* Priority / Assignee / Date — consolidated behind one button so the
          title column doesn't have to give up space to three separate
          controls. Hidden while editing so the title field can borrow the
          column's width instead of being squeezed into the title track alone. */}
      {!editing && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 5, justifySelf: 'end' }}>
          {/* Compact glance row — shows what's set without opening the fields
              popover; each piece only renders when it has a value, so an
              empty subtask stays uncluttered. */}
          {sub.assignees.length > 0 && (
            <AssigneeGroup assignees={sub.assignees} size={16} readOnly />
          )}
          {sub.dueDate && (
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{fmtDateCompact(sub.dueDate)}</span>
          )}
          <div style={{ position: 'relative' }}>
          <button
            onClick={e => { e.stopPropagation(); setFieldsOpen(v => !v); setFieldsRect(e.currentTarget.getBoundingClientRect()); }}
            title={t('taskPanel.subtaskFields')}
            style={{ position: 'relative', display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, border: 'none', background: fieldsOpen ? 'var(--surface-3)' : 'transparent', cursor: 'pointer' }}
            onMouseEnter={e => { if (!fieldsOpen) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
            onMouseLeave={e => { if (!fieldsOpen) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
          >
            <SFIcon name="sliders-horizontal" size={12} color={hasFields ? 'var(--text-2)' : 'var(--text-3)'} />
            {sub.priority !== 'none' && (
              <span style={{ position: 'absolute', top: 1, right: 1, width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[sub.priority], border: '1px solid var(--surface)' }} />
            )}
          </button>
          {fieldsOpen && (
            <InlineDropdown onClose={() => setFieldsOpen(false)} anchorRect={fieldsRect} minWidth={220} zIndex={600}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10, padding: '6px 6px 4px' }}>
                {/* Priority */}
                <div>
                  {subColLabel(t('tasks.priority'))}
                  <div style={{ display: 'flex', gap: 6, marginTop: 5 }}>
                    {PRIORITY_OPTIONS.map(p => (
                      <button key={p} onClick={() => onUpdate({ priority: p })} title={t(PRIORITY_LABEL_KEY[p])}
                        style={{ width: 22, height: 22, borderRadius: '50%', background: PRIORITY_COLOR[p], border: sub.priority === p ? '2px solid var(--text)' : '2px solid transparent', cursor: 'pointer', flexShrink: 0 }}
                      />
                    ))}
                  </div>
                </div>
                {/* Assignee */}
                <div>
                  {subColLabel(t('tasks.assigned'))}
                  <div style={{ marginTop: 5 }}>
                    <AssigneeGroup
                      assignees={sub.assignees}
                      size={22}
                      zIndex={700}
                      onChange={next => onUpdate({ assignees: next })}
                    />
                  </div>
                </div>
                {/* Date */}
                <div style={{ position: 'relative' }}>
                  {subColLabel(t('tasks.dueDate'))}
                  <button onClick={e => openDrop('date', e)}
                    style={{ display: 'flex', alignItems: 'center', gap: 5, marginTop: 5, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 7, padding: '4px 8px', cursor: 'pointer', width: '100%' }}>
                    <SFIcon name="calendar" size={11} color={sub.dueDate ? 'var(--text-2)' : 'var(--text-3)'} />
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: sub.dueDate ? 'var(--text-2)' : 'var(--text-3)' }}>{fmtDate(sub.dueDate)}</span>
                  </button>
                  {dropOpen === 'date' && (
                    <DatePickerDropdown value={sub.dueDate} onChange={v => { onUpdate({ dueDate: v }); setDropOpen(null); }} onClose={() => setDropOpen(null)} anchorRect={dropRect} zIndex={700} />
                  )}
                </div>
              </div>
            </InlineDropdown>
          )}
          </div>
        </div>
      )}

      {/* Delete */}
      <button onClick={e => { e.stopPropagation(); onDelete(); }} title={t('tasks.delete')}
        style={{ visibility: hovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, justifySelf: 'center' }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}>
        <SFIcon name="trash-2" size={11} />
      </button>
    </div>
  );
}

// ── SubtaskContextMenu ───────────────────────────────────────────────────────
// Right-click / bulk-action menu for one or more selected subtasks — mirrors
// Travail.tsx's TaskContextMenu, but scoped to what makes sense for a
// subtask (no "open detail", since subtasks don't have one).

function SubtaskContextMenu({ pos, count, onConvert, onMove, onCopy, onDelete, onClose }: {
  pos: { x: number; y: number };
  count: number;
  onConvert: () => void;
  onMove?: () => void;
  onCopy?: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const coords = useClampedMenuPosition(ref, pos);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  const item = (label: React.ReactNode, action: () => void, danger = false) => (
    <button onClick={() => { action(); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >{label}</button>
  );
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left: coords.left, top: coords.top, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 200, padding: '4px 0', overflow: 'hidden', maxHeight: coords.maxHeight, overflowY: coords.maxHeight ? 'auto' : 'hidden' }}>
      {item(<><SFIcon name="git-branch" size={13} color="var(--text-3)" /><span>{t('taskPanel.convertSubtaskToTask', { count })}</span></>, onConvert)}
      {onMove && item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>{t('board.moveTo')}</span></>, onMove)}
      {onCopy && item(<><SFIcon name="copy" size={13} color="var(--text-3)" /><span>{t('taskPanel.copyTo')}</span></>, onCopy)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('tasks.delete')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

// ── TaskPanel ─────────────────────────────────────────────────────────────────

export function TaskPanel({
  task, onClose, onUpdate, onMove, sectionLabel, autoFocusComments, inline,
  onConvertSubtasks, onMoveSubtasksAsTask, onCopySubtasksAsTask,
}: {
  task: Task;
  onClose: () => void;
  onUpdate?: (patch: Partial<Task>) => void;
  onMove?: (newProjectId: string, newSectionLabel: string) => void;
  sectionLabel?: string;
  autoFocusComments?: boolean;
  inline?: boolean;
  // Sous-tâches → tâches (multi-select + menu clic droit). Non fournis =
  // fonctionnalité masquée pour cet écran hôte (ex. Modèles).
  onConvertSubtasks?: (subtaskIds: string[]) => void;
  onMoveSubtasksAsTask?: (subtaskIds: string[]) => void;
  onCopySubtasksAsTask?: (subtaskIds: string[]) => void;
}) {
  const { t } = useTranslation();
  const [resources, setResources] = useState(getResources);
  React.useEffect(() => subscribeResources(() => setResources(getResources())), []);
  const [description, setDescription] = useState(task.description ?? '');
  const [dateDebut, setDateDebut] = useState(task.dueDate ?? '');
  const [heureDebut, setHeureDebut] = useState(task.startTime ?? '');
  const [dateFin, setDateFin] = useState(task.endDate ?? '');
  const [heureFin, setHeureFin] = useState(task.endTime ?? '');
  const [datePickerOpen, setDatePickerOpen] = useState<'debut' | 'fin' | null>(null);
  const [datePickerRect, setDatePickerRect] = useState<DOMRect | null>(null);
  const [comments, setComments] = useState<CommentObj[]>(task.comments ?? []);
  const [activeCommentId, setActiveCommentId] = useState<string | null>(null);
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
    }, 200);
    return () => clearTimeout(timer);
  }, [autoFocusComments]);

  useEffect(() => {
    if (descRef.current) {
      descRef.current.style.height = 'auto';
      descRef.current.style.height = descRef.current.scrollHeight + 'px';
    }
  }, [description]);

  const [localSubtasks, setLocalSubtasks] = useState<LocalSubtask[]>(
    task.subtasks?.map(s => ({
      id: s.id, title: s.title, checked: s.checked,
      priority: s.priority, status: s.status as string, statusLabel: s.statusLabel,
      assignees: s.assignees ?? [], dueDate: '', comments: [] as CommentObj[],
    })) ?? []
  );
  // Subtasks removed elsewhere (converted to a task, moved out) leave via the
  // `task` prop, not through this component's own handlers — prune anything
  // no longer present upstream so the panel doesn't keep showing a promoted
  // subtask alongside its new standalone task.
  useEffect(() => {
    const liveIds = new Set((task.subtasks ?? []).map(s => s.id));
    setLocalSubtasks(prev => prev.every(s => liveIds.has(s.id)) ? prev : prev.filter(s => liveIds.has(s.id)));
  }, [task.subtasks]);
  const [hideCompletedSubs, setHideCompletedSubs] = useState(false);
  const [selectedSubIds, setSelectedSubIds] = useState<Set<string>>(new Set());
  const [subCtxPos, setSubCtxPos] = useState<{ x: number; y: number } | null>(null);
  const subAnchorRef = useRef<string | null>(null);
  // Convert is the baseline capability required to turn on subtask
  // multi-select/right-click at all (Travail + Mes tâches both provide it).
  // Move/Copy are extra, host-screen-specific menu items gated separately.
  const subtaskActionsEnabled = !!onConvertSubtasks;

  const [editPriority, setEditPriority] = useState<Priority>(task.priority);
  const [editStatus, setEditStatus] = useState(task.status as string);
  const [editAssignees, setEditAssignees] = useState<User[]>(task.assignees);
  useEffect(() => { setEditAssignees(task.assignees); }, [task.assignees]);
  const [linkedResources, setLinkedResources] = useState<string[]>(task.linkedResources ?? []);
  const [resourcePickerOpen, setResourcePickerOpen] = useState(false);
  const [resPickerRect, setResPickerRect] = useState<DOMRect | null>(null);
  const [panelOpen, setPanelOpen] = useState<'priority' | 'status' | 'heureDebut' | 'heureFin' | 'format' | null>(null);
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
  const [deliverableQuantity, setDeliverableQuantity] = useState(task.deliverableQuantity ?? '');
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

  // Keep the textarea grown to fit the full title, instead of clipping to
  // the initial 2-row height — re-measure on open and on every keystroke.
  useEffect(() => {
    if (editingTitle && titleInputRef.current) {
      const el = titleInputRef.current;
      el.style.height = 'auto';
      el.style.height = el.scrollHeight + 'px';
    }
  }, [editingTitle, titleValue]);

  const commitTitle = () => {
    // Commit whatever the user left, including empty (e.g. select-all then
    // Ctrl+X) — falling back to the old title here silently undid a
    // deletion the moment the field lost focus.
    const val = titleValue.trim();
    setTitleValue(val);
    setEditingTitle(false);
    onUpdate?.({ title: val });
  };

  const breadProjectData = getProjects().find(p => p.id === breadProjectId);
  const breadSections = getSections(breadProjectId);

  const panelSectionLabel = (label: string) => (
    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 600 }}>{label}</p>
  );

  const openPanelDrop = (key: typeof panelOpen, e: React.MouseEvent<HTMLButtonElement>) => {
    setPanelOpen(prev => prev === key ? null : key);
    setPanelDropRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
  };

  // Below: compute `next` from the current state variable and call
  // setState + onUpdate as two separate statements — calling onUpdate
  // (which triggers the HOST screen's setState, e.g. Travail.tsx) from
  // inside a setState updater callback triggers React's "Cannot update a
  // component while rendering a different component" warning, since the
  // updater can run during render (e.g. under StrictMode's double-invoke).
  const toggleLinkedResource = (id: string) => {
    const next = linkedResources.includes(id) ? linkedResources.filter(rid => rid !== id) : [...linkedResources, id];
    setLinkedResources(next);
    onUpdate?.({ linkedResources: next });
  };

  const updateSub = (id: string, patch: Partial<LocalSubtask>) => {
    const next = localSubtasks.map(s => s.id === id ? { ...s, ...patch } : s);
    setLocalSubtasks(next);
    onUpdate?.({ subtasks: next as unknown as Task[] });
  };

  // afterId inserts the new blank row right after a given subtask (Enter-to-
  // add-next, like AddTaskRow) instead of always appending at the end (the
  // "+ Ajouter une sous-tâche" button).
  const addSubtask = (afterId?: string) => {
    const sub: LocalSubtask = { id: `sub-${Date.now()}`, title: '', checked: false, priority: 'none', status: '', statusLabel: '', assignees: [], dueDate: '', comments: [] };
    const idx = afterId ? localSubtasks.findIndex(s => s.id === afterId) : -1;
    const next = idx === -1 ? [...localSubtasks, sub] : [...localSubtasks.slice(0, idx + 1), sub, ...localSubtasks.slice(idx + 1)];
    setLocalSubtasks(next);
    onUpdate?.({ subtasks: next as unknown as Task[] });
  };

  // Pressing Enter on a titled subtask row commits its title AND inserts a
  // fresh blank row after it — two mutations of the same localSubtasks
  // array in the same event. Doing them as separate updateSub()/addSubtask()
  // calls made the second one clobber the first (both read the same stale
  // pre-render `localSubtasks` closure), silently discarding the just-typed
  // title. Compute both from one snapshot and commit them together instead.
  const commitTitleAndAddNext = (id: string, title: string) => {
    const withTitle = localSubtasks.map(s => s.id === id ? { ...s, title } : s);
    const idx = withTitle.findIndex(s => s.id === id);
    const sub: LocalSubtask = { id: `sub-${Date.now()}`, title: '', checked: false, priority: 'none', status: '', statusLabel: '', assignees: [], dueDate: '', comments: [] };
    const next = idx === -1 ? [...withTitle, sub] : [...withTitle.slice(0, idx + 1), sub, ...withTitle.slice(idx + 1)];
    setLocalSubtasks(next);
    onUpdate?.({ subtasks: next as unknown as Task[] });
  };

  // Pasting multi-line text (e.g. a checklist from a client email) into a
  // subtask title creates one subtask per non-empty line, replacing the
  // row that received the paste.
  const addSubtasksFromLines = (lines: string[], replaceId: string) => {
    const base = localSubtasks.filter(s => s.id !== replaceId);
    const newSubs: LocalSubtask[] = lines.map((title, i) => ({
      id: `sub-${Date.now()}-${i}`, title, checked: false, priority: 'none',
      status: '', statusLabel: '', assignees: [], dueDate: '', comments: [],
    }));
    const next = [...base, ...newSubs];
    setLocalSubtasks(next);
    onUpdate?.({ subtasks: next as unknown as Task[] });
  };

  const deleteSubtasks = (ids: string[]) => {
    const idSet = new Set(ids);
    const next = localSubtasks.filter(s => !idSet.has(s.id));
    setLocalSubtasks(next);
    onUpdate?.({ subtasks: next as unknown as Task[] });
    setSelectedSubIds(prev => { const next = new Set(prev); ids.forEach(id => next.delete(id)); return next; });
  };

  // Ctrl/Cmd = toggle one, Shift = range from the last-clicked row, plain
  // click = select just this one (subtasks have no detail view to open,
  // unlike a full task row's plain click).
  const selectSubtask = (subId: string, e: React.MouseEvent) => {
    const orderedIds = localSubtasks.map(s => s.id);
    if (e.shiftKey && subAnchorRef.current) {
      const a = orderedIds.indexOf(subAnchorRef.current);
      const b = orderedIds.indexOf(subId);
      if (a !== -1 && b !== -1) {
        const [lo, hi] = a < b ? [a, b] : [b, a];
        setSelectedSubIds(new Set(orderedIds.slice(lo, hi + 1)));
        return;
      }
    }
    if (e.ctrlKey || e.metaKey) {
      setSelectedSubIds(prev => {
        const next = new Set(prev);
        if (next.has(subId)) next.delete(subId); else next.add(subId);
        return next;
      });
      subAnchorRef.current = subId;
      return;
    }
    // Plain click on the already-sole-selected row toggles it off — same
    // convention as a task row's detail panel. Without this, clicking
    // anywhere inside a row (most of its width isn't excluded by the
    // button/input/textarea/a check) always re-selected it, so it looked
    // like the empty-space-deselect fix was flaky when really the row's
    // own click handler was winning almost every time.
    setSelectedSubIds(prev => prev.size === 1 && prev.has(subId) ? new Set() : new Set([subId]));
    subAnchorRef.current = subId;
  };

  const openSubtaskContextMenu = (subId: string, e: React.MouseEvent) => {
    if (!selectedSubIds.has(subId)) setSelectedSubIds(new Set([subId]));
    setSubCtxPos({ x: e.clientX, y: e.clientY });
  };

  const currentUser = getCurrentUser();
  const ME = currentUser
    ? { initials: currentUser.initials, bg: currentUser.avatarColor, name: currentUser.name }
    : { initials: USERS.lea.initials, bg: USERS.lea.avatarColor, name: USERS.lea.name };

  // CommentObj (TaskComment) predates the shared RevisionComment shape and
  // has no resolve/reopen concept and a slightly different author field
  // (`bg` vs `avatarColor`) — convert for display only; handlers below
  // still operate on the original CommentObj array/ids.
  const toRevisionComment = (c: CommentObj): RevisionComment => ({
    id: c.id,
    author: { id: c.author.name, name: c.author.name, initials: c.author.initials, avatarColor: c.author.bg, role: '' },
    text: c.text,
    status: c.status ?? 'open',
    replies: c.replies.map(r => ({
      id: r.id,
      author: { id: r.author.name, name: r.author.name, initials: r.author.initials, avatarColor: r.author.bg, role: '' },
      text: r.text,
    })),
  });

  const submitComment = (text: string) => {
    if (!text.trim()) return;
    const next = [...comments, { id: `c-${Date.now()}`, text: text.trim(), author: ME, replies: [], status: 'open' as const }];
    setComments(next);
    onUpdate?.({ comments: next });
    notifyComment({ kind: 'add', text: text.trim(), itemLabel: task.title, taskId: task.id, projectId: breadProjectId });
  };

  const submitReply = (commentId: string, text: string) => {
    if (!text.trim()) return;
    const next = comments.map(c => c.id === commentId
      ? { ...c, replies: [...c.replies, { id: `r-${Date.now()}`, text: text.trim(), author: ME, replies: [] }] }
      : c
    );
    setComments(next);
    onUpdate?.({ comments: next });
    notifyComment({ kind: 'reply', text: text.trim(), itemLabel: task.title, taskId: task.id, projectId: breadProjectId });
  };

  const toggleCommentResolved = (id: string) => {
    const next = comments.map(c => c.id === id ? { ...c, status: (c.status === 'resolved' ? 'open' : 'resolved') as 'open' | 'resolved' } : c);
    setComments(next);
    onUpdate?.({ comments: next });
  };

  const deleteTaskComment = (id: string) => {
    const next = comments.filter(x => x.id !== id);
    setComments(next);
    onUpdate?.({ comments: next });
    if (activeCommentId === id) setActiveCommentId(null);
  };

  const convertToSubtask = (c: CommentObj) => {
    const sub: LocalSubtask = { id: `sub-${Date.now()}`, title: c.text, checked: false, priority: 'none', status: '', statusLabel: '', assignees: [], dueDate: '', comments: [] };
    const nextSubs = [...localSubtasks, sub];
    setLocalSubtasks(nextSubs);
    onUpdate?.({ subtasks: nextSubs as unknown as Task[] });
    const nextComments = comments.filter(x => x.id !== c.id);
    setComments(nextComments);
    onUpdate?.({ comments: nextComments });
  };

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
        flex: 1,
        minHeight: 0,
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
                    {getProjects().filter(p => !p.archived).map(p => (
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
                  {breadSection || t('taskPanel.section')}
                  <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                </button>
                {breadSectionOpen && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, zIndex: 400, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, padding: 4, minWidth: 160, boxShadow: '0 8px 24px rgba(0,0,0,0.5)', marginTop: 4 }}>
                    {breadSections.length === 0
                      ? <span style={{ display: 'block', padding: '6px 10px', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>{t('taskPanel.noSection')}</span>
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
                title={t('taskPanel.goToComments')}
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
              title={t('taskPanel.clickToEdit')}
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
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('taskPanel.assignedTo')}</span>
              <AssigneeGroup
                assignees={editAssignees}
                size={24}
                max={3}
                showNames
                onChange={next => { setEditAssignees(next); onUpdate?.({ assignees: next }); }}
              />
            </div>
            {/* Priorité */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('tasks.priority')}</span>
              <div style={{ position: 'relative' }}>
                <button onClick={e => openPanelDrop('priority', e)}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[editPriority], flexShrink: 0, display: 'block' }} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[editPriority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(PRIORITY_LABEL_KEY[editPriority])}</span>
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
                {panelOpen === 'priority' && (
                  <InlineDropdown onClose={() => setPanelOpen(null)} anchorRect={panelDropRect} zIndex={300}>
                    {PRIORITY_OPTIONS.map(p => ddItem(() => { setEditPriority(p); setPanelOpen(null); onUpdate?.({ priority: p, priorityLabel: t(PRIORITY_LABEL_KEY[p]) }); },
                      <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>,
                      editPriority === p
                    ))}
                  </InlineDropdown>
                )}
              </div>
            </div>
            {/* Statut */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('tasks.status')}</span>
              <div style={{ position: 'relative' }}>
                <button onClick={e => openPanelDrop('status', e)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
                  {editStatus
                    ? <SFPill status={editStatus as Task['status']} small>{t(PANEL_STATUS_OPTIONS.find(o => o.value === editStatus)?.labelKey ?? 'tasks.noStatus')}</SFPill>
                    : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t('taskPanel.none')}</span>
                  }
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
                {panelOpen === 'status' && (
                  <InlineDropdown onClose={() => setPanelOpen(null)} anchorRect={panelDropRect} zIndex={300}>
                    {PANEL_STATUS_OPTIONS.map(o => ddItem(() => { setEditStatus(o.value); setPanelOpen(null); onUpdate?.({ status: o.value as Task['status'], statusLabel: t(o.labelKey) }); },
                      <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>,
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
              {dateDebut ? formatDisplay(dateDebut) : t('taskPanel.start')}
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
              {dateFin ? formatDisplay(dateFin) : t('taskPanel.end')}
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
        <div
          onClick={e => {
            // Clicking anywhere in the panel that ISN'T a subtask row (or a
            // button/input/etc — those have their own click behavior) clears
            // subtask selection. The subtask list itself has almost no truly
            // empty pixels to click (rows sit flush against each other), so
            // relying only on that container's own background click left
            // "click away to deselect" without anywhere real to click.
            if (selectedSubIds.size === 0) return;
            const target = e.target as HTMLElement;
            if (target.closest('[data-subtask-row], button, input, textarea, a')) return;
            setSelectedSubIds(new Set());
          }}
          style={{ flex: 1, overflow: 'auto', padding: '20px', display: 'flex', flexDirection: 'column', gap: 20 }}
        >

          {/* Livrable toggle + format */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              {secLabel(t('taskPanel.clientDeliverable'))}
              {!isDeliverable ? (
                <button
                  onClick={() => { setIsDeliverable(true); setDeliverableExpanded(true); onUpdate?.({ deliverable: true }); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '4px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="package" size={12} />
                  {t('taskPanel.markAsDeliverable')}
                </button>
              ) : (
                <button
                  onClick={() => { setIsDeliverable(false); setDeliverableExpanded(false); onUpdate?.({ deliverable: false }); }}
                  title={t('taskPanel.disableDeliverable')}
                  style={{ display: 'flex', alignItems: 'center', padding: 3, borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--danger)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                >
                  <SFIcon name="x" size={11} />
                </button>
              )}
            </div>

            {/* Mini-carte résumé — pleine largeur, sous le label (pas à côté :
                un bloc à plusieurs lignes dans la même rangée que le label
                se retrouvait plaqué à droite au lieu de s'empiler dessous).
                Aperçu en lecture seule de l'éditeur déplié (même structure :
                type/format/quantité en grille, note en pleine largeur non
                tronquée), plutôt qu'une pastille à une seule ligne où tout
                était compressé et la note coupée à 120px. */}
            {isDeliverable && !deliverableExpanded && (() => {
              const opt = DELIVERABLE_TYPE_OPTIONS.find(o => o.value === deliverableType);
              const showFormat = deliverableType === 'video' || deliverableType === 'photo';
              const showDuration = (deliverableType === 'video' || deliverableType === 'audio') && !!deliverableDuration;
              const showQuantity = deliverableType === 'photo' && !!deliverableQuantity;
              const hasMeta = showFormat || showDuration || showQuantity;
              return (
                <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid var(--accent)', borderRadius: 10, background: 'var(--surface-2)', overflow: 'hidden' }}>
                  <button
                    onClick={() => setDeliverableExpanded(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '7px 10px', border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer', width: '100%' }}
                  >
                    <SFIcon name={opt?.icon ?? 'package'} size={12} color="var(--accent)" />
                    <span style={{ fontSize: 13, fontWeight: 600 }}>{opt ? t(opt.labelKey) : ''}</span>
                    <SFIcon name="chevron-down" size={11} color="var(--text-3)" style={{ marginLeft: 'auto' }} />
                  </button>
                  {hasMeta && (
                    <div style={{ display: 'flex', gap: 20, padding: '8px 10px', borderTop: '1px solid var(--border)' }}>
                      {showFormat && (
                        <div>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{t('taskPanel.format')}</p>
                          <p style={{ fontSize: 12, color: 'var(--text)', margin: 0 }}>{format === 'custom' ? `${customW}×${customH}` : format}</p>
                        </div>
                      )}
                      {showDuration && (
                        <div>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{t('taskPanel.duration')}</p>
                          <p style={{ fontSize: 12, color: 'var(--text)', margin: 0 }}>{deliverableDuration}</p>
                        </div>
                      )}
                      {showQuantity && (
                        <div>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 2px' }}>{t('taskPanel.quantity')}</p>
                          <p style={{ fontSize: 12, color: 'var(--text)', margin: 0 }}>{deliverableQuantity}</p>
                        </div>
                      )}
                    </div>
                  )}
                  {deliverableNote && (
                    <div style={{ padding: '8px 10px', borderTop: hasMeta ? '1px solid var(--border)' : 'none' }}>
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', margin: '0 0 3px' }}>{t('taskPanel.note')}</p>
                      <p style={{ fontSize: 12, color: 'var(--text-2)', lineHeight: 1.5, margin: 0, whiteSpace: 'pre-wrap' }}>{deliverableNote}</p>
                    </div>
                  )}
                </div>
              );
            })()}

            {/* Expanded editor */}
            {isDeliverable && deliverableExpanded && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '10px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                {/* Type pills */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                  {DELIVERABLE_TYPE_OPTIONS.map(opt => (
                    <button key={opt.value} onClick={() => { setDeliverableType(opt.value); onUpdate?.({ deliverableType: opt.value, format: (opt.value === 'video' || opt.value === 'photo') ? format : undefined }); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 9px', borderRadius: 7, border: `1px solid ${deliverableType === opt.value ? 'var(--accent)' : 'var(--border)'}`, background: deliverableType === opt.value ? 'rgba(249,255,0,0.08)' : 'var(--surface)', cursor: 'pointer' }}>
                      <SFIcon name={opt.icon} size={11} color={deliverableType === opt.value ? 'var(--accent)' : 'var(--text-3)'} />
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: deliverableType === opt.value ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.04em', whiteSpace: 'nowrap' }}>{t(opt.labelKey)}</span>
                    </button>
                  ))}
                </div>
                {/* Format pills — only for video/photo */}
                {(deliverableType === 'video' || deliverableType === 'photo') && (
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
                    {FORMAT_OPTIONS.map(f => (
                      <button key={f.value} onClick={() => { setFormat(f.value); onUpdate?.({ format: f.value }); }}
                        style={{ padding: '3px 9px', borderRadius: 7, border: `1px solid ${format === f.value ? 'var(--accent)' : 'var(--border)'}`, background: format === f.value ? 'rgba(249,255,0,0.08)' : 'var(--surface)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: 9, color: format === f.value ? 'var(--accent)' : 'var(--text-3)', letterSpacing: '0.04em' }}>
                        {f.labelKey ? t(f.labelKey) : f.label}
                      </button>
                    ))}
                    {format === 'custom' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6, width: '100%', marginTop: 4 }}>
                        <input type="number" value={customW} onChange={e => { const v = Number(e.target.value); setCustomW(v); onUpdate?.({ customWidth: v }); }}
                          style={{ width: 72, padding: '4px 7px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-mono)', outline: 'none' }} />
                        <span style={{ color: 'var(--text-3)', fontSize: 12 }}>×</span>
                        <input type="number" value={customH} onChange={e => { const v = Number(e.target.value); setCustomH(v); onUpdate?.({ customHeight: v }); }}
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
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, width: 68 }}>{t('taskPanel.duration')}</span>
                      <input
                        type="text"
                        value={deliverableDuration}
                        onChange={e => { setDeliverableDuration(e.target.value); onUpdate?.({ deliverableDuration: e.target.value }); }}
                        placeholder={t('taskPanel.durationPlaceholder')}
                        style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-mono)', outline: 'none' }}
                      />
                    </div>
                  )}
                  {deliverableType === 'photo' && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, width: 68 }}>{t('taskPanel.quantity')}</span>
                      <input
                        type="text"
                        value={deliverableQuantity}
                        onChange={e => { setDeliverableQuantity(e.target.value); onUpdate?.({ deliverableQuantity: e.target.value }); }}
                        placeholder={t('taskPanel.quantityPlaceholder')}
                        style={{ flex: 1, padding: '4px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-mono)', outline: 'none' }}
                      />
                    </div>
                  )}
                  <div style={{ display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0, width: 68, paddingTop: 5 }}>{t('taskPanel.note')}</span>
                    <textarea
                      value={deliverableNote}
                      onChange={e => { setDeliverableNote(e.target.value); onUpdate?.({ deliverableNote: e.target.value }); }}
                      placeholder={deliverableType === 'document' || deliverableType === 'web' ? t('taskPanel.notePlaceholderPages') : t('taskPanel.notePlaceholderCustom')}
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
                    {t('taskPanel.confirm')}
                  </button>
                </div>
              </div>
            )}
          </div>

          {divider}

          {/* Description — persistée via onUpdate (voir onChange plus bas) */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {secLabel(t('taskPanel.description'))}
            <textarea
              ref={descRef}
              value={description}
              onChange={e => { setDescription(e.target.value); onUpdate?.({ description: e.target.value }); }}
              placeholder={t('tasks.addDescription')}
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
              {panelSectionLabel(`${t('taskPanel.linkedResources')}${linkedResources.length ? ` (${linkedResources.length})` : ''}`)}
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
                  {t('taskPanel.link')}
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
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', padding: '6px 10px 4px' }}>{t('taskPanel.existingResources')}</p>
                          {resources.map(r => {
                            const linked = linkedResources.includes(r.id);
                            return (
                              <button key={r.id} onClick={() => toggleLinkedResource(r.id)}
                                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: linked ? 'rgba(249,255,0,0.06)' : 'transparent', cursor: 'pointer', textAlign: 'left' }}
                                onMouseEnter={e => { if (!linked) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                                onMouseLeave={e => { if (!linked) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                              >
                                <div style={{ width: 28, height: 28, borderRadius: 7, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                                  <SFIcon name={TYPE_ICON[r.type]} size={13} color="var(--text-3)" />
                                </div>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 1 }}>{r.eyebrow.startsWith('files.') ? t(r.eyebrow) : r.eyebrow}</p>
                                </div>
                                {linked && <SFIcon name="check" size={13} color="var(--accent)" />}
                              </button>
                            );
                          })}
                        </div>
                        {/* Sticky "Créer" section at bottom */}
                        <div style={{ borderTop: '1px solid var(--border)', padding: '10px 10px 12px', flexShrink: 0, background: 'var(--surface)' }}>
                          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{t('taskPanel.createNewResource')}</p>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 5 }}>
                            {(Object.keys(RESOURCE_TYPE_LABEL_KEY) as ResourceType[]).map(type => (
                              <button key={type} onClick={() => setResourcePickerOpen(false)}
                                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                                <SFIcon name={TYPE_ICON[type]} size={11} />
                                {t(RESOURCE_TYPE_LABEL_KEY[type])}
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
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 1 }}>{r.eyebrow.startsWith('files.') ? t(r.eyebrow) : r.eyebrow}</p>
                      <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{r.title}</p>
                    </div>
                    <button
                      onClick={e => { e.stopPropagation(); setResStatusDrop(prev => prev === r.id ? null : r.id); setResStatusRect(e.currentTarget.getBoundingClientRect()); }}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 3, flexShrink: 0 }}
                      title={t('taskPanel.changeStatus')}
                    >
                      <SFPill status={r.status} small>{r.statusLabel}</SFPill>
                      <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
                    </button>
                    <div style={{ display: 'flex', gap: 2, flexShrink: 0 }}>
                      <button
                        onClick={e => { e.stopPropagation(); setFullscreenResource(r.id); }}
                        title={t('taskPanel.openFullscreen')}
                        style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                      >
                        <SFIcon name="maximize-2" size={13} />
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); toggleLinkedResource(r.id); }}
                        title={t('taskPanel.removeResource')}
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
                          onClick={() => { updateResource(r.id, { status: opt.status, statusLabel: t(opt.labelKey) }); setResStatusDrop(null); }}
                          style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: r.status === opt.status ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', borderRadius: 7 }}
                          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                          onMouseLeave={e => (e.currentTarget.style.background = r.status === opt.status ? 'var(--surface-2)' : 'transparent')}
                        >
                          <SFPill status={opt.status} small>{t(opt.labelKey)}</SFPill>
                        </button>
                      ))}
                    </InlineDropdown>
                  )}
                </div>
              ))
              : <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('taskPanel.noLinkedResources')}</p>
            }
          </div>

          {/* Sous-tâches */}
          {divider}
          <div
            onClick={e => { if (e.target === e.currentTarget) setSelectedSubIds(new Set()); }}
            style={{ display: 'flex', flexDirection: 'column', gap: 2, position: 'relative' }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
              {panelSectionLabel(`${t('tasks.subtasks')}${localSubtasks.length ? ` (${localSubtasks.filter(s => s.checked).length}/${localSubtasks.length})` : ''}`)}
              {localSubtasks.some(s => s.checked) && (
                <button
                  onClick={() => setHideCompletedSubs(v => !v)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 8px', borderRadius: 7, border: '1px solid var(--border)', background: hideCompletedSubs ? 'rgba(249,255,0,0.07)' : 'transparent', color: hideCompletedSubs ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}
                  title={hideCompletedSubs ? t('taskPanel.showCompletedSubtasks') : t('taskPanel.hideCompletedSubtasks')}
                >
                  <SFIcon name={hideCompletedSubs ? 'eye-off' : 'eye'} size={12}  />
                  {hideCompletedSubs ? t('taskPanel.completedHidden') : t('taskPanel.hideCompleted')}
                </button>
              )}
            </div>
            {localSubtasks.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: SUB_GRID, gap: 10, padding: '4px 8px 6px', marginBottom: 4, borderBottom: '1px solid var(--border)' }}>
                <span />{subColLabel(t('tasks.title'))}<span /><span />
              </div>
            )}
            {localSubtasks.filter(sub => !hideCompletedSubs || !sub.checked).map(sub => (
              <SubTaskRow key={sub.id} sub={sub}
                onUpdate={patch => updateSub(sub.id, patch)}
                onDelete={() => deleteSubtasks([sub.id])}
                onPasteMultiple={lines => addSubtasksFromLines(lines, sub.id)}
                onEnterNext={title => commitTitleAndAddNext(sub.id, title)}
                selected={subtaskActionsEnabled ? selectedSubIds.has(sub.id) : undefined}
                onSelect={subtaskActionsEnabled ? e => selectSubtask(sub.id, e) : undefined}
                onContextMenu={subtaskActionsEnabled ? e => openSubtaskContextMenu(sub.id, e) : undefined}
              />
            ))}
            <button onClick={() => addSubtask()}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 8px', borderRadius: 8, border: 'none', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', marginTop: 2 }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              <SFIcon name="plus" size={12} />{t('taskPanel.addSubtask')}
            </button>

            {subCtxPos && (
              <SubtaskContextMenu
                pos={subCtxPos}
                count={selectedSubIds.size}
                onConvert={() => onConvertSubtasks?.([...selectedSubIds])}
                onMove={onMoveSubtasksAsTask ? () => onMoveSubtasksAsTask([...selectedSubIds]) : undefined}
                onCopy={onCopySubtasksAsTask ? () => onCopySubtasksAsTask([...selectedSubIds]) : undefined}
                onDelete={() => deleteSubtasks([...selectedSubIds])}
                onClose={() => setSubCtxPos(null)}
              />
            )}
          </div>

          {divider}

          {/* Commentaires — même composant que Document/Révision web/Scénario/etc., pour un système identique partout */}
          <div ref={commentsAnchorRef} style={{ display: 'flex', flexDirection: 'column', borderRadius: 9 }}>
            <div style={{ marginBottom: 10 }}>
              <WatchersRow
                watchers={task.watchers ?? []}
                onAdd={id => onUpdate?.({ watchers: addWatcher(task.watchers, id) })}
                onRemove={id => onUpdate?.({ watchers: (task.watchers ?? []).filter(w => w !== id) })}
              />
            </div>
            <RevisionCommentSidebar
              comments={comments.map(toRevisionComment)}
              activeId={activeCommentId}
              onActivate={setActiveCommentId}
              onAdd={submitComment}
              onResolve={toggleCommentResolved}
              onReply={submitReply}
              onDelete={deleteTaskComment}
              onConvertToSubtask={id => { const c = comments.find(x => x.id === id); if (c) convertToSubtask(c); }}
              pendingAnnotation={false}
              onCancelPending={() => {}}
              embedded
            />
          </div>
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
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{res.eyebrow.startsWith('files.') ? t(res.eyebrow) : res.eyebrow}</p>
                <p style={{ fontSize: 14, fontWeight: 600 }}>{res.title}</p>
              </div>
              <div style={{ position: 'relative' }}>
                <button
                  onClick={e => { setFsStatusDropOpen(o => !o); setFsStatusRect(e.currentTarget.getBoundingClientRect()); }}
                  style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                  title={t('taskPanel.changeStatus')}
                >
                  <SFPill status={res.status} small>{res.statusLabel}</SFPill>
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
                {fsStatusDropOpen && fsStatusRect && (
                  <InlineDropdown onClose={() => setFsStatusDropOpen(false)} anchorRect={fsStatusRect} minWidth={160} zIndex={700}>
                    {RESOURCE_STATUS_OPTIONS.map(opt => (
                      <button key={opt.status}
                        onClick={() => { updateResource(res.id, { status: opt.status, statusLabel: t(opt.labelKey) }); setFsStatusDropOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', background: res.status === opt.status ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', borderRadius: 7 }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = res.status === opt.status ? 'var(--surface-2)' : 'transparent')}
                      >
                        <SFPill status={opt.status} small>{t(opt.labelKey)}</SFPill>
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
                title={t('taskPanel.closeToTask')}
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
