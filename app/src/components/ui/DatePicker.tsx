import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { SFIcon } from './SFIcon';

// ── Helpers ────────────────────────────────────────────────────────────────────

export const FR_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const FR_MONTHS_SHORT = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
const FR_DAYS = ['L','M','M','J','V','S','D'];
export const TODAY_DP = new Date();

export function toYMD(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
}

export function parseYMD(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(+m[1], +m[2]-1, +m[3]);
  return isNaN(d.getTime()) ? null : d;
}

function parseFreeText(s: string): Date | null {
  const clean = s.trim().toLowerCase();
  const slash = clean.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
  if (slash) { const d = new Date(+slash[3], +slash[2]-1, +slash[1]); return isNaN(d.getTime()) ? null : d; }
  const iso = clean.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (iso) { const d = new Date(+iso[1], +iso[2]-1, +iso[3]); return isNaN(d.getTime()) ? null : d; }
  return null;
}

export function formatDisplay(ymd: string) {
  const d = parseYMD(ymd);
  if (!d) return ymd;
  return `${d.getDate()} ${FR_MONTHS_SHORT[d.getMonth()]}. ${d.getFullYear()}`;
}

export function isOverdue(dueDate: string): boolean {
  const d = parseYMD(dueDate);
  if (!d) return false;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return d < today;
}

export function dueDateColor(dueDate: string): string {
  return isOverdue(dueDate) ? 'var(--danger)' : 'var(--text-3)';
}

export function fmtTaskDate(dueDate: string, startTime?: string, endTime?: string, endDate?: string): string {
  const d = parseYMD(dueDate);
  const short = (x: Date) => `${x.getDate()} ${FR_MONTHS_SHORT[x.getMonth()]}`;
  const todayYMD = toYMD(new Date());
  const relLabel = (x: Date): string => {
    const ymd = toYMD(x);
    if (ymd === todayYMD) return "Aujourd'hui";
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    const tomorrow  = new Date(); tomorrow.setDate(tomorrow.getDate() + 1);
    if (ymd === toYMD(yesterday)) return 'Hier';
    if (ymd === toYMD(tomorrow))  return 'Demain';
    return short(x);
  };
  const dateStr = d ? relLabel(d) : dueDate;
  if (!dateStr || dateStr === '—') return '—';
  // Plage multi-jours : « 12 → 14 juin » ou « 28 juin → 3 juil »
  const end = endDate ? parseYMD(endDate) : null;
  if (end && d && endDate !== dueDate) {
    const sameMonth = end.getMonth() === d.getMonth() && end.getFullYear() === d.getFullYear();
    return sameMonth ? `${d.getDate()} → ${short(end)}` : `${dateStr} → ${short(end)}`;
  }
  if (startTime && endTime) return `${dateStr} · ${startTime}→${endTime}`;
  if (startTime) return `${dateStr} · ${startTime}`;
  return dateStr;
}

// ── DatePickerDropdown ─────────────────────────────────────────────────────────

interface DatePickerDropdownProps {
  value: string;            // YYYY-MM-DD or ''
  onChange: (v: string) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
  zIndex?: number;
}

