import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFBar, SFAvatarGroup, SFIcon, SFButton, SFModal, DatePickerDropdown, TimePickerDropdown, TimeButton, formatDisplay, parseYMD } from './ui';
import type { Project, Status, Phase } from '../types/index';
import { isPinned, togglePin, subscribePinned } from '../data/pinnedStore';
import { updateProject, archiveProject, unarchiveProject, removeProject } from '../data/projectStore';
import { getClients } from '../data/clientStore';
import { getCurrentSectionLabel } from '../data/taskStore';
import { timeAgo } from '../utils/timeAgo';
import { useProjectTotalNotifCount } from '../hooks/useNotifs';

const PROJECT_COLORS = [
  '#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8',
  '#a85f3e', '#2a7a8a', '#7a6a2a', '#404040',
  '#c0392b', '#e67e22', '#16a085', '#8e44ad',
];


export const PROJECT_STATUS_OPTIONS: { status: Status; labelKey: string }[] = [
  { status: 'ok',      labelKey: 'projects.statusDone' },
  { status: 'info',    labelKey: 'projects.statusInProgress' },
  { status: 'warn',    labelKey: 'projects.statusTodo' },
  { status: 'review',  labelKey: 'projects.statusInReview' },
  { status: 'danger',  labelKey: 'projects.statusBlocked' },
  { status: 'neutral', labelKey: 'projects.statusWaiting' },
];

// ── Project Edit Panel ─────────────────────────────────────────────────────────

export const PROJECT_PHASE_OPTIONS: { phase: Phase; labelKey: string }[] = [
  { phase: 'preproduction',  labelKey: 'projects.phasePreproduction' },
  { phase: 'production',     labelKey: 'projects.phaseProduction' },
  { phase: 'postproduction', labelKey: 'projects.phasePostproduction' },
  { phase: 'livraison',      labelKey: 'projects.phaseDelivery' },
];

export interface EditUpdates {
  name: string; color: string;
  status: Status; statusLabel: string;
  phase: Phase; phaseLabel: string;
  deliveryDate: string;
  budget?: number;
  description?: string;
}

