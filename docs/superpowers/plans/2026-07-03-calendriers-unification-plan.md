# Unification des calendriers — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Delete the unreachable, broken `TravailCalendar.tsx`, and extract the ~60%-duplicated grid/card/date-math code shared by `CalendrierGlobal.tsx` and `ProjetCalendrier.tsx` into a small shared module, with zero visible behavior change for the end user.

**Architecture:** Four new files under `app/src/components/calendar/` (`calendarUtils.ts` for pure date/layout logic and the `CalEvent` type, `EventBlock.tsx`, `MonthView.tsx`, `TimeGridView.tsx` for the three UI pieces both screens render identically). `CalendrierGlobal.tsx` and `ProjetCalendrier.tsx` import these instead of defining their own copies; nothing else about either screen changes.

**Tech Stack:** React 19 + TypeScript, react-i18next, existing `SFIcon` UI primitive.

## Global Constraints

- No automated test suite; verification is `npx tsc --noEmit -p tsconfig.app.json` (not bare `npx tsc --noEmit`, which is a false pass in this repo — see project convention).
- Never hard-code user-facing text — this refactor moves existing `t('calendar.*')` calls verbatim; do not introduce any new hard-coded string.
- No visible behavior change for the end user is the explicit goal of this plan — if a step would change what renders, stop and flag it rather than silently "improving" it (one intentional exception is called out explicitly in Task 4).
- Follow the project's file-organization convention: one clear responsibility per file, small focused files preferred over one large shared file.

---

### Task 1: Delete `TravailCalendar.tsx`

**Files:**
- Delete: `app/src/screens/TravailCalendar.tsx`

**Interfaces:** None — this file is unreferenced by any other file in the codebase (confirmed by a global import search finding zero matches).

- [ ] **Step 1: Confirm nothing imports it**

Run (from `app/`): `grep -rn "TravailCalendar" src --include="*.tsx" --include="*.ts"`
Expected: only the file's own definition line(s) inside `src/screens/TravailCalendar.tsx` itself — no import statements anywhere else. If you find an import elsewhere, STOP and report BLOCKED with the file/line — the plan's premise (dead code) would be wrong.

- [ ] **Step 2: Delete the file**

```bash
git rm app/src/screens/TravailCalendar.tsx
```

- [ ] **Step 3: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -i "TravailCalendar"`
Expected: no output.

- [ ] **Step 4: Commit**

```bash
git commit -m "chore: remove dead TravailCalendar.tsx (unreferenced, broken)"
```

---

### Task 2: `calendarUtils.ts` — shared date/layout logic (new file)

**Files:**
- Create: `app/src/components/calendar/calendarUtils.ts`

**Interfaces:**
- Produces: constants `TODAY`, `MONTHS_SHORT`, `HOUR_H`, `START_HOUR`, `END_HOUR`, `SCROLL_TO_HOUR`, `HOURS`; type `CalView`; functions `addDays`, `isSameDay`, `startOfWeek`, `fmt2`, `fmtTime`, `timeToY`, `durationH`, `parseFrDate`, `getMonthGrid`, `getWeekDays`, `layoutEvents`; types `CalEvent`, `LaidOutEvent`.

- [ ] **Step 1: Create the file**

```ts
// Shared date/time helpers and event-layout logic used by CalendrierGlobal.tsx
// and ProjetCalendrier.tsx — both screens had byte-identical or near-identical
// copies of everything in this file before this extraction.

export const TODAY        = new Date();
export const MONTHS_SHORT = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
export const HOUR_H       = 64;
export const START_HOUR   = 0;
export const END_HOUR     = 24;
export const SCROLL_TO_HOUR = 8; // heure affichée en haut au chargement de la vue jour/semaine
export const HOURS        = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

export type CalView = 'month' | 'week' | 'day';

