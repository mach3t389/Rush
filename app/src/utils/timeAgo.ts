// Shared relative-time formatter — takes an ISO timestamp string (not a
// pre-rendered label) so the displayed text is always computed from the
// real time elapsed, rather than frozen at whatever string was stored when
// the record was created or last saved.
type TFunc = (key: string, opts?: Record<string, unknown>) => string;

export function timeAgo(iso: string, t: TFunc): string {
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return iso; // legacy pre-rendered labels, if any linger
  const diff = Date.now() - ts;
  const mins = Math.floor(diff / 60000);
  if (mins < 1)   return t('activity.now');
  if (mins < 60)  return t('activity.minutesAgo', { count: mins });
  const hours = Math.floor(mins / 60);
  if (hours < 24) return t('activity.hoursAgo', { count: hours });
  if (hours < 48) return t('activity.yesterday');
  return t('activity.daysAgo', { count: Math.floor(hours / 24) });
}
