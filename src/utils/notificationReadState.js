const buildReadKey = (userId) => `localNotificationReads_${userId}`;
export const NOTIFICATION_READS_UPDATED_EVENT = 'SucessKart:notification-reads-updated';

export const getLocalNotificationReadIds = (userId) => {
  if (!userId) return new Set();
  try {
    const raw = localStorage.getItem(buildReadKey(userId));
    const ids = raw ? JSON.parse(raw) : [];
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
};

export const saveLocalNotificationReadIds = (userId, idsSet) => {
  if (!userId) return;
  const ids = Array.from(idsSet);
  localStorage.setItem(buildReadKey(userId), JSON.stringify(ids));
  if (typeof window !== 'undefined') {
    window.dispatchEvent(
      new CustomEvent(NOTIFICATION_READS_UPDATED_EVENT, {
        detail: { userId, ids }
      })
    );
  }
};
