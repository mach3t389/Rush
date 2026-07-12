import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { SFIcon } from './ui';
import type { Task } from '../types';

interface SubtaskTargetPickerProps {
  pos: { x: number; y: number };
  candidates: Task[];
  onPick: (targetTaskId: string) => void;
  onClose: () => void;
}

export function SubtaskTargetPicker({ pos, candidates, onPick, onClose }: SubtaskTargetPickerProps) {
  const [query, setQuery] = useState('');
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const handleEscape = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    document.addEventListener('mousedown', handleClickOutside);
    document.addEventListener('keydown', handleEscape);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
      document.removeEventListener('keydown', handleEscape);
    };
  }, [onClose]);

  useEffect(() => { inputRef.current?.focus(); }, []);

  const filtered = candidates.filter(t => t.title.toLowerCase().includes(query.trim().toLowerCase()));

  const left = Math.min(pos.x, window.innerWidth - 280);
  const top = Math.min(pos.y, window.innerHeight - 320);

  return createPortal(
    <div
      ref={ref}
      style={{
        position: 'fixed', left, top, width: 260, zIndex: 700,
        background: 'var(--surface-2)', border: '1px solid var(--border)', borderRadius: 10,
        boxShadow: '0 8px 32px rgba(0,0,0,0.45)', overflow: 'hidden', display: 'flex', flexDirection: 'column',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderBottom: '1px solid var(--border)' }}>
        <SFIcon name="search" size={13} color="var(--text-3)" />
        <input
          ref={inputRef}
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Convertir en sous-tâche de..."
          style={{ flex: 1, background: 'none', border: 'none', outline: 'none', color: 'var(--text)', fontSize: 12, fontFamily: 'var(--ff-text)' }}
        />
      </div>
      <div style={{ maxHeight: 260, overflowY: 'auto', padding: '4px 0' }}>
        {filtered.length === 0 && (
          <p style={{ padding: '10px 14px', fontSize: 12, color: 'var(--text-3)', fontFamily: 'var(--ff-text)' }}>Aucune tâche disponible</p>
        )}
        {filtered.map(t => (
          <button
            key={t.id}
            onClick={() => onPick(t.id)}
            style={{
              display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '8px 14px',
              border: 'none', background: 'none', cursor: 'pointer', textAlign: 'left',
              fontSize: 13, fontFamily: 'var(--ff-text)', color: 'var(--text)',
            }}
            onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-3)')}
            onMouseLeave={e => (e.currentTarget.style.background = 'none')}
          >
            {!!t.subtasks?.length && <SFIcon name="git-branch" size={12} color="var(--text-3)" />}
            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.title}</span>
          </button>
        ))}
      </div>
    </div>,
    document.body,
  );
}
