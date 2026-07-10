import { useState, useEffect } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton } from '../components/ui';
import { ProjectHeaderBar } from '../components/ProjectHeaderBar';
import { MY_TASKS, USERS } from '../data/mock';
import type { User } from '../types';
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getProjects } from '../data/projectStore';
import { getTeamMembers, subscribeTeam } from '../data/teamStore';
import { getEvents, addEvent, updateEvent, deleteEvent, subscribeEvents, isEventsLoading } from '../data/eventStore';
import { getEventTypes, addEventType, updateEventType, deleteEventType, subscribeEventTypes, type EventType } from '../data/eventTypeStore';
import { usePersistedState } from '../hooks/usePersistedState';
import { MeetingField } from './CalendrierGlobal';
import {
  TODAY, END_HOUR, type CalView,
  addDays, startOfWeek, fmt2, fmtTime, parseFrDate,
  getWeekDays, type CalEvent,
} from '../components/calendar/calendarUtils';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGridView } from '../components/calendar/TimeGridView';
import { EventTypeFilterList } from '../components/calendar/EventTypeFilterList';

function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS).filter(u => u.role !== 'Cliente');
  const members = getTeamMembers();
  if (members.length > 0) return members;
  const self = getCurrentUser();
  if (self) return [{ id: self.id, name: self.name, initials: self.initials, avatarColor: self.avatarColor, role: self.role }];
  return [USERS.lea];
}

// ── Constants ─────────────────────────────────────────────────────────────────

const MONTHS_FR    = ['Janvier','Février','Mars','Avril','Mai','Juin','Juillet','Août','Septembre','Octobre','Novembre','Décembre'];

function resolveProjectEvents(projectIds: string[], eventTypes: EventType[]): CalEvent[] {
  const typeMap = Object.fromEntries(eventTypes.map(t => [t.id, t]));
  return getEvents()
    .filter(e => projectIds.includes(e.projectId ?? ''))
    .map(e => {
      const p = getProjects().find(x => x.id === e.projectId);
      const et = typeMap[e.eventTypeId] ?? { color: '#888', label: 'Autre', icon: 'circle' };
      const parseDate = (s: string) => s.includes('T') ? new Date(s) : new Date(s + 'T00:00:00');
      return {
        id: e.id,
        title: e.title,
        eventTypeId: e.eventTypeId,
        projectId: e.projectId,
        projectName: p?.clientName ?? '',
        projectColor: p?.clientColor ?? '#888',
        eventTypeColor: et.color,
        eventTypeLabel: et.label,
        startDate: parseDate(e.start),
        endDate: parseDate(e.end),
        allDay: e.allDay,
        description: e.description,
        location: e.location,
        meetingUrl: e.meetingUrl,
        participantIds: e.memberIds,
      };
    });
}

// ── Create event modal ────────────────────────────────────────────────────────

