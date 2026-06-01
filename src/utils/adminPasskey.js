import { supabase } from '../supabaseClient';

const PASSKEY_VERIFIED_KEY = 'admin_passkey_verified';
const PASSKEY_VERIFIED_USER_KEY = 'admin_passkey_verified_user';
const PASSKEY_RECORD_PREFIX = 'admin_passkey_record_';
const PASSKEY_DEVICE_ID_PREFIX = 'admin_passkey_device_';
const PASSKEY_REGISTRY_SETTINGS_PREFIX = 'admin_passkey_registry_';

const encoder = new TextEncoder();

const toBase64Url = (buffer) => {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const fromBase64Url = (value) => {
  const base64 = String(value || '')
    .replace(/-/g, '+')
    .replace(/_/g, '/')
    .padEnd(Math.ceil(String(value || '').length / 4) * 4, '=');
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
};

const getRecordKey = (userId) => `${PASSKEY_RECORD_PREFIX}${userId}`;
const getDeviceKey = (userId) => `${PASSKEY_DEVICE_ID_PREFIX}${userId}`;
const getRegistrySettingsKey = (userId) => `${PASSKEY_REGISTRY_SETTINGS_PREFIX}${userId}`;

const randomChallenge = (length = 32) => {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  return bytes;
};

const readJsonStorage = (key) => {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeJsonStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const getStoredDeviceId = (userId) => {
  if (!userId) return null;
  try {
    return localStorage.getItem(getDeviceKey(userId));
  } catch {
    return null;
  }
};

const generateDeviceId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return `device_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
};

const getOrCreateDeviceId = (userId) => {
  if (!userId) return null;
  const existing = getStoredDeviceId(userId);
  if (existing) return existing;
  const nextId = generateDeviceId();
  localStorage.setItem(getDeviceKey(userId), nextId);
  return nextId;
};

const parseBrowserName = (ua) => {
  const value = String(ua || '');
  if (value.includes('Edg/')) return 'Microsoft Edge';
  if (value.includes('OPR/') || value.includes('Opera/')) return 'Opera';
  if (value.includes('Chrome/') && !value.includes('Edg/')) return 'Chrome';
  if (value.includes('Firefox/')) return 'Firefox';
  if (value.includes('Safari/') && !value.includes('Chrome/')) return 'Safari';
  return 'Browser';
};

const parseOsName = (ua) => {
  const value = String(ua || '');
  if (value.includes('Windows')) return 'Windows';
  if (value.includes('Android')) return 'Android';
  if (value.includes('iPhone') || value.includes('iPad') || value.includes('iOS')) return 'iOS';
  if (value.includes('Mac OS X') || value.includes('Macintosh')) return 'macOS';
  if (value.includes('Linux')) return 'Linux';
  return 'Unknown OS';
};

const getDeviceDetails = () => {
  const ua = typeof navigator !== 'undefined' ? navigator.userAgent || '' : '';
  const browser = parseBrowserName(ua);
  const os = parseOsName(ua);
  const platform = typeof navigator !== 'undefined' ? navigator.platform || '' : '';
  const host = typeof window !== 'undefined' ? window.location.hostname || '' : '';
  return {
    browser,
    os,
    platform: platform || null,
    host: host || null,
    userAgent: ua || null,
    deviceLabel: `${browser} on ${os}`,
  };
};

const normalizeRegistryRecord = (record) => {
  if (!record?.deviceId || !record?.credentialId) return null;
  return {
    deviceId: String(record.deviceId),
    credentialId: String(record.credentialId),
    createdAt: record.createdAt || null,
    lastUsedAt: record.lastUsedAt || null,
    email: record.email || null,
    displayName: record.displayName || null,
    browser: record.browser || null,
    os: record.os || null,
    platform: record.platform || null,
    host: record.host || null,
    userAgent: record.userAgent || null,
    deviceLabel: record.deviceLabel || 'Registered device',
  };
};

const normalizeRegistry = (records) =>
  Array.isArray(records)
    ? records.map(normalizeRegistryRecord).filter(Boolean)
    : [];

const loadRemoteRegistry = async (userId) => {
  if (!userId) return [];
  const { data, error } = await supabase
    .from('settings')
    .select('value')
    .eq('key', getRegistrySettingsKey(userId))
    .maybeSingle();
  if (error) throw error;
  if (!data?.value) return [];
  try {
    return normalizeRegistry(JSON.parse(data.value));
  } catch {
    return [];
  }
};

const saveRemoteRegistry = async (userId, records) => {
  if (!userId) return [];
  const normalized = normalizeRegistry(records);
  const { error } = await supabase
    .from('settings')
    .upsert(
      {
        key: getRegistrySettingsKey(userId),
        value: JSON.stringify(normalized),
      },
      { onConflict: 'key' }
    );
  if (error) throw error;
  return normalized;
};

const upsertRemoteRegistryRecord = async (userId, record) => {
  const nextRecord = normalizeRegistryRecord(record);
  if (!nextRecord) throw new Error('Invalid passkey record.');
  const current = await loadRemoteRegistry(userId);
  const next = [
    nextRecord,
    ...current.filter(
      (item) =>
        item.deviceId !== nextRecord.deviceId &&
        item.credentialId !== nextRecord.credentialId
    ),
  ];
  return saveRemoteRegistry(userId, next);
};

const removeRemoteRegistryRecord = async (userId, deviceId) => {
  const current = await loadRemoteRegistry(userId);
  const next = current.filter((item) => item.deviceId !== deviceId);
  await saveRemoteRegistry(userId, next);
  return current.length !== next.length;
};

export const isPasskeySupported = () =>
  typeof window !== 'undefined' &&
  !!window.PublicKeyCredential &&
  typeof navigator !== 'undefined' &&
  !!navigator.credentials;

export const clearAdminVerificationState = () => {
  sessionStorage.removeItem('admin_mfa_verified');
  sessionStorage.removeItem('admin_mfa_verified_user');
  sessionStorage.removeItem('admin_face_verified');
  sessionStorage.removeItem(PASSKEY_VERIFIED_KEY);
  sessionStorage.removeItem(PASSKEY_VERIFIED_USER_KEY);
};

export const markAdminPasskeyVerified = (userId) => {
  sessionStorage.setItem(PASSKEY_VERIFIED_KEY, 'true');
  sessionStorage.setItem(PASSKEY_VERIFIED_USER_KEY, userId);
  // Keep existing guards and sensitive flows compatible.
  sessionStorage.setItem('admin_mfa_verified', 'true');
  sessionStorage.setItem('admin_mfa_verified_user', userId);
};

export const isAdminPasskeyVerifiedForUser = (userId) =>
  sessionStorage.getItem(PASSKEY_VERIFIED_KEY) === 'true' &&
  sessionStorage.getItem(PASSKEY_VERIFIED_USER_KEY) === userId;

export const getStoredAdminPasskey = (userId) => {
  if (!userId) return null;
  const record = readJsonStorage(getRecordKey(userId));
  if (!record?.credentialId) return null;
  if (record.deviceId) return record;

  const migrated = {
    ...record,
    deviceId: getOrCreateDeviceId(userId),
    ...getDeviceDetails(),
  };
  writeJsonStorage(getRecordKey(userId), migrated);
  return migrated;
};

const storeAdminPasskey = (userId, record) => {
  writeJsonStorage(getRecordKey(userId), record);
};

export const clearStoredAdminPasskey = (userId) => {
  if (!userId) return;
  localStorage.removeItem(getRecordKey(userId));
};

export const hasStoredAdminPasskey = (userId) => {
  const record = getStoredAdminPasskey(userId);
  return !!record?.credentialId;
};

export const listAdminPasskeys = async (userId) => loadRemoteRegistry(userId);

export const isStoredAdminPasskeyActive = async (userId) => {
  const localRecord = getStoredAdminPasskey(userId);
  if (!localRecord?.deviceId || !localRecord?.credentialId) return false;
  const remoteRecords = await loadRemoteRegistry(userId);
  return remoteRecords.some(
    (item) =>
      item.deviceId === localRecord.deviceId &&
      item.credentialId === localRecord.credentialId
  );
};

export const deleteAdminPasskey = async ({ userId, deviceId }) => {
  if (!userId || !deviceId) {
    throw new Error('User and device are required to delete a passkey.');
  }
  await removeRemoteRegistryRecord(userId, deviceId);
  const localRecord = getStoredAdminPasskey(userId);
  if (localRecord?.deviceId === deviceId) {
    clearStoredAdminPasskey(userId);
    clearAdminVerificationState();
  }
};

export const createAdminPasskey = async ({ userId, email, displayName }) => {
  if (!isPasskeySupported()) {
    throw new Error('This browser does not support passkeys.');
  }

  const existingRecord = getStoredAdminPasskey(userId);
  const deviceId = existingRecord?.deviceId || getOrCreateDeviceId(userId);
  const deviceDetails = getDeviceDetails();
  const userHandle = encoder.encode(String(userId));
  const publicKey = {
    challenge: randomChallenge(),
    rp: {
      name: 'SucessKart Admin',
      id: window.location.hostname,
    },
    user: {
      id: userHandle,
      name: email || String(userId),
      displayName: displayName || email || 'Admin',
    },
    pubKeyCredParams: [
      { type: 'public-key', alg: -7 },
      { type: 'public-key', alg: -257 },
    ],
    authenticatorSelection: {
      residentKey: 'preferred',
      userVerification: 'preferred',
    },
    timeout: 60000,
    attestation: 'none',
    excludeCredentials: existingRecord?.credentialId
      ? [
          {
            id: new Uint8Array(fromBase64Url(existingRecord.credentialId)),
            type: 'public-key',
          },
        ]
      : [],
  };

  const credential = await navigator.credentials.create({ publicKey });
  if (!credential) {
    throw new Error('Passkey creation was canceled.');
  }

  const storedRecord = {
    deviceId,
    credentialId: toBase64Url(credential.rawId),
    createdAt: new Date().toISOString(),
    email: email || null,
    displayName: displayName || null,
    lastUsedAt: null,
    ...deviceDetails,
  };
  storeAdminPasskey(userId, storedRecord);
  await upsertRemoteRegistryRecord(userId, storedRecord);
  markAdminPasskeyVerified(userId);
  return credential;
};

export const verifyAdminPasskey = async ({ userId }) => {
  if (!isPasskeySupported()) {
    throw new Error('This browser does not support passkeys.');
  }

  const record = getStoredAdminPasskey(userId);
  if (!record?.credentialId) {
    throw new Error('No admin passkey is registered on this device yet.');
  }

  const remoteRecords = await loadRemoteRegistry(userId);
  const activeRemoteRecord = remoteRecords.find(
    (item) =>
      item.deviceId === record.deviceId &&
      item.credentialId === record.credentialId
  );
  if (!activeRemoteRecord) {
    clearStoredAdminPasskey(userId);
    clearAdminVerificationState();
    throw new Error('This device passkey was deleted from the admin panel. Please add it again.');
  }

  const credential = await navigator.credentials.get({
    publicKey: {
      challenge: randomChallenge(),
      allowCredentials: [
        {
          id: new Uint8Array(fromBase64Url(record.credentialId)),
          type: 'public-key',
        },
      ],
      userVerification: 'preferred',
      timeout: 60000,
      rpId: window.location.hostname,
    },
  });

  if (!credential) {
    throw new Error('Passkey verification was canceled.');
  }

  const updatedRecord = {
    ...record,
    lastUsedAt: new Date().toISOString(),
  };
  storeAdminPasskey(userId, updatedRecord);
  await upsertRemoteRegistryRecord(userId, updatedRecord);
  markAdminPasskeyVerified(userId);
  return credential;
};
