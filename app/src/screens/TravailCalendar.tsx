import React, { useState, useRef, useEffect } from 'react';
import { SFIcon, SFAvatar, SFButton } from '../components/ui';
import { USERS } from '../data/mock';
import type { Task, SectionData } from '../types';

// ── Helpers ───────────────────────────────────────────────────────────────────

const TODAY = new Date(2026, 5, 10); // June 10 2026

const DAYS_FR   = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR = ['Janvier', 'Février', 'Mars', 'Avril', 'Mai', 'Juin', 'Juillet', 'Août', 'Septembre', 'Octobre', 'Novembre', 'Décembre'];
const MONTHS_SHORT = ['jan', 'fév', 'mar', 'avr', 'mai', 'juin', 'juil', 'août', 'sep', 'oct', 'nov', 'déc'];

const HOUR_H      = 64;   // px per hour
const START_HOUR  = 0;
const END_HOUR    = 24;
const SCROLL_HOUR = 7;    // heure affichée par défaut au chargement
const HOURS       = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

type SubView = 'month' | 'week' | 'day';

function addDays(d: Date, n: number): Date {
  const r = new Date(d); r.setDate(r.getDate() + n); return r;
}
function isSameDay(a: Date, b: Date) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}
function startOfWeek(d: Date): Date {
  const r = new Date(d);
  const dow = r.getDay(); // 0=Sun
  r.setDate(r.getDate() - (dow === 0 ? 6 : dow - 1));
  r.setHours(0, 0, 0, 0);
  return r;
}
function parseFrDate(s: string): Date | null {
  if (!s || s === '—') return null;
  if (s === "Aujourd'hui") return new Date(TODAY);
  if (s === 'Demain') return addDays(TODAY, 1);
  if (s === 'Hier') return addDays(TODAY, -1);
  const m = s.match(/(\d+)\s+(\w+)(?:\s+(\d{4}))?/);
  if (m) {
    const day = parseInt(m[1]);
    const monthStr = m[2].toLowerCase().slice(0, 4);
    const month = MONTHS_SHORT.findIndex(x => monthStr.startsWith(x.slice(0, 3)));
    const year = m[3] ? parseInt(m[3]) : TODAY.getFullYear();
    if (month !== -1) return new Date(year, month, day);
  }
  return null;
}
function fmt2(n: number) { return String(n).padStart(2, '0'); }
function snapMinute(m: number) { return Math.round(m / 15) * 15; }

// ── Types ─────────────────────────────────────────────────────────────────────

interface Draft {
  date: Date;
  startH: number; startM: number;
  endH: number; endM: number;
}

interface Props {
  sections: SectionData[];
  onAddTask: (sectionIdx: number, task: Task) => void;
  projectId: string;
  projectName: string;
  projectColor: string;
}

// ── Component ─────────────────────────────────────────────────────────────────

