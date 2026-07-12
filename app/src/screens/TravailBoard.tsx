import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFPill, SFAvatar, isOverdue, fmtTaskDate, TaskDatePopover } from '../components/ui';
import { USERS } from '../data/mock';
import { STATUS_COLOR } from '../data/status';
import type { Task, Priority, SectionData } from '../types';

const PRIORITY_COLOR: Record<Priority, string> = {
  high: 'var(--danger)', normal: 'var(--warn)', low: 'var(--info)', none: 'var(--border-2)',
};

const PRIORITY_LABEL_KEY: Record<Priority, string> = {
  high: 'priority.high', normal: 'priority.medium', low: 'priority.low', none: 'priority.none',
};

const PRIORITY_OPTIONS: Priority[] = ['high', 'normal', 'low', 'none'];

const STATUS_OPTIONS = [
  { value: '',       labelKey: 'tasks.noStatus'  },
  { value: 'warn',   labelKey: 'tasks.todo'      },
  { value: 'info',   labelKey: 'tasks.inProgress'},
  { value: 'ok',     labelKey: 'tasks.completed' },
  { value: 'danger', labelKey: 'tasks.overdue'   },
  { value: 'review', labelKey: 'tasks.inReview'  },
];

const TEAM = Object.values(USERS);

// ── Dropdown portal ───────────────────────────────────────────────────────────

function DropMenu({ rect, onClose, children }: { rect: DOMRect; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);
  const top = rect.bottom + 4;
  const left = Math.min(rect.left, window.innerWidth - 200);
  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left, top, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 168, padding: '4px 0', overflow: 'hidden' }}>
      {children}
    </div>,
    document.body,
  );
}

function SectionContextMenu({ pos, onRename, onDelete, onClose }: {
  pos: { x: number; y: number }; onRename: () => void; onDelete: () => void; onClose: () => void;
}) {
  const { t } = useTranslation();
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
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 180, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="pencil" size={13} color="var(--text-3)" /><span>{t('taskPanel.renameSection')}</span></>, onRename)}
      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('board.deleteSection')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

function DItem({ label, active, danger, onClick }: { label: React.ReactNode; active?: boolean; danger?: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '7px 13px', border: 'none', background: active ? 'color-mix(in srgb, var(--accent) 10%, var(--surface-3))' : 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontFamily: 'var(--ff-text)', color: danger ? 'var(--danger)' : active ? 'var(--accent)' : 'var(--text)' }}
      onMouseEnter={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; }}
      onMouseLeave={e => { if (!active) (e.currentTarget as HTMLElement).style.background = 'none'; }}
    >{label}</button>
  );
}

// ── Context menu ──────────────────────────────────────────────────────────────

function CardContextMenu({ pos, onOpen, onDelete, onConvert, onClose, sections, currentSectionIdx, onMoveToSection }: {
  pos: { x: number; y: number };
  onOpen: () => void;
  onDelete: () => void;
  onConvert: () => void;
  onClose: () => void;
  sections: SectionData[];
  currentSectionIdx: number;
  onMoveToSection: (toIdx: number) => void;
}) {
  const { t } = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [showMove, setShowMove] = useState(false);
  useEffect(() => {
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', h);
    return () => document.removeEventListener('mousedown', h);
  }, [onClose]);

  const otherSections = sections.filter((_, i) => i !== currentSectionIdx);

  const item = (label: React.ReactNode, action: () => void, danger = false) => (
    <button onClick={() => { action(); onClose(); }}
      style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: danger ? 'var(--danger)' : 'var(--text)' }}
      onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
      onMouseLeave={e => (e.currentTarget.style.background = 'none')}
    >{label}</button>
  );

  return createPortal(
    <div ref={ref} style={{ position: 'fixed', left: pos.x, top: pos.y, background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10, boxShadow: '0 8px 32px rgba(0,0,0,0.45)', zIndex: 700, minWidth: 200, padding: '4px 0', overflow: 'hidden' }}>
      {item(<><SFIcon name="maximize-2" size={13} color="var(--text-3)" /><span>{t('tasks.openDetail')}</span></>, onOpen)}
      {item(<><SFIcon name="git-branch" size={13} color="var(--text-3)" /><span>Convertir en sous-tâche de...</span></>, onConvert)}

      {otherSections.length > 0 && !showMove && (
        <button
          onClick={() => setShowMove(true)}
          style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 14px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 13, fontFamily: 'var(--ff-text)', color: 'var(--text)', justifyContent: 'space-between' }}
          onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
          onMouseLeave={e => (e.currentTarget.style.background = 'none')}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <SFIcon name="move-right" size={13} color="var(--text-3)" />
            <span>{t('board.moveTo')}</span>
          </div>
          <SFIcon name="chevron-right" size={11} color="var(--text-3)" />
        </button>
      )}

      {showMove && otherSections.map((s, i) => {
        const realIdx = sections.findIndex(sec => sec.label === s.label);
        return (
          <button
            key={s.label}
            onClick={() => { onMoveToSection(realIdx); onClose(); }}
            style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '7px 14px 7px 28px', border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left', fontSize: 12, fontFamily: 'var(--ff-text)', color: 'var(--text)' }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0, display: 'block' }} />
            {s.label}
          </button>
        );
      })}

      <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
      {item(<><SFIcon name="trash-2" size={13} color="var(--danger)" /><span>{t('tasks.delete')}</span></>, onDelete, true)}
    </div>,
    document.body,
  );
}

