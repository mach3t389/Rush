import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFIcon, SFAvatar, SFButton, SFPill } from '../components/ui';
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';

// ── Constants & helpers ───────────────────────────────────────────────────────

const TODAY        = new Date(2026, 5, 10);
const DAYS_FR      = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR    = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
const MONTHS_SHORT = ['jan','fév','mar','avr','mai','juin','juil','août','sep','oct','nov','déc'];
const HOUR_H       = 64;
const START_HOUR   = 7;
const END_HOUR     = 22;
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

// ── Types ─────────────────────────────────────────────────────────────────────

interface CalEvent {
  id: string;
  title: string;
  type: 'event' | 'task';
  projectId: string;
  projectName: string;
  projectColor: string;
  startDate: Date;
  endDate: Date;
  allDay?: boolean;
  description?: string;
  location?: string;
  participantIds?: string[];
  sectionId?: string;
  sectionLabel?: string;
}

const PROJECT_SECTIONS: Record<string, { id: string; label: string }[]> = {
  pj1: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj2: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj3: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj4: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj5: [{ id:'conception', label:'Conception' }, { id:'production', label:'Production' }, { id:'revisions', label:'Révisions' }, { id:'livraison', label:'Livraison' }],
  pj6: [{ id:'production', label:'Production' }, { id:'livraison', label:'Livraison' }],
};

// ── Initial events mock data ──────────────────────────────────────────────────

const INITIAL_EVENTS: CalEvent[] = [
  { id:'ev1', title:'Réunion équipe — Campagne Été',    type:'event', projectId:'pj1', projectName:'Nova Films',      projectColor:'#3b4f8f', startDate:new Date(2026,5,10,10,0),  endDate:new Date(2026,5,10,11,30), participantIds:['lea','sarah','thomas'] },
  { id:'ev2', title:'Appel client Nova Films',           type:'event', projectId:'pj1', projectName:'Nova Films',      projectColor:'#3b4f8f', startDate:new Date(2026,5,12,14,0),  endDate:new Date(2026,5,12,15,0),  participantIds:['lea','thomas'] },
  { id:'ev3', title:'Tournage J1 — Collection Été',      type:'event', projectId:'pj1', projectName:'Nova Films',      projectColor:'#3b4f8f', startDate:new Date(2026,5,15,9,0),   endDate:new Date(2026,5,15,18,0), location:'Loft Paris 10e', participantIds:['lea','sarah','thomas','julie'] },
  { id:'ev4', title:'Tournage J2 — Portraits',           type:'event', projectId:'pj1', projectName:'Nova Films',      projectColor:'#3b4f8f', startDate:new Date(2026,5,16,8,0),   endDate:new Date(2026,5,16,17,0), location:'Studio Bastille', participantIds:['lea','sarah','thomas','julie','marc'] },
  { id:'ev5', title:'Livraison draft vidéo — Bâtisseurs',type:'event', projectId:'pj2', projectName:'Studio Bleu',     projectColor:'#1a6b4a', startDate:new Date(2026,5,18,10,0),  endDate:new Date(2026,5,18,11,0), participantIds:['julie','marc'] },
  { id:'ev6', title:'Présentation client',               type:'event', projectId:'pj3', projectName:'Maison Leroux',   projectColor:'#2d5a7d', startDate:new Date(2026,5,20,14,0),  endDate:new Date(2026,5,20,16,0), participantIds:['lea','sarah'] },
  { id:'ev7', title:'Réunion post-production',           type:'event', projectId:'pj2', projectName:'Studio Bleu',     projectColor:'#1a6b4a', startDate:new Date(2026,5,22,11,0),  endDate:new Date(2026,5,22,12,30),participantIds:['julie','marc','lea'] },
  { id:'ev8', title:'Shooting Clip Horizon',             type:'event', projectId:'pj4', projectName:'Collectif Ondes', projectColor:'#7d4e57', startDate:new Date(2026,5,24,8,0),   endDate:new Date(2026,5,24,16,0), location:'Rooftop 11e', participantIds:['marc','sarah','lea'] },
  { id:'ev9', title:'Kick-off nouveau projet',           type:'event', projectId:'pj4', projectName:'Collectif Ondes', projectColor:'#7d4e57', startDate:new Date(2026,5,25,11,0),  endDate:new Date(2026,5,25,12,0), participantIds:['lea','marc'] },
  { id:'ev10',title:'Deadline montage final',            type:'event', projectId:'pj1', projectName:'Nova Films',      projectColor:'#3b4f8f', startDate:new Date(2026,5,28,9,0),   endDate:new Date(2026,5,28,18,0), allDay:true, participantIds:['julie'] },
  { id:'ev11',title:'Revue budget Q3',                   type:'event', projectId:'pj1', projectName:'Nova Films',      projectColor:'#3b4f8f', startDate:new Date(2026,5,11,9,0),   endDate:new Date(2026,5,11,9,45), participantIds:['lea','thomas'] },
  { id:'ev12',title:'Session montage v2',                type:'event', projectId:'pj2', projectName:'Studio Bleu',     projectColor:'#1a6b4a', startDate:new Date(2026,5,13,13,0),  endDate:new Date(2026,5,13,17,0), participantIds:['julie'] },
];

