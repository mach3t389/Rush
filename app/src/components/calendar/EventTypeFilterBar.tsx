import { useState, useRef, useEffect } from 'react';
import { SFIcon } from '../ui';
import { addEventType, updateEventType, deleteEventType, type EventType } from '../../data/eventTypeStore';

// Curated set offered when creating/editing an event type — same list as
// EventTypeFilterList.tsx (kept in sync manually, small enough not to warrant
// extracting a shared constant module just for this).
const EVENT_TYPE_ICONS = [
  'circle', 'video', 'package', 'users', 'circle-alert', 'scissors',
  'calendar', 'camera', 'clapperboard', 'mic', 'music', 'star',
  'flag', 'map-pin', 'phone', 'coffee', 'clock', 'sparkles',
];

// Rangée horizontale de chips pour les types d'événements — variante
// compacte d'EventTypeFilterList.tsx (liste verticale, utilisée dans
// ProjetCalendrier.tsx), pensée pour vivre dans l'en-tête du calendrier
// global plutôt que dans la sidebar (qui garde la liste de projets, sans
// plafond, comme seul contenu). Même logique de filtre par inclusion :
// clic = activer, les autres s'estompent, "Tout afficher" seulement si un
// filtre est actif. Pas de glisser-déposer ici (rangée qui peut passer à la
// ligne, moins adapté au drag) — l'ordre reste modifiable depuis la sidebar
// de ProjetCalendrier.tsx si besoin.
export function EventTypeFilterBar({
  eventTypes, selectedEventTypes, onToggle, onClearFilter,
  showAllLabel, newTypeLabel,
}: {
  eventTypes: EventType[];
  selectedEventTypes: Set<string>;
  onToggle: (id: string) => void;
  onClearFilter: () => void;
  showAllLabel: string;
  newTypeLabel: string;
}) {
  const hasFilter = selectedEventTypes.size > 0;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');
  const [editIcon, setEditIcon] = useState('circle');
  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [newIcon, setNewIcon] = useState('circle');
  const popoverRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!editingId && !showNew) return;
    const close = (e: MouseEvent) => {
      if (popoverRef.current && !popoverRef.current.contains(e.target as Node)) { setEditingId(null); setShowNew(false); }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [editingId, showNew]);

  const startEdit = (et: EventType) => { setEditingId(et.id); setEditLabel(et.label); setEditColor(et.color); setEditIcon(et.icon); setShowNew(false); };
  const saveEdit = () => { if (!editLabel.trim() || !editingId) return; updateEventType(editingId, { label: editLabel.trim(), color: editColor, icon: editIcon }); setEditingId(null); };
  const removeType = (id: string) => { deleteEventType(id); setEditingId(null); };
  const addNew = () => {
    if (!newLabel.trim()) return;
    addEventType({ label: newLabel.trim(), color: newColor, icon: newIcon });
    setNewLabel(''); setNewColor('#3b82f6'); setNewIcon('circle'); setShowNew(false);
  };

  const inputStyle: React.CSSProperties = { flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark', minWidth: 0 };
  const colorInputStyle: React.CSSProperties = { width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 };

  const editorPopover = (onSave: () => void, onDelete?: () => void) => (
    <div ref={popoverRef} style={{ position: 'absolute', top: '100%', left: 0, marginTop: 6, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', boxShadow: '0 8px 24px rgba(0,0,0,0.35)', width: 220 }}>
      <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
        <input type="color" value={onDelete ? editColor : newColor} onChange={e => onDelete ? setEditColor(e.target.value) : setNewColor(e.target.value)} style={colorInputStyle} />
        <input value={onDelete ? editLabel : newLabel} onChange={e => onDelete ? setEditLabel(e.target.value) : setNewLabel(e.target.value)} autoFocus placeholder={newTypeLabel}
          onKeyDown={e => { if (e.key === 'Enter') onSave(); if (e.key === 'Escape') { setEditingId(null); setShowNew(false); } }}
          style={inputStyle} />
        <button onClick={onSave} style={{ display: 'flex', padding: 5, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', flexShrink: 0 }}>
          <SFIcon name="check" size={12} />
        </button>
        {onDelete && (
          <button onClick={onDelete} style={{ display: 'flex', padding: 5, borderRadius: 6, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', flexShrink: 0 }}>
            <SFIcon name="trash-2" size={12} />
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
        {EVENT_TYPE_ICONS.map(ic => {
          const active = (onDelete ? editIcon : newIcon) === ic;
          return (
            <button key={ic} onClick={() => onDelete ? setEditIcon(ic) : setNewIcon(ic)} title={ic}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 22, height: 22, borderRadius: 6, cursor: 'pointer', flexShrink: 0, background: active ? 'var(--accent)' : 'var(--surface-3)', border: `1px solid ${active ? 'var(--accent)' : 'var(--border)'}` }}>
              <SFIcon name={ic} size={12} color={active ? 'var(--on-accent)' : 'var(--text-2)'} />
            </button>
          );
        })}
      </div>
    </div>
  );

  return (
    <div style={{ display: 'flex', alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
      {eventTypes.map(et => {
        const active = !hasFilter || selectedEventTypes.has(et.id);
        return (
          <div key={et.id} style={{ position: 'relative' }}
            onMouseEnter={e => { const b = e.currentTarget.querySelector<HTMLElement>('.etb-edit'); if (b) b.style.opacity = '1'; }}
            onMouseLeave={e => { const b = e.currentTarget.querySelector<HTMLElement>('.etb-edit'); if (b) b.style.opacity = '0'; }}
          >
            <button onClick={() => onToggle(et.id)}
              style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', paddingRight: 24, borderRadius: 20, border: `1px solid ${active && hasFilter ? et.color : 'var(--border)'}`, background: active && hasFilter ? 'rgba(255,255,255,0.06)' : 'var(--surface-2)', cursor: 'pointer', opacity: active ? 1 : 0.35, transition: 'all 0.15s' }}
            >
              <SFIcon name={et.icon} size={11} color={et.color} style={{ flexShrink: 0 }} />
              <span style={{ fontSize: 12, color: 'var(--text-2)', whiteSpace: 'nowrap' }}>{et.label}</span>
              {active && hasFilter && <SFIcon name="check" size={11} color="var(--text-3)" />}
            </button>
            <button className="etb-edit" title="Renommer / recolorer" onClick={e => { e.stopPropagation(); editingId === et.id ? setEditingId(null) : startEdit(et); }}
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', opacity: 0, transition: 'opacity 0.12s', padding: 2, display: 'flex', alignItems: 'center' }}
            >
              <SFIcon name="pencil" size={11} />
            </button>
            {editingId === et.id && editorPopover(saveEdit, () => removeType(et.id))}
          </div>
        );
      })}

      <div style={{ position: 'relative' }}>
        <button onClick={() => { setShowNew(v => !v); setEditingId(null); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 20, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 12 }}
        >
          {newTypeLabel}
        </button>
        {showNew && editorPopover(addNew)}
      </div>

      {hasFilter && (
        <button onClick={onClearFilter} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-mono)', padding: '0 4px', textDecoration: 'underline', marginLeft: 4 }}>
          {showAllLabel}
        </button>
      )}
    </div>
  );
}
