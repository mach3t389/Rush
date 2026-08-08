import React, { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFPill, SFModal, isOverdue, fmtTaskDate, TaskDatePopover, AssigneeGroup, CommentBadge } from '../components/ui';
import { STATUS_COLOR } from '../data/status';
import { showToast } from '../data/toastStore';
import { getCurrentUser } from '../data/authStore';
import { addWatchers } from '../data/watchers';
import { useClampedMenuPosition } from '../hooks/useClampedMenuPosition';
import { useTaskNotifCount } from '../hooks/useNotifs';
import { markTaskRead } from '../data/notificationStore';
import { stripHtml } from '../utils/stripHtml';
import type { Task, Priority, SectionData } from '../types';

// Same activity indicator as the list view's TaskActivityCell (Travail.tsx)
// — duplicated rather than imported to avoid a circular import between the
// two screens (Travail.tsx renders TravailBoard).
function TaskActivityCell({ taskId }: { taskId: string }) {
  const { t } = useTranslation();
  const count = useTaskNotifCount(taskId);
  const [justRead, setJustRead] = useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (count > 0) {
      markTaskRead(taskId);
      setJustRead(true);
      setTimeout(() => setJustRead(false), 1200);
    }
  };

  if (count === 0 && !justRead) return null;

  return (
    <button
      onClick={handleClick}
      onMouseDown={e => e.stopPropagation()}
      title={count > 0 ? t('board.unreadActivity', { count }) : undefined}
      style={{ background: 'none', border: 'none', padding: 0, cursor: count > 0 ? 'pointer' : 'default', display: 'inline-flex', position: 'relative' }}
    >
      <SFIcon name="message-circle" size={11} color={justRead ? 'var(--ok)' : count > 0 ? 'var(--accent)' : 'var(--text-3)'} style={{ transition: 'color 0.2s' }} />
      {count > 0 && (
        <span style={{ position: 'absolute', top: -5, right: -6, background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, fontSize: 8, fontWeight: 700, padding: '1px 4px', fontFamily: 'var(--ff-mono)', lineHeight: 1.4, pointerEvents: 'none' }}>
          {count}
        </span>
      )}
    </button>
  );
}

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)',
};

const PRIORITY_LABEL_KEY: Record<Priority, string> = {
  high: 'priority.high', normal: 'priority.medium', low: 'priority.low', none: 'priority.none',
};

const PRIORITY_OPTIONS: Priority[] = ['high', 'normal', 'low', 'none'];

const STATUS_OPTIONS = [
  { value: '',       labelKey: 'tasks.noStatus'  },
  { value: 'warn',   labelKey: 'tasks.todo'      },
  { value: 'info',   labelKey: 'tasks.inProgress'},
  { value: 'ok',     labelKey: 'tasks.completed' },
  { value: 'danger', labelKey: 'tasks.overdue'   },
  { value: 'review', labelKey: 'tasks.inReview'  },
];

// ── Dropdown portal ───────────────────────────────────────────────────────────

