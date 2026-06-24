import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFPill, SFBar, SFAvatar, SFButton, SFIcon, isOverdue, fmtTaskDate } from '../components/ui';
import { TODAY_TASKS, ACTIVITY, PROJECTS, USERS } from '../data/mock';
import { getEvents, subscribeEvents, type CalendarEvent } from '../data/eventStore';
import { loadProfile } from '../components/profile/ProfileEditPanel';
import { getEventTypeById } from '../data/eventTypeStore';

// ── Helpers ───────────────────────────────────────────────────────────────────

const DAYS_FR   = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];
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

function fmtEventTime(ev: CalendarEvent): string {
  const start = new Date(ev.start);
  const now = new Date();
  const isToday = isSameDay(start, now);
  const isTomorrow = isSameDay(start, addDays(now, 1));
  const dayStr = isToday ? "Aujourd'hui" : isTomorrow ? 'Demain'
    : `${DAYS_FR[start.getDay()]} ${start.getDate()} ${MONTHS_FR[start.getMonth()]}`;
  if (ev.allDay) return dayStr;
  const hh = String(start.getHours()).padStart(2, '0');
  const mm = String(start.getMinutes()).padStart(2, '0');
  return `${dayStr} · ${hh}h${mm}`;
}

function isEventNow(ev: CalendarEvent): boolean {
  const now = Date.now();
  return new Date(ev.start).getTime() <= now && new Date(ev.end).getTime() >= now;
}

const PRIORITY_COLOR: Record<string, string> = {
  urgent: 'var(--danger)',
  high:   'var(--danger)',
  normal: 'var(--warn)',
  low:    'var(--info)',
  none:   'var(--border-2)',
};
const PRIORITY_LABEL: Record<string, string> = {
  urgent: 'Urgente', high: 'Élevée', normal: 'Moyenne', low: 'Basse', none: 'Aucune',
};
const STATUS_BG: Record<string, string> = {
  danger: '#3a1515', warn: '#3a2f10', info: '#102a3a', ok: '#0f2f1a', review: '#2a1a3a', neutral: 'var(--surface-3)',
};
const STATUS_COLOR: Record<string, string> = {
  danger: 'var(--danger)', warn: 'var(--warn)', info: 'var(--info)', ok: 'var(--ok)', review: 'var(--review)', neutral: 'var(--text-3)',
};

// ── Collapsible section card ──────────────────────────────────────────────────

function CollapsibleCard({
  icon, title, badge, linkLabel, onLink, children, defaultOpen = true,
}: {
  icon: string; title: string; badge?: string | number;
  linkLabel?: string; onLink?: () => void;
  children: React.ReactNode; defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', overflow: 'hidden' }}>
      <button
        onClick={() => setOpen(v => !v)}
        style={{
          width: '100%', display: 'flex', alignItems: 'center', gap: 8,
          padding: '14px 18px', background: 'none', border: 'none', cursor: 'pointer',
          borderBottom: open ? '1px solid var(--border)' : 'none',
        }}
      >
        <SFIcon name={icon} size={14} color="var(--text-3)" />
        <span style={{ fontWeight: 600, fontSize: 14, color: 'var(--text)', flex: 1, textAlign: 'left' }}>{title}</span>
        {badge !== undefined && (
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', background: 'var(--surface-3)', borderRadius: 6, padding: '1px 7px' }}>{badge}</span>
        )}
        {linkLabel && onLink && (
          <span
            onClick={e => { e.stopPropagation(); onLink(); }}
            style={{ fontSize: 12, color: 'var(--accent-dim)', marginLeft: 4, cursor: 'pointer' }}
          >{linkLabel} →</span>
        )}
        <SFIcon name={open ? 'chevron-up' : 'chevron-down'} size={13} color="var(--text-3)" />
      </button>
      {open && children}
    </div>
  );
}

// ── Compact task row — same look as Taches.tsx TaskRow ───────────────────────

