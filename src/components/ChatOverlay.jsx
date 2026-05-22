import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '../supabaseClient';
import { useAuth } from '../context/AuthContext';
import { useChatOverlay } from '../context/ChatOverlayContext';
import { markChatAsRead } from '../utils/chatReadState';
import { Send, MessageCircle, X } from 'lucide-react';
import { logError } from '../utils/errorLogger';

const ChatOverlay = () => {
  const { overlayChat, closeChat } = useChatOverlay();
  const { profile } = useAuth();
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [groupId, setGroupId] = useState(null);
  const messagesEndRef = useRef(null);
  const messagesContainerRef = useRef(null);

  useEffect(() => {
    if (!overlayChat || !profile?.id) return;
    setMessages([]);
    setGroupId(null);
    initChat();
  }, [overlayChat?.userId, profile?.id]);

  useEffect(() => {
    if (!groupId) return;
    const subscription = supabase
      .channel(`chat_overlay:${groupId}`)
      .on('postgres_changes', {
        event: 'INSERT',
        schema: 'public',
        table: 'chat_messages',
        filter: `group_id=eq.${groupId}`
      }, async payload => {
        const { data } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles(full_name, avatar_url)')
          .eq('id', payload.new.id)
          .maybeSingle();
        setMessages(prev => prev.some(m => m.id === payload.new.id) ? prev : [...prev, data || payload.new]);
        scrollToBottom();
        void markChatAsRead(profile?.id, groupId);
      })
      .subscribe();
    return () => subscription.unsubscribe();
  }, [groupId]);

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const scrollToBottom = () => {
    requestAnimationFrame(() => {
      messagesEndRef.current?.scrollIntoView({ behavior: 'auto' });
    });
  };

  const initChat = async () => {
    if (!profile?.id || !overlayChat?.userId) return;
    try {
      const myGroups = await supabase.from('chat_members').select('group_id').eq('user_id', profile.id);
      let gid = null;
      if (myGroups.data?.length > 0) {
        const ids = myGroups.data.map(g => g.group_id);
        const common = await supabase
          .from('chat_members')
          .select('group_id')
          .eq('user_id', overlayChat.userId)
          .in('group_id', ids);
        if (common.data?.length > 0) gid = common.data[0].group_id;
      }
      if (!gid) {
        const { data: group } = await supabase.from('chat_groups').insert({
          group_type: 'student_teacher',
          name: `${profile.full_name} - ${overlayChat.userName}`,
          created_by: profile.id
        }).select().single();
        if (group) {
          await supabase.from('chat_members').insert([
            { group_id: group.id, user_id: profile.id },
            { group_id: group.id, user_id: overlayChat.userId }
          ]);
          gid = group.id;
        }
      }
      if (gid) {
        setGroupId(gid);
        const { data } = await supabase
          .from('chat_messages')
          .select('*, sender:profiles(full_name, avatar_url)')
          .eq('group_id', gid)
          .order('created_at', { ascending: true });
        setMessages(data || []);
        void markChatAsRead(profile.id, gid);
      }
    } catch (err) {
      logError({ message: 'Chat overlay init error', source: 'ChatOverlay', details: err });
    }
  };

  const sendMessage = async () => {
    if (!newMessage.trim() || !groupId) return;
    const content = newMessage.trim();
    const tempId = `temp-${Date.now()}`;
    setMessages(prev => [...prev, {
      id: tempId, group_id: groupId, sender_id: profile.id, content,
      created_at: new Date().toISOString(),
      sender: { full_name: profile.full_name, avatar_url: profile.avatar_url }
    }]);
    setNewMessage('');
    const { data } = await supabase.from('chat_messages').insert({
      group_id: groupId, sender_id: profile.id, content
    }).select('*, sender:profiles(full_name, avatar_url)').single();
    if (data) {
      setMessages(prev => prev.map(m => m.id === tempId ? data : m));
      void markChatAsRead(profile.id, groupId);
    } else {
      setMessages(prev => prev.filter(m => m.id !== tempId));
    }
  };

  if (!overlayChat) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black/40 z-50 flex items-end sm:items-center justify-center" onClick={closeChat}>
        <div
          className="bg-white w-full sm:max-w-lg sm:rounded-2xl sm:mx-4 shadow-2xl flex flex-col h-[90vh] sm:h-[650px] max-h-screen animate-slide-up"
          onClick={e => e.stopPropagation()}
        >
          <div className="flex items-center justify-between p-4 border-b shrink-0 bg-white">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-gradient-to-br from-blue-400 to-purple-500 flex items-center justify-center text-white text-sm font-bold shadow-sm">
                {overlayChat.userName?.charAt(0)?.toUpperCase() || '?'}
              </div>
              <div>
                <h3 className="font-semibold text-sm text-slate-800">{overlayChat.userName}</h3>
                <p className="text-[10px] text-slate-400">Online</p>
              </div>
            </div>
            <button onClick={closeChat} className="p-1.5 rounded-lg hover:bg-slate-100 text-slate-400 hover:text-slate-600 transition-colors">
              <X size={20} />
            </button>
          </div>

          <div ref={messagesContainerRef} className="flex-1 overflow-y-auto p-5 space-y-2 bg-[#e8f4f8]">
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
                      <div className={`max-w-[80%] px-3.5 py-2.5 shadow-sm ${
                        isMe
                          ? 'bg-[#d9fdd3] text-slate-900 rounded-2xl rounded-br-md'
                          : 'bg-white text-slate-900 rounded-2xl rounded-bl-md'
                      }`}>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                        <div className={`flex items-center gap-1 mt-0.5 ${isMe ? 'justify-end' : 'justify-start'}`}>
                          <span className="text-[9px] text-slate-400">
                            {new Date(msg.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        </div>
                      </div>
                    </div>
                  </React.Fragment>
                );
              })
            )}
            <div ref={messagesEndRef} />
          </div>

          <div className="p-3 border-t bg-white shrink-0">
            <div className="flex gap-2 items-end mx-2">
              <input
                type="text"
                value={newMessage}
                onChange={e => setNewMessage(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage(); } }}
                placeholder="Type a message"
                className="flex-1 border-0 rounded-xl px-4 py-3 text-sm bg-slate-100 focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <button
                onClick={sendMessage}
                disabled={!newMessage.trim()}
                className="bg-blue-600 text-white p-3 rounded-xl hover:bg-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed shadow-md"
              >
                <Send size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes slide-up {
          from { transform: translateY(100%); opacity: 0; }
          to { transform: translateY(0); opacity: 1; }
        }
        @keyframes in {
          from { opacity: 0; transform: translateY(4px); }
          to { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.25s ease-out; }
        .animate-in { animation: in 0.15s ease-out; }
      `}</style>
    </>
  );
};

export default ChatOverlay;
