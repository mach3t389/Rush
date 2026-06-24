import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { SFIcon } from './ui';
import { findProject, subscribeProjects } from '../data/projectStore';
import { getProjectColor, setProjectColor } from '../data/pinnedStore';
import { useProjectTaskNotifCount, useProjectResourceNotifCount } from '../hooks/useNotifs';

// ── Constants ─────────────────────────────────────────────────────────────────

const DOT_COLORS = [
  '#5B8AF5','#34C98A','#C45BE8','#F5975B','#E85B7A','#5BC4E8',
  '#F5D05B','#5BE8C4','#E87A5B','#A05BE8','#5BE870','#E85BB8',
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ProjectHeaderBar({
  projectId,
  children,
}: {
  projectId: string;
  children?: React.ReactNode;
}) {
  const navigate = useNavigate();
  const project = findProject(projectId);

  const [, forceUpdate] = useState(0);
  const dotColor = project ? getProjectColor(project.id, project.clientColor) : '#888';
  const [colorOpen, setColorOpen] = useState(false);

  const taskNotifs    = useProjectTaskNotifCount(projectId);
  const resourceNotifs = useProjectResourceNotifCount(projectId);

  useEffect(() => subscribeProjects(() => forceUpdate(n => n + 1)), []);

  if (!project) return null;

  const tabs = [
    { label: 'Aperçu',     path: `/projets/${projectId}/overview`,   end: true,  badge: 0 },
    { label: 'Tâches',     path: `/projets/${projectId}`,            end: true,  badge: taskNotifs },
    { label: 'Calendrier', path: `/projets/${projectId}/calendrier`, end: false, badge: 0 },
    { label: 'Équipe',     path: `/projets/${projectId}/membres`,    end: false, badge: 0 },
    { label: 'Activité',   path: `/projets/${projectId}/activite`,   end: false, badge: 0 },
    { label: 'Fichiers',   path: `/projets/${projectId}/fichiers`,   end: false, badge: 0 },
  ];

  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px solid var(--border)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <div>
        {/* Breadcrumb row */}
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--ff-mono)', fontSize: 11,
          color: 'var(--text-3)', marginBottom: 8,
        }}>
          <button onClick={() => navigate(`/clients/${project.clientId}`)} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {project.clientName}
          </button>
          <span>/</span>
          <button onClick={() => navigate(`/clients/${project.clientId}?tab=projets`)} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            Projets
          </button>
          <span>/</span>

          {/* Color dot */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span
              onClick={() => setColorOpen(v => !v)}
              title="Changer la couleur du projet"
              style={{
                width: 9, height: 9, borderRadius: '50%',
                background: dotColor, flexShrink: 0, display: 'block',
                cursor: 'pointer',
                outline: colorOpen ? `2px solid ${dotColor}` : 'none',
                outlineOffset: 2,
                transition: 'transform 0.1s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1.3)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.transform = 'scale(1)'; }}
            />
            {colorOpen && (
              <>
                <div onClick={() => setColorOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                <div style={{
                  position: 'absolute', top: 'calc(100% + 8px)', left: '50%',
                  transform: 'translateX(-50%)', zIndex: 100,
                  background: 'var(--surface)', border: '1px solid var(--border-2)',
                  borderRadius: 12, padding: '10px 10px 8px',
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
                  display: 'flex', flexDirection: 'column', gap: 8,
                }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', textAlign: 'center' }}>
                    Couleur du projet
                  </p>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 20px)', gap: 6 }}>
                    {DOT_COLORS.map(color => (
                      <button
                        key={color}
                        onClick={() => { setProjectColor(project.id, color); forceUpdate(n => n + 1); setColorOpen(false); }}
                        style={{
                          width: 20, height: 20, borderRadius: 6, background: color, padding: 0,
                          border: dotColor === color ? '2px solid var(--accent)' : '2px solid transparent',
                          cursor: 'pointer', outline: 'none',
                          transform: dotColor === color ? 'scale(1.15)' : 'scale(1)',
                          transition: 'transform 0.1s',
                        }}
                      />
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>

          <span style={{ color: 'var(--text-2)' }}>{project.name}</span>
        </div>

        {/* Tab bar */}
        <div style={{ display: 'flex', gap: 18 }}>
          {tabs.map(t => (
            <NavLink key={t.path} to={t.path} end={t.end} style={({ isActive }) => ({
              fontSize: 13, fontWeight: 500,
              color: isActive ? 'var(--text)' : 'var(--text-2)',
              textDecoration: 'none', paddingBottom: 6,
              borderBottom: isActive ? '2px solid var(--accent)' : '2px solid transparent',
              display: 'flex', alignItems: 'center', gap: 6,
            })}>
              {t.label}
              {t.badge > 0 && (
                <span style={{
                  fontSize: 9, fontWeight: 700, fontFamily: 'var(--ff-mono)',
                  background: 'var(--accent)', color: 'var(--on-accent)',
                  borderRadius: 999, padding: '1px 5px', lineHeight: 1.5,
                  minWidth: 14, textAlign: 'center', flexShrink: 0,
                }}>
                  {t.badge}
                </span>
              )}
            </NavLink>
          ))}
        </div>
      </div>

      {/* Right slot — actions propres à l'onglet */}
      {children && (
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {children}
        </div>
      )}
    </div>
  );
}
