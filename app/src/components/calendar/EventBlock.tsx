import { useRef, useState } from 'react';
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

// Event card rendered inside the week/day time grid — byte-identical between
// CalendrierGlobal.tsx and ProjetCalendrier.tsx before this extraction.
//
// When `onChange` is provided, the whole card can be dragged vertically to
// change its start time (duration preserved), and a small handle at the
// bottom can be dragged to stretch/shrink its end time (duration changes,
// start fixed). Both stay clamped within the same calendar day.
export function EventBlock({ ev, col, numCols, onClick, onChange }: {
  ev: CalEvent; col: number; numCols: number; onClick: () => void;
  onChange?: (newStart: Date, newEnd: Date) => void;
}) {
  const [hov, setHov] = useState(false);
  const [preview, setPreview] = useState<{ start: Date; end: Date } | null>(null);
  const dragRef = useRef<DragState | null>(null);
  const suppressClickRef = useRef(false);
  const previewRef = useRef<{ start: Date; end: Date } | null>(null);

  const start = preview?.start ?? ev.startDate;
  const end   = preview?.end ?? ev.endDate;
  const top = timeToY(start);
  const h   = Math.max(20, durationH(start, end));
  const w   = `calc((100% - 8px) / ${numCols})`;
  const left= `calc(4px + ${col} * (100% - 8px) / ${numCols})`;

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
        if (ne > dayEnd)   { const diff = ne.getTime() - dayEnd.getTime(); ns = new Date(ns.getTime() - diff); ne = new Date(ne.getTime() - diff); }
        previewRef.current = { start: ns, end: ne };
        setPreview(previewRef.current);
      } else {
        const minEnd = new Date(d.origStart.getTime() + 15 * 60000);
        let ne = new Date(d.origEnd.getTime() + deltaMin * 60000);
        if (ne < minEnd) ne = minEnd;
        if (ne > dayEnd) ne = dayEnd;
        previewRef.current = { start: d.origStart, end: ne };
        setPreview(previewRef.current);
      }
    };

    const onMouseUp = () => {
      window.removeEventListener('mousemove', onMouseMove);
      window.removeEventListener('mouseup', onMouseUp);
      const d = dragRef.current;
      dragRef.current = null;
      const finalPreview = previewRef.current;
      previewRef.current = null;
      setPreview(null);
      if (d?.moved && finalPreview) {
        suppressClickRef.current = true;
        onChange(finalPreview.start, finalPreview.end);
      }
    };

    window.addEventListener('mousemove', onMouseMove);
    window.addEventListener('mouseup', onMouseUp);
  };

  return (
    <div
      data-event
      onClick={e=>{
        e.stopPropagation();
        if (suppressClickRef.current) { suppressClickRef.current = false; return; }
        onClick();
      }}
      onMouseDown={beginDrag('move')}
      onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ position:'absolute', top, height:h, width:w, left, borderRadius:6, padding:'4px 7px', overflow:'hidden', cursor: onChange ? 'grab' : 'pointer', zIndex: preview ? 20 : 5,
        background:`${ev.eventTypeColor}cc`, border:`1px solid ${ev.eventTypeColor}`, borderLeft:`3px solid ${ev.projectColor}`, boxShadow:(hov||preview)?`0 2px 12px ${ev.eventTypeColor}66`:undefined, transition: preview ? undefined : 'box-shadow 0.15s',
      }}
    >
      <div style={{ display:'flex',alignItems:'center',gap:4 }}>
        {ev.meetingUrl && <SFIcon name="video" size={10} color="white" />}
        <p style={{ fontSize:11,fontWeight:700,color:'white',lineHeight:1.2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.title}</p>
      </div>
      {h>30 && <p style={{ fontSize:10,color:'rgba(255,255,255,0.8)',fontFamily:'var(--ff-mono)' }}>{fmtTime(start)} – {fmtTime(end)}</p>}
      {h>50 && ev.location && <p style={{ fontSize:9,color:'rgba(255,255,255,0.7)',marginTop:2 }}>📍 {ev.location}</p>}
      {onChange && (
        <div
          onMouseDown={beginDrag('resize')}
          onMouseEnter={e=>e.stopPropagation()}
          style={{ position:'absolute', left:0, right:0, bottom:0, height:7, cursor:'ns-resize' }}
        />
      )}
    </div>
  );
}
