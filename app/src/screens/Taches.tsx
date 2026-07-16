import React, { useState, useRef, useCallback, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFAvatar, SFIcon, TaskDatePopover, DatePickerDropdown, parseYMD, fmtTaskDate, formatDisplay, isOverdue } from '../components/ui';
import { PROJECTS, USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import { getMyTasks, updateMyTask, addMyTask, removeMyTask, subscribeMyTasks, getMyTaskSections, addMyTaskSection, removeMyTaskSection, renameMyTaskSection, isAssignedTask, convertMyTaskToSubtask } from '../data/myTaskStore';
import { SubtaskTargetPicker } from '../components/SubtaskTargetPicker';
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers } from '../data/teamStore';
import { getSections, moveTasks, copyTasks } from '../data/taskStore';
import { getProjects, subscribeProjects } from '../data/projectStore';
import type { Task, Priority, User } from '../types';
import { TaskPanel } from '../components/TaskPanel';
import { showToast } from '../data/toastStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { useSyncedViewState } from '../hooks/useSyncedViewState';

// �"?�"? Constants �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

// cb | titre | sous-tâches | activité | projet | assigné(avatar) | priorité | statut | échéance | more
const GRID = '28px 1fr 80px 65px 140px 36px 75px 95px 85px 24px 28px';
// Quand le panneau de détail est ouvert, ces infos sont déjà visibles à
// droite — les cacher dans la liste centrale libère toute la largeur pour
// lire le titre en entier (checkbox + titre + suppression seulement).
const GRID_COMPACT = '28px 1fr 24px';

type Filter = 'today' | 'week' | 'late' | 'all';
type SortCol = 'title' | 'priority' | 'status' | 'dueDate';
type SortDir = 'asc' | 'desc';

const PRIORITY_LABEL_KEY: Record<Priority, string> = { high: 'priority.high', normal: 'priority.medium', low: 'priority.low', none: 'priority.none' };
const PRIORITY_COLOR: Record<Priority, string> = { high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)' };
const PRIORITY_OPTIONS: Priority[] = ['high', 'normal', 'low', 'none'];
const PRIORITY_ORDER: Priority[] = ['high', 'normal', 'low', 'none'];


const FILTERS: { key: Filter; labelKey: string }[] = [
  { key: 'all',   labelKey: 'tasks.filterAll' },
  { key: 'today', labelKey: 'tasks.filterToday' },
  { key: 'week',  labelKey: 'tasks.filterThisWeek' },
  { key: 'late',  labelKey: 'tasks.filterOverdue' },
];

function filterTasks(tasks: Task[], filter: Filter): Task[] {
  switch (filter) {
    case 'today': return tasks.filter(t => t.dueDate === "Aujourd'hui");
    case 'late':  return tasks.filter(t => isOverdue(t.dueDate ?? '') || t.status === 'danger');
    case 'week':  return tasks.filter(t => !t.checked && t.dueDate !== 'Hier');
    default:      return tasks;
  }
}

function dueDateSortKey(date: string): number {
  if (date === 'Hier') return -1;
  if (date === "Aujourd'hui") return 0;
  if (date === 'Demain') return 1;
  if (!date || date === '—') return 9999;
  const m = date.match(/Dans (\d+)/i);
  if (m) return parseInt(m[1]);
  return 100;
}

const PRIORITY_SORT_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2, none: 3 };
const STATUS_SORT_ORDER: Record<string, number> = { danger: 0, warn: 1, review: 2, info: 3, ok: 4 };

function sortTasks(tasks: Task[], col: SortCol, dir: SortDir): Task[] {
  const sign = dir === 'asc' ? 1 : -1;
  return [...tasks].sort((a, b) => {
    let v = 0;
    if (col === 'title')    v = a.title.localeCompare(b.title, 'fr');
    if (col === 'priority') v = PRIORITY_SORT_ORDER[a.priority] - PRIORITY_SORT_ORDER[b.priority];
    if (col === 'status')   v = (STATUS_SORT_ORDER[a.status] ?? 9) - (STATUS_SORT_ORDER[b.status] ?? 9);
    if (col === 'dueDate')  v = dueDateSortKey(a.dueDate) - dueDateSortKey(b.dueDate);
    return v * sign;
  });
}

// �"?�"? Col header �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

function ColHeader({ sort, onSort, compact }: { sort: { col: SortCol | null; dir: SortDir }; onSort: (col: SortCol) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const plain = (label: string) => (
    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
      {label}
    </span>
  );
  const sortable = (label: string, col: SortCol) => {
    const active = sort.col === col;
    return (
      <button onClick={() => onSort(col)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--ff-mono)', fontSize: 9, color: active ? 'var(--text)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: active ? 700 : 400 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3, color: active ? 'var(--accent)' : 'var(--text-3)', fontSize: 10, lineHeight: 1 }}>
          {active && sort.dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    );
  };
  if (compact) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COMPACT, alignItems: 'center', gap: 12, padding: '0 16px 6px', borderBottom: '1px solid var(--border)' }}>
        <span />
        {sortable(t('tasks.task'), 'title')}
        <span />
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '0 16px 6px', borderBottom: '1px solid var(--border)' }}>
      <span />
      {sortable(t('tasks.task'), 'title')}
      {plain(t('tasks.subtasks'))}
      {plain(t('tasks.activity'))}
      {plain(t('tasks.project'))}
      {plain(t('tasks.assigned'))}
      {sortable(t('tasks.priority'), 'priority')}
      {sortable(t('tasks.status'), 'status')}
      {sortable(t('tasks.date'), 'dueDate')}
      <span />
    </div>
  );
}

// �"?�"? Shared helpers �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS);
  const team = getTeamMembers();
  if (team.length > 0) return team;
  const authUser = getCurrentUser();
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}

const STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '',       labelKey: 'tasks.noStatus'   },
  { value: 'warn',   labelKey: 'tasks.todo'       },
  { value: 'info',   labelKey: 'tasks.inProgress' },
  { value: 'ok',     labelKey: 'tasks.completed'  },
  { value: 'danger', labelKey: 'tasks.overdue'    },
  { value: 'review', labelKey: 'tasks.inReview'   },
];