// ── Layout helper for overlapping events ──────────────────────────────────────

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

// ── Create event modal ────────────────────────────────────────────────────────

function CreateEventModal({ defaultDate, defaultStartTime, defaultEndTime, onSave, onClose }: {
  defaultDate: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  onSave: (ev: CalEvent) => void;
  onClose: () => void;
}) {
  const [title, setTitle]         = useState('');
  const [description, setDescription] = useState('');
  const [type, setType]           = useState<'event'|'task'>('event');
  const [allDay, setAllDay]       = useState(false);
  const [dateStr, setDateStr]     = useState(`${defaultDate.getFullYear()}-${fmt2(defaultDate.getMonth()+1)}-${fmt2(defaultDate.getDate())}`);
  const [startT, setStartT]       = useState(defaultStartTime ?? `${fmt2(defaultDate.getHours()||9)}:00`);
  const [endT, setEndT]           = useState(defaultEndTime ?? `${fmt2((defaultDate.getHours()||9)+1)}:00`);
  const [projectId, setProjectId] = useState(PROJECTS[0].id);
  const [sectionId, setSectionId] = useState<string>('');
  const [location, setLocation]   = useState('');
  const [participants, setParticipants] = useState<string[]>(['lea']);
  const [sectionsExpanded, setSectionsExpanded] = useState(false);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);

  const SECTION_THRESHOLD     = 4;
  const PARTICIPANT_THRESHOLD = 4;

  const sections = PROJECT_SECTIONS[projectId] ?? [];

  const save = () => {
    if(!title.trim()) return;
    const [y,mo,d]=dateStr.split('-').map(Number);
    const [sh,sm]=startT.split(':').map(Number);
    const [eh,em]=endT.split(':').map(Number);
    const p=PROJECTS.find(x=>x.id===projectId)!;
    const start=new Date(y,mo-1,d,sh,sm);
    const end=allDay?new Date(y,mo-1,d,23,59):new Date(y,mo-1,d,eh,em);
    const sec = sections.find(s => s.id === sectionId);
    onSave({ id:`ev${Date.now()}`, title:title.trim(), description:description.trim()||undefined, type, projectId:p.id, projectName:p.clientName, projectColor:p.clientColor, startDate:start, endDate:end, allDay, location:location||undefined, participantIds:participants, sectionId:sec?.id, sectionLabel:sec?.label });
    onClose();
  };

  const togglePart=(id:string)=>setParticipants(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}>
      <div style={{ background:'var(--surface)',borderRadius:16,padding:28,width:460,border:'1px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',maxHeight:'90vh',overflow:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:700 }}>Nouvel événement</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',display:'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        {/* Type */}
        <div style={{ display:'flex',gap:6,marginBottom:16 }}>
          {(['event','task'] as const).map(t=>(
            <button key={t} onClick={()=>setType(t)} style={{ flex:1,padding:'8px',borderRadius:9,border:`1px solid ${type===t?'var(--accent)':'var(--border)'}`,background:type===t?'rgba(249,255,0,0.06)':'transparent',color:type===t?'var(--accent)':'var(--text-2)',cursor:'pointer',fontSize:12,fontWeight:500 }}>
              {t==='event'?'📅 Événement':'✅ Tâche'}
            </button>
          ))}
        </div>

        {/* Title */}
        <input value={title} onChange={e=>setTitle(e.target.value)} autoFocus placeholder="Titre…"
          style={{ width:'100%',padding:'10px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:14,fontWeight:600,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8 }}
        />

        {/* Description */}
        <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder="Description (optionnel)…" rows={2}
          style={{ width:'100%',padding:'8px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:12,resize:'vertical',lineHeight:1.5 }}
        />

        {/* All day */}
        <label style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer' }}>
          <div onClick={()=>setAllDay(s=>!s)} style={{ width:32,height:18,borderRadius:9,background:allDay?'var(--accent)':'var(--surface-3)',border:`1px solid ${allDay?'var(--accent)':'var(--border)'}`,position:'relative',transition:'background 0.15s',cursor:'pointer' }}>
            <div style={{ position:'absolute',top:2,left:allDay?14:2,width:12,height:12,borderRadius:'50%',background:allDay?'var(--on-accent)':'var(--text-3)',transition:'left 0.15s' }} />
          </div>
          <span style={{ fontSize:12,color:'var(--text-2)' }}>Toute la journée</span>
        </label>

        {/* Date + times */}
        <div style={{ display:'flex',gap:8,marginBottom:12 }}>
          <input type="date" value={dateStr} onChange={e=>setDateStr(e.target.value)}
            style={{ flex:2,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark' }}
          />
          {!allDay && <>
            <input type="time" value={startT} onChange={e=>setStartT(e.target.value)}
              style={{ flex:1,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-mono)',colorScheme:'dark' }}
            />
            <span style={{ display:'flex',alignItems:'center',color:'var(--text-3)',fontSize:12 }}>→</span>
            <input type="time" value={endT} onChange={e=>setEndT(e.target.value)}
              style={{ flex:1,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-mono)',colorScheme:'dark' }}
            />
          </>}
        </div>

        {/* Project */}
        <select value={projectId} onChange={e=>{ setProjectId(e.target.value); setSectionId(''); }}
          style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8,boxSizing:'border-box' }}
        >
          {PROJECTS.map(p=><option key={p.id} value={p.id}>{p.name} — {p.clientName}</option>)}
        </select>

        {/* Section */}
        {sections.length > 0 && (
          <div style={{ marginBottom:12 }}>
            <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:6 }}>
              <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>Section du projet (optionnel)</p>
              {sections.length > SECTION_THRESHOLD && (
                <button onClick={()=>setSectionsExpanded(v=>!v)} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:10,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0 }}>
                  {sectionsExpanded ? 'Réduire' : `+${sections.length - SECTION_THRESHOLD} autres`}
                </button>
              )}
            </div>
            <div style={{ display:'flex',gap:5,flexWrap:'wrap' }}>
              <button onClick={()=>setSectionId('')}
                style={{ padding:'4px 10px',borderRadius:7,border:`1px solid ${sectionId===''?'var(--border-2)':'var(--border)'}`,background:sectionId===''?'var(--surface-3)':'transparent',color:sectionId===''?'var(--text)':'var(--text-3)',fontSize:11,cursor:'pointer',fontFamily:'var(--ff-text)' }}>
                Aucune
              </button>
              {(sectionsExpanded ? sections : sections.slice(0, SECTION_THRESHOLD)).map(s=>(
                <button key={s.id} onClick={()=>setSectionId(s.id)}
                  style={{ padding:'4px 10px',borderRadius:7,border:`1px solid ${sectionId===s.id?'var(--accent)':'var(--border)'}`,background:sectionId===s.id?'rgba(249,255,0,0.07)':'transparent',color:sectionId===s.id?'var(--accent)':'var(--text-3)',fontSize:11,cursor:'pointer',fontFamily:'var(--ff-text)' }}>
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Location (event only) */}
        {type==='event' && (
          <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Lieu (optionnel)"
            style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:12,boxSizing:'border-box' }}
          />
        )}

        {/* Participants */}
        {(() => {
          const team = Object.values(USERS).filter(u=>u.role!=='Cliente');
          const visible = participantsExpanded ? team : team.slice(0, PARTICIPANT_THRESHOLD);
          const hidden = team.length - PARTICIPANT_THRESHOLD;
          return (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>Participants</p>
                {team.length > PARTICIPANT_THRESHOLD && (
                  <button onClick={()=>setParticipantsExpanded(v=>!v)} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:10,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0 }}>
                    {participantsExpanded ? 'Réduire' : `+${hidden} autres`}
                  </button>
                )}
              </div>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {visible.map(u=>(
                  <button key={u.id} onClick={()=>togglePart(u.id)}
                    style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 10px',borderRadius:8,border:`1px solid ${participants.includes(u.id)?'var(--accent)':'var(--border)'}`,background:participants.includes(u.id)?'rgba(249,255,0,0.06)':'transparent',cursor:'pointer',color:participants.includes(u.id)?'var(--accent)':'var(--text-2)' }}
                  >
                    <SFAvatar initials={u.initials} bg={u.avatarColor} size={20} />
                    <span style={{ fontSize:11 }}>{u.name.split(' ')[0]}</span>
                  </button>
                ))}
              </div>
            </div>
          );
        })()}

        <div style={{ display:'flex',gap:8,justifyContent:'flex-end' }}>
          <SFButton variant="ghost" onClick={onClose}>Annuler</SFButton>
          <SFButton variant="primary" onClick={save}>Créer</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Mini calendar (sidebar) ───────────────────────────────────────────────────

function MiniCalendar({ cur, onSelect }: { cur: Date; onSelect: (d: Date) => void }) {
  const [mini, setMini] = useState(new Date(TODAY));
  const days = getMonthGrid(mini);
  const prevM = () => setMini(d=>new Date(d.getFullYear(),d.getMonth()-1,1));
  const nextM = () => setMini(d=>new Date(d.getFullYear(),d.getMonth()+1,1));

  return (
    <div>
      <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
        <button onClick={prevM} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',padding:'2px 4px',display:'flex' }}><SFIcon name="chevron-left" size={13} /></button>
        <span style={{ fontFamily:'var(--ff-mono)',fontSize:11,color:'var(--text-2)',fontWeight:600 }}>{MONTHS_FR[mini.getMonth()].slice(0,3)} {mini.getFullYear()}</span>
        <button onClick={nextM} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',padding:'2px 4px',display:'flex' }}><SFIcon name="chevron-right" size={13} /></button>
      </div>
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:1,marginBottom:4 }}>
        {['L','M','M','J','V','S','D'].map((d,i)=>(
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

// ── Event block (used in week/day view) ───────────────────────────────────────

function EventBlock({ ev, col, numCols, onClick }: { ev: CalEvent; col: number; numCols: number; onClick: () => void }) {
  const [hov, setHov] = useState(false);
  const top = timeToY(ev.startDate);
  const h   = Math.max(20, durationH(ev.startDate, ev.endDate));
  const w   = `calc((100% - 8px) / ${numCols})`;
  const left= `calc(4px + ${col} * (100% - 8px) / ${numCols})`;

  return (
    <div onClick={onClick} onMouseDown={e=>e.stopPropagation()} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ position:'absolute', top, height:h, width:w, left, borderRadius:6, padding:'4px 7px', overflow:'hidden', cursor:'pointer', zIndex:5,
        background:`${ev.projectColor}cc`, border:`1px solid ${ev.projectColor}`, boxShadow:hov?`0 2px 12px ${ev.projectColor}66`:undefined, transition:'box-shadow 0.15s',
      }}
    >
      <p style={{ fontSize:11,fontWeight:700,color:'white',lineHeight:1.2,marginBottom:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.title}</p>
      {h>30 && <p style={{ fontSize:10,color:'rgba(255,255,255,0.8)',fontFamily:'var(--ff-mono)' }}>{fmtTime(ev.startDate)} – {fmtTime(ev.endDate)}</p>}
      {h>50 && ev.location && <p style={{ fontSize:9,color:'rgba(255,255,255,0.7)',marginTop:2 }}>📍 {ev.location}</p>}
    </div>
  );
}

// ── Month view ────────────────────────────────────────────────────────────────

function MonthView({ cur, events, tasks, onDayClick, onEventClick, onCellClick }: {
  cur: Date;
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onDayClick: (d: Date) => void;
  onEventClick: (ev: CalEvent) => void;
  onCellClick: (d: Date) => void;
}) {
  const days = getMonthGrid(cur);

  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {/* Day headers */}
      <div style={{ display:'grid',gridTemplateColumns:'repeat(7,1fr)',borderBottom:'1px solid var(--border)',flexShrink:0 }}>
        {DAYS_FR.map(d=>(
          <div key={d} style={{ padding:'8px 0',textAlign:'center',fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em' }}>{d}</div>
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
                  style={{ display:'flex',alignItems:'center',gap:4,padding:'2px 6px',borderRadius:5,background:`${ev.projectColor}bb`,marginBottom:2,cursor:'pointer' }}
                >
                  <span style={{ fontSize:10,fontWeight:600,color:'white',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',flex:1 }}>{ev.title}</span>
                  {!ev.allDay && <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'rgba(255,255,255,0.8)',flexShrink:0 }}>{fmtTime(ev.startDate)}</span>}
                </div>
              ))}

              {showMore && (
                <div style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',padding:'1px 6px' }}>+{dayEvents.length-2} autres</div>
              )}

              {/* Task dots */}
              {dayTasks.length>0 && (
                <div style={{ position:'absolute',bottom:4,left:6,display:'flex',gap:3 }}>
                  {dayTasks.slice(0,5).map((t,ti)=>(
                    <div key={ti} title={t.title} style={{ width:6,height:6,borderRadius:'50%',background:t.color,flexShrink:0 }} />
                  ))}
                  {dayTasks.length>5 && <span style={{ fontFamily:'var(--ff-mono)',fontSize:8,color:'var(--text-3)' }}>+{dayTasks.length-5}</span>}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Week / Day view ───────────────────────────────────────────────────────────

function TimeGridView({ days, events, tasks, onSlotClick, onRangeSelect, onEventClick }: {
  days: Date[];
  events: CalEvent[];
  tasks: { date: Date; title: string; color: string }[];
  onSlotClick: (d: Date, h: number) => void;
  onRangeSelect: (d: Date, startH: number, startM: number, endH: number, endM: number) => void;
  onEventClick: (ev: CalEvent) => void;
}) {
  const isDay=days.length===1;
  const scrollRef=useRef<HTMLDivElement>(null);

  // Drag-select state
  const dragRef = useRef<{ colIdx: number; day: Date; startY: number; moved: boolean } | null>(null);
  const [dragSel, setDragSel] = useState<{ colIdx: number; top: number; height: number } | null>(null);

  // Snap Y position to nearest 15-min increment
  const yToTimeParts = (y: number): { h: number; m: number } => {
    const totalMins = Math.round(((y / HOUR_H) * 60 + START_HOUR * 60) / 15) * 15;
    const clamped = Math.max(START_HOUR * 60, Math.min(END_HOUR * 60, totalMins));
    return { h: Math.floor(clamped / 60), m: clamped % 60 };
  };
  const yToHour = (y: number) => yToTimeParts(y).h;

  return (
    <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {/* Day column headers */}
      <div style={{ display:'flex',flexShrink:0,borderBottom:'1px solid var(--border)' }}>
        <div style={{ width:52,flexShrink:0 }} />
        {days.map((d,i)=>{
          const isToday=isSameDay(d,TODAY);
          const dayTasks=tasks.filter(t=>isSameDay(t.date,d));
          return (
            <div key={i} style={{ flex:1,borderLeft:i>0?'1px solid var(--border)':undefined,padding:'8px 6px 6px',minWidth:0 }}>
              <div style={{ display:'flex',alignItems:'center',gap:6,marginBottom:4 }}>
                <span style={{ fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase' }}>{DAYS_FR[i===0&&!isDay?0:new Date(d).getDay()===0?6:new Date(d).getDay()-1]}</span>
                <div style={{ width:28,height:28,borderRadius:'50%',display:'flex',alignItems:'center',justifyContent:'center',background:isToday?'var(--accent)':'transparent',flexShrink:0 }}>
                  <span style={{ fontFamily:'var(--ff-mono)',fontSize:14,color:isToday?'var(--on-accent)':'var(--text)',fontWeight:isToday?700:400 }}>{d.getDate()}</span>
                </div>
              </div>
              {/* All-day task chips */}
              <div style={{ display:'flex',flexWrap:'wrap',gap:3 }}>
                {dayTasks.slice(0,3).map((t,ti)=>(
                  <div key={ti} title={t.title} style={{ maxWidth:'100%',padding:'1px 6px',borderRadius:4,background:`${t.color}33`,border:`1px solid ${t.color}66`,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>
                    <span style={{ fontSize:9,color:t.color,fontFamily:'var(--ff-mono)',fontWeight:600 }}>{t.title.slice(0,20)}</span>
                  </div>
                ))}
                {dayTasks.length>3 && <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)' }}>+{dayTasks.length-3}</span>}
              </div>
            </div>
          );
        })}
      </div>

      {/* Scrollable time grid */}
      <div ref={scrollRef} style={{ flex:1,overflow:'auto' }}
        onMouseMove={e=>{
          if(!dragRef.current) return;
          const scrollTop=scrollRef.current?.scrollTop??0;
          const containerRect=scrollRef.current!.getBoundingClientRect();
          const y=e.clientY-containerRect.top+scrollTop;
          const startY=dragRef.current.startY;
          const moved=Math.abs(y-startY)>10;
          dragRef.current.moved=moved;
          if(moved){
            setDragSel({ colIdx:dragRef.current.colIdx, top:Math.min(startY,y), height:Math.abs(y-startY) });
          }
        }}
        onMouseUp={e=>{
          if(!dragRef.current) return;
          const scrollTop=scrollRef.current?.scrollTop??0;
          const containerRect=scrollRef.current!.getBoundingClientRect();
          const y=e.clientY-containerRect.top+scrollTop;
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
        <div style={{ display:'flex',minHeight:`${HOURS.length*HOUR_H}px`,position:'relative' }}>
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
                  const scrollTop=scrollRef.current?.scrollTop??0;
                  const containerRect=scrollRef.current!.getBoundingClientRect();
                  const y=e.clientY-containerRect.top+scrollTop;
                  dragRef.current={ colIdx:di, day:d, startY:y, moved:false };
                  e.preventDefault();
                }}
                onClick={e=>{
                  if(dragRef.current?.moved) return;
                  const rect=(e.currentTarget as HTMLDivElement).getBoundingClientRect();
                  const y=e.clientY-rect.top;
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

// ── Event detail popover ──────────────────────────────────────────────────────

function EventDetail({ ev, onClose, onDelete }: { ev: CalEvent; onClose: () => void; onDelete: () => void }) {
  const navigate = useNavigate();
  return (
    <div style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.4)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:150 }} onClick={onClose}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)',borderRadius:14,padding:24,width:360,border:'1px solid var(--border)',boxShadow:'0 16px 48px rgba(0,0,0,0.5)' }}>
        {/* Color bar */}
        <div style={{ height:4,borderRadius:2,background:ev.projectColor,marginBottom:16 }} />
        <div style={{ display:'flex',justifyContent:'space-between',marginBottom:4 }}>
          <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:ev.projectColor,textTransform:'uppercase',letterSpacing:'0.06em' }}>{ev.projectName}</span>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',display:'flex' }}><SFIcon name="x" size={14} /></button>
        </div>
        <h3 style={{ fontSize:15,fontWeight:700,marginBottom: ev.description ? 6 : 12 }}>{ev.title}</h3>
        {ev.description && (
          <p style={{ fontSize:12,color:'var(--text-2)',lineHeight:1.6,marginBottom:12 }}>{ev.description}</p>
        )}
        <div style={{ display:'flex',flexDirection:'column',gap:8,marginBottom:16 }}>
          <div style={{ display:'flex',alignItems:'center',gap:8 }}>
            <SFIcon name="calendar" size={13} color="var(--text-3)" />
            <span style={{ fontSize:12,color:'var(--text-2)' }}>
              {DAYS_FR[(ev.startDate.getDay()+6)%7]} {ev.startDate.getDate()} {MONTHS_FR[ev.startDate.getMonth()].toLowerCase()}
              {!ev.allDay && ` · ${fmtTime(ev.startDate)} – ${fmtTime(ev.endDate)}`}
              {ev.allDay && ' · Toute la journée'}
            </span>
          </div>
          {ev.sectionLabel && (
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <SFIcon name="layers" size={13} color="var(--text-3)" />
              <span style={{ fontSize:12,color:'var(--text-2)' }}>Section : {ev.sectionLabel}</span>
            </div>
          )}
          {ev.location && (
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <SFIcon name="map-pin" size={13} color="var(--text-3)" />
              <span style={{ fontSize:12,color:'var(--text-2)' }}>{ev.location}</span>
            </div>
          )}
          {ev.participantIds && ev.participantIds.length>0 && (
            <div style={{ display:'flex',alignItems:'center',gap:8 }}>
              <SFIcon name="users" size={13} color="var(--text-3)" />
              <div style={{ display:'flex',gap:4 }}>
                {ev.participantIds.map(id=>{
                  const u=USERS[id];
                  return u?<SFAvatar key={id} initials={u.initials} bg={u.avatarColor} size={22} />:null;
                })}
              </div>
            </div>
          )}
        </div>
        <div style={{ display:'flex',gap:6 }}>
          <button onClick={()=>{navigate(`/projets/${ev.projectId}`);onClose();}} style={{ flex:1,padding:'7px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--text-2)',cursor:'pointer',fontSize:11,fontFamily:'var(--ff-text)' }}>
            Voir le projet
          </button>
          <button onClick={onDelete} style={{ padding:'7px 10px',borderRadius:8,border:'1px solid var(--border)',background:'transparent',color:'var(--danger)',cursor:'pointer',display:'flex',alignItems:'center' }}>
            <SFIcon name="trash-2" size={13} />
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CalendrierGlobal() {
  const [view, setView]           = useState<CalView>('week');
  const [cur, setCur]             = useState(new Date(TODAY));
  const [events, setEvents]       = useState<CalEvent[]>(INITIAL_EVENTS);
  const [showCreate, setShowCreate] = useState(false);
  const [createDate, setCreateDate] = useState(new Date(TODAY));
  const [createStartTime, setCreateStartTime] = useState('09:00');
  const [createEndTime, setCreateEndTime] = useState('10:00');
  const [selectedEvent, setSelectedEvent] = useState<CalEvent|null>(null);
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());

  // Build task chips from MY_TASKS
  const taskChips = MY_TASKS.flatMap(t=>{
    const d=parseFrDate(t.dueDate);
    return d&&!t.checked?[{date:d,title:t.title,color:t.projectColor}]:[];
  });

  // Filter events by selected projects
  const visibleEvents = events.filter(ev=>!hiddenProjects.has(ev.projectId));

  // Navigation
  const prev = () => {
    if(view==='month') setCur(d=>new Date(d.getFullYear(),d.getMonth()-1,1));
    else if(view==='week') setCur(d=>addDays(d,-7));
    else setCur(d=>addDays(d,-1));
  };
  const next = () => {
    if(view==='month') setCur(d=>new Date(d.getFullYear(),d.getMonth()+1,1));
    else if(view==='week') setCur(d=>addDays(d,7));
    else setCur(d=>addDays(d,1));
  };

  const toggleProject = (id: string) => setHiddenProjects(s=>{
    const n=new Set(s);
    if(n.has(id)) n.delete(id); else n.add(id);
    return n;
  });

  const handleSlotClick = (d: Date, h: number) => {
    setCreateDate(new Date(d));
    setCreateStartTime(`${fmt2(h)}:00`);
    setCreateEndTime(`${fmt2(Math.min(h+1,END_HOUR))}:00`);
    setShowCreate(true);
  };

  const handleRangeSelect = (d: Date, startH: number, startM: number, endH: number, endM: number) => {
    setCreateDate(new Date(d));
    setCreateStartTime(`${fmt2(startH)}:${fmt2(startM)}`);
    setCreateEndTime(`${fmt2(endH)}:${fmt2(endM)}`);
    setShowCreate(true);
  };
  const handleCellClick = (d: Date) => { setCreateDate(d); setShowCreate(true); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).matches('input,textarea,[contenteditable]')) return;
      if (e.key === 'm') setView('month');
      if (e.key === 'w') setView('week');
      if (e.key === 'j' || e.key === 'd') setView('day');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);

  // Title
  const title = view==='month'
    ? `${MONTHS_FR[cur.getMonth()]} ${cur.getFullYear()}`
    : view==='week'
    ? `${MONTHS_FR[startOfWeek(cur).getMonth()]} ${startOfWeek(cur).getFullYear()}`
    : `${DAYS_FR[(cur.getDay()+6)%7]} ${cur.getDate()} ${MONTHS_FR[cur.getMonth()]}`;

  // Upcoming events
  const upcoming = [...events]
    .filter(ev=>ev.startDate>=TODAY)
    .sort((a,b)=>a.startDate.getTime()-b.startDate.getTime())
    .slice(0,6);

  return (
    <div style={{ height:'100%',display:'flex',overflow:'hidden' }}>
      {/* Sidebar */}
      <div style={{ width:240,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'auto',padding:16,gap:20 }}>
        <SFButton variant="primary" icon="plus" onClick={()=>{setCreateDate(new Date(TODAY));setShowCreate(true);}}>Nouvel événement</SFButton>

        <MiniCalendar cur={cur} onSelect={d=>{setCur(d);setView('day');}} />

        {/* Project filters */}
        <div>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Mes projets</p>
          <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
            {PROJECTS.filter(p=>p.status!=='neutral').map(p=>(
              <button key={p.id} onClick={()=>toggleProject(p.id)}
                style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:8,border:'none',background:'transparent',cursor:'pointer',textAlign:'left',opacity:hiddenProjects.has(p.id)?0.4:1,transition:'opacity 0.15s' }}
              >
                <div style={{ width:10,height:10,borderRadius:'50%',background:p.clientColor,flexShrink:0 }} />
                <span style={{ fontSize:12,color:'var(--text-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</span>
                {hiddenProjects.has(p.id) && <SFIcon name="eye-off" size={11} color="var(--text-3)" />}
              </button>
            ))}
          </div>
        </div>

        {/* Upcoming */}
        <div>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Prochains événements</p>
          <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
            {upcoming.map(ev=>(
              <div key={ev.id} onClick={()=>setSelectedEvent(ev)} style={{ display:'flex',gap:8,cursor:'pointer',padding:'6px 8px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)' }}
                onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--border-2)')}
                onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}
              >
                <div style={{ width:3,borderRadius:2,background:ev.projectColor,flexShrink:0 }} />
                <div style={{ minWidth:0 }}>
                  <p style={{ fontSize:11,fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{ev.title}</p>
                  <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',marginTop:1 }}>
                    {ev.startDate.getDate()} {MONTHS_FR[ev.startDate.getMonth()].slice(0,3).toLowerCase()}
                    {!ev.allDay && ` · ${fmtTime(ev.startDate)}`}
                  </p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Main */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0 }}>
        {/* Topbar */}
        <div style={{ padding:'10px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
          {/* Navigation */}
          <div style={{ display:'flex',alignItems:'center',gap:6 }}>
            <button onClick={()=>setCur(new Date(TODAY))} style={{ padding:'5px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text-2)',cursor:'pointer',fontFamily:'var(--ff-mono)',fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em' }}>
              Aujourd'hui
            </button>
            <button onClick={prev} style={{ padding:'5px 7px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text-2)',cursor:'pointer',display:'flex' }}>
              <SFIcon name="chevron-left" size={14} />
            </button>
            <button onClick={next} style={{ padding:'5px 7px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text-2)',cursor:'pointer',display:'flex' }}>
              <SFIcon name="chevron-right" size={14} />
            </button>
          </div>

          <h2 style={{ fontSize:16,fontWeight:700,flex:1 }}>{title}</h2>

          {/* View switcher */}
          <div style={{ display:'flex',borderRadius:9,border:'1px solid var(--border)',overflow:'hidden' }}>
            {(['month','week','day'] as CalView[]).map((v,i)=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'6px 14px',border:'none',borderLeft:i>0?'1px solid var(--border)':undefined,background:view===v?'var(--surface-3)':'var(--surface-2)',color:view===v?'var(--text)':'var(--text-3)',cursor:'pointer',fontFamily:'var(--ff-mono)',fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em',transition:'background 0.12s' }}
              >
                {v==='month'?'Mois':v==='week'?'Semaine':'Jour'}
              </button>
            ))}
          </div>
        </div>

        {/* Calendar body */}
        {view==='month' && (
          <MonthView
            cur={cur} events={visibleEvents} tasks={taskChips}
            onDayClick={d=>{setCur(d);setView('day');}}
            onEventClick={setSelectedEvent}
            onCellClick={handleCellClick}
          />
        )}
        {view==='week' && (
          <TimeGridView
            days={getWeekDays(cur)} events={visibleEvents} tasks={taskChips}
            onSlotClick={handleSlotClick} onRangeSelect={handleRangeSelect} onEventClick={setSelectedEvent}
          />
        )}
        {view==='day' && (
          <TimeGridView
            days={[cur]} events={visibleEvents} tasks={taskChips}
            onSlotClick={handleSlotClick} onRangeSelect={handleRangeSelect} onEventClick={setSelectedEvent}
          />
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateEventModal
          defaultDate={new Date(createDate.getFullYear(),createDate.getMonth(),createDate.getDate())}
          defaultStartTime={createStartTime}
          defaultEndTime={createEndTime}
          onSave={ev=>setEvents(p=>[...p,ev])}
          onClose={()=>setShowCreate(false)}
        />
      )}
      {selectedEvent && (
        <EventDetail
          ev={selectedEvent}
          onClose={()=>setSelectedEvent(null)}
          onDelete={()=>{setEvents(p=>p.filter(e=>e.id!==selectedEvent.id));setSelectedEvent(null);}}
        />
      )}
    </div>
  );
}
