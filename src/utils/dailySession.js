const LOGIN_STATE_KEY = 'SucessKart-login-state';

const getStorage = () => {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
};

const getThirtyDayExpiryTimestamp = (fromDate = new Date()) => {
  return fromDate.getTime() + (30 * 24 * 60 * 60 * 1000);
};

export const readDailyLoginState = () => {
  try {
    const raw = getStorage()?.getItem(LOGIN_STATE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch (error) {
    return null;
  }
};

export const writeDailyLoginState = (payload = {}) => {
  try {
    const existing = readDailyLoginState() || {};
    const loginAt = existing.loginAt || payload.loginAt || new Date().toISOString();
    const expiresAt = payload.expiresAt || getThirtyDayExpiryTimestamp();
    const nextState = {
      ...existing,
      ...payload,
      loginAt,
      expiresAt
    };
    getStorage()?.setItem(LOGIN_STATE_KEY, JSON.stringify(nextState));
    return nextState;
  } catch (error) {
    return null;
  }
};

export const clearDailyLoginState = () => {
  try {
    getStorage()?.removeItem(LOGIN_STATE_KEY);
  } catch (error) {
    // Ignore local storage cleanup failures.
  }
};

export const isDailyLoginExpired = (state = readDailyLoginState()) => {
  const expiresAt = Number(state?.expiresAt || 0);
  return Number.isFinite(expiresAt) && expiresAt > 0 && Date.now() >= expiresAt;
};