// Ref-based dropdown for task rows (escapes overflow)
function InlineDropdown({ anchorRef, onClose, children, minWidth = 160 }: { anchorRef: React.RefObject<HTMLElement | null>; onClose: () => void; children: React.ReactNode; minWidth?: number }) {
  const dropRef = React.useRef<HTMLDivElement>(null);
  const [pos, setPos] = React.useState<React.CSSProperties>({ visibility: 'hidden' });
  React.useLayoutEffect(() => {
    if (!anchorRef.current || !dropRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const h = dropRef.current.offsetHeight;
    const w = dropRef.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = r.bottom + 4 + h > vh && r.top >= h + 4 ? r.top - h - 4 : r.bottom + 4;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, []);
  return createPortal(
    <>
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 990 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>,
    document.body
  );
}

// Rect-based dropdown for the task panel (same as Travail.tsx)
function PanelDropdown({ onClose, children, anchorRect, minWidth = 160, zIndex = 300 }: {
  onClose: () => void; children: React.ReactNode; anchorRect?: DOMRect | null; minWidth?: number; zIndex?: number;
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
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>
  );
}

// �"?�"? Task row �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

function BulkMoveModal({ count, mode, onMove, onClose }: {
  count: number;
  mode: 'move' | 'copy';
  onMove: (projectId: string, projectName: string, projectColor: string, sectionLabel: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(() => getProjects().filter(p => !p.archived));
  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetSection, setTargetSection] = useState('');
  const [newSection, setNewSection] = useState('');
  useEffect(() => subscribeProjects(() => setProjects(getProjects().filter(p => !p.archived))), []);

  const targetSections = targetProjectId ? getSections(targetProjectId) : [];
  const proj = projects.find(p => p.id === targetProjectId);

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 420, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{mode === 'copy' ? t('taskPanel.bulkCopyTitle', { count }) : t('taskPanel.bulkMoveTitle', { count })}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{t('taskPanel.destinationProject')}</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
          {projects.map(p => (
            <button key={p.id} onClick={() => { setTargetProjectId(p.id); setTargetSection(''); setNewSection(''); }}
              style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${targetProjectId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: targetProjectId === p.id ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: targetProjectId === p.id ? 'var(--accent)' : 'var(--text)', fontWeight: targetProjectId === p.id ? 600 : 400 }}>
              {p.name}
            </button>
          ))}
        </div>

        {targetProjectId && (
          <>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{t('taskPanel.destinationSection')}</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 10, maxHeight: 150, overflowY: 'auto' }}>
              {targetSections.map(s => (
                <button key={s.label} onClick={() => { setTargetSection(s.label); setNewSection(''); }}
                  style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${targetSection === s.label ? 'var(--accent)' : 'var(--border)'}`, background: targetSection === s.label ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontFamily: 'var(--ff-text)', color: targetSection === s.label ? 'var(--accent)' : 'var(--text)' }}>
                  {s.label}
                </button>
              ))}
            </div>
            <input value={newSection} onChange={e => { setNewSection(e.target.value); if (e.target.value) setTargetSection(e.target.value); }}
              placeholder={t('taskPanel.orCreateSection')}
              style={{ width: '100%', padding: '7px 12px', borderRadius: 9, border: '1px dashed var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark', boxSizing: 'border-box', marginBottom: 16 }}
            />
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.cancel')}</button>
          <button
            onClick={() => { if (proj && targetSection) { onMove(proj.id, proj.name, (proj as { clientColor?: string }).clientColor ?? 'var(--text-3)', targetSection); onClose(); } }}
            disabled={!targetProjectId || !targetSection}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: (!targetProjectId || !targetSection) ? 'var(--surface-3)' : 'var(--accent)', color: (!targetProjectId || !targetSection) ? 'var(--text-3)' : 'var(--on-accent)', fontSize: 13, cursor: (!targetProjectId || !targetSection) ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--ff-text)' }}
          >{mode === 'copy' ? t('taskPanel.copy') : t('taskPanel.move')}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function TaskContextMenu({ pos, onOpen, onConvert, onDelete, onClose }: { pos: { x: number; y: number }; onOpen: () => void; onConvert?: () => void; onDelete: () => void; onClose: () => void }) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 180, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>{t('tasks.openDetail')}</span></>, onOpen)}
      {onConvert && item(<><SFIcon name="git-branch" size={13} color="var(--text-3)" /><span>{t('board.convertToSubtask')}</span></>, onConvert)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('tasks.delete')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

function SectionContextMenu({ pos, onRename, onDelete, onClose }: {
  pos: { x: number; y: number }; onRename: () => void; onDelete: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
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
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 180, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="pencil" size={13} color="var(--text-3)" /><span>{t('taskPanel.renameSection')}</span></>, onRename)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('taskPanel.deleteSection')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

function TaskRow({ task, selected, multiSelected, onSelect, flashId, onDelete, onConvertRequest, compact }: { task: Task; selected: boolean; multiSelected?: boolean; onSelect: (t: Task, e?: React.MouseEvent) => void; flashId?: string | null; onDelete?: () => void; onConvertRequest?: (task: Task, pos: { x: number; y: number }) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(task.checked);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState(task.status as string);
  const [statusLabel, setStatusLabel] = useState(task.statusLabel);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [endDate, setEndDate] = useState(task.endDate ?? '');
  const [startTime, setStartTime] = useState(task.startTime ?? '');
  const [endTime, setEndTime] = useState(task.endTime ?? '');
  const [assignee, setAssignee] = useState<User | null>(task.assignee ?? null);
  const [sectionLabel, setSectionLabel] = useState(task.sectionLabel ?? '');
  const [open, setOpen] = useState<'priority' | 'status' | 'dueDate' | 'assignee' | 'projsec' | null>(null);
  const [projSearch, setProjSearch] = useState('');
  const [pendingProjId, setPendingProjId] = useState<string | null>(null);
  const projSecBtnRef = useRef<HTMLButtonElement>(null);
  const isFlashing = flashId === task.id;

  const assigneeBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const dueDateBtnRef = useRef<HTMLButtonElement>(null);
  const [hovered, setHovered] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const completeTimer = useRef<number | null>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = useRef<HTMLInputElement>(null);

  // The fields above are local (optimistic) copies of `task`, seeded once at
  // mount — editing them from THIS row also calls updateMyTask() so they
  // stay in sync here. But an edit made elsewhere (the detail panel on the
  // right, same task.id) updates the store and this component re-renders
  // with a fresh `task` prop, yet these useState calls never re-read it —
  // the row kept showing stale values until it happened to unmount.
  // Re-sync whenever the incoming task object actually changes.
  useEffect(() => {
    setChecked(task.checked);
    setPriority(task.priority);
    setStatus(task.status as string);
    setStatusLabel(task.statusLabel);
    setDueDate(task.dueDate);
    setEndDate(task.endDate ?? '');
    setStartTime(task.startTime ?? '');
    setEndTime(task.endTime ?? '');
    setAssignee(task.assignee ?? null);
    setSectionLabel(task.sectionLabel ?? '');
    if (!editingTitle) setTitleDraft(task.title);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [task]);

  useEffect(() => { if (editingTitle) titleInputRef.current?.select(); }, [editingTitle]);

  const commitTitle = () => {
    const trimmed = titleDraft.trim();
    if (trimmed && trimmed !== task.title) updateMyTask(task.id, { title: trimmed });
    else setTitleDraft(task.title);
    setEditingTitle(false);
  };

  // Cocher une tâche dans Mes tâches → animation de coche, puis retrait de la
  // liste (persisté checked:true). La tâche reste dans son projet (store séparé).
  const toggleChecked = () => {
    const next = !checked;
    setChecked(next);
    if (completeTimer.current) { clearTimeout(completeTimer.current); completeTimer.current = null; }
    if (next) {
      completeTimer.current = window.setTimeout(() => { updateMyTask(task.id, { checked: true }); }, 1100);
      showToast({
        type: 'task',
        message: t('taskPanel.taskCompleted'),
        onUndo: () => {
          if (completeTimer.current) { clearTimeout(completeTimer.current); completeTimer.current = null; }
          setChecked(false);
          updateMyTask(task.id, { checked: false });
        },
      });
    } else {
      updateMyTask(task.id, { checked: false });
    }
  };

  const ddItem = (onClick: () => void, children: React.ReactNode, active?: boolean) => (
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

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: compact ? GRID_COMPACT : GRID,
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        // Fixed regardless of compact/full mode — without it, closing the
        // status/priority pills in compact mode shrinks the row's natural
        // height, making the whole list jump shorter every time the panel opens.
        minHeight: 44,
        borderBottom: '1px solid var(--border)',
        opacity: checked ? 0.4 : 1,
        background: isFlashing ? 'rgba(249,255,0,0.15)' : multiSelected ? 'rgba(249,255,0,0.08)' : selected ? 'rgba(249,255,0,0.04)' : 'transparent',
        outline: multiSelected ? '1px solid rgba(249,255,0,0.35)' : 'none',
        outlineOffset: '-1px',
        borderLeft: isFlashing ? '2px solid var(--accent)' : selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'opacity 0.4s, background 0.1s, border-color 0.5s',
      }}
      onMouseEnter={e => { setHovered(true); if (!selected && !multiSelected) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { setHovered(false); if (!selected && !multiSelected) e.currentTarget.style.background = 'transparent'; }}
      onContextMenu={e => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
      onClick={e => {
        if (editingTitle) return;
        if ((e.target as HTMLElement).closest('button, input, textarea, a')) return;
        onSelect(task, e);
      }}
    >
      {/* Checkbox */}
      <button
        onClick={toggleChecked}
        style={{
          width: 16, height: 16, borderRadius: '50%',
          border: checked ? 'none' : '1.5px solid var(--border-2)',
          background: checked ? 'var(--ok)' : 'transparent',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          flexShrink: 0, cursor: 'pointer',
        }}
      >
        {checked && <SFIcon name="check" size={10} color="white" />}
      </button>

      {/* Titre — cliquer directement sur le texte édite le titre ; cliquer
          n'importe où ailleurs sur la ligne ouvre le panneau de détail. */}
      <div
        onClick={e => {
          if (editingTitle) return;
          e.stopPropagation();
          setTitleDraft(task.title);
          setEditingTitle(true);
        }}
        onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
        // maxWidth stops just short of 100% (rather than 100%) so a long,
        // truncated title never eats the whole column — leaving a sliver of
        // row background past the "…" that's always clickable to open the
        // detail panel, instead of every click landing on title-edit mode.
        style={{ overflow: 'hidden', cursor: editingTitle ? 'default' : 'text', display: 'flex', alignItems: 'center', height: '100%', maxWidth: editingTitle ? '100%' : 'calc(100% - 28px)', width: editingTitle ? '100%' : 'fit-content' }}
      >
        {editingTitle ? (
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
              boxSizing: 'content-box',
              width: `${Math.max(2, titleDraft.length + 1)}ch`, maxWidth: '100%',
              borderRadius: 6, border: '1px solid var(--accent)',
              background: 'var(--surface-3)', color: 'var(--text)',
              fontFamily: 'var(--ff-text)', outline: 'none',
            }}
          />
        ) : (
          <span style={{
            fontSize: 13, fontWeight: 500,
            textDecoration: checked ? 'line-through' : 'none',
            overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
            color: 'var(--text)', display: 'inline-block', maxWidth: '100%',
          }}>
            {task.title}
          </span>
        )}
      </div>

      {!compact && (
      <>
      {/* Sous-tâches */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {task.subtasks?.length ? (
          <>
            <SFIcon name="git-branch" size={12} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks.filter(s => s.checked).length}/{task.subtasks.length}
            </span>
          </>
        ) : <span style={{ color: 'var(--border-2)', fontFamily: 'var(--ff-mono)', fontSize: 10 }}>—</span>}
      </div>

      {/* Activité */}
      <div style={{ display: 'flex', alignItems: 'center' }}>
        {task.activityCount ? (
          <div style={{ position: 'relative', display: 'inline-flex' }}>
            <SFIcon name="message-circle" size={14} color="var(--accent)" />
            <span style={{
              position: 'absolute', top: -5, right: -6,
              background: 'var(--accent)', color: 'var(--on-accent)',
              borderRadius: 999, fontSize: 8, fontWeight: 700,
              padding: '1px 4px', fontFamily: 'var(--ff-mono)', lineHeight: 1.4,
            }}>
              {task.activityCount}
            </span>
          </div>
        ) : <span style={{ color: 'var(--border-2)', fontFamily: 'var(--ff-mono)', fontSize: 10 }}>—</span>}
      </div>

      {/* Projet + Section — compact inline */}
      <div style={{ position: 'relative', minWidth: 0 }}>
        <button
          ref={projSecBtnRef}
          onClick={e => { e.stopPropagation(); setOpen(open === 'projsec' ? null : 'projsec'); }}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: 4, maxWidth: '100%', overflow: 'hidden',
            padding: '3px 7px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', cursor: 'pointer',
          }}
        >
          {task.projectId !== 'int' && (
            <i style={{ width: 6, height: 6, borderRadius: '50%', background: task.projectColor, display: 'block', flexShrink: 0 }} />
          )}
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 80 }}>
            {task.projectName}
          </span>
          {sectionLabel && (
            <>
              <span style={{ color: 'var(--border-2)', fontSize: 10, fontFamily: 'var(--ff-mono)', flexShrink: 0 }}>/</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 60 }}>
                {sectionLabel}
              </span>
            </>
          )}
          <SFIcon name="chevron-down" size={8} color="var(--border-2)" />
        </button>
        {open === 'projsec' && (
          <InlineDropdown
            anchorRef={projSecBtnRef}
            onClose={() => { setOpen(null); setProjSearch(''); setPendingProjId(null); }}
            minWidth={248}
          >
            {pendingProjId !== null ? (
              /* ── Step 2: section picker ─────────────────────────────── */
              <>
                <button
                  onClick={() => setPendingProjId(null)}
                  style={{ display: 'flex', alignItems: 'center', gap: 5, width: '100%', padding: '6px 10px', border: 'none', background: 'none', cursor: 'pointer', color: 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; }}
                >
                  <SFIcon name="chevron-left" size={11} />
                  <span>{t('taskPanel.backToProjects')}</span>
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 8px 4px' }} />
                <p style={{ padding: '2px 10px 4px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('taskPanel.section')}</p>
                {(() => {
                  const secs = getSections(pendingProjId);
                  const closeAll = () => { setOpen(null); setProjSearch(''); setPendingProjId(null); };
                  return (
                    <>
                      <button onClick={() => { setSectionLabel(''); updateMyTask(task.id, { sectionLabel: '' }); closeAll(); }}
                        style={{ display: 'block', width: '100%', padding: '5px 10px', background: !sectionLabel ? 'var(--surface-3)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                        {t('taskPanel.noSection')}
                      </button>
                      {secs.map(s => (
                        <button key={s.label} onClick={() => { setSectionLabel(s.label); updateMyTask(task.id, { sectionLabel: s.label }); closeAll(); }}
                          style={{ display: 'block', width: '100%', padding: '5px 10px', background: s.label === sectionLabel ? 'var(--surface-3)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text)' }}>
                          {s.label}
                        </button>
                      ))}
                      {secs.length === 0 && (
                        <p style={{ padding: '4px 10px 6px', fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('taskPanel.noSectionInProject')}</p>
                      )}
                    </>
                  );
                })()}
              </>
            ) : (
              /* ── Step 1: project picker with search ─────────────────── */
              <>
                <div style={{ padding: '6px 8px 4px' }}>
                  <div style={{ position: 'relative' }}>
                    <span style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', display: 'flex', pointerEvents: 'none' }}>
                      <SFIcon name="search" size={11} color="var(--text-3)" />
                    </span>
                    <input
                      autoFocus
                      value={projSearch}
                      onChange={e => setProjSearch(e.target.value)}
                      placeholder={t('taskPanel.searchProject')}
                      style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px 5px 24px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-text)', outline: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                {(() => {
                  const q = projSearch.toLowerCase();
                  const all = getProjects().filter(p => !q || p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q));
                  const current = all.find(p => p.id === task.projectId);
                  const others = all.filter(p => p.id !== task.projectId && !p.archived);
                  const recentOthers = others.slice(0, 3);
                  const moreOthers = others.slice(3);
                  const projBtn = (p: ReturnType<typeof getProjects>[0]) => (
                    <button key={p.id}
                      onClick={() => {
                        updateMyTask(task.id, { projectId: p.id, projectName: p.name, projectColor: p.clientColor, sectionLabel: '' });
                        setSectionLabel('');
                        setPendingProjId(p.id);
                      }}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', background: task.projectId === p.id ? 'var(--surface-3)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left' }}
                      onMouseEnter={e => { if (task.projectId !== p.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                      onMouseLeave={e => { if (task.projectId !== p.id) (e.currentTarget as HTMLElement).style.background = 'none'; }}
                    >
                      <i style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor, display: 'block', flexShrink: 0 }} />
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontSize: 12, fontFamily: 'var(--ff-text)', color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</div>
                        <div style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)' }}>{p.clientName}</div>
                      </div>
                    </button>
                  );
                  return (
                    <div style={{ maxHeight: 270, overflowY: 'auto' }}>
                      {!q && current && (
                        <>
                          <p style={{ padding: '2px 10px 2px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('taskPanel.current')}</p>
                          {projBtn(current)}
                          {recentOthers.length > 0 && (
                            <>
                              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                              <p style={{ padding: '2px 10px 2px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('taskPanel.recent')}</p>
                              {recentOthers.map(projBtn)}
                            </>
                          )}
                          {moreOthers.length > 0 && (
                            <>
                              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                              <p style={{ padding: '2px 10px 2px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{t('taskPanel.allProjects')}</p>
                              {moreOthers.map(projBtn)}
                            </>
                          )}
                        </>
                      )}
                      {(q || !current) && all.map(projBtn)}
                      {all.length === 0 && (
                        <p style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>{t('taskPanel.noResults')}</p>
                      )}
                    </div>
                  );
                })()}
              </>
            )}
          </InlineDropdown>
        )}
      </div>

      {/* Assigné — avatar only */}
      <div style={{ position: 'relative' }}>
        <button
          ref={assigneeBtnRef}
          onClick={() => setOpen(open === 'assignee' ? null : 'assignee')}
          title={assignee?.name ?? t('tasks.unassigned')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
        >
          {assignee
            ? <SFAvatar initials={assignee.initials} bg={assignee.avatarColor} size={22} />
            : <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SFIcon name="user" size={11} color="var(--text-3)" /></span>
          }
        </button>
        {open === 'assignee' && (
          <InlineDropdown anchorRef={assigneeBtnRef} onClose={() => setOpen(null)}>
            {ddItem(() => { setAssignee(null); setOpen(null); updateMyTask(task.id, { assignee: undefined }); },
              <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>{t('tasks.unassigned')}</>,
              assignee === null
            )}
            {getTeam().map(u => ddItem(() => { setAssignee(u); setOpen(null); updateMyTask(task.id, { assignee: u }); },
              <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
              assignee?.id === u.id
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Priorité — inline dropdown */}
      <div>
        <button
          ref={priorityBtnRef}
          onClick={() => setOpen(open === 'priority' ? null : 'priority')}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', minHeight: 20,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
          {priority !== 'none' && (
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>
              {t(PRIORITY_LABEL_KEY[priority])}
            </span>
          )}
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'priority' && (
          <InlineDropdown anchorRef={priorityBtnRef} onClose={() => setOpen(null)}>
            {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpen(null); updateMyTask(task.id, { priority: p, priorityLabel: t(PRIORITY_LABEL_KEY[p]) }); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>,
              priority === p
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Statut — inline dropdown */}
      <div>
        <button
          ref={statusBtnRef}
          onClick={() => setOpen(open === 'status' ? null : 'status')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '4px 2px', minHeight: 20, display: 'flex', alignItems: 'center', gap: 6 }}
        >
          {status
            ? <SFPill status={status as Task['status']} small>{statusLabel}</SFPill>
            : <span style={{ width: 7, height: 7, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0, display: 'block' }} />
          }
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'status' && (
          <InlineDropdown anchorRef={statusBtnRef} onClose={() => setOpen(null)}>
            {STATUS_OPTIONS.map(o => ddItem(() => { setStatus(o.value); setStatusLabel(t(o.labelKey)); setOpen(null); updateMyTask(task.id, { status: o.value as Task['status'], statusLabel: t(o.labelKey) }); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>,
              status === o.value
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Date — inline date + time picker */}
      <div style={{ position: 'relative' }}>
        <button
          ref={dueDateBtnRef}
          onClick={() => setOpen(open === 'dueDate' ? null : 'dueDate')}
          style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
            display: 'flex', alignItems: 'center', gap: 4,
            fontFamily: 'var(--ff-mono)', fontSize: 11,
            color: isOverdue(dueDate) ? 'var(--danger)' : (dueDate && dueDate !== '—') ? 'var(--text-2)' : 'var(--text-3)',
            whiteSpace: 'nowrap',
          }}
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
              updateMyTask(task.id, { dueDate: d, endDate: ed ?? '', startTime: s ?? '', endTime: e ?? '' });
            }}
            onClose={() => setOpen(null)}
            anchorRect={dueDateBtnRef.current?.getBoundingClientRect() ?? null}
          />
        )}
      </div>
      </>
      )}

      {/* Delete — supprime la tâche de Mes tâches */}
      {onDelete && (
        <button
          onClick={e => { e.stopPropagation(); onDelete(); }}
          title={t('taskPanel.deleteTask')}
          style={{ visibility: hovered ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 3, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="trash-2" size={13} />
        </button>
      )}

      {/* More — opens panel */}
      {!compact && (
        <button
          onClick={e => onSelect(task, e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
        >
          <SFIcon name="ellipsis" size={14} color="var(--text-3)" />
        </button>
      )}

      {/* Right-click context menu */}
      {ctxPos && (
        <TaskContextMenu
          pos={ctxPos}
          onOpen={() => { onSelect(task); setCtxPos(null); }}
          onConvert={onConvertRequest ? () => { onConvertRequest(task, ctxPos); setCtxPos(null); } : undefined}
          onDelete={() => { onDelete?.(); setCtxPos(null); }}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}

// ── Task Detail Panel (moved to src/components/TaskPanel.tsx) ────────────────


// �"?�"? Filter bar with dropdowns �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

function FilterDropdown({ label, count, onClear, children, anchorRef }: {
  label: string; count: number; onClear: () => void; children: React.ReactNode; anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [pos, setPos] = React.useState<React.CSSProperties>({ visibility: 'hidden' });
  const dropRef = React.useRef<HTMLDivElement>(null);

  const toggle = () => setOpen(v => !v);

  // Mesure le menu (rendu en visibility:hidden) puis le clampe dans le viewport
  React.useLayoutEffect(() => {
    if (!open) { setPos({ visibility: 'hidden' }); return; }
    if (!anchorRef.current || !dropRef.current) return;
    const r = anchorRef.current.getBoundingClientRect();
    const h = dropRef.current.offsetHeight;
    const w = dropRef.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = r.bottom + 4 + h > vh && r.top >= h + 4 ? r.top - h - 4 : r.bottom + 4;
    const left = Math.max(8, Math.min(r.left, vw - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [open, anchorRef]);

  const active = count > 0;
  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', borderRadius: 8, border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`, background: active ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', overflow: 'hidden' }}>
        <button
          ref={anchorRef as React.RefObject<HTMLButtonElement>}
          onClick={toggle}
          style={{
            display: 'flex', alignItems: 'center', gap: 6,
            padding: '5px 10px',
            border: 'none', background: 'transparent',
            color: active ? 'var(--accent)' : 'var(--text-2)',
            fontSize: 12, fontWeight: active ? 600 : 400,
            fontFamily: 'var(--ff-text)', cursor: 'pointer',
          }}
        >
          {label}
          {active && (
            <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: 16, height: 16, borderRadius: 999, background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 9, fontWeight: 700, fontFamily: 'var(--ff-mono)', padding: '0 4px' }}>
              {count}
            </span>
          )}
          <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={11}  />
        </button>
        {active && (
          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            title={t('taskPanel.clear')}
            style={{ display: 'flex', alignItems: 'center', padding: '5px 7px 5px 2px', border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--accent)')}
          >
            <SFIcon name="x" size={12} color="var(--accent)" />
          </button>
        )}
      </div>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 990 }} />
          <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 11, padding: 6, minWidth: 200, boxShadow: '0 8px 28px rgba(0,0,0,0.5)' }}>
            {children}
          </div>
        </>
      )}
    </>
  );
}

