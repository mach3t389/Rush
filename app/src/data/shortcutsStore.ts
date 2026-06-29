import { loadPersisted, savePersisted } from './persist';

export interface ShortcutCombo {
  key: string;   // e.g. 'r', 'i', 'm'
  ctrl: boolean; // true = Ctrl (Win) / Cmd (Mac)
  shift: boolean;
  alt: boolean;
}

export type ShortcutAction = 'search' | 'ai_toggle' | 'ai_mic';

export const DEFAULT_SHORTCUTS: Record<ShortcutAction, ShortcutCombo> = {
  search:    { key: 'r', ctrl: false, shift: false, alt: false },
  ai_toggle: { key: 'i', ctrl: false, shift: false, alt: false },
  ai_mic:    { key: 'm', ctrl: true,  shift: false, alt: false },
};

export const SHORTCUT_LABELS: Record<ShortcutAction, string> = {
  search:    'Recherche',
  ai_toggle: 'Ouvrir/fermer l\'IA',
  ai_mic:    'Micro IA',
};

const STORAGE_KEY = 'sf_shortcuts';

let _shortcuts: Record<ShortcutAction, ShortcutCombo> = loadPersisted(STORAGE_KEY, { ...DEFAULT_SHORTCUTS });

const _listeners = new Set<() => void>();
function notify() { _listeners.forEach(fn => fn()); }

export function getShortcuts(): Record<ShortcutAction, ShortcutCombo> {
  return _shortcuts;
}

export function setShortcut(action: ShortcutAction, combo: ShortcutCombo): void {
  _shortcuts = { ..._shortcuts, [action]: combo };
  savePersisted(STORAGE_KEY, _shortcuts);
  notify();
}

export function resetShortcut(action: ShortcutAction): void {
  setShortcut(action, { ...DEFAULT_SHORTCUTS[action] });
}

export function resetAllShortcuts(): void {
  _shortcuts = { ...DEFAULT_SHORTCUTS };
  savePersisted(STORAGE_KEY, _shortcuts);
  notify();
}

export function subscribeShortcuts(fn: () => void): () => void {
  _listeners.add(fn);
  return () => _listeners.delete(fn);
}

export function matchesShortcut(e: KeyboardEvent, combo: ShortcutCombo): boolean {
  const ctrlMatch = combo.ctrl ? (e.ctrlKey || e.metaKey) : (!e.ctrlKey && !e.metaKey);
  return (
    e.key.toLowerCase() === combo.key.toLowerCase() &&
    ctrlMatch &&
    e.shiftKey === combo.shift &&
    e.altKey === combo.alt
  );
}

export function formatCombo(combo: ShortcutCombo): string {
  const parts: string[] = [];
  if (combo.ctrl)  parts.push('⌃');
  if (combo.shift) parts.push('⇧');
  if (combo.alt)   parts.push('⌥');
  parts.push(combo.key.toUpperCase());
  return parts.join('');
}
