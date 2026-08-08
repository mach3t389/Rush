// Génère un vrai fichier PDF téléchargeable à partir du contenu déjà
// sauvegardé d'une ressource (Document, Moodboard, Scénario, Inspirations) —
// sans avoir besoin d'ouvrir la ressource au préalable. Utilisé par le
// bouton "Exporter" à l'intérieur de ResourceDetail.tsx ET par "Télécharger"
// dans Fichiers (FichiersGlobal.tsx).
//
// Remplace l'ancien mécanisme (ResourceDetail.tsx: exportToPDF) qui ouvrait
// une fenêtre et déclenchait window.print(), obligeant l'utilisateur à
// choisir "Enregistrer en PDF" dans la boîte de dialogue d'impression du
// navigateur — en plus d'être fragile quand déclenché hors d'un clic humain
// direct (bloqueur de popup). html2pdf.js génère un vrai Blob PDF côté
// client, téléchargé comme n'importe quel autre fichier de l'app.
//
// escapeHTML/SCRIPT_PRINT_CSS/buildScriptHTML/DOC_THEMES/getAutoThumb sont
// réutilisés depuis ResourceDetail.tsx plutôt que dupliqués — ResourceDetail
// n'importe rien en retour de ce module, donc pas de dépendance circulaire.
import html2pdf from 'html2pdf.js';
import { getResourceContent } from './resourceContentStore';
import { getFileContent, getFileContentError, subscribeUploadStatus } from './fileContentStore';
import {
  escapeHTML, SCRIPT_PRINT_CSS, buildScriptHTML, DOC_THEMES, getAutoThumb,
  type DocTheme,
} from '../screens/ResourceDetail';
import type { ScriptEl } from '../screens/ResourceDetail';

export interface ExportPayload { title: string; bodyHTML: string; css: string; }

// ── Résolution d'image (fichier réel vs URL externe) ────────────────────────
// getFileContent() peut renvoyer null au premier appel en session réelle (la
// fetch de l'URL signée est en cours) — on attend sa résolution plutôt que
// d'exporter une image cassée. Même mécanisme que downloadFileById dans
// FichiersGlobal.tsx, dupliqué ici volontairement pour ne pas faire dépendre
// ce module data/ d'un écran.
function awaitFileImageUrl(fileId: string, timeoutMs = 15000): Promise<string | undefined> {
  const existing = getFileContent(fileId);
  if (existing) return Promise.resolve(existing);
  return new Promise(resolve => {
    let done = false;
    const finish = (url: string | undefined) => { if (done) return; done = true; clearTimeout(timer); unsubscribe(); resolve(url); };
    const unsubscribe = subscribeUploadStatus(() => {
      const url = getFileContent(fileId);
      if (url) finish(url);
      else if (getFileContentError(fileId)) finish(undefined);
    });
    const timer = setTimeout(() => finish(undefined), timeoutMs);
  });
}

async function resolveImageSrc(imageFileId: string | undefined, imageUrl: string | undefined): Promise<string | undefined> {
  if (imageFileId) return awaitFileImageUrl(imageFileId);
  return imageUrl;
}

// ── Document ─────────────────────────────────────────────────────────────
export function buildDocumentExportPayload(resourceId: string, title: string): ExportPayload | null {
  const persisted = getResourceContent<{ html?: string; theme?: DocTheme }>(resourceId);
  if (!persisted?.html) return null;
  const theme = persisted.theme ?? 'standard';
  return {
    title,
    css: 'body{display:flex;justify-content:center;padding:0}.doc-print{width:100%;max-width:760px}'
      + DOC_THEMES[theme].css.replace(/\.doc-editor/g, '.doc-print'),
    bodyHTML: `<div class="doc-print">${persisted.html}</div>`,
  };
}

// ── Moodboard ────────────────────────────────────────────────────────────
interface MBItemLike {
  type: 'image' | 'text' | 'color' | 'postit' | 'shape' | 'video' | 'web';
  text?: string; imageUrl?: string; imageFileId?: string;
  shapeType?: 'rect' | 'ellipse'; shapeColor?: string; postitColor?: string; webUrl?: string;
}
const MOODBOARD_CSS = 'body{padding:0}.mb-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:12pt}.mb-card{border:1px solid #ddd;border-radius:6pt;overflow:hidden;min-height:60pt;display:flex;align-items:center;justify-content:center;padding:8pt;font-size:10pt;word-break:break-word}.mb-card img{width:100%;height:auto;display:block}';

