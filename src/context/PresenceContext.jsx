import React, { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { usePresence } from '../hooks/usePresence';
import { supabase } from '../supabaseClient';

const PresenceContext = createContext(null);

export function PresenceProvider({ children }) {
  const { profile } = useAuth();
  const [onlineUserIds, setOnlineUserIds] = useState(new Set());
  const [onlineProfiles, setOnlineProfiles] = useState([]);
  const [presenceStates, setPresenceStates] = useState({});
  const prevIdsRef = useRef('');

  const onPresence = useCallback((userIds, states) => {
    setOnlineUserIds(new Set(userIds));
    if (states) setPresenceStates(states);
  }, []);

  const { updatePresence } = usePresence(profile?.id, { onPresence });

  useEffect(() => {
    if (!profile?.id) return;
    const interval = setInterval(() => updatePresence(), 30000);
    return () => clearInterval(interval);
  }, [profile?.id, updatePresence]);

  useEffect(() => {
    const idsStr = [...onlineUserIds].sort().join(',');
    if (idsStr === prevIdsRef.current || !idsStr) return;
    prevIdsRef.current = idsStr;

    const ids = [...onlineUserIds];
    if (!ids.length) { setOnlineProfiles([]); return; }

    const validIds = ids.filter(Boolean);
    if (!validIds.length) { setOnlineProfiles([]); return; }

    supabase
      .from('profiles')
      .select('id, full_name, email, role, avatar_url')
      .in('id', validIds)
      .then(({ data }) => setOnlineProfiles(data || []))
      .catch(() => {});
  }, [onlineUserIds]);

  const isOnline = useCallback((id) => id && onlineUserIds.has(String(id)), [onlineUserIds]);

  const getPresenceState = useCallback((userId) => {
    return presenceStates[String(userId)] || {};
  }, [presenceStates]);

  return (
    <PresenceContext.Provider value={{ onlineUserIds, onlineProfiles, isOnline, presenceStates, getPresenceState }}>
      {children}
    </PresenceContext.Provider>
  );
}

export function usePresenceContext() {
  const ctx = useContext(PresenceContext);
  if (!ctx) return { onlineUserIds: new Set(), onlineProfiles: [], isOnline: () => false, presenceStates: {}, getPresenceState: () => ({}) };
  return ctx;
}
