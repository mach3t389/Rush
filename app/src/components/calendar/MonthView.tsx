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
