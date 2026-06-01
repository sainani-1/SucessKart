import { useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';

function parseUserAgent(ua) {
  const result = {
    browser: 'Unknown', browser_version: '',
    os: 'Unknown', os_version: '',
    device_type: 'Desktop',
  };
  if (!ua) return result;
  if (ua.includes('Edg/') || ua.includes('Edge/')) {
    result.browser = 'Edge';
    const m = ua.match(/Edg\/([\d.]+)/);
    if (m) result.browser_version = m[1];
  } else if (ua.includes('Chrome/') && !ua.includes('Edg/') && !ua.includes('OPR/')) {
    result.browser = 'Chrome';
    const m = ua.match(/Chrome\/([\d.]+)/);
    if (m) result.browser_version = m[1];
  } else if (ua.includes('Firefox/')) {
    result.browser = 'Firefox';
    const m = ua.match(/Firefox\/([\d.]+)/);
    if (m) result.browser_version = m[1];
  } else if (ua.includes('Safari/') && !ua.includes('Chrome/')) {
    result.browser = 'Safari';
    const m = ua.match(/Version\/([\d.]+)/);
    if (m) result.browser_version = m[1];
  } else if (ua.includes('OPR/') || ua.includes('Opera/')) {
    result.browser = 'Opera';
    const m = ua.match(/(?:OPR|Opera)\/([\d.]+)/);
    if (m) result.browser_version = m[1];
  }
  if (ua.includes('Windows NT')) {
    result.os = 'Windows';
    const m = ua.match(/Windows NT ([\d.]+)/);
    if (m) {
      const v = m[1];
      result.os_version = v === '10.0' ? '10/11' : v === '6.3' ? '8.1' : v === '6.2' ? '8' : v === '6.1' ? '7' : v;
    }
  } else if (ua.includes('Mac OS X')) { result.os = 'macOS'; const m = ua.match(/Mac OS X ([\d_]+)/); if (m) result.os_version = m[1].replace(/_/g, '.'); }
  else if (ua.includes('Android')) { result.os = 'Android'; const m = ua.match(/Android ([\d.]+)/); if (m) result.os_version = m[1]; }
  else if (ua.includes('iOS') || ua.includes('iPhone') || ua.includes('iPad')) { result.os = 'iOS'; const m = ua.match(/OS ([\d_]+)/); if (m) result.os_version = m[1].replace(/_/g, '.'); }
  else if (ua.includes('Linux')) { result.os = 'Linux'; }
  if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) result.device_type = 'Mobile';
  else if (/iPad|Tablet|Android(?!.*Mobile)/.test(ua)) result.device_type = 'Tablet';
  return result;
}

const loggedKeys = new Set();

async function insertVisit(userId) {
  const url = window.location.href;
  const key = `${userId || 'anon'}_${url}`;
  if (loggedKeys.has(key)) return;
  loggedKeys.add(key);

  try {
    const ua = navigator.userAgent;
    const p = parseUserAgent(ua);
    await supabase.from('visitor_logs').insert({
      user_agent: ua,
      device_type: p.device_type,
      browser: p.browser,
      browser_version: p.browser_version,
      os: p.os,
      os_version: p.os_version,
      referrer: document.referrer || '',
      page_url: url,
      user_id: userId || null,
    });
  } catch (err) {
    // non-critical - log to console for debugging
    console.warn('Visitor log insert failed:', err);
  }
}

export function useVisitorTracking() {
  const { user, profile } = useAuth();

  useEffect(() => {
    const timer = setTimeout(() => insertVisit(user?.id || profile?.id || null), 2000);
    return () => clearTimeout(timer);
  }, []); // run once on mount regardless of StrictMode
}

export function logPageView() {
  return insertVisit(null);
}
