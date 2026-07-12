# Calendrier — Glisser-déposer entre les jours & premier jour de la semaine — Plan d'implémentation

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permettre de glisser un événement d'un jour à l'autre (vue mois + semaine) et rendre le premier jour de la semaine configurable (Dimanche / Lundi, dimanche par défaut).

**Architecture:** Les deux écrans calendrier (`CalendrierGlobal`, `ProjetCalendrier`) partagent les composants `MonthView`, `TimeGridView`, `EventBlock` et les helpers `calendarUtils`. Le glisser inter-jours repose sur un attribut `data-cal-day` posé sur chaque jour + `document.elementFromPoint` pour trouver le jour sous le curseur. Le premier jour de semaine est une préférence UI locale (nouveau `weekStartStore`, localStorage) que les helpers de `calendarUtils` lisent par défaut.

**Tech Stack:** React 19 + TypeScript, Vite, i18next. Pas de framework de test.

## Global Constraints

- **Aucun texte UI codé en dur** — tout passe par `t('namespace.key')`, clés ajoutées **d'abord** dans `app/src/locales/fr.json` ET `app/src/locales/en.json`.
- **Pas de tests automatisés** dans ce projet. Vérification par : (a) type-check `cd app && npx tsc -p tsconfig.app.json --noEmit` (⚠️ `tsc --noEmit` seul = faux positif, toujours `-p tsconfig.app.json`), et (b) serveur de preview (`npm run dev`, http://localhost:5173).
- **Styles inline** via tokens CSS (`var(--accent)`, `var(--border)`, etc.). Pas de Tailwind pour ces écrans.
- **Les deux écrans partagent les composants** : chaque changement doit fonctionner dans `CalendrierGlobal` ET `ProjetCalendrier` (y compris `embedded`).
- **`weekStartStore`** est une préférence **locale uniquement** (localStorage, clé `sf_week_start`, valeurs `0`=dimanche / `1`=lundi, **défaut `0`**). Pas de Supabase.
- **`SFIcon`** : noms Lucide en kebab-case ; un nom inconnu retourne `null` silencieusement.
- **Commits** : terminer chaque message par `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## Structure des fichiers

**Nouveau**
- `app/src/data/weekStartStore.ts` — préférence « premier jour de la semaine » (get/set/subscribe, localStorage).

**Modifiés**
- `app/src/components/calendar/MonthView.tsx` — glisser inter-jours + prop `onEventChange` (T1) ; en-têtes réordonnés (T4).
- `app/src/components/calendar/EventBlock.tsx` — mode `move` : jour cible via `elementFromPoint` (T2).
- `app/src/components/calendar/TimeGridView.tsx` — `data-cal-day` + surbrillance colonne + `onDragDay` (T2) ; glisser rangée jour entier (T3) ; en-têtes dérivés de la date (T4).
- `app/src/components/calendar/calendarUtils.ts` — `startOfWeek`/`getMonthGrid`/`getWeekDays` paramétrés (T4).
- `app/src/screens/CalendrierGlobal.tsx` — câblage `onEventChange` + branche `allDay` (T1) ; abonnement weekStart + mini-calendrier réordonné (T4).
- `app/src/screens/ProjetCalendrier.tsx` — câblage `onEventChange` + branche `allDay` (T1) ; abonnement weekStart (T4).
- `app/src/screens/Parametres.tsx` — panneau `WeekStartSettings` (T5).
- `app/src/locales/fr.json` + `app/src/locales/en.json` — clés `settings.weekStart*` (T5).

---

## Task 1 : Glisser un événement entre les jours en vue mois

**Files:**
- Modify: `app/src/components/calendar/MonthView.tsx` (réécriture complète ci-dessous)
- Modify: `app/src/screens/CalendrierGlobal.tsx` (`handleEventChange` + prop `MonthView`)
- Modify: `app/src/screens/ProjetCalendrier.tsx` (`handleEventChange` + prop `MonthView`)

**Interfaces:**
- Produces: `MonthView` accepte `onEventChange?: (ev: CalEvent, newStart: Date, newEnd: Date) => void`. Convention `data-cal-day="AAAA-MM-JJ"` sur chaque case-jour (réutilisée par T2/T3).
- Consumes: `updateEvent` (existant), `fmt2` (existant, `calendarUtils`).

- [ ] **Step 1 : Réécrire `MonthView.tsx` avec le glisser inter-jours**

Remplacer **tout** le contenu de `app/src/components/calendar/MonthView.tsx` par :

```tsx
import { useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { TODAY, isSameDay, getMonthGrid, fmt2, fmtTime, type CalEvent } from './calendarUtils';

export function MonthView({ cur, events, tasks, onDayClick, onEventClick, onCellClick, onEventChange }: {
  cur: Date;
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onDayClick: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
  onCellClick: (d: Date) => void;
  onEventChange?: (ev: CalEvent, newStart: Date, newEnd: Date) => void;
}) {
  const { t } = useTranslation();
  const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];
  const days = getMonthGrid(cur);

  const toISO = (d: Date) => `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
  const dragRef = useRef<{ ev: CalEvent; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressClickRef = useRef(false);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);

  const dayISOAtPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest('[data-cal-day]')?.getAttribute('data-cal-day') ?? null;
  };

  const beginEventDrag = (ev: CalEvent) => (e: React.MouseEvent) => {
    if (!onEventChange || e.button !== 0) return;
    e.stopPropagation();
    dragRef.current = { ev, startX: e.clientX, startY: e.clientY, moved: false };

    const onMove = (me: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      if (Math.abs(me.clientX - d.startX) > 4 || Math.abs(me.clientY - d.startY) > 4) d.moved = true;
      if (!d.moved) return;
      setDragOverDay(dayISOAtPoint(me.clientX, me.clientY));
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const d = dragRef.current;
      dragRef.current = null;
      setDragOverDay(null);
      if (!d || !d.moved) return;
      suppressClickRef.current = true;
      const iso = dayISOAtPoint(me.clientX, me.clientY);
      if (!iso) return;
      const [y, mo, da] = iso.split('-').map(Number);
      const orig = d.ev;
      if (orig.allDay) {
        const ns = new Date(y, mo - 1, da);
        onEventChange!(orig, ns, ns);
      } else {
        const ns = new Date(y, mo - 1, da, orig.startDate.getHours(), orig.startDate.getMinutes());
        const ne = new Date(ns.getTime() + (orig.endDate.getTime() - orig.startDate.getTime()));
        onEventChange!(orig, ns, ne);
      }
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      {/* Day headers */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {dayNames.map((d, i) => (
          <div key={i} style={{ padding: '10px 0 8px', textAlign: 'center', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex: 1, display: 'grid', gridTemplateColumns: 'repeat(7,1fr)', gridTemplateRows: `repeat(${days.length / 7},1fr)`, overflow: 'auto', userSelect: 'none' }}>
        {days.map((day, i) => {
          const isToday = isSameDay(day, TODAY);
          const isCurMonth = day.getMonth() === cur.getMonth();
          const dayEvents = events.filter(ev => isSameDay(ev.startDate, day));
          const dayTasks = tasks.filter(tk => isSameDay(tk.date, day));
          const showMore = dayEvents.length > 2;
          const visible = dayEvents.slice(0, 2);
          const iso = toISO(day);
          const isDragOver = dragOverDay === iso;

          return (
            <div key={i} data-cal-day={iso}
              onClick={() => { if (suppressClickRef.current) { suppressClickRef.current = false; return; } onCellClick(day); }}
              style={{ borderRight: i % 7 !== 6 ? '1px solid var(--border)' : undefined, borderBottom: '1px solid var(--border)', padding: '4px 6px 6px', minHeight: 90, cursor: 'pointer', background: isDragOver ? 'rgba(249,255,0,0.08)' : (isToday ? 'rgba(249,255,0,0.03)' : undefined), boxShadow: isDragOver ? 'inset 0 0 0 1px var(--accent)' : undefined, position: 'relative', overflow: 'hidden' }}>
              {/* Date number */}
              <button onClick={e => { e.stopPropagation(); onDayClick(day); }}
                style={{ width: 24, height: 24, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'var(--ff-mono)', fontSize: 12, cursor: 'pointer', border: 'none', background: isToday ? 'var(--accent)' : 'transparent', color: isToday ? 'var(--on-accent)' : isCurMonth ? 'var(--text)' : 'var(--text-3)', fontWeight: isToday ? 700 : 400, marginBottom: 4, flexShrink: 0 }}
              >{day.getDate()}</button>

              {/* Events */}
              {visible.map(ev => (
                <div key={ev.id} data-event
                  onMouseDown={beginEventDrag(ev)}
                  onClick={e => { e.stopPropagation(); if (suppressClickRef.current) { suppressClickRef.current = false; return; } onEventClick(ev); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 5, background: `${ev.eventTypeColor}bb`, borderLeft: `3px solid ${ev.projectColor}`, marginBottom: 2, cursor: onEventChange ? 'grab' : 'pointer' }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'white', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{ev.title}</span>
                  {!ev.allDay && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'rgba(255,255,255,0.8)', flexShrink: 0 }}>{fmtTime(ev.startDate)}</span>}
                </div>
              ))}

              {showMore && (
                <div style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', padding: '1px 6px' }}>{t('calendar.moreEvents', { count: dayEvents.length - 2 })}</div>
              )}

              {/* Tasks */}
              {dayTasks.map((tk, ti) => (
                <div key={ti} title={tk.title}
                  style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '2px 6px', borderRadius: 5, background: `${tk.color}44`, borderLeft: `3px solid ${tk.color}`, marginBottom: 2, overflow: 'hidden' }}
                >
                  <span style={{ fontSize: 10, fontWeight: 600, color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', flex: 1 }}>{tk.title}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 2 : Ajouter la branche `allDay` à `handleEventChange` dans `CalendrierGlobal.tsx`**

Dans `app/src/screens/CalendrierGlobal.tsx`, remplacer la fonction existante (autour des lignes 707-710) :

```tsx
  // Glisser-déplacer un événement (change l'heure) ou étirer sa poignée du bas (change la durée)
  const handleEventChange = (ev: CalEvent, newStart: Date, newEnd: Date) => {
    updateEvent(ev.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
  };
```

par :

```tsx
  // Glisser-déplacer un événement (change l'heure et/ou le jour) ou étirer sa poignée du bas (change la durée)
  const handleEventChange = (ev: CalEvent, newStart: Date, newEnd: Date) => {
    if (ev.allDay) {
      const d = `${newStart.getFullYear()}-${fmt2(newStart.getMonth() + 1)}-${fmt2(newStart.getDate())}`;
      updateEvent(ev.id, { start: d, end: d });
    } else {
      updateEvent(ev.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
    }
  };
```

(`fmt2` est déjà importé dans ce fichier.)

- [ ] **Step 3 : Passer `onEventChange` à `MonthView` dans `CalendrierGlobal.tsx`**

Dans le bloc `{view==='month' && (...)}` (autour des lignes 842-849), ajouter la prop :

```tsx
        {view==='month' && (
          <MonthView
            cur={cur} events={visibleEvents} tasks={taskChips}
            onDayClick={d=>{setCur(d);setView('day');}}
            onEventClick={setSelectedEvent}
            onCellClick={handleCellClick}
            onEventChange={handleEventChange}
          />
        )}
```

- [ ] **Step 4 : Même traitement dans `ProjetCalendrier.tsx`**

Remplacer `handleEventChange` (autour des lignes 501-504) :

```tsx
  // Glisser-déplacer un événement (change l'heure et/ou le jour) ou étirer sa poignée du bas (change la durée)
  const handleEventChange = (ev: CalEvent, newStart: Date, newEnd: Date) => {
    if (ev.allDay) {
      const d = `${newStart.getFullYear()}-${fmt2(newStart.getMonth() + 1)}-${fmt2(newStart.getDate())}`;
      updateEvent(ev.id, { start: d, end: d });
    } else {
      updateEvent(ev.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
    }
  };
```

Et ajouter la prop `onEventChange` au `MonthView` (bloc `{view==='month' && (...)}`, autour des lignes 677-683) :

```tsx
        {view==='month' && (
          <MonthView
            cur={cur} events={visibleEvents} tasks={taskChips}
            onDayClick={d=>{setCur(d);setView('day');}}
            onEventClick={setSelectedEvent}
            onCellClick={handleCellClick}
            onEventChange={handleEventChange}
          />
        )}
```

(`fmt2` est déjà importé dans `ProjetCalendrier.tsx`.)

- [ ] **Step 5 : Type-check**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 6 : Vérifier dans le preview**

Démarrer le serveur (`npm run dev`) et ouvrir http://localhost:5173.
- Aller sur `/calendrier`, vue **Mois**.
- **Glisser** un événement horaire vers un autre jour → il change de case, l'heure reste identique ; la case cible s'illumine pendant le glisser.
- **Glisser** un événement « journée entière » vers un autre jour → il change de case.
- **Simple clic** sur un événement → ouvre toujours la fiche (pas de déplacement).
- Ouvrir un projet → `/projets/:id/calendrier`, vue **Mois** → même comportement.

- [ ] **Step 7 : Commit**

```bash
git add app/src/components/calendar/MonthView.tsx app/src/screens/CalendrierGlobal.tsx app/src/screens/ProjetCalendrier.tsx
git commit -m "$(printf 'feat(calendar): drag events between days in month view\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 2 : Glisser un événement horaire vers un autre jour en vue semaine

**Files:**
- Modify: `app/src/components/calendar/EventBlock.tsx` (réécriture complète ci-dessous)
- Modify: `app/src/components/calendar/TimeGridView.tsx` (`data-cal-day`, surbrillance colonne, `onDragDay`)

**Interfaces:**
- Consumes: convention `data-cal-day` (Task 1), `onChange` d'`EventBlock` (existant), `fmt2` (existant).
- Produces: `EventBlock` accepte `onDragDay?: (iso: string | null) => void` ; `TimeGridView` pose `data-cal-day` sur ses colonnes-jours (réutilisé par T3).

- [ ] **Step 1 : Réécrire `EventBlock.tsx` pour gérer le jour cible**

Remplacer **tout** le contenu de `app/src/components/calendar/EventBlock.tsx` par :

```tsx
import { useEffect, useRef, useState } from 'react';
import { SFIcon } from '../ui';
import { fmtTime, timeToY, durationH, HOUR_H, type CalEvent } from './calendarUtils';

interface DragState {
  mode: 'move' | 'resize';
  startY: number;
  origStart: Date;
  origEnd: Date;
  moved: boolean;
}

const snapMinutes = (mins: number) => Math.round(mins / 15) * 15;

// Carte d'événement de la grille horaire (vue semaine/jour).
// `onChange` fourni : la carte se glisse verticalement (change l'heure, durée
// conservée) et, si `onDragDay` est fourni, peut être déposée sur une autre
// colonne-jour (change le jour). La poignée du bas étire la durée (bornée au jour).
export function EventBlock({ ev, col, numCols, onClick, onChange, onDragDay }: {
  ev: CalEvent; col: number; numCols: number; onClick: () => void;
  onChange?: (newStart: Date, newEnd: Date) => void;
  onDragDay?: (iso: string | null) => void;
}) {
  const [hov, setHov] = useState(false);
  const [preview, setPreview] = useState<{ start: Date; end: Date } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const previewRef = useRef<{ start: Date; end: Date } | null>(null);

  // Garde l'aperçu affiché jusqu'à ce que les props réelles rattrapent la
  // position prévisualisée (évite un "rebond" le temps que le store se mette à jour).
  useEffect(() => {
    if (preview && ev.startDate.getTime() === preview.start.getTime() && ev.endDate.getTime() === preview.end.getTime()) {
      setPreview(null);
    }
  }, [ev.startDate, ev.endDate, preview]);

  const start = preview?.start ?? ev.startDate;
  const end = preview?.end ?? ev.endDate;
  const top = timeToY(start);
  const h = Math.max(20, durationH(start, end));
  const w = `calc((100% - 8px) / ${numCols})`;
  const left = `calc(4px + ${col} * (100% - 8px) / ${numCols})`;

  const dayISOAtPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest('[data-cal-day]')?.getAttribute('data-cal-day') ?? null;
  };

  const beginDrag = (mode: 'move' | 'resize') => (e: React.MouseEvent) => {
    if (!onChange || e.button !== 0) { e.stopPropagation(); return; }
    e.stopPropagation();
    e.preventDefault();
    const dayStart = new Date(ev.startDate); dayStart.setHours(0, 0, 0, 0);
    const dayEnd = new Date(dayStart.getTime() + 24 * 3600000);
    dragRef.current = { mode, startY: e.clientY, origStart: ev.startDate, origEnd: ev.endDate, moved: false };

    const onMouseMove = (me: MouseEvent) => {
      const d = dragRef.current;
      if (!d) return;
      const deltaY = me.clientY - d.startY;
      if (Math.abs(deltaY) > 3) d.moved = true;
      const deltaMin = snapMinutes((deltaY / HOUR_H) * 60);

      if (d.mode === 'move') {
        let ns = new Date(d.origStart.getTime() + deltaMin * 60000);
        let ne = new Date(d.origEnd.getTime() + deltaMin * 60000);
        if (ns < dayStart) { const diff = dayStart.getTime() - ns.getTime(); ns = new Date(ns.getTime() + diff); ne = new Date(ne.getTime() + diff); }
        if (ne > dayEnd) { const diff = ne.getTime() - dayEnd.getTime(); ns = new Date(ns.getTime() - diff); ne = new Date(ne.getTime() - diff); }
        previewRef.current = { start: ns, end: ne };
        setPreview(previewRef.current);
        if (d.moved) onDragDay?.(dayISOAtPoint(me.clientX, me.clientY));
      } else {
        const minEnd = new Date(d.origStart.getTime() + 15 * 60000);
        let ne = new Date(d.origEnd.getTime() + deltaMin * 60000);
        if (ne < minEnd) ne = minEnd;
        if (ne > dayEnd) ne = dayEnd;
        previewRef.current = { start: d.origStart, end: ne };
        setPreview(previewRef.current);
      }
    };

    const onMouseUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const d = dragRef.current;
      dragRef.current = null;
      onDragDay?.(null);
      const finalPreview = previewRef.current;
      previewRef.current = null;
      if (d?.moved && finalPreview) {
        suppressClickRef.current = true;
        let ns = finalPreview.start, ne = finalPreview.end;
        if (d.mode === 'move') {
          const iso = dayISOAtPoint(me.clientX, me.clientY);
          if (iso) {
            const [y, mo, da] = iso.split('-').map(Number);
            const dur = ne.getTime() - ns.getTime();
            ns = new Date(y, mo - 1, da, ns.getHours(), ns.getMinutes());
            ne = new Date(ns.getTime() + dur);
          }
        }
        const crossDay =
          ns.getFullYear() !== d.origStart.getFullYear() ||
          ns.getMonth() !== d.origStart.getMonth() ||
          ns.getDate() !== d.origStart.getDate();
        onChange!(ns, ne);
        if (crossDay) {
          // Autre jour : cette instance (colonne d'origine) va se démonter au
          // prochain rendu — inutile de garder un aperçu.
          setPreview(null);
        } else {
          // Même jour : garder l'aperçu jusqu'à ce que `ev` reflète le changement.
          previewRef.current = { start: ns, end: ne };
          setPreview({ start: ns, end: ne });
        }
      } else {
        setPreview(null);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      data-event
      onClick={e => {
        e.stopPropagation();
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        onClick();
      }}
      onMouseDown={beginDrag('move')}
      onMouseEnter={() => setHov(true)} onMouseLeave={() => setHov(false)}
      style={{ position: 'absolute', top, height: h, width: w, left, borderRadius: 6, padding: '4px 7px', overflow: 'hidden', cursor: onChange ? 'grab' : 'pointer', zIndex: preview ? 20 : 5,
        background: `${ev.eventTypeColor}cc`, border: `1px solid ${ev.eventTypeColor}`, borderLeft: `3px solid ${ev.projectColor}`, boxShadow: (hov || preview) ? `0 2px 12px ${ev.eventTypeColor}66` : undefined, transition: preview ? undefined : 'box-shadow 0.15s',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
        {ev.meetingUrl && <SFIcon name="video" size={10} color="white" />}
        <p style={{ fontSize: 11, fontWeight: 700, color: 'white', lineHeight: 1.2, marginBottom: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.title}</p>
      </div>
      {h > 30 && <p style={{ fontSize: 10, color: 'rgba(255,255,255,0.8)', fontFamily: 'var(--ff-mono)' }}>{fmtTime(start)} – {fmtTime(end)}</p>}
      {h > 50 && ev.location && <p style={{ fontSize: 9, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>📍 {ev.location}</p>}
      {onChange && (
        <div
          onMouseDown={beginDrag('resize')}
          onMouseEnter={e => e.stopPropagation()}
          style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: 7, cursor: 'ns-resize' }}
        />
      )}
    </div>
  );
}
```

- [ ] **Step 2 : Ajouter l'état de surbrillance + `toISO` dans `TimeGridView.tsx`**

Dans `app/src/components/calendar/TimeGridView.tsx`, juste après `const timeGridRef = useRef<HTMLDivElement>(null);` (autour de la ligne 36), ajouter :

```tsx
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const toISO = (d: Date) => `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;
```

(`useState` et `fmt2` sont déjà importés dans ce fichier.)

- [ ] **Step 3 : Poser `data-cal-day`, la surbrillance et `onDragDay` sur les colonnes horaires**

Toujours dans `TimeGridView.tsx`, dans le `days.map((d,di)=>{ ... })` de la **grille horaire** (autour des lignes 146-196), modifier le `<div>` de colonne pour ajouter `data-cal-day`, puis insérer l'overlay de surbrillance et passer `onDragDay` à `EventBlock`.

Le `<div>` de colonne (celui avec `onMouseDown`/`onClick`, `style={{ flex:1,borderLeft:... }}`) devient :

```tsx
              <div key={di} data-cal-day={toISO(d)}
                onMouseDown={e=>{
                  if((e.target as HTMLElement).closest('[data-event]')) return;
                  const gridRect=timeGridRef.current!.getBoundingClientRect();
                  const y=e.clientY-gridRect.top;
                  dragRef.current={ colIdx:di, day:d, startY:y, moved:false };
                  e.preventDefault();
                }}
                onClick={e=>{
                  if(dragRef.current?.moved) return;
                  const gridRect=timeGridRef.current!.getBoundingClientRect();
                  const y=e.clientY-gridRect.top;
                  const h=Math.floor(y/HOUR_H)+START_HOUR;
                  onSlotClick(d,Math.min(h,END_HOUR-1));
                }}
                style={{ flex:1,borderLeft:'1px solid var(--border)',position:'relative',cursor:'cell',userSelect:'none' }}
              >
                {/* Surbrillance de la colonne cible pendant un glisser inter-jours */}
                {dragOverDay===toISO(d) && (
                  <div style={{ position:'absolute',inset:0,background:'rgba(249,255,0,0.06)',boxShadow:'inset 0 0 0 2px var(--accent)',pointerEvents:'none',zIndex:3 }} />
                )}
```

Puis, dans le même bloc, le rendu des événements (`laid.map(...)`) devient :

```tsx
                {/* Events */}
                {laid.map(ev=>(
                  <EventBlock key={ev.id} ev={ev} col={ev.col} numCols={ev.numCols} onClick={()=>onEventClick(ev)}
                    onChange={onEventChange ? (s,e)=>onEventChange(ev,s,e) : undefined}
                    onDragDay={setDragOverDay} />
                ))}
```

- [ ] **Step 4 : Type-check**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 5 : Vérifier dans le preview**

- `/calendrier`, vue **Semaine**.
- Glisser un événement vers **une autre colonne** (jour) et **une autre hauteur** (heure) → le jour ET l'heure changent ; la colonne cible s'illumine pendant le glisser.
- Glisser un événement **verticalement dans sa colonne** → seule l'heure change (comportement inchangé).
- Étirer la **poignée du bas** → la durée change, le jour ne bouge pas.
- Vue **Jour** (une colonne) → glisser vertical uniquement (l'heure change), aucun changement de jour.
- Répéter dans `/projets/:id/calendrier`.

- [ ] **Step 6 : Commit**

```bash
git add app/src/components/calendar/EventBlock.tsx app/src/components/calendar/TimeGridView.tsx
git commit -m "$(printf 'feat(calendar): drag timed events across days in week view\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 3 : Glisser un événement « journée entière » vers un autre jour en vue semaine

**Files:**
- Modify: `app/src/components/calendar/TimeGridView.tsx` (rangée « jour entier »)

**Interfaces:**
- Consumes: `dragOverDay`/`setDragOverDay` + `toISO` (Task 2), `onEventChange` (prop existante), `onAllDayClick` (existant).

- [ ] **Step 1 : Ajouter le handler de glisser pour la rangée jour entier**

Dans `TimeGridView.tsx`, juste après le bloc ajouté au Step 2 de la Task 2 (`const toISO = ...`), ajouter :

```tsx
  const allDayDragRef = useRef<{ ev: CalEvent; startX: number; startY: number; moved: boolean } | null>(null);
  const suppressAllDayClickRef = useRef(false);

  const dayISOAtPoint = (x: number, y: number): string | null => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    return el?.closest('[data-cal-day]')?.getAttribute('data-cal-day') ?? null;
  };

  const beginAllDayDrag = (ev: CalEvent) => (e: React.MouseEvent) => {
    if (!onEventChange || e.button !== 0) return;
    e.stopPropagation();
    allDayDragRef.current = { ev, startX: e.clientX, startY: e.clientY, moved: false };
    const onMove = (me: MouseEvent) => {
      const d = allDayDragRef.current;
      if (!d) return;
      if (Math.abs(me.clientX - d.startX) > 4 || Math.abs(me.clientY - d.startY) > 4) d.moved = true;
      if (!d.moved) return;
      setDragOverDay(dayISOAtPoint(me.clientX, me.clientY));
    };
    const onUp = (me: MouseEvent) => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
      const d = allDayDragRef.current;
      allDayDragRef.current = null;
      setDragOverDay(null);
      if (!d || !d.moved) return;
      suppressAllDayClickRef.current = true;
      const iso = dayISOAtPoint(me.clientX, me.clientY);
      if (!iso) return;
      const [y, mo, da] = iso.split('-').map(Number);
      const ns = new Date(y, mo - 1, da);
      onEventChange?.(d.ev, ns, ns);
    };
    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
  };
```

(`useRef` et le type `CalEvent` sont déjà importés dans ce fichier.)

- [ ] **Step 2 : Câbler la rangée « jour entier »**

Toujours dans `TimeGridView.tsx`, dans le `days.map((d,i)=>{ ... })` de la **rangée jour entier** (le bloc « All-day events row », autour des lignes 115-130), remplacer le `<div>` de colonne et ses chips par :

```tsx
            {days.map((d,i)=>{
              const dayAllDay=events.filter(ev=>isSameDay(ev.startDate,d)&&ev.allDay);
              return (
                <div key={i} data-cal-day={toISO(d)}
                  onClick={()=>{ if(suppressAllDayClickRef.current){ suppressAllDayClickRef.current=false; return; } onAllDayClick?.(d); }}
                  style={{ flex:1,padding:'3px 4px',minWidth:0,display:'flex',flexDirection:'column',gap:2,minHeight:24,cursor:'pointer',background:dragOverDay===toISO(d)?'rgba(249,255,0,0.08)':undefined }}
                >
                  {dayAllDay.map(ev=>(
                    <div key={ev.id} data-event
                      onMouseDown={beginAllDayDrag(ev)}
                      onClick={e=>{ e.stopPropagation(); if(suppressAllDayClickRef.current){ suppressAllDayClickRef.current=false; return; } onEventClick(ev); }}
                      style={{ width:'100%',padding:'2px 8px',borderRadius:4,background:`${ev.eventTypeColor}cc`,cursor:onEventChange?'grab':'pointer',overflow:'hidden' }}
                    >
                      <span style={{ fontSize:11,fontWeight:600,color:'white',whiteSpace:'nowrap',textOverflow:'ellipsis',overflow:'hidden',display:'block' }}>{ev.title}</span>
                    </div>
                  ))}
                </div>
              );
            })}
```

- [ ] **Step 3 : Type-check**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 4 : Vérifier dans le preview**

- `/calendrier`, vue **Semaine**. Créer (ou repérer) un événement « journée entière » : il apparaît dans la rangée du haut (« JOUR »).
- **Glisser** ce chip vers une autre colonne → il change de jour ; la colonne cible s'illumine.
- **Simple clic** sur le chip → ouvre la fiche ; **clic sur une case vide** de la rangée → ouvre la création (inchangé).
- Répéter dans `/projets/:id/calendrier`.

- [ ] **Step 5 : Commit**

```bash
git add app/src/components/calendar/TimeGridView.tsx
git commit -m "$(printf 'feat(calendar): drag all-day events across days in week view\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 4 : Premier jour de la semaine configurable (store + calcul + en-têtes)

**Files:**
- Create: `app/src/data/weekStartStore.ts`
- Modify: `app/src/components/calendar/calendarUtils.ts`
- Modify: `app/src/components/calendar/MonthView.tsx` (en-têtes)
- Modify: `app/src/components/calendar/TimeGridView.tsx` (en-têtes)
- Modify: `app/src/screens/CalendrierGlobal.tsx` (abonnement + mini-calendrier)
- Modify: `app/src/screens/ProjetCalendrier.tsx` (abonnement)

**Interfaces:**
- Produces: `getWeekStart(): WeekStart`, `setWeekStart(v: WeekStart): void`, `subscribeWeekStart(fn): () => void`, `type WeekStart = 0 | 1` — depuis `app/src/data/weekStartStore.ts`. `startOfWeek/getMonthGrid/getWeekDays` acceptent un 2ᵉ paramètre `weekStart` (défaut = `getWeekStart()`).

- [ ] **Step 1 : Créer `weekStartStore.ts`**

Créer `app/src/data/weekStartStore.ts` :

```ts
// Préférence UI locale : premier jour de la semaine dans le calendrier.
// 0 = dimanche (défaut), 1 = lundi. Stockée en localStorage comme les autres
// préférences d'interface (couleur d'accent, polices). Pas de backend.

import { loadPersisted, savePersisted } from './persist';

export type WeekStart = 0 | 1; // 0 = dimanche, 1 = lundi

const KEY = 'sf_week_start';

let current: WeekStart = loadPersisted<WeekStart>(KEY, 0);

const listeners: (() => void)[] = [];

export function getWeekStart(): WeekStart {
  return current;
}

export function setWeekStart(v: WeekStart): void {
  current = v;
  savePersisted(KEY, v);
  listeners.forEach(l => l());
}

export function subscribeWeekStart(fn: () => void): () => void {
  listeners.push(fn);
  return () => { const i = listeners.indexOf(fn); if (i >= 0) listeners.splice(i, 1); };
}
```

- [ ] **Step 2 : Paramétrer `calendarUtils.ts`**

Dans `app/src/components/calendar/calendarUtils.ts` :

1. En haut du fichier, après la ligne `export const HOURS = ...`, ajouter l'import :

```ts
import { getWeekStart } from '../../data/weekStartStore';
```

2. Remplacer `startOfWeek` (ligne existante 17) par :

```ts
export function startOfWeek(d: Date, weekStart: number = getWeekStart()): Date {
  const r = new Date(d);
  const dow = r.getDay();
  const diff = (dow - weekStart + 7) % 7;
  r.setDate(r.getDate() - diff);
  r.setHours(0, 0, 0, 0);
  return r;
}
```

3. Remplacer `getMonthGrid` (lignes existantes 39-49) par :

```ts
export function getMonthGrid(date: Date, weekStart: number = getWeekStart()): Date[] {
  const year = date.getFullYear(), month = date.getMonth();
  const last = new Date(year, month + 1, 0);
  const firstDow = new Date(year, month, 1).getDay();
  const pad = (firstDow - weekStart + 7) % 7;
  const days: Date[] = [];
  for (let i = -pad; i < last.getDate(); i++) days.push(new Date(year, month, 1 + i));
  while (days.length % 7 !== 0) days.push(new Date(days[days.length - 1].getTime() + 86400000));
  return days;
}
```

4. Remplacer `getWeekDays` (lignes existantes 51-54) par :

```ts
export function getWeekDays(date: Date, weekStart: number = getWeekStart()): Date[] {
  const start = startOfWeek(date, weekStart);
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}
```

- [ ] **Step 3 : Réordonner les en-têtes de `MonthView.tsx`**

Dans `app/src/components/calendar/MonthView.tsx` :

1. Ajouter l'import en haut :

```tsx
import { getWeekStart } from '../../data/weekStartStore';
```

2. Juste après `const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];`, ajouter :

```tsx
  const weekStart = getWeekStart();
  const orderedDayNames = Array.from({ length: 7 }, (_, i) => dayNames[(((weekStart + i) % 7) + 6) % 7]);
```

3. Dans le rendu des en-têtes, remplacer `{dayNames.map(...)}` par `{orderedDayNames.map(...)}` :

```tsx
        {orderedDayNames.map((d, i) => (
          <div key={i} style={{ padding: '10px 0 8px', textAlign: 'center', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{d}</div>
        ))}
```

- [ ] **Step 4 : Dériver les en-têtes de `TimeGridView.tsx` depuis la date**

Dans `app/src/components/calendar/TimeGridView.tsx` :

1. Juste après `const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];` (autour de la ligne 22), ajouter le helper :

```tsx
  const dayLabel = (dd: Date) => dayNames[(dd.getDay() + 6) % 7];
```

2. Dans l'en-tête (bloc « Day names + date numbers », autour des lignes 95-108), supprimer la ligne `const dayIdx=...` et remplacer le rendu du libellé par `dayLabel(d)` :

```tsx
            {days.map((d,i)=>{
              const isToday=isSameDay(d,TODAY);
              return (
                <div key={i} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'8px 0 6px',minWidth:0 }}>
                  <span style={{ fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3 }}>
                    {dayLabel(d)}
                  </span>
                  <div style={{ width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:isToday?'var(--accent)':'transparent',flexShrink:0 }}>
                    <span style={{ fontFamily:'var(--ff-mono)',fontSize:14,color:isToday?'var(--on-accent)':'var(--text)',fontWeight:isToday?700:400 }}>{d.getDate()}</span>
                  </div>
                </div>
              );
            })}
```

(Le libellé est dérivé de la vraie date, donc correct que la semaine commence lundi ou dimanche, en vue semaine comme en vue jour. La variable `isDay` reste utilisée ailleurs dans le composant — ne pas la retirer.)

- [ ] **Step 5 : Abonner `CalendrierGlobal.tsx` + réordonner le mini-calendrier**

Dans `app/src/screens/CalendrierGlobal.tsx` :

1. Ajouter l'import :

```tsx
import { getWeekStart, subscribeWeekStart } from '../data/weekStartStore';
```

2. Dans le composant `MiniCalendar`, juste après `const daysShort = t('datepicker.daysShort', { returnObjects: true }) as string[];`, ajouter :

```tsx
  const weekStart = getWeekStart();
  const orderedDaysShort = Array.from({ length: 7 }, (_, i) => daysShort[(((weekStart + i) % 7) + 6) % 7]);
```

et remplacer `{daysShort.map(...)}` par `{orderedDaysShort.map(...)}` dans le rendu des en-têtes du mini-calendrier :

```tsx
        {orderedDaysShort.map((d,i)=>(
          <div key={i} style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textAlign:'center',padding:'2px 0' }}>{d}</div>
        ))}
```

3. Dans le composant principal `CalendrierGlobal`, ajouter un abonnement pour re-rendre quand le réglage change. Juste après le `useEffect` d'abonnement aux events/eventTypes (autour de la ligne 628), ajouter :

```tsx
  const [, forceWeekStart] = useState(0);
  useEffect(() => subscribeWeekStart(() => forceWeekStart(n => n + 1)), []);
```

- [ ] **Step 6 : Abonner `ProjetCalendrier.tsx`**

Dans `app/src/screens/ProjetCalendrier.tsx` :

1. Ajouter l'import :

```tsx
import { subscribeWeekStart } from '../data/weekStartStore';
```

2. Dans le composant `ProjetCalendrier`, après le `useEffect` d'abonnement aux events (autour de la ligne 465), ajouter :

```tsx
  const [, forceWeekStart] = useState(0);
  useEffect(() => subscribeWeekStart(() => forceWeekStart(n => n + 1)), []);
```

- [ ] **Step 7 : Type-check**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 8 : Vérifier dans le preview (défaut dimanche)**

- `/calendrier`, vue **Mois** : la première colonne est **Dimanche** ; les en-têtes (D/L/M…) sont alignés avec les cases.
- Vue **Semaine** : la première colonne est **Dimanche** ; les libellés de jours correspondent aux dates.
- **Mini-calendrier** de la barre latérale : commence aussi le **Dimanche**.
- Tester le basculement manuellement (avant l'UI de la Task 5) : dans la console du navigateur, exécuter `localStorage.setItem('sf_week_start','1')` puis recharger → tout commence le **Lundi**. Remettre `localStorage.setItem('sf_week_start','0')` (ou supprimer la clé) et recharger → retour au **Dimanche**.

- [ ] **Step 9 : Commit**

```bash
git add app/src/data/weekStartStore.ts app/src/components/calendar/calendarUtils.ts app/src/components/calendar/MonthView.tsx app/src/components/calendar/TimeGridView.tsx app/src/screens/CalendrierGlobal.tsx app/src/screens/ProjetCalendrier.tsx
git commit -m "$(printf 'feat(calendar): configurable first day of week (default Sunday)\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Task 5 : Réglage « Premier jour de la semaine » dans Paramètres

**Files:**
- Modify: `app/src/locales/fr.json`
- Modify: `app/src/locales/en.json`
- Modify: `app/src/screens/Parametres.tsx`

**Interfaces:**
- Consumes: `getWeekStart`, `setWeekStart`, `type WeekStart` (Task 4) ; clés `settings.weekStart*`.

- [ ] **Step 1 : Ajouter les clés i18n (FR)**

Dans `app/src/locales/fr.json`, dans l'objet `"settings"`, juste après la ligne `"languageDesc": ...`, ajouter :

```json
    "weekStartTitle": "Premier jour de la semaine",
    "weekStartDesc": "Choisissez le jour qui commence la semaine dans le calendrier.",
    "weekStartSunday": "Dimanche",
    "weekStartMonday": "Lundi",
```

- [ ] **Step 2 : Ajouter les clés i18n (EN)**

Dans `app/src/locales/en.json`, dans l'objet `"settings"`, juste après `"languageDesc": ...`, ajouter :

```json
    "weekStartTitle": "First day of the week",
    "weekStartDesc": "Choose which day starts the week in the calendar.",
    "weekStartSunday": "Sunday",
    "weekStartMonday": "Monday",
```

- [ ] **Step 3 : Ajouter le composant `WeekStartSettings` dans `Parametres.tsx`**

Dans `app/src/screens/Parametres.tsx` :

1. Ajouter l'import en haut du fichier (près des autres imports de stores) :

```tsx
import { getWeekStart, setWeekStart, type WeekStart } from '../data/weekStartStore';
```

2. Juste après la définition du composant `LanguageSettings` (avant `const PORTAL_ACCENT_KEY = ...`), ajouter :

```tsx
function WeekStartSettings() {
  const { t } = useTranslation();
  const [ws, setWs] = useState<WeekStart>(getWeekStart());
  const choose = (v: WeekStart) => { setWs(v); setWeekStart(v); };
  const OPTIONS: { value: WeekStart; label: string }[] = [
    { value: 0, label: t('settings.weekStartSunday') },
    { value: 1, label: t('settings.weekStartMonday') },
  ];

  return (
    <div style={{ maxWidth: 640, display: 'flex', flexDirection: 'column', gap: 20 }}>
      <div>
        <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 20 }}>{t('settings.weekStartTitle')}</h2>
        <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 4 }}>{t('settings.weekStartDesc')}</p>
      </div>
      <div style={{ background: 'var(--surface)', borderRadius: 'var(--radius)', border: '1px solid var(--border)', padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
        {OPTIONS.map(o => (
          <button
            key={o.value}
            onClick={() => choose(o.value)}
            style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '12px 16px', borderRadius: 10,
              border: `2px solid ${ws === o.value ? 'var(--accent)' : 'var(--border)'}`,
              background: ws === o.value ? 'rgba(249,255,0,0.05)' : 'var(--surface-2)',
              cursor: 'pointer', transition: 'all 0.15s', fontSize: 14, fontWeight: 500,
              color: ws === o.value ? 'var(--text)' : 'var(--text-2)', fontFamily: 'var(--ff-text)',
            }}
            onMouseEnter={e => { if (ws !== o.value) (e.currentTarget as HTMLElement).style.borderColor = 'var(--text-3)'; }}
            onMouseLeave={e => { if (ws !== o.value) (e.currentTarget as HTMLElement).style.borderColor = 'var(--border)'; }}
          >
            <span>{o.label}</span>
            {ws === o.value && (
              <span style={{ marginLeft: 'auto' }}>
                <SFIcon name="check" size={14} color="var(--accent)" />
              </span>
            )}
          </button>
        ))}
      </div>
    </div>
  );
}
```

3. Dans la section Personnalisation, insérer le panneau entre le bloc « Langue » et le bloc « Raccourcis » (autour des lignes 1890-1898) :

```tsx
            {/* ── Langue ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32 }}>
              <LanguageSettings />
            </div>

            {/* ── Premier jour de la semaine ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32 }}>
              <WeekStartSettings />
            </div>

            {/* ── Raccourcis ── */}
            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 32 }}>
              <KeyboardShortcutsSettings />
            </div>
```

- [ ] **Step 4 : Type-check**

Run: `cd app && npx tsc -p tsconfig.app.json --noEmit`
Expected: aucune erreur.

- [ ] **Step 5 : Vérifier dans le preview**

- Aller dans **Paramètres → Personnalisation** : le panneau « Premier jour de la semaine » apparaît avec **Dimanche** sélectionné par défaut.
- Cliquer **Lundi** → aller sur `/calendrier` : vue mois, vue semaine et mini-calendrier commencent **immédiatement** le lundi (sans rechargement).
- Recharger la page → le choix **Lundi** est conservé.
- Repasser à **Dimanche** → tout se réordonne.
- Basculer la **langue** en anglais (panneau juste au-dessus) → les libellés du réglage sont traduits (« First day of the week », « Sunday », « Monday »).

- [ ] **Step 6 : Build de production (vérification finale complète)**

Run: `cd app && npm run build`
Expected: build réussi (TypeScript + Vite), aucune erreur.

- [ ] **Step 7 : Commit**

```bash
git add app/src/locales/fr.json app/src/locales/en.json app/src/screens/Parametres.tsx
git commit -m "$(printf 'feat(settings): add first-day-of-week picker in Personalization\n\nCo-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>')"
```

---

## Auto-revue du plan (fait)

- **Couverture de la spec :** Glisser mois (T1), glisser semaine horaire (T2), glisser semaine jour entier (T3), format `allDay` à la sauvegarde (T1), store + calcul + en-têtes + réactivité (T4), réglage UI + i18n (T5). ✅
- **Placeholders :** aucun — chaque étape contient le code réel. ✅
- **Cohérence des types :** `onEventChange(ev, newStart, newEnd)`, `onDragDay(iso|null)`, `data-cal-day`, `WeekStart = 0|1`, `getWeekStart/setWeekStart/subscribeWeekStart` — noms identiques d'une tâche à l'autre. ✅
- **Hors périmètre respecté :** `DatePickerDropdown`, échéances de tâches, événements multi-jours, fantôme flottant — non touchés (voir spec §6). ✅