export function TravailCalendar({ sections, onAddTask, projectId, projectName, projectColor }: Props) {
  const [sub, setSub]         = useState<SubView>('week');
  const [cur, setCur]         = useState(new Date(TODAY));
  const [draft, setDraft]       = useState<Draft | null>(null);
  const [modal, setModal]       = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [newDesc, setNewDesc]   = useState('');
  const [newType, setNewType]   = useState<'event' | 'task'>('task');
  const [newAllDay, setNewAllDay] = useState(false);
  const [newSection, setNewSection] = useState(0);
  const [newLocation, setNewLocation] = useState('');
  const [newParticipants, setNewParticipants] = useState<string[]>([]);
  const [sectionsExp, setSectionsExp] = useState(false);
  const [participantsExp, setParticipantsExp] = useState(false);
  const [hoveredDay, setHoveredDay] = useState<number | null>(null);

  const SECTION_THRESHOLD     = 4;
  const PARTICIPANT_THRESHOLD = 4;
  const togglePart = (id: string) => setNewParticipants(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,[contenteditable]')) return;
      if (e.key === 'm') setSub('month');
      if (e.key === 'w') setSub('week');
      if (e.key === 'j' || e.key === 'd') setSub('day');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  const dragging = useRef(false);
  const dragDate = useRef<Date | null>(null);
  const gridScrollRef = useRef<HTMLDivElement>(null);
  const allTasks = sections.flatMap(s => s.tasks);

  // Scroll automatique à SCROLL_HOUR au premier rendu et à chaque changement de vue
  useEffect(() => {
    if (sub === 'month') return;
    if (gridScrollRef.current) {
      gridScrollRef.current.scrollTop = SCROLL_HOUR * HOUR_H;
    }
  }, [sub]);

  // ── Navigation ──────────────────────────────────────────────────────────────

  const nav = (dir: -1 | 1) => {
    setCur(prev => {
      const d = new Date(prev);
      if (sub === 'month') d.setMonth(d.getMonth() + dir);
      if (sub === 'week')  d.setDate(d.getDate() + dir * 7);
      if (sub === 'day')   d.setDate(d.getDate() + dir);
      return d;
    });
  };

  const title = () => {
    if (sub === 'month') return `${MONTHS_FR[cur.getMonth()]} ${cur.getFullYear()}`;
    if (sub === 'week') {
      const ws = startOfWeek(cur), we = addDays(ws, 6);
      return `${ws.getDate()} – ${we.getDate()} ${MONTHS_FR[we.getMonth()]} ${we.getFullYear()}`;
    }
    return `${DAYS_FR[(cur.getDay() + 6) % 7]} ${cur.getDate()} ${MONTHS_FR[cur.getMonth()]} ${cur.getFullYear()}`;
  };

  const getDays = (): Date[] => {
    if (sub === 'week') return Array.from({ length: 7 }, (_, i) => addDays(startOfWeek(cur), i));
    return [cur];
  };

  // ── Drag-to-create ─────────────────────────────────────────────────────────

  const yToTime = (y: number) => {
    const totalMins = (y / HOUR_H) * 60 + START_HOUR * 60;
    const h = Math.min(END_HOUR - 1, Math.max(START_HOUR, Math.floor(totalMins / 60)));
    const m = snapMinute(totalMins % 60);
    return { h, m };
  };

  const onMouseDown = (e: React.MouseEvent<HTMLDivElement>, date: Date) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const rect = e.currentTarget.getBoundingClientRect();
    const { h, m } = yToTime(e.clientY - rect.top);
    dragging.current = true;
    dragDate.current = date;
    setDraft({ date, startH: h, startM: m, endH: h, endM: m + 60 > 60 ? 60 : m + 60 });
    setModal(false);
  };

  const onMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging.current || !draft) return;
    const rect = e.currentTarget.getBoundingClientRect();
    const { h, m } = yToTime(e.clientY - rect.top);
    const endTotal = h * 60 + m;
    const startTotal = draft.startH * 60 + draft.startM;
    if (endTotal > startTotal) {
      setDraft(prev => prev ? { ...prev, endH: h, endM: m } : null);
    }
  };

  const onMouseUp = (_e: React.MouseEvent<HTMLDivElement>) => {
    if (!dragging.current || !draft) return;
    dragging.current = false;
    setNewTitle(''); setNewDesc(''); setNewType('task'); setNewAllDay(false);
    setNewLocation(''); setNewParticipants([]);
    setSectionsExp(false); setParticipantsExp(false); setNewSection(0);
    setModal(true);
  };

  const createTask = () => {
    if (!draft || !newTitle.trim()) return;
    const d = draft.date;
    onAddTask(newSection, {
      id: `cal-${Date.now()}`,
      title: newTitle.trim(),
      projectId, projectName, projectColor,
      assignee: (newParticipants[0] ? USERS[newParticipants[0] as keyof typeof USERS] : null) ?? Object.values(USERS)[0],
      status: 'warn', statusLabel: 'À faire',
      priority: 'normal', priorityLabel: 'Moyenne',
      dueDate: `${d.getDate()} ${MONTHS_SHORT[d.getMonth()]} ${d.getFullYear()}`,
      dueDateRed: false, checked: false, subtasks: [],
    });
    setModal(false); setDraft(null);
  };

  const closeModal = () => { setModal(false); setDraft(null); };

  // ── Month view ─────────────────────────────────────────────────────────────

  const renderMonth = () => {
    const first = new Date(cur.getFullYear(), cur.getMonth(), 1);
    const pad = (first.getDay() + 6) % 7;
    const last = new Date(cur.getFullYear(), cur.getMonth() + 1, 0).getDate();
    const days: Date[] = [];
    for (let i = pad; i > 0; i--) days.push(addDays(first, -i));
    for (let i = 0; i < last; i++) days.push(addDays(first, i));
    while (days.length % 7 !== 0) days.push(addDays(days[days.length - 1], 1));

    return (
      <div style={{ flex: 1, overflow: 'auto', display: 'flex', flexDirection: 'column' }}>
        {/* Day labels */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
          {DAYS_FR.map(d => (
            <div key={d} style={{ padding: '8px 0', textAlign: 'center', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{d}</div>
          ))}
        </div>
        {/* Cells */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', flex: 1 }}>
          {days.map((day, i) => {
            const inMonth = day.getMonth() === cur.getMonth();
            const isToday = isSameDay(day, TODAY);
            const tasks = allTasks.filter(t => { const d = parseFrDate(t.dueDate); return d && isSameDay(d, day); });
            return (
              <div
                key={i}
                onClick={() => { if (!inMonth) return; setCur(new Date(day)); setSub('day'); }}
                style={{
                  minHeight: 100, padding: '6px 8px', boxSizing: 'border-box',
                  borderRight: '1px solid var(--border)', borderBottom: '1px solid var(--border)',
                  background: isToday ? 'rgba(249,255,0,0.03)' : 'transparent',
                  opacity: inMonth ? 1 : 0.3,
                  cursor: inMonth ? 'pointer' : 'default',
                  position: 'relative',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (inMonth) { (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(249,255,0,0.06)' : 'var(--surface-2)'; setHoveredDay(i); } }}
                onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(249,255,0,0.03)' : 'transparent'; setHoveredDay(null); }}
              >
                {/* Date number + quick-add button */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 }}>
                  <div style={{
                    width: 26, height: 26, borderRadius: '50%',
                    background: isToday ? 'var(--accent)' : 'transparent',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}>
                    <span style={{ fontSize: 12, fontWeight: isToday ? 700 : 400, color: isToday ? 'var(--on-accent)' : 'var(--text-2)' }}>{day.getDate()}</span>
                  </div>
                  {inMonth && (
                    <button
                      onClick={e => {
                        e.stopPropagation();
                        setCur(new Date(day));
                        setSub('day');
                        setDraft({ date: day, startH: 9, startM: 0, endH: 10, endM: 0 });
                        setNewTitle(''); setNewDesc(''); setNewType('task'); setNewAllDay(false);
                        setNewLocation(''); setNewParticipants([]);
                        setSectionsExp(false); setParticipantsExp(false); setNewSection(0);
                        setModal(true);
                      }}
                      style={{
                        width: 22, height: 22, borderRadius: 6, border: 'none',
                        background: 'transparent', color: 'var(--text-3)', cursor: 'pointer',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        opacity: hoveredDay === i ? 1 : 0,
                        transition: 'opacity 0.12s',
                      }}
                      onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-3)'; (e.currentTarget as HTMLElement).style.color = 'var(--text)'; }}
                      onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'transparent'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                    >
                      <SFIcon name="plus" size={12} color="inherit" />
                    </button>
                  )}
                </div>
                {tasks.slice(0, 3).map(t => (
                  <div key={t.id} title={t.title} onClick={e => e.stopPropagation()} style={{
                    fontSize: 11, fontWeight: 500, padding: '2px 6px', borderRadius: 4, marginBottom: 2,
                    background: projectColor + '30', borderLeft: `3px solid ${projectColor}`,
                    color: 'var(--text)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                    cursor: 'default',
                  }}>{t.title}</div>
                ))}
                {tasks.length > 3 && <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)' }}>+{tasks.length - 3}</span>}
              </div>
            );
          })}
        </div>
      </div>
    );
  };

  // ── Time grid view (week / day) ────────────────────────────────────────────

  const renderTimeGrid = () => {
    const days = getDays();
    const HEADER_H = 58;
    return (
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

        {/* Fixed header row: time gutter + day headers */}
        <div style={{ display: 'flex', flexShrink: 0, borderBottom: '1px solid var(--border)' }}>
          {/* Gutter placeholder */}
          <div style={{ width: 54, flexShrink: 0, borderRight: '1px solid var(--border)' }} />
          {/* Day headers */}
          {days.map((day, dIdx) => {
            const isToday = isSameDay(day, TODAY);
            return (
              <div key={dIdx} style={{
                flex: 1, height: HEADER_H,
                borderRight: dIdx < days.length - 1 ? '1px solid var(--border)' : 'none',
                display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
                background: isToday ? 'rgba(249,255,0,0.03)' : 'transparent',
                position: 'relative', gap: 2,
              }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  {DAYS_FR[(day.getDay() + 6) % 7]}
                </span>
                <div style={{ width: 28, height: 28, borderRadius: '50%', background: isToday ? 'var(--accent)' : 'transparent', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: isToday ? 'var(--on-accent)' : 'var(--text)' }}>{day.getDate()}</span>
                </div>
                {/* Quick-add button */}
                <button
                  title="Nouvelle tâche"
                  onClick={_e => {
                    setDraft({ date: day, startH: 9, startM: 0, endH: 10, endM: 0 });
                    setNewTitle(''); setNewDesc(''); setNewType('task'); setNewAllDay(false);
                    setNewLocation(''); setNewParticipants([]);
                    setSectionsExp(false); setParticipantsExp(false); setNewSection(0);
                    setModal(true);
                  }}
                  style={{
                    position: 'absolute', top: 6, right: 6,
                    width: 22, height: 22, borderRadius: 6, border: 'none',
                    background: 'var(--surface-2)', color: 'var(--text-3)',
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  }}
                  onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = 'var(--accent)'; (e.currentTarget as HTMLElement).style.color = 'var(--on-accent)'; }}
                  onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; (e.currentTarget as HTMLElement).style.color = 'var(--text-3)'; }}
                >
                  <SFIcon name="plus" size={12} color="inherit" />
                </button>
              </div>
            );
          })}
        </div>

        {/* Scrollable body: time axis + day grids scroll together */}
        <div ref={gridScrollRef} style={{ flex: 1, display: 'flex', overflowY: 'auto' }}>
          {/* Time axis */}
          <div style={{ width: 54, flexShrink: 0, borderRight: '1px solid var(--border)' }}>
            {HOURS.map(h => (
              <div key={h} style={{ height: HOUR_H, display: 'flex', alignItems: 'flex-start', padding: '0 8px', boxSizing: 'border-box' }}>
                <span style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', marginTop: -7, whiteSpace: 'nowrap' }}>
                  {fmt2(h)}:00
                </span>
              </div>
            ))}
          </div>

          {/* Day content columns */}
          <div style={{ flex: 1, display: 'grid', gridTemplateColumns: `repeat(${days.length}, 1fr)` }}>
            {days.map((day, dIdx) => {
              const isToday = isSameDay(day, TODAY);
              const tasks = allTasks.filter(t => { const d = parseFrDate(t.dueDate); return d && isSameDay(d, day); });
              return (
                <div key={dIdx} style={{ borderRight: dIdx < days.length - 1 ? '1px solid var(--border)' : 'none' }}>
                  {/* Grid */}
                  <div
                    style={{ position: 'relative', cursor: 'crosshair', height: HOUR_H * HOURS.length }}
                    onMouseDown={e => onMouseDown(e, day)}
                    onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp}
                  >
                    {/* Hour lines */}
                    {HOURS.map(h => (
                      <div key={h} style={{
                        position: 'absolute', top: (h - START_HOUR) * HOUR_H, left: 0, right: 0, height: HOUR_H,
                        borderTop: '1px solid var(--border)',
                        background: isToday ? 'rgba(249,255,0,0.015)' : 'transparent',
                      }}>
                        <div style={{ position: 'absolute', top: HOUR_H / 2, left: 0, right: 0, borderTop: '1px dashed var(--border)', opacity: 0.5 }} />
                      </div>
                    ))}

                    {/* Current time line */}
                    {isToday && (() => {
                      const h = TODAY.getHours(), m = TODAY.getMinutes();
                      if (h >= START_HOUR && h < END_HOUR) {
                        const top = (h - START_HOUR + m / 60) * HOUR_H;
                        return (
                          <div style={{ position: 'absolute', left: 0, right: 0, top, zIndex: 15, pointerEvents: 'none' }}>
                            <div style={{ height: 2, background: 'var(--accent)', position: 'relative' }}>
                              <div style={{ position: 'absolute', left: -4, top: -4, width: 10, height: 10, borderRadius: '50%', background: 'var(--accent)' }} />
                            </div>
                          </div>
                        );
                      }
                      return null;
                    })()}

                    {/* Draft selection */}
                    {draft && isSameDay(draft.date, day) && (
                      <div style={{
                        position: 'absolute', zIndex: 10, pointerEvents: 'none',
                        top: (draft.startH - START_HOUR + draft.startM / 60) * HOUR_H,
                        height: Math.max(15, ((draft.endH * 60 + draft.endM) - (draft.startH * 60 + draft.startM)) / 60 * HOUR_H),
                        left: 3, right: 3,
                        background: 'rgba(249,255,0,0.12)', border: '1.5px solid var(--accent)', borderRadius: 7,
                      }}>
                        <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--accent)', padding: '4px 7px', fontWeight: 600 }}>
                          {fmt2(draft.startH)}:{fmt2(draft.startM)} – {fmt2(draft.endH)}:{fmt2(draft.endM)}
                        </p>
                      </div>
                    )}

                    {/* Task chips */}
                    {tasks.map((t, ti) => (
                      <div key={t.id} title={t.title} style={{
                        position: 'absolute', top: 8 + ti * 30, left: 3, right: 3, zIndex: 5,
                        background: projectColor, borderRadius: 6, padding: '4px 8px',
                        fontSize: 11, fontWeight: 600, color: '#fff',
                        overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', cursor: 'pointer',
                      }}>
                        {t.title}
                      </div>
                    ))}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <div style={{ display: 'flex', flexDirection: 'column', flex: 1, overflow: 'hidden' }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '10px 24px', borderBottom: '1px solid var(--border)', flexShrink: 0 }}>
        {/* Left: nav */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
          <button
            onClick={() => setCur(new Date(TODAY))}
            style={{ padding: '5px 12px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}
          >
            Aujourd'hui
          </button>
          <button onClick={() => nav(-1)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer' }}>
            <SFIcon name="chevron-left" size={14} />
          </button>
          <button onClick={() => nav(1)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text)', cursor: 'pointer' }}>
            <SFIcon name="chevron-right" size={14} />
          </button>
          <h2 style={{ fontFamily: 'var(--ff-display)', fontWeight: 700, fontSize: 16, marginLeft: 6 }}>{title()}</h2>
        </div>

        {/* Right: sub-view switcher */}
        <div style={{ display: 'flex', background: 'var(--surface-2)', borderRadius: 10, padding: 3, gap: 2 }}>
          {([['month', 'Mois'], ['week', 'Semaine'], ['day', 'Jour']] as [SubView, string][]).map(([key, label]) => (
            <button
              key={key}
              onClick={() => setSub(key)}
              style={{
                padding: '5px 13px', borderRadius: 8, border: 'none', cursor: 'pointer',
                background: sub === key ? 'var(--surface-3)' : 'transparent',
                color: sub === key ? 'var(--text)' : 'var(--text-2)',
                fontSize: 12, fontFamily: 'var(--ff-text)', fontWeight: sub === key ? 600 : 400,
                borderBottom: sub === key ? '2px solid var(--accent)' : '2px solid transparent',
                transition: 'all 0.1s',
              }}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Calendar body */}
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {sub === 'month' ? renderMonth() : renderTimeGrid()}

        {/* Floating "+ Nouvelle tâche" button — visible in day/time views */}
        {sub !== 'month' && (
          <button
            onClick={_e => {
              const day = getDays()[0];
              setDraft({ date: day, startH: 9, startM: 0, endH: 10, endM: 0 });
              setNewTitle(''); setNewDesc(''); setNewType('task'); setNewAllDay(false);
              setNewLocation(''); setNewParticipants([]);
              setSectionsExp(false); setParticipantsExp(false); setNewSection(0);
              setModal(true);
            }}
            style={{
              position: 'absolute', bottom: 20, right: 24, zIndex: 20,
              display: 'flex', alignItems: 'center', gap: 7,
              padding: '10px 18px', borderRadius: 12,
              border: 'none', background: 'var(--accent)', color: 'var(--on-accent)',
              fontSize: 13, fontWeight: 700, cursor: 'pointer',
              boxShadow: '0 4px 20px rgba(249,255,0,0.3)',
              fontFamily: 'var(--ff-text)',
            }}
            onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-1px)')}
            onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
          >
            <SFIcon name="plus" size={15} color="var(--on-accent)" />
            Nouvelle tâche
          </button>
        )}
      </div>

      {/* Create task modal */}
      {modal && draft && (() => {
        const PARTICIPANT_THRESHOLD = 4;
        const team = Object.values(USERS).filter(u => u.role !== 'Cliente');
        const visibleSections = sectionsExp ? sections : sections.slice(0, SECTION_THRESHOLD);
        const visibleTeam = participantsExp ? team : team.slice(0, PARTICIPANT_THRESHOLD);
        const dateStr = `${draft.date.getFullYear()}-${fmt2(draft.date.getMonth() + 1)}-${fmt2(draft.date.getDate())}`;
        const startT = `${fmt2(draft.startH)}:${fmt2(draft.startM)}`;
        const endT   = `${fmt2(draft.endH)}:${fmt2(draft.endM)}`;

        return (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 200 }} onClick={closeModal}>
            <div onClick={e => e.stopPropagation()} style={{ background: 'var(--surface)', borderRadius: 16, padding: 28, width: 460, border: '1px solid var(--border)', boxShadow: '0 20px 60px rgba(0,0,0,0.5)', maxHeight: '90vh', overflow: 'auto' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 20 }}>
                <h3 style={{ fontSize: 16, fontWeight: 700 }}>Nouvel élément</h3>
                <button onClick={closeModal} style={{ background: 'none', border: 'none', color: 'var(--text-3)', cursor: 'pointer', display: 'flex' }}><SFIcon name="x" size={16} /></button>
              </div>

              {/* Type toggle */}
              <div style={{ display: 'flex', gap: 6, marginBottom: 16 }}>
                {(['event', 'task'] as const).map(t => (
                  <button key={t} onClick={() => setNewType(t)} style={{ flex: 1, padding: '8px', borderRadius: 9, border: `1px solid ${newType === t ? 'var(--accent)' : 'var(--border)'}`, background: newType === t ? 'rgba(249,255,0,0.06)' : 'transparent', color: newType === t ? 'var(--accent)' : 'var(--text-2)', cursor: 'pointer', fontSize: 12, fontWeight: 500 }}>
                    {t === 'event' ? '📅 Événement' : '✅ Tâche'}
                  </button>
                ))}
              </div>

              {/* Title */}
              <input autoFocus value={newTitle} onChange={e => setNewTitle(e.target.value)} onKeyDown={e => { if (e.key === 'Enter') createTask(); if (e.key === 'Escape') closeModal(); }} placeholder="Titre…"
                style={{ width: '100%', padding: '10px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 14, fontWeight: 600, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', colorScheme: 'dark', marginBottom: 8 }}
              />

              {/* Description */}
              <textarea value={newDesc} onChange={e => setNewDesc(e.target.value)} placeholder="Description (optionnel)…" rows={2}
                style={{ width: '100%', padding: '8px 12px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 13, outline: 'none', boxSizing: 'border-box', fontFamily: 'var(--ff-text)', colorScheme: 'dark', marginBottom: 12, resize: 'vertical', lineHeight: 1.5 }}
              />

              {/* All day */}
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, cursor: 'pointer' }}>
                <div onClick={() => setNewAllDay(s => !s)} style={{ width: 32, height: 18, borderRadius: 9, background: newAllDay ? 'var(--accent)' : 'var(--surface-3)', border: `1px solid ${newAllDay ? 'var(--accent)' : 'var(--border)'}`, position: 'relative', transition: 'background 0.15s', cursor: 'pointer' }}>
                  <div style={{ position: 'absolute', top: 2, left: newAllDay ? 14 : 2, width: 12, height: 12, borderRadius: '50%', background: newAllDay ? 'var(--on-accent)' : 'var(--text-3)', transition: 'left 0.15s' }} />
                </div>
                <span style={{ fontSize: 12, color: 'var(--text-2)' }}>Toute la journée</span>
              </label>

              {/* Date + times */}
              <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                <input type="date" defaultValue={dateStr}
                  style={{ flex: 2, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }}
                />
                {!newAllDay && <>
                  <input type="time" defaultValue={startT}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-mono)', colorScheme: 'dark' }}
                  />
                  <span style={{ display: 'flex', alignItems: 'center', color: 'var(--text-3)', fontSize: 12 }}>→</span>
                  <input type="time" defaultValue={endT}
                    style={{ flex: 1, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-mono)', colorScheme: 'dark' }}
                  />
                </>}
              </div>

              {/* Project (locked) */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', marginBottom: 8 }}>
                <i style={{ width: 10, height: 10, borderRadius: '50%', background: projectColor, flexShrink: 0, display: 'block' }} />
                <span style={{ fontSize: 12, color: 'var(--text-2)', flex: 1 }}>{projectName}</span>
                <SFIcon name="lock" size={11} color="var(--text-3)" />
              </div>

              {/* Section */}
              {sections.length > 0 && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 6 }}>
                    <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Section du projet (optionnel)</p>
                    {sections.length > SECTION_THRESHOLD && (
                      <button onClick={() => setSectionsExp(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-mono)', padding: 0 }}>
                        {sectionsExp ? 'Réduire' : `+${sections.length - SECTION_THRESHOLD} autres`}
                      </button>
                    )}
                  </div>
                  <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap' }}>
                    <button onClick={() => setNewSection(-1)}
                      style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${newSection === -1 ? 'var(--border-2)' : 'var(--border)'}`, background: newSection === -1 ? 'var(--surface-3)' : 'transparent', color: newSection === -1 ? 'var(--text)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                      Aucune
                    </button>
                    {visibleSections.map((s, i) => (
                      <button key={i} onClick={() => setNewSection(i)}
                        style={{ padding: '4px 10px', borderRadius: 7, border: `1px solid ${newSection === i ? 'var(--accent)' : 'var(--border)'}`, background: newSection === i ? 'rgba(249,255,0,0.07)' : 'transparent', color: newSection === i ? 'var(--accent)' : 'var(--text-3)', fontSize: 11, cursor: 'pointer', fontFamily: 'var(--ff-text)' }}>
                        {s.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Location (event only) */}
              {newType === 'event' && (
                <input value={newLocation} onChange={e => setNewLocation(e.target.value)} placeholder="Lieu (optionnel)"
                  style={{ width: '100%', padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 12, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark', marginBottom: 12, boxSizing: 'border-box' }}
                />
              )}

              {/* Participants */}
              <div style={{ marginBottom: 20 }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                  <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em' }}>Participants</p>
                  {team.length > PARTICIPANT_THRESHOLD && (
                    <button onClick={() => setParticipantsExp(v => !v)} style={{ background: 'none', border: 'none', color: 'var(--text-3)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-mono)', padding: 0 }}>
                      {participantsExp ? 'Réduire' : `+${team.length - PARTICIPANT_THRESHOLD} autres`}
                    </button>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {visibleTeam.map(u => (
                    <button key={u.id} onClick={() => togglePart(u.id)}
                      style={{ display: 'flex', alignItems: 'center', gap: 6, padding: '5px 10px', borderRadius: 8, border: `1px solid ${newParticipants.includes(u.id) ? 'var(--accent)' : 'var(--border)'}`, background: newParticipants.includes(u.id) ? 'rgba(249,255,0,0.06)' : 'transparent', cursor: 'pointer', color: newParticipants.includes(u.id) ? 'var(--accent)' : 'var(--text-2)' }}
                    >
                      <SFAvatar initials={u.initials} bg={u.avatarColor} size={20} />
                      <span style={{ fontSize: 11 }}>{u.name.split(' ')[0]}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                <SFButton variant="ghost" onClick={closeModal}>Annuler</SFButton>
                <SFButton variant="primary" onClick={createTask}>Créer</SFButton>
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
