import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useSearchParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFAvatar, SFBar, SFButton, SFIcon, SFModal, TaskDatePopover, parseYMD, fmtTaskDate, isOverdue } from '../components/ui';
import { PROJECT_TASKS, RESOURCES, USERS } from '../data/mock';
import { findProject, getProjects, subscribeProjects } from '../data/projectStore';
import { STATUS_COLOR } from '../data/status';
import { getSections, setSections as setSections_store, subscribeStore, updateTask, moveTask, moveTasks, copyTasks, moveSection, copySection, convertTasksToSubtasks } from '../data/taskStore';
import { markTaskRead } from '../data/notificationStore';
import { useTaskNotifCount } from '../hooks/useNotifs';
import { usePersistedState } from '../hooks/usePersistedState';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { loadCustomTemplates, saveCustomTemplates } from '../data/templates';
import type { ProjectTemplate } from '../data/templates';
import type { Task, Priority, ResourceType, SectionData, User } from '../types';
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers } from '../data/teamStore';
import { TravailBoard } from './TravailBoard';
import { TaskPanel } from '../components/TaskPanel';
import { SubtaskTargetPicker } from '../components/SubtaskTargetPicker';
import { showToast } from '../data/toastStore';

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

const TYPE_ICON: Record<ResourceType, string> = {
  screenplay:   'clapperboard',
  video_review: 'video',
  moodboard:    'grid-2x2',
  document:     'file',
  checklist:    'list-checks',
  inspirations: 'image',
  file:         'hard-drive',
  form:         'clipboard-list',
  web_review:   'globe',
};

// ── Shared helpers ────────────────────────────────────────────────────────────

