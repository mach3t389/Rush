import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate, useSearchParams, NavLink } from 'react-router-dom';
import { SFPill, SFAvatar, SFBar, SFButton, SFIcon, TaskDatePopover, DatePickerDropdown, TimePickerDropdown, TimeButton, toYMD, parseYMD, fmtTaskDate, formatDisplay, isOverdue, TODAY_DP } from '../components/ui';
import { PROJECT_TASKS, RESOURCES, USERS } from '../data/mock';
import { findProject } from '../data/projectStore';
import { STATUS_COLOR } from '../data/status';
import { getSections, setSections as setSections_store, subscribeStore, updateTask, moveTask } from '../data/taskStore';
import { markTaskRead } from '../data/notificationStore';
import { useTaskNotifCount } from '../hooks/useNotifs';
import { usePersistedState } from '../hooks/usePersistedState';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { updateResource, getResources, subscribeResources } from '../data/resourceStore';
import { loadCustomTemplates, saveCustomTemplates, BUILT_IN_TEMPLATES } from '../data/templates';
import type { ProjectTemplate } from '../data/templates';
import type { Task, Priority, ResourceType, SectionData, Status } from '../types';
import { TravailBoard } from './TravailBoard';
import { ResourceBody } from './ResourceDetail';
import { TaskPanel } from '../components/TaskPanel';

// ── Constants ─────────────────────────────────────────────────────────────────

const PHASES = [
  { key: 'preproduction',  label: 'Préproduction' },
  { key: 'production',     label: 'Production' },
  { key: 'postproduction', label: 'Postproduction' },
  { key: 'livraison',      label: 'Livraison' },
];

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

const RESOURCE_STATUS_OPTIONS: { status: Status; label: string }[] = [
  { status: 'ok',      label: 'Terminé'     },
  { status: 'info',    label: 'En cours'    },
  { status: 'warn',    label: 'À faire'     },
  { status: 'review',  label: 'En révision' },
  { status: 'danger',  label: 'Bloqué'      },
  { status: 'neutral', label: 'En attente'  },
];

// ── Shared helpers ────────────────────────────────────────────────────────────

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

// ── Move task modal ────────────────────────────────────────────────────────────

function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
  const otherSections = sections;
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '20px', minWidth: 320, maxWidth: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>Déplacer la tâche</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
        <p style={{ fontSize: 12, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--ff-mono)', letterSpacing: '0.05em', textTransform: 'uppercase', fontSize: 10 as unknown as number }}>Tâche : {task.title}</p>
        <div style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, marginTop: 14 }}>Sections disponibles</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {otherSections.map(s => (
            <button
              key={s.label}
              onClick={() => { onMove(s.label); onClose(); }}
              style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', borderRadius: 10, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', transition: 'border-color 0.1s' }}
              onMouseEnter={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
              onMouseLeave={e => (e.currentTarget.style.borderColor = 'var(--border)')}
            >
              <SFIcon name="layers" size={13} color="var(--text-3)" />
              <div>
                <p style={{ fontSize: 13, fontWeight: 500 }}>{s.label}</p>
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{s.tasks.length} tâche{s.tasks.length !== 1 ? 's' : ''}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Column header ──────────────────────────────────────────────────────────────

const GRID = '28px 1fr 80px 65px 160px 110px 130px 90px 28px';

const COL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--ff-mono)', fontSize: 10,
  color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase',
};

function ColHeader() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '0 16px 6px', borderBottom: '1px solid var(--border)' }}>
      <span />
      <span style={COL_STYLE}>Titre</span>
      <span style={COL_STYLE}>Sous-tâches</span>
      <span style={COL_STYLE}>Activité</span>
      <span style={COL_STYLE}>Assigné à</span>
      <span style={COL_STYLE}>Priorité</span>
      <span style={COL_STYLE}>Statut</span>
      <span style={COL_STYLE}>Date</span>
      <span />
    </div>
  );
}

// ── Shared inline dropdown ────────────────────────────────────────────────────

function InlineDropdown({ onClose, children, anchorRect, minWidth = 160, zIndex = 1000 }: {
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
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>,
    document.body
  );
}

