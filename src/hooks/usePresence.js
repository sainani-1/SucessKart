import { useEffect, useRef, useCallback } from 'react';
import { supabase } from '../supabaseClient';

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
        const userIds = Object.keys(state).map(Number);
        onPresenceRef.current?.(userIds);
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          await channel.track({ user_id: userId, online_at: new Date().toISOString() });
        }
      });

    channelRef.current = channel;

    return () => {
      channel.unsubscribe();
    };
  }, [userId]);

  const updatePresence = useCallback(async () => {
    if (channelRef.current) {
      await channelRef.current.track({ user_id: userId, online_at: new Date().toISOString() });
    }
  }, [userId]);

  return { updatePresence };
}
