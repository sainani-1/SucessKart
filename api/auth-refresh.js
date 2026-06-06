import crypto from 'crypto';

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL || '';
const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY || process.env.VITE_SUPABASE_ANON_KEY || '';
const ACCESS_COOKIE = 'sp_access';
const REFRESH_COOKIE = 'sp_refresh';
const CSRF_COOKIE = 'sp_csrf';
const FIFTEEN_MINUTES = 15 * 60;
const THIRTY_DAYS = 30 * 24 * 60 * 60;

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const parseCookies = (header = '') =>
  Object.fromEntries(
    String(header || '')
      .split(';')
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf('=');
        if (index === -1) return [part, ''];
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      })
  );

const serializeCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value || '')}`];
  parts.push('HttpOnly');
  parts.push('Path=' + (options.path || '/'));
  parts.push('SameSite=Lax');
  if (typeof window === 'undefined' || location.protocol === 'https:') parts.push('Secure');
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
};

const serializeReadableCookie = (name, value, options = {}) => {
  const parts = [`${name}=${encodeURIComponent(value || '')}`];
  parts.push('Path=' + (options.path || '/'));
  parts.push('SameSite=Lax');
  if (typeof window === 'undefined' || location.protocol === 'https:') parts.push('Secure');
  if (options.maxAge != null) parts.push(`Max-Age=${options.maxAge}`);
  return parts.join('; ');
};

const clearCookies = () => [
  serializeCookie(ACCESS_COOKIE, '', { maxAge: 0 }),
  serializeCookie(REFRESH_COOKIE, '', { maxAge: 0 }),
  serializeReadableCookie(CSRF_COOKIE, '', { maxAge: 0 }),
];

const refreshSupabaseSession = async (refreshToken) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured for auth refresh.');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/token?grant_type=refresh_token`, {
    method: 'POST',
    headers: {
      apikey: SUPABASE_ANON_KEY,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ refresh_token: refreshToken }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    return { error: payload?.error_description || payload?.msg || payload?.error || 'Refresh failed.' };
  }
  return { data: payload };
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const cookies = parseCookies(req.headers.cookie);
    const refreshToken = cookies[REFRESH_COOKIE];
    if (!refreshToken) {
      json(res, 401, { error: 'No refresh cookie.' });
      return;
    }

    const result = await refreshSupabaseSession(refreshToken);
    if (result.error || !result.data?.access_token || !result.data?.refresh_token) {
      clearCookies().forEach(cookie => res.appendHeader('Set-Cookie', cookie));
      json(res, 401, { error: result.error || 'Invalid refresh cookie.' });
      return;
    }

    const expiresIn = Math.min(Number(result.data.expires_in || FIFTEEN_MINUTES), FIFTEEN_MINUTES);
    json(res, 200, {
      ok: true,
      access_token: result.data.access_token,
      refresh_token: result.data.refresh_token,
      expires_in: result.data.expires_in,
      token_type: result.data.token_type,
      user: result.data.user || null,
    });
  } catch (error) {
    json(res, 500, { error: error.message || 'Could not refresh auth session.' });
  }
}
