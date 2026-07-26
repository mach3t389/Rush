import { useEffect, useMemo, useState } from 'react';
import { useParams } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { ClientProjectHeader } from '../../components/client/ClientProjectHeader';
import { MonthView } from '../../components/calendar/MonthView';
import { ClientEventDetail } from '../../components/calendar/ClientEventDetail';
import { SFIcon } from '../../components/ui';
import { TODAY, type CalEvent } from '../../components/calendar/calendarUtils';
import { getMyClientEvents, type ClientCalEvent } from '../../data/clientSessionStore';
import { getPreviewClientEvents } from '../../data/viewAsClientDataStore';
import { getViewAsUser } from '../../data/viewAsStore';

// Client-safe rebuild of the project Calendrier tab.
//
// Why this doesn't reuse ProjetCalendrier: that screen (and every studio-
// scoped store it touches) eventually resolves the current studio id, which
// silently PROVISIONS A NEW STUDIO for any authenticated user that has no
// studio_members row — exactly what a client-contact session is. Opening
// this tab must never write to the database. So this screen only ever calls
// getMyClientEvents(), which reads from RLS-scoped, client-safe tables and
// never touches studio resolution at all.
//
// Scope choices vs. the studio-side ProjetCalendrier:
// - Month view only (no week/day, no view switcher) — the read-only client
//   audience doesn't need it, and it keeps this screen simple.
// - No task-deadlines sidebar — getMyClientDeliverables() exists and could
//   feed one, but it's omitted here to keep this fix focused and low-risk;
//   can be added later as its own change if a client explicitly wants it.
// - No event creation/edit/drag-to-reschedule, no Google Calendar sharing,
//   no event-type CRUD — all either irrelevant or studio-scoped/dangerous
//   for a client view.

function toCalEvent(ev: ClientCalEvent): CalEvent {
  return {
    id: ev.id,
    title: ev.title,
    eventTypeId: '',
    projectId: ev.projectId,
    projectName: '',
    projectColor: ev.eventTypeColor,
    eventTypeColor: ev.eventTypeColor,
    eventTypeLabel: '',
    startDate: new Date(ev.startDate),
    endDate: new Date(ev.endDate),
    allDay: ev.allDay,
  };
}

export function ClientProjectCalendrier() {
  const { projectId } = useParams<{ projectId: string }>();
  const { t } = useTranslation();
  const [cur, setCur] = useState(new Date(TODAY));
  const [rawEvents, setRawEvents] = useState<ClientCalEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<CalEvent | null>(null);

  const viewAs = getViewAsUser();
  const isPreview = viewAs?.type === 'external';

  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    const fetch = isPreview ? getPreviewClientEvents([projectId]) : getMyClientEvents([projectId]);
    fetch.then(evs => { if (!cancelled) setRawEvents(evs); });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId, isPreview]);

  const events = useMemo(() => rawEvents.map(toCalEvent), [rawEvents]);

  const months = t('calendar.months', { returnObjects: true }) as string[];
  const title = `${months[cur.getMonth()]} ${cur.getFullYear()}`;

  const prev = () => setCur(d => new Date(d.getFullYear(), d.getMonth() - 1, 1));
  const next = () => setCur(d => new Date(d.getFullYear(), d.getMonth() + 1, 1));

  if (!projectId) return null;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
      <ClientProjectHeader projectId={projectId} />
      <div style={{ flex: 1, overflow: 'hidden', display: 'flex', flexDirection: 'column' }}>
        <div style={{ padding: '10px 20px', borderBottom: '1px solid var(--border)', display: 'flex', alignItems: 'center', gap: 12, flexShrink: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            <button onClick={() => setCur(new Date(TODAY))} style={{ padding: '5px 10px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', fontFamily: 'var(--ff-mono)', fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
              {t('calendar.today')}
            </button>
            <button onClick={prev} style={{ padding: '5px 7px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex' }}>
              <SFIcon name="chevron-left" size={14} />
            </button>
            <button onClick={next} style={{ padding: '5px 7px', borderRadius: 8, border: '1px solid var(--border)', background: 'var(--surface-2)', color: 'var(--text-2)', cursor: 'pointer', display: 'flex' }}>
              <SFIcon name="chevron-right" size={14} />
            </button>
          </div>
          <h2 style={{ fontSize: 16, fontWeight: 700, flex: 1 }}>{title}</h2>
        </div>

        <MonthView
          cur={cur}
          events={events}
          tasks={[]}
          onDayClick={() => {}}
          onEventClick={setSelectedEvent}
          onCellClick={() => {}}
        />
      </div>

      {selectedEvent && (
        <ClientEventDetail event={selectedEvent} onClose={() => setSelectedEvent(null)} />
      )}
    </div>
  );
}