function FilterBar({ filterPriorities, filterStatuses, onTogglePriority, onToggleStatus, onClearPriority, onClearStatus }: {
  filterPriorities: Set<Priority>; filterStatuses: Set<string>;
  onTogglePriority: (p: Priority) => void; onToggleStatus: (s: string) => void;
  onClearPriority: () => void; onClearStatus: () => void;
}) {
  const { t } = useTranslation();
  const prioRef = useRef<HTMLButtonElement>(null);
  const statRef = useRef<HTMLButtonElement>(null);

  const checkRow = (label: string, dot: string, active: boolean, onClick: () => void) => (
    <button key={label} onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 10px', borderRadius: 8, border: 'none', background: active ? 'rgba(249,255,0,0.06)' : 'transparent', cursor: 'pointer', fontFamily: 'var(--ff-text)', transition: 'background 0.1s' }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}>
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: dot, display: 'block', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', textAlign: 'left' }}>{label}</span>
      <div style={{ width: 16, height: 16, borderRadius: 4, border: `2px solid ${active ? 'var(--accent)' : 'var(--border-2)'}`, background: active ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, transition: 'all 0.12s' }}>
        {active && <SFIcon name="check" size={9} color="var(--on-accent)" />}
      </div>
    </button>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
      <SFIcon name="sliders-horizontal" size={12} color="var(--text-3)" />

      <FilterDropdown label={t('tasks.priority')} count={filterPriorities.size} onClear={onClearPriority} anchorRef={prioRef}>
        {PRIORITY_OPTIONS.map(p => checkRow(t(PRIORITY_LABEL_KEY[p]), PRIORITY_COLOR[p], filterPriorities.has(p), () => onTogglePriority(p)))}
      </FilterDropdown>

      <FilterDropdown label={t('tasks.status')} count={filterStatuses.size} onClear={onClearStatus} anchorRef={statRef}>
        {STATUS_OPTIONS.map(o => checkRow(t(o.labelKey), STATUS_COLOR[o.value], filterStatuses.has(o.value), () => onToggleStatus(o.value)))}
      </FilterDropdown>
    </div>
  );
}