function CompactTaskRow({ task, onClick }: { task: typeof TODAY_TASKS[0]; onClick?: () => void }) {
  const [checked, setChecked] = useState(task.checked ?? false);
  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: '28px 1fr 130px 110px 90px',
        alignItems: 'center',
        gap: 10,
        padding: '8px 16px',
        borderBottom: '1px solid var(--border)',
        cursor: 'pointer',
        opacity: checked ? 0.4 : 1,
        transition: 'opacity 0.3s, background 0.1s',
        borderLeft: '2px solid transparent',
      }}
      onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.background = 'transparent'; }}
      onClick={onClick}
    >
      {/* Checkbox */}
      <button
        onClick={e => { e.stopPropagation(); setChecked(v => !v); }}
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

      {/* Titre */}
      <span style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', color: 'var(--text)' }}>
        {task.title}
      </span>

      {/* Projet */}
      <span style={{
        fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 600,
        color: 'white', background: task.projectColor ?? 'var(--surface-3)',
        borderRadius: 5, padding: '2px 7px', overflow: 'hidden',
        textOverflow: 'ellipsis', whiteSpace: 'nowrap',
      }}>{task.projectName}</span>

      {/* Priorité */}
      <span style={{ display: 'flex', alignItems: 'center', gap: 5, flexShrink: 0 }}>
        <span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[task.priority] ?? 'var(--border-2)', flexShrink: 0 }} />
        <span style={{ fontSize: 11, color: PRIORITY_COLOR[task.priority] ?? 'var(--text-3)', fontFamily: 'var(--ff-mono)' }}>
          {PRIORITY_LABEL[task.priority] ?? '—'}
        </span>
      </span>

      {/* Échéance */}
      {task.dueDate && task.dueDate !== '—' ? (
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: isOverdue(task.dueDate ?? '') ? 'var(--danger)' : 'var(--text-3)', flexShrink: 0 }}>
          {fmtTaskDate(task.dueDate ?? '')}
        </span>
      ) : (
        <span style={{ fontSize: 11, color: 'var(--text-3)' }}>—</span>
      )}
    </div>
  );
}

// ── Dashboard ─────────────────────────────────────────────────────────────────

