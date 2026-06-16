import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';
import { SFPill, SFAvatar, SFBar, SFButton, SFIcon } from '../components/ui';
import { PROJECTS, USERS } from '../data/mock';
import { getResources, updateResource, subscribeResources } from '../data/resourceStore';
import { markResourceRead } from '../data/notificationStore';
import type { Resource, ResourceType, Status, User } from '../types';
import { VideoReviewBody } from './VideoReview';

const STATUS_OPTIONS: { status: Status; label: string }[] = [
  { status: 'ok',      label: 'Terminé' },
  { status: 'info',    label: 'En cours' },
  { status: 'warn',    label: 'À faire' },
  { status: 'review',  label: 'En révision' },
  { status: 'danger',  label: 'Bloqué' },
  { status: 'neutral', label: 'En attente' },
];

// ── Types ─────────────────────────────────────────────────────────────────────

export type ScriptElType = 'scene' | 'action' | 'character' | 'parenthetical' | 'dialogue' | 'transition';
export interface ScriptEl { id: string; type: ScriptElType; text: string; }

type MBTool = 'select' | 'pan' | 'arrow' | 'rect' | 'ellipse';
interface MBItem { id: string; type: 'image' | 'text' | 'color' | 'postit' | 'shape'; x: number; y: number; w: number; h: number; text?: string; imageUrl?: string; bg?: string; shapeType?: 'rect' | 'ellipse'; shapeColor?: string; postitColor?: string; }
interface MBArrow { id: string; from: string; to: string; label?: string; }
type DragState =
  | { type: 'pan'; startX: number; startY: number; startPan: { x: number; y: number } }
  | { type: 'item'; startX: number; startY: number; itemId: string; startItemX: number; startItemY: number }
  | { type: 'resize'; startX: number; startY: number; itemId: string; startW: number; startH: number }
  | { type: 'shape'; startX: number; startY: number; startCX: number; startCY: number; shapeType: 'rect' | 'ellipse' };

interface InspiItem { id: string; title: string; url: string; bg: string; imageUrl?: string; tags: string[]; notes: string; }

// ── Constants ─────────────────────────────────────────────────────────────────

const TYPE_ICON: Record<ResourceType, string> = {
  screenplay: 'clapperboard', video_review: 'video', moodboard: 'grid-2x2',
  document: 'file', checklist: 'list-checks', inspirations: 'image', file: 'hard-drive',
  form: 'clipboard-list',
};
const TYPE_LABEL: Record<ResourceType, string> = {
  screenplay: 'Scénarisation', video_review: 'Révision', moodboard: 'Moodboard',
  document: 'Document', checklist: 'Checklist', inspirations: 'Inspirations', file: 'Fichier',
  form: 'Formulaire',
};

const EL_CFG: Record<ScriptElType, { label: string; abbr: string; placeholder: string; ml: string; w: string; upper: boolean; right: boolean; italic: boolean; color: string }> = {
  scene:         { label: 'Scène',      abbr: 'SCN', placeholder: 'INT./EXT. LIEU — MOMENT',   ml: '0',    w: '100%', upper: true,  right: false, italic: false, color: '#f9ff00' },
  action:        { label: 'Action',     abbr: 'ACT', placeholder: 'Description de la scène...', ml: '0',    w: '100%', upper: false, right: false, italic: false, color: '#94a3b8' },
  character:     { label: 'Personnage', abbr: 'PNJ', placeholder: 'NOM DU PERSONNAGE',          ml: '37%',  w: '26%',  upper: true,  right: false, italic: false, color: '#7dd3fc' },
  parenthetical: { label: 'Parenthèse',abbr: 'PAR', placeholder: '(indication de jeu)',         ml: '30%',  w: '40%',  upper: false, right: false, italic: true,  color: '#86efac' },
  dialogue:      { label: 'Dialogue',   abbr: 'DLG', placeholder: 'Réplique...',                ml: '25%',  w: '50%',  upper: false, right: false, italic: false, color: '#c4b5fd' },
  transition:    { label: 'Transition', abbr: 'TRS', placeholder: 'FONDU AU NOIR',              ml: '0',    w: '100%', upper: true,  right: true,  italic: false, color: '#fb923c' },
};
const EL_ORDER: ScriptElType[] = ['scene', 'action', 'character', 'parenthetical', 'dialogue', 'transition'];
const NEXT_EL: Record<ScriptElType, ScriptElType> = {
  scene: 'action', action: 'action', character: 'dialogue',
  parenthetical: 'dialogue', dialogue: 'character', transition: 'scene',
};

// ── Mock data ─────────────────────────────────────────────────────────────────

const INITIAL_ELEMENTS: ScriptEl[] = [
  { id: 'e1',  type: 'scene',         text: 'INT. LOFT PARISIEN — JOUR' },
  { id: 'e2',  type: 'action',        text: 'Plan large. Lumière naturelle filtrée par de grandes baies vitrées.\nDes vêtements de créateurs disposés sur des mannequins.' },
  { id: 'e3',  type: 'character',     text: 'NARRATEUR' },
  { id: 'e4',  type: 'parenthetical', text: '(V.O.)' },
  { id: 'e5',  type: 'dialogue',      text: 'Chaque été raconte une histoire différente.\nCelle-ci commence ici — entre Paris et la lumière.' },
  { id: 'e6',  type: 'action',        text: 'Une JEUNE FEMME (25 ans, élégante) entre dans le loft.\nElle effleure le tissu d\'une robe.' },
  { id: 'e7',  type: 'character',     text: 'JEUNE FEMME' },
  { id: 'e8',  type: 'parenthetical', text: '(à voix basse, admirative)' },
  { id: 'e9',  type: 'dialogue',      text: 'C\'est exactement ça.' },
  { id: 'e10', type: 'action',        text: 'PLAN DE COUPE — SES MAINS sur le tissu. Gros plan.' },
  { id: 'e11', type: 'scene',         text: 'EXT. TOITS DE PARIS — COUCHER DE SOLEIL' },
  { id: 'e12', type: 'action',        text: 'La ville s\'embrase. La JEUNE FEMME est maintenant sur un toit,\nrobe au vent, regard vers l\'horizon.' },
  { id: 'e13', type: 'character',     text: 'NARRATEUR' },
  { id: 'e14', type: 'parenthetical', text: '(V.O.)' },
  { id: 'e15', type: 'dialogue',      text: 'L\'été 2025 ne ressemble à aucun autre.\nC\'est l\'été de l\'audace.' },
  { id: 'e16', type: 'transition',    text: 'LOGO — FONDU AU NOIR' },
];

const CHECKLIST_ITEMS_MOCK = [
  { id:'ck1', text:'Vérifier le matériel (caméra, batteries, cartes mémoire)', done:true,  initials:'LM', color:'#5c3d8f', due:'3 mai' },
  { id:'ck2', text:'Confirmer les autorisations de tournage sur les lieux',    done:true,  initials:'TR', color:'#5c3d8f', due:'5 mai' },
  { id:'ck3', text:'Préparer les costumes et accessoires avec la styliste',    done:true,  initials:'SM', color:'#3b4f8f', due:'6 mai' },
  { id:'ck4', text:'Briefer l\'équipe technique sur le plan de tournage',      done:true,  initials:'TR', color:'#5c3d8f', due:'7 mai' },
  { id:'ck5', text:'Installer et tester le matériel d\'éclairage',             done:false, initials:'JB', color:'#1a6b4a', due:'8 mai' },
  { id:'ck6', text:'Confirmer la présence des acteurs principaux',             done:false, initials:'MD', color:'#7d4e57', due:'8 mai' },
  { id:'ck7', text:'Vérifier le groupe électrogène de secours',               done:false, initials:'LM', color:'#5c3d8f', due:'9 mai' },
  { id:'ck8', text:'Préparer le plateau et les fonds de scène',               done:false, initials:'JB', color:'#1a6b4a', due:'9 mai' },
];

const INITIAL_MB_ITEMS: MBItem[] = [
  { id:'mb1', type:'color', x:40,  y:40,  w:200, h:140, bg:'#1a2035' },
  { id:'mb2', type:'color', x:260, y:30,  w:160, h:210, bg:'#2d1a0e' },
  { id:'mb3', type:'text',  x:440, y:50,  w:210, h:100, text:'Direction artistique : tons chauds et dorés, lumière naturelle filtrée' },
  { id:'mb4', type:'color', x:80,  y:210, w:210, h:130, bg:'#0e1a0e' },
  { id:'mb5', type:'color', x:310, y:260, w:130, h:190, bg:'#3d3042' },
  { id:'mb6', type:'text',  x:40,  y:380, w:260, h:80,  text:'Référence : Wes Anderson × Fashion Editorial Paris' },
  { id:'mb7', type:'color', x:460, y:200, w:170, h:130, bg:'#1a0e1a' },
];
const INITIAL_MB_ARROWS: MBArrow[] = [
  { id:'ar1', from:'mb3', to:'mb1' },
];

const INITIAL_INSPI: InspiItem[] = [
  { id:'in1', title:'Campagne Dior Été 2024',       url:'dior.com',    bg:'#1e2d3d', tags:['mode','été','lumineux'],    notes:'' },
  { id:'in2', title:'Editorial Vogue Paris',        url:'vogue.fr',    bg:'#3d2a1e', tags:['mode','éditorial'],         notes:'Composition très forte, lumière de fenêtre' },
  { id:'in3', title:'Film Gucci — The Ritual',      url:'gucci.com',   bg:'#1e3d2d', tags:['luxe','cinéma','ambiance'], notes:'' },
  { id:'in4', title:'Wes Anderson — palette',       url:'pinterest.fr',bg:'#3d3d1e', tags:['couleur','symétrie'],       notes:'Symétrie parfaite, tons pastel saturés' },
  { id:'in5', title:'Tim Walker — Fantaisie mode',  url:'timwalker.co',bg:'#2d1e3d', tags:['fantaisie','mode'],         notes:'' },
  { id:'in6', title:'Golden hour — Unsplash',       url:'unsplash.com',bg:'#3d2a0e', tags:['lumière','été','naturel'],  notes:'Parfait pour les scènes extérieures' },
];

const DOC_INITIAL_HTML = `<h1>Brief créatif — Collection Été 2025</h1><h2>Objectifs du projet</h2><p>Ce document présente les lignes directrices créatives pour la campagne de la Collection Été 2025. L'objectif est de capturer l'essence de l'été parisien tout en mettant en valeur l'élégance intemporelle de la marque.</p><h2>Cibles et personas</h2><p>La campagne s'adresse à une clientèle <strong>urbaine et sophistiquée</strong>, âgée de 25 à 45 ans, sensible à l'esthétique contemporaine. Ces individus valorisent <em>l'authenticité</em> et la qualité artisanale.</p><h2>Direction créative</h2><p>L'esthétique visuelle s'inspire du <strong>Paris des années 70</strong> revisité dans un contexte contemporain. Les tons chauds et froids coexistent en harmonie, créant une tension visuelle élégante.</p><ul><li>Lumière naturelle filtrée — dorée et douce</li><li>Décors minimalistes avec touches d'authenticité</li><li>Casting diversifié représentant la modernité parisienne</li></ul><h2>Budget et calendrier</h2><p>La production est planifiée sur <strong>3 semaines</strong>, avec une première phase de tournage du 15 au 22 mai 2025, suivie d'une phase de post-production intensive.</p>`;

// ── Autosave, statut en ligne & export (partagé script + document) ────────────

type SaveState = 'saved' | 'saving' | 'offline';
type ExportFormat = 'pdf' | 'gdocs';
interface ExportPayload { title: string; bodyHTML: string; css: string; }
type RegisterExport = (build: (() => ExportPayload) | null) => void;

interface EditableProps {
  onEdit?: () => void;
  saveState?: SaveState;
  online?: boolean;
  registerExport?: RegisterExport;
}

