import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { SFIcon, SFAvatar, SFButton, SFPill } from '../components/ui';
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
import { getEvents, addEvent, updateEvent, deleteEvent, subscribeEvents } from '../data/eventStore';
import { getEventTypes, addEventType, updateEventType, deleteEventType, subscribeEventTypes, type EventType } from '../data/eventTypeStore';
import { usePersistedState } from '../hooks/usePersistedState';

// ── Constants & helpers ───────────────────────────────────────────────────────

const TODAY        = new Date();
const DAYS_FR      = ['Lun', 'Mar', 'Mer', 'Jeu', 'Ven', 'Sam', 'Dim'];
const MONTHS_FR    = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];
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

// ── Types ─────────────────────────────────────────────────────────────────────

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
  participantIds?: string[];
  sectionId?: string;
  sectionLabel?: string;
}

function resolveEvents(eventTypes: EventType[]): CalEvent[] {
  const typeMap = Object.fromEntries(eventTypes.map(t => [t.id, t]));
  return getEvents().map(e => {
    const p = e.projectId ? PROJECTS.find(x => x.id === e.projectId) : undefined;
    const et = typeMap[e.eventTypeId] ?? { color: '#888', label: 'Autre', icon: 'circle' };
    const parseDate = (s: string) => s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
    return {
      id: e.id,
      title: e.title,
      eventTypeId: e.eventTypeId,
      projectId: e.projectId || '',
      projectName: p?.clientName ?? '',
      projectColor: p?.clientColor ?? '#555',
      eventTypeColor: et.color,
      eventTypeLabel: et.label,
      startDate: parseDate(e.start),
      endDate: parseDate(e.end),
      allDay: e.allDay,
      description: e.description,
      location: e.location,
      participantIds: e.memberIds,
    };
  });
}

const PROJECT_SECTIONS: Record<string, { id: string; label: string }[]> = {
  pj1: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj2: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj3: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj4: [{ id:'preproduction', label:'Préproduction' }, { id:'production', label:'Production' }, { id:'postproduction', label:'Postproduction' }, { id:'livraison', label:'Livraison' }],
  pj5: [{ id:'conception', label:'Conception' }, { id:'production', label:'Production' }, { id:'revisions', label:'Révisions' }, { id:'livraison', label:'Livraison' }],
  pj6: [{ id:'production', label:'Production' }, { id:'livraison', label:'Livraison' }],
};

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

