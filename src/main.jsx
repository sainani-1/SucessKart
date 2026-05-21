import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import "./index.css";
import { AuthProvider } from "./context/AuthContext";
import { ChatProvider } from "./context/ChatContext";
import { NotificationProvider } from "./context/NotificationContext";
import { ChatOverlayProvider } from "./context/ChatOverlayContext";
import { PresenceProvider } from "./context/PresenceContext";
import GlobalInteractionGuards from "./components/GlobalInteractionGuards";

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <AuthProvider>
      <NotificationProvider>
        <ChatProvider>
          <ChatOverlayProvider>
            <PresenceProvider>
            <GlobalInteractionGuards />
            <App />
          </PresenceProvider>
          </ChatOverlayProvider>
        </ChatProvider>
      </NotificationProvider>
    </AuthProvider>
  </React.StrictMode>
);