function useAutosave() {
  const [online, setOnline] = useState<boolean>(() => navigator.onLine);
  const [state, setState] = useState<SaveState>('saved');
  const dirty = useRef(false);
  const timer = useRef<number | null>(null);

  const scheduleSave = () => {
    if (timer.current) clearTimeout(timer.current);
    setState('saving');
    timer.current = window.setTimeout(() => { dirty.current = false; timer.current = null; setState('saved'); }, 900);
  };

  useEffect(() => {
    const goOnline = () => { setOnline(true); if (dirty.current) scheduleSave(); else setState('saved'); };
    const goOffline = () => { setOnline(false); if (timer.current) { clearTimeout(timer.current); timer.current = null; } setState('offline'); };
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => {
      window.removeEventListener('online', goOnline);
      window.removeEventListener('offline', goOffline);
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  // Marque le contenu comme modifié : déclenche une sauvegarde différée, ou bloque si hors ligne.
  const touch = useCallback(() => {
    dirty.current = true;
    if (!navigator.onLine) { setState('offline'); return; }
    scheduleSave();
  }, []);

  return { state, online, touch };
}

function SaveIndicator({ state, online }: { state: SaveState; online: boolean }) {
  const offline = !online || state === 'offline';
  const cfg = offline
    ? { color: 'var(--danger)', label: 'Hors ligne' }
    : state === 'saving'
      ? { color: 'var(--warn)', label: 'Enregistrement…' }
      : { color: 'var(--ok)', label: 'Enregistré' };
  return (
    <div
      style={{ display:'flex', alignItems:'center', gap:6 }}
      title={offline
        ? 'Hors ligne — les modifications seront enregistrées au retour de la connexion'
        : state === 'saving' ? 'Enregistrement en cours…' : 'Enregistré en temps réel'}
    >
      <style>{'@keyframes rushSavePulse{0%,100%{opacity:1}50%{opacity:0.3}}'}</style>
      <span style={{ width:7, height:7, borderRadius:'50%', background:cfg.color, flexShrink:0, animation: (state === 'saving' && !offline) ? 'rushSavePulse 1s ease-in-out infinite' : undefined }} />
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', whiteSpace:'nowrap' }}>{cfg.label}</span>
    </div>
  );
}

const escapeHTML = (s: string) =>
  s.replace(/[&<>"]/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;' }[c] as string));

function exportToPDF(payload: ExportPayload): boolean {
  const w = window.open('', '_blank', 'width=860,height=1100');
  if (!w) return false;
  w.document.open();
  w.document.write(
    '<!doctype html><html lang="fr"><head><meta charset="utf-8"><title>' + escapeHTML(payload.title) + '</title>' +
    '<style>@page{size:A4;margin:18mm}html,body{margin:0;background:#fff;color:#111}' + payload.css + '</style>' +
    '</head><body>' + payload.bodyHTML + '</body></html>'
  );
  w.document.close();
  w.focus();
  setTimeout(() => { try { w.print(); } catch { /* fenêtre fermée */ } }, 350);
  return true;
}

const SCRIPT_PRINT_CSS = `
*{box-sizing:border-box}
body{font-family:'Courier New',Courier,monospace;font-size:12pt;line-height:1.45;color:#000}
.scr-title{text-align:center;margin:0 0 30pt}
.scr-title h1{font-size:17pt;margin:0 0 6pt}
.scr-title .sub{font-size:11pt;color:#555}
.scr p{margin:0}
.scr .scene{font-weight:bold;text-transform:uppercase;margin:16pt 0 6pt}
.scr .scene .num{margin-right:10pt}
.scr .action{margin:0 0 8pt;white-space:pre-wrap}
.scr .character{text-transform:uppercase;margin:10pt 0 0;margin-left:35%}
.scr .parenthetical{font-style:italic;margin:0;margin-left:28%}
.scr .dialogue{margin:0 0 6pt;margin-left:22%;margin-right:12%;white-space:pre-wrap}
.scr .transition{text-transform:uppercase;text-align:right;margin:10pt 0}
`;

function buildScriptHTML(title: string, versionLabel: string, els: ScriptEl[]): string {
  let sceneNo = 0;
  const rows = els.map(el => {
    const text = escapeHTML(el.text) || '&nbsp;';
    switch (el.type) {
      case 'scene':         sceneNo++; return `<p class="scene"><span class="num">${sceneNo}.</span>${text}</p>`;
      case 'character':     return `<p class="character">${text}</p>`;
      case 'parenthetical': return `<p class="parenthetical">${text}</p>`;
      case 'dialogue':      return `<p class="dialogue">${text}</p>`;
      case 'transition':    return `<p class="transition">${text}</p>`;
      default:              return `<p class="action">${text}</p>`;
    }
  }).join('');
  return `<div class="scr-title"><h1>${escapeHTML(title)}</h1><div class="sub">${escapeHTML(versionLabel)}</div></div><div class="scr">${rows}</div>`;
}

// ── Script View (Celtx-style) ─────────────────────────────────────────────────

interface ScriptVersion {
  id: string;
  label: string;
  date: string;
  elements: ScriptEl[];
}

const INITIAL_VERSIONS: ScriptVersion[] = [
  { id: 'v1', label: 'Brouillon initial',   date: '2 mai',  elements: INITIAL_ELEMENTS.map(e => ({ ...e })) },
  { id: 'v2', label: 'Révision scènes 1–3', date: '5 mai',  elements: INITIAL_ELEMENTS.map(e => ({ ...e })) },
  { id: 'v3', label: 'Dialogues finaux',    date: '8 mai',  elements: INITIAL_ELEMENTS.map(e => ({ ...e })) },
];

interface ScriptViewProps extends EditableProps {
  resource: Resource;
  versions: ScriptVersion[];
  setVersions: React.Dispatch<React.SetStateAction<ScriptVersion[]>>;
  activeVersionId: string;
  setActiveVersionId: (id: string) => void;
}

// ── Script comment sidebar ────────────────────────────────────────────────────

interface ScriptComment { id: string; author: string; text: string; ts: number; resolved: boolean; }

function ScriptCommentSidebar({ resourceId }: { resourceId: string }) {
  const [comments, setComments] = useState<ScriptComment[]>([]);
  const [draft, setDraft] = useState('');

  const addComment = () => {
    if (!draft.trim()) return;
    setComments(prev => [...prev, { id: `sc-${Date.now()}`, author: 'Moi', text: draft.trim(), ts: Date.now(), resolved: false }]);
    setDraft('');
  };

  const openComments = comments.filter(c => !c.resolved);
  const resolvedComments = comments.filter(c => c.resolved);

  return (
    <div id="rd-comments-panel" style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', borderLeft:'1px solid var(--border)', overflow:'hidden' }}>
      <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', flexShrink:0, display:'flex', alignItems:'center', gap:6 }}>
        <SFIcon name="message-circle" size={12} color="var(--text-3)" />
        <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Commentaires</p>
        {openComments.length > 0 && <span style={{ marginLeft:'auto', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--accent)', fontWeight:700 }}>{openComments.length}</span>}
      </div>
      <div style={{ flex:1, overflow:'auto', padding:'10px', display:'flex', flexDirection:'column', gap:6 }}>
        {comments.length === 0 && (
          <p style={{ fontSize:11, color:'var(--text-3)', padding:'4px 2px' }}>Aucun commentaire.</p>
        )}
        {openComments.map(c => (
          <div key={c.id} style={{ padding:'8px 10px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:4 }}>
              <SFAvatar user={{ name: c.author } as any} size={18} />
              <span style={{ fontSize:11, fontWeight:600, color:'var(--text-2)', flex:1 }}>{c.author}</span>
              <button
                onClick={() => setComments(prev => prev.map(cc => cc.id === c.id ? { ...cc, resolved: true } : cc))}
                title="Résoudre"
                style={{ background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:2, borderRadius:4, display:'flex', alignItems:'center' }}
              >
                <SFIcon name="check" size={11} />
              </button>
            </div>
            <p style={{ fontSize:12, color:'var(--text)', lineHeight:1.5 }}>{c.text}</p>
          </div>
        ))}
        {resolvedComments.length > 0 && (
          <p style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginTop:4 }}>Résolus ({resolvedComments.length})</p>
        )}
      </div>
      <div style={{ padding:'10px', borderTop:'1px solid var(--border)', flexShrink:0 }}>
        <textarea
          value={draft}
          onChange={e => setDraft(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); addComment(); } }}
          placeholder="Ajouter un commentaire…"
          rows={2}
          style={{ width:'100%', resize:'none', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:7, padding:'7px 9px', fontSize:12, color:'var(--text)', outline:'none', fontFamily:'var(--ff-text)', boxSizing:'border-box', colorScheme:'dark' }}
        />
        <button
          onClick={addComment}
          disabled={!draft.trim()}
          style={{ marginTop:6, width:'100%', padding:'6px 0', borderRadius:7, border:'none', background: draft.trim() ? 'var(--accent)' : 'var(--surface-3)', color: draft.trim() ? '#000' : 'var(--text-3)', fontSize:12, fontWeight:600, cursor: draft.trim() ? 'pointer' : 'default', fontFamily:'var(--ff-text)', transition:'background 0.15s' }}
        >
          Envoyer
        </button>
      </div>
    </div>
  );
}

function ScriptView({ resource, onEdit, saveState = 'saved', online = true, registerExport, versions, setVersions, activeVersionId, setActiveVersionId }: ScriptViewProps) {
  const [editingVersionId, setEditingVersionId] = useState<string | null>(null);
  const [editingVersionLabel, setEditingVersionLabel] = useState('');
  const [focusId, setFocusId] = useState<string | null>(null);
  const [openTypeId, setOpenTypeId] = useState<string | null>(null);
  const [panelTab, setPanelTab] = useState<'scenes' | 'analyse'>('scenes');
  const [collapsedScenes, setCollapsedScenes] = useState<Set<string>>(new Set());
  const dragSceneRef = useRef<string | null>(null);
  const [dragOverScene, setDragOverScene] = useState<string | null>(null);
  const taRefs = useRef<Map<string, HTMLTextAreaElement>>(new Map());
  const scrollRef = useRef<HTMLDivElement>(null);
  const elRowRefs = useRef<Map<string, HTMLDivElement>>(new Map());

  const activeVersion = versions.find(v => v.id === activeVersionId)!;
  const elements = activeVersion.elements;

  const setElements = (updater: (prev: ScriptEl[]) => ScriptEl[]) => {
    setVersions(prev => prev.map(v => v.id === activeVersionId ? { ...v, elements: updater(v.elements) } : v));
    onEdit?.();
  };

  useEffect(() => {
    taRefs.current.forEach(ta => {
      ta.style.height = 'auto';
      ta.style.height = `${ta.scrollHeight}px`;
    });
  });

  useEffect(() => {
    if (!focusId) return;
    const el = taRefs.current.get(focusId);
    if (el) { el.focus(); el.setSelectionRange(el.value.length, el.value.length); }
    setFocusId(null);
  }, [focusId, elements]);

  useEffect(() => {
    if (!registerExport) return;
    const label = activeVersion.label;
    registerExport(() => ({
      title: `${resource.title} — ${label}`,
      css: SCRIPT_PRINT_CSS,
      bodyHTML: buildScriptHTML(resource.title, label, elements),
    }));
    return () => registerExport(null);
  });

  const changeEl = (id: string, text: string) => {
    setVersions(prev => prev.map(v => v.id === activeVersionId
      ? { ...v, elements: v.elements.map(e => e.id === id ? { ...e, text } : e) }
      : v
    ));
    onEdit?.();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>, idx: number) => {
    const cur = elements[idx];
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const nid = `e${Date.now()}`;
      const newEl: ScriptEl = { id: nid, type: NEXT_EL[cur.type], text: '' };
      setElements(p => { const n = [...p]; n.splice(idx + 1, 0, newEl); return n; });
      setFocusId(nid);
    } else if (e.key === 'Tab') {
      e.preventDefault();
      const ci = EL_ORDER.indexOf(cur.type);
      const ni = e.shiftKey ? (ci - 1 + EL_ORDER.length) % EL_ORDER.length : (ci + 1) % EL_ORDER.length;
      setElements(p => p.map((el, i) => i === idx ? { ...el, type: EL_ORDER[ni] } : el));
    } else if (e.key === 'Backspace' && cur.text === '' && elements.length > 1) {
      e.preventDefault();
      setElements(p => p.filter((_, i) => i !== idx));
      if (idx > 0) setFocusId(elements[idx - 1].id);
    } else if (e.key === 'ArrowUp' && idx > 0) {
      setFocusId(elements[idx - 1].id);
    } else if (e.key === 'ArrowDown' && idx < elements.length - 1) {
      setFocusId(elements[idx + 1].id);
    }
  };

  const createVersion = () => {
    const now = new Date();
    const dateStr = `${now.getDate()} ${['jan','fév','mar','avr','mai','jun','jul','aoû','sep','oct','nov','déc'][now.getMonth()]}`;
    const newId = `v${Date.now()}`;
    const newVersion: ScriptVersion = {
      id: newId,
      label: `Version ${versions.length + 1}`,
      date: dateStr,
      elements: elements.map(e => ({ ...e, id: `${e.id}_${newId}` })),
    };
    setVersions(prev => [...prev, newVersion]);
    setActiveVersionId(newId);
    onEdit?.();
    setEditingVersionId(newId);
    setEditingVersionLabel(newVersion.label);
  };

  const switchVersion = (id: string) => {
    setActiveVersionId(id);
  };

  const scrollToScene = (elId: string) => {
    const row = elRowRefs.current.get(elId);
    if (row && scrollRef.current) {
      row.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const reorderScene = (fromSceneId: string, toSceneId: string) => {
    if (fromSceneId === toSceneId) return;
    setElements(prev => {
      const fromStart = prev.findIndex(e => e.id === fromSceneId);
      const fromEnd = prev.findIndex((e, i) => i > fromStart && e.type === 'scene');
      const fromBlock = prev.slice(fromStart, fromEnd === -1 ? prev.length : fromEnd);
      const without = prev.filter((_, i) => i < fromStart || i >= (fromEnd === -1 ? prev.length : fromEnd));
      const toIdx = without.findIndex(e => e.id === toSceneId);
      const result = [...without.slice(0, toIdx), ...fromBlock, ...without.slice(toIdx)];
      return result;
    });
  };

  const scenes = elements.filter(e => e.type === 'scene');
  const sceneNumberById = new Map<string, number>();
  scenes.forEach((s, i) => sceneNumberById.set(s.id, i + 1));
  const pageCount = Math.max(1, Math.ceil(elements.reduce((a, e) => a + e.text.split('\n').length, 0) / 55));
  const wordCount = elements.reduce((a, e) => a + e.text.trim().split(/\s+/).filter(Boolean).length, 0);
  const signCount = elements.reduce((a, e) => a + e.text.replace(/\s/g, '').length, 0);
  const allCharacters = [...new Set(elements.filter(e => e.type === 'character').map(e => e.text.trim()).filter(Boolean))];
  const allLocations = [...new Set(elements.filter(e => e.type === 'scene').map(e => {
    const m = e.text.match(/^(?:INT|EXT|INT\.\/EXT\.|EXT\.\/INT\.)\.?\s+(.+?)(?:\s+[—\-–]\s+|$)/i);
    return m ? m[1].trim() : e.text.trim();
  }).filter(Boolean))];
  const charSceneCount = new Map<string, number>();
  scenes.forEach(scene => {
    const si = elements.indexOf(scene);
    const ni = elements.findIndex((e, idx) => idx > si && e.type === 'scene');
    const sEls = elements.slice(si + 1, ni === -1 ? undefined : ni);
    new Set(sEls.filter(e => e.type === 'character').map(e => e.text.trim()).filter(Boolean))
      .forEach(c => charSceneCount.set(c, (charSceneCount.get(c) ?? 0) + 1));
  });

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>

      {/* Top — Versions bar */}
      <div style={{ flexShrink:0, borderBottom:'1px solid var(--border)', padding:'8px 14px', display:'flex', alignItems:'center', gap:8, background:'var(--surface)', overflowX:'auto' }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', flexShrink:0 }}>Version :</span>
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          {versions.map((v, i) => {
            const isActive = v.id === activeVersionId;
            const isEditing = editingVersionId === v.id;
            return (
              <div key={v.id} style={{ display:'flex', alignItems:'center', gap:3 }}>
                {isEditing ? (
                  <input
                    autoFocus
                    value={editingVersionLabel}
                    onChange={e => setEditingVersionLabel(e.target.value)}
                    onBlur={() => {
                      setVersions(prev => prev.map(vv => vv.id === v.id ? { ...vv, label: editingVersionLabel || vv.label } : vv));
                      setEditingVersionId(null);
                      onEdit?.();
                    }}
                    onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') (e.target as HTMLInputElement).blur(); }}
                    onClick={e => e.stopPropagation()}
                    style={{ width:100, background:'var(--surface-3)', border:'1px solid var(--border-2)', borderRadius:6, padding:'2px 7px', fontSize:11, color:'var(--text)', outline:'none', fontFamily:'var(--ff-text)' }}
                  />
                ) : (
                  <button
                    onClick={() => !isActive && switchVersion(v.id)}
                    onDoubleClick={() => isActive && (setEditingVersionId(v.id), setEditingVersionLabel(v.label))}
                    title={isActive ? 'Double-cliquer pour renommer' : 'Activer cette version'}
                    style={{ padding:'3px 10px', borderRadius:6, border:`1px solid ${isActive ? 'var(--accent)' : 'var(--border)'}`, background: isActive ? 'rgba(249,255,0,0.07)' : 'transparent', color: isActive ? 'var(--accent)' : 'var(--text-3)', fontFamily:'var(--ff-mono)', fontSize:10, cursor: isActive ? 'default' : 'pointer', fontWeight: isActive ? 700 : 400 }}
                  >
                    V{i + 1} · {v.label}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={createVersion}
          style={{ display:'flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:6, border:'1px dashed var(--border-2)', background:'transparent', color:'var(--text-3)', fontSize:11, cursor:'pointer', fontFamily:'var(--ff-text)', flexShrink:0 }}
        >
          <SFIcon name="plus" size={11} />Nouvelle version
        </button>
      </div>

      {/* Content row */}
      <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

      {/* Left — Structure panel */}
      <div style={{ width:240, flexShrink:0, display:'flex', flexDirection:'column', borderRight:'1px solid var(--border)', overflow:'hidden' }}>
        {/* Tab bar */}
        <div style={{ display:'flex', borderBottom:'1px solid var(--border)', flexShrink:0 }}>
          {(['scenes','analyse'] as const).map(t => (
            <button key={t} onClick={() => setPanelTab(t)} style={{ flex:1, padding:'9px 0', border:'none', background:'transparent', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.07em', color: panelTab===t ? 'var(--text)' : 'var(--text-3)', borderBottom: panelTab===t ? '2px solid var(--accent)' : '2px solid transparent', marginBottom:-1 }}>
              {t === 'scenes' ? 'Scènes' : 'Analyse'}
            </button>
          ))}
        </div>

        {panelTab === 'scenes' && (
          <div style={{ flex:1, overflow:'auto', padding:'10px 10px' }}>
            {scenes.length === 0 && (
              <p style={{ fontSize:11, color:'var(--text-3)', padding:'8px 4px' }}>Aucune scène</p>
            )}
            {scenes.map((scene, i) => {
              const sceneIdx = elements.indexOf(scene);
              const nextSceneIdx = elements.findIndex((e, idx) => idx > sceneIdx && e.type === 'scene');
              const sceneEls = elements.slice(sceneIdx + 1, nextSceneIdx === -1 ? undefined : nextSceneIdx);
              const charSet = new Set(sceneEls.filter(e => e.type === 'character').map(e => e.text.trim()).filter(Boolean));
              const dialogueCount = sceneEls.filter(e => e.type === 'dialogue').length;
              return (
                <div key={scene.id} style={{ marginBottom:6 }}>
                  <button
                    onClick={() => scrollToScene(scene.id)}
                    style={{ width:'100%', textAlign:'left', background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 9px', cursor:'pointer', display:'block' }}
                  >
                    <div style={{ display:'flex', alignItems:'center', gap:5, marginBottom:3 }}>
                      <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--accent)', fontWeight:700 }}>S{i + 1}</span>
                      <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color: scene.text.startsWith('INT') ? '#7dd3fc' : '#86efac', background: scene.text.startsWith('INT') ? '#7dd3fc18' : '#86efac18', borderRadius:4, padding:'1px 5px', textTransform:'uppercase' }}>
                        {scene.text.startsWith('INT') ? 'INT' : scene.text.startsWith('EXT') ? 'EXT' : '—'}
                      </span>
                      {dialogueCount > 0 && <span style={{ fontFamily:'var(--ff-mono)', fontSize:7, color:'var(--text-3)' }}>{dialogueCount}R</span>}
                    </div>
                    <p style={{ fontSize:10, color:'var(--text-2)', lineHeight:1.3, wordBreak:'break-word', marginBottom: charSet.size ? 5 : 0 }}>
                      {scene.text || '—'}
                    </p>
                    {charSet.size > 0 && (
                      <div style={{ display:'flex', flexWrap:'wrap', gap:3 }}>
                        {[...charSet].map(c => (
                          <span key={c} style={{ fontFamily:'var(--ff-mono)', fontSize:7, color:'var(--text-3)', background:'var(--surface-3)', borderRadius:4, padding:'1px 5px' }}>{c}</span>
                        ))}
                      </div>
                    )}
                  </button>
                </div>
              );
            })}
          </div>
        )}

        {panelTab === 'analyse' && (
          <div style={{ flex:1, overflow:'auto', padding:'12px 12px' }}>
            {/* Stats grid */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
              {[
                { label:'Scènes',       val: scenes.length },
                { label:'Personnages',  val: allCharacters.length },
                { label:'Lieux',        val: allLocations.length },
                { label:'Mots',         val: wordCount },
                { label:'Signes',       val: signCount.toLocaleString('fr') },
                { label:'Pages est.',   val: `~${pageCount}p` },
              ].map(s => (
                <div key={s.label} style={{ background:'var(--surface-2)', border:'1px solid var(--border)', borderRadius:8, padding:'7px 9px' }}>
                  <p style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:2 }}>{s.label}</p>
                  <p style={{ fontFamily:'var(--ff-mono)', fontSize:13, color:'var(--text)', fontWeight:700 }}>{s.val}</p>
                </div>
              ))}
            </div>

            {/* Characters */}
            {allCharacters.length > 0 && (
              <div style={{ marginBottom:14 }}>
                <p style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Personnages</p>
                {allCharacters.map(c => (
                  <div key={c} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'5px 8px', borderRadius:7, marginBottom:3, background:'var(--surface-2)', border:'1px solid var(--border)' }}>
                    <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'#7dd3fc' }}>{c}</span>
                    <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)' }}>{charSceneCount.get(c) ?? 0}s</span>
                  </div>
                ))}
              </div>
            )}

            {/* Locations */}
            {allLocations.length > 0 && (
              <div>
                <p style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:6 }}>Lieux</p>
                {allLocations.map(loc => (
                  <div key={loc} style={{ padding:'5px 8px', borderRadius:7, marginBottom:3, background:'var(--surface-2)', border:'1px solid var(--border)' }}>
                    <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'#86efac' }}>{loc}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Center — Editor */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding:'8px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:8, background:'var(--surface)', flexShrink:0 }}>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
            Tab = type · Enter = nouvel élément · Shift+Enter = saut de ligne
          </span>
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>{wordCount} mots · {pageCount}p.</span>
            <SaveIndicator state={saveState} online={online} />
          </div>
        </div>

        {/* Script body */}
        <div ref={scrollRef} style={{ flex:1, overflow:'auto', padding:'32px 0', background:'var(--bg)' }}>
          <div style={{ maxWidth:780, margin:'0 auto', padding:'0 40px' }}>
            {(() => {
              // Group elements into scene blocks: [{sceneEl, bodyEls}]
              type SGroup = { sceneEl: ScriptEl | null; bodyEls: ScriptEl[] };
              const groups: SGroup[] = [];
              let buf: ScriptEl[] = [];
              let curScene: ScriptEl | null = null;
              for (const el of elements) {
                if (el.type === 'scene') {
                  groups.push({ sceneEl: curScene, bodyEls: buf });
                  buf = []; curScene = el;
                } else { buf.push(el); }
              }
              groups.push({ sceneEl: curScene, bodyEls: buf });

              const renderEl = (el: ScriptEl) => {
                const idx = elements.indexOf(el);
                const cfg = EL_CFG[el.type];
                return (
                  <div
                    key={el.id}
                    ref={div => { if (div) elRowRefs.current.set(el.id, div); else elRowRefs.current.delete(el.id); }}
                    style={{ display:'flex', alignItems:'flex-start', gap:0, marginBottom:4, position:'relative' }}
                  >
                    <div style={{ width:62, flexShrink:0, paddingTop:3 }}>
                      <button
                        onClick={() => setOpenTypeId(openTypeId === el.id ? null : el.id)}
                        style={{ padding:'2px 6px', borderRadius:5, border:`1px solid ${cfg.color}33`, background:`${cfg.color}11`, color:cfg.color, fontFamily:'var(--ff-mono)', fontSize:8, textTransform:'uppercase', letterSpacing:'0.06em', cursor:'pointer', whiteSpace:'nowrap' }}
                      >
                        {cfg.abbr}
                      </button>
                      {openTypeId === el.id && (
                        <div style={{ position:'absolute', left:0, top:22, zIndex:50, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:10, padding:4, minWidth:130, boxShadow:'0 8px 24px rgba(0,0,0,0.4)' }}>
                          {EL_ORDER.map(t => (
                            <button key={t} onClick={() => { setElements(p => p.map((e,i) => i===idx ? {...e,type:t} : e)); setOpenTypeId(null); }}
                              style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 10px', border:'none', background:'transparent', cursor:'pointer', borderRadius:7, textAlign:'left' }}
                              onMouseEnter={e => (e.currentTarget.style.background='var(--surface)')}
                              onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                            >
                              <span style={{ width:28, fontFamily:'var(--ff-mono)', fontSize:8, color:EL_CFG[t].color, textTransform:'uppercase' }}>{EL_CFG[t].abbr}</span>
                              <span style={{ fontSize:12, color:'var(--text-2)' }}>{EL_CFG[t].label}</span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                    <div style={{ flex:1 }}>
                      <textarea
                        ref={ta => { if (ta) taRefs.current.set(el.id, ta); else taRefs.current.delete(el.id); }}
                        value={el.text}
                        onChange={e => changeEl(el.id, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, idx)}
                        placeholder={cfg.placeholder}
                        rows={1}
                        style={{
                          display:'block', resize:'none', overflow:'hidden', outline:'none', border:'none', background:'transparent',
                          fontFamily:'"IBM Plex Mono", monospace', fontSize:13, lineHeight:1.8, color:'var(--text)',
                          textTransform: cfg.upper ? 'uppercase' : 'none',
                          fontStyle: cfg.italic ? 'italic' : 'normal',
                          fontWeight: el.type === 'character' ? 700 : 400,
                          textAlign: cfg.right ? 'right' : 'left',
                          marginLeft: cfg.ml, width: cfg.w,
                          boxSizing:'border-box', colorScheme:'dark',
                        }}
                      />
                    </div>
                  </div>
                );
              };

              return groups.map((group, gi) => {
                if (!group.sceneEl) {
                  // Pre-scene elements
                  return <React.Fragment key="pre">{group.bodyEls.map(renderEl)}</React.Fragment>;
                }
                const sceneEl = group.sceneEl;
                const sceneNum = sceneNumberById.get(sceneEl.id);
                const collapsed = collapsedScenes.has(sceneEl.id);
                const isDragOver = dragOverScene === sceneEl.id;
                return (
                  <div
                    key={sceneEl.id}
                    draggable
                    onDragStart={() => { dragSceneRef.current = sceneEl.id; }}
                    onDragEnd={() => { dragSceneRef.current = null; setDragOverScene(null); }}
                    onDragOver={e => { e.preventDefault(); setDragOverScene(sceneEl.id); }}
                    onDrop={e => {
                      e.preventDefault();
                      if (dragSceneRef.current) reorderScene(dragSceneRef.current, sceneEl.id);
                      dragSceneRef.current = null;
                      setDragOverScene(null);
                    }}
                    ref={div => { if (div) elRowRefs.current.set(sceneEl.id, div); else elRowRefs.current.delete(sceneEl.id); }}
                    style={{ marginBottom: gi < groups.length - 1 ? 28 : 4, borderLeft: isDragOver ? '2px solid var(--accent)' : '2px solid transparent', paddingLeft: isDragOver ? 6 : 6, transition:'border-color .15s', cursor:'grab' }}
                  >
                    {/* Scene heading row */}
                    <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:collapsed ? 0 : 8, paddingBottom:6, borderBottom:'1px solid var(--border)' }}>
                      <button
                        onClick={() => setCollapsedScenes(prev => { const s = new Set(prev); s.has(sceneEl.id) ? s.delete(sceneEl.id) : s.add(sceneEl.id); return s; })}
                        style={{ background:'transparent', border:'none', cursor:'pointer', color:'var(--text-3)', padding:'2px 4px', borderRadius:4, fontSize:11, lineHeight:1, flexShrink:0 }}
                        title={collapsed ? 'Développer' : 'Réduire'}
                      >
                        {collapsed ? '▶' : '▼'}
                      </button>
                      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, fontWeight:700, color:'var(--accent)', letterSpacing:'0.08em', textTransform:'uppercase', flexShrink:0 }}>
                        Scène {sceneNum}
                      </span>
                      <textarea
                        ref={ta => { if (ta) taRefs.current.set(sceneEl.id, ta); else taRefs.current.delete(sceneEl.id); }}
                        value={sceneEl.text}
                        onChange={e => changeEl(sceneEl.id, e.target.value)}
                        onKeyDown={e => handleKeyDown(e, elements.indexOf(sceneEl))}
                        placeholder={EL_CFG['scene'].placeholder}
                        rows={1}
                        style={{
                          flex:1, resize:'none', overflow:'hidden', outline:'none', border:'none', background:'transparent',
                          fontFamily:'"IBM Plex Mono", monospace', fontSize:13, lineHeight:1.8, color:'var(--text)',
                          fontWeight:700, textTransform:'uppercase', boxSizing:'border-box', colorScheme:'dark',
                        }}
                      />
                      {collapsed && group.bodyEls.length > 0 && (
                        <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', flexShrink:0 }}>{group.bodyEls.length} élément{group.bodyEls.length > 1 ? 's' : ''}</span>
                      )}
                    </div>
                    {/* Scene body elements */}
                    {!collapsed && group.bodyEls.map(renderEl)}
                  </div>
                );
              });
            })()}

            {/* Add element button */}
            <div style={{ display:'flex', alignItems:'center', gap:8, marginTop:24, paddingTop:16, borderTop:'1px dashed var(--border)' }}>
              {EL_ORDER.map(t => (
                <button key={t} onClick={() => {
                  const nid = `e${Date.now()}`;
                  setElements(p => [...p, { id:nid, type:t, text:'' }]);
                  setFocusId(nid);
                }}
                  style={{ padding:'4px 10px', borderRadius:7, border:`1px solid ${EL_CFG[t].color}44`, background:`${EL_CFG[t].color}0d`, color:EL_CFG[t].color, fontFamily:'var(--ff-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.05em', cursor:'pointer' }}
                >
                  + {EL_CFG[t].abbr}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Right — Comments sidebar */}
      <ScriptCommentSidebar resourceId={resource.id} />

      </div>{/* end content row */}
    </div>
  );
}

// ── Moodboard View (PureRef-style canvas) ─────────────────────────────────────

const POSTIT_COLORS = ['#fde68a','#fca5a5','#86efac','#93c5fd','#f9a8d4','#fdba74'];
const SHAPE_COLORS  = ['#3b82f6','#ef4444','#22c55e','#f59e0b','#a855f7','#64748b'];

export function MoodboardView({ resource }: { resource: Resource }) {
  const [items, setItems]           = useState<MBItem[]>(INITIAL_MB_ITEMS);
  const [arrows, setArrows]         = useState<MBArrow[]>(INITIAL_MB_ARROWS);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedArrow, setSelectedArrow] = useState<string | null>(null);
  const [editingId, setEditingId]   = useState<string | null>(null);
  const [pan, setPan]               = useState({ x: 60, y: 40 });
  const [zoom, setZoom]             = useState(1);
  const [tool, setTool]             = useState<MBTool>('pan');
  const [arrowStart, setArrowStart] = useState<string | null>(null);
  const [showAddImg, setShowAddImg] = useState(false);
  const [imgUrl, setImgUrl]         = useState('');
  const [postitColor, setPostitColor] = useState(POSTIT_COLORS[0]);
  const [shapeColor, setShapeColor]   = useState(SHAPE_COLORS[0]);

  const [arrowPreviewPos, setArrowPreviewPos] = useState<{x:number,y:number}|null>(null);
  const [shapePreview, setShapePreview]       = useState<{x:number,y:number,w:number,h:number}|null>(null);

  const canvasRef        = useRef<HTMLDivElement>(null);
  const dragState        = useRef<DragState | null>(null);
  const spaceHeld        = useRef(false);
  const zoomRef          = useRef(zoom);
  const panRef           = useRef(pan);
  const didDrag          = useRef(false);
  const arrowStartRef    = useRef<string | null>(null);
  const shapePreviewRef  = useRef<{x:number,y:number,w:number,h:number}|null>(null);
  const shapeColorRef    = useRef(shapeColor);

  useEffect(() => { zoomRef.current = zoom; }, [zoom]);
  useEffect(() => { panRef.current = pan; }, [pan]);
  useEffect(() => { shapeColorRef.current = shapeColor; }, [shapeColor]);

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      const inInput = target?.matches('input,textarea,[contenteditable]');
      if (e.code === 'Space' && !inInput) { spaceHeld.current = true; e.preventDefault(); }
      if ((e.code === 'Delete' || e.code === 'Backspace') && !inInput) {
        if (selectedId && !editingId) {
          setItems(p => p.filter(i => i.id !== selectedId));
          setArrows(p => p.filter(a => a.from !== selectedId && a.to !== selectedId));
          setSelectedId(null);
        }
        if (selectedArrow) {
          setArrows(p => p.filter(a => a.id !== selectedArrow));
          setSelectedArrow(null);
        }
      }
      if (e.code === 'Escape') {
        arrowStartRef.current = null; setArrowStart(null); setArrowPreviewPos(null);
        setEditingId(null);
      }
      if (!inInput && !e.ctrlKey && !e.metaKey && !e.altKey) {
        if (e.key === 'h' || e.key === 'H') { setTool('pan'); arrowStartRef.current = null; setArrowStart(null); setArrowPreviewPos(null); }
        if (e.key === 'v' || e.key === 'V') { setTool('select'); arrowStartRef.current = null; setArrowStart(null); setArrowPreviewPos(null); }
        if (e.key === 'a' || e.key === 'A') { setTool('arrow'); arrowStartRef.current = null; setArrowStart(null); setArrowPreviewPos(null); }
        if (e.key === 'r' || e.key === 'R') { setTool('rect'); arrowStartRef.current = null; setArrowStart(null); setArrowPreviewPos(null); }
        if (e.key === 'e' || e.key === 'E') { setTool('ellipse'); arrowStartRef.current = null; setArrowStart(null); setArrowPreviewPos(null); }
      }
    };
    const onUp = (e: KeyboardEvent) => { if (e.code === 'Space') spaceHeld.current = false; };
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    return () => { window.removeEventListener('keydown', onDown); window.removeEventListener('keyup', onUp); };
  }, [selectedId, selectedArrow, editingId]);

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      // Arrow preview
      if (arrowStartRef.current && canvasRef.current) {
        const rect = canvasRef.current.getBoundingClientRect();
        setArrowPreviewPos({
          x: (e.clientX - rect.left - panRef.current.x) / zoomRef.current,
          y: (e.clientY - rect.top  - panRef.current.y) / zoomRef.current,
        });
      }
      if (!dragState.current) return;
      const dx = e.clientX - dragState.current.startX;
      const dy = e.clientY - dragState.current.startY;
      if (Math.abs(dx) > 2 || Math.abs(dy) > 2) didDrag.current = true;
      if (dragState.current.type === 'pan') {
        setPan({ x: dragState.current.startPan.x + dx, y: dragState.current.startPan.y + dy });
      } else if (dragState.current.type === 'item') {
        const ds = dragState.current;
        setItems(p => p.map(it => it.id === ds.itemId ? { ...it, x: ds.startItemX + dx / zoomRef.current, y: ds.startItemY + dy / zoomRef.current } : it));
      } else if (dragState.current.type === 'resize') {
        const ds = dragState.current;
        setItems(p => p.map(it => it.id === ds.itemId ? { ...it, w: Math.max(80, ds.startW + dx / zoomRef.current), h: Math.max(50, ds.startH + dy / zoomRef.current) } : it));
      } else if (dragState.current.type === 'shape') {
        const ds = dragState.current;
        const cx = dx / zoomRef.current;
        const cy = dy / zoomRef.current;
        const preview = {
          x: Math.min(ds.startCX, ds.startCX + cx),
          y: Math.min(ds.startCY, ds.startCY + cy),
          w: Math.max(Math.abs(cx), 4),
          h: Math.max(Math.abs(cy), 4),
        };
        shapePreviewRef.current = preview;
        setShapePreview(preview);
      }
    };
    const onUp = () => {
      if (dragState.current?.type === 'shape') {
        const sp = shapePreviewRef.current;
        if (sp && sp.w > 10 && sp.h > 10) {
          const id = `mb${Date.now()}`;
          const st = (dragState.current as { type:'shape'; shapeType:'rect'|'ellipse' }).shapeType;
          setItems(p => [...p, { id, type:'shape', x:sp.x, y:sp.y, w:sp.w, h:sp.h, shapeType:st, shapeColor:shapeColorRef.current }]);
        }
        shapePreviewRef.current = null;
        setShapePreview(null);
      }
      // Cancel arrow if mouseup on canvas (not on an item)
      if (arrowStartRef.current) {
        arrowStartRef.current = null;
        setArrowStart(null);
        setArrowPreviewPos(null);
      }
      dragState.current = null;
    };
    document.addEventListener('mousemove', onMove);
    document.addEventListener('mouseup', onUp);
    return () => { document.removeEventListener('mousemove', onMove); document.removeEventListener('mouseup', onUp); };
  }, []);

  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const imgItem = Array.from(e.clipboardData?.items ?? []).find(i => i.type.startsWith('image/'));
      if (imgItem) {
        const blob = imgItem.getAsFile();
        if (blob) {
          const url = URL.createObjectURL(blob);
          setItems(p => [...p, { id:`mb${Date.now()}`, type:'image', x:200+Math.random()*100, y:200+Math.random()*100, w:260, h:190, imageUrl:url }]);
        }
      }
    };
    window.addEventListener('paste', handlePaste);
    return () => window.removeEventListener('paste', handlePaste);
  }, []);

  const canvasCoords = (e: React.MouseEvent) => {
    const rect = canvasRef.current!.getBoundingClientRect();
    return {
      x: (e.clientX - rect.left - panRef.current.x) / zoomRef.current,
      y: (e.clientY - rect.top  - panRef.current.y) / zoomRef.current,
    };
  };

  const handleCanvasMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    didDrag.current = false;
    if (spaceHeld.current || tool === 'pan') {
      dragState.current = { type:'pan', startX:e.clientX, startY:e.clientY, startPan:{...panRef.current} };
      e.preventDefault();
    } else if (tool === 'select' || tool === 'arrow') {
      setSelectedId(null); setSelectedArrow(null); setEditingId(null);
    } else if (tool === 'rect' || tool === 'ellipse') {
      const { x, y } = canvasCoords(e);
      dragState.current = { type:'shape', startX:e.clientX, startY:e.clientY, startCX:x, startCY:y, shapeType:tool };
      e.preventDefault();
    }
  };

  const handleCanvasClick = (e: React.MouseEvent) => {
    if (didDrag.current) return;
    if ((e.target as HTMLElement) !== canvasRef.current) return;
    if (tool === 'arrow') { setArrowStart(null); return; }
  };

  const handleCanvasDblClick = (e: React.MouseEvent) => {
    if ((e.target as HTMLElement) !== canvasRef.current) return;
    const { x, y } = canvasCoords(e);
    const id = `mb${Date.now()}`;
    if (tool === 'pan' || tool === 'select') {
      setItems(p => [...p, { id, type:'text', x, y, w:200, h:90, text:'' }]);
      setEditingId(id); setSelectedId(id);
    }
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const rect = canvasRef.current!.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const factor = e.deltaY > 0 ? 0.92 : 1.08;
    const oldZoom = zoomRef.current;
    const newZoom = Math.min(5, Math.max(0.15, oldZoom * factor));
    const ratio = newZoom / oldZoom;
    setPan(p => ({ x: mouseX - (mouseX - p.x) * ratio, y: mouseY - (mouseY - p.y) * ratio }));
    setZoom(newZoom);
  };

  const handleItemMouseDown = (e: React.MouseEvent, item: MBItem) => {
    e.stopPropagation();
    didDrag.current = false;
    setSelectedArrow(null);

    if (spaceHeld.current || tool === 'pan') {
      // In pan mode, items are also draggable (holding space or pan tool)
      dragState.current = { type:'pan', startX:e.clientX, startY:e.clientY, startPan:{...panRef.current} };
      return;
    }
    if (tool === 'arrow') {
      if (!arrowStartRef.current) {
        arrowStartRef.current = item.id;
        setArrowStart(item.id);
        setSelectedId(item.id);
      }
      return;
    }
    // select mode — drag item
    setSelectedId(item.id); setEditingId(null);
    dragState.current = { type:'item', startX:e.clientX, startY:e.clientY, itemId:item.id, startItemX:item.x, startItemY:item.y };
  };

  const addAtCenter = (partial: Omit<MBItem, 'id' | 'x' | 'y'>) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    const cx = rect ? (rect.width  / 2 - panRef.current.x) / zoomRef.current : 300;
    const cy = rect ? (rect.height / 2 - panRef.current.y) / zoomRef.current : 200;
    const id = `mb${Date.now()}`;
    const item: MBItem = { id, x: cx - (partial.w ?? 160) / 2 + (Math.random()-0.5)*60, y: cy - (partial.h ?? 100) / 2 + (Math.random()-0.5)*60, ...partial };
    setItems(p => [...p, item]);
    return id;
  };

  const addImage = () => {
    if (!imgUrl.trim()) return;
    addAtCenter({ type:'image', w:260, h:190, imageUrl:imgUrl.trim() });
    setImgUrl(''); setShowAddImg(false);
  };

  const PALETTE = ['#1a2035','#2d1a0e','#0e1a0e','#3d3042','#f5e6d3','#e8d5c4'];

  // Arrow hit-test: distance from point to line segment
  const pointToSegDist = (px: number, py: number, x1: number, y1: number, x2: number, y2: number) => {
    const dx = x2 - x1, dy = y2 - y1;
    const len2 = dx*dx + dy*dy;
    if (len2 === 0) return Math.hypot(px-x1, py-y1);
    const t = Math.max(0, Math.min(1, ((px-x1)*dx + (py-y1)*dy) / len2));
    return Math.hypot(px - (x1+t*dx), py - (y1+t*dy));
  };

  const handleArrowSvgClick = (e: React.MouseEvent<SVGSVGElement>) => {
    if (tool !== 'select') return;
    const rect = (e.currentTarget as SVGSVGElement).getBoundingClientRect();
    const px = (e.clientX - rect.left) / zoomRef.current;
    const py = (e.clientY - rect.top)  / zoomRef.current;
    for (const arrow of arrows) {
      const f = items.find(i=>i.id===arrow.from), t = items.find(i=>i.id===arrow.to);
      if (!f || !t) continue;
      if (pointToSegDist(px, py, f.x+f.w/2, f.y+f.h/2, t.x+t.w/2, t.y+t.h/2) < 8 / zoomRef.current) {
        setSelectedArrow(arrow.id); setSelectedId(null);
        e.stopPropagation();
        return;
      }
    }
  };

  const toolBtn = (t: MBTool, icon: string, label: string, shortcut: string) => (
    <button key={t} title={`${label} (${shortcut})`} onClick={() => { setTool(t); arrowStartRef.current = null; setArrowStart(null); setArrowPreviewPos(null); }}
      style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${tool===t ? 'var(--accent)' : 'var(--border)'}`, background: tool===t ? 'rgba(249,255,0,0.08)' : 'var(--surface-2)', color: tool===t ? 'var(--accent)' : 'var(--text-2)', cursor:'pointer', display:'flex', gap:5, alignItems:'center' }}>
      <SFIcon name={icon} size={13} />
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</span>
      <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, opacity:0.55, background:'rgba(255,255,255,0.07)', border:'1px solid rgba(255,255,255,0.13)', borderRadius:3, padding:'1px 4px', lineHeight:1.4 }}>{shortcut}</span>
    </button>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', position:'relative' }}>
      {/* Toolbar */}
      <div style={{ padding:'7px 14px', borderBottom:'1px solid var(--border)', display:'flex', gap:6, alignItems:'center', background:'var(--surface)', flexShrink:0, flexWrap:'wrap' }}>

        {/* Tools */}
        {toolBtn('pan',     'hand',          'Déplacer',  'H')}
        {toolBtn('select',  'mouse-pointer', 'Sélection', 'V')}
        {toolBtn('arrow',   'arrow-right',   'Flèche',    'A')}

        <div style={{ width:1, height:20, background:'var(--border)', margin:'0 2px' }} />

        {/* Shapes as tool modes */}
        {toolBtn('rect',    'square',        'Rect',      'R')}
        {toolBtn('ellipse', 'circle',        'Cercle',    'E')}
        {/* Shape color picker */}
        <div style={{ display:'flex', gap:3, alignItems:'center' }}>
          {SHAPE_COLORS.map(c => (
            <div key={c} onClick={() => setShapeColor(c)}
              style={{ width:14, height:14, borderRadius:3, background:c, border: shapeColor===c ? '2px solid white' : '1px solid rgba(255,255,255,0.2)', cursor:'pointer', flexShrink:0 }} />
          ))}
        </div>

        <div style={{ width:1, height:20, background:'var(--border)', margin:'0 2px' }} />

        {/* Post-it */}
        <button title="Post-it" onClick={() => { const id = addAtCenter({ type:'postit', postitColor, w:180, h:150, text:'' }); setEditingId(id); setSelectedId(id); }}
          style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor:'pointer', display:'flex', gap:5, alignItems:'center' }}>
          <SFIcon name="sticky-note" size={13} />
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.05em' }}>Post-it</span>
        </button>
        {POSTIT_COLORS.map(c => (
          <div key={c} onClick={() => setPostitColor(c)}
            style={{ width:14, height:14, borderRadius:3, background:c, border: postitColor===c ? '2px solid white' : '1px solid rgba(255,255,255,0.2)', cursor:'pointer', flexShrink:0 }} />
        ))}

        <div style={{ width:1, height:20, background:'var(--border)', margin:'0 2px' }} />

        {/* Text & Image */}
        <button onClick={() => { const id=addAtCenter({type:'text',w:200,h:90,text:''}); setEditingId(id); setSelectedId(id); }}
          style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor:'pointer', display:'flex', gap:5, alignItems:'center' }}>
          <SFIcon name="type" size={13} />
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.05em' }}>Texte</span>
        </button>
        <button onClick={() => setShowAddImg(true)}
          style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor:'pointer', display:'flex', gap:5, alignItems:'center' }}>
          <SFIcon name="image-plus" size={13} />
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, textTransform:'uppercase', letterSpacing:'0.05em' }}>Image</span>
        </button>
        {/* Colour swatches */}
        <div style={{ display:'flex', gap:3, alignItems:'center' }}>
          {PALETTE.map(c => (
            <div key={c} onClick={() => addAtCenter({type:'color',w:160,h:110,bg:c})}
              style={{ width:14, height:14, borderRadius:3, background:c, border:'1px solid rgba(255,255,255,0.15)', cursor:'pointer', flexShrink:0 }} />
          ))}
        </div>

        {/* Zoom */}
        <div style={{ marginLeft:'auto', display:'flex', gap:5, alignItems:'center' }}>
          <button onClick={() => setZoom(z=>Math.max(0.15,z*0.8))} style={{ padding:'4px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor:'pointer' }}><SFIcon name="zoom-out" size={12} /></button>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:34, textAlign:'center' }}>{Math.round(zoom*100)}%</span>
          <button onClick={() => setZoom(z=>Math.min(5,z*1.25))} style={{ padding:'4px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor:'pointer' }}><SFIcon name="zoom-in" size={12} /></button>
          <button onClick={() => { setPan({x:60,y:40}); setZoom(1); }} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-3)', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:9 }}>Reset</button>
        </div>

        {arrowStart && (
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'#60a5fa', background:'rgba(96,165,250,0.1)', padding:'4px 10px', borderRadius:6, border:'1px solid rgba(96,165,250,0.3)' }}>
            Cliquer l'élément cible · ESC pour annuler
          </span>
        )}
      </div>

      {/* Canvas */}
      <div ref={canvasRef}
        onMouseDown={handleCanvasMouseDown}
        onClick={handleCanvasClick}
        onDoubleClick={handleCanvasDblClick}
        onWheel={handleWheel}
        style={{ flex:1, position:'relative', overflow:'hidden', background:'repeating-linear-gradient(0deg,transparent,transparent 39px,var(--border) 40px),repeating-linear-gradient(90deg,transparent,transparent 39px,var(--border) 40px)', backgroundSize:'40px 40px', cursor: (tool==='pan'||spaceHeld.current) ? 'grab' : (tool==='arrow'||tool==='rect'||tool==='ellipse') ? 'crosshair' : 'default' }}
      >
        <div style={{ position:'absolute', left:0, top:0, transform:`translate(${pan.x}px,${pan.y}px) scale(${zoom})`, transformOrigin:'0 0' }}>

          {/* Arrow SVG — rendered below items */}
          <svg
            onClick={handleArrowSvgClick}
            style={{ position:'absolute', width:10000, height:10000, top:0, left:0, pointerEvents: tool==='select' ? 'all' : 'none', overflow:'visible', zIndex:0 }}>
            <defs>
              <marker id="arrowhead-mb" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="#60a5fa" />
              </marker>
              <marker id="arrowhead-mb-sel" markerWidth="8" markerHeight="6" refX="7" refY="3" orient="auto">
                <polygon points="0 0, 8 3, 0 6" fill="var(--accent)" />
              </marker>
            </defs>
            {arrows.map(arrow => {
              const f = items.find(i=>i.id===arrow.from), t = items.find(i=>i.id===arrow.to);
              if (!f || !t) return null;
              const isSel = selectedArrow === arrow.id;
              // midpoint for hit area
              const mx = (f.x+f.w/2 + t.x+t.w/2) / 2;
              const my = (f.y+f.h/2 + t.y+t.h/2) / 2;
              return (
                <g key={arrow.id}>
                  {/* invisible thick hit area */}
                  <line x1={f.x+f.w/2} y1={f.y+f.h/2} x2={t.x+t.w/2} y2={t.y+t.h/2}
                    stroke="transparent" strokeWidth={16} style={{ cursor:'pointer' }} />
                  <line
                    x1={f.x+f.w/2} y1={f.y+f.h/2}
                    x2={t.x+t.w/2} y2={t.y+t.h/2}
                    stroke={isSel ? 'var(--accent)' : '#60a5fa'}
                    strokeWidth={isSel ? 2.5 : 1.8}
                    markerEnd={isSel ? 'url(#arrowhead-mb-sel)' : 'url(#arrowhead-mb)'}
                    strokeDasharray={isSel ? undefined : '6 4'}
                    opacity={0.85}
                  />
                  {/* delete button on selected arrow */}
                  {isSel && (
                    <g onClick={e => { e.stopPropagation(); setArrows(p=>p.filter(a=>a.id!==arrow.id)); setSelectedArrow(null); }} style={{ cursor:'pointer' }}>
                      <circle cx={mx} cy={my} r={9} fill="var(--danger)" opacity={0.9} />
                      <text x={mx} y={my} textAnchor="middle" dominantBaseline="central" fill="white" fontSize={11} fontWeight="bold">×</text>
                    </g>
                  )}
                </g>
              );
            })}
          {/* Arrow drag preview */}
          {arrowStart && arrowPreviewPos && (() => {
            const f = items.find(i => i.id === arrowStart);
            if (!f) return null;
            return <line x1={f.x+f.w/2} y1={f.y+f.h/2} x2={arrowPreviewPos.x} y2={arrowPreviewPos.y}
              stroke="#60a5fa" strokeWidth={2} strokeDasharray="6 4" opacity={0.8}
              markerEnd="url(#arrowhead-mb)" pointerEvents="none" />;
          })()}
          </svg>

          {/* Items */}
          {items.map(item => {
            const isSel = selectedId === item.id;
            const isEd  = editingId  === item.id;
            const isArrowSource = arrowStart === item.id;
            const isPostit = item.type === 'postit';
            const isShape  = item.type === 'shape';
            const textColor = isPostit ? '#1a1a1a' : 'var(--text)';

            return (
              <div key={item.id}
                onMouseDown={e => handleItemMouseDown(e, item)}
                onMouseUp={e => {
                  if (tool === 'arrow' && arrowStartRef.current && arrowStartRef.current !== item.id) {
                    e.stopPropagation();
                    setArrows(p => [...p, { id:`ar${Date.now()}`, from:arrowStartRef.current!, to:item.id }]);
                    arrowStartRef.current = null;
                    setArrowStart(null);
                    setArrowPreviewPos(null);
                  }
                }}
                onDoubleClick={e => {
                  e.stopPropagation();
                  if (item.type === 'text' || item.type === 'postit') { setEditingId(item.id); setSelectedId(item.id); }
                }}
                style={{
                  position:'absolute', left:item.x, top:item.y, width:item.w, height:item.h,
                  borderRadius: isShape && item.shapeType==='ellipse' ? '50%' : isPostit ? 4 : 8,
                  overflow: (item.type==='text') ? 'visible' : 'hidden',
                  border: isSel        ? '2px solid var(--accent)'
                        : isArrowSource ? '2px solid #60a5fa'
                        : item.type==='text' ? '1px dashed rgba(255,255,255,0.1)'
                        : isShape      ? `2px solid ${item.shapeColor ?? '#3b82f6'}`
                        : '1px solid transparent',
                  boxShadow: isSel  ? '0 0 0 3px rgba(249,255,0,0.12)'
                           : isPostit ? '2px 3px 8px rgba(0,0,0,0.35)'
                           : 'none',
                  background: isPostit ? (item.postitColor ?? POSTIT_COLORS[0])
                            : isShape  ? `${item.shapeColor ?? '#3b82f6'}22`
                            : undefined,
                  cursor: (tool==='pan'||spaceHeld.current) ? 'grab' : (tool==='arrow'||tool==='rect'||tool==='ellipse') ? 'crosshair' : 'move',
                  userSelect: 'none',
                  zIndex: isSel ? 10 : 1,
                }}
              >
                {item.type==='image' && item.imageUrl &&
                  <img src={item.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover', display:'block', pointerEvents:'none' }} />}

                {item.type==='color' &&
                  <div style={{ width:'100%', height:'100%', background:item.bg??'#1a2035' }} />}

                {item.type==='shape' && (
                  <div style={{ width:'100%', height:'100%', display:'flex', alignItems:'center', justifyContent:'center' }}>
                    {/* shape fill is via background, border handles stroke */}
                  </div>
                )}

                {(item.type==='text' || item.type==='postit') && (isEd
                  ? <textarea autoFocus value={item.text??''}
                      onChange={e => setItems(p => p.map(it => it.id===item.id ? {...it, text:e.target.value} : it))}
                      onBlur={() => setEditingId(null)}
                      onClick={e => e.stopPropagation()}
                      onMouseDown={e => e.stopPropagation()}
                      style={{ width:'100%', height:'100%', background:'transparent', border:'none', outline:'none', color:textColor, fontSize:13, fontFamily:'var(--ff-text)', padding:isPostit?10:6, resize:'none', lineHeight:1.55, boxSizing:'border-box', colorScheme: isPostit ? 'light' : 'dark' }}
                    />
                  : <div style={{ width:'100%', height:'100%', background:'transparent', padding:isPostit?10:6, fontSize:13, color:textColor, lineHeight:1.55, overflow:'hidden', whiteSpace:'pre-wrap' }}>
                      {item.text || (isSel && <span style={{ color: isPostit ? 'rgba(0,0,0,0.35)' : 'var(--text-3)', fontStyle:'italic', fontSize:11 }}>Double-clic pour éditer…</span>)}
                    </div>
                )}

                {/* Resize handle */}
                {isSel && (
                  <div onMouseDown={e => { e.stopPropagation(); dragState.current = { type:'resize', startX:e.clientX, startY:e.clientY, itemId:item.id, startW:item.w, startH:item.h }; }}
                    style={{ position:'absolute', bottom:-4, right:-4, width:12, height:12, background:'var(--accent)', borderRadius:2, cursor:'se-resize', zIndex:20 }}
                  />
                )}

                {/* Delete on selected */}
                {isSel && tool === 'select' && (
                  <button onMouseDown={e => e.stopPropagation()} onClick={e => { e.stopPropagation(); setItems(p=>p.filter(i=>i.id!==item.id)); setArrows(p=>p.filter(a=>a.from!==item.id&&a.to!==item.id)); setSelectedId(null); }}
                    style={{ position:'absolute', top:-10, right:-10, width:20, height:20, borderRadius:'50%', background:'var(--danger)', border:'none', color:'white', fontSize:12, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer', zIndex:20, lineHeight:1 }}>
                    ×
                  </button>
                )}
              </div>
            );
          })}
          {/* Shape draw preview */}
          {shapePreview && dragState.current?.type === 'shape' && (
            <div style={{
              position:'absolute', left:shapePreview.x, top:shapePreview.y, width:shapePreview.w, height:shapePreview.h,
              border:`2px dashed ${shapeColorRef.current}`, borderRadius: (dragState.current as {shapeType:string}).shapeType === 'ellipse' ? '50%' : 4,
              background:`${shapeColorRef.current}18`, pointerEvents:'none',
            }} />
          )}
        </div>
      </div>

      {/* Status bar */}
      <div style={{ padding:'5px 14px', borderTop:'1px solid var(--border)', background:'var(--surface)', display:'flex', gap:16, flexShrink:0 }}>
        {[['Déplacer','Pan par défaut · Espace+drag aussi'],['Double-clic','Créer un texte'],['Ctrl+V','Coller une image'],['Molette','Zoom vers curseur'],['Suppr','Effacer sélection']].map(([k,v])=>(
          <span key={k} style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}><span style={{ color:'var(--text-2)' }}>{k}</span> — {v}</span>
        ))}
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', marginLeft:'auto' }}>{items.length} éléments · {arrows.length} flèches</span>
      </div>

      {/* Add image modal */}
      {showAddImg && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:100 }}>
          <div style={{ background:'var(--surface)', borderRadius:14, padding:28, width:420, border:'1px solid var(--border)', boxShadow:'0 20px 60px rgba(0,0,0,0.5)' }}>
            <h3 style={{ fontSize:15, fontWeight:700, marginBottom:6 }}>Ajouter une image</h3>
            <p style={{ fontSize:12, color:'var(--text-3)', marginBottom:16 }}>Collez l'URL d'une image ou utilisez Ctrl+V depuis le presse-papier</p>
            <input value={imgUrl} onChange={e=>setImgUrl(e.target.value)} autoFocus
              onKeyDown={e=>{ if(e.key==='Enter') addImage(); if(e.key==='Escape') setShowAddImg(false); }}
              placeholder="https://example.com/image.jpg"
              style={{ width:'100%', padding:'10px 12px', borderRadius:9, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'var(--ff-text)', colorScheme:'dark' }}
            />
            <div style={{ display:'flex', gap:8, justifyContent:'flex-end', marginTop:16 }}>
              <SFButton variant="ghost" onClick={()=>setShowAddImg(false)}>Annuler</SFButton>
              <SFButton variant="primary" onClick={addImage}>Ajouter</SFButton>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── File View (Drive-style) ───────────────────────────────────────────────────

interface FsFolder { id: string; name: string; parentId: string | null; createdAt: string; }
interface FsFile   { id: string; name: string; size: string; type: string; folderId: string | null; createdAt: string; }

const INIT_FOLDERS: FsFolder[] = [
  { id:'fd1', name:'Tournage J1',       parentId:null,  createdAt:'8 mai' },
  { id:'fd2', name:'Post-production',   parentId:null,  createdAt:'10 mai' },
  { id:'fd3', name:'Rushes bruts',      parentId:'fd1', createdAt:'8 mai' },
  { id:'fd4', name:'Son',               parentId:'fd1', createdAt:'8 mai' },
  { id:'fd5', name:'Exports vidéo',     parentId:'fd2', createdAt:'11 mai' },
];
const INIT_FILES: FsFile[] = [
  { id:'fi1', name:'Brief créatif v2.pdf',      size:'2.4 Mo',  type:'application/pdf', folderId:null,  createdAt:'5 mai' },
  { id:'fi2', name:'Storyboard.png',             size:'4.1 Mo',  type:'image/png',       folderId:null,  createdAt:'6 mai' },
  { id:'fi3', name:'Shot001.mp4',                size:'342 Mo',  type:'video/mp4',       folderId:'fd3', createdAt:'8 mai' },
  { id:'fi4', name:'Shot002.mp4',                size:'289 Mo',  type:'video/mp4',       folderId:'fd3', createdAt:'8 mai' },
  { id:'fi5', name:'Ambiance_scene1.wav',        size:'18 Mo',   type:'audio/wav',       folderId:'fd4', createdAt:'8 mai' },
  { id:'fi6', name:'Contrat_studio.pdf',         size:'0.8 Mo',  type:'application/pdf', folderId:'fd2', createdAt:'10 mai' },
  { id:'fi7', name:'Sequence1_export_4K.mp4',   size:'1.2 Go',  type:'video/mp4',       folderId:'fd5', createdAt:'11 mai' },
];

function fmtSize(bytes: number) {
  if (bytes >= 1024*1024*1024) return `${(bytes/1024/1024/1024).toFixed(1)} Go`;
  if (bytes >= 1024*1024) return `${(bytes/1024/1024).toFixed(1)} Mo`;
  return `${Math.round(bytes/1024)} Ko`;
}

function fileIcon(mime: string): string {
  if (mime.startsWith('image/'))       return 'image';
  if (mime.startsWith('video/'))       return 'video';
  if (mime.startsWith('audio/'))       return 'music';
  if (mime.includes('pdf'))            return 'file-text';
  if (mime.includes('zip')||mime.includes('rar')) return 'archive';
  return 'file';
}

function fileColor(mime: string): string {
  if (mime.startsWith('image/'))       return '#7dd3fc';
  if (mime.startsWith('video/'))       return '#c4b5fd';
  if (mime.startsWith('audio/'))       return '#86efac';
  if (mime.includes('pdf'))            return 'var(--danger)';
  return 'var(--text-3)';
}

type SortKey = 'name' | 'date' | 'size';
type ViewMode = 'grid' | 'list';

export function FileView({ resource }: { resource: Resource }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [folders, setFolders] = useState<FsFolder[]>(INIT_FOLDERS);
  const [files,   setFiles]   = useState<FsFile[]>(INIT_FILES);

  // Navigation
  const [path,  setPath]  = useState<FsFolder[]>([]);   // breadcrumb stack
  const curId = path.length > 0 ? path[path.length-1].id : null;

  // UI state
  const [view,   setView]   = useState<ViewMode>('grid');
  const [sort,   setSort]   = useState<SortKey>('name');
  const [search, setSearch] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  // New folder dialog
  const [newFolderOpen, setNewFolderOpen] = useState(false);
  const [newFolderName, setNewFolderName] = useState('');
  const newFolderRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (newFolderOpen) setTimeout(() => newFolderRef.current?.focus(), 30); }, [newFolderOpen]);

  // Rename
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameVal,  setRenameVal]  = useState('');

  // Context menu
  const [ctx, setCtx] = useState<{ x: number; y: number; id: string; kind: 'folder'|'file' } | null>(null);
  useEffect(() => {
    if (!ctx) return;
    const close = () => setCtx(null);
    window.addEventListener('mousedown', close);
    return () => window.removeEventListener('mousedown', close);
  }, [ctx]);

  // Drag
  const dragItem = useRef<{ id: string; kind: 'folder'|'file' } | null>(null);
  const [dropTarget, setDropTarget] = useState<string | null>(null);

  // Current folder contents
  const curFolders = folders
    .filter(f => f.parentId === curId && f.name.toLowerCase().includes(search.toLowerCase()));
  const curFiles = files
    .filter(f => f.folderId === curId && f.name.toLowerCase().includes(search.toLowerCase()));

  const sortedFolders = [...curFolders].sort((a,b) => a.name.localeCompare(b.name));
  const sortedFiles = [...curFiles].sort((a,b) => {
    if (sort === 'name') return a.name.localeCompare(b.name);
    if (sort === 'date') return a.createdAt.localeCompare(b.createdAt);
    return a.size.localeCompare(b.size);
  });

  const totalItems = sortedFolders.length + sortedFiles.length;

  // Actions
  const createFolder = () => {
    const name = newFolderName.trim() || 'Nouveau dossier';
    setFolders(p => [...p, { id:`fd${Date.now()}`, name, parentId: curId, createdAt: 'À l\'instant' }]);
    setNewFolderName('');
    setNewFolderOpen(false);
  };

  const deleteItem = (id: string, kind: 'folder'|'file') => {
    if (kind === 'folder') {
      // also delete children recursively
      const toDelete = new Set<string>();
      const queue = [id];
      while (queue.length) {
        const fid = queue.shift()!;
        toDelete.add(fid);
        folders.filter(f => f.parentId === fid).forEach(f => queue.push(f.id));
      }
      setFolders(p => p.filter(f => !toDelete.has(f.id)));
      setFiles(p => p.filter(f => !toDelete.has(f.folderId ?? '')));
    } else {
      setFiles(p => p.filter(f => f.id !== id));
    }
    setCtx(null);
  };

  const startRename = (id: string, kind: 'folder'|'file', currentName: string) => {
    setRenamingId(id);
    setRenameVal(currentName);
    setCtx(null);
  };

  const commitRename = () => {
    if (!renamingId || !renameVal.trim()) { setRenamingId(null); return; }
    setFolders(p => p.map(f => f.id === renamingId ? { ...f, name: renameVal.trim() } : f));
    setFiles(p => p.map(f => f.id === renamingId ? { ...f, name: renameVal.trim() } : f));
    setRenamingId(null);
  };

  const uploadFiles = (rawFiles: FileList | null) => {
    if (!rawFiles) return;
    const added: FsFile[] = Array.from(rawFiles).map(f => ({
      id: `fi${Date.now()}-${Math.random().toString(36).slice(2)}`,
      name: f.name,
      size: fmtSize(f.size),
      type: f.type || 'application/octet-stream',
      folderId: curId,
      createdAt: 'À l\'instant',
    }));
    setFiles(p => [...p, ...added]);
  };

  const handleDrop = (e: React.DragEvent, targetFolderId: string) => {
    e.preventDefault();
    setDropTarget(null);
    const item = dragItem.current;
    if (!item || item.id === targetFolderId) return;
    if (item.kind === 'file') {
      setFiles(p => p.map(f => f.id === item.id ? { ...f, folderId: targetFolderId } : f));
    } else {
      // Prevent moving a folder into one of its own descendants
      const isDescendant = (folderId: string, ancestorId: string): boolean => {
        const folder = folders.find(f => f.id === folderId);
        if (!folder) return false;
        if (folder.parentId === ancestorId) return true;
        return folder.parentId ? isDescendant(folder.parentId, ancestorId) : false;
      };
      if (!isDescendant(targetFolderId, item.id)) {
        setFolders(p => p.map(f => f.id === item.id ? { ...f, parentId: targetFolderId } : f));
      }
    }
    dragItem.current = null;
  };

  // Drop to root (outside any folder)
  const handleDropRoot = (e: React.DragEvent) => {
    e.preventDefault();
    setDropTarget(null);
    const item = dragItem.current;
    if (!item) return;
    if (item.kind === 'file') setFiles(p => p.map(f => f.id === item.id ? { ...f, folderId: curId } : f));
    else setFolders(p => p.map(f => f.id === item.id ? { ...f, parentId: curId } : f));
    dragItem.current = null;
  };

  const folderColor = '#f9c74f';

  const FolderCard = ({ folder }: { folder: FsFolder }) => {
    const isRenaming = renamingId === folder.id;
    const isDrop = dropTarget === folder.id;
    const childCount = folders.filter(f => f.parentId === folder.id).length + files.filter(f => f.folderId === folder.id).length;
    return (
      <div
        draggable
        onDragStart={() => { dragItem.current = { id: folder.id, kind: 'folder' }; setSelected(folder.id); }}
        onDragOver={e => { e.preventDefault(); e.stopPropagation(); setDropTarget(folder.id); }}
        onDragLeave={() => setDropTarget(null)}
        onDrop={e => handleDrop(e, folder.id)}
        onClick={() => setSelected(folder.id)}
        onDoubleClick={() => { setPath(p => [...p, folder]); setSelected(null); setSearch(''); }}
        onContextMenu={e => { e.preventDefault(); setCtx({ x:e.clientX, y:e.clientY, id:folder.id, kind:'folder' }); }}
        style={{
          borderRadius:10, border:`1.5px solid ${isDrop ? 'var(--accent)' : selected===folder.id ? 'var(--accent)' : 'var(--border)'}`,
          background: isDrop ? 'rgba(249,255,0,0.06)' : selected===folder.id ? 'rgba(249,255,0,0.04)' : 'var(--surface)',
          cursor:'pointer', userSelect:'none', position:'relative', transition:'border-color 0.12s, background 0.12s',
          ...(view === 'grid'
            ? { padding:'16px 14px', display:'flex', flexDirection:'column', gap:8, alignItems:'center', textAlign:'center' }
            : { padding:'10px 14px', display:'flex', alignItems:'center', gap:12 }),
        }}
      >
        <div style={{ ...(view==='grid' ? {} : { flexShrink:0 }), position:'relative' }}>
          <SFIcon name="folder" size={view==='grid'?40:24} color={folderColor} />
          {isDrop && <div style={{ position:'absolute', inset:0, background:'rgba(249,255,0,0.15)', borderRadius:4 }} />}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          {isRenaming ? (
            <input
              autoFocus
              value={renameVal}
              onChange={e => setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e => { if(e.key==='Enter') commitRename(); if(e.key==='Escape') setRenamingId(null); }}
              onClick={e => e.stopPropagation()}
              style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:5, padding:'2px 6px', color:'var(--text)', fontSize:12, fontFamily:'var(--ff-text)', outline:'none' }}
            />
          ) : (
            <p style={{ fontSize:12, fontWeight:600, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{folder.name}</p>
          )}
          {view === 'list' && <p style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', marginTop:1 }}>{childCount} élément{childCount!==1?'s':''} · {folder.createdAt}</p>}
          {view === 'grid' && <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>{childCount} élément{childCount!==1?'s':''}</p>}
        </div>
        {view === 'list' && (
          <>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:60, textAlign:'right' }}>—</span>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:70, textAlign:'right' }}>{folder.createdAt}</span>
          </>
        )}
        <button onClick={e=>{e.stopPropagation();setCtx({x:e.clientX,y:e.clientY,id:folder.id,kind:'folder'});}}
          style={{ padding:'3px 5px', borderRadius:5, border:'none', background:'transparent', color:'var(--text-3)', cursor:'pointer', opacity:0, position: view==='grid'?'absolute':'relative', top:6, right:6, flexShrink:0 }}
          className="item-menu-btn"
        >⋮</button>
      </div>
    );
  };

  const FileCard = ({ file }: { file: FsFile }) => {
    const isRenaming = renamingId === file.id;
    return (
      <div
        draggable
        onDragStart={() => { dragItem.current = { id: file.id, kind: 'file' }; setSelected(file.id); }}
        onClick={() => setSelected(file.id)}
        onContextMenu={e => { e.preventDefault(); setCtx({ x:e.clientX, y:e.clientY, id:file.id, kind:'file' }); }}
        style={{
          borderRadius:10, border:`1.5px solid ${selected===file.id ? 'var(--accent)' : 'var(--border)'}`,
          background: selected===file.id ? 'rgba(249,255,0,0.04)' : 'var(--surface)',
          cursor:'pointer', userSelect:'none', position:'relative', transition:'border-color 0.12s',
          ...(view === 'grid'
            ? { padding:'16px 14px', display:'flex', flexDirection:'column', gap:8, alignItems:'center', textAlign:'center' }
            : { padding:'10px 14px', display:'flex', alignItems:'center', gap:12 }),
        }}
      >
        <div style={{ ...(view==='grid' ? {} : { flexShrink:0 }), width:view==='grid'?40:24, height:view==='grid'?40:24, borderRadius:8, background:'var(--surface-2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center' }}>
          <SFIcon name={fileIcon(file.type)} size={view==='grid'?20:14} color={fileColor(file.type)} />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          {isRenaming ? (
            <input autoFocus value={renameVal} onChange={e=>setRenameVal(e.target.value)}
              onBlur={commitRename}
              onKeyDown={e=>{if(e.key==='Enter')commitRename();if(e.key==='Escape')setRenamingId(null);}}
              onClick={e=>e.stopPropagation()}
              style={{ width:'100%', background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:5, padding:'2px 6px', color:'var(--text)', fontSize:12, fontFamily:'var(--ff-text)', outline:'none' }}
            />
          ) : (
            <p style={{ fontSize:12, fontWeight:500, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{file.name}</p>
          )}
          {view === 'list' && <p style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', marginTop:1 }}>{file.type.split('/')[1]?.toUpperCase() ?? 'FICHIER'}</p>}
        </div>
        {view === 'list' && (
          <>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:60, textAlign:'right' }}>{file.size}</span>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', minWidth:70, textAlign:'right' }}>{file.createdAt}</span>
          </>
        )}
        {view === 'grid' && <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>{file.size}</p>}
        <button onClick={e=>{e.stopPropagation();setCtx({x:e.clientX,y:e.clientY,id:file.id,kind:'file'});}}
          style={{ padding:'3px 5px', borderRadius:5, border:'none', background:'transparent', color:'var(--text-3)', cursor:'pointer', opacity:0, position: view==='grid'?'absolute':'relative', top:6, right:6, flexShrink:0 }}
          className="item-menu-btn"
        >⋮</button>
      </div>
    );
  };

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}
      onDragOver={e=>e.preventDefault()}
      onDrop={handleDropRoot}
    >
      <style>{`
        .drive-item:hover .item-menu-btn { opacity: 1 !important; }
        .drive-item:hover { border-color: var(--border-2) !important; }
      `}</style>

      {/* ── Toolbar ── */}
      <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, background:'var(--surface)', flexShrink:0, flexWrap:'wrap' }}>

        {/* Breadcrumb */}
        <div style={{ display:'flex', alignItems:'center', gap:4, flex:1, minWidth:0 }}>
          <button onClick={()=>{setPath([]);setSearch('');setSelected(null);}} style={{ background:'none', border:'none', cursor:'pointer', color: path.length===0 ? 'var(--text)' : 'var(--text-3)', fontSize:13, fontWeight: path.length===0 ? 600 : 400, padding:'2px 4px', borderRadius:5, fontFamily:'var(--ff-text)' }}>
            Mon Drive
          </button>
          {path.map((folder, i) => (
            <React.Fragment key={folder.id}>
              <span style={{ color:'var(--text-3)', fontSize:12 }}>›</span>
              <button onClick={()=>{setPath(p=>p.slice(0,i+1));setSearch('');setSelected(null);}}
                style={{ background:'none', border:'none', cursor:'pointer', color: i===path.length-1 ? 'var(--text)' : 'var(--text-3)', fontSize:13, fontWeight: i===path.length-1 ? 600 : 400, padding:'2px 4px', borderRadius:5, fontFamily:'var(--ff-text)', maxWidth:160, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                {folder.name}
              </button>
            </React.Fragment>
          ))}
        </div>

        {/* Search */}
        <div style={{ position:'relative', display:'flex', alignItems:'center' }}>
          <SFIcon name="search" size={13} color="var(--text-3)" style={{ position:'absolute', left:9 } as React.CSSProperties} />
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Rechercher…"
            style={{ padding:'5px 10px 5px 30px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:12, outline:'none', width:180, fontFamily:'var(--ff-text)' }} />
        </div>

        {/* Actions */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <button onClick={()=>setNewFolderOpen(true)} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'var(--ff-text)' }}>
            <SFIcon name="folder-plus" size={14} />
            Nouveau dossier
          </button>
          <button onClick={()=>inputRef.current?.click()} style={{ padding:'6px 12px', borderRadius:8, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', fontSize:12, cursor:'pointer', display:'flex', alignItems:'center', gap:6, fontFamily:'var(--ff-text)' }}>
            <SFIcon name="upload" size={14} />
            Importer
          </button>
          <input ref={inputRef} type="file" multiple style={{ display:'none' }} onChange={e=>{ uploadFiles(e.target.files); e.target.value=''; }} />
          <div style={{ width:1, height:18, background:'var(--border)' }} />
          {/* Sort */}
          <select value={sort} onChange={e=>setSort(e.target.value as SortKey)}
            style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', fontSize:11, fontFamily:'var(--ff-mono)', outline:'none', cursor:'pointer', colorScheme:'dark' }}>
            <option value="name">Nom</option>
            <option value="date">Date</option>
            <option value="size">Taille</option>
          </select>
          {/* View toggle */}
          <div style={{ display:'flex', border:'1px solid var(--border)', borderRadius:7, overflow:'hidden' }}>
            {(['grid','list'] as ViewMode[]).map(v => (
              <button key={v} onClick={()=>setView(v)} style={{ padding:'5px 8px', border:'none', background: view===v ? 'var(--surface-3)' : 'transparent', color: view===v ? 'var(--text)' : 'var(--text-3)', cursor:'pointer', display:'flex', alignItems:'center' }}>
                <SFIcon name={v==='grid'?'layout-grid':'list'} size={14} />
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* ── New folder dialog ── */}
      {newFolderOpen && (
        <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)', display:'flex', alignItems:'center', gap:10 }}>
          <SFIcon name="folder-plus" size={16} color={folderColor} />
          <input ref={newFolderRef} value={newFolderName} onChange={e=>setNewFolderName(e.target.value)}
            onKeyDown={e=>{ if(e.key==='Enter') createFolder(); if(e.key==='Escape'){setNewFolderOpen(false);setNewFolderName('');} }}
            placeholder="Nom du dossier"
            style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--accent)', background:'var(--surface)', color:'var(--text)', fontSize:13, outline:'none', fontFamily:'var(--ff-text)', width:240 }}
          />
          <button onClick={createFolder} style={{ padding:'6px 14px', borderRadius:8, border:'none', background:'var(--accent)', color:'var(--on-accent)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--ff-text)' }}>Créer</button>
          <button onClick={()=>{setNewFolderOpen(false);setNewFolderName('');}} style={{ padding:'6px 10px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', color:'var(--text-2)', fontSize:12, cursor:'pointer', fontFamily:'var(--ff-text)' }}>Annuler</button>
        </div>
      )}

      {/* ── List header (list mode) ── */}
      {view === 'list' && totalItems > 0 && (
        <div style={{ padding:'6px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:12, background:'var(--surface)', flexShrink:0 }}>
          <div style={{ width:24+8, flexShrink:0 }} />
          <span style={{ flex:1, fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Nom</span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', minWidth:60, textAlign:'right' }}>Taille</span>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', minWidth:70, textAlign:'right' }}>Date</span>
          <div style={{ width:28 }} />
        </div>
      )}

      {/* ── Content ── */}
      <div style={{ flex:1, overflow:'auto', padding:'16px 20px' }}
        onDragOver={e=>e.preventDefault()}
        onDrop={handleDropRoot}
      >
        {totalItems === 0 && !search ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:12, minHeight:200 }}>
            <SFIcon name="folder-open" size={48} color="var(--text-3)" />
            <p style={{ fontSize:14, color:'var(--text-3)', fontWeight:500 }}>Ce dossier est vide</p>
            <p style={{ fontSize:12, color:'var(--text-3)' }}>Créez un dossier ou importez des fichiers</p>
          </div>
        ) : totalItems === 0 && search ? (
          <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', gap:10, minHeight:200 }}>
            <SFIcon name="search" size={32} color="var(--text-3)" />
            <p style={{ fontSize:13, color:'var(--text-3)' }}>Aucun résultat pour « {search} »</p>
          </div>
        ) : (
          <div style={view === 'grid'
            ? { display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }
            : { display:'flex', flexDirection:'column', gap:4 }
          }>
            {/* Folders section */}
            {sortedFolders.length > 0 && (
              <>
                {view === 'grid' && (
                  <div style={{ gridColumn:'1/-1', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', paddingBottom:4 }}>
                    Dossiers — {sortedFolders.length}
                  </div>
                )}
                {sortedFolders.map(folder => (
                  <div key={folder.id} className="drive-item">
                    <FolderCard folder={folder} />
                  </div>
                ))}
              </>
            )}
            {/* Files section */}
            {sortedFiles.length > 0 && (
              <>
                {view === 'grid' && (
                  <div style={{ gridColumn:'1/-1', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', paddingTop: sortedFolders.length>0 ? 12 : 0, paddingBottom:4 }}>
                    Fichiers — {sortedFiles.length}
                  </div>
                )}
                {sortedFiles.map(file => (
                  <div key={file.id} className="drive-item">
                    <FileCard file={file} />
                  </div>
                ))}
              </>
            )}
          </div>
        )}

        {/* Drop zone hint (when dragging) */}
      </div>

      {/* ── Status bar ── */}
      <div style={{ padding:'5px 20px', borderTop:'1px solid var(--border)', background:'var(--surface)', display:'flex', gap:16, alignItems:'center', flexShrink:0 }}>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>
          {totalItems} élément{totalItems!==1?'s':''}{selected ? ' · 1 sélectionné' : ''}
        </span>
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', marginLeft:'auto' }}>
          {path.length > 0 ? path.map(f=>f.name).join(' › ') : 'Racine'}
        </span>
      </div>

      {/* ── Context menu ── */}
      {ctx && (
        <div onMouseDown={e=>e.stopPropagation()} style={{
          position:'fixed', top:ctx.y, left:ctx.x, zIndex:500,
          background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:10,
          boxShadow:'0 8px 32px rgba(0,0,0,0.5)', padding:'4px 0', minWidth:170,
        }}>
          {[
            { label:'Renommer', icon:'pencil', action:() => { const item = folders.find(f=>f.id===ctx.id) ?? files.find(f=>f.id===ctx.id); if(item) startRename(ctx.id, ctx.kind, item.name); } },
            ...(ctx.kind==='folder' ? [{ label:'Ouvrir', icon:'folder-open', action:() => { const f = folders.find(f=>f.id===ctx.id); if(f){setPath(p=>[...p,f]);setSelected(null);setSearch('');} setCtx(null); } }] : []),
            { label:'Supprimer', icon:'trash-2', action:() => deleteItem(ctx.id, ctx.kind), danger:true },
          ].map(item => (
            <button key={item.label} onClick={item.action}
              style={{ display:'flex', alignItems:'center', gap:10, width:'100%', padding:'8px 14px', background:'transparent', border:'none', cursor:'pointer', color: (item as any).danger ? 'var(--danger)' : 'var(--text)', fontSize:13, fontFamily:'var(--ff-text)', textAlign:'left' }}
              onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.background='var(--surface-2)';}}
              onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.background='transparent';}}
            >
              <SFIcon name={item.icon} size={14} color={(item as any).danger ? 'var(--danger)' : 'var(--text-3)'} />
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Checklist View ────────────────────────────────────────────────────────────

export function ChecklistView({ resource, seedItems, contentRef }: { resource: Resource; seedItems?: { id: string; text: string }[]; contentRef?: React.MutableRefObject<(() => { id: string; text: string }[]) | null> }) {
  const [items, setItems] = useState(() =>
    seedItems
      ? seedItems.map(i => ({ id: i.id, text: i.text, done: false, initials: '', color: 'var(--accent)', due: '—' }))
      : CHECKLIST_ITEMS_MOCK
  );
  useEffect(() => {
    if (contentRef) contentRef.current = () => items.map(i => ({ id: i.id, text: i.text }));
  });

  const [newItem, setNewItem] = useState('');
  const done = items.filter(i => i.done).length;
  const progress = items.length ? Math.round((done / items.length) * 100) : 0;
  const toggle = (id: string) => setItems(p => p.map(i => i.id===id ? {...i,done:!i.done} : i));
  const remove = (id: string) => setItems(p => p.filter(i => i.id !== id));
  const addItem = () => {
    if (!newItem.trim()) return;
    setItems(p => [...p, { id:`ck${Date.now()}`, text:newItem.trim(), done:false, initials:'LM', color:'#5c3d8f', due:'—' }]);
    setNewItem('');
  };
  return (
    <div style={{ flex:1, overflow:'auto', padding:24 }}>
      <div style={{ maxWidth:720, margin:'0 auto' }}>
        <div style={{ marginBottom:20, padding:'16px 20px', background:'var(--surface)', borderRadius:'var(--radius)', border:'1px solid var(--border)' }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
            <p style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Progression</p>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:11, color:'var(--text-2)' }}>{done}/{items.length} complétés · {progress}%</span>
          </div>
          <SFBar value={progress} height={6} />
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
          {items.map(item => (
            <div key={item.id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 16px', background:'var(--surface)', borderRadius:10, border:'1px solid var(--border)', opacity:item.done ? 0.5 : 1, transition:'opacity 0.15s' }}
              onMouseEnter={e => (e.currentTarget.querySelector('.ck-del') as HTMLElement | null)?.style && ((e.currentTarget.querySelector('.ck-del') as HTMLElement).style.opacity = '1')}
              onMouseLeave={e => (e.currentTarget.querySelector('.ck-del') as HTMLElement | null)?.style && ((e.currentTarget.querySelector('.ck-del') as HTMLElement).style.opacity = '0')}
            >
              <button onClick={()=>toggle(item.id)} style={{ width:18, height:18, borderRadius:'50%', flexShrink:0, border:item.done?'none':'1.5px solid var(--border-2)', background:item.done?'var(--ok)':'transparent', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}>
                {item.done && <SFIcon name="check" size={10} color="white" />}
              </button>
              <span style={{ flex:1, fontSize:13, fontWeight:500, textDecoration:item.done?'line-through':'none', color:item.done?'var(--text-3)':'var(--text)' }}>{item.text}</span>
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', flexShrink:0 }}>{item.due}</span>
              <div style={{ width:24, height:24, borderRadius:'50%', background:item.color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'white', fontWeight:700 }}>{item.initials}</span>
              </div>
              <button className="ck-del" onClick={()=>remove(item.id)}
                style={{ opacity:0, transition:'opacity 0.12s', display:'flex', padding:4, borderRadius:6, border:'none', background:'transparent', color:'var(--danger)', cursor:'pointer', flexShrink:0 }}>
                <SFIcon name="trash-2" size={13} />
              </button>
            </div>
          ))}
          <div style={{ display:'flex', alignItems:'center', gap:10, padding:'10px 16px', background:'var(--surface)', borderRadius:10, border:'1px dashed var(--border-2)' }}>
            <SFIcon name="plus" size={16} color="var(--text-3)" />
            <input value={newItem} onChange={e=>setNewItem(e.target.value)} onKeyDown={e=>{ if(e.key==='Enter') addItem(); }}
              placeholder="Ajouter un élément..."
              style={{ flex:1, background:'transparent', border:'none', color:'var(--text)', fontSize:13, outline:'none', fontFamily:'var(--ff-text)' }}
            />
            {newItem.trim() && <button onClick={addItem} style={{ padding:'4px 10px', borderRadius:7, border:'none', background:'var(--accent)', color:'var(--on-accent)', fontSize:11, fontWeight:600, cursor:'pointer' }}>Ajouter</button>}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Document View (Google Docs-style) ─────────────────────────────────────────

interface TocEntry { id: string; text: string; level: number; }

type DocTheme = 'standard' | 'moderne' | 'classique' | 'custom';

function getCustomDocThemeCss(): string {
  let hf = "'Montserrat',sans-serif", bf = "Georgia,'Times New Roman',serif";
  try {
    const s = localStorage.getItem('sf_ui_fonts');
    if (s) { const p = JSON.parse(s); hf = p.heading ?? hf; bf = p.body ?? bf; }
  } catch { /* noop */ }
  return `.doc-editor h1{font-family:${hf};font-size:26px;font-weight:700;color:#111;margin:24px 0 10px;line-height:1.3}
          .doc-editor h2{font-family:${hf};font-size:20px;font-weight:600;color:#222;margin:20px 0 8px;line-height:1.3}
          .doc-editor h3{font-family:${hf};font-size:14px;font-weight:700;color:#444;margin:14px 0 5px;text-transform:uppercase;letter-spacing:0.05em}
          .doc-editor p{font-family:${bf};font-size:14px;line-height:1.75;color:#1a1a1a;margin:0 0 10px}
          .doc-editor ul,.doc-editor ol{font-family:${bf};padding-left:26px;margin:8px 0;color:#1a1a1a}
          .doc-editor ul{list-style:disc}.doc-editor ol{list-style:decimal}
          .doc-editor li{margin:4px 0;font-size:14px;line-height:1.7}
          .doc-editor strong{font-weight:700}.doc-editor em{font-style:italic}`;
}

const DOC_THEMES: Record<DocTheme, { label: string; headingFont: string; bodyFont: string; css: string }> = {
  standard: {
    label: 'Standard', headingFont: 'Montserrat', bodyFont: 'Georgia',
    css: `.doc-editor h1{font-family:'Montserrat',sans-serif;font-size:26px;font-weight:700;color:#111;margin:24px 0 10px;line-height:1.3}
          .doc-editor h2{font-family:'Montserrat',sans-serif;font-size:19px;font-weight:600;color:#222;margin:20px 0 8px;line-height:1.3}
          .doc-editor h3{font-family:'Montserrat',sans-serif;font-size:14px;font-weight:700;color:#444;margin:14px 0 5px;text-transform:uppercase;letter-spacing:0.05em}
          .doc-editor p{font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.75;color:#1a1a1a;margin:0 0 10px}
          .doc-editor ul,.doc-editor ol{font-family:Georgia,serif;padding-left:26px;margin:8px 0;color:#1a1a1a}
          .doc-editor ul{list-style:disc}.doc-editor ol{list-style:decimal}
          .doc-editor li{margin:4px 0;font-size:14px;line-height:1.7}
          .doc-editor strong{font-weight:700}.doc-editor em{font-style:italic}`,
  },
  moderne: {
    label: 'Moderne', headingFont: 'Montserrat', bodyFont: 'Montserrat',
    css: `.doc-editor h1{font-family:'Montserrat',sans-serif;font-size:34px;font-weight:900;color:#000;margin:32px 0 14px;line-height:1.05;letter-spacing:-0.03em}
          .doc-editor h2{font-family:'Montserrat',sans-serif;font-size:13px;font-weight:700;color:#000;margin:24px 0 8px;text-transform:uppercase;letter-spacing:0.14em;border-bottom:2px solid #000;padding-bottom:5px}
          .doc-editor h3{font-family:'Montserrat',sans-serif;font-size:15px;font-weight:600;color:#333;margin:16px 0 5px}
          .doc-editor p{font-family:'Montserrat',sans-serif;font-size:13px;line-height:1.65;color:#222;margin:0 0 10px;font-weight:300}
          .doc-editor ul,.doc-editor ol{font-family:'Montserrat',sans-serif;padding-left:22px;margin:8px 0;color:#222}
          .doc-editor ul{list-style:disc}.doc-editor ol{list-style:decimal}
          .doc-editor li{margin:3px 0;font-size:13px;line-height:1.6;font-weight:300}
          .doc-editor strong{font-weight:700}.doc-editor em{font-style:italic}`,
  },
  classique: {
    label: 'Classique', headingFont: 'Georgia', bodyFont: 'Georgia',
    css: `.doc-editor h1{font-family:Georgia,'Times New Roman',serif;font-size:28px;font-weight:bold;font-style:italic;color:#1c1208;margin:28px 0 6px;line-height:1.25;letter-spacing:0.01em;border-bottom:1px solid #c4aa6e;padding-bottom:10px}
          .doc-editor h2{font-family:Georgia,'Times New Roman',serif;font-size:20px;font-weight:bold;color:#1c1208;margin:22px 0 8px;line-height:1.3}
          .doc-editor h3{font-family:Georgia,'Times New Roman',serif;font-size:15px;font-weight:bold;font-style:italic;color:#4a3f20;margin:16px 0 5px}
          .doc-editor p{font-family:Georgia,'Times New Roman',serif;font-size:14px;line-height:1.9;color:#1c1208;margin:0 0 12px}
          .doc-editor ul,.doc-editor ol{font-family:Georgia,serif;padding-left:28px;margin:10px 0;color:#1c1208}
          .doc-editor ul{list-style:disc}.doc-editor ol{list-style:decimal}
          .doc-editor li{margin:5px 0;font-size:14px;line-height:1.8}
          .doc-editor strong{font-weight:bold}.doc-editor em{font-style:italic}`,
  },
  custom: {
    label: 'Personnalisé', headingFont: 'Custom', bodyFont: 'Custom',
    css: '',
  },
};

interface DocComment { id: string; author: User; text: string; time: string; anchorId?: string; excerpt?: string; }

interface CustomStyle { id: string; name: string; fontFamily: string; fontSize: number; fontWeight: string; fontStyle: string; color: string; }

const STYLE_STORE_KEY = 'sf_doc_custom_styles';
function loadCustomStyles(): CustomStyle[] {
  try { const s = localStorage.getItem(STYLE_STORE_KEY); return s ? JSON.parse(s) : []; } catch { return []; }
}
function saveCustomStyles(styles: CustomStyle[]) {
  try { localStorage.setItem(STYLE_STORE_KEY, JSON.stringify(styles)); } catch { /* noop */ }
}

export function DocumentView({ resource, onEdit, saveState = 'saved', online = true, registerExport, seedHTML, contentRef }: { resource: Resource; seedHTML?: string; contentRef?: React.MutableRefObject<(() => string) | null> } & EditableProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);
  const [wordCount, setWordCount] = useState(0);
  const [selRect, setSelRect] = useState<DOMRect | null>(null);
  const [fmts, setFmts] = useState<Record<string,boolean>>({});
  const [showComments, setShowComments] = useState(true);
  const [showToc, setShowToc] = useState(true);
  const [zoom, setZoom] = useState(1);
  const [toc, setToc] = useState<TocEntry[]>([]);
  const [theme, setTheme] = useState<DocTheme>('standard');
  const [newCommentText, setNewCommentText] = useState('');
  const [pendingAnchorId, setPendingAnchorId] = useState<string | null>(null);
  const newCommentRef = useRef<HTMLTextAreaElement>(null);
  const [customStyles, setCustomStyles] = useState<CustomStyle[]>(loadCustomStyles);
  const [showStyleForm, setShowStyleForm] = useState(false);
  const [newStyle, setNewStyle] = useState<Omit<CustomStyle,'id'>>({ name:'Mon style', fontFamily:"'Montserrat',sans-serif", fontSize:14, fontWeight:'400', fontStyle:'normal', color:'#1a1a1a' });
  const [comments, setComments] = useState<DocComment[]>([
    { id:'dc1', author:USERS.sarah,  text:'La section budget nécessite une mise à jour avec les derniers chiffres.', time:'Il y a 1h' },
    { id:'dc2', author:USERS.thomas, text:'Peut-on ajouter une section sur la stratégie sociale ?', time:'Il y a 3h' },
  ]);

  const buildToc = () => {
    if (!editorRef.current) return;
    const headings = editorRef.current.querySelectorAll('h1,h2,h3');
    const entries: TocEntry[] = [];
    headings.forEach((el, i) => {
      if (!el.id) el.id = `doc-h-${i}`;
      const level = parseInt(el.tagName[1]);
      const text = (el as HTMLElement).innerText.trim();
      if (text) entries.push({ id: el.id, text, level });
    });
    setToc(entries);
  };

  useEffect(() => {
    if (editorRef.current && !initialized.current) {
      editorRef.current.innerHTML = seedHTML ?? DOC_INITIAL_HTML;
      initialized.current = true;
      const t = editorRef.current.innerText ?? '';
      setWordCount(t.trim().split(/\s+/).filter(Boolean).length);
      buildToc();
      if (contentRef) contentRef.current = () => editorRef.current?.innerHTML ?? '';
    }
  }, []);

  useEffect(() => {
    const handler = () => {
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0 || sel.isCollapsed || !editorRef.current?.contains(sel.getRangeAt(0).commonAncestorContainer)) {
        setSelRect(null); return;
      }
      setSelRect(sel.getRangeAt(0).getBoundingClientRect());
      const result: Record<string,boolean> = {};
      ['bold','italic','underline','strikeThrough'].forEach(cmd => { try { result[cmd] = document.queryCommandState(cmd); } catch {} });
      setFmts(result);
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const exec = (cmd: string, val?: string) => {
    document.execCommand(cmd, false, val);
    editorRef.current?.focus();
    onEdit?.();
  };

  const handleInput = () => {
    const t = editorRef.current?.innerText ?? '';
    setWordCount(t.trim().split(/\s+/).filter(Boolean).length);
    buildToc();
    onEdit?.();
  };

  const addCommentAnchor = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;
    const range = sel.getRangeAt(0);
    if (!editorRef.current?.contains(range.commonAncestorContainer)) return;
    const cid = `cm${Date.now()}`;
    try {
      const mark = document.createElement('mark');
      mark.className = 'doc-comment-mark';
      mark.dataset.commentId = cid;
      const frag = range.extractContents();
      mark.appendChild(frag);
      range.insertNode(mark);
      sel.removeAllRanges();
    } catch { return; }
    setPendingAnchorId(cid);
    setShowComments(true);
    setTimeout(() => newCommentRef.current?.focus(), 50);
  };

  const submitComment = () => {
    if (!newCommentText.trim() || !pendingAnchorId) return;
    const mark = editorRef.current?.querySelector(`[data-comment-id="${pendingAnchorId}"]`) as HTMLElement | null;
    const excerpt = mark?.innerText?.slice(0, 80) ?? '';
    setComments(p => [...p, { id: pendingAnchorId, author: USERS.lea, text: newCommentText.trim(), time: 'À l\'instant', anchorId: pendingAnchorId, excerpt }]);
    setNewCommentText('');
    setPendingAnchorId(null);
    onEdit?.();
  };

  const cancelComment = () => {
    if (pendingAnchorId) {
      const mark = editorRef.current?.querySelector(`[data-comment-id="${pendingAnchorId}"]`);
      if (mark) { const parent = mark.parentNode!; while (mark.firstChild) parent.insertBefore(mark.firstChild, mark); parent.removeChild(mark); }
    }
    setPendingAnchorId(null);
    setNewCommentText('');
  };

  const scrollToAnchor = (anchorId: string) => {
    const el = editorRef.current?.querySelector(`[data-comment-id="${anchorId}"]`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const applyCustomStyle = (style: CustomStyle) => {
    const s = `font-family:${style.fontFamily};font-size:${style.fontSize}px;font-weight:${style.fontWeight};font-style:${style.fontStyle};color:${style.color}`;
    document.execCommand('insertHTML', false, `<span class="doc-cs-${style.id}" style="${s}">${window.getSelection()?.toString() ?? '​'}</span>`);
    editorRef.current?.focus();
    onEdit?.();
  };

  const createStyle = () => {
    const style: CustomStyle = { ...newStyle, id: `cs${Date.now()}` };
    const updated = [...customStyles, style];
    setCustomStyles(updated);
    saveCustomStyles(updated);
    setShowStyleForm(false);
    setNewStyle({ name:'Mon style', fontFamily:"'Montserrat',sans-serif", fontSize:14, fontWeight:'400', fontStyle:'normal', color:'#1a1a1a' });
  };

  useEffect(() => {
    if (!registerExport) return;
    registerExport(() => ({
      title: resource.title,
      css: 'body{display:flex;justify-content:center;padding:0}.doc-print{width:100%;max-width:760px}'
        + DOC_THEMES[theme].css.replace(/\.doc-editor/g, '.doc-print'),
      bodyHTML: `<div class="doc-print">${editorRef.current?.innerHTML ?? ''}</div>`,
    }));
    return () => registerExport(null);
  }, [registerExport, theme, resource.title]);

  const scrollToHeading = (id: string) => {
    const el = editorRef.current?.querySelector(`#${id}`);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const fmtBtn = (cmd: string, icon: string, label: string) => (
    <button key={cmd} title={label} onMouseDown={e=>{ e.preventDefault(); exec(cmd); }}
      style={{ padding:'5px 7px', borderRadius:6, border:'none', cursor:'pointer', background: fmts[cmd] ? 'var(--surface-3)' : 'transparent', color: fmts[cmd] ? 'var(--text)' : 'var(--text-2)', display:'flex' }}>
      <SFIcon name={icon} size={14} />
    </button>
  );

  const ZOOM_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2];
  const zoomIn  = () => setZoom(z => { const next = ZOOM_STEPS.find(s => s > z); return next ?? z; });
  const zoomOut = () => setZoom(z => { const prev = [...ZOOM_STEPS].reverse().find(s => s < z); return prev ?? z; });

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

      {/* ── Table des matières ── */}
      {showToc && (
        <div style={{ width:220, flexShrink:0, borderRight:'1px solid var(--border)', display:'flex', flexDirection:'column', background:'var(--surface)', overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Table des matières</span>
            <button onClick={()=>setShowToc(false)} style={{ display:'flex', background:'none', border:'none', cursor:'pointer', color:'var(--text-3)', padding:2 }}>
              <SFIcon name="x" size={12} />
            </button>
          </div>
          <div style={{ flex:1, overflow:'auto', padding:'8px 0' }}>
            {toc.length === 0
              ? <p style={{ padding:'16px 14px', fontSize:11, color:'var(--text-3)', fontStyle:'italic', lineHeight:1.5 }}>Les titres apparaîtront ici automatiquement.</p>
              : toc.map(entry => (
                <button key={entry.id} onClick={() => scrollToHeading(entry.id)}
                  style={{
                    display:'block', width:'100%', textAlign:'left',
                    padding: entry.level===1 ? '5px 14px' : entry.level===2 ? '4px 24px' : '3px 34px',
                    background:'none', border:'none', cursor:'pointer',
                    fontSize: entry.level===1 ? 12 : entry.level===2 ? 11 : 10,
                    fontWeight: entry.level===1 ? 600 : entry.level===2 ? 500 : 400,
                    color: 'var(--text-2)',
                    lineHeight: 1.4,
                    borderLeft: entry.level===1 ? '2px solid transparent' : 'none',
                  }}
                  onMouseEnter={e=>{(e.currentTarget as HTMLElement).style.color='var(--text)';(e.currentTarget as HTMLElement).style.background='var(--surface-2)';}}
                  onMouseLeave={e=>{(e.currentTarget as HTMLElement).style.color='var(--text-2)';(e.currentTarget as HTMLElement).style.background='none';}}
                >
                  {entry.text}
                </button>
              ))
            }
          </div>
        </div>
      )}

      {/* ── Main editor column ── */}
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {/* Toolbar */}
        <div style={{ padding:'6px 12px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:2, background:'var(--surface)', flexShrink:0, flexWrap:'wrap' }}>
          {/* TOC toggle */}
          {!showToc && (
            <button onClick={()=>setShowToc(true)} title="Table des matières" style={{ padding:'5px 7px', borderRadius:6, border:'none', cursor:'pointer', background:'transparent', color:'var(--text-2)', display:'flex', marginRight:4 }}>
              <SFIcon name="list" size={14} />
            </button>
          )}
          {/* Block format */}
          {([['p','Paragraphe'],['h1','Titre 1'],['h2','Titre 2'],['h3','Titre 3']] as [string,string][]).map(([tag,label]) => (
            <button key={tag} title={label} onMouseDown={e=>{ e.preventDefault(); exec('formatBlock',tag); }}
              style={{ padding:'4px 9px', borderRadius:6, border:'none', cursor:'pointer', background:'transparent', color:'var(--text-2)', fontWeight: tag!=='p' ? 700 : 400, fontSize: tag==='h1'?15:tag==='h2'?13:tag==='h3'?12:12 }}
            >{label}</button>
          ))}
          <div style={{ width:1, height:18, background:'var(--border)', margin:'0 4px' }} />
          {fmtBtn('bold','bold','Gras')}
          {fmtBtn('italic','italic','Italique')}
          {fmtBtn('underline','underline','Souligné')}
          {fmtBtn('strikeThrough','strikethrough','Barré')}
          <div style={{ width:1, height:18, background:'var(--border)', margin:'0 4px' }} />
          {fmtBtn('insertUnorderedList','list','Liste à puces')}
          {fmtBtn('insertOrderedList','list-ordered','Liste numérotée')}
          <div style={{ width:1, height:18, background:'var(--border)', margin:'0 4px' }} />
          {[['justifyLeft','align-left'],['justifyCenter','align-center'],['justifyRight','align-right'],['justifyFull','align-justify']].map(([cmd,icon]) => fmtBtn(cmd,icon,cmd))}

          {/* Custom styles */}
          {customStyles.length > 0 && (
            <>
              <div style={{ width:1, height:18, background:'var(--border)', margin:'0 4px' }} />
              {customStyles.map(s => (
                <button key={s.id} title={s.name} onMouseDown={e=>{ e.preventDefault(); applyCustomStyle(s); }}
                  style={{ padding:'3px 9px', borderRadius:6, border:'1px solid var(--border)', cursor:'pointer', background:'transparent', color: s.color, fontSize:s.fontSize > 16 ? 11 : 10, fontFamily: s.fontFamily, fontWeight: s.fontWeight, fontStyle: s.fontStyle, whiteSpace:'nowrap' }}>
                  {s.name}
                </button>
              ))}
            </>
          )}
          <button title="Créer un style" onMouseDown={e=>{ e.preventDefault(); setShowStyleForm(p=>!p); }}
            style={{ padding:'3px 8px', borderRadius:6, border:'1px dashed var(--border-2)', cursor:'pointer', background:'transparent', color:'var(--text-3)', fontSize:10, fontFamily:'var(--ff-mono)', whiteSpace:'nowrap', marginLeft: customStyles.length > 0 ? 2 : 6 }}>
            + Style
          </button>

          {/* Theme picker */}
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:3 }}>
            {(Object.entries(DOC_THEMES) as [DocTheme, typeof DOC_THEMES[DocTheme]][]).map(([key, t]) => (
              <button key={key} onClick={() => setTheme(key)} title={`Style ${t.label}`}
                style={{ padding:'3px 9px', borderRadius:6, border:`1px solid ${theme===key ? 'var(--accent)' : 'var(--border)'}`, background: theme===key ? 'rgba(249,255,0,0.07)' : 'transparent', color: theme===key ? 'var(--accent)' : 'var(--text-3)', fontSize:10, fontFamily:'var(--ff-text)', fontWeight: theme===key ? 600 : 400, cursor:'pointer', whiteSpace:'nowrap' }}>
                <span style={{ fontFamily: key === 'classique' ? 'Georgia,serif' : key === 'moderne' ? "'Montserrat',sans-serif" : key === 'custom' ? 'var(--ff-text)' : "'Montserrat',sans-serif", fontSize: 10 }}>
                  {t.label}
                </span>
              </button>
            ))}
            <div style={{ width:1, height:18, background:'var(--border)', margin:'0 4px' }} />
          </div>
          {/* Zoom controls */}
          <div style={{ display:'flex', alignItems:'center', gap:4 }}>
            <button onClick={zoomOut} disabled={zoom<=0.5}
              style={{ padding:'3px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor:'pointer', fontSize:13, lineHeight:1, display:'flex', alignItems:'center' }}>−</button>
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-2)', minWidth:36, textAlign:'center' }}>{Math.round(zoom*100)}%</span>
            <button onClick={zoomIn} disabled={zoom>=2}
              style={{ padding:'3px 7px', borderRadius:6, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text-2)', cursor:'pointer', fontSize:13, lineHeight:1, display:'flex', alignItems:'center' }}>+</button>
            <div style={{ width:1, height:18, background:'var(--border)', margin:'0 6px' }} />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>{wordCount} mots</span>
            <button onClick={()=>setShowComments(s=>!s)} style={{ padding:'4px 8px', borderRadius:6, border:'1px solid var(--border)', background: showComments ? 'var(--surface-2)' : 'transparent', color:'var(--text-2)', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:9, marginLeft:4 }}>
              Commentaires
            </button>
          </div>
        </div>

        {/* Custom style creation panel */}
        {showStyleForm && (
          <div style={{ padding:'14px 16px', borderBottom:'1px solid var(--border)', background:'var(--surface-2)', display:'flex', flexWrap:'wrap', gap:12, alignItems:'flex-end' }}>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Nom</label>
              <input value={newStyle.name} onChange={e=>setNewStyle(p=>({...p,name:e.target.value}))}
                style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:12, fontFamily:'var(--ff-text)', outline:'none', width:120 }} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Police</label>
              <select value={newStyle.fontFamily} onChange={e=>setNewStyle(p=>({...p,fontFamily:e.target.value}))}
                style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:12, outline:'none', colorScheme:'dark', cursor:'pointer' }}>
                {[...([{label:'Montserrat',value:"'Montserrat',sans-serif"},{label:'Georgia',value:"Georgia,serif"},{label:'Inter',value:"'Inter',sans-serif"},{label:'Lato',value:"'Lato',sans-serif"},{label:'Playfair Display',value:"'Playfair Display',serif"},{label:'Cormorant Garamond',value:"'Cormorant Garamond',serif"}])].map(f=>(
                  <option key={f.value} value={f.value}>{f.label}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Taille</label>
              <input type="number" value={newStyle.fontSize} onChange={e=>setNewStyle(p=>({...p,fontSize:+e.target.value}))} min={8} max={72}
                style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:12, outline:'none', width:70 }} />
            </div>
            <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
              <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Graisse</label>
              <select value={newStyle.fontWeight} onChange={e=>setNewStyle(p=>({...p,fontWeight:e.target.value}))}
                style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:12, outline:'none', colorScheme:'dark', cursor:'pointer' }}>
                {[['300','Léger'],['400','Normal'],['600','Semi-gras'],['700','Gras'],['900','Extra gras']].map(([v,l])=>(
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </div>
            <div style={{ display:'flex', gap:6, alignItems:'flex-end' }}>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Italique</label>
                <button onClick={()=>setNewStyle(p=>({...p,fontStyle:p.fontStyle==='italic'?'normal':'italic'}))}
                  style={{ padding:'5px 9px', borderRadius:7, border:`1px solid ${newStyle.fontStyle==='italic'?'var(--accent)':'var(--border-2)'}`, background: newStyle.fontStyle==='italic'?'rgba(249,255,0,0.07)':'var(--surface)', color:newStyle.fontStyle==='italic'?'var(--accent)':'var(--text-2)', fontSize:12, fontStyle:'italic', cursor:'pointer' }}>I</button>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
                <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>Couleur</label>
                <input type="color" value={newStyle.color} onChange={e=>setNewStyle(p=>({...p,color:e.target.value}))}
                  style={{ width:36, height:32, borderRadius:7, border:'1px solid var(--border-2)', background:'var(--surface)', padding:2, cursor:'pointer' }} />
              </div>
            </div>
            {/* Preview */}
            <div style={{ flexGrow:1, padding:'8px 12px', borderRadius:8, background:'white', border:'1px solid var(--border-2)', minWidth:150 }}>
              <span style={{ fontFamily:newStyle.fontFamily, fontSize:newStyle.fontSize, fontWeight:newStyle.fontWeight, fontStyle:newStyle.fontStyle, color:newStyle.color }}>
                {newStyle.name || 'Aperçu du style'}
              </span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={createStyle} style={{ padding:'7px 14px', borderRadius:8, border:'none', background:'var(--accent)', color:'var(--on-accent)', fontSize:12, fontWeight:600, cursor:'pointer', fontFamily:'var(--ff-text)' }}>Créer</button>
              <button onClick={()=>setShowStyleForm(false)} style={{ padding:'7px 10px', borderRadius:8, border:'1px solid var(--border-2)', background:'transparent', color:'var(--text-2)', fontSize:12, cursor:'pointer', fontFamily:'var(--ff-text)' }}>×</button>
            </div>
          </div>
        )}

        {/* Page area */}
        <div style={{ flex:1, overflow:'auto', background:'#2a2a2a', padding:'32px 24px', display:'flex', justifyContent:'center', alignItems:'flex-start' }}>
          <style>{theme === 'custom' ? getCustomDocThemeCss() : DOC_THEMES[theme].css}</style>
          <style>{`.doc-comment-mark{background:rgba(249,255,0,0.22);border-bottom:1.5px solid rgba(249,255,0,0.55);cursor:pointer}.doc-comment-mark:hover{background:rgba(249,255,0,0.35)}`}</style>
          {customStyles.length > 0 && (
            <style>{customStyles.map(s=>`[class~="doc-cs-${s.id}"]{font-family:${s.fontFamily};font-size:${s.fontSize}px;font-weight:${s.fontWeight};font-style:${s.fontStyle};color:${s.color}}`).join('')}</style>
          )}
          <div style={{ transform:`scale(${zoom})`, transformOrigin:'top center', width:595, marginBottom:`${(zoom-1)*842}px`, flexShrink:0 }}>
            <div
              ref={editorRef}
              contentEditable
              suppressContentEditableWarning
              onInput={handleInput}
              className="doc-editor"
              style={{ width:595, background:'white', minHeight:842, padding:'72px 80px', outline:'none', fontSize:14, lineHeight:1.75, fontFamily: theme === 'moderne' ? "'Montserrat',sans-serif" : theme === 'custom' ? (() => { try { const s = localStorage.getItem('sf_ui_fonts'); return s ? JSON.parse(s).body ?? "Georgia,serif" : "Georgia,serif"; } catch { return "Georgia,serif"; } })() : "Georgia,'Times New Roman',serif", color: theme === 'classique' ? '#1c1208' : '#1a1a1a', boxShadow:'0 8px 40px rgba(0,0,0,0.5)', borderRadius:2, boxSizing:'border-box' }}
            />
          </div>
        </div>

        {/* Status bar */}
        <div style={{ padding:'4px 16px', borderTop:'1px solid var(--border)', background:'var(--surface)', display:'flex', gap:16, flexShrink:0 }}>
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>Édition en direct</span>
          <div style={{ marginLeft:'auto' }}>
            <SaveIndicator state={saveState} online={online} />
          </div>
        </div>
      </div>

      {/* ── Comments sidebar ── */}
      {showComments && (
        <div style={{ width:280, flexShrink:0, borderLeft:'1px solid var(--border)', display:'flex', flexDirection:'column' }}>
          <div style={{ padding:'12px 14px', borderBottom:'1px solid var(--border)', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>
            Commentaires ({comments.length})
          </div>
          <div style={{ flex:1, overflow:'auto', padding:12, display:'flex', flexDirection:'column', gap:10 }}>
            {comments.map(c => (
              <div key={c.id} onClick={() => c.anchorId && scrollToAnchor(c.anchorId)}
                style={{ display:'flex', gap:8, cursor: c.anchorId ? 'pointer' : 'default', opacity: pendingAnchorId && pendingAnchorId !== c.anchorId ? 0.5 : 1 }}>
                <SFAvatar initials={c.author.initials} bg={c.author.avatarColor} size={24} />
                <div style={{ flex:1, background: pendingAnchorId === c.anchorId ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)', borderRadius:9, padding:'8px 10px', border: pendingAnchorId === c.anchorId ? '1px solid rgba(249,255,0,0.3)' : '1px solid transparent' }}>
                  {c.excerpt && (
                    <p style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', borderLeft:'2px solid rgba(249,255,0,0.4)', paddingLeft:6, marginBottom:5, lineHeight:1.4, fontStyle:'italic' }}>
                      "{c.excerpt}{c.excerpt.length >= 80 ? '…' : ''}"
                    </p>
                  )}
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                    <span style={{ fontSize:11, fontWeight:600 }}>{c.author.name.split(' ')[0]}</span>
                    <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>{c.time}</span>
                  </div>
                  <p style={{ fontSize:12, color:'var(--text-2)', lineHeight:1.5 }}>{c.text}</p>
                </div>
              </div>
            ))}
          </div>
          {/* New inline comment form */}
          {pendingAnchorId && (
            <div style={{ padding:'10px 12px', borderTop:'1px solid var(--border)', background:'var(--surface-2)' }}>
              <div style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--accent)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Nouveau commentaire</div>
              <textarea ref={newCommentRef} value={newCommentText} onChange={e=>setNewCommentText(e.target.value)}
                onKeyDown={e=>{ if(e.key==='Enter'&&!e.shiftKey){ e.preventDefault(); submitComment(); } if(e.key==='Escape') cancelComment(); }}
                placeholder="Votre commentaire… (Entrée pour valider)" rows={3}
                style={{ width:'100%', padding:'7px 10px', borderRadius:9, border:'1px solid var(--border-2)', background:'var(--surface)', color:'var(--text)', fontSize:12, outline:'none', fontFamily:'var(--ff-text)', colorScheme:'dark', resize:'none', boxSizing:'border-box' }}
              />
              <div style={{ display:'flex', gap:6, marginTop:6 }}>
                <button onClick={submitComment} style={{ flex:1, padding:'6px', borderRadius:7, border:'none', cursor:'pointer', background:'var(--accent)', color:'var(--on-accent)', fontSize:11, fontWeight:600, fontFamily:'var(--ff-text)' }}>Valider</button>
                <button onClick={cancelComment} style={{ padding:'6px 10px', borderRadius:7, border:'1px solid var(--border-2)', cursor:'pointer', background:'transparent', color:'var(--text-2)', fontSize:11, fontFamily:'var(--ff-text)' }}>Annuler</button>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Floating format bubble */}
      {selRect && selRect.width > 0 && (
        <div style={{ position:'fixed', top:selRect.top-46, left:Math.max(10,selRect.left+selRect.width/2-105), background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:10, padding:'5px 8px', display:'flex', gap:2, zIndex:200, boxShadow:'0 6px 24px rgba(0,0,0,0.5)' }}>
          {fmtBtn('bold','bold','Gras')}
          {fmtBtn('italic','italic','Italique')}
          {fmtBtn('underline','underline','Souligné')}
          {fmtBtn('strikeThrough','strikethrough','Barré')}
          <div style={{ width:1, height:18, background:'var(--border)', margin:'0 2px' }} />
          {[['h1','T1'],['h2','T2'],['p','¶']].map(([tag,lbl])=>(
            <button key={tag} onMouseDown={e=>{e.preventDefault();exec('formatBlock',tag);}} style={{ padding:'4px 7px', borderRadius:6, border:'none', cursor:'pointer', background:'transparent', color:'var(--text-2)', fontSize:11, fontWeight:600 }}>{lbl}</button>
          ))}
          <div style={{ width:1, height:18, background:'var(--border)', margin:'0 2px' }} />
          <button title="Commenter" onMouseDown={e=>{e.preventDefault(); addCommentAnchor();}} style={{ padding:'4px 7px', borderRadius:6, border:'none', cursor:'pointer', background:'transparent', color:'var(--accent)', display:'flex' }}>
            <SFIcon name="message-square" size={14} />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Inspirations View (two-panel) ─────────────────────────────────────────────

function getAutoThumb(url: string): string | null {
  if (!url) return null;
  const full = url.startsWith('http') ? url : `https://${url}`;
  const ytMatch = full.match(/(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/))([a-zA-Z0-9_-]{11})/);
  if (ytMatch) return `https://img.youtube.com/vi/${ytMatch[1]}/hqdefault.jpg`;
  try {
    const domain = new URL(full).hostname;
    return `https://image.thum.io/get/width/400/crop/240/noanimate/${full}`;
  } catch { return null; }
}

function InspirationsView({ resource }: { resource: Resource }) {
  const [items, setItems] = useState<InspiItem[]>(INITIAL_INSPI);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const [likesNotes, setLikesNotes] = useState('Lumière naturelle diffuse, tons chauds dorés. Compositions épurées avec beaucoup de blanc. Typographie fine et élégante. Regards directs, proximité avec le sujet.');
  const [avoidsNotes, setAvoidsNotes] = useState('Éclairages trop durs ou flashy. Couleurs saturées ou trop vives. Poses trop construites ou artificielles.');
  const [themes, setThemes] = useState(['Mode de saison','Éclairage naturel','Luxe accessible','Beauté intemporelle']);
  const [themeInput, setThemeInput] = useState('');
  const [direction, setDirection] = useState('Direction artistique : lumière naturelle, tons chauds et froids en contraste. Inspiration années 70 revisitée dans un contexte contemporain parisien.');
  const palette = ['#1e2d3d','#3d2a1e','#1e3d2d','#3d3d1e','#2d1e3d','#3d2a0e'];

  const addItem = () => {
    setItems(p => [...p, { id:`in${Date.now()}`, title:'Nouvelle référence', url:'', bg:`#${Math.floor(Math.random()*0x444444+0x111111).toString(16).padStart(6,'0')}`, tags:[], notes:'' }]);
  };
  const updateItem = (id: string, patch: Partial<InspiItem>) => setItems(p => p.map(i => i.id===id ? {...i,...patch} : i));
  const removeItem = (id: string) => setItems(p => p.filter(i => i.id!==id));

  return (
    <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
      {/* Left: reference grid */}
      <div style={{ flex:1, overflow:'auto', padding:'20px 24px' }}>
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:16 }}>
          <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Références visuelles ({items.length})</p>
          <SFButton variant="primary" size="sm" icon="plus" onClick={addItem}>Ajouter</SFButton>
        </div>

        <div style={{ display:'grid', gridTemplateColumns:'repeat(3, 1fr)', gap:14 }}>
          {items.map(item => {
            const thumbSrc = item.imageUrl || getAutoThumb(item.url);
            const href = item.url ? (item.url.startsWith('http') ? item.url : `https://${item.url}`) : null;
            return (
            <div
              key={item.id}
              onMouseEnter={() => setHoveredId(item.id)}
              onMouseLeave={() => setHoveredId(null)}
              style={{ background:'var(--surface)', borderRadius:12, border:'1px solid var(--border)', overflow:'hidden', display:'flex', flexDirection:'column' }}
            >
              {/* Thumbnail */}
              <div
                onClick={() => href && window.open(href, '_blank', 'noreferrer')}
                title={href ? `Ouvrir ${item.url}` : undefined}
                style={{ width:'100%', aspectRatio:'16/10', background:item.bg, flexShrink:0, display:'flex', alignItems:'center', justifyContent:'center', position:'relative', cursor: href ? 'pointer' : 'default', overflow:'hidden' }}
              >
                {thumbSrc
                  ? <img src={thumbSrc} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} onError={e => { (e.target as HTMLImageElement).style.display='none'; }} />
                  : <SFIcon name="image" size={28} color="rgba(255,255,255,0.1)" />}
                {/* Top-right controls — visible on card hover */}
                <div style={{ position:'absolute', top:6, right:6, display:'flex', gap:4, opacity: hoveredId === item.id ? 1 : 0, transition:'opacity 0.15s' }}>
                  {href && (
                    <div style={{ width:24, height:24, borderRadius:6, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                      <SFIcon name="external-link" size={12} color="white" />
                    </div>
                  )}
                  <button
                    onClick={e => { e.stopPropagation(); removeItem(item.id); }}
                    style={{ width:24, height:24, borderRadius:6, background:'rgba(0,0,0,0.6)', border:'none', display:'flex', alignItems:'center', justifyContent:'center', cursor:'pointer' }}
                  >
                    <SFIcon name="trash-2" size={11} color="white" />
                  </button>
                </div>
              </div>
              {/* Content */}
              <div style={{ padding:'10px 12px', flex:1, display:'flex', flexDirection:'column', gap:4 }}>
                <input
                  value={item.title}
                  onChange={e => updateItem(item.id, { title: e.target.value })}
                  style={{ background:'transparent', border:'none', color:'var(--text)', fontSize:12, fontWeight:600, outline:'none', fontFamily:'var(--ff-text)', width:'100%' }}
                />
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <SFIcon name="link" size={10} color="var(--text-3)" />
                  <input
                    value={item.url}
                    onChange={e => updateItem(item.id, { url: e.target.value })}
                    placeholder="URL source…"
                    style={{ flex:1, background:'transparent', border:'none', color:'var(--text-3)', fontSize:10, fontFamily:'var(--ff-mono)', outline:'none', minWidth:0 }}
                  />
                </div>
                <textarea
                  value={item.notes}
                  onChange={e => updateItem(item.id, { notes: e.target.value })}
                  placeholder="Notes, impressions…"
                  rows={5}
                  style={{ width:'100%', background:'transparent', border:'none', borderTop:'1px solid var(--border)', color:'var(--text-2)', fontSize:11, fontFamily:'var(--ff-text)', padding:'6px 0 0', outline:'none', resize:'none', lineHeight:1.55, boxSizing:'border-box', colorScheme:'dark', marginTop:4 }}
                />
              </div>
            </div>
            );
          })}
          {/* Add card */}
          <button
            onClick={addItem}
            style={{ aspectRatio:'16/10', borderRadius:12, border:'1px dashed var(--border-2)', background:'transparent', color:'var(--text-3)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', minHeight:120 }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--accent)'; (e.currentTarget as HTMLElement).style.color='var(--accent)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor='var(--border-2)'; (e.currentTarget as HTMLElement).style.color='var(--text-3)'; }}
          >
            <SFIcon name="plus" size={20} color="inherit" />
            <span style={{ fontSize:11, fontFamily:'var(--ff-text)' }}>Ajouter</span>
          </button>
        </div>
      </div>

      {/* Right: inspiration column */}
      <div style={{ width:300, flexShrink:0, borderLeft:'1px solid var(--border)', overflow:'auto', padding:'20px 16px', display:'flex', flexDirection:'column', gap:20 }}>
        <div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--ok)', flexShrink:0 }} />
            <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Ce qui nous plaît</p>
          </div>
          <textarea
            value={likesNotes}
            onChange={e => setLikesNotes(e.target.value)}
            placeholder="Éléments visuels, ambiances, techniques qui nous inspirent…"
            rows={5}
            style={{ width:'100%', padding:'10px', borderRadius:9, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:12, fontFamily:'var(--ff-text)', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box', colorScheme:'dark' }}
          />
        </div>

        <div>
          <div style={{ display:'flex', alignItems:'center', gap:6, marginBottom:8 }}>
            <div style={{ width:8, height:8, borderRadius:'50%', background:'var(--danger)', flexShrink:0 }} />
            <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em' }}>Ce qu'on évite</p>
          </div>
          <textarea
            value={avoidsNotes}
            onChange={e => setAvoidsNotes(e.target.value)}
            placeholder="Éléments à ne pas reproduire, styles à éviter…"
            rows={4}
            style={{ width:'100%', padding:'10px', borderRadius:9, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:12, fontFamily:'var(--ff-text)', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box', colorScheme:'dark' }}
          />
        </div>

        <div>
          <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Palette extraite</p>
          <div style={{ display:'flex', gap:6 }}>
            {palette.map((c,i)=>(
              <div key={i} title={c} style={{ flex:1, height:32, borderRadius:7, background:c, border:'1px solid rgba(255,255,255,0.1)' }} />
            ))}
          </div>
        </div>

        <div>
          <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Thèmes clés</p>
          <div style={{ display:'flex', flexDirection:'column', gap:5 }}>
            {themes.map((t,i)=>(
              <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
                <div style={{ width:5, height:5, borderRadius:'50%', background:'var(--accent)', flexShrink:0 }} />
                <input value={t} onChange={e=>setThemes(p=>p.map((x,j)=>j===i?e.target.value:x))}
                  style={{ flex:1, background:'transparent', border:'none', color:'var(--text-2)', fontSize:12, fontFamily:'var(--ff-text)', outline:'none' }}
                />
                <button onClick={()=>setThemes(p=>p.filter((_,j)=>j!==i))} style={{ background:'none', border:'none', color:'var(--text-3)', cursor:'pointer', padding:0 }}>×</button>
              </div>
            ))}
            <input value={themeInput} onChange={e=>setThemeInput(e.target.value)}
              onKeyDown={e=>{ if(e.key==='Enter'&&themeInput.trim()){ setThemes(p=>[...p,themeInput.trim()]); setThemeInput(''); }}}
              placeholder="+ Nouveau thème"
              style={{ padding:'5px 8px', borderRadius:7, border:'1px dashed var(--border-2)', background:'transparent', color:'var(--text-3)', fontSize:11, fontFamily:'var(--ff-text)', outline:'none', colorScheme:'dark' }}
            />
          </div>
        </div>

        <div>
          <p style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', marginBottom:8 }}>Direction générale</p>
          <textarea value={direction} onChange={e=>setDirection(e.target.value)} rows={5}
            style={{ width:'100%', padding:'10px', borderRadius:9, border:'1px solid var(--border)', background:'var(--surface-2)', color:'var(--text)', fontSize:12, fontFamily:'var(--ff-text)', resize:'vertical', outline:'none', lineHeight:1.6, boxSizing:'border-box', colorScheme:'dark' }}
          />
        </div>
      </div>
    </div>
  );
}

// ── Resource topbar ───────────────────────────────────────────────────────────

function ResourceTopbar({ project, resource, onStatusChange, saveState = 'saved', online = true, editable = false, onExport }: { project: typeof PROJECTS[0] | undefined; resource: Resource; onStatusChange: (status: Status, label: string) => void; saveState?: SaveState; online?: boolean; editable?: boolean; onExport?: (f: ExportFormat) => void }) {
  const [dropOpen, setDropOpen] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);
  const [expOpen, setExpOpen] = useState(false);
  const expRef = useRef<HTMLDivElement>(null);
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleVal, setTitleVal] = useState(resource.title);
  const titleInputRef = useRef<HTMLInputElement>(null);
  const [editingDesc, setEditingDesc] = useState(false);
  const [descVal, setDescVal] = useState(resource.description ?? '');

  useEffect(() => { setTitleVal(resource.title); }, [resource.title]);
  useEffect(() => { setDescVal(resource.description ?? ''); }, [resource.description]);
  useEffect(() => { if (editingTitle) titleInputRef.current?.select(); }, [editingTitle]);

  const commitTitle = () => {
    const trimmed = titleVal.trim();
    if (trimmed && trimmed !== resource.title) updateResource(resource.id, { title: trimmed });
    else setTitleVal(resource.title);
    setEditingTitle(false);
  };

  const commitDesc = () => {
    const trimmed = descVal.trim();
    updateResource(resource.id, { description: trimmed || undefined });
    setEditingDesc(false);
  };

  useEffect(() => {
    if (!dropOpen) return;
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dropOpen]);

  useEffect(() => {
    if (!expOpen) return;
    const close = (e: MouseEvent) => {
      if (expRef.current && !expRef.current.contains(e.target as Node)) setExpOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [expOpen]);

  return (
    <div style={{ background:'var(--surface)', flexShrink:0 }}>
      <div style={{ padding:'10px 24px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'flex-end', gap:8 }}>
        <div style={{ display:'flex', gap:8, alignItems:'center', position:'relative' }}>
          <div style={{ display:'flex', alignItems:'center', gap:6, padding:'5px 10px', background:'var(--surface-2)', borderRadius:8, border:'1px solid var(--border)' }}>
            <SFIcon name={TYPE_ICON[resource.type]} size={13} color="var(--text-3)" />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em' }}>{TYPE_LABEL[resource.type]}</span>
          </div>
          {/* Status — clickable dropdown */}
          <button
            onClick={() => setDropOpen(o => !o)}
            style={{ background:'none', border:'none', padding:0, cursor:'pointer', display:'flex', alignItems:'center', gap:4 }}
            title="Changer le statut"
          >
            <SFPill status={resource.status} small>{resource.statusLabel}</SFPill>
            <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
          </button>
          {dropOpen && (
            <div
              ref={dropRef}
              style={{
                position:'absolute', top:'calc(100% + 6px)', left:0,
                zIndex:200, background:'var(--surface-3)', border:'1px solid var(--border-2)',
                borderRadius:10, padding:4, minWidth:160, boxShadow:'0 8px 24px rgba(0,0,0,0.5)',
              }}
            >
              {STATUS_OPTIONS.map(opt => (
                <button key={opt.status}
                  onClick={() => { onStatusChange(opt.status, opt.label); setDropOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:8, width:'100%', padding:'6px 10px', border:'none', background: resource.status === opt.status ? 'var(--surface)' : 'transparent', cursor:'pointer', borderRadius:7 }}
                  onMouseEnter={e => (e.currentTarget.style.background='var(--surface)')}
                  onMouseLeave={e => (e.currentTarget.style.background=resource.status===opt.status?'var(--surface)':'transparent')}
                >
                  <SFPill status={opt.status} small>{opt.label}</SFPill>
                </button>
              ))}
            </div>
          )}
          {editable && <SaveIndicator state={saveState} online={online} />}
          {editable ? (
            <div ref={expRef} style={{ position:'relative' }}>
              <SFButton variant="ghost" size="sm" icon="download" iconRight="chevron-down" onClick={() => setExpOpen(o => !o)}>Exporter</SFButton>
              {expOpen && (
                <div style={{ position:'absolute', top:'calc(100% + 6px)', right:0, zIndex:200, background:'var(--surface-3)', border:'1px solid var(--border-2)', borderRadius:10, padding:4, minWidth:200, boxShadow:'0 8px 24px rgba(0,0,0,0.5)' }}>
                  <button
                    onClick={() => { onExport?.('pdf'); setExpOpen(false); }}
                    style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 10px', border:'none', background:'transparent', cursor:'pointer', borderRadius:7, textAlign:'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background='var(--surface)')}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                  >
                    <SFIcon name="file-text" size={15} color="var(--text-2)" />
                    <span style={{ fontSize:12, color:'var(--text)' }}>Exporter en PDF</span>
                  </button>
                  <button
                    disabled={!online}
                    onClick={() => { if (online) { onExport?.('gdocs'); setExpOpen(false); } }}
                    style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 10px', border:'none', background:'transparent', cursor: online ? 'pointer' : 'not-allowed', opacity: online ? 1 : 0.5, borderRadius:7, textAlign:'left' }}
                    onMouseEnter={e => { if (online) e.currentTarget.style.background='var(--surface)'; }}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                  >
                    <SFIcon name="file" size={15} color="var(--text-2)" />
                    <span style={{ fontSize:12, color:'var(--text)' }}>Exporter vers Google Docs</span>
                    {!online && <span style={{ marginLeft:'auto', fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)' }}>hors ligne</span>}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <SFButton variant="ghost" size="sm" icon="download">Exporter</SFButton>
          )}
          <SFButton variant="ghost" size="sm" icon="share-2">Partager</SFButton>
        </div>
      </div>
      <div style={{ padding:'10px 24px', display:'flex', alignItems:'center', gap:10, borderBottom:'1px solid var(--border)' }}>
        <div style={{ width:30, height:30, borderRadius:8, background:'var(--surface-2)', border:'1px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <SFIcon name={TYPE_ICON[resource.type]} size={15} color="var(--accent)" />
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          {editingTitle ? (
            <input
              ref={titleInputRef}
              value={titleVal}
              onChange={e => setTitleVal(e.target.value)}
              onBlur={commitTitle}
              onKeyDown={e => { if (e.key === 'Enter') commitTitle(); if (e.key === 'Escape') { setTitleVal(resource.title); setEditingTitle(false); } }}
              style={{ fontSize:15, fontWeight:700, background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:6, padding:'2px 8px', outline:'none', color:'var(--text)', fontFamily:'var(--ff-display)', width:'100%', maxWidth:400 }}
            />
          ) : (
            <h2
              onClick={() => setEditingTitle(true)}
              title="Cliquer pour renommer"
              style={{ fontSize:15, fontWeight:700, cursor:'text', display:'inline-flex', alignItems:'center', gap:6, maxWidth:'100%', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}
            >
              {resource.title}
              <SFIcon name="pencil" size={11} color="var(--text-3)" />
            </h2>
          )}
          <p style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-mono)', marginTop:1 }}>{resource.meta}</p>
          {editingDesc ? (
            <textarea
              autoFocus
              value={descVal}
              onChange={e => setDescVal(e.target.value)}
              onBlur={commitDesc}
              onKeyDown={e => { if (e.key === 'Escape') { setDescVal(resource.description ?? ''); setEditingDesc(false); } }}
              style={{ fontSize:11, color:'var(--text-2)', background:'var(--surface-2)', border:'1px solid var(--accent)', borderRadius:5, padding:'2px 6px', outline:'none', resize:'none', width:'100%', maxWidth:400, fontFamily:'var(--ff-text)', marginTop:3, display:'block' }}
              rows={2}
            />
          ) : (
            <p
              onClick={() => setEditingDesc(true)}
              title="Cliquer pour modifier la description"
              style={{ fontSize:11, color: descVal ? 'var(--text-2)' : 'var(--text-3)', cursor:'text', marginTop:3, fontStyle: descVal ? 'normal' : 'italic' }}
            >
              {descVal || 'Ajouter une description...'}
            </p>
          )}
        </div>
        {resource.version && (
          <span style={{ marginLeft:4, fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', background:'var(--surface-2)', borderRadius:6, padding:'3px 9px', border:'1px solid var(--border)' }}>{resource.version}</span>
        )}
      </div>
    </div>
  );
}

// ── Form View ─────────────────────────────────────────────────────────────────

export type FormQType = 'short' | 'long' | 'choice' | 'checkbox' | 'dropdown' | 'date' | 'rating' | 'scale' | 'upload' | 'section';

interface FormOption { id: string; label: string; }
export interface FormQuestion {
  id: string;
  type: FormQType;
  title: string;
  description: string;
  required: boolean;
  options: FormOption[];        // for choice / checkbox / dropdown
  ratingMax: number;            // for rating
  scaleMin: number; scaleMax: number; scaleMinLabel: string; scaleMaxLabel: string; // for scale
  placeholder: string;
}

interface FormResponder {
  name: string;
  email: string;
  initials: string;
  bg: string;
  source: 'platform' | 'link' | 'email';
}
interface FormResponse {
  id: string;
  submittedAt: string;
  responder: FormResponder;
  answers: Record<string, string | string[]>;
}

const FORM_Q_TYPES: { type: FormQType; label: string; icon: string }[] = [
  { type: 'short',    label: 'Texte court',      icon: 'minus' },
  { type: 'long',     label: 'Texte long',        icon: 'align-left' },
  { type: 'choice',   label: 'Choix unique',      icon: 'circle-dot' },
  { type: 'checkbox', label: 'Cases à cocher',    icon: 'check-square' },
  { type: 'dropdown', label: 'Liste déroulante',  icon: 'chevron-down' },
  { type: 'date',     label: 'Date',              icon: 'calendar' },
  { type: 'rating',   label: 'Évaluation ★',     icon: 'star' },
  { type: 'scale',    label: 'Échelle linéaire',  icon: 'sliders-horizontal' },
  { type: 'upload',   label: 'Upload de fichier', icon: 'upload' },
  { type: 'section',  label: 'Section',           icon: 'separator-horizontal' },
];

const FORM_ACCENT_COLORS = [
  '#6366f1','#8b5cf6','#ec4899','#ef4444','#f97316','#eab308','#22c55e','#14b8a6','#3b82f6','#06b6d4',
];

export function mkQ(type: FormQType): FormQuestion {
  return {
    id: `q${Date.now()}-${Math.random().toString(36).slice(2,6)}`,
    type, title: '', description: '', required: false,
    options: type === 'choice' || type === 'checkbox' || type === 'dropdown'
      ? [{ id:`o1-${Date.now()}`, label:'Option 1' }, { id:`o2-${Date.now()}`, label:'Option 2' }]
      : [],
    ratingMax: 5,
    scaleMin: 1, scaleMax: 5, scaleMinLabel: 'Pas du tout', scaleMaxLabel: 'Tout à fait',
    placeholder: '',
  };
}

const INIT_FORM_QUESTIONS: FormQuestion[] = [
  { id:'fq1', type:'short',    title:'Votre nom complet',         description:'', required:true,  options:[], ratingMax:5, scaleMin:1, scaleMax:5, scaleMinLabel:'', scaleMaxLabel:'', placeholder:'Ex. Jean Dupont' },
  { id:'fq2', type:'choice',   title:'Comment nous avez-vous connu ?', description:'', required:false, options:[{id:'o1',label:'Recommandation'},{id:'o2',label:'Réseaux sociaux'},{id:'o3',label:'Recherche web'},{id:'o4',label:'Autre'}], ratingMax:5, scaleMin:1, scaleMax:5, scaleMinLabel:'', scaleMaxLabel:'', placeholder:'' },
  { id:'fq3', type:'rating',   title:'Niveau de satisfaction global', description:'Notez votre expérience de 1 à 5 étoiles', required:true, options:[], ratingMax:5, scaleMin:1, scaleMax:5, scaleMinLabel:'', scaleMaxLabel:'', placeholder:'' },
  { id:'fq4', type:'long',     title:'Commentaires et suggestions', description:'Vos retours nous aident à nous améliorer', required:false, options:[], ratingMax:5, scaleMin:1, scaleMax:5, scaleMinLabel:'', scaleMaxLabel:'', placeholder:'Écrivez votre message ici…' },
];

const MOCK_RESPONSES: FormResponse[] = [
  { id:'fr1', submittedAt:'8 juin, 14:32',  responder:{ name:'Marie Laurent', email:'marie.laurent@gmail.com',  initials:'ML', bg:'#3b4f8f', source:'platform' }, answers:{ fq1:'Marie Laurent', fq2:'Recommandation',  fq3:'5', fq4:'Excellent service, je recommande vivement !' } },
  { id:'fr2', submittedAt:'9 juin, 09:11',  responder:{ name:'Thomas Girard', email:'t.girard@studio-nova.com', initials:'TG', bg:'#1a6b4a', source:'email'    }, answers:{ fq1:'Thomas Girard', fq2:'Réseaux sociaux', fq3:'4', fq4:'' } },
  { id:'fr3', submittedAt:'10 juin, 16:45', responder:{ name:'Sophie Martin', email:'sophiemartin@outlook.fr',  initials:'SM', bg:'#8b3a8b', source:'link'     }, answers:{ fq1:'Sophie Martin', fq2:'Recherche web',   fq3:'3', fq4:'Bon travail mais quelques délais à améliorer.' } },
];

export function FormView({ resource, templateMode, initialQuestions, onSaveTemplate }: {
  resource: Resource;
  templateMode?: boolean;
  initialQuestions?: FormQuestion[];
  onSaveTemplate?: (q: FormQuestion[]) => void;
}) {
  const [tab, setTab] = useState<'build' | 'preview' | 'responses'>('build');
  const [questions, setQuestions] = useState<FormQuestion[]>(initialQuestions ?? INIT_FORM_QUESTIONS);
  const [responses] = useState<FormResponse[]>(MOCK_RESPONSES);
  const [accent, setAccent] = useState(FORM_ACCENT_COLORS[0]);
  const [formTitle, setFormTitle] = useState(resource.title);
  const [formDesc, setFormDesc] = useState('Merci de remplir ce formulaire. Vos réponses nous aident à améliorer nos services.');
  const [selectedQ, setSelectedQ] = useState<string | null>('fq1');
  const [showTypeMenu, setShowTypeMenu] = useState<string | null>(null);
  const [draggingQ, setDraggingQ] = useState<string | null>(null);
  const [dragOverQ, setDragOverQ] = useState<string | null>(null);
  const [previewAnswers, setPreviewAnswers] = useState<Record<string, string | string[]>>({});
  const [previewSubmitted, setPreviewSubmitted] = useState(false);
  const [responseIdx, setResponseIdx] = useState(0);
  const [showSettings, setShowSettings] = useState(false);
  const [collectIdentity, setCollectIdentity] = useState(true);
  const [shareLink] = useState('https://rush.app/f/q-satisfaction-cl3x9z');
  const [linkCopied, setLinkCopied] = useState(false);

  const selectedQuestion = questions.find(q => q.id === selectedQ);

  const updateQ = (id: string, patch: Partial<FormQuestion>) =>
    setQuestions(qs => qs.map(q => q.id === id ? { ...q, ...patch } : q));

  const addQuestion = (type: FormQType) => {
    const nq = mkQ(type);
    setQuestions(qs => [...qs, nq]);
    setSelectedQ(nq.id);
  };

  const duplicateQ = (id: string) => {
    const idx = questions.findIndex(q => q.id === id);
    if (idx < 0) return;
    const copy = { ...questions[idx], id: `q${Date.now()}`, options: questions[idx].options.map(o => ({ ...o })) };
    setQuestions(qs => [...qs.slice(0, idx+1), copy, ...qs.slice(idx+1)]);
    setSelectedQ(copy.id);
  };

  const deleteQ = (id: string) => {
    setQuestions(qs => {
      const next = qs.filter(q => q.id !== id);
      if (selectedQ === id) setSelectedQ(next[0]?.id ?? null);
      return next;
    });
  };

  const addOption = (qid: string) => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    const n = q.options.length + 1;
    updateQ(qid, { options: [...q.options, { id:`o${Date.now()}`, label:`Option ${n}` }] });
  };

  const updateOption = (qid: string, oid: string, label: string) => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    updateQ(qid, { options: q.options.map(o => o.id === oid ? { ...o, label } : o) });
  };

  const deleteOption = (qid: string, oid: string) => {
    const q = questions.find(x => x.id === qid);
    if (!q) return;
    updateQ(qid, { options: q.options.filter(o => o.id !== oid) });
  };

  const handleDragStart = (id: string) => setDraggingQ(id);
  const handleDragOver = (e: React.DragEvent, id: string) => { e.preventDefault(); setDragOverQ(id); };
  const handleDrop = (e: React.DragEvent, targetId: string) => {
    e.preventDefault();
    if (!draggingQ || draggingQ === targetId) { setDraggingQ(null); setDragOverQ(null); return; }
    setQuestions(qs => {
      const from = qs.findIndex(q => q.id === draggingQ);
      const to   = qs.findIndex(q => q.id === targetId);
      const next = [...qs];
      const [item] = next.splice(from, 1);
      next.splice(to, 0, item);
      return next;
    });
    setDraggingQ(null); setDragOverQ(null);
  };

  const previewToggleCheck = (qid: string, val: string) => {
    setPreviewAnswers(prev => {
      const cur = (prev[qid] as string[] | undefined) ?? [];
      return { ...prev, [qid]: cur.includes(val) ? cur.filter(x => x !== val) : [...cur, val] };
    });
  };

  // ── Response summary stats
  const getStats = (qid: string, q: FormQuestion) => {
    if (q.type === 'rating') {
      const vals = responses.map(r => Number(r.answers[qid])).filter(v => !isNaN(v) && v > 0);
      if (!vals.length) return null;
      const avg = vals.reduce((a,b) => a+b, 0) / vals.length;
      return { avg: avg.toFixed(1), count: vals.length };
    }
    if (q.type === 'choice' || q.type === 'dropdown') {
      const counts: Record<string, number> = {};
      responses.forEach(r => { const v = r.answers[qid] as string; if (v) counts[v] = (counts[v]||0)+1; });
      return counts;
    }
    return null;
  };

  const btnBase: React.CSSProperties = { padding:'7px 16px', borderRadius:8, border:'none', cursor:'pointer', fontSize:12, fontFamily:'var(--ff-text)', fontWeight:500 };
  const tabStyle = (active: boolean): React.CSSProperties => ({
    padding:'7px 20px', borderRadius:20, border:'none', cursor:'pointer', fontSize:13,
    fontFamily:'var(--ff-text)', fontWeight:500, transition:'all .15s',
    background: active ? accent : 'transparent',
    color: active ? '#fff' : 'var(--text-2)',
  });

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden', background:'var(--bg)' }}>
      <style>{`
        .fv-q-card{border-radius:12px;border:1.5px solid var(--border-1);background:var(--surface-1);transition:border-color .15s,box-shadow .15s;cursor:pointer}
        .fv-q-card:hover{border-color:var(--border-2)}
        .fv-q-card.selected{border-color:${accent};box-shadow:0 0 0 3px ${accent}22}
        .fv-q-card.drag-over{border-color:${accent};border-style:dashed}
        .fv-option-row:hover .fv-opt-del{opacity:1!important}
        .fv-preview-input{width:100%;padding:10px 14px;border-radius:8px;border:1.5px solid var(--border-2);background:var(--surface-2);color:var(--text);font-size:14px;font-family:var(--ff-text);outline:none;transition:border-color .15s}
        .fv-preview-input:focus{border-color:${accent}}
        .fv-star:hover~.fv-star,.fv-star-group:hover .fv-star{color:#d1d5db}
        .fv-resp-row:hover{background:var(--surface-2)}
      `}</style>

      {/* Top bar */}
      <div style={{ padding:'12px 24px', borderBottom:'1px solid var(--border-1)', display:'flex', alignItems:'center', justifyContent:'space-between', gap:16, flexShrink:0 }}>
        <div style={{ display:'flex', gap:4, background:'var(--surface-2)', borderRadius:24, padding:3 }}>
          {(['build','preview','responses'] as const).map(t => {
            const isResponses = t === 'responses';
            const disabled = templateMode && isResponses;
            return (
              <button key={t}
                disabled={disabled}
                style={{ ...tabStyle(tab===t), opacity: disabled ? 0.4 : 1, cursor: disabled ? 'not-allowed' : 'pointer' }}
                onClick={() => { if (!disabled) { setTab(t); setPreviewSubmitted(false); } }}>
                {t==='build' ? 'Éditeur' : t==='preview' ? 'Aperçu' : templateMode ? 'Réponses (N/A)' : `Réponses (${responses.length})`}
              </button>
            );
          })}
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <button onClick={() => setShowSettings(s => !s)}
            style={{ ...btnBase, background:showSettings?'var(--surface-3)':'var(--surface-2)', color:'var(--text-2)', border:'1px solid var(--border-2)', display:'flex', alignItems:'center', gap:6 }}>
            <SFIcon name="settings-2" size={13} />
            Paramètres
          </button>
          {templateMode && onSaveTemplate ? (
            <button onClick={() => onSaveTemplate(questions)}
              style={{ ...btnBase, background:accent, color:'#fff', display:'flex', alignItems:'center', gap:6 }}>
              <SFIcon name="save" size={13} />
              Sauvegarder le modèle
            </button>
          ) : !templateMode ? (
            <button onClick={() => { navigator.clipboard?.writeText(shareLink); setLinkCopied(true); setTimeout(()=>setLinkCopied(false),2000); }}
              style={{ ...btnBase, background:accent, color:'#fff', display:'flex', alignItems:'center', gap:6 }}>
              <SFIcon name={linkCopied?'check':'send'} size={13} />
              {linkCopied ? 'Lien copié !' : 'Partager'}
            </button>
          ) : null}
        </div>
      </div>

      {/* Settings modal overlay */}
      {showSettings && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowSettings(false); }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.55)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:1, background:'var(--surface-1)', border:'1px solid var(--border-2)', borderRadius:18, width:'min(680px, 92vw)', maxHeight:'86vh', overflowY:'auto', boxShadow:'0 24px 64px rgba(0,0,0,0.6)' }}>
            {/* Modal header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 24px 16px', borderBottom:'1px solid var(--border-1)' }}>
              <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                <div style={{ width:32, height:32, borderRadius:8, background:`${accent}22`, display:'flex', alignItems:'center', justifyContent:'center' }}>
                  <SFIcon name="settings-2" size={16} color={accent} />
                </div>
                <div>
                  <div style={{ fontSize:15, fontWeight:700, color:'var(--text)', fontFamily:'var(--ff-display)' }}>Paramètres du formulaire</div>
                  <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-text)', marginTop:1 }}>Apparence, accès et comportement</div>
                </div>
              </div>
              <button onClick={() => setShowSettings(false)}
                style={{ width:30, height:30, borderRadius:8, border:'none', background:'var(--surface-2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center', color:'var(--text-2)' }}>
                <SFIcon name="x" size={14} />
              </button>
            </div>

            <div style={{ padding:'24px' }}>
              {/* Section: Couleur d'accent */}
              <div style={{ marginBottom:28 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.09em', fontFamily:'var(--ff-text)', marginBottom:12 }}>Couleur d'accent</div>
                <div style={{ display:'flex', gap:10, flexWrap:'wrap' }}>
                  {FORM_ACCENT_COLORS.map(c => (
                    <button key={c} onClick={() => setAccent(c)}
                      style={{ width:36, height:36, borderRadius:10, background:c, border: accent===c ? `3px solid var(--text)` : '3px solid transparent', cursor:'pointer', padding:0, outline:'none', flexShrink:0, transition:'transform .12s, border-color .12s', transform:accent===c?'scale(1.18)':'scale(1)', boxShadow:accent===c?`0 0 0 2px ${c}55`:'none' }} />
                  ))}
                </div>
                <div style={{ marginTop:12, display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:18, height:18, borderRadius:4, background:accent }} />
                  <span style={{ fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-mono)' }}>{accent}</span>
                </div>
              </div>

              <div style={{ height:1, background:'var(--border-1)', marginBottom:24 }} />

              {/* Section: Identité */}
              <div style={{ marginBottom:28 }}>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.09em', fontFamily:'var(--ff-text)', marginBottom:12 }}>Identité du répondant</div>
                <label style={{ display:'flex', alignItems:'flex-start', gap:14, cursor:'pointer' }}>
                  <div onClick={() => setCollectIdentity(v=>!v)}
                    style={{ width:42, height:24, borderRadius:12, background:collectIdentity?accent:'var(--border-2)', position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0, marginTop:2 }}>
                    <div style={{ position:'absolute', top:3, left:collectIdentity?20:3, width:18, height:18, borderRadius:'50%', background:'#fff', transition:'left .2s', boxShadow:'0 1px 4px rgba(0,0,0,0.3)' }} />
                  </div>
                  <div>
                    <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:'var(--ff-text)', marginBottom:3 }}>Collecter nom &amp; email automatiquement</div>
                    <div style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)', lineHeight:1.55 }}>
                      Si le répondant est connecté à la plateforme, ses informations sont préremplies automatiquement. Sinon, il devra les saisir manuellement avant de soumettre.
                    </div>
                  </div>
                </label>
              </div>

              <div style={{ height:1, background:'var(--border-1)', marginBottom:24 }} />

              {/* Section: Partage */}
              <div>
                <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.09em', fontFamily:'var(--ff-text)', marginBottom:12 }}>Partage &amp; accès</div>

                <div style={{ display:'flex', gap:8, marginBottom:12 }}>
                  {(['Lien public','Lien privé','Invitation par email'] as const).map((opt, i) => (
                    <button key={opt} style={{ ...btnBase, background: i===0?`${accent}22`:'var(--surface-2)', color: i===0?accent:'var(--text-3)', border:`1.5px solid ${i===0?accent:'var(--border-2)'}`, fontSize:12, padding:'8px 16px' }}>
                      {opt}
                    </button>
                  ))}
                </div>

                <div style={{ display:'flex', gap:8, marginBottom:10 }}>
                  <div style={{ flex:1, padding:'10px 14px', background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:10, fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-mono)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {shareLink}
                  </div>
                  <button onClick={() => { navigator.clipboard?.writeText(shareLink); setLinkCopied(true); setTimeout(()=>setLinkCopied(false),2000); }}
                    style={{ ...btnBase, background:linkCopied?`${accent}22`:'var(--surface-2)', color:linkCopied?accent:'var(--text-2)', border:`1px solid ${linkCopied?accent:'var(--border-2)'}`, display:'flex', alignItems:'center', gap:6, flexShrink:0, transition:'all .2s' }}>
                    <SFIcon name={linkCopied?'check':'copy'} size={13} />
                    {linkCopied?'Copié !':'Copier le lien'}
                  </button>
                </div>

                <div style={{ background:`${accent}0d`, border:`1px solid ${accent}33`, borderRadius:10, padding:'12px 14px', display:'flex', gap:10 }}>
                  <SFIcon name="info" size={14} color={accent} style={{ flexShrink:0, marginTop:1 }} />
                  <p style={{ margin:0, fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-text)', lineHeight:1.6 }}>
                    Envoyez ce lien à vos clients avant qu'ils rejoignent la plateforme. Lorsqu'ils créeront leur compte, leurs réponses seront automatiquement liées à leur profil.
                  </p>
                </div>
              </div>
            </div>

            {/* Modal footer */}
            <div style={{ padding:'16px 24px', borderTop:'1px solid var(--border-1)', display:'flex', justifyContent:'flex-end' }}>
              <button onClick={() => setShowSettings(false)}
                style={{ ...btnBase, background:accent, color:'#fff', padding:'9px 24px', fontSize:13 }}>
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ─── BUILDER TAB ─── */}
      {tab === 'build' && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>

          {/* Left: question list */}
          <div style={{ width:320, borderRight:'1px solid var(--border-1)', display:'flex', flexDirection:'column', overflow:'hidden', flexShrink:0 }}>
            {/* Form header card */}
            <div style={{ padding:'16px 16px 12px', borderBottom:'1px solid var(--border-1)', flexShrink:0 }}>
              <div style={{ borderRadius:12, overflow:'hidden', border:`3px solid ${accent}` }}>
                <div style={{ height:6, background:accent }} />
                <div style={{ padding:'12px 14px', background:'var(--surface-1)' }}>
                  <input value={formTitle} onChange={e => setFormTitle(e.target.value)}
                    placeholder="Titre du formulaire"
                    style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:14, fontWeight:600, color:'var(--text)', fontFamily:'var(--ff-display)' }} />
                  <input value={formDesc} onChange={e => setFormDesc(e.target.value)}
                    placeholder="Description (optionnelle)"
                    style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-text)', marginTop:4 }} />
                </div>
              </div>
            </div>

            {/* Questions list */}
            <div style={{ flex:1, overflowY:'auto', padding:'12px 12px' }}>
              {questions.map((q, i) => (
                <div key={q.id}
                  className={`fv-q-card${selectedQ===q.id?' selected':''}${dragOverQ===q.id?' drag-over':''}`}
                  style={{ marginBottom:6, padding:'10px 12px', display:'flex', alignItems:'center', gap:8 }}
                  onClick={() => setSelectedQ(q.id)}
                  draggable onDragStart={() => handleDragStart(q.id)}
                  onDragOver={e => handleDragOver(e, q.id)}
                  onDrop={e => handleDrop(e, q.id)}
                  onDragEnd={() => { setDraggingQ(null); setDragOverQ(null); }}
                >
                  <SFIcon name="grip-vertical" size={13} style={{ color:'var(--text-3)', cursor:'grab', flexShrink:0 }} />
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontSize:12, fontWeight:500, color:q.title?'var(--text)':'var(--text-3)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'var(--ff-text)' }}>
                      {q.title || (q.type==='section' ? '— Section —' : `Question ${i+1}`)}
                    </div>
                    <div style={{ fontSize:10, color:'var(--text-3)', marginTop:1, fontFamily:'var(--ff-text)' }}>
                      {FORM_Q_TYPES.find(t=>t.type===q.type)?.label}
                      {q.required && <span style={{ color:accent, marginLeft:4 }}>*</span>}
                    </div>
                  </div>
                </div>
              ))}

              {/* Add question button */}
              <div style={{ position:'relative' }}>
                <button onClick={() => setShowTypeMenu(showTypeMenu ? null : 'main')}
                  style={{ ...btnBase, width:'100%', background:'var(--surface-2)', color:'var(--text-2)', border:'1.5px dashed var(--border-2)', display:'flex', alignItems:'center', justifyContent:'center', gap:6, marginTop:4 }}>
                  <SFIcon name="plus" size={13} />
                  Ajouter une question
                </button>
                {showTypeMenu && (
                  <div style={{ position:'absolute', left:0, right:0, top:'calc(100% + 4px)', background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:10, zIndex:50, boxShadow:'0 8px 24px rgba(0,0,0,0.3)', overflow:'hidden' }}>
                    {FORM_Q_TYPES.map(t => (
                      <button key={t.type}
                        onClick={() => { addQuestion(t.type); setShowTypeMenu(null); }}
                        style={{ width:'100%', padding:'9px 14px', background:'transparent', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:10, fontSize:12, color:'var(--text)', fontFamily:'var(--ff-text)', textAlign:'left' }}
                        onMouseEnter={e => (e.currentTarget.style.background='var(--surface-3)')}
                        onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                      >
                        <SFIcon name={t.icon} size={13} style={{ color:'var(--text-2)' }} />
                        {t.label}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Center: question editor */}
          <div style={{ flex:1, overflowY:'auto', padding:'32px 40px' }} onClick={() => setShowTypeMenu(null)}>
            {selectedQuestion ? (
              <div style={{ maxWidth:720, margin:'0 auto' }}>
                {/* Question card */}
                <div style={{ background:'var(--surface-1)', border:`1.5px solid ${accent}`, borderRadius:16, overflow:'hidden', marginBottom:16 }}>
                  <div style={{ height:5, background:accent }} />
                  <div style={{ padding:'24px 28px' }}>

                    {selectedQuestion.type === 'section' ? (
                      <>
                        <input value={selectedQuestion.title} onChange={e => updateQ(selectedQuestion.id, { title: e.target.value })}
                          placeholder="Titre de la section"
                          style={{ width:'100%', background:'transparent', border:'none', borderBottom:'2px solid var(--border-2)', outline:'none', fontSize:22, fontWeight:700, color:'var(--text)', fontFamily:'var(--ff-display)', paddingBottom:8, marginBottom:12 }} />
                        <input value={selectedQuestion.description} onChange={e => updateQ(selectedQuestion.id, { description: e.target.value })}
                          placeholder="Description de la section (optionnelle)"
                          style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:14, color:'var(--text-2)', fontFamily:'var(--ff-text)' }} />
                      </>
                    ) : (
                      <>
                        {/* Title row */}
                        <div style={{ display:'flex', gap:12, marginBottom:12, alignItems:'flex-start' }}>
                          <input value={selectedQuestion.title} onChange={e => updateQ(selectedQuestion.id, { title: e.target.value })}
                            placeholder="Intitulé de la question"
                            style={{ flex:1, background:'transparent', border:'none', borderBottom:'2px solid var(--border-2)', outline:'none', fontSize:18, fontWeight:600, color:'var(--text)', fontFamily:'var(--ff-display)', paddingBottom:8 }}
                            onFocus={e => (e.currentTarget.style.borderBottomColor=accent)}
                            onBlur={e => (e.currentTarget.style.borderBottomColor='var(--border-2)')} />
                          {/* Type selector */}
                          <div style={{ position:'relative', flexShrink:0 }}>
                            <button onClick={() => setShowTypeMenu(showTypeMenu===selectedQuestion.id?null:selectedQuestion.id)}
                              style={{ ...btnBase, background:'var(--surface-2)', color:'var(--text-2)', border:'1px solid var(--border-2)', display:'flex', alignItems:'center', gap:6, whiteSpace:'nowrap' }}>
                              <SFIcon name={FORM_Q_TYPES.find(t=>t.type===selectedQuestion.type)?.icon||'minus'} size={12} />
                              {FORM_Q_TYPES.find(t=>t.type===selectedQuestion.type)?.label}
                              <SFIcon name="chevron-down" size={11} />
                            </button>
                            {showTypeMenu===selectedQuestion.id && (
                              <div style={{ position:'absolute', right:0, top:'calc(100% + 4px)', background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:10, zIndex:50, boxShadow:'0 8px 24px rgba(0,0,0,0.3)', overflow:'hidden', minWidth:180 }}>
                                {FORM_Q_TYPES.map(t => (
                                  <button key={t.type}
                                    onClick={() => { updateQ(selectedQuestion.id, { type:t.type, options: (t.type==='choice'||t.type==='checkbox'||t.type==='dropdown')&&selectedQuestion.options.length===0 ? [{id:`o1-${Date.now()}`,label:'Option 1'},{id:`o2-${Date.now()}`,label:'Option 2'}] : selectedQuestion.options }); setShowTypeMenu(null); }}
                                    style={{ width:'100%', padding:'9px 14px', background:selectedQuestion.type===t.type?`${accent}22`:'transparent', border:'none', cursor:'pointer', display:'flex', alignItems:'center', gap:10, fontSize:12, color: selectedQuestion.type===t.type?accent:'var(--text)', fontFamily:'var(--ff-text)', textAlign:'left' }}
                                    onMouseEnter={e => { if(selectedQuestion.type!==t.type) e.currentTarget.style.background='var(--surface-3)'; }}
                                    onMouseLeave={e => { e.currentTarget.style.background=selectedQuestion.type===t.type?`${accent}22`:'transparent'; }}
                                  >
                                    <SFIcon name={t.icon} size={13} />
                                    {t.label}
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </div>

                        {/* Description */}
                        <input value={selectedQuestion.description} onChange={e => updateQ(selectedQuestion.id, { description: e.target.value })}
                          placeholder="Description ou aide à la réponse (optionnelle)"
                          style={{ width:'100%', background:'transparent', border:'none', outline:'none', fontSize:13, color:'var(--text-3)', fontFamily:'var(--ff-text)', marginBottom:20 }} />

                        {/* Question-type specific preview/edit */}
                        {(selectedQuestion.type==='short') && (
                          <input readOnly placeholder={selectedQuestion.placeholder||'Réponse courte…'}
                            style={{ width:'100%', padding:'10px 0', border:'none', borderBottom:'1.5px solid var(--border-2)', background:'transparent', color:'var(--text-3)', fontSize:14, fontFamily:'var(--ff-text)', outline:'none' }} />
                        )}
                        {(selectedQuestion.type==='long') && (
                          <textarea readOnly placeholder={selectedQuestion.placeholder||'Réponse longue…'}
                            style={{ width:'100%', padding:'10px 0', border:'none', borderBottom:'1.5px solid var(--border-2)', background:'transparent', color:'var(--text-3)', fontSize:14, fontFamily:'var(--ff-text)', outline:'none', resize:'none', height:72 }} />
                        )}
                        {(selectedQuestion.type==='date') && (
                          <div style={{ display:'flex', alignItems:'center', gap:8, color:'var(--text-3)', fontSize:14, fontFamily:'var(--ff-text)', borderBottom:'1.5px solid var(--border-2)', paddingBottom:8 }}>
                            <SFIcon name="calendar" size={14} />
                            <span>JJ / MM / AAAA</span>
                          </div>
                        )}
                        {(selectedQuestion.type==='upload') && (
                          <div style={{ border:'2px dashed var(--border-2)', borderRadius:10, padding:'24px 20px', display:'flex', flexDirection:'column', alignItems:'center', gap:8, color:'var(--text-3)' }}>
                            <SFIcon name="upload" size={22} />
                            <span style={{ fontSize:13, fontFamily:'var(--ff-text)' }}>Cliquer ou glisser un fichier ici</span>
                            <span style={{ fontSize:11, fontFamily:'var(--ff-text)', color:'var(--text-3)' }}>PDF, images, vidéos… (10 Mo max)</span>
                          </div>
                        )}
                        {(selectedQuestion.type==='rating') && (
                          <div style={{ display:'flex', gap:4, alignItems:'center', marginBottom:8 }}>
                            {Array.from({length:selectedQuestion.ratingMax}).map((_,i) => (
                              <span key={i} style={{ fontSize:28, color:'#fbbf24', lineHeight:1 }}>★</span>
                            ))}
                            <div style={{ marginLeft:12, display:'flex', alignItems:'center', gap:6 }}>
                              <span style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>Max :</span>
                              {[3,4,5,6,7,8,9,10].map(n => (
                                <button key={n} onClick={() => updateQ(selectedQuestion.id, { ratingMax:n })}
                                  style={{ width:24, height:24, borderRadius:6, border:'1px solid var(--border-2)', background:selectedQuestion.ratingMax===n?accent:'var(--surface-2)', color:selectedQuestion.ratingMax===n?'#fff':'var(--text-2)', cursor:'pointer', fontSize:11, fontFamily:'var(--ff-text)', padding:0 }}>
                                  {n}
                                </button>
                              ))}
                            </div>
                          </div>
                        )}
                        {(selectedQuestion.type==='scale') && (
                          <div style={{ marginBottom:8 }}>
                            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
                              <input value={selectedQuestion.scaleMinLabel} onChange={e => updateQ(selectedQuestion.id, { scaleMinLabel:e.target.value })}
                                placeholder="Étiquette min" style={{ background:'transparent', border:'none', borderBottom:'1px solid var(--border-2)', outline:'none', fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-text)', width:120 }} />
                              <div style={{ display:'flex', gap:4 }}>
                                {Array.from({length:selectedQuestion.scaleMax-selectedQuestion.scaleMin+1},(_,i)=>selectedQuestion.scaleMin+i).map(n => (
                                  <div key={n} style={{ width:32, height:32, borderRadius:8, border:`1.5px solid var(--border-2)`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, color:'var(--text-2)', fontFamily:'var(--ff-text)' }}>{n}</div>
                                ))}
                              </div>
                              <input value={selectedQuestion.scaleMaxLabel} onChange={e => updateQ(selectedQuestion.id, { scaleMaxLabel:e.target.value })}
                                placeholder="Étiquette max" style={{ background:'transparent', border:'none', borderBottom:'1px solid var(--border-2)', outline:'none', fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-text)', width:120, textAlign:'right' }} />
                            </div>
                            <div style={{ display:'flex', gap:12, fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>
                              <label>Min : <select value={selectedQuestion.scaleMin} onChange={e=>updateQ(selectedQuestion.id,{scaleMin:+e.target.value})} style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:6,color:'var(--text)',fontSize:12,padding:'2px 6px'}}>{[0,1,2].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
                              <label>Max : <select value={selectedQuestion.scaleMax} onChange={e=>updateQ(selectedQuestion.id,{scaleMax:+e.target.value})} style={{background:'var(--surface-2)',border:'1px solid var(--border-2)',borderRadius:6,color:'var(--text)',fontSize:12,padding:'2px 6px'}}>{[2,3,4,5,6,7,8,9,10].map(n=><option key={n} value={n}>{n}</option>)}</select></label>
                            </div>
                          </div>
                        )}
                        {(selectedQuestion.type==='choice'||selectedQuestion.type==='checkbox'||selectedQuestion.type==='dropdown') && (
                          <div>
                            {selectedQuestion.options.map((opt, oi) => (
                              <div key={opt.id} className="fv-option-row" style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                                {selectedQuestion.type==='choice'   && <div style={{ width:16, height:16, borderRadius:'50%', border:'2px solid var(--border-2)', flexShrink:0 }} />}
                                {selectedQuestion.type==='checkbox' && <div style={{ width:16, height:16, borderRadius:4, border:'2px solid var(--border-2)', flexShrink:0 }} />}
                                {selectedQuestion.type==='dropdown' && <span style={{ width:20, color:'var(--text-3)', fontSize:12, fontFamily:'var(--ff-text)', flexShrink:0 }}>{oi+1}.</span>}
                                <input value={opt.label} onChange={e => updateOption(selectedQuestion.id, opt.id, e.target.value)}
                                  style={{ flex:1, background:'transparent', border:'none', borderBottom:'1px solid var(--border-2)', outline:'none', fontSize:14, color:'var(--text)', fontFamily:'var(--ff-text)', padding:'4px 0' }} />
                                <button className="fv-opt-del" onClick={() => deleteOption(selectedQuestion.id, opt.id)}
                                  style={{ opacity:0, background:'transparent', border:'none', cursor:'pointer', color:'var(--text-3)', padding:'2px 4px', transition:'opacity .1s' }}>
                                  <SFIcon name="x" size={13} />
                                </button>
                              </div>
                            ))}
                            <button onClick={() => addOption(selectedQuestion.id)}
                              style={{ display:'flex', alignItems:'center', gap:6, background:'transparent', border:'none', cursor:'pointer', color:accent, fontSize:13, fontFamily:'var(--ff-text)', padding:'4px 0', marginTop:4 }}>
                              <SFIcon name="plus" size={13} />
                              Ajouter une option
                            </button>
                          </div>
                        )}

                        {/* Placeholder */}
                        {(selectedQuestion.type==='short'||selectedQuestion.type==='long') && (
                          <div style={{ marginTop:16 }}>
                            <span style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>Placeholder : </span>
                            <input value={selectedQuestion.placeholder} onChange={e=>updateQ(selectedQuestion.id,{placeholder:e.target.value})}
                              placeholder="Texte d'aide…"
                              style={{ background:'transparent', border:'none', borderBottom:'1px solid var(--border-2)', outline:'none', fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-text)', marginLeft:4, width:220 }} />
                          </div>
                        )}
                      </>
                    )}
                  </div>

                  {/* Card footer */}
                  {selectedQuestion.type !== 'section' && (
                    <div style={{ borderTop:'1px solid var(--border-1)', padding:'10px 28px', display:'flex', alignItems:'center', justifyContent:'space-between', background:'var(--surface-2)' }}>
                      <label style={{ display:'flex', alignItems:'center', gap:8, cursor:'pointer', fontSize:13, color:'var(--text-2)', fontFamily:'var(--ff-text)' }}>
                        <div onClick={() => updateQ(selectedQuestion.id, { required:!selectedQuestion.required })}
                          style={{ width:38, height:22, borderRadius:11, background:selectedQuestion.required?accent:'var(--border-2)', position:'relative', cursor:'pointer', transition:'background .2s', flexShrink:0 }}>
                          <div style={{ position:'absolute', top:3, left:selectedQuestion.required?18:3, width:16, height:16, borderRadius:'50%', background:'#fff', transition:'left .2s' }} />
                        </div>
                        Réponse requise
                      </label>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => duplicateQ(selectedQuestion.id)} style={{ ...btnBase, background:'transparent', color:'var(--text-2)', border:'1px solid var(--border-2)' }}>
                          <SFIcon name="copy" size={12} style={{ marginRight:4, verticalAlign:'middle' }} />Dupliquer
                        </button>
                        <button onClick={() => deleteQ(selectedQuestion.id)} style={{ ...btnBase, background:'transparent', color:'var(--danger)', border:'1px solid var(--danger)' }}>
                          <SFIcon name="trash-2" size={12} style={{ marginRight:4, verticalAlign:'middle' }} />Supprimer
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', height:'100%', color:'var(--text-3)', fontFamily:'var(--ff-text)', gap:12 }}>
                <SFIcon name="clipboard-list" size={40} />
                <span style={{ fontSize:14 }}>Sélectionnez ou ajoutez une question</span>
              </div>
            )}
          </div>

          {/* Right: question outline mini-map */}
          <div style={{ width:200, borderLeft:'1px solid var(--border-1)', padding:'20px 16px', overflowY:'auto', flexShrink:0 }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', fontFamily:'var(--ff-text)', textTransform:'uppercase', letterSpacing:'0.08em', marginBottom:12 }}>Structure</div>
            <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-text)', marginBottom:8 }}>{questions.length} question{questions.length!==1?'s':''}</div>
            {questions.filter(q=>q.required).length > 0 && (
              <div style={{ fontSize:11, color:accent, fontFamily:'var(--ff-text)', marginBottom:16 }}>
                {questions.filter(q=>q.required).length} requise{questions.filter(q=>q.required).length!==1?'s':''}
              </div>
            )}
            <div style={{ display:'flex', flexDirection:'column', gap:2 }}>
              {questions.map((q,i) => (
                <button key={q.id} onClick={() => setSelectedQ(q.id)}
                  style={{ padding:'6px 10px', borderRadius:8, border:'none', cursor:'pointer', textAlign:'left', background:selectedQ===q.id?`${accent}22`:'transparent', color:selectedQ===q.id?accent:'var(--text-2)', fontSize:11, fontFamily:'var(--ff-text)', display:'flex', alignItems:'center', gap:6 }}>
                  <SFIcon name={FORM_Q_TYPES.find(t=>t.type===q.type)?.icon||'minus'} size={10} style={{ flexShrink:0 }} />
                  <span style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {q.title || (q.type==='section'?'— Section —':`Q${i+1}`)}
                    {q.required && <span style={{ color:accent }}> *</span>}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ─── PREVIEW TAB ─── */}
      {tab === 'preview' && (
        <div style={{ flex:1, overflowY:'auto', padding:'40px 24px', background:'var(--bg)' }}>
          <div style={{ maxWidth:680, margin:'0 auto' }}>
            {!previewSubmitted ? (
              <>
                {/* Form header */}
                <div style={{ borderRadius:16, overflow:'hidden', border:`1.5px solid ${accent}`, marginBottom:24 }}>
                  <div style={{ height:10, background:accent }} />
                  <div style={{ padding:'28px 32px', background:'var(--surface-1)' }}>
                    <h1 style={{ margin:0, fontSize:24, fontWeight:700, color:'var(--text)', fontFamily:'var(--ff-display)', marginBottom:8 }}>{formTitle}</h1>
                    {formDesc && <p style={{ margin:0, fontSize:14, color:'var(--text-2)', fontFamily:'var(--ff-text)', lineHeight:1.6 }}>{formDesc}</p>}
                    <p style={{ margin:'12px 0 0', fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>
                      <span style={{ color:'var(--danger)' }}>*</span> Champ obligatoire
                    </p>
                  </div>
                </div>

                {/* Questions */}
                {questions.map((q) => (
                  <div key={q.id} style={{ background:'var(--surface-1)', border:'1.5px solid var(--border-1)', borderRadius:14, padding:'24px 28px', marginBottom:16 }}>
                    {q.type === 'section' ? (
                      <>
                        {q.title && <h2 style={{ margin:'0 0 6px', fontSize:18, fontWeight:700, color:'var(--text)', fontFamily:'var(--ff-display)', borderBottom:`2px solid ${accent}`, paddingBottom:10 }}>{q.title}</h2>}
                        {q.description && <p style={{ margin:0, fontSize:13, color:'var(--text-2)', fontFamily:'var(--ff-text)' }}>{q.description}</p>}
                      </>
                    ) : (
                      <>
                        <p style={{ margin:'0 0 4px', fontSize:15, fontWeight:600, color:'var(--text)', fontFamily:'var(--ff-text)' }}>
                          {q.title || 'Question sans titre'}
                          {q.required && <span style={{ color:'var(--danger)', marginLeft:4 }}>*</span>}
                        </p>
                        {q.description && <p style={{ margin:'0 0 14px', fontSize:13, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>{q.description}</p>}
                        {!q.description && <div style={{ marginBottom:14 }} />}

                        {q.type==='short' && (
                          <input className="fv-preview-input" value={(previewAnswers[q.id]??'') as string} onChange={e=>setPreviewAnswers(p=>({...p,[q.id]:e.target.value}))} placeholder={q.placeholder||'Votre réponse'} />
                        )}
                        {q.type==='long' && (
                          <textarea className="fv-preview-input" value={(previewAnswers[q.id]??'') as string} onChange={e=>setPreviewAnswers(p=>({...p,[q.id]:e.target.value}))} placeholder={q.placeholder||'Votre réponse'} style={{ resize:'vertical', minHeight:100 }} />
                        )}
                        {q.type==='date' && (
                          <input type="date" className="fv-preview-input" value={(previewAnswers[q.id]??'') as string} onChange={e=>setPreviewAnswers(p=>({...p,[q.id]:e.target.value}))} style={{ maxWidth:200 }} />
                        )}
                        {q.type==='upload' && (
                          <label style={{ display:'block', cursor:'pointer' }}>
                            <input type="file" style={{ display:'none' }} onChange={e => { if(e.target.files?.[0]) setPreviewAnswers(p=>({...p,[q.id]:e.target.files![0].name})); }} />
                            <div style={{ border:`2px dashed ${previewAnswers[q.id]?accent:'var(--border-2)'}`, borderRadius:10, padding:'20px', display:'flex', flexDirection:'column', alignItems:'center', gap:8, transition:'border-color .15s', background: previewAnswers[q.id]?`${accent}11`:'transparent' }}>
                              <SFIcon name={previewAnswers[q.id]?'file-check':'upload'} size={22} style={{ color: previewAnswers[q.id]?accent:'var(--text-3)' }} />
                              <span style={{ fontSize:13, fontFamily:'var(--ff-text)', color:previewAnswers[q.id]?accent:'var(--text-2)' }}>
                                {previewAnswers[q.id] ? String(previewAnswers[q.id]) : 'Cliquer ou glisser un fichier ici'}
                              </span>
                              {!previewAnswers[q.id] && <span style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>PDF, images, vidéos… (10 Mo max)</span>}
                            </div>
                          </label>
                        )}
                        {q.type==='choice' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                            {q.options.map(opt => (
                              <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', fontSize:14, color:'var(--text)', fontFamily:'var(--ff-text)' }}>
                                <div style={{ width:18, height:18, borderRadius:'50%', border:`2px solid ${previewAnswers[q.id]===opt.label?accent:'var(--border-2)'}`, background:previewAnswers[q.id]===opt.label?accent:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s', cursor:'pointer' }}
                                  onClick={() => setPreviewAnswers(p=>({...p,[q.id]:opt.label}))}>
                                  {previewAnswers[q.id]===opt.label && <div style={{ width:8, height:8, borderRadius:'50%', background:'#fff' }} />}
                                </div>
                                {opt.label}
                              </label>
                            ))}
                          </div>
                        )}
                        {q.type==='checkbox' && (
                          <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                            {q.options.map(opt => {
                              const checked = ((previewAnswers[q.id] as string[]|undefined)??[]).includes(opt.label);
                              return (
                                <label key={opt.id} style={{ display:'flex', alignItems:'center', gap:12, cursor:'pointer', fontSize:14, color:'var(--text)', fontFamily:'var(--ff-text)' }}>
                                  <div style={{ width:18, height:18, borderRadius:5, border:`2px solid ${checked?accent:'var(--border-2)'}`, background:checked?accent:'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, transition:'all .15s', cursor:'pointer' }}
                                    onClick={() => previewToggleCheck(q.id, opt.label)}>
                                    {checked && <SFIcon name="check" size={11} style={{ color:'#fff' }} />}
                                  </div>
                                  {opt.label}
                                </label>
                              );
                            })}
                          </div>
                        )}
                        {q.type==='dropdown' && (
                          <select className="fv-preview-input" value={(previewAnswers[q.id]??'') as string} onChange={e=>setPreviewAnswers(p=>({...p,[q.id]:e.target.value}))} style={{ maxWidth:280, cursor:'pointer' }}>
                            <option value="">Choisir une option</option>
                            {q.options.map(opt => <option key={opt.id} value={opt.label}>{opt.label}</option>)}
                          </select>
                        )}
                        {q.type==='rating' && (
                          <div style={{ display:'flex', gap:6 }}>
                            {Array.from({length:q.ratingMax}).map((_,i) => {
                              const val = i+1;
                              const sel = Number(previewAnswers[q.id]??0) >= val;
                              return (
                                <span key={i} onClick={() => setPreviewAnswers(p=>({...p,[q.id]:String(val)}))}
                                  style={{ fontSize:32, cursor:'pointer', color:sel?'#fbbf24':'var(--border-2)', transition:'color .1s', lineHeight:1 }}>★</span>
                              );
                            })}
                          </div>
                        )}
                        {q.type==='scale' && (
                          <div>
                            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                              <span style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>{q.scaleMinLabel}</span>
                              <span style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>{q.scaleMaxLabel}</span>
                            </div>
                            <div style={{ display:'flex', gap:8 }}>
                              {Array.from({length:q.scaleMax-q.scaleMin+1},(_,i)=>q.scaleMin+i).map(n => {
                                const sel = previewAnswers[q.id]===String(n);
                                return (
                                  <button key={n} onClick={() => setPreviewAnswers(p=>({...p,[q.id]:String(n)}))}
                                    style={{ flex:1, height:40, borderRadius:10, border:`2px solid ${sel?accent:'var(--border-2)'}`, background:sel?accent:'transparent', color:sel?'#fff':'var(--text-2)', cursor:'pointer', fontSize:14, fontFamily:'var(--ff-text)', transition:'all .15s' }}>
                                    {n}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        )}
                      </>
                    )}
                  </div>
                ))}

                <div style={{ display:'flex', justifyContent:'flex-end', marginTop:8, marginBottom:40 }}>
                  <button onClick={() => setPreviewSubmitted(true)} style={{ ...btnBase, background:accent, color:'#fff', fontSize:14, padding:'12px 32px', borderRadius:10 }}>
                    Soumettre
                  </button>
                </div>
              </>
            ) : (
              <div style={{ textAlign:'center', padding:'80px 40px', background:'var(--surface-1)', borderRadius:20, border:'1.5px solid var(--border-1)' }}>
                <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
                <h2 style={{ margin:'0 0 10px', color:'var(--text)', fontFamily:'var(--ff-display)', fontSize:22 }}>Réponse enregistrée</h2>
                <p style={{ color:'var(--text-2)', fontFamily:'var(--ff-text)', fontSize:14, marginBottom:28 }}>Merci pour vos réponses.</p>
                <button onClick={() => { setPreviewSubmitted(false); setPreviewAnswers({}); }} style={{ ...btnBase, background:accent, color:'#fff' }}>
                  Soumettre une autre réponse
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── RESPONSES TAB ─── */}
      {tab === 'responses' && (
        <div style={{ flex:1, display:'flex', overflow:'hidden' }}>
          {/* Left: response list */}
          <div style={{ width:220, borderRight:'1px solid var(--border-1)', overflowY:'auto', flexShrink:0, padding:'16px 12px' }}>
            <div style={{ fontSize:11, fontWeight:600, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.08em', fontFamily:'var(--ff-text)', marginBottom:12 }}>
              {responses.length} réponse{responses.length!==1?'s':''}
            </div>
            {responses.map((r,i) => (
              <button key={r.id} onClick={() => setResponseIdx(i)}
                style={{ width:'100%', padding:'10px 12px', borderRadius:10, border:'none', cursor:'pointer', textAlign:'left', background:responseIdx===i?`${accent}22`:'transparent', marginBottom:4, display:'flex', alignItems:'center', gap:9 }}>
                <div style={{ width:30, height:30, borderRadius:'50%', background:r.responder.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>
                  {r.responder.initials}
                </div>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:500, color:responseIdx===i?accent:'var(--text)', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', fontFamily:'var(--ff-text)' }}>{r.responder.name}</div>
                  <div style={{ fontSize:10, color:'var(--text-3)', marginTop:1, fontFamily:'var(--ff-text)' }}>{r.submittedAt}</div>
                </div>
              </button>
            ))}
          </div>

          {/* Right: detail + summary */}
          <div style={{ flex:1, overflowY:'auto', padding:'32px 40px' }}>
            <div style={{ maxWidth:720, margin:'0 auto' }}>
              {/* Responder identity card */}
              {(() => {
                const r = responses[responseIdx];
                const sourceLabel = r.responder.source === 'platform' ? 'Connecté à la plateforme' : r.responder.source === 'email' ? 'Invitation par email' : 'Lien public';
                const sourceIcon  = r.responder.source === 'platform' ? 'user-check' : r.responder.source === 'email' ? 'mail' : 'link';
                return (
                  <div style={{ background:'var(--surface-1)', border:'1.5px solid var(--border-1)', borderRadius:14, padding:'18px 22px', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
                    <div style={{ width:48, height:48, borderRadius:'50%', background:r.responder.bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, fontWeight:700, color:'#fff', flexShrink:0 }}>
                      {r.responder.initials}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:16, fontWeight:700, color:'var(--text)', fontFamily:'var(--ff-display)', marginBottom:2 }}>{r.responder.name}</div>
                      <div style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)', display:'flex', alignItems:'center', gap:12 }}>
                        <span><SFIcon name="mail" size={11} style={{ marginRight:4, verticalAlign:'middle' }} />{r.responder.email}</span>
                        <span style={{ display:'flex', alignItems:'center', gap:4, background:`${accent}18`, color:accent, padding:'2px 8px', borderRadius:20, fontSize:11 }}>
                          <SFIcon name={sourceIcon} size={10} />{sourceLabel}
                        </span>
                      </div>
                    </div>
                    <div style={{ textAlign:'right', flexShrink:0 }}>
                      <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>Soumis le</div>
                      <div style={{ fontSize:13, fontWeight:600, color:'var(--text-2)', fontFamily:'var(--ff-text)', marginTop:2 }}>{r.submittedAt}</div>
                      <div style={{ display:'flex', gap:6, marginTop:10, justifyContent:'flex-end' }}>
                        <button disabled={responseIdx===0} onClick={() => setResponseIdx(i=>i-1)} style={{ ...btnBase, background:'var(--surface-2)', color:'var(--text-2)', border:'1px solid var(--border-2)', opacity:responseIdx===0?.4:1, padding:'5px 10px' }}>
                          <SFIcon name="chevron-left" size={13} />
                        </button>
                        <span style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-text)', alignSelf:'center' }}>{responseIdx+1} / {responses.length}</span>
                        <button disabled={responseIdx===responses.length-1} onClick={() => setResponseIdx(i=>i+1)} style={{ ...btnBase, background:'var(--surface-2)', color:'var(--text-2)', border:'1px solid var(--border-2)', opacity:responseIdx===responses.length-1?.4:1, padding:'5px 10px' }}>
                          <SFIcon name="chevron-right" size={13} />
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {questions.filter(q=>q.type!=='section').map(q => {
                const ans = responses[responseIdx]?.answers[q.id];
                return (
                  <div key={q.id} style={{ background:'var(--surface-1)', border:'1.5px solid var(--border-1)', borderRadius:12, padding:'18px 22px', marginBottom:12 }}>
                    <div style={{ fontSize:12, color:'var(--text-3)', fontFamily:'var(--ff-text)', marginBottom:4 }}>
                      {FORM_Q_TYPES.find(t=>t.type===q.type)?.label}
                    </div>
                    <div style={{ fontSize:14, fontWeight:600, color:'var(--text)', fontFamily:'var(--ff-text)', marginBottom:10 }}>{q.title}</div>
                    {q.type==='rating' && ans ? (
                      <div style={{ display:'flex', gap:3 }}>
                        {Array.from({length:q.ratingMax}).map((_,i) => (
                          <span key={i} style={{ fontSize:22, color:i<Number(ans)?'#fbbf24':'var(--border-2)', lineHeight:1 }}>★</span>
                        ))}
                        <span style={{ marginLeft:8, fontSize:13, color:'var(--text-2)', fontFamily:'var(--ff-text)', alignSelf:'center' }}>{ans} / {q.ratingMax}</span>
                      </div>
                    ) : ans ? (
                      <div style={{ fontSize:14, color:'var(--text)', fontFamily:'var(--ff-text)', background:'var(--surface-2)', padding:'10px 14px', borderRadius:8, lineHeight:1.6 }}>
                        {Array.isArray(ans) ? ans.join(', ') : ans}
                      </div>
                    ) : (
                      <div style={{ fontSize:13, color:'var(--text-3)', fontFamily:'var(--ff-text)', fontStyle:'italic' }}>Pas de réponse</div>
                    )}
                  </div>
                );
              })}

              {/* Summary stats */}
              <div style={{ marginTop:32, paddingTop:24, borderTop:'1px solid var(--border-1)' }}>
                <h3 style={{ margin:'0 0 16px', fontSize:15, fontWeight:700, color:'var(--text)', fontFamily:'var(--ff-display)' }}>Résumé des réponses</h3>
                {questions.filter(q=>q.type==='rating'||q.type==='choice'||q.type==='dropdown').map(q => {
                  const stats = getStats(q.id, q);
                  if (!stats) return null;
                  if (q.type==='rating' && 'avg' in stats) {
                    return (
                      <div key={q.id} style={{ background:'var(--surface-1)', border:'1.5px solid var(--border-1)', borderRadius:12, padding:'16px 20px', marginBottom:12, display:'flex', alignItems:'center', gap:16 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:'var(--ff-text)', marginBottom:4 }}>{q.title}</div>
                          <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>{stats.count} réponses</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:28, fontWeight:700, color:accent, fontFamily:'var(--ff-display)' }}>{stats.avg}</div>
                          <div style={{ fontSize:11, color:'var(--text-3)', fontFamily:'var(--ff-text)' }}>/ {q.ratingMax} ★</div>
                        </div>
                      </div>
                    );
                  }
                  if ((q.type==='choice'||q.type==='dropdown') && !('avg' in stats)) {
                    const total = Object.values(stats as Record<string,number>).reduce((a,b)=>a+b,0);
                    return (
                      <div key={q.id} style={{ background:'var(--surface-1)', border:'1.5px solid var(--border-1)', borderRadius:12, padding:'16px 20px', marginBottom:12 }}>
                        <div style={{ fontSize:13, fontWeight:600, color:'var(--text)', fontFamily:'var(--ff-text)', marginBottom:12 }}>{q.title}</div>
                        {Object.entries(stats as Record<string,number>).sort((a,b)=>b[1]-a[1]).map(([label,count]) => {
                          const pct = Math.round(count/total*100);
                          return (
                            <div key={label} style={{ marginBottom:8 }}>
                              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'var(--text-2)', fontFamily:'var(--ff-text)', marginBottom:3 }}>
                                <span>{label}</span>
                                <span>{count} ({pct}%)</span>
                              </div>
                              <div style={{ height:6, borderRadius:3, background:'var(--surface-3)', overflow:'hidden' }}>
                                <div style={{ height:'100%', width:`${pct}%`, background:accent, borderRadius:3, transition:'width .4s' }} />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    );
                  }
                  return null;
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Shotlist ──────────────────────────────────────────────────────────────────

type ShotType = 'WS' | 'LS' | 'MS' | 'MCU' | 'CU' | 'ECU' | 'POV' | 'OTS' | 'INSERT';
type CameraMove = 'Statique' | 'Pan' | 'Tilt' | 'Dolly' | 'Track' | 'Grue' | 'Épaule' | 'Zoom';

interface ShotRow {
  id: string;
  sceneNumber: number;
  sceneLabel: string;
  shotNumber: number;
  description: string;
  shotType: ShotType;
  cameraMove: CameraMove;
  lens: string;
  duration: string;
  notes: string;
}

const SHOT_TYPES: ShotType[] = ['WS','LS','MS','MCU','CU','ECU','POV','OTS','INSERT'];
const CAMERA_MOVES: CameraMove[] = ['Statique','Pan','Tilt','Dolly','Track','Grue','Épaule','Zoom'];

const SHOT_TYPE_DESC: Record<ShotType, string> = {
  WS: 'Plan large', LS: 'Plan éloigné', MS: 'Plan américain',
  MCU: 'Plan poitrine', CU: 'Gros plan', ECU: 'Très gros plan',
  POV: 'Point de vue', OTS: 'Par-dessus l\'épaule', INSERT: 'Plan insert',
};

const MOCK_SHOTLIST: ShotRow[] = [
  { id:'sl1', sceneNumber:1, sceneLabel:'INT. LOFT PARISIEN — JOUR', shotNumber:1, description:'Plan d\'établissement du loft, lumière filtrée', shotType:'WS', cameraMove:'Statique', lens:'24mm', duration:'0:04', notes:'Ambiance dorée, baies vitrées' },
  { id:'sl2', sceneNumber:1, sceneLabel:'INT. LOFT PARISIEN — JOUR', shotNumber:2, description:'NARRATEUR en V.O. — décor vêtements sur mannequins', shotType:'MS', cameraMove:'Dolly', lens:'50mm', duration:'0:06', notes:'Mouvement lent vers avant' },
  { id:'sl3', sceneNumber:1, sceneLabel:'INT. LOFT PARISIEN — JOUR', shotNumber:3, description:'La JEUNE FEMME entre et effleure la robe', shotType:'MCU', cameraMove:'Épaule', lens:'85mm', duration:'0:05', notes:'Cadre naturel, chaleureux' },
  { id:'sl4', sceneNumber:1, sceneLabel:'INT. LOFT PARISIEN — JOUR', shotNumber:4, description:'Gros plan mains sur le tissu', shotType:'CU', cameraMove:'Statique', lens:'100mm', duration:'0:03', notes:'Plan de coupe' },
  { id:'sl5', sceneNumber:2, sceneLabel:'EXT. TOITS DE PARIS — COUCHER DE SOLEIL', shotNumber:5, description:'Vue sur les toits, ville qui s\'embrase', shotType:'WS', cameraMove:'Pan', lens:'24mm', duration:'0:05', notes:'Heure dorée impérative' },
  { id:'sl6', sceneNumber:2, sceneLabel:'EXT. TOITS DE PARIS — COUCHER DE SOLEIL', shotNumber:6, description:'JEUNE FEMME robe au vent, regard horizon', shotType:'LS', cameraMove:'Grue', lens:'35mm', duration:'0:07', notes:'Mouvement descendant grue' },
  { id:'sl7', sceneNumber:2, sceneLabel:'EXT. TOITS DE PARIS — COUCHER DE SOLEIL', shotNumber:7, description:'Portrait JEUNE FEMME — plan final', shotType:'MCU', cameraMove:'Statique', lens:'85mm', duration:'0:04', notes:'Fondu au noir vers logo' },
];

interface ScriptScene { id: string; number: number; label: string; }

function ShotlistView({ resource, scriptScenes }: { resource: Resource; scriptScenes: ScriptScene[] }) {
  const [shots, setShots] = useState<ShotRow[]>(MOCK_SHOTLIST);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [showSyncModal, setShowSyncModal] = useState(false);
  const [synced, setSynced] = useState(false);
  const [sceneOrder, setSceneOrder] = useState<number[]>([...new Set(MOCK_SHOTLIST.map(s => s.sceneNumber))]);
  const [addingScene, setAddingScene] = useState(false);
  const [newSceneLabel, setNewSceneLabel] = useState('');
  const [draggingScene, setDraggingScene] = useState<number | null>(null);
  const [dragOverScene, setDragOverScene] = useState<number | null>(null);
  const [dragOverSceneAfter, setDragOverSceneAfter] = useState(false);
  const [draggingShot, setDraggingShot] = useState<string | null>(null);
  const [dragOverShot, setDragOverShot] = useState<string | null>(null);
  const [dragOverShotAfter, setDragOverShotAfter] = useState(false);

  const updateShot = (id: string, field: keyof ShotRow, value: string | number) => {
    setShots(prev => prev.map(s => s.id === id ? { ...s, [field]: value } : s));
  };

  const addShot = (sceneNum?: number) => {
    const targetNum = sceneNum ?? (shots[shots.length - 1]?.sceneNumber ?? 1);
    const sceneLabel = shots.find(s => s.sceneNumber === targetNum)?.sceneLabel ?? 'Scène';
    const newShot: ShotRow = {
      id: `sl${Date.now()}`,
      sceneNumber: targetNum,
      sceneLabel,
      shotNumber: shots.length + 1,
      description: '', shotType: 'MS', cameraMove: 'Statique', lens: '', duration: '', notes: '',
    };
    setShots(prev => [...prev, newShot]);
    setEditingId(newShot.id);
    setEditingField('description');
  };

  const addScene = () => {
    const label = newSceneLabel.trim() || 'Nouvelle scène';
    const maxNum = Math.max(0, ...sceneOrder);
    const newNum = maxNum + 1;
    const newShot: ShotRow = {
      id: `sl${Date.now()}`, sceneNumber: newNum, sceneLabel: label,
      shotNumber: shots.length + 1, description: '', shotType: 'MS',
      cameraMove: 'Statique', lens: '', duration: '', notes: '',
    };
    setShots(prev => [...prev, newShot]);
    setSceneOrder(prev => [...prev, newNum]);
    setNewSceneLabel('');
    setAddingScene(false);
    setEditingId(newShot.id);
    setEditingField('description');
  };

  const dropScene = (e: React.DragEvent, targetNum: number) => {
    if (draggingScene === null || draggingScene === targetNum) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setSceneOrder(prev => {
      const arr = prev.filter(n => n !== draggingScene);
      let ti = arr.indexOf(targetNum);
      if (after) ti += 1;
      arr.splice(ti, 0, draggingScene!);
      return arr;
    });
    setDraggingScene(null);
    setDragOverScene(null);
  };

  const dropShot = (e: React.DragEvent, targetId: string) => {
    if (draggingShot === null || draggingShot === targetId) return;
    const dragged = shots.find(s => s.id === draggingShot);
    if (!dragged) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const after = e.clientY > rect.top + rect.height / 2;
    setShots(prev => {
      const next = prev.filter(s => s.id !== draggingShot);
      let ti = next.findIndex(s => s.id === targetId);
      if (after) ti += 1;
      next.splice(ti, 0, dragged);
      return next;
    });
    setDraggingShot(null);
    setDragOverShot(null);
  };

  const deleteShot = (id: string) => setShots(prev => prev.filter(s => s.id !== id));

  const scenesMap = new Map(shots.map(s => [s.sceneNumber, s.sceneLabel]));
  const orderedScenes = sceneOrder.filter(n => scenesMap.has(n)).map(n => ({ number: n, label: scenesMap.get(n)! }));
  const totalDuration = shots.reduce((acc, s) => {
    const [m, sec] = (s.duration || '0:00').split(':').map(Number);
    return acc + (m || 0) * 60 + (sec || 0);
  }, 0);
  const fmtDuration = `${Math.floor(totalDuration / 60)}:${String(totalDuration % 60).padStart(2,'0')}`;

  const col = (w: number | string, label: string) => (
    <th style={{ padding:'8px 10px', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.06em', fontWeight:600, textAlign:'left', borderBottom:'1px solid var(--border)', whiteSpace:'nowrap', width: w }}>
      {label}
    </th>
  );

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <SFIcon name="list" size={14} color="var(--text-3)" />
          <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>{shots.length} plans · {orderedScenes.length} scènes · {fmtDuration}</span>
        </div>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {!synced && (
            <button onClick={() => setShowSyncModal(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border-2)', background:'var(--surface-2)', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-2)' }}>
              <SFIcon name="refresh-cw" size={12} />Sync script
            </button>
          )}
          {synced && (
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, background:'var(--ok)18', border:'1px solid var(--ok)44' }}>
              <SFIcon name="check" size={11} color="var(--ok)" />
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--ok)' }}>Synchronisé</span>
            </div>
          )}
        </div>
      </div>

      {/* Table */}
      <div style={{ flex:1, overflow:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', tableLayout:'fixed' }}>
          <colgroup>
            <col style={{ width:24 }} /><col style={{ width:36 }} /><col style={{ width:30 }} /><col style={{ width:150 }} />
            <col style={{ width:'auto' }} /><col style={{ width:80 }} /><col style={{ width:90 }} />
            <col style={{ width:65 }} /><col style={{ width:55 }} /><col style={{ width:150 }} />
            <col style={{ width:60 }} />
          </colgroup>
          <thead style={{ position:'sticky', top:0, background:'var(--surface)', zIndex:2 }}>
            <tr>
              <th style={{ borderBottom:'1px solid var(--border)' }} />
              {col(36,'#')}{col(30,'S')}{col(150,'Scène')}
              {col('auto','Description')}{col(80,'Type')}{col(90,'Mouvement')}
              {col(65,'Objectif')}{col(55,'Durée')}{col(150,'Notes')}
              <th style={{ width:60, borderBottom:'1px solid var(--border)' }} />
            </tr>
          </thead>
          <tbody>
            {orderedScenes.flatMap((scene, sceneIdx) => {
              const sceneShots = shots.filter(s => s.sceneNumber === scene.number);
              let globalIdx = orderedScenes.slice(0, sceneIdx).reduce((a, sc) => a + shots.filter(s => s.sceneNumber === sc.number).length, 0);
              const isSceneDragOver = dragOverScene === scene.number;
              return [
                /* Scene header — draggable */
                <tr key={`hdr-${scene.number}`}
                  draggable
                  onDragStart={e => { setDraggingScene(scene.number); e.dataTransfer.effectAllowed = 'move'; }}
                  onDragOver={e => {
                    e.preventDefault();
                    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                    setDragOverScene(scene.number);
                    setDragOverSceneAfter(e.clientY > rect.top + rect.height / 2);
                  }}
                  onDragLeave={() => { setDragOverScene(null); }}
                  onDrop={e => dropScene(e, scene.number)}
                  onDragEnd={() => { setDraggingScene(null); setDragOverScene(null); }}
                  style={{ opacity: draggingScene === scene.number ? 0.4 : 1 }}
                >
                  <td colSpan={11} style={{
                    padding:'8px 10px 4px',
                    background: isSceneDragOver ? 'rgba(249,255,0,0.04)' : 'var(--surface)',
                    borderTop: isSceneDragOver && !dragOverSceneAfter ? '2px solid var(--accent)' : sceneIdx > 0 ? '2px solid var(--border)' : undefined,
                    borderBottom: isSceneDragOver && dragOverSceneAfter ? '2px solid var(--accent)' : undefined,
                    transition:'background 0.1s',
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ color:'var(--border-2)', cursor:'grab', userSelect:'none', fontSize:13, lineHeight:1, flexShrink:0 }}>⠿</span>
                      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--accent)', fontWeight:700 }}>S{scene.number}</span>
                      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>{scene.label}</span>
                      <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--border-2)', marginLeft:4 }}>{sceneShots.length} plan{sceneShots.length !== 1 ? 's' : ''}</span>
                    </div>
                  </td>
                </tr>,
                /* Shot rows */
                ...sceneShots.map((shot, i) => {
                  const idx = globalIdx + i;
                  const isShotDragOver = dragOverShot === shot.id;
                  return (
                    <tr key={shot.id}
                      draggable
                      onDragStart={e => { e.stopPropagation(); setDraggingShot(shot.id); e.dataTransfer.effectAllowed = 'move'; }}
                      onDragOver={e => {
                        e.preventDefault(); e.stopPropagation();
                        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
                        setDragOverShot(shot.id);
                        setDragOverShotAfter(e.clientY > rect.top + rect.height / 2);
                      }}
                      onDragLeave={() => setDragOverShot(null)}
                      onDrop={e => { e.stopPropagation(); dropShot(e, shot.id); }}
                      onDragEnd={() => { setDraggingShot(null); setDragOverShot(null); }}
                      style={{
                        background: editingId === shot.id ? 'var(--surface-2)' : 'transparent',
                        opacity: draggingShot === shot.id ? 0.4 : 1,
                        borderTop: isShotDragOver && !dragOverShotAfter ? '2px solid var(--accent)' : '1px solid var(--border)',
                        borderBottom: isShotDragOver && dragOverShotAfter ? '2px solid var(--accent)' : undefined,
                      }}
                      onMouseEnter={e => (e.currentTarget.style.background='var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background = editingId === shot.id ? 'var(--surface-2)' : 'transparent')}
                    >
                    <td style={{ padding:'4px 4px', textAlign:'center', cursor:'grab', color:'var(--border-2)', fontSize:13, lineHeight:1, userSelect:'none' }}>⠿</td>
                    <td style={{ padding:'8px 10px', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', textAlign:'center' }}>{idx+1}</td>
                    <td style={{ padding:'8px 6px', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', textAlign:'center' }}>{shot.shotNumber}</td>
                    <td style={{ padding:'8px 10px', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-2)', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{shot.sceneLabel}</td>
                    <td style={{ padding:'8px 10px' }}>
                      {editingId === shot.id && editingField === 'description' ? (
                        <input autoFocus value={shot.description} onChange={e => updateShot(shot.id,'description',e.target.value)}
                          onBlur={() => { setEditingId(null); setEditingField(null); }}
                          style={{ width:'100%', background:'transparent', border:'none', outline:'1px solid var(--accent)', borderRadius:4, padding:'2px 4px', fontSize:12, color:'var(--text)', fontFamily:'var(--ff-text)' }} />
                      ) : (
                        <span onClick={() => { setEditingId(shot.id); setEditingField('description'); }} style={{ fontSize:12, color:'var(--text)', cursor:'text', display:'block', minHeight:18 }}>{shot.description || <span style={{ color:'var(--text-3)' }}>—</span>}</span>
                      )}
                    </td>
                    <td style={{ padding:'8px 6px' }}>
                      <select value={shot.shotType} onChange={e => updateShot(shot.id,'shotType',e.target.value)}
                        style={{ background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 6px', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text)', cursor:'pointer', width:'100%' }}>
                        {SHOT_TYPES.map(t => <option key={t} value={t}>{t} — {SHOT_TYPE_DESC[t]}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'8px 6px' }}>
                      <select value={shot.cameraMove} onChange={e => updateShot(shot.id,'cameraMove',e.target.value)}
                        style={{ background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 6px', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text)', cursor:'pointer', width:'100%' }}>
                        {CAMERA_MOVES.map(m => <option key={m} value={m}>{m}</option>)}
                      </select>
                    </td>
                    <td style={{ padding:'8px 6px' }}>
                      <input value={shot.lens} onChange={e => updateShot(shot.id,'lens',e.target.value)} placeholder="50mm"
                        style={{ width:'100%', background:'transparent', border:'1px solid transparent', borderRadius:5, padding:'3px 5px', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text)' }}
                        onFocus={e => (e.target.style.borderColor='var(--border-2)')} onBlur={e => (e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={{ padding:'8px 6px' }}>
                      <input value={shot.duration} onChange={e => updateShot(shot.id,'duration',e.target.value)} placeholder="0:04"
                        style={{ width:'100%', background:'transparent', border:'1px solid transparent', borderRadius:5, padding:'3px 5px', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text)' }}
                        onFocus={e => (e.target.style.borderColor='var(--border-2)')} onBlur={e => (e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={{ padding:'8px 6px' }}>
                      <input value={shot.notes} onChange={e => updateShot(shot.id,'notes',e.target.value)} placeholder="Notes…"
                        style={{ width:'100%', background:'transparent', border:'1px solid transparent', borderRadius:5, padding:'3px 5px', fontSize:11, color:'var(--text-2)', fontFamily:'var(--ff-text)' }}
                        onFocus={e => (e.target.style.borderColor='var(--border-2)')} onBlur={e => (e.target.style.borderColor='transparent')} />
                    </td>
                    <td style={{ padding:'4px 4px', textAlign:'center' }}>
                      <button onClick={() => deleteShot(shot.id)} style={{ background:'transparent', border:'none', cursor:'pointer', padding:'2px 4px', borderRadius:5, color:'var(--text-3)' }}
                        onMouseEnter={e => (e.currentTarget.style.color='var(--danger)')} onMouseLeave={e => (e.currentTarget.style.color='var(--text-3)')}>
                        <SFIcon name="x" size={12} />
                      </button>
                    </td>
                  </tr>
                  );
                }),
                /* Inline add-shot row */
                <tr key={`add-shot-${scene.number}`}>
                  <td colSpan={11} style={{ padding:'0 0 2px' }}>
                    <button onClick={() => addShot(scene.number)}
                      style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'6px 10px 6px 34px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}
                      onMouseEnter={e => (e.currentTarget.style.background='var(--surface-2)')}
                      onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                      <SFIcon name="plus" size={11} color="var(--text-3)" />
                      <span style={{ fontFamily:'var(--ff-text)', fontSize:10, color:'var(--text-3)' }}>Ajouter un plan</span>
                    </button>
                  </td>
                </tr>,
              ];
            })}
            {/* Inline add-scene row */}
            <tr key="add-scene-row">
              <td colSpan={11} style={{ padding:'4px 0 8px', borderTop:'2px solid var(--border)' }}>
                {addingScene ? (
                  <div style={{ display:'flex', alignItems:'center', gap:8, padding:'6px 14px' }}>
                    <SFIcon name="plus-circle" size={13} color="var(--accent)" />
                    <input autoFocus value={newSceneLabel} onChange={e => setNewSceneLabel(e.target.value)}
                      onKeyDown={e => { if (e.key === 'Enter') addScene(); if (e.key === 'Escape') setAddingScene(false); }}
                      placeholder="Titre de la nouvelle scène…"
                      style={{ flex:1, padding:'5px 9px', borderRadius:7, border:'1px solid var(--accent)', background:'var(--surface-2)', color:'var(--text)', fontSize:12, fontFamily:'var(--ff-text)', outline:'none' }} />
                    <button onClick={addScene} style={{ padding:'5px 12px', borderRadius:7, border:'none', background:'var(--accent)', cursor:'pointer', fontSize:11, color:'#000', fontWeight:700 }}>Créer</button>
                    <button onClick={() => { setAddingScene(false); setNewSceneLabel(''); }} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', color:'var(--text-3)', fontSize:11 }}>✕</button>
                  </div>
                ) : (
                  <button onClick={() => setAddingScene(true)}
                    style={{ display:'flex', alignItems:'center', gap:6, width:'100%', padding:'7px 14px', background:'transparent', border:'none', cursor:'pointer', textAlign:'left' }}
                    onMouseEnter={e => (e.currentTarget.style.background='var(--surface-2)')}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}>
                    <SFIcon name="plus" size={12} color="var(--text-3)" />
                    <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>Nouvelle scène</span>
                  </button>
                )}
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Sync modal */}
      {showSyncModal && (
        <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget) setShowSyncModal(false); }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.5)', backdropFilter:'blur(4px)' }} />
          <div style={{ position:'relative', zIndex:1, background:'var(--surface-1)', border:'1px solid var(--border-2)', borderRadius:16, width:'min(480px,92vw)', padding:28 }}>
            <h3 style={{ fontSize:16, fontWeight:700, color:'var(--text)', marginBottom:6 }}>Synchroniser avec le script</h3>
            <p style={{ fontSize:13, color:'var(--text-2)', lineHeight:1.6, marginBottom:20 }}>
              Les scènes détectées dans la version active du script seront importées dans la shotlist. Les plans existants seront conservés.
            </p>
            <div style={{ background:'var(--surface-2)', borderRadius:10, padding:'12px 14px', marginBottom:20, border:'1px solid var(--border)' }}>
              <p style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)', marginBottom:8 }}>SCÈNES DÉTECTÉES</p>
              {scriptScenes.map(s => (
                <div key={s.id} style={{ display:'flex', alignItems:'center', gap:8, padding:'5px 0', borderBottom:'1px solid var(--border)' }}>
                  <SFIcon name="check-circle" size={12} color="var(--ok)" />
                  <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text)' }}>S{s.number} — {s.label}</span>
                </div>
              ))}
            </div>
            <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setShowSyncModal(false)} style={{ padding:'8px 16px', borderRadius:8, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:13, color:'var(--text-2)' }}>Annuler</button>
              <button onClick={() => { setSynced(true); setShowSyncModal(false); }} style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'var(--accent)', cursor:'pointer', fontSize:13, color:'#000', fontWeight:700 }}>Synchroniser</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Storyboard ─────────────────────────────────────────────────────────────────

interface SBShot {
  id: string;
  sceneId: string;
  order: number;
  description: string;
  shotType: ShotType;
  cameraMove: CameraMove;
  notes: string;
  imageUrl?: string;
  aiPrompt?: string;
}

interface SBScene {
  id: string;
  number: number;
  label: string;
  shots: SBShot[];
}

const MOCK_SB_SCENES: SBScene[] = [
  {
    id:'sbs1', number:1, label:'INT. LOFT PARISIEN — JOUR',
    shots:[
      { id:'sb1', sceneId:'sbs1', order:1, description:'Plan large loft, lumière filtrée', shotType:'WS', cameraMove:'Statique', notes:'Ambiance dorée' },
      { id:'sb2', sceneId:'sbs1', order:2, description:'Dolly vers les mannequins', shotType:'MS', cameraMove:'Dolly', notes:'Mouvement lent', aiPrompt:'Fashion editorial, Parisian loft interior, golden hour light, clothing on mannequins, wide shot, cinematic' },
      { id:'sb3', sceneId:'sbs1', order:3, description:'JEUNE FEMME entre — profil', shotType:'MCU', cameraMove:'Épaule', notes:'' },
      { id:'sb4', sceneId:'sbs1', order:4, description:'Gros plan mains sur tissu', shotType:'CU', cameraMove:'Statique', notes:'Plan de coupe', aiPrompt:'Close up elegant hands touching silk fabric, fashion detail, shallow depth of field' },
    ],
  },
  {
    id:'sbs2', number:2, label:'EXT. TOITS DE PARIS — COUCHER DE SOLEIL',
    shots:[
      { id:'sb5', sceneId:'sbs2', order:1, description:'Vue toits de Paris, golden hour', shotType:'WS', cameraMove:'Pan', notes:'Heure dorée impérative', aiPrompt:'Paris rooftops at golden hour sunset, wide panoramic shot, warm orange light, cinematic' },
      { id:'sb6', sceneId:'sbs2', order:2, description:'JEUNE FEMME robe au vent', shotType:'LS', cameraMove:'Grue', notes:'Mouvement descendant' },
      { id:'sb7', sceneId:'sbs2', order:3, description:'Portrait final — fondu au noir', shotType:'MCU', cameraMove:'Statique', notes:'Fondu logo' },
    ],
  },
];

const SB_ASPECT = 16 / 9;

function StoryboardView({ resource, scriptScenes }: { resource: Resource; scriptScenes: ScriptScene[] }) {
  const [scenes, setScenes] = useState<SBScene[]>(MOCK_SB_SCENES);
  const [selectedShotId, setSelectedShotId] = useState<string | null>(null);
  const [selectedSceneId, setSelectedSceneId] = useState<string>(MOCK_SB_SCENES[0].id);
  const [showAIModal, setShowAIModal] = useState(false);
  const [aiShotId, setAiShotId] = useState<string | null>(null);
  const [aiPrompt, setAiPrompt] = useState('');
  const [aiStyle, setAiStyle] = useState<'cinematic' | 'sketch' | 'storyboard' | 'illustration'>('cinematic');
  const [aiGenerating, setAiGenerating] = useState(false);
  const [synced, setSynced] = useState(true);
  const [addingScene, setAddingScene] = useState(false);
  const [newSceneLabel, setNewSceneLabel] = useState('');
  const dragShotRef = useRef<{ sceneId: string; shotId: string } | null>(null);
  const [dragOverShot, setDragOverShot] = useState<string | null>(null);

  const updateShot = (sceneId: string, shotId: string, changes: Partial<SBShot>) => {
    setScenes(prev => prev.map(sc => sc.id !== sceneId ? sc : {
      ...sc, shots: sc.shots.map(sh => sh.id !== shotId ? sh : { ...sh, ...changes }),
    }));
  };

  const addShot = (sceneId: string) => {
    const scene = scenes.find(s => s.id === sceneId);
    if (!scene) return;
    const newShot: SBShot = {
      id: `sb${Date.now()}`, sceneId, order: scene.shots.length + 1,
      description: '', shotType: 'MS', cameraMove: 'Statique', notes: '',
    };
    setScenes(prev => prev.map(sc => sc.id !== sceneId ? sc : { ...sc, shots: [...sc.shots, newShot] }));
    setSelectedShotId(newShot.id);
  };

  const addScene = () => {
    const label = newSceneLabel.trim() || 'Nouvelle scène';
    const maxNum = Math.max(0, ...scenes.map(s => s.number));
    const newScene: SBScene = {
      id: `sbs${Date.now()}`, number: maxNum + 1, label, shots: [],
    };
    setScenes(prev => [...prev, newScene]);
    setNewSceneLabel('');
    setAddingScene(false);
  };

  const moveScene = (sceneId: string, dir: -1 | 1) => {
    setScenes(prev => {
      const idx = prev.findIndex(s => s.id === sceneId);
      if (idx === -1) return prev;
      const newIdx = idx + dir;
      if (newIdx < 0 || newIdx >= prev.length) return prev;
      const next = [...prev];
      [next[idx], next[newIdx]] = [next[newIdx], next[idx]];
      return next;
    });
  };

  const deleteShot = (sceneId: string, shotId: string) => {
    setScenes(prev => prev.map(sc => sc.id !== sceneId ? sc : { ...sc, shots: sc.shots.filter(sh => sh.id !== shotId) }));
    setSelectedShotId(null);
  };

  const reorderShot = (sceneId: string, fromId: string, toId: string) => {
    if (fromId === toId) return;
    setScenes(prev => prev.map(sc => {
      if (sc.id !== sceneId) return sc;
      const shots = [...sc.shots];
      const fromIdx = shots.findIndex(s => s.id === fromId);
      const toIdx = shots.findIndex(s => s.id === toId);
      if (fromIdx === -1 || toIdx === -1) return sc;
      const [moved] = shots.splice(fromIdx, 1);
      shots.splice(toIdx, 0, moved);
      return { ...sc, shots };
    }));
  };

  const openAI = (sceneId: string, shotId: string) => {
    const shot = scenes.find(s => s.id === sceneId)?.shots.find(sh => sh.id === shotId);
    setSelectedSceneId(sceneId);
    setAiShotId(shotId);
    setAiPrompt(shot?.aiPrompt || shot?.description || '');
    setShowAIModal(true);
  };

  const generateImage = () => {
    if (!aiShotId) return;
    setAiGenerating(true);
    setTimeout(() => {
      const PLACEHOLDER_IMGS = [
        'https://images.unsplash.com/photo-1509631179647-0177331693ae?w=640&h=360&fit=crop',
        'https://images.unsplash.com/photo-1496442226666-8d4d0e62e6e9?w=640&h=360&fit=crop',
        'https://images.unsplash.com/photo-1502602898657-3e91760cbb34?w=640&h=360&fit=crop',
        'https://images.unsplash.com/photo-1431274172761-fca41d930114?w=640&h=360&fit=crop',
      ];
      const url = PLACEHOLDER_IMGS[Math.floor(Math.random() * PLACEHOLDER_IMGS.length)];
      updateShot(selectedSceneId, aiShotId, { imageUrl: url, aiPrompt });
      setAiGenerating(false);
      setShowAIModal(false);
    }, 2200);
  };

  const AI_STYLES = [
    { key:'cinematic' as const,    label:'Cinématique',   desc:'Photo réaliste, référence film' },
    { key:'sketch' as const,       label:'Croquis',       desc:'Dessin rapide, lignes nettes' },
    { key:'storyboard' as const,   label:'Storyboard',    desc:'Style bande dessinée classique' },
    { key:'illustration' as const, label:'Illustration',  desc:'Aquarelle, style artistique' },
  ];

  const frameW = 220;
  const frameH = Math.round(frameW / SB_ASPECT);

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* Toolbar */}
      <div style={{ padding:'10px 20px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
        <SFIcon name="film" size={14} color="var(--text-3)" />
        <span style={{ fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-3)' }}>
          {scenes.length} scènes · {scenes.reduce((a,s) => a + s.shots.length, 0)} plans
        </span>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:8 }}>
          {!synced && (
            <button onClick={() => setSynced(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border-2)', background:'var(--surface-2)', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-2)' }}>
              <SFIcon name="refresh-cw" size={12} />Sync script
            </button>
          )}
          {synced && (
            <div style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:8, background:'var(--ok)18', border:'1px solid var(--ok)44' }}>
              <SFIcon name="check" size={11} color="var(--ok)" />
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--ok)' }}>Synchronisé</span>
            </div>
          )}
          {addingScene ? (
            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input autoFocus value={newSceneLabel} onChange={e => setNewSceneLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') addScene(); if (e.key === 'Escape') setAddingScene(false); }}
                placeholder="Titre de scène…"
                style={{ padding:'5px 9px', borderRadius:7, border:'1px solid var(--border-2)', background:'var(--surface-2)', color:'var(--text)', fontSize:11, fontFamily:'var(--ff-text)', outline:'none', width:180 }} />
              <button onClick={addScene} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'var(--accent)', cursor:'pointer', fontSize:11, color:'#000', fontWeight:700 }}>Créer</button>
              <button onClick={() => setAddingScene(false)} style={{ padding:'5px 8px', borderRadius:7, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', color:'var(--text-3)', fontSize:11 }}>✕</button>
            </div>
          ) : (
            <button onClick={() => setAddingScene(true)} style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 12px', borderRadius:8, border:'1px solid var(--border-2)', background:'var(--surface-2)', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:10, color:'var(--text-2)' }}>
              <SFIcon name="plus" size={12} />Scène
            </button>
          )}
        </div>
      </div>

      {/* All scenes — vertical scroll */}
      <div style={{ flex:1, overflow:'auto', padding:'20px 24px' }}>
        {scenes.map((scene, sceneIdx) => (
          <div key={scene.id} style={{ marginBottom:40 }}>
            {/* Scene header */}
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, paddingBottom:10, borderBottom:'2px solid var(--border)' }}>
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--accent)', fontWeight:700 }}>S{scene.number}</span>
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color: scene.label.startsWith('INT') ? '#7dd3fc' : '#86efac', background: scene.label.startsWith('INT') ? '#7dd3fc18' : '#86efac18', borderRadius:4, padding:'2px 7px' }}>
                {scene.label.startsWith('INT') ? 'INT' : 'EXT'}
              </span>
              <span style={{ fontSize:13, fontWeight:600, color:'var(--text)' }}>{scene.label}</span>
              <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)' }}>{scene.shots.length} plan{scene.shots.length !== 1 ? 's' : ''}</span>
              <div style={{ display:'flex', gap:2 }}>
                <button onClick={() => moveScene(scene.id, -1)} disabled={sceneIdx === 0}
                  style={{ background:'transparent', border:'none', cursor: sceneIdx === 0 ? 'default' : 'pointer', color: sceneIdx === 0 ? 'var(--border-2)' : 'var(--text-3)', padding:'2px 5px', borderRadius:4, fontSize:11 }}
                  title="Monter la scène">↑</button>
                <button onClick={() => moveScene(scene.id, 1)} disabled={sceneIdx === scenes.length - 1}
                  style={{ background:'transparent', border:'none', cursor: sceneIdx === scenes.length - 1 ? 'default' : 'pointer', color: sceneIdx === scenes.length - 1 ? 'var(--border-2)' : 'var(--text-3)', padding:'2px 5px', borderRadius:4, fontSize:11 }}
                  title="Descendre la scène">↓</button>
              </div>
              <button onClick={() => addShot(scene.id)} style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'5px 12px', borderRadius:8, border:'none', background:'var(--accent)', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:10, color:'#000', fontWeight:700 }}>
                <SFIcon name="plus" size={11} />Plan
              </button>
            </div>

            {/* Shots grid */}
            <div style={{ display:'flex', flexWrap:'wrap', gap:16 }}>
              {scene.shots.map((shot, idx) => (
                <div key={shot.id}
                  draggable
                  onDragStart={() => { dragShotRef.current = { sceneId: scene.id, shotId: shot.id }; }}
                  onDragEnd={() => { dragShotRef.current = null; setDragOverShot(null); }}
                  onDragOver={e => { e.preventDefault(); setDragOverShot(shot.id); }}
                  onDrop={e => {
                    e.preventDefault();
                    if (dragShotRef.current && dragShotRef.current.sceneId === scene.id) {
                      reorderShot(scene.id, dragShotRef.current.shotId, shot.id);
                    }
                    dragShotRef.current = null;
                    setDragOverShot(null);
                  }}
                  onClick={() => setSelectedShotId(selectedShotId === shot.id ? null : shot.id)}
                  style={{ cursor:'grab', borderRadius:12, border: dragOverShot === shot.id ? '2px solid var(--accent)' : selectedShotId === shot.id ? '2px solid var(--accent)' : '2px solid var(--border)', background:'var(--surface-2)', overflow:'hidden', width:frameW, flexShrink:0, transition:'border-color .15s', opacity: dragShotRef.current?.shotId === shot.id ? 0.5 : 1 }}>
                  {/* Frame */}
                  <div style={{ width:frameW, height:frameH, background:'var(--surface-3)', position:'relative', overflow:'hidden' }}>
                    {shot.imageUrl ? (
                      <img src={shot.imageUrl} alt="" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                    ) : (
                      <div style={{ width:'100%', height:'100%', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:6 }}>
                        <div style={{ opacity:0.15 }}>
                          <svg width={frameW} height={frameH} style={{ position:'absolute', top:0, left:0 }}>
                            <line x1={frameW/3} y1={0} x2={frameW/3} y2={frameH} stroke="white" strokeWidth={0.5} strokeDasharray="3,3" />
                            <line x1={frameW*2/3} y1={0} x2={frameW*2/3} y2={frameH} stroke="white" strokeWidth={0.5} strokeDasharray="3,3" />
                            <line x1={0} y1={frameH/3} x2={frameW} y2={frameH/3} stroke="white" strokeWidth={0.5} strokeDasharray="3,3" />
                            <line x1={0} y1={frameH*2/3} x2={frameW} y2={frameH*2/3} stroke="white" strokeWidth={0.5} strokeDasharray="3,3" />
                            <rect x={2} y={2} width={frameW-4} height={frameH-4} fill="none" stroke="white" strokeWidth={1} />
                          </svg>
                        </div>
                        <SFIcon name="image" size={22} color="var(--text-3)" />
                      </div>
                    )}
                    <div style={{ position:'absolute', top:6, left:6, background:'rgba(0,0,0,0.7)', borderRadius:5, padding:'2px 7px', fontFamily:'var(--ff-mono)', fontSize:9, color:'white', fontWeight:700 }}>{idx + 1}</div>
                    <div style={{ position:'absolute', top:6, right:6, background:'rgba(0,0,0,0.7)', borderRadius:5, padding:'2px 7px', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--accent)' }}>{shot.shotType}</div>
                    <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', display:'flex', alignItems:'center', justifyContent:'center', gap:8, opacity:0, transition:'opacity .2s' }}
                      onMouseEnter={e => (e.currentTarget.style.opacity='1')} onMouseLeave={e => (e.currentTarget.style.opacity='0')}>
                      <button onClick={e => { e.stopPropagation(); openAI(scene.id, shot.id); }}
                        style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'none', background:'var(--accent)', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:10, color:'#000', fontWeight:700 }}>
                        <SFIcon name="sparkles" size={12} />IA
                      </button>
                      <label style={{ display:'flex', alignItems:'center', gap:5, padding:'6px 12px', borderRadius:8, border:'1px solid rgba(255,255,255,0.3)', background:'transparent', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:10, color:'white' }}>
                        <SFIcon name="upload" size={12} />Upload
                        <input type="file" accept="image/*" style={{ display:'none' }} onChange={e => {
                          const file = e.target.files?.[0];
                          if (!file) return;
                          const url = URL.createObjectURL(file);
                          updateShot(scene.id, shot.id, { imageUrl: url });
                        }} />
                      </label>
                    </div>
                  </div>
                  <div style={{ padding:'8px 10px' }}>
                    {selectedShotId === shot.id ? (
                      <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
                        <input value={shot.description} onChange={e => updateShot(scene.id, shot.id, { description: e.target.value })}
                          placeholder="Description du plan…"
                          style={{ width:'100%', background:'var(--surface-3)', border:'1px solid var(--border-2)', borderRadius:6, padding:'4px 7px', fontSize:11, color:'var(--text)', fontFamily:'var(--ff-text)', boxSizing:'border-box' }} />
                        <div style={{ display:'flex', gap:4 }}>
                          <select value={shot.shotType} onChange={e => updateShot(scene.id, shot.id, { shotType: e.target.value as ShotType })}
                            style={{ flex:1, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 5px', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text)' }}>
                            {SHOT_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                          </select>
                          <select value={shot.cameraMove} onChange={e => updateShot(scene.id, shot.id, { cameraMove: e.target.value as CameraMove })}
                            style={{ flex:1, background:'var(--surface-3)', border:'1px solid var(--border)', borderRadius:6, padding:'3px 5px', fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text)' }}>
                            {CAMERA_MOVES.map(m => <option key={m} value={m}>{m}</option>)}
                          </select>
                        </div>
                        <div style={{ display:'flex', justifyContent:'flex-end' }}>
                          <button onClick={e => { e.stopPropagation(); deleteShot(scene.id, shot.id); }}
                            style={{ display:'flex', alignItems:'center', gap:4, padding:'3px 8px', borderRadius:6, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:10, color:'var(--text-3)' }}>
                            <SFIcon name="trash-2" size={10} />Supprimer
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <p style={{ fontSize:11, color:'var(--text-2)', lineHeight:1.4, marginBottom:4, minHeight:16 }}>{shot.description || <span style={{ color:'var(--text-3)' }}>—</span>}</p>
                        <div style={{ display:'flex', gap:4 }}>
                          <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', background:'var(--surface-3)', borderRadius:4, padding:'2px 5px' }}>{shot.shotType}</span>
                          <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'var(--text-3)', background:'var(--surface-3)', borderRadius:4, padding:'2px 5px' }}>{shot.cameraMove}</span>
                          {shot.aiPrompt && <span style={{ fontFamily:'var(--ff-mono)', fontSize:8, color:'#c4b5fd', background:'#c4b5fd18', borderRadius:4, padding:'2px 5px' }}>IA</span>}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {/* Add shot card */}
              <div onClick={() => addShot(scene.id)}
                style={{ width:frameW, height:frameH + 68, border:'2px dashed var(--border)', borderRadius:12, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8, cursor:'pointer', color:'var(--text-3)', flexShrink:0, transition:'border-color .15s, color .15s' }}
                onMouseEnter={e => { (e.currentTarget as HTMLDivElement).style.borderColor='var(--accent)'; (e.currentTarget as HTMLDivElement).style.color='var(--accent)'; }}
                onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor='var(--border)'; (e.currentTarget as HTMLDivElement).style.color='var(--text-3)'; }}>
                <SFIcon name="plus" size={20} />
                <span style={{ fontFamily:'var(--ff-mono)', fontSize:10 }}>Nouveau plan</span>
              </div>
            </div>
          </div>
        ))}
        {scenes.length === 0 && (
          <div style={{ textAlign:'center', padding:'60px 20px', color:'var(--text-3)', fontSize:13 }}>
            Aucune scène — cliquez sur <strong style={{ color:'var(--text-2)' }}>+ Scène</strong> pour commencer.
          </div>
        )}
      </div>

      {/* AI Generation Modal */}
      {showAIModal && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center' }}
          onMouseDown={e => { if (e.target === e.currentTarget && !aiGenerating) setShowAIModal(false); }}>
          <div style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.6)', backdropFilter:'blur(6px)' }} />
          <div style={{ position:'relative', zIndex:1, background:'var(--surface-1)', border:'1px solid var(--border-2)', borderRadius:20, width:'min(560px,92vw)', padding:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:20 }}>
              <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#7c3aed,#2563eb)', display:'flex', alignItems:'center', justifyContent:'center' }}>
                <SFIcon name="sparkles" size={16} color="white" />
              </div>
              <div>
                <h3 style={{ fontSize:15, fontWeight:700, color:'var(--text)', marginBottom:2 }}>Génération IA</h3>
                <p style={{ fontSize:11, color:'var(--text-3)' }}>Décrivez le cadre à générer</p>
              </div>
              {!aiGenerating && (
                <button onClick={() => setShowAIModal(false)} style={{ marginLeft:'auto', background:'transparent', border:'none', cursor:'pointer', color:'var(--text-3)', padding:6 }}>
                  <SFIcon name="x" size={16} />
                </button>
              )}
            </div>

            {/* Prompt */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:6 }}>Prompt</label>
              <textarea value={aiPrompt} onChange={e => setAiPrompt(e.target.value)} rows={4} disabled={aiGenerating}
                placeholder="Ex: Wide shot of a Parisian loft at golden hour, fashion editorial, cinematic lighting, soft shadows…"
                style={{ width:'100%', boxSizing:'border-box', background:'var(--surface-2)', border:'1px solid var(--border-2)', borderRadius:10, padding:'10px 12px', fontSize:13, color:'var(--text)', fontFamily:'var(--ff-text)', resize:'vertical', lineHeight:1.5 }} />
            </div>

            {/* Style */}
            <div style={{ marginBottom:22 }}>
              <label style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--text-3)', textTransform:'uppercase', letterSpacing:'0.07em', display:'block', marginBottom:8 }}>Style</label>
              <div style={{ display:'flex', gap:8 }}>
                {AI_STYLES.map(s => (
                  <button key={s.key} onClick={() => setAiStyle(s.key)} disabled={aiGenerating}
                    style={{ flex:1, padding:'8px 6px', borderRadius:10, border: aiStyle===s.key ? '2px solid var(--accent)' : '1px solid var(--border)', background: aiStyle===s.key ? 'var(--accent)18' : 'var(--surface-2)', cursor:'pointer', textAlign:'center' }}>
                    <p style={{ fontFamily:'var(--ff-mono)', fontSize:10, fontWeight:700, color: aiStyle===s.key ? 'var(--accent)' : 'var(--text)', marginBottom:2 }}>{s.label}</p>
                    <p style={{ fontSize:9, color:'var(--text-3)', lineHeight:1.3 }}>{s.desc}</p>
                  </button>
                ))}
              </div>
            </div>

            {aiGenerating ? (
              <div style={{ display:'flex', flexDirection:'column', alignItems:'center', gap:12, padding:'10px 0' }}>
                <div style={{ width:40, height:40, borderRadius:'50%', border:'3px solid var(--border)', borderTop:'3px solid var(--accent)', animation:'spin 1s linear infinite' }}>
                  <style>{'@keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}'}</style>
                </div>
                <p style={{ fontFamily:'var(--ff-mono)', fontSize:11, color:'var(--text-2)' }}>Génération en cours…</p>
              </div>
            ) : (
              <div style={{ display:'flex', justifyContent:'flex-end', gap:10 }}>
                <button onClick={() => setShowAIModal(false)} style={{ padding:'9px 18px', borderRadius:9, border:'1px solid var(--border)', background:'transparent', cursor:'pointer', fontSize:13, color:'var(--text-2)' }}>Annuler</button>
                <button onClick={generateImage} disabled={!aiPrompt.trim()}
                  style={{ display:'flex', alignItems:'center', gap:7, padding:'9px 20px', borderRadius:9, border:'none', background: aiPrompt.trim() ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : 'var(--surface-3)', cursor: aiPrompt.trim() ? 'pointer' : 'default', fontSize:13, color:'white', fontWeight:700 }}>
                  <SFIcon name="sparkles" size={14} />Générer
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Scénarisation (Script + Shotlist + Storyboard unified) ────────────────────

type ScreenplayTab = 'script' | 'shotlist' | 'storyboard';

export function ScreenplayView({ resource, onEdit, saveState = 'saved', online = true, registerExport, seedElements, contentRef }: { resource: Resource; seedElements?: ScriptEl[]; contentRef?: React.MutableRefObject<(() => ScriptEl[]) | null> } & EditableProps) {
  const [activeTab, setActiveTab] = useState<ScreenplayTab>('script');
  const [versions, setVersions] = useState<ScriptVersion[]>(() =>
    seedElements
      ? [{ id: 'v1', label: 'Brouillon', date: new Date().toLocaleDateString('fr-FR'), elements: seedElements }]
      : INITIAL_VERSIONS
  );
  const [activeVersionId, setActiveVersionId] = useState(() => seedElements ? 'v1' : 'v3');
  useEffect(() => {
    if (contentRef) {
      const active = versions.find(v => v.id === activeVersionId) ?? versions[0];
      contentRef.current = () => active.elements;
    }
  });

  const activeVersion = versions.find(v => v.id === activeVersionId) ?? versions[0];
  const elements = activeVersion.elements;

  const scriptScenes: ScriptScene[] = elements
    .filter(e => e.type === 'scene')
    .map((s, i) => ({ id: s.id, number: i + 1, label: s.text }));

  const TABS: { key: ScreenplayTab; label: string; icon: string }[] = [
    { key: 'script',     label: 'Script',     icon: 'file-text' },
    { key: 'shotlist',   label: 'Shotlist',   icon: 'list' },
    { key: 'storyboard', label: 'Storyboard', icon: 'layout-panel-top' },
  ];

  return (
    <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
      {/* View switcher */}
      <div style={{ display:'flex', alignItems:'center', gap:2, padding:'0 16px', borderBottom:'1px solid var(--border)', flexShrink:0, background:'var(--surface)' }}>
        {TABS.map(tab => (
          <button key={tab.key} onClick={() => setActiveTab(tab.key)}
            style={{ display:'flex', alignItems:'center', gap:6, padding:'9px 14px', border:'none', background:'transparent', cursor:'pointer', fontFamily:'var(--ff-mono)', fontSize:10, textTransform:'uppercase', letterSpacing:'0.07em', color: activeTab===tab.key ? 'var(--text)' : 'var(--text-3)', borderBottom: activeTab===tab.key ? '2px solid var(--accent)' : '2px solid transparent', marginBottom:-1, whiteSpace:'nowrap' }}>
            <SFIcon name={tab.icon} size={12} color={activeTab===tab.key ? 'var(--accent)' : 'var(--text-3)'} />
            {tab.label}
          </button>
        ))}
        {scriptScenes.length > 0 && activeTab !== 'script' && (
          <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:5, padding:'4px 10px', borderRadius:8, background:'var(--surface-2)', border:'1px solid var(--border)' }}>
            <SFIcon name="link" size={10} color="var(--ok)" />
            <span style={{ fontFamily:'var(--ff-mono)', fontSize:9, color:'var(--ok)' }}>{scriptScenes.length} scène{scriptScenes.length > 1 ? 's' : ''} depuis le script</span>
          </div>
        )}
      </div>

      {/* Content — all three views always mounted to preserve state, hidden when inactive */}
      <div style={{ flex:1, overflow:'hidden', display: activeTab === 'script' ? 'flex' : 'none' }}>
        <ScriptView
          resource={resource}
          versions={versions} setVersions={setVersions}
          activeVersionId={activeVersionId} setActiveVersionId={setActiveVersionId}
          onEdit={onEdit} saveState={saveState} online={online} registerExport={registerExport}
        />
      </div>
      <div style={{ flex:1, overflow:'hidden', display: activeTab === 'shotlist' ? 'flex' : 'none' }}>
        <ShotlistView resource={resource} scriptScenes={scriptScenes} />
      </div>
      <div style={{ flex:1, overflow:'hidden', display: activeTab === 'storyboard' ? 'flex' : 'none' }}>
        <StoryboardView resource={resource} scriptScenes={scriptScenes} />
      </div>
    </div>
  );
}

// ── Embeddable body (used in task panel floating overlay) ─────────────────────

export function ResourceBody({ resource }: { resource: Resource }) {
  switch (resource.type) {
    case 'video_review': return <VideoReviewBody resource={resource} />;
    case 'screenplay':   return <ScreenplayView resource={resource} />;
    case 'moodboard':    return <MoodboardView resource={resource} />;
    case 'checklist':    return <ChecklistView resource={resource} />;
    case 'document':     return <DocumentView resource={resource} />;
    case 'inspirations': return <InspirationsView resource={resource} />;
    case 'file':         return <FileView resource={resource} />;
    case 'form':         return <FormView resource={resource} />;
    default:             return <div style={{ padding: 40, color: 'var(--text-3)' }}>Type non pris en charge</div>;
  }
}

// ── Main component ────────────────────────────────────────────────────────────

export function ResourceDetail() {
  const { projectId, resourceId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();
  const project = PROJECTS.find(p => p.id === projectId) ?? PROJECTS[0];
  const [resources, setResources] = useState(getResources);
  useEffect(() => subscribeResources(() => setResources(getResources())), []);
  useEffect(() => { if (resourceId) markResourceRead(resourceId); }, [resourceId]);

  // Focus comments panel when arriving from a notification link
  useEffect(() => {
    if (searchParams.get('focus') !== 'comments') return;
    setSearchParams({}, { replace: true });
    setTimeout(() => {
      const el = document.getElementById('rd-comments-panel');
      if (!el) return;
      el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      el.style.animation = 'highlight-flash 2s ease forwards';
      el.addEventListener('animationend', () => { el.style.animation = ''; }, { once: true });
    }, 150);
  }, []);

  const resource = resources.find(r => r.id === resourceId);

  const { state: saveState, online, touch } = useAutosave();

  if (!resource) return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 12, color: 'var(--text-3)' }}>
      <SFIcon name="file-x" size={36} color="var(--text-3)" />
      <p style={{ fontSize: 14, fontWeight: 600, color: 'var(--text-2)' }}>Ressource introuvable</p>
      <p style={{ fontSize: 12 }}>L'identifiant <code style={{ background: 'var(--surface-3)', padding: '1px 5px', borderRadius: 4, fontFamily: 'var(--ff-mono)' }}>{resourceId}</code> ne correspond à aucune ressource.</p>
    </div>
  );
  const exporterRef = useRef<(() => ExportPayload) | null>(null);
  const registerExport = useCallback<RegisterExport>((fn) => { exporterRef.current = fn; }, []);

  const [toast, setToast] = useState<string | null>(null);
  const toastTimer = useRef<number | null>(null);
  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(null), 2600);
  }, []);

  const editable = resource.type === 'screenplay' || resource.type === 'document';

  const handleExport = useCallback((fmt: ExportFormat) => {
    if (fmt === 'gdocs') {
      if (!navigator.onLine) { showToast('Hors ligne — export Google Docs indisponible'); return; }
      showToast('Export vers Google Docs…');
      window.setTimeout(() => showToast('Exporté vers Google Docs'), 1300);
      return;
    }
    const payload = exporterRef.current?.();
    if (!payload) { showToast('Rien à exporter'); return; }
    const ok = exportToPDF(payload);
    if (!ok) showToast('Autorisez les fenêtres pop-up pour exporter en PDF');
  }, [showToast]);

  const handleStatusChange = (status: Status, statusLabel: string) => {
    updateResource(resource.id, { status, statusLabel });
  };

  const renderBody = () => {
    switch (resource.type) {
      case 'video_review': return <VideoReviewBody resource={resource} />;
      case 'screenplay':   return <ScreenplayView resource={resource} onEdit={touch} saveState={saveState} online={online} registerExport={registerExport} />;
      case 'moodboard':    return <MoodboardView resource={resource} />;
      case 'checklist':    return <ChecklistView resource={resource} />;
      case 'document':     return <DocumentView resource={resource} onEdit={touch} saveState={saveState} online={online} registerExport={registerExport} />;
      case 'inspirations': return <InspirationsView resource={resource} />;
      case 'file':         return <FileView resource={resource} />;
      case 'form':         return <FormView resource={resource} />;
      default:             return <div style={{ padding:40, color:'var(--text-3)' }}>Type non pris en charge</div>;
    }
  };

  return (
    <div style={{ height:'100%', display:'flex', flexDirection:'column', overflow:'hidden' }}>
      <ResourceTopbar project={project} resource={resource} onStatusChange={handleStatusChange} saveState={saveState} online={online} editable={editable} onExport={handleExport} />
      <div style={{ flex:1, display:'flex', flexDirection:'column', overflow:'hidden' }}>
        {renderBody()}
      </div>
      {toast && (
        <div style={{ position:'fixed', bottom:24, right:24, zIndex:300, background:'var(--surface-3)', border:'1px solid var(--border-2)', borderRadius:10, padding:'10px 14px', boxShadow:'0 8px 24px rgba(0,0,0,0.5)', display:'flex', alignItems:'center', gap:8, fontSize:12, color:'var(--text)', fontFamily:'var(--ff-text)' }}>
          <SFIcon name="download" size={14} color="var(--accent)" />
          {toast}
        </div>
      )}
    </div>
  );
}