function CreateEventModal({ projectId: defaultProjectId, defaultDate, defaultStartTime, defaultEndTime, defaultAllDay, onClose }: {
  projectId: string;
  defaultDate: Date;
  defaultStartTime?: string;
  defaultEndTime?: string;
  defaultAllDay?: boolean;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const [title, setTitle]         = useState('');
  const [description, setDescription] = useState('');
  const [eventTypeId, setEventTypeId] = useState('reunion');
  const [allDay, setAllDay]       = useState(defaultAllDay ?? false);
  const [dateStr, setDateStr]     = useState(`${defaultDate.getFullYear()}-${fmt2(defaultDate.getMonth()+1)}-${fmt2(defaultDate.getDate())}`);
  const [startT, setStartT]       = useState(defaultStartTime ?? `${fmt2(defaultDate.getHours()||9)}:00`);
  const [endT, setEndT]           = useState(defaultEndTime ?? `${fmt2((defaultDate.getHours()||9)+1)}:00`);
  const [location, setLocation]   = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [participants, setParticipants] = useState<string[]>(() => {
    if (isDemoSession()) return ['lea'];
    const self = getCurrentUser();
    return self ? [self.id] : ['lea'];
  });
  const [localEventTypes, setLocalEventTypes] = useState<EventType[]>(getEventTypes);
  const [showNewType, setShowNewType] = useState(false);
  const [newTypeLabel, setNewTypeLabel] = useState('');
  const [newTypeColor, setNewTypeColor] = useState('#3b82f6');
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');
  const [, forceRerender] = useState(0);
  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);

  useEffect(() => subscribeEventTypes(() => setLocalEventTypes(getEventTypes())), []);

  const startEdit = (et: EventType) => {
    setEditingTypeId(et.id); setEditLabel(et.label); setEditColor(et.color);
    setEventTypeId(et.id);
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

  const addNewType = () => {
    if (!newTypeLabel.trim()) return;
    const newType = addEventType({ label: newTypeLabel.trim(), color: newTypeColor, icon: 'circle' });
    setEventTypeId(newType.id);
    setNewTypeLabel('');
    setShowNewType(false);
  };

  const selectedType = localEventTypes.find(t => t.id === eventTypeId) ?? localEventTypes[0];

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
      projectId: defaultProjectId,
      start: allDay ? dateStr : start.toISOString(),
      end: allDay ? dateStr : end.toISOString(),
      allDay,
      location: location || undefined,
      meetingUrl: meetingUrl || undefined,
      memberIds: participants,
    });
    onClose();
  };

  const togglePart=(id:string)=>setParticipants(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)',borderRadius:16,padding:28,width:440,border:'1px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',maxHeight:'90vh',overflow:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:700 }}>{t('calendar.newEvent')}</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',display:'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        <div style={{ marginBottom:16 }}>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>{t('calendar.eventType')}</p>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap',alignItems:'center' }}>
            {localEventTypes.map(et=>(
              <div key={et.id} style={{ position:'relative',display:'inline-flex' }}
                onMouseEnter={e=>(e.currentTarget.querySelector<HTMLElement>('.et-edit')!.style.opacity='1')}
                onMouseLeave={e=>(e.currentTarget.querySelector<HTMLElement>('.et-edit')!.style.opacity='0')}
              >
                <button onClick={()=>{ setEventTypeId(et.id); setEditingTypeId(null); }}
                  style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 10px',paddingRight:'24px',borderRadius:8,border:`1px solid ${eventTypeId===et.id?et.color:'var(--border)'}`,background:eventTypeId===et.id?`${et.color}22`:'transparent',color:eventTypeId===et.id?et.color:'var(--text-2)',cursor:'pointer',fontSize:11,fontWeight:500,transition:'all 0.12s' }}
                >
                  <div style={{ width:8,height:8,borderRadius:'50%',background:et.color,flexShrink:0 }} />
                  {et.label}
                </button>
                <button className="et-edit" onClick={e=>{ e.stopPropagation(); editingTypeId===et.id ? setEditingTypeId(null) : startEdit(et); }}
                  style={{ position:'absolute',right:4,top:'50%',transform:'translateY(-50%)',background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',opacity:0,transition:'opacity 0.12s',padding:2,display:'flex',alignItems:'center' }}
                >
                  <SFIcon name="pencil" size={10} />
                </button>
              </div>
            ))}
            <button onClick={()=>{ setShowNewType(v=>!v); setEditingTypeId(null); }}
              style={{ display:'flex',alignItems:'center',gap:4,padding:'5px 10px',borderRadius:8,border:'1px dashed var(--border)',background:'transparent',color:'var(--text-3)',cursor:'pointer',fontSize:11,transition:'all 0.12s' }}
            >{t('calendar.newType')}</button>
          </div>
          {editingTypeId && (() => {
            const et = localEventTypes.find(x => x.id === editingTypeId);
            return (
              <div style={{ display:'flex',gap:6,alignItems:'center',marginTop:8,padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)' }}>
                <input type="color" value={editColor} onChange={e=>setEditColor(e.target.value)}
                  style={{ width:28,height:28,borderRadius:6,border:'1px solid var(--border)',background:'none',cursor:'pointer',padding:2,flexShrink:0 }} />
                <input value={editLabel} onChange={e=>setEditLabel(e.target.value)} autoFocus
                  onKeyDown={e=>{ if(e.key==='Enter') saveEdit(); if(e.key==='Escape') setEditingTypeId(null); }}
                  style={{ flex:1,padding:'5px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-3)',color:'var(--text)',fontSize:11,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark' }} />
                <button onClick={saveEdit} style={{ padding:'5px 10px',borderRadius:8,border:'none',background:'var(--accent)',color:'var(--on-accent)',fontSize:11,cursor:'pointer',fontWeight:600,flexShrink:0 }}>{t('calendar.save')}</button>
                {!et?.builtIn && (
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
              <input value={newTypeLabel} onChange={e=>setNewTypeLabel(e.target.value)} placeholder={t('calendar.typeNamePlaceholder')} autoFocus
                onKeyDown={e=>{ if(e.key==='Enter') addNewType(); if(e.key==='Escape') setShowNewType(false); }}
                style={{ flex:1,padding:'5px 10px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:11,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark' }} />
              <button onClick={addNewType} style={{ padding:'5px 10px',borderRadius:8,border:'none',background:'var(--accent)',color:'var(--on-accent)',fontSize:11,cursor:'pointer',fontWeight:600 }}>{t('calendar.add')}</button>
            </div>
          )}
        </div>

        <input value={title} onChange={e=>setTitle(e.target.value)} autoFocus placeholder={t('calendar.titlePlaceholder')}
          style={{ width:'100%',padding:'10px 12px',borderRadius:9,border:`1px solid ${selectedType?.color ?? 'var(--border)'}`,background:'var(--surface-2)',color:'var(--text)',fontSize:14,fontWeight:600,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8 }}
        />

        <input value={location} onChange={e=>setLocation(e.target.value)} placeholder={t('calendar.locationPlaceholder')}
          style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8,boxSizing:'border-box' }}
        />

        <MeetingField value={meetingUrl} onChange={setMeetingUrl} title={title} />

        <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder={t('calendar.descriptionPlaceholder')} rows={2}
          style={{ width:'100%',padding:'8px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:12,resize:'vertical',lineHeight:1.5 }}
        />

        <label style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer' }}>
          <div onClick={()=>setAllDay(s=>!s)} style={{ width:32,height:18,borderRadius:9,background:allDay?'var(--accent)':'var(--surface-3)',border:`1px solid ${allDay?'var(--accent)':'var(--border)'}`,position:'relative',transition:'background 0.15s',cursor:'pointer' }}>
            <div style={{ position:'absolute',top:2,left:allDay?14:2,width:12,height:12,borderRadius:'50%',background:allDay?'var(--on-accent)':'var(--text-3)',transition:'left 0.15s' }} />
          </div>
          <span style={{ fontSize:12,color:'var(--text-2)' }}>{t('calendar.allDay')}</span>
        </label>

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

        {(() => {
          const team = getTeam();
          return (
            <div style={{ marginBottom:20 }}>
              <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>{t('calendar.participants')}</p>
              <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
                {team.map(u=>(
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
          <SFButton variant="ghost" onClick={onClose}>{t('calendar.cancel')}</SFButton>
          <SFButton variant="primary" onClick={save}>{t('calendar.create')}</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Event detail ──────────────────────────────────────────────────────────────

function EventDetail({ ev, onClose, onDelete }: { ev: CalEvent; onClose: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
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
  const [location, setLocation]   = useState(ev.location ?? '');
  const [meetingUrl, setMeetingUrl] = useState(ev.meetingUrl ?? '');
  const [participants, setParticipants] = useState<string[]>(ev.participantIds ?? []);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [, forceRerender] = useState(0);
  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);
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
      start: allDay ? dateStr : start.toISOString(),
      end:   allDay ? dateStr : end.toISOString(),
      allDay: allDay || undefined,
      location: location || undefined,
      meetingUrl: meetingUrl || undefined,
      memberIds: participants,
    });
    onClose();
  };

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)',borderRadius:16,padding:28,width:460,border:'1px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',maxHeight:'90vh',overflow:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:700 }}>{t('calendar.editEvent')}</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',display:'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        {/* Event type */}
        <div style={{ marginBottom:16 }}>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>{t('calendar.eventType')}</p>
          <div style={{ display:'flex',gap:6,flexWrap:'wrap' }}>
            {localEventTypes.map(et=>(
              <button key={et.id} onClick={()=>setEventTypeId(et.id)}
                style={{ display:'flex',alignItems:'center',gap:5,padding:'5px 10px',borderRadius:8,border:`1px solid ${eventTypeId===et.id?et.color:'var(--border)'}`,background:eventTypeId===et.id?`${et.color}22`:'transparent',color:eventTypeId===et.id?et.color:'var(--text-2)',cursor:'pointer',fontSize:11,fontWeight:500,transition:'all 0.12s' }}
              >
                <div style={{ width:8,height:8,borderRadius:'50%',background:et.color,flexShrink:0 }} />
                {et.label}
              </button>
            ))}
          </div>
        </div>

        {/* Title */}
        <input value={title} onChange={e=>setTitle(e.target.value)} placeholder={t('calendar.titlePlaceholder')}
          style={{ width:'100%',padding:'10px 12px',borderRadius:9,border:`1px solid ${selectedType?.color ?? 'var(--border)'}`,background:'var(--surface-2)',color:'var(--text)',fontSize:14,fontWeight:600,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8 }}
        />

        {/* Location */}
        <input value={location} onChange={e=>setLocation(e.target.value)} placeholder={t('calendar.locationPlaceholder')}
          style={{ width:'100%',padding:'8px 10px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:8,boxSizing:'border-box' }}
        />

        {/* Online meeting */}
        <MeetingField value={meetingUrl} onChange={setMeetingUrl} title={title} />

        {/* Description */}
        <textarea value={description} onChange={e=>setDescription(e.target.value)} placeholder={t('calendar.descriptionPlaceholder')} rows={2}
          style={{ width:'100%',padding:'8px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text)',fontSize:13,outline:'none',boxSizing:'border-box',fontFamily:'var(--ff-text)',colorScheme:'dark',marginBottom:12,resize:'vertical',lineHeight:1.5 }}
        />

        {/* All day */}
        <label style={{ display:'flex',alignItems:'center',gap:8,marginBottom:12,cursor:'pointer' }}>
          <div onClick={()=>setAllDay(s=>!s)} style={{ width:32,height:18,borderRadius:9,background:allDay?'var(--accent)':'var(--surface-3)',border:`1px solid ${allDay?'var(--accent)':'var(--border)'}`,position:'relative',transition:'background 0.15s',cursor:'pointer' }}>
            <div style={{ position:'absolute',top:2,left:allDay?14:2,width:12,height:12,borderRadius:'50%',background:allDay?'var(--on-accent)':'var(--text-3)',transition:'left 0.15s' }} />
          </div>
          <span style={{ fontSize:12,color:'var(--text-2)' }}>{t('calendar.allDay')}</span>
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
          const team = getTeam();
          const visible=participantsExpanded?team:team.slice(0,PARTICIPANT_THRESHOLD);
          const hidden=team.length-PARTICIPANT_THRESHOLD;
          return (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>{t('calendar.participants')}</p>
                {team.length>PARTICIPANT_THRESHOLD && (
                  <button onClick={()=>setParticipantsExpanded(v=>!v)} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:10,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0 }}>
                    {participantsExpanded?t('calendar.collapse'):t('calendar.moreParticipants', { count: hidden })}
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
          >{t('calendar.save')}</button>
          <button onClick={onDelete}
            style={{ padding:'9px 12px',borderRadius:9,border:'1px solid var(--border)',background:'transparent',color:'var(--danger)',cursor:'pointer',display:'flex',alignItems:'center' }}
          ><SFIcon name="trash-2" size={14} /></button>
        </div>
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

export function ProjetCalendrier({ embedded, projectIds: overrideIds }: { embedded?: boolean; projectIds?: string[] } = {}) {
  const { t } = useTranslation();
  const months = t('calendar.months', { returnObjects: true }) as string[];
  const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];
  const params = useParams<{ projectId: string }>();
  const projectId = embedded ? undefined : params.projectId;
  const activeProjectIds = overrideIds ?? (projectId ? [projectId] : []);

  const [view, setView]             = usePersistedState<CalView>('sf_view_projet_calendrier', 'week');
  const [cur, setCur]               = useState(new Date(TODAY));
  const [eventTypes, setEventTypes] = useState<EventType[]>(getEventTypes);
  const [events, setEvents]         = useState<CalEvent[]>(() => resolveProjectEvents(activeProjectIds, getEventTypes()));
  const [showCreate, setShowCreate] = useState(false);
  const [createDate, setCreateDate] = useState(new Date(TODAY));
  const [createStartTime, setCreateStartTime] = useState('09:00');
  const [createEndTime, setCreateEndTime]     = useState('10:00');
  const [createAllDay, setCreateAllDay]       = useState(false);
  const [selectedEvent, setSelectedEvent]     = useState<CalEvent|null>(null);
  const [selectedEventTypes, setSelectedEventTypes] = useState<Set<string>>(new Set());
  const [selectedProjectsFilter, setSelectedProjectsFilter] = useState<Set<string>>(new Set());

  useEffect(() => {
    const refresh = () => setEvents(resolveProjectEvents(activeProjectIds, getEventTypes()));
    const unsub1 = subscribeEvents(refresh);
    const unsub2 = subscribeEventTypes(() => { setEventTypes(getEventTypes()); refresh(); });
    return () => { unsub1(); unsub2(); };
  }, [activeProjectIds.join(',')]);

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

  const taskChips = MY_TASKS
    .filter(t => activeProjectIds.includes(t.projectId ?? ''))
    .flatMap(t => {
      const d = parseFrDate(t.dueDate);
      return d && !t.checked ? [{ date: d, title: t.title, color: t.projectColor }] : [];
    });

  const visibleEvents = events.filter(ev =>
    (selectedEventTypes.size === 0 || selectedEventTypes.has(ev.eventTypeId)) &&
    (!embedded || selectedProjectsFilter.size === 0 || selectedProjectsFilter.has(ev.projectId ?? ''))
  );

  const toggleEventType = (id: string) => setSelectedEventTypes(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });
  const toggleProjectFilter = (id: string) => setSelectedProjectsFilter(s => {
    const n = new Set(s); if (n.has(id)) n.delete(id); else n.add(id); return n;
  });

  const handleDeleteEvent = (id: string) => { deleteEvent(id); setSelectedEvent(null); };

  // Glisser-déplacer un événement (change l'heure) ou étirer sa poignée du bas (change la durée)
  const handleEventChange = (ev: CalEvent, newStart: Date, newEnd: Date) => {
    updateEvent(ev.id, { start: newStart.toISOString(), end: newEnd.toISOString() });
  };

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

  const title = view==='month'
    ? `${months[cur.getMonth()]} ${cur.getFullYear()}`
    : view==='week'
    ? `${months[startOfWeek(cur).getMonth()]} ${startOfWeek(cur).getFullYear()}`
    : `${dayNames[(cur.getDay()+6)%7]} ${cur.getDate()} ${months[cur.getMonth()]}`;

  return (
    <div style={{ height:'100%',display:'flex',flexDirection:'column',overflow:'hidden' }}>
      {!embedded && (
        <ProjectHeaderBar projectId={projectId ?? ''}>
          <SFButton variant="primary" icon="plus" onClick={()=>{setCreateDate(new Date(TODAY));setShowCreate(true);}}>{t('calendar.newEvent')}</SFButton>
        </ProjectHeaderBar>
      )}
      <div style={{ flex:1,display:'flex',overflow:'hidden' }}>
      {/* Sidebar */}
      <div style={{ width:220,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'auto',padding:16,gap:20 }}>
        {embedded && (
          <SFButton variant="primary" icon="plus" onClick={()=>{setCreateDate(new Date(TODAY));setShowCreate(true);}}>{t('calendar.newEvent')}</SFButton>
        )}

        {/* Project filter — embedded client view only, with 2+ projects */}
        {embedded && activeProjectIds.length > 1 && (()=>{
          const clientProjects = activeProjectIds
            .map(id => getProjects().find(p => p.id === id))
            .filter(Boolean) as ReturnType<typeof getProjects>;
          const hasFilter = selectedProjectsFilter.size > 0;
          return (
            <div>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>{t('calendar.projects')}</p>
                {hasFilter && (
                  <button onClick={()=>setSelectedProjectsFilter(new Set())} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:9,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0,textDecoration:'underline' }}>
                    {t('calendar.showAll')}
                  </button>
                )}
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                {clientProjects.map(p=>{
                  const active = !hasFilter || selectedProjectsFilter.has(p.id);
                  return (
                    <button key={p.id} onClick={()=>toggleProjectFilter(p.id)}
                      style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:8,border:'none',background:active&&hasFilter?'rgba(255,255,255,0.04)':'transparent',cursor:'pointer',textAlign:'left',opacity:active?1:0.35,transition:'all 0.15s',width:'100%' }}>
                      <div style={{ width:10,height:10,borderRadius:'50%',background:p.clientColor,flexShrink:0 }} />
                      <span style={{ fontSize:12,color:'var(--text-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{p.name}</span>
                      {active&&hasFilter&&<SFIcon name="check" size={11} color="var(--text-3)" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Event type filters — éditable : crayon pour renommer/recolorer, "+" pour créer */}
        <EventTypeFilterList
          eventTypes={eventTypes}
          selectedEventTypes={selectedEventTypes}
          onToggle={toggleEventType}
          onClearFilter={()=>setSelectedEventTypes(new Set())}
          titleLabel="Types d'événements"
          showAllLabel="Tout afficher"
          newTypeLabel="+ Nouveau"
        />

        {/* Upcoming events for this project */}
        <div>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Prochains événements</p>
          <div style={{ display:'flex',flexDirection:'column',gap:6 }}>
            {[...visibleEvents]
              .filter(ev=>ev.startDate>=TODAY)
              .sort((a,b)=>a.startDate.getTime()-b.startDate.getTime())
              .slice(0,5)
              .map(ev=>(
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
            {visibleEvents.filter(ev=>ev.startDate>=TODAY).length===0 && (
              <p style={{ fontSize:12,color:'var(--text-3)',fontStyle:'italic' }}>{isEventsLoading() ? t('common.loading') : 'Aucun événement à venir'}</p>
            )}
          </div>
        </div>

        {/* Task deadlines */}
        {taskChips.length > 0 && (
          <div>
            <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em',marginBottom:8 }}>Échéances de tâches</p>
            <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
              {taskChips.slice(0,5).map((t,i)=>(
                <div key={i} style={{ display:'flex',alignItems:'center',gap:6,padding:'4px 8px',borderRadius:8,border:'1px solid var(--border)',background:'var(--surface-2)' }}>
                  <div style={{ width:6,height:6,borderRadius:'50%',background:t.color,flexShrink:0 }} />
                  <span style={{ fontSize:11,color:'var(--text-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap' }}>{t.title}</span>
                  <span style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)' }}>{t.date.getDate()} {MONTHS_FR[t.date.getMonth()].slice(0,3).toLowerCase()}</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Main */}
      <div style={{ flex:1,display:'flex',flexDirection:'column',overflow:'hidden',minWidth:0 }}>
        <div style={{ padding:'10px 20px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:12,flexShrink:0 }}>
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
            onEventChange={handleEventChange} createModalOpen={showCreate}
          />
        )}
        {view==='day' && (
          <TimeGridView
            days={[cur]} events={visibleEvents} tasks={taskChips}
            onSlotClick={handleSlotClick} onRangeSelect={handleRangeSelect} onEventClick={setSelectedEvent} onAllDayClick={handleAllDayClick}
            onEventChange={handleEventChange} createModalOpen={showCreate}
          />
        )}
      </div>
      </div>

      {showCreate && activeProjectIds.length > 0 && (
        <CreateEventModal
          projectId={activeProjectIds[0]}
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
