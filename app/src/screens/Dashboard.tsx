import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFPill, SFBar, SFAvatar, SFButton, SFIcon, isOverdue, fmtTaskDate } from '../components/ui';
import { TODAY_TASKS, ACTIVITY, PROJECTS } from '../data/mock';
import type { Project } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS_FR  = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
const MONTHS_FR = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];
const TODAY = new Date();

function addDays(d: Date, n: number) {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function parseFrDate(s: string): Date | null {
  if (!s || s === '—') return null;
  if (s === "Aujourd'hui") return new Date(TODAY);
  if (s === 'Demain') return addDays(TODAY, 1);
  if (s === 'Hier') return addDays(TODAY, -1);
  const m = s.match(/(\d+)\s+(\w+)(?:\s+(\d{4}))?/);
  if (m) {
    const day = parseInt(m[1]);
    const mon = m[2].toLowerCase().slice(0, 4);
    const month = MONTHS_FR.findIndex(x => mon.startsWith(x.slice(0, 3)));
    const year = m[3] ? parseInt(m[3]) : TODAY.getFullYear();
    if (month !== -1) return new Date(year, month, day);
  }
  return null;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--danger)',
  high:   'var(--warn)',
  normal: 'var(--border-2)',
  low:    'var(--surface-3)',
};

// ── Task row ──────────────────────────────────────────────────────────────────

function TaskRow({ task, onClick }: { task: typeof TODAY_TASKS[0]; onClick?: () => void }) {
  const [checked, setChecked] = useState(false);
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'flex-start', gap: 10,
        padding: '9px 0', borderBottom: '1px solid var(--border)',
        cursor: onClick ? 'pointer' : 'default',
        opacity: checked ? 0.45 : 1, transition: 'opacity 0.15s',
      }}
    >
      {/* Priority bar */}
      <div style={{
        width: 3, alignSelf: 'stretch', borderRadius: 99, flexShrink: 0,
        background: PRIORITY_COLOR[task.priority] ?? 'var(--border-2)',
        minHeight: 28,
      }} />

      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); setChecked(v => !v); }}
        style={{
          width: 16, height: 16, borderRadius: '50%', flexShrink: 0,
          border: checked ? 'none' : '1.5px solid var(--border-2)',
          background: checked ? 'var(--ok)' : 'transparent',
          cursor: 'pointer', marginTop: 2,
          display: 'flex', alignItems: 'center', justifyContent: 'center',
        }}
      >
        {checked && <SFIcon name="check" size={9} color="#fff" />}
      </button>

      {/* Content */}
      <div style={{ flex: 1, minWidth: 0 }}>
        <p style={{
          fontSize: 13, lineHeight: 1.4, fontWeight: 500,
          color: checked ? 'var(--text-3)' : 'var(--text)',
          textDecoration: checked ? 'line-through' : 'none',
        }}>{task.title}</p>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 4, flexWrap: 'wrap' }}>
          <span style={{
            fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 700,
            color: 'white', background: task.projectColor ?? 'var(--surface-3)',
            borderRadius: 5, padding: '1px 6px',
          }}>{task.projectName}</span>
          <SFPill status={task.status} small>{task.statusLabel}</SFPill>
          {task.dueDate && task.dueDate !== '—' && (
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isOverdue(task.dueDate ?? '') ? 'var(--danger)' : 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 3 }}>
              <SFIcon name="calendar" size={9}  />
              {fmtTaskDate(task.dueDate ?? '')}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Project card ──────────────────────────────────────────────────────────────

