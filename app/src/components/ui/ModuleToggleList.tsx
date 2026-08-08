import { SFIcon } from './SFIcon';

export interface ModuleToggleItem {
  key: string;
  label: string;
  checked: boolean;
  onToggle: () => void;
  /** Verrouillé par le plan tarifaire — affiche un cadenas au lieu de la coche. */
  locked?: boolean;
  /** Appelé au clic quand locked est vrai (ex: ouvrir la modale d'upgrade). */
  onLockedClick?: () => void;
  /** Texte d'aide affiché sous la liste quand cet item est actif (ex: exigence de plan). */
  helperText?: string;
}

export function ModuleToggleList({ modules }: { modules: ModuleToggleItem[] }) {
  const activeHelper = modules.find(m => m.helperText)?.helperText;
  return (
    <div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {modules.map(m => (
          <button
            key={m.key}
            type="button"
            onClick={() => { if (m.locked && !m.checked) { m.onLockedClick?.(); return; } m.onToggle(); }}
            style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '8px 10px', borderRadius: 9,
              cursor: 'pointer',
              border: `1.5px solid ${m.checked ? 'var(--accent)' : 'var(--border)'}`,
              background: m.checked ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)',
            }}
          >
            <div style={{
              width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              border: `1.5px solid ${m.checked ? 'var(--accent)' : 'var(--border-2)'}`,
              background: m.checked ? 'var(--accent)' : 'transparent',
            }}>
              {m.locked
                ? <SFIcon name="lock" size={11} color="var(--text-3)" />
                : m.checked && <SFIcon name="check" size={11} color="var(--on-accent)" />}
            </div>
            <span style={{ fontSize: 11, fontWeight: 500, color: 'var(--text-2)' }}>{m.label}</span>
          </button>
        ))}
      </div>
      {activeHelper && <p style={{ fontSize: 10, color: 'var(--text-3)', marginTop: 6 }}>{activeHelper}</p>}
    </div>
  );
}
