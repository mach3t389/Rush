import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SFPill, SFBar, SFAvatar, SFButton, SFIcon } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { PROJECTS } from '../data/mock';
import { getResources, addResource, updateResource, removeResource, subscribeResources } from '../data/resourceStore';
import { useResourceNotifCount } from '../hooks/useNotifs';
import type { Resource, ResourceType, Status } from '../types';

const STATUS_OPTIONS: { status: Status; label: string }[] = [
  { status: 'ok',      label: 'Terminé' },
  { status: 'info',    label: 'En cours' },
  { status: 'warn',    label: 'À faire' },
  { status: 'review',  label: 'En révision' },
  { status: 'danger',  label: 'Bloqué' },
  { status: 'neutral', label: 'En attente' },
];

// â”€â”€ New resource modal â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

const RESOURCE_TYPES: { type: ResourceType; label: string; icon: string; desc: string }[] = [
  { type: 'screenplay',   label: 'Scénarisation',   icon: 'clapperboard',   desc: 'Script, shotlist et storyboard unifiés' },
  { type: 'document',     label: 'Document',         icon: 'file',           desc: 'Contrat, brief, compte-rendu' },
  { type: 'video_review', label: 'Révision',           icon: 'scan-eye',       desc: 'Vidéo, photo ou fichier à réviser avec le client' },
  { type: 'moodboard',    label: 'Moodboard',        icon: 'grid-2x2',       desc: 'Direction artistique, références visuelles' },
  { type: 'checklist',    label: 'Checklist',        icon: 'list-checks',    desc: 'Liste de vérification, to-do' },
  { type: 'inspirations', label: 'Inspirations',     icon: 'image',          desc: 'Galerie d\'images de référence' },
  { type: 'file',         label: 'Fichier',           icon: 'hard-drive',     desc: 'Importer un fichier ou dossier de fichiers' },
  { type: 'form',         label: 'Formulaire',        icon: 'clipboard-list', desc: 'Questionnaire, formulaire client, sondage' },
];

const MEDIA_SUBTYPES: { value: 'video' | 'photo' | 'file'; label: string; icon: string; desc: string }[] = [
  { value: 'video', label: 'Vidéo',   icon: 'video',      desc: 'Révision d\'une vidéo avec annotations et commentaires' },
  { value: 'photo', label: 'Photo',   icon: 'image',      desc: 'Révision d\'images ou de visuels avec le client' },
  { value: 'file',  label: 'Fichier', icon: 'file-text',  desc: 'Révision d\'un PDF, document ou autre fichier' },
];