export async function buildMoodboardExportPayload(resourceId: string, title: string): Promise<ExportPayload | null> {
  const persisted = getResourceContent<{ items: MBItemLike[] }>(resourceId);
  if (!persisted?.items) return null;
  const cards = await Promise.all(persisted.items.map(async item => {
    if (item.type === 'image') {
      const src = await resolveImageSrc(item.imageFileId, item.imageUrl);
      return src ? `<div class="mb-card"><img src="${src}" alt="" /></div>` : '';
    }
    if (item.type === 'text' || item.type === 'postit') {
      return `<div class="mb-card mb-note" style="background:${item.postitColor ?? '#f9f295'}">${escapeHTML(item.text ?? '')}</div>`;
    }
    if (item.type === 'web') {
      return `<div class="mb-card mb-note">${escapeHTML(item.webUrl ?? '')}</div>`;
    }
    if (item.type === 'shape') {
      return `<div class="mb-card" style="background:${item.shapeColor ?? '#3b82f6'}22;border:2px solid ${item.shapeColor ?? '#3b82f6'};${item.shapeType === 'ellipse' ? 'border-radius:50%' : ''}"></div>`;
    }
    return '';
  }));
  return {
    title,
    css: MOODBOARD_CSS,
    bodyHTML: `<h1 style="font-size:16pt;margin:0 0 14pt">${escapeHTML(title)}</h1><div class="mb-grid">${cards.filter(Boolean).join('')}</div>`,
  };
}

// ── Inspirations ─────────────────────────────────────────────────────────
interface InspiItemLike { title: string; url: string; imageUrl?: string; notes: string; likes?: string; avoids?: string; }
const INSPIRATIONS_CSS = 'body{padding:0}.in-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:14pt}.in-card{border:1px solid #ddd;border-radius:6pt;overflow:hidden}.in-card img{width:100%;height:120pt;object-fit:cover;display:block}.in-body{padding:8pt}.in-body h3{font-size:11pt;margin:0 0 4pt}.in-body p{font-size:9pt;margin:2pt 0;color:#444}.in-likes{color:#1a6b4a}.in-avoids{color:#a83e3e}';

export function buildInspirationsExportPayload(resourceId: string, title: string): ExportPayload | null {
  const persisted = getResourceContent<{ items: InspiItemLike[] }>(resourceId);
  if (!persisted?.items) return null;
  const cards = persisted.items.map(item => {
    const thumb = item.imageUrl || getAutoThumb(item.url);
    return `<div class="in-card">
      ${thumb ? `<img src="${thumb}" alt="" />` : ''}
      <div class="in-body">
        <h3>${escapeHTML(item.title || 'Référence')}</h3>
        ${item.notes ? `<p>${escapeHTML(item.notes)}</p>` : ''}
        ${item.likes ? `<p class="in-likes">+ ${escapeHTML(item.likes)}</p>` : ''}
        ${item.avoids ? `<p class="in-avoids">− ${escapeHTML(item.avoids)}</p>` : ''}
      </div>
    </div>`;
  }).join('');
  return {
    title,
    css: INSPIRATIONS_CSS,
    bodyHTML: `<h1 style="font-size:16pt;margin:0 0 14pt">${escapeHTML(title)}</h1><div class="in-grid">${cards}</div>`,
  };
}

// ── Scénario (Script + Shotlist + Storyboard) ───────────────────────────────
// L'export ne couvrait auparavant QUE l'onglet Script — Shotlist et
// Storyboard n'avaient jamais de chemin d'export du tout. Les trois sections
// sont maintenant combinées en un seul PDF, séparées par un saut de page.
//
// Le regroupement par scène suit l'ordre de stockage des plans (shots),
// pas sceneOrder (qui ne sert qu'au tri manuel dans le glisser-déposer de
// Shotlist/Storyboard) — fidèle au contenu, pas nécessairement pixel-perfect
// à l'ordre visuel exact si l'utilisateur a réordonné manuellement.
interface ShotRowLike {
  sceneLabel: string; description: string; shotType: string; cameraMove: string;
  lens: string; duration: string; notes: string; imageUrl?: string; imageFileId?: string;
}
const SHOTLIST_CSS = `
table.shotlist{width:100%;border-collapse:collapse;font-size:9pt}
table.shotlist th,table.shotlist td{border:1px solid #ddd;padding:5pt 7pt;text-align:left;vertical-align:top}
table.shotlist th{background:#f2f2f2;font-weight:700;font-size:8pt;text-transform:uppercase;letter-spacing:0.04em}
table.shotlist .scene-row td{background:#eee;font-weight:700;font-size:9.5pt}
.sb-grid{display:grid;grid-template-columns:repeat(2,1fr);gap:12pt}
.sb-card{border:1px solid #ddd;border-radius:6pt;overflow:hidden}
.sb-card img{width:100%;height:110pt;object-fit:cover;display:block;background:#eee}
.sb-body{padding:7pt}
.sb-body .sb-type{font-family:'Courier New',monospace;font-size:8pt;font-weight:700;color:#555}
.sb-body p{font-size:9pt;margin:3pt 0 0;color:#222}
.pdf-section-title{font-size:15pt;font-weight:700;margin:0 0 12pt}
.pdf-page-break{page-break-before:always}
`;

