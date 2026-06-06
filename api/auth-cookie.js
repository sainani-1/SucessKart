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

const readBody = (req) =>
  new Promise((resolve, reject) => {
    let body = '';
    req.on('data', (chunk) => {
      body += chunk;
      if (body.length > 100_000) {
        req.destroy();
        reject(new Error('Request body is too large.'));
      }
    });
    req.on('end', () => {
      try {
        resolve(body ? JSON.parse(body) : {});
      } catch {
        reject(new Error('Invalid JSON body.'));
      }
    });
    req.on('error', reject);
  });

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

const validateSupabaseAccessToken = async (accessToken) => {
  if (!SUPABASE_URL || !SUPABASE_ANON_KEY) {
    throw new Error('SUPABASE_URL and SUPABASE_ANON_KEY must be configured for auth cookies.');
  }

  const response = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
      apikey: SUPABASE_ANON_KEY,
    },
  });

  if (!response.ok) return null;
  return response.json();
};

const appendCookies = (res, cookies) => {
  cookies.forEach(cookie => res.appendHeader('Set-Cookie', cookie));
};

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Methods', 'POST, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-CSRF-Token');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  if (req.method === 'OPTIONS') {
    res.statusCode = 204;
    res.end();
    return;
  }

  if (req.method === 'DELETE') {
    appendCookies(res, clearCookies());
    json(res, 200, { ok: true });
    return;
  }

  if (req.method !== 'POST') {
    json(res, 405, { error: 'Method not allowed.' });
    return;
  }

  try {
    const body = await readBody(req);
    const accessToken = String(body.accessToken || '');
    const refreshToken = String(body.refreshToken || '');
    const expiresIn = Math.min(Number(body.expiresIn || FIFTEEN_MINUTES), FIFTEEN_MINUTES);

    if (!accessToken || !refreshToken) {
      res.setHeader('Set-Cookie', clearCookies());
      json(res, 400, { error: 'Missing auth tokens.' });
      return;
    }

    const user = await validateSupabaseAccessToken(accessToken);
    if (!user?.id) {
      res.setHeader('Set-Cookie', clearCookies());
      json(res, 401, { error: 'Invalid access token.' });
      return;
    }

    const csrf = crypto.randomUUID();
    appendCookies(res, [
      serializeCookie(ACCESS_COOKIE, accessToken, { maxAge: expiresIn }),
      serializeCookie(REFRESH_COOKIE, refreshToken, { maxAge: THIRTY_DAYS }),
      serializeReadableCookie(CSRF_COOKIE, csrf, { maxAge: THIRTY_DAYS }),
    ]);
    json(res, 200, { ok: true });
  } catch (error) {
    json(res, 500, { error: error.message || 'Could not set auth cookies.' });
  }
}
