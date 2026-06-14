import { useNavigate } from 'react-router-dom';
import { SFPill, SFCard, SFBar, SFAvatar, SFButton, SFIcon } from '../components/ui';
import { TODAY_TASKS, ACTIVITY, PROJECTS } from '../data/mock';
import type { Project } from '../types';

function CheckRow({ task }: { task: typeof TODAY_TASKS[0] }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
      <div style={{ width: 15, height: 15, borderRadius: '50%', border: '1.5px solid var(--border-2)', flexShrink: 0 }} />
      <span style={{ flex: 1, fontSize: 12, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{task.title}</span>
      <SFPill status="neutral" small>{task.projectName}</SFPill>
      <SFPill status={task.status} small>{task.statusLabel}</SFPill>
    </div>
  );
}

function ProjectRow({ p, onClick }: { p: Project; onClick: () => void }) {
  return (
    <div
      onClick={onClick}
      style={{ padding: '10px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}
    >
      {/* Top: name + status */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 3 }}>
        <div style={{ minWidth: 0 }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 2 }}>
            {p.clientName}
          </p>
          <p style={{ fontSize: 13, fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
        </div>
        <SFPill status={p.status} small>{p.statusLabel}</SFPill>
      </div>

      {/* Progress bar */}
      <div style={{ margin: '7px 0' }}>
        <SFBar value={p.progress} height={3} />
      </div>

      {/* Bottom: phase + members + date */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <SFPill status="neutral" small>{p.phaseLabel}</SFPill>
          {/* Member avatars */}
          <div style={{ display: 'flex' }}>
            {p.members.slice(0, 3).map((m, i) => (
              <span key={m.id} style={{ marginLeft: i === 0 ? 0 : -5 }}>
                <SFAvatar initials={m.initials} bg={m.avatarColor} size={18} />
              </span>
            ))}
            {p.members.length > 3 && (
              <span style={{
                width: 18, height: 18, borderRadius: '50%',
                background: 'var(--surface-3)',
                border: '1px solid var(--border-2)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 9, color: 'var(--text-3)', marginLeft: -5, fontFamily: 'var(--ff-mono)',
              }}>
                +{p.members.length - 3}
              </span>
            )}
          </div>
        </div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{p.deliveryDate}</span>
      </div>
    </div>
  );
}

export function Dashboard() {
  const navigate = useNavigate();
  const activeProjects = PROJECTS.filter(p => p.status !== 'neutral');
  const lateProjects = PROJECTS.filter(p => p.status === 'danger').length;
  const urgentToday = TODAY_TASKS.filter(t => t.priority === 'urgent').length;

  return (
    <div style={{ height: '100%', overflow: 'auto', padding: 24, display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* Topbar */}
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
        <div>
          <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 26, lineHeight: 1.2 }}>Bonjour, Léa 👋</h1>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 12, color: 'var(--text-3)', marginTop: 4 }}>
            Mardi 10 juin · {urgentToday > 0
              ? <><span style={{ color: 'var(--danger)' }}>{urgentToday} tâche{urgentToday > 1 ? 's' : ''} urgente{urgentToday > 1 ? 's' : ''}</span> aujourd'hui</>
              : 'Aucune tâche urgente aujourd\'hui'
            }
          </p>
        </div>
        <SFButton variant="primary" icon="plus" onClick={() => navigate('/projets')}>Nouveau projet</SFButton>
      </div>

      {/* 3-col layout */}
      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.8fr 1.2fr', gap: 16, flex: 1, minHeight: 0 }}>

        {/* Left col — Tâches + Activité */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          <SFCard gap={0}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
              <span style={{ fontWeight: 600, fontSize: 14 }}>Aujourd'hui</span>
              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>({TODAY_TASKS.length})</span>
            </div>
            {TODAY_TASKS.slice(0, 4).map(t => <CheckRow key={t.id} task={t} />)}
            <button
              onClick={() => navigate('/taches')}
              style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-dim)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
            >
              Voir toutes mes tâches →
            </button>
          </SFCard>

          <SFCard gap={0}>
            <div style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>Activité récente</div>
            {ACTIVITY.map(item => (
              <div key={item.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, padding: '7px 0', borderBottom: '1px solid var(--border)' }}>
                <SFAvatar initials={item.actor.initials} bg={item.actor.avatarColor} size={26} />
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 12, lineHeight: 1.4 }}>
                    <span style={{ fontWeight: 600 }}>{item.actor.name}</span>
                    {' '}{item.action}{' '}
                    <span style={{ color: 'var(--text-2)' }}>{item.target}</span>
                  </p>
                  {item.detail && (
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 1 }}>{item.detail}</p>
                  )}
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{item.time}</p>
                </div>
              </div>
            ))}
          </SFCard>
        </div>

        {/* Center col — Projets actifs */}
        <SFCard gap={0}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>Projets actifs</span>
            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 11, color: 'var(--text-3)' }}>({activeProjects.length})</span>
          </div>
          {PROJECTS.slice(0, 5).map(p => (
            <ProjectRow key={p.id} p={p} onClick={() => navigate(`/projets/${p.id}`)} />
          ))}
          <button
            onClick={() => navigate('/projets')}
            style={{ marginTop: 10, fontSize: 12, color: 'var(--accent-dim)', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left', padding: 0 }}
          >
            Voir tous les projets →
          </button>
        </SFCard>

        {/* Right col — KPIs + Approbations */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          {[
            { value: activeProjects.length, label: 'Projets actifs',         color: 'var(--accent)' },
            { value: lateProjects,           label: 'En retard',              color: 'var(--danger)' },
            { value: TODAY_TASKS.length,     label: 'Tâches cette semaine',   color: 'var(--text)'   },
          ].map(kpi => (
            <SFCard key={kpi.label} padding={16} style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              <span style={{ fontFamily: 'var(--ff-display)', fontWeight: 900, fontSize: 34, color: kpi.color, lineHeight: 1 }}>{kpi.value}</span>
              <span style={{ fontSize: 12, color: 'var(--text-2)' }}>{kpi.label}</span>
            </SFCard>
          ))}

          <SFCard gap={0}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
              <SFIcon name="clock" size={13} color="var(--warn)" />
              <p style={{ fontSize: 12, fontWeight: 600 }}>En attente d'approbation</p>
            </div>
            {[
              { name: 'Rough Cut — Nova Films', delay: '2j', status: 'danger' as const },
              { name: 'V3 Clip Automne',        delay: '5j', status: 'warn'   as const },
            ].map(item => (
              <div key={item.name} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '7px 0', borderBottom: '1px solid var(--border)', cursor: 'pointer' }}>
                <div style={{
                  width: 36, height: 24, borderRadius: 5, flexShrink: 0,
                  background: 'repeating-linear-gradient(135deg, rgba(255,255,255,0.04) 0 2px, transparent 2px 10px), var(--surface-2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <SFIcon name="film" size={10} color="var(--text-3)" />
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <p style={{ fontSize: 11, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{item.name}</p>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: `var(--${item.status})`, marginTop: 1 }}>En attente depuis {item.delay}</p>
                </div>
              </div>
            ))}
          </SFCard>
        </div>
      </div>
    </div>
  );
}
