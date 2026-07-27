import { supabase } from './supabaseClient';

interface SendEmailOpts {
  // When both are set, the API checks the recipient's own notif_prefs for
  // this event key and silently skips the send if they've turned email off —
  // see NOTIF_EVENTS in notifPrefsStore.ts for valid keys.
  eventKey?: string;
  recipientUserId?: string;
}

// Fire-and-forget, mirrors pushToGoogleCalendar in eventStore.ts — a failed
// email must never block or roll back the action that triggered it.
export async function sendEmail(to: string, subject: string, html: string, opts?: SendEmailOpts): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ to, subject, html, eventKey: opts?.eventKey, recipientUserId: opts?.recipientUserId }),
    });
    if (!res.ok) console.error('sendEmail failed', await res.text());
  } catch (err) {
    console.error('sendEmail failed', err);
  }
}
