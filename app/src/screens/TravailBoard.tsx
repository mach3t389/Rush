import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SFIcon, SFPill, SFAvatar, isOverdue, fmtTaskDate } from '../components/ui';
import { USERS } from '../data/mock';
import type { Task, Priority, SectionData } from '../types';

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)',
};

const PRIORITY_LABEL: Record<Priority, string> = {
  high: 'Élevée', normal: 'Moyenne', low: 'Basse', none: 'Aucune',
};

function CardContextMenu({ pos, onOpen, onDelete, onClose }: { pos: { x: number; y: number }; onOpen: () => void; onDelete: () => void; onClose: () => void }) {
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
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 500, minWidth: 180, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>Ouvrir le détail</span></>, onOpen)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>Supprimer</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

interface Props {
  sections: SectionData[];
  selectedTask: Task | null;
  multiSelIds?: Set<string>;
  onSelectTask: (t: Task, e?: React.MouseEvent) => void;
  onAddTask: (sectionIdx: number, task: Task) => void;
  onMoveTask: (task: Task, fromIdx: number, toIdx: number) => void;
  onAddSection: (label: string) => void;
  onDeleteTask: (task: Task) => void;
  onDeleteSection: (sectionLabel: string) => void;
  projectId: string;
  projectName: string;
  projectColor: string;
}

