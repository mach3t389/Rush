import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { SFIcon, SFAvatar, SFButton, SFPill } from '../components/ui';
import { PROJECTS, MY_TASKS, USERS } from '../data/mock';
import type { User } from '../types';
import { isDemoSession, getCurrentUser } from '../data/authStore';
import { getTeamMembers, subscribeTeam } from '../data/teamStore';
import { getEvents, addEvent, updateEvent, deleteEvent, subscribeEvents } from '../data/eventStore';
import { getEventTypes, addEventType, updateEventType, deleteEventType, subscribeEventTypes, type EventType } from '../data/eventTypeStore';
import { usePersistedState } from '../hooks/usePersistedState';
import {
  TODAY, END_HOUR, type CalView,
  addDays, isSameDay, startOfWeek, fmt2, fmtTime, parseFrDate,
  getMonthGrid, getWeekDays, type CalEvent,
} from '../components/calendar/calendarUtils';
import { MonthView } from '../components/calendar/MonthView';
import { TimeGridView } from '../components/calendar/TimeGridView';

function getTeam(): User[] {
  if (isDemoSession()) return Object.values(USERS).filter(u => u.role !== 'Cliente');
  const members = getTeamMembers();
  if (members.length > 0) return members;
  const self = getCurrentUser();
  if (self) return [{ id: self.id, name: self.name, initials: self.initials, avatarColor: self.avatarColor, role: self.role }];
  return [USERS.lea];
}

// ── Types ─────────────────────────────────────────────────────────────────────

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
      meetingUrl: e.meetingUrl,
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

// ── Create event modal ────────────────────────────────────────────────────────

// ── Rencontre en ligne (Jitsi auto + lien collé) ───────────────────────────────

function makeJitsiUrl(title: string): string {
  const slug = (title || 'Rencontre')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')   // retire les accents
    .replace(/[^a-zA-Z0-9]+/g, '-').replace(/^-+|-+$/g, '')
    .slice(0, 30) || 'Rencontre';
  const rand = Math.random().toString(36).slice(2, 8);
  return `https://meet.jit.si/Rush-${slug}-${rand}`;
}