function ProjectCard({ p, onClick }: { p: Project; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{
        display: 'flex', alignItems: 'center', gap: 12,
        padding: '10px 0', borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
      }}
      onMouseEnter={e => (e.currentTarget.style.opacity = '0.8')}
      onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
    >
      {/* Color dot */}
      <div style={{ width: 32, height: 32, borderRadius: 9, background: p.clientColor, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'white', fontWeight: 700 }}>{p.clientName.slice(0, 2).toUpperCase()}</span>
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
          <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
          <SFPill status={p.status} small>{p.statusLabel}</SFPill>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SFBar value={p.progress} height={3} style={{ flex: 1 }} />
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{p.progress}%</span>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0 }}>{p.deliveryDate}</span>
        </div>
      </div>
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const activeProjects = PROJECTS.filter(p => p.status !== 'neutral');
  const lateProjects   = PROJECTS.filter(p => p.status === 'danger').length;
  const urgentToday    = TODAY_TASKS.filter(t => t.priority === 'urgent').length;
  const [taskFilter, setTaskFilter] = useState<'all' | 'urgent' | 'today'>('all');
  const [showAllTasks, setShowAllTasks] = useState(false);

  const filteredTasks = TODAY_TASKS.filter(t => {
    if (taskFilter === 'urgent') return t.priority === 'urgent';
    if (taskFilter === 'today')  return t.dueDate === "Aujourd'hui";
    return true;
  });
  const visibleTasks = showAllTasks ? filteredTasks : filteredTasks.slice(0, 8);

  // Next 7 days for deadlines strip
  const weekDays = Array.from({ length: 7 }, (_, i) => addDays(TODAY, i));
  const tasksByDay = weekDays.map(day => ({
    day,
    tasks: TODAY_TASKS.filter(t => { const d = parseFrDate(t.dueDate); return d && isSameDay(d, day); }),
  }));

  const PENDING_APPROVALS = [
    { name: 'Rough Cut — Nova Films', delay: '2j', status: 'danger' as const, projectId: 'pj1' },
    { name: 'V3 Clip Automne',        delay: '5j', status: 'warn'   as const, projectId: 'pj2' },
    { name: 'Maquette motion design', delay: '1j', status: 'danger' as const, projectId: 'pj3' },
  ];

  const dayLabel = (() => {
    const d = TODAY.getDay();
    const label = ['Dimanche','Lundi','Mardi','Mercredi','Jeudi','Vendredi','Samedi'][d];
    const month = ['janvier','février','mars','avril','mai','juin','juillet','août','septembre','octobre','novembre','décembre'][TODAY.getMonth()];
    return `${label} ${TODAY.getDate()} ${month}`;
  })();

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 26, lineHeight: 1.2 }}>Bonjour, Léa 👋</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            {dayLabel} · {urgentToday > 0
              ? <><span style={{ color: 'var(--danger)' }}>{urgentToday} tâche{urgentToday > 1 ? 's' : ''} urgente{urgentToday > 1 ? 's' : ''}</span> aujourd'hui</>
              : 'Aucune tâche urgente aujourd\'hui'}
          </p>
        </div>
        <SFButton variant="primary" icon="plus" onClick={() => navigate('/projets')}>Nouveau projet</SFButton>
      </div>

      {/* KPI strip */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12 }}>
        {[
          { value: activeProjects.length, label: 'Projets actifs',          icon: 'folder',       color: 'var(--accent)',  bg: 'rgba(249,255,0,0.06)'  },
          { value: TODAY_TASKS.length,    label: 'Tâches cette semaine',     icon: 'check-square', color: 'var(--info)',    bg: 'rgba(100,160,255,0.06)' },
          { value: lateProjects,          label: 'Projets en retard',        icon: 'alert-circle', color: 'var(--danger)',  bg: 'rgba(255,60,60,0.06)'  },
          { value: PENDING_APPROVALS.length, label: 'Approbations en attente', icon: 'shield',    color: 'var(--warn)',    bg: 'rgba(255,180,0,0.06)'  },
        ].map(kpi => (
          <div key={kpi.label} style={{
            background: kpi.bg, border: `1px solid ${kpi.color}20`,
            borderRadius: 'var(--radius)', padding: '14px 18px',
            display: 'flex', alignItems: 'center', gap: 14,
          }}>
            <div style={{ width: 38, height: 38, borderRadius: 10, background: `${kpi.color}18`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              <SFIcon name={kpi.icon} size={18} color={kpi.color} />
            </div>
            <div>
              <p style={{ fontFamily: 'var(--ff-display)', fontWeight: 900, fontSize: 28, color: kpi.color, lineHeight: 1 }}>{kpi.value}</p>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 2 }}>{kpi.label}</p>
            </div>
          </div>
        ))}
      </div>

      {/* Main body: 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16, flex: 1, minHeight: 0 }}>

        {/* LEFT — Mes tâches */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Tasks card */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Card header */}
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 600, fontSize: 14 }}>Mes tâches</span>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 6, padding: '1px 7px' }}>{filteredTasks.length}</span>
              </div>
              {/* Filters */}
              <div style={{ display: 'flex', gap: 4 }}>
                {([
                  { key: 'all'    as const, label: 'Toutes' },
                  { key: 'urgent' as const, label: '🔴 Urgentes' },
                  { key: 'today'  as const, label: "Aujourd'hui" },
                ]).map(f => (
                  <button key={f.key} onClick={() => setTaskFilter(f.key)} style={{
                    padding: '4px 10px', borderRadius: 7, border: 'none', cursor: 'pointer',
                    background: taskFilter === f.key ? 'var(--surface-3)' : 'transparent',
                    color: taskFilter === f.key ? 'var(--text)' : 'var(--text-3)',
                    fontSize: 11, fontFamily: 'var(--ff-text)', fontWeight: taskFilter === f.key ? 600 : 400,
                  }}>{f.label}</button>
                ))}
              </div>
            </div>

            {/* Task list */}
            <div style={{ padding: '0 18px', overflowY: 'auto' }}>
              {visibleTasks.map(t => (
                <TaskRow key={t.id} task={t} onClick={() => navigate('/taches')} />
              ))}
              {filteredTasks.length === 0 && (
                <p style={{ padding: '20px 0', textAlign: 'center', color: 'var(--text-3)', fontSize: 13 }}>Aucune tâche</p>
              )}
            </div>

            {/* Footer */}
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexShrink: 0 }}>
              {filteredTasks.length > 8 && (
                <button
                  onClick={() => setShowAllTasks(v => !v)}
                  style={{ fontSize: 12, color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
                >
                  {showAllTasks ? 'Voir moins ↑' : `+${filteredTasks.length - 8} tâches`}
                </button>
              )}
              <button
                onClick={() => navigate('/taches')}
                style={{ marginLeft: 'auto', fontSize: 12, color: 'var(--accent-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}
              >
                Voir toutes mes tâches →
              </button>
            </div>
          </div>

          {/* Prochaines échéances — 7-day strip */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SFIcon name="calendar-days" size={14} color="var(--text-3)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Prochaines échéances</span>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '12px 18px', gap: 6 }}>
              {tasksByDay.map(({ day, tasks: dayTasks }, i) => {
                const isToday = i === 0;
                const hasUrgent = dayTasks.some(t => t.priority === 'urgent');
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 5 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: isToday ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                      {DAYS_FR[day.getDay()]}
                    </span>
                    <div style={{
                      width: 28, height: 28, borderRadius: '50%',
                      background: isToday ? 'var(--accent)' : 'transparent',
                      border: isToday ? 'none' : '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--on-accent)' : 'var(--text-2)' }}>{day.getDate()}</span>
                    </div>
                    {dayTasks.length > 0 ? (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, width: '100%' }}>
                        {dayTasks.slice(0, 2).map((t, ti) => (
                          <div key={ti} style={{
                            height: 4, borderRadius: 99,
                            background: hasUrgent ? 'var(--danger)' : 'var(--accent)',
                          }} />
                        ))}
                        {dayTasks.length > 2 && (
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: 'var(--text-3)', textAlign: 'center' }}>+{dayTasks.length - 2}</span>
                        )}
                      </div>
                    ) : (
                      <div style={{ height: 4 }} />
                    )}
                  </div>
                );
              })}
            </div>
            {/* List of tasks with dates this week */}
            <div style={{ borderTop: '1px solid var(--border)', padding: '0 18px' }}>
              {tasksByDay.flatMap(({ day, tasks: dTasks }) => dTasks.map(t => ({ t, day }))).slice(0, 4).map(({ t, day }, i, arr) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 3, height: 30, borderRadius: 99, background: PRIORITY_COLOR[t.priority] ?? 'var(--border-2)', flexShrink: 0 }} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{t.projectName}</p>
                  </div>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isSameDay(day, TODAY) ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
                    {isSameDay(day, TODAY) ? "Auj." : `${DAYS_FR[day.getDay()]} ${day.getDate()}`}
                  </span>
                </div>
              ))}
              {tasksByDay.flatMap(({ tasks: dTasks }) => dTasks).length === 0 && (
                <p style={{ padding: '12px 0', color: 'var(--text-3)', fontSize: 12 }}>Aucune échéance cette semaine</p>
              )}
            </div>
          </div>
        </div>

        {/* RIGHT — Projets + Approbations + Activité */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* Projets actifs */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Projets actifs</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 6, padding: '1px 7px' }}>{activeProjects.length}</span>
            </div>
            <div style={{ padding: '0 18px' }}>
              {PROJECTS.slice(0, 5).map(p => (
                <ProjectCard key={p.id} p={p} onClick={() => navigate(`/projets/${p.id}`)} />
              ))}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => navigate('/projets')} style={{ fontSize: 12, color: 'var(--accent-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Voir tous les projets →
              </button>
            </div>
          </div>

          {/* En attente d'approbation */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SFIcon name="shield" size={14} color="var(--warn)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>En attente d'approbation</span>
            </div>
            <div style={{ padding: '0 18px' }}>
              {PENDING_APPROVALS.map((item, i) => (
                <div
                  key={item.name}
                  onClick={() => navigate(`/projets/${item.projectId}`)}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '10px 0', borderBottom: i < PENDING_APPROVALS.length - 1 ? '1px solid var(--border)' : 'none', cursor: 'pointer' }}
                  onMouseEnter={e => (e.currentTarget.style.opacity = '0.75')}
                  onMouseLeave={e => (e.currentTarget.style.opacity = '1')}
                >
                  <div style={{ width: 34, height: 24, borderRadius: 6, flexShrink: 0, background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 10px), var(--surface-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', border: '1px solid var(--border)' }}>
                    <SFIcon name="film" size={11} color="var(--text-3)" />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: `var(--${item.status})`, marginTop: 2 }}>En attente depuis {item.delay}</p>
                  </div>
                  <SFIcon name="chevron-right" size={13} color="var(--text-3)" />
                </div>
              ))}
            </div>
          </div>

          {/* Activité récente (compact) */}
          <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
            <div style={{ padding: '14px 18px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 8 }}>
              <SFIcon name="activity" size={14} color="var(--text-3)" />
              <span style={{ fontWeight: 600, fontSize: 14 }}>Activité récente</span>
            </div>
            <div style={{ padding: '0 18px' }}>
              {ACTIVITY.slice(0, 4).map((item, i) => (
                <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 0', borderBottom: i < 3 ? '1px solid var(--border)' : 'none' }}>
                  <SFAvatar initials={item.actor.initials} bg={item.actor.avatarColor} size={24} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <p style={{ fontSize: 12, lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600 }}>{item.actor.name.split(' ')[0]}</span>
                      {' '}<span style={{ color: 'var(--text-3)' }}>{item.action}</span>{' '}
                      <span style={{ color: 'var(--text-2)' }}>{item.target}</span>
                    </p>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{item.time}</p>
                  </div>
                </div>
              ))}
            </div>
            <div style={{ padding: '10px 18px', borderTop: '1px solid var(--border)' }}>
              <button onClick={() => navigate('/activite')} style={{ fontSize: 12, color: 'var(--accent-dim)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
                Voir toute l'activité →
              </button>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}
