import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TODAY, isSameDay, HOUR_H, START_HOUR, END_HOUR, HOURS, SCROLL_TO_HOUR, fmt2, timeToY, layoutEvents, type CalEvent } from './calendarUtils';
import { EventBlock } from './EventBlock';

export function TimeGridView({ days, events, tasks: _tasks, onSlotClick, onRangeSelect, onEventClick, onAllDayClick, onEventChange, createModalOpen }: {
  days: Date[];
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onSlotClick: (d: Date, h: number) => void;
  onRangeSelect: (d: Date, startH: number, startM: number, endH: number, endM: number) => void;
  onEventClick: (ev: CalEvent) => void;
  onAllDayClick?: (d: Date) => void;
  onEventChange?: (ev: CalEvent, newStart: Date, newEnd: Date) => void;
  // Quand fourni : la zone surlignée par le glisser-déposer reste visible en
  // arrière-plan tant que la modale de création est ouverte, au lieu de
  // disparaître dès le relâchement de la souris puis de "réapparaître" une
  // fois l'événement créé.
  createModalOpen?: boolean;
}) {
  const { t } = useTranslation();
  const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];
  const isDay=days.length===1;
  const scrollRef=useRef<HTMLDivElement>(null);

  // Scroll to working hours on mount / when days change
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_H;
    }
  }, [days[0]?.toDateString()]);

  // Drag-select state
  const dragRef = useRef<{ colIdx: number; day: Date; startY: number; moved: boolean } | null>(null);
  const [dragSel, setDragSel] = useState<{ colIdx: number; top: number; height: number } | null>(null);
  const timeGridRef = useRef<HTMLDivElement>(null);
  const [dragOverDay, setDragOverDay] = useState<string | null>(null);
  const toISO = (d: Date) => `${d.getFullYear()}-${fmt2(d.getMonth() + 1)}-${fmt2(d.getDate())}`;

  // La modale de création se referme (créé ou annulé) → on peut effacer le
  // surlignage laissé par le glisser-déposer.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- clearing the drag highlight once the create modal closes is the intended effect
    if (!createModalOpen) setDragSel(null);
  }, [createModalOpen]);

  // Snap Y position to nearest 15-min increment
  const yToTimeParts = (y: number): { h: number; m: number } => {
    const totalMins = Math.round(((y / HOUR_H) * 60 + START_HOUR * 60) / 15) * 15;
    const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, totalMins));
    return { h: Math.floor(clamped / 60), m: clamped % 60 };
  };

  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {/* Scrollable area — header is sticky inside so widths always match */}
      <div ref={scrollRef} style={{ flex:1,overflowY:'scroll',overflowX:'hidden' }}
        onMouseMove={e=>{
          if(!dragRef.current) return;
          const gridRect=timeGridRef.current!.getBoundingClientRect();
          const y=e.clientY-gridRect.top;
          const startY=dragRef.current.startY;
          const moved=Math.abs(y-startY)>10;
          dragRef.current.moved=moved;
          if(moved){
            setDragSel({ colIdx:dragRef.current.colIdx, top:Math.min(startY,y), height:Math.abs(y-startY) });
          }
        }}
        onMouseUp={e=>{
          if(!dragRef.current) return;
          const gridRect=timeGridRef.current!.getBoundingClientRect();
          const y=e.clientY-gridRect.top;
          const startY=dragRef.current.startY;
          const day=dragRef.current.day;
          if(dragRef.current.moved){
            const topY=Math.min(startY,y), botY=Math.max(startY,y);
            const start=yToTimeParts(topY);
            let end=yToTimeParts(botY);
            // ensure at least 15 min duration
            if(end.h*60+end.m <= start.h*60+start.m) { end=yToTimeParts(botY+HOUR_H/4); }
            onRangeSelect(day, start.h, start.m, Math.min(end.h,END_HOUR), end.h>=END_HOUR?0:end.m);
            // Ne pas effacer dragSel ici : on la garde visible en arrière-plan
            // pendant que la modale de création est ouverte (voir l'effet
            // ci-dessous, qui l'efface une fois la modale refermée).
          } else {
            setDragSel(null);
          }
          dragRef.current=null;
        }}
        onMouseLeave={()=>{ dragRef.current=null; setDragSel(null); }}
      >
        {/* ── Sticky header (inside scroll so width = content width, scrollbar included) ── */}
        <div style={{ position:'sticky',top:0,zIndex:10,background:'var(--bg)',borderBottom:'1px solid var(--border)' }}>
          {/* Day names + date numbers */}
          <div style={{ display:'flex' }}>
            <div style={{ width:52,flexShrink:0 }} />
            {days.map((d,i)=>{
              const isToday=isSameDay(d,TODAY);
              const dayIdx=new Date(d).getDay()===0?6:new Date(d).getDay()-1;
              return (
                <div key={i} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'8px 0 6px',minWidth:0 }}>
                  <span style={{ fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3 }}>
                    {isDay ? dayNames[dayIdx] : dayNames[i]}
                  </span>
                  <div style={{ width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:isToday?'var(--accent)':'transparent',flexShrink:0 }}>
                    <span style={{ fontFamily:'var(--ff-mono)',fontSize:14,color:isToday?'var(--on-accent)':'var(--text)',fontWeight:isToday?700:400 }}>{d.getDate()}</span>
                  </div>
                </div>
              );
            })}
          </div>
          {/* All-day events row */}
          <div style={{ display:'flex',borderTop:'1px solid var(--border)' }}>
            <div style={{ width:52,flexShrink:0,display:'flex',alignItems:'center',justifyContent:'flex-end',paddingRight:8 }}>
              <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)' }}>{t('calendar.allDayShort')}</span>
            </div>
            {days.map((d,i)=>{
              const dayAllDay=events.filter(ev=>isSameDay(ev.startDate,d)&&ev.allDay);
              return (
                <div key={i} onClick={()=>onAllDayClick?.(d)}
                  style={{ flex:1,padding:'3px 4px',minWidth:0,display:'flex',flexDirection:'column',gap:2,minHeight:24,cursor:'pointer' }}
                >
                  {dayAllDay.map(ev=>(
                    <div key={ev.id} onClick={e=>{e.stopPropagation();onEventClick(ev);}}
                      style={{ width:'100%',padding:'2px 8px',borderRadius:4,background:`${ev.eventTypeColor}cc`,cursor:'pointer',overflow:'hidden' }}
                    >
                      <span style={{ fontSize:11,fontWeight:600,color:'white',whiteSpace:'nowrap',textOverflow:'ellipsis',overflow:'hidden',display:'block' }}>{ev.title}</span>
                    </div>
                  ))}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── Time grid ── */}
        <div ref={timeGridRef} style={{ display:'flex',minHeight:`${HOURS.length*HOUR_H}px`,position:'relative' }}>
          {/* Time labels */}
          <div style={{ width:52,flexShrink:0 }}>
            {HOURS.map(h=>(
              <div key={h} style={{ height:HOUR_H,display:'flex',alignItems:'flex-start',paddingTop:4,paddingRight:8,justifyContent:'flex-end' }}>
                <span style={{ fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)' }}>{fmt2(h)}:00</span>
              </div>
            ))}
          </div>

          {/* Day columns */}
          {days.map((d,di)=>{
            const dayEvs=events.filter(ev=>isSameDay(ev.startDate,d)&&!ev.allDay);
            const laid=layoutEvents(dayEvs);
            const isDragging=dragSel?.colIdx===di;
            return (
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
                {/* Hour lines */}
                {HOURS.map(h=>(
                  <div key={h} style={{ position:'absolute',top:((h-START_HOUR)*HOUR_H),left:0,right:0,borderTop:'1px solid var(--border)',pointerEvents:'none' }} />
                ))}
                {/* Drag selection highlight */}
                {isDragging && dragSel && (() => {
                  const s=yToTimeParts(dragSel.top);
                  const e=yToTimeParts(dragSel.top+dragSel.height);
                  return (
                    <div style={{ position:'absolute', top:dragSel.top, height:Math.max(4,dragSel.height), left:4, right:4, background:'rgba(249,255,0,0.12)', border:'1px solid var(--accent)', borderRadius:6, pointerEvents:'none', zIndex:4 }}>
                      <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--accent)',padding:'2px 6px',display:'block' }}>
                        {fmt2(s.h)}:{fmt2(s.m)} — {fmt2(e.h)}:{fmt2(e.m)}
                      </span>
                    </div>
                  );
                })()}
                {/* Current time indicator */}
                {isSameDay(d,TODAY) && (
                  <div style={{ position:'absolute',top:timeToY(TODAY),left:0,right:0,height:2,background:'var(--danger)',zIndex:6,pointerEvents:'none' }}>
                    <div style={{ position:'absolute',left:-4,top:-4,width:10,height:10,borderRadius:'50%',background:'var(--danger)' }} />
                  </div>
                )}
                {/* Events */}
                {laid.map(ev=>(
                  <EventBlock key={ev.id} ev={ev} col={ev.col} numCols={ev.numCols} onClick={()=>onEventClick(ev)}
                    onChange={onEventChange ? (s,e)=>onEventChange(ev,s,e) : undefined}
                    onDragDay={setDragOverDay} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
