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
  const authHeaderCron = req.headers.authorization || '';
  if (authHeaderCron === `Bearer ${process.env.CRON_SECRET}`) {
    return handleDigestRun(req, res);
  }

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
      .select('prefs, digest_mode')
      .eq('user_id', recipientUserId)
      .maybeSingle();
    // Le mode récap coupe TOUS les courriels individuels, peu importe la
    // préférence par catégorie — c'est le point du mode "un seul résumé
    // par jour plutôt que du courriel au fil de l'eau".
    if (prefsRow?.digest_mode) {
      res.status(200).json({ ok: true, skipped: true, reason: 'digest_mode' });
      return;
    }
    const prefs = (prefsRow?.prefs as Record<string, { email?: boolean }> | undefined) ?? {};
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

// Appelée toutes les heures par un service cron externe (voir CLAUDE.md —
// même mécanisme que google-calendar-sync.ts, contournant la limite d'une
// exécution/jour du cron natif Vercel Hobby). Trouve chaque utilisateur
// dont l'heure de récap choisie correspond à l'heure actuelle, agrège son
// activité depuis son dernier récap, envoie un résumé condensé.
async function handleDigestRun(req: VercelRequest, res: VercelResponse) {
  if (!process.env.RESEND_API_KEY) {
    res.status(200).json({ ok: true, skipped: true, reason: 'email not configured' });
    return;
  }

  const supabaseAdmin = createClient(
    process.env.VITE_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  );

  const currentHour = new Date().getHours();
  const { data: dueUsers, error: dueError } = await supabaseAdmin
    .from('notif_prefs')
    .select('user_id, last_digest_sent_at')
    .eq('digest_mode', true)
    .eq('digest_hour', currentHour);

  if (dueError) { console.error('handleDigestRun: fetching due users failed', dueError); res.status(500).json({ error: 'failed' }); return; }
  if (!dueUsers || dueUsers.length === 0) { res.status(200).json({ ok: true, sent: 0 }); return; }

  const resend = new Resend(process.env.RESEND_API_KEY);
  let sent = 0;

  for (const row of dueUsers) {
    const since = row.last_digest_sent_at ?? new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

    const { data: notifRows, error: notifError } = await supabaseAdmin
      .from('notifications')
      .select('kind, count')
      .contains('recipient_ids', [row.user_id])
      .in('kind', ['comment', 'mention', 'approval'])
      .gt('timestamp', new Date(since).getTime());

    if (notifError) { console.error('handleDigestRun: fetching notifications failed', notifError, row.user_id); continue; }
    if (!notifRows || notifRows.length === 0) continue; // pas d'activité, pas de courriel

    const totals: Record<string, number> = { comment: 0, mention: 0, approval: 0 };
    for (const n of notifRows) totals[n.kind] = (totals[n.kind] ?? 0) + (n.count ?? 1);

    const { data: authUser } = await supabaseAdmin.auth.admin.getUserById(row.user_id);
    const email = authUser?.user?.email;
    if (!email) continue;

    const parts: string[] = [];
    if (totals.comment > 0)  parts.push(`<strong>${totals.comment} commentaire${totals.comment > 1 ? 's' : ''}</strong>`);
    if (totals.mention > 0)  parts.push(`<strong>${totals.mention} mention${totals.mention > 1 ? 's' : ''}</strong>`);
    if (totals.approval > 0) parts.push(`<strong>${totals.approval} demande${totals.approval > 1 ? 's' : ''} d'approbation</strong>`);

    const html = `<p>Votre récap Rush</p><p>Depuis votre dernier récap : ${parts.join(', ')}.</p><p><a href="${process.env.VITE_APP_URL ?? 'https://rush.app'}">Voir le détail dans Rush →</a></p>`;

    const { error: sendError } = await resend.emails.send({
      from: process.env.RESEND_FROM_EMAIL || 'onboarding@resend.dev',
      to: email,
      subject: 'Votre récap Rush',
      html,
    });
    if (sendError) { console.error('handleDigestRun: send failed', sendError, row.user_id); continue; }

    await supabaseAdmin.from('notif_prefs').update({ last_digest_sent_at: new Date().toISOString() }).eq('user_id', row.user_id);
    sent++;
  }

  res.status(200).json({ ok: true, sent });
}