// �"?�"? Main screen �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

// �"?�"? Add task row �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

type AddOpts = { priority: Priority; assignee: User | null; project: typeof PROJECTS[0] | null; status: string; statusLabel: string; dueDate: string };

function SectionHeader({ label, count, collapsed, onToggle, onDelete, onRename }: { label: string; count: number; collapsed: boolean; onToggle: () => void; onDelete: () => void; onRename: (newLabel: string) => void }) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const [editingLabel, setEditingLabel] = useState(false);
  const [labelDraft, setLabelDraft] = useState(label);
  const labelInputRef = useRef<HTMLInputElement>(null);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);

  useEffect(() => { if (editingLabel) labelInputRef.current?.select(); }, [editingLabel]);

  const commitLabel = () => {
    onRename(labelDraft);
    setEditingLabel(false);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => { setHovered(false); setConfirm(false); }}
      onContextMenu={e => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
      style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', background: 'var(--surface-2)', borderBottom: collapsed ? 'none' : '1px solid var(--border)' }}
    >
      <button onClick={onToggle} style={{ display: 'flex', alignItems: 'center', background: 'none', border: 'none', cursor: 'pointer', padding: 0, flexShrink: 0 }}>
        <SFIcon name={collapsed ? 'chevron-right' : 'chevron-down'} size={13} color="var(--text-3)" />
      </button>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, flex: 1 }}>
        {editingLabel ? (
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
              fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase',
              fontWeight: 600, padding: '2px 6px', boxSizing: 'content-box',
              width: `${Math.max(2, labelDraft.length + 1)}ch`, maxWidth: 300,
              borderRadius: 6, border: '1px solid var(--accent)', background: 'var(--surface-3)', color: 'var(--text)', outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={() => { setLabelDraft(label); setEditingLabel(true); }}
            style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-2)', fontWeight: 600, cursor: 'text' }}
          >
            {label}
          </span>
        )}
        <span onClick={onToggle} style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', cursor: 'pointer' }}>({count})</span>
      </div>
      {hovered && !confirm && (
        <button onClick={() => setConfirm(true)} title={t('taskPanel.deleteSection')}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 2, borderRadius: 5 }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <SFIcon name="trash-2" size={11} />
        </button>
      )}
      {confirm && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--ff-mono)' }}>{t('tasks.deleteConfirm')}</span>
          <button onClick={onDelete} style={{ padding: '2px 8px', borderRadius: 6, background: 'var(--danger)', border: 'none', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.yes')}</button>
          <button onClick={() => setConfirm(false)} style={{ padding: '2px 8px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.no')}</button>
        </div>
      )}
      {ctxPos && (
        <SectionContextMenu
          pos={ctxPos}
          onRename={() => { setLabelDraft(label); setEditingLabel(true); }}
          onDelete={() => setConfirm(true)}
          onClose={() => setCtxPos(null)}
        />
      )}
    </div>
  );
}