function NewResourceModal({ projectId, onClose }: { projectId: string; onClose: () => void }) {
  const navigate = useNavigate();
  const [step, setStep] = useState<'type' | 'media' | 'name'>('type');
  const [selected, setSelected] = useState<ResourceType | null>(null);
  const [mediaSubtype, setMediaSubtype] = useState<'video' | 'photo' | 'file' | null>(null);
  const [title, setTitle] = useState('');

  const TYPE_EYEBROW: Record<ResourceType, string> = {
    screenplay: 'SCÉNARISATION', video_review: 'RÉVISION', moodboard: 'MOODBOARD',
    document: 'DOCUMENT', checklist: 'CHECKLIST', inspirations: 'INSPIRATIONS', file: 'FICHIER',
    form: 'FORMULAIRE',
  };

  const handleCreate = () => {
    if (!selected || !title.trim()) return;
    const id = `r${Date.now()}`;
    const newRes: Resource = {
      id,
      type: selected,
      eyebrow: TYPE_EYEBROW[selected],
      title: title.trim(),
      status: 'warn',
      statusLabel: 'À faire',
      meta: 'Créé à l\'instant',
      version: 'V1',
      ...(selected === 'video_review' && mediaSubtype ? { mediaSubtype } : {}),
    };
    addResource(newRes);
    onClose();
    navigate(`/projets/${projectId}/ressources/${id}`);
  };

  const stepLabel = step === 'type' ? 'Choisissez un type de ressource'
    : step === 'media' ? 'Quel type de média souhaitez-vous réviser ?'
    : 'Donnez un nom à cette ressource';

  return (
    <div style={{ position: 'fixed', inset: 0, zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div onClick={onClose} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
      <div style={{ position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 18, width: 520, boxShadow: '0 20px 60px rgba(0,0,0,0.7)', overflow: 'hidden' }}>

        {/* Header */}
        <div style={{ padding: '20px 24px 16px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h2 style={{ fontSize: 16, fontWeight: 700, marginBottom: 2 }}>Nouvelle ressource</h2>
            <p style={{ fontSize: 12, color: 'var(--text-3)' }}>{stepLabel}</p>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', display: 'flex', padding: 6, borderRadius: 8 }}>
            <SFIcon name="x" size={16} />
          </button>
        </div>

        {step === 'type' && (
          <div style={{ padding: '16px 24px 24px' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10 }}>
              {RESOURCE_TYPES.map(r => (
                <button
                  key={r.type}
                  onClick={() => {
                    setSelected(r.type);
                    if (r.type === 'video_review') setStep('media');
                    else setStep('name');
                  }}
                  style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12,
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${selected === r.type ? 'var(--accent)' : 'var(--border)'}`,
                    background: selected === r.type ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = selected === r.type ? 'var(--accent)' : 'var(--border)'; }}
                >
                  <div style={{ width: 36, height: 36, borderRadius: 9, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, marginTop: 1 }}>
                    <SFIcon name={r.icon} size={17} color="var(--text-2)" />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 3 }}>{r.label}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{r.desc}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>
        )}

        {step === 'media' && (
          <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {MEDIA_SUBTYPES.map(m => (
                <button
                  key={m.value}
                  onClick={() => { setMediaSubtype(m.value); setStep('name'); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 14,
                    padding: '14px 16px', borderRadius: 12, cursor: 'pointer', textAlign: 'left',
                    border: `1px solid ${mediaSubtype === m.value ? 'var(--accent)' : 'var(--border)'}`,
                    background: mediaSubtype === m.value ? 'rgba(249,255,0,0.04)' : 'var(--surface-2)',
                    transition: 'all 0.12s',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.borderColor = 'var(--border-2)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.borderColor = mediaSubtype === m.value ? 'var(--accent)' : 'var(--border)'; }}
                >
                  <div style={{ width: 40, height: 40, borderRadius: 10, background: 'var(--surface-3)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <SFIcon name={m.icon} size={18} color="var(--text-2)" />
                  </div>
                  <div>
                    <p style={{ fontSize: 13, fontWeight: 600, marginBottom: 2 }}>{m.label}</p>
                    <p style={{ fontSize: 11, color: 'var(--text-3)', lineHeight: 1.4 }}>{m.desc}</p>
                  </div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <SFButton variant="ghost" size="sm" onClick={() => setStep('type')}>Retour</SFButton>
            </div>
          </div>
        )}

        {step === 'name' && (
          <div style={{ padding: '20px 24px 24px', display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Selected type chip */}
            {selected && (
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <button onClick={() => setStep(selected === 'video_review' ? 'media' : 'type')} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)' }}>
                  <SFIcon name={RESOURCE_TYPES.find(r => r.type === selected)!.icon} size={12} />
                  {RESOURCE_TYPES.find(r => r.type === selected)!.label}
                  {mediaSubtype && <span style={{ color: 'var(--text-3)' }}>· {MEDIA_SUBTYPES.find(m => m.value === mediaSubtype)!.label}</span>}
                  <SFIcon name="chevron-down" size={10} color="var(--text-3)" />
                </button>
              </div>
            )}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Nom de la ressource</label>
              <input
                autoFocus
                value={title}
                onChange={e => setTitle(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleCreate(); if (e.key === 'Escape') onClose(); }}
                placeholder="ex. Rough Cut V1, Photo de couverture..."
                style={{ padding: '10px 14px', borderRadius: 10, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, outline: 'none', fontFamily: 'var(--ff-text)', transition: 'border-color 0.12s' }}
                onFocus={e => (e.currentTarget.style.borderColor = 'var(--accent)')}
                onBlur={e => (e.currentTarget.style.borderColor = 'var(--border-2)')}
              />
            </div>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', marginTop: 4 }}>
              <SFButton variant="ghost" size="sm" onClick={() => setStep(selected === 'video_review' ? 'media' : 'type')}>Retour</SFButton>
              <SFButton variant="primary" size="sm" icon="plus" onClick={handleCreate}>Créer la ressource</SFButton>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

const TYPE_ICON: Record<ResourceType, string> = {
  screenplay:   'clapperboard',
  video_review: 'scan-eye',
  moodboard:    'grid-2x2',
  document:     'file',
  checklist:    'list-checks',
  inspirations: 'image',
  file:         'hard-drive',
  form:         'clipboard-list',
};

const SUBTYPE_ICON: Record<string, string> = {
  video: 'video',
  photo: 'image',
  file:  'file-search',
};
const SUBTYPE_LABEL: Record<string, string> = {
  video: 'VIDÉO',
  photo: 'PHOTOS',
  file:  'DOCUMENT',
};

const FILTERS: { key: 'all' | ResourceType; label: string }[] = [
  { key: 'all',          label: 'Tous' },
  { key: 'screenplay',   label: 'Scénarisation' },
  { key: 'document',     label: 'Document' },
  { key: 'video_review', label: 'Révision' },
  { key: 'moodboard',    label: 'Moodboard' },
  { key: 'inspirations', label: 'Inspirations' },
  { key: 'checklist',    label: 'Checklist' },
  { key: 'file',         label: 'Fichiers' },
  { key: 'form',         label: 'Formulaire' },
];

// â”€â”€ Resource thumbnail preview â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€â”€

// Centered half-width panel — floats over dark bg; top: 7 shows the page's top edge
const HALF_PAGE: React.CSSProperties = {
  position: 'absolute',
  top: 7, bottom: 0,
  left: '50%', transform: 'translateX(-50%)',
  width: '54%',
  background: '#f9f8f5',
  borderRadius: '3px 3px 0 0',
  boxShadow: '0 -3px 14px rgba(0,0,0,0.5)',
  overflow: 'hidden',
  padding: '8px 10px 28px',
  boxSizing: 'border-box',
  display: 'flex', flexDirection: 'column', gap: 3,
};

function ResourceThumb({ r }: { r: Resource }) {
  const type = r.type;
  const title = r.title;

  /* â”€â”€ Screenplay â”€â”€ */
  if (type === 'screenplay') {
    return (
      <div style={{ width: '100%', height: '100%', background: '#12151e', position: 'relative' }}>
        <div style={HALF_PAGE}>
          <div style={{ fontFamily: 'Courier New, monospace', fontSize: 6.5, fontWeight: 700, color: '#111', letterSpacing: 0.3, textTransform: 'uppercase' }}>INT. STUDIO — JOUR</div>
          <div style={{ height: 1, background: '#ccc', margin: '1px 0' }} />
          <div style={{ fontFamily: 'Courier New, monospace', fontSize: 6, fontWeight: 700, color: '#222', lineHeight: 1.4 }}>{title}</div>
          <div style={{ height: 3 }} />
          {[
            { text: 'La caméra s\'avance lentement.', bold: false, indent: false },
            { text: 'LÉONIE (V.O.)', bold: true, indent: false },
            { text: 'Chaque image raconte', bold: false, indent: true },
            { text: 'une histoire. Encore', bold: false, indent: true },
            { text: 'faut-il savoir laquelle.', bold: false, indent: true },
            { text: 'EXT. RUE — CRÉPUSCULE', bold: true, indent: false },
            { text: 'La foule se disperse.', bold: false, indent: false },
          ].map((l, i) => (
            <div key={i} style={{ fontFamily: 'Courier New, monospace', fontSize: 5.8, color: l.bold ? '#333' : '#777', fontWeight: l.bold ? 700 : 400, lineHeight: 1.5, paddingLeft: l.indent ? 14 : 0 }}>{l.text}</div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Document ── */
  if (type === 'document') {
    return (
      <div style={{ width: '100%', height: '100%', background: '#141820', position: 'relative' }}>
        <div style={HALF_PAGE}>
          <div style={{ fontSize: 8, fontWeight: 700, color: '#111', lineHeight: 1.3 }}>{title}</div>
          {r.version && <div style={{ fontSize: 6, color: '#999', fontFamily: 'monospace', marginBottom: 1 }}>{r.version}</div>}
          <div style={{ height: 1, background: '#ddd', margin: '3px 0' }} />
          {['Ce document présente les directives créatives pour la campagne. Les objectifs principaux sont définis ci-dessous.', '', 'Budget : voir annexe A.', 'Délai : 5 jours ouvrables.', 'Responsable : Léa Marchand'].map((line, i) => (
            <div key={i} style={{ fontSize: 6, color: '#777', lineHeight: 1.5 }}>{line}</div>
          ))}
        </div>
      </div>
    );
  }

  /* ── File (dossier) ── */
  if (type === 'file') {
    const files = [
      { name: 'Brief_campagne_V2.pdf', icon: '📄', size: '2.4 Mo' },
      { name: 'Moodboard_final.fig', icon: '🎨', size: '18 Mo' },
      { name: 'Photos_tournage/', icon: '📁', size: '12 fichiers' },
      { name: 'Contrat_signé.pdf', icon: '📄', size: '340 Ko' },
      { name: 'Export_vidéo_V4.mp4', icon: '🎬', size: '1.2 Go' },
    ];
    return (
      <div style={{ width: '100%', height: '100%', background: '#0e1118', position: 'relative' }}>
        <div style={{ ...HALF_PAGE, background: '#fff' }}>
          <div style={{ fontSize: 7, fontWeight: 700, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{title}</div>
          <div style={{ height: 1, background: '#eee', marginBottom: 4 }} />
          {files.map((f, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2.5px 0', borderBottom: i < files.length - 1 ? '1px solid #f5f5f5' : 'none' }}>
              <span style={{ fontSize: 8, flexShrink: 0 }}>{f.icon}</span>
              <span style={{ fontSize: 5.8, color: '#333', flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.name}</span>
              <span style={{ fontSize: 5, color: '#bbb', flexShrink: 0, fontFamily: 'monospace' }}>{f.size}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* ── Checklist ── */
  if (type === 'checklist') {
    const pct = r.progress ?? 60;
    const items = [
      { done: true,  label: 'Validation brief client' },
      { done: true,  label: 'Écriture scénario V1' },
      { done: false, label: 'Repérage des lieux' },
      { done: false, label: 'Casting acteurs' },
      { done: false, label: 'Préparation tournage' },
    ];
    const doneCount = items.filter(i => i.done).length;
    return (
      <div style={{ width: '100%', height: '100%', background: '#101410', position: 'relative' }}>
        <div style={{ ...HALF_PAGE, background: '#fff' }}>
          <div style={{ fontSize: 7, fontWeight: 700, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{title}</div>
          <div style={{ fontSize: 5.5, color: '#aaa', fontFamily: 'monospace', marginBottom: 3 }}>{doneCount}/{items.length} complétées</div>
          <div style={{ height: 3, borderRadius: 99, background: '#eee', marginBottom: 5, overflow: 'hidden' }}>
            <div style={{ height: '100%', borderRadius: 99, width: `${pct}%`, background: '#22c55e' }} />
          </div>
          {items.map((it, i) => (
            <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '3px 0', borderBottom: i < items.length - 1 ? '1px solid #f2f2f2' : 'none' }}>
              <div style={{ width: 9, height: 9, borderRadius: 2, flexShrink: 0, border: it.done ? 'none' : '1.5px solid #d5d5d5', background: it.done ? '#22c55e' : '#fff', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                {it.done && <div style={{ width: 4, height: 2.5, borderLeft: '1.5px solid #fff', borderBottom: '1.5px solid #fff', transform: 'rotate(-45deg) translate(0.5px,-0.5px)' }} />}
              </div>
              <span style={{ fontSize: 6, color: it.done ? '#ccc' : '#444', textDecoration: it.done ? 'line-through' : 'none', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{it.label}</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* â”€â”€ Moodboard / Inspirations â”€â”€ */
  if (type === 'moodboard' || type === 'inspirations') {
    const cols = r.colors ?? ['#2d3a4a', '#4a3428', '#2a3d30', '#3d3042'];
    return (
      <div style={{ width: '100%', height: '100%', background: '#0e1014', position: 'relative' }}>
        {/* Centered grid panel */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '54%', padding: 6, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 4 }}>
          {cols.slice(0, 4).map((c, i) => <div key={i} style={{ borderRadius: 4, background: c }} />)}
        </div>
      </div>
    );
  }

  /* ── Form ── */
  if (type === 'form') {
    const fields = [
      { label: 'Nom du client', value: 'Studio Bleu', tall: false },
      { label: 'Objectifs', value: 'Augmenter la notoriété...', tall: true },
      { label: 'Budget estimé', value: '12 000 $', tall: false },
      { label: 'Date limite', value: '15 juin 2025', tall: false },
    ];
    return (
      <div style={{ width: '100%', height: '100%', background: '#141620', position: 'relative' }}>
        <div style={HALF_PAGE}>
          <div style={{ fontSize: 7, fontWeight: 700, color: '#111', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', marginBottom: 2 }}>{title}</div>
          <div style={{ height: 1, background: '#e5e5e5', marginBottom: 5 }} />
          {fields.map((f, i) => (
            <div key={i} style={{ marginBottom: 4 }}>
              <div style={{ fontSize: 5.5, color: '#999', marginBottom: 1.5, textTransform: 'uppercase', letterSpacing: '0.04em' }}>{f.label}</div>
              <div style={{ height: f.tall ? 13 : 7, borderRadius: 2, border: '1px solid #e8e8e8', background: '#fafafa', padding: '0 4px', display: 'flex', alignItems: 'center', overflow: 'hidden' }}>
                <span style={{ fontSize: 5.5, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{f.value}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  /* â”€â”€ Video review â€” VIDEO â”€â”€ */
  if (type === 'video_review' && (!r.mediaSubtype || r.mediaSubtype === 'video')) {
    return (
      <div style={{ width: '100%', height: '100%', background: '#060606', position: 'relative', overflow: 'hidden' }}>
        <div style={{ position: 'absolute', inset: 0, background: 'repeating-linear-gradient(0deg, transparent, transparent 3px, rgba(255,255,255,0.012) 3px, rgba(255,255,255,0.012) 4px)' }} />
        {/* Centered film panel */}
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '54%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          {/* Film strip top */}
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 10, background: '#111', display: 'flex', gap: 2, alignItems: 'center', padding: '0 3px' }}>
            {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: 1, background: 'rgba(255,255,255,0.14)', flexShrink: 0 }} />)}
          </div>
          <div style={{ width: 26, height: 26, borderRadius: '50%', background: 'rgba(255,255,255,0.1)', border: '1.5px solid rgba(255,255,255,0.22)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <div style={{ width: 0, height: 0, borderStyle: 'solid', borderWidth: '5px 0 5px 9px', borderColor: 'transparent transparent transparent rgba(255,255,255,0.8)', marginLeft: 2 }} />
          </div>
          <div style={{ fontSize: 7, fontWeight: 600, color: 'rgba(255,255,255,0.55)', textAlign: 'center', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', width: '100%', padding: '0 6px', boxSizing: 'border-box' }}>{title}</div>
          {r.version && <div style={{ fontFamily: 'monospace', fontSize: 6.5, color: 'rgba(255,255,255,0.3)', letterSpacing: '0.04em' }}>{r.version}</div>}
          {/* Film strip bottom */}
          <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 10, background: '#111', display: 'flex', gap: 2, alignItems: 'center', padding: '0 3px' }}>
            {Array.from({ length: 8 }).map((_, i) => <div key={i} style={{ width: 6, height: 6, borderRadius: 1, background: 'rgba(255,255,255,0.14)', flexShrink: 0 }} />)}
          </div>
        </div>
      </div>
    );
  }

  /* â”€â”€ Video review â€” PHOTO â”€â”€ */
  if (type === 'video_review' && r.mediaSubtype === 'photo') {
    const swatches = ['#2a3545', '#3d2a2a', '#253530', '#3a3220'];
    return (
      <div style={{ width: '100%', height: '100%', background: '#0e0e0e', position: 'relative' }}>
        <div style={{ position: 'absolute', top: 0, bottom: 0, left: '50%', transform: 'translateX(-50%)', width: '54%', padding: 5, boxSizing: 'border-box', display: 'grid', gridTemplateColumns: '1fr 1fr', gridTemplateRows: '1fr 1fr', gap: 3 }}>
          {swatches.map((c, i) => <div key={i} style={{ background: c, borderRadius: 3 }} />)}
        </div>
      </div>
    );
  }

  /* â”€â”€ Video review â€” FILE/DOC â”€â”€ */
  if (type === 'video_review' && r.mediaSubtype === 'file') {
    return (
      <div style={{ width: '100%', height: '100%', background: '#141820', position: 'relative' }}>
        <div style={HALF_PAGE}>
          <div style={{ fontSize: 7.5, fontWeight: 700, color: '#111', marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{title}</div>
          {r.version && <div style={{ fontSize: 6, color: '#999', fontFamily: 'monospace', marginBottom: 2 }}>{r.version}</div>}
          <div style={{ height: 1, background: '#ddd', margin: '2px 0' }} />
          {['Document soumis pour révision.', 'Les annotations apparaissent', 'directement sur les pages.', 'Voir les commentaires ci-joint.'].map((l, i) => (
            <div key={i} style={{ fontSize: 6, color: '#777', lineHeight: 1.5 }}>{l}</div>
          ))}
        </div>
        {/* Annotation badge */}
        <div style={{ position: 'absolute', top: 8, right: '22%', width: 14, height: 14, borderRadius: '50%', background: 'rgba(249,200,0,0.25)', border: '1.5px solid rgba(249,200,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span style={{ fontFamily: 'monospace', fontSize: 7, color: 'rgba(249,200,0,0.9)', fontWeight: 700 }}>3</span>
        </div>
      </div>
    );
  }

  /* â”€â”€ Fallback â”€â”€ */
  return (
    <div style={{ width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--surface-2)' }}>
      <SFIcon name={TYPE_ICON[type] ?? 'file'} size={28} color="var(--text-3)" />
    </div>
  );
}

function ResourceCard({ r, projectId }: { r: Resource; projectId: string }) {
  const navigate = useNavigate();
  const notifCount = useResourceNotifCount(r.id);
  const [hovered, setHovered] = useState(false);
  const [dropOpen, setDropOpen] = useState(false);
  const [dropRect, setDropRect] = useState<DOMRect | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const dropRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!dropOpen) return;
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dropOpen]);

  const openDrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDropRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setDropOpen(o => !o);
  };

  const pickStatus = (e: React.MouseEvent, status: Status, label: string) => {
    e.stopPropagation();
    updateResource(r.id, { status, statusLabel: label });
    setDropOpen(false);
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/projets/${projectId}/ressources/${r.id}`)}
      style={{
        background: 'var(--surface)',
        border: `1px solid ${hovered ? 'var(--border-2)' : 'var(--border)'}`,
        borderRadius: 'var(--radius)',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        cursor: 'pointer',
        transition: 'border-color 0.15s, transform 0.12s',
        transform: (hovered && !dropOpen) ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Thumbnail â€” fixed 110px for all types */}
      <div style={{
        height: 110, flexShrink: 0, overflow: 'hidden', position: 'relative',
        background: 'var(--surface-2)',
      }}>
        <ResourceThumb r={r} />

        {/* Type badge â€” bottom left */}
        <div style={{
          position: 'absolute', bottom: 7, left: 8,
          display: 'flex', alignItems: 'center', gap: 4,
          background: 'rgba(0,0,0,0.55)', backdropFilter: 'blur(4px)',
          borderRadius: 6, padding: '2px 7px',
        }}>
          <SFIcon
            name={r.type === 'video_review' ? (SUBTYPE_ICON[r.mediaSubtype ?? 'video'] ?? 'scan-eye') : TYPE_ICON[r.type]}
            size={11}
            color="rgba(255,255,255,0.7)"
          />
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'rgba(255,255,255,0.7)', letterSpacing: '0.06em', textTransform: 'uppercase' }}>
            {r.type === 'video_review' ? (SUBTYPE_LABEL[r.mediaSubtype ?? 'video'] ?? 'RÉVISION') : r.eyebrow}
          </span>
        </div>

        {/* Bottom fade so badge is always legible */}
        <div style={{ position: 'absolute', bottom: 0, left: 0, right: 0, height: 40, background: 'linear-gradient(to top, rgba(0,0,0,0.55), transparent)', pointerEvents: 'none' }} />

        {notifCount > 0 && (
          <span style={{
            position: 'absolute', top: 8, right: 8,
            background: 'var(--accent)', color: 'var(--on-accent)',
            fontSize: 9, fontWeight: 700, fontFamily: 'var(--ff-mono)',
            borderRadius: 999, padding: '2px 6px', lineHeight: 1.5,
            minWidth: 16, textAlign: 'center',
            boxShadow: '0 1px 4px rgba(0,0,0,0.4)',
          }}>
            {notifCount}
          </span>
        )}
      </div>

      {/* Progress bar */}
      {(() => {
        const pct = r.progress ?? (r.status === 'ok' ? 100 : r.status === 'warn' ? 45 : 20);
        return (
          <div style={{ height: 3, background: 'var(--surface-3)', flexShrink: 0 }}>
            <div style={{ height: '100%', width: `${pct}%`, background: pct >= 100 ? 'var(--ok)' : 'var(--accent)', transition: 'width 0.3s' }} />
          </div>
        );
      })()}

      {/* Content */}
      <div style={{ padding: '10px 14px 0' }}>
        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em', marginBottom: 4 }}>
          {r.eyebrow}
        </p>
        <p style={{ fontWeight: 600, fontSize: 13, lineHeight: 1.3, color: 'var(--text)' }}>{r.title}</p>
      </div>

      {/* Footer */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        margin: '10px 14px 12px',
        paddingTop: 8,
        borderTop: '1px solid var(--border)',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 7, minWidth: 0, position: 'relative' }}>
          {/* Status pill â€” click to change */}
          <button
            onClick={openDrop}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
            title="Changer le statut"
          >
            <SFPill status={r.status} small>{r.statusLabel}</SFPill>
            <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
          </button>
          <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {r.meta}
          </span>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
          {r.avatars && (
            <div style={{ display: 'flex' }}>
              {r.avatars.map((a, i) => (
                <span key={i} style={{ marginLeft: i === 0 ? 0 : -6 }}>
                  <SFAvatar initials={a.initials} bg={a.bg} size={20} />
                </span>
              ))}
            </div>
          )}
          <button
            onClick={e => { e.stopPropagation(); setConfirmDelete(true); }}
            title="Supprimer la ressource"
            style={{
              background: 'none', border: 'none', cursor: 'pointer', display: 'flex', padding: 2, borderRadius: 4,
              color: hovered ? 'var(--text-3)' : 'transparent', transition: 'color 0.12s',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = hovered ? 'var(--text-3)' : 'transparent'; }}
          >
            <SFIcon name="trash-2" size={13} />
          </button>
        </div>
      </div>

      {/* Delete confirmation modal */}
      {confirmDelete && (
        <div
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', inset: 0, zIndex: 600, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
        >
          <div onClick={() => setConfirmDelete(false)} style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.55)' }} />
          <div style={{
            position: 'relative', background: 'var(--surface)', border: '1px solid var(--border-2)',
            borderRadius: 14, padding: 24, width: 360, boxShadow: '0 16px 48px rgba(0,0,0,0.65)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 14 }}>
              <div style={{ width: 36, height: 36, borderRadius: 10, background: 'color-mix(in srgb, var(--danger) 12%, transparent)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <SFIcon name="trash-2" size={16} color="var(--danger)" />
              </div>
              <h3 style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>Supprimer la ressource ?</h3>
            </div>
            <p style={{ fontSize: 13, color: 'var(--text-2)', lineHeight: 1.5, marginBottom: 20 }}>
              <strong style={{ color: 'var(--text)' }}>«&nbsp;{r.title}&nbsp;»</strong> sera définitivement supprimée. Cette action est irréversible.
            </p>
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
              <button
                onClick={() => setConfirmDelete(false)}
                style={{ padding: '7px 16px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 12, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}
              >
                Annuler
              </button>
              <button
                onClick={() => { removeResource(r.id); setConfirmDelete(false); }}
                style={{ padding: '7px 16px', borderRadius: 8, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 12, fontWeight: 600, fontFamily: 'var(--ff-text)', cursor: 'pointer' }}
              >
                Supprimer
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Status dropdown â€” fixed to escape card overflow */}
      {dropOpen && dropRect && (
        <div
          ref={dropRef}
          onClick={e => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: dropRect.bottom + 4,
            left: dropRect.left,
            zIndex: 500,
            background: 'var(--surface-3)',
            border: '1px solid var(--border-2)',
            borderRadius: 10,
            padding: 4,
            minWidth: 150,
            boxShadow: '0 8px 24px rgba(0,0,0,0.5)',
          }}
        >
          {STATUS_OPTIONS.map(opt => (
            <button
              key={opt.status}
              onClick={e => pickStatus(e, opt.status, opt.label)}
              style={{
                display: 'flex', alignItems: 'center', gap: 8,
                width: '100%', padding: '6px 10px', border: 'none',
                background: r.status === opt.status ? 'var(--surface)' : 'transparent',
                cursor: 'pointer', borderRadius: 7,
              }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = r.status === opt.status ? 'var(--surface)' : 'transparent')}
            >
              <SFPill status={opt.status} small>{opt.label}</SFPill>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

export function Ressources() {
  const { projectId } = useParams();
  const navigate = useNavigate();
  const project = PROJECTS.find(p => p.id === projectId) ?? PROJECTS[0];
  const [filter, setFilter] = useState<'all' | ResourceType>('all');
  const [newResOpen, setNewResOpen] = useState(false);
  const [resources, setResources] = useState(getResources);

  useEffect(() => subscribeResources(() => setResources(getResources())), []);

  const filtered = filter === 'all' ? resources : resources.filter(r => r.type === filter);
  const counts: Record<string, number> = {};
  FILTERS.forEach(f => {
    counts[f.key] = f.key === 'all' ? resources.length : resources.filter(r => r.type === f.key).length;
  });

  return (
    <div style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Topbar */}
      <ProjectHeaderBar projectId={project.id}>
        <SFButton variant="primary" icon="plus" onClick={() => setNewResOpen(true)}>Nouvelle ressource</SFButton>
      </ProjectHeaderBar>

      {/* Filter bar */}
      <div style={{ padding: '10px 24px', borderBottom: '1px solid var(--border)', display: 'flex', gap: 4, flexShrink: 0 }}>
        {FILTERS.filter(f => counts[f.key] > 0 || f.key === 'all').map(f => (
          <button
            key={f.key}
            onClick={() => setFilter(f.key)}
            style={{
              padding: '4px 10px',
              borderRadius: 9,
              border: 'none',
              background: filter === f.key ? 'var(--surface-3)' : 'transparent',
              color: filter === f.key ? 'var(--text)' : 'var(--text-3)',
              fontFamily: 'var(--ff-mono)',
              fontSize: 10,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 5,
            }}
          >
            {f.label}
            {counts[f.key] > 0 && (
              <span style={{ color: filter === f.key ? 'var(--text-2)' : 'var(--text-3)', fontSize: 9 }}>
                {counts[f.key]}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, overflow: 'auto', padding: 24 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 14 }}>
          {filtered.map(r => <ResourceCard key={r.id} r={r} projectId={project.id} />)}
        </div>
      </div>

      {newResOpen && (
        <NewResourceModal projectId={project.id} onClose={() => setNewResOpen(false)} />
      )}
    </div>
  );
}
