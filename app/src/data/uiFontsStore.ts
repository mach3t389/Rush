// Préférence UI locale : polices titre/texte choisies dans Paramètres →
// Personnalisation. Stockée en localStorage, pas de backend — même famille
// que weekStartStore.ts.
//
// Contrairement à un simple getter/setter, le choix doit aussi être
// réappliqué au CSS (--ff-display / --ff-text) à CHAQUE chargement de
// l'app, pas seulement quand l'utilisateur clique une carte dans
// Paramètres — sinon la sélection persiste en localStorage mais ne
// s'applique plus visuellement après un rafraîchissement, tant que
// l'utilisateur n'a pas rouvert Paramètres et recliqué une police.
// applyPersistedUiFonts() couvre ce cas : appelée une fois au démarrage
// (main.tsx), avant le premier rendu.

const STORAGE_KEY = 'sf_ui_fonts';

export interface UiFonts { heading: string; body: string }

const DEFAULT_FONTS: UiFonts = { heading: "'Montserrat',sans-serif", body: "'Montserrat',sans-serif" };

export function loadUiFonts(): UiFonts {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    if (s) return JSON.parse(s) as UiFonts;
  } catch { /* noop */ }
  return DEFAULT_FONTS;
}

function applyUiFonts(fonts: UiFonts): void {
  document.documentElement.style.setProperty('--ff-display', fonts.heading);
  document.documentElement.style.setProperty('--ff-text', fonts.body);
}

export function saveUiFonts(heading: string, body: string): void {
  const fonts = { heading, body };
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(fonts)); } catch { /* noop */ }
  applyUiFonts(fonts);
}

// Called once at app startup — re-applies whatever was last saved, since
// the CSS custom properties above live only on document.documentElement's
// inline style and don't survive a page reload on their own.
export function applyPersistedUiFonts(): void {
  applyUiFonts(loadUiFonts());
}