export function MeetingField({ value, onChange, title }: {
  value: string;
  onChange: (url: string) => void;
  title: string;
}) {
  const { t } = useTranslation();
  const [copied, setCopied] = useState(false);

  if (!value) {
    return (
      <button onClick={() => onChange(makeJitsiUrl(title))}
        style={{ display:'flex',alignItems:'center',justifyContent:'center',gap:7,width:'100%',padding:'8px 12px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)',color:'var(--text-2)',fontSize:12,cursor:'pointer',fontFamily:'var(--ff-text)',marginBottom:8,boxSizing:'border-box' }}
        onMouseEnter={e=>{ (e.currentTarget as HTMLElement).style.borderColor='var(--accent)'; }}
        onMouseLeave={e=>{ (e.currentTarget as HTMLElement).style.borderColor='var(--border)'; }}
      >
        <SFIcon name="video" size={13} color="var(--accent)" />
        {t('calendar.createMeeting')}
      </button>
    );
  }

  return (
    <div style={{ display:'flex',flexDirection:'column',gap:7,marginBottom:8,padding:'9px 11px',borderRadius:9,border:'1px solid var(--border)',background:'var(--surface-2)' }}>
      <div style={{ display:'flex',alignItems:'center',gap:7 }}>
        <SFIcon name="video" size={13} color="var(--accent)" />
        <span style={{ fontSize:9,fontFamily:'var(--ff-mono)',color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>{t('calendar.onlineMeeting')}</span>
        <button onClick={()=>onChange('')} title={t('calendar.removeMeeting')} style={{ marginLeft:'auto',background:'none',border:'none',cursor:'pointer',color:'var(--text-3)',display:'flex',padding:2 }}>
          <SFIcon name="x" size={13} />
        </button>
      </div>
      <input value={value} onChange={e=>onChange(e.target.value)} placeholder={t('calendar.meetingLinkPlaceholder')}
        style={{ width:'100%',padding:'6px 8px',borderRadius:7,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text)',fontSize:12,outline:'none',fontFamily:'var(--ff-mono)',boxSizing:'border-box' }}
      />
      <div style={{ display:'flex',gap:6 }}>
        <a href={value} target="_blank" rel="noopener noreferrer"
          style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 11px',borderRadius:7,background:'var(--accent)',color:'var(--on-accent)',fontSize:11,fontWeight:600,textDecoration:'none',fontFamily:'var(--ff-text)' }}>
          <SFIcon name="external-link" size={11} color="var(--on-accent)" /> {t('calendar.join')}
        </a>
        <button onClick={()=>{ navigator.clipboard?.writeText(value); setCopied(true); setTimeout(()=>setCopied(false),1500); }}
          style={{ display:'flex',alignItems:'center',gap:6,padding:'5px 11px',borderRadius:7,border:'1px solid var(--border)',background:'var(--surface)',color:'var(--text-2)',fontSize:11,cursor:'pointer',fontFamily:'var(--ff-text)' }}>
          <SFIcon name={copied?'check':'copy'} size={11} color={copied?'var(--ok)':'var(--text-3)'} /> {copied?t('calendar.copied'):t('calendar.copy')}
        </button>
      </div>
    </div>
  );
}

// Sélecteur de projet stylé — remplace le <select> natif, cohérent avec les autres menus déroulants
function ProjectSelect({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const options = [
    { id: '', label: t('calendar.noProject'), color: null as string | null, italic: true },
    ...PROJECTS.map(p => ({ id: p.id, label: `${p.name} — ${p.clientName}`, color: p.clientColor as string | null, italic: false })),
  ];
  const sel = options.find(o => o.id === value) ?? options[0];
  return (
    <div style={{ position:'relative', marginBottom:12 }}>
      <button type="button" onClick={()=>setOpen(o=>!o)}
        style={{ width:'100%', display:'flex', alignItems:'center', gap:8, padding:'8px 10px', borderRadius:9, border:`1px solid ${open?'var(--accent)':'var(--border)'}`, background:'var(--surface-2)', color:'var(--text)', fontSize:12, cursor:'pointer', fontFamily:'var(--ff-text)', textAlign:'left', boxSizing:'border-box' }}
      >
        {sel.color && <div style={{ width:9, height:9, borderRadius:'50%', background:sel.color, flexShrink:0 }} />}
        <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontStyle: sel.italic?'italic':undefined, color: sel.italic?'var(--text-3)':'var(--text)' }}>{sel.label}</span>
        <SFIcon name={open?'chevron-up':'chevron-down'} size={13} color="var(--text-3)" />
      </button>
      {open && (
        <>
          <div onClick={()=>setOpen(false)} style={{ position:'fixed', inset:0, zIndex:60 }} />
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, zIndex:70, background:'var(--surface)', border:'1px solid var(--border-2)', borderRadius:11, padding:5, boxShadow:'0 12px 32px rgba(0,0,0,0.55)', maxHeight:240, overflowY:'auto' }}>
            {options.map(o=>{
              const on = o.id === value;
              return (
                <button key={o.id} type="button" onClick={()=>{ onChange(o.id); setOpen(false); }}
                  style={{ display:'flex', alignItems:'center', gap:9, width:'100%', padding:'8px 10px', borderRadius:7, border:'none', background: on?'rgba(249,255,0,0.07)':'transparent', cursor:'pointer', textAlign:'left' }}
                  onMouseEnter={e=>{ if(!on)(e.currentTarget as HTMLElement).style.background='var(--surface-2)'; }}
                  onMouseLeave={e=>{ if(!on)(e.currentTarget as HTMLElement).style.background='transparent'; }}
                >
                  {o.color
                    ? <div style={{ width:9, height:9, borderRadius:'50%', background:o.color, flexShrink:0 }} />
                    : <div style={{ width:9, height:9, flexShrink:0 }} />}
                  <span style={{ flex:1, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontStyle:o.italic?'italic':undefined, color: on?'var(--accent)':(o.italic?'var(--text-3)':'var(--text)') }}>{o.label}</span>
                  {on && <SFIcon name="check" size={13} color="var(--accent)" />}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}

function EventTypeSelector({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const { t } = useTranslation();
  const [types, setTypes] = useState<EventType[]>(getEventTypes);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editLabel, setEditLabel] = useState('');
  const [editColor, setEditColor] = useState('#3b82f6');
  const [showNew, setShowNew] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const [newColor, setNewColor] = useState('#3b82f6');

  useEffect(() => subscribeEventTypes(() => setTypes(getEventTypes())), []);

  const startEdit = (et: EventType) => { setEditingId(et.id); setEditLabel(et.label); setEditColor(et.color); onChange(et.id); setShowNew(false); };
  const saveEdit = () => { if (!editLabel.trim() || !editingId) return; updateEventType(editingId, { label: editLabel.trim(), color: editColor }); setEditingId(null); };
  const removeType = (id: string) => { if (value === id) onChange(types.find(et => et.id !== id)?.id ?? 'autre'); deleteEventType(id); setEditingId(null); };
  const addNew = () => {
    if (!newLabel.trim()) return;
    const t = addEventType({ label: newLabel.trim(), color: newColor, icon: 'circle' });
    onChange(t.id);
    setNewLabel(''); setShowNew(false);
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <p style={{ fontFamily: 'var(--ff-mono)', fontSize: 9, color: 'var(--text-3)', textTransform: 'uppercase', letterSpacing: '0.07em', marginBottom: 8 }}>{t('calendar.eventType')}</p>
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap', alignItems: 'center' }}>
        {types.map(et => (
          <div key={et.id} style={{ position: 'relative', display: 'inline-flex' }}
            onMouseEnter={e => (e.currentTarget.querySelector<HTMLElement>('.et-edit')!.style.opacity = '1')}
            onMouseLeave={e => (e.currentTarget.querySelector<HTMLElement>('.et-edit')!.style.opacity = '0')}
          >
            <button onClick={() => { onChange(et.id); setEditingId(null); }}
              style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '5px 10px', paddingRight: editingId === et.id ? '10px' : '24px', borderRadius: 8, border: `1px solid ${value === et.id ? et.color : 'var(--border)'}`, background: value === et.id ? `${et.color}22` : 'transparent', color: value === et.id ? et.color : 'var(--text-2)', cursor: 'pointer', fontSize: 11, fontWeight: 500, transition: 'all 0.12s' }}
            >
              <div style={{ width: 8, height: 8, borderRadius: '50%', background: et.color, flexShrink: 0 }} />
              {et.label}
            </button>
            <button className="et-edit" onClick={e => { e.stopPropagation(); editingId === et.id ? setEditingId(null) : startEdit(et); }}
              style={{ position: 'absolute', right: 4, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', opacity: 0, transition: 'opacity 0.12s', padding: 2, display: 'flex', alignItems: 'center' }}
            >
              <SFIcon name="pencil" size={10} />
            </button>
          </div>
        ))}
        <button onClick={() => { setShowNew(v => !v); setEditingId(null); }}
          style={{ display: 'flex', alignItems: 'center', gap: 4, padding: '5px 10px', borderRadius: 8, border: '1px dashed var(--border)', background: 'transparent', color: 'var(--text-3)', cursor: 'pointer', fontSize: 11, transition: 'all 0.12s' }}
        >{t('calendar.newType')}</button>
      </div>
      {editingId && (() => {
        const et = types.find(x => x.id === editingId);
        return (
          <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8, padding: '8px 10px', borderRadius: 9, border: '1px solid var(--border)', background: 'var(--surface-2)' }}>
            <input type="color" value={editColor} onChange={e => setEditColor(e.target.value)}
              style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', padding: 2, flexShrink: 0 }} />
            <input value={editLabel} onChange={e => setEditLabel(e.target.value)} autoFocus
              onKeyDown={e => { if (e.key === 'Enter') saveEdit(); if (e.key === 'Escape') setEditingId(null); }}
              style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-3)', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }} />
            <button onClick={saveEdit} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 600, flexShrink: 0 }}>{t('calendar.save')}</button>
            {!et?.builtIn && (
              <button onClick={() => removeType(editingId)} style={{ padding: '5px 8px', borderRadius: 8, border: '1px solid var(--danger)', background: 'transparent', color: 'var(--danger)', fontSize: 11, cursor: 'pointer', display: 'flex', alignItems: 'center', flexShrink: 0 }}>
                <SFIcon name="trash-2" size={12} />
              </button>
            )}
          </div>
        );
      })()}
      {showNew && (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 8 }}>
          <input type="color" value={newColor} onChange={e => setNewColor(e.target.value)}
            style={{ width: 28, height: 28, borderRadius: 6, border: '1px solid var(--border)', background: 'none', cursor: 'pointer', padding: 2 }} />
          <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder={t('calendar.typeNamePlaceholder')} autoFocus
            onKeyDown={e => { if (e.key === 'Enter') addNew(); if (e.key === 'Escape') setShowNew(false); }}
            style={{ flex: 1, padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text)', fontSize: 11, outline: 'none', fontFamily: 'var(--ff-text)', colorScheme: 'dark' }} />
          <button onClick={addNew} style={{ padding: '5px 10px', borderRadius: 8, border: 'none', background: 'var(--accent)', color: 'var(--on-accent)', fontSize: 11, cursor: 'pointer', fontWeight: 600 }}>{t('calendar.add')}</button>
        </div>
      )}
    </div>
  );
}

function CreateEventModal({ defaultDate, defaultStartTime, defaultEndTime, defaultAllDay, onClose }: {
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
  const [projectId, setProjectId] = useState('');
  const [location, setLocation]   = useState('');
  const [meetingUrl, setMeetingUrl] = useState('');
  const [participants, setParticipants] = useState<string[]>(() => {
    if (isDemoSession()) return ['lea'];
    const self = getCurrentUser();
    return self ? [self.id] : ['lea'];
  });
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [localEventTypes, setLocalEventTypes] = useState<EventType[]>(getEventTypes);
  const [, forceRerender] = useState(0);
  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);
  const PARTICIPANT_THRESHOLD = 4;

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
      meetingUrl: meetingUrl || undefined,
      memberIds: participants,
    });
    onClose();
  };

  const togglePart=(id:string)=>setParticipants(p=>p.includes(id)?p.filter(x=>x!==id):[...p,id]);

  useEffect(() => subscribeEventTypes(() => setLocalEventTypes(getEventTypes())), []);

  const selectedType = localEventTypes.find(t => t.id === eventTypeId) ?? localEventTypes[0];

  return (
    <div onClick={onClose} style={{ position:'fixed',inset:0,background:'rgba(0,0,0,0.6)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:200 }}>
      <div onClick={e=>e.stopPropagation()} style={{ background:'var(--surface)',borderRadius:16,padding:28,width:460,border:'1px solid var(--border)',boxShadow:'0 20px 60px rgba(0,0,0,0.5)',maxHeight:'90vh',overflow:'auto' }}>
        <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:20 }}>
          <h3 style={{ fontSize:16,fontWeight:700 }}>{t('calendar.newEvent')}</h3>
          <button onClick={onClose} style={{ background:'none',border:'none',color:'var(--text-3)',cursor:'pointer',display:'flex' }}><SFIcon name="x" size={16} /></button>
        </div>

        {/* Event type selector */}
        <EventTypeSelector value={eventTypeId} onChange={setEventTypeId} />

        {/* Project */}
        <ProjectSelect value={projectId} onChange={setProjectId} />

        {/* Title */}
        <input value={title} onChange={e=>setTitle(e.target.value)} autoFocus placeholder={t('calendar.titlePlaceholder')}
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
          const team = getTeam();
          const visible = participantsExpanded ? team : team.slice(0, PARTICIPANT_THRESHOLD);
          const hidden = team.length - PARTICIPANT_THRESHOLD;
          return (
            <div style={{ marginBottom:20 }}>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>{t('calendar.participants')}</p>
                {team.length > PARTICIPANT_THRESHOLD && (
                  <button onClick={()=>setParticipantsExpanded(v=>!v)} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:10,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0 }}>
                    {participantsExpanded ? t('calendar.collapse') : t('calendar.moreParticipants', { count: hidden })}
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
          <SFButton variant="ghost" onClick={onClose}>{t('calendar.cancel')}</SFButton>
          <SFButton variant="primary" onClick={save}>{t('calendar.create')}</SFButton>
        </div>
      </div>
    </div>
  );
}

