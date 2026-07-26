import { useRef, useState } from 'react';
import { SFIcon } from './SFIcon';

// Generic single-select filter dropdown with a static category label (e.g.
// "Statut") that stays visible and only appends the selected value when it
// isn't the default — same pattern as LifecycleFilterDropdown, generalized
// for any option list instead of the fixed all/active/archived one. Use this
// instead of a row of chips once there are more than ~3 options; a chip row
// that size crowds the header (this is what Projets' 8-status chip row and
// Finances' 6-status chip row both ran into).
export function CategoryFilterDropdown<T extends string>({ value, onChange, categoryLabel, icon = 'filter', options }: {
  value: T;
  onChange: (v: T) => void;
  categoryLabel: string;
  icon?: string;
  /** First option is treated as the default (shown as just categoryLabel, no ": value") */
  options: { value: T; label: string }[];
}) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef<HTMLButtonElement>(null);
  const isDefault = value === options[0]?.value;
  const current = options.find(o => o.value === value)?.label;

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      <button
        ref={btnRef}
        onClick={() => setOpen(o => !o)}
        style={{ display: 'flex', alignItems: 'center', gap: 7, padding: '6px 11px', borderRadius: 9, border: `1px solid ${!isDefault ? 'var(--accent)' : 'var(--border)'}`, background: !isDefault ? 'rgba(249,255,0,0.07)' : 'var(--surface-2)', color: !isDefault ? 'var(--accent)' : 'var(--text-2)', fontSize: 12, fontWeight: 500, cursor: 'pointer', fontFamily: 'var(--ff-text)', whiteSpace: 'nowrap', flexShrink: 0 }}
      >
        <SFIcon name={icon} size={13} color={!isDefault ? 'var(--accent)' : 'var(--text-3)'} />
        {categoryLabel}{!isDefault && `: ${current}`}
        <SFIcon name="chevron-down" size={12} color={!isDefault ? 'var(--accent)' : 'var(--text-3)'} />
      </button>
      {open && (() => {
        const rect = btnRef.current?.getBoundingClientRect();
        return (
          <>
            <div onClick={() => setOpen(false)} style={{ position: 'fixed', inset: 0, zIndex: 290 }} />
            <div style={{ position: 'fixed', top: rect ? rect.bottom + 6 : 100, left: rect ? rect.left : 24, zIndex: 300, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, padding: 5, minWidth: 190, maxHeight: 320, overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.5)' }}>
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