function AddTaskRow({ defaultPriority, onAdd, onAddMany, compact }: { defaultPriority: Priority; onAdd: (title: string, opts: AddOpts) => void; onAddMany: (titles: string[], opts: AddOpts) => void; compact?: boolean }) {
  const { t } = useTranslation();
  const [title, setTitle]       = useState('');
  const [open, setOpen]         = useState(false);
  const [assignee, setAssignee] = useState<User | null>(null);
  const [project, setProject]   = useState<typeof PROJECTS[0] | null>(null);
  const [priority, setPriority] = useState<Priority>(defaultPriority);
  const [status, setStatus]     = useState('');
  const [statusLabel, setStatusLabel] = useState('');
  const [dueDate, setDueDate]   = useState('');
  const [openField, setOpenField] = useState<'assignee' | 'project' | 'priority' | 'status' | 'dueDate' | null>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const openDrop = (key: typeof openField, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpenField(prev => prev === key ? null : key);
    setDropRect(e.currentTarget.getBoundingClientRect());
  };

  const clearFields = () => {
    setTitle(''); setAssignee(null); setProject(null); setPriority(defaultPriority);
    setStatus(''); setStatusLabel(''); setDueDate('');
    setOpenField(null);
  };

  const cancel = () => {
    clearFields();
    setOpen(false);
  };

  // Enter: create the task, then stay open with a blank row so the next
  // task can be typed right away (skip a line, like Notion/Asana).
  const submitAndContinue = () => {
    const t = title.trim();
    if (!t) { cancel(); return; }
    onAdd(t, { priority, assignee, status, statusLabel, dueDate: dueDate || '—', project });
    clearFields();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  // Blur (clicking away): create the task if a title was typed, otherwise
  // discard the empty row. Either way the row closes — only Enter keeps it open.
  const commitOnBlur = () => {
    const t = title.trim();
    if (t) onAdd(t, { priority, assignee, status, statusLabel, dueDate: dueDate || '—', project });
    cancel();
  };

  // Pasting multi-line text (e.g. a checklist copied from an email) creates
  // one task per non-empty line instead of dumping it all in one title.
  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    const text = e.clipboardData.getData('text');
    const lines = text.split(/\r\n|\r|\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length <= 1) return;
    e.preventDefault();
    onAddMany(lines, { priority, assignee, status, statusLabel, dueDate: dueDate || '—', project });
    clearFields();
    setTimeout(() => inputRef.current?.focus(), 0);
  };

  const ddItem = (onClick: () => void, children: React.ReactNode, active?: boolean) => (
    <button onMouseDown={e => e.preventDefault()} onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: active ? 'var(--surface-3)' : 'transparent', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >{children}</button>
  );

  if (!open) {
    return (
      <button
        onClick={() => { setOpen(true); setTimeout(() => inputRef.current?.focus(), 0); }}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          padding: '8px 16px', width: '100%', border: 'none',
          background: 'transparent', color: 'var(--text-3)', fontSize: 13,
          cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <SFIcon name="plus" size={13}  />
        {t('taskPanel.addTask')}
      </button>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(249,255,0,0.03)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: compact ? GRID_COMPACT : GRID, alignItems: 'center', gap: 12, padding: '8px 16px', minHeight: 44 }}>
        {/* Checkbox placeholder */}
        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--border-2)', flexShrink: 0 }} />

        {/* Title */}
        <input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submitAndContinue(); if (e.key === 'Escape') cancel(); }}
          onPaste={handlePaste}
          onBlur={commitOnBlur}
          placeholder={t('taskPanel.taskNamePlaceholder')}
          style={{ width: '100%', padding: '4px 0', background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)' }}
        />

        {!compact && (
        <>
        <span />{/* Sous-tâches */}
        <span />{/* Activité */}

        {/* Projet */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('project', e)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0, maxWidth: '100%' }}>
            {project
              ? <><i style={{ width: 7, height: 7, borderRadius: '50%', background: project.clientColor, display: 'block', flexShrink: 0 }} /><span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span></>
              : <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontStyle: 'italic' }}>{t('taskPanel.projectPlaceholder')}</span>
            }
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'project' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect} minWidth={220}>
              {ddItem(() => { setProject(null); setOpenField(null); },
                <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>{t('tasks.noProject')}</span>,
                project === null
              )}
              {getProjects().filter(p => !p.archived).map(p => ddItem(() => { setProject(p); setOpenField(null); },
                <><i style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor, display: 'block', flexShrink: 0 }} />{p.name}</>,
                project?.id === p.id
              ))}
            </PanelDropdown>
          )}
        </div>

        {/* Assigné — avatar only */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('assignee', e)}
            title={assignee?.name ?? t('tasks.unassigned')}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            {assignee
              ? <SFAvatar initials={assignee.initials} bg={assignee.avatarColor} size={22} />
              : <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SFIcon name="user" size={11} color="var(--text-3)" /></span>
            }
          </button>
          {openField === 'assignee' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect} minWidth={180}>
              {ddItem(() => { setAssignee(null); setOpenField(null); },
                <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>{t('tasks.unassigned')}</>,
                assignee === null)}
              {getTeam().map(u => ddItem(() => { setAssignee(u); setOpenField(null); },
                <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
                assignee?.id === u.id
              ))}
            </PanelDropdown>
          )}
        </div>

        {/* Priority */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('priority', e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(PRIORITY_LABEL_KEY[priority])}</span>
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'priority' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect}>
              {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>,
                priority === p
              ))}
            </PanelDropdown>
          )}
        </div>

        {/* Status */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('status', e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {status
              ? <SFPill status={status as Task['status']} small>{statusLabel}</SFPill>
              : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t('taskPanel.none')}</span>
            }
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'status' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect}>
              {STATUS_OPTIONS.map(o => ddItem(() => { setStatus(o.value); setStatusLabel(t(o.labelKey)); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>,
                status === o.value
              ))}
            </PanelDropdown>
          )}
        </div>

        {/* Due date */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('dueDate', e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {dueDate || t('tasks.dueDate')}
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'dueDate' && (
            <DatePickerDropdown value={dueDate} onChange={v => { setDueDate(formatDisplay(v)); setOpenField(null); }} onClose={() => setOpenField(null)} anchorRect={dropRect} />
          )}
        </div>
        </>
        )}

        {/* Cancel */}
        <button onMouseDown={e => e.preventDefault()} onClick={cancel}
          style={{ display: 'flex', padding: 4, borderRadius: 6, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
          <SFIcon name="x" size={13} />
        </button>
      </div>
    </div>
  );
}