export function TravailBoard({ sections, selectedTask, multiSelIds, onSelectTask, onAddTask, onMoveTask, onAddSection, onDeleteTask, onDeleteSection, projectId, projectName, projectColor }: Props) {
  const [dragTask, setDragTask] = useState<{ task: Task; sectionIdx: number } | null>(null);
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ task: Task; x: number; y: number } | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const firstUser = Object.values(USERS)[0];

  const commitSection = () => {
    const label = newLabel.trim();
    if (!label) { setAddingSection(false); setNewLabel(''); return; }
    onAddSection(label);
    setNewLabel('');
    setAddingSection(false);
  };

  return (
    <div style={{
      display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden',
      padding: '20px 24px', alignItems: 'flex-start', flex: 1,
      boxSizing: 'border-box',
    }}>
      {sections.map((section, sIdx) => {
        const done = section.tasks.filter(t => t.checked || t.status === 'ok').length;
        const total = section.tasks.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;

        return (
          <div
            key={section.label + sIdx}
            onDragOver={e => { e.preventDefault(); setDragOverSection(sIdx); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSection(null); }}
            onDrop={() => {
              if (dragTask && dragTask.sectionIdx !== sIdx) onMoveTask(dragTask.task, dragTask.sectionIdx, sIdx);
              setDragTask(null); setDragOverSection(null);
            }}
            style={{
              width: 284, flexShrink: 0,
              background: dragOverSection === sIdx ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))' : 'var(--surface)',
              borderRadius: 'var(--radius)',
              border: `1px solid ${dragOverSection === sIdx ? 'var(--accent)' : 'var(--border)'}`,
              display: 'flex', flexDirection: 'column',
              maxHeight: '100%',
              transition: 'border-color 0.15s, background 0.15s',
            }}
          >
            {/* Colonne en-tête */}
            <div style={{ padding: '12px 14px 10px', flexShrink: 0 }}
              onMouseEnter={() => setHoveredHeader(section.label)}
              onMouseLeave={() => { setHoveredHeader(null); setConfirmDeleteSection(null); }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                {section.completed
                  ? <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--ok)', flexShrink: 0, display: 'block' }} />
                  : <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0, display: 'block' }} />
                }
                <span style={{ fontWeight: 600, fontSize: 13, flex: 1, color: 'var(--text)' }}>{section.label}</span>
                {confirmDeleteSection === section.label ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                    <button onClick={() => { onDeleteSection(section.label); setConfirmDeleteSection(null); }}
                      style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--danger)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Suppr.</button>
                    <button onClick={() => setConfirmDeleteSection(null)}
                      style={{ padding: '2px 7px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>Non</button>
                  </div>
                ) : (
                  <>
                    <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 999, padding: '1px 7px' }}>{total}</span>
                    <button
                      onClick={() => { if (total > 0) setConfirmDeleteSection(section.label); else onDeleteSection(section.label); }}
                      title="Supprimer la section"
                      style={{ visibility: hoveredHeader === section.label ? 'visible' : 'hidden', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5, flexShrink: 0 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                      <SFIcon name="trash-2" size={11} />
                    </button>
                  </>
                )}
              </div>
              {/* Barre de progression */}
              <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                <div style={{
                  height: '100%', borderRadius: 99,
                  width: `${pct}%`,
                  background: pct === 100 ? 'var(--ok)' : 'var(--accent)',
                  transition: 'width 0.3s',
                }} />
              </div>
              {total > 0 && (
                <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>
                  {done}/{total} complétée{done > 1 ? 's' : ''}
                </p>
              )}
            </div>

            {/* Séparateur */}
            <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />

            {/* Cartes */}
            <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
              {section.tasks.length === 0 && (
                <div style={{
                  padding: '20px 12px', display: 'flex', flexDirection: 'column',
                  alignItems: 'center', gap: 6, color: 'var(--text-3)',
                }}>
                  <SFIcon name="inbox" size={22} color="var(--border-2)" />
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, textAlign: 'center' }}>Aucune tâche</p>
                </div>
              )}
              {section.tasks.map(task => {
                const isSelected = selectedTask?.id === task.id;
                const isMulti = multiSelIds?.has(task.id) ?? false;
                const isHovered = hoveredCard === task.id;
                return (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={e => { e.dataTransfer.effectAllowed = 'move'; setDragTask({ task, sectionIdx: sIdx }); }}
                    onDragEnd={() => { setDragTask(null); setDragOverSection(null); }}
                    onClick={e => onSelectTask(task, e)}
                    onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
                    onContextMenu={e => { e.preventDefault(); setCtxMenu({ task, x: e.clientX, y: e.clientY }); }}
                    style={{
                      position: 'relative',
                      background: (isSelected || isMulti) ? 'color-mix(in srgb, var(--accent) 7%, var(--surface-2))' : 'var(--surface-2)',
                      borderRadius: 10,
                      border: `1px solid ${(isSelected || isMulti) ? 'var(--accent)' : 'var(--border)'}`,
                      padding: '11px 13px',
                      marginBottom: 7,
                      cursor: 'pointer',
                      opacity: task.checked ? 0.45 : 1,
                      transition: 'border-color 0.1s, background 0.1s, box-shadow 0.1s',
                      boxShadow: isSelected ? '0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent)' : 'none',
                      userSelect: 'none',
                    }}
                    onMouseEnter={e => { setHoveredCard(task.id); if (!isSelected && !isMulti) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
                    onMouseLeave={e => { setHoveredCard(null); if (!isSelected && !isMulti) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
                  >
                    {/* Supprimer (hover) */}
                    <button
                      onClick={e => { e.stopPropagation(); onDeleteTask(task); }}
                      onMouseDown={e => e.stopPropagation()}
                      title="Supprimer la tâche"
                      style={{ position: 'absolute', top: 8, right: 8, visibility: isHovered ? 'visible' : 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-3)', padding: 3, display: 'flex', borderRadius: 6 }}
                      onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                      onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}>
                      <SFIcon name="trash-2" size={12} />
                    </button>

                    {/* Priorité */}
                    {task.priority !== 'none' && (
                      <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 7 }}>
                        <span style={{ width: 5, height: 5, borderRadius: '50%', background: PRIORITY_COLOR[task.priority], flexShrink: 0, display: 'block' }} />
                        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: PRIORITY_COLOR[task.priority], letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                          {PRIORITY_LABEL[task.priority]}
                        </span>
                      </div>
                    )}

                    {/* Titre */}
                    <p style={{
                      fontSize: 13, fontWeight: 500, lineHeight: 1.45, marginBottom: 10,
                      color: task.checked ? 'var(--text-3)' : 'var(--text)',
                      textDecoration: task.checked ? 'line-through' : 'none',
                    }}>
                      {task.title}
                    </p>

                    {/* Pied de carte */}
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                      <SFPill status={task.status} small>{task.statusLabel}</SFPill>

                      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                        {(task.subtasks?.length ?? 0) > 0 && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <SFIcon name="git-branch" size={11} color="var(--text-3)" />
                            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                              {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
                            </span>
                          </div>
                        )}
                        {task.dueDate && task.dueDate !== '—' && (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                            <SFIcon name="calendar" size={10} color={isOverdue(task.dueDate ?? '') ? 'var(--danger)' : 'var(--text-3)'} />
                            <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isOverdue(task.dueDate ?? '') ? 'var(--danger)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                              {fmtTaskDate(task.dueDate ?? '')}
                            </span>
                          </div>
                        )}
                        <SFAvatar initials={task.assignee.initials} bg={task.assignee.avatarColor} size={20} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Bouton ajouter */}
            <button
              onClick={() => {
                const newTask: Task = {
                  id: `task-${Date.now()}`,
                  title: 'Nouvelle tâche',
                  projectId, projectName, projectColor,
                  assignee: firstUser,
                  status: 'warn', statusLabel: 'À faire',
                  priority: 'normal', priorityLabel: 'Normale',
                  dueDate: '—', dueDateRed: false, checked: false, subtasks: [],
                };
                onAddTask(sIdx, newTask);
                onSelectTask(newTask);
              }}
              style={{
                display: 'flex', alignItems: 'center', gap: 6,
                margin: '6px 8px 8px', padding: '7px 10px', borderRadius: 8,
                border: '1px dashed var(--border-2)', background: 'transparent',
                color: 'var(--text-3)', fontSize: 12, cursor: 'pointer',
                fontFamily: 'var(--ff-text)', width: 'calc(100% - 16px)',
                transition: 'color 0.12s, border-color 0.12s',
              }}
              onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
              onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
            >
              <SFIcon name="plus" size={13}  />
              Ajouter une tâche
            </button>
          </div>
        );
      })}

      {/* Nouvelle colonne */}
      {addingSection ? (
        <div style={{
          width: 240, flexShrink: 0, borderRadius: 'var(--radius)',
          border: '1px solid var(--accent)', background: 'var(--surface)',
          padding: 10, alignSelf: 'flex-start',
          display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          <input
            autoFocus
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSection(); if (e.key === 'Escape') { setAddingSection(false); setNewLabel(''); } }}
            onBlur={commitSection}
            placeholder="Nom de la section..."
            style={{
              width: '100%', padding: '8px 10px', borderRadius: 8,
              border: '1px solid var(--border-2)', background: 'var(--surface-2)',
              color: 'var(--text)', fontSize: 13, fontWeight: 600,
              fontFamily: 'var(--ff-text)', outline: 'none', boxSizing: 'border-box',
            }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={commitSection}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
            >Ajouter</button>
            <button
              onMouseDown={e => e.preventDefault()}
              onClick={() => { setAddingSection(false); setNewLabel(''); }}
              style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
            >Annuler</button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingSection(true)}
          style={{
            width: 240, flexShrink: 0, borderRadius: 'var(--radius)',
            border: '1px dashed var(--border-2)', padding: '13px 16px',
            display: 'flex', alignItems: 'center', gap: 8,
            color: 'var(--text-3)', fontSize: 13, cursor: 'pointer',
            fontFamily: 'var(--ff-text)', background: 'transparent',
            transition: 'color 0.12s, border-color 0.12s',
            alignSelf: 'flex-start',
          }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
        >
          <SFIcon name="plus" size={14}  />
          Nouvelle section
        </button>
      )}

      {ctxMenu && (
        <CardContextMenu
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          onOpen={() => { onSelectTask(ctxMenu.task); setCtxMenu(null); }}
          onDelete={() => { onDeleteTask(ctxMenu.task); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
        />
      )}
    </div>
  );
}
