import { useState } from 'react';
import { SFIcon } from '../ui';
import { fmtTime, timeToY, durationH, type CalEvent } from './calendarUtils';

// Event card rendered inside the week/day time grid — byte-identical between
// CalendrierGlobal.tsx and ProjetCalendrier.tsx before this extraction.
export function EventBlock({ ev, col, numCols, onClick }: { ev: CalEvent; col: number; numCols: number; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const top = timeToY(ev.startDate);
  const h   = Math.max(20, durationH(ev.startDate, ev.endDate));
  const w   = `calc((100% - 8px) / ${numCols})`;
  const left= `calc(4px + ${col} * (100% - 8px) / ${numCols})`;

  return (
    <div onClick={e=>{e.stopPropagation();onClick();}} onMouseDown={e=>e.stopPropagation()} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ position:'absolute', top, height:h, width:w, left, borderRadius:6, padding:'4px 7px', overflow:'hidden', cursor:'pointer', zIndex:5,
        background:`${ev.eventTypeColor}cc`, border:`1px solid ${ev.eventTypeColor}`, borderLeft:`3px solid ${ev.projectColor}`, boxShadow:hov?`0 2px 12px ${ev.eventTypeColor}66`:undefined, transition:'box-shadow 0.15s',
      }}
    >
      <div style={{ display:'flex',alignItems:'center',gap:4 }}>
        {ev.meetingUrl && <SFIcon name="video" size={10} color="white" />}
        <p style={{ fontSize:11,fontWeight:700,color:'white',lineHeight:1.2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.title}</p>
      </div>
      {h>30 && <p style={{ fontSize:10,color:'rgba(255,255,255,0.8)',fontFamily:'var(--ff-mono)' }}>{fmtTime(ev.startDate)} – {fmtTime(ev.endDate)}</p>}
      {h>50 && ev.location && <p style={{ fontSize:9,color:'rgba(255,255,255,0.7)',marginTop:2 }}>📍 {ev.location}</p>}
    </div>
  );
}
