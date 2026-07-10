import { useState } from 'react';
import { SFIcon } from '../ui';
import { addEventType, updateEventType, deleteEventType, reorderEventTypes, type EventType } from '../../data/eventTypeStore';

// Liste des types d'événements dans la sidebar calendrier — sert à la fois de
// filtre (clic = inclure/exclure) et d'éditeur (survol = crayon pour renommer/
// recolorer/supprimer un type custom ; bouton "+" pour en créer un nouveau).
// Partagé entre CalendrierGlobal.tsx et ProjetCalendrier.tsx.
export function EventTypeFilterList({
  eventTypes, selectedEventTypes, onToggle, onClearFilter,
  titleLabel, showAllLabel, newTypeLabel,
}: {
  eventTypes: EventType[];
  selectedEventTypes: Set<string>;
  onToggle: (id: string) => void;
  onClearFilter: () => void;
  titleLabel: string;
  showAllLabel: string;
  newTypeLabel: string;
}) {
  const hasFilter = selectedEventTypes.size > 0;
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');
  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');
  const [dragId, setDragId] = useState<string | null>(null);
  const [dragOverId, setDragOverId] = useState<string | null>(null);

  const handleDrop = (targetId: string) => {
    if (!dragId || dragId === targetId) { setDragId(null); setDragOverId(null); return; }
    const ids = eventTypes.map(t => t.id);
    const fromIdx = ids.indexOf(dragId);
    const toIdx = ids.indexOf(targetId);
    ids.splice(fromIdx, 1);
    ids.splice(toIdx, 0, dragId);
    reorderEventTypes(ids);
    setDragId(null);
    setDragOverId(null);
  };

  const startEdit = (et: EventType) => { setEditingId(et.id); setEditLabel(et.label); setEditColor(et.color); setShowNew(false); };
  const saveEdit = () => { if (!editLabel.trim() || !editingId) return; updateEventType(editingId, { label: editLabel.trim(), color: editColor }); setEditingId(null); };
  const removeType = (id: string) => { deleteEventType(id); setEditingId(null); };
  const addNew = () => {
    if (!newLabel.trim()) return;
    addEventType({ label: newLabel.trim(), color: newColor, icon: 'circle' });
    setNewLabel(''); setNewColor('#3b82f6'); setShowNew(false);
  };

  const inputStyle: React.CSSProperties = { flex: 1, padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark', minWidth: 0 };
  const colorInputStyle: React.CSSProperties = { width: 26, height: 26, borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 };

  return (
    <div>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>{titleLabel}</p>
        {hasFilter && (
          <button onClick={onClearFilter} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 9, cursor: 'pointer', fontFamily: 'var(--ff-mono)', padding: 0, textDecoration: 'underline' }}>
            {showAllLabel}
          </button>
        )}
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {eventTypes.map(et => {
          const active = !hasFilter || selectedEventTypes.has(et.id);
          const isEditing = editingId === et.id;
          return (
            <div key={et.id}>
              <div style={{ position: 'relative', display: 'flex', borderTop: dragOverId === et.id && dragId !== et.id ? '2px solid var(--accent)' : '2px solid transparent' }}
                draggable
                onDragStart={() => setDragId(et.id)}
                onDragOver={e => { e.preventDefault(); if (dragId && dragId !== et.id) setDragOverId(et.id); }}
                onDragLeave={() => setDragOverId(null)}
                onDrop={e => { e.preventDefault(); handleDrop(et.id); }}
                onDragEnd={() => { setDragId(null); setDragOverId(null); }}
                onMouseEnter={e => { const b = e.currentTarget.querySelector<HTMLElement>('.et-edit'); if (b) b.style.opacity = '1'; const g = e.currentTarget.querySelector<HTMLElement>('.et-grip'); if (g) g.style.opacity = '1'; }}
                onMouseLeave={e => { const b = e.currentTarget.querySelector<HTMLElement>('.et-edit'); if (b) b.style.opacity = '0'; const g = e.currentTarget.querySelector<HTMLElement>('.et-grip'); if (g) g.style.opacity = '0'; }}
              >
                <span className="et-grip" style={{ position: 'absolute', left: -14, top: '50%', transform: 'translateY(-50%)', color: 'var(--border-2)', opacity: 0, transition: 'opacity 0.12s', cursor: 'grab', display: 'flex' }}>
                  <SFIcon name="grip-vertical" size={11} />
                </span>
                <button onClick={() => onToggle(et.id)}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '5px 8px', paddingRight: 26, borderRadius: 8, border: 'none', background: active && hasFilter ? 'rgba(255,255,255,0.04)' : 'transparent', cursor: 'pointer', textAlign: 'left', opacity: active ? 1 : 0.35, transition: 'all 0.15s', width: '100%' }}
                >
                  <div style={{ width: 10, height: 10, borderRadius: '50%', background: et.color, flexShrink: 0 }} />
                  <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{et.label}</span>
                  {active && hasFilter && <SFIcon name="check" size={11} color="var(--text-3)" />}
                </button>
                <button className="et-edit" onClick={e => { e.stopPropagation(); isEditing ? setEditingId(null) : startEdit(et); }}
                  style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', opacity: 0, transition: 'opacity 0.12s', padding: 2, display: 'flex', alignItems: 'center' }}
                >
                  <SFIcon name="pencil" size={10} />
                </button>
              </div>
              {isEditing && (
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', margin: '4px 0', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
                  <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)} style={colorInputStyle} />
                  <input value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus
                    onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
                    style={inputStyle} />
                  <button onClick={saveEdit} style={{ display: 'flex', padding: 5, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', flexShrink: 0 }}>
                    <SFIcon name="check" size={12} />
                  </button>
                  <button onClick={() => removeType(et.id)} style={{ display: 'flex', padding: 5, borderRadius: 6, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', cursor: 'pointer', flexShrink: 0 }}>
                    <SFIcon name="trash-2" size={12} />
                  </button>
                </div>
              )}
            </div>
          );
        })}
        <button onClick={() => { setShowNew(v => !v); setEditingId(null); }}
          style={{ display: 'flex', alignItems: 'center', padding: '5px 8px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11, width: '100%', textAlign: 'left' }}
        >
          {newTypeLabel}
        </button>
        {showNew && (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)} style={colorInputStyle} />
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} autoFocus placeholder={newTypeLabel}
              onKeyDown={e => { if (e.key === 'Enter') addNew(); if (e.key === 'Escape') setShowNew(false); }}
              style={inputStyle} />
            <button onClick={addNew} style={{ display: 'flex', padding: 5, borderRadius: 6, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', cursor: 'pointer', flexShrink: 0 }}>
              <SFIcon name="check" size={12} />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
