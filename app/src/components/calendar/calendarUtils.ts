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