function groupShotsByScene(shots: ShotRowLike[]): { sceneLabel: string; shots: ShotRowLike[] }[] {
  const groups: { sceneLabel: string; shots: ShotRowLike[] }[] = [];
  for (const shot of shots) {
    const last = groups[groups.length - 1];
    if (last && last.sceneLabel === shot.sceneLabel) last.shots.push(shot);
    else groups.push({ sceneLabel: shot.sceneLabel, shots: [shot] });
  }
  return groups;
}

function buildShotlistHTML(shots: ShotRowLike[]): string {
  const groups = groupShotsByScene(shots);
  const rows = groups.map(g => {
    const sceneRow = `<tr class="scene-row"><td colspan="6">${escapeHTML(g.sceneLabel)}</td></tr>`;
    const shotRows = g.shots.map(s => `<tr>
      <td>${escapeHTML(s.description)}</td>
      <td>${escapeHTML(s.shotType)}</td>
      <td>${escapeHTML(s.cameraMove)}</td>
      <td>${escapeHTML(s.lens)}</td>
      <td>${escapeHTML(s.duration)}</td>
      <td>${escapeHTML(s.notes)}</td>
    </tr>`).join('');
    return sceneRow + shotRows;
  }).join('');
  return `<div class="pdf-page-break"><h2 class="pdf-section-title">Shotlist</h2>
    <table class="shotlist"><thead><tr><th>Description</th><th>Plan</th><th>Mouvement</th><th>Objectif</th><th>Durée</th><th>Notes</th></tr></thead>
    <tbody>${rows}</tbody></table></div>`;
}

async function buildStoryboardHTML(shots: ShotRowLike[]): Promise<string> {
  const groups = groupShotsByScene(shots);
  const sections = await Promise.all(groups.map(async g => {
    const cards = await Promise.all(g.shots.map(async s => {
      const src = await resolveImageSrc(s.imageFileId, s.imageUrl);
      return `<div class="sb-card">
        ${src ? `<img src="${src}" alt="" />` : ''}
        <div class="sb-body"><div class="sb-type">${escapeHTML(s.shotType)} · ${escapeHTML(s.cameraMove)}</div><p>${escapeHTML(s.description)}</p></div>
      </div>`;
    }));
    return `<h3 style="font-size:11pt;margin:14pt 0 8pt">${escapeHTML(g.sceneLabel)}</h3><div class="sb-grid">${cards.join('')}</div>`;
  }));
  return `<div class="pdf-page-break"><h2 class="pdf-section-title">Storyboard</h2>${sections.join('')}</div>`;
}

export async function buildScreenplayExportPayload(resourceId: string, title: string): Promise<ExportPayload | null> {
  const persisted = getResourceContent<{ versions: { id: string; label: string; elements: ScriptEl[] }[]; activeId: string; shots?: ShotRowLike[] }>(resourceId);
  if (!persisted?.versions?.length) return null;
  const activeVersion = persisted.versions.find(v => v.id === persisted.activeId) ?? persisted.versions[0];
  const shots = persisted.shots ?? [];

  const scriptSection = `<div>${buildScriptHTML(title, activeVersion.label, activeVersion.elements)}</div>`;
  const shotlistSection = shots.length > 0 ? buildShotlistHTML(shots) : '';
  const storyboardSection = shots.length > 0 ? await buildStoryboardHTML(shots) : '';

  return {
    title: `${title} — ${activeVersion.label}`,
    css: SCRIPT_PRINT_CSS + SHOTLIST_CSS,
    bodyHTML: scriptSection + shotlistSection + storyboardSection,
  };
}

