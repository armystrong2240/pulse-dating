import { useEffect, useRef, useState } from "react";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../hooks/useSocket";

const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

export const MessagePanel = ({ activeProfile }) => {
  const socket = useSocket();
  const { user } = useAuth();
  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const bottomRef = useRef(null);
  const roomId = activeProfile?.id || "global";

  useEffect(() => {
    const load = async () => {
      const { data } = await api.get("/messages", { params: { roomId } });
      setMessages(data);
      // Mark as read on open
      api.post("/messages/read", { roomId }).catch(() => {});
    };
    load();
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  useEffect(() => {
    socket.emit("chat:join", roomId);

    const onNewMsg = (message) => {
      if (message.roomId === roomId) {
        setMessages((prev) => [...prev, message]);
        // Mark as read immediately if panel is open
        api.post("/messages/read", { roomId }).catch(() => {});
      }
    };

    const onReaction = ({ messageId, userId, emoji }) => {
      setMessages((prev) => prev.map((m) => {
        if (m.id !== messageId) return m;
        const reactions = m.reactions ? [...m.reactions] : [];
        const idx = reactions.findIndex((r) => r.userId === userId);
        if (idx >= 0) reactions[idx] = { userId, emoji };
        else reactions.push({ userId, emoji });
        return { ...m, reactions };
      }));
    };

    const onRead = ({ roomId: readRoom }) => {
      if (readRoom === roomId) {
        setMessages((prev) => prev.map((m) =>
          m.senderId === user?.id && !m.readAt ? { ...m, readAt: new Date().toISOString() } : m
        ));
      }
    };

    socket.on("chat:new_message", onNewMsg);
    socket.on("chat:reaction", onReaction);
    socket.on("chat:read", onRead);
    return () => {
      socket.off("chat:new_message", onNewMsg);
      socket.off("chat:reaction", onReaction);
      socket.off("chat:read", onRead);
    };
  }, [roomId, socket, user?.id]);

  const onSend = async (event) => {
    event.preventDefault();
    if (!text.trim()) return;
    await api.post("/messages", { roomId, text });
    setText("");
  };

  const onReact = async (messageId, emoji) => {
    await api.post("/messages/react", { messageId, emoji });
    setHoveredId(null);
  };

  const groupReactions = (reactions = []) => {
    const counts = {};
    reactions.forEach(({ emoji }) => { counts[emoji] = (counts[emoji] || 0) + 1; });
    return Object.entries(counts);
  };

  return (
    <section className="panel">
      <h2>{activeProfile ? `Chat with ${activeProfile.name}` : "Community Chat"}</h2>

      <div className="message-list">
        {messages.map((message) => {
          const isMine = message.senderId === user?.id;
          const reactionGroups = groupReactions(message.reactions);
          return (
            <div
              className={`message${isMine ? " message-mine" : ""}`}
              key={message.id}
              onMouseEnter={() => setHoveredId(message.id)}
              onMouseLeave={() => setHoveredId(null)}
            >
              {!isMine && <strong>{message.senderName}</strong>}
              <p>{message.text}</p>
              {reactionGroups.length > 0 && (
                <div className="reaction-display">
                  {reactionGroups.map(([emoji, count]) => (
                    <span key={emoji} className="reaction-count">{emoji} {count}</span>
                  ))}
                </div>
              )}
              <div className="message-meta">
                <small>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small>
                {isMine && (
                  <span className="read-receipt">
                    {message.readAt ? "✓✓ Read" : "✓ Sent"}
                  </span>
                )}
              </div>
              {hoveredId === message.id && (
                <div className="reaction-bar">
                  {QUICK_EMOJIS.map((emoji) => (
                    <button key={emoji} className="reaction-btn" onClick={() => onReact(message.id, emoji)}>{emoji}</button>
                  ))}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <form className="inline-form" onSubmit={onSend}>
        <input
          value={text}
          onChange={(event) => setText(event.target.value)}
          placeholder="Type your message"
        />
        <button type="submit" className="btn-primary">Send</button>
      </form>
    </section>
  );
};