export function ProjectEditPanel({ p, color, name, status, statusLabel, phase, phaseLabel, deliveryDate, onClose, onSave }: {
  p: Project;
  color: string; name: string; status: Status; statusLabel: string;
  phase: Phase; phaseLabel: string; deliveryDate: string;
  onClose: () => void;
  onSave: (u: EditUpdates) => void;
}) {
  const { t } = useTranslation();
  const [lName, setLName]               = useState(name);
  const [lColor, setLColor]             = useState(color);
  const [lStatus, setLStatus]           = useState<Status>(status);
  const [lStatusLabel, setLStatusLabel] = useState(statusLabel);
  // Date de livraison : sélecteur de date (YMD) + heure, comme le panneau d'une tâche.
  // L'ancienne valeur stockée est une chaîne d'affichage non-YMD → le picker démarre vide ; on la garde en repli.
  const [lDeliveryYMD, setLDeliveryYMD] = useState(parseYMD(deliveryDate) ? deliveryDate : '');
  const [lDeliveryTime, setLDeliveryTime] = useState('');
  const [dateOpen, setDateOpen] = useState(false);
  const [dateRect, setDateRect] = useState<DOMRect | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeRect, setTimeRect] = useState<DOMRect | null>(null);
  const [lBudget, setLBudget]           = useState(p.budget ? String(p.budget) : '');
  const [lDescription, setLDescription] = useState(p.description ?? '');

  const deliveryOut = lDeliveryYMD
    ? formatDisplay(lDeliveryYMD) + (lDeliveryTime ? ` · ${lDeliveryTime}` : '')
    : deliveryDate;

  const save = () => {
    const budgetNum = Number(String(lBudget).replace(/[^\d.]/g, ''));
    onSave({
      name: lName.trim() || name,
      color: lColor,
      status: lStatus,
      statusLabel: lStatusLabel,
      // Phase n'est plus éditable manuellement — dérivée des sections complétées dans Tâches.
      phase,
      phaseLabel,
      deliveryDate: deliveryOut,
      budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
      description: lDescription.trim() || undefined,
    });
    onClose();
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
      // onMouseDown (not onClick) — closing must trigger only when the press
      // itself starts on the backdrop. A click fires wherever the mouse is
      // released, so a text-selection drag started inside the panel and
      // released over the backdrop would otherwise close it unintentionally.
      onMouseDown={e => { if (e.target === e.currentTarget) save(); }}
    >
      <div style={{ width: 400, background: 'var(--surface)', borderLeft: '1px solid var(--border)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
            <div style={{ width: 14, height: 14, borderRadius: '50%', background: lColor, flexShrink: 0, transition: 'background 0.15s' }} />
            <div style={{ minWidth: 0 }}>
              <h3 style={{ fontSize: 15, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{lName || p.name}</h3>
              <p style={{ fontSize: 11, color: 'var(--text-3)', marginTop: 1 }}>{p.clientName}</p>
            </div>
          </div>
          <button onClick={save} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, flexShrink: 0 }}>
            <SFIcon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Nom */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.projectNameLabel')}</label>
            <input
              autoFocus
              value={lName}
              onChange={e => setLName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') save(); }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Couleur */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.dotColor')}</label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
              {PROJECT_COLORS.map(c => (
                <button
                  key={c}
                  onClick={() => setLColor(c)}
                  style={{
                    width: 28, height: 28, borderRadius: '50%', background: c, cursor: 'pointer',
                    border: lColor === c ? '3px solid white' : '3px solid transparent',
                    outline: lColor === c ? `2px solid ${c}` : 'none',
                    transform: lColor === c ? 'scale(1.15)' : 'none',
                    transition: 'transform 0.1s',
                    flexShrink: 0,
                  }}
                />
              ))}
            </div>
          </div>

          {/* Statut */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.status')}</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PROJECT_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.status}
                  onClick={() => { setLStatus(opt.status); setLStatusLabel(t(opt.labelKey)); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 9,
                    border: `1px solid ${lStatus === opt.status ? 'var(--accent)' : 'var(--border)'}`,
                    background: lStatus === opt.status ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)',
                  }}
                >
                  <SFPill status={opt.status} small>{t(opt.labelKey)}</SFPill>
                  {lStatus === opt.status && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                </button>
              ))}
            </div>
          </div>


          {/* Date de livraison — sélecteur date + heure */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.deliveryDate')}</label>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
              <button
                onClick={e => { setDateOpen(o => !o); setDateRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setTimeOpen(false); }}
                style={{ flex: 1, display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 13, color: deliveryOut ? 'var(--text)' : 'var(--text-3)', fontFamily: 'var(--ff-text)', textAlign: 'left' }}
              >
                <SFIcon name="calendar" size={14} color="var(--text-3)" />
                <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{deliveryOut || t('projects.chooseDate')}</span>
              </button>
              {lDeliveryYMD && (
                <TimeButton value={lDeliveryTime} onClick={e => { setTimeRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setTimeOpen(o => !o); setDateOpen(false); }} placeholder={t('projects.time')} />
              )}
            </div>
            {dateOpen && (
              <DatePickerDropdown
                value={lDeliveryYMD}
                onChange={v => { setLDeliveryYMD(v); setDateOpen(false); }}
                onClose={() => setDateOpen(false)}
                anchorRect={dateRect}
                zIndex={700}
              />
            )}
            {timeOpen && (
              <TimePickerDropdown
                value={lDeliveryTime}
                onChange={v => { setLDeliveryTime(v); setTimeOpen(false); }}
                onClose={() => setTimeOpen(false)}
                anchorRect={timeRect}
                zIndex={700}
              />
            )}
          </div>

          {/* Budget */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.budgetLabel')}</label>
            <input
              value={lBudget}
              onChange={e => setLBudget(e.target.value)}
              placeholder={t('projects.budget')}
              inputMode="numeric"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-mono)' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.description')}</label>
            <textarea
              value={lDescription}
              onChange={e => setLDescription(e.target.value)}
              placeholder={t('projects.projectName')}
              rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

        </div>

      </div>
    </div>,
    document.body
  );
}

