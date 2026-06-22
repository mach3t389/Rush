import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import { SFPill, SFBar, SFAvatarGroup, SFIcon, SFButton } from './ui';
import type { Project, Status, Phase } from '../types/index';
import { isPinned, togglePin, subscribePinned } from '../data/pinnedStore';
import { updateProject } from '../data/projectStore';
import { useProjectTotalNotifCount } from '../hooks/useNotifs';

const PROJECT_COLORS = [
  '#3b4f8f', '#1a6b4a', '#7d4e57', '#5b3ea8',
  '#a85f3e', '#2a7a8a', '#7a6a2a', '#404040',
  '#c0392b', '#e67e22', '#16a085', '#8e44ad',
];


export const PROJECT_STATUS_OPTIONS: { status: Status; label: string }[] = [
  { status: 'ok',      label: 'Terminé' },
  { status: 'info',    label: 'En cours' },
  { status: 'warn',    label: 'À faire' },
  { status: 'review',  label: 'En révision' },
  { status: 'danger',  label: 'Bloqué' },
  { status: 'neutral', label: 'En attente' },
];

// ── Project Edit Panel ─────────────────────────────────────────────────────────

export const PROJECT_PHASE_OPTIONS: { phase: Phase; label: string }[] = [
  { phase: 'preproduction',  label: 'Préproduction' },
  { phase: 'production',     label: 'Production' },
  { phase: 'postproduction', label: 'Postproduction' },
  { phase: 'livraison',      label: 'Livraison' },
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
  const [lName, setLName]               = useState(name);
  const [lColor, setLColor]             = useState(color);
  const [lStatus, setLStatus]           = useState<Status>(status);
  const [lStatusLabel, setLStatusLabel] = useState(statusLabel);
  const [lPhase, setLPhase]             = useState<Phase>(phase);
  const [lPhaseLabel, setLPhaseLabel]   = useState(phaseLabel);
  const [lDelivery, setLDelivery]       = useState(deliveryDate);
  const [lBudget, setLBudget]           = useState(p.budget ? String(p.budget) : '');
  const [lDescription, setLDescription] = useState(p.description ?? '');

  const save = () => {
    const budgetNum = Number(String(lBudget).replace(/[^\d.]/g, ''));
    onSave({
      name: lName.trim() || name,
      color: lColor,
      status: lStatus,
      statusLabel: lStatusLabel,
      phase: lPhase,
      phaseLabel: lPhaseLabel,
      deliveryDate: lDelivery,
      budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
      description: lDescription.trim() || undefined,
    });
    onClose();
  };

  return createPortal(
    <div
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 600, display: 'flex', alignItems: 'stretch', justifyContent: 'flex-end' }}
      onClick={e => { e.stopPropagation(); if (e.target === e.currentTarget) onClose(); }}
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
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, flexShrink: 0 }}>
            <SFIcon name="x" size={16} />
          </button>
        </div>

        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', padding: 20, display: 'flex', flexDirection: 'column', gap: 20 }}>

          {/* Nom */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Nom du projet</label>
            <input
              autoFocus
              value={lName}
              onChange={e => setLName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter') save(); }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Couleur */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Couleur de la pastille</label>
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
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Statut</label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
              {PROJECT_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.status}
                  onClick={() => { setLStatus(opt.status); setLStatusLabel(opt.label); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 9, padding: '7px 10px', borderRadius: 9,
                    border: `1px solid ${lStatus === opt.status ? 'var(--accent)' : 'var(--border)'}`,
                    background: lStatus === opt.status ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)',
                  }}
                >
                  <SFPill status={opt.status} small>{opt.label}</SFPill>
                  {lStatus === opt.status && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Phase */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>Phase actuelle</label>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {PROJECT_PHASE_OPTIONS.map(opt => (
                <button
                  key={opt.phase}
                  onClick={() => { setLPhase(opt.phase); setLPhaseLabel(opt.label); }}
                  style={{
                    padding: '6px 11px', borderRadius: 8,
                    border: `1px solid ${lPhase === opt.phase ? 'var(--accent)' : 'var(--border)'}`,
                    background: lPhase === opt.phase ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)',
                    color: lPhase === opt.phase ? 'var(--accent)' : 'var(--text-2)',
                    fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)',
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </div>

          {/* Date de livraison */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Date de livraison</label>
            <input
              value={lDelivery}
              onChange={e => setLDelivery(e.target.value)}
              placeholder="ex. 15 juin 2025"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Budget */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Budget</label>
            <input
              value={lBudget}
              onChange={e => setLBudget(e.target.value)}
              placeholder="ex. 9000"
              inputMode="numeric"
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-mono)' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>Description</label>
            <textarea
              value={lDescription}
              onChange={e => setLDescription(e.target.value)}
              placeholder="Courte description du projet…"
              rows={3}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

        </div>

        {/* Footer */}
        <div style={{ padding: '14px 20px', borderTop: '1px solid var(--border)', display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" onClick={save}>Enregistrer</SFButton>
        </div>
      </div>
    </div>,
    document.body
  );
}

// ── Project Card ───────────────────────────────────────────────────────────────

export function ProjectCard({ p }: { p: Project }) {
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
        transition: 'border-color 0.15s, transform 0.12s',
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
            title={pinned ? 'Désépingler' : 'Épingler dans la barre latérale'}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: pinned ? 'rgba(249,255,0,0.12)' : 'var(--surface-2)', color: pinned ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
            onMouseEnter={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
            onMouseLeave={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
          >
            <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
          </button>

          <button
            onClick={e => { e.stopPropagation(); setEditOpen(true); }}
            title="Modifier le projet"
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: '1px solid var(--border-2)', flexShrink: 0, background: 'var(--surface-3)', color: 'var(--text)', cursor: 'pointer', transition: 'background 0.15s, border-color 0.15s' }}
            onMouseEnter={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--accent)'; el.style.color = 'var(--on-accent)'; el.style.borderColor = 'transparent'; }}
            onMouseLeave={e => { const el = e.currentTarget as HTMLElement; el.style.background = 'var(--surface-3)'; el.style.color = 'var(--text)'; el.style.borderColor = 'var(--border-2)'; }}
          >
            <SFIcon name="square-pen" size={13} />
          </button>
        </div>
      </div>

      <SFBar value={p.progress} height={3} />

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>
        <span>{p.taskCount} tâches</span>
        <span>Livraison {deliveryDate}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SFAvatarGroup avatars={p.members.map(m => ({ initials: m.initials, bg: m.avatarColor, name: m.name }))} size={22} />
        <SFPill status="neutral" small>{phaseLabel}</SFPill>
      </div>

      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>Modifié {p.modifiedAt}</span>
        <button
          onClick={openStatusDrop}
          title="Changer le statut"
          style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
        >
          <SFPill status={status} small>{statusLabel}</SFPill>
          <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
        </button>
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
              onClick={e => pickStatus(e, opt.status, opt.label)}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', borderRadius: 7, cursor: 'pointer', background: status === opt.status ? 'var(--surface)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = status === opt.status ? 'var(--surface)' : 'transparent')}
            >
              <SFPill status={opt.status} small>{opt.label}</SFPill>
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
    </div>
  );
}
