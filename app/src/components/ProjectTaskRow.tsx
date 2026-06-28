import React, { useState, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { SFPill, SFAvatar, SFIcon, DatePickerDropdown, parseYMD, formatDisplay, isOverdue } from './ui';
import { USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import type { Task, Priority, SectionData } from '../types';

// ── Shared task-row constants ──────────────────────────────────────────────────

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

export const STATUS_OPTIONS: { value: string; labelKey: string }[] = [
  { value: '',       labelKey: 'tasks.noStatus'   },
  { value: 'warn',   labelKey: 'tasks.todo'       },
  { value: 'info',   labelKey: 'tasks.inProgress' },
  { value: 'ok',     labelKey: 'tasks.completed'  },
  { value: 'danger', labelKey: 'tasks.overdue'    },
  { value: 'review', labelKey: 'tasks.inReview'   },
];


export const TEAM = Object.values(USERS);

export const GRID = '28px 1fr 80px 65px 160px 110px 130px 90px 28px';

const COL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--ff-mono)', fontSize: 10,
  color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase',
};

// ── Column header ──────────────────────────────────────────────────────────────

export function ColHeader() {
  const { t } = useTranslation();
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '0 16px 6px', borderBottom: '1px solid var(--border)' }}>
      <span />
      <span style={COL_STYLE}>{t('tasks.title')}</span>
      <span style={COL_STYLE}>{t('tasks.subtasks')}</span>
      <span style={COL_STYLE}>{t('tasks.activity')}</span>
      <span style={COL_STYLE}>{t('taskPanel.assignedTo')}</span>
      <span style={COL_STYLE}>{t('tasks.priority')}</span>
      <span style={COL_STYLE}>{t('tasks.status')}</span>
      <span style={COL_STYLE}>{t('tasks.dueDate')}</span>
      <span />
    </div>
  );
}

// ── Shared dropdown helpers ────────────────────────────────────────────────────

export function ddItem(onClick: () => void, children: React.ReactNode, active?: boolean) {
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

export function InlineDropdown({ onClose, children, anchorRect, minWidth = 160, zIndex = 100 }: {
  onClose: () => void;
  children: React.ReactNode;
  anchorRect?: DOMRect | null;
  minWidth?: number;
  zIndex?: number;
}) {
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });
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

// ── Move task modal ────────────────────────────────────────────────────────────

export function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 16, padding: '20px', minWidth: 320, maxWidth: 400, boxShadow: '0 16px 48px rgba(0,0,0,0.7)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
          <h3 style={{ fontSize: 14, fontWeight: 700 }}>{t('taskPanel.moveTask')}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4 }}>
            <SFIcon name="x" size={15} />
          </button>
        </div>
        <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--ff-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>{t('taskPanel.taskLabel', { title: task.title })}</p>
        <div style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8, marginTop: 14 }}>{t('taskPanel.availableSections')}</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          {sections.map(s => (
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
                <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>{t('taskPanel.taskCount', { count: s.tasks.length })}</p>
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ── Project task row (controlled) ──────────────────────────────────────────────

export function ProjectTaskRow({
  task,
  selected,
  onSelect,
  onUpdate,
  onTaskDragStart,
  onTaskDragEnd,
  allSections,
  onMoveToSection,
  onDelete,
}: {
  task: Task;
  selected: boolean;
  onSelect: (t: Task) => void;
  onUpdate: (patch: Partial<Task>) => void;
  onTaskDragStart?: () => void;
  onTaskDragEnd?: () => void;
  allSections?: SectionData[];
  onMoveToSection?: (toSectionLabel: string) => void;
  onDelete?: () => void;
}) {
  const { t } = useTranslation();
  const checked = task.checked;
  const priority = task.priority;
  const assignee = task.assignee;
  const status = task.status as string;
  const statusLabel = task.statusLabel;
  const dueDate = task.dueDate;
  const [open, setOpen] = useState<'priority' | 'assignee' | 'status' | 'dueDate' | 'context' | null>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const dragHandleActive = useRef(false);

  const openDrop = (key: typeof open, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpen(prev => prev === key ? null : key);
    setDropRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
  };

  const hasSubtasks = !!task.subtasks?.length;

  return (
    <>
    <div
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
        borderLeft: selected ? '2px solid var(--accent)' : '2px solid transparent',
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
          title={t('taskPanel.reorder')}
        >
          <SFIcon name="grip-vertical" size={11} />
        </div>
        <button
          onClick={() => onUpdate({ checked: !checked })}
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
      <span
        onClick={() => onSelect(task)}
        style={{
          fontSize: 13, fontWeight: 500,
          textDecoration: checked ? 'line-through' : 'none',
          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          cursor: 'pointer',
        }}
      >
        {task.title}
      </span>

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
        ) : (
          <span style={{ color: 'var(--border-2)', fontFamily: 'var(--ff-mono)', fontSize: 10 }}>—</span>
        )}
      </div>

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
          <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee?.name ?? t('tasks.unassigned')}</span>
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'assignee' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect} minWidth={180}>
            {ddItem(() => { onUpdate({ assignee: null as unknown as Task['assignee'] }); setOpen(null); },
              <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>{t('tasks.unassigned')}</>,
              assignee == null
            )}
            {TEAM.map(u => ddItem(() => { onUpdate({ assignee: u }); setOpen(null); },
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
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: PRIORITY_COLOR[priority], textTransform: 'uppercase', letterSpacing: '0.04em' }}>{t(PRIORITY_LABEL_KEY[priority])}</span>
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'priority' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect}>
            {PRIORITY_OPTIONS.map(p => ddItem(() => { onUpdate({ priority: p, priorityLabel: t(PRIORITY_LABEL_KEY[p]) }); setOpen(null); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>,
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
            {STATUS_OPTIONS.map(o => ddItem(() => { onUpdate({ status: o.value as Task['status'], statusLabel: t(o.labelKey) }); setOpen(null); },
              <><span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.value], display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>,
              status === o.value
            ))}
          </InlineDropdown>
        )}
      </div>

      {/* Due date — custom date picker */}
      <div style={{ position: 'relative' }}>
        <button
          onClick={e => openDrop('dueDate', e)}
          style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, display: 'flex', alignItems: 'center', gap: 4, fontFamily: 'var(--ff-mono)', fontSize: 11, color: isOverdue(dueDate ?? '') ? 'var(--danger)' : 'var(--text-3)', whiteSpace: 'nowrap' }}
        >
          {dueDate || <span style={{ color: 'var(--border-2)' }}>—</span>}
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'dueDate' && (
          <DatePickerDropdown
            value={parseYMD(dueDate) ? dueDate : ''}
            onChange={v => { onUpdate({ dueDate: formatDisplay(v) }); setOpen(null); }}
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
            {ddItem(() => { onSelect(task); setOpen(null); }, <><SFIcon name="maximize-2" size={13} color="var(--text-3)" />{t('tasks.openDetail')}</>)}
            {allSections && allSections.length > 1 && ddItem(() => { setOpen(null); setShowMoveModal(true); }, <><SFIcon name="move-right" size={13} color="var(--text-3)" />{t('taskPanel.moveTo')}</>)}
            <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
            {ddItem(() => { onDelete?.(); setOpen(null); }, <span style={{ color: 'var(--danger)', display: 'flex', alignItems: 'center', gap: 8 }}><SFIcon name="trash-2" size={13} color="var(--danger)" />{t('tasks.delete')}</span>)}
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
