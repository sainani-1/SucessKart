import React, { createContext, useContext, useState, useEffect } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from './AuthContext';
import { getChatReadTimes } from '../utils/chatReadState';
import { logError } from '../utils/errorLogger';

const ChatContext = createContext();

export const ChatProvider = ({ children }) => {
  const { profile } = useAuth();
  const [totalUnreadCount, setTotalUnreadCount] = useState(0);
  const isFetchNetworkIssue = (err) => {
    const message = String(err?.message || '').toLowerCase();
    const details = String(err?.details || '').toLowerCase();
    return (
      message.includes('failed to fetch') ||
      message.includes('networkerror') ||
      details.includes('failed to fetch') ||
      details.includes('cors') ||
      message.includes('err_failed') ||
      message.includes('525')
    );
  };

  useEffect(() => {
    if (!profile) return;
    
    // Only track messages for teachers
    if (profile.role !== 'teacher') {
      setTotalUnreadCount(0);
      return;
    }

    // Load initial unread messages count
    const loadUnreadCount = async () => {
      try {
        const { data: memberGroups, error: memberError } = await supabase
          .from('chat_members')
          .select('group_id')
          .eq('user_id', profile.id);

        if (memberError) throw memberError;

        if (!memberGroups || memberGroups.length === 0) {
          setTotalUnreadCount(0);
          return;
        }

        const groupIds = memberGroups.map(m => m.group_id);

        const chatReadTimes = await getChatReadTimes(profile.id, groupIds);
        let totalCount = 0;

        for (const groupId of groupIds) {
          const { data: messages, error: messagesError } = await supabase
            .from('chat_messages')
            .select('sender_id, created_at')
            .eq('group_id', groupId);

          if (messagesError) throw messagesError;

          const lastReadAt = chatReadTimes.get(groupId);
          totalCount += (messages || []).filter((message) => {
            if (message.sender_id === profile.id) return false;
            if (!lastReadAt) return true;
            return new Date(message.created_at) > new Date(lastReadAt);
          }).length;
        }

        setTotalUnreadCount(totalCount);
      } catch (error) {
        setTotalUnreadCount(0);
        if (!isFetchNetworkIssue(error)) {
          logError({ message: 'ChatContext: Error loading unread count', source: 'ChatContext', details: error });
        }
      }
    };

    loadUnreadCount();

    let activeGroupIds = new Set();
    const loadMemberGroupIds = async () => {
      const { data } = await supabase
        .from('chat_members')
        .select('group_id')
        .eq('user_id', profile.id);
      activeGroupIds = new Set((data || []).map((row) => row.group_id));
    };

    loadMemberGroupIds();

    // Listen for new messages
    const subscription = supabase
      .channel('global_messages')
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages'
      }, async payload => {
        if (payload.new.sender_id === profile.id) return;
        if (!activeGroupIds.has(payload.new.group_id)) {
          await loadMemberGroupIds();
        }
        if (!activeGroupIds.has(payload.new.group_id)) return;
        setTotalUnreadCount(prev => prev + 1);
      })
      .subscribe();

    return () => {
      subscription.unsubscribe();
    };
  }, [profile]);

  const clearUnreadCount = () => {
    setTotalUnreadCount(0);
  };

  return (
    <ChatContext.Provider value={{ totalUnreadCount, setTotalUnreadCount, clearUnreadCount }}>
      {children}
    </ChatContext.Provider>
  );
};

export const useChat = () => {
  const context = useContext(ChatContext);
  if (!context) {
    throw new Error('useChat must be used within ChatProvider');
  }
  return context;
};
