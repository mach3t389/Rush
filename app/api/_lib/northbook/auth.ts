import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import type { VercelRequest } from '@vercel/node';
import { createClient } from '@supabase/supabase-js';
import { HttpError, NORTHBOOK_SCOPES, type IntegrationContext, type NorthbookScope } from './types.js';

export const ACCESS_TOKEN_TTL_SECONDS = 15 * 60;
export const REFRESH_TOKEN_TTL_DAYS = 90;

export function adminClient() {
  const url = process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new HttpError(500, 'server_misconfigured');
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function hashSecret(value: string): string {
  return createHash('sha256').update(value, 'utf8').digest('hex');
}

export function randomSecret(): string {
  return randomBytes(32).toString('base64url');
}

export function verifyPkce(verifier: string, challenge: string): boolean {
  const actual = createHash('sha256').update(verifier, 'utf8').digest('base64url');
  const a = Buffer.from(actual);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

function bearer(req: VercelRequest): string {
  const header = req.headers.authorization ?? '';
  if (!header.startsWith('Bearer ')) throw new HttpError(401, 'missing_token');
  const token = header.slice(7).trim();
  if (!token) throw new HttpError(401, 'missing_token');
  return token;
}

export async function authenticatedRushUser(req: VercelRequest) {
  const client = adminClient();
  const { data: { user }, error } = await client.auth.getUser(bearer(req));
  if (error || !user) throw new HttpError(401, 'invalid_user_token');
  return { client, user };
}

export async function assertStudioAdministrator(studioId: string, userId: string) {
  const client = adminClient();
  const { data: studio, error: studioError } = await client
    .from('studios')
    .select('id, name, owner_user_id, accounting_mode, accounting_currency, northbook_integration_enabled')
    .eq('id', studioId)
    .maybeSingle();
  if (studioError) throw studioError;
  if (!studio) throw new HttpError(404, 'studio_not_found');

  let allowed = studio.owner_user_id === userId;
  if (!allowed) {
    const { data: member, error } = await client
      .from('studio_members')
      .select('access_level')
      .eq('studio_id', studioId)
      .eq('user_id', userId)
      .maybeSingle();
    if (error) throw error;
    allowed = member?.access_level === 'owner' || member?.access_level === 'admin';
  }
  if (!allowed) throw new HttpError(403, 'admin_required');
  if (!studio.northbook_integration_enabled && process.env.NORTHBOOK_INTEGRATION_ALLOW_ALL !== 'true') {
    throw new HttpError(403, 'pilot_not_enabled');
  }
  return studio;
}

export async function authenticateIntegration(
  req: VercelRequest,
  requiredScopes: NorthbookScope[] = [],
): Promise<IntegrationContext> {
  const client = adminClient();
  const tokenHash = hashSecret(bearer(req));
  const { data: token, error } = await client
    .from('northbook_access_tokens')
    .select('id, connection_id, expires_at, revoked_at')
    .eq('token_hash', tokenHash)
    .maybeSingle();
  if (error) throw error;
  if (!token || token.revoked_at || Date.parse(token.expires_at) <= Date.now()) {
    throw new HttpError(401, 'invalid_or_expired_token');
  }

  const { data: connection, error: connectionError } = await client
    .from('northbook_integration_connections')
    .select('id, studio_id, scopes, status')
    .eq('id', token.connection_id)
    .maybeSingle();
  if (connectionError) throw connectionError;
  if (!connection || connection.status !== 'active') throw new HttpError(401, 'connection_revoked');
  const scopes = (connection.scopes ?? []).filter((scope: string) =>
    NORTHBOOK_SCOPES.includes(scope as NorthbookScope)) as NorthbookScope[];
  if (requiredScopes.some(scope => !scopes.includes(scope))) throw new HttpError(403, 'insufficient_scope');

  const { data: studio, error: studioError } = await client
    .from('studios')
    .select('name, accounting_currency')
    .eq('id', connection.studio_id)
    .single();
  if (studioError) throw studioError;
  void client.from('northbook_integration_connections')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', connection.id);
  return {
    connectionId: connection.id,
    studioId: connection.studio_id,
    scopes,
    accountingCurrency: studio.accounting_currency,
    studioName: studio.name,
  };
}

export async function issueTokenPair(connectionId: string) {
  const client = adminClient();
  const accessToken = randomSecret();
  const refreshToken = randomSecret();
  const accessExpiresAt = new Date(Date.now() + ACCESS_TOKEN_TTL_SECONDS * 1000).toISOString();
  const refreshExpiresAt = new Date(Date.now() + REFRESH_TOKEN_TTL_DAYS * 86_400_000).toISOString();
  const { data: refreshRow, error } = await client.from('northbook_refresh_tokens').insert({
    connection_id: connectionId,
    token_hash: hashSecret(refreshToken),
    expires_at: refreshExpiresAt,
  }).select('id').single();
  if (error) throw error;
  const { error: accessError } = await client.from('northbook_access_tokens').insert({
    connection_id: connectionId,
    token_hash: hashSecret(accessToken),
    expires_at: accessExpiresAt,
  });
  if (accessError) throw accessError;
  return { accessToken, refreshToken, refreshTokenId: refreshRow.id, expiresIn: ACCESS_TOKEN_TTL_SECONDS };
}
