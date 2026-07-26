import { useState, useMemo, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { SFPill, SFAvatar, SFIcon, fmtTaskDate, isOverdue } from '../components/ui';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { getSections, updateTask, subscribeStore } from '../data/taskStore';
import { TaskPanel } from '../components/TaskPanel';
import type { Task, Priority } from '../types';

// Toutes les tâches, tous projets confondus — pendant de Calendrier/Fichiers/
// Finances globaux, mais pour les tâches. Distinct de "Mes tâches" (qui
// filtre sur l'assigné) : ici on montre tout, avec un filtre par projet.
// Volontairement plus léger que Taches.tsx : pas de glisser-déposer, pas de
// conversion sous-tâche/tâche, pas de sélection multiple — juste parcourir
// et ouvrir n'importe quelle tâche de n'importe quel projet.

const GRID = '1fr 150px 130px 90px 100px 90px';

type SortCol = 'title' | 'priority' | 'status' | 'dueDate';
type SortDir = 'asc' | 'desc';

const PRIORITY_LABEL_KEY: Record<Priority, string> = { high: 'priority.high', normal: 'priority.medium', low: 'priority.low', none: 'priority.none' };
const PRIORITY_COLOR: Record<Priority, string> = { high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)' };
const PRIORITY_SORT_ORDER: Record<Priority, number> = { high: 0, normal: 1, low: 2, none: 3 };
const STATUS_SORT_ORDER: Record<string, number> = { danger: 0, warn: 1, review: 2, info: 3, ok: 4 };

function dueDateSortKey(date: string): number {
  if (date === 'Hier') return -1;
  if (date === "Aujourd'hui") return 0;
  if (date === 'Demain') return 1;
  if (!date || date === '—') return 9999;
  const m = date.match(/Dans (\d+)/i);
  if (m) return parseInt(m[1]);
  return 100;
}

function getAllTasks(): Task[] {
  const tasks: Task[] = [];
  for (const project of getProjects()) {
    if (project.archived) continue;
    for (const section of getSections(project.id)) {
      tasks.push(...section.tasks);
    }
  }
  return tasks;
}

export function TachesToutes() {
  const { t } = useTranslation();
  const [tasks, setTasks] = useState<Task[]>(getAllTasks);
  const [projects, setProjects] = useState(getProjects);
  const [projectFilter, setProjectFilter] = useState<string>('all');
  const [hideCompleted, setHideCompleted] = useState(true);
  const [sort, setSort] = useState<{ col: SortCol | null; dir: SortDir }>({ col: null, dir: 'asc' });
  const [selectedTask, setSelectedTask] = useState<Task | null>(null);

  useEffect(() => subscribeStore(() => {
    setTasks(getAllTasks());
    setSelectedTask(prev => prev ? getAllTasks().find(t => t.id === prev.id) ?? null : null);
  }), []);
  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);

  const activeProjects = projects.filter(p => !p.archived);

  const filtered = useMemo(() => {
    let list = tasks;
    if (projectFilter !== 'all') list = list.filter(tk => tk.projectId === projectFilter);
    if (hideCompleted) list = list.filter(tk => !tk.checked);
    return list;
  }, [tasks, projectFilter, hideCompleted]);

  const sorted = useMemo(() => {
    if (!sort.col) return filtered;
    const sign = sort.dir === 'asc' ? 1 : -1;
    return [...filtered].sort((a, b) => {
      let v = 0;
      if (sort.col === 'title') v = a.title.localeCompare(b.title, 'fr');
      if (sort.col === 'priority') v = PRIORITY_SORT_ORDER[a.priority] - PRIORITY_SORT_ORDER[b.priority];
      if (sort.col === 'status') v = (STATUS_SORT_ORDER[a.status] ?? 9) - (STATUS_SORT_ORDER[b.status] ?? 9);
      if (sort.col === 'dueDate') v = dueDateSortKey(a.dueDate) - dueDateSortKey(b.dueDate);
      return v * sign;
    });
  }, [filtered, sort]);

  const toggleSort = (col: SortCol) => {
    setSort(prev => prev.col === col ? { col, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { col, dir: 'asc' });
  };

  const sortableHeader = (label: string, col: SortCol) => {
    const active = sort.col === col;
    return (
      <button onClick={() => toggleSort(col)} style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: 0, fontFamily: 'var(--ff-mono)', fontSize: 9, color: active ? 'var(--text)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', fontWeight: active ? 700 : 400 }}>
        {label}
        <span style={{ opacity: active ? 1 : 0.3, color: active ? 'var(--accent)' : 'var(--text-3)', fontSize: 10, lineHeight: 1 }}>
          {active && sort.dir === 'asc' ? '↑' : '↓'}
        </span>
      </button>
    );
  };

  const lateCount = tasks.filter(tk => !tk.checked && (isOverdue(tk.dueDate ?? '') || tk.status === 'danger')).length;

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('tasks.allTasksTitle')}</h1>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>
              {t('tasks.taskCountSummary', { visible: sorted.length, total: tasks.length })}
              {lateCount > 0 && <> · <span style={{ color: 'var(--danger)' }}>{t('tasks.overdueCount', { count: lateCount })}</span></>}
            </p>
          </div>

          <div style={{ padding: '8px 24px', display: 'flex', alignItems: 'center', gap: 8 }}>
            <select value={projectFilter} onChange={e => setProjectFilter(e.target.value)}
              style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}>
              <option value="all">{t('nav.projects')} — {t('tasks.filterAll')}</option>
              {activeProjects.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
            </select>
            <button
              onClick={() => setHideCompleted(v => !v)}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: `1px solid ${hideCompleted ? 'var(--accent)' : 'var(--border)'}`, background: hideCompleted ? 'rgba(249,255,0,0.08)' : 'transparent', color: hideCompleted ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}
            >
              <SFIcon name={hideCompleted ? 'eye-off' : 'eye'} size={12} />
              {t('tasks.hideCompleted')}
            </button>
          </div>
        </div>

        {/* Table */}
        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '16px 24px' }}>
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '8px 16px', borderBottom: '1px solid var(--border)' }}>
              {sortableHeader(t('tasks.task'), 'title')}
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('tasks.project')}</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{t('tasks.assigned')}</span>
              {sortableHeader(t('tasks.priority'), 'priority')}
              {sortableHeader(t('tasks.status'), 'status')}
              {sortableHeader(t('tasks.date'), 'dueDate')}
            </div>

            {sorted.length === 0 ? (
              <div style={{ padding: '48px 0', textAlign: 'center' }}>
                <SFIcon name="circle-check" size={28} color="var(--text-3)" />
                <p style={{ fontSize: 12, color: 'var(--text-3)', marginTop: 10 }}>{t('board.noTasks')}</p>
              </div>
            ) : sorted.map(task => (
              <div key={task.id} onClick={() => setSelectedTask(task)}
                style={{ display: 'grid', gridTemplateColumns: GRID, alignItems: 'center', gap: 12, padding: '10px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer', background: selectedTask?.id === task.id ? 'var(--surface-2)' : 'transparent' }}
                onMouseEnter={e => { if (selectedTask?.id !== task.id) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (selectedTask?.id !== task.id) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
              >
                <span style={{ fontSize: 13, color: 'var(--text)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', textDecoration: task.checked ? 'line-through' : 'none', opacity: task.checked ? 0.5 : 1 }}>
                  {task.title}
                </span>
                <span style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'var(--text-2)', overflow: 'hidden' }}>
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: task.projectColor, flexShrink: 0 }} />
                  <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{task.projectName}</span>
                </span>
                {task.assignee ? (
                  <SFAvatar initials={task.assignee.initials} bg={task.assignee.avatarColor} size={22} />
                ) : <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>}
                <span style={{ fontSize: 10, fontFamily: 'var(--ff-mono)', color: PRIORITY_COLOR[task.priority] }}>{t(PRIORITY_LABEL_KEY[task.priority])}</span>
                <SFPill status={task.status} small>{task.statusLabel}</SFPill>
                <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: isOverdue(task.dueDate) ? 'var(--danger)' : 'var(--text-3)' }}>{fmtTaskDate(task.dueDate)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail panel */}
      <div style={{ width: selectedTask ? 440 : 0, flexShrink: 0, overflow: 'hidden', transition: 'width 0.2s ease', borderLeft: selectedTask ? '1px solid var(--border)' : 'none' }}>
        {selectedTask && (
          <TaskPanel
            key={selectedTask.id}
            task={selectedTask}
            onClose={() => setSelectedTask(null)}
            onUpdate={patch => updateTask(selectedTask.projectId, selectedTask.id, patch)}
          />
        )}
      </div>
    </div>
  );
}
