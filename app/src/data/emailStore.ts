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

export async function sendEmail(to: string, subject: string, html: string): Promise<void> {
  try {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.access_token) return;
    const res = await fetch('/api/send-email', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${session.access_token}` },
      body: JSON.stringify({ to, subject, html }),
    });
    if (!res.ok) console.error('sendEmail failed', await res.text());
  } catch (err) {
    console.error('sendEmail failed', err);
  }
}
