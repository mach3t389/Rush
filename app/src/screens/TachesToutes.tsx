import { useState, useEffect, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFBar, SFIcon } from '../components/ui';
import { getProjects, subscribeProjects } from '../data/projectStore';
import { getCurrentSectionLabel, getProjectStats, subscribeStore } from '../data/taskStore';
import type { Project } from '../types';

// Toutes les tâches — un sélecteur de projet, comme une app de tâches
// mobile : on choisit un projet, puis on est amené sur SA vraie page
// (/projets/:id), qui EST déjà la vue des tâches de ce projet (Kanban/
// sections). Volontairement pas de deuxième liste de tâches ici — la seule
// vue de tâches d'un projet reste celle de Travail.tsx, pour ne jamais avoir
// deux implémentations à maintenir en parallèle.

function ProjectPickerRow({ p }: { p: Project }) {
  const navigate = useNavigate();
  const [, forceTick] = useState(0);
  useEffect(() => subscribeStore(() => forceTick(n => n + 1)), []);
  const sectionLabel = getCurrentSectionLabel(p.id);
  const stats = getProjectStats(p);

  return (
    <div
      onClick={() => navigate(`/projets/${p.id}`)}
      style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '13px 18px', borderTop: '1px solid var(--border)', cursor: 'pointer', transition: 'background 0.12s' }}
      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
    >
      <div style={{ width: 10, height: 10, borderRadius: '50%', background: p.clientColor || 'var(--text-3)', flexShrink: 0 }} />
      <div style={{ minWidth: 0, flex: '1 1 220px' }}>
        <p style={{ fontWeight: 600, fontSize: 13.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{p.name}</p>
      </div>
      {sectionLabel && <SFPill status="neutral" small>{sectionLabel}</SFPill>}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, width: 140, flexShrink: 0 }}>
        <div style={{ flex: 1 }}><SFBar value={stats.progress} height={4} /></div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10.5, color: 'var(--text-2)', width: 30, textAlign: 'right' }}>{stats.progress}%</span>
      </div>
      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10.5, color: 'var(--text-3)', width: 70, textAlign: 'right', flexShrink: 0 }}>
        {stats.taskCount} tâche{stats.taskCount !== 1 ? 's' : ''}
      </span>
      <SFIcon name="chevron-right" size={14} color="var(--text-3)" />
    </div>
  );
}

export function TachesToutes() {
  const { t } = useTranslation();
  const [projects, setProjects] = useState(getProjects);
  useEffect(() => subscribeProjects(() => setProjects(getProjects())), []);

  const activeProjects = useMemo(() => projects.filter(p => !p.archived), [projects]);

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, padding: '12px 24px', borderBottom: '1px solid var(--border)', background: 'var(--surface)' }}>
        <h1 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('tasks.allTasksTitle')}</h1>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: 2 }}>{t('tasks.allTasksSubtitle')}</p>
      </div>

      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 24 }}>
        {activeProjects.length === 0 ? (
          <p style={{ fontSize: 13, color: 'var(--text-3)', textAlign: 'center', marginTop: 40 }}>{t('board.noTasks')}</p>
        ) : (
          <div style={{ border: '1px solid var(--border)', borderRadius: 'var(--radius)', overflow: 'hidden', background: 'var(--surface)' }}>
            {activeProjects.map(p => <ProjectPickerRow key={p.id} p={p} />)}
          </div>
        )}
      </div>
    </div>
  );
}