export function Dashboard() {
  const navigate = useNavigate();
  const activeProjects = PROJECTS.filter(p => p.status !== 'neutral');
  const lateProjects   = PROJECTS.filter(p => p.status === 'danger').length;
  const urgentToday    = TODAY_TASKS.filter(t => t.priority === 'urgent').length;

  const [events, setEvents] = useState<CalendarEvent[]>(getEvents);
  useEffect(() => subscribeEvents(() => setEvents(getEvents())), []);

  const now = new Date();
  const in14Days = addDays(now, 14);
  const upcomingEvents = events
    .filter(ev => new Date(ev.end) >= now && new Date(ev.start) <= in14Days)
    .sort((a, b) => new Date(a.start).getTime() - new Date(b.start).getTime())
    .slice(0, 6);

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

  const firstName = (() => {
    const p = loadProfile(USERS.lea.id);
    const full = p.name ?? USERS.lea.name;
    return full.split(' ')[0];
  })();

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 16 }}>

      {/* Header compact */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16 }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 22, lineHeight: 1.2 }}>Bonjour, {firstName} 👋</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)', marginTop: 3 }}>
            {dayLabel}
          </p>
        </div>
        {/* Inline mini-stats */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 20, marginRight: 'auto', marginLeft: 24 }}>
          {[
            { value: activeProjects.length, label: 'projets actifs',     color: 'var(--text-2)' },
            { value: TODAY_TASKS.length,    label: 'tâches cette semaine', color: 'var(--text-2)' },
            ...(lateProjects > 0  ? [{ value: lateProjects,             label: 'en retard',      color: 'var(--danger)' }] : []),
            ...(urgentToday > 0   ? [{ value: urgentToday,              label: 'urgentes auj.',  color: 'var(--warn)'   }] : []),
          ].map(s => (
            <div key={s.label} style={{ display: 'flex', alignItems: 'baseline', gap: 5 }}>
              <span style={{ fontFamily: 'var(--ff-display)', fontWeight: 800, fontSize: 20, color: s.color, lineHeight: 1 }}>{s.value}</span>
              <span style={{ fontSize: 11, color: 'var(--text-3)' }}>{s.label}</span>
            </div>
          ))}
        </div>
        <SFButton variant="primary" icon="plus" onClick={() => navigate('/projets')}>Nouveau projet</SFButton>
      </div>

      {/* Main body: 2 columns */}
      <div style={{ display: 'grid', gridTemplateColumns: '1.1fr 0.9fr', gap: 16 }}>

        {/* LEFT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Mes tâches — collapsible compact */}
          <CollapsibleCard
            icon="check-square" title="Mes tâches" badge={TODAY_TASKS.length}
            linkLabel="Voir toutes" onLink={() => navigate('/taches')}
          >
            {TODAY_TASKS.slice(0, 5).map(t => (
              <CompactTaskRow key={t.id} task={t} onClick={() => navigate('/taches')} />
            ))}
            {TODAY_TASKS.length > 5 && (
              <button onClick={() => navigate('/taches')} style={{
                width: '100%', padding: '8px 16px', background: 'none', border: 'none',
                cursor: 'pointer', fontSize: 11, color: 'var(--text-3)', textAlign: 'left',
              }}>
                +{TODAY_TASKS.length - 5} tâches → Voir toutes
              </button>
            )}
          </CollapsibleCard>

          {/* Prochaines échéances — compact */}
          <CollapsibleCard icon="calendar-days" title="Prochaines échéances" defaultOpen={false}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', padding: '10px 16px', gap: 4 }}>
              {tasksByDay.map(({ day, tasks: dayTasks }, i) => {
                const isToday = i === 0;
                const hasUrgent = dayTasks.some(t => t.priority === 'urgent');
                return (
                  <div key={i} style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4 }}>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 8, color: isToday ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase' }}>
                      {DAYS_FR[day.getDay()]}
                    </span>
                    <div style={{
                      width: 24, height: 24, borderRadius: '50%',
                      background: isToday ? 'var(--accent)' : 'transparent',
                      border: isToday ? 'none' : '1px solid var(--border)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}>
                      <span style={{ fontSize: 11, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--on-accent)' : 'var(--text-2)' }}>{day.getDate()}</span>
                    </div>
                    {dayTasks.length > 0 && (
                      <div style={{ width: 16, height: 3, borderRadius: 99, background: hasUrgent ? 'var(--danger)' : 'var(--accent)' }} />
                    )}
                  </div>
                );
              })}
            </div>
            <div style={{ borderTop: '1px solid var(--border)' }}>
              {tasksByDay.flatMap(({ day, tasks: dTasks }) => dTasks.map(t => ({ t, day }))).slice(0, 3).map(({ t, day }, i, arr) => (
                <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 18px', borderBottom: i < arr.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  <div style={{ width: 3, height: 26, borderRadius: 99, background: PRIORITY_COLOR[t.priority] ?? 'var(--border-2)', flexShrink: 0 }} />
                  <p style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</p>
                  <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isSameDay(day, TODAY) ? 'var(--accent)' : 'var(--text-3)', flexShrink: 0 }}>
                    {isSameDay(day, TODAY) ? "Auj." : `${DAYS_FR[day.getDay()]} ${day.getDate()}`}
                  </span>
                </div>
              ))}
              {tasksByDay.flatMap(({ tasks: dTasks }) => dTasks).length === 0 && (
                <p style={{ padding: '12px 18px', color: 'var(--text-3)', fontSize: 13 }}>Aucune échéance cette semaine</p>
              )}
            </div>
          </CollapsibleCard>

          {/* Prochains événements */}
          <CollapsibleCard
            icon="calendar-clock" title="Prochains événements"
            linkLabel="Calendrier" onLink={() => navigate('/calendrier')}
          >
            {upcomingEvents.length === 0 && (
              <p style={{ padding: '16px 18px', color: 'var(--text-3)', fontSize: 13 }}>Aucun événement dans les 14 prochains jours</p>
            )}
            {upcomingEvents.map((ev, i) => {
              const type = getEventTypeById(ev.eventTypeId);
              const inProgress = isEventNow(ev);
              const project = PROJECTS.find(p => p.id === ev.projectId);
              return (
                <div
                  key={ev.id}
                  onClick={() => navigate('/calendrier')}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '9px 18px',
                    borderBottom: i < upcomingEvents.length - 1 ? '1px solid var(--border)' : 'none',
                    cursor: 'pointer',
                    background: inProgress ? 'rgba(249,255,0,0.03)' : 'transparent',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.background = inProgress ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)')}
                  onMouseLeave={e => (e.currentTarget.style.background = inProgress ? 'rgba(249,255,0,0.03)' : 'transparent')}
                >
                  <div style={{
                    width: 32, height: 32, borderRadius: 9, flexShrink: 0,
                    background: `${type?.color ?? '#888'}1a`,
                    border: `1px solid ${type?.color ?? '#888'}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <SFIcon name={type?.icon ?? 'circle'} size={14} color={type?.color ?? '#888'} />
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                      <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
                      {inProgress && (
                        <span style={{
                          flexShrink: 0, fontSize: 9, fontFamily: 'var(--ff-mono)', fontWeight: 700,
                          color: 'var(--on-accent)', background: 'var(--accent)',
                          borderRadius: 4, padding: '1px 5px', letterSpacing: '0.05em',
                        }}>EN COURS</span>
                      )}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginTop: 2 }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: inProgress ? 'var(--accent)' : 'var(--text-3)' }}>
                        {fmtEventTime(ev)}
                      </span>
                      {project && (
                        <>
                          <span style={{ color: 'var(--border-2)', fontSize: 9 }}>·</span>
                          <span style={{
                            fontSize: 10, fontFamily: 'var(--ff-mono)', fontWeight: 700,
                            color: 'white', background: project.clientColor,
                            borderRadius: 4, padding: '1px 6px',
                          }}>{project.name}</span>
                        </>
                      )}
                      {ev.location && (
                        <>
                          <span style={{ color: 'var(--border-2)', fontSize: 9 }}>·</span>
                          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.location}</span>
                        </>
                      )}
                    </div>
                  </div>
                  <SFIcon name="chevron-right" size={13} color="var(--text-3)" />
                </div>
              );
            })}
          </CollapsibleCard>
        </div>

        {/* RIGHT */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

          {/* Projets actifs — collapsible compact */}
          <CollapsibleCard
            icon="folder" title="Projets actifs" badge={activeProjects.length}
            linkLabel="Voir tous" onLink={() => navigate('/projets')}
          >
            {PROJECTS.slice(0, 6).map((p, i) => (
              <div
                key={p.id}
                onClick={() => navigate(`/projets/${p.id}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '9px 18px',
                  borderBottom: i < Math.min(PROJECTS.length, 6) - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: p.clientColor, flexShrink: 0 }} />
                <p style={{ flex: 1, fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
                <div style={{ width: 60, flexShrink: 0 }}>
                  <SFBar value={p.progress} height={3} />
                </div>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', flexShrink: 0, width: 28, textAlign: 'right' }}>{p.progress}%</span>
                <SFPill status={p.status} small>{p.statusLabel}</SFPill>
              </div>
            ))}
          </CollapsibleCard>

          {/* En attente d'approbation */}
          <CollapsibleCard icon="shield" title="En attente d'approbation" badge={PENDING_APPROVALS.length}>
            {PENDING_APPROVALS.map((item, i) => (
              <div
                key={item.name}
                onClick={() => navigate(`/projets/${item.projectId}`)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '10px 18px',
                  borderBottom: i < PENDING_APPROVALS.length - 1 ? '1px solid var(--border)' : 'none',
                  cursor: 'pointer',
                }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 34, height: 24, borderRadius: 6, flexShrink: 0, background: 'var(--surface-2)', border: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <SFIcon name="film" size={12} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: `var(--${item.status})`, marginTop: 2 }}>En attente depuis {item.delay}</p>
                </div>
                <SFIcon name="chevron-right" size={13} color="var(--text-3)" />
              </div>
            ))}
          </CollapsibleCard>

          {/* Activité récente */}
          <CollapsibleCard
            icon="activity" title="Activité récente"
            linkLabel="Tout voir" onLink={() => navigate('/activite')}
            defaultOpen={false}
          >
            {ACTIVITY.slice(0, 5).map((item, i) => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 9, padding: '9px 18px', borderBottom: i < 4 ? '1px solid var(--border)' : 'none' }}>
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
          </CollapsibleCard>

        </div>
      </div>
    </div>
  );
}
