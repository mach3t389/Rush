import React, { useState, useRef, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { SFIcon } from './ui';
import { findProject, updateProject, subscribeProjects } from '../data/projectStore';
import { STATUS_COLOR } from '../data/status';
import { getProjectColor, setProjectColor } from '../data/pinnedStore';
import { useProjectTaskNotifCount, useProjectResourceNotifCount } from '../hooks/useNotifs';
import { PROJECT_STATUS_OPTIONS, ProjectEditPanel } from './ProjectCard';
import type { EditUpdates } from './ProjectCard';

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
  const [status, setStatus] = useState(project?.status ?? '');
  const [statusLabel, setStatusLabel] = useState(project?.statusLabel ?? '');
  const [statusOpen, setStatusOpen] = useState(false);
  const [statusRect, setStatusRect] = useState<DOMRect | null>(null);
  const statusBtnRef = useRef<HTMLButtonElement>(null);
  const [editOpen, setEditOpen] = useState(false);
  const [localName, setLocalName] = useState(project?.name ?? '');
  const [localColor, setLocalColor] = useState(dotColor);

  const taskNotifs    = useProjectTaskNotifCount(projectId);
  const resourceNotifs = useProjectResourceNotifCount(projectId);

  useEffect(() => subscribeProjects(() => forceUpdate(n => n + 1)), []);

  if (!project) return null;

  const tabs = [
    { label: "Vue d'ensemble", path: `/projets/${projectId}/overview`,   end: true,  badge: 0 },
    { label: 'Tâches',         path: `/projets/${projectId}`,            end: true,  badge: taskNotifs },
    { label: 'Fichiers',        path: `/projets/${projectId}/fichiers`,   end: false, badge: 0 },
    { label: 'Calendrier',     path: `/projets/${projectId}/calendrier`, end: false, badge: 0 },
    { label: 'Équipe',         path: `/projets/${projectId}/membres`,    end: false, badge: 0 },
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

          {/* Status badge */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <button
              ref={statusBtnRef}
              onClick={() => { const r = statusBtnRef.current?.getBoundingClientRect() ?? null; setStatusRect(r); setStatusOpen(v => !v); }}
              title="Changer le statut du projet"
              style={{
                display: 'flex', alignItems: 'center', gap: 5,
                padding: '2px 8px', borderRadius: 20,
                border: `1px solid ${STATUS_COLOR[status] ?? 'var(--border-2)'}`,
                background: `color-mix(in srgb, ${STATUS_COLOR[status] ?? 'var(--border-2)'} 12%, transparent)`,
                color: STATUS_COLOR[status] ?? 'var(--text-3)',
                fontSize: 10, fontFamily: 'var(--ff-mono)', cursor: 'pointer',
                letterSpacing: '0.03em',
              }}
            >
              <span style={{ width: 5, height: 5, borderRadius: '50%', background: STATUS_COLOR[status] ?? 'var(--border-2)', flexShrink: 0 }} />
              {statusLabel || 'Aucun statut'}
            </button>
            {statusOpen && statusRect && (
              <>
                <div onClick={() => setStatusOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
                <div style={{
                  position: 'fixed', top: statusRect.bottom + 6, left: statusRect.left,
                  zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)',
                  borderRadius: 10, padding: 4,
                  boxShadow: '0 8px 32px rgba(0,0,0,0.5)', minWidth: 160,
                }}>
                  {PROJECT_STATUS_OPTIONS.map(o => (
                    <button
                      key={o.status}
                      onClick={() => { setStatus(o.status); setStatusLabel(o.label); setStatusOpen(false); updateProject(project.id, { status: o.status, statusLabel: o.label }); }}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 8, width: '100%',
                        padding: '7px 10px', borderRadius: 7, border: 'none',
                        background: status === o.status ? 'var(--surface-3)' : 'transparent',
                        color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)',
                        cursor: 'pointer', textAlign: 'left',
                      }}
                      onMouseEnter={e => { if (status !== o.status) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                      onMouseLeave={e => { if (status !== o.status) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                    >
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: STATUS_COLOR[o.status], display: 'block', flexShrink: 0 }} />
                      {o.label}
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>
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

      {/* Right slot — bouton Modifier (partagé sur tous les onglets) + actions propres à l'onglet */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        <button
          onClick={() => setEditOpen(true)}
          title="Modifier le projet"
          style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '8px 13px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 13, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
        >
          <SFIcon name="square-pen" size={14} color="var(--text-3)" />
          Modifier
        </button>
        {children}
      </div>

      {editOpen && project && (
        <ProjectEditPanel
          p={project}
          color={localColor}
          name={localName}
          status={status as any}
          statusLabel={statusLabel}
          phase={project.phase}
          phaseLabel={project.phaseLabel}
          deliveryDate={project.deliveryDate}
          onClose={() => setEditOpen(false)}
          onSave={(u: EditUpdates) => {
            setLocalName(u.name);
            setLocalColor(u.color);
            setProjectColor(project.id, u.color);
            setStatus(u.status);
            setStatusLabel(u.statusLabel);
            updateProject(project.id, {
              name: u.name, status: u.status, statusLabel: u.statusLabel,
              phase: u.phase, phaseLabel: u.phaseLabel, deliveryDate: u.deliveryDate,
              budget: u.budget, description: u.description,
            });
            forceUpdate(n => n + 1);
          }}
        />
      )}
    </div>
  );
}
