const KEY_FULL = 'sf_studio_logo_full';
const KEY_SQUARE = 'sf_studio_logo_square';

type Listener = () => void;
const listeners: Listener[] = [];

function notify() {
  listeners.forEach(l => l());
}

export function subscribeStudioLogos(fn: Listener): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}

export function getLogoFull(): string | null {
  try { return localStorage.getItem(KEY_FULL); } catch { return null; }
}

export function getLogoSquare(): string | null {
  try { return localStorage.getItem(KEY_SQUARE); } catch { return null; }
}

export function setLogoFull(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(KEY_FULL, dataUrl);
    else localStorage.removeItem(KEY_FULL);
    notify();
  } catch { /* noop */ }
}

export function setLogoSquare(dataUrl: string | null) {
  try {
    if (dataUrl) localStorage.setItem(KEY_SQUARE, dataUrl);
    else localStorage.removeItem(KEY_SQUARE);
    notify();
  } catch { /* noop */ }
}
