import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { SFIcon } from '../ui';
import { getWeekStart } from '../../data/weekStartStore';
import { TODAY, getMonthGrid, isSameDay } from './calendarUtils';

// Petit calendrier mensuel de navigation — sidebar du calendrier global et
// du calendrier de projet (les deux partagent le même composant).
export function MiniCalendar({ cur, onSelect }: { cur: Date; onSelect: (d: Date) => void }) {
  const { t } = useTranslation();
  const months = t('calendar.months', { returnObjects: true }) as string[];
  const daysShort = t('datepicker.daysShort', { returnObjects: true }) as string[];
  const weekStart = getWeekStart();
  const orderedDaysShort = Array.from({ length: 7 }, (_, i) => daysShort[(((weekStart + i) % 7) + 6) % 7]);
  const [mini, setMini] = useState(new Date(TODAY));
  const days = getMonthGrid(mini);
  const prevM = () => setMini(d=>new Date(d.getFullYear(),d.getMonth()-1,1));
  const nextM = () => setMini(d=>new Date(d.getFullYear(),d.getMonth()+1,1));

  return (
    <div>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
        <button onClick={prevM} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',padding:'2px 4px',display:'flex' }}><SFIcon name="chevron-left" size={13} /></button>
        <span style={{ fontFamily:'var(--ff-mono)',fontSize:11,color:'var(--text-2)',fontWeight:600 }}>{months[mini.getMonth()].slice(0,3)} {mini.getFullYear()}</span>
        <button onClick={nextM} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',padding:'2px 4px',display:'flex' }}><SFIcon name="chevron-right" size={13} /></button>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:4 }}>
        {orderedDaysShort.map((d,i)=>(
          <div key={i} style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textAlign:'center',padding:'2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1 }}>
        {days.map((d,i)=>{
          const isToday=isSameDay(d,TODAY);
          const isCur=isSameDay(d,cur);
          const isThisMonth=d.getMonth()===mini.getMonth();
          return (
            <button key={i} onClick={()=>onSelect(d)}
              style={{ width:'100%',aspectRatio:'1',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--ff-mono)',fontSize:10,borderRadius:'50%',border:'none',cursor:'pointer',
                background:isCur?'var(--accent)':isToday?'rgba(249,255,0,0.15)':'transparent',
                color:isCur?'var(--on-accent)':isToday?'var(--accent)':isThisMonth?'var(--text-2)':'var(--text-3)',
                fontWeight:isToday||isCur?700:400,
              }}
            >{d.getDate()}</button>
          );
        })}
      </div>
    </div>
  );
}