export function addDays(d: Date, n: number): Date { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
export function isSameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
export function startOfWeek(d: Date): Date { const r=new Date(d); const dow=r.getDay(); r.setDate(r.getDate()-(dow===0?6:dow-1)); r.setHours(0,0,0,0); return r; }
export function fmt2(n: number) { return String(n).padStart(2,'0'); }
export function fmtTime(d: Date) { return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`; }
export function timeToY(d: Date) { return (d.getHours()-START_HOUR+d.getMinutes()/60)*HOUR_H; }
export function durationH(s: Date, e: Date) { return ((e.getTime()-s.getTime())/(1000*60*60))*HOUR_H; }

export function parseFrDate(s: string): Date | null {
  if (!s || s==='—') return null;
  if (s==="Aujourd'hui") return new Date(TODAY);
  if (s==='Demain') return addDays(TODAY,1);
  if (s==='Hier') return addDays(TODAY,-1);
  const m = s.match(/(\d+)\s+(\w+)(?:\s+(\d{4}))?/);
  if (m) {
    const day=parseInt(m[1]);
    const monthStr=m[2].toLowerCase().slice(0,4);
    const month=MONTHS_SHORT.findIndex(x=>monthStr.startsWith(x.slice(0,3)));
    const year=m[3]?parseInt(m[3]):TODAY.getFullYear();
    if(month!==-1) return new Date(year,month,day);
  }
  return null;
}

export function getMonthGrid(date: Date): Date[] {
  const year=date.getFullYear(), month=date.getMonth();
  const first=new Date(year,month,1);
  const last=new Date(year,month+1,0);
  const dow=first.getDay();
  const pad=dow===0?6:dow-1;
  const days: Date[]=[];
  for(let i=-pad;i<last.getDate();i++) days.push(new Date(year,month,1+i));
  while(days.length%7!==0) days.push(new Date(days[days.length-1].getTime()+86400000));
  return days;
}

export function getWeekDays(date: Date): Date[] {
  const start=startOfWeek(date);
  return Array.from({length:7},(_,i)=>addDays(start,i));
}

export interface CalEvent {
  id: string;
  title: string;
  eventTypeId: string;
  projectId?: string;
  projectName: string;
  projectColor: string;
  eventTypeColor: string;
  eventTypeLabel: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  meetingUrl?: string;
  participantIds?: string[];
  sectionId?: string;
  sectionLabel?: string;
}

export interface LaidOutEvent extends CalEvent {
  col: number;
  numCols: number;
}

export function layoutEvents(events: CalEvent[]): LaidOutEvent[] {
  const sorted=[...events].sort((a,b)=>a.startDate.getTime()-b.startDate.getTime());
  const cols: CalEvent[][]=[];
  for(const ev of sorted){
    let placed=false;
    for(let c=0;c<cols.length;c++){
      const last=cols[c][cols[c].length-1];
      if(last.endDate.getTime()<=ev.startDate.getTime()){cols[c].push(ev);placed=true;break;}
    }
    if(!placed) cols.push([ev]);
  }
  return sorted.map(ev=>{
    const col=cols.findIndex(c=>c.includes(ev));
    return {...ev,col,numCols:cols.length};
  });
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "calendarUtils.ts"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/calendar/calendarUtils.ts
git commit -m "feat: extract shared calendar date/layout utilities"
```

---

### Task 3: `EventBlock.tsx` — shared event card (new file)

**Files:**
- Create: `app/src/components/calendar/EventBlock.tsx`

**Interfaces:**
- Consumes: `fmtTime`, `timeToY`, `durationH`, `CalEvent` from `./calendarUtils` (Task 2); `SFIcon` from `../ui`.
- Produces: `export function EventBlock({ ev, col, numCols, onClick }): JSX.Element`.

- [ ] **Step 1: Create the file**

```tsx
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
        {ev.meetingUrl && <SFIcon name="video" size={10} color="white" style={{ flexShrink:0 }} />}
        <p style={{ fontSize:11,fontWeight:700,color:'white',lineHeight:1.2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.title}</p>
      </div>
      {h>30 && <p style={{ fontSize:10,color:'rgba(255,255,255,0.8)',fontFamily:'var(--ff-mono)' }}>{fmtTime(ev.startDate)} – {fmtTime(ev.endDate)}</p>}
      {h>50 && ev.location && <p style={{ fontSize:9,color:'rgba(255,255,255,0.7)',marginTop:2 }}>📍 {ev.location}</p>}
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "EventBlock.tsx"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/calendar/EventBlock.tsx
git commit -m "feat: extract shared calendar EventBlock component"
```

---

### Task 4: `MonthView.tsx` — shared month grid (new file)

**Files:**
- Create: `app/src/components/calendar/MonthView.tsx`

**Interfaces:**
- Consumes: `TODAY`, `isSameDay`, `getMonthGrid`, `fmtTime`, `CalEvent` from `./calendarUtils` (Task 2).
- Produces: `export function MonthView({ cur, events, tasks, onDayClick, onEventClick, onCellClick }): JSX.Element`.

**Note on an intentional behavior change:** `CalendrierGlobal.tsx`'s current `MonthView` computes a `dayTasks` variable but never renders it (a pre-existing bug — it receives task-chip data for exactly this purpose and silently drops it). `ProjetCalendrier.tsx`'s `MonthView` does render task chips. This shared version renders them (matching `ProjetCalendrier`'s fuller behavior) — this is a deliberate, low-risk fix of dead code discovered during extraction, not scope creep: it makes `CalendrierGlobal.tsx`'s month view finally show the task chips it was already computing. Flag this specifically during manual verification (Task 8).

- [ ] **Step 1: Create the file**

```tsx
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
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "components/calendar/MonthView.tsx"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/calendar/MonthView.tsx
git commit -m "feat: extract shared calendar MonthView component"
```

---

### Task 5: `TimeGridView.tsx` — shared week/day grid (new file)

**Files:**
- Create: `app/src/components/calendar/TimeGridView.tsx`

**Interfaces:**
- Consumes: `TODAY`, `isSameDay`, `HOUR_H`, `START_HOUR`, `END_HOUR`, `HOURS`, `SCROLL_TO_HOUR`, `fmt2`, `timeToY`, `layoutEvents`, `CalEvent` from `./calendarUtils` (Task 2); `EventBlock` from `./EventBlock` (Task 3).
- Produces: `export function TimeGridView({ days, events, tasks, onSlotClick, onRangeSelect, onEventClick, onAllDayClick }): JSX.Element`.

- [ ] **Step 1: Create the file**

```tsx
import { useState, useRef, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { TODAY, isSameDay, HOUR_H, START_HOUR, END_HOUR, HOURS, SCROLL_TO_HOUR, fmt2, timeToY, layoutEvents, type CalEvent } from './calendarUtils';
import { EventBlock } from './EventBlock';

export function TimeGridView({ days, events, tasks, onSlotClick, onRangeSelect, onEventClick, onAllDayClick }: {
  days: Date[];
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onSlotClick: (d: Date, h: number) => void;
  onRangeSelect: (d: Date, startH: number, startM: number, endH: number, endM: number) => void;
  onEventClick: (ev: CalEvent) => void;
  onAllDayClick?: (d: Date) => void;
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
          }
          dragRef.current=null;
          setDragSel(null);
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
              <div key={di}
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
                  <EventBlock key={ev.id} ev={ev} col={ev.col} numCols={ev.numCols} onClick={()=>onEventClick(ev)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Typecheck**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "components/calendar/TimeGridView.tsx"`
Expected: no output.

- [ ] **Step 3: Commit**

```bash
git add app/src/components/calendar/TimeGridView.tsx
git commit -m "feat: extract shared calendar TimeGridView component"
```

---

### Task 6: `CalendrierGlobal.tsx` — switch to the shared modules

**Files:**
- Modify: `app/src/screens/CalendrierGlobal.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 2-5.

- [ ] **Step 1: Replace the imports and remove the local constants/helpers block**

Replace (currently `app/src/screens/CalendrierGlobal.tsx:1-61`, from the top of the file through the end of `getWeekDays`):

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton, SFPill } from '../components/ui';
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
import { getEvents, addEvent, updateEvent, deleteEvent, subscribeEvents } from '../data/eventStore';
import { getEventTypes, addEventType, updateEventType, deleteEventType, subscribeEventTypes, type EventType } from '../data/eventTypeStore';
import { usePersistedState } from '../hooks/usePersistedState';

// ── Constants & helpers ───────────────────────────────────────────────────────

const TODAY        = new Date();
const MONTHS_SHORT = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
const HOUR_H       = 64;
const START_HOUR   = 0;
const END_HOUR     = 24;
const SCROLL_TO_HOUR = 8; // heure affichée en haut au chargement de la vue jour/semaine
const HOURS        = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

type CalView = 'month' | 'week' | 'day';

function addDays(d: Date, n: number): Date { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function isSameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function startOfWeek(d: Date): Date { const r=new Date(d); const dow=r.getDay(); r.setDate(r.getDate()-(dow===0?6:dow-1)); r.setHours(0,0,0,0); return r; }
function fmt2(n: number) { return String(n).padStart(2,'0'); }
function fmtTime(d: Date) { return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`; }
function timeToY(d: Date) { return (d.getHours()-START_HOUR+d.getMinutes()/60)*HOUR_H; }
function durationH(s: Date, e: Date) { return ((e.getTime()-s.getTime())/(1000*60*60))*HOUR_H; }

function parseFrDate(s: string): Date | null {
  if (!s || s==='—') return null;
  if (s==="Aujourd'hui") return new Date(TODAY);
  if (s==='Demain') return addDays(TODAY,1);
  if (s==='Hier') return addDays(TODAY,-1);
  const m = s.match(/(\d+)\s+(\w+)(?:\s+(\d{4}))?/);
  if (m) {
    const day=parseInt(m[1]);
    const monthStr=m[2].toLowerCase().slice(0,4);
    const month=MONTHS_SHORT.findIndex(x=>monthStr.startsWith(x.slice(0,3)));
    const year=m[3]?parseInt(m[3]):TODAY.getFullYear();
    if(month!==-1) return new Date(year,month,day);
  }
  return null;
}

function getMonthGrid(date: Date): Date[] {
  const year=date.getFullYear(), month=date.getMonth();
  const first=new Date(year,month,1);
  const last=new Date(year,month+1,0);
  const dow=first.getDay();
  const pad=dow===0?6:dow-1;
  const days: Date[]=[];
  for(let i=-pad;i<last.getDate();i++) days.push(new Date(year,month,1+i));
  while(days.length%7!==0) days.push(new Date(days[days.length-1].getTime()+86400000));
  return days;
}

function getWeekDays(date: Date): Date[] {
  const start=startOfWeek(date);
  return Array.from({length:7},(_,i)=>addDays(start,i));
}
```

with:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton, SFPill } from '../components/ui';
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
import { getEvents, addEvent, updateEvent, deleteEvent, subscribeEvents } from '../data/eventStore';
import { getEventTypes, addEventType, updateEventType, deleteEventType, subscribeEventTypes, type EventType } from '../data/eventTypeStore';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  TODAY, MONTHS_SHORT, HOUR_H, START_HOUR, END_HOUR, SCROLL_TO_HOUR, HOURS, type CalView,
  addDays, isSameDay, startOfWeek, fmt2, fmtTime, timeToY, durationH, parseFrDate,
  getMonthGrid, getWeekDays, type CalEvent, layoutEvents,
} from '../components/calendar/calendarUtils';
import { EventBlock } from '../components/calendar/EventBlock';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGridView } from '../components/calendar/TimeGridView';
```

- [ ] **Step 2: Remove the local `CalEvent` interface**

Delete this block (search for it — it was previously `app/src/screens/CalendrierGlobal.tsx:65-83`):

```tsx
interface CalEvent {
  id: string;
  title: string;
  eventTypeId: string;
  projectId?: string;
  projectName: string;
  projectColor: string;
  eventTypeColor: string;
  eventTypeLabel: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  meetingUrl?: string;
  participantIds?: string[];
  sectionId?: string;
  sectionLabel?: string;
}
```

Leave the `// ── Types ──...` comment above it and the `resolveEvents` function below it untouched — only the interface body is removed (it now comes from the import).

- [ ] **Step 3: Remove the local `layoutEvents` function**

Delete this block (search for it):

```tsx
function layoutEvents(events: CalEvent[]) {
  const sorted=[...events].sort((a,b)=>a.startDate.getTime()-b.startDate.getTime());
  const cols: CalEvent[][]=[];
  for(const ev of sorted){
    let placed=false;
    for(let c=0;c<cols.length;c++){
      const last=cols[c][cols[c].length-1];
      if(last.endDate.getTime()<=ev.startDate.getTime()){cols[c].push(ev);placed=true;break;}
    }
    if(!placed) cols.push([ev]);
  }
  return sorted.map(ev=>{
    const col=cols.findIndex(c=>c.includes(ev));
    return {...ev,col,numCols:cols.length};
  });
}
```

- [ ] **Step 4: Remove the local `EventBlock` function**

Delete this block (search for it, including its header comment):

```tsx
// ── Event block (used in week/day view) ───────────────────────────────────────

function EventBlock({ ev, col, numCols, onClick }: { ev: CalEvent; col: number; numCols: number; onClick: () => void }) {
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
        {ev.meetingUrl && <SFIcon name="video" size={10} color="white" style={{ flexShrink:0 }} />}
        <p style={{ fontSize:11,fontWeight:700,color:'white',lineHeight:1.2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.title}</p>
      </div>
      {h>30 && <p style={{ fontSize:10,color:'rgba(255,255,255,0.8)',fontFamily:'var(--ff-mono)' }}>{fmtTime(ev.startDate)} – {fmtTime(ev.endDate)}</p>}
      {h>50 && ev.location && <p style={{ fontSize:9,color:'rgba(255,255,255,0.7)',marginTop:2 }}>📍 {ev.location}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Remove the local `MonthView` function**

Delete this block (search for it, including its header comment — it runs from `// ── Month view ──` through the closing `}` right before `// ── Week / Day view ──`):

```tsx
// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({ cur, events, tasks, onDayClick, onEventClick, onCellClick }: {
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
          const dayTasks=tasks.filter(t=>isSameDay(t.date,day));
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

            </div>
          );
        })}
      </div>
    </div>
  );
}
```

- [ ] **Step 6: Remove the local `TimeGridView` function**

Delete this block (search for it, including its header comment — it runs from `// ── Week / Day view ──` through the closing `}` right before `// ── Event detail popover ──`):

```tsx
// ── Week / Day view ───────────────────────────────────────────────────────────

function TimeGridView({ days, events, tasks, onSlotClick, onRangeSelect, onEventClick, onAllDayClick }: {
  days: Date[];
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onSlotClick: (d: Date, h: number) => void;
  onRangeSelect: (d: Date, startH: number, startM: number, endH: number, endM: number) => void;
  onEventClick: (ev: CalEvent) => void;
  onAllDayClick?: (d: Date) => void;
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

  // Snap Y position to nearest 15-min increment
  const yToTimeParts = (y: number): { h: number; m: number } => {
    const totalMins = Math.round(((y / HOUR_H) * 60 + START_HOUR * 60) / 15) * 15;
    const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, totalMins));
    return { h: Math.floor(clamped / 60), m: clamped % 60 };
  };
  const yToHour = (y: number) => yToTimeParts(y).h;

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
          }
          dragRef.current=null;
          setDragSel(null);
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
              <div key={di}
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
                  <EventBlock key={ev.id} ev={ev} col={ev.col} numCols={ev.numCols} onClick={()=>onEventClick(ev)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck and prune unused imports**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "CalendrierGlobal.tsx"`

Expected outcome: zero output, OR only `TS6133 '<name>' is declared but its value is never read` errors pointing at the import statement added in Step 1. If you see `TS6133` errors on the import line, remove exactly the named symbols they list from the import (do not remove anything else), then re-run the command. Repeat until the command produces no output. Do not silence this by adding `// eslint-disable` or similar — the fix is always removing the specific unused name from the import list.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/CalendrierGlobal.tsx
git commit -m "refactor: CalendrierGlobal.tsx uses shared calendar components"
```

---

### Task 7: `ProjetCalendrier.tsx` — switch to the shared modules

**Files:**
- Modify: `app/src/screens/ProjetCalendrier.tsx`

**Interfaces:**
- Consumes: everything produced by Tasks 2-5.

- [ ] **Step 1: Replace the imports and remove the local constants/helpers block**

Replace (currently `app/src/screens/ProjetCalendrier.tsx:1-65`, from the top of the file through the end of `getWeekDays`):

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
import { getEvents, addEvent, updateEvent, deleteEvent, subscribeEvents } from '../data/eventStore';
import { getEventTypes, addEventType, updateEventType, deleteEventType, subscribeEventTypes, type EventType } from '../data/eventTypeStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { MeetingField } from './CalendrierGlobal';

// ── Constants ─────────────────────────────────────────────────────────────────

const TODAY        = new Date();
const DAYS_FR      = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR    = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_SHORT = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
const HOUR_H       = 64;
const START_HOUR   = 0;
const END_HOUR     = 24;
const SCROLL_TO_HOUR = 8;
const HOURS        = Array.from({ length: END_HOUR - START_HOUR }, (_, i) => START_HOUR + i);

type CalView = 'month' | 'week' | 'day';

function addDays(d: Date, n: number): Date { const r=new Date(d); r.setDate(r.getDate()+n); return r; }
function isSameDay(a: Date, b: Date) { return a.getFullYear()===b.getFullYear()&&a.getMonth()===b.getMonth()&&a.getDate()===b.getDate(); }
function startOfWeek(d: Date): Date { const r=new Date(d); const dow=r.getDay(); r.setDate(r.getDate()-(dow===0?6:dow-1)); r.setHours(0,0,0,0); return r; }
function fmt2(n: number) { return String(n).padStart(2,'0'); }
function fmtTime(d: Date) { return `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`; }
function timeToY(d: Date) { return (d.getHours()-START_HOUR+d.getMinutes()/60)*HOUR_H; }
function durationH(s: Date, e: Date) { return ((e.getTime()-s.getTime())/(1000*60*60))*HOUR_H; }

function parseFrDate(s: string): Date | null {
  if (!s || s==='—') return null;
  if (s==="Aujourd'hui") return new Date(TODAY);
  if (s==='Demain') return addDays(TODAY,1);
  if (s==='Hier') return addDays(TODAY,-1);
  const m = s.match(/(\d+)\s+(\w+)(?:\s+(\d{4}))?/);
  if (m) {
    const day=parseInt(m[1]);
    const monthStr=m[2].toLowerCase().slice(0,4);
    const month=MONTHS_SHORT.findIndex(x=>monthStr.startsWith(x.slice(0,3)));
    const year=m[3]?parseInt(m[3]):TODAY.getFullYear();
    if(month!==-1) return new Date(year,month,day);
  }
  return null;
}

function getMonthGrid(date: Date): Date[] {
  const year=date.getFullYear(), month=date.getMonth();
  const first=new Date(year,month,1);
  const last=new Date(year,month+1,0);
  const dow=first.getDay();
  const pad=dow===0?6:dow-1;
  const days: Date[]=[];
  for(let i=-pad;i<last.getDate();i++) days.push(new Date(year,month,1+i));
  while(days.length%7!==0) days.push(new Date(days[days.length-1].getTime()+86400000));
  return days;
}

function getWeekDays(date: Date): Date[] {
  const start=startOfWeek(date);
  return Array.from({length:7},(_,i)=>addDays(start,i));
}
```

with:

```tsx
import React, { useState, useRef, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
import { getEvents, addEvent, updateEvent, deleteEvent, subscribeEvents } from '../data/eventStore';
import { getEventTypes, addEventType, updateEventType, deleteEventType, subscribeEventTypes, type EventType } from '../data/eventTypeStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { MeetingField } from './CalendrierGlobal';
import {
  TODAY, MONTHS_SHORT, HOUR_H, START_HOUR, END_HOUR, SCROLL_TO_HOUR, HOURS, type CalView,
  addDays, isSameDay, startOfWeek, fmt2, fmtTime, timeToY, durationH, parseFrDate,
  getMonthGrid, getWeekDays, type CalEvent, layoutEvents,
} from '../components/calendar/calendarUtils';
import { EventBlock } from '../components/calendar/EventBlock';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGridView } from '../components/calendar/TimeGridView';
```

(Note: `DAYS_FR` and `MONTHS_FR` are removed here because they are not part of the shared extraction — before deleting this block, run `grep -n "DAYS_FR\|MONTHS_FR" app/src/screens/ProjetCalendrier.tsx` first. If either is referenced anywhere else in the file below line 65, add it back as a local constant right after the import block instead of dropping it. If neither is referenced elsewhere, dropping them is correct — they were dead constants.)

- [ ] **Step 2: Remove the local `CalEvent` interface and `resolveProjectEvents`'s dependency check**

Delete this block (search for it):

```tsx
interface CalEvent {
  id: string;
  title: string;
  eventTypeId: string;
  projectId: string;
  projectName: string;
  projectColor: string;
  eventTypeColor: string;
  eventTypeLabel: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  meetingUrl?: string;
  participantIds?: string[];
}
```

Leave the `resolveProjectEvents` function below it untouched (it still works — the imported `CalEvent.projectId` is `string | undefined`, and `resolveProjectEvents` always assigns a real `string` to it, which satisfies the wider optional type).

- [ ] **Step 3: Remove the local `layoutEvents` function**

Delete this block (search for it, including its header comment):

```tsx
// ── Layout helper ─────────────────────────────────────────────────────────────

function layoutEvents(events: CalEvent[]) {
  const sorted=[...events].sort((a,b)=>a.startDate.getTime()-b.startDate.getTime());
  const cols: CalEvent[][]=[];
  for(const ev of sorted){
    let placed=false;
    for(let c=0;c<cols.length;c++){
      const last=cols[c][cols[c].length-1];
      if(last.endDate.getTime()<=ev.startDate.getTime()){cols[c].push(ev);placed=true;break;}
    }
    if(!placed) cols.push([ev]);
  }
  return sorted.map(ev=>({ ...ev, col:cols.findIndex(c=>c.includes(ev)), numCols:cols.length }));
}
```

- [ ] **Step 4: Remove the local `EventBlock` function**

Delete this block (search for it, including its header comment):

```tsx
// ── Event block ───────────────────────────────────────────────────────────────

function EventBlock({ ev, col, numCols, onClick }: { ev: CalEvent; col: number; numCols: number; onClick: () => void }) {
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
        {ev.meetingUrl && <SFIcon name="video" size={10} color="white" style={{ flexShrink:0 }} />}
        <p style={{ fontSize:11,fontWeight:700,color:'white',lineHeight:1.2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.title}</p>
      </div>
      {h>30 && <p style={{ fontSize:10,color:'rgba(255,255,255,0.8)',fontFamily:'var(--ff-mono)' }}>{fmtTime(ev.startDate)} – {fmtTime(ev.endDate)}</p>}
      {h>50 && ev.location && <p style={{ fontSize:9,color:'rgba(255,255,255,0.7)',marginTop:2 }}>📍 {ev.location}</p>}
    </div>
  );
}
```

- [ ] **Step 5: Remove the local `MonthView` function**

Delete this block (search for it, including its header comment — runs from `// ── Month view ──` through the closing `}` right before `// ── Time grid view ──`):

```tsx
// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({ cur, events, tasks, onDayClick, onEventClick, onCellClick }: {
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
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--border)',flexShrink:0 }}>
        {dayNames.map((d,i)=>(
          <div key={i} style={{ padding:'8px 0',textAlign:'center',fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em' }}>{d}</div>
        ))}
      </div>
      <div style={{ flex:1,display:'grid',gridTemplateColumns:'repeat(7,1fr)',gridTemplateRows:`repeat(${days.length/7},1fr)`,overflow:'auto' }}>
        {days.map((day,i)=>{
          const isToday=isSameDay(day,TODAY);
          const isCurMonth=day.getMonth()===cur.getMonth();
          const dayEvents=events.filter(ev=>isSameDay(ev.startDate,day));
          const dayTasks=tasks.filter(t=>isSameDay(t.date,day));
          const visible=dayEvents.slice(0,2);
          return (
            <div key={i} onClick={()=>onCellClick(day)}
              style={{ borderRight:i%7!==6?'1px solid var(--border)':undefined,borderBottom:'1px solid var(--border)',padding:'4px 6px 6px',minHeight:90,cursor:'pointer',background:isToday?'rgba(249,255,0,0.03)':undefined,position:'relative',overflow:'hidden' }}>
              <button onClick={e=>{e.stopPropagation();onDayClick(day);}}
                style={{ width:24,height:24,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',fontFamily:'var(--ff-mono)',fontSize:12,cursor:'pointer',border:'none',background:isToday?'var(--accent)':'transparent',color:isToday?'var(--on-accent)':isCurMonth?'var(--text)':'var(--text-3)',fontWeight:isToday?700:400,marginBottom:4,flexShrink:0 }}
              >{day.getDate()}</button>
              {visible.map(ev=>(
                <div key={ev.id} onClick={e=>{e.stopPropagation();onEventClick(ev);}}
                  style={{ display:'flex',alignItems:'center',gap:4,padding:'2px 6px',borderRadius:5,background:`${ev.eventTypeColor}bb`,borderLeft:`3px solid ${ev.projectColor}`,marginBottom:2,cursor:'pointer' }}
                >
                  <span style={{ fontSize:10,fontWeight:600,color:'white',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1 }}>{ev.title}</span>
                  {!ev.allDay && <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'rgba(255,255,255,0.8)',flexShrink:0 }}>{fmtTime(ev.startDate)}</span>}
                </div>
              ))}
              {dayEvents.length>2 && (
                <div style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',padding:'1px 6px' }}>{t('calendar.moreEvents', { count: dayEvents.length-2 })}</div>
              )}
              {dayTasks.map((t,ti)=>(
                <div key={ti} title={t.title}
                  style={{ display:'flex',alignItems:'center',gap:4,padding:'2px 6px',borderRadius:5,background:`${t.color}44`,borderLeft:`3px solid ${t.color}`,marginBottom:2,overflow:'hidden' }}
                >
                  <span style={{ fontSize:10,fontWeight:600,color:'var(--text)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1 }}>{t.title}</span>
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

- [ ] **Step 6: Remove the local `TimeGridView` function**

Delete this block (search for it, including its header comment — runs from `// ── Time grid view ──` through the closing `}` right before `// ── Create event modal ──`):

```tsx
// ── Time grid view ────────────────────────────────────────────────────────────

function TimeGridView({ days, events, tasks, onSlotClick, onRangeSelect, onEventClick, onAllDayClick }: {
  days: Date[];
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onSlotClick: (d: Date, h: number) => void;
  onRangeSelect: (d: Date, startH: number, startM: number, endH: number, endM: number) => void;
  onEventClick: (ev: CalEvent) => void;
  onAllDayClick?: (d: Date) => void;
}) {
  const { t } = useTranslation();
  const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];
  const scrollRef = useRef<HTMLDivElement>(null);
  const timeGridRef = useRef<HTMLDivElement>(null);
  const dragRef = useRef<{ colIdx: number; day: Date; startY: number; moved: boolean } | null>(null);
  const [dragSel, setDragSel] = useState<{ colIdx: number; top: number; height: number } | null>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = SCROLL_TO_HOUR * HOUR_H;
    }
  }, [days[0]?.toDateString()]);

  const yToTimeParts = (y: number): { h: number; m: number } => {
    const totalMins = Math.round(((y / HOUR_H) * 60 + START_HOUR * 60) / 15) * 15;
    const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, totalMins));
    return { h: Math.floor(clamped / 60), m: clamped % 60 };
  };

  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      <div ref={scrollRef} style={{ flex:1,overflowY:'scroll',overflowX:'hidden' }}
        onMouseMove={e=>{
          if(!dragRef.current) return;
          const gridRect=timeGridRef.current!.getBoundingClientRect();
          const y=e.clientY-gridRect.top;
          const startY=dragRef.current.startY;
          const moved=Math.abs(y-startY)>10;
          dragRef.current.moved=moved;
          if(moved) setDragSel({ colIdx:dragRef.current.colIdx, top:Math.min(startY,y), height:Math.abs(y-startY) });
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
            if(end.h*60+end.m<=start.h*60+start.m) end=yToTimeParts(botY+HOUR_H/4);
            onRangeSelect(day, start.h, start.m, Math.min(end.h,END_HOUR), end.h>=END_HOUR?0:end.m);
          }
          dragRef.current=null; setDragSel(null);
        }}
        onMouseLeave={()=>{ dragRef.current=null; setDragSel(null); }}
      >
        {/* ── Sticky header ── */}
        <div style={{ position:'sticky',top:0,zIndex:10,background:'var(--bg)',borderBottom:'1px solid var(--border)' }}>
          <div style={{ display:'flex' }}>
            <div style={{ width:52,flexShrink:0 }} />
            {days.map((d,i)=>{
              const isToday=isSameDay(d,TODAY);
              const dayIdx=new Date(d).getDay()===0?6:new Date(d).getDay()-1;
              return (
                <div key={i} style={{ flex:1,display:'flex',flexDirection:'column',alignItems:'center',padding:'8px 0 6px',minWidth:0 }}>
                  <span style={{ fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em',marginBottom:3 }}>
                    {dayNames[dayIdx]}
                  </span>
                  <div style={{ width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:isToday?'var(--accent)':'transparent',flexShrink:0 }}>
                    <span style={{ fontFamily:'var(--ff-mono)',fontSize:14,color:isToday?'var(--on-accent)':'var(--text)',fontWeight:isToday?700:400 }}>{d.getDate()}</span>
                  </div>
                </div>
              );
            })}
          </div>
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
          <div style={{ width:52,flexShrink:0 }}>
            {HOURS.map(h=>(
              <div key={h} style={{ height:HOUR_H,display:'flex',alignItems:'flex-start',paddingTop:4,paddingRight:8,justifyContent:'flex-end' }}>
                <span style={{ fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)' }}>{fmt2(h)}:00</span>
              </div>
            ))}
          </div>
          {days.map((d,di)=>{
            const dayEvs=events.filter(ev=>isSameDay(ev.startDate,d)&&!ev.allDay);
            const laid=layoutEvents(dayEvs);
            const isDragging=dragSel?.colIdx===di;
            return (
              <div key={di}
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
                {HOURS.map(h=>(
                  <div key={h} style={{ position:'absolute',top:((h-START_HOUR)*HOUR_H),left:0,right:0,borderTop:'1px solid var(--border)',pointerEvents:'none' }} />
                ))}
                {isDragging && dragSel && (() => {
                  const s=yToTimeParts(dragSel.top);
                  const ee=yToTimeParts(dragSel.top+dragSel.height);
                  return (
                    <div style={{ position:'absolute',top:dragSel.top,height:Math.max(4,dragSel.height),left:4,right:4,background:'rgba(249,255,0,0.12)',border:'1px solid var(--accent)',borderRadius:6,pointerEvents:'none',zIndex:4 }}>
                      <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--accent)',padding:'2px 6px',display:'block' }}>{fmt2(s.h)}:{fmt2(s.m)} — {fmt2(ee.h)}:{fmt2(ee.m)}</span>
                    </div>
                  );
                })()}
                {isSameDay(d,TODAY) && (
                  <div style={{ position:'absolute',top:timeToY(TODAY),left:0,right:0,height:2,background:'var(--danger)',zIndex:6,pointerEvents:'none' }}>
                    <div style={{ position:'absolute',left:-4,top:-4,width:10,height:10,borderRadius:'50%',background:'var(--danger)' }} />
                  </div>
                )}
                {laid.map(ev=>(
                  <EventBlock key={ev.id} ev={ev} col={ev.col} numCols={ev.numCols} onClick={()=>onEventClick(ev)} />
                ))}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 7: Typecheck and prune unused imports**

Same procedure as Task 6 Step 7: run `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep "ProjetCalendrier.tsx"` from `app/`, remove any symbol flagged `TS6133` from the Step 1 import list, repeat until clean.

- [ ] **Step 8: Commit**

```bash
git add app/src/screens/ProjetCalendrier.tsx
git commit -m "refactor: ProjetCalendrier.tsx uses shared calendar components"
```

---

### Task 8: End-to-end manual verification

**Files:** none (verification only).

- [ ] **Step 1: Global calendar, all views**

Via the Preview tool: sign in, navigate to `/calendrier`. Check month view (grid renders, events show on correct days, click a day switches to day view, click "+" or an empty slot opens the create-event modal). Switch to week view: confirm the time grid renders, drag across a few hours to select a range (confirm the create modal opens pre-filled with the dragged time range), click an existing event (confirm the detail popover opens). Compare against a screenshot/description of pre-refactor behavior if unsure — there should be no visible difference except one thing to specifically check: **does the month view now show task chips (small colored bars) on days that have tasks, when it didn't before?** This is the one intentional fix from Task 4 — confirm it looks reasonable (not broken/overlapping), not that it's absent.

- [ ] **Step 2: Project calendar, all views**

Navigate to `/projets/pj1/calendrier` (or any real project id). Repeat the same checks: month view with events and task chips, week view with drag-to-create, event click detail popover. Confirm behavior is unchanged from before this branch.

- [ ] **Step 3: Confirm TravailCalendar is truly gone and nothing broke**

Run (from `app/`): `grep -rn "TravailCalendar" src`
Expected: no output (file deleted, no references).

- [ ] **Step 4: Final typecheck across all touched files**

Run (from `app/`): `npx tsc --noEmit -p tsconfig.app.json 2>&1 | grep -E "calendar/calendarUtils.ts|calendar/EventBlock.tsx|calendar/MonthView.tsx|calendar/TimeGridView.tsx|CalendrierGlobal.tsx|ProjetCalendrier.tsx|TravailCalendar"`
Expected: no output.

- [ ] **Step 5: Lint**

Run (from `app/`): `npm run lint`
Expected: no new errors in the files this plan touched, compared to the pre-existing baseline (this repo has many pre-existing lint errors unrelated to this branch — do not attempt to fix those).
