import React, { useState, useEffect } from 'react';
import { useNavigate, NavLink } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFModal, SFButton } from './ui';
import { findProject, subscribeProjects, archiveProject, unarchiveProject, removeProject, updateProject } from '../data/projectStore';
import { ProjectEditPanel } from './ProjectCard';
import { CreateTemplateFromProjectModal } from './CreateTemplateFromProjectModal';
import { getProjectColor, setProjectColor } from '../data/pinnedStore';
import { confirmDialog } from '../data/confirmStore';
import { getClients } from '../data/clientStore';
import { useProjectTaskNotifCount } from '../hooks/useNotifs';

// ── Constants ─────────────────────────────────────────────────────────────────

const DOT_COLORS = [
  '#5B8AF5', '#34C98A', '#A05BE8', '#F5975B',
  '#E85B7A', '#5BC4E8', '#F5C05B', '#E85BB8',
  '#5BE8A8', '#8A6FF5', '#C4E85B', '#F55B6B',
];

// ── Component ─────────────────────────────────────────────────────────────────

export function ProjectHeaderBar({
  projectId,
  children,
}: {
  projectId: string;
  children?: React.ReactNode;
}) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const project = findProject(projectId);

  const [, forceUpdate] = useState(0);
  const dotColor = project ? getProjectColor(project.id, project.clientColor) : '#888';
  const [colorOpen, setColorOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [moveClientOpen, setMoveClientOpen] = useState(false);
  const [moveClientSearch, setMoveClientSearch] = useState('');
  const [createTemplateOpen, setCreateTemplateOpen] = useState(false);

  const taskNotifs    = useProjectTaskNotifCount(projectId);

  useEffect(() => subscribeProjects(() => forceUpdate(n => n + 1)), []);

  if (!project) return null;

  const allTabs = [
    { key: 'overview', label: t('projects.tabOverview'),   path: `/projets/${projectId}/overview`,   end: true,  badge: 0 },
    { key: 'tasks',    label: t('projects.tabTasks'),      path: `/projets/${projectId}`,            end: true,  badge: taskNotifs },
    { key: 'calendar', label: t('projects.tabCalendar'),   path: `/projets/${projectId}/calendrier`, end: false, badge: 0 },
    { key: 'files',    label: t('projects.tabFiles'),      path: `/projets/${projectId}/fichiers`,   end: false, badge: 0 },
    { key: 'finance',  label: t('projects.tabFinance'),    path: `/projets/${projectId}/finances`,   end: false, badge: 0 },
    { key: 'team',     label: t('projects.tabTeam'),       path: `/projets/${projectId}/membres`,    end: false, badge: 0 },
    { key: 'activity', label: t('projects.tabActivity'),   path: `/projets/${projectId}/activite`,   end: false, badge: 0 },
  ];
  // Un brouillon de modèle ne capture que Aperçu/Tâches/Fichiers (les 3 cases
  // à cocher de "Créer un modèle depuis ce projet") — Calendrier/Finances/
  // Membres/Activité n'ont pas de sens pour un modèle et restent masqués.
  const TEMPLATE_DRAFT_TAB_KEYS = ['overview', 'tasks', 'files'];
  const tabs = project.isTemplateDraft
    ? allTabs.filter(tb => TEMPLATE_DRAFT_TAB_KEYS.includes(tb.key))
    : allTabs.filter(tb => {
        if (tb.key === 'calendar') return project.calendarEnabled;
        if (tb.key === 'files')    return project.filesEnabled;
        if (tb.key === 'finance')  return project.financeEnabled && !!project.clientId;
        return true;
      });

  return (
    <div style={{
      padding: '12px 24px',
      borderBottom: '1px solid var(--border)',
      background: 'var(--surface)',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      flexShrink: 0,
    }}>
      <div>
        {/* Breadcrumb row */}
        {project.isTemplateDraft ? (
          <div style={{
            display: 'flex', alignItems: 'center', gap: 8,
            fontFamily: 'var(--ff-mono)', fontSize: 11,
            color: 'var(--text-3)', marginBottom: 8,
          }}>
            <SFIcon name="layout-template" size={12} color="var(--accent)" />
            <span>{t('projects.templateDraftEditing', { name: project.name })}</span>
          </div>
        ) : (
        <div style={{
          display: 'flex', alignItems: 'center', gap: 6,
          fontFamily: 'var(--ff-mono)', fontSize: 11,
          color: 'var(--text-3)', marginBottom: 8,
        }}>
          {project.clientId ? (
            <button onClick={() => navigate(`/clients/${project.clientId}`)} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              {project.clientName}
            </button>
          ) : (
            <span>{t('projects.personalProjectBadge')}</span>
          )}
          <span>/</span>
          <button onClick={() => navigate(project.clientId ? `/clients/${project.clientId}?tab=projets` : '/projets')} style={{ color: 'var(--text-3)', background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
            {t('projects.title')}
          </button>
          <span>/</span>

          {/* Color dot */}
          <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
            <span
              onClick={() => setColorOpen(v => !v)}
              title={t('projects.changeProjectColor')}
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
                    {t('projects.projectColor')}
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
        )}

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

      {/* Right slot — actions propres à l'onglet + menu du projet */}
      <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
        {/* height:32 (not just padding) so this matches the "..." button's
            height exactly instead of rendering visibly shorter. */}
        {project.archived && (
          <span style={{ display: 'flex', alignItems: 'center', height: 32, fontSize: 11, fontFamily: 'var(--ff-mono)', color: 'var(--text-3)', background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 8, padding: '0 10px', letterSpacing: '0.05em', boxSizing: 'border-box' }}>
            {t('projects.archivedBadge')}
          </span>
        )}
        {children}
        {/* "Modifier" est le premier item du menu "..." (voir ProjectCard.tsx
            pour le même changement) plutôt qu'un bouton séparé. */}
        {!project.isTemplateDraft && (
        <div style={{ position: 'relative' }}>
          <button onClick={() => setMenuOpen(v => !v)} title={t('projects.projectMenu')} style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 32, height: 32, borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}>
            <SFIcon name="ellipsis" size={15} />
          </button>
          {menuOpen && (
            <>
              <div onClick={() => { setMenuOpen(false); setConfirmDelete(false); }} style={{ position: 'fixed', inset: 0, zIndex: 90 }} />
              <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 100, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 200, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}>
                <button
                  onClick={() => { setEditOpen(true); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="square-pen" size={13} color="var(--text-3)" />
                  {t('projects.editProject')}
                </button>
                <button
                  onClick={() => { setMenuOpen(false); setCreateTemplateOpen(true); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="layout-template" size={14} color="var(--text-3)" />
                  {t('projectTemplates.createFromProjectMenuItem')}
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => { setMoveClientOpen(true); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="arrow-right-left" size={13} color="var(--text-3)" />
                  {t('projects.moveToClient')}
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => { if (project.archived) { unarchiveProject(project.id); } else { archiveProject(project.id); } setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name={project.archived ? 'rotate-ccw' : 'archive'} size={13} color="var(--text-3)" />
                  {project.archived ? t('projects.unarchiveProject') : t('projects.archiveProject')}
                </button>
                {project.archived && !confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                  >
                    <SFIcon name="trash-2" size={13} color="var(--danger)" />
                    {t('projects.deleteProjectPermanently')}
                  </button>
                )}
                {project.archived && confirmDelete && (
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{t('projects.deleteProjectConfirm')}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { removeProject(project.id); setMenuOpen(false); setConfirmDelete(false); navigate('/projets'); }}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                      >
                        {t('tasks.yes')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                      >
                        {t('tasks.no')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </>
          )}
        </div>
        )}
        {project.isTemplateDraft && (
          <>
            <SFButton variant="primary" size="sm" icon="layout-template" onClick={() => setCreateTemplateOpen(true)}>
              {t('projectTemplates.saveDraftAsTemplate')}
            </SFButton>
            <SFButton
              variant="secondary"
              size="sm"
              icon="trash-2"
              onClick={async () => {
                if (!(await confirmDialog(t('projectTemplates.confirmDiscardDraft')))) return;
                removeProject(project.id);
                navigate('/modeles');
              }}
            >
              {t('projectTemplates.discardDraft')}
            </SFButton>
          </>
        )}
      </div>

      {createTemplateOpen && project && <CreateTemplateFromProjectModal project={project} onClose={() => setCreateTemplateOpen(false)} />}

      {editOpen && (
        <ProjectEditPanel
          p={project}
          color={dotColor} name={project.name} status={project.status} statusLabel={project.statusLabel}
          phase={project.phase} phaseLabel={project.phaseLabel} deliveryDate={project.deliveryDate}
          onClose={() => setEditOpen(false)}
          onSave={u => updateProject(project.id, {
            name: u.name, clientColor: u.color, status: u.status, statusLabel: u.statusLabel,
            phase: u.phase, phaseLabel: u.phaseLabel, deliveryDate: u.deliveryDate,
            budget: u.budget, description: u.description,
          })}
        />
      )}

      {/* Move to another client */}
      {moveClientOpen && (
        <SFModal open onClose={() => { setMoveClientOpen(false); setMoveClientSearch(''); }} title={t('projects.moveToClient')} width={380} maxHeight="70vh">
          <input
            autoFocus
            value={moveClientSearch}
            onChange={e => setMoveClientSearch(e.target.value)}
            placeholder={t('members.searchPlaceholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
            {getClients().filter(c => !c.archived && c.id !== project.clientId && c.name.toLowerCase().includes(moveClientSearch.toLowerCase())).map(c => (
              <button
                key={c.id}
                onClick={() => {
                  updateProject(project.id, { clientId: c.id, clientName: c.name, clientColor: c.avatarColor });
                  setMoveClientOpen(false);
                  setMoveClientSearch('');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 28, height: 28, borderRadius: 7, background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {c.initials}
                </div>
                <span style={{ fontSize: 13 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </SFModal>
      )}
    </div>
  );
}
