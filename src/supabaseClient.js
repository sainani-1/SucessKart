import { createClient } from '@supabase/supabase-js'
import { clearDailyLoginState, isDailyLoginExpired, readDailyLoginState, writeDailyLoginState } from './utils/dailySession';
import {
  migrateLegacyAuthStorage,
  removeLegacyLocalAuthArtifacts,
  secureSessionStorage
} from './utils/secureAuthStorage';
import { clearHttpOnlyAuthCookies, syncHttpOnlyAuthCookies } from './utils/authCookieBridge';
import {
  broadcastAuthSession,
  broadcastAuthSignOut,
  setupCrossTabAuthSync
} from './utils/crossTabAuth';

// NOTE: In a real deployment, these would be in a .env file.
// Since this is a generated demo, you must replace these with your Supabase credentials.

const supabaseUrl = import.meta.env.VITE_SUPABASE_URL || 'https://your-project.supabase.co'
const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'your-anon-key'

migrateLegacyAuthStorage();

if (typeof navigator !== 'undefined' && navigator.locks) {
  const orig = navigator.locks.request.bind(navigator.locks);
  navigator.locks.request = function (name, options, callback) {
    if (typeof options === 'function') {
      return orig(name, { timeout: 2000 }, options);
    }
    return orig(name, { ...options, timeout: options?.timeout ?? 2000 }, callback);
  };
}

export const supabase = createClient(supabaseUrl, supabaseKey, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: true,
    storage: secureSessionStorage,
    storageKey: 'SucessKart-auth',
    flowType: 'pkce',
  },
  global: {
    headers: {
      'x-client-info': 'SucessKart-web'
    }
  }
});

if (import.meta.env.DEV && typeof window !== 'undefined' && import.meta.env.VITE_EXPOSE_SUPABASE === 'true') {
  window.supabase = supabase;
}

setupCrossTabAuthSync(supabase);

const syncDailyLoginState = (session) => {
  if (!session?.user) return;
  const existing = readDailyLoginState();
  writeDailyLoginState({
    userId: session.user.id,
    email: session.user.email || existing?.email || '',
    authProvider: session.user.app_metadata?.provider || existing?.authProvider || 'email'
  });
};

supabase.auth.onAuthStateChange((event, session) => {
  removeLegacyLocalAuthArtifacts();
  if (session && (event === 'SIGNED_IN' || event === 'TOKEN_REFRESHED' || event === 'INITIAL_SESSION')) {
    syncDailyLoginState(session);
    broadcastAuthSession(session);
    void syncHttpOnlyAuthCookies(session);
  }
  if (event === 'SIGNED_OUT') {
    clearDailyLoginState();
    broadcastAuthSignOut();
    void clearHttpOnlyAuthCookies();
  }
});

let proactiveRefreshInFlight = false;
let proactiveRefreshTimer = null;
function startProactiveRefresh() {
  if (proactiveRefreshTimer) clearInterval(proactiveRefreshTimer);
  proactiveRefreshTimer = window.setInterval(async () => {
    if (proactiveRefreshInFlight) return;
    proactiveRefreshInFlight = true;
    try {
      const { data } = await supabase.auth.getSession();
      if (!data?.session?.refresh_token) return;
      await supabase.auth.refreshSession();
    } catch {
      // Existing expiry checks handle failed refreshes.
    } finally {
      proactiveRefreshInFlight = false;
    }
  }, 12 * 60 * 1000);
}
startProactiveRefresh();

if (typeof window !== 'undefined') {
  window.addEventListener('beforeunload', () => {
    if (proactiveRefreshTimer) clearInterval(proactiveRefreshTimer);
  });
}

async function checkSessionExpiry() {
  const loginState = readDailyLoginState();
  if (!loginState) return;
  if (!isDailyLoginExpired(loginState)) return;

  try {
    await supabase.auth.signOut();
  } finally {
    clearDailyLoginState();
    window.location.href = '/login';
  }
}

async function handleBrowserResume() {
  try {
    await supabase.auth.getSession();
  } finally {
    void checkSessionExpiry();
  }
}

window.addEventListener('focus', () => {
  void handleBrowserResume();
});
window.addEventListener('pageshow', () => {
  void handleBrowserResume();
});
window.addEventListener('online', () => {
  void handleBrowserResume();
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible') return;
  void handleBrowserResume();
});
window.setInterval(() => {
  void checkSessionExpiry();
}, 60 * 1000);
void checkSessionExpiry();