// ── Project Card ───────────────────────────────────────────────────────────────

export function ProjectCard({ p }: { p: Project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notifCount = useProjectTotalNotifCount(p.id);
  const [hovered, setHovered]       = useState(false);
  const [pinned, setPinned]         = useState(() => isPinned(p.id));
  const [status, setStatus]         = useState<Status>(p.status);
  const [statusLabel, setStatusLabel] = useState(p.statusLabel);
  const [color, setColor]           = useState(p.clientColor);
  const [name, setName]             = useState(p.name);
  const [phase, setPhase]           = useState<Phase>(p.phase);
  const [phaseLabel, setPhaseLabel] = useState(p.phaseLabel);
  const [deliveryDate, setDeliveryDate] = useState(p.deliveryDate);
  const [dropOpen, setDropOpen]     = useState(false);
  const [dropRect, setDropRect]     = useState<DOMRect | null>(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveClientOpen, setMoveClientOpen] = useState(false);
  const [moveClientSearch, setMoveClientSearch] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribePinned(() => setPinned(isPinned(p.id))), [p.id]);

  useEffect(() => {
    if (!dropOpen) return;
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dropOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const openStatusDrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDropRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setDropOpen(o => !o);
  };

  const pickStatus = (e: React.MouseEvent, s: Status, label: string) => {
    e.stopPropagation();
    setStatus(s); setStatusLabel(label); setDropOpen(false);
  };

  const handleSave = (u: EditUpdates) => {
    setName(u.name); setColor(u.color);
    setStatus(u.status); setStatusLabel(u.statusLabel);
    setPhase(u.phase); setPhaseLabel(u.phaseLabel);
    setDeliveryDate(u.deliveryDate);
    updateProject(p.id, {
      name: u.name, status: u.status, statusLabel: u.statusLabel,
      phase: u.phase, phaseLabel: u.phaseLabel, deliveryDate: u.deliveryDate,
      budget: u.budget, description: u.description,
    });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/projets/${p.id}`)}
      style={{
        background: 'var(--surface)', borderRadius: 'var(--radius)',
        border: `1px solid ${hovered ? 'var(--border-2)' : 'var(--border)'}`,
        padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10,
        transition: (dropOpen || menuOpen) ? 'border-color 0.15s' : 'border-color 0.15s, transform 0.12s',
        transform: (hovered && !dropOpen && !menuOpen) ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {/* Color dot (decorative) */}
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', letterSpacing: '0.06em', textTransform: 'uppercase', marginBottom: 4 }}>{p.clientName}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <p style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{name}</p>
              {notifCount > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--ff-mono)', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, padding: '1px 5px', lineHeight: 1.5, minWidth: 14, textAlign: 'center', flexShrink: 0 }}>
                  {notifCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Star + edit */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); togglePin(p.id); }}
            title={pinned ? t('projects.unpin') : t('projects.pinToSidebar')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: pinned ? 'rgba(249,255,0,0.12)' : 'var(--surface-2)', color: pinned ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
            onMouseEnter={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
            onMouseLeave={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
          >
            <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
          </button>

          <button
            onClick={e => { e.stopPropagation(); setEditOpen(true); }}
            title={t('projects.editProject')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-2)', flexShrink: 0, background: 'var(--surface-3)', color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent)'; el.style.color = 'var(--on-accent)'; el.style.borderColor = 'transparent'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface-3)'; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)'; }}
          >
            <SFIcon name="square-pen" size={13} />
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              title={t('projects.projectMenu')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}
            >
              <SFIcon name="ellipsis" size={14} />
            </button>
            {menuOpen && (
              <div
                onClick={e => e.stopPropagation()}
                style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              >
                <button
                  onClick={() => { if (p.archived) { unarchiveProject(p.id); } else { archiveProject(p.id); } setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name={p.archived ? 'rotate-ccw' : 'archive'} size={13} color="var(--text-3)" />
                  {p.archived ? t('projects.unarchiveProject') : t('projects.archiveProject')}
                </button>
                <button
                  onClick={() => { setMoveClientOpen(true); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="arrow-right-left" size={13} color="var(--text-3)" />
                  {t('projects.moveToClient')}
                </button>
                {p.archived && !confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                  >
                    <SFIcon name="trash-2" size={13} color="var(--danger)" />
                    {t('projects.deleteProjectPermanently')}
                  </button>
                )}
                {p.archived && confirmDelete && (
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{t('projects.deleteProjectConfirm')}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { removeProject(p.id); setMenuOpen(false); setConfirmDelete(false); }}
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
            )}
          </div>
        </div>
      </div>

      <SFBar value={p.progress} height={3} />

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>
        <span>{t('projects.taskCount', { count: p.taskCount })}</span>
        <span>{t('projects.delivery', { date: deliveryDate })}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SFAvatarGroup avatars={p.members.map(m => ({ initials: m.initials, bg: m.avatarColor, name: m.name }))} size={22} />
        {/* No fallback to the static phaseLabel — a project with no sections
            yet has no real phase, and showing a default like "Préproduction"
            was misleading since that section doesn't actually exist. */}
        {getCurrentSectionLabel(p.id) && <SFPill status="neutral" small>{getCurrentSectionLabel(p.id)}</SFPill>}
      </div>

      {/* Bottom row mirrors the client card layout: pill(s) on the left,
          plain relative timestamp on the right (no "Modifié" prefix) — the
          archived/actif pill is new, added alongside the existing
          production-status pill rather than replacing it. */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SFPill status={p.archived ? 'neutral' : 'ok'} small>{p.archived ? t('projects.archivedBadge') : t('projects.activeBadge')}</SFPill>
          <button
            onClick={openStatusDrop}
            title={t('projects.changeStatus')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <SFPill status={status} small>{statusLabel}</SFPill>
            <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
          </button>
        </div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{timeAgo(p.modifiedAt, t)}</span>
      </div>

      {/* Status dropdown */}
      {dropOpen && dropRect && (
        <div
          ref={dropRef}
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: dropRect.bottom + 4, left: dropRect.left, zIndex: 500, background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 155, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
        >
          {PROJECT_STATUS_OPTIONS.map(opt => (
            <button key={opt.status}
              onClick={e => pickStatus(e, opt.status, t(opt.labelKey))}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', borderRadius: 7, cursor: 'pointer', background: status === opt.status ? 'var(--surface)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = status === opt.status ? 'var(--surface)' : 'transparent')}
            >
              <SFPill status={opt.status} small>{t(opt.labelKey)}</SFPill>
            </button>
          ))}
        </div>
      )}

      {/* Edit panel */}
      {editOpen && (
        <ProjectEditPanel
          p={p}
          color={color} name={name} status={status} statusLabel={statusLabel}
          phase={phase} phaseLabel={phaseLabel} deliveryDate={deliveryDate}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
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
            {getClients().filter(c => !c.archived && c.id !== p.clientId && c.name.toLowerCase().includes(moveClientSearch.toLowerCase())).map(c => (
              <button
                key={c.id}
                onClick={e => {
                  // The modal is a portal, but React still bubbles synthetic
                  // events through the component tree — without stopping it
                  // here, this click also reaches the card's own onClick and
                  // navigates into the project right after moving it.
                  e.stopPropagation();
                  updateProject(p.id, { clientId: c.id, clientName: c.name, clientColor: c.avatarColor });
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
