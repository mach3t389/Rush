// app/api/send-email.ts
//
// Generic transactional-email endpoint backed by Resend. Requires the
// RESEND_API_KEY environment variable (Vercel project settings — get a key
// at resend.com). Sends from RESEND_FROM_EMAIL if set, otherwise falls back
// to Resend's shared test address (onboarding@resend.dev) which works with
// no domain setup but is only meant for getting started — replace with a
// verified domain address before relying on this for real users.
//
// Any authenticated Rush user can call this (checked via their Supabase
// session token, same pattern as google-calendar-sync.ts's push handler) —
// it's a shared utility invoked by feature-specific senders (invitations,
// notifications, etc.), not gated per-feature here.

import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { Resend } from 'resend';

interface SendEmailBody {
  to: string;
  subject: string;
  html: string;
  eventKey?: string;
  recipientUserId?: string;
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { to, subject, html } = req.body as SendEmailBody;
  if (!to || !subject || !html) {
    res.status(400).json({ error: 'Invalid request body' });
    return;
  }

  const authHeader = req.headers.authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;
  if (!token) {
    res.status(401).json({ error: 'Missing authorization token' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    res.status(401).json({ error: 'Invalid or expired token' });
    return;
  }

  const { eventKey, recipientUserId } = req.body as SendEmailBody;
  if (eventKey && recipientUserId) {
    const { data: prefsRow } = await supabaseAdmin
      .from('notif_prefs')
      .select('prefs')
      .eq('user_id', recipientUserId)
      .maybeSingle();
    const prefs = (prefsRow?.prefs as Record<string, { email?: boolean }> | undefined) ?? {};
    // Absence de préférence = comportement par défaut (voir DEFAULTS dans
    // notifPrefsStore.ts) — seule une valeur explicite `false` bloque l'envoi.
    if (prefs[eventKey]?.email === false) {
      res.status(200).json({ ok: true, skipped: true });
      return;
    }
  }

  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY is not configured');
    res.status(500).json({ error: 'Email sending is not configured' });
    return;
  }

  try {
    const resend = new Resend(process.env.RESEND_API_KEY);
    const { error } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to,
      subject,
      html,
    });
    if (error) {
      console.error('Resend send failed:', error);
      res.status(502).json({ error: 'Failed to send email' });
      return;
    }
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error('Failed to send email:', error);
    res.status(500).json({ error: 'Failed to send email' });
  }
}
