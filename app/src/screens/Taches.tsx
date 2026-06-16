import React, { useState, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { SFPill, SFAvatar, SFButton, SFIcon, TaskDatePopover, toYMD, parseYMD, fmtTaskDate, formatDisplay } from '../components/ui';
import { PROJECTS, USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import { getMyTasks, updateMyTask, subscribeMyTasks } from '../data/myTaskStore';
import { getSections } from '../data/taskStore';
import type { Task, Priority, ResourceType } from '../types';
import { TaskPanel } from '../components/TaskPanel';

// �"?�"? Constants �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

// cb | titre | sous-tâches | activité | projet | assigné(avatar) | priorité | statut | échéance | more
const GRID = '28px 1fr 80px 65px 160px 36px 110px 130px 90px 28px';

type Filter = 'today' | 'week' | 'late' | 'all';
type SortCol = 'title' | 'priority' | 'status' | 'dueDate';
type SortDir = 'asc' | 'desc';

const PRIORITY_LABEL: Record<Priority, string> = { high: 'Élevée', normal: 'Moyenne', low: 'Basse', none: 'Aucune' };
const PRIORITY_COLOR: Record<Priority, string> = { high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)' };
const PRIORITY_OPTIONS: Priority[] = ['high', 'normal', 'low', 'none'];
const PRIORITY_ORDER: Priority[] = ['high', 'normal', 'low', 'none'];


const FILTERS: { key: Filter; label: string }[] = [
  { key: 'all',   label: 'Tout' },
  { key: 'today', label: "Aujourd'hui" },
  { key: 'week',  label: 'Cette semaine' },
  { key: 'late',  label: 'En retard' },
];

function filterTasks(tasks: Task[], filter: Filter): Task[] {
  switch (filter) {
    case 'today': return tasks.filter(t => t.dueDate === "Aujourd'hui");
    case 'late':  return tasks.filter(t => t.dueDateRed || t.status === 'danger');
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

function ColHeader({ sort, onSort }: { sort: { col: SortCol | null; dir: SortDir }; onSort: (col: SortCol) => void }) {
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
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '0 16px 6px', borderBottom: '1px solid var(--border)' }}>
      <span />
      {sortable('Tâche', 'title')}
      {plain('Sous-tâches')}
      {plain('Activité')}
      {plain('Projet')}
      {plain('Assigné')}
      {sortable('Priorité', 'priority')}
      {sortable('Statut', 'status')}
      {sortable('Date', 'dueDate')}
      <span />
    </div>
  );
}

// �"?�"? Shared helpers �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

const TEAM = Object.values(USERS);

const STATUS_OPTIONS = [
  { value: '',       label: 'Aucun statut' },
  { value: 'warn',   label: 'À faire'      },
  { value: 'info',   label: 'En cours'     },
  { value: 'ok',     label: 'Complété'     },
  { value: 'danger', label: 'En retard'    },
  { value: 'review', label: 'En révision'  },
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 990 }} />
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>
  );
}

// �"?�"? Task row �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

