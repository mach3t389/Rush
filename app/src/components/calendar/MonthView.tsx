import { useTranslation } from 'react-i18next';
import { TODAY, isSameDay, getMonthGrid, fmtTime, type CalEvent } from './calendarUtils';

export function MonthView({ cur, events, tasks, onDayClick, onEventClick, onCellClick }: {
  cur: Date;
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onDayClick: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
  onCellClick: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];
  const days = getMonthGrid(cur);

  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {/* Day headers */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--border)',flexShrink:0 }}>
        {dayNames.map((d,i)=>(
          <div key={i} style={{ padding:'10px 0 8px',textAlign:'center',fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em' }}>{d}</div>
        ))}
      </div>

      {/* Grid */}
      <div style={{ flex:1,display:'grid',gridTemplateColumns:'repeat(7,1fr)',gridTemplateRows:`repeat(${days.length/7},1fr)`,overflow:'auto' }}>
        {days.map((day,i)=>{
          const isToday=isSameDay(day,TODAY);
          const isCurMonth=day.getMonth()===cur.getMonth();
          const dayEvents=events.filter(ev=>isSameDay(ev.startDate,day));
          const dayTasks=tasks.filter(tk=>isSameDay(tk.date,day));
          const showMore=dayEvents.length>2;
          const visible=dayEvents.slice(0,2);

          return (
            <div key={i} onClick={()=>onCellClick(day)}
              style={{ borderRight:i%7!==6?'1px solid var(--border)':undefined,borderBottom:'1px solid var(--border)',padding:'4px 6px 6px',minHeight:90,cursor:'pointer',background:isToday?'rgba(249,255,0,0.03)':undefined,position:'relative',overflow:'hidden' }}>
              {/* Date number */}
              <button onClick={e=>{e.stopPropagation();onDayClick(day);}}
                style={{ width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--ff-mono)',fontSize:12,cursor:'pointer',border:'none',background:isToday?'var(--accent)':'transparent',color:isToday?'var(--on-accent)':isCurMonth?'var(--text)':'var(--text-3)',fontWeight:isToday?700:400,marginBottom:4,flexShrink:0 }}
              >{day.getDate()}</button>

              {/* Events */}
              {visible.map(ev=>(
                <div key={ev.id} onClick={e=>{e.stopPropagation();onEventClick(ev);}}
                  style={{ display:'flex',alignItems:'center',gap:4,padding:'2px 6px',borderRadius:5,background:`${ev.eventTypeColor}bb`,borderLeft:`3px solid ${ev.projectColor}`,marginBottom:2,cursor:'pointer' }}
                >
                  <span style={{ fontSize:10,fontWeight:600,color:'white',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1 }}>{ev.title}</span>
                  {!ev.allDay && <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'rgba(255,255,255,0.8)',flexShrink:0 }}>{fmtTime(ev.startDate)}</span>}
                </div>
              ))}

              {showMore && (
                <div style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',padding:'1px 6px' }}>{t('calendar.moreEvents', { count: dayEvents.length-2 })}</div>
              )}

              {/* Tasks */}
              {dayTasks.map((tk,ti)=>(
                <div key={ti} title={tk.title}
                  style={{ display:'flex',alignItems:'center',gap:4,padding:'2px 6px',borderRadius:5,background:`${tk.color}44`,borderLeft:`3px solid ${tk.color}`,marginBottom:2,overflow:'hidden' }}
                >
                  <span style={{ fontSize:10,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1 }}>{tk.title}</span>
                </div>
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}
