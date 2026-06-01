import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useChat } from '../context/ChatContext';
import { usePresenceContext } from '../context/PresenceContext';
import { Send, MessageCircle, Users, Search, ChevronDown } from 'lucide-react';
import { markChatAsRead } from '../utils/chatReadState';
import { logError } from '../utils/errorLogger';

const TeacherChat = () => {
  const { profile } = useAuth();
  const { clearUnreadCount } = useChat();
  const [chatGroups, setChatGroups] = useState([]);
  const [groupsLoaded, setGroupsLoaded] = useState(false);
  const [selectedGroup, setSelectedGroup] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [groupMembers, setGroupMembers] = useState([]);
  const [unreadCounts, setUnreadCounts] = useState({});
  const [receiverReadAt, setReceiverReadAt] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);
  const selectedGroupRef = useRef(null);
  const [showScrollBtn, setShowScrollBtn] = useState(false);
  const [hasMoreOldMessages, setHasMoreOldMessages] = useState(false);
  const [loadingOlder, setLoadingOlder] = useState(false);
  const [isAtBottom, setIsAtBottom] = useState(true);
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const scrollPositionsRef = useRef({});
  const savePosTimeoutRef = useRef(null);
  const autoLoadRef = useRef(0);

  selectedGroupRef.current = selectedGroup;

  try {
    scrollPositionsRef.current = JSON.parse(localStorage.getItem('tc_sp') || '{}');
  } catch {}

  useEffect(() => { clearUnreadCount(); }, [clearUnreadCount]);

  useEffect(() => {
    if (!profile?.id) return;
    loadChatGroups();
    const sub = supabase
      .channel('all_messages')
      .on('postgres_changes', {
        event: 'INSERT', schema: 'public', table: 'chat_messages'
      }, payload => {
        if (payload.new.group_id === selectedGroupRef.current && payload.new.sender_id !== profile.id) {
          loadNewMessagesOnly();
        }
        loadChatGroups();
        if (payload.new.sender_id !== profile.id) {
          setUnreadCounts(prev => prev[payload.new.group_id] ? prev : { ...prev, [payload.new.group_id]: 1 });
        }
      })
      .subscribe();
    return () => sub.unsubscribe();
  }, [profile?.id]);

  useEffect(() => {
    if (!selectedGroup) return;
    autoLoadRef.current = 0;
    loadMessages();
    loadMembers();
    setUnreadCounts(prev => ({ ...prev, [selectedGroup]: 0 }));
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedGroup || !profile?.id) return;
    const interval = setInterval(() => { loadNewMessagesOnly(); loadChatGroups(); }, 3000);
    return () => clearInterval(interval);
  }, [selectedGroup, profile?.id]);

  useEffect(() => {
    if (!messagesContainerRef.current) return;
    const savedPos = scrollPositionsRef.current[selectedGroup];
    if (savedPos !== undefined) {
      requestAnimationFrame(() => {
        if (messagesContainerRef.current) messagesContainerRef.current.scrollTop = savedPos;
      });
    } else if (isAtBottom) {
      scrollToBottom();
    }
  }, [messages]);

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

  const scrollToBottom = () => {
    requestAnimationFrame(() => messagesEndRef.current?.scrollIntoView({ behavior: 'auto' }));
  };

  const handleScroll = () => {
    if (!messagesContainerRef.current) return;
    const el = messagesContainerRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
    setIsAtBottom(atBottom);
    setShowScrollBtn(!atBottom && messages.length > 0);
    if (selectedGroup) {
      scrollPositionsRef.current[selectedGroup] = el.scrollTop;
      clearTimeout(savePosTimeoutRef.current);
      savePosTimeoutRef.current = setTimeout(() => {
        try { localStorage.setItem('tc_sp', JSON.stringify(scrollPositionsRef.current)); } catch {}
      }, 500);
    }
    if (el.scrollTop < 50 && hasMoreOldMessages && !loadingOlder) {
      loadOlderMessages();
    }
  };

  const saveScrollPositions = () => {
    clearTimeout(savePosTimeoutRef.current);
    try { localStorage.setItem('tc_sp', JSON.stringify(scrollPositionsRef.current)); } catch {}
  };

  const scrollToBottomBtn = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    setShowScrollBtn(false);
  };

  const loadChatGroups = async () => {
    if (!profile?.id) return;
    try {
      const { data: memberGroups } = await supabase
        .from('chat_members').select('group_id').eq('user_id', profile.id);
      if (!memberGroups?.length) { setChatGroups([]); return; }

      const gids = memberGroups.map(m => m.group_id);
      const { data: groups } = await supabase
        .from('chat_groups').select('*').in('id', gids).order('created_at', { ascending: false });

      const { data: allMsgs } = await supabase
        .from('chat_messages')
        .select('id, content, created_at, sender_id, group_id, sender:profiles!sender_id(full_name, avatar_url)')
        .in('group_id', gids)
        .order('created_at', { ascending: false });

      const { data: members } = await supabase
        .from('chat_members')
        .select('group_id, profiles!inner(full_name)')
        .in('group_id', gids)
        .neq('user_id', profile.id);

      const lastByGroup = {};
      (allMsgs || []).forEach(msg => { if (!lastByGroup[msg.group_id]) lastByGroup[msg.group_id] = msg; });

      const nameByGroup = {};
      (members || []).forEach(m => {
        if (!nameByGroup[m.group_id]) nameByGroup[m.group_id] = [];
        nameByGroup[m.group_id].push(m.profiles?.full_name || 'Student');
      });

      setChatGroups((groups || []).map(g => ({
        ...g,
        lastMessage: lastByGroup[g.id] || null,
        studentNames: nameByGroup[g.id] || ['Student']
      })));
    } catch (err) { logError({ message: 'Error loading groups:', source: 'TeacherChat', details: err }) }
    finally { setGroupsLoaded(true); }
  };

  const loadReceiverReadState = async () => {
    if (!selectedGroup || !profile?.id) return;
    try {
      const { data } = await supabase
        .from('chat_read_states')
        .select('user_id, last_read_at')
        .eq('group_id', selectedGroup)
        .neq('user_id', profile.id)
        .order('last_read_at', { ascending: false }).limit(1);
      setReceiverReadAt(data?.[0]?.last_read_at || null);
    } catch { setReceiverReadAt(null); }
  };

  const loadMessages = async () => {
    if (!selectedGroup) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name, avatar_url)')
        .eq('group_id', selectedGroup)
        .order('created_at', { ascending: false })
        .limit(8);
      setMessages((data || []).reverse());
      setHasMoreOldMessages((data || []).length === 8);
      await markChatAsRead(profile.id, selectedGroup);
      await loadReceiverReadState();
    } catch (err) { logError({ message: 'Error loading messages:', source: 'TeacherChat', details: err }) }
  };

  const loadNewMessagesOnly = async () => {
    if (!selectedGroup || !messages.length) { await loadMessages(); return; }
    const latest = messages[messages.length - 1];
    if (String(latest.id).startsWith('temp-')) return;
    try {
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name, avatar_url)')
        .eq('group_id', selectedGroup)
        .gt('id', latest.id)
        .order('created_at', { ascending: true });
      if (data?.length) {
        setMessages(prev => [...prev, ...data]);
      }
      await markChatAsRead(profile.id, selectedGroup);
    } catch (err) { logError({ message: 'Error refreshing messages:', source: 'TeacherChat', details: err }) }
  };

  const loadOlderMessages = async () => {
    if (!selectedGroup || !messages.length || loadingOlder) return;
    setLoadingOlder(true);
    try {
      const oldest = messages[0];
      const { data } = await supabase
        .from('chat_messages')
        .select('*, profiles(full_name, avatar_url)')
        .eq('group_id', selectedGroup)
        .lt('id', oldest.id)
        .order('created_at', { ascending: false })
        .limit(20);
      if (data?.length) {
        setMessages(prev => [...data.reverse(), ...prev]);
        if (data.length < 20) setHasMoreOldMessages(false);
      } else {
        setHasMoreOldMessages(false);
      }
    } catch (err) { logError({ message: 'Error loading older messages:', source: 'TeacherChat', details: err }) }
    finally { setLoadingOlder(false); }
  };

  const loadMembers = async () => {
    if (!selectedGroup) return;
    try {
      const { data } = await supabase
        .from('chat_members')
        .select('*, profiles(full_name, avatar_url, email)')
        .eq('group_id', selectedGroup);
      setGroupMembers(data || []);
    } catch (err) { logError({ message: 'Error loading members:', source: 'TeacherChat', details: err }) }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !selectedGroup) return;
    const content = newMessage.trim();
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, group_id: selectedGroup, sender_id: profile.id, content,
      created_at: new Date().toISOString(),
      profiles: { full_name: profile.full_name, avatar_url: profile.avatar_url }
    }]);
    setNewMessage('');
    setHasMoreOldMessages(true);
    if (selectedGroup) delete scrollPositionsRef.current[selectedGroup];
    scrollToBottom();
    try {
      const { data } = await supabase.from('chat_messages').insert({ group_id: selectedGroup, sender_id: profile.id, content }).select();
      if (data?.[0]) {
        setMessages(prev => prev.map(m => m.id === tempId ? { ...data[0], profiles: m.profiles } : m));
      }
      await markChatAsRead(profile.id, selectedGroup);
      loadChatGroups();
    } catch (err) { logError({ message: 'Error sending:', source: 'TeacherChat', details: err }) }
  };

  const { isOnline } = usePresenceContext();
  const otherMembers = groupMembers.filter(m => m.user_id !== profile?.id);
  const currentGroup = chatGroups.find(g => g.id === selectedGroup);

  const filteredGroups = chatGroups.filter(g => {
    if (!searchQuery) return true;
    const nameMatch = g.studentNames?.some(n => n.toLowerCase().includes(searchQuery.toLowerCase()));
    const msgMatch = g.lastMessage?.content?.toLowerCase().includes(searchQuery.toLowerCase());
    return nameMatch || msgMatch;
  });

  return (
    <div className="flex h-[85vh] gap-0 bg-white rounded-xl border overflow-hidden shadow-sm relative box-border">
      {isOffline && (
        <div className="absolute top-0 left-0 right-0 z-50 bg-red-600 text-white text-center text-xs py-1.5 font-medium">
          No internet connection
        </div>
      )}
      {/* Chat List */}
      <div className="w-80 border-r bg-white flex flex-col shrink-0">
        <div className="p-3 border-b shrink-0 bg-white">
          <h2 className="font-bold flex items-center gap-2 text-sm mb-2 text-slate-800">
            <Users size={16} className="text-blue-600" /> Messages
          </h2>
          <div className="relative">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text" value={searchQuery} onChange={e => setSearchQuery(e.target.value)}
              placeholder="Search conversations..."
              className="w-full pl-9 pr-3 py-2 text-sm border-0 bg-slate-100 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
            />
          </div>
        </div>
        <div className="divide-y overflow-y-auto flex-1">
          {!groupsLoaded ? (
            <div className="flex items-center justify-center h-full">
              <div className="w-5 h-5 border-2 border-blue-500 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : filteredGroups.length === 0 ? (
            <div className="p-8 text-center">
              <MessageCircle size={32} className="mx-auto mb-2 text-slate-300" />
              <p className="text-sm text-slate-400">No conversations yet</p>
              <p className="text-xs text-slate-300 mt-1">Messages from students appear here</p>
            </div>
          ) : (
            filteredGroups.map(group => (
              <button
                key={group.id}
                onClick={() => { saveScrollPositions(); setSelectedGroup(group.id); }}
                className={`w-full p-3 text-left hover:bg-slate-50 transition-all flex items-center gap-3 ${
                  selectedGroup === group.id ? 'bg-blue-50' : ''
                }`}
              >
                <div className="w-11 h-11 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shrink-0 shadow-sm">
                  {(group.studentNames?.[0] || 'S').charAt(0).toUpperCase()}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className={`text-sm truncate ${selectedGroup === group.id ? 'font-bold' : 'font-semibold'} text-slate-800`}>
                      {group.studentNames?.[0] || 'Student'}
                    </p>
                    {group.lastMessage && (
                      <span className="text-[10px] text-slate-400 shrink-0 ml-2">
                        {new Date(group.lastMessage.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-slate-500 truncate mt-0.5">
                    {group.lastMessage?.sender_id === profile.id ? 'You: ' : ''}
                    {group.lastMessage?.content || 'No messages yet'}
                  </p>
                </div>
                {unreadCounts[group.id] > 0 && (
                  <div className="bg-blue-600 text-white rounded-full min-w-[20px] h-5 flex items-center justify-center text-[10px] font-bold shrink-0 px-1 shadow-sm">
                    {unreadCounts[group.id]}
                  </div>
                )}
              </button>
            ))
          )}
        </div>
      </div>

      {/* Chat Area */}
      {selectedGroup ? (
        <div className="flex-1 flex flex-col min-w-0 h-full bg-white overflow-hidden">
          <div className="p-3 border-b shrink-0 bg-white flex items-center justify-between px-5">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {(currentGroup?.studentNames?.[0] || 'S').charAt(0).toUpperCase()}
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">{currentGroup?.studentNames?.[0] || 'Student'}</h3>
                <p className="text-[10px] text-green-600 font-medium">
                  {otherMembers.some(m => isOnline(m.user_id)) ? '● Online' : 'Offline'}
                </p>
                <p className="text-[10px] text-slate-400">{otherMembers.length} student{otherMembers.length !== 1 ? 's' : ''}</p>
              </div>
            </div>
          </div>

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
                <p className="text-xs text-slate-400">Send a message to start chatting</p>
              </div>
            ) : (
              messages.map((msg, idx) => {
                const isMe = msg.sender_id === profile.id;
                const showDate = idx === 0 || new Date(msg.created_at).toDateString() !== new Date(messages[idx-1]?.created_at).toDateString();
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
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
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
            {showScrollBtn && messages.length > 0 && (
              <button onClick={scrollToBottomBtn} className="sticky bottom-2 left-1/2 -translate-x-1/2 bg-blue-600 text-white text-xs px-4 py-2 rounded-full shadow-lg hover:bg-blue-700 z-10 flex items-center gap-1.5">
                <ChevronDown size={14} /> New
              </button>
            )}
            <div ref={messagesEndRef} />
          </div>

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
        </div>
      ) : (
        <div className="flex-1 bg-[#e8f4f8] flex items-center justify-center">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-white flex items-center justify-center mx-auto mb-5 shadow-md">
              <MessageCircle size={44} className="text-blue-500" />
            </div>
            <p className="text-xl font-bold text-slate-700">SucessKart Messages</p>
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

export default TeacherChat;