function CreateEventModal({ defaultDate, defaultStartTime, defaultEndTime, defaultAllDay, onClose }: {
  defaultDate: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultAllDay?: boolean;
  onClose: () => void;
}) {
  const [title, setTitle]         = useState('');
  const [description, setDescription] = useState('');
  const [eventTypeId, setEventTypeId] = useState('reunion');
  const [allDay, setAllDay]       = useState(defaultAllDay ?? false);
  const [dateStr, setDateStr]     = useState(`${defaultDate.getFullYear()}-${fmt2(defaultDate.getMonth()+1)}-${fmt2(defaultDate.getDate())}`);
  const [startT, setStartT]       = useState(defaultStartTime ?? `${fmt2(defaultDate.getHours()||9)}:00`);
  const [endT, setEndT]           = useState(defaultEndTime ?? `${fmt2((defaultDate.getHours()||9)+1)}:00`);
  const [projectId, setProjectId] = useState('');
  const [location, setLocation]   = useState('');
  const [participants, setParticipants] = useState<string[]>(['lea']);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [localEventTypes, setLocalEventTypes] = useState<EventType[]>(getEventTypes);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#3b82f6');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');

  const PARTICIPANT_THRESHOLD = 4;

  const startEdit = (t: EventType) => {
    setEditingTypeId(t.id); setEditLabel(t.label); setEditColor(t.color);
    setEventTypeId(t.id);
    setShowNewType(false);
  };
  const saveEdit = () => {
    if (!editLabel.trim() || !editingTypeId) return;
    updateEventType(editingTypeId, { label: editLabel.trim(), color: editColor });
    setEditingTypeId(null);
  };
  const removeType = (id: string) => {
    if (eventTypeId === id) setEventTypeId(localEventTypes.find(t => t.id !== id)?.id ?? 'autre');
    deleteEventType(id);
    setEditingTypeId(null);
  };

  const save = () => {
    if(!title.trim()) return;
    const [y,mo,d]=dateStr.split('-').map(Number);
    const [sh,sm]=startT.split(':').map(Number);
    const [eh,em]=endT.split(':').map(Number);
    const start=new Date(y,mo-1,d,sh,sm);
    const end=allDay?new Date(y,mo-1,d,23,59):new Date(y,mo-1,d,eh,em);
    addEvent({
      title: title.trim(),
      description: description.trim() || undefined,
      eventTypeId,
      projectId,
      start: allDay ? dateStr : start.toISOString(),
      end: allDay ? dateStr : end.toISOString(),
      allDay,
      location: location || undefined,
      memberIds: participants,
    });
    onClose();
  };

  const togglePart=(id:string)=>setParticipants(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  useEffect(() => subscribeEventTypes(() => setLocalEventTypes(getEventTypes())), []);

  const addNewType = () => {
    if (!newTypeLabel.trim()) return;
    const newType = addEventType({ label: newTypeLabel.trim(), color: newTypeColor, icon: 'circle' });
    setEventTypeId(newType.id);
    setNewTypeLabel('');
    setShowNewType(false);
  };

  const selectedType = localEventTypes.find(t => t.id === eventTypeId) ?? localEventTypes[0];

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)',borderRadius:16,padding:28,width:460,border:'1px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',maxHeight:'90vh',overflow:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:700 }}>Nouvel événement</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',display:'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        {/* Event type selector */}
        <div style={{ marginBottom:16 }}>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Type d'événement</p>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap',alignItems:'center' }}>
            {localEventTypes.map(t=>(
              <div key={t.id} style={{ position:'relative',display:'inline-flex' }}
                onMouseEnter={e=>(e.currentTarget.querySelector<HTMLElement>('.et-edit')!.style.opacity='1')}
                onMouseLeave={e=>(e.currentTarget.querySelector<HTMLElement>('.et-edit')!.style.opacity='0')}
              >
                <button onClick={()=>{ setEventTypeId(t.id); setEditingTypeId(null); }}
                  style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 10px',paddingRight:editingTypeId===t.id?'10px':'24px',borderRadius:8,border:`1px solid ${eventTypeId===t.id?t.color:'var(--border)'}`,background:eventTypeId===t.id?`${t.color}22`:'transparent',color:eventTypeId===t.id?t.color:'var(--text-2)',cursor:'pointer',fontSize:11,fontWeight:500,transition:'all 0.12s' }}
                >
                  <div style={{ width:8,height:8,borderRadius:'50%',background:t.color,flexShrink:0 }} />
                  {t.label}
                </button>
                <button className="et-edit" onClick={e=>{ e.stopPropagation(); editingTypeId===t.id ? setEditingTypeId(null) : startEdit(t); }}
                  style={{ position:'absolute',right:4,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',opacity:0,transition:'opacity 0.12s',padding:2,display:'flex',alignItems:'center' }}
                >
                  <SFIcon name="pencil" size={10} />
                </button>
              </div>
            ))}
            <button onClick={()=>{ setShowNewType(v=>!v); setEditingTypeId(null); }}
              style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,border:'1px dashed var(--border)',background:'transparent',color:'var(--text-3)',cursor:'pointer',fontSize:11,transition:'all 0.12s' }}
            >+ Nouveau</button>
          </div>
          {editingTypeId && (() => {
            const t = localEventTypes.find(x => x.id === editingTypeId);
            return (
              <div style={{ display:'flex',gap:6,alignItems:'center',marginTop:8,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)' }}>
                <input type="color" value={editColor} onChange={e=>setEditColor(e.target.value)}
                  style={{ width:28,height:28,borderRadius:6,border:'1px solid var(--border)',background:'none',cursor:'pointer',padding:2,flexShrink:0 }} />
                <input value={editLabel} onChange={e=>setEditLabel(e.target.value)} autoFocus
                  onKeyDown={e=>{ if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditingTypeId(null); }}
                  style={{ flex:1,padding:'5px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-3)',color:'var(--text)',fontSize:11,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark' }} />
                <button onClick={saveEdit} style={{ padding:'5px 10px',borderRadius:8,border:'none',background:'var(--accent)',color:'var(--on-accent)',fontSize:11,cursor:'pointer',fontWeight:600,flexShrink:0 }}>Enregistrer</button>
                {!t?.builtIn && (
                  <button onClick={()=>removeType(editingTypeId)} style={{ padding:'5px 8px',borderRadius:8,border:'1px solid var(--danger)',background:'transparent',color:'var(--danger)',fontSize:11,cursor:'pointer',display:'flex',alignItems:'center',flexShrink:0 }}>
                    <SFIcon name="trash-2" size={12} />
                  </button>
                )}
              </div>
            );
          })()}
          {showNewType && (
            <div style={{ display:'flex',gap:6,alignItems:'center',marginTop:8 }}>
              <input type="color" value={newTypeColor} onChange={e=>setNewTypeColor(e.target.value)}
                style={{ width:28,height:28,borderRadius:6,border:'1px solid var(--border)',background:'none',cursor:'pointer',padding:2 }} />
              <input value={newTypeLabel} onChange={e=>setNewTypeLabel(e.target.value)} placeholder="Nom du type…" autoFocus
                onKeyDown={e=>{ if(e.key==='Enter') addNewType(); if(e.key==='Escape') setShowNewType(false); }}
                style={{ flex:1,padding:'5px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:11,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark' }} />
              <button onClick={addNewType} style={{ padding:'5px 10px',borderRadius:8,border:'none',background:'var(--accent)',color:'var(--on-accent)',fontSize:11,cursor:'pointer',fontWeight:600 }}>Ajouter</button>
            </div>
          )}
        </div>

        {/* Project */}
        <select value={projectId} onChange={e=>setProjectId(e.target.value)}
          style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:12,boxSizing:'border-box' }}
        >
          <option value=''>— Sans projet —</option>
          {PROJECTS.map(p=><option key={p.id} value={p.id}>{p.name} — {p.clientName}</option>)}
        </select>

        {/* Title */}
        <input value={title} onChange={e=>setTitle(e.target.value)} autoFocus placeholder="Titre…"
          style={{ width:'100%',padding:'10px 12px',borderRadius:9,border:`1px solid ${selectedType?.color ?? 'var(--border)'}`,background:'var(--surface-2)',color:'var(--text)',fontSize:14,fontWeight:600,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8 }}
        />

        {/* Location */}
        <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Lieu (optionnel)"
          style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8,boxSizing:'border-box' }}
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
    <div onClick={e=>{e.stopPropagation();onClick();}} onMouseDown={e=>e.stopPropagation()} onMouseEnter={()=>setHov(true)} onMouseLeave={()=>setHov(false)}
      style={{ position:'absolute', top, height:h, width:w, left, borderRadius:6, padding:'4px 7px', overflow:'hidden', cursor:'pointer', zIndex:5,
        background:`${ev.eventTypeColor}cc`, border:`1px solid ${ev.eventTypeColor}`, borderLeft:`3px solid ${ev.projectColor}`, boxShadow:hov?`0 2px 12px ${ev.eventTypeColor}66`:undefined, transition:'box-shadow 0.15s',
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
          <div key={d} style={{ padding:'10px 0 8px',textAlign:'center',fontFamily:'var(--ff-mono)',fontSize:10,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.06em' }}>{d}</div>
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
                <div style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',padding:'1px 6px' }}>+{dayEvents.length-2} autres</div>
              )}

            </div>
          );
        })}
      </div>
    </div>
  );
}

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
                    {isDay ? DAYS_FR[dayIdx] : DAYS_FR[i]}
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
              <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)' }}>Journée</span>
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
  const [localEventTypes, setLocalEventTypes] = useState<EventType[]>(getEventTypes);
  const toDateStr = (d: Date) => `${d.getFullYear()}-${fmt2(d.getMonth()+1)}-${fmt2(d.getDate())}`;
  const toTimeStr = (d: Date) => `${fmt2(d.getHours())}:${fmt2(d.getMinutes())}`;
  const [title, setTitle]         = useState(ev.title);
  const [description, setDescription] = useState(ev.description ?? '');
  const [eventTypeId, setEventTypeId] = useState(ev.eventTypeId);
  const [allDay, setAllDay]       = useState(ev.allDay ?? false);
  const [dateStr, setDateStr]     = useState(toDateStr(ev.startDate));
  const [startT, setStartT]       = useState(ev.allDay ? '09:00' : toTimeStr(ev.startDate));
  const [endT, setEndT]           = useState(ev.allDay ? '10:00' : toTimeStr(ev.endDate));
  const [projectId, setProjectId] = useState(ev.projectId ?? '');
  const [location, setLocation]   = useState(ev.location ?? '');
  const [participants, setParticipants] = useState<string[]>(ev.participantIds ?? []);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const PARTICIPANT_THRESHOLD = 4;
  const togglePart = (id: string) => setParticipants(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
  useEffect(() => subscribeEventTypes(() => setLocalEventTypes(getEventTypes())), []);
  const selectedType = localEventTypes.find(t => t.id === eventTypeId) ?? localEventTypes[0];

  const save = () => {
    if (!title.trim()) return;
    const [y,mo,d] = dateStr.split('-').map(Number);
    const [sh,sm]  = startT.split(':').map(Number);
    const [eh,em]  = endT.split(':').map(Number);
    const start = new Date(y,mo-1,d,sh,sm);
    const end   = allDay ? new Date(y,mo-1,d,23,59) : new Date(y,mo-1,d,eh,em);
    updateEvent(ev.id, {
      title: title.trim(),
      description: description.trim() || undefined,
      eventTypeId,
      projectId: projectId || undefined,
      start: allDay ? dateStr : start.toISOString(),
      end:   allDay ? dateStr : end.toISOString(),
      allDay: allDay || undefined,
      location: location || undefined,
      memberIds: participants,
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)',borderRadius:16,padding:28,width:460,border:'1px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',maxHeight:'90vh',overflow:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:700 }}>Modifier l'événement</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',display:'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        {/* Event type selector */}
        <div style={{ marginBottom:16 }}>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Type d'événement</p>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap',alignItems:'center' }}>
            {localEventTypes.map(t=>(
              <button key={t.id} onClick={()=>setEventTypeId(t.id)}
                style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:8,border:`1px solid ${eventTypeId===t.id?t.color:'var(--border)'}`,background:eventTypeId===t.id?`${t.color}22`:'transparent',color:eventTypeId===t.id?t.color:'var(--text-2)',cursor:'pointer',fontSize:11,fontWeight:500,transition:'all 0.12s' }}
              >
                <div style={{ width:8,height:8,borderRadius:'50%',background:t.color,flexShrink:0 }} />
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Project */}
        <select value={projectId} onChange={e=>setProjectId(e.target.value)}
          style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:12,boxSizing:'border-box' }}
        >
          <option value=''>— Sans projet —</option>
          {PROJECTS.map(p=><option key={p.id} value={p.id}>{p.name} — {p.clientName}</option>)}
        </select>

        {/* Title */}
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder="Titre…"
          style={{ width:'100%',padding:'10px 12px',borderRadius:9,border:`1px solid ${selectedType?.color ?? 'var(--border)'}`,background:'var(--surface-2)',color:'var(--text)',fontSize:14,fontWeight:600,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8 }}
        />

        {/* Location */}
        <input value={location} onChange={e=>setLocation(e.target.value)} placeholder="Lieu (optionnel)"
          style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8,boxSizing:'border-box' }}
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
        <div style={{ display:'flex',gap:8,marginBottom:16 }}>
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

        {/* Participants */}
        {(()=>{
          const team=Object.values(USERS).filter(u=>u.role!=='Cliente');
          const visible=participantsExpanded?team:team.slice(0,PARTICIPANT_THRESHOLD);
          const hidden=team.length-PARTICIPANT_THRESHOLD;
          return (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>Participants</p>
                {team.length>PARTICIPANT_THRESHOLD && (
                  <button onClick={()=>setParticipantsExpanded(v=>!v)} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:10,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0 }}>
                    {participantsExpanded?'Réduire':`+${hidden} autres`}
                  </button>
                )}
              </div>
              <div style={{ display:'flex',flexWrap:'wrap',gap:6 }}>
                {visible.map(u=>{
                  const sel=participants.includes(u.id);
                  return (
                    <button key={u.id} onClick={()=>togglePart(u.id)}
                      style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 10px',borderRadius:20,border:`1px solid ${sel?u.avatarColor:'var(--border)'}`,background:sel?`${u.avatarColor}22`:'transparent',cursor:'pointer',transition:'all 0.12s' }}
                    >
                      <SFAvatar initials={u.initials} bg={u.avatarColor} size={18} />
                      <span style={{ fontSize:11,color:sel?'var(--text)':'var(--text-2)' }}>{u.name}</span>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Footer */}
        <div style={{ display:'flex',gap:8,borderTop:'1px solid var(--border)',paddingTop:16 }}>
          <button onClick={save} disabled={!title.trim()}
            style={{ flex:1,padding:'9px',borderRadius:9,border:'none',background:'var(--accent)',color:'var(--on-accent)',fontSize:13,fontWeight:600,cursor:'pointer',opacity:title.trim()?1:0.5 }}
          >Enregistrer</button>
          {projectId && (
            <button onClick={()=>{navigate(`/projets/${projectId}/calendrier`);onClose();}}
              style={{ padding:'9px 14px',borderRadius:9,border:'1px solid var(--border)',background:'transparent',color:'var(--text-2)',cursor:'pointer',fontSize:12,fontFamily:'var(--ff-text)',whiteSpace:'nowrap' }}
            >Voir le calendrier</button>
          )}
          <button onClick={onDelete}
            style={{ padding:'9px 12px',borderRadius:9,border:'1px solid var(--border)',background:'transparent',color:'var(--danger)',cursor:'pointer',display:'flex',alignItems:'center' }}
          ><SFIcon name="trash-2" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function CalendrierGlobal() {
  const [view, setView]             = usePersistedState<CalView>('sf_view_calendrier', 'month');
  const [cur, setCur]               = useState(new Date(TODAY));
  const [eventTypes, setEventTypes] = useState<EventType[]>(getEventTypes);
  const [events, setEvents]         = useState<CalEvent[]>(() => resolveEvents(getEventTypes()));
  const [showCreate, setShowCreate] = useState(false);
  const [createDate, setCreateDate] = useState(new Date(TODAY));
  const [createStartTime, setCreateStartTime] = useState('09:00');
  const [createEndTime, setCreateEndTime] = useState('10:00');
  const [createAllDay, setCreateAllDay] = useState(false);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent|null>(null);
  const [hiddenProjects, setHiddenProjects] = useState<Set<string>>(new Set());
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set());

  useEffect(() => {
    const unsub1 = subscribeEvents(() => setEvents(resolveEvents(getEventTypes())));
    const unsub2 = subscribeEventTypes(() => { const et = getEventTypes(); setEventTypes(et); setEvents(resolveEvents(et)); });
    return () => { unsub1(); unsub2(); };
  }, []);

  // Build task chips from MY_TASKS
  const taskChips = MY_TASKS.flatMap(t=>{
    const d=parseFrDate(t.dueDate);
    return d&&!t.checked?[{date:d,title:t.title,color:t.projectColor}]:[];
  });

  // Filter events by selected projects + event types
  const visibleEvents = events.filter(ev => !hiddenProjects.has(ev.projectId ?? '') && (selectedEventTypes.size === 0 || selectedEventTypes.has(ev.eventTypeId)));

  const toggleEventType = (id: string) => setSelectedEventTypes(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

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
    setCreateAllDay(false);
    setShowCreate(true);
  };

  const handleRangeSelect = (d: Date, startH: number, startM: number, endH: number, endM: number) => {
    setCreateDate(new Date(d));
    setCreateStartTime(`${fmt2(startH)}:${fmt2(startM)}`);
    setCreateEndTime(`${fmt2(endH)}:${fmt2(endM)}`);
    setCreateAllDay(false);
    setShowCreate(true);
  };

  const handleAllDayClick = (d: Date) => {
    setCreateDate(new Date(d));
    setCreateAllDay(true);
    setShowCreate(true);
  };
  const handleCellClick = (d: Date) => { setCur(d); setView('day'); };

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') { setShowCreate(false); setSelectedEvent(null); return; }
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

  const handleDeleteEvent = (id: string) => { deleteEvent(id); setSelectedEvent(null); };

  // Upcoming events
  const upcoming = [...visibleEvents]
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
        {(() => {
          const allProjects = [{ id: '', name: 'Sans projet', color: 'var(--text-3)' }, ...PROJECTS.filter(p=>p.status!=='neutral').map(p=>({ id: p.id, name: p.name, color: p.clientColor }))];
          const allIds = allProjects.map(p => p.id);
          const allHidden = allIds.every(id => hiddenProjects.has(id));
          const soloId = allIds.filter(id => !hiddenProjects.has(id));
          const isSolo = soloId.length === 1;

          const toggleAll = () => {
            if (allHidden) setHiddenProjects(new Set());
            else setHiddenProjects(new Set(allIds));
          };
          const solo = (id: string) => {
            if (isSolo && soloId[0] === id) setHiddenProjects(new Set());
            else setHiddenProjects(new Set(allIds.filter(x => x !== id)));
          };

          return (
            <div>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>Mes projets</p>
                <button onClick={toggleAll} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:9,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0,textDecoration:'underline' }}>
                  {allHidden ? 'Tout afficher' : 'Tout masquer'}
                </button>
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                {allProjects.map(p=>{
                  const hidden = hiddenProjects.has(p.id);
                  const isThisSolo = isSolo && soloId[0] === p.id;
                  return (
                    <div key={p.id} style={{ display:'flex',alignItems:'center',gap:4 }}>
                      <button onClick={()=>toggleProject(p.id)}
                        style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:8,border:'none',background:'transparent',cursor:'pointer',textAlign:'left',opacity:hidden?0.35:1,transition:'opacity 0.15s',flex:1,minWidth:0 }}
                      >
                        <div style={{ width:10,height:10,borderRadius:'50%',background:p.color,flexShrink:0 }} />
                        <span style={{ fontSize:12,color:'var(--text-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontStyle:p.id===''?'italic':undefined }}>{p.name}</span>
                        {hidden && <SFIcon name="eye-off" size={11} color="var(--text-3)" />}
                      </button>
                      <button onClick={()=>solo(p.id)} title="Voir uniquement ce projet"
                        style={{ padding:'3px 6px',borderRadius:6,border:`1px solid ${isThisSolo?'var(--accent)':'var(--border)'}`,background:isThisSolo?'rgba(249,255,0,0.07)':'transparent',color:isThisSolo?'var(--accent)':'var(--text-3)',cursor:'pointer',fontSize:9,fontFamily:'var(--ff-mono)',flexShrink:0,transition:'all 0.12s' }}
                      >Solo</button>
                    </div>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Event type filters */}
        {(()=>{
          const hasFilter = selectedEventTypes.size > 0;
          return (
            <div>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>Types d'événements</p>
                {hasFilter && (
                  <button onClick={()=>setSelectedEventTypes(new Set())} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:9,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0,textDecoration:'underline' }}>
                    Tout afficher
                  </button>
                )}
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                {eventTypes.map(t=>{
                  const active = !hasFilter || selectedEventTypes.has(t.id);
                  return (
                    <button key={t.id} onClick={()=>toggleEventType(t.id)}
                      style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:8,border:'none',background:active&&hasFilter?'rgba(255,255,255,0.04)':'transparent',cursor:'pointer',textAlign:'left',opacity:active?1:0.35,transition:'all 0.15s',width:'100%' }}
                    >
                      <div style={{ width:10,height:10,borderRadius:'50%',background:t.color,flexShrink:0 }} />
                      <span style={{ fontSize:12,color:'var(--text-2)',flex:1 }}>{t.label}</span>
                      {active&&hasFilter&&<SFIcon name="checkmark" size={11} color="var(--text-3)" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Upcoming */}
        <div>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Prochains événements</p>
          <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
            {upcoming.map(ev=>(
              <div key={ev.id} onClick={()=>setSelectedEvent(ev)} style={{ display:'flex',gap:8,cursor:'pointer',padding:'6px 8px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)' }}
                onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--border-2)')}
                onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}
              >
                <div style={{ width:3,borderRadius:2,background:ev.eventTypeColor,flexShrink:0 }} />
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
            {([['month','Mois','M'],['week','Semaine','W'],['day','Jour','J']] as [CalView,string,string][]).map(([v,label,key],i)=>(
              <button key={v} onClick={()=>setView(v)}
                style={{ display:'flex',alignItems:'center',gap:5,padding:'6px 14px',border:'none',borderLeft:i>0?'1px solid var(--border)':undefined,background:view===v?'var(--surface-3)':'var(--surface-2)',color:view===v?'var(--text)':'var(--text-3)',cursor:'pointer',fontFamily:'var(--ff-mono)',fontSize:10,textTransform:'uppercase',letterSpacing:'0.05em',transition:'background 0.12s' }}
              >
                {label}
                <span style={{ fontSize:9,opacity:view===v?0.6:0.4,background:'rgba(128,128,128,0.15)',borderRadius:3,padding:'1px 4px',letterSpacing:0,lineHeight:1 }}>{key}</span>
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
            onSlotClick={handleSlotClick} onRangeSelect={handleRangeSelect} onEventClick={setSelectedEvent} onAllDayClick={handleAllDayClick}
          />
        )}
        {view==='day' && (
          <TimeGridView
            days={[cur]} events={visibleEvents} tasks={taskChips}
            onSlotClick={handleSlotClick} onRangeSelect={handleRangeSelect} onEventClick={setSelectedEvent} onAllDayClick={handleAllDayClick}
          />
        )}
      </div>

      {/* Modals */}
      {showCreate && (
        <CreateEventModal
          defaultDate={new Date(createDate.getFullYear(),createDate.getMonth(),createDate.getDate())}
          defaultStartTime={createStartTime}
          defaultEndTime={createEndTime}
          defaultAllDay={createAllDay}
          onClose={()=>{setShowCreate(false);setCreateAllDay(false);}}
        />
      )}
      {selectedEvent && (
        <EventDetail
          ev={selectedEvent}
          onClose={()=>setSelectedEvent(null)}
          onDelete={()=>handleDeleteEvent(selectedEvent.id)}
        />
      )}
    </div>
  );
}