export function DatePickerDropdown({ value, onChange, onClose, anchorRect, zIndex = 200 }: DatePickerDropdownProps) {
  const initial = parseYMD(value) ?? TODAY_DP;
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [text, setText] = useState(value ? formatDisplay(value) : '');
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!dropRef.current || !anchorRect) return;
    const h = dropRef.current.offsetHeight;
    const w = dropRef.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = anchorRect.bottom + 6 + h > vh && anchorRect.top >= h + 6
      ? anchorRect.top - h - 6
      : anchorRect.bottom + 6;
    const left = Math.max(8, Math.min(anchorRect.left, vw - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [anchorRect]);

  const selected = parseYMD(value);

  const prevMonth = () => setView(v => new Date(v.getFullYear(), v.getMonth()-1, 1));
  const nextMonth = () => setView(v => new Date(v.getFullYear(), v.getMonth()+1, 1));

  const firstDay = view.getDay() === 0 ? 6 : view.getDay() - 1;
  const daysInMonth = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i+1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  const pick = (d: Date) => {
    const ymd = toYMD(d);
    onChange(ymd);
    setText(formatDisplay(ymd));
    onClose();
  };

  const commitText = () => {
    const d = parseFreeText(text);
    if (d) pick(d);
  };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} style={{
        position: 'fixed', ...pos, zIndex,
        background: 'var(--surface-3)', border: '1px solid var(--border-2)',
        borderRadius: 14, padding: 14, width: 272,
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      }}>
        {/* Free-text input */}
        <input
          value={text}
          onChange={e => setText(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') commitText(); if (e.key === 'Escape') onClose(); }}
          onBlur={commitText}
          placeholder="jj/mm/aaaa"
          autoFocus
          style={{
            width: '100%', padding: '7px 10px', borderRadius: 9,
            border: '1px solid var(--border-2)', background: 'var(--surface-2)',
            color: 'var(--text)', fontSize: 13, fontFamily: 'var(--ff-mono)',
            outline: 'none', marginBottom: 12, boxSizing: 'border-box',
          }}
        />

        {/* Month nav */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 6, display: 'flex' }}>
            <SFIcon name="chevron-left" size={14} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {FR_MONTHS[view.getMonth()]} {view.getFullYear()}
          </span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 6, display: 'flex' }}>
            <SFIcon name="chevron-right" size={14} />
          </button>
        </div>

        {/* Day headers */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {FR_DAYS.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 0' }}>{d}</div>
          ))}
        </div>

        {/* Day grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const isToday = toYMD(d) === toYMD(TODAY_DP);
            const isSel   = selected != null && toYMD(d) === toYMD(selected);
            return (
              <button key={i} onClick={() => pick(d)}
                style={{
                  width: '100%', aspectRatio: '1', borderRadius: 8, border: 'none',
                  background: isSel ? 'var(--accent)' : isToday ? 'rgba(249,255,0,0.12)' : 'transparent',
                  color: isSel ? 'var(--on-accent)' : isToday ? 'var(--accent)' : 'var(--text)',
                  fontSize: 12, fontWeight: isSel || isToday ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  outline: isToday && !isSel ? '1px solid rgba(249,255,0,0.3)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!isSel) (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(249,255,0,0.12)' : 'transparent'; }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        {/* Shortcuts */}
        <div style={{ display: 'flex', gap: 6, marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {[
            { label: "Aujourd'hui", d: TODAY_DP },
            { label: 'Demain',      d: new Date(TODAY_DP.getFullYear(), TODAY_DP.getMonth(), TODAY_DP.getDate()+1) },
            { label: 'Dans 1 sem.', d: new Date(TODAY_DP.getFullYear(), TODAY_DP.getMonth(), TODAY_DP.getDate()+7) },
          ].map(s => (
            <button key={s.label} onClick={() => pick(s.d)}
              style={{ flex: 1, padding: '5px 4px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap' }}>
              {s.label}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

// ── TimePickerDropdown ─────────────────────────────────────────────────────────

const HOURS   = Array.from({ length: 24 }, (_, i) => i);
const MINUTES = [0, 15, 30, 45];

interface TimePickerDropdownProps {
  value: string;          // 'HH:MM' or ''
  onChange: (v: string) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
  placeholder?: string;
  zIndex?: number;
}

export function TimePickerDropdown({ value, onChange, onClose, anchorRect, placeholder = '—', zIndex = 300 }: TimePickerDropdownProps) {
  const [h, setH] = useState(() => value ? parseInt(value.split(':')[0]) : -1);
  const [m, setM] = useState(() => value ? parseInt(value.split(':')[1]) : -1);
  const ref = useRef<HTMLDivElement>(null);
  const hourRef = useRef<HTMLDivElement>(null);
  const [smartPos, setSmartPos] = useState<React.CSSProperties>({ visibility: 'hidden' });

  // close on outside click
  useEffect(() => {
    const fn = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose(); };
    document.addEventListener('mousedown', fn);
    return () => document.removeEventListener('mousedown', fn);
  }, [onClose]);

  // scroll selected hour into view
  useEffect(() => {
    if (h >= 0 && hourRef.current) {
      const btn = hourRef.current.children[h] as HTMLElement | undefined;
      btn?.scrollIntoView({ block: 'center' });
    }
  }, [h]);

  useLayoutEffect(() => {
    if (!ref.current || !anchorRect) return;
    const dh = ref.current.offsetHeight;
    const dw = ref.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = anchorRect.bottom + 4 + dh > vh && anchorRect.top >= dh + 4
      ? anchorRect.top - dh - 4
      : anchorRect.bottom + 4;
    const left = Math.max(8, Math.min(anchorRect.left, vw - dw - 8));
    setSmartPos({ top, left, visibility: 'visible' });
  }, [anchorRect]);

  const pick = (newH: number, newM: number) => {
    const hh = newH >= 0 ? newH : h;
    const mm = newM >= 0 ? newM : (m >= 0 ? m : 0);
    if (hh >= 0) {
      onChange(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    }
  };

  const btnBase: React.CSSProperties = {
    width: '100%', padding: '5px 8px', borderRadius: 6, border: 'none',
    background: 'transparent', color: 'var(--text-2)', fontSize: 12,
    fontFamily: 'var(--ff-mono)', cursor: 'pointer', textAlign: 'center',
  };

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={ref} style={{ position: 'fixed', ...smartPos, zIndex, display: 'flex', gap: 0, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 12, boxShadow: '0 8px 32px rgba(0,0,0,0.5)', overflow: 'hidden' }}>
        {/* Hours */}
        <div ref={hourRef} style={{ width: 60, maxHeight: 220, overflowY: 'auto', borderRight: '1px solid var(--border)', padding: '4px 4px' }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center', padding: '4px 0 6px' }}>h</p>
          {HOURS.map(hv => (
            <button key={hv} onClick={() => { setH(hv); pick(hv, m); }}
              style={{ ...btnBase, background: h === hv ? 'var(--accent)' : 'transparent', color: h === hv ? 'var(--on-accent)' : 'var(--text-2)', fontWeight: h === hv ? 700 : 400 }}
              onMouseEnter={e => { if (h !== hv) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (h !== hv) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {String(hv).padStart(2, '0')}
            </button>
          ))}
        </div>
        {/* Minutes */}
        <div style={{ width: 60, padding: '4px 4px' }}>
          <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', textAlign: 'center', padding: '4px 0 6px' }}>min</p>
          {MINUTES.map(mv => (
            <button key={mv} onClick={() => { setM(mv); pick(h, mv); }}
              style={{ ...btnBase, background: m === mv ? 'var(--accent)' : 'transparent', color: m === mv ? 'var(--on-accent)' : 'var(--text-2)', fontWeight: m === mv ? 700 : 400 }}
              onMouseEnter={e => { if (m !== mv) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
              onMouseLeave={e => { if (m !== mv) (e.currentTarget as HTMLElement).style.background = 'transparent'; }}
            >
              {String(mv).padStart(2, '0')}
            </button>
          ))}
        </div>
      </div>
    </>,
    document.body
  );
}

// ── TimeButton (trigger) ───────────────────────────────────────────────────────

export function TimeButton({ value, onClick, placeholder = '—' }: { value: string; onClick: (e: React.MouseEvent<HTMLButtonElement>) => void; placeholder?: string }) {
  return (
    <button onClick={onClick} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 6px', borderRadius: 6, fontFamily: 'var(--ff-mono)', fontSize: 11, color: value ? 'var(--text)' : 'var(--text-3)', flexShrink: 0 }}>
      {value || placeholder}
    </button>
  );
}

// ── TaskDatePopover — date + optional start/end times ─────────────────────────

const FR_DAYS_LONG = ['Dim', 'Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam'];

interface TaskDatePopoverProps {
  date: string;           // YYYY-MM-DD or '' — date de début / unique
  endDate?: string;       // YYYY-MM-DD or '' — date de fin (plage)
  startTime?: string;     // HH:MM or ''
  endTime?: string;       // HH:MM or ''
  onChange: (date: string, startTime?: string, endTime?: string, endDate?: string) => void;
  onClose: () => void;
  anchorRect: DOMRect | null;
  zIndex?: number;
}

export function TaskDatePopover({ date, endDate = '', startTime = '', endTime = '', onChange, onClose, anchorRect, zIndex = 200 }: TaskDatePopoverProps) {
  const initial = parseYMD(date) ?? TODAY_DP;
  const [view, setView] = useState(new Date(initial.getFullYear(), initial.getMonth(), 1));
  const [localDate, setLocalDate] = useState(parseYMD(date) ? date : '');
  const [localEndDate, setLocalEndDate] = useState(parseYMD(endDate) ? endDate : '');
  const [localStart, setLocalStart] = useState(startTime);
  const [localEnd, setLocalEnd] = useState(endTime);
  const [mode, setMode] = useState<'single' | 'range'>(parseYMD(endDate) && endDate !== date ? 'range' : 'single');
  const [showTime, setShowTime] = useState<boolean>(!!(startTime || endTime));
  const [timeOpen, setTimeOpen] = useState<'start' | 'end' | null>(null);
  const [timeRect, setTimeRect] = useState<DOMRect | null>(null);
  const startBtnRef = useRef<HTMLButtonElement>(null);
  const endBtnRef = useRef<HTMLButtonElement>(null);
  const dropRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState<React.CSSProperties>({ visibility: 'hidden' });

  useLayoutEffect(() => {
    if (!dropRef.current || !anchorRect) return;
    const h = dropRef.current.offsetHeight;
    const w = dropRef.current.offsetWidth;
    const vh = window.innerHeight;
    const vw = window.innerWidth;
    const top = anchorRect.bottom + 6 + h > vh && anchorRect.top >= h + 6
      ? anchorRect.top - h - 6
      : anchorRect.bottom + 6;
    const left = Math.max(8, Math.min(anchorRect.left, vw - w - 8));
    setPos({ top, left, visibility: 'visible' });
  }, [anchorRect, showTime, mode]);

  const start = parseYMD(localDate);
  const end = parseYMD(localEndDate);

  const prevMonth = () => setView(v => new Date(v.getFullYear(), v.getMonth()-1, 1));
  const nextMonth = () => setView(v => new Date(v.getFullYear(), v.getMonth()+1, 1));

  const firstDay = view.getDay() === 0 ? 6 : view.getDay() - 1;
  const daysInMonth = new Date(view.getFullYear(), view.getMonth()+1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array(firstDay).fill(null),
    ...Array.from({ length: daysInMonth }, (_, i) => new Date(view.getFullYear(), view.getMonth(), i+1)),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // Émission unifiée (date début, début/fin heures, date fin)
  const emit = (d: string, ed: string, s: string, e: string) =>
    onChange(d, s || undefined, e || undefined, ed || undefined);

  // Commit une journée unique (utilisé par le mode Jour et les raccourcis)
  const commitSingle = (d: Date) => {
    const ymd = toYMD(d);
    setLocalDate(ymd); setLocalEndDate('');
    emit(ymd, '', localStart, localEnd);
    if (!showTime) onClose();
  };

  // Clic sur un jour du calendrier (selon le mode)
  const pick = (d: Date) => {
    if (mode === 'single') { commitSingle(d); return; }
    const ymd = toYMD(d);
    // Plage : pas de début, ou plage déjà complète → (re)commence un début
    if (!start || (start && end)) {
      setLocalDate(ymd); setLocalEndDate('');
      emit(ymd, '', localStart, localEnd);
      return;
    }
    // Début posé, pas encore de fin
    if (d < start) {                       // antérieur → nouveau début
      setLocalDate(ymd); setLocalEndDate('');
      emit(ymd, '', localStart, localEnd);
    } else if (ymd === localDate) {        // même jour → reste sur le début
      setLocalEndDate('');
      emit(localDate, '', localStart, localEnd);
    } else {                               // postérieur → pose la fin, plage complète
      setLocalEndDate(ymd);
      emit(localDate, ymd, localStart, localEnd);
      if (!showTime) onClose();
    }
  };

  const switchMode = (m: 'single' | 'range') => {
    setMode(m);
    if (m === 'single' && localEndDate) {
      setLocalEndDate('');
      emit(localDate, '', localStart, localEnd);
    }
  };

  const setStart = (v: string) => {
    setLocalStart(v);
    if (localDate) emit(localDate, localEndDate, v, localEnd);
  };
  const setEnd = (v: string) => {
    setLocalEnd(v);
    if (localDate) emit(localDate, localEndDate, localStart, v);
  };
  const clearTimes = () => {
    setLocalStart(''); setLocalEnd(''); setTimeOpen(null); setShowTime(false);
    if (localDate) emit(localDate, localEndDate, '', '');
  };

  const clearAll = () => { onChange('', undefined, undefined, undefined); onClose(); };

  const fmtTime = (t: string) => {
    if (!t) return null;
    const [hh, mm] = t.split(':');
    return `${parseInt(hh, 10)}h${mm}`;
  };

  const openTime = (which: 'start' | 'end', e: React.MouseEvent<HTMLButtonElement>) => {
    setTimeOpen(prev => prev === which ? null : which);
    setTimeRect(e.currentTarget.getBoundingClientRect());
  };

  const timeTrigger = (label: string, value: string, which: 'start' | 'end', ref: React.RefObject<HTMLButtonElement>): React.ReactNode => {
    const isActive = timeOpen === which;
    const display = fmtTime(value);
    return (
      <button ref={ref} onClick={e => openTime(which, e)}
        style={{
          flex: 1, height: 34, borderRadius: 9, cursor: 'pointer',
          border: `1px solid ${isActive ? 'var(--accent)' : 'var(--border-2)'}`,
          background: isActive ? 'rgba(249,255,0,0.07)' : 'var(--surface)',
          display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
          fontFamily: 'var(--ff-mono)', lineHeight: 1.15, transition: 'all 0.12s',
        }}
      >
        <span style={{ fontSize: 9, color: isActive ? 'var(--accent)' : 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{label}</span>
        <span style={{ fontSize: 12, fontWeight: display ? 600 : 400, color: display ? 'var(--text)' : 'var(--text-3)' }}>{display ?? '--:--'}</span>
      </button>
    );
  };

  // Libellé du récapitulatif (jour unique ou plage)
  const recap = (() => {
    if (!start) return null;
    const sh = (x: Date) => `${x.getDate()} ${FR_MONTHS[x.getMonth()].slice(0,4)}`;
    if (mode === 'range' && end && localEndDate !== localDate) return `${sh(start)} → ${sh(end)} ${end.getFullYear()}`;
    return `${FR_DAYS_LONG[start.getDay()]} · ${sh(start)} ${start.getFullYear()}`;
  })();

  const segBtn = (m: 'single' | 'range', label: string): React.ReactNode => (
    <button onClick={() => switchMode(m)}
      style={{
        flex: 1, padding: '5px 0', borderRadius: 7, border: 'none', cursor: 'pointer',
        background: mode === m ? 'var(--surface-3)' : 'transparent',
        color: mode === m ? 'var(--text)' : 'var(--text-3)',
        fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: mode === m ? 700 : 400,
        textTransform: 'uppercase', letterSpacing: '0.04em', transition: 'all 0.12s',
      }}>
      {label}
    </button>
  );

  return createPortal(
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: zIndex - 1 }} />
      <div ref={dropRef} onClick={e => e.stopPropagation()} style={{
        position: 'fixed', ...pos, zIndex,
        background: 'var(--surface-3)', border: '1px solid var(--border-2)',
        borderRadius: 14, padding: 14, width: 280,
        boxShadow: '0 12px 40px rgba(0,0,0,0.7)',
      }}>

        {/* ── Bascule Jour / Plage ── */}
        <div style={{ display: 'flex', gap: 2, padding: 2, borderRadius: 9, background: 'var(--surface)', border: '1px solid var(--border)', marginBottom: 10 }}>
          {segBtn('single', 'Jour')}
          {segBtn('range', 'Plage')}
        </div>

        {/* ── Récapitulatif ── */}
        {recap && (
          <div style={{ fontFamily: 'var(--ff-mono)', fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: 'var(--text-3)', marginBottom: 10, paddingLeft: 2 }}>
            {recap}
          </div>
        )}

        {/* ── Calendrier ── */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
          <button onClick={prevMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 6, display: 'flex' }}>
            <SFIcon name="chevron-left" size={14} />
          </button>
          <span style={{ fontSize: 13, fontWeight: 600 }}>
            {FR_MONTHS[view.getMonth()]} {view.getFullYear()}
          </span>
          <button onClick={nextMonth} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: '2px 6px', borderRadius: 6, display: 'flex' }}>
            <SFIcon name="chevron-right" size={14} />
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2, marginBottom: 4 }}>
          {FR_DAYS.map((d, i) => (
            <div key={i} style={{ textAlign: 'center', fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.04em', padding: '3px 0' }}>{d}</div>
          ))}
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)', gap: 2 }}>
          {cells.map((d, i) => {
            if (!d) return <div key={i} />;
            const ymd = toYMD(d);
            const isToday = ymd === toYMD(TODAY_DP);
            const isStart = start != null && ymd === localDate;
            const isEnd   = end != null && ymd === localEndDate && localEndDate !== localDate;
            const isSel   = isStart || isEnd;
            const inRange = start != null && end != null && d > start && d < end;
            return (
              <button key={i} onClick={() => pick(d)}
                style={{
                  width: '100%', aspectRatio: '1', borderRadius: 8, border: 'none',
                  background: isSel ? 'var(--accent)' : inRange ? 'rgba(249,255,0,0.16)' : isToday ? 'rgba(249,255,0,0.12)' : 'transparent',
                  color: isSel ? 'var(--on-accent)' : (inRange || isToday) ? 'var(--accent)' : 'var(--text)',
                  fontSize: 12, fontWeight: isSel || isToday || inRange ? 700 : 400,
                  cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
                  outline: isToday && !isSel && !inRange ? '1px solid rgba(249,255,0,0.3)' : 'none',
                  transition: 'background 0.1s',
                }}
                onMouseEnter={e => { if (!isSel && !inRange) (e.currentTarget as HTMLElement).style.background = 'var(--surface-2)'; }}
                onMouseLeave={e => { if (!isSel && !inRange) (e.currentTarget as HTMLElement).style.background = isToday ? 'rgba(249,255,0,0.12)' : 'transparent'; }}
              >
                {d.getDate()}
              </button>
            );
          })}
        </div>

        {/* ── Horaire (à la demande) ── */}
        <div style={{ marginTop: 10 }}>
          {!showTime ? (
            <button onClick={() => setShowTime(true)}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '2px 0', fontFamily: 'var(--ff-mono)', fontSize: 10, color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: 4 }}>
              <SFIcon name="plus" size={10} /> Ajouter une heure
            </button>
          ) : (
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {timeTrigger('De', localStart, 'start', startBtnRef)}
              <span style={{ color: 'var(--text-3)', fontSize: 14, flexShrink: 0 }}>→</span>
              {timeTrigger('À', localEnd, 'end', endBtnRef)}
              {(localStart || localEnd) && (
                <button onClick={clearTimes} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 4, display: 'flex', borderRadius: 6, flexShrink: 0 }}>
                  <SFIcon name="x" size={12} />
                </button>
              )}
            </div>
          )}
        </div>

        {/* ── Raccourcis + effacer ── */}
        <div style={{ display: 'flex', gap: 5, marginTop: 10, borderTop: '1px solid var(--border)', paddingTop: 10 }}>
          {[
            { label: "Auj.", d: TODAY_DP },
            { label: 'Dem.', d: new Date(TODAY_DP.getFullYear(), TODAY_DP.getMonth(), TODAY_DP.getDate()+1) },
            { label: '+1 sem.', d: new Date(TODAY_DP.getFullYear(), TODAY_DP.getMonth(), TODAY_DP.getDate()+7) },
          ].map(s => (
            <button key={s.label} onClick={() => commitSingle(s.d)}
              style={{ flex: 1, padding: '5px 2px', borderRadius: 7, border: '1px solid var(--border-2)', background: 'var(--surface-2)', color: 'var(--text-2)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap' }}>
              {s.label}
            </button>
          ))}
          {localDate && (
            <button onClick={clearAll}
              style={{ padding: '5px 8px', borderRadius: 7, border: '1px solid var(--border)', background: 'transparent', color: 'var(--danger)', fontSize: 10, cursor: 'pointer', fontFamily: 'var(--ff-mono)', whiteSpace: 'nowrap', display: 'flex', alignItems: 'center' }}>
              <SFIcon name="trash-2" size={11} />
            </button>
          )}
        </div>
      </div>

      {/* Sélecteurs d'heure compacts (réutilise TimePickerDropdown existant) */}
      {timeOpen === 'start' && (
        <TimePickerDropdown value={localStart} anchorRect={timeRect} zIndex={zIndex + 20}
          onChange={v => { setStart(v); setTimeOpen(null); }} onClose={() => setTimeOpen(null)} />
      )}
      {timeOpen === 'end' && (
        <TimePickerDropdown value={localEnd} anchorRect={timeRect} zIndex={zIndex + 20}
          onChange={v => { setEnd(v); setTimeOpen(null); }} onClose={() => setTimeOpen(null)} />
      )}
    </>,
    document.body
  );
}
