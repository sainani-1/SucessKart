import { useEffect, useRef } from 'react';
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

function getVisitorFingerprint() {
  try {
    const parts = [
      navigator.userAgent,
      screen.width,
      screen.height,
      navigator.language,
    ];
    return parts.join('||');
  } catch {
    return navigator.userAgent || 'unknown';
  }
}

export function useVisitorTracking() {
  const { user, profile } = useAuth();
  const latestRef = useRef({ user, profile });
  latestRef.current = { user, profile };

  useEffect(() => {
    const { user: u, profile: p } = latestRef.current;
    const userId = u?.id || p?.id || null;
    const fingerprint = userId || getVisitorFingerprint();
    const storageKey = `visitor_logged_${fingerprint}`;

    // Only log unique visitors — skip if already logged from this device
    if (localStorage.getItem(storageKey)) return;

    const timer = setTimeout(async () => {
      try {
        const { user: u, profile: p } = latestRef.current;
        const uid = u?.id || p?.id || null;
        const ua = navigator.userAgent;
        const parsed = parseUserAgent(ua);

        await supabase.functions.invoke('log-visit', {
          body: {
            user_agent: ua,
            device_type: parsed.device_type,
            browser: parsed.browser,
            browser_version: parsed.browser_version,
            os: parsed.os,
            os_version: parsed.os_version,
            referrer: document.referrer || '',
            user_id: uid,
            username: p?.username || null,
            email: p?.email || null,
          },
        });

        const logKey = `visitor_logged_${uid || getVisitorFingerprint()}`;
        localStorage.setItem(logKey, '1');
      } catch (err) {
        console.warn('Visitor log failed:', err);
      }
    }, 2000);

    return () => clearTimeout(timer);
  }, []); // run once on mount
}