// �"?�"? Main screen �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

export function Taches() {
  const { t } = useTranslation();
  const [filter, setFilter]           = usePersistedState<Filter>('sf_taches_filter', 'all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  // Collapsing the list columns tracks the panel opening instantly, but on
  // close it stays collapsed until the panel's width transition (0.2s)
  // finishes — flipping back to the full grid immediately made the title
  // column visibly snap tiny (squeezed into the still-narrow container)
  // before growing back once the panel had actually collapsed.
  const [compactColumns, setCompactColumns] = useState(false);
  useEffect(() => {
    if (selectedTask) { setCompactColumns(true); return; }
    const timer = setTimeout(() => setCompactColumns(false), 200);
    return () => clearTimeout(timer);
  }, [selectedTask]);
  const [tasks, setTasks]             = useState<Task[]>(getMyTasks);
  const [flashId]                     = useState<string | null>(null);
  const [convertRequest, setConvertRequest] = useState<{ taskId: string; pos: { x: number; y: number } } | null>(null);
  const handleConvertRequest = useCallback((task: Task, pos: { x: number; y: number }) => {
    setConvertRequest({ taskId: task.id, pos });
  }, []);
  const [sortCol, setSortCol]         = usePersistedState<SortCol | null>('sf_taches_sort_col', null);
  const [sortDir, setSortDir]         = usePersistedState<SortDir>('sf_taches_sort_dir', 'asc');
  const [filterPriorities, setFilterPriorities] = usePersistedState<Priority[]>('sf_taches_filter_prio', []);
  const [filterStatuses, setFilterStatuses]     = usePersistedState<string[]>('sf_taches_filter_status', []);
  const [collapsedGroupsArr, setCollapsedGroupsArr] = usePersistedState<string[]>('sf_taches_collapsed_sections', []);
  const collapsedGroups = new Set(collapsedGroupsArr);
  const [mySections, setMySections]   = useState<string[]>(getMyTaskSections);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false);
  const [groupByPriority, setGroupByPriority] = usePersistedState<boolean>('sf_taches_group_prio', false);
  const [hideCompleted, setHideCompleted] = useSyncedViewState<boolean>('sf_taches_hide_completed', false);

  React.useEffect(() => subscribeMyTasks(() => { setTasks(getMyTasks()); setMySections(getMyTaskSections()); }), []);

  const anchorTaskId = React.useRef<string | null>(null);

  const toggleGroup = (key: string) =>
    setCollapsedGroupsArr(prev => prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]);

  const handleSort = useCallback((col: SortCol) => {
    setSortCol(prev => {
      if (prev === col) {
        if (sortDir === 'asc') { setSortDir('desc'); return col; }
        setSortDir('asc');
        return null;
      }
      setSortDir('asc');
      return col;
    });
  }, [sortDir]);

  const filterPrioritiesSet = new Set(filterPriorities);
  const filterStatusesSet   = new Set(filterStatuses);

  const togglePriorityFilter = (p: Priority) =>
    setFilterPriorities(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p]);

  const toggleStatusFilter = (s: string) =>
    setFilterStatuses(prev => prev.includes(s) ? prev.filter(x => x !== s) : [...prev, s]);

  const clearFilters = () => { setFilterPriorities([]); setFilterStatuses([]); };

  const buildTask = useCallback((title: string, opts: AddOpts & { mySection?: string }): Task => {
    const authUser = getCurrentUser();
    const defaultAssignee = isDemoSession() || !authUser
      ? USERS.lea
      : { id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role };
    return {
      id: `my-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      title,
      projectId: opts.project?.id ?? 'int',
      projectName: opts.project?.name ?? 'Interne',
      projectColor: opts.project?.clientColor ?? 'var(--text-3)',
      assignee: opts.assignee ?? defaultAssignee,
      status: opts.status as Task['status'],
      statusLabel: opts.statusLabel,
      priority: opts.priority,
      priorityLabel: t(PRIORITY_LABEL_KEY[opts.priority]),
      dueDate: opts.dueDate,
      dueDateRed: false,
      checked: false,
      subtasks: [],
      mySection: opts.mySection,
    };
  }, [t]);

  const addTask = useCallback((title: string, opts: AddOpts & { mySection?: string }) => {
    const newTask = buildTask(title, opts);
    addMyTask(newTask);
    undoStackRef.current.push({ taskIds: [newTask.id], tasks: [newTask] });
    redoStackRef.current = [];
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildTask]);

  // Ctrl+Z / Ctrl+Shift+Z (or Ctrl+Y) undo/redo — scoped to task additions,
  // so pasting a big checklist and changing your mind doesn't mean deleting
  // every row by hand. Same pattern as Travail.tsx's project-task list.
  type AddUndoEntry = { taskIds: string[]; tasks: Task[] };
  const undoStackRef = useRef<AddUndoEntry[]>([]);
  const redoStackRef = useRef<AddUndoEntry[]>([]);

  const addTaskMany = useCallback((titles: string[], opts: AddOpts & { mySection?: string }) => {
    if (!titles.length) return;
    const newTasks = titles.map(title => buildTask(title, opts));
    newTasks.forEach(addMyTask);
    undoStackRef.current.push({ taskIds: newTasks.map(t => t.id), tasks: newTasks });
    redoStackRef.current = [];
    showToast({
      type: 'section',
      message: `${newTasks.length} tâches créées`,
      subMessage: 'Collées depuis le presse-papiers',
      onUndo: () => undoLastAdd(),
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [buildTask]);

  const undoLastAdd = () => {
    const entry = undoStackRef.current.pop();
    if (!entry) return;
    entry.taskIds.forEach(removeMyTask);
    redoStackRef.current.push(entry);
  };

  const redoLastAdd = () => {
    const entry = redoStackRef.current.pop();
    if (!entry) return;
    entry.tasks.forEach(addMyTask);
    undoStackRef.current.push(entry);
  };

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

  // Apply date filter ↑' priority filter ↑' status filter ↑' sort
  let visible = filterTasks(tasks, filter);
  if (filterPrioritiesSet.size > 0) visible = visible.filter(t => filterPrioritiesSet.has(t.priority));
  if (filterStatusesSet.size > 0)   visible = visible.filter(t => filterStatusesSet.has(t.status as string));
  // Les tâches terminées disparaissent de Mes tâches (elles restent dans leur projet).
  visible = visible.filter(t => !t.checked);
  if (hideCompleted) visible = visible.filter(t => !t.checked);

  const activeTasks = tasks.filter(t => !t.checked);
  const lateCount = activeTasks.filter(t => isOverdue(t.dueDate ?? '') || t.status === 'danger').length;
  const hasActiveFilters = filterPrioritiesSet.size > 0 || filterStatusesSet.size > 0;

  // Grouped view (always on — sort applies within each group)
  const sortedVisible = sortCol ? sortTasks(visible, sortCol, sortDir) : visible;
  const noSectionTasks = sortedVisible.filter(t => !t.mySection);
  const sectionGroups = mySections.map(label => ({
    label,
    tasks: sortedVisible.filter(t => t.mySection === label),
  }));

  // Priority groups (used when groupByPriority is on)
  const priorityGroups = PRIORITY_ORDER.map(p => ({
    priority: p,
    label: t(PRIORITY_LABEL_KEY[p]),
    color: PRIORITY_COLOR[p],
    tasks: sortedVisible.filter(tk => (tk.priority ?? 'none') === p),
  })).filter(g => g.tasks.length > 0);

  const handleSelectTask = useCallback((task: Task, e?: React.MouseEvent) => {
    if (e && e.shiftKey && anchorTaskId.current) {
      const orderedIds = [...noSectionTasks, ...sectionGroups.flatMap(g => g.tasks)].map(t => t.id);
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
      setMultiSelIds(prev => { const n = new Set(prev); n.has(task.id) ? n.delete(task.id) : n.add(task.id); return n; });
      anchorTaskId.current = task.id;
      setSelectedTask(null);
      return;
    }
    anchorTaskId.current = task.id;
    setMultiSelIds(new Set());
    setSelectedTask(prev => prev?.id === task.id ? null : task);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [noSectionTasks, sectionGroups]);

  const colHeaderProps = { sort: { col: sortCol as SortCol | null, dir: sortDir }, onSort: handleSort, compact: compactColumns };

  const filterTabBtn = (f: { key: Filter; labelKey: string }) => (
    <button
      key={f.key}
      onClick={() => setFilter(f.key)}
      style={{
        padding: '5px 14px', borderRadius: 8, border: 'none',
        background: filter === f.key ? 'var(--surface-3)' : 'transparent',
        color: filter === f.key ? 'var(--text)' : 'var(--text-2)',
        fontSize: 12, fontWeight: filter === f.key ? 600 : 400,
        fontFamily: 'var(--ff-text)', cursor: 'pointer', whiteSpace: 'nowrap',
        borderBottom: filter === f.key ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'all 0.12s',
      }}
    >
      {t(f.labelKey)}
    </button>
  );

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header + filter bar */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {/* Topbar */}
        <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('tasks.myTasksTitle')}</h1>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              {t('tasks.taskCountSummary', { visible: visible.length, total: activeTasks.length })}
              {lateCount > 0 && <> · <span style={{ color: 'var(--danger)' }}>{t('tasks.overdueCount', { count: lateCount })}</span></>}
            </p>
          </div>
        </div>

        {/* Filter bar — date tabs left, dropdowns right */}
        <div style={{ padding: '4px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {FILTERS.map(filterTabBtn)}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setGroupByPriority(g => !g)}
            title={groupByPriority ? t('taskPanel.ungroupByPriority') : t('taskPanel.groupByPriority')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: `1px solid ${groupByPriority ? 'var(--accent)' : 'var(--border)'}`, background: groupByPriority ? 'rgba(249,255,0,0.08)' : 'transparent', color: groupByPriority ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}
          >
            <SFIcon name="layers" size={12} color={groupByPriority ? 'var(--accent)' : 'var(--text-3)'} />
            {t('tasks.priority')}
          </button>
          <button
            onClick={() => setHideCompleted(v => !v)}
            title={hideCompleted ? t('tasks.showCompleted') : t('tasks.hideCompleted')}
            style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: `1px solid ${hideCompleted ? 'var(--accent)' : 'var(--border)'}`, background: hideCompleted ? 'rgba(249,255,0,0.08)' : 'transparent', color: hideCompleted ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', cursor: 'pointer', transition: 'all 0.12s', flexShrink: 0 }}
          >
            <SFIcon name={hideCompleted ? 'eye-off' : 'eye'} size={12} color={hideCompleted ? 'var(--accent)' : 'var(--text-3)'} />
            {t('tasks.hideCompleted')}
          </button>
          <FilterBar
            filterPriorities={filterPrioritiesSet}
            filterStatuses={filterStatusesSet}
            onTogglePriority={togglePriorityFilter}
            onToggleStatus={toggleStatusFilter}
            onClearPriority={() => setFilterPriorities([])}
            onClearStatus={() => setFilterStatuses([])}
          />
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {visible.length === 0 && hasActiveFilters && (
          <div style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <SFIcon name="circle-check" size={32} color="var(--text-3)" />
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>{t('taskPanel.noTasksForFilters')}</p>
            <button onClick={clearFilters} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--ff-text)' }}>{t('taskPanel.clearFilters')}</button>
          </div>
        )}

        {/* Grouped by priority OR by section — kept visible even with 0 tasks (no active filters) so the "no section" bucket's AddTaskRow lets the user create their first task */}
        {(visible.length > 0 || !hasActiveFilters) && <>
          {groupByPriority ? (
            /* ── Priority groups ── */
            <>
              {priorityGroups.map(g => {
                const collapsed = collapsedGroups.has(`prio:${g.priority}`);
                return (
                  <div key={g.priority} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                    {/* Priority group header */}
                    <button
                      onClick={() => toggleGroup(`prio:${g.priority}`)}
                      style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '10px 14px', background: 'transparent', border: 'none', cursor: 'pointer', textAlign: 'left' }}
                    >
                      <SFIcon name={collapsed ? 'chevron-right' : 'chevron-down'} size={13} color="var(--text-3)" />
                      <span style={{ width: 8, height: 8, borderRadius: '50%', background: g.color, flexShrink: 0 }} />
                      <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', fontFamily: 'var(--ff-text)', letterSpacing: '0.02em' }}>{g.label}</span>
                      <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{g.tasks.length}</span>
                    </button>
                    {!collapsed && (
                      <>
                        <div style={{ padding: '0 0 0', borderTop: '1px solid var(--border)' }}>
                          <ColHeader {...colHeaderProps} />
                        </div>
                        {g.tasks.map(task => (
                          <TaskRow key={task.id} task={task} selected={selectedTask?.id === task.id} multiSelected={multiSelIds.has(task.id)} onSelect={handleSelectTask} flashId={flashId} onDelete={isAssignedTask(task.id) ? undefined : () => removeMyTask(task.id)} onConvertRequest={isAssignedTask(task.id) ? undefined : handleConvertRequest} compact={compactColumns} />
                        ))}
                        <AddTaskRow defaultPriority={g.priority} onAdd={(title, opts) => addTask(title, { ...opts, priority: g.priority })} onAddMany={(titles, opts) => addTaskMany(titles, { ...opts, priority: g.priority })} compact={compactColumns} />
                      </>
                    )}
                  </div>
                );
              })}
              {priorityGroups.length === 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <ColHeader {...colHeaderProps} />
                  <AddTaskRow defaultPriority="none" onAdd={(title, opts) => addTask(title, opts)} onAddMany={(titles, opts) => addTaskMany(titles, opts)} compact={compactColumns} />
                </div>
              )}
            </>
          ) : (
            /* ── Section groups (default) ── */
            <>
            {/* Tasks with no section */}
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 0 0' }}>
                <ColHeader {...colHeaderProps} />
              </div>
              {noSectionTasks.map(task => (
                <TaskRow key={task.id} task={task} selected={selectedTask?.id === task.id} multiSelected={multiSelIds.has(task.id)} onSelect={handleSelectTask} flashId={flashId} onDelete={isAssignedTask(task.id) ? undefined : () => removeMyTask(task.id)} onConvertRequest={isAssignedTask(task.id) ? undefined : handleConvertRequest} compact={compactColumns} />
              ))}
              <AddTaskRow defaultPriority="none" onAdd={(title, opts) => addTask(title, opts)} onAddMany={(titles, opts) => addTaskMany(titles, opts)} compact={compactColumns} />
            </div>

            {/* Named sections */}
            {sectionGroups.map(g => {
              const collapsed = collapsedGroups.has(g.label);
              return (
                <div key={g.label} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <SectionHeader
                    label={g.label}
                    count={g.tasks.length}
                    collapsed={collapsed}
                    onToggle={() => toggleGroup(g.label)}
                    onDelete={() => removeMyTaskSection(g.label)}
                    onRename={newLabel => renameMyTaskSection(g.label, newLabel)}
                  />
                  {!collapsed && (
                    <>
                      <div style={{ padding: '8px 0 0' }}>
                        <ColHeader {...colHeaderProps} />
                      </div>
                      {g.tasks.map(task => (
                        <TaskRow key={task.id} task={task} selected={selectedTask?.id === task.id} multiSelected={multiSelIds.has(task.id)} onSelect={handleSelectTask} flashId={flashId} onDelete={isAssignedTask(task.id) ? undefined : () => removeMyTask(task.id)} onConvertRequest={isAssignedTask(task.id) ? undefined : handleConvertRequest} compact={compactColumns} />
                      ))}
                      <AddTaskRow defaultPriority="none" onAdd={(title, opts) => addTask(title, { ...opts, mySection: g.label })} onAddMany={(titles, opts) => addTaskMany(titles, { ...opts, mySection: g.label })} compact={compactColumns} />
                    </>
                  )}
                </div>
              );
            })}
            </>
          )}

            {/* Add section — masqué en mode priorité */}
            {!groupByPriority && addingSection ? (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '4px 0' }}>
                <input
                  autoFocus
                  value={newSectionLabel}
                  onChange={e => setNewSectionLabel(e.target.value)}
                  onKeyDown={e => {
                    if (e.key === 'Enter' && newSectionLabel.trim()) {
                      addMyTaskSection(newSectionLabel.trim());
                      setNewSectionLabel('');
                      setAddingSection(false);
                    }
                    if (e.key === 'Escape') { setAddingSection(false); setNewSectionLabel(''); }
                  }}
                  placeholder={t('taskPanel.sectionNamePlaceholder')}
                  style={{ flex: 1, padding: '8px 14px', borderRadius: 10, border: '1px solid var(--accent)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
                />
                <button onClick={() => { setAddingSection(false); setNewSectionLabel(''); }}
                  style={{ padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                  {t('tasks.cancel')}
                </button>
              </div>
            ) : !groupByPriority ? (
              <button
                onClick={() => setAddingSection(true)}
                style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 14px', background: 'none', border: '1px dashed var(--border)', borderRadius: 'var(--radius)', cursor: 'pointer', color: 'var(--text-3)', fontSize: 12, fontFamily: 'var(--ff-text)', width: '100%', transition: 'border-color 0.1s, color 0.1s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
              >
                <SFIcon name="plus" size={13} />
                {t('taskPanel.newSection')}
              </button>
            ) : null}
          </>}
      </div>
      </div>
      </div>{/* end left column */}

      {/* Multi-select floating action bar */}
      {multiSelIds.size > 0 && createPortal(
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.55)', zIndex: 400 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>{t('taskPanel.taskCount', { count: multiSelIds.size })}</span>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <button onClick={() => setBulkMoveOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="move-right" size={13} />
            {t('taskPanel.move')}
          </button>
          <button onClick={() => setBulkCopyOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="copy" size={13} />
            {t('taskPanel.copy')}
          </button>
          <button onClick={() => {
            [...multiSelIds].filter(id => !isAssignedTask(id)).forEach(id => removeMyTask(id));
            setMultiSelIds(new Set());
          }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'rgba(220,50,50,0.1)', border: '1px solid rgba(220,50,50,0.3)', cursor: 'pointer', color: 'var(--danger)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
            <SFIcon name="trash-2" size={13} />
            {t('tasks.delete')}
          </button>
          <button onClick={() => setMultiSelIds(new Set())} style={{ display: 'flex', padding: 4, borderRadius: 7, background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)' }}>
            <SFIcon name="x" size={14} />
          </button>
        </div>,
        document.body,
      )}

      {bulkMoveOpen && (
        <BulkMoveModal
          count={multiSelIds.size}
          mode="move"
          onMove={(projectId, projectName, projectColor, sectionLabel) => {
            [...multiSelIds].forEach(id => updateMyTask(id, { projectId, projectName, projectColor, sectionLabel }));
            const bySource = new Map<string, string[]>();
            tasks.filter(t => multiSelIds.has(t.id)).forEach(t => {
              const ids = bySource.get(t.projectId) ?? [];
              ids.push(t.id);
              bySource.set(t.projectId, ids);
            });
            bySource.forEach((ids, src) => moveTasks(src, ids, projectId, sectionLabel));
            setMultiSelIds(new Set());
            setBulkMoveOpen(false);
          }}
          onClose={() => setBulkMoveOpen(false)}
        />
      )}

      {bulkCopyOpen && (
        <BulkMoveModal
          count={multiSelIds.size}
          mode="copy"
          onMove={(projectId, _projectName, _projectColor, sectionLabel) => {
            const bySource = new Map<string, string[]>();
            tasks.filter(t => multiSelIds.has(t.id)).forEach(t => {
              const ids = bySource.get(t.projectId) ?? [];
              ids.push(t.id);
              bySource.set(t.projectId, ids);
            });
            bySource.forEach((ids, src) => copyTasks(ids, src, projectId, sectionLabel));
            setMultiSelIds(new Set());
            setBulkCopyOpen(false);
          }}
          onClose={() => setBulkCopyOpen(false)}
        />
      )}

      {/* Convert to subtask picker — restricted to freestanding personal
          tasks on both ends: an assigned (project) task is mutated through
          taskStore.ts, not myTaskStore, so mixing the two here would desync
          from the project's own task list. */}
      {convertRequest && (
        <SubtaskTargetPicker
          pos={convertRequest.pos}
          candidates={tasks.filter(t => t.id !== convertRequest.taskId && !isAssignedTask(t.id))}
          onPick={targetId => {
            convertMyTaskToSubtask(convertRequest.taskId, targetId);
            setConvertRequest(null);
          }}
          onClose={() => setConvertRequest(null)}
        />
      )}

      {/* Inline task panel — même système que dans les tâches d'un projet : divise
          la page en deux plutôt que de s'afficher en overlay par-dessus. */}
      <div style={{ width: selectedTask ? 440 : 0, flexShrink: 0, overflow: 'hidden', transition: 'width 0.2s ease', borderLeft: selectedTask ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column' }}>
        {selectedTask && (
          <TaskPanel
            key={selectedTask.id}
            inline
            task={selectedTask}
            sectionLabel={
              getSections(selectedTask.projectId)
                .find(s => s.tasks.some(t => t.id === selectedTask.id))?.label
              ?? (selectedTask as Task & { phaseLabel?: string }).phaseLabel
            }
            onClose={() => setSelectedTask(null)}
            onUpdate={patch => {
              updateMyTask(selectedTask.id, patch);
              setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
            }}
            onMove={(newProjectId, _newSectionLabel) => {
              const proj = getProjects().find(p => p.id === newProjectId);
              if (proj) {
                const patch = { projectId: newProjectId, projectName: proj.name, projectColor: proj.clientColor };
                updateMyTask(selectedTask.id, patch);
                setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
              }
            }}
          />
        )}
      </div>
    </div>
  );
}
