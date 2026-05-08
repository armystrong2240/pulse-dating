import { createContext, useContext, useEffect, useRef, useState } from "react";
import { io } from "socket.io-client";
import { useAuth } from "./AuthContext";

const SocketContext = createContext(null);

export const SocketProvider = ({ children }) => {
  const { user } = useAuth();
  const socketRef = useRef(null);
  const [socket, setSocket] = useState(null);
  const [matchPopup, setMatchPopup] = useState(null);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [unreadMatches, setUnreadMatches] = useState(0);
  const [friendPopup, setFriendPopup] = useState(null); // { name, type: "request"|"accepted" }

  useEffect(() => {
    if (!user) {
      socketRef.current?.disconnect();
      socketRef.current = null;
      return;
    }

    const socket = io(import.meta.env.VITE_API_URL || "http://localhost:4000", {
      withCredentials: true,
    });
    socketRef.current = socket;
    setSocket(socket);

    socket.on("connect", () => {
      socket.emit("auth:identify", user.id);
    });

    socket.on("match:new", ({ matchedUser, icebreaker }) => {
      setMatchPopup({ ...matchedUser, icebreaker });
      setUnreadMatches((n) => n + 1);
      setTimeout(() => setMatchPopup(null), 7000);
    });

    socket.on("chat:new_message", (msg) => {
      if (msg.senderId !== user.id) {
        setUnreadMessages((n) => n + 1);
      }
    });

    socket.on("friend:request", ({ user: sender }) => {
      setFriendPopup({ name: sender?.name, type: "request" });
      setTimeout(() => setFriendPopup(null), 4000);
    });

    socket.on("friend:accepted", ({ user: accepter }) => {
      setFriendPopup({ name: accepter?.name, type: "accepted" });
      setTimeout(() => setFriendPopup(null), 4000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setSocket(null);
    };
  }, [user]);

  const clearUnreadMessages = () => setUnreadMessages(0);
  const clearUnreadMatches = () => setUnreadMatches(0);

  return (
    <SocketContext.Provider value={{
      socket,
      matchPopup,
      unreadMessages,
      unreadMatches,
      clearUnreadMessages,
      clearUnreadMatches,
    }}>
      {children}
      {matchPopup && (
        <div className="match-popup">
          <div className="match-popup-inner">
            <div className="match-hearts">💗</div>
            <h3>It's a Match!</h3>
            <p>You and <strong>{matchPopup.name}</strong> liked each other</p>
            {matchPopup.icebreaker && (
              <div className="icebreaker-banner">
                <span className="icebreaker-label">✨ Conversation starter:</span>
                <p className="icebreaker-text">"{matchPopup.icebreaker}"</p>
              </div>
            )}
            {matchPopup.avatar && (
              <img src={matchPopup.avatar} alt={matchPopup.name} className="match-popup-avatar" />
            )}
            <button className="btn-primary" onClick={() => setMatchPopup(null)}>
              Keep Browsing
            </button>
          </div>
        </div>
      )}
      {friendPopup && (
        <div className="friend-toast">
          {friendPopup.type === "request"
            ? `👤 Friend request from ${friendPopup.name}`
            : `🎉 ${friendPopup.name} accepted your friend request!`}
        </div>
      )}
    </SocketContext.Provider>
  );
};

export const useSocket = () => useContext(SocketContext);
