import { SFIcon } from '../ui';
import { fmtTime } from './calendarUtils';
import type { CalEvent } from './calendarUtils';

export function ClientEventDetail({ event, onClose }: { event: CalEvent; onClose: () => void }) {
  return (
    <>
      <div onClick={onClose} style={{ position: 'fixed', inset: 0, zIndex: 190, background: 'rgba(0,0,0,0.5)' }} />
      <div style={{
        position: 'fixed', top: '50%', left: '50%', transform: 'translate(-50%, -50%)', zIndex: 200,
        width: 360, background: 'var(--surface)', border: '1px solid var(--border-2)', borderRadius: 14,
        padding: 20, boxShadow: '0 16px 48px rgba(0,0,0,0.5)',
      }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10, marginBottom: 14 }}>
          <div style={{ width: 4, height: 20, borderRadius: 2, background: event.eventTypeColor, flexShrink: 0, marginTop: 2 }} />
          <p style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', flex: 1 }}>{event.title}</p>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 2 }}>
            <SFIcon name="x" size={16} color="var(--text-3)" />
          </button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <SFIcon name="calendar" size={13} color="var(--text-3)" />
          <span style={{ fontSize: 12, color: 'var(--text-2)' }}>
            {event.startDate.toLocaleDateString()}
            {!event.allDay && ` · ${fmtTime(event.startDate)} – ${fmtTime(event.endDate)}`}
          </span>
        </div>
        {event.description && (
          <p style={{ fontSize: 13, color: 'var(--text-2)', marginTop: 10, whiteSpace: 'pre-wrap' }}>{event.description}</p>
        )}
      </div>
    </>
  );
}