function TaskRow({ task, selected, onSelect, flashId }: { task: Task; selected: boolean; onSelect: (t: Task) => void; flashId?: string | null }) {
  const navigate = useNavigate();
  const [checked, setChecked] = useState(task.checked);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [status, setStatus] = useState(task.status as string);
  const [statusLabel, setStatusLabel] = useState(task.statusLabel);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [endDate, setEndDate] = useState(task.endDate ?? '');
  const [startTime, setStartTime] = useState(task.startTime ?? '');
  const [endTime, setEndTime] = useState(task.endTime ?? '');
  const [assignee, setAssignee] = useState<typeof TEAM[0] | null>(task.assignee ?? null);
  const [sectionLabel, setSectionLabel] = useState(task.sectionLabel ?? '');
  const [open, setOpen] = useState<'priority' | 'status' | 'dueDate' | 'assignee' | 'projsec' | null>(null);
  const [projSearch, setProjSearch] = useState('');
  const [pendingProjId, setPendingProjId] = useState<string | null>(null);
  const projSecBtnRef = useRef<HTMLButtonElement>(null);
  const taskSections = getSections(task.projectId);
  const isFlashing = flashId === task.id;

  const assigneeBtnRef = useRef<HTMLButtonElement>(null);
  const priorityBtnRef = useRef<HTMLButtonElement>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const dueDateBtnRef = useRef<HTMLButtonElement>(null);

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
        gridTemplateColumns: GRID,
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        opacity: checked ? 0.45 : 1,
        background: isFlashing ? 'rgba(249,255,0,0.15)' : selected ? 'rgba(249,255,0,0.04)' : 'transparent',
        borderLeft: isFlashing ? '2px solid var(--accent)' : selected ? '2px solid var(--accent)' : '2px solid transparent',
        transition: 'background 0.5s, border-color 0.5s',
        transition: 'background 0.1s',
      }}
      onMouseEnter={e => { if (!selected) e.currentTarget.style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { if (!selected) e.currentTarget.style.background = 'transparent'; }}
    >
      {/* Checkbox */}
      <button
        onClick={() => setChecked(!checked)}
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

      {/* Titre — clicking opens panel */}
      <span
        onClick={() => onSelect(task)}
        style={{
          fontSize: 13, fontWeight: 500,
          textDecoration: checked ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          color: 'var(--text)', cursor: 'pointer',
        }}
      >
        {task.title}
      </span>

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
                  <span>Retour aux projets</span>
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '2px 8px 4px' }} />
                <p style={{ padding: '2px 10px 4px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Section</p>
                {(() => {
                  const secs = getSections(pendingProjId);
                  const closeAll = () => { setOpen(null); setProjSearch(''); setPendingProjId(null); };
                  return (
                    <>
                      <button onClick={() => { setSectionLabel(''); updateMyTask(task.id, { sectionLabel: '' }); closeAll(); }}
                        style={{ display: 'block', width: '100%', padding: '5px 10px', background: !sectionLabel ? 'var(--surface-3)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>
                        Aucune section
                      </button>
                      {secs.map(s => (
                        <button key={s.label} onClick={() => { setSectionLabel(s.label); updateMyTask(task.id, { sectionLabel: s.label }); closeAll(); }}
                          style={{ display: 'block', width: '100%', padding: '5px 10px', background: s.label === sectionLabel ? 'var(--surface-3)' : 'none', border: 'none', borderRadius: 7, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text)' }}>
                          {s.label}
                        </button>
                      ))}
                      {secs.length === 0 && (
                        <p style={{ padding: '4px 10px 6px', fontSize: 11, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucune section dans ce projet</p>
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
                    <SFIcon name="search" size={11} style={{ position: 'absolute', left: 8, top: '50%', transform: 'translateY(-50%)', color: 'var(--text-3)', pointerEvents: 'none' }} />
                    <input
                      autoFocus
                      value={projSearch}
                      onChange={e => setProjSearch(e.target.value)}
                      placeholder="Rechercher un projet…"
                      style={{ width: '100%', boxSizing: 'border-box', padding: '5px 8px 5px 24px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, fontFamily: 'var(--ff-text)', outline: 'none' }}
                    />
                  </div>
                </div>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                {(() => {
                  const q = projSearch.toLowerCase();
                  const all = PROJECTS.filter(p => !q || p.name.toLowerCase().includes(q) || p.clientName.toLowerCase().includes(q));
                  const current = all.find(p => p.id === task.projectId);
                  const others = all.filter(p => p.id !== task.projectId);
                  const recentOthers = others.slice(0, 3);
                  const moreOthers = others.slice(3);
                  const projBtn = (p: typeof PROJECTS[0]) => (
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
                          <p style={{ padding: '2px 10px 2px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Actuel</p>
                          {projBtn(current)}
                          {recentOthers.length > 0 && (
                            <>
                              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                              <p style={{ padding: '2px 10px 2px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Récents</p>
                              {recentOthers.map(projBtn)}
                            </>
                          )}
                          {moreOthers.length > 0 && (
                            <>
                              <div style={{ height: 1, background: 'var(--border)', margin: '4px 8px' }} />
                              <p style={{ padding: '2px 10px 2px', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Tous les projets</p>
                              {moreOthers.map(projBtn)}
                            </>
                          )}
                        </>
                      )}
                      {(q || !current) && all.map(projBtn)}
                      {all.length === 0 && (
                        <p style={{ padding: '8px 12px', fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucun résultat</p>
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
          title={assignee?.name ?? 'Non assigné'}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}
        >
          {assignee
            ? <SFAvatar initials={assignee.initials} bg={assignee.avatarColor} size={22} />
            : <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SFIcon name="user" size={11} color="var(--text-3)" /></span>
          }
        </button>
        {open === 'assignee' && (
          <InlineDropdown anchorRef={assigneeBtnRef} onClose={() => setOpen(null)}>
            {ddItem(() => { setAssignee(null); setOpen(null); },
              <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>Non assigné</>,
              assignee === null
            )}
            {TEAM.map(u => ddItem(() => { setAssignee(u); setOpen(null); },
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
            background: 'none', border: 'none', cursor: 'pointer', padding: 0,
          }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>
            {PRIORITY_LABEL[priority]}
          </span>
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'priority' && (
          <InlineDropdown anchorRef={priorityBtnRef} onClose={() => setOpen(null)}>
            {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpen(null); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{PRIORITY_LABEL[p]}</>,
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
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {status
            ? <SFPill status={status as Task['status']} small>{statusLabel}</SFPill>
            : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>—</span>
          }
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'status' && (
          <InlineDropdown anchorRef={statusBtnRef} onClose={() => setOpen(null)}>
            {STATUS_OPTIONS.map(o => ddItem(() => { setStatus(o.value); setStatusLabel(o.label); setOpen(null); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{o.label}</>,
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
            color: task.dueDateRed ? 'var(--danger)' : (dueDate && dueDate !== '—') ? 'var(--text-2)' : 'var(--text-3)',
            whiteSpace: 'nowrap',
          }}
        >
          <SFIcon name="calendar" size={10} color={task.dueDateRed ? 'var(--danger)' : 'var(--text-3)'} />
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

      {/* More — opens panel */}
      <button
        onClick={() => onSelect(task)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center' }}
      >
        <SFIcon name="more-horizontal" size={14} color="var(--text-3)" />
      </button>
    </div>
  );
}

// ── Task Detail Panel (moved to src/components/TaskPanel.tsx) ────────────────


// �"?�"? Filter bar with dropdowns �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

function FilterDropdown({ label, count, onClear, children, anchorRef }: {
  label: string; count: number; onClear: () => void; children: React.ReactNode; anchorRef: React.RefObject<HTMLButtonElement | null>;
}) {
  const [open, setOpen] = useState(false);
  const [pos, setPos] = React.useState<{ top: number; left: number } | null>(null);

  const toggle = () => {
    if (!open && anchorRef.current) {
      const r = anchorRef.current.getBoundingClientRect();
      setPos({ top: r.bottom + 4, left: r.left });
    }
    setOpen(v => !v);
  };

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
          <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={11} color="inherit" />
        </button>
        {active && (
          <button
            onClick={e => { e.stopPropagation(); onClear(); }}
            title="Effacer"
            style={{ display: 'flex', alignItems: 'center', padding: '5px 7px 5px 2px', border: 'none', background: 'transparent', color: 'var(--accent)', cursor: 'pointer' }}
            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
            onMouseLeave={e => (e.currentTarget.style.color = 'var(--accent)')}
          >
            <SFIcon name="x" size={12} color="var(--accent)" />
          </button>
        )}
      </div>
      {open && pos && (
        <>
          <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 990 }} />
          <div style={{ position: 'fixed', top: pos.top, left: pos.left, zIndex: 1000, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 11, padding: 6, minWidth: 200, boxShadow: '0 8px 28px rgba(0,0,0,0.5)' }}>
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
      <SFIcon name="sliders" size={12} color="var(--text-3)" />

      <FilterDropdown label="Priorité" count={filterPriorities.size} onClear={onClearPriority} anchorRef={prioRef}>
        {PRIORITY_OPTIONS.map(p => checkRow(PRIORITY_LABEL[p], PRIORITY_COLOR[p], filterPriorities.has(p), () => onTogglePriority(p)))}
      </FilterDropdown>

      <FilterDropdown label="Statut" count={filterStatuses.size} onClear={onClearStatus} anchorRef={statRef}>
        {STATUS_OPTIONS.map(o => checkRow(o.label, STATUS_COLOR[o.value], filterStatuses.has(o.value), () => onToggleStatus(o.value)))}
      </FilterDropdown>
    </div>
  );
}

// �"?�"? Main screen �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

// �"?�"? Add task row �"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?�"?

type AddOpts = { priority: Priority; assignee: typeof TEAM[0] | null; project: typeof PROJECTS[0] | null; status: string; statusLabel: string; dueDate: string };

function AddTaskRow({ defaultPriority, onAdd }: { defaultPriority: Priority; onAdd: (title: string, opts: AddOpts) => void }) {
  const [title, setTitle]       = useState('');
  const [open, setOpen]         = useState(false);
  const [assignee, setAssignee] = useState<typeof TEAM[0] | null>(TEAM[0]);
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

  const reset = () => {
    setTitle(''); setAssignee(TEAM[0]); setProject(null); setPriority(defaultPriority);
    setStatus(''); setStatusLabel(''); setDueDate('');
    setOpen(false); setOpenField(null);
  };

  const submit = () => {
    const t = title.trim();
    if (!t) { reset(); return; }
    onAdd(t, { priority, assignee, status, statusLabel, dueDate: dueDate || '—', project });
    reset();
  };

  const ddItem = (onClick: () => void, children: React.ReactNode, active?: boolean) => (
    <button onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: active ? 'var(--surface-3)' : 'transparent', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', textAlign: 'left' }}
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
        <SFIcon name="plus" size={13} color="inherit" />
        Ajouter une tâche
      </button>
    );
  }

  return (
    <div style={{ borderTop: '1px solid var(--border)', background: 'rgba(249,255,0,0.03)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '8px 16px' }}>
        {/* Checkbox placeholder */}
        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--border-2)', flexShrink: 0 }} />

        {/* Title */}
        <input
          ref={inputRef}
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') reset(); }}
          onBlur={() => { if (title.trim()) submit(); }}
          placeholder="Nom de la tâche..."
          style={{ width: '100%', padding: '4px 0', background: 'transparent', border: 'none', borderBottom: '1px solid var(--accent)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)' }}
        />

        <span />{/* Sous-tâches */}
        <span />{/* Activité */}

        {/* Projet */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('project', e)}
            style={{ display: 'flex', alignItems: 'center', gap: 5, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0, maxWidth: '100%' }}>
            {project
              ? <><i style={{ width: 7, height: 7, borderRadius: '50%', background: project.clientColor, display: 'block', flexShrink: 0 }} /><span style={{ fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{project.name}</span></>
              : <span style={{ fontSize: 11, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', fontStyle: 'italic' }}>Projet—</span>
            }
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'project' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect} minWidth={220}>
              {ddItem(() => { setProject(null); setOpenField(null); },
                <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>Aucun projet</span>,
                project === null
              )}
              {PROJECTS.map(p => ddItem(() => { setProject(p); setOpenField(null); },
                <><i style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor, display: 'block', flexShrink: 0 }} />{p.name}</>,
                project?.id === p.id
              ))}
            </PanelDropdown>
          )}
        </div>

        {/* Assigné — avatar only */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('assignee', e)}
            title={assignee?.name ?? 'Non assigné'}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex' }}>
            {assignee
              ? <SFAvatar initials={assignee.initials} bg={assignee.avatarColor} size={22} />
              : <span style={{ width: 22, height: 22, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}><SFIcon name="user" size={11} color="var(--text-3)" /></span>
            }
          </button>
          {openField === 'assignee' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect} minWidth={180}>
              {ddItem(() => { setAssignee(null); setOpenField(null); },
                <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>Non assigné</>,
                assignee === null)}
              {TEAM.map(u => ddItem(() => { setAssignee(u); setOpenField(null); },
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
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{PRIORITY_LABEL[priority]}</span>
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'priority' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect}>
              {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{PRIORITY_LABEL[p]}</>,
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
              : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>Aucun</span>
            }
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'status' && (
            <PanelDropdown onClose={() => setOpenField(null)} anchorRect={dropRect}>
              {STATUS_OPTIONS.map(o => ddItem(() => { setStatus(o.value); setStatusLabel(o.label); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{o.label}</>,
                status === o.value
              ))}
            </PanelDropdown>
          )}
        </div>

        {/* Due date */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openDrop('dueDate', e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', whiteSpace: 'nowrap' }}>
            {dueDate || 'Échéance'}
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'dueDate' && (
            <DatePickerDropdown value={dueDate} onChange={v => { setDueDate(formatDisplay(v)); setOpenField(null); }} onClose={() => setOpenField(null)} anchorRect={dropRect} />
          )}
        </div>

        {/* Cancel */}
        <button onMouseDown={e => e.preventDefault()} onClick={reset}
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
  const [filter, setFilter]           = useState<Filter>('all');
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [tasks, setTasks]             = useState<Task[]>(getMyTasks);
  const [flashId, setFlashId]         = useState<string | null>(null);
  const [sortCol, setSortCol]         = useState<SortCol | null>(null);
  const [sortDir, setSortDir]         = useState<SortDir>('asc');
  const [filterPriorities, setFilterPriorities] = useState<Set<Priority>>(new Set());
  const [filterStatuses, setFilterStatuses]     = useState<Set<string>>(new Set());
  const [collapsedGroups, setCollapsedGroups]   = useState<Set<Priority>>(new Set());

  React.useEffect(() => subscribeMyTasks(() => setTasks(getMyTasks())), []);

  const toggleGroup = (p: Priority) =>
    setCollapsedGroups(prev => { const s = new Set(prev); s.has(p) ? s.delete(p) : s.add(p); return s; });

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

  const togglePriorityFilter = (p: Priority) => {
    setFilterPriorities(prev => {
      const next = new Set(prev);
      if (next.has(p)) next.delete(p); else next.add(p);
      return next;
    });
  };

  const toggleStatusFilter = (s: string) => {
    setFilterStatuses(prev => {
      const next = new Set(prev);
      if (next.has(s)) next.delete(s); else next.add(s);
      return next;
    });
  };

  const clearFilters = () => { setFilterPriorities(new Set()); setFilterStatuses(new Set()); };

  const addTask = useCallback((title: string, opts: AddOpts) => {
    const newTask: Task = {
      id: `my-${Date.now()}`,
      title,
      projectId: opts.project?.id ?? 'int',
      projectName: opts.project?.name ?? 'Interne',
      projectColor: opts.project?.clientColor ?? 'var(--text-3)',
      assignee: opts.assignee ?? USERS.lea,
      status: opts.status as Task['status'],
      statusLabel: opts.statusLabel,
      priority: opts.priority,
      priorityLabel: PRIORITY_LABEL[opts.priority],
      dueDate: opts.dueDate,
      dueDateRed: false,
      checked: false,
      subtasks: [],
    };
    setTasks(prev => [...prev, newTask]);
  }, []);

  const flash = useCallback((id: string) => {
    setFlashId(id);
    setTimeout(() => setFlashId(null), 1500);
  }, []);

  // Apply date filter ↑' priority filter ↑' status filter ↑' sort
  let visible = filterTasks(tasks, filter);
  if (filterPriorities.size > 0) visible = visible.filter(t => filterPriorities.has(t.priority));
  if (filterStatuses.size > 0)   visible = visible.filter(t => filterStatuses.has(t.status as string));

  const lateCount = tasks.filter(t => t.dueDateRed || t.status === 'danger').length;
  const hasActiveFilters = filterPriorities.size > 0 || filterStatuses.size > 0;

  // Grouped view (priority) vs flat sorted view
  const grouped = PRIORITY_ORDER
    .map(p => ({ priority: p, tasks: sortCol && sortCol !== 'priority' ? sortTasks(visible.filter(t => t.priority === p), sortCol, sortDir) : visible.filter(t => t.priority === p) }))
    .filter(g => g.tasks.length > 0);

  const flatSorted = sortCol ? sortTasks(visible, sortCol, sortDir) : visible;
  const useFlat = sortCol !== null;

  const colHeaderProps = { sort: { col: sortCol as SortCol | null, dir: sortDir }, onSort: handleSort };

  const filterTabBtn = (f: { key: Filter; label: string }) => (
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
      {f.label}
    </button>
  );

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Header + filter bar */}
      <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
        {/* Topbar */}
        <div style={{ padding: '12px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderBottom: '1px solid var(--border)' }}>
          <div>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>Mes tâches</h1>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              {visible.length}/{tasks.length} tâches
              {lateCount > 0 && <> · <span style={{ color: 'var(--danger)' }}>{lateCount} en retard</span></>}
            </p>
          </div>
        </div>

        {/* Filter bar — date tabs left, dropdowns right */}
        <div style={{ padding: '4px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
          <div style={{ display: 'flex', gap: 2 }}>
            {FILTERS.map(filterTabBtn)}
          </div>
          <FilterBar
            filterPriorities={filterPriorities}
            filterStatuses={filterStatuses}
            onTogglePriority={togglePriorityFilter}
            onToggleStatus={toggleStatusFilter}
            onClearPriority={() => setFilterPriorities(new Set())}
            onClearStatus={() => setFilterStatuses(new Set())}
          />
        </div>
      </div>

      {/* Body */}
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '20px 24px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

        {visible.length === 0 && (
          <div style={{ padding: '80px 0', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
            <SFIcon name="check-circle" size={32} color="var(--text-3)" />
            <p style={{ fontSize: 13, color: 'var(--text-3)' }}>Aucune tâche pour ces filtres</p>
            {hasActiveFilters && <button onClick={clearFilters} style={{ fontSize: 12, color: 'var(--accent)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline', fontFamily: 'var(--ff-text)' }}>Effacer les filtres</button>}
          </div>
        )}

        {useFlat ? (
          /* Flat sorted view */
          flatSorted.length > 0 && (
            <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
              <div style={{ padding: '8px 0 0' }}>
                <ColHeader {...colHeaderProps} />
              </div>
              {flatSorted.map(task => (
                <TaskRow key={task.id} task={task} selected={selectedTask?.id === task.id} onSelect={setSelectedTask} flashId={flashId} />
              ))}
              <AddTaskRow defaultPriority="normal" onAdd={(title, opts) => addTask(title, opts)} />
            </div>
          )
        ) : (
          /* Grouped by priority */
          grouped.map((g) => {
            const collapsed = collapsedGroups.has(g.priority);
            return (
              <div key={g.priority} style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                <button
                  onClick={() => toggleGroup(g.priority)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', width: '100%', background: 'var(--surface-2)', border: 'none', borderBottom: collapsed ? 'none' : '1px solid var(--border)', cursor: 'pointer', textAlign: 'left' }}
                >
                  <SFIcon name={collapsed ? 'chevron-right' : 'chevron-down'} size={13} color="var(--text-3)" />
                  <span style={{ width: 8, height: 8, borderRadius: '50%', background: PRIORITY_COLOR[g.priority], display: 'block', flexShrink: 0 }} />
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--text-2)', fontWeight: 600 }}>
                    {PRIORITY_LABEL[g.priority]}
                  </span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>({g.tasks.length})</span>
                </button>
                {!collapsed && (
                  <>
                    <div style={{ padding: '8px 0 0' }}>
                      <ColHeader {...colHeaderProps} />
                    </div>
                    {g.tasks.map(task => (
                      <TaskRow key={task.id} task={task} selected={selectedTask?.id === task.id} onSelect={setSelectedTask} flashId={flashId} />
                    ))}
                    <AddTaskRow defaultPriority={g.priority} onAdd={(title, opts) => addTask(title, opts)} />
                  </>
                )}
              </div>
            );
          })
        )}
      </div>
      </div>

      {/* Task panel overlay */}
      {selectedTask && (
        <TaskPanel
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
            const proj = PROJECTS.find(p => p.id === newProjectId);
            if (proj) {
              const patch = { projectId: newProjectId, projectName: proj.name, projectColor: proj.clientColor };
              updateMyTask(selectedTask.id, patch);
              setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
            }
          }}
        />
      )}
    </div>
  );
}
