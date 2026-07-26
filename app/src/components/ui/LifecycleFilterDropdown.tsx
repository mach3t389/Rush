import { useRef, useState } from 'react';
import { SFIcon } from './SFIcon';

export type LifecycleFilter = 'all' | 'active' | 'archived';

// Shared active/archived dropdown — used identically by Projets and Clients
// (two structurally similar list screens) so the "is this thing archived"
// dimension always looks and behaves the same way, instead of one screen
// getting chips and the other a bare toggle with no visible options.
export function LifecycleFilterDropdown({ value, onChange, labels }: {
  value: LifecycleFilter;
  onChange: (v: LifecycleFilter) => void;
  labels: { all: string; active: string; archived: string };
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const options: { value: LifecycleFilter; label: string }[] = [
    { value: 'all', label: labels.all },
    { value: 'active', label: labels.active },
    { value: 'archived', label: labels.archived },
  ];
  const current = options.find(o => o.value === value)?.label;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 9, border: `1px solid ${value !== 'all' ? 'var(--accent)' : 'var(--border)'}`, background: value !== 'all' ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', color: value !== 'all' ? 'var(--accent)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        <SFIcon name="archive" size={13} color={value !== 'all' ? 'var(--accent)' : 'var(--text-3)'} />
        {current}
        <SFIcon name="chevron-down" size={12} color={value !== 'all' ? 'var(--accent)' : 'var(--text-3)'} />
      </button>
      {open && (() => {
        const rect = btnRef.current?.getBoundingClientRect();
        return (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
            <div style={{ position: 'fixed', top: rect ? rect.bottom + 6 : 100, left: rect ? rect.left : 24, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 5, minWidth: 170, boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
              {options.map(opt => (
                <button
                  key={opt.value}
                  onClick={() => { onChange(opt.value); setOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 9, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', textAlign: 'left', cursor: 'pointer', background: value === opt.value ? 'var(--surface-3)' : 'transparent', color: value === opt.value ? 'var(--text)' : 'var(--text-2)', fontSize: 12, fontWeight: value === opt.value ? 600 : 400, fontFamily: 'var(--ff-text)' }}
                  onMouseEnter={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                  onMouseLeave={e => { if (value !== opt.value) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
                >
                  {opt.label}
                  {value === opt.value && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto' }} />}
                </button>
              ))}
            </div>
          </>
        );
      })()}
    </div>
  );
}
