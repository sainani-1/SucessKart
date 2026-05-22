import { supabase } from '../supabaseClient';
import { logError } from '../utils/errorLogger';

const navLogState = new Map();
const NAV_THROTTLE_MS = 4000;

const normalizePath = (path) => String(path || '').trim().toLowerCase();

const isMissingTableError = (error) => {
  const code = String(error?.code || '');
  const msg = String(error?.message || '').toLowerCase();
  const details = String(error?.details || '').toLowerCase();
  return code === '42P01' || msg.includes('admin_activity_logs') || details.includes('admin_activity_logs');
};

export const logAdminActivity = async ({
  adminId,
  eventType = 'action',
  action,
  target = null,
  details = {},
}) => {
  if (!adminId || !action) return;
  try {
    const payload = {
      admin_id: adminId,
      event_type: String(eventType || 'action').slice(0, 60),
      action: String(action).slice(0, 200),
      target: target ? String(target).slice(0, 300) : null,
      details: details && typeof details === 'object' ? details : {},
    };
    const { error } = await supabase.from('admin_activity_logs').insert(payload);
    if (error) throw error;
  } catch (error) {
    if (!isMissingTableError(error)) {
      logError({ message: 'Admin activity log insert failed', source: 'adminActivityLogger', details: error });
    }
  }
};

export const logAdminNavigation = async ({ adminId, pathname, details = {} }) => {
  const path = normalizePath(pathname);
  if (!adminId || !path || !path.startsWith('/app/admin')) return;

  const now = Date.now();
  const key = `${adminId}:${path}`;
  const lastAt = navLogState.get(key) || 0;
  if (now - lastAt < NAV_THROTTLE_MS) return;
  navLogState.set(key, now);

  await logAdminActivity({
    adminId,
    eventType: 'navigation',
    action: 'Visited admin page',
    target: path,
    details,
  });
};
