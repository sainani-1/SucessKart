import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { Send, MessageCircle } from 'lucide-react';
import { markChatAsRead } from '../utils/chatReadState';
import { usePresenceContext } from '../context/PresenceContext';
import { buildPlanCheckoutPath } from '../utils/planCheckout';
import { logError } from '../utils/errorLogger';

const ChatWithTeacher = () => {
  const ADMIN_USER_ACCESS_TARGET_KEY = 'admin_user_access_target';
  const navigate = useNavigate();
  const { profile, realProfile, isImpersonating, stopImpersonation, isPremiumPlus } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [groupId, setGroupId] = useState(null);
  const [teacher, setTeacher] = useState(null);
  const [error, setError] = useState(null);
  const [receiverReadAt, setReceiverReadAt] = useState(null);
  const [hasMoreOldMessages, setHasMoreOldMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const autoLoadRef = useRef(0);

  const { isOnline } = usePresenceContext();
  const premiumAccess = isPremiumPlus(profile);

  const scrollToBottom = () => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }));
  };

  useEffect(() => { if (isAtBottom) scrollToBottom(); }, [messages]);

  useEffect(() => {
    if (!messagesContainerRef.current || !hasMoreOldMessages || loadingOlder || autoLoadRef.current >= 3) return;
    if (messagesContainerRef.current.scrollHeight <= messagesContainerRef.current.clientHeight + 1) {
      autoLoadRef.current++;
      loadOlderMessages();
    }
  }, [messages, hasMoreOldMessages, loadingOlder]);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  const loadReceiverReadState = async (currentGroupId = groupId) => {
    if (!currentGroupId || !teacher?.id) return;
    try {
      const { data } = await supabase
        .from('chat_read_states')
        .select('user_id, last_read_at')
        .eq('group_id', currentGroupId).neq('user_id', profile.id)
        .order('last_read_at', { ascending: false }).limit(1);
      setReceiverReadAt(data?.[0]?.last_read_at || null);
    } catch { setReceiverReadAt(null); }
  };

  const getOwnMessageStatus = (message) => {
    if (String(message.id || '').startsWith('temp-')) return <span className="text-slate-400 text-[9px] ml-1">✓</span>;
    if (receiverReadAt && new Date(receiverReadAt) >= new Date(message.created_at)) return <span className="text-blue-300 text-[9px] ml-1 font-bold">✓✓</span>;
    return <span className="text-slate-400 text-[9px] ml-1">✓✓</span>;
  };

  const initChat = async () => {
    if (!profile?.assigned_teacher_id) return;
    try {
      setError(null);
      const [teacherResponse, myGroupsResponse] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', profile.assigned_teacher_id).single(),
        supabase.from('chat_members').select('group_id').eq('user_id', profile.id)
      ]);
      if (teacherResponse.error) {
        setError('Unable to find your assigned teacher. Please contact support.');
        return;
      }
      setTeacher(teacherResponse.data);

      let groupIdToUse = null;
      if (myGroupsResponse.data?.length > 0) {
        const myGids = myGroupsResponse.data.map(g => g.group_id);
        const { data: teacherInGroups } = await supabase
          .from('chat_members').select('group_id')
          .eq('user_id', profile.assigned_teacher_id).in('group_id', myGids);
        if (teacherInGroups?.length > 0) groupIdToUse = teacherInGroups[0].group_id;
      }

      if (!groupIdToUse) {
        const { data: newGroup } = await supabase
          .from('chat_groups').insert({
            group_type: 'student_teacher', name: `${profile.full_name} - ${teacherResponse.data.full_name}`, created_by: profile.id
          }).select().single();
        if (newGroup) {
          await supabase.from('chat_members').insert([
            { group_id: newGroup.id, user_id: profile.id },
            { group_id: newGroup.id, user_id: profile.assigned_teacher_id }
          ]);
          groupIdToUse = newGroup.id;
        }
      }
      if (groupIdToUse) setGroupId(groupIdToUse);
    } catch (err) {
      logError({ message: 'Error initializing chat:', source: 'ChatWithTeacher', details: err });
      setError('Failed to load chat. Please refresh the page.');
    }
  };

  if (profile?.role === 'student' && !premiumAccess) {
    return (
      <div className="mx-auto max-w-2xl rounded-3xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-amber-100 text-amber-700">
          <MessageCircle size={24} />
        </div>
        <h1 className="mt-4 text-2xl font-bold text-slate-900">Premium Plus Required</h1>
        <p className="mt-3 text-sm text-slate-600">Ask a Doubt is available only for Premium Plus students.</p>
        <button type="button" onClick={() => navigate(buildPlanCheckoutPath('premium_plus'))}
          className="mt-5 rounded-xl bg-amber-500 px-5 py-3 text-sm font-semibold text-white hover:bg-amber-600">
          Upgrade to Premium Plus
        </button>
      </div>
    );
  }

  const loadMessages = async () => {
    if (!groupId) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name, avatar_url)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(8);
      setMessages((data || []).reverse());
      setHasMoreOldMessages((data || []).length === 8);
      await markChatAsRead(profile.id, groupId);
      await loadReceiverReadState(groupId);
    } catch (err) { logError({ message: 'Error loading messages:', source: 'ChatWithTeacher', details: err }); }
  };

  const loadNewMessagesOnly = async () => {
    if (!groupId) return;
    if (!messages.length) { await loadMessages(); return; }
    const latest = messages[messages.length - 1];
    if (String(latest.id).startsWith('temp-')) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name, avatar_url)')
        .eq('group_id', groupId)
        .gt('id', latest.id)
        .order('created_at', { ascending: true });
      if (data?.length) {
        setMessages(prev => [...prev, ...data]);
      }
      await markChatAsRead(profile.id, groupId);
    } catch (err) { logError({ message: 'Error refreshing messages:', source: 'ChatWithTeacher', details: err }); }
  };

  const loadOlderMessages = async () => {
    if (!groupId || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name, avatar_url)')
        .eq('group_id', groupId)
        .lt('id', oldest.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data?.length) {
        setMessages(prev => [...data.reverse(), ...prev]);
        if (data.length < 20) setHasMoreOldMessages(false);
      } else {
        setHasMoreOldMessages(false);
      }
    } catch (err) { logError({ message: 'Error loading older messages:', source: 'ChatWithTeacher', details: err }); }
    finally { setLoadingOlder(false); }
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const el = messagesContainerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    if (el.scrollTop < 50 && hasMoreOldMessages && !loadingOlder) {
      loadOlderMessages();
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !groupId) return;
    const content = newMessage.trim();
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, group_id: groupId, sender_id: profile.id, content,
      created_at: new Date().toISOString(),
      profiles: { full_name: profile.full_name, avatar_url: profile.avatar_url }
    }]);
    setNewMessage('');
    setHasMoreOldMessages(true);
    scrollToBottom();
    setError(null);
    try {
      const { data } = await supabase.from('chat_messages').insert({ group_id: groupId, sender_id: profile.id, content }).select();
      if (data?.[0]) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...data[0], profiles: m.profiles } : m));
      }
      await markChatAsRead(profile.id, groupId);
    } catch (err) {
      setError('Failed to send message. Please try again.');
      logError({ message: 'Error sending message:', source: 'ChatWithTeacher', details: err });
    }
  };

  const openAdminChatMonitor = () => {
    try {
      if (profile?.id) sessionStorage.setItem(ADMIN_USER_ACCESS_TARGET_KEY, profile.id);
      else sessionStorage.removeItem(ADMIN_USER_ACCESS_TARGET_KEY);
    } catch {}
    stopImpersonation();
    navigate('/app/admin/user-access');
  };

  if (isImpersonating && realProfile?.role === 'admin') {
    return (
      <div className="bg-white rounded-xl p-8 text-center">
        <MessageCircle className="mx-auto mb-4 text-amber-500" size={48} />
        <h2 className="text-xl font-bold mb-2">Student Chat Is Read-Only In Admin View</h2>
        <p className="text-slate-600 mb-4">Admin impersonation keeps the real admin login active, so this page cannot safely create a student chat session.</p>
        <button type="button" onClick={openAdminChatMonitor} className="inline-flex items-center justify-center px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Open Admin Chat Monitor</button>
      </div>
    );
  }

  if (!profile?.assigned_teacher_id) {
    return (
      <div className="bg-white rounded-xl p-8 text-center">
        <MessageCircle className="mx-auto mb-4 text-slate-400" size={48} />
        <h2 className="text-xl font-bold mb-2">No Teacher Assigned Yet</h2>
        <p className="text-slate-600 mb-4">A teacher will be assigned to you soon!</p>
        <a href="/app/request-teacher" className="text-blue-600 hover:underline">Request a teacher now →</a>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white rounded-xl p-8 text-center">
        <MessageCircle className="mx-auto mb-4 text-red-400" size={48} />
        <h2 className="text-xl font-bold mb-2 text-red-600">Chat Error</h2>
        <p className="text-slate-600 mb-4">{error}</p>
        <button onClick={() => window.location.reload()} className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700">Refresh Page</button>
      </div>
    );
  }

  if (!groupId) return null;

  return (
    <div className="flex flex-col h-[85vh] bg-white rounded-xl border overflow-hidden shadow-sm relative box-border">
      {isOffline && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white text-center text-xs py-1.5 font-medium">
          No internet connection
        </div>
      )}
      {/* Header */}
      <div className="p-3 border-b shrink-0 bg-white flex items-center justify-between px-5">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
            {teacher?.full_name?.charAt(0)?.toUpperCase() || 'T'}
          </div>
          <div>
            <h3 className="font-semibold text-sm text-slate-800">{teacher?.full_name || 'Your Teacher'}</h3>
            <p className="text-[10px] font-medium">
              {teacher?.id && isOnline(teacher.id) ? (
                <span className="text-green-600">● Online</span>
              ) : (
                <span className="text-slate-400">Offline</span>
              )}
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0 bg-[#e8f4f8]">
        {loadingOlder && (
          <div className="flex justify-center py-3">
            <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
          </div>
        )}
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-slate-400">
            <MessageCircle size={40} className="mb-2 text-slate-300" />
            <p className="text-sm font-medium text-slate-500">No messages yet</p>
            <p className="text-xs text-slate-400">Send a message to start chatting with your teacher</p>
          </div>
        ) : (
          messages.map((msg, idx) => {
            const isMe = msg.sender_id === profile.id;
            const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx-1]?.created_at).toDateString();
            return (
              <React.Fragment key={msg.id}>
                {showDate && (
                  <div className="flex justify-center my-3">
                    <span className="text-[10px] bg-white/80 text-slate-500 px-3 py-1 rounded-full shadow-sm">
                      {new Date(msg.created_at).toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
                    </span>
                  </div>
                )}
                <div className={`flex ${isMe ? 'justify-end' : 'justify-start'} animate-in`}>
                  <div className={`max-w-[75%] px-3.5 py-2.5 shadow-sm ${
                    isMe ? 'bg-[#d9fdd3] text-slate-900 rounded-2xl rounded-br-md' : 'bg-white text-slate-900 rounded-2xl rounded-bl-md'
                  }`}>
                    <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                    <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                      <span className="text-[9px] text-slate-400">
                        {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {isMe && getOwnMessageStatus(msg)}
                    </div>
                  </div>
                </div>
              </React.Fragment>
            );
          })
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div className="p-2 border-t bg-white shrink-0 px-3">
        <div className="flex gap-2 items-center">
          <input
            type="text" value={newMessage} onChange={e => setNewMessage(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
            placeholder="Type a message"
            className="flex-1 border-0 rounded-lg px-3 py-2 text-sm bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <button onClick={sendMessage} disabled={!newMessage.trim()}
            className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
            <Send size={16} />
          </button>
        </div>
      </div>

      <style>{`
        @keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: in 0.15s ease-out; }
      `}</style>
    </div>
  );
};

export default ChatWithTeacher;
