import { supabase } from '../supabaseClient';
import { logError } from '../utils/errorLogger';

const getStorageKey = (userId) => `chatReadTimes_${userId}`;

const toIsoString = (value) => {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return date.toISOString();
};

const isLater = (candidate, baseline) => {
  const candidateIso = toIsoString(candidate);
  const baselineIso = toIsoString(baseline);
  if (!candidateIso) return false;
  if (!baselineIso) return true;
  return new Date(candidateIso).getTime() > new Date(baselineIso).getTime();
};

export const readLocalChatReadTimes = (userId) => {
  if (!userId) return new Map();
  try {
    const stored = localStorage.getItem(getStorageKey(userId));
    if (!stored) return new Map();
    return new Map(JSON.parse(stored));
  } catch (error) {
    return new Map();
  }
};

export const writeLocalChatReadTimes = (userId, chatReadTimes) => {
  if (!userId) return;
  try {
    localStorage.setItem(getStorageKey(userId), JSON.stringify(Array.from(chatReadTimes.entries())));
  } catch (error) {
    // Ignore storage failures; the server-backed state remains authoritative.
  }
};

export const markChatAsRead = async (userId, groupId, readAt = new Date().toISOString()) => {
  const readAtIso = toIsoString(readAt) || new Date().toISOString();
  const localTimes = readLocalChatReadTimes(userId);
  localTimes.set(groupId, readAtIso);
  writeLocalChatReadTimes(userId, localTimes);

  if (!userId || !groupId) return readAtIso;

  const payload = {
    user_id: userId,
    group_id: groupId,
    last_read_at: readAtIso,
    updated_at: new Date().toISOString()
  };

  const { error } = await supabase
    .from('chat_read_states')
    .upsert(payload, { onConflict: 'user_id,group_id' });

  if (error) {
    logError({ message: 'Error saving chat read state', source: 'chatReadState', details: error });
  }

  return readAtIso;
};

export const markChatsAsRead = async (userId, groupIds, readAt = new Date().toISOString()) => {
  const readAtIso = toIsoString(readAt) || new Date().toISOString();
  const uniqueGroupIds = Array.from(new Set((groupIds || []).filter(Boolean)));
  if (!userId || uniqueGroupIds.length === 0) return new Map();

  const localTimes = readLocalChatReadTimes(userId);
  uniqueGroupIds.forEach((groupId) => {
    localTimes.set(groupId, readAtIso);
  });
  writeLocalChatReadTimes(userId, localTimes);

  const payload = uniqueGroupIds.map((groupId) => ({
    user_id: userId,
    group_id: groupId,
    last_read_at: readAtIso,
    updated_at: new Date().toISOString()
  }));

  const { error } = await supabase
    .from('chat_read_states')
    .upsert(payload, { onConflict: 'user_id,group_id' });

  if (error) {
    logError({ message: 'Error saving chat read states', source: 'chatReadState', details: error });
  }

  return localTimes;
};

export const getChatReadTimes = async (userId, groupIds) => {
  const uniqueGroupIds = Array.from(new Set((groupIds || []).filter(Boolean)));
  const localTimes = readLocalChatReadTimes(userId);

  if (!userId || uniqueGroupIds.length === 0) {
    return localTimes;
  }

  const { data, error } = await supabase
    .from('chat_read_states')
    .select('group_id, last_read_at')
    .eq('user_id', userId)
    .in('group_id', uniqueGroupIds);

  if (error) {
    logError({ message: 'Error loading chat read states', source: 'chatReadState', details: error });
    return localTimes;
  }

  const mergedTimes = new Map(localTimes);
  const serverTimes = new Map((data || []).map((row) => [row.group_id, row.last_read_at]));
  const syncPayload = [];

  uniqueGroupIds.forEach((groupId) => {
    const localTime = localTimes.get(groupId);
    const serverTime = serverTimes.get(groupId);
    if (isLater(serverTime, localTime)) {
      mergedTimes.set(groupId, serverTime);
      return;
    }
    if (isLater(localTime, serverTime)) {
      mergedTimes.set(groupId, localTime);
      syncPayload.push({
        user_id: userId,
        group_id: groupId,
        last_read_at: toIsoString(localTime),
        updated_at: new Date().toISOString()
      });
    }
  });

  writeLocalChatReadTimes(userId, mergedTimes);

  if (syncPayload.length > 0) {
    const { error: syncError } = await supabase
      .from('chat_read_states')
      .upsert(syncPayload, { onConflict: 'user_id,group_id' });

    if (syncError) {
      logError({ message: 'Error syncing local chat read states', source: 'chatReadState', details: syncError });
    }
  }

  return mergedTimes;
};
