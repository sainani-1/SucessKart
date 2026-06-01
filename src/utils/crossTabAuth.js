const CHANNEL_NAME = 'SucessKart-auth-sync';
const REQUEST_EVENT = 'request-session';
const SESSION_EVENT = 'session';
const SIGNED_OUT_EVENT = 'signed-out';
const REQUEST_STORAGE_KEY = 'SucessKart-auth-sync-request';
const RESPONSE_STORAGE_KEY = 'SucessKart-auth-sync-response';

const isBrowser = typeof window !== 'undefined';

const createRequestId = () => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `auth_${Date.now()}_${Math.random().toString(36).slice(2)}`;
};

const serializeSession = (session) => {
  if (!session?.access_token || !session?.refresh_token) return null;
  return {
    access_token: session.access_token,
    refresh_token: session.refresh_token,
    expires_at: session.expires_at || null,
    user_id: session.user?.id || null,
  };
};

const writeStorageEvent = (key, payload) => {
  try {
    window.localStorage.setItem(key, JSON.stringify({ ...payload, at: Date.now() }));
    window.localStorage.removeItem(key);
  } catch {
    // BroadcastChannel handles modern browsers; storage is only a fallback.
  }
};

export const setupCrossTabAuthSync = (supabase) => {
  if (!isBrowser || !supabase?.auth) return () => {};

  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;

  const sendSession = async (requestId = null) => {
    const { data } = await supabase.auth.getSession();
    const session = serializeSession(data?.session);
    if (!session) return;

    const payload = { type: SESSION_EVENT, requestId, session };
    channel?.postMessage(payload);
    writeStorageEvent(RESPONSE_STORAGE_KEY, payload);
  };

  const handleMessage = (event) => {
    const message = event?.data || {};
    if (message.type === REQUEST_EVENT) {
      void sendSession(message.requestId || null);
    }
  };

  const handleStorage = (event) => {
    if (event.key !== REQUEST_STORAGE_KEY || !event.newValue) return;
    try {
      const message = JSON.parse(event.newValue);
      if (message.type === REQUEST_EVENT) {
        void sendSession(message.requestId || null);
      }
    } catch {
      // Ignore malformed sync messages.
    }
  };

  channel?.addEventListener('message', handleMessage);
  window.addEventListener('storage', handleStorage);

  return () => {
    channel?.removeEventListener('message', handleMessage);
    channel?.close();
    window.removeEventListener('storage', handleStorage);
  };
};

export const broadcastAuthSession = (session) => {
  if (!isBrowser) return;
  const serialized = serializeSession(session);
  if (!serialized) return;

  const payload = { type: SESSION_EVENT, requestId: null, session: serialized };
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  channel?.postMessage(payload);
  channel?.close();
  writeStorageEvent(RESPONSE_STORAGE_KEY, payload);
};

export const broadcastAuthSignOut = () => {
  if (!isBrowser) return;
  const payload = { type: SIGNED_OUT_EVENT };
  const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;
  channel?.postMessage(payload);
  channel?.close();
};

export const requestSessionFromOtherTabs = (timeoutMs = 1200) =>
  new Promise((resolve) => {
    if (!isBrowser) {
      resolve(null);
      return;
    }

    const requestId = createRequestId();
    let settled = false;
    const channel = 'BroadcastChannel' in window ? new BroadcastChannel(CHANNEL_NAME) : null;

    const finish = (session) => {
      if (settled) return;
      settled = true;
      window.clearTimeout(timer);
      channel?.removeEventListener('message', handleMessage);
      channel?.close();
      window.removeEventListener('storage', handleStorage);
      resolve(session || null);
    };

    const acceptMessage = (message) => {
      if (!message || message.type !== SESSION_EVENT) return;
      if (message.requestId && message.requestId !== requestId) return;
      if (!message.session?.access_token || !message.session?.refresh_token) return;
      finish({
        access_token: message.session.access_token,
        refresh_token: message.session.refresh_token,
      });
    };

    function handleMessage(event) {
      acceptMessage(event?.data || {});
    }

    function handleStorage(event) {
      if (event.key !== RESPONSE_STORAGE_KEY || !event.newValue) return;
      try {
        acceptMessage(JSON.parse(event.newValue));
      } catch {
        // Ignore malformed sync messages.
      }
    }

    const timer = window.setTimeout(() => finish(null), timeoutMs);
    channel?.addEventListener('message', handleMessage);
    window.addEventListener('storage', handleStorage);

    const payload = { type: REQUEST_EVENT, requestId };
    channel?.postMessage(payload);
    writeStorageEvent(REQUEST_STORAGE_KEY, payload);
  });
