import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

function getDeviceInfo() {
  const ua = navigator.userAgent;
  let browser = 'Unknown', os = 'Unknown', device = 'Desktop';

  if (ua.includes('Edg/') || ua.includes('Edge/')) browser = 'Edge';
  else if (ua.includes('Chrome/') && !ua.includes('Edg/') && !ua.includes('OPR/')) browser = 'Chrome';
  else if (ua.includes('Firefox/')) browser = 'Firefox';
  else if (ua.includes('Safari/') && !ua.includes('Chrome/')) browser = 'Safari';
  else if (ua.includes('OPR/') || ua.includes('Opera/')) browser = 'Opera';

  if (ua.includes('Windows NT')) os = 'Windows';
  else if (ua.includes('Mac OS X')) os = 'macOS';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iPhone') || ua.includes('iPad')) os = 'iOS';
  else if (ua.includes('Linux')) os = 'Linux';

  if (/Mobile|Android.*Mobile|iPhone|iPod/.test(ua)) device = 'Mobile';
  else if (/iPad|Tablet|Android(?!.*Mobile)/.test(ua)) device = 'Tablet';

  return { browser, os, device };
}

export function usePresence(userId, { onPresence } = {}) {
  const channelRef = useRef(null);
  const onPresenceRef = useRef(onPresence);
  onPresenceRef.current = onPresence;

  useEffect(() => {
    if (!userId) return;

    const channel = supabase.channel('online-users', {
      config: { presence: { key: userId.toString() } }
    });

    channel
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState();
        const userIds = Object.keys(state);
        const userStates = {};
        for (const [uid, sessions] of Object.entries(state)) {
          if (sessions && sessions.length > 0) {
            userStates[uid] = sessions[0];
          }
        }
        onPresenceRef.current?.(userIds, userStates);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          const deviceInfo = getDeviceInfo();
          await channel.track({
            user_id: userId,
            online_at: new Date().toISOString(),
            browser: deviceInfo.browser,
            os: deviceInfo.os,
            device_type: deviceInfo.device,
          });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const updatePresence = useCallback(async () => {
    if (channelRef.current) {
      const deviceInfo = getDeviceInfo();
      await channelRef.current.track({
        user_id: userId,
        online_at: new Date().toISOString(),
        browser: deviceInfo.browser,
        os: deviceInfo.os,
        device_type: deviceInfo.device,
      });
    }
  }, [userId]);

  return { updatePresence };
}
