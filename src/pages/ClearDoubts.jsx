import React, { useState, useEffect, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../supabaseClient';
import { usePresenceContext } from '../context/PresenceContext';
import { MessageCircle, Send, Search } from 'lucide-react';
import { getChatReadTimes, markChatAsRead } from '../utils/chatReadState';
import { logError } from '../utils/errorLogger';

const ClearDoubts = () => {
  const { profile } = useAuth();
  const [chats, setChats] = useState([]);
  const [chatsLoaded, setChatsLoaded] = useState(false);
  const [filter, setFilter] = useState('all');
  const [selectedChat, setSelectedChat] = useState(null);
  const [reply, setReply] = useState('');
  const [chatMessages, setChatMessages] = useState([]);
  const [receiverReadAt, setReceiverReadAt] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [hasMoreOldMessages, setHasMoreOldMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [otherUserId, setOtherUserId] = useState(null);
  const scrollPositionsRef = useRef({});
  const savePosTimeoutRef = useRef(null);
  const autoLoadRef = useRef(0);

  try { scrollPositionsRef.current = JSON.parse(localStorage.getItem('cd_sp') || '{}'); } catch {}
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  const scrollToBottom = () => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto', block: 'end' }));
  };

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const savedPos = scrollPositionsRef.current[selectedChat?.id];
    if (savedPos !== undefined) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) messagesContainerRef.current.scrollTop = savedPos;
      });
    } else if (chatMessages.length > 0 && isAtBottom) {
      scrollToBottom();
    }
  }, [chatMessages]);

  useEffect(() => {
    if (!messagesContainerRef.current || !hasMoreOldMessages || loadingOlder || autoLoadRef.current >= 3) return;
    if (messagesContainerRef.current.scrollHeight <= messagesContainerRef.current.clientHeight + 1) {
      autoLoadRef.current++;
      loadOlderMessages();
    }
  }, [chatMessages, hasMoreOldMessages, loadingOlder]);

  useEffect(() => { if (selectedChat?.id) setTimeout(scrollToBottom, 100); }, [selectedChat?.id]);

  useEffect(() => {
    const goOnline = () => setIsOffline(false);
    const goOffline = () => setIsOffline(true);
    window.addEventListener('online', goOnline);
    window.addEventListener('offline', goOffline);
    return () => { window.removeEventListener('online', goOnline); window.removeEventListener('offline', goOffline); };
  }, []);

  useEffect(() => {
    if (!selectedChat?.id || !profile?.id) return;
    const interval = setInterval(() => {
      loadNewChatMessagesOnly();
      loadReceiverReadState(selectedChat.id);
      fetchStudentChats();
    }, 3000);
    return () => clearInterval(interval);
  }, [selectedChat?.id, profile?.id]);

  useEffect(() => {
    if (profile?.role === 'teacher') {
      fetchStudentChats();
      const interval = setInterval(() => fetchStudentChats(), 30000);
      return () => clearInterval(interval);
    }
  }, [profile]);

  useEffect(() => {
    if (profile?.role !== 'teacher' || !profile?.id) return;
    const subscription = supabase
      .channel(`clear-doubts-live:${profile.id}`)
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages'
      }, async (payload) => {
        fetchStudentChats();
        if (selectedChat?.id !== payload.new.group_id || payload.new.sender_id === profile.id) return;
        loadNewChatMessagesOnly();
      })
      .subscribe();
    return () => subscription.unsubscribe();
  }, [profile?.id, profile?.role, selectedChat?.id]);

  useEffect(() => {
    setChats([]);
    setSelectedChat(null);
    setChatMessages([]);
  }, [profile?.id]);

  const fetchStudentChats = async () => {
    if (!profile?.id) return;
    try {
      const { data: memberGroups } = await supabase
        .from('chat_members')
        .select('group_id, chat_groups(id, name, created_at, updated_at)')
        .eq('user_id', profile.id);
      if (!memberGroups?.length) { setChats([]); return; }

      const groups = memberGroups.map(mg => mg.chat_groups).filter(Boolean);
      const gids = groups.map(g => g.id);

      const { data: allMessages } = await supabase
        .from('chat_messages')
        .select('id, content, sender_id, created_at, group_id, sender:profiles!sender_id(full_name, avatar_url)')
        .in('group_id', gids)
        .order('created_at', { ascending: false });

      const { data: allMembers } = await supabase
        .from('chat_members')
        .select('group_id, profiles!inner(full_name)')
        .in('group_id', gids)
        .neq('user_id', profile.id);

      const nameByGroup = {};
      (allMembers || []).forEach(m => {
        if (!nameByGroup[m.group_id]) nameByGroup[m.group_id] = [];
        nameByGroup[m.group_id].push(m.profiles?.full_name || 'Student');
      });

      const lastByGroup = {};
      (allMessages || []).forEach(msg => { if (!lastByGroup[msg.group_id]) lastByGroup[msg.group_id] = msg; });

      const currentReadTimes = await getChatReadTimes(profile.id, gids);

      const groupsWithMeta = groups.map(group => {
        const lastReadAt = currentReadTimes.get(group.id);
        const groupMessages = (allMessages || []).filter(m => m.group_id === group.id);
        let unreadCount = 0;
        if (lastReadAt) {
          unreadCount = groupMessages.filter(m => m.sender_id !== profile.id && new Date(m.created_at) > new Date(lastReadAt)).length;
        } else {
          unreadCount = groupMessages.filter(m => m.sender_id !== profile.id).length;
        }
        return {
          ...group, lastMessage: lastByGroup[group.id] || null, unreadCount,
          is_read: unreadCount === 0, studentNames: nameByGroup[group.id] || ['Student']
        };
      });
      groupsWithMeta.sort((a, b) => new Date(b.updated_at) - new Date(a.updated_at));
      setChats(groupsWithMeta);
    } catch (err) { logError({ message: 'Error fetching chats:', source: 'ClearDoubts', details: err }); }
    finally { setChatsLoaded(true); }
  };

  const loadChatMessages = async (groupId, markAsReadFlag = true) => {
    try {
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('*, sender:profiles!sender_id(id, full_name, avatar_url)')
        .eq('group_id', groupId)
        .order('created_at', { ascending: false })
        .limit(8);
      setChatMessages((messages || []).reverse());
      setHasMoreOldMessages((messages || []).length === 8);
      if (markAsReadFlag) await markChatAsRead(profile.id, groupId);
      await loadReceiverReadState(groupId);
      setChats(prev => prev.map(c => c.id === groupId ? { ...c, is_read: true, unreadCount: 0 } : c));
    } catch (err) { logError({ message: 'Error loading messages:', source: 'ClearDoubts', details: err }); }
  };

  const loadNewChatMessagesOnly = async () => {
    if (!selectedChat?.id || !chatMessages.length) { await loadChatMessages(selectedChat?.id, true); return; }
    const latest = chatMessages[chatMessages.length - 1];
    if (String(latest.id).startsWith('temp-')) return;
    try {
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('*, sender:profiles!sender_id(id, full_name, avatar_url)')
        .eq('group_id', selectedChat.id)
        .gt('id', latest.id)
        .order('created_at', { ascending: true });
      if (messages?.length) {
        setChatMessages(prev => [...prev, ...messages]);
      }
      await markChatAsRead(profile.id, selectedChat.id);
    } catch (err) { logError({ message: 'Error refreshing messages:', source: 'ClearDoubts', details: err }); }
  };

  const loadOlderMessages = async () => {
    if (!selectedChat?.id || !chatMessages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = chatMessages[0];
      const { data: messages } = await supabase
        .from('chat_messages')
        .select('*, sender:profiles!sender_id(id, full_name, avatar_url)')
        .eq('group_id', selectedChat.id)
        .lt('id', oldest.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (messages?.length) {
        setChatMessages(prev => [...messages.reverse(), ...prev]);
        if (messages.length < 20) setHasMoreOldMessages(false);
      } else {
        setHasMoreOldMessages(false);
      }
    } catch (err) { logError({ message: 'Error loading older messages:', source: 'ClearDoubts', details: err }); }
    finally { setLoadingOlder(false); }
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const el = messagesContainerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    if (selectedChat?.id) {
      scrollPositionsRef.current[selectedChat.id] = el.scrollTop;
      clearTimeout(savePosTimeoutRef.current);
      savePosTimeoutRef.current = setTimeout(() => {
        try { localStorage.setItem('cd_sp', JSON.stringify(scrollPositionsRef.current)); } catch {}
      }, 500);
    }
    if (el.scrollTop < 50 && hasMoreOldMessages && !loadingOlder) {
      loadOlderMessages();
    }
  };

  const loadReceiverReadState = async (groupId = selectedChat?.id) => {
    if (!groupId || !profile?.id) return;
    try {
      const { data } = await supabase
        .from('chat_read_states')
        .select('user_id, last_read_at')
        .eq('group_id', groupId).neq('user_id', profile.id)
        .order('last_read_at', { ascending: false }).limit(1);
      setReceiverReadAt(data?.[0]?.last_read_at || null);
    } catch { setReceiverReadAt(null); }
  };

  const handleSelectChat = async (chat) => {
    clearTimeout(savePosTimeoutRef.current);
    try { localStorage.setItem('cd_sp', JSON.stringify(scrollPositionsRef.current)); } catch {}
    autoLoadRef.current = 0;
    setSelectedChat(chat);
    setChatMessages([]);
    setReceiverReadAt(null);
    loadChatMessages(chat.id);
    try {
      const { data: otherMembers } = await supabase
        .from('chat_members')
        .select('user_id')
        .eq('group_id', chat.id)
        .neq('user_id', profile.id);
      setOtherUserId(otherMembers?.[0]?.user_id || null);
    } catch { setOtherUserId(null); }
  };

  const sendReply = async () => {
    if (!selectedChat || !reply.trim()) return;
    const content = reply.trim();
    const tempId = `temp-${Date.now()}`;
    setChatMessages(prev => [...prev, {
      id: tempId, group_id: selectedChat.id, sender_id: profile.id, content,
      created_at: new Date().toISOString(),
      sender: { id: profile.id, full_name: profile.full_name, avatar_url: profile.avatar_url }
    }]);
    setReply('');
    setHasMoreOldMessages(true);
    if (selectedChat?.id) delete scrollPositionsRef.current[selectedChat.id];
    scrollToBottom();
    try {
      const { data } = await supabase.from('chat_messages').insert({ group_id: selectedChat.id, sender_id: profile.id, content }).select();
      if (data?.[0]) {
        setChatMessages(prev => prev.map(m => m.id === tempId ? { ...data[0], sender: m.sender } : m));
      }
      await markChatAsRead(profile.id, selectedChat.id);
      fetchStudentChats();
    } catch (err) { logError({ message: 'Error sending reply:', source: 'ClearDoubts', details: err }); }
  };

  const { isOnline } = usePresenceContext();

  const filteredChats = chats.filter(c => {
    if (filter === 'unread') return c.unreadCount > 0;
    if (filter === 'read') return c.unreadCount === 0;
    return true;
  }).filter(c => {
    if (!searchQuery) return true;
    const nameMatch = c.studentNames?.some(n => n.toLowerCase().includes(searchQuery.toLowerCase()));
    const msgMatch = c.lastMessage?.content?.toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || msgMatch;
  });

  const unreadCount = chats.filter(c => c.unreadCount > 0).length;
  const readCount = chats.filter(c => c.unreadCount === 0).length;

  if (profile?.role !== 'teacher') {
    return (
      <div className="bg-white p-6 rounded-xl border border-slate-100 shadow-sm text-center">
        <h1 className="text-2xl font-bold text-slate-900">Access Denied</h1>
        <p className="text-slate-500 mt-1">Only teachers can access student chats.</p>
      </div>
    );
  }

  return (
    <div className="flex h-[85vh] gap-0 bg-white rounded-xl border overflow-hidden shadow-sm relative box-border">
      {isOffline && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white text-center text-xs py-1.5 font-medium">
          No internet connection
        </div>
      )}
      {/* Chat List */}
      <div className="w-80 border-r bg-white flex flex-col shrink-0">
        <div className="p-3 border-b shrink-0 bg-white space-y-2">
          <h2 className="font-bold text-sm text-slate-800">Student Messages</h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search..." className="w-full pl-9 pr-3 py-2 text-sm border-0 bg-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
          <div className="flex gap-1.5">
            {['all', 'unread', 'read'].map(f => (
              <button key={f} onClick={() => setFilter(f)}
                className={`px-3 py-1 text-xs rounded-lg font-medium transition-all ${filter === f ? (f === 'unread' ? 'bg-red-600 text-white' : 'bg-blue-600 text-white') : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f === 'all' ? `All (${chats.length})` : f === 'unread' ? `Unread (${unreadCount})` : `Read (${readCount})`}
              </button>
            ))}
          </div>
        </div>
        <div className="divide-y overflow-y-auto flex-1">
          {!chatsLoaded ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredChats.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">No chats</p>
            </div>
          ) : (
            filteredChats.map(chat => (
              <button key={chat.id} onClick={() => handleSelectChat(chat)}
                className={`w-full p-3 text-left hover:bg-slate-50 transition-all flex items-center gap-3 ${selectedChat?.id === chat.id ? 'bg-blue-50' : ''}`}
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
                  {(chat.studentNames?.[0] || 'S').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate ${chat.unreadCount > 0 ? 'font-bold' : 'font-semibold'} text-slate-800`}>
                      {chat.studentNames?.[0] || chat.name || 'Student'}
                    </p>
                    {chat.lastMessage && (
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {new Date(chat.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className={`text-xs truncate mt-0.5 ${chat.unreadCount > 0 ? 'text-slate-700 font-medium' : 'text-slate-500'}`}>
                    {chat.lastMessage?.sender_id === profile.id ? 'You: ' : ''}{chat.lastMessage?.content || 'No messages yet'}
                  </p>
                </div>
                {chat.unreadCount > 0 && (
                  <div className="bg-blue-600 text-white rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px] font-bold shrink-0 px-1 shadow-sm">
                    {chat.unreadCount}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedChat ? (
        <div className="flex-1 flex flex-col min-w-0 h-full bg-white overflow-hidden">
          <div className="p-3 border-b shrink-0 bg-white flex items-center justify-between px-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {(selectedChat.studentNames?.[0] || 'S').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">{selectedChat.studentNames?.[0] || selectedChat.name || 'Chat'}</h3>
                <p className="text-[10px] font-medium">
                  {otherUserId && isOnline(otherUserId) ? (
                    <span className="text-green-600">● Online</span>
                  ) : (
                    <span className="text-slate-400">Offline</span>
                  )}
                </p>
              </div>
            </div>
          </div>

          <div ref={messagesContainerRef} onScroll={handleScroll} className="flex-1 overflow-y-auto p-3 space-y-1 min-h-0 bg-[#e8f4f8]">
            {loadingOlder && (
              <div className="flex justify-center py-3">
                <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
              </div>
            )}
            {chatMessages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-full text-slate-400">
                <MessageCircle size={40} className="mb-2 text-slate-300" />
                <p className="text-sm font-medium text-slate-500">No messages yet</p>
                <p className="text-xs text-slate-400">Send a message to start chatting</p>
              </div>
            ) : (
              chatMessages.map((msg, idx) => {
                const isMe = msg.sender_id === profile.id;
                const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(chatMessages[idx-1]?.created_at).toDateString();
                const status = (() => {
                  if (!isMe) return null;
                  if (String(msg.id).startsWith('temp-')) return <span className="text-slate-400 text-[9px] ml-1">✓</span>;
                  if (receiverReadAt && new Date(receiverReadAt) >= new Date(msg.created_at)) return <span className="text-blue-300 text-[9px] ml-1 font-bold">✓✓</span>;
                  return <span className="text-slate-400 text-[9px] ml-1">✓✓</span>;
                })();
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
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content || msg.message || ''}</p>
                        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[9px] text-slate-400">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          {status}
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-2 border-t bg-white shrink-0 px-3">
            <div className="flex gap-2 items-center">
              <input
                type="text" value={reply} onChange={e => setReply(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }}
                placeholder="Type a message"
                className="flex-1 border-0 rounded-lg px-3 py-2 text-sm bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button onClick={sendReply} disabled={!reply.trim()}
                className="bg-blue-600 text-white p-2 rounded-lg hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md">
                <Send size={16} />
              </button>
            </div>
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-[#e8f4f8] flex items-center justify-center">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center mx-auto mb-5 shadow-md">
              <MessageCircle size={44} className="text-blue-500" />
            </div>
            <p className="text-xl font-bold text-slate-700">Student Messages</p>
            <p className="text-sm text-slate-500 mt-2">Select a conversation from the left</p>
          </div>
        </div>
      )}

      <style>{`
        @keyframes in { from { opacity: 0; transform: translateY(4px); } to { opacity: 1; transform: translateY(0); } }
        .animate-in { animation: in 0.15s ease-out; }
      `}</style>
    </div>
  );
};

export default ClearDoubts;
