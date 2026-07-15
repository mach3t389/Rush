import { createHmac } from 'crypto';

const SECRET = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const MAX_AGE_MS = 10 * 60 * 1000; // 10 minutes — plenty for a consent-screen round trip

export function signOAuthState(studioId: string): string {
  const payload = `${studioId}.${Date.now()}`;
  const sig = createHmac('sha256', SECRET).update(payload).digest('hex');
  return Buffer.from(`${payload}.${sig}`).toString('base64url');
}

export function verifyOAuthState(state: string): { studioId: string } | null {
  try {
    const decoded = Buffer.from(state, 'base64url').toString('utf8');
    const [studioId, tsStr, sig] = decoded.split('.');
    if (!studioId || !tsStr || !sig) return null;
    const payload = `${studioId}.${tsStr}`;
    const expectedSig = createHmac('sha256', SECRET).update(payload).digest('hex');
    if (sig !== expectedSig) return null;
    if (Date.now() - Number(tsStr) > MAX_AGE_MS) return null;
    return { studioId };
  } catch {
    return null;
  }
}
