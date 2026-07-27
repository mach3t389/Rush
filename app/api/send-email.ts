import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
  // Optional preference gate: when both are set, the recipient's own
  // notif_prefs row is checked server-side (their prefs aren't readable by
  // other users' clients under RLS) and the send is silently skipped if
  // they've turned email off for this event type.
  eventKey?: string;
  recipientUserId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const { to, subject, html, eventKey, recipientUserId } = req.body as SendEmailBody;
  if (!to || !subject || !html) { res.status(400).json({ error: 'Invalid request body' }); return; }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) { res.status(401).json({ error: 'Missing authorization token' }); return; }

  const supabaseAdmin = createClient(process.env.VITE_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) { res.status(401).json({ error: 'Invalid or expired token' }); return; }

  if (eventKey && recipientUserId) {
    const { data: prefsRow } = await supabaseAdmin
      .from('notif_prefs')
      .select('prefs')
      .eq('user_id', recipientUserId)
      .maybeSingle();
    const channelPrefs = (prefsRow?.prefs as Record<string, { email?: boolean }> | undefined)?.[eventKey];
    // No stored row/key = default (email on for mention/approval, see notifPrefsStore.ts DEFAULTS).
    if (channelPrefs && channelPrefs.email === false) { res.status(200).json({ ok: true, skipped: true }); return; }
  }

  if (!process.env.RESEND_API_KEY) { res.status(500).json({ error: 'Email sending is not configured' }); return; }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      html,
    });
    if (error) { res.status(502).json({ error: 'Failed to send email' }); return; }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('send-email failed', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
}
