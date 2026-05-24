import { supabase } from '../supabaseClient';
import { logError } from '../utils/errorLogger';
import { readStoredAuthTokens } from './secureAuthStorage';

const getToken = async () => {
  const stored = readStoredAuthTokens();
  if (stored?.access_token) return stored.access_token;

  for (let i = 0; i < 10; i++) {
    try {
      const { data } = await supabase.auth.getSession();
      if (data?.session?.access_token) return data.session.access_token;
    } catch { }
    await new Promise(r => setTimeout(r, 200));
  }

  try {
    const { data } = await supabase.auth.refreshSession();
    if (data?.session?.access_token) return data.session.access_token;
  } catch { }

  return null;
};

const invokeUsernameRegistry = async (body) => {
  const token = await getToken();
  if (!token) throw new Error('SESSION_LOST');

  const response = await fetch(`${import.meta.env.VITE_SUPABASE_URL}/functions/v1/username-registry`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
  });

  let data = {};
  const rawText = await response.text();
  try {
    data = rawText ? JSON.parse(rawText) : {};
  } catch {
    data = { error: rawText || '' };
  }

  if (!response.ok) {
    throw new Error(
      data?.error ||
      rawText ||
      `Username service request failed (HTTP ${response.status}).`
    );
  }
  if (data?.error) throw new Error(data.error);
  return data || {};
};

export const ensureUsernamesForUsers = async (users) => {
  const list = Array.isArray(users) ? users.filter((user) => user?.id) : [];
  if (!list.length) return [];

  let response = {};
  try {
    response = await invokeUsernameRegistry({
      action: 'ensure',
      users: list.map((user) => ({
        id: user.id,
        full_name: user.full_name || '',
        created_at: user.created_at || null,
      })),
    });
  } catch (error) {
    logError({ message: 'Username registry unavailable; continuing without username hydration', source: 'usernames', details: error });
    return list.map((user) => ({
      ...user,
      username: user.username || '',
    }));
  }

  const usernamesByUserId = response?.usernames || {};
  return list.map((user) => ({
    ...user,
    username: usernamesByUserId[user.id] || user.username || '',
  }));
};

export const ensureUsernameForUser = async (user) => {
  try {
    const [result] = await ensureUsernamesForUsers(user ? [user] : []);
    return result || user || null;
  } catch {
    return user || null;
  }
};

export const updateUsernameForUser = async ({ userId, username }) => {
  const response = await invokeUsernameRegistry({
    action: 'update',
    userId,
    username,
  });
  return response?.username || '';
};