// ── Mini calendar (sidebar) ───────────────────────────────────────────────────

function MiniCalendar({ cur, onSelect }: { cur: Date; onSelect: (d: Date) => void }) {
  const { t } = useTranslation();
  const months = t('calendar.months', { returnObjects: true }) as string[];
  const daysShort = t('datepicker.daysShort', { returnObjects: true }) as string[];
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
        {daysShort.map((d,i)=>(
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

// ── Event detail popover ──────────────────────────────────────────────────────

function EventDetail({ ev, onClose, onDelete }: { ev: CalEvent; onClose: () => void; onDelete: () => void }) {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const [localEventTypes] = useState<EventType[]>(getEventTypes);
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
  const [meetingUrl, setMeetingUrl] = useState(ev.meetingUrl ?? '');
  const [participants, setParticipants] = useState<string[]>(ev.participantIds ?? []);
  const [participantsExpanded, setParticipantsExpanded] = useState(false);
  const [, forceRerender] = useState(0);
  useEffect(() => subscribeTeam(() => forceRerender(n => n + 1)), []);
  const PARTICIPANT_THRESHOLD = 4;
  const togglePart = (id: string) => setParticipants(p => p.includes(id) ? p.filter(x => x !== id) : [...p, id]);
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

        {/* Event type selector */}
        <EventTypeSelector value={eventTypeId} onChange={setEventTypeId} />

        {/* Project */}
        <ProjectSelect value={projectId} onChange={setProjectId} />

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
          {projectId && (
            <button onClick={()=>{navigate(`/projets/${projectId}/calendrier`);onClose();}}
              style={{ padding:'9px 14px',borderRadius:9,border:'1px solid var(--border)',background:'transparent',color:'var(--text-2)',cursor:'pointer',fontSize:12,fontFamily:'var(--ff-text)',whiteSpace:'nowrap' }}
            >{t('calendar.viewCalendar')}</button>
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
  const { t } = useTranslation();
  const months = t('calendar.months', { returnObjects: true }) as string[];
  const dayNames = t('calendar.daysShort', { returnObjects: true }) as string[];
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
  const [selectedProjects, setSelectedProjects] = useState<Set<string>>(new Set());
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

  // Filter events — modèle inclusion (même que ProjetCalendrier)
  const visibleEvents = events.filter(ev =>
    (selectedProjects.size === 0 || selectedProjects.has(ev.projectId ?? '')) &&
    (selectedEventTypes.size === 0 || selectedEventTypes.has(ev.eventTypeId))
  );

  const toggleEventType = (id: string) => setSelectedEventTypes(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
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

  const toggleProject = (id: string) => setSelectedProjects(s => {
    const n = new Set(s); n.has(id) ? n.delete(id) : n.add(id); return n;
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
    ? `${months[cur.getMonth()]} ${cur.getFullYear()}`
    : view==='week'
    ? `${months[startOfWeek(cur).getMonth()]} ${startOfWeek(cur).getFullYear()}`
    : `${dayNames[(cur.getDay()+6)%7]} ${cur.getDate()} ${months[cur.getMonth()]}`;

  const handleDeleteEvent = (id: string) => { deleteEvent(id); setSelectedEvent(null); };

  const [upcomingExpanded, setUpcomingExpanded] = useState(false);

  // Upcoming events
  const allUpcoming = [...visibleEvents]
    .filter(ev=>ev.startDate>=TODAY)
    .sort((a,b)=>a.startDate.getTime()-b.startDate.getTime());
  const UPCOMING_VISIBLE = 3;
  const upcoming = upcomingExpanded ? allUpcoming : allUpcoming.slice(0, UPCOMING_VISIBLE);

  return (
    <div style={{ height:'100%',display:'flex',overflow:'hidden' }}>
      {/* Sidebar */}
      <div style={{ width:240,flexShrink:0,borderRight:'1px solid var(--border)',display:'flex',flexDirection:'column',overflow:'hidden' }}>
        {/* Zone scrollable : actions + filtres — indépendante des « Prochains événements » pour que les filtres ne bougent pas */}
        <div style={{ flex:1,minHeight:0,overflowY:'auto',padding:16,display:'flex',flexDirection:'column',gap:20 }}>
        <SFButton variant="primary" icon="plus" onClick={()=>{setCreateDate(new Date(TODAY));setShowCreate(true);}}>{t('calendar.newEvent')}</SFButton>

        <MiniCalendar cur={cur} onSelect={d=>{setCur(d);setView('day');}} />

        {/* Project filters */}
        {(()=>{
          const allProjects = [{ id: '', name: t('calendar.withoutProject'), color: 'var(--text-3)' }, ...PROJECTS.filter(p=>p.status!=='neutral').map(p=>({ id: p.id, name: p.name, color: p.clientColor }))];
          const hasFilter = selectedProjects.size > 0;
          return (
            <div>
              <div style={{ display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:8 }}>
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>{t('calendar.myProjects')}</p>
                {hasFilter && (
                  <button onClick={()=>setSelectedProjects(new Set())} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:9,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0,textDecoration:'underline' }}>
                    {t('calendar.showAll')}
                  </button>
                )}
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                {allProjects.map(p=>{
                  const active = !hasFilter || selectedProjects.has(p.id);
                  return (
                    <button key={p.id} onClick={()=>toggleProject(p.id)}
                      style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:8,border:'none',background:active&&hasFilter?'rgba(255,255,255,0.04)':'transparent',cursor:'pointer',textAlign:'left',opacity:active?1:0.35,transition:'all 0.15s',width:'100%' }}
                    >
                      <div style={{ width:10,height:10,borderRadius:'50%',background:p.color,flexShrink:0 }} />
                      <span style={{ fontSize:12,color:'var(--text-2)',flex:1,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',fontStyle:p.id===''?'italic':undefined }}>{p.name}</span>
                      {active&&hasFilter&&<SFIcon name="check" size={11} color="var(--text-3)" />}
                    </button>
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
                <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>{t('calendar.eventTypes')}</p>
                {hasFilter && (
                  <button onClick={()=>setSelectedEventTypes(new Set())} style={{ background:'none',border:'none',color:'var(--text-3)',fontSize:9,cursor:'pointer',fontFamily:'var(--ff-mono)',padding:0,textDecoration:'underline' }}>
                    {t('calendar.showAll')}
                  </button>
                )}
              </div>
              <div style={{ display:'flex',flexDirection:'column',gap:4 }}>
                {eventTypes.map(et=>{
                  const active = !hasFilter || selectedEventTypes.has(et.id);
                  return (
                    <button key={et.id} onClick={()=>toggleEventType(et.id)}
                      style={{ display:'flex',alignItems:'center',gap:8,padding:'5px 8px',borderRadius:8,border:'none',background:active&&hasFilter?'rgba(255,255,255,0.04)':'transparent',cursor:'pointer',textAlign:'left',opacity:active?1:0.35,transition:'all 0.15s',width:'100%' }}
                    >
                      <div style={{ width:10,height:10,borderRadius:'50%',background:et.color,flexShrink:0 }} />
                      <span style={{ fontSize:12,color:'var(--text-2)',flex:1 }}>{et.label}</span>
                      {active&&hasFilter&&<SFIcon name="check" size={11} color="var(--text-3)" />}
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        </div>{/* fin zone scrollable filtres */}

        {/* Prochains événements — panneau ancré au bas */}
        <div style={{ flexShrink:0,borderTop:'1px solid var(--border)',padding:'12px 16px',display:'flex',flexDirection:'column',gap:8 }}>
          <p style={{ fontFamily:'var(--ff-mono)',fontSize:9,color:'var(--text-3)',textTransform:'uppercase',letterSpacing:'0.07em' }}>{t('calendar.upcomingEvents')}</p>
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
                    {ev.startDate.getDate()} {months[ev.startDate.getMonth()].slice(0,3).toLowerCase()}
                    {!ev.allDay && ` · ${fmtTime(ev.startDate)}`}
                  </p>
                </div>
              </div>
            ))}
            {allUpcoming.length > UPCOMING_VISIBLE && (
              <button onClick={()=>setUpcomingExpanded(x=>!x)}
                style={{ display:'flex',alignItems:'center',gap:4,background:'none',border:'none',color:'var(--text-3)',fontSize:10,fontFamily:'var(--ff-mono)',cursor:'pointer',padding:'2px 4px',alignSelf:'flex-start',transition:'color 0.12s' }}
                onMouseEnter={e=>(e.currentTarget.style.color='var(--text-2)')}
                onMouseLeave={e=>(e.currentTarget.style.color='var(--text-3)')}
              >
                <SFIcon name={upcomingExpanded?'chevron-up':'chevron-down'} size={11} />
                {upcomingExpanded ? t('calendar.collapse') : t('calendar.morePlural', { count: allUpcoming.length - UPCOMING_VISIBLE })}
              </button>
            )}
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
              {t('calendar.today')}
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
            {([['month',t('calendar.viewMonth'),'M'],['week',t('calendar.viewWeek'),'W'],['day',t('calendar.viewDay'),'J']] as [CalView,string,string][]).map(([v,label,key],i)=>(
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
