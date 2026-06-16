const STORAGE_KEY = 'sf_template_favorites';

type Listener = () => void;
const listeners: Listener[] = [];
function notify() { listeners.forEach(l => l()); }

function load(): Set<string> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return new Set(JSON.parse(raw) as string[]);
  } catch { /* noop */ }
  return new Set();
}

function save(ids: Set<string>) {
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify([...ids])); } catch { /* noop */ }
}

export function getFavoriteTemplateIds(): Set<string> {
  return load();
}

export function isTemplateFavorite(id: string): boolean {
  return load().has(id);
}

export function toggleTemplateFavorite(id: string): void {
  const ids = load();
  if (ids.has(id)) ids.delete(id); else ids.add(id);
  save(ids);
  notify();
}

export function subscribeTemplateFavorites(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
