import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFPill, SFBar, SFAvatarGroup, SFIcon, SFModal, DatePickerDropdown, TimePickerDropdown, TimeButton, formatDisplay, parseYMD, parseDisplayDateTime, ModuleToggleList } from './ui';
import type { Project, Status, Phase } from '../types/index';
import { isPinned, togglePin, subscribePinned } from '../data/pinnedStore';
import { updateProject, archiveProject, unarchiveProject, removeProject, changeProjectClient } from '../data/projectStore';
import { getClients, subscribeClients } from '../data/clientStore';
import { getCurrentSectionLabel, getProjectStats, subscribeStore } from '../data/taskStore';
import { timeAgo } from '../utils/timeAgo';
import { useProjectTotalNotifCount } from '../hooks/useNotifs';
import { usePlan } from '../data/planStore';
import { canUseFeature } from '../data/planFeatures';
import { requestUpgrade } from '../data/upgradePromptStore';
import { getProjectModuleItemCount } from '../data/projectModuleUsage';
import { confirmDialog } from '../data/confirmStore';

const PROJECT_COLORS = [
  '#5B8AF5', '#34C98A', '#A05BE8', '#F5975B',
  '#E85B7A', '#5BC4E8', '#F5C05B', '#E85BB8',
  '#5BE8A8', '#8A6FF5', '#C4E85B', '#F55B6B',
];


// Labels here match the vocabulary actually used on project cards
// (statusLabel in mock.ts / real project data: "En avance", "En retard",
// "En attente client", "Complété") — not the generic task/resource status
// wording ("Bloqué", "À faire"), which meant selecting e.g. "Bloqué" in the
// filter actually returned projects labeled "En retard" on their cards.
export const PROJECT_STATUS_OPTIONS: { status: Status; labelKey: string }[] = [
  { status: 'ok',      labelKey: 'projects.statusAhead' },
  { status: 'info',    labelKey: 'projects.statusInProgress' },
  { status: 'warn',    labelKey: 'projects.statusWaitingClient' },
  { status: 'review',  labelKey: 'projects.statusInReview' },
  { status: 'danger',  labelKey: 'projects.statusLate' },
  { status: 'neutral', labelKey: 'projects.statusCompleted' },
];

// ── Project Edit Panel ─────────────────────────────────────────────────────────

export const PROJECT_PHASE_OPTIONS: { phase: Phase; labelKey: string }[] = [
  { phase: 'preproduction',  labelKey: 'projects.phasePreproduction' },
  { phase: 'production',     labelKey: 'projects.phaseProduction' },
  { phase: 'postproduction', labelKey: 'projects.phasePostproduction' },
  { phase: 'livraison',      labelKey: 'projects.phaseDelivery' },
];

export interface EditUpdates {
  name: string; color: string;
  status: Status; statusLabel: string;
  phase: Phase; phaseLabel: string;
  deliveryDate: string;
  budget?: number;
  description?: string;
  calendarEnabled: boolean;
  filesEnabled: boolean;
  financeEnabled: boolean;
}

