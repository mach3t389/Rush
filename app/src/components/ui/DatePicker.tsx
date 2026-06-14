import { useState, useEffect, useLayoutEffect, useRef } from 'react';
import { SFIcon } from './SFIcon';

// ── Helpers ────────────────────────────────────────────────────────────────────

export const FR_MONTHS = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const FR_DAYS = ['L','M','M','J','V','S','D'];
export const TODAY_DP = new Date(2026, 5, 10);

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
  return `${d.getDate()} ${FR_MONTHS[d.getMonth()].slice(0,3).toLowerCase()}. ${d.getFullYear()}`;
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

  return (
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
    </>
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
    const mm = newM >= 0 ? newM : m;
    if (hh >= 0 && mm >= 0) {
      onChange(`${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`);
    }
  };

  const btnBase: React.CSSProperties = {
    width: '100%', padding: '5px 8px', borderRadius: 6, border: 'none',
    background: 'transparent', color: 'var(--text-2)', fontSize: 12,
    fontFamily: 'var(--ff-mono)', cursor: 'pointer', textAlign: 'center',
  };

  return (
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
    </>
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