function DropMenu({ rect, onClose, children }: { rect: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  useLayoutEffect(() => {
    if (!ref.current) return;
    const h = ref.current.offsetHeight;
    const w = ref.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    // Flip above the anchor when there isn't room below — same rule as InlineDropdown.
    const top = rect.bottom + 4 + h > vh && rect.top >= h + 4 ? rect.top - h - 4 : rect.bottom + 4;
    const left = Math.max(8, Math.min(rect.left, vw - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [rect]);
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', ...pos, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 168, padding: '4px 0', overflow: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}

function SectionContextMenu({ pos, onRename, onCopy, onMove, onDelete, onClose }: {
  pos: { x: number; y: number }; onRename: () => void; onCopy: () => void; onMove: () => void; onDelete: () => void; onClose: () => void;
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
    <div ref={ref} style={{ position: 'fixed', left: coords.left, top: coords.top, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 180, padding: '4px 0', overflow: 'hidden', maxHeight: coords.maxHeight, overflowY: coords.maxHeight ? 'auto' : 'hidden' }}>
      {item(<><SFIcon name="pencil" size={13} color="var(--text-3)" /><span>{t('taskPanel.renameSection')}</span></>, onRename)}
      {item(<><SFIcon name="copy" size={13} color="var(--text-3)" /><span>{t('taskPanel.copyToProject')}</span></>, onCopy)}
      {item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>{t('taskPanel.moveToProject')}</span></>, onMove)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('board.deleteSection')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

function DItem({ label, active, danger, onClick }: { label: React.ReactNode; active?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 13px', border: 'none', background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--surface-3))' : 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontFamily: 'var(--ff-text)', color: danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--text)' }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >{label}</button>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────

function CardContextMenu({ pos, onOpen, onDelete, onConvert, onClose, sections, currentSectionIdx, onMoveToSection }: {
  pos: { x: number; y: number };
  onOpen: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onClose: () => void;
  sections: SectionData[];
  currentSectionIdx: number;
  onMoveToSection: (toIdx: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [showMove, setShowMove] = useState(false);
  const coords = useClampedMenuPosition(ref, pos, [showMove]);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const otherSections = sections.filter((_, i) => i !== currentSectionIdx);

  const item = (label: React.ReactNode, action: () => void, danger = false) => (
    <button onClick={() => { action(); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >{label}</button>
  );

  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left: coords.left, top: coords.top, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 200, padding: '4px 0', overflow: 'hidden', maxHeight: coords.maxHeight, overflowY: coords.maxHeight ? 'auto' : 'hidden' }}>
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>{t('tasks.openDetail')}</span></>, onOpen)}
      {item(<><SFIcon name="git-branch" size={13} color="var(--text-3)" /><span>{t('board.convertToSubtask')}</span></>, onConvert)}

      {otherSections.length > 0 && !showMove && (
        <button
          onClick={() => setShowMove(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: 'var(--text)', justifyContent: 'space-between' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SFIcon name="move-right" size={13} color="var(--text-3)" />
            <span>{t('board.moveTo')}</span>
          </div>
          <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
        </button>
      )}

      {showMove && otherSections.map((s) => {
        const realIdx = sections.findIndex(sec => sec.label === s.label);
        return (
          <button
            key={s.label}
            onClick={() => { onMoveToSection(realIdx); onClose(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 14px 7px 28px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontFamily: 'var(--ff-text)', color: 'var(--text)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0, display: 'block' }} />
            {s.label}
          </button>
        );
      })}

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('tasks.delete')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

// ── DropSlot ───────────────────────────────────────────────────────────────────
// Yellow drop indicator between cards (horizontal) or between columns
// (vertical), same visual language as the list view.
//
// CRITICAL — this is ALWAYS rendered, never conditionally on "is a drag in
// progress". Chrome aborts a native HTML5 drag if the DOM is mutated inside
// the dragstart handler, and setDragTask()/setDraggedColumnLabel() run
// exactly there: rendering these slots conditionally inserted a node beside
// every card the instant a drag began, which silently killed the drag before
// any dragover/drop could fire. Collapsed to zero size + pointerEvents:none
// when idle, so it costs nothing visually but keeps the DOM stable.
//
// Defined at module scope (not inside TravailBoard) so its component identity
// is stable across renders — an inline definition remounts the whole subtree
// on every render, which is the same DOM churn by another route.
function DropSlot({ vertical, active, enabled, onOver, onLeave, onDropHere }: {
  vertical?: boolean;
  active: boolean;
  enabled: boolean;
  onOver: () => void;
  onLeave: () => void;
  onDropHere: () => void;
}) {
  const wrapStyle: React.CSSProperties = vertical
    // Negative margins cancel one of the flex container's two 16px gaps, so
    // an idle (zero-width) slot leaves column spacing exactly as it was.
    ? { position: 'relative', width: active ? 16 : 0, marginLeft: -8, marginRight: -8, flexShrink: 0, alignSelf: 'stretch', transition: 'width 0.12s' }
    : { position: 'relative', height: active ? 18 : 0, transition: 'height 0.12s' };
  const lineStyle: React.CSSProperties = vertical
    ? { position: 'absolute', left: '50%', transform: 'translateX(-50%)', height: '100%', width: 2, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }
    : { position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: '100%', height: 2, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' };
  // Card slots get a much taller hit zone than their visible line — precisely
  // dragging onto a 2px target between cards (worse near a scrolled edge) was
  // the exact complaint. Column slots stay tighter; they're full-height by
  // nature so a taller reach doesn't add much and would overlap neighbors.
  const pad = vertical ? -8 : -14;
  return (
    <div style={wrapStyle}>
      <div
        onDragOver={e => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); onOver(); }}
        onDragLeave={() => { if (!enabled) return; onLeave(); }}
        onDrop={e => { if (!enabled) return; e.preventDefault(); e.stopPropagation(); onDropHere(); }}
        style={{ position: 'absolute', top: pad, bottom: pad, left: pad, right: pad, zIndex: 1, pointerEvents: enabled ? 'auto' : 'none' }}
      />
      {active && <div style={lineStyle} />}
    </div>
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  sections: SectionData[];
  selectedTask: Task | null;
  multiSelIds?: Set<string>;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
  onSelectTask: (t: Task, e?: React.MouseEvent) => void;
  onClearSelection?: () => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onToggleSectionComplete: (sectionLabel: string) => void;
  onAddTask: (sectionIdx: number, task: Task) => void;
  // Optional: pasting multi-line text into the inline add-task field creates
  // one task per line (parity with AddTaskRow in the list view). Falls back
  // to calling onAddTask once if the caller doesn't provide this.
  onAddTaskMany?: (sectionIdx: number, tasks: Task[]) => void;
  onMoveTask: (task: Task, fromIdx: number, toIdx: number, beforeTaskId?: string) => void;
  onAddSection: (label: string) => void;
  onDeleteTask: (task: Task) => void;
  onDeleteSection: (sectionLabel: string) => void;
  onRenameSection: (oldLabel: string, newLabel: string) => void;
  onMoveSection: (sectionLabel: string) => void;
  onCopySection: (sectionLabel: string) => void;
  // Reorder columns (drag) — only meaningful/used when groupBy==='category':
  // status-mode columns are a fixed enum, not a real, reorderable list.
  onReorderSection?: (fromLabel: string, beforeLabel: string | null) => void;
  projectId: string;
  projectName: string;
  projectColor: string;
  groupBy: 'category' | 'status' | 'assignee';
  // Unfiltered task count per section label — section.tasks here can be
  // filtered (hidden completed tasks, assignee filter), so it undercounts
  // what actually gets deleted. Falls back to section.tasks.length when
  // absent (kept optional so this can't break an unrelated caller).
  sectionTaskCounts?: Record<string, number>;
}

// ── Board ──────────────────────────────────────────────────────────────────────

export function TravailBoard({
  sections, selectedTask, multiSelIds, onConvertRequest,
  onSelectTask, onClearSelection, onUpdateTask, onToggleSectionComplete,
  onAddTask, onAddTaskMany, onMoveTask, onAddSection,
  onDeleteTask, onDeleteSection, onRenameSection,
  onMoveSection, onCopySection, onReorderSection,
  projectId, projectName, projectColor,
  groupBy,
  sectionTaskCounts,
}: Props) {
  const { t } = useTranslation();
  const [dragTask, setDragTask] = useState<{ task: Task; sectionIdx: number } | null>(null);
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ task: Task; sectionIdx: number; x: number; y: number } | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [sectionCtxMenu, setSectionCtxMenu] = useState<{ label: string; x: number; y: number } | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [openDrop, setOpenDrop] = useState<{ taskId: string; type: 'status' | 'priority' | 'date'; rect: DOMRect } | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);
  // Saisie en ligne — parité avec la vue Liste : on tape le titre directement
  // dans la colonne / sur la carte, sans passer par le panneau de détail.
  const [addingInSection, setAddingInSection] = useState<string | null>(null);
  const [newTaskTitle, setNewTaskTitle] = useState('');
  const newTaskInputRef = useRef<HTMLTextAreaElement>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [taskTitleDraft, setTaskTitleDraft] = useState('');
  const taskTitleInputRef = useRef<HTMLTextAreaElement>(null);

  // Same-column task reorder, keyed by "sectionIdx-slotIdx" since slot
  // indexes aren't unique across columns.
  const [cardDragOverKey, setCardDragOverKey] = useState<string | null>(null);
  const cardDropLeaveTimer = useRef<number | null>(null);

  // Column (section) reorder. Only wired up when groupBy==='category':
  // status-mode columns are a fixed enum, there's nothing to persist an
  // order for.
  const [draggedColumnLabel, setDraggedColumnLabel] = useState<string | null>(null);
  const [columnDragOverLabel, setColumnDragOverLabel] = useState<string | null>(null);
  const columnDropLeaveTimer = useRef<number | null>(null);
  const columnDragHandleActive = useRef(false);

  useEffect(() => {
    if (editingSectionLabel !== null) labelInputRef.current?.select();
  }, [editingSectionLabel]);

  useEffect(() => {
    if (addingInSection !== null) newTaskInputRef.current?.focus();
  }, [addingInSection]);

  useEffect(() => {
    if (editingTaskId !== null) taskTitleInputRef.current?.select();
  }, [editingTaskId]);

  const commitLabel = (originalLabel: string) => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== originalLabel) onRenameSection(originalLabel, trimmed);
    setEditingSectionLabel(null);
  };

  const buildNewTask = (title: string): Task => ({
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    projectId, projectName, projectColor,
    assignees: [],
    // Aucun statut par défaut — même règle qu'AddTaskRow en vue Liste.
    // L'ancien bouton du Tableau forçait 'warn'/"À faire", ce qui donnait un
    // statut que l'utilisateur n'avait pas choisi.
    status: '' as Task['status'], statusLabel: '',
    priority: 'none', priorityLabel: t('priority.none'),
    dueDate: '—', dueDateRed: false, checked: false, subtasks: [],
    watchers: addWatchers([], [getCurrentUser()?.id]),
  });

  // Enter valide et rouvre une ligne vierge (même geste qu'en vue Liste,
  // pour enchaîner plusieurs tâches sans reprendre la souris).
  const commitNewTask = (sIdx: number, keepOpen: boolean) => {
    const title = newTaskTitle.trim();
    if (!title) { if (!keepOpen) { setAddingInSection(null); setNewTaskTitle(''); } return; }
    onAddTask(sIdx, buildNewTask(title));
    setNewTaskTitle('');
    if (keepOpen) setTimeout(() => newTaskInputRef.current?.focus(), 0);
    else setAddingInSection(null);
  };

  // Coller un texte multi-lignes (ex. une checklist) crée une tâche par
  // ligne non vide, au lieu d'une seule tâche au titre truffé de retours à
  // la ligne — parité avec AddTaskRow en vue Liste.
  const handleNewTaskPaste = (e: React.ClipboardEvent<HTMLTextAreaElement>, sIdx: number) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    const newTasks = lines.map(buildNewTask);
    if (onAddTaskMany) onAddTaskMany(sIdx, newTasks);
    else newTasks.forEach(t => onAddTask(sIdx, t));
    setNewTaskTitle('');
    setTimeout(() => newTaskInputRef.current?.focus(), 0);
  };

  const commitTaskTitle = (task: Task) => {
    const trimmed = taskTitleDraft.trim();
    if (trimmed && trimmed !== task.title) onUpdateTask(task.id, { title: trimmed });
    setEditingTaskId(null);
  };

  const toggleCollapse = (label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const commitSection = () => {
    const label = newLabel.trim();
    if (!label) { setAddingSection(false); setNewLabel(''); return; }
    onAddSection(label);
    setNewLabel('');
    setAddingSection(false);
  };

  // Close dropdown when clicking elsewhere
  const closeDrop = () => setOpenDrop(null);

  // Find which task the open dropdown refers to
  const dropTask = openDrop ? sections.flatMap(s => s.tasks).find(t => t.id === openDrop.taskId) : null;

  return (
    <div
      onClick={e => { if (e.target === e.currentTarget) onClearSelection?.(); }}
      style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden', padding: '20px 24px', alignItems: 'flex-start', flex: 1, boxSizing: 'border-box' }}
    >
      <DropSlot
        vertical
        active={columnDragOverLabel === (sections[0]?.label ?? '__end__')}
        enabled={groupBy === 'category' && !!draggedColumnLabel}
        onOver={() => {
          if (columnDropLeaveTimer.current) { clearTimeout(columnDropLeaveTimer.current); columnDropLeaveTimer.current = null; }
          setColumnDragOverLabel(sections[0]?.label ?? '__end__');
        }}
        onLeave={() => { columnDropLeaveTimer.current = window.setTimeout(() => setColumnDragOverLabel(null), 80); }}
        onDropHere={() => {
          if (columnDropLeaveTimer.current) { clearTimeout(columnDropLeaveTimer.current); columnDropLeaveTimer.current = null; }
          if (draggedColumnLabel) onReorderSection?.(draggedColumnLabel, sections[0]?.label ?? null);
          setColumnDragOverLabel(null);
          setDraggedColumnLabel(null);
        }}
      />
      {sections.map((section, sIdx) => {
        const done = section.tasks.filter(t => t.checked || t.status === 'ok').length;
        const total = section.tasks.length;
        // section.tasks can be filtered (hidden completed tasks, assignee
        // filter) — the delete confirmation must count what actually gets
        // deleted, not just what's currently visible in this column.
        const realTotal = sectionTaskCounts?.[section.label] ?? total;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const isCollapsed = collapsedSections.has(section.label);

        return (
          <React.Fragment key={section.label + sIdx}>
          <div
            draggable={groupBy === 'category'}
            onDragStart={e => {
              if (groupBy !== 'category' || !columnDragHandleActive.current) { e.preventDefault(); return; }
              e.stopPropagation();
              setDraggedColumnLabel(section.label);
            }}
            onDragEnd={() => { columnDragHandleActive.current = false; setDraggedColumnLabel(null); setColumnDragOverLabel(null); }}
            onDragOver={e => { e.preventDefault(); if (!isCollapsed) setDragOverSection(sIdx); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSection(null); }}
            onDrop={() => {
              if (dragTask && dragTask.sectionIdx !== sIdx) onMoveTask(dragTask.task, dragTask.sectionIdx, sIdx);
              setDragTask(null); setDragOverSection(null);
            }}
            style={{
              width: isCollapsed ? 52 : 284,
              flexShrink: 0,
              background: dragOverSection === sIdx ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))' : 'var(--surface)',
              borderRadius: 'var(--radius)',
              border: `1px solid ${dragOverSection === sIdx ? 'var(--accent)' : 'var(--border)'}`,
              display: 'flex', flexDirection: 'column',
              maxHeight: '100%',
              transition: 'border-color 0.15s, background 0.15s, width 0.2s, opacity 0.2s',
              overflow: 'hidden',
              opacity: section.completed ? (draggedColumnLabel === section.label ? 0.35 : 0.5) : (draggedColumnLabel === section.label ? 0.35 : 1),
            }}
          >
            {/* Column header */}
            {isCollapsed ? (
              /* Collapsed: vertical label */
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 8, cursor: 'default' }}
                onMouseEnter={() => setHoveredHeader(section.label)}
                onMouseLeave={() => setHoveredHeader(null)}
              >
                <button
                  onClick={() => toggleCollapse(section.label)}
                  title={t('board.expand')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', borderRadius: 5, transform: 'rotate(-90deg)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  <SFIcon name="chevron-down" size={14} />
                </button>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 6px' }}>{total}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: section.completed ? 'var(--ok)' : 'var(--text-2)', writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', whiteSpace: 'nowrap', letterSpacing: '0.02em', flex: 1, paddingBottom: 8 }}>
                  {section.label}
                </span>
              </div>
            ) : (
              <div
                style={{ padding: '12px 14px 10px', flexShrink: 0 }}
                onMouseEnter={() => setHoveredHeader(section.label)}
                // Ne PAS refermer confirmDeleteSection ici — la confirmation
                // est un SFModal centré, l'ouvrir éloigne la souris de
                // l'en-tête et la refermerait aussitôt (même piège qu'en vue
                // Liste).
                onMouseLeave={() => setHoveredHeader(null)}
                onContextMenu={e => { if (groupBy !== 'category') return; e.preventDefault(); setSectionCtxMenu({ label: section.label, x: e.clientX, y: e.clientY }); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  {/* Column reorder handle */}
                  {groupBy === 'category' && onReorderSection && (
                    <div
                      onMouseDown={() => { columnDragHandleActive.current = true; }}
                      onMouseUp={() => { columnDragHandleActive.current = false; }}
                      style={{ cursor: 'grab', color: 'var(--border-2)', display: 'flex', flexShrink: 0, opacity: hoveredHeader === section.label ? 1 : 0, transition: 'opacity 0.1s' }}
                      title={t('board.reorderSection')}
                    >
                      <SFIcon name="grip-vertical" size={12} />
                    </div>
                  )}
                  {/* Section complete toggle */}
                  {groupBy === 'category' && (
                    <button
                      onClick={() => onToggleSectionComplete(section.label)}
                      title={section.completed ? t('board.markSectionIncomplete') : t('board.markSectionComplete')}
                      style={{ width: 14, height: 14, borderRadius: '50%', background: section.completed ? 'var(--ok)' : 'transparent', border: `1.5px solid ${section.completed ? 'var(--ok)' : 'var(--border-2)'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, transition: 'all 0.15s' }}
                      onMouseEnter={e => { if (!section.completed) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ok)'; } }}
                      onMouseLeave={e => { if (!section.completed) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; } }}
                    >
                      {section.completed && <SFIcon name="check" size={8} color="#fff" />}
                    </button>
                  )}

                  {groupBy === 'category' && editingSectionLabel === section.label ? (
                    <input
                      ref={labelInputRef}
                      value={labelDraft}
                      onChange={e => setLabelDraft(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => commitLabel(section.label)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitLabel(section.label); }
                        else if (e.key === 'Escape') { setEditingSectionLabel(null); }
                      }}
                      style={{
                        fontWeight: 600, fontSize: 13, color: 'var(--text)', background: 'var(--surface-2)',
                        border: '1px solid var(--accent)', borderRadius: 5, padding: '1px 5px',
                        boxSizing: 'content-box',
                        width: `${Math.max(2, labelDraft.length + 1)}ch`, maxWidth: 180, fontFamily: 'var(--ff-text)',
                      }}
                    />
                  ) : groupBy === 'category' ? (
                    <span
                      onClick={e => { e.stopPropagation(); setLabelDraft(section.label); setEditingSectionLabel(section.label); }}
                      style={{ fontWeight: 600, fontSize: 13, flex: 1, color: section.completed ? 'var(--text-3)' : 'var(--text)', textDecoration: section.completed ? 'line-through' : 'none', cursor: 'text' }}
                    >
                      {section.label}
                    </span>
                  ) : (
                    <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: 'var(--text)' }}>
                      {section.label}
                    </span>
                  )}

                  <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 999, padding: '1px 7px' }}>{total}</span>
                      {hoveredHeader === section.label && (
                        <>
                          <button
                            onClick={() => toggleCollapse(section.label)}
                            title={t('board.collapse')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5 }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                          >
                            <SFIcon name="chevron-left" size={11} />
                          </button>
                          {groupBy === 'category' && (
                            <button
                              onClick={() => { if (realTotal > 0) setConfirmDeleteSection(section.label); else onDeleteSection(section.label); }}
                              title={t('board.deleteSection')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5 }}
                              onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                              onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                            >
                              <SFIcon name="trash-2" size={11} />
                            </button>
                          )}
                        </>
                      )}
                  </div>
                </div>

                {/* Progress bar */}
                <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: pct === 100 ? 'var(--ok)' : 'var(--accent)', transition: 'width 0.3s' }} />
                </div>
                {total > 0 && (
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>
                    {t('board.completedCount', { done, total })}
                  </p>
                )}
              </div>
            )}

            {!isCollapsed && (
              <>
                <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />

                {/* Cards */}
                <div
                  onClick={e => { if (e.target === e.currentTarget) onClearSelection?.(); }}
                  // overflowX must be explicit: CSS forces a "visible" axis
                  // to "auto" once the other axis is non-visible, so
                  // overflowY: 'auto' alone silently turns overflow-x on
                  // too. The card drop-slots' ±14px hit-zone bleed then
                  // pokes past the column width, and that auto-x-scroll
                  // turned it into a real horizontal scrollbar cutting off
                  // card content — never intended to scroll sideways.
                  style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', padding: '8px 8px 0' }}
                >
                  {section.tasks.length === 0 && (
                    <div style={{ padding: '20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-3)' }}>
                      <SFIcon name="inbox" size={22} color="var(--border-2)" />
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, textAlign: 'center' }}>{t('board.noTasks')}</p>
                    </div>
                  )}
                  {section.tasks.map((task, i) => {
                    const isSelected = selectedTask?.id === task.id;
                    const isMulti = multiSelIds?.has(task.id) ?? false;
                    const isHovered = hoveredCard === task.id;

                    return (
                      <React.Fragment key={task.id}>
                      <DropSlot
                        active={cardDragOverKey === `${sIdx}-${i}`}
                        enabled={!!dragTask}
                        onOver={() => {
                          if (cardDropLeaveTimer.current) { clearTimeout(cardDropLeaveTimer.current); cardDropLeaveTimer.current = null; }
                          setCardDragOverKey(`${sIdx}-${i}`);
                        }}
                        onLeave={() => { cardDropLeaveTimer.current = window.setTimeout(() => setCardDragOverKey(null), 80); }}
                        onDropHere={() => {
                          if (cardDropLeaveTimer.current) { clearTimeout(cardDropLeaveTimer.current); cardDropLeaveTimer.current = null; }
                          if (dragTask) onMoveTask(dragTask.task, dragTask.sectionIdx, sIdx, task.id);
                          setCardDragOverKey(null);
                          setDragTask(null);
                        }}
                      />
                      <div
                        draggable
                        onDragStart={e => {
                          // Must stop here: dragstart bubbles, and the column
                          // wrapper (draggable itself, for column reorder)
                          // has its own onDragStart that calls
                          // preventDefault() unless its grip handle armed
                          // it — without this, that handler was cancelling
                          // every card drag too, since it fires for ANY
                          // dragstart bubbling up through the column.
                          e.stopPropagation();
                          e.dataTransfer.effectAllowed = 'move';
                          setDragTask({ task, sectionIdx: sIdx });
                        }}
                        onDragEnd={() => { setDragTask(null); setDragOverSection(null); }}
                        onClick={e => { if (openDrop) return; onSelectTask(task, e); }}
                        onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
                        onContextMenu={e => { e.preventDefault(); setCtxMenu({ task, sectionIdx: sIdx, x: e.clientX, y: e.clientY }); }}
                        style={{
                          position: 'relative',
                          background: (isSelected || isMulti) ? 'color-mix(in srgb, var(--accent) 7%, var(--surface-2))' : 'var(--surface-2)',
                          borderRadius: 10,
                          border: `1px solid ${(isSelected || isMulti) ? 'var(--accent)' : 'var(--border)'}`,
                          padding: '10px 13px',
                          marginBottom: 7,
                          cursor: 'pointer',
                          opacity: task.checked ? 0.5 : 1,
                          transition: 'border-color 0.1s, background 0.1s, box-shadow 0.1s',
                          boxShadow: isSelected ? '0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent)' : 'none',
                          userSelect: 'none',
                        }}
                        onMouseEnter={e => { setHoveredCard(task.id); if (!isSelected && !isMulti) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
                        onMouseLeave={e => { setHoveredCard(null); if (!isSelected && !isMulti) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
                      >
                        {/* Delete button — absolute top-right */}
                        <button
                          onClick={e => { e.stopPropagation(); onDeleteTask(task); }}
                          onMouseDown={e => e.stopPropagation()}
                          title={t('board.deleteTask')}
                          style={{ position: 'absolute', top: 8, right: 8, visibility: isHovered ? 'visible' : 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-3)', padding: 3, display: 'flex', borderRadius: 6 }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                        >
                          <SFIcon name="trash-2" size={11} />
                        </button>

                        {/* Top row: checkbox + priority */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                          {/* Checkbox */}
                          <button
                            onClick={e => {
                              e.stopPropagation();
                              const next = !task.checked;
                              onUpdateTask(task.id, { checked: next });
                              if (next) showToast({
                                type: 'task',
                                message: t('taskPanel.taskCompleted'),
                                onUndo: () => onUpdateTask(task.id, { checked: false }),
                              });
                            }}
                            onMouseDown={e => e.stopPropagation()}
                            title={task.checked ? t('board.markIncomplete') : t('board.markComplete')}
                            style={{
                              width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                              border: task.checked ? 'none' : '1.5px solid var(--border-2)',
                              background: task.checked ? 'var(--ok)' : 'transparent',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!task.checked) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ok)'; }}
                            onMouseLeave={e => { if (!task.checked) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                          >
                            {task.checked && <SFIcon name="check" size={8} color="#fff" />}
                          </button>

                          {/* Priority badge (clickable) */}
                          <button
                            onClick={e => { e.stopPropagation(); setOpenDrop({ taskId: task.id, type: 'priority', rect: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseDown={e => e.stopPropagation()}
                            title={t('board.changePriority')}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[task.priority], flexShrink: 0, display: 'block' }} />
                            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: task.priority !== 'none' ? PRIORITY_COLOR[task.priority] : 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                              {task.priority !== 'none' ? t(PRIORITY_LABEL_KEY[task.priority]) : t('tasks.priority')}
                            </span>
                          </button>
                        </div>

                        {/* Title — cliquer dessus édite en place (parité vue
                            Liste) ; cliquer ailleurs sur la carte ouvre le
                            panneau de détail comme avant. */}
                        {editingTaskId === task.id ? (
                          <textarea
                            ref={taskTitleInputRef}
                            value={taskTitleDraft}
                            onChange={e => setTaskTitleDraft(e.target.value)}
                            onClick={e => e.stopPropagation()}
                            onMouseDown={e => e.stopPropagation()}
                            onBlur={() => commitTaskTitle(task)}
                            onKeyDown={e => {
                              if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitTaskTitle(task); }
                              if (e.key === 'Escape') { setEditingTaskId(null); }
                              e.stopPropagation();
                            }}
                            rows={2}
                            style={{ width: '100%', boxSizing: 'border-box', resize: 'none', marginBottom: 10, padding: '3px 6px', borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 13, fontWeight: 500, lineHeight: 1.45, fontFamily: 'var(--ff-text)', outline: 'none' }}
                          />
                        ) : (
                          <p
                            onClick={e => { e.stopPropagation(); setTaskTitleDraft(task.title); setEditingTaskId(task.id); }}
                            onMouseDown={e => e.stopPropagation()}
                            style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 13, fontWeight: 500, lineHeight: 1.45, marginBottom: groupBy !== 'category' && task.sectionLabel ? 6 : 10, color: task.checked ? 'var(--text-3)' : 'var(--text)', textDecoration: task.checked ? 'line-through' : 'none', cursor: 'text' }}
                          >
                            {task.deliverable && <SFIcon name="package" size={11} color="var(--accent)" />}
                            {task.title}
                          </p>
                        )}

                        {groupBy !== 'category' && task.sectionLabel && (
                          <span style={{ display: 'inline-block', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 999, padding: '2px 7px', marginBottom: 8 }}>
                            {task.sectionLabel}
                          </span>
                        )}

                        {/* Footer: status + meta + assignee */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          {/* Status pill (clickable) */}
                          <button
                            onClick={e => { e.stopPropagation(); setOpenDrop({ taskId: task.id, type: 'status', rect: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseDown={e => e.stopPropagation()}
                            title={t('board.changeStatus')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', minHeight: 20, borderRadius: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            {task.status
                              ? <SFPill status={task.status} small>{t(STATUS_OPTIONS.find(o => o.value === task.status)?.labelKey ?? 'tasks.noStatus')}</SFPill>
                              : (
                                <span style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0, display: 'block' }} />
                                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('tasks.status')}</span>
                                </span>
                              )
                            }
                          </button>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            {task.description && (
                              <span title={stripHtml(task.description).slice(0, 120)} style={{ display: 'flex', alignItems: 'center' }}>
                                <SFIcon name="text-align-start" size={11} color="var(--text-3)" />
                              </span>
                            )}

                            {(task.subtasks?.length ?? 0) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <SFIcon name="git-branch" size={11} color="var(--text-3)" />
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                                  {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
                                </span>
                              </div>
                            )}

                            <TaskActivityCell taskId={task.id} />
                            <CommentBadge taskId={task.id} comments={task.comments} />
                            {/* Date (clickable) */}
                            <button
                              onClick={e => { e.stopPropagation(); setOpenDrop({ taskId: task.id, type: 'date', rect: e.currentTarget.getBoundingClientRect() }); }}
                              onMouseDown={e => e.stopPropagation()}
                              title={t('board.changeDate')}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 5 }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              <SFIcon name="calendar" size={10} color={task.dueDate && task.dueDate !== '—' && isOverdue(task.dueDate) ? 'var(--danger)' : 'var(--text-3)'} />
                              {task.dueDate && task.dueDate !== '—' ? (
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isOverdue(task.dueDate) ? 'var(--danger)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                                  {fmtTaskDate(task.dueDate)}
                                </span>
                              ) : (
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--border-2)', whiteSpace: 'nowrap' }}>—</span>
                              )}
                            </button>

                            <AssigneeGroup
                              assignees={task.assignees}
                              size={20}
                              onChange={next => onUpdateTask(task.id, { assignees: next })}
                            />
                          </div>
                        </div>
                      </div>
                      </React.Fragment>
                    );
                  })}
                  <DropSlot
                    active={cardDragOverKey === `${sIdx}-${section.tasks.length}`}
                    enabled={!!dragTask}
                    onOver={() => {
                      if (cardDropLeaveTimer.current) { clearTimeout(cardDropLeaveTimer.current); cardDropLeaveTimer.current = null; }
                      setCardDragOverKey(`${sIdx}-${section.tasks.length}`);
                    }}
                    onLeave={() => { cardDropLeaveTimer.current = window.setTimeout(() => setCardDragOverKey(null), 80); }}
                    onDropHere={() => {
                      if (cardDropLeaveTimer.current) { clearTimeout(cardDropLeaveTimer.current); cardDropLeaveTimer.current = null; }
                      if (dragTask) onMoveTask(dragTask.task, dragTask.sectionIdx, sIdx);
                      setCardDragOverKey(null);
                      setDragTask(null);
                    }}
                  />
                </div>

                {/* Add task — saisie en ligne du titre, comme AddTaskRow en
                    vue Liste (avant : créait une carte "Nouvelle tâche" et
                    ouvrait le panneau de détail pour la renommer). */}
                {groupBy === 'category' && (addingInSection === section.label ? (
                  <div style={{ margin: '6px 8px 8px', padding: '9px 11px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--surface-2)' }}>
                    <textarea
                      ref={newTaskInputRef}
                      value={newTaskTitle}
                      onChange={e => setNewTaskTitle(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); commitNewTask(sIdx, true); }
                        if (e.key === 'Escape') { setAddingInSection(null); setNewTaskTitle(''); }
                        e.stopPropagation();
                      }}
                      onBlur={() => commitNewTask(sIdx, false)}
                      onPaste={e => handleNewTaskPaste(e, sIdx)}
                      placeholder={t('taskPanel.taskNamePlaceholder')}
                      rows={2}
                      style={{ width: '100%', boxSizing: 'border-box', resize: 'none', background: 'transparent', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 13, fontWeight: 500, lineHeight: 1.45, fontFamily: 'var(--ff-text)' }}
                    />
                    <div style={{ display: 'flex', gap: 6, marginTop: 6 }}>
                      <button onMouseDown={e => e.preventDefault()} onClick={() => commitNewTask(sIdx, true)}
                        style={{ flex: 1, padding: '5px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                        {t('board.add')}
                      </button>
                      <button onMouseDown={e => e.preventDefault()} onClick={() => { setAddingInSection(null); setNewTaskTitle(''); }}
                        style={{ padding: '5px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                        {t('board.cancel')}
                      </button>
                    </div>
                  </div>
                ) : (
                  <button
                    onClick={() => { setAddingInSection(section.label); setNewTaskTitle(''); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 8px 8px', padding: '7px 10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)', width: 'calc(100% - 16px)', transition: 'color 0.12s, border-color 0.12s' }}
                    onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                    onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                  >
                    <SFIcon name="plus" size={13} />
                    {t('board.addTask')}
                  </button>
                ))}
              </>
            )}
          </div>
          <DropSlot
            vertical
            active={columnDragOverLabel === (sections[sIdx + 1]?.label ?? '__end__')}
            enabled={groupBy === 'category' && !!draggedColumnLabel}
            onOver={() => {
              if (columnDropLeaveTimer.current) { clearTimeout(columnDropLeaveTimer.current); columnDropLeaveTimer.current = null; }
              setColumnDragOverLabel(sections[sIdx + 1]?.label ?? '__end__');
            }}
            onLeave={() => { columnDropLeaveTimer.current = window.setTimeout(() => setColumnDragOverLabel(null), 80); }}
            onDropHere={() => {
              if (columnDropLeaveTimer.current) { clearTimeout(columnDropLeaveTimer.current); columnDropLeaveTimer.current = null; }
              if (draggedColumnLabel) onReorderSection?.(draggedColumnLabel, sections[sIdx + 1]?.label ?? null);
              setColumnDragOverLabel(null);
              setDraggedColumnLabel(null);
            }}
          />
          </React.Fragment>
        );
      })}

      {/* New section */}
      {groupBy === 'category' && (addingSection ? (
        <div style={{ width: 240, flexShrink: 0, borderRadius: 'var(--radius)', border: '1px solid var(--accent)', background: 'var(--surface)', padding: 10, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSection(); if (e.key === 'Escape') { setAddingSection(false); setNewLabel(''); } }}
            onBlur={commitSection}
            placeholder={t('board.sectionNamePlaceholder')}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onMouseDown={e => e.preventDefault()} onClick={commitSection}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              {t('board.add')}
            </button>
            <button onMouseDown={e => e.preventDefault()} onClick={() => { setAddingSection(false); setNewLabel(''); }}
              style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              {t('board.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingSection(true)}
          style={{ width: 240, flexShrink: 0, borderRadius: 'var(--radius)', border: '1px dashed var(--border-2)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)', background: 'transparent', transition: 'color 0.12s, border-color 0.12s', alignSelf: 'flex-start' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
        >
          <SFIcon name="plus" size={14} />
          {t('board.newSection')}
        </button>
      ))}

      {/* Context menu */}
      {ctxMenu && (
        <CardContextMenu
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          onOpen={() => { onSelectTask(ctxMenu.task); setCtxMenu(null); }}
          onDelete={() => { onDeleteTask(ctxMenu.task); setCtxMenu(null); }}
          onConvert={() => { onConvertRequest(ctxMenu.task, { x: ctxMenu.x, y: ctxMenu.y }); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
          sections={sections}
          currentSectionIdx={ctxMenu.sectionIdx}
          onMoveToSection={toIdx => { onMoveTask(ctxMenu.task, ctxMenu.sectionIdx, toIdx); setCtxMenu(null); }}
        />
      )}

      {sectionCtxMenu && (
        <SectionContextMenu
          pos={{ x: sectionCtxMenu.x, y: sectionCtxMenu.y }}
          onRename={() => { setLabelDraft(sectionCtxMenu.label); setEditingSectionLabel(sectionCtxMenu.label); }}
          onCopy={() => { onCopySection(sectionCtxMenu.label); setSectionCtxMenu(null); }}
          onMove={() => { onMoveSection(sectionCtxMenu.label); setSectionCtxMenu(null); }}
          onDelete={() => {
            const target = sections.find(s => s.label === sectionCtxMenu.label);
            const targetCount = sectionTaskCounts?.[sectionCtxMenu.label] ?? target?.tasks.length ?? 0;
            if (targetCount > 0) setConfirmDeleteSection(sectionCtxMenu.label);
            else onDeleteSection(sectionCtxMenu.label);
          }}
          onClose={() => setSectionCtxMenu(null)}
        />
      )}

      {/* Confirmation de suppression — même SFModal centré qu'en vue Liste.
          Avant : un bloc de texte inline coincé dans l'en-tête de colonne,
          illisible sur 284px de large. */}
      <SFModal open={confirmDeleteSection !== null} onClose={() => setConfirmDeleteSection(null)} title={t('board.deleteSectionTitle')} width={380}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 22 }}>
          {t('board.deleteSectionConfirm', {
            count: confirmDeleteSection ? (sectionTaskCounts?.[confirmDeleteSection] ?? sections.find(s => s.label === confirmDeleteSection)?.tasks.length ?? 0) : 0,
            section: confirmDeleteSection ?? '',
          })}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setConfirmDeleteSection(null)}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          >{t('tasks.cancel')}</button>
          <button
            onClick={() => { if (confirmDeleteSection) onDeleteSection(confirmDeleteSection); setConfirmDeleteSection(null); }}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          >{t('tasks.delete')}</button>
        </div>
      </SFModal>

      {/* Inline dropdowns */}
      {openDrop && dropTask && openDrop.type === 'status' && (
        <DropMenu rect={openDrop.rect} onClose={closeDrop}>
          {STATUS_OPTIONS.map(o => (
            <DItem
              key={o.value}
              active={dropTask.status === o.value || (!dropTask.status && !o.value)}
              label={<><span style={{ width: 7, height: 7, borderRadius: '50%', background: o.value ? STATUS_COLOR[o.value] : 'var(--border-2)', display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>}
              onClick={() => { onUpdateTask(dropTask.id, { status: o.value as Task['status'], statusLabel: t(o.labelKey) }); closeDrop(); }}
            />
          ))}
        </DropMenu>
      )}

      {openDrop && dropTask && openDrop.type === 'priority' && (
        <DropMenu rect={openDrop.rect} onClose={closeDrop}>
          {PRIORITY_OPTIONS.map(p => (
            <DItem
              key={p}
              active={dropTask.priority === p}
              label={<><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>}
              onClick={() => { onUpdateTask(dropTask.id, { priority: p, priorityLabel: t(PRIORITY_LABEL_KEY[p]) }); closeDrop(); }}
            />
          ))}
        </DropMenu>
      )}

      {openDrop && dropTask && openDrop.type === 'date' && (
        <TaskDatePopover
          date={dropTask.dueDate && dropTask.dueDate !== '—' ? dropTask.dueDate : ''}
          endDate={dropTask.endDate ?? ''}
          startTime={dropTask.startTime ?? ''}
          endTime={dropTask.endTime ?? ''}
          anchorRect={openDrop.rect}
          zIndex={700}
          onChange={(d, s, e, ed) => onUpdateTask(dropTask.id, { dueDate: d || '—', dueDateRed: false, startTime: s ?? '', endTime: e ?? '', endDate: ed ?? '' })}
          onClose={closeDrop}
        />
      )}

    </div>
  );
}