export function ProjectEditPanel({ p, color, name, status, statusLabel, phase, phaseLabel, deliveryDate, onClose, onSave }: {
  p: Project;
  color: string; name: string; status: Status; statusLabel: string;
  phase: Phase; phaseLabel: string; deliveryDate: string;
  onClose: () => void;
  onSave: (u: EditUpdates) => void;
}) {
  const { t } = useTranslation();
  const plan = usePlan();
  const [lName, setLName]               = useState(name);
  const [lColor, setLColor]             = useState(color);
  const [lStatus, setLStatus]           = useState<Status>(status);
  const [lStatusLabel, setLStatusLabel] = useState(statusLabel);
  // Date de livraison : sélecteur de date (YMD) + heure, comme le panneau d'une tâche.
  // Le champ n'est persisté que sous forme de chaîne d'affichage (ex. "5
  // août. 2026 · 03:30", jamais son YMD d'origine — voir deliveryOut plus
  // bas), donc on la re-parse ici pour rouvrir le sélecteur dessus. Sans ça,
  // le panneau retombait à chaque réouverture sur le bloc combiné "date ·
  // heure" au lieu de la date et de la pastille Heure séparées (le YMD
  // restait vide, la condition `lDeliveryYMD &&` masquait donc la pastille).
  const parsedDelivery = parseDisplayDateTime(deliveryDate);
  const [lDeliveryYMD, setLDeliveryYMD] = useState(parsedDelivery ? parsedDelivery.ymd : (parseYMD(deliveryDate) ? deliveryDate : ''));
  const [lDeliveryTime, setLDeliveryTime] = useState(parsedDelivery ? parsedDelivery.time : '');
  // Repli pour les très anciennes valeurs de seed non re-parsables (ex. "15
  // juin", sans année) : on les garde affichées telles quelles tant que
  // l'utilisateur n'a pas interagi avec le sélecteur. Distinct de
  // lDeliveryYMD === '' — auparavant les deux étaient confondus, donc
  // effacer la date (bouton corbeille du sélecteur) faisait "réapparaître"
  // cette valeur d'origine (deliveryDate, jamais vidée) au lieu de laisser
  // le champ réellement vide, ET recombinait date+heure dans un seul bloc
  // puisque la pastille Heure ne s'affiche que si lDeliveryYMD est non vide.
  const [legacyFallback, setLegacyFallback] = useState(!parsedDelivery && !parseYMD(deliveryDate) ? deliveryDate : '');
  const [dateOpen, setDateOpen] = useState(false);
  const [dateRect, setDateRect] = useState<DOMRect | null>(null);
  const [timeOpen, setTimeOpen] = useState(false);
  const [timeRect, setTimeRect] = useState<DOMRect | null>(null);
  const [lBudget, setLBudget]           = useState(p.budget ? String(p.budget) : '');
  const [lDescription, setLDescription] = useState(p.description ?? '');
  const [lCalendarEnabled, setLCalendarEnabled] = useState(p.calendarEnabled);
  const [lFilesEnabled, setLFilesEnabled]       = useState(p.filesEnabled);
  const [lFinanceEnabled, setLFinanceEnabled]   = useState(p.financeEnabled);

  const deliveryOut = lDeliveryYMD
    ? formatDisplay(lDeliveryYMD) + (lDeliveryTime ? ` · ${lDeliveryTime}` : '')
    : legacyFallback;
  // Le bouton Date n'affiche que la date — l'heure a son propre bouton juste
  // à côté (voir plus bas).
  const dateOnlyLabel = lDeliveryYMD ? formatDisplay(lDeliveryYMD) : legacyFallback;

  const save = async () => {
    const budgetNum = Number(String(lBudget).replace(/[^\d.]/g, ''));
    const moduleChecks: { key: 'calendar' | 'files' | 'finance'; before: boolean; after: boolean; labelKey: string }[] = [
      { key: 'calendar', before: p.calendarEnabled, after: lCalendarEnabled, labelKey: 'projects.moduleCalendar' },
      { key: 'files',    before: p.filesEnabled,    after: lFilesEnabled,    labelKey: 'projects.moduleFiles' },
      { key: 'finance',  before: p.financeEnabled,  after: lFinanceEnabled,  labelKey: 'projects.moduleFinance' },
    ];
    for (const check of moduleChecks) {
      if (check.before && !check.after) {
        const count = getProjectModuleItemCount(p.id, check.key);
        if (count > 0) {
          const ok = await confirmDialog(
            t('projects.moduleDisableWithDataWarning', { module: t(check.labelKey), count }),
            { confirmLabel: t('common.continue'), cancelLabel: t('common.cancel') }
          );
          if (!ok) return;
        }
      }
    }
    onSave({
      name: lName.trim() || name,
      color: lColor,
      status: lStatus,
      statusLabel: lStatusLabel,
      // Phase n'est plus éditable manuellement — dérivée des sections complétées dans Tâches.
      phase,
      phaseLabel,
      deliveryDate: deliveryOut,
      budget: Number.isFinite(budgetNum) && budgetNum > 0 ? budgetNum : undefined,
      description: lDescription.trim() || undefined,
      calendarEnabled: lCalendarEnabled,
      filesEnabled: lFilesEnabled,
      financeEnabled: lFinanceEnabled,
    });
    onClose();
  };

  return (
    // Largeur et ordre des champs alignés sur l'assistant "Nouveau projet"
    // (ProjectsListView.tsx, étape Identité) : Nom → Couleur/Date/Budget sur
    // une même ligne → Description. 400px forçait tout à s'empiler en
    // colonne unique ; 480px laisse la ligne à 3 colonnes respirer sans
    // recopier la largeur 820px de l'assistant (celui-ci a 4 étapes, pas ce
    // panneau).
    <SFModal open onClose={save} title={lName || p.name} width={480} maxHeight="90vh">
        {/* Body */}
        <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 18 }}>

          {/* Nom */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.projectNameLabel')}</label>
            <input
              autoFocus
              value={lName}
              onChange={e => setLName(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' || e.key === 'Escape') save(); }}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)' }}
            />
          </div>

          {/* Couleur / Date de livraison — sur une seule ligne. Le Budget est
              descendu sur sa propre ligne : avec la pastille Heure + son
              bouton de suppression, la colonne Date+Budget en 1fr/1fr ne
              laissait presque plus de place au champ Budget (signalé —
              texte coupé). La colonne Couleur a une largeur fixe qui ne
              loge que 6 pastilles par rangée (12 couleurs → 2 rangées de
              6) ; le reste de la largeur va entièrement à Date/Heure.

              La sélection était indiquée par un contour (outline) +
              agrandissement (scale) — signalé à trois reprises comme rogné
              ou passant derrière la pastille voisine : dans une grille aussi
              serrée (6 pastilles par rangée, 22px chacune), l'outline d'une
              pastille et le scale de sa voisine se chevauchent forcément
              quel que soit le padding ajouté autour du conteneur, puisque le
              problème est entre pastilles adjacentes, pas contre le bord de
              la fenêtre. Remplacé par une coche superposée à l'intérieur de
              la pastille (comme la sélection de Statut plus bas) — aucune
              décoration ne dépasse la boîte de la pastille, donc rien à
              rogner ni à chevaucher. */}
          <div style={{ display: 'grid', gridTemplateColumns: '172px 1fr', gap: 14, alignItems: 'start' }}>
            <div>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.dotColor')}</label>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {PROJECT_COLORS.map(c => (
                  <button
                    key={c}
                    onClick={() => setLColor(c)}
                    style={{
                      width: 22, height: 22, borderRadius: '50%', background: c, cursor: 'pointer',
                      border: 'none', padding: 0, flexShrink: 0,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                    }}
                  >
                    {lColor === c && <SFIcon name="check" size={12} color="#fff" style={{ filter: 'drop-shadow(0 0 1.5px rgba(0,0,0,0.6))' }} />}
                  </button>
                ))}
              </div>
            </div>

            <div>
              <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.deliveryDate')}</label>
              {/* Date et heure sur une seule ligne — avant, le bouton Date
                  affichait déjà "12 août · 00:30" (deliveryOut inclut
                  l'heure) ET un second bouton "00:30" réapparaissait juste
                  en dessous : la même heure montrée deux fois, l'une sous
                  l'autre. Le bouton Date n'affiche maintenant que la date
                  (dateOnlyLabel) ; l'heure a son propre bouton à côté, avec
                  un « x » pour la retirer sans toucher à la date. */}
              {/* alignItems: 'stretch' (au lieu de 'center') — la pastille
                  Heure était plus basse que le bouton Date (son padding
                  vertical de 2px contre 9px pour le bouton Date), ce qui
                  donnait deux hauteurs différentes sur la même ligne. En
                  étirant la pastille à la hauteur du bouton Date (le plus
                  haut des deux) et en centrant son propre contenu, les deux
                  boîtes ont maintenant la même hauteur. */}
              <div style={{ display: 'flex', gap: 6, alignItems: 'stretch' }}>
                <button
                  onClick={e => { setDateOpen(o => !o); setDateRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setTimeOpen(false); }}
                  style={{ flex: 1, minWidth: 0, display: 'flex', alignItems: 'center', gap: 5, padding: '9px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', cursor: 'pointer', fontSize: 12, color: dateOnlyLabel ? 'var(--text)' : 'var(--text-3)', fontFamily: 'var(--ff-text)', textAlign: 'left', boxSizing: 'border-box' }}
                >
                  <SFIcon name="calendar" size={13} color="var(--text-3)" />
                  <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{dateOnlyLabel || t('projects.chooseDate')}</span>
                </button>
                {lDeliveryYMD && (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 2, flexShrink: 0, padding: '0 2px 0 8px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', boxSizing: 'border-box' }}>
                    <TimeButton value={lDeliveryTime} onClick={e => { setTimeRect((e.currentTarget as HTMLElement).getBoundingClientRect()); setTimeOpen(o => !o); setDateOpen(false); }} placeholder={t('projects.time')} />
                    {lDeliveryTime && (
                      <button
                        onClick={() => setLDeliveryTime('')}
                        title={t('projects.removeTime')}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 18, height: 18, padding: 0, borderRadius: 5, border: 'none', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer' }}
                        onMouseEnter={e => { (e.currentTarget as HTMLElement).style.color = 'var(--danger)'; }}
                        onMouseLeave={e => { (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                      >
                        <SFIcon name="x" size={11} />
                      </button>
                    )}
                  </div>
                )}
              </div>
              {dateOpen && (
                <DatePickerDropdown
                  value={lDeliveryYMD}
                  onChange={v => {
                    // Toute interaction ici (choisir une date OU cliquer la
                    // corbeille pour l'effacer, qui appelle onChange('')) doit
                    // couper le repli sur l'ancienne valeur affichée — sinon
                    // "effacer" la faisait réapparaître telle quelle (voir note
                    // sur legacyFallback plus haut).
                    setLegacyFallback('');
                    setLDeliveryYMD(v);
                    if (!v) setLDeliveryTime('');
                    setDateOpen(false);
                  }}
                  onClose={() => setDateOpen(false)}
                  anchorRect={dateRect}
                  zIndex={700}
                />
              )}
              {timeOpen && (
                <TimePickerDropdown
                  value={lDeliveryTime}
                  onChange={v => { setLDeliveryTime(v); setTimeOpen(false); }}
                  onClose={() => setTimeOpen(false)}
                  anchorRect={timeRect}
                  zIndex={700}
                />
              )}
            </div>
          </div>

          {/* Budget — sa propre ligne (voir note ci-dessus). */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.budgetLabel')}</label>
            <input
              value={lBudget}
              onChange={e => setLBudget(e.target.value)}
              placeholder={t('projects.budget')}
              inputMode="numeric"
              style={{ width: '100%', padding: '9px 8px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-mono)' }}
            />
          </div>

          {/* Description */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 6 }}>{t('projects.description')}</label>
            <textarea
              value={lDescription}
              onChange={e => setLDescription(e.target.value)}
              placeholder={t('projects.projectName')}
              rows={2}
              style={{ width: '100%', padding: '9px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', resize: 'vertical', lineHeight: 1.5 }}
            />
          </div>

          {/* Statut */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.status')}</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {PROJECT_STATUS_OPTIONS.map(opt => (
                <button
                  key={opt.status}
                  onClick={() => { setLStatus(opt.status); setLStatusLabel(t(opt.labelKey)); }}
                  style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 9,
                    border: `1px solid ${lStatus === opt.status ? 'var(--accent)' : 'var(--border)'}`,
                    background: lStatus === opt.status ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
                    cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)',
                  }}
                >
                  <SFPill status={opt.status} small>{t(opt.labelKey)}</SFPill>
                  {lStatus === opt.status && <SFIcon name="check" size={12} color="var(--accent)" style={{ marginLeft: 'auto', flexShrink: 0 }} />}
                </button>
              ))}
            </div>
          </div>

          {/* Modules */}
          <div>
            <label style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', display: 'block', marginBottom: 8 }}>{t('projects.featuresLabel')}</label>
            <ModuleToggleList modules={[
              { key: 'calendar', label: t('projects.moduleCalendar'), checked: lCalendarEnabled, onToggle: () => setLCalendarEnabled(v => !v) },
              { key: 'files',    label: t('projects.moduleFiles'),    checked: lFilesEnabled,    onToggle: () => setLFilesEnabled(v => !v) },
              {
                key: 'finance', label: t('projects.moduleFinance'), checked: lFinanceEnabled,
                onToggle: () => setLFinanceEnabled(v => !v),
                locked: !canUseFeature(plan, 'finances'),
                onLockedClick: () => requestUpgrade({ feature: 'finances' }),
                helperText: !canUseFeature(plan, 'finances') && lFinanceEnabled ? t('projects.moduleFinanceRequiresPlan') : undefined,
              },
            ]} />
          </div>

        </div>
    </SFModal>
  );
}