const STATUS_OPTIONS = [
  { value: '',       label: 'Aucun statut' },
  { value: 'warn',   label: 'À faire'      },
  { value: 'info',   label: 'En cours'     },
  { value: 'ok',     label: 'Complété'     },
  { value: 'danger', label: 'En retard'    },
  { value: 'review', label: 'En révision'  },
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

// ── Task row ──────────────────────────────────────────────────────────────────

const TEAM = Object.values(USERS);

function TaskRow({
  task,
  selected,
  onSelect,
  onTaskDragStart,
  onTaskDragEnd,
  allSections,
  onMoveToSection,
}: {
  task: Task;
  selected: boolean;
  onSelect: (t: Task) => void;
  onTaskDragStart?: () => void;
  onTaskDragEnd?: () => void;
  allSections?: SectionData[];
  onMoveToSection?: (toSectionLabel: string) => void;
}) {
  const [checked, setChecked] = useState(task.checked);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [assignee, setAssignee] = useState<typeof TEAM[0] | null>(task.assignee);
  const [status, setStatus] = useState(task.status as string);
  const [statusLabel, setStatusLabel] = useState(task.statusLabel);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [endDate, setEndDate] = useState(task.endDate ?? '');
  const [startTime, setStartTime] = useState(task.startTime ?? '');
  const [endTime, setEndTime] = useState(task.endTime ?? '');
  const { projectId: rowProjectId } = useParams<{ projectId: string }>();
  const [open, setOpen] = useState<'priority' | 'assignee' | 'status' | 'dueDate' | 'context' | null>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const dragHandleActive = React.useRef(false);

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
        gridTemplateColumns: GRID,
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        background: selected ? 'rgba(249,255,0,0.04)' : hovered ? 'var(--surface-2)' : 'transparent',
        borderLeft: selected ? '2px solid var(--accent)' : task.deliverable ? '2px solid rgba(249,255,0,0.3)' : '2px solid transparent',
        opacity: checked ? 0.45 : 1,
        transition: 'background 0.1s',
      }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
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
          onClick={() => { const next = !checked; setChecked(next); if (rowProjectId) updateTask(rowProjectId, task.id, { checked: next }); }}
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

      {/* Title — clicking opens panel */}
      <div onClick={() => onSelect(task)} style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', cursor: 'pointer' }}>
        {task.deliverable && <SFIcon name="package" size={11} color="var(--accent)" />}
        <span style={{ fontSize: 13, fontWeight: 500, textDecoration: checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {task.title}
        </span>
      </div>

      {/* Sous-tâches */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
        {hasSubtasks ? (
          <>
            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
              {task.subtasks!.length}
            </span>
          </>
        ) : (
          <span style={{ color: 'var(--border-2)', fontFamily: 'var(--ff-mono)', fontSize: 10 }}>—</span>
        )}
      </div>

      {/* Activité */}
      <TaskActivityCell taskId={task.id} />

      {/* Assignee — inline dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('assignee', e)}
          style={{ display: 'flex', alignItems: 'center', gap: 7, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}
        >
          {assignee
            ? <SFAvatar initials={assignee.initials} bg={assignee.avatarColor} size={20} />
            : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={11} color="var(--text-3)" /></span>
          }
          <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee?.name ?? 'Non assigné'}</span>
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'assignee' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect} minWidth={180}>
            {ddItem(() => { setAssignee(null); setOpen(null); },
              <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>Non assigné</>,
              assignee === null
            )}
            {TEAM.map(u => ddItem(() => { setAssignee(u); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { assignee: u }); },
              <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
              assignee?.id === u.id
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Priority — inline dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('priority', e)}
          style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
        >
          <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{PRIORITY_LABEL[priority]}</span>
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'priority' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect}>
            {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { priority: p, priorityLabel: PRIORITY_LABEL[p] }); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{PRIORITY_LABEL[p]}</>,
              priority === p
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Status — inline dropdown */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('status', e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}
        >
          {status
            ? <SFPill status={status as Task['status']} small>{statusLabel}</SFPill>
            : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>—</span>
          }
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'status' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect}>
            {STATUS_OPTIONS.map(o => ddItem(() => { setStatus(o.value); setStatusLabel(o.label); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { status: o.value as Task['status'], statusLabel: o.label }); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{o.label}</>,
              status === o.value
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Date — date + time picker */}
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

      {/* Context menu "..." */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('context', e)}
          style={{ color: 'var(--text-3)', display: 'flex', background: 'none', border: 'none', cursor: 'pointer', padding: 3, borderRadius: 5 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'none'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="more-horizontal" size={14} />
        </button>
        {open === 'context' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect} minWidth={180}>
            {ddItem(() => { onSelect(task); setOpen(null); }, <><SFIcon name="maximize-2" size={13} color="var(--text-3)" />Ouvrir le détail</>)}
            {allSections && allSections.length > 1 && ddItem(() => { setOpen(null); setShowMoveModal(true); }, <><SFIcon name="move-right" size={13} color="var(--text-3)" />Déplacer vers...</>)}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            {ddItem(() => setOpen(null), <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}><SFIcon name="trash-2" size={13} color="var(--danger)" />Supprimer</span>)}
          </InlineDropdown>
        )}
      </div>
    </div>
    {showMoveModal && allSections && onMoveToSection && (
      <MoveTaskModal
        task={task}
        sections={allSections}
        onMove={onMoveToSection}
        onClose={() => setShowMoveModal(false)}
      />
    )}
    </>
  );
}

// ── Add task row ───────────────────────────────────────────────────────────────

function AddTaskRow({ projectId, projectName, projectColor, onAdd }: {
  projectId: string;
  projectName: string;
  projectColor: string;
  onAdd: (task: Task) => void;
}) {
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<typeof TEAM[0]>(TEAM[0]);
  const [priority, setPriority] = useState<Priority>('normal');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('');
  const [statusLabel, setStatusLabel] = useState('');
  const [openField, setOpenField] = useState<'assignee' | 'priority' | 'status' | 'dueDate' | null>(null);
  const [addDropRect, setAddDropRect] = useState<DOMRect | null>(null);

  const openAddDrop = (key: typeof openField, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpenField(prev => prev === key ? null : key);
    setAddDropRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
  };

  const reset = () => {
    setTitle(''); setAssignee(TEAM[0]); setPriority('normal');
    setDueDate(''); setStatus(''); setStatusLabel('');
    setAdding(false); setOpenField(null);
  };

  const commit = (titleOverride?: string) => {
    const t = (titleOverride ?? title).trim();
    if (!t) { reset(); return; }
    onAdd({
      id: `task-${Date.now()}`,
      title: t,
      projectId, projectName, projectColor,
      assignee,
      status: status as Task['status'],
      statusLabel,
      priority,
      priorityLabel: PRIORITY_LABEL[priority],
      dueDate: dueDate || '—',
      dueDateRed: false,
      checked: false,
      subtasks: [],
    });
    reset();
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
        Ajouter une tâche
      </button>
    );
  }

  return (
    <div style={{ background: 'rgba(249,255,0,0.03)' }}>
      <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '8px 16px' }}>

        {/* Checkbox placeholder */}
        <div style={{ width: 16, height: 16, borderRadius: '50%', border: '1.5px solid var(--border-2)', flexShrink: 0 }} />

        {/* Title — Enter commits, Escape cancels */}
        <input
          autoFocus
          value={title}
          onChange={e => setTitle(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commit(); if (e.key === 'Escape') reset(); }}
          onBlur={() => { if (title.trim()) commit(); }}
          placeholder="Nom de la tâche..."
          style={{
            width: '100%', padding: '4px 0', background: 'transparent',
            border: 'none', borderBottom: '1px solid var(--accent)',
            color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)',
          }}
        />

        <span />{/* Sous-tâches */}
        <span />{/* Activité */}

        {/* Assignee — custom dropdown */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openAddDrop('assignee', e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
            <SFAvatar initials={assignee.initials} bg={assignee.avatarColor} size={20} />
            <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee.name}</span>
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'assignee' && (
            <InlineDropdown onClose={() => setOpenField(null)} anchorRect={addDropRect} minWidth={180}>
              {TEAM.map(u => ddItem(() => { setAssignee(u); setOpenField(null); },
                <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
                assignee.id === u.id
              ))}
            </InlineDropdown>
          )}
        </div>

        {/* Priority — custom dropdown */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openAddDrop('priority', e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[priority], flexShrink: 0, display: 'block' }} />
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{PRIORITY_LABEL[priority]}</span>
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'priority' && (
            <InlineDropdown onClose={() => setOpenField(null)} anchorRect={addDropRect}>
              {PRIORITY_OPTIONS.map(p => ddItem(() => { setPriority(p); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{PRIORITY_LABEL[p]}</>,
                priority === p
              ))}
            </InlineDropdown>
          )}
        </div>

        {/* Status — custom dropdown */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openAddDrop('status', e)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4 }}>
            {status
              ? <SFPill status={status as Task['status']} small>{statusLabel}</SFPill>
              : <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>Aucun</span>
            }
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'status' && (
            <InlineDropdown onClose={() => setOpenField(null)} anchorRect={addDropRect}>
              {STATUS_OPTIONS.map(o => ddItem(() => { setStatus(o.value); setStatusLabel(o.label); setOpenField(null); },
                <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{o.label}</>,
                status === o.value
              ))}
            </InlineDropdown>
          )}
        </div>

        {/* Date — custom dropdown */}
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

        {/* Cancel only — X deletes the row */}
        <button
          onMouseDown={e => e.preventDefault()}
          onClick={reset}
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
  label, tasks, completed, selectedTask, onSelectTask, onToggleComplete,
  onDragStart, isDragging, onAddTask, onDelete,
  projectId, projectName, projectColor,
  draggedTask, onTaskDrop, onTaskDragEnd, allSections, onMoveTaskToSection,
}: {
  label: string;
  tasks: Task[];
  completed: boolean;
  selectedTask: Task | null;
  onSelectTask: (t: Task) => void;
  onToggleComplete: () => void;
  onDragStart: () => void;
  isDragging: boolean;
  onAddTask: (task: Task) => void;
  onDelete: () => void;
  projectId: string;
  projectName: string;
  projectColor: string;
  draggedTask: { task: Task; fromSectionLabel: string } | null;
  onTaskDragStart: (task: Task) => void;
  onTaskDragEnd: () => void;
  onTaskDrop: (task: Task, fromSectionLabel: string, toSectionLabel: string, beforeTaskId?: string) => void;
  allSections: SectionData[];
  onMoveTaskToSection: (task: Task, fromLabel: string, toLabel: string) => void;
}) {
  const done = tasks.filter(t => t.checked).length;
  const progress = tasks.length > 0 ? (done / tasks.length) * 100 : 0;
  const [collapsed, setCollapsed] = useState(completed);
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
  const [taskDragOverIdx, setTaskDragOverIdx] = useState<number | null>(null);
  const sectionDragHandleActive = React.useRef(false);

  const isExternalTaskDrag = draggedTask !== null && draggedTask.fromSectionLabel !== label;
  const isSameTaskDrag = draggedTask !== null && draggedTask.fromSectionLabel === label;

  const handleTaskSlotDrop = (insertIdx: number) => {
    if (!draggedTask) return;
    const beforeTask = tasks[insertIdx];
    onTaskDrop(draggedTask.task, draggedTask.fromSectionLabel, label, beforeTask?.id);
    setTaskDragOverIdx(null);
  };

  const dropLeaveTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);

  const DropLine = ({ idx }: { idx: number }) => (
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
      style={{
        height: taskDragOverIdx === idx ? 28 : 2,
        display: 'flex', alignItems: 'center',
        transition: 'height 0.12s',
        margin: taskDragOverIdx === idx ? '1px 14px' : '0 14px',
      }}
    >
      {taskDragOverIdx === idx && (
        <div style={{ width: '100%', height: 2, borderRadius: 2, background: 'var(--accent)', boxShadow: '0 0 8px var(--accent)' }} />
      )}
    </div>
  );

  return (
    <div
      draggable
      onDragStart={e => {
        if (!sectionDragHandleActive.current) { e.preventDefault(); return; }
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
        style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 14px', borderBottom: '1px solid var(--border)', background: completed ? 'rgba(255,255,255,0.02)' : 'transparent' }}
      >

        {/* Drag handle */}
        <div
          onMouseDown={() => { sectionDragHandleActive.current = true; }}
          onMouseUp={() => { sectionDragHandleActive.current = false; }}
          style={{ color: 'var(--border-2)', cursor: 'grab', display: 'flex', flexShrink: 0, paddingRight: 2 }}
          title="Réordonner la section"
        >
          <SFIcon name="grip-vertical" size={14} />
        </div>

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

        <span style={{
          fontWeight: 600, fontSize: 13,
          textDecoration: completed ? 'line-through' : 'none',
          color: completed ? 'var(--text-3)' : 'var(--text)',
        }}>
          {label}
        </span>

        {completed && (
          <span style={{
            fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--ok)',
            background: 'rgba(0,200,100,0.1)', border: '1px solid rgba(0,200,100,0.2)',
            borderRadius: 5, padding: '2px 7px', letterSpacing: '0.06em', textTransform: 'uppercase',
          }}>
            Terminée
          </span>
        )}

        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>({tasks.length} tâches)</span>
        <div style={{ flex: 1, maxWidth: 140 }}>
          <SFBar value={completed ? 100 : progress} height={3} />
        </div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{done}/{tasks.length}</span>

        {/* Delete section */}
        <button
          onClick={e => { e.stopPropagation(); if (tasks.length > 0) { setConfirmDelete(true); } else { onDelete(); } }}
          title="Supprimer la section"
          style={{ visibility: headerHovered && !confirmDelete ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="trash-2" size={11} />
        </button>
        {confirmDelete && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}>
            <span style={{ fontSize: 11, color: 'var(--danger)', fontFamily: 'var(--ff-mono)' }}>Supprimer {tasks.length} tâche{tasks.length > 1 ? 's' : ''} ?</span>
            <button
              onClick={e => { e.stopPropagation(); onDelete(); }}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--danger)', background: 'rgba(255,60,60,0.1)', color: 'var(--danger)', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
            >Oui</button>
            <button
              onClick={e => { e.stopPropagation(); setConfirmDelete(false); }}
              style={{ fontSize: 11, padding: '2px 8px', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
            >Annuler</button>
          </div>
        )}
      </div>

      {!collapsed && (
        <>
          <ColHeader />
          <DropLine idx={0} />
          {tasks.map((task, i) => (
            <React.Fragment key={task.id}>
              <TaskRow
                task={task}
                selected={selectedTask?.id === task.id}
                onSelect={onSelectTask}
                onTaskDragStart={() => onTaskDragStart(task)}
                onTaskDragEnd={onTaskDragEnd}
                allSections={allSections}
                onMoveToSection={toLabel => onMoveTaskToSection(task, label, toLabel)}
              />
              <DropLine idx={i + 1} />
            </React.Fragment>
          ))}
          <AddTaskRow projectId={projectId} projectName={projectName} projectColor={projectColor} onAdd={onAddTask} />
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

const MOCK_CHECKLIST = [
  { id: 1, done: true,  text: 'Réserver le studio principal' },
  { id: 2, done: true,  text: 'Confirmer les créneaux avec l\'équipe' },
  { id: 3, done: true,  text: 'Commander les batteries Li-Ion supplémentaires' },
  { id: 4, done: false, text: 'Vérifier la liste des accessoires lumière' },
  { id: 5, done: false, text: 'Imprimer les feuilles de service' },
  { id: 6, done: false, text: 'Contacter le régisseur pour les autorisations' },
  { id: 7, done: false, text: 'Préparer les disques durs de backup' },
  { id: 8, done: false, text: 'Tester le matériel audio la veille' },
  { id: 9, done: false, text: 'Envoyer le planning final au client' },
  { id: 10,done: false, text: 'Briefer l\'équipe technique sur place' },
];

const MOCK_DOCUMENT = `BRIEF CRÉATIF — CAMPAGNE ÉTÉ 2025
Nova Films × StudioFlow

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
  const [checkItems, setCheckItems] = React.useState(MOCK_CHECKLIST);

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

  if (res.type === 'script' || res.type === 'document') {
    const content = res.type === 'script' ? MOCK_SCRIPT : MOCK_DOCUMENT;
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

  if (res.type === 'checklist') {
    const done = checkItems.filter(c => c.done).length;
    return (
      <div style={{ maxWidth: 600, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{ flex: 1, height: 6, borderRadius: 3, background: 'var(--surface-3)', overflow: 'hidden' }}>
            <div style={{ height: '100%', width: `${(done / checkItems.length) * 100}%`, background: 'var(--ok)', borderRadius: 3, transition: 'width 0.3s' }} />
          </div>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--ok)', whiteSpace: 'nowrap' }}>{done}/{checkItems.length} complétés</span>
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {checkItems.map(item => (
            <div key={item.id}
              onClick={() => setCheckItems(prev => prev.map(c => c.id === item.id ? { ...c, done: !c.done } : c))}
              style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '11px 16px', borderRadius: 10, border: `1px solid ${item.done ? 'var(--border)' : 'var(--border-2)'}`, background: item.done ? 'transparent' : 'var(--surface-2)', cursor: 'pointer', transition: 'all 0.12s', opacity: item.done ? 0.55 : 1 }}
            >
              <div style={{ width: 18, height: 18, borderRadius: '50%', border: item.done ? 'none' : '1.5px solid var(--border-2)', background: item.done ? 'var(--ok)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {item.done && <SFIcon name="check" size={10} color="white" />}
              </div>
              <span style={{ fontSize: 13, color: 'var(--text-2)', textDecoration: item.done ? 'line-through' : 'none', flex: 1 }}>{item.text}</span>
            </div>
          ))}
        </div>
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
      <div style={{ display: 'flex', gap: 10 }}>
        <SFButton variant="secondary" icon="external-link">Ouvrir dans l'onglet</SFButton>
        <SFButton variant="ghost" icon="download">Télécharger</SFButton>
      </div>
    </div>
  );
}

// ── Task Detail Panel ──────────────────────────────────────────────────────────

// ── Screen ─────────────────────────────────────────────────────────────────────



function loadViewPref<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback; } catch { return fallback; }
}

// ── Save as template modal ─────────────────────────────────────────────────────

const TEMPLATE_COLORS = ['#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8', '#a85f3e', '#2a7a8a', '#7a6a2a'];

const STATUS_DOT: Record<string, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', info: 'var(--info)',
  danger: 'var(--danger)', review: 'var(--accent)', neutral: 'var(--text-3)',
};

function SaveAsTemplateModal({ projectName, sections, onClose }: {
  projectName: string;
  sections: SectionData[];
  onClose: () => void;
}) {
  const [step, setStep] = useState<1 | 2>(1);
  const [name, setName] = useState(projectName);
  const [description, setDescription] = useState('');
  const [color, setColor] = useState('#3b4f8f');
  const [tags, setTags] = useState('');
  const [keepPriorities, setKeepPriorities] = useState(true);
  const [keepStatuses, setKeepStatuses] = useState(true);
  const [keepDueDates, setKeepDueDates] = useState(false);
  const [keepDescriptions, setKeepDescriptions] = useState(true);
  const [keepSubtasks, setKeepSubtasks] = useState(true);
  const [saved, setSaved] = useState(false);

  const totalTasks = sections.reduce((s, sec) => s + sec.tasks.length, 0);

  const convertTask = (t: Task): import('../data/templates').TemplateTask => ({
    title: t.title,
    priority: keepPriorities ? (t.priority ?? 'normal') : 'normal',
    ...(keepStatuses && t.status ? { status: t.status, statusLabel: t.statusLabel } : {}),
    ...(keepDueDates && t.dueDate ? { dueDate: t.dueDate } : {}),
    ...(keepSubtasks && t.subtasks?.length ? { subtasks: t.subtasks.map(convertTask) } : {}),
  });

  const handleSave = () => {
    if (!name.trim()) return;
    const tpl: ProjectTemplate = {
      id: `tpl-${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      color,
      icon: 'folder',
      tags: tags.split(',').map(t => t.trim()).filter(Boolean),
      sections: sections.map(s => ({
        label: s.label,
        tasks: s.tasks.map(convertTask),
      })),
      resources: [],
      builtIn: false,
      createdAt: new Date().toISOString().split('T')[0],
    };
    const existing = loadCustomTemplates();
    saveCustomTemplates([...existing, tpl]);
    setSaved(true);
    setTimeout(onClose, 1400);
  };

  const fStyle: React.CSSProperties = {
    width: '100%', padding: '8px 10px', borderRadius: 9,
    border: '1px solid var(--border)', background: 'var(--surface-2)',
    color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)',
    outline: 'none', boxSizing: 'border-box', colorScheme: 'dark',
  };
  const lStyle: React.CSSProperties = {
    fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)',
    textTransform: 'uppercase', letterSpacing: '0.07em',
  };

  const ToggleRow = ({ label, sublabel, value, onChange }: { label: string; sublabel: string; value: boolean; onChange: (v: boolean) => void }) => (
    <button onClick={() => onChange(!value)} style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 12px', borderRadius: 10, border: `1px solid ${value ? 'var(--border-2)' : 'var(--border)'}`, background: value ? 'var(--surface-2)' : 'transparent', cursor: 'pointer', textAlign: 'left', width: '100%' }}>
      <div style={{ flex: 1 }}>
        <p style={{ fontSize: 13, fontWeight: 500, color: 'var(--text)' }}>{label}</p>
        <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{sublabel}</p>
      </div>
      <div style={{ width: 36, height: 20, borderRadius: 999, flexShrink: 0, background: value ? 'var(--accent)' : 'var(--surface-3)', position: 'relative', transition: 'background 0.15s' }}>
        <div style={{ position: 'absolute', top: 3, left: value ? 18 : 3, width: 14, height: 14, borderRadius: '50%', background: value ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
      </div>
    </button>
  );

  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 200 }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%,-50%)',
        width: 520, zIndex: 201, background: 'var(--surface)',
        border: '1px solid var(--border-2)', borderRadius: 16,
        boxShadow: '0 24px 80px rgba(0,0,0,0.75)', overflow: 'hidden',
        display: 'flex', flexDirection: 'column', maxHeight: '90vh',
      }}>
        {/* Header */}
        <div style={{ padding: '16px 22px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          {step === 2 && (
            <button onClick={() => setStep(1)} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11, fontFamily: 'var(--ff-text)' }}>
              <SFIcon name="arrow-left" size={11} />Retour
            </button>
          )}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>
              {step === 1 ? 'Enregistrer comme modèle' : 'Options de sauvegarde'}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {step === 1
                ? `${sections.length} section${sections.length > 1 ? 's' : ''} · ${totalTasks} tâche${totalTasks > 1 ? 's' : ''}`
                : 'Choisissez ce que vous souhaitez conserver dans le modèle'}
            </p>
          </div>
          {/* Step indicator */}
          <div style={{ display: 'flex', gap: 4 }}>
            {[1, 2].map(s => (
              <div key={s} style={{ width: s === step ? 16 : 6, height: 6, borderRadius: 3, background: s === step ? 'var(--accent)' : 'var(--surface-3)', transition: 'all 0.2s' }} />
            ))}
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={16} />
          </button>
        </div>

        {/* Step 1 — Info */}
        {step === 1 && (
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 14, overflow: 'auto' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={lStyle}>Nom du modèle</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="ex. Campagne vidéo corporative" style={fStyle} autoFocus />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={lStyle}>Description (optionnelle)</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder="Décrivez l'usage de ce modèle…" style={{ ...fStyle, resize: 'none' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={lStyle}>Couleur</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TEMPLATE_COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={lStyle}>Tags (séparés par virgule)</label>
                <input value={tags} onChange={e => setTags(e.target.value)} placeholder="ex. Vidéo, Corporate" style={fStyle} />
              </div>
            </div>
            {/* Sections preview */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ ...lStyle, marginBottom: 4 }}>Contenu inclus</p>
              {sections.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{s.tasks.length} tâche{s.tasks.length > 1 ? 's' : ''}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Options */}
        {step === 2 && (
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
            <ToggleRow
              label="Conserver les priorités"
              sublabel="Élevée / Normale / Basse seront mémorisées sur chaque tâche"
              value={keepPriorities}
              onChange={setKeepPriorities}
            />
            <ToggleRow
              label="Conserver les statuts"
              sublabel="En cours, En attente, Complété, etc. seront inclus dans le modèle"
              value={keepStatuses}
              onChange={setKeepStatuses}
            />
            <ToggleRow
              label="Conserver les échéances"
              sublabel="Les dates actuelles seront copiées telles quelles dans le modèle"
              value={keepDueDates}
              onChange={setKeepDueDates}
            />
            <ToggleRow
              label="Conserver les descriptions"
              sublabel="Les notes et descriptions de chaque tâche seront incluses"
              value={keepDescriptions}
              onChange={setKeepDescriptions}
            />
            <ToggleRow
              label="Conserver les sous-tâches"
              sublabel="La structure de sous-tâches de chaque tâche sera préservée"
              value={keepSubtasks}
              onChange={setKeepSubtasks}
            />
            {/* Live preview of first section's tasks */}
            {sections[0]?.tasks.length > 0 && (
              <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p style={{ ...lStyle, marginBottom: 8 }}>Aperçu — {sections[0].label}</p>
                {sections[0].tasks.slice(0, 4).map((t, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: i < Math.min(sections[0].tasks.length, 4) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{t.title}</span>
                    {keepPriorities && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: { high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)' }[t.priority ?? 'normal'], flexShrink: 0, display: 'block' }} />
                    )}
                    {keepStatuses && t.statusLabel && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '1px 5px', borderRadius: 4, background: `${STATUS_DOT[t.status ?? 'neutral']}22`, color: STATUS_DOT[t.status ?? 'neutral'], border: `1px solid ${STATUS_DOT[t.status ?? 'neutral']}44`, whiteSpace: 'nowrap' }}>{t.statusLabel}</span>
                    )}
                    {keepDueDates && t.dueDate && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: isOverdue(t.dueDate ?? '') ? 'var(--danger)' : 'var(--text-3)' }}>{t.dueDate}</span>
                    )}
                    {keepSubtasks && t.subtasks?.length ? (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <SFIcon name="git-branch" size={9} />{t.subtasks.length}
                      </span>
                    ) : null}
                  </div>
                ))}
                {sections[0].tasks.length > 4 && (
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 4 }}>+{sections[0].tasks.length - 4} autres tâches</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <SFButton variant="ghost" size="sm" onClick={onClose}>Annuler</SFButton>
          {step === 1 ? (
            <SFButton variant="primary" size="sm" icon="arrow-right" onClick={() => setStep(2)} style={{ opacity: name.trim() ? 1 : 0.5 }}>
              Suivant
            </SFButton>
          ) : saved ? (
            <SFButton variant="primary" size="sm" icon="check" style={{ background: 'var(--ok)' }}>Modèle enregistré !</SFButton>
          ) : (
            <SFButton variant="primary" size="sm" icon="layout-template" onClick={handleSave}>
              Créer le modèle
            </SFButton>
          )}
        </div>
      </div>
    </>
  );
}

