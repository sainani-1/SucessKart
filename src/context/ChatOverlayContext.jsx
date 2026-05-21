import React, { createContext, useContext, useState, useCallback } from 'react';

const ChatOverlayContext = createContext(null);

export const useChatOverlay = () => {
  const ctx = useContext(ChatOverlayContext);
  if (!ctx) throw new Error('useChatOverlay must be used within ChatOverlayProvider');
  return ctx;
};

export const ChatOverlayProvider = ({ children }) => {
  const [overlayChat, setOverlayChat] = useState(null);

  const openChat = useCallback((userId, userName, userAvatar) => {
    setOverlayChat({ userId, userName, userAvatar: userAvatar || null });
  }, []);

  const closeChat = useCallback(() => {
    setOverlayChat(null);
  }, []);

  return (
    <ChatOverlayContext.Provider value={{ overlayChat, openChat, closeChat }}>
      {children}
    </ChatOverlayContext.Provider>
  );
};

export default ChatOverlayContext;
