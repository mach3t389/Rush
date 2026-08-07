import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFBar, SFButton, SFIcon, SFModal, TaskDatePopover, parseYMD, fmtTaskDate, isOverdue, AssigneeGroup, CommentBadge } from '../components/ui';
import { PROJECT_TASKS, RESOURCES } from '../data/mock';
import { findProject, getProjects, subscribeProjects } from '../data/projectStore';
import { STATUS_COLOR } from '../data/status';
import { getSections, setSections as setSections_store, subscribeStore, updateTask, moveTask, moveTasks, copyTasks, moveSection, copySection, convertTasksToSubtasks, convertSubtasksToTasks, copySubtasksAsTasks } from '../data/taskStore';
import { markTaskRead } from '../data/notificationStore';
import { getCurrentUser } from '../data/authStore';
import { addWatchers } from '../data/watchers';
import { useTaskNotifCount } from '../hooks/useNotifs';
import { usePersistedState } from '../hooks/usePersistedState';
import { useSyncedViewState } from '../hooks/useSyncedViewState';
import { useClampedMenuPosition } from '../hooks/useClampedMenuPosition';
import { useAutoWidthInput } from '../hooks/useAutoWidthInput';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import type { Task, Priority, ResourceType, SectionData, User, Project } from '../types';
import { TravailBoard } from './TravailBoard';
import { TaskPanel } from '../components/TaskPanel';
import { SubtaskTargetPicker } from '../components/SubtaskTargetPicker';
import { showToast } from '../data/toastStore';
import { stripHtml } from '../utils/stripHtml';

// ── Constants ─────────────────────────────────────────────────────────────────

export const PRIORITY_COLOR: Record<Priority, string> = {
  high:   'var(--danger)',
  normal: 'var(--warn)',
  low:    'var(--info)',
  none:   'var(--border-2)',
};
export const PRIORITY_LABEL_KEY: Record<Priority, string> = {
  high:   'priority.high',
  normal: 'priority.medium',
  low:    'priority.low',
  none:   'priority.none',
};
export const PRIORITY_OPTIONS: Priority[] = ['high', 'normal', 'low', 'none'];

const TYPE_ICON: Record<ResourceType, string> = {
  screenplay:   'clapperboard',
  video_review: 'video',
  moodboard:    'grid-2x2',
  document:     'file',
  inspirations: 'image',
  form:         'clipboard-list',
  web_review:   'globe',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

export function ddItem(onClick: () => void, children: React.ReactNode, active?: boolean) {
  return (
    <button
      onMouseDown={e => e.preventDefault()}
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

// ── Column header ──────────────────────────────────────────────────────────────

export type VisibleColumns = { activity: boolean; assignee: boolean; priority: boolean; status: boolean; date: boolean };
export const DEFAULT_VISIBLE_COLUMNS: VisibleColumns = { activity: true, assignee: true, priority: true, status: true, date: true };

function buildGrid(vc: VisibleColumns): string {
  return [
    '28px', '1fr',
    vc.activity ? '65px' : null,
    vc.assignee ? '120px' : null,
    vc.priority ? '75px' : null,
    vc.status ? '95px' : null,
    vc.date ? '85px' : null,
    '24px',
  ].filter(Boolean).join(' ');
}

const COL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--ff-mono)', fontSize: 10,
  color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase',
};

function ColHeader({ visibleColumns }: { visibleColumns: VisibleColumns }) {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: buildGrid(visibleColumns), alignItems: 'center', gap: 12, padding: '8px 16px 6px', borderBottom: '1px solid var(--border)' }}>
      <span />
      <span style={COL_STYLE}>{t('tasks.title')}</span>
      {visibleColumns.activity && <span style={COL_STYLE}>{t('tasks.activity')}</span>}
      {visibleColumns.assignee && <span style={COL_STYLE}>{t('tasks.assignedTo')}</span>}
      {visibleColumns.priority && <span style={COL_STYLE}>{t('tasks.priority')}</span>}
      {visibleColumns.status && <span style={COL_STYLE}>{t('tasks.status')}</span>}
      {visibleColumns.date && <span style={COL_STYLE}>{t('tasks.date')}</span>}
      <span />
    </div>
  );
}

// ── Shared inline dropdown ────────────────────────────────────────────────────

export function InlineDropdown({ onClose, children, anchorRect, minWidth = 160, zIndex = 1000 }: {
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
  return createPortal(
    <>
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>,
    document.body
  );
}

export const STATUS_OPTIONS = [
  { value: '',       labelKey: 'tasks.noStatus'   },
  { value: 'warn',   labelKey: 'tasks.todo'       },
  { value: 'info',   labelKey: 'tasks.inProgress' },
  { value: 'ok',     labelKey: 'tasks.completed'  },
  { value: 'danger', labelKey: 'tasks.overdue'    },
  { value: 'review', labelKey: 'tasks.inReview'   },
];


// ── Task activity cell ────────────────────────────────────────────────────────

function TaskActivityCell({ taskId }: { taskId: string }) {
  const count = useTaskNotifCount(taskId);
  const [justRead, setJustRead] = React.useState(false);

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (count > 0) {
      markTaskRead(taskId);
      setJustRead(true);
      setTimeout(() => setJustRead(false), 1200);
    }
  };

  if (count === 0 && !justRead) {
    return <span style={{ color: 'var(--border-2)', fontFamily: 'var(--ff-mono)', fontSize: 10 }}>—</span>;
  }

  return (
    <button
      onClick={handleClick}
      title={count > 0 ? `${count} nouvelle${count > 1 ? 's' : ''} activité${count > 1 ? 's' : ''} — cliquer pour marquer comme lu` : 'Lu'}
      style={{ background: 'none', border: 'none', padding: 0, cursor: count > 0 ? 'pointer' : 'default', display: 'inline-flex', position: 'relative' }}
    >
      <SFIcon
        name="message-circle"
        size={14}
        color={justRead ? 'var(--ok)' : count > 0 ? 'var(--accent)' : 'var(--text-3)'}
        style={{ transition: 'color 0.2s' }}
      />
      {count > 0 && (
        <span style={{
          position: 'absolute', top: -5, right: -6,
          background: 'var(--accent)', color: 'var(--on-accent)',
          borderRadius: 999, fontSize: 8, fontWeight: 700,
          padding: '1px 4px', fontFamily: 'var(--ff-mono)', lineHeight: 1.4,
          pointerEvents: 'none',
        }}>
          {count}
        </span>
      )}
    </button>
  );
}

// ── Section move modal ────────────────────────────────────────────────────────