function ddItem(onClick: () => void, children: React.ReactNode, active?: boolean) {
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

// ── Move task modal ────────────────────────────────────────────────────────────

function MoveTaskModal({ task, sections, onMove, onClose }: {
  task: Task;
  sections: SectionData[];
  onMove: (toSectionLabel: string) => void;
  onClose: () => void;
}) {
  const otherSections = sections;
  return (
    <SFModal open onClose={onClose} title="Déplacer la tâche" width={400}>
      <p style={{ fontSize: 10, color: 'var(--text-3)', marginBottom: 4, fontFamily: 'var(--ff-mono)', letterSpacing: '0.05em', textTransform: 'uppercase' }}>Tâche : {task.title}</p>
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
    </SFModal>
  );
}

// ── Column header ──────────────────────────────────────────────────────────────

const GRID = '28px 1fr 80px 65px 120px 75px 95px 85px 24px';
// Quand le panneau de détail est ouvert, ces infos sont déjà visibles à
// droite — les cacher dans la liste centrale libère toute la largeur pour
// lire le titre en entier (checkbox + titre + suppression seulement).
const GRID_COMPACT = '28px 1fr 24px';

const COL_STYLE: React.CSSProperties = {
  fontFamily: 'var(--ff-mono)', fontSize: 10,
  color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase',
};

function ColHeader({ compact }: { compact?: boolean }) {
  const { t } = useTranslation();
  if (compact) {
    return (
      <div style={{ display: 'grid', gridTemplateColumns: GRID_COMPACT, alignItems: 'center', gap: 12, padding: '0 16px 6px', borderBottom: '1px solid var(--border)' }}>
        <span />
        <span style={COL_STYLE}>{t('tasks.title')}</span>
        <span />
      </div>
    );
  }
  return (
    <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '0 16px 6px', borderBottom: '1px solid var(--border)' }}>
      <span />
      <span style={COL_STYLE}>{t('tasks.title')}</span>
      <span style={COL_STYLE}>{t('tasks.subtasks')}</span>
      <span style={COL_STYLE}>{t('tasks.activity')}</span>
      <span style={COL_STYLE}>{t('tasks.assignedTo')}</span>
      <span style={COL_STYLE}>{t('tasks.priority')}</span>
      <span style={COL_STYLE}>{t('tasks.status')}</span>
      <span style={COL_STYLE}>{t('tasks.date')}</span>
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
      <div onClick={e => { e.stopPropagation(); onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{ position: 'fixed', ...pos, zIndex, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
        {children}
      </div>
    </>,
    document.body
  );
}

const STATUS_OPTIONS = [
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
  const [projects, setProjects] = useState(() => getProjects());
  const [targetProjectId, setTargetProjectId] = useState('');
  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 380, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{mode === 'copy' ? 'Copier' : 'Déplacer'} la section</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginBottom: 16 }}>La section <strong style={{ color: 'var(--text)' }}>« {sectionLabel} »</strong> et toutes ses tâches seront {mode === 'copy' ? 'copiées' : 'déplacées'} vers :</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 20, maxHeight: 220, overflowY: 'auto' }}>
          {projects.map(p => (
            <button key={p.id} onClick={() => setTargetProjectId(p.id)}
              style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${targetProjectId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: targetProjectId === p.id ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: targetProjectId === p.id ? 'var(--accent)' : 'var(--text)', fontWeight: targetProjectId === p.id ? 600 : 400 }}
            >{p.name}</button>
          ))}
        </div>
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Annuler</button>
          <button onClick={() => { if (targetProjectId) { onMove(targetProjectId); onClose(); } }} disabled={!targetProjectId}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: !targetProjectId ? 'var(--surface-3)' : 'var(--accent)', color: !targetProjectId ? 'var(--text-3)' : 'var(--on-accent)', fontSize: 13, cursor: !targetProjectId ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--ff-text)' }}
          >{mode === 'copy' ? 'Copier' : 'Déplacer'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Bulk move modal (tasks or section) ────────────────────────────────────────

function BulkMoveModal({ title, mode = 'move', onMove, onClose }: {
  title: string;
  mode?: 'move' | 'copy';
  onMove: (projectId: string, sectionLabel: string) => void;
  onClose: () => void;
}) {
  const [projects, setProjects] = useState(() => getProjects());
  const [targetProjectId, setTargetProjectId] = useState('');
  const [targetSection, setTargetSection] = useState('');
  const [newSection, setNewSection] = useState('');

  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);

  const targetSections = targetProjectId ? getSections(targetProjectId) : [];

  return createPortal(
    <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 600 }}>
      <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 24, width: 420, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
          <h3 style={{ fontSize: 15, fontWeight: 700 }}>{title}</h3>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Projet destination</p>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 16, maxHeight: 200, overflowY: 'auto' }}>
          {projects.map(p => (
            <button key={p.id} onClick={() => { setTargetProjectId(p.id); setTargetSection(''); }}
              style={{ padding: '8px 12px', borderRadius: 9, border: `1px solid ${targetProjectId === p.id ? 'var(--accent)' : 'var(--border)'}`, background: targetProjectId === p.id ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: targetProjectId === p.id ? 'var(--accent)' : 'var(--text)', fontWeight: targetProjectId === p.id ? 600 : 400 }}
            >{p.name}</button>
          ))}
        </div>

        {targetProjectId && (
          <>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>Section destination</p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginBottom: 12, maxHeight: 160, overflowY: 'auto' }}>
              {targetSections.map(s => (
                <button key={s.label} onClick={() => setTargetSection(s.label)}
                  style={{ padding: '7px 12px', borderRadius: 9, border: `1px solid ${targetSection === s.label ? 'var(--accent)' : 'var(--border)'}`, background: targetSection === s.label ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontFamily: 'var(--ff-text)', color: targetSection === s.label ? 'var(--accent)' : 'var(--text)' }}
                >{s.label}</button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
              <input value={newSection} onChange={e => { setNewSection(e.target.value); if (e.target.value) setTargetSection(e.target.value); }}
                placeholder="Ou créer une nouvelle section…"
                style={{ flex: 1, padding: '7px 12px', borderRadius: 9, border: '1px dashed var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
              />
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button onClick={onClose} style={{ padding: '8px 16px', borderRadius: 9, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Annuler</button>
          <button
            onClick={() => { if (targetProjectId && targetSection) { onMove(targetProjectId, targetSection); onClose(); } }}
            disabled={!targetProjectId || !targetSection}
            style={{ padding: '8px 16px', borderRadius: 9, border: 'none', background: (!targetProjectId || !targetSection) ? 'var(--surface-3)' : 'var(--accent)', color: (!targetProjectId || !targetSection) ? 'var(--text-3)' : 'var(--on-accent)', fontSize: 13, cursor: (!targetProjectId || !targetSection) ? 'not-allowed' : 'pointer', fontWeight: 600, fontFamily: 'var(--ff-text)' }}
          >{mode === 'copy' ? 'Copier' : 'Déplacer'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
}

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskContextMenu({ pos, onDelete, onOpen, onMove, onConvert, onClose }: {
  pos: { x: number; y: number };
  onDelete: () => void;
  onOpen: () => void;
  onMove?: () => void;
  onConvert: () => void;
  onClose: () => void;
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
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 200, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>{t('tasks.openDetail')}</span></>, onOpen)}
      {onMove && item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>{t('board.moveTo')}</span></>, onMove)}
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
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 200, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="pencil" size={13} color="var(--text-3)" /><span>Renommer</span></>, onRename)}
      {item(<><SFIcon name="copy" size={13} color="var(--text-3)" /><span>Copier vers un autre projet</span></>, onCopy)}
      {item(<><SFIcon name="move-right" size={13} color="var(--text-3)" /><span>Déplacer vers un autre projet</span></>, onMove)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>Supprimer</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

// Demo sessions can assign to any of the 5 mock people. Real sessions read
// the studio's real team roster (teamStore.ts) — invited members, not just
// the current user.
function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS);
  const team = getTeamMembers();
  if (team.length > 0) return team;
  // teamStore's fetch hasn't resolved yet (or getCurrentUser() briefly
  // returns null right after login, same one-frame window already accepted
  // in GlobalTopBar.tsx) — fall back to a placeholder so callers that assume
  // getTeam()[0] is always defined (e.g. the "add task" row's default
  // assignee) never see undefined.
  const authUser = getCurrentUser();
  if (!authUser) return [USERS.lea];
  return [{ id: authUser.id, name: authUser.name, initials: authUser.initials, avatarColor: authUser.avatarColor, role: authUser.role }];
}

function TaskRow({
  task,
  selected,
  multiSelected,
  onSelect,
  onTaskDragStart,
  onTaskDragEnd,
  allSections,
  onMoveToSection,
  onDelete,
  onConvertRequest,
  compact,
}: {
  task: Task;
  selected: boolean;
  onSelect: (t: Task, e?: React.MouseEvent) => void;
  multiSelected?: boolean;
  onTaskDragStart?: () => void;
  onTaskDragEnd?: () => void;
  allSections?: SectionData[];
  onMoveToSection?: (toSectionLabel: string) => void;
  onDelete?: () => void;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [checked, setChecked] = useState(task.checked);
  const [priority, setPriority] = useState<Priority>(task.priority);
  const [assignee, setAssignee] = useState<User | null>(task.assignee);
  const [status, setStatus] = useState(task.status as string);
  const [dueDate, setDueDate] = useState(task.dueDate);
  const [endDate, setEndDate] = useState(task.endDate ?? '');
  const [startTime, setStartTime] = useState(task.startTime ?? '');
  const [endTime, setEndTime] = useState(task.endTime ?? '');
  const { projectId: rowProjectId } = useParams<{ projectId: string }>();
  const [open, setOpen] = useState<'priority' | 'assignee' | 'status' | 'dueDate' | null>(null);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [hovered, setHovered] = useState(false);
  const [showMoveModal, setShowMoveModal] = useState(false);
  const [ctxPos, setCtxPos] = useState<{ x: number; y: number } | null>(null);
  const dragHandleActive = React.useRef(false);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState(task.title);
  const titleInputRef = React.useRef<HTMLInputElement>(null);

  React.useEffect(() => {
    if (editingTitle) titleInputRef.current?.select();
  }, [editingTitle]);

  const commitTitle = () => {
    const val = titleDraft.trim() || task.title;
    setTitleDraft(val);
    setEditingTitle(false);
    if (rowProjectId && val !== task.title) updateTask(rowProjectId, task.id, { title: val });
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
        gridTemplateColumns: compact ? GRID_COMPACT : GRID,
        alignItems: 'center',
        gap: 12,
        padding: '8px 16px',
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
        style={{ display: 'flex', alignItems: 'center', gap: 5, overflow: 'hidden', cursor: editingTitle ? 'default' : 'text', height: '100%', maxWidth: '100%', width: editingTitle ? '100%' : 'fit-content' }}
      >
        {task.deliverable && !editingTitle && <SFIcon name="package" size={11} color="var(--accent)" />}
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
              borderRadius: 6, border: '1px solid var(--accent)',
              background: 'var(--surface-3)', color: 'var(--text)',
              fontFamily: 'var(--ff-text)', outline: 'none',
              width: `${Math.max(2, titleDraft.length + 1)}ch`, maxWidth: '100%',
            }}
          />
        ) : (
          <span style={{ fontSize: 13, fontWeight: 500, textDecoration: checked ? 'line-through' : 'none', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {titleDraft}
          </span>
        )}
      </div>

      {!compact && (
      <>
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
          <span style={{ fontSize: 12, color: 'var(--text-2)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee?.name ?? t('tasks.unassigned')}</span>
          <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
        </button>
        {open === 'assignee' && (
          <InlineDropdown onClose={() => setOpen(null)} anchorRect={dropRect} minWidth={180}>
            {ddItem(() => { setAssignee(null); setOpen(null); },
              <><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>{t('tasks.unassigned')}</>,
              assignee === null
            )}
            {getTeam().map(u => ddItem(() => { setAssignee(u); setOpen(null); if (rowProjectId) updateTask(rowProjectId, task.id, { assignee: u }); },
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

      {/* Status — inline dropdown */}
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
      </>
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
    {showMoveModal && allSections && onMoveToSection && (
      <MoveTaskModal
        task={task}
        sections={allSections}
        onMove={onMoveToSection}
        onClose={() => setShowMoveModal(false)}
      />
    )}
    {ctxPos && (
      <TaskContextMenu
        pos={ctxPos}
        onDelete={() => { onDelete?.(); setCtxPos(null); }}
        onOpen={() => { onSelect(task); setCtxPos(null); }}
        onMove={allSections && allSections.length > 1 ? () => { setCtxPos(null); setShowMoveModal(true); } : undefined}
        onConvert={() => { onConvertRequest(task, ctxPos); setCtxPos(null); }}
        onClose={() => setCtxPos(null)}
      />
    )}
    </>
  );
}

// ── Add task row ───────────────────────────────────────────────────────────────

function AddTaskRow({ projectId, projectName, projectColor, onAdd, onAddMany, compact }: {
  projectId: string;
  projectName: string;
  projectColor: string;
  onAdd: (task: Task) => void;
  onAddMany: (tasks: Task[]) => void;
  compact?: boolean;
}) {
  const { t } = useTranslation();
  const [adding, setAdding] = useState(false);
  const [title, setTitle] = useState('');
  const [assignee, setAssignee] = useState<User | null>(null);
  const [priority, setPriority] = useState<Priority>('none');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('');
  const [statusLabel, setStatusLabel] = useState('');
  const [openField, setOpenField] = useState<'assignee' | 'priority' | 'status' | 'dueDate' | null>(null);
  const [addDropRect, setAddDropRect] = useState<DOMRect | null>(null);
  const titleInputRef = useRef<HTMLInputElement>(null);

  const openAddDrop = (key: typeof openField, e: React.MouseEvent<HTMLButtonElement>) => {
    setOpenField(prev => prev === key ? null : key);
    setAddDropRect((e.currentTarget as HTMLButtonElement).getBoundingClientRect());
  };

  const clearFields = () => {
    setTitle(''); setAssignee(null); setPriority('none');
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
    assignee,
    status: status as Task['status'],
    statusLabel,
    priority,
    priorityLabel: t(PRIORITY_LABEL_KEY[priority]),
    dueDate: dueDate || '—',
    dueDateRed: false,
    checked: false,
    subtasks: [],
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
      <div style={{ display: 'grid', gridTemplateColumns: compact ? GRID_COMPACT : GRID, alignItems: 'center', gap: 12, padding: '8px 16px' }}>

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

        {!compact && (
        <>
        <span />{/* Sous-tâches */}
        <span />{/* Activité */}

        {/* Assignee — custom dropdown */}
        <div style={{ position: 'relative' }}>
          <button onMouseDown={e => e.preventDefault()} onClick={e => openAddDrop('assignee', e)}
            style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'none', border: 'none', cursor: 'pointer', padding: 0, minWidth: 0 }}>
            {assignee
              ? <SFAvatar initials={assignee.initials} bg={assignee.avatarColor} size={20} />
              : <div style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed var(--border-2)', flexShrink: 0 }} />}
            <span style={{ fontSize: 12, color: assignee ? 'var(--text-2)' : 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{assignee ? assignee.name : t('tasks.unassigned')}</span>
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {openField === 'assignee' && (
            <InlineDropdown onClose={() => setOpenField(null)} anchorRect={addDropRect} minWidth={180}>
              {ddItem(() => { setAssignee(null); setOpenField(null); },
                <span style={{ color: 'var(--text-3)', fontStyle: 'italic' }}>{t('tasks.unassigned')}</span>,
                assignee === null
              )}
              {getTeam().map(u => ddItem(() => { setAssignee(u); setOpenField(null); },
                <><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>,
                assignee?.id === u.id
              ))}
            </InlineDropdown>
          )}
        </div>

        {/* Priority — custom dropdown */}
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

        {/* Status — custom dropdown */}
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
        </>
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
  label, tasks, completed, selectedTask, onSelectTask, onToggleComplete,
  onDragStart, isDragging, onAddTask, onAddTaskMany, onDelete, onDeleteTask, onMoveSection, onCopySection, onRename,
  projectId, projectName, projectColor, multiSelIds,
  draggedTask, onTaskDragStart, onTaskDrop, onTaskDragEnd, allSections, onMoveTaskToSection, onConvertRequest,
}: {
  label: string;
  tasks: Task[];
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
  allSections: SectionData[];
  onMoveTaskToSection: (task: Task, fromLabel: string, toLabel: string) => void;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
}) {
  const done = tasks.filter(t => t.checked).length;
  const progress = tasks.length > 0 ? (done / tasks.length) * 100 : 0;
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
        onContextMenu={e => { e.preventDefault(); setCtxPos({ x: e.clientX, y: e.clientY }); }}
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
              fontWeight: 600, fontSize: 13, padding: '2px 6px',
              width: `${Math.max(2, labelDraft.length + 1)}ch`, maxWidth: 300,
              borderRadius: 6, border: '1px solid var(--accent)',
              background: 'var(--surface-3)', color: 'var(--text)',
              fontFamily: 'var(--ff-text)', outline: 'none',
            }}
          />
        ) : (
          <span
            onClick={e => { e.stopPropagation(); setLabelDraft(label); setEditingLabel(true); }}
            style={{
              fontWeight: 600, fontSize: 13, cursor: 'text',
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

        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>({tasks.length} tâches)</span>
        <div style={{ flex: 1, maxWidth: 140 }}>
          <SFBar value={completed ? 100 : progress} height={3} />
        </div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginLeft: 'auto' }}>{done}/{tasks.length}</span>

        {/* Copy section */}
        <button
          onClick={e => { e.stopPropagation(); onCopySection(); }}
          title="Copier la section vers un autre projet"
          style={{ visibility: headerHovered && !confirmDelete ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="copy" size={11} />
        </button>

        {/* Move section */}
        <button
          onClick={e => { e.stopPropagation(); onMoveSection(); }}
          title="Déplacer la section vers un autre projet"
          style={{ visibility: headerHovered && !confirmDelete ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, flexShrink: 0 }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--accent)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
        >
          <SFIcon name="move-right" size={11} />
        </button>

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
          <ColHeader compact={!!selectedTask} />
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
                allSections={allSections}
                onMoveToSection={toLabel => onMoveTaskToSection(task, label, toLabel)}
                onDelete={() => onDeleteTask(task.id)}
                onConvertRequest={onConvertRequest}
                compact={!!selectedTask}
              />
              <DropLine idx={i + 1} />
            </React.Fragment>
          ))}
          <AddTaskRow projectId={projectId} projectName={projectName} projectColor={projectColor} onAdd={onAddTask} onAddMany={onAddTaskMany} compact={!!selectedTask} />
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
      {res.webUrl
        ? <div style={{ display: 'flex', gap: 10 }}>
            <SFButton variant="secondary" icon="external-link" onClick={() => window.open(res.webUrl, '_blank', 'noopener,noreferrer')}>Ouvrir dans l'onglet</SFButton>
          </div>
        : <p style={{ fontSize: 12, color: 'var(--text-3)', fontStyle: 'italic' }}>Aucun aperçu disponible pour ce type de fichier.</p>}
    </div>
  );
}

// ── Task Detail Panel ──────────────────────────────────────────────────────────

// ── Screen ─────────────────────────────────────────────────────────────────────



function loadViewPref<T>(key: string, fallback: T): T {
  try { return JSON.parse(localStorage.getItem(key) ?? '') ?? fallback; } catch { return fallback; }
}

// ── Save as template modal ─────────────────────────────────────────────────────

const TEMPLATE_COLORS = ['#5B8AF5', '#34C98A', '#A05BE8', '#F5975B', '#E85B7A', '#5BC4E8', '#F5C05B'];

const STATUS_DOT: Record<string, string> = {
  ok: 'var(--ok)', warn: 'var(--warn)', info: 'var(--info)',
  danger: 'var(--danger)', review: 'var(--accent)', neutral: 'var(--text-3)',
};

function SaveAsTemplateModal({ projectName, sections, onClose }: {
  projectName: string;
  sections: SectionData[];
  onClose: () => void;
}) {
  const { t } = useTranslation();
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
              <SFIcon name="arrow-left" size={11} />{t('templateModal.back')}
            </button>
          )}
          <div style={{ flex: 1 }}>
            <h2 style={{ fontSize: 15, fontWeight: 700 }}>
              {step === 1 ? t('templateModal.titleStep1') : t('templateModal.titleStep2')}
            </h2>
            <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>
              {step === 1
                ? `${t('templateModal.sectionsCount', { count: sections.length })} · ${t('templateModal.tasksCount', { count: totalTasks })}`
                : t('templateModal.subtitleStep2')}
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
              <label style={lStyle}>{t('templateModal.nameLabel')}</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder={t('templateModal.namePlaceholder')} style={fStyle} autoFocus />
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={lStyle}>{t('templateModal.descriptionLabel')}</label>
              <textarea value={description} onChange={e => setDescription(e.target.value)} rows={2} placeholder={t('templateModal.descriptionPlaceholder')} style={{ ...fStyle, resize: 'none' }} />
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={lStyle}>{t('templateModal.colorLabel')}</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {TEMPLATE_COLORS.map(c => (
                    <button key={c} onClick={() => setColor(c)} style={{ width: 24, height: 24, borderRadius: '50%', background: c, border: color === c ? '2px solid var(--accent)' : '2px solid transparent', cursor: 'pointer', outline: 'none' }} />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <label style={lStyle}>{t('templateModal.tagsLabel')}</label>
                <input value={tags} onChange={e => setTags(e.target.value)} placeholder={t('templateModal.tagsPlaceholder')} style={fStyle} />
              </div>
            </div>
            {/* Sections preview */}
            <div style={{ padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 6 }}>
              <p style={{ ...lStyle, marginBottom: 4 }}>{t('templateModal.contentIncluded')}</p>
              {sections.map((s, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: 2, background: color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, fontWeight: 600, flex: 1 }}>{s.label}</span>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{t('templateModal.tasksCount', { count: s.tasks.length })}</span>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Step 2 — Options */}
        {step === 2 && (
          <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 10, overflow: 'auto' }}>
            <ToggleRow
              label={t('board.keepPriorities')}
              sublabel={t('templateModal.keepPrioritiesSublabel')}
              value={keepPriorities}
              onChange={setKeepPriorities}
            />
            <ToggleRow
              label={t('board.keepStatuses')}
              sublabel={t('templateModal.keepStatusesSublabel')}
              value={keepStatuses}
              onChange={setKeepStatuses}
            />
            <ToggleRow
              label={t('templateModal.keepDueDates')}
              sublabel={t('templateModal.keepDueDatesSublabel')}
              value={keepDueDates}
              onChange={setKeepDueDates}
            />
            <ToggleRow
              label={t('templateModal.keepDescriptions')}
              sublabel={t('templateModal.keepDescriptionsSublabel')}
              value={keepDescriptions}
              onChange={setKeepDescriptions}
            />
            <ToggleRow
              label={t('board.keepSubtasksLabel')}
              sublabel={t('board.keepSubtasksHint')}
              value={keepSubtasks}
              onChange={setKeepSubtasks}
            />
            {/* Live preview of first section's tasks */}
            {sections[0]?.tasks.length > 0 && (
              <div style={{ marginTop: 4, padding: '10px 12px', borderRadius: 10, background: 'var(--surface-2)', border: '1px solid var(--border)' }}>
                <p style={{ ...lStyle, marginBottom: 8 }}>{t('templateModal.previewLabel', { section: sections[0].label })}</p>
                {sections[0].tasks.slice(0, 4).map((pt, i) => (
                  <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '4px 0', borderBottom: i < Math.min(sections[0].tasks.length, 4) - 1 ? '1px solid var(--border)' : 'none' }}>
                    <span style={{ fontSize: 11, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text-2)' }}>{pt.title}</span>
                    {keepPriorities && (
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: { high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)' }[pt.priority ?? 'normal'], flexShrink: 0, display: 'block' }} />
                    )}
                    {keepStatuses && pt.statusLabel && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', padding: '1px 5px', borderRadius: 4, background: `${STATUS_DOT[pt.status ?? 'neutral']}22`, color: STATUS_DOT[pt.status ?? 'neutral'], border: `1px solid ${STATUS_DOT[pt.status ?? 'neutral']}44`, whiteSpace: 'nowrap' }}>{t(STATUS_OPTIONS.find(o => o.value === pt.status)?.labelKey ?? 'tasks.noStatus')}</span>
                    )}
                    {keepDueDates && pt.dueDate && (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: isOverdue(pt.dueDate ?? '') ? 'var(--danger)' : 'var(--text-3)' }}>{pt.dueDate}</span>
                    )}
                    {keepSubtasks && pt.subtasks?.length ? (
                      <span style={{ fontSize: 9, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 2 }}>
                        <SFIcon name="git-branch" size={9} />{pt.subtasks.length}
                      </span>
                    ) : null}
                  </div>
                ))}
                {sections[0].tasks.length > 4 && (
                  <p style={{ fontSize: 10, color: 'var(--text-3)', fontFamily: 'var(--ff-mono)', marginTop: 4 }}>{t('templateModal.moreTasksCount', { count: sections[0].tasks.length - 4 })}</p>
                )}
              </div>
            )}
          </div>
        )}

        {/* Footer */}
        <div style={{ padding: '14px 22px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end', flexShrink: 0 }}>
          <SFButton variant="ghost" size="sm" onClick={onClose}>{t('tasks.cancel')}</SFButton>
          {step === 1 ? (
            <SFButton variant="primary" size="sm" icon="arrow-right" onClick={() => setStep(2)} style={{ opacity: name.trim() ? 1 : 0.5 }}>
              {t('templateModal.next')}
            </SFButton>
          ) : saved ? (
            <SFButton variant="primary" size="sm" icon="check" style={{ background: 'var(--ok)' }}>{t('templateModal.templateSaved')}</SFButton>
          ) : (
            <SFButton variant="primary" size="sm" icon="layout-template" onClick={handleSave}>
              {t('templateModal.createTemplate')}
            </SFButton>
          )}
        </div>
      </div>
    </>
  );
}

export function Travail() {
  const { t } = useTranslation();
  const { projectId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = findProject(projectId ?? '') ?? getProjects()[0]!;

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

  // Real sessions: getSections() returns the cache as of THIS render, which
  // is empty until the background Supabase fetch resolves — without this,
  // landing on Tâches straight after login shows nothing until some other
  // navigation remounts the component and re-reads the (by-then-populated)
  // cache. Re-sync whenever the store notifies (fetch completed, or any
  // other write) instead of only reading once at mount.
  useEffect(() => {
    const sync = () => {
      const stored = getSections(project.id);
      setSectionsState(stored.length > 0 ? stored : (PROJECT_TASKS[project.id] ?? []));
    };
    // Switching projects (e.g. via a pinned sidebar bookmark) keeps this same
    // component instance mounted with a new `project.id` — without an
    // immediate sync here, `sections` kept showing the PREVIOUS project's
    // tasks until some unrelated store write (or a full remount via another
    // route) happened to refresh it.
    sync();
    return subscribeStore(sync);
  }, [project.id]);

  const setSections = (updater: SectionData[] | ((prev: SectionData[]) => SectionData[])) => {
    setSectionsState(prev => {
      const next = typeof updater === 'function' ? updater(prev) : updater;
      setSections_store(project.id, next);
      return next;
    });
  };
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);
  const [multiSelIds, setMultiSelIds] = useState<Set<string>>(new Set());
  const handleConvertRequest = (task: Task, pos: { x: number; y: number }) => {
    const ids = multiSelIds.has(task.id) && multiSelIds.size > 1 ? [...multiSelIds] : [task.id];
    setConvertRequest({ taskIds: ids, pos });
  };
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkCopyOpen, setBulkCopyOpen] = useState(false);
  const [convertRequest, setConvertRequest] = useState<{ taskIds: string[]; pos: { x: number; y: number } } | null>(null);
  const [sectionMoveLabel, setSectionMoveLabel] = useState<string | null>(null);
  const [sectionCopyLabel, setSectionCopyLabel] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<string | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newSectionLabel, setNewSectionLabel] = useState('');
  const [draggedIdx, setDraggedIdx] = useState<number | null>(null);
  const [draggedTask, setDraggedTask] = useState<{ task: Task; fromSectionLabel: string } | null>(null);
  const [view, setView] = usePersistedState<'list' | 'board'>('sf_view_travail', 'list');
  const [viewOpen, setViewOpen] = useState(false);
  const [showCompletedSections, setShowCompletedSections] = useState(() => loadViewPref('sf_showCompletedSections', true));
  const [showCompletedTasks, setShowCompletedTasks] = useState(() => loadViewPref('sf_showCompletedTasks', true));
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);

  // Escape — ferme le panneau de détail de tâche
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && selectedTask) {
        setSelectedTask(null);
        e.stopPropagation();
      }
    };
    window.addEventListener('keydown', handler, true);
    return () => window.removeEventListener('keydown', handler, true);
  }, [selectedTask]);

  const togglePref = (key: string, value: boolean) => localStorage.setItem(key, JSON.stringify(value));

  const baseSections = activeSection
    ? sections.filter(s => s.label === activeSection)
    : sections;

  const visibleSections = baseSections
    .filter(s => showCompletedSections || !s.completed)
    .map(s => ({
      ...s,
      tasks: showCompletedTasks ? s.tasks : s.tasks.filter(t => !t.checked && t.status !== 'ok'),
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

  const handleAddSection = () => {
    const label = newSectionLabel.trim();
    if (!label) return;
    setSections(prev => [...prev, { label, tasks: [] }]);
    setNewSectionLabel('');
    setAddingSection(false);
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

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Headers wrapper */}
      <div style={{ flexShrink: 0 }}>
      <ProjectHeaderBar projectId={project.id}>
        {/* Save as template */}
        <SFButton variant="ghost" icon="layout-template" onClick={() => setSaveTemplateOpen(true)} style={{ color: 'var(--text-3)', border: '1px solid var(--border)', borderRadius: 9 }}>{t('board.saveAsTemplateButton')}</SFButton>
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
                  { label: t('board.completedSections'),    key: 'sf_showCompletedSections', value: showCompletedSections, set: (v: boolean) => { setShowCompletedSections(v); togglePref('sf_showCompletedSections', v); } },
                  { label: t('board.completedTasksToggle'), key: 'sf_showCompletedTasks',    value: showCompletedTasks,    set: (v: boolean) => { setShowCompletedTasks(v);    togglePref('sf_showCompletedTasks',    v); } },
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
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', padding: '4px 10px 2px', letterSpacing: '0.06em' }}>{t('board.prefsAutoSaved')}</p>
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

      {/* Content */}
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* Board view */}
      {view === 'board' && (
        <TravailBoard
          sections={visibleSections}
          selectedTask={selectedTask}
          multiSelIds={multiSelIds}
          onConvertRequest={handleConvertRequest}
          onSelectTask={handleSelectTask}
          onUpdateTask={(taskId, patch) => {
            updateTask(projectId!, taskId, patch);
            setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.map(t => t.id === taskId ? { ...t, ...patch } : t) })));
            if (selectedTask?.id === taskId) setSelectedTask(prev => prev ? { ...prev, ...patch } : prev);
          }}
          onToggleSectionComplete={label => setSections(prev => prev.map(s => s.label === label ? { ...s, completed: !s.completed } : s))}
          onAddTask={handleAddTask}
          onMoveTask={handleMoveTask}
          onAddSection={label => setSections(prev => [...prev, { label, tasks: [] }])}
          onDeleteTask={task => setSections(prev => prev.map(s => ({ ...s, tasks: s.tasks.filter(t => t.id !== task.id) })))}
          onDeleteSection={label => setSections(prev => prev.filter(s => s.label !== label))}
          onRenameSection={(oldLabel, newLabel) => setSections(prev => prev.map(s => s.label === oldLabel ? { ...s, label: newLabel.trim() || s.label } : s))}
          projectId={project.id}
          projectName={project.name}
          projectColor={project.clientColor}
        />
      )}

      {/* List view */}
      {view === 'list' && <div onDragEnd={() => { setDraggedTask(null); setDraggedIdx(null); }} style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: 20 }}><div style={{ minWidth: 900 }}>
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
                onAddTaskMany={tasks => handleAddTasks(globalIdx, tasks)}
                onDelete={() => handleDeleteSection(globalIdx)}
                onRename={newLabel => handleRenameSection(globalIdx, newLabel)}
                onDeleteTask={taskId => setSections(prev => prev.map((s, i) => i === globalIdx ? { ...s, tasks: s.tasks.filter(t => t.id !== taskId) } : s))}
                projectId={project.id}
                projectName={project.name}
                projectColor={project.clientColor}
                draggedTask={draggedTask}
                onTaskDragStart={task => handleTaskDragStart(task, section.label)}
                onTaskDragEnd={() => setDraggedTask(null)}
                onTaskDrop={handleTaskDrop}
                allSections={sections}
                onMoveTaskToSection={handleMoveTaskToSection}
                onMoveSection={() => setSectionMoveLabel(section.label)}
                onCopySection={() => setSectionCopyLabel(section.label)}
                multiSelIds={multiSelIds}
                onConvertRequest={handleConvertRequest}
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
        )}
      </div></div>}

      </div>
      </div>{/* end left column */}

      {/* Inline task panel — animated width */}
      <div style={{ width: selectedTask ? 440 : 0, flexShrink: 0, overflow: 'hidden', transition: 'width 0.2s ease', borderLeft: selectedTask ? '1px solid var(--border)' : 'none', display: 'flex', flexDirection: 'column' }}>
        {selectedTask && (
          <TaskPanel
            key={selectedTask.id}
            inline
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
      </div>

      {/* Save as template modal */}
      {saveTemplateOpen && (
        <SaveAsTemplateModal
          projectName={project.name}
          sections={sections}
          onClose={() => setSaveTemplateOpen(false)}
        />
      )}

      {/* Multi-select floating action bar */}
      {multiSelIds.size > 0 && createPortal(
        <div style={{ position: 'fixed', bottom: 28, left: '50%', transform: 'translateX(-50%)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 14, padding: '10px 16px', display: 'flex', alignItems: 'center', gap: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.55)', zIndex: 400 }}>
          <span style={{ fontSize: 13, color: 'var(--accent)', fontWeight: 700, fontFamily: 'var(--ff-mono)' }}>{t('board.selectedTasksCount', { count: multiSelIds.size })}</span>
          <div style={{ width: 1, height: 20, background: 'var(--border)' }} />
          <button onClick={() => setBulkMoveOpen(true)} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '6px 12px', borderRadius: 9, background: 'var(--surface-3)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-text)' }}>
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

      {/* Bulk move tasks modal */}
      {bulkMoveOpen && (
        <BulkMoveModal
          title={t('board.moveTasksTitle', { count: multiSelIds.size })}
          mode="move"
          onMove={(toProjectId, toSectionLabel) => {
            // moveTasks() already writes the store; the subscribeStore sync
            // effect above picks up the change. Re-reading and re-writing
            // sections here raced the async Supabase write and could clobber
            // it back to the pre-move snapshot (same bug as the convert-to-
            // subtask picker below).
            moveTasks(project.id, [...multiSelIds], toProjectId, toSectionLabel);
            setMultiSelIds(new Set());
          }}
          onClose={() => setBulkMoveOpen(false)}
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
