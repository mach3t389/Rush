// Thin client for app/api/send-email.ts (Resend-backed). Fire-and-forget,
// like pushToGoogleCalendar in eventStore.ts — a failed email must never
// block or roll back the Rush-side action that triggered it (creating an
// invitation, posting a comment, etc.).
//
// Demo sessions never send real email (no real recipient, would be
// pointless/spammy against a fake address) — callers should check
// isDemoSession() themselves before calling this, same as every other
// demo/real dual-path store in this app.

import { supabase } from './supabaseClient';

interface SendEmailOpts {
  // Quand les deux sont fournis, l'API vérifie les notif_prefs du
  // destinataire pour cette clé d'événement et saute l'envoi en silence
  // s'il a désactivé ce courriel — voir NOTIF_EVENTS dans notifPrefsStore.ts.
  eventKey?: string;
  recipientUserId?: string;
}

// Fire-and-forget, comme pushToGoogleCalendar dans eventStore.ts — un
// échec de courriel ne doit jamais bloquer ni annuler l'action Rush qui
// l'a déclenché.
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