export function Travail() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = findProject(projectId ?? '') ?? findProject('pj1')!;

  const [autoFocusComments, setAutoFocusComments] = useState(false);

  // Open task panel (+ optionally focus comments) from notification link
  useEffect(() => {
    const taskId = searchParams.get('openTask') ?? searchParams.get('highlight');
    if (!taskId) return;
    const focusComments = searchParams.get('focus') === 'comments';
    setSearchParams({}, { replace: true });
    const timer = setTimeout(() => {
      const allTasks = sections.flatMap(s => s.tasks);
      const task = allTasks.find(t => t.id === taskId);
      if (task) {
        setSelectedTask(task);
        setAutoFocusComments(focusComments);
      } else {
        // Fallback: flash the row if panel can't open
        const el = document.querySelector<HTMLElement>(`[data-task-id="${taskId}"]`);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.style.animation = 'highlight-flash 2s ease forwards';
        el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [searchParams]);

  const getInitialSections = () => {
    const stored = getSections(project.id);
    // Each project shows its own tasks; a project with none starts empty
    // (the "Nouvelle section" affordance lets the user build it out).
    return stored.length > 0 ? stored : (PROJECT_TASKS[project.id] ?? []);
  };
  const [sections, setSectionsState] = useState<SectionData[]>(getInitialSections);

  const setSections = (updater: SectionData[] | ((prev: SectionData[]) => SectionData[])) => {
    setSectionsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setSections_store(project.id, next);
      return next;
    });
  };
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);
  const [draggedTask, setDraggedTask] = useState<{ task: Task; fromSectionLabel: string } | null>(null);
  const [view, setView] = usePersistedState<'list' | 'board'>('sf_view_travail', 'list');
  const [viewOpen, setViewOpen] = useState(false);
  const [showCompletedSections, setShowCompletedSections] = useState(() => loadViewPref('sf_showCompletedSections', true));
  const [showCompletedTasks, setShowCompletedTasks] = useState(() => loadViewPref('sf_showCompletedTasks', true));
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  const togglePref = (key: string, value: boolean) => localStorage.setItem(key, JSON.stringify(value));

  const baseSections = activeSection
    ? sections.filter(s => s.label === activeSection)
    : sections;

  const visibleSections = baseSections
    .filter(s => showCompletedSections || !s.completed)
    .map(s => ({
      ...s,
      tasks: showCompletedTasks ? s.tasks : s.tasks.filter(t => !t.checked),
    }));

  const handleSelectTask = (task: Task) => {
    setSelectedTask(prev => prev?.id === task.id ? null : task);
  };

  const handleAddSection = () => {
    const label = newSectionLabel.trim();
    if (!label) return;
    setSections(prev => [...prev, { label, tasks: [] }]);
    setNewsecLabel('');
    setAddingSection(false);
    setActiveSection(label);
  };

  const handleToggleComplete = (idx: number) => {
    setSections(prev => prev.map((s, i) => i === idx ? { ...s, completed: !s.completed } : s));
  };

  const handleDeleteSection = (idx: number) => {
    const label = sections[idx]?.label;
    setSections(prev => prev.filter((_, i) => i !== idx));
    if (activeSection === label) setActiveSection(null);
  };

  const handleDragStart = (idx: number) => setDraggedIdx(idx);

  const handleDragOver = (e: React.DragEvent, idx: number) => {
    e.preventDefault();
    setDragOverIdx(idx);
  };

  const handleAddTask = (sectionIdx: number, task: Task) => {
    setSections(prev => prev.map((s, i) =>
      i === sectionIdx ? { ...s, tasks: [...s.tasks, task] } : s
    ));
  };

  const handleMoveTask = (task: Task, fromIdx: number, toIdx: number) => {
    setSections(prev => {
      const next = prev.map(s => ({ ...s, tasks: [...s.tasks] }));
      next[fromIdx].tasks = next[fromIdx].tasks.filter(t => t.id !== task.id);
      next[toIdx].tasks = [...next[toIdx].tasks, task];
      return next;
    });
  };

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

  const handleMoveTaskToSection = (task: Task, fromLabel: string, toLabel: string) => {
    handleTaskDrop(task, fromLabel, toLabel);
  };

  const handleDrop = (targetIdx: number) => {
    if (draggedIdx === null || draggedIdx === targetIdx) {
      setDraggedIdx(null);
      setDragOverIdx(null);
      return;
    }
    setSections(prev => {
      const next = [...prev];
      const [moved] = next.splice(draggedIdx, 1);
      next.splice(targetIdx, 0, moved);
      return next;
    });
    setDraggedIdx(null);
    setDragOverIdx(null);
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
    setDragOverIdx(null);
  };

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Headers wrapper */}
      <div style={{ flexShrink: 0 }}>
      <ProjectHeaderBar projectId={project.id}>
        {/* Save as template */}
        <SFButton variant="ghost" icon="layout-template" onClick={() => setSaveTemplateOpen(true)} style={{ color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 9 }}>+ Modèle</SFButton>
        {/* View switcher */}
        <div style={{ display: 'flex', gap: 1, background: 'var(--surface-2)', borderRadius: 10, padding: 3, border: '1px solid var(--border)' }}>
          {([
            { key: 'list',     icon: 'list',          label: 'Liste'      },
            { key: 'board',    icon: 'layout-kanban', label: 'Tableau'    },
          ] as const).map(v => (
            <button key={v.key} onClick={() => setView(v.key)} title={v.label}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', borderRadius: 8, border: 'none', cursor: 'pointer', background: view === v.key ? 'var(--surface)' : 'transparent', color: view === v.key ? 'var(--text)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: view === v.key ? 600 : 400, transition: 'all 0.1s', boxShadow: view === v.key ? '0 1px 4px rgba(0,0,0,0.3)' : 'none' }}
            >
              <SFIcon name={v.icon} size={13} color={view === v.key ? 'var(--text)' : 'var(--text-3)'} />
              {v.label}
            </button>
          ))}
        </div>
        {/* View settings */}
        <div style={{ position: 'relative' }}>
          <button onClick={() => setViewOpen(v => !v)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, border: '1px solid var(--border-2)', background: viewOpen ? 'var(--surface-3)' : 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', fontWeight: 500 }}
          >
            <SFIcon name="sliders-horizontal" size={13} />
            Vue
            <SFIcon name="chevron-down" size={11} color="var(--text-3)" />
          </button>
          {viewOpen && (
            <>
              <div onClick={() => setViewOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: '6px', minWidth: 240, boxShadow: '0 12px 32px rgba(0,0,0,0.6)' }}>
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', padding: '6px 10px 4px' }}>Filtres de vue</p>
                {[
                  { label: 'Sections terminées', key: 'sf_showCompletedSections', value: showCompletedSections, set: (v: boolean) => { setShowCompletedSections(v); togglePref('sf_showCompletedSections', v); } },
                  { label: 'Tâches terminées',   key: 'sf_showCompletedTasks',    value: showCompletedTasks,    set: (v: boolean) => { setShowCompletedTasks(v);    togglePref('sf_showCompletedTasks',    v); } },
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
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', padding: '4px 10px 2px', letterSpacing: '0.06em' }}>Préférences sauvegardées automatiquement</p>
              </div>
            </>
          )}
        </div>
      </ProjectHeaderBar>

      {/* Section nav bar — only in list view */}
      {view === 'list' && <div style={{ padding: '8px 24px', display: 'flex', gap: 4, overflowX: 'auto' }}>
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

      {/* Board view */}
      {view === 'board' && (
        <TravailBoard
          sections={visibleSections}
          selectedTask={selectedTask}
          onSelectTask={handleSelectTask}
          onAddTask={handleAddTask}
          onMoveTask={handleMoveTask}
          onAddSection={label => setSections(prev => [...prev, { label, tasks: [] }])}
          projectId={project.id}
          projectName={project.name}
          projectColor={project.clientColor}
        />
      )}

      {/* List view */}
      {view === 'list' && <div onDragEnd={() => { setDraggedTask(null); setDraggedIdx(null); }} style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 20 }}>
        <SectionInsertZone active={draggedIdx !== null} onDrop={() => handleSectionInsertAt(0)} />
        {visibleSections.map((section, vIdx) => {
          const globalIdx = sections.findIndex(s => s.label === section.label);
          return (
            <React.Fragment key={section.label + globalIdx}>
              <Section
                label={section.label}
                tasks={section.tasks}
                completed={!!section.completed}
                selectedTask={selectedTask}
                onSelectTask={handleSelectTask}
                onToggleComplete={() => handleToggleComplete(globalIdx)}
                onDragStart={() => handleDragStart(globalIdx)}
                isDragging={draggedIdx === globalIdx}
                onAddTask={task => handleAddTask(globalIdx, task)}
                onDelete={() => handleDeleteSection(globalIdx)}
                projectId={project.id}
                projectName={project.name}
                projectColor={project.clientColor}
                draggedTask={draggedTask}
                onTaskDragStart={task => handleTaskDragStart(task, section.label)}
                onTaskDragEnd={() => setDraggedTask(null)}
                onTaskDrop={handleTaskDrop}
                allSections={sections}
                onMoveTaskToSection={handleMoveTaskToSection}
              />
              <SectionInsertZone active={draggedIdx !== null} onDrop={() => handleSectionInsertAt(vIdx + 1)} />
            </React.Fragment>
          );
        })}

        {/* Nouvelle section — inline input */}
        {addingSection ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <input
              autoFocus
              value={newSectionLabel}
              onChange={e => setNewSectionLabel(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') handleAddSection(); if (e.key === 'Escape') { setAddingSection(false); setNewsecLabel(''); } }}
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
            <SFButton variant="ghost" size="sm" onClick={() => { setAddingSection(false); setNewsecLabel(''); }}>Annuler</SFButton>
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
            Nouvelle section
          </button>
        )}
      </div>}

      {selectedTask && (
        <TaskPanel
          task={selectedTask}
          sectionLabel={sections.find(s => s.tasks.some(t => t.id === selectedTask.id))?.label}
          autoFocusComments={autoFocusComments}
          onClose={() => { setSelectedTask(null); setAutoFocusComments(false); }}
          onUpdate={patch => {
            updateTask(projectId!, selectedTask.id, patch);
            setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
          }}
          onMove={(newProjectId, newSectionLabel) => {
            moveTask(projectId!, selectedTask.id, newProjectId, newSectionLabel);
            setSelectedTask(null);
          }}
        />
      )}

      {/* Save as template modal */}
      {saveTemplateOpen && (
        <SaveAsTemplateModal
          projectName={project.name}
          sections={sections}
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}
    </div>
  );
}
