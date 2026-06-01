const AUTH_STORAGE_KEY = 'SucessKart-auth';
const LEGACY_AUTH_STORAGE_KEYS = [
  AUTH_STORAGE_KEY,
  'supabase.auth.token',
];

const isBrowser = typeof window !== 'undefined';

const getSessionStorage = () => {
  if (!isBrowser) return null;
  try {
    const storage = window.sessionStorage;
    const probe = '__SucessKart_session_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
};

const getLocalStorage = () => {
  if (!isBrowser) return null;
  try {
    const storage = window.localStorage;
    const probe = '__SucessKart_local_storage_probe__';
    storage.setItem(probe, '1');
    storage.removeItem(probe);
    return storage;
  } catch {
    return null;
  }
};

export const secureSessionStorage = {
  getItem(key) {
    return getSessionStorage()?.getItem(key) || getLocalStorage()?.getItem(key) || null;
  },
  setItem(key, value) {
    getSessionStorage()?.setItem(key, value);
    getLocalStorage()?.setItem(key, value);
  },
  removeItem(key) {
    getSessionStorage()?.removeItem(key);
    getLocalStorage()?.removeItem(key);
  },
};

export const migrateLegacyAuthStorage = () => {
  if (!isBrowser) return;
  const sessionStorage = getSessionStorage();
  if (!sessionStorage) return;

  LEGACY_AUTH_STORAGE_KEYS.forEach((key) => {
    try {
      const legacyValue = window.localStorage.getItem(key);
      const currentValue = sessionStorage.getItem(key);
      if (legacyValue && !currentValue) {
        sessionStorage.setItem(key, legacyValue);
      }
      if (key !== AUTH_STORAGE_KEY) {
        window.localStorage.removeItem(key);
      }
    } catch {
      // Storage migration is best-effort; auth can still restore from sessionStorage.
    }
  });
};

export const removeLegacyLocalAuthArtifacts = () => {
  if (!isBrowser) return;
  try {
    Object.keys(window.localStorage)
      .filter((key) => key.startsWith('single_session_key_'))
      .forEach((key) => window.localStorage.removeItem(key));
    window.localStorage.removeItem('single_session_device_id');
    window.localStorage.removeItem('SucessKart-login-state');
  } catch {
    // Ignore cleanup failures.
  }
};

export const clearSecureAuthStorage = () => {
  secureSessionStorage.removeItem(AUTH_STORAGE_KEY);
  removeLegacyLocalAuthArtifacts();
};

export const readStoredAuthTokens = () => {
  try {
    const raw = secureSessionStorage.getItem(AUTH_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const accessToken = parsed?.access_token || parsed?.currentSession?.access_token;
    const refreshToken = parsed?.refresh_token || parsed?.currentSession?.refresh_token;
    if (!accessToken || !refreshToken) return null;
    return {
      access_token: accessToken,
      refresh_token: refreshToken,
    };
  } catch {
    return null;
  }
};
