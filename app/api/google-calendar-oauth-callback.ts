import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { verifyOAuthState } from './_lib/googleCalendarAuth.js';

export default async function handler(req: VercelRequest, res: VercelResponse) {
  const code = req.query.code as string | undefined;
  const state = req.query.state as string | undefined;

  const redirectBase = process.env.GOOGLE_OAUTH_REDIRECT_URI!.replace('/api/google-calendar-oauth-callback', '');

  if (!code || !state) {
    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
    return;
  }

  const verified = verifyOAuthState(state);
  if (!verified) {
    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
    return;
  }

  try {
    const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        code,
        client_id: process.env.GOOGLE_CLIENT_ID!,
        client_secret: process.env.GOOGLE_CLIENT_SECRET!,
        redirect_uri: process.env.GOOGLE_OAUTH_REDIRECT_URI!,
        grant_type: 'authorization_code',
      }),
    });

    if (!tokenRes.ok) {
      console.error('Google token exchange failed:', await tokenRes.text());
      res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
      return;
    }

    const tokens = await tokenRes.json() as {
      access_token: string;
      refresh_token?: string;
      expires_in: number;
    };

    if (!tokens.refresh_token) {
      // Google only returns a refresh_token on the FIRST consent (or when
      // prompt=consent forces re-consent, which oauth-start always sets) —
      // if it's still missing here, something is wrong with the request.
      console.error('No refresh_token in Google response — check prompt=consent is set in oauth-start');
      res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
      return;
    }

    const supabaseAdmin = createClient(
      process.env.VITE_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    // Who to record as connected_by_user_id: any member of this studio at
    // the time of connection — the first row found is fine, this field is
    // informational only (e.g. "connected by Alice on ..." in a future UI).
    const { data: anyMember } = await supabaseAdmin
      .from('studio_members')
      .select('user_id')
      .eq('studio_id', verified.studioId)
      .limit(1)
      .maybeSingle();

    const { error: upsertError } = await supabaseAdmin
      .from('google_calendar_connections')
      .upsert({
        studio_id: verified.studioId,
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        access_token_expires_at: new Date(Date.now() + tokens.expires_in * 1000).toISOString(),
        google_calendar_id: 'primary',
        connected_by_user_id: anyMember?.user_id ?? null,
        connected_at: new Date().toISOString(),
        sync_token: null, // force a fresh full sync on the next pull
      }, { onConflict: 'studio_id' });

    if (upsertError) {
      console.error('Failed to store Google Calendar connection:', upsertError);
      res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
      return;
    }

    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=connected`);
  } catch (error) {
    console.error('Google OAuth callback failed:', error);
    res.redirect(302, `${redirectBase}/parametres?section=integrations&google=error`);
  }
}
