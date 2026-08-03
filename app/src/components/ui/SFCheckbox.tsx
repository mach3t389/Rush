import { SFIcon } from './SFIcon';

export function SFCheckbox({ checked, onChange, disabled, size = 16 }: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
  size?: number;
}) {
  return (
    <div
      onClick={disabled ? undefined : () => onChange(!checked)}
      style={{
        width: size, height: size, borderRadius: 4, flexShrink: 0,
        border: `2px solid ${checked ? 'var(--accent)' : 'var(--border-2)'}`,
        background: checked ? 'var(--accent)' : 'transparent',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        transition: 'all 0.12s',
        opacity: disabled ? 0.5 : 1,
        cursor: disabled ? 'default' : 'pointer',
      }}
    >
      {checked && <SFIcon name="check" size={Math.round(size * 0.56)} color="var(--on-accent)" />}
    </div>
  );
}
