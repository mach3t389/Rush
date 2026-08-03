// app/api/google-calendar-connection.ts
//
// Consolidated organisation-level Google Calendar connection endpoint.
// Vercel's Hobby plan caps a deployment at 12 serverless functions, so the
// three previously-separate endpoints (oauth-start, status, disconnect) are
// merged here and dispatched by an `action` param. Each handler body below
// is a verbatim copy of its original file — only the function name and the
// dispatcher wrapper are new.
//
//   GET  ?action=start&studioId=      -> { url }                (was google-calendar-oauth-start)
//   GET  ?action=status&studioId=     -> { connected, lastSyncedAt } (was google-calendar-status)
//   POST { action:'disconnect', studioId } -> { ok }            (was google-calendar-disconnect)
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { signOAuthState } from './_lib/googleCalendarAuth.js';

// email/profile added so the callback can show which Google account is
// connected (Paramètres > Intégrations) — otherwise indistinguishable when
// a studio's connection gets replaced by a teammate's different account.
const SCOPE = 'https://www.googleapis.com/auth/calendar https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile';

interface DisconnectBody {
  studioId: string;
}

async function startHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const studioId = req.query.studioId as string | undefined;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request' });
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

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const state = signOAuthState(studioId);
  const params = new URLSearchParams({
    client_id: process.env.GOOGLE_CLIENT_ID!,
    redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
    response_type: 'code',
    scope: SCOPE,
    access_type: 'offline', // required to receive a refresh_token
    prompt: 'consent',      // forces a refresh_token even on repeat connections
    state,
  });

  res.status(200).json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
}

async function statusHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const studioId = req.query.studioId as string | undefined;
  if (!studioId) {
    res.status(400).json({ error: 'Invalid request' });
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

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const { data: connection } = await supabaseAdmin
    .from('google_calendar_connections')
    .select('last_synced_at, connected_google_email, connected_google_name')
    .eq('studio_id', studioId)
    .maybeSingle();

  res.status(200).json({
    connected: !!connection,
    lastSyncedAt: connection?.last_synced_at ?? null,
    connectedEmail: connection?.connected_google_email ?? null,
    connectedName: connection?.connected_google_name ?? null,
  });
}

async function disconnectHandler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'Method not allowed' });
    return;
  }

  const { studioId } = req.body as DisconnectBody;
  if (!studioId) {
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

  const { data: membership, error: membershipError } = await supabaseAdmin
    .from('studio_members')
    .select('id')
    .eq('user_id', user.id)
    .eq('studio_id', studioId)
    .maybeSingle();

  if (membershipError || !membership) {
    res.status(403).json({ error: 'Not a member of this studio' });
    return;
  }

  const { error } = await supabaseAdmin
    .from('google_calendar_connections')
    .delete()
    .eq('studio_id', studioId);

  if (error) {
    console.error('Failed to disconnect Google Calendar:', error);
    res.status(500).json({ error: 'Failed to disconnect' });
    return;
  }

  res.status(200).json({ ok: true });
}

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const action = (req.query.action as string | undefined)
    ?? (req.body && (req.body as { action?: string }).action)
    ?? '';
  switch (action) {
    case 'start': return startHandler(req, res);
    case 'status': return statusHandler(req, res);
    case 'disconnect': return disconnectHandler(req, res);
    default:
      res.status(400).json({ error: 'Unknown or missing action' });
  }
}