// ── Rendu PDF + téléchargement ───────────────────────────────────────────
// Rend le payload hors-écran (jamais visible), puis génère un vrai Blob PDF
// — pas de fenêtre popup, pas de boîte de dialogue d'impression. Le
// conteneur est retiré du DOM dans tous les cas (succès ou échec).
export async function renderPayloadToPdfBlob(payload: ExportPayload): Promise<Blob> {
  // html2canvas capture une page BLANCHE — silencieusement, sans erreur —
  // dès que l'élément cible a `position: absolute` ou `fixed`, peu importe
  // l'offset ou l'opacité utilisés pour le rendre invisible (vérifié en
  // testant 5 variantes différentes : toutes les positions non-static
  // échouent identiquement, y compris à z-index négatif sans opacity).
  // Seul un élément resté en flux normal (position: static, sa valeur par
  // défaut) capture réellement son contenu. On le masque donc via un
  // conteneur PARENT à hauteur nulle + overflow:hidden — jamais via la
  // propriété `position` de l'élément capturé lui-même.
  //
  // `transform` s'ajoute en seconde couche : contrairement à `position`,
  // transformer un ANCÊTRE ne change pas la façon dont le moteur de mise en
  // page traite ses descendants en `position: static` (le conteneur capturé
  // le reste) — seul le rendu visuel/composité est déplacé. Un signalement
  // utilisateur d'un flash visible côté droit de l'écran pendant la
  // génération n'a pas pu être reproduit ici malgré une instrumentation
  // complète (aucun élément visible détecté sur les nœuds ajoutés au DOM),
  // mais cette technique est la référence standard pour ce cas d'usage et
  // élimine toute fenêtre de risque théorique, observée ou non.
  const wrapper = document.createElement('div');
  wrapper.style.height = '0';
  wrapper.style.overflow = 'hidden';
  wrapper.style.transform = 'translateX(-99999px)';

  const container = document.createElement('div');
  container.style.width = '210mm';
  container.style.background = '#fff';
  container.style.color = '#111';
  const style = document.createElement('style');
  style.textContent = payload.css;
  container.appendChild(style);
  const body = document.createElement('div');
  body.innerHTML = payload.bodyHTML;
  container.appendChild(body);
  wrapper.appendChild(container);
  document.body.appendChild(wrapper);

  try {
    // `pagebreak` existe bel et bien à l'exécution (respecte nos marqueurs
    // .pdf-page-break en CSS) mais manque du .d.ts fourni par la bibliothèque
    // — cast local pour cette seule option plutôt que d'assouplir tout le
    // typage de l'appel.
    const blob = await html2pdf()
      .set({
        margin: 10,
        image: { type: 'jpeg', quality: 0.92 },
        html2canvas: { scale: 2, useCORS: true },
        jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
        ...({ pagebreak: { mode: ['css'] } } as Record<string, unknown>),
      })
      .from(container)
      .outputPdf('blob');
    return blob as Blob;
  } finally {
    document.body.removeChild(wrapper);
  }
}

function slugifyFileName(name: string): string {
  return name.trim().replace(/[/\\?%*:|"<>]/g, '-').slice(0, 150) || 'export';
}

export async function downloadPayloadAsPdf(payload: ExportPayload): Promise<void> {
  const blob = await renderPayloadToPdfBlob(payload);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `${slugifyFileName(payload.title)}.pdf`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

// Types de ressources qui savent s'exporter en PDF — utilisé par
// FichiersGlobal.tsx pour décider si "Télécharger" doit s'afficher sur une
// ressource. video_review/web_review (fils de commentaires sur un média
// externe, pas un document) et form (mieux servi par son export CSV des
// réponses, déjà existant séparément) sont volontairement exclus.
export const PDF_EXPORTABLE_RESOURCE_TYPES = ['document', 'moodboard', 'screenplay', 'inspirations'] as const;
export type PdfExportableResourceType = typeof PDF_EXPORTABLE_RESOURCE_TYPES[number];

export async function buildResourceExportPayload(resourceType: string, resourceId: string, title: string): Promise<ExportPayload | null> {
  switch (resourceType) {
    case 'document':     return buildDocumentExportPayload(resourceId, title);
    case 'moodboard':    return buildMoodboardExportPayload(resourceId, title);
    case 'inspirations': return buildInspirationsExportPayload(resourceId, title);
    case 'screenplay':   return buildScreenplayExportPayload(resourceId, title);
    default:              return null;
  }
}

export async function downloadResourceAsPdf(resourceType: string, resourceId: string, title: string): Promise<void> {
  const payload = await buildResourceExportPayload(resourceType, resourceId, title);
  if (!payload) throw new Error('aucun contenu à exporter pour cette ressource');
  await downloadPayloadAsPdf(payload);
}