function SectionMoveModal({ sectionLabel, mode = 'move', onMove, onClose }: {
  sectionLabel: string;
  mode?: 'move' | 'copy';
  onMove: (projectId: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(() => getProjects().filter(p => !p.archived));
  const [targetProjectId, setTargetProjectId] = useState('');
  useEffect(() => subscribeProjects(() => setProjects(getProjects().filter(p => !p.archived))), []);

  return (
    <SFModal open onClose={onClose} title={mode === 'copy' ? t('taskPanel.copySectionTitle') : t('taskPanel.moveSectionTitle')} width={380} zIndex={600}>
      <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>{t('taskPanel.sectionMoveConfirm', { section: sectionLabel, verb: mode === 'copy' ? t('taskPanel.copiedVerb') : t('taskPanel.movedVerb') })}</p>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 220, overflowY: 'auto' }}>
        {projects.map(p => (
          <button key={p.id} onClick={() => setTargetProjectId(p.id)}
            style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${targetProjectId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: targetProjectId === p.id ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: targetProjectId === p.id ? 'var(--accent)' : 'var(--text)', fontWeight: targetProjectId === p.id ? 600 : 400 }}
          >{p.name}</button>
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
        <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.cancel')}</button>
        <button onClick={() => { if (targetProjectId) { onMove(targetProjectId); onClose(); } }} disabled={!targetProjectId}
          style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: !targetProjectId ? 'var(--surface-3)' : 'var(--accent)', color: !targetProjectId ? 'var(--text-3)' : 'var(--on-accent)', fontSize: 13, cursor: !targetProjectId ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--ff-text)' }}
        >{mode === 'copy' ? t('taskPanel.copy') : t('taskPanel.move')}</button>
      </div>
    </SFModal>
  );
}

// ── Bulk move modal (tasks or section) ────────────────────────────────────────

function BulkMoveModal({ title, mode = 'move', onMove, onClose, defaultProjectId }: {
  title: string;
  mode?: 'move' | 'copy';
  onMove: (projectId: string, sectionLabel: string) => void;
  onClose: () => void;
  // Projet pré-sélectionné à l'ouverture — passer le projet courant fait
  // apparaître ses sections immédiatement, si bien que « déplacer vers une
  // autre section » et « déplacer vers un autre projet » sont le même geste
  // dans la même fenêtre : on choisit une section tout de suite, ou on change
  // d'abord de projet.
  defaultProjectId?: string;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(() => getProjects().filter(p => !p.archived));
  const [targetProjectId, setTargetProjectId] = useState(defaultProjectId ?? '');
  const [targetSection, setTargetSection] = useState('');
  const [newSection, setNewSection] = useState('');

  useEffect(() => subscribeProjects(() => setProjects(getProjects().filter(p => !p.archived))), []);

  const targetSections = targetProjectId ? getSections(targetProjectId) : [];

  return (
    <SFModal open onClose={onClose} title={title} width={600} zIndex={600}>
        {/* Deux colonnes côte à côte — évite le long défilement vertical
            projet-puis-section quand il y a beaucoup de projets/sections. */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 16 }}>
          <div>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{t('taskPanel.destinationProject')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {projects.map(p => (
                <button key={p.id} onClick={() => { setTargetProjectId(p.id); setTargetSection(''); }}
                  style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${targetProjectId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: targetProjectId === p.id ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: targetProjectId === p.id ? 'var(--accent)' : 'var(--text)', fontWeight: targetProjectId === p.id ? 600 : 400 }}
                >{p.name}</button>
              ))}
            </div>
          </div>

          <div>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{t('taskPanel.destinationSection')}</p>
            {targetProjectId ? (
              <>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 210, overflowY: 'auto', marginBottom: 10 }}>
                  {targetSections.map(s => (
                    <button key={s.label} onClick={() => setTargetSection(s.label)}
                      style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${targetSection === s.label ? 'var(--accent)' : 'var(--border)'}`, background: targetSection === s.label ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontFamily: 'var(--ff-text)', color: targetSection === s.label ? 'var(--accent)' : 'var(--text)' }}
                    >{s.label}</button>
                  ))}
                </div>
                <input value={newSection} onChange={e => { setNewSection(e.target.value); if (e.target.value) setTargetSection(e.target.value); }}
                  placeholder={t('taskPanel.orCreateSection')}
                  style={{ width: '100%', padding: '7px 12px', borderRadius: 9, border: '1px dashed var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark', boxSizing: 'border-box' }}
                />
              </>
            ) : (
              <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic', padding: '8px 0' }}>{t('taskPanel.pickProjectFirst')}</p>
            )}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.cancel')}</button>
          <button
            onClick={() => { if (targetProjectId && targetSection) { onMove(targetProjectId, targetSection); onClose(); } }}
            disabled={!targetProjectId || !targetSection}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: (!targetProjectId || !targetSection) ? 'var(--surface-3)' : 'var(--accent)', color: (!targetProjectId || !targetSection) ? 'var(--text-3)' : 'var(--on-accent)', fontSize: 13, cursor: (!targetProjectId || !targetSection) ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--ff-text)' }}
          >{mode === 'copy' ? t('taskPanel.copy') : t('taskPanel.move')}</button>
        </div>
    </SFModal>
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

// Un seul « Déplacer » : la fenêtre qu'il ouvre propose les deux destinations
// (une autre section du projet courant, ou un autre projet), plutôt que de
// forcer le choix avant même de voir les options.
function TaskContextMenu({ pos, onDelete, onOpen, onMove, onConvert, onClose }: {
  pos: { x: number; y: number };
  onDelete: () => void;
  onOpen: () => void;
  onMove: () => void;
  onConvert: () => void;
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
    <div ref={ref} style={{ position: 'fixed', left: coords.left, top: coords.top, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 200, padding: '4px 0', overflow: 'hidden', maxHeight: coords.maxHeight, overflowY: coords.maxHeight ? 'auto' : 'hidden' }}>
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>{t('tasks.openDetail')}</span></>, onOpen)}
      {item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>{t('board.moveTo')}</span></>, onMove)}
      {item(<><SFIcon name="git-branch" size={13} color="var(--text-3)" /><span>{t('board.convertToSubtask')}</span></>, onConvert)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('tasks.delete')}</span></>, onDelete, true)}
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
    <div ref={ref} style={{ position: 'fixed', left: coords.left, top: coords.top, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 200, padding: '4px 0', overflow: 'hidden', maxHeight: coords.maxHeight, overflowY: coords.maxHeight ? 'auto' : 'hidden' }}>
      {item(<><SFIcon name="pencil" size={13} color="var(--text-3)" /><span>{t('taskPanel.renameSection')}</span></>, onRename)}
      {item(<><SFIcon name="copy" size={13} color="var(--text-3)" /><span>{t('taskPanel.copyToProject')}</span></>, onCopy)}
      {item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>{t('taskPanel.moveToProject')}</span></>, onMove)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('board.deleteSection')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

function TaskRow({
  task,
  selected,
  multiSelected,
  onSelect,
  onTaskDragStart,
  onTaskDragEnd,
  onDelete,
  onConvertRequest,
  onMoveRequest,
  visibleColumns,
}: {
  task: Task;
  selected: boolean;
  onSelect: (t: Task, e?: React.MouseEvent) => void;
  multiSelected?: boolean;
  onTaskDragStart?: () => void;
  onTaskDragEnd?: () => void;
  onDelete?: () => void;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
  // Ouvre le sélecteur projet+section du parent, qui décide seul si l'action
  // porte sur cette tâche ou sur toute la multi-sélection.
  onMoveRequest?: (task: Task) => void;
  visibleColumns: VisibleColumns;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(task.checked);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [assignees, setAssignees] = useState<User[]>(task.assignees);
  const [status, setStatus] = useState(task.status as string);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [endDate, setEndDate] = useState(task.endDate ?? '');
  const [startTime, setStartTime] = useState(task.startTime ?? '');
  const [endTime, setEndTime] = useState(task.endTime ?? '');
  const { projectId: rowProjectId } = useParams<{ projectId: string }>();
  const [open, setOpen] = useState<'priority' | 'status' | 'dueDate' | null>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const dragHandleActive = React.useRef(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = React.useRef<HTMLInputElement>(null);
  const { measureRef: titleMeasureRef, width: titleInputWidth } = useAutoWidthInput(titleDraft, editingTitle);

  // The fields above are local (optimistic) copies of `task`, seeded once at
  // mount — editing them from THIS row also calls updateTask() so they stay
  // in sync here. But an edit made elsewhere (the detail panel on the right,
  // which shares the same task.id) updates the store and this component
  // re-renders with a fresh `task` prop, yet these useState calls never
  // re-read it — the row kept showing stale values until it happened to
  // unmount. Re-sync whenever the incoming task object actually changes.
  React.useEffect(() => {
    setChecked(task.checked);
    setPriority(task.priority);
    setAssignees(task.assignees);
    setStatus(task.status as string);
    setDueDate(task.dueDate);
    setEndDate(task.endDate ?? '');
    setStartTime(task.startTime ?? '');
    setEndTime(task.endTime ?? '');
    if (!editingTitle) setTitleDraft(task.title);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  React.useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  const commitTitle = () => {
    // Commit whatever the user left, including empty (e.g. select-all then
    // Ctrl+X) — falling back to the old title here silently undid a
    // deletion the moment the field lost focus.
    const val = titleDraft.trim();
    setTitleDraft(val);
    setEditingTitle(false);
    const pid = rowProjectId ?? task.projectId;
    if (pid && val !== task.title) updateTask(pid, task.id, { title: val });
  };

  const openDrop = (key: typeof open, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(prev => prev === key ? null : key);
    setDropRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
  };

  const hasSubtasks = !!task.subtasks?.length;

  return (
    <>
    <div
      data-task-id={task.id}
      draggable
      onDragStart={e => {
        if (!dragHandleActive.current) { e.preventDefault(); return; }
        e.stopPropagation();
        onTaskDragStart?.();
      }}
      onDragEnd={() => { dragHandleActive.current = false; onTaskDragEnd?.(); }}
      style={{
        display: 'grid',
        gridTemplateColumns: buildGrid(visibleColumns),
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        minHeight: 44,
        borderBottom: '1px solid var(--border)',
        background: multiSelected ? 'rgba(249,255,0,0.08)' : selected ? 'rgba(249,255,0,0.04)' : hovered ? 'var(--surface-2)' : 'transparent',
        outline: multiSelected ? '1px solid rgba(249,255,0,0.35)' : 'none',
        outlineOffset: '-1px',
        borderLeft: selected ? '2px solid var(--accent)' : task.deliverable ? '2px solid rgba(249,255,0,0.3)' : '2px solid transparent',
        opacity: checked ? 0.45 : 1,
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onContextMenu={e => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
      onClick={e => {
        if (editingTitle) return;
        // Cliquer n'importe où sur la ligne ouvre le panneau, sauf sur un
        // contrôle interactif (bouton/menu) qui gère déjà son propre clic,
        // et sauf sur le titre lui-même (stopPropagation — voir plus bas).
        if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
        onSelect(task, e);
      }}
    >
      {/* Drag handle + Checkbox */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 3, position: 'relative' }}>
        <div
          onMouseDown={() => { dragHandleActive.current = true; }}
          onMouseUp={() => { dragHandleActive.current = false; }}
          style={{ cursor: 'grab', color: 'var(--border-2)', display: 'flex', opacity: hovered ? 1 : 0, transition: 'opacity 0.1s', position: 'absolute', left: -16, paddingRight: 2 }}
          title="Réordonner"
        >
          <SFIcon name="grip-vertical" size={11} />
        </div>
        <button
          onClick={() => {
            const next = !checked;
            setChecked(next);
            if (rowProjectId) updateTask(rowProjectId, task.id, { checked: next });
            if (next) showToast({
              type: 'task',
              message: 'Tâche terminée',
              onUndo: () => { setChecked(false); if (rowProjectId) updateTask(rowProjectId, task.id, { checked: false }); },
            });
          }}
          style={{
            width: 16, height: 16, borderRadius: '50%',
            border: checked ? 'none' : '1.5px solid var(--border-2)',
            background: checked ? 'var(--ok)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0, cursor: 'pointer',
          }}
        >
          {checked && <SFIcon name="check" size={9} color="white" />}
        </button>
      </div>

      {/* Title — cliquer directement sur le texte édite le titre ; cliquer
          n'importe où ailleurs sur la ligne ouvre le panneau de détail. */}
      <div
        onClick={e => {
          if (editingTitle) return;
          e.stopPropagation();
          setEditingTitle(true);
        }}
        onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
        // maxWidth stops just short of 100% (rather than 100%) so a long,
        // truncated title never eats the whole column — leaving a sliver of
        // row background past the "…" that's always clickable to open the
        // detail panel, instead of every click landing on title-edit mode.
        style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', cursor: editingTitle ? 'default' : 'text', height: '100%', maxWidth: editingTitle ? '100%' : 'calc(100% - 28px)', width: editingTitle ? '100%' : 'fit-content' }}
      >
        {task.deliverable && !editingTitle && <SFIcon name="package" size={11} color="var(--accent)" />}
        {editingTitle ? (
          <>
            {/* Mesureur caché — même police que l'input, sert à calculer sa largeur réelle */}
            <span ref={titleMeasureRef} style={{ position: 'fixed', top: -9999, left: -9999, visibility: 'hidden', whiteSpace: 'pre', fontSize: 13, fontWeight: 500, fontFamily: 'var(--ff-text)' }}>
              {titleDraft || ' '}
            </span>
            <input
              ref={titleInputRef}
              value={titleDraft}
              onChange={e => setTitleDraft(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => {
                if (e.key === 'Enter') { e.preventDefault(); commitTitle(); }
                if (e.key === 'Escape') { setTitleDraft(task.title); setEditingTitle(false); }
                e.stopPropagation();
              }}
              onClick={e => e.stopPropagation()}
              style={{
                fontSize: 13, fontWeight: 500, padding: '2px 6px',
                borderRadius: 6, border: '1px solid var(--accent)',
                background: 'var(--surface-3)', color: 'var(--text)',
                fontFamily: 'var(--ff-text)', outline: 'none',
                boxSizing: 'border-box',
                width: `${titleInputWidth}px`, maxWidth: '100%',
              }}
            />
          </>
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, textDecoration: checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleDraft}
          </span>
        )}
        {!editingTitle && task.description && (
          <span title={stripHtml(task.description).slice(0, 120)} style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center' }}>
            {/* text-align-start, pas align-left : ce dernier n'existe pas dans
                la version de lucide-react installée et SFIcon renvoie null
                silencieusement — l'icône ne s'affichait donc jamais. */}
            <SFIcon name="text-align-start" size={11} color="var(--text-3)" />
          </span>
        )}
        {!editingTitle && hasSubtasks && (
          <span style={{ flexShrink: 0, marginLeft: 2, display: 'flex', alignItems: 'center', gap: 2 }}>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
            </span>
          </span>
        )}
      </div>

      {/* Activité */}
      {visibleColumns.activity && (
      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
        <TaskActivityCell taskId={task.id} />
        <CommentBadge taskId={task.id} comments={task.comments} />
      </div>
      )}

      {/* Assignés */}
      {visibleColumns.assignee && (
      <AssigneeGroup
        assignees={assignees}
        showNames
        onChange={next => {
          setAssignees(next);
          if (rowProjectId) updateTask(rowProjectId, task.id, { assignees: next });
        }}
      />
      )}

      {/* Priority — inline dropdown */}
      {visibleColumns.priority && (
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('priority', e)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', minHeight: 20 }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
          {priority !== 'none' && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(PRIORITY_LABEL_KEY[priority])}</span>}
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'priority' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect}>
            {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { priority: p, priorityLabel: t(PRIORITY_LABEL_KEY[p]) }); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>,
              priority === p
            ))}
          </InlineDropdown>
        )}
      </div>
      )}

      {/* Status — inline dropdown */}
      {visibleColumns.status && (
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('status', e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', minHeight: 20, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {status
            ? <SFPill status={status as Task['status']} small>{t(STATUS_OPTIONS.find(o => o.value === status)?.labelKey ?? 'tasks.noStatus')}</SFPill>
            : <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0, display: 'block' }} />
          }
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'status' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect}>
            {STATUS_OPTIONS.map(o => ddItem(() => { const lbl = t(o.labelKey); setStatus(o.value); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { status: o.value as Task['status'], statusLabel: lbl }); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>,
              status === o.value
            ))}
          </InlineDropdown>
        )}
      </div>
      )}

      {/* Date — date + time picker */}
      {visibleColumns.date && (
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('dueDate', e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 11, color: isOverdue(dueDate) ? 'var(--danger)' : (dueDate && dueDate !== '—') ? 'var(--text-2)' : 'var(--text-3)', whiteSpace: 'nowrap' }}
        >
          <SFIcon name="calendar" size={10} color={isOverdue(dueDate) ? 'var(--danger)' : 'var(--text-3)'} />
          {(dueDate && dueDate !== '—') ? fmtTaskDate(dueDate, startTime, endTime, endDate) : '—'}
        </button>
        {open === 'dueDate' && (
          <TaskDatePopover
            date={parseYMD(dueDate) ? dueDate : ''}
            endDate={endDate}
            startTime={startTime}
            endTime={endTime}
            onChange={(d, s, e, ed) => {
              setDueDate(d); setEndDate(ed ?? ''); setStartTime(s ?? ''); setEndTime(e ?? '');
              if (rowProjectId) updateTask(rowProjectId, task.id, { dueDate: d, endDate: ed ?? '', startTime: s ?? '', endTime: e ?? '' });
            }}
            onClose={() => setOpen(null)}
            anchorRect={dropRect}
          />
        )}
      </div>
      )}

      {/* Delete button — visible on hover */}
      <button
        onClick={e => { e.stopPropagation(); onDelete?.(); }}
        title="Supprimer la tâche"
        style={{ visibility: hovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
      >
        <SFIcon name="trash-2" size={13} />
      </button>
    </div>
    {ctxPos && (
      <TaskContextMenu
        pos={ctxPos}
        onDelete={() => { onDelete?.(); setCtxPos(null); }}
        onOpen={() => { onSelect(task); setCtxPos(null); }}
        onMove={() => { setCtxPos(null); onMoveRequest?.(task); }}
        onConvert={() => { onConvertRequest(task, ctxPos); setCtxPos(null); }}
        onClose={() => setCtxPos(null)}
      />
    )}
    </>
  );
}

// ── Add task row ───────────────────────────────────────────────────────────────

function AddTaskRow({ projectId, projectName, projectColor, onAdd, onAddMany, autoOpen, visibleColumns }: {
  projectId: string;
  projectName: string;
  projectColor: string;
  onAdd: (task: Task) => void;
  onAddMany: (tasks: Task[]) => void;
  autoOpen?: boolean;
  visibleColumns: VisibleColumns;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(!!autoOpen);
  // Le useState ci-dessus ne capture `autoOpen` qu'au montage, mais la section
  // qui vient d'être créée se monte AVANT que le parent ait pu lever le drapeau
  // (il l'applique dans un effet, donc au rendu suivant) : sans cet effet la
  // ligne restait fermée quelle que soit la temporisation côté parent.
  useEffect(() => { if (autoOpen) setAdding(true); }, [autoOpen]);
  const [title, setTitle] = useState('');
  const [assignees, setAssignees] = useState<User[]>([]);
  const [priority, setPriority] = useState<Priority>('none');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('');
  const [statusLabel, setStatusLabel] = useState('');
  const [openField, setOpenField] = useState<'priority' | 'status' | 'dueDate' | null>(null);
  const [addDropRect, setAddDropRect] = useState<DOMRect | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const openAddDrop = (key: typeof openField, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpenField(prev => prev === key ? null : key);
    setAddDropRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
  };

  const clearFields = () => {
    setTitle(''); setAssignees([]); setPriority('none');
    setDueDate(''); setStatus(''); setStatusLabel('');
    setOpenField(null);
  };

  const cancel = () => {
    clearFields();
    setAdding(false);
  };

  const buildTask = (taskTitle: string): Task => ({
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title: taskTitle,
    projectId, projectName, projectColor,
    assignees,
    status: status as Task['status'],
    statusLabel,
    priority,
    priorityLabel: t(PRIORITY_LABEL_KEY[priority]),
    dueDate: dueDate || '—',
    dueDateRed: false,
    checked: false,
    subtasks: [],
    watchers: addWatchers([], [getCurrentUser()?.id, ...assignees.map(a => a.id)]),
  });

  // Enter: create the task, then stay open with a blank row so the next
  // task can be typed right away (skip a line, like Notion/Asana).
  const commit = () => {
    const t = title.trim();
    if (!t) { cancel(); return; }
    onAdd(buildTask(t));
    clearFields();
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  // Blur (clicking away): create the task if a title was typed, otherwise
  // discard the empty row. Either way the row closes — only Enter keeps it open.
  const commitOnBlur = () => {
    const t = title.trim();
    if (t) onAdd(buildTask(t));
    cancel();
  };

  // Pasting multi-line text (e.g. a checklist copied from an email) creates
  // one task per non-empty line instead of dumping it all in one title.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    onAddMany(lines.map(buildTask));
    clearFields();
    setTimeout(() => titleInputRef.current?.focus(), 0);
  };

  if (!adding) {
    return (
      <button
        onClick={() => setAdding(true)}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          width: '100%', padding: '8px 16px', background: 'transparent',
          border: 'none',
          color: 'var(--text-3)', fontSize: 13, cursor: 'pointer',
          textAlign: 'left', fontFamily: 'var(--ff-text)',
        }}
        onMouseEnter={e => (e.currentTarget.style.color = 'var(--text-2)')}
        onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
      >
        <SFIcon name="plus" size={13}  />
        {t('board.addTask')}
      </button>
    );
  }

  return (
    <div style={{ background: 'rgba(249,255,0,0.03)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: buildGrid(visibleColumns), alignItems: 'center', gap: 12, padding: '8px 16px', minHeight: 44 }}>

        {/* Checkbox placeholder */}
        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--border-2)', flexShrink: 0 }} />

        {/* Title — Enter commits and reopens a blank row, Escape/blur cancels */}
        <input
          ref={titleInputRef}
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') cancel(); }}
          onPaste={handlePaste}
          onBlur={commitOnBlur}
          placeholder="Nom de la tâche..."
          style={{
            width: '100%', padding: '4px 0', background: 'transparent',
            border: 'none', borderBottom: '1px solid var(--accent)',
            color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)',
          }}
        />

        {visibleColumns.activity && <span />}{/* Activité */}

        {/* Assignés */}
        {visibleColumns.assignee && <AssigneeGroup assignees={assignees} showNames onChange={setAssignees} />}

        {/* Priority — custom dropdown */}
        {visibleColumns.priority && (
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openAddDrop('priority', e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(PRIORITY_LABEL_KEY[priority])}</span>
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'priority' && (
            <InlineDropdown onClose={() => setOpenField(null)} anchorRect={addDropRect}>
              {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>,
                priority === p
              ))}
            </InlineDropdown>
          )}
        </div>
        )}

        {/* Status — custom dropdown */}
        {visibleColumns.status && (
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openAddDrop('status', e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {status
              ? <SFPill status={status as Task['status']} small>{t(STATUS_OPTIONS.find(o => o.value === status)?.labelKey ?? 'tasks.noStatus')}</SFPill>
              : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>Aucun</span>
            }
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'status' && (
            <InlineDropdown onClose={() => setOpenField(null)} anchorRect={addDropRect}>
              {STATUS_OPTIONS.map(o => ddItem(() => { setStatus(o.value); setStatusLabel(t(o.labelKey)); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>,
                status === o.value
              ))}
            </InlineDropdown>
          )}
        </div>
        )}

        {/* Date — custom dropdown */}
        {visibleColumns.date && (
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openAddDrop('dueDate', e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            <SFIcon name="calendar" size={10} color="var(--text-3)" />
            {dueDate ? fmtTaskDate(dueDate) : 'Date'}
          </button>
          {openField === 'dueDate' && (
            <TaskDatePopover
              date={parseYMD(dueDate) ? dueDate : ''}
              onChange={(d) => { setDueDate(d); setOpenField(null); }}
              onClose={() => setOpenField(null)}
              anchorRect={addDropRect}
            />
          )}
        </div>
        )}

        {/* Cancel only — X deletes the row */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={cancel}
          style={{ display: 'flex', padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
        >
          <SFIcon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}

// ── Section ────────────────────────────────────────────────────────────────────

function SectionInsertZone({ active, onDrop }: { active: boolean; onDrop: () => void }) {
  const [over, setOver] = useState(false);
  return (
    <div
      onDragOver={e => { if (active) { e.preventDefault(); e.stopPropagation(); setOver(true); } }}
      onDragLeave={() => setOver(false)}
      onDrop={e => { if (active) { e.stopPropagation(); setOver(false); onDrop(); } }}
      style={{
        height: active ? (over ? 36 : 10) : 12,
        display: 'flex', alignItems: 'center', padding: '0 4px',
        transition: 'height 0.12s',
        flexShrink: 0,
      }}
    >
      {active && over && <div style={{ width: '100%', height: 2, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 0 10px var(--accent)' }} />}
    </div>
  );
}

function Section({
  label, tasks, allTasks, completed, selectedTask, onSelectTask, onToggleComplete,
  onDragStart, isDragging, onAddTask, onAddTaskMany, onDelete, onDeleteTask, onMoveSection, onCopySection, onRename,
  projectId, projectName, projectColor, multiSelIds,
  draggedTask, onTaskDragStart, onTaskDrop, onTaskDragEnd, onConvertRequest,
  onMoveTaskRequest,
  autoOpenAddTask,
  visibleColumns,
  readOnlyHeader,
}: {
  label: string;
  tasks: Task[];
  // Tâches non filtrées de la section — sert au compteur/barre de progression,
  // qui ne doit pas varier quand "Tâches terminées" masque des lignes de `tasks`.
  allTasks?: Task[];
  completed: boolean;
  selectedTask: Task | null;
  onSelectTask: (t: Task, e?: React.MouseEvent) => void;
  onToggleComplete: () => void;
  onDragStart: () => void;
  isDragging: boolean;
  onAddTask: (task: Task) => void;
  onAddTaskMany: (tasks: Task[]) => void;
  onDelete: () => void;
  onDeleteTask: (taskId: string) => void;
  onMoveSection: () => void;
  onCopySection: () => void;
  onRename: (newLabel: string) => void;
  projectId: string;
  projectName: string;
  projectColor: string;
  multiSelIds: Set<string>;
  draggedTask: { task: Task; fromSectionLabel: string } | null;
  onTaskDragStart: (task: Task) => void;
  onTaskDragEnd: () => void;
  onTaskDrop: (task: Task, fromSectionLabel: string, toSectionLabel: string, beforeTaskId?: string) => void;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
  onMoveTaskRequest?: (task: Task) => void;
  // Pressing Enter to create a section should land straight on a blank
  // task row ready to type, instead of leaving the user to click "+
  // Ajouter une tâche" themselves right after.
  autoOpenAddTask?: boolean;
  visibleColumns: VisibleColumns;
  // True for the status-grouped pseudo-categories in list view — a fixed
  // status value, not a real, editable section (see TravailBoard.tsx's
  // groupBy for the same distinction on the board).
  readOnlyHeader?: boolean;
}) {
  const { t } = useTranslation();
  const countedTasks = allTasks ?? tasks;
  const done = countedTasks.filter(task => task.checked).length;
  const progress = countedTasks.length > 0 ? (done / countedTasks.length) * 100 : 0;
  const [collapsed, setCollapsed] = usePersistedState<boolean>(`sf_travail_collapsed_${projectId}_${label}`, completed);
  // Replie/déplie automatiquement quand le statut "terminée" change (le repli manuel est préservé tant que `completed` ne change pas).
  const prevCompleted = React.useRef(completed);
  React.useEffect(() => {
    if (prevCompleted.current !== completed) {
      setCollapsed(completed);
      prevCompleted.current = completed;
    }
  }, [completed]);
  const [headerHovered, setHeaderHovered] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const [taskDragOverIdx, setTaskDragOverIdx] = useState<number | null>(null);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const labelInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => { if (editingLabel) labelInputRef.current?.select(); }, [editingLabel]);

  const commitLabel = () => {
    onRename(labelDraft);
    setEditingLabel(false);
  };
  const sectionDragHandleActive = React.useRef(false);

  const isExternalTaskDrag = draggedTask !== null && draggedTask.fromSectionLabel !== label;

  const handleTaskSlotDrop = (insertIdx: number) => {
    if (!draggedTask) return;
    const beforeTask = tasks[insertIdx];
    onTaskDrop(draggedTask.task, draggedTask.fromSectionLabel, label, beforeTask?.id);
    setTaskDragOverIdx(null);
  };

  const dropLeaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  // The visible line stays thin so row spacing never shifts, but the actual
  // drop target is a much taller invisible zone straddling it — dragging
  // precisely onto a 2px line was the exact complaint: reordering between
  // two tasks needs a real margin to aim for, not a pixel-perfect target.
  const DropLine = ({ idx }: { idx: number }) => (
    <div style={{ position: 'relative', height: taskDragOverIdx === idx ? 28 : 2, transition: 'height 0.12s', margin: '0 14px' }}>
      <div
        onDragOver={e => {
          if (!draggedTask) return;
          e.preventDefault(); e.stopPropagation();
          if (dropLeaveTimer.current) { clearTimeout(dropLeaveTimer.current); dropLeaveTimer.current = null; }
          setTaskDragOverIdx(idx);
        }}
        onDragLeave={() => {
          if (!draggedTask) return;
          dropLeaveTimer.current = setTimeout(() => setTaskDragOverIdx(null), 80);
        }}
        onDrop={e => {
          if (!draggedTask) return;
          e.stopPropagation();
          if (dropLeaveTimer.current) { clearTimeout(dropLeaveTimer.current); dropLeaveTimer.current = null; }
          handleTaskSlotDrop(idx);
        }}
        // left/right cancel the parent's 14px margin so the hit-zone reaches
        // the full row width edge-to-edge, not just the inner content area —
        // dropping "in the margin" (outside the visible line) must work too.
        style={{ position: 'absolute', top: -8, bottom: -8, left: -14, right: -14, zIndex: 1 }}
      />
      {taskDragOverIdx === idx && (
        <div style={{ position: 'absolute', top: '50%', transform: 'translateY(-50%)', width: '100%', height: 2, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
      )}
    </div>
  );

  return (
    <div
      data-section-label={label}
      draggable={!readOnlyHeader}
      onDragStart={e => {
        if (readOnlyHeader || !sectionDragHandleActive.current) { e.preventDefault(); return; }
        onDragStart();
      }}
      onDragOver={e => { if (isExternalTaskDrag) e.preventDefault(); }}
      onDrop={e => {
        if (isExternalTaskDrag) {
          e.stopPropagation();
          onTaskDrop(draggedTask!.task, draggedTask!.fromSectionLabel, label);
          setTaskDragOverIdx(null);
        }
      }}
      onDragEnd={() => { sectionDragHandleActive.current = false; }}
      style={{
        background: 'var(--surface)',
        borderRadius: 'var(--radius)',
        border: `1px solid ${isExternalTaskDrag ? 'var(--border-2)' : 'var(--border)'}`,
        overflow: 'hidden',
        opacity: isDragging ? 0.4 : completed ? 0.7 : 1,
        transition: 'border-color 0.15s, opacity 0.2s',
      }}
    >
      <div
        onMouseEnter={() => setHeaderHovered(true)}
        onMouseLeave={() => { setHeaderHovered(false); setConfirmDelete(false); }}
        onContextMenu={e => { if (readOnlyHeader) return; e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: completed ? 'rgba(255,255,255,0.02)' : 'transparent' }}
      >

        {/* Drag handle */}
        {!readOnlyHeader && (
        <div
          onMouseDown={() => { sectionDragHandleActive.current = true; }}
          onMouseUp={() => { sectionDragHandleActive.current = false; }}
          style={{ color: 'var(--border-2)', cursor: 'grab', display: 'flex', flexShrink: 0, paddingRight: 2 }}
          title="Réordonner la section"
        >
          <SFIcon name="grip-vertical" size={14} />
        </div>
        )}

        {/* Collapse toggle */}
        <button
          onClick={() => setCollapsed(v => !v)}
          title={collapsed ? 'Déplier la section' : 'Replier la section'}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', display: 'flex',
            padding: 2, borderRadius: 4, color: 'var(--text-3)', flexShrink: 0,
            transform: collapsed ? 'rotate(0deg)' : 'rotate(90deg)',
            transition: 'transform 0.18s, color 0.12s',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="chevron-right" size={13} />
        </button>

        {/* Complete toggle */}
        {!readOnlyHeader && (
        <button
          onClick={onToggleComplete}
          title={completed ? 'Marquer comme active' : 'Marquer comme terminée'}
          style={{
            width: 17, height: 17, borderRadius: '50%', flexShrink: 0,
            border: completed ? 'none' : '1.5px solid var(--border-2)',
            background: completed ? 'var(--ok)' : 'transparent',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer',
          }}
        >
          {completed && <SFIcon name="check" size={10} color="white" />}
        </button>
        )}

        {!readOnlyHeader && editingLabel ? (
          <input
            ref={labelInputRef}
            value={labelDraft}
            onChange={e => setLabelDraft(e.target.value)}
            onBlur={commitLabel}
            onKeyDown={e => {
              if (e.key === 'Enter') { e.preventDefault(); commitLabel(); }
              if (e.key === 'Escape') { setLabelDraft(label); setEditingLabel(false); }
              e.stopPropagation();
            }}
            onClick={e => e.stopPropagation()}
            style={{
              fontWeight: 600, fontSize: 13, padding: '2px 6px',
              boxSizing: 'content-box',
              width: `${Math.max(2, labelDraft.length + 1)}ch`, maxWidth: 300,
              borderRadius: 6, border: '1px solid var(--accent)',
              background: 'var(--surface-3)', color: 'var(--text)',
              fontFamily: 'var(--ff-text)', outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={readOnlyHeader ? undefined : e => { e.stopPropagation(); setLabelDraft(label); setEditingLabel(true); }}
            style={{
              fontWeight: 600, fontSize: 13, cursor: readOnlyHeader ? 'default' : 'text',
              textDecoration: completed ? 'line-through' : 'none',
              color: completed ? 'var(--text-3)' : 'var(--text)',
            }}>
            {label}
          </span>
        )}

        {completed && (
          <span style={{
            fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--ok)',
            background: 'rgba(0,200,100,0.1)', border: '1px solid rgba(0,200,100,0.2)',
            borderRadius: 5, padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Terminée
          </span>
        )}

        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>({countedTasks.length} tâches)</span>
        <div style={{ flex: 1, maxWidth: 140 }}>
          <SFBar value={completed ? 100 : progress} height={3} />
        </div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{done}/{countedTasks.length}</span>

        {!readOnlyHeader && (
        <>
        {/* Copy section */}
        <button
          onClick={e => { e.stopPropagation(); onCopySection(); }}
          title="Copier la section vers un autre projet"
          style={{ visibility: headerHovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="copy" size={11} />
        </button>

        {/* Move section */}
        <button
          onClick={e => { e.stopPropagation(); onMoveSection(); }}
          title="Déplacer la section vers un autre projet"
          style={{ visibility: headerHovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="move-right" size={11} />
        </button>

        {/* Delete section */}
        <button
          onClick={e => { e.stopPropagation(); if (tasks.length > 0) { setConfirmDelete(true); } else { onDelete(); } }}
          title="Supprimer la section"
          style={{ visibility: headerHovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="trash-2" size={11} />
        </button>
        </>
        )}
      </div>

      {/* Confirmation de suppression — SFModal, comme le reste de l'app : la
          version précédente s'affichait en ligne dans l'en-tête de section,
          seul vestige de cet ancien style. */}
      <SFModal open={confirmDelete} onClose={() => setConfirmDelete(false)} title={t('board.deleteSectionTitle')} width={380}>
        <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.55, marginBottom: 22 }}>
          {t('board.deleteSectionConfirm', { count: tasks.length, section: label })}
        </p>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button
            onClick={() => setConfirmDelete(false)}
            style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          >{t('tasks.cancel')}</button>
          <button
            onClick={() => { setConfirmDelete(false); onDelete(); }}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          >{t('tasks.delete')}</button>
        </div>
      </SFModal>

      {ctxPos && (
        <SectionContextMenu
          pos={ctxPos}
          onRename={() => { setLabelDraft(label); setEditingLabel(true); }}
          onCopy={onCopySection}
          onMove={onMoveSection}
          onDelete={() => { if (tasks.length > 0) setConfirmDelete(true); else onDelete(); }}
          onClose={() => setCtxPos(null)}
        />
      )}

      {!collapsed && (
        <>
          <ColHeader visibleColumns={visibleColumns} />
          <DropLine idx={0} />
          {tasks.map((task, i) => (
            <React.Fragment key={task.id}>
              <TaskRow
                task={task}
                selected={selectedTask?.id === task.id}
                multiSelected={multiSelIds.has(task.id)}
                onSelect={onSelectTask}
                onTaskDragStart={() => onTaskDragStart(task)}
                onTaskDragEnd={onTaskDragEnd}
                onDelete={() => onDeleteTask(task.id)}
                onConvertRequest={onConvertRequest}
                onMoveRequest={onMoveTaskRequest}
                visibleColumns={visibleColumns}
              />
              <DropLine idx={i + 1} />
            </React.Fragment>
          ))}
          {!readOnlyHeader && (
            <AddTaskRow projectId={projectId} projectName={projectName} projectColor={projectColor} onAdd={onAddTask} onAddMany={onAddTaskMany} autoOpen={autoOpenAddTask} visibleColumns={visibleColumns} />
          )}
        </>
      )}
    </div>
  );
}

// ── Resource Preview ───────────────────────────────────────────────────────────

const MOCK_SCRIPT = `INT. STUDIO — JOUR

La caméra s'avance lentement sur une table de montage éclairée par une lumière chaude. Des rushes défilent sur les écrans.

LÉONIE (V.O.)
Chaque image raconte une histoire. Encore faut-il savoir laquelle choisir.

Coupe sur un plan large d'une rue animée. Des gens marchent, indifférents.

LÉONIE (V.O.)
C'est là que notre travail commence — pas dans la salle de montage, mais ici, au cœur du réel.

EXT. RUE SAINT-DENIS — JOUR

Léonie, 30 ans, caméra à l'épaule, observe la foule. Elle cadre, hésite, puis abaisse l'appareil.

LÉONIE
(à elle-même)
Pas encore. Attends le bon moment.

FIN DU PROLOGUE`;


const MOCK_DOCUMENT = `BRIEF CRÉATIF — CAMPAGNE ÉTÉ 2025
Nova Films × Studio Lumière

─────────────────────────────────────────

CONTEXTE
Nova Films souhaite réaliser une campagne vidéo pour son nouveau service de streaming. L'objectif est de toucher une audience urbaine de 25 à 40 ans.

OBJECTIFS
• Augmenter la notoriété du service de 30% d'ici septembre
• Générer 500 000 vues sur les plateformes sociales
• Convertir 5% des spectateurs en abonnés

TONALITÉ
Authentique, moderne, légèrement nostalgique. Pas de voix off surproduisée — on veut quelque chose qui ressemble à de la vraie vie.

LIVRABLES ATTENDUS
1. Spot principal 60 secondes (YouTube / TV)
2. Déclinaisons 15 et 30 secondes (social ads)
3. 6 extraits verticaux 9:16 (Stories / TikTok)
4. Vignettes statiques pour campagne display

CALENDRIER
• Kick-off créatif : 15 avril
• Tournage : 2–4 mai
• Première montage : 20 mai
• Livraison finale : 15 juin

BUDGET
Enveloppe globale : 48 000 € HT
Répartition à définir en session de production.

─────────────────────────────────────────
Document confidentiel — Nova Films 2025`;

const MOODBOARD_COLORS = [
  { c: '#1a2332', label: 'Bleu nuit' },
  { c: '#2d4a3e', label: 'Vert forêt' },
  { c: '#3d2a1e', label: 'Brun chaud' },
  { c: '#4a3d1e', label: 'Ocre doré' },
  { c: '#1e2d4a', label: 'Indigo' },
  { c: '#3d1e2a', label: 'Bordeaux' },
];

export function ResourcePreviewContent({ res }: { res: typeof RESOURCES[0] }) {
  if (res.type === 'video_review') {
    return (
      <div style={{ maxWidth: 900, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 20 }}>
        {/* Video player mock */}
        <div style={{
          width: '100%', aspectRatio: '16/9', background: '#0a0a0a',
          borderRadius: 14, border: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative',
        }}>
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', position: 'relative' }}>
            <div style={{
              background: 'repeating-linear-gradient(135deg,rgba(255,255,255,0.02) 0,rgba(255,255,255,0.02) 2px,transparent 2px,transparent 11px),#0f0f0f',
              position: 'absolute', inset: 0,
            }} />
            <div style={{ position: 'relative', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 60, height: 60, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '2px solid rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer' }}>
                <SFIcon name="play" size={24} color="white" />
              </div>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'rgba(255,255,255,0.4)', letterSpacing: '0.08em' }}>ROUGH CUT V4 · 03:28</span>
            </div>
          </div>
          {/* Timeline */}
          <div style={{ padding: '10px 16px 12px', background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(4px)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'rgba(255,255,255,0.5)', width: 36 }}>00:42</span>
              <div style={{ flex: 1, height: 4, borderRadius: 2, background: 'rgba(255,255,255,0.15)', position: 'relative' }}>
                <div style={{ position: 'absolute', left: 0, top: 0, height: '100%', width: '20%', background: 'var(--accent)', borderRadius: 2 }} />
                <div style={{ position: 'absolute', left: '20%', top: '50%', transform: 'translate(-50%,-50%)', width: 12, height: 12, borderRadius: '50%', background: 'var(--accent)', border: '2px solid white' }} />
              </div>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'rgba(255,255,255,0.5)', width: 36 }}>03:28</span>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', padding: 4, borderRadius: 6 }}><SFIcon name="skip-back" size={14} /></button>
              <button style={{ background: 'var(--accent)', border: 'none', cursor: 'pointer', color: 'var(--on-accent)', display: 'flex', padding: '6px 10px', borderRadius: 8, gap: 6, alignItems: 'center', fontSize: 12, fontWeight: 600 }}>
                <SFIcon name="play" size={12} color="var(--on-accent)" />Lire
              </button>
              <button style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'white', display: 'flex', padding: 4, borderRadius: 6 }}><SFIcon name="skip-forward" size={14} /></button>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'rgba(255,255,255,0.5)', marginLeft: 'auto' }}>HD 1080p</span>
            </div>
          </div>
        </div>

        {/* Comments */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Commentaires ({res.avatars?.length ?? 3})</p>
          {[
            { t: '00:42', text: "L'intro est un peu longue — peut-on couper les 3 premières secondes ?", initials: 'SM', bg: '#3b4f8f', resolved: false },
            { t: '01:15', text: 'Transition au plan 8 est parfaite. Je valide ce segment.', initials: 'TR', bg: '#5c3d8f', resolved: false },
            { t: '02:08', text: 'Son trop fort sur le plan extérieur rue Saint-Denis.', initials: 'MD', bg: '#7d4e57', resolved: true },
          ].map((c, i) => (
            <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 14px', borderRadius: 10, border: `1px solid ${c.resolved ? 'var(--border)' : 'var(--border-2)'}`, background: c.resolved ? 'transparent' : 'var(--surface-2)', opacity: c.resolved ? 0.6 : 1 }}>
              <div style={{ width: 26, height: 26, borderRadius: '50%', background: c.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 10, fontWeight: 700, color: '#fff', flexShrink: 0 }}>{c.initials}</div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 4 }}>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', background: 'rgba(249,255,0,0.1)', padding: '1px 6px', borderRadius: 4 }}>{c.t}</span>
                  {c.resolved && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--ok)', background: 'rgba(0,200,100,0.1)', padding: '1px 6px', borderRadius: 4 }}>Résolu</span>}
                </div>
                <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5 }}>{c.text}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (res.type === 'screenplay' || res.type === 'document') {
    const content = res.type === 'screenplay' ? MOCK_SCRIPT : MOCK_DOCUMENT;
    return (
      <div style={{ maxWidth: 720, margin: '0 auto' }}>
        <div style={{ background: 'var(--surface)', border: '1px solid var(--border)', borderRadius: 14, overflow: 'hidden' }}>
          <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 10, background: 'var(--surface-2)' }}>
            <SFIcon name={TYPE_ICON[res.type]} size={14} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-2)' }}>{res.version ?? 'V1'}</span>
            <span style={{ marginLeft: 'auto', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{res.meta}</span>
          </div>
          <pre style={{
            padding: '28px 36px',
            fontFamily: 'var(--ff-mono)', fontSize: 13, lineHeight: 2,
            color: 'var(--text-2)', whiteSpace: 'pre-wrap', margin: 0,
            overflowWrap: 'break-word',
          }}>
            {content}
          </pre>
        </div>
      </div>
    );
  }

  if (res.type === 'moodboard' || res.type === 'inspirations') {
    const colors = res.colors ?? MOODBOARD_COLORS.map(c => c.c);
    return (
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
          {colors.concat(colors).slice(0, 6).map((c, i) => (
            <div key={i} style={{ aspectRatio: '4/3', borderRadius: 14, background: c, border: '1px solid rgba(255,255,255,0.06)', display: 'flex', alignItems: 'flex-end', padding: 12 }}>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'rgba(255,255,255,0.5)', letterSpacing: '0.08em', textTransform: 'uppercase' }}>{MOODBOARD_COLORS[i % MOODBOARD_COLORS.length]?.label ?? `Référence ${i+1}`}</span>
            </div>
          ))}
        </div>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textAlign: 'center', marginTop: 16 }}>{colors.length} références visuelles · {res.meta}</p>
      </div>
    );
  }

  // file or fallback
  return (
    <div style={{ maxWidth: 480, margin: '0 auto', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 20, textAlign: 'center' }}>
      <div style={{ width: 80, height: 80, borderRadius: 20, background: 'var(--surface)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <SFIcon name={TYPE_ICON[res.type]} size={36} color="var(--text-3)" />
      </div>
      <div>
        <p style={{ fontSize: 16, fontWeight: 600, marginBottom: 6 }}>{res.title}</p>
        <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{res.meta}</p>
      </div>
      {res.webUrl
        ? <div style={{ display: 'flex', gap: 10 }}>
            <SFButton variant="secondary" icon="external-link" onClick={() => window.open(res.webUrl, '_blank', 'noopener,noreferrer')}>Ouvrir dans l'onglet</SFButton>
          </div>
        : <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucun aperçu disponible pour ce type de fichier.</p>}
    </div>
  );
}

export function Travail() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const [, forceProjectsRerender] = useState(0);
  useEffect(() => subscribeProjects(() => forceProjectsRerender(n => n + 1)), []);
  // Real sessions: the project cache is empty until the background Supabase
  // fetch resolves. Falling back to getProjects()[0] used to silently swap
  // in a DIFFERENT project (wrong id in every link/button) until the fetch
  // resolved — this placeholder keeps project.id equal to the URL's
  // projectId instead, so nothing ever points at the wrong project; the
  // subscribeProjects() effect above re-renders with the real project once
  // the fetch completes.
  const project = findProject(projectId ?? '') ?? ({
    id: projectId ?? '', name: '', calendarEnabled: true, filesEnabled: true, financeEnabled: true,
    phase: 'production', phaseLabel: '', progress: 0, taskCount: 0, deliverableCount: 0,
    members: [], deliveryDate: '', status: 'neutral', statusLabel: '', modifiedAt: '',
  } as Project);

  const [autoFocusComments, setAutoFocusComments] = useState(false);
  const [focusCommentId, setFocusCommentId] = useState<string | undefined>();

  // Self-repair for data corrupted by the board's index-vs-label move bug
  // (a task could get copied into a second section instead of moved, so the
  // same id existed twice). A task id is never legitimately in two sections,
  // so keeping the first occurrence is always the right resolution. Returns
  // the input untouched when there's nothing to fix, to avoid re-renders.
  const dedupeTaskIds = (secs: SectionData[]): SectionData[] => {
    const seen = new Set<string>();
    let duplicated = false;
    const cleaned = secs.map(s => {
      const tasks = s.tasks.filter(t => {
        if (seen.has(t.id)) { duplicated = true; return false; }
        seen.add(t.id);
        return true;
      });
      return tasks.length === s.tasks.length ? s : { ...s, tasks };
    });
    return duplicated ? cleaned : secs;
  };

  const getInitialSections = () => {
    const stored = getSections(project.id);
    // Each project shows its own tasks; a project with none starts empty
    // (the "Nouvelle section" affordance lets the user build it out).
    return dedupeTaskIds(stored.length > 0 ? stored : (PROJECT_TASKS[project.id] ?? []));
  };
  const [sections, setSectionsState] = useState<SectionData[]>(getInitialSections);

  // Real sessions: getSections() returns the cache as of THIS render, which
  // is empty until the background Supabase fetch resolves — without this,
  // landing on Tâches straight after login shows nothing until some other
  // navigation remounts the component and re-reads the (by-then-populated)
  // cache. Re-sync whenever the store notifies (fetch completed, or any
  // other write) instead of only reading once at mount.
  useEffect(() => {
    const sync = () => {
      const stored = getSections(project.id);
      setSectionsState(dedupeTaskIds(stored.length > 0 ? stored : (PROJECT_TASKS[project.id] ?? [])));
    };
    // Switching projects (e.g. via a pinned sidebar bookmark) keeps this same
    // component instance mounted with a new `project.id` — without an
    // immediate sync here, `sections` kept showing the PREVIOUS project's
    // tasks until some unrelated store write (or a full remount via another
    // route) happened to refresh it.
    sync();
    return subscribeStore(sync);
  }, [project.id]);

  // Open task panel (+ optionally focus comments) from notification link
  const pendingTaskOpenRef = useRef<{ taskId: string; focusComments: boolean; commentId: string | undefined } | null>(null);

  useEffect(() => {
    const urlTaskId = searchParams.get('openTask') ?? searchParams.get('highlight');
    if (urlTaskId) {
      pendingTaskOpenRef.current = {
        taskId: urlTaskId,
        focusComments: searchParams.get('focus') === 'comments',
        commentId: searchParams.get('commentId') ?? undefined,
      };
      // Clearing the URL changes `searchParams`'s identity, which re-runs this
      // effect via the dependency array below — the pending open request is
      // kept in a ref (not local state) so that re-run still has it, instead
      // of the timer below getting cancelled by its own URL-clearing side effect.
      setSearchParams({}, { replace: true });
    }
    const pending = pendingTaskOpenRef.current;
    if (!pending) return;
    const timer = setTimeout(() => {
      const allTasks = sections.flatMap(s => s.tasks);
      const task = allTasks.find(t => t.id === pending.taskId);
      if (task) {
        pendingTaskOpenRef.current = null;
        markTaskRead(pending.taskId);
        setSelectedTask(task);
        setAutoFocusComments(pending.focusComments);
        setFocusCommentId(pending.commentId);
      } else {
        // Fallback: flash the row if panel can't open
        const el = document.querySelector<HTMLElement>(`[data-task-id="${pending.taskId}"]`);
        if (!el) return;
        // Row not found either — data (e.g. `sections`) likely hasn't loaded
        // yet on a cold load. Leave the ref populated so the next re-run of
        // this effect (triggered once `sections` changes) gets another shot,
        // instead of silently discarding the pending open request.
        pendingTaskOpenRef.current = null;
        markTaskRead(pending.taskId);
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.animation = 'highlight-flash 2s ease forwards';
        el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [searchParams, sections]);

  // L'écriture au store est différée hors de l'updater : la faire dedans est
  // un effet de bord en phase de rendu, que StrictMode double en dev. Le
  // premier appel écrivait au store, dont le notify() re-synchronisait l'état
  // depuis l'intérieur même de l'updater ; la seconde invocation repartait du
  // `prev` d'origine et réappliquait la mutation — d'où des tâches ajoutées
  // en double (même id) à chaque création.
  const pendingStoreWriteRef = useRef<SectionData[] | null>(null);
  useEffect(() => {
    if (pendingStoreWriteRef.current === null) return;
    const next = pendingStoreWriteRef.current;
    pendingStoreWriteRef.current = null;
    setSections_store(project.id, next);
  });

  const setSections = (updater: SectionData[] | ((prev: SectionData[]) => SectionData[])) => {
    setSectionsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      pendingStoreWriteRef.current = next;
      return next;
    });
  };
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());
  const handleConvertRequest = (task: Task, pos: { x: number; y: number }) => {
    const ids = multiSelIds.has(task.id) && multiSelIds.size > 1 ? [...multiSelIds] : [task.id];
    setConvertRequest({ taskIds: ids, pos });
  };
  // Ids visés par le sélecteur de destination. Même règle que
  // handleConvertRequest ci-dessus : la sélection multiple l'emporte quand la
  // tâche visée en fait partie, sinon on ne déplace que celle-là.
  const [moveTaskIds, setMoveTaskIds] = useState<string[] | null>(null);
  const handleMoveTaskRequest = (task: Task) => {
    setMoveTaskIds(multiSelIds.has(task.id) && multiSelIds.size > 1 ? [...multiSelIds] : [task.id]);
  };
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false);
  const [convertRequest, setConvertRequest] = useState<{ taskIds: string[]; pos: { x: number; y: number } } | null>(null);
  // Déplacer/copier des sous-tâches vers un projet+section — TaskPanel
  // demande juste l'action, cet écran choisit la destination puis appelle
  // taskStore.ts (voir le rendu de BulkMoveModal plus bas).
  const [subtaskDest, setSubtaskDest] = useState<{ mode: 'move' | 'copy'; parentTaskId: string; subtaskIds: string[] } | null>(null);
  const [sectionMoveLabel, setSectionMoveLabel] = useState<string | null>(null);
  const [sectionCopyLabel, setSectionCopyLabel] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  // Set right after a section is created via Enter, so its (freshly
  // mounted) AddTaskRow opens straight into "ready to type" instead of
  // leaving the user to click "+ Ajouter une tâche" themselves.
  const [autoOpenSectionLabel, setAutoOpenSectionLabel] = useState<string | null>(null);
  // setSections() writes to taskStore then synchronously notifies
  // subscribers, which re-syncs `sections` from the store from inside this
  // very same setState updater — setting autoOpenSectionLabel directly in
  // handleAddSection races that re-sync and gets silently lost. Stashing
  // the pending label in a ref and applying it once `sections` actually
  // contains it (via effect, after the dust settles) sidesteps the race.
  const pendingAutoOpenLabelRef = useRef<string | null>(null);
  useEffect(() => {
    const pending = pendingAutoOpenLabelRef.current;
    if (pending && sections.some(s => s.label === pending)) {
      setAutoOpenSectionLabel(pending);
      pendingAutoOpenLabelRef.current = null;
      setTimeout(() => setAutoOpenSectionLabel(null), 50);
    }
  }, [sections]);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const pointerYRef = useRef(0);
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [draggedTask, setDraggedTask] = useState<{ task: Task; fromSectionLabel: string } | null>(null);
  const [view, setView] = useSyncedViewState<'list' | 'board'>(`sf_view_travail_${projectId}`, 'list');
  const [boardGroupBy, setBoardGroupBy] = useSyncedViewState<'category' | 'status'>(`sf_board_groupby_${projectId}`, 'category');
  const [viewOpen, setViewOpen] = useState(false);
  const [groupByOpen, setGroupByOpen] = useState(false);
  const [showCompletedSections, setShowCompletedSections] = useSyncedViewState('sf_showCompletedSections', true);
  const [showCompletedTasks, setShowCompletedTasks] = useSyncedViewState('sf_showCompletedTasks', true);
  const [visibleColumns, setVisibleColumns] = useSyncedViewState<VisibleColumns>('sf_travail_columns', DEFAULT_VISIBLE_COLUMNS);
  // Read/written by TaskPanel too (shared across every screen that opens it),
  // not just here — this toggle just gives it a home in the view-filters menu.
  const [showCompletedSubtasks, setShowCompletedSubtasks] = useSyncedViewState('sf_showCompletedSubtasks', true);

  useEffect(() => {
    if (draggedIdx === null && draggedTask === null) return;
    const container = scrollContainerRef.current;
    if (!container) return;
    // Zone généreuse : pendant un glisser la souris est souvent déjà hors du
    // conteneur, donc on accepte aussi les positions au-delà du bord (d'où le
    // ratio non borné) et la vitesse monte avec la proximité — un seuil fixe
    // trop étroit donnait l'impression que l'auto-défilement ne marchait pas.
    const EDGE = 160;
    const MAX_SPEED = 26;
    let frame: number;
    const scroll = () => {
      const { top, bottom } = container.getBoundingClientRect();
      const y = pointerYRef.current;
      if (y < top + EDGE) {
        const ratio = Math.min(1, (top + EDGE - y) / EDGE);
        container.scrollTop -= Math.max(2, MAX_SPEED * ratio);
      } else if (y > bottom - EDGE) {
        const ratio = Math.min(1, (y - (bottom - EDGE)) / EDGE);
        container.scrollTop += Math.max(2, MAX_SPEED * ratio);
      }
      frame = requestAnimationFrame(scroll);
    };
    frame = requestAnimationFrame(scroll);
    return () => cancelAnimationFrame(frame);
  }, [draggedIdx, draggedTask]);

  // Escape — ferme le panneau de détail de tâche. Capture phase, donc si on
  // ne filtre pas les champs en édition (titre de tâche/sous-tâche, libellé
  // de section…), Escape ferme tout le panneau au lieu de laisser le champ
  // annuler sa propre édition — il ne peut jamais recevoir l'événement.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !selectedTask) return;
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      setSelectedTask(null);
      e.stopPropagation();
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedTask]);

  const baseSections = activeSection
    ? sections.filter(s => s.label === activeSection)
    : sections;

  const visibleSections = baseSections
    .filter(s => showCompletedSections || !s.completed)
    .map(s => ({
      ...s,
      tasks: showCompletedTasks ? s.tasks : s.tasks.filter(t => !t.checked),
    }));

  const anchorTaskId = React.useRef<string | null>(null);

  const handleSelectTask = (task: Task, e?: React.MouseEvent) => {
    if (e && e.shiftKey && anchorTaskId.current) {
      // Shift+click → range select between anchor and current
      const orderedIds = visibleSections.flatMap(s => s.tasks.map(t => t.id));
      const aIdx = orderedIds.indexOf(anchorTaskId.current);
      const bIdx = orderedIds.indexOf(task.id);
      if (aIdx !== -1 && bIdx !== -1) {
        const [lo, hi] = aIdx < bIdx ? [aIdx, bIdx] : [bIdx, aIdx];
        setMultiSelIds(new Set(orderedIds.slice(lo, hi + 1)));
        setSelectedTask(null);
        return;
      }
    }
    if (e && (e.ctrlKey || e.metaKey)) {
      setMultiSelIds(prev => {
        const next = new Set(prev);
        next.has(task.id) ? next.delete(task.id) : next.add(task.id);
        return next;
      });
      anchorTaskId.current = task.id;
      setSelectedTask(null);
      return;
    }
    anchorTaskId.current = task.id;
    setMultiSelIds(new Set());
    setSelectedTask(prev => prev?.id === task.id ? null : task);
  };

  // Clicking empty space (not a row/control) clears selection — same
  // target-equality guard as Taches.tsx, so it never fires on bubbled
  // clicks from inside a row or the (separately-scoped) TaskPanel.
  const clearTaskSelection = () => { setMultiSelIds(new Set()); setSelectedTask(null); };
  const onBackgroundClick = (e: React.MouseEvent) => { if (e.target === e.currentTarget) clearTaskSelection(); };

  const handleAddSection = () => {
    const label = newSectionLabel.trim();
    if (!label) return;
    setSections(prev => [...prev, { label, tasks: [] }]);
    setNewSectionLabel('');
    setAddingSection(false);
    pendingAutoOpenLabelRef.current = label;
    // Scroll to the bottom where the new section will appear
    setTimeout(() => {
      const el = document.querySelector(`[data-section-label="${CSS.escape(label)}"]`);
      el?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 60);
  };

  const handleRenameSection = (idx: number, newLabel: string) => {
    const trimmed = newLabel.trim();
    if (!trimmed || trimmed === sections[idx]?.label) return;
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, label: trimmed } : s));
  };

  const handleToggleComplete = (idx: number) => {
    const wasCompleted = sections[idx]?.completed;
    const label = sections[idx]?.label;
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s));
    if (!wasCompleted && label) {
      showToast({
        type: 'section',
        message: `Section « ${label} » terminée !`,
        subMessage: 'Excellent travail, continuez comme ça !',
        onUndo: () => setSections(prev => prev.map((s, i) => i === idx ? { ...s, completed: false } : s)),
      });
    }
  };

  const handleDeleteSection = (idx: number) => {
    const label = sections[idx]?.label;
    setSections(prev => prev.filter((_, i) => i !== idx));
    if (activeSection === label) setActiveSection(null);
  };

  const handleDragStart = (idx: number) => setDraggedIdx(idx);

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo/redo — scoped to task additions,
  // so pasting a big checklist and changing your mind doesn't mean deleting
  // every row by hand. Each entry covers one "add" action (a single Enter,
  // or one whole paste), so undoing a 15-line paste removes all 15 at once.
  type AddUndoEntry = { sectionIdx: number; taskIds: string[]; tasks: Task[] };
  const undoStackRef = useRef<AddUndoEntry[]>([]);
  const redoStackRef = useRef<AddUndoEntry[]>([]);

  const removeTasksFromSection = (sectionIdx: number, taskIds: string[]) => {
    setSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, tasks: s.tasks.filter(t => !taskIds.includes(t.id)) } : s
    ));
  };

  const insertTasksIntoSection = (sectionIdx: number, tasks: Task[]) => {
    setSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, tasks: [...s.tasks, ...tasks] } : s
    ));
  };

  const handleAddTask = (sectionIdx: number, task: Task) => {
    insertTasksIntoSection(sectionIdx, [task]);
    undoStackRef.current.push({ sectionIdx, taskIds: [task.id], tasks: [task] });
    redoStackRef.current = [];
  };

  const handleAddTasks = (sectionIdx: number, tasks: Task[]) => {
    if (!tasks.length) return;
    insertTasksIntoSection(sectionIdx, tasks);
    undoStackRef.current.push({ sectionIdx, taskIds: tasks.map(t => t.id), tasks });
    redoStackRef.current = [];
    showToast({
      type: 'section',
      message: `${tasks.length} tâches créées`,
      subMessage: 'Collées depuis le presse-papiers',
      onUndo: () => undoLastAdd(),
    });
  };

  const undoLastAdd = () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    removeTasksFromSection(entry.sectionIdx, entry.taskIds);
    redoStackRef.current.push(entry);
  };

  const redoLastAdd = () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    insertTasksIntoSection(entry.sectionIdx, entry.tasks);
    undoStackRef.current.push(entry);
  };

  // Ignore the shortcut while typing (Ctrl+Z should undo text edits in a
  // field, not the task list) — mirrors the global-shortcut guard pattern
  // used in AppShell.
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      const target = e.target as HTMLElement;
      const inTextField = target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable;
      if (inTextField) return;
      const key = e.key.toLowerCase();
      if (key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undoLastAdd();
      } else if (key === 'y' || (key === 'z' && e.shiftKey)) {
        e.preventDefault();
        redoLastAdd();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleTaskDragStart = (task: Task, sectionLabel: string) => {
    setDraggedTask({ task, fromSectionLabel: sectionLabel });
  };

  const handleTaskDrop = (task: Task, fromSectionLabel: string, toSectionLabel: string, beforeTaskId?: string) => {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, tasks: [...s.tasks] }));
      const fromIdx = next.findIndex(s => s.label === fromSectionLabel);
      const toIdx = next.findIndex(s => s.label === toSectionLabel);
      if (fromIdx < 0 || toIdx < 0) return prev;
      next[fromIdx].tasks = next[fromIdx].tasks.filter(t => t.id !== task.id);
      if (beforeTaskId) {
        const insertAt = next[toIdx].tasks.findIndex(t => t.id === beforeTaskId);
        if (insertAt >= 0) next[toIdx].tasks.splice(insertAt, 0, task);
        else next[toIdx].tasks.push(task);
      } else {
        next[toIdx].tasks.push(task);
      }
      return next;
    });
    setDraggedTask(null);
  };

  const handleSectionInsertAt = (beforeVisibleIdx: number) => {
    if (draggedIdx === null) return;
    setSections(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedIdx, 1);
      let insertAt: number;
      if (beforeVisibleIdx >= visibleSections.length) {
        insertAt = next.length;
      } else {
        const targetLabel = visibleSections[beforeVisibleIdx].label;
        insertAt = next.findIndex(s => s.label === targetLabel);
        if (insertAt < 0) insertAt = next.length;
      }
      next.splice(insertAt, 0, moved);
      return next;
    });
    setDraggedIdx(null);
  };

  const boardSections: SectionData[] = boardGroupBy === 'category'
    ? visibleSections
    : (() => {
        // Tag each task with its real category for the card's status-mode
        // label — task.sectionLabel is a different, unrelated field (used
        // only by "Mes tâches"), so it's never populated here otherwise.
        const taggedTasks = visibleSections.flatMap(s => s.tasks.map(task => ({ ...task, sectionLabel: s.label })));
        return STATUS_OPTIONS.map(opt => ({
          label: t(opt.labelKey),
          tasks: taggedTasks.filter(task => opt.value === '' ? !task.status : task.status === opt.value),
          completed: false,
        }));
      })();

  // Column (section) reorder in the board — mirrors handleSectionInsertAt's
  // splice-before-label logic, but by label instead of visible index since
  // the board's own drop-line only knows the label it's hovering over.
  const reorderBoardSection = (fromLabel: string, beforeLabel: string | null) => {
    setSections(prev => {
      const next = [...prev];
      const fromIdx = next.findIndex(s => s.label === fromLabel);
      if (fromIdx === -1) return prev;
      const [moved] = next.splice(fromIdx, 1);
      const insertAt = beforeLabel ? next.findIndex(s => s.label === beforeLabel) : -1;
      next.splice(insertAt === -1 ? next.length : insertAt, 0, moved);
      return next;
    });
  };

  const handleBoardMoveTask = (task: Task, fromIdx: number, toIdx: number, beforeTaskId?: string) => {
    if (boardGroupBy === 'category') {
      // The board's column indexes are indexes into boardSections — i.e. the
      // FILTERED list (activeSection / "Sections terminées"). Applying them
      // straight to the unfiltered `sections` array silently moved tasks into
      // whichever section happened to sit at that index, duplicating them and
      // sometimes dropping them into a hidden category (where they looked
      // deleted). Resolve to labels here and let the label-based handler find
      // the real sections.
      const fromLabel = boardSections[fromIdx]?.label;
      const toLabel = boardSections[toIdx]?.label;
      if (!fromLabel || !toLabel) return;
      handleTaskDrop(task, fromLabel, toLabel, beforeTaskId);
      return;
    }
    const targetStatus = STATUS_OPTIONS[toIdx];
    if (!targetStatus) return;
    const patch: Partial<Task> = {
      status: targetStatus.value as Task['status'],
      statusLabel: targetStatus.value ? t(targetStatus.labelKey) : '',
      checked: targetStatus.value === 'ok',
    };
    updateTask(projectId!, task.id, patch);
    setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.map(t => t.id === task.id ? { ...t, ...patch } : t) })));
    if (selectedTask?.id === task.id) setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
  };

  // Same status-patch logic as handleBoardMoveTask, but list-view status
  // groups are keyed by label (Section's onTaskDrop signature), not index.
  const handleListStatusTaskDrop = (task: Task, _fromLabel: string, toLabel: string) => {
    const targetStatus = STATUS_OPTIONS.find(o => t(o.labelKey) === toLabel);
    if (!targetStatus) return;
    const patch: Partial<Task> = {
      status: targetStatus.value as Task['status'],
      statusLabel: targetStatus.value ? t(targetStatus.labelKey) : '',
      checked: targetStatus.value === 'ok',
    };
    updateTask(projectId!, task.id, patch);
    setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.map(tk => tk.id === task.id ? { ...tk, ...patch } : tk) })));
    if (selectedTask?.id === task.id) setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
    setDraggedTask(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Headers wrapper */}
      <div style={{ flexShrink: 0 }}>
      <ProjectHeaderBar projectId={project.id}>
        {/* View switcher */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
          {([
            { key: 'list',     icon: 'list',          label: t('board.viewList')  },
            { key: 'board',    icon: 'layout-kanban', label: t('board.viewBoard') },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setView(v.key)} title={v.label}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: view === v.key ? 'var(--surface)' : 'transparent', color: view === v.key ? 'var(--text)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: view === v.key ? 600 : 400, transition: 'all 0.1s', boxShadow: view === v.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}
            >
              <SFIcon name={v.icon} size={13} color={view === v.key ? 'var(--text)' : 'var(--text-3)'} />
              {v.label}
            </button>
          ))}
        </div>
        {/* Group-by dropdown — same interaction pattern as the "Vue" dropdown below */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setGroupByOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border-2)', background: groupByOpen ? 'var(--surface-3)' : 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', fontWeight: 500 }}
          >
            <SFIcon name={boardGroupBy === 'category' ? 'folder' : 'flag'} size={13} />
            {boardGroupBy === 'category' ? t('board.groupByCategory') : t('board.groupByStatus')}
            <SFIcon name="chevron-down" size={11} color="var(--text-3)" />
          </button>
          {groupByOpen && (
            <>
              <div onClick={() => setGroupByOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '6px', minWidth: 190, boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>{t('board.groupByLabel')}</p>
                {([
                  { key: 'category', icon: 'folder', label: t('board.groupByCategory') },
                  { key: 'status',   icon: 'flag',   label: t('board.groupByStatus')   },
                ] as const).map(g => (
                  <button key={g.key} onClick={() => { setBoardGroupBy(g.key); setGroupByOpen(false); }}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '9px 10px', borderRadius: 9, border: 'none', background: boardGroupBy === g.key ? 'color-mix(in srgb, var(--accent) 10%, var(--surface-3))' : 'transparent', color: boardGroupBy === g.key ? 'var(--accent)' : 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => { if (boardGroupBy !== g.key) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                    onMouseLeave={e => { if (boardGroupBy !== g.key) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                  >
                    <SFIcon name={g.icon} size={13} color={boardGroupBy === g.key ? 'var(--accent)' : 'var(--text-3)'} />
                    {g.label}
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
        {/* View settings */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setViewOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border-2)', background: viewOpen ? 'var(--surface-3)' : 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', fontWeight: 500 }}
          >
            <SFIcon name="sliders-horizontal" size={13} />
            {t('board.viewSettings')}
            <SFIcon name="chevron-down" size={11} color="var(--text-3)" />
          </button>
          {viewOpen && (
            <>
              <div onClick={() => setViewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '6px', minWidth: 240, boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>{t('board.viewFilters')}</p>
                {[
                  { label: t('board.completedSections'),    key: 'sf_showCompletedSections', value: showCompletedSections, set: setShowCompletedSections },
                  { label: t('board.completedTasksToggle'), key: 'sf_showCompletedTasks',    value: showCompletedTasks,    set: setShowCompletedTasks },
                  { label: t('board.completedSubtasksToggle'), key: 'sf_showCompletedSubtasks', value: showCompletedSubtasks, set: setShowCompletedSubtasks },
                ].map(opt => (
                  <button key={opt.key} onClick={() => opt.set(!opt.value)}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                  >
                    <span>{opt.label}</span>
                    <div style={{ width: 36, height: 20, borderRadius: 999, flexShrink: 0, background: opt.value ? 'var(--accent)' : 'var(--surface-3)', position: 'relative', transition: 'background 0.15s' }}>
                      <div style={{ position: 'absolute', top: 3, left: opt.value ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: opt.value ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
                    </div>
                  </button>
                ))}
                {view === 'list' && (
                  <>
                    <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>{t('board.columnsLabel')}</p>
                    {([
                      { key: 'status',   label: t('board.columnStatus')   },
                      { key: 'priority', label: t('board.columnPriority') },
                      { key: 'assignee', label: t('board.columnAssignee') },
                      { key: 'activity', label: t('board.columnActivity') },
                      { key: 'date',     label: t('board.columnDate')     },
                    ] as const).map(col => (
                      <button key={col.key} onClick={() => setVisibleColumns(prev => ({ ...prev, [col.key]: !prev[col.key] }))}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', padding: '9px 10px', borderRadius: 9, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                        onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      >
                        <span>{col.label}</span>
                        <div style={{ width: 36, height: 20, borderRadius: 999, flexShrink: 0, background: visibleColumns[col.key] ? 'var(--accent)' : 'var(--surface-3)', position: 'relative', transition: 'background 0.15s' }}>
                          <div style={{ position: 'absolute', top: 3, left: visibleColumns[col.key] ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: visibleColumns[col.key] ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
                        </div>
                      </button>
                    ))}
                  </>
                )}
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', padding: '4px 10px 2px', letterSpacing: '0.06em' }}>{t('board.prefsAutoSaved')}</p>
              </div>
            </>
          )}
        </div>
      </ProjectHeaderBar>

      {/* Section nav bar — only in list view, category mode (irrelevant once grouped by status) */}
      {view === 'list' && boardGroupBy === 'category' && <div style={{ padding: '8px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
        <button
          onClick={() => setActiveSection(null)}
          style={{
            padding: '5px 12px', borderRadius: 9, border: 'none', cursor: 'pointer',
            background: activeSection === null ? 'var(--accent)' : 'var(--surface-2)',
            color: activeSection === null ? 'var(--on-accent)' : 'var(--text-3)',
            fontFamily: 'var(--ff-mono)', fontSize: 10,
            letterSpacing: '0.06em', textTransform: 'uppercase',
            fontWeight: activeSection === null ? 700 : 400,
            whiteSpace: 'nowrap', flexShrink: 0,
          }}
        >
          Tout
        </button>
        {sections.map(s => {
          const isActive = activeSection === s.label;
          return (
            <button
              key={s.label}
              onClick={() => setActiveSection(prev => prev === s.label ? null : s.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '5px 12px', borderRadius: 9, cursor: 'pointer', whiteSpace: 'nowrap', flexShrink: 0,
                fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.06em', textTransform: 'uppercase',
                fontWeight: isActive ? 700 : 400,
                background: isActive ? 'var(--accent)' : s.completed ? 'rgba(0,200,100,0.08)' : 'var(--surface-2)',
                color: isActive ? 'var(--on-accent)' : s.completed ? 'var(--ok)' : 'var(--text-3)',
                border: s.completed && !isActive ? '1px solid rgba(0,200,100,0.2)' : '1px solid transparent',
              }}
            >
              {s.completed && <SFIcon name="check" size={10} color={isActive ? 'var(--on-accent)' : 'var(--ok)'} />}
              {s.label}
            </button>
          );
        })}
      </div>}
      </div>

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Board view */}
      {view === 'board' && (
        <TravailBoard
          sections={boardSections}
          groupBy={boardGroupBy}
          selectedTask={selectedTask}
          multiSelIds={multiSelIds}
          onConvertRequest={handleConvertRequest}
          onSelectTask={handleSelectTask}
          onClearSelection={clearTaskSelection}
          onUpdateTask={(taskId, patch) => {
            updateTask(projectId!, taskId, patch);
            setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) })));
            if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
          }}
          onToggleSectionComplete={label => setSections(prev => prev.map(s => s.label === label ? { ...s, completed: !s.completed } : s))}
          onAddTask={handleAddTask}
          onMoveTask={handleBoardMoveTask}
          onAddSection={label => setSections(prev => [...prev, { label, tasks: [] }])}
          onDeleteTask={task => setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== task.id) })))}
          onDeleteSection={label => setSections(prev => prev.filter(s => s.label !== label))}
          onRenameSection={(oldLabel, newLabel) => setSections(prev => prev.map(s => s.label === oldLabel ? { ...s, label: newLabel.trim() || s.label } : s))}
          onMoveSection={label => setSectionMoveLabel(label)}
          onCopySection={label => setSectionCopyLabel(label)}
          onReorderSection={reorderBoardSection}
          projectId={project.id}
          projectName={project.name}
          projectColor={project.clientColor ?? 'var(--text-3)'}
        />
      )}

      {/* List view */}
      {/* onDragOver, pas onPointerMove : pendant un glisser HTML5 natif le
          navigateur ne émet plus d'événements pointeur/souris — seuls les
          événements de glisser portent la position du curseur. */}
      {view === 'list' && <div ref={scrollContainerRef} onDragOver={e => { pointerYRef.current = e.clientY; }} onDragEnd={() => { setDraggedTask(null); setDraggedIdx(null); }} onClick={onBackgroundClick} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}><div onClick={onBackgroundClick} style={{ minWidth: 900 }}>
        {boardGroupBy === 'category' && <SectionInsertZone active={draggedIdx !== null} onDrop={() => handleSectionInsertAt(0)} />}
        {(boardGroupBy === 'category' ? visibleSections : boardSections).map((section, vIdx) => {
          const globalIdx = boardGroupBy === 'category' ? sections.findIndex(s => s.label === section.label) : -1;
          return (
            <React.Fragment key={section.label + vIdx}>
              <Section
                label={section.label}
                tasks={section.tasks}
                allTasks={boardGroupBy === 'category' ? sections[globalIdx]?.tasks : section.tasks}
                completed={!!section.completed}
                selectedTask={selectedTask}
                onSelectTask={handleSelectTask}
                onToggleComplete={() => handleToggleComplete(globalIdx)}
                onDragStart={() => handleDragStart(globalIdx)}
                isDragging={draggedIdx === globalIdx}
                onAddTask={task => handleAddTask(globalIdx, task)}
                onAddTaskMany={tasks => handleAddTasks(globalIdx, tasks)}
                onDelete={() => handleDeleteSection(globalIdx)}
                onRename={newLabel => handleRenameSection(globalIdx, newLabel)}
                onDeleteTask={taskId => setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== taskId) })))}
                projectId={project.id}
                projectName={project.name}
                projectColor={project.clientColor ?? 'var(--text-3)'}
                draggedTask={draggedTask}
                onTaskDragStart={task => handleTaskDragStart(task, section.label)}
                onTaskDragEnd={() => setDraggedTask(null)}
                onTaskDrop={boardGroupBy === 'category' ? handleTaskDrop : handleListStatusTaskDrop}
                onMoveSection={() => setSectionMoveLabel(section.label)}
                onCopySection={() => setSectionCopyLabel(section.label)}
                multiSelIds={multiSelIds}
                onConvertRequest={handleConvertRequest}
                onMoveTaskRequest={handleMoveTaskRequest}
                autoOpenAddTask={section.label === autoOpenSectionLabel}
                visibleColumns={visibleColumns}
                readOnlyHeader={boardGroupBy === 'status'}
              />
              {boardGroupBy === 'category' && <SectionInsertZone active={draggedIdx !== null} onDrop={() => handleSectionInsertAt(vIdx + 1)} />}
            </React.Fragment>
          );
        })}

        {/* Nouvelle section — inline input */}
        {boardGroupBy === 'category' && (addingSection ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              autoFocus
              value={newSectionLabel}
              onChange={e => setNewSectionLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setAddingSection(false); setNewSectionLabel(''); } }}
              placeholder="Nom de la section..."
              style={{
                flex: 1,
                padding: '9px 12px',
                borderRadius: 'var(--radius)',
                border: '1px solid var(--accent)',
                background: 'var(--surface)',
                color: 'var(--text)',
                fontSize: 13,
                fontWeight: 600,
                fontFamily: 'var(--ff-text)',
                outline: 'none',
              }}
            />
            <SFButton variant="primary" size="sm" onClick={handleAddSection}>Ajouter</SFButton>
            <SFButton variant="ghost" size="sm" onClick={() => { setAddingSection(false); setNewSectionLabel(''); }}>Annuler</SFButton>
          </div>
        ) : (
          <button
            onClick={() => setAddingSection(true)}
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '10px 16px',
              borderRadius: 'var(--radius)',
              border: '1px dashed var(--border-2)',
              background: 'transparent',
              color: 'var(--text-3)',
              fontSize: 13,
              cursor: 'pointer',
              fontFamily: 'var(--ff-text)',
            }}
          >
            <SFIcon name="plus" size={14} />
            {t('board.newSection')}
          </button>
        ))}
      </div></div>}

      </div>
      </div>{/* end left column */}

      {/* Floating task panel — self-positions via position: fixed, no reserved layout column */}
      {selectedTask && (
          <TaskPanel
            key={selectedTask.id}
            task={selectedTask}
            sectionLabel={sections.find(s => s.tasks.some(t => t.id === selectedTask.id))?.label}
            autoFocusComments={autoFocusComments}
            focusCommentId={focusCommentId}
            onClose={() => { setSelectedTask(null); setAutoFocusComments(false); setFocusCommentId(undefined); }}
            onUpdate={patch => {
              updateTask(projectId!, selectedTask.id, patch);
              setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
            }}
            onMove={(newProjectId, newSectionLabel) => {
              moveTask(projectId!, selectedTask.id, newProjectId, newSectionLabel);
              setSelectedTask(null);
            }}
            onConvertSubtasks={subtaskIds => {
              convertSubtasksToTasks(projectId!, selectedTask.id, subtaskIds);
              setSelectedTask(prev => prev ? { ...prev, subtasks: (prev.subtasks ?? []).filter(s => !subtaskIds.includes(s.id)) } : prev);
            }}
            onMoveSubtasksAsTask={subtaskIds => setSubtaskDest({ mode: 'move', parentTaskId: selectedTask.id, subtaskIds })}
            onCopySubtasksAsTask={subtaskIds => setSubtaskDest({ mode: 'copy', parentTaskId: selectedTask.id, subtaskIds })}
          />
      )}

      {/* Multi-select floating action bar */}
      {multiSelIds.size > 0 && createPortal(
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.55)', zIndex: 400 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>{t('board.selectedTasksCount', { count: multiSelIds.size })}</span>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <button onClick={() => setMoveTaskIds([...multiSelIds])} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="move-right" size={13} />
            {t('board.move')}
          </button>
          <button onClick={() => setBulkCopyOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="copy" size={13} />
            {t('board.copy')}
          </button>
          <button onClick={e => setConvertRequest({ taskIds: [...multiSelIds], pos: (() => { const r = e.currentTarget.getBoundingClientRect(); return { x: r.left, y: r.top }; })() })} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="git-branch" size={13} />
            {t('board.convertToSubtask')}
          </button>
          <button onClick={() => {
            const ids = [...multiSelIds];
            setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.filter(t => !ids.includes(t.id)) })));
            setMultiSelIds(new Set());
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', cursor: 'pointer', color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="trash-2" size={13} />
            {t('tasks.delete')}
          </button>
          <button onClick={() => setMultiSelIds(new Set())} style={{ display: 'flex', alignItems: 'center', padding: '4px', borderRadius: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <SFIcon name="x" size={14} />
          </button>
        </div>,
        document.body,
      )}

      {/* Déplacement — une tâche seule ou la sélection. Le projet courant est
          pré-sélectionné : ses sections sont donc listées d'emblée, et changer
          de projet reste à un clic. */}
      {moveTaskIds && (
        <BulkMoveModal
          title={t('board.moveTasksTitle', { count: moveTaskIds.length })}
          mode="move"
          defaultProjectId={project.id}
          onMove={(toProjectId, toSectionLabel) => {
            // moveTasks() already writes the store; the subscribeStore sync
            // effect above picks up the change. Re-reading and re-writing
            // sections here raced the async Supabase write and could clobber
            // it back to the pre-move snapshot (same bug as the convert-to-
            // subtask picker below).
            moveTasks(project.id, moveTaskIds, toProjectId, toSectionLabel);
            setMultiSelIds(new Set());
          }}
          onClose={() => setMoveTaskIds(null)}
        />
      )}

      {/* Bulk copy tasks modal */}
      {bulkCopyOpen && (
        <BulkMoveModal
          title={t('board.copyTasksTitle', { count: multiSelIds.size })}
          mode="copy"
          onMove={(toProjectId, toSectionLabel) => {
            copyTasks([...multiSelIds], project.id, toProjectId, toSectionLabel);
            setMultiSelIds(new Set());
          }}
          onClose={() => setBulkCopyOpen(false)}
        />
      )}

      {/* Déplacer/copier des sous-tâches promues en tâches vers un projet+section */}
      {subtaskDest && (
        <BulkMoveModal
          title={t(subtaskDest.mode === 'copy' ? 'board.copyTasksTitle' : 'board.moveTasksTitle', { count: subtaskDest.subtaskIds.length })}
          mode={subtaskDest.mode}
          onMove={(toProjectId, toSectionLabel) => {
            if (subtaskDest.mode === 'move') {
              convertSubtasksToTasks(project.id, subtaskDest.parentTaskId, subtaskDest.subtaskIds, { projectId: toProjectId, sectionLabel: toSectionLabel });
              setSelectedTask(prev => prev && prev.id === subtaskDest.parentTaskId
                ? { ...prev, subtasks: (prev.subtasks ?? []).filter(s => !subtaskDest.subtaskIds.includes(s.id)) }
                : prev);
            } else {
              copySubtasksAsTasks(project.id, subtaskDest.parentTaskId, subtaskDest.subtaskIds, toProjectId, toSectionLabel);
            }
            setSubtaskDest(null);
          }}
          onClose={() => setSubtaskDest(null)}
        />
      )}

      {/* Convert to subtask picker */}
      {convertRequest && (
        <SubtaskTargetPicker
          pos={convertRequest.pos}
          candidates={sections.flatMap(s => s.tasks).filter(t => !convertRequest.taskIds.includes(t.id))}
          onPick={targetId => {
            // convertTasksToSubtasks() already writes the store; don't
            // re-read+re-write sections here — see note on the bulk-move
            // handler above for why that clobbers the async write.
            convertTasksToSubtasks(project.id, convertRequest.taskIds, targetId);
            setMultiSelIds(new Set());
            setConvertRequest(null);
          }}
          onClose={() => setConvertRequest(null)}
        />
      )}

      {/* Move section modal */}
      {sectionMoveLabel && (
        <SectionMoveModal
          sectionLabel={sectionMoveLabel}
          onMove={toProjectId => {
            // moveSection() already writes the store — see note above.
            moveSection(project.id, sectionMoveLabel, toProjectId);
            setSectionMoveLabel(null);
          }}
          onClose={() => setSectionMoveLabel(null)}
        />
      )}

      {/* Copy section modal */}
      {sectionCopyLabel && (
        <SectionMoveModal
          sectionLabel={sectionCopyLabel}
          mode="copy"
          onMove={toProjectId => {
            copySection(project.id, sectionCopyLabel, toProjectId);
            setSectionCopyLabel(null);
          }}
          onClose={() => setSectionCopyLabel(null)}
        />
      )}
    </div>
  );
}