// ── Props ──────────────────────────────────────────────────────────────────────

interface Props {
  sections: SectionData[];
  selectedTask: Task | null;
  multiSelIds?: Set<string>;
  onConvertRequest: (task: Task, pos: { x: number; y: number }) => void;
  onSelectTask: (t: Task, e?: React.MouseEvent) => void;
  onUpdateTask: (taskId: string, patch: Partial<Task>) => void;
  onToggleSectionComplete: (sectionLabel: string) => void;
  onAddTask: (sectionIdx: number, task: Task) => void;
  onMoveTask: (task: Task, fromIdx: number, toIdx: number) => void;
  onAddSection: (label: string) => void;
  onDeleteTask: (task: Task) => void;
  onDeleteSection: (sectionLabel: string) => void;
  onRenameSection: (oldLabel: string, newLabel: string) => void;
  projectId: string;
  projectName: string;
  projectColor: string;
}

// ── Board ──────────────────────────────────────────────────────────────────────

export function TravailBoard({
  sections, selectedTask, multiSelIds, onConvertRequest,
  onSelectTask, onUpdateTask, onToggleSectionComplete,
  onAddTask, onMoveTask, onAddSection,
  onDeleteTask, onDeleteSection, onRenameSection,
  projectId, projectName, projectColor,
}: Props) {
  const { t } = useTranslation();
  const [dragTask, setDragTask] = useState<{ task: Task; sectionIdx: number } | null>(null);
  const [dragOverSection, setDragOverSection] = useState<number | null>(null);
  const [addingSection, setAddingSection] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [ctxMenu, setCtxMenu] = useState<{ task: Task; sectionIdx: number; x: number; y: number } | null>(null);
  const [confirmDeleteSection, setConfirmDeleteSection] = useState<string | null>(null);
  const [sectionCtxMenu, setSectionCtxMenu] = useState<{ label: string; x: number; y: number } | null>(null);
  const [hoveredHeader, setHoveredHeader] = useState<string | null>(null);
  const [hoveredCard, setHoveredCard] = useState<string | null>(null);
  const [collapsedSections, setCollapsedSections] = useState<Set<string>>(new Set());
  const [openDrop, setOpenDrop] = useState<{ taskId: string; type: 'status' | 'priority' | 'assignee' | 'date'; rect: DOMRect } | null>(null);
  const [editingSectionLabel, setEditingSectionLabel] = useState<string | null>(null);
  const [labelDraft, setLabelDraft] = useState('');
  const labelInputRef = useRef<HTMLInputElement>(null);
  const firstUser = TEAM[0];

  useEffect(() => {
    if (editingSectionLabel !== null) labelInputRef.current?.select();
  }, [editingSectionLabel]);

  const commitLabel = (originalLabel: string) => {
    const trimmed = labelDraft.trim();
    if (trimmed && trimmed !== originalLabel) onRenameSection(originalLabel, trimmed);
    setEditingSectionLabel(null);
  };

  const toggleCollapse = (label: string) => {
    setCollapsedSections(prev => {
      const next = new Set(prev);
      next.has(label) ? next.delete(label) : next.add(label);
      return next;
    });
  };

  const commitSection = () => {
    const label = newLabel.trim();
    if (!label) { setAddingSection(false); setNewLabel(''); return; }
    onAddSection(label);
    setNewLabel('');
    setAddingSection(false);
  };

  // Close dropdown when clicking elsewhere
  const closeDrop = () => setOpenDrop(null);

  // Find which task the open dropdown refers to
  const dropTask = openDrop ? sections.flatMap(s => s.tasks).find(t => t.id === openDrop.taskId) : null;

  return (
    <div style={{ display: 'flex', gap: 16, overflowX: 'auto', overflowY: 'hidden', padding: '20px 24px', alignItems: 'flex-start', flex: 1, boxSizing: 'border-box' }}>
      {sections.map((section, sIdx) => {
        const done = section.tasks.filter(t => t.checked || t.status === 'ok').length;
        const total = section.tasks.length;
        const pct = total > 0 ? Math.round((done / total) * 100) : 0;
        const isCollapsed = collapsedSections.has(section.label);

        return (
          <div
            key={section.label + sIdx}
            onDragOver={e => { e.preventDefault(); if (!isCollapsed) setDragOverSection(sIdx); }}
            onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOverSection(null); }}
            onDrop={() => {
              if (dragTask && dragTask.sectionIdx !== sIdx) onMoveTask(dragTask.task, dragTask.sectionIdx, sIdx);
              setDragTask(null); setDragOverSection(null);
            }}
            style={{
              width: isCollapsed ? 52 : 284,
              flexShrink: 0,
              background: dragOverSection === sIdx ? 'color-mix(in srgb, var(--accent) 4%, var(--surface))' : 'var(--surface)',
              borderRadius: 'var(--radius)',
              border: `1px solid ${dragOverSection === sIdx ? 'var(--accent)' : 'var(--border)'}`,
              display: 'flex', flexDirection: 'column',
              maxHeight: '100%',
              transition: 'border-color 0.15s, background 0.15s, width 0.2s, opacity 0.2s',
              overflow: 'hidden',
              opacity: section.completed ? 0.5 : 1,
            }}
          >
            {/* Column header */}
            {isCollapsed ? (
              /* Collapsed: vertical label */
              <div
                style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '12px 0', gap: 8, cursor: 'default' }}
                onMouseEnter={() => setHoveredHeader(section.label)}
                onMouseLeave={() => setHoveredHeader(null)}
              >
                <button
                  onClick={() => toggleCollapse(section.label)}
                  title={t('board.expand')}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', borderRadius: 5, transform: 'rotate(-90deg)' }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                >
                  <SFIcon name="chevron-down" size={14} />
                </button>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 999, padding: '2px 6px' }}>{total}</span>
                <span style={{ fontSize: 11, fontWeight: 600, color: section.completed ? 'var(--ok)' : 'var(--text-2)', writingMode: 'vertical-rl', textOrientation: 'mixed', transform: 'rotate(180deg)', whiteSpace: 'nowrap', letterSpacing: '0.02em', flex: 1, paddingBottom: 8 }}>
                  {section.label}
                </span>
              </div>
            ) : (
              <div
                style={{ padding: '12px 14px 10px', flexShrink: 0 }}
                onMouseEnter={() => setHoveredHeader(section.label)}
                onMouseLeave={() => { setHoveredHeader(null); setConfirmDeleteSection(null); }}
                onContextMenu={e => { e.preventDefault(); setSectionCtxMenu({ label: section.label, x: e.clientX, y: e.clientY }); }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 8 }}>
                  {/* Section complete toggle */}
                  <button
                    onClick={() => onToggleSectionComplete(section.label)}
                    title={section.completed ? t('board.markSectionIncomplete') : t('board.markSectionComplete')}
                    style={{ width: 14, height: 14, borderRadius: '50%', background: section.completed ? 'var(--ok)' : 'transparent', border: `1.5px solid ${section.completed ? 'var(--ok)' : 'var(--border-2)'}`, flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', padding: 0, transition: 'all 0.15s' }}
                    onMouseEnter={e => { if (!section.completed) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--ok)'; } }}
                    onMouseLeave={e => { if (!section.completed) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; } }}
                  >
                    {section.completed && <SFIcon name="check" size={8} color="#fff" />}
                  </button>

                  {editingSectionLabel === section.label ? (
                    <input
                      ref={labelInputRef}
                      value={labelDraft}
                      onChange={e => setLabelDraft(e.target.value)}
                      onClick={e => e.stopPropagation()}
                      onBlur={() => commitLabel(section.label)}
                      onKeyDown={e => {
                        if (e.key === 'Enter') { e.preventDefault(); commitLabel(section.label); }
                        else if (e.key === 'Escape') { setEditingSectionLabel(null); }
                      }}
                      style={{
                        fontWeight: 600, fontSize: 13, color: 'var(--text)', background: 'var(--surface-2)',
                        border: '1px solid var(--accent)', borderRadius: 5, padding: '1px 5px',
                        width: `${Math.max(2, labelDraft.length + 1)}ch`, maxWidth: 180, fontFamily: 'var(--ff-text)',
                      }}
                    />
                  ) : (
                    <span
                      onClick={e => { e.stopPropagation(); setLabelDraft(section.label); setEditingSectionLabel(section.label); }}
                      style={{ fontWeight: 600, fontSize: 13, flex: 1, color: section.completed ? 'var(--text-3)' : 'var(--text)', textDecoration: section.completed ? 'line-through' : 'none', cursor: 'text' }}
                    >
                      {section.label}
                    </span>
                  )}

                  {confirmDeleteSection === section.label ? (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                      <button onClick={() => { onDeleteSection(section.label); setConfirmDeleteSection(null); }}
                        style={{ padding: '2px 7px', borderRadius: 6, background: 'var(--danger)', border: 'none', color: '#fff', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('board.deleteShort')}</button>
                      <button onClick={() => setConfirmDeleteSection(null)}
                        style={{ padding: '2px 7px', borderRadius: 6, background: 'transparent', border: '1px solid var(--border)', color: 'var(--text-2)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>{t('tasks.no')}</button>
                    </div>
                  ) : (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                      <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', background: 'var(--surface-2)', borderRadius: 999, padding: '1px 7px' }}>{total}</span>
                      {hoveredHeader === section.label && (
                        <>
                          <button
                            onClick={() => toggleCollapse(section.label)}
                            title={t('board.collapse')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5 }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--text)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                          >
                            <SFIcon name="chevron-left" size={11} />
                          </button>
                          <button
                            onClick={() => { if (total > 0) setConfirmDeleteSection(section.label); else onDeleteSection(section.label); }}
                            title={t('board.deleteSection')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 2, display: 'flex', borderRadius: 5 }}
                            onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                            onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                          >
                            <SFIcon name="trash-2" size={11} />
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </div>

                {/* Progress bar */}
                <div style={{ height: 3, borderRadius: 99, background: 'var(--surface-3)', overflow: 'hidden' }}>
                  <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: pct === 100 ? 'var(--ok)' : 'var(--accent)', transition: 'width 0.3s' }} />
                </div>
                {total > 0 && (
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', marginTop: 4 }}>
                    {t('board.completedCount', { done, total })}
                  </p>
                )}
              </div>
            )}

            {!isCollapsed && (
              <>
                <div style={{ height: 1, background: 'var(--border)', flexShrink: 0 }} />

                {/* Cards */}
                <div style={{ flex: 1, overflowY: 'auto', padding: '8px 8px 0' }}>
                  {section.tasks.length === 0 && (
                    <div style={{ padding: '20px 12px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6, color: 'var(--text-3)' }}>
                      <SFIcon name="inbox" size={22} color="var(--border-2)" />
                      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, textAlign: 'center' }}>{t('board.noTasks')}</p>
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
                        onClick={e => { if (openDrop) return; onSelectTask(task, e); }}
                        onMouseDown={e => { if (e.shiftKey || e.ctrlKey || e.metaKey) e.preventDefault(); }}
                        onContextMenu={e => { e.preventDefault(); setCtxMenu({ task, sectionIdx: sIdx, x: e.clientX, y: e.clientY }); }}
                        style={{
                          position: 'relative',
                          background: (isSelected || isMulti) ? 'color-mix(in srgb, var(--accent) 7%, var(--surface-2))' : 'var(--surface-2)',
                          borderRadius: 10,
                          border: `1px solid ${(isSelected || isMulti) ? 'var(--accent)' : 'var(--border)'}`,
                          padding: '10px 13px',
                          marginBottom: 7,
                          cursor: 'pointer',
                          opacity: task.checked ? 0.5 : 1,
                          transition: 'border-color 0.1s, background 0.1s, box-shadow 0.1s',
                          boxShadow: isSelected ? '0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent)' : 'none',
                          userSelect: 'none',
                        }}
                        onMouseEnter={e => { setHoveredCard(task.id); if (!isSelected && !isMulti) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
                        onMouseLeave={e => { setHoveredCard(null); if (!isSelected && !isMulti) { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
                      >
                        {/* Delete button — absolute top-right */}
                        <button
                          onClick={e => { e.stopPropagation(); onDeleteTask(task); }}
                          onMouseDown={e => e.stopPropagation()}
                          title={t('board.deleteTask')}
                          style={{ position: 'absolute', top: 8, right: 8, visibility: isHovered ? 'visible' : 'hidden', background: 'var(--surface)', border: '1px solid var(--border)', cursor: 'pointer', color: 'var(--text-3)', padding: 3, display: 'flex', borderRadius: 6 }}
                          onMouseEnter={e => (e.currentTarget.style.color = 'var(--danger)')}
                          onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-3)')}
                        >
                          <SFIcon name="trash-2" size={11} />
                        </button>

                        {/* Top row: checkbox + priority */}
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 7 }}>
                          {/* Checkbox */}
                          <button
                            onClick={e => { e.stopPropagation(); onUpdateTask(task.id, { checked: !task.checked }); }}
                            onMouseDown={e => e.stopPropagation()}
                            title={task.checked ? t('board.markIncomplete') : t('board.markComplete')}
                            style={{
                              width: 15, height: 15, borderRadius: '50%', flexShrink: 0,
                              border: task.checked ? 'none' : '1.5px solid var(--border-2)',
                              background: task.checked ? 'var(--ok)' : 'transparent',
                              cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 0,
                              transition: 'all 0.15s',
                            }}
                            onMouseEnter={e => { if (!task.checked) (e.currentTarget as HTMLElement).style.borderColor = 'var(--ok)'; }}
                            onMouseLeave={e => { if (!task.checked) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                          >
                            {task.checked && <SFIcon name="check" size={8} color="#fff" />}
                          </button>

                          {/* Priority badge (clickable) */}
                          <button
                            onClick={e => { e.stopPropagation(); setOpenDrop({ taskId: task.id, type: 'priority', rect: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseDown={e => e.stopPropagation()}
                            title={t('board.changePriority')}
                            style={{ display: 'flex', alignItems: 'center', gap: 4, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', borderRadius: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            <span style={{ width: 6, height: 6, borderRadius: '50%', background: PRIORITY_COLOR[task.priority], flexShrink: 0, display: 'block' }} />
                            {task.priority !== 'none' && (
                              <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: PRIORITY_COLOR[task.priority], letterSpacing: '0.05em', textTransform: 'uppercase' }}>
                                {t(PRIORITY_LABEL_KEY[task.priority])}
                              </span>
                            )}
                          </button>
                        </div>

                        {/* Title */}
                        <p style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.45, marginBottom: 10, color: task.checked ? 'var(--text-3)' : 'var(--text)', textDecoration: task.checked ? 'line-through' : 'none' }}>
                          {task.title}
                        </p>

                        {/* Footer: status + meta + assignee */}
                        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 6 }}>
                          {/* Status pill (clickable) */}
                          <button
                            onClick={e => { e.stopPropagation(); setOpenDrop({ taskId: task.id, type: 'status', rect: e.currentTarget.getBoundingClientRect() }); }}
                            onMouseDown={e => e.stopPropagation()}
                            title={t('board.changeStatus')}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 5px', minHeight: 20, borderRadius: 6 }}
                            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                          >
                            {task.statusLabel
                              ? <SFPill status={task.status} small>{task.statusLabel}</SFPill>
                              : <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--border-2)', flexShrink: 0, display: 'block' }} />
                            }
                          </button>

                          <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                            {(task.subtasks?.length ?? 0) > 0 && (
                              <div style={{ display: 'flex', alignItems: 'center', gap: 3 }}>
                                <SFIcon name="git-branch" size={11} color="var(--text-3)" />
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>
                                  {task.subtasks!.filter(s => s.checked).length}/{task.subtasks!.length}
                                </span>
                              </div>
                            )}

                            {/* Date (clickable) */}
                            <button
                              onClick={e => { e.stopPropagation(); setOpenDrop({ taskId: task.id, type: 'date', rect: e.currentTarget.getBoundingClientRect() }); }}
                              onMouseDown={e => e.stopPropagation()}
                              title={t('board.changeDate')}
                              style={{ display: 'flex', alignItems: 'center', gap: 3, background: 'none', border: 'none', cursor: 'pointer', padding: '2px 4px', borderRadius: 5 }}
                              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
                              onMouseLeave={e => (e.currentTarget.style.background = 'none')}
                            >
                              <SFIcon name="calendar" size={10} color={task.dueDate && task.dueDate !== '—' && isOverdue(task.dueDate) ? 'var(--danger)' : 'var(--text-3)'} />
                              {task.dueDate && task.dueDate !== '—' ? (
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: isOverdue(task.dueDate) ? 'var(--danger)' : 'var(--text-3)', whiteSpace: 'nowrap' }}>
                                  {fmtTaskDate(task.dueDate)}
                                </span>
                              ) : (
                                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--border-2)', whiteSpace: 'nowrap' }}>—</span>
                              )}
                            </button>

                            {/* Assignee (clickable) */}
                            <button
                              onClick={e => { e.stopPropagation(); setOpenDrop({ taskId: task.id, type: 'assignee', rect: e.currentTarget.getBoundingClientRect() }); }}
                              onMouseDown={e => e.stopPropagation()}
                              title={t('board.changeAssignee')}
                              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0, borderRadius: '50%', display: 'flex' }}
                            >
                              {task.assignee
                                ? <SFAvatar initials={task.assignee.initials} bg={task.assignee.avatarColor} size={20} />
                                : <span style={{ width: 20, height: 20, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>
                              }
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>

                {/* Add task button */}
                <button
                  onClick={() => {
                    const newTask: Task = {
                      id: `task-${Date.now()}`,
                      title: 'Nouvelle tâche',
                      projectId, projectName, projectColor,
                      assignee: null,
                      status: 'warn', statusLabel: 'À faire',
                      priority: 'none', priorityLabel: 'Aucune',
                      dueDate: '—', dueDateRed: false, checked: false, subtasks: [],
                    };
                    onAddTask(sIdx, newTask);
                    onSelectTask(newTask);
                  }}
                  style={{ display: 'flex', alignItems: 'center', gap: 6, margin: '6px 8px 8px', padding: '7px 10px', borderRadius: 8, border: '1px dashed var(--border-2)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)', width: 'calc(100% - 16px)', transition: 'color 0.12s, border-color 0.12s' }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                >
                  <SFIcon name="plus" size={13} />
                  {t('board.addTask')}
                </button>
              </>
            )}
          </div>
        );
      })}

      {/* New section */}
      {addingSection ? (
        <div style={{ width: 240, flexShrink: 0, borderRadius: 'var(--radius)', border: '1px solid var(--accent)', background: 'var(--surface)', padding: 10, alignSelf: 'flex-start', display: 'flex', flexDirection: 'column', gap: 8 }}>
          <input
            autoFocus
            value={newLabel}
            onChange={e => setNewLabel(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') commitSection(); if (e.key === 'Escape') { setAddingSection(false); setNewLabel(''); } }}
            onBlur={commitSection}
            placeholder={t('board.sectionNamePlaceholder')}
            style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, fontFamily: 'var(--ff-text)', outline: 'none', boxSizing: 'border-box' }}
          />
          <div style={{ display: 'flex', gap: 6 }}>
            <button onMouseDown={e => e.preventDefault()} onClick={commitSection}
              style={{ flex: 1, padding: '6px 10px', borderRadius: 7, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 12, fontWeight: 600, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              {t('board.add')}
            </button>
            <button onMouseDown={e => e.preventDefault()} onClick={() => { setAddingSection(false); setNewLabel(''); }}
              style={{ padding: '6px 10px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-3)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
              {t('board.cancel')}
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setAddingSection(true)}
          style={{ width: 240, flexShrink: 0, borderRadius: 'var(--radius)', border: '1px dashed var(--border-2)', padding: '13px 16px', display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-3)', fontSize: 13, cursor: 'pointer', fontFamily: 'var(--ff-text)', background: 'transparent', transition: 'color 0.12s, border-color 0.12s', alignSelf: 'flex-start' }}
          onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-2)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
        >
          <SFIcon name="plus" size={14} />
          {t('board.newSection')}
        </button>
      )}

      {/* Context menu */}
      {ctxMenu && (
        <CardContextMenu
          pos={{ x: ctxMenu.x, y: ctxMenu.y }}
          onOpen={() => { onSelectTask(ctxMenu.task); setCtxMenu(null); }}
          onDelete={() => { onDeleteTask(ctxMenu.task); setCtxMenu(null); }}
          onConvert={() => { onConvertRequest(ctxMenu.task, { x: ctxMenu.x, y: ctxMenu.y }); setCtxMenu(null); }}
          onClose={() => setCtxMenu(null)}
          sections={sections}
          currentSectionIdx={ctxMenu.sectionIdx}
          onMoveToSection={toIdx => { onMoveTask(ctxMenu.task, ctxMenu.sectionIdx, toIdx); setCtxMenu(null); }}
        />
      )}

      {sectionCtxMenu && (
        <SectionContextMenu
          pos={{ x: sectionCtxMenu.x, y: sectionCtxMenu.y }}
          onRename={() => { setLabelDraft(sectionCtxMenu.label); setEditingSectionLabel(sectionCtxMenu.label); }}
          onDelete={() => {
            const target = sections.find(s => s.label === sectionCtxMenu.label);
            if (target && target.tasks.length > 0) setConfirmDeleteSection(sectionCtxMenu.label);
            else onDeleteSection(sectionCtxMenu.label);
          }}
          onClose={() => setSectionCtxMenu(null)}
        />
      )}

      {/* Inline dropdowns */}
      {openDrop && dropTask && openDrop.type === 'status' && (
        <DropMenu rect={openDrop.rect} onClose={closeDrop}>
          {STATUS_OPTIONS.map(o => (
            <DItem
              key={o.value}
              active={dropTask.status === o.value || (!dropTask.status && !o.value)}
              label={<><span style={{ width: 7, height: 7, borderRadius: '50%', background: o.value ? STATUS_COLOR[o.value] : 'var(--border-2)', display: 'block', flexShrink: 0 }} />{t(o.labelKey)}</>}
              onClick={() => { onUpdateTask(dropTask.id, { status: o.value as Task['status'], statusLabel: t(o.labelKey) }); closeDrop(); }}
            />
          ))}
        </DropMenu>
      )}

      {openDrop && dropTask && openDrop.type === 'priority' && (
        <DropMenu rect={openDrop.rect} onClose={closeDrop}>
          {PRIORITY_OPTIONS.map(p => (
            <DItem
              key={p}
              active={dropTask.priority === p}
              label={<><span style={{ width: 7, height: 7, borderRadius: '50%', background: PRIORITY_COLOR[p], display: 'block', flexShrink: 0 }} />{t(PRIORITY_LABEL_KEY[p])}</>}
              onClick={() => { onUpdateTask(dropTask.id, { priority: p, priorityLabel: t(PRIORITY_LABEL_KEY[p]) }); closeDrop(); }}
            />
          ))}
        </DropMenu>
      )}

      {openDrop && dropTask && openDrop.type === 'date' && (
        <TaskDatePopover
          date={dropTask.dueDate && dropTask.dueDate !== '—' ? dropTask.dueDate : ''}
          endDate={dropTask.endDate ?? ''}
          startTime={dropTask.startTime ?? ''}
          endTime={dropTask.endTime ?? ''}
          anchorRect={openDrop.rect}
          zIndex={700}
          onChange={(d, s, e, ed) => onUpdateTask(dropTask.id, { dueDate: d || '—', dueDateRed: false, startTime: s ?? '', endTime: e ?? '', endDate: ed ?? '' })}
          onClose={closeDrop}
        />
      )}

      {openDrop && dropTask && openDrop.type === 'assignee' && (
        <DropMenu rect={openDrop.rect} onClose={closeDrop}>
          <DItem
            label={<><span style={{ width: 18, height: 18, borderRadius: '50%', border: '1.5px dashed var(--border-2)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}><SFIcon name="user" size={10} color="var(--text-3)" /></span>{t('tasks.unassigned')}</>}
            active={!dropTask.assignee}
            onClick={() => { onUpdateTask(dropTask.id, { assignee: firstUser }); closeDrop(); }}
          />
          {TEAM.map(u => (
            <DItem
              key={u.id}
              active={dropTask.assignee?.id === u.id}
              label={<><SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />{u.name}</>}
              onClick={() => { onUpdateTask(dropTask.id, { assignee: u }); closeDrop(); }}
            />
          ))}
        </DropMenu>
      )}
    </div>
  );
}
