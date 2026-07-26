import { useState, useEffect, useRef, useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { SFPill, SFAvatar, SFIcon, fmtTaskDate, isOverdue } from '../components/ui';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { getSections, setSections, updateTask, subscribeStore } from '../data/taskStore';
import { loadPersisted, savePersisted } from '../data/persist';
import { TaskPanel } from '../components/TaskPanel';
import type { Task, Project } from '../types';

// Toutes les tâches — pendant de Calendrier/Fichiers/Finances globaux, mais
// pour les tâches. Distinct de "Mes tâches" (qui filtre sur l'assigné) : ici
// on choisit d'abord un projet (comme une app de tâches mobile), puis on
// voit/ajoute des tâches dans ce projet précis. Volontairement plus léger
// que Travail.tsx : pas de Kanban, pas de glisser-déposer, pas de
// multi-sélection — juste une liste à cocher par projet, avec ajout rapide.

const NAV_KEY = 'sf_all_tasks_project';

function newTask(project: Project, title: string): Task {
  return {
    id: `task-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    title,
    projectId: project.id,
    projectName: project.name,
    projectColor: project.clientColor,
    assignee: null,
    status: 'info',
    statusLabel: 'À faire',
    priority: 'none',
    priorityLabel: '',
    dueDate: '—',
    checked: false,
    subtasks: [],
  };
}

function QuickAdd({ project }: { project: Project }) {
  const { t } = useTranslation();
  const [title, setTitle] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  const commit = () => {
    const trimmed = title.trim();
    if (!trimmed) return;
    const sections = getSections(project.id);
    const task = newTask(project, trimmed);
    if (sections.length === 0) {
      setSections(project.id, [{ label: 'À faire', tasks: [task] }]);
    } else {
      const idx = sections.findIndex(s => !s.completed);
      const targetIdx = idx >= 0 ? idx : sections.length - 1;
      setSections(project.id, sections.map((s, i) => i === targetIdx ? { ...s, tasks: [...s.tasks, task] } : s));
    }
    setTitle('');
    inputRef.current?.focus();
  };

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 16px', borderTop: '1px solid var(--border)' }}>
      <SFIcon name="plus" size={14} color="var(--text-3)" />
      <input
        ref={inputRef}
        value={title}
        onChange={e => setTitle(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') commit(); }}
        placeholder={t('board.addTask')}
        style={{ flex: 1, background: 'transparent', border: 'none', outline: 'none', fontSize: 13, color: 'var(--text)', fontFamily: 'var(--ff-text)' }}
      />
    </div>
  );
}

export function TachesToutes() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(getProjects);
  const [, forceTick] = useState(0);
  const [selectedId, setSelectedId] = useState<string | null>(() => loadPersisted<string | null>(NAV_KEY, null));
  const [hideCompleted, setHideCompleted] = useState(true);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);

  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);
  useEffect(() => subscribeStore(() => forceTick(n => n + 1)), []);

  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);

  const selectedProject = useMemo(
    () => activeProjects.find(p => p.id === selectedId) ?? activeProjects[0] ?? null,
    [activeProjects, selectedId]
  );

  const selectProject = (id: string) => {
    setSelectedId(id);
    savePersisted(NAV_KEY, id);
  };

  const sections = selectedProject ? getSections(selectedProject.id) : [];
  const visibleSections = hideCompleted
    ? sections.map(s => ({ ...s, tasks: s.tasks.filter(tk => !tk.checked) })).filter(s => s.tasks.length > 0 || sections.length === 1)
    : sections;
  const totalCount = sections.reduce((n, s) => n + s.tasks.length, 0);
  const doneCount = sections.reduce((n, s) => n + s.tasks.filter(tk => tk.checked).length, 0);
  const selectedTask = selectedTaskId ? sections.flatMap(s => s.tasks).find(tk => tk.id === selectedTaskId) ?? null : null;

  const toggleChecked = (task: Task) => {
    if (!selectedProject) return;
    updateTask(selectedProject.id, task.id, { checked: !task.checked });
  };

  return (
    <div style={{ height: '100%', display: 'flex', overflow: 'hidden' }}>
      <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ flexShrink: 0, background: 'var(--surface)', borderBottom: '1px solid var(--border)' }}>
          <div style={{ padding: '12px 24px', borderBottom: '1px solid var(--border)' }}>
            <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('tasks.allTasksTitle')}</h1>
          </div>

          {/* Sélecteur de projet — comme une app de tâches mobile : on choisit
              d'abord le projet, puis on voit/ajoute ses tâches. */}
          <div style={{ display: 'flex', gap: 6, padding: '10px 24px', overflowX: 'auto' }}>
            {activeProjects.map(p => {
              const active = selectedProject?.id === p.id;
              return (
                <button
                  key={p.id}
                  onClick={() => selectProject(p.id)}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0,
                    padding: '6px 12px', borderRadius: 999,
                    border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}`,
                    background: active ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
                    color: active ? 'var(--accent)' : 'var(--text-2)',
                    fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer', whiteSpace: 'nowrap',
                  }}
                >
                  <span style={{ width: 7, height: 7, borderRadius: 999, background: p.clientColor, flexShrink: 0 }} />
                  {p.name}
                </button>
              );
            })}
          </div>
        </div>

        {!selectedProject ? (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-3)', fontSize: 13 }}>
            {t('board.noTasks')}
          </div>
        ) : (
          <>
            <div style={{ padding: '10px 24px 0', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                {t('tasks.taskCountSummary', { visible: totalCount - doneCount, total: totalCount })}
              </p>
              <button
                onClick={() => setHideCompleted(v => !v)}
                style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 8, border: `1px solid ${hideCompleted ? 'var(--accent)' : 'var(--border)'}`, background: hideCompleted ? 'rgba(249,255,0,0.08)' : 'transparent', color: hideCompleted ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}
              >
                <SFIcon name={hideCompleted ? 'eye-off' : 'eye'} size={12} />
                {t('tasks.hideCompleted')}
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '10px 24px 24px' }}>
              {visibleSections.map(section => (
                <div key={section.label} style={{ marginBottom: 16, background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <div style={{ padding: '8px 16px', borderBottom: '1px solid var(--border)', fontSize: 11, fontFamily: 'var(--ff-mono)', textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)' }}>
                    {section.label}
                  </div>
                  {section.tasks.length === 0 ? (
                    <p style={{ padding: '14px 16px', fontSize: 12, color: 'var(--text-3)' }}>{t('board.noTasks')}</p>
                  ) : section.tasks.map(task => (
                    <div
                      key={task.id}
                      style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 16px', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
                      onClick={() => setSelectedTaskId(task.id)}
                    >
                      <button
                        onClick={e => { e.stopPropagation(); toggleChecked(task); }}
                        style={{
                          width: 17, height: 17, borderRadius: 999, flexShrink: 0, cursor: 'pointer',
                          border: `1.5px solid ${task.checked ? 'var(--accent)' : 'var(--border-2)'}`,
                          background: task.checked ? 'var(--accent)' : 'transparent',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                        }}
                      >
                        {task.checked && <SFIcon name="check" size={11} color="var(--on-accent)" />}
                      </button>
                      <span style={{ flex: 1, fontSize: 13, color: 'var(--text)', textDecoration: task.checked ? 'line-through' : 'none', opacity: task.checked ? 0.5 : 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {task.title}
                      </span>
                      {task.assignee && <SFAvatar initials={task.assignee.initials} bg={task.assignee.avatarColor} size={20} />}
                      <SFPill status={task.status} small>{task.statusLabel}</SFPill>
                      <span style={{ fontSize: 11, fontFamily: 'var(--ff-mono)', color: isOverdue(task.dueDate) ? 'var(--danger)' : 'var(--text-3)', width: 56, textAlign: 'right', flexShrink: 0 }}>
                        {fmtTaskDate(task.dueDate)}
                      </span>
                    </div>
                  ))}
                  <QuickAdd project={selectedProject} />
                </div>
              ))}
              {sections.length === 0 && (
                <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
                  <QuickAdd project={selectedProject} />
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {/* Detail panel */}
      <div style={{ width: selectedTask ? 440 : 0, flexShrink: 0, overflow: 'hidden', transition: 'width 0.2s ease', borderLeft: selectedTask ? '1px solid var(--border)' : 'none' }}>
        {selectedTask && selectedProject && (
          <TaskPanel
            key={selectedTask.id}
            task={selectedTask}
            onClose={() => setSelectedTaskId(null)}
            onUpdate={patch => updateTask(selectedProject.id, selectedTask.id, patch)}
          />
        )}
      </div>
    </div>
  );
}
