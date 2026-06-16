import { useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { SFIcon } from '../ui/SFIcon';

interface Props {
  onSearch: () => void;
}

export function GlobalTopBar({ onSearch }: Props) {
  const navigate = useNavigate();
  const location = useLocation();

  const stackRef = useRef<string[]>([location.pathname + location.search]);
  const idxRef = useRef(0);
  const isNavAction = useRef(false);
  const [, forceUpdate] = useState(0);

  useEffect(() => {
    if (isNavAction.current) {
      isNavAction.current = false;
      forceUpdate(n => n + 1);
      return;
    }
    const path = location.pathname + location.search;
    const stack = stackRef.current;
    // Don't push duplicate consecutive entries
    if (stack[idxRef.current] === path) return;
    // Trim forward history on new navigation
    stack.splice(idxRef.current + 1);
    stack.push(path);
    idxRef.current = stack.length - 1;
    forceUpdate(n => n + 1);
  }, [location]);

  const canBack = idxRef.current > 0;
  const canForward = idxRef.current < stackRef.current.length - 1;

  const goBack = () => {
    if (!canBack) return;
    isNavAction.current = true;
    idxRef.current--;
    navigate(-1);
  };

  const goForward = () => {
    if (!canForward) return;
    isNavAction.current = true;
    idxRef.current++;
    navigate(1);
  };

  const btnStyle = (enabled: boolean): React.CSSProperties => ({
    width: 28, height: 28,
    display: 'flex', alignItems: 'center', justifyContent: 'center',
    borderRadius: 7,
    background: 'transparent',
    border: 'none',
    cursor: enabled ? 'pointer' : 'default',
    color: enabled ? 'var(--text-2)' : 'var(--text-3)',
    opacity: enabled ? 1 : 0.35,
    transition: 'background 0.1s',
  });

  return (
    <div style={{
      height: 46,
      borderBottom: '1px solid var(--border)',
      display: 'flex',
      alignItems: 'center',
      gap: 6,
      padding: '0 14px',
      background: 'var(--surface)',
      flexShrink: 0,
    }}>
      {/* Back / Forward */}
      <button
        onClick={goBack}
        disabled={!canBack}
        title="Retour"
        style={btnStyle(canBack)}
        onMouseEnter={e => { if (canBack) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <SFIcon name="chevron-left" size={16} />
      </button>
      <button
        onClick={goForward}
        disabled={!canForward}
        title="Avancer"
        style={btnStyle(canForward)}
        onMouseEnter={e => { if (canForward) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
      >
        <SFIcon name="chevron-right" size={16} />
      </button>

      {/* Divider */}
      <div style={{ width: 1, height: 18, background: 'var(--border)', margin: '0 2px', flexShrink: 0 }} />

      {/* Search trigger */}
      <button
        onClick={onSearch}
        style={{
          display: 'flex', alignItems: 'center', gap: 8,
          flex: 1, maxWidth: 340,
          height: 30,
          background: 'var(--surface-2)',
          border: '1px solid var(--border)',
          borderRadius: 9,
          padding: '0 10px',
          cursor: 'text',
          color: 'var(--text-3)',
          textAlign: 'left',
          transition: 'border-color 0.15s',
        }}
        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
      >
        <SFIcon name="search" size={13} />
        <span style={{ fontSize: 13, fontFamily: 'var(--ff-text)', flex: 1 }}>
          Rechercher…
        </span>
        <kbd style={{
          fontSize: 10,
          color: 'var(--text-3)',
          background: 'var(--surface-3)',
          border: '1px solid var(--border-2)',
          borderRadius: 4,
          padding: '1px 5px',
          fontFamily: 'var(--ff-mono)',
          flexShrink: 0,
        }}>⌘K</kbd>
      </button>
    </div>
  );
}