// ── Project Card ───────────────────────────────────────────────────────────────

export function ProjectCard({ p }: { p: Project }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const notifCount = useProjectTotalNotifCount(p.id);
  const [hovered, setHovered]       = useState(false);
  const [pinned, setPinned]         = useState(() => isPinned(p.id));
  const [status, setStatus]         = useState<Status>(p.status);
  const [statusLabel, setStatusLabel] = useState(p.statusLabel);
  const [color, setColor]           = useState(p.clientColor ?? 'var(--text-3)');
  const [name, setName]             = useState(p.name);
  const [phase, setPhase]           = useState<Phase>(p.phase);
  const [phaseLabel, setPhaseLabel] = useState(p.phaseLabel);
  const [deliveryDate, setDeliveryDate] = useState(p.deliveryDate);
  const [dropOpen, setDropOpen]     = useState(false);
  const [dropRect, setDropRect]     = useState<DOMRect | null>(null);
  const [editOpen, setEditOpen]     = useState(false);
  const [menuOpen, setMenuOpen]     = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [moveClientOpen, setMoveClientOpen] = useState(false);
  const [moveClientSearch, setMoveClientSearch] = useState('');
  const dropRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => subscribePinned(() => setPinned(isPinned(p.id))), [p.id]);
  const [, forceStatsTick] = useState(0);
  useEffect(() => subscribeStore(() => forceStatsTick(n => n + 1)), []);
  const stats = getProjectStats(p);
  const [, forceClientsRerender] = useState(0);
  useEffect(() => subscribeClients(() => forceClientsRerender(n => n + 1)), []);

  useEffect(() => {
    if (!dropOpen) return;
    const close = (e: MouseEvent) => {
      if (dropRef.current && !dropRef.current.contains(e.target as Node)) setDropOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [dropOpen]);

  useEffect(() => {
    if (!menuOpen) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [menuOpen]);

  const openStatusDrop = (e: React.MouseEvent) => {
    e.stopPropagation();
    setDropRect((e.currentTarget as HTMLElement).getBoundingClientRect());
    setDropOpen(o => !o);
  };

  const pickStatus = (e: React.MouseEvent, s: Status, label: string) => {
    e.stopPropagation();
    setStatus(s); setStatusLabel(label); setDropOpen(false);
  };

  const handleSave = (u: EditUpdates) => {
    setName(u.name); setColor(u.color);
    setStatus(u.status); setStatusLabel(u.statusLabel);
    setPhase(u.phase); setPhaseLabel(u.phaseLabel);
    setDeliveryDate(u.deliveryDate);
    updateProject(p.id, {
      name: u.name, clientColor: u.color, status: u.status, statusLabel: u.statusLabel,
      phase: u.phase, phaseLabel: u.phaseLabel, deliveryDate: u.deliveryDate,
      budget: u.budget, description: u.description,
      calendarEnabled: u.calendarEnabled,
      filesEnabled: u.filesEnabled,
      financeEnabled: u.financeEnabled,
    });
  };

  return (
    <div
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={() => navigate(`/projets/${p.id}`)}
      style={{
        background: 'var(--surface)', borderRadius: 'var(--radius)',
        border: `1px solid ${hovered ? 'var(--border-2)' : 'var(--border)'}`,
        padding: 18, cursor: 'pointer', display: 'flex', flexDirection: 'column', gap: 10,
        transition: (dropOpen || menuOpen) ? 'border-color 0.15s' : 'border-color 0.15s, transform 0.12s',
        transform: (hovered && !dropOpen && !menuOpen) ? 'translateY(-1px)' : 'none',
      }}
    >
      {/* Top row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
          {/* Color dot (decorative) */}
          <div style={{ width: 14, height: 14, borderRadius: '50%', background: color, flexShrink: 0 }} />
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
              <p style={{ fontWeight: 600, fontSize: 14, lineHeight: 1.3 }}>{name}</p>
              {notifCount > 0 && (
                <span style={{ fontSize: 9, fontWeight: 700, fontFamily: 'var(--ff-mono)', background: 'var(--accent)', color: 'var(--on-accent)', borderRadius: 999, padding: '1px 5px', lineHeight: 1.5, minWidth: 14, textAlign: 'center', flexShrink: 0 }}>
                  {notifCount}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Star + menu — le crayon "Modifier" vivait à côté du menu sans
            raison d'être séparé des autres actions ; c'est maintenant le
            premier item du menu "...", comme sur les autres surfaces
            (fiche client, en-tête projet). */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          <button
            onClick={e => { e.stopPropagation(); togglePin(p.id); }}
            title={pinned ? t('projects.unpin') : t('projects.pinToSidebar')}
            style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: pinned ? 'rgba(249,255,0,0.12)' : 'var(--surface-2)', color: pinned ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', transition: 'background 0.15s, color 0.15s' }}
            onMouseEnter={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; } }}
            onMouseLeave={e => { if (!pinned) { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; } }}
          >
            <SFIcon name="star" size={14} fill={pinned ? 'currentColor' : 'none'} />
          </button>

          <div ref={menuRef} style={{ position: 'relative' }}>
            <button
              onClick={e => { e.stopPropagation(); setMenuOpen(v => !v); }}
              title={t('projects.projectMenu')}
              style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', width: 28, height: 28, borderRadius: 7, border: 'none', flexShrink: 0, background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer' }}
            >
              <SFIcon name="ellipsis" size={14} />
            </button>
            {menuOpen && (
              <div
                onClick={e => e.stopPropagation()}
                style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, zIndex: 500, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 190, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
              >
                <button
                  onClick={() => { setEditOpen(true); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="square-pen" size={13} color="var(--text-3)" />
                  {t('projects.editProject')}
                </button>
                <div style={{ height: 1, background: 'var(--border)', margin: '4px 0' }} />
                <button
                  onClick={() => { if (p.archived) { unarchiveProject(p.id); } else { archiveProject(p.id); } setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name={p.archived ? 'rotate-ccw' : 'archive'} size={13} color="var(--text-3)" />
                  {p.archived ? t('projects.unarchiveProject') : t('projects.archiveProject')}
                </button>
                <button
                  onClick={() => { setMoveClientOpen(true); setMenuOpen(false); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--text)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                >
                  <SFIcon name="arrow-right-left" size={13} color="var(--text-3)" />
                  {p.clientId ? t('projects.editClient') : t('projects.assignClient')}
                </button>
                {p.archived && !confirmDelete && (
                  <button
                    onClick={() => setConfirmDelete(true)}
                    style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '7px 10px', borderRadius: 7, border: 'none', background: 'transparent', color: 'var(--danger)', fontSize: 12, cursor: 'pointer', textAlign: 'left', fontFamily: 'var(--ff-text)' }}
                  >
                    <SFIcon name="trash-2" size={13} color="var(--danger)" />
                    {t('projects.deleteProjectPermanently')}
                  </button>
                )}
                {p.archived && confirmDelete && (
                  <div style={{ padding: '8px 10px' }}>
                    <p style={{ fontSize: 11, color: 'var(--danger)', marginBottom: 6 }}>{t('projects.deleteProjectConfirm')}</p>
                    <div style={{ display: 'flex', gap: 6 }}>
                      <button
                        onClick={() => { removeProject(p.id); setMenuOpen(false); setConfirmDelete(false); }}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: 'none', background: 'var(--danger)', color: '#fff', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                      >
                        {t('tasks.yes')}
                      </button>
                      <button
                        onClick={() => setConfirmDelete(false)}
                        style={{ flex: 1, padding: '6px 0', borderRadius: 6, border: '1px solid var(--border)', background: 'transparent', color: 'var(--text-2)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
                      >
                        {t('tasks.no')}
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      <SFBar value={stats.progress} height={3} />

      <div style={{ display: 'flex', gap: 12, fontSize: 11, color: 'var(--text-2)', fontFamily: 'var(--ff-mono)' }}>
        <span>{t('projects.taskCount', { count: stats.taskCount })}</span>
        <span>{t('projects.delivery', { date: deliveryDate })}</span>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <SFAvatarGroup avatars={p.members.map(m => ({ initials: m.initials, bg: m.avatarColor, name: m.name, photoUrl: m.photoUrl }))} size={22} />
        {/* No fallback to the static phaseLabel — a project with no sections
            yet has no real phase, and showing a default like "Préproduction"
            was misleading since that section doesn't actually exist. */}
        {getCurrentSectionLabel(p.id) && <SFPill status="neutral" small>{getCurrentSectionLabel(p.id)}</SFPill>}
      </div>

      {/* Bottom row mirrors the client card layout: pill(s) on the left,
          plain relative timestamp on the right (no "Modifié" prefix) — the
          archived/actif pill is new, added alongside the existing
          production-status pill rather than replacing it. */}
      <div style={{ borderTop: '1px solid var(--border)', paddingTop: 8, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <SFPill status={p.archived ? 'neutral' : 'ok'} small>{p.archived ? t('projects.archivedBadge') : t('projects.activeBadge')}</SFPill>
          <button
            onClick={openStatusDrop}
            title={t('projects.changeStatus')}
            style={{ background: 'none', border: 'none', padding: 0, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 3 }}
          >
            <SFPill status={status} small>{statusLabel}</SFPill>
            <SFIcon name="chevron-down" size={9} color="var(--text-3)" />
          </button>
        </div>
        <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)' }}>{timeAgo(p.modifiedAt, t)}</span>
      </div>

      {/* Status dropdown */}
      {dropOpen && dropRect && (
        <div
          ref={dropRef}
          onClick={e => e.stopPropagation()}
          style={{ position: 'fixed', top: dropRect.bottom + 4, left: dropRect.left, zIndex: 500, background: 'var(--surface-3)', border: '1px solid var(--border-2)', borderRadius: 10, padding: 4, minWidth: 155, boxShadow: '0 8px 24px rgba(0,0,0,0.5)' }}
        >
          {PROJECT_STATUS_OPTIONS.map(opt => (
            <button key={opt.status}
              onClick={e => pickStatus(e, opt.status, t(opt.labelKey))}
              style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', padding: '6px 10px', border: 'none', borderRadius: 7, cursor: 'pointer', background: status === opt.status ? 'var(--surface)' : 'transparent' }}
              onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface)')}
              onMouseLeave={e => (e.currentTarget.style.background = status === opt.status ? 'var(--surface)' : 'transparent')}
            >
              <SFPill status={opt.status} small>{t(opt.labelKey)}</SFPill>
            </button>
          ))}
        </div>
      )}

      {/* Edit panel */}
      {editOpen && (
        <ProjectEditPanel
          p={p}
          color={color} name={name} status={status} statusLabel={statusLabel}
          phase={phase} phaseLabel={phaseLabel} deliveryDate={deliveryDate}
          onClose={() => setEditOpen(false)}
          onSave={handleSave}
        />
      )}

      {/* Move to another client */}
      {moveClientOpen && (
        <SFModal open onClose={() => { setMoveClientOpen(false); setMoveClientSearch(''); }} title={p.clientId ? t('projects.editClient') : t('projects.assignClient')} width={380} maxHeight="70vh">
          <input
            autoFocus
            value={moveClientSearch}
            onChange={e => setMoveClientSearch(e.target.value)}
            placeholder={t('members.searchPlaceholder')}
            style={{ width: '100%', boxSizing: 'border-box', padding: '8px 11px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', fontFamily: 'var(--ff-text)', marginBottom: 10 }}
          />
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4, maxHeight: 320, overflowY: 'auto' }}>
            {p.clientId && (
              <button
                onClick={e => {
                  e.stopPropagation();
                  void changeProjectClient(p, null);
                  setMoveClientOpen(false);
                  setMoveClientSearch('');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left', color: 'var(--danger)' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <SFIcon name="x-circle" size={16} />
                <span style={{ fontSize: 13 }}>{t('projects.removeClientFromProject')}</span>
              </button>
            )}
            {getClients().filter(c => !c.archived && c.id !== p.clientId && c.name.toLowerCase().includes(moveClientSearch.toLowerCase())).map(c => (
              <button
                key={c.id}
                onClick={e => {
                  // The modal is a portal, but React still bubbles synthetic
                  // events through the component tree — without stopping it
                  // here, this click also reaches the card's own onClick and
                  // navigates into the project right after moving it.
                  e.stopPropagation();
                  void changeProjectClient(p, c.id, c.name, c.avatarColor);
                  setMoveClientOpen(false);
                  setMoveClientSearch('');
                }}
                style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', padding: '8px 10px', borderRadius: 8, border: 'none', background: 'transparent', cursor: 'pointer', textAlign: 'left' }}
                onMouseEnter={e => (e.currentTarget.style.background = 'var(--surface-2)')}
                onMouseLeave={e => (e.currentTarget.style.background = 'transparent')}
              >
                <div style={{ width: 28, height: 28, borderRadius: 7, background: c.avatarColor, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {c.initials}
                </div>
                <span style={{ fontSize: 13 }}>{c.name}</span>
              </button>
            ))}
          </div>
        </SFModal>
      )}
    </div>
  );
}
