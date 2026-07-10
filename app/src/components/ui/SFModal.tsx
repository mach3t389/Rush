import { useEffect, type ReactNode } from 'react';
import { SFIcon } from './SFIcon';

interface SFModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  width?: number | string;
  maxHeight?: string;
  zIndex?: number;
  padding?: number | string;
  closeOnBackdrop?: boolean;
  closeOnEscape?: boolean;
  children: ReactNode;
}

export function SFModal({
  open,
  onClose,
  title,
  width = 400,
  maxHeight,
  zIndex = 400,
  padding = 24,
  closeOnBackdrop = true,
  closeOnEscape = true,
  children,
}: SFModalProps) {
  useEffect(() => {
    if (!open || !closeOnEscape) return;
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, closeOnEscape, onClose]);

  if (!open) return null;

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      {/* onMouseDown, not onClick — a text-selection drag started inside the
          dialog and released over the backdrop must not close it. */}
      <div onMouseDown={closeOnBackdrop ? onClose : undefined} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)',
        borderRadius: 14, padding, width, maxHeight,
        display: 'flex', flexDirection: 'column',
        boxShadow: '0 16px 48px rgba(0,0,0,0.6)',
        overflow: maxHeight ? 'hidden' : 'visible',
      }}>
        {title && (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16, flexShrink: 0 }}>
            <h3 style={{ fontSize: 14, fontWeight: 700 }}>{title}</h3>
            <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 4, borderRadius: 6 }}>
              <SFIcon name="x" size={15} />
            </button>
          </div>
        )}
        {children}
      </div>
    </div>
  );
}
