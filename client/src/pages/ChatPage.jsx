import { useCallback, useEffect, useRef, useState } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { api, toAssetUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";

const QUICK_EMOJIS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

// ── Typing indicator bubble ──────────────────────────────────────────────────
const TypingBubble = () => (
  <div className="typing-bubble">
    <span /><span /><span />
  </div>
);

export const ChatPage = () => {
  const { user } = useAuth();
  const socket = useSocket();
  const { roomId: pathRoomId } = useParams();
  const [searchParams, setSearchParams] = useSearchParams();

  const [conversations, setConversations] = useState([]);
  const [activeRoomId, setActiveRoomId] = useState(pathRoomId || searchParams.get("roomId") || null);
  const [activeUser, setActiveUser] = useState(null);

  const [messages, setMessages] = useState([]);
  const [text, setText] = useState("");
  const [search, setSearch] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [hoveredId, setHoveredId] = useState(null);
  const [isTyping, setIsTyping] = useState(false); // other person typing
  const typingTimeout = useRef(null);
  const bottomRef = useRef(null);
  const fileRef = useRef(null);
  const [uploading, setUploading] = useState(false);
  const [convoLoading, setConvoLoading] = useState(true);

  // Load conversations list
  const loadConversations = useCallback(async () => {
    setConvoLoading(true);
    try {
      const { data } = await api.get("/messages/conversations");
      setConversations(data);
    } finally {
      setConvoLoading(false);
    }
  }, []);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // When activeRoomId changes, load messages + mark as read
  useEffect(() => {
    if (!activeRoomId) return;
    const load = async () => {
      const { data } = await api.get("/messages", {
        params: { roomId: activeRoomId, search: searchQuery || undefined },
      });
      setMessages(data);
      api.post("/messages/read", { roomId: activeRoomId }).catch(() => {});
      // Also update unread in sidebar
      setConversations((prev) =>
        prev.map((c) => (c.user.id === activeRoomId ? { ...c, unreadCount: 0 } : c))
      );
    };
    load();
  }, [activeRoomId, searchQuery]);

  // Resolve the active user from conversations
  useEffect(() => {
    if (!activeRoomId) return;
    const convo = conversations.find((c) => c.user.id === activeRoomId);
    if (convo) setActiveUser(convo.user);
    else {
      // If opened via ?roomId= and not in conversations yet, fetch the profile
      api.get(`/profiles/${activeRoomId}`).then(({ data }) =>
        setActiveUser({ id: data.id, name: data.name, avatar: data.avatar })
      ).catch(() => {});
    }
  }, [activeRoomId, conversations]);

  // Scroll to bottom whenever messages change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isTyping]);

  // Socket: join room, handle incoming messages + reactions + read + typing
  useEffect(() => {
    if (!activeRoomId || !socket) return;
    socket.emit("chat:join", activeRoomId);

    const onNewMsg = (message) => {
      if (message.roomId === activeRoomId) {
        setMessages((prev) => [...prev, message]);
        api.post("/messages/read", { roomId: activeRoomId }).catch(() => {});
      }
      // Update sidebar last message
      loadConversations();
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
      if (readRoom === activeRoomId) {
        setMessages((prev) => prev.map((m) =>
          m.senderId === user?.id && !m.readAt
            ? { ...m, readAt: new Date().toISOString() }
            : m
        ));
      }
    };

    const onTyping = ({ userId, typing }) => {
      if (userId !== user?.id) setIsTyping(typing);
    };

    socket.on("chat:new_message", onNewMsg);
    socket.on("chat:reaction", onReaction);
    socket.on("chat:read", onRead);
    socket.on("chat:typing", onTyping);

    return () => {
      socket.off("chat:new_message", onNewMsg);
      socket.off("chat:reaction", onReaction);
      socket.off("chat:read", onRead);
      socket.off("chat:typing", onTyping);
    };
  }, [activeRoomId, socket, user?.id, loadConversations]);

  // Send typing indicator
  const handleTextChange = (e) => {
    setText(e.target.value);
    if (!socket || !activeRoomId) return;
    socket.emit("chat:typing", { roomId: activeRoomId, typing: true });
    clearTimeout(typingTimeout.current);
    typingTimeout.current = setTimeout(() => {
      socket.emit("chat:typing", { roomId: activeRoomId, typing: false });
    }, 1500);
  };

  const onSend = async (e) => {
    e.preventDefault();
    if (!text.trim() || !activeRoomId) return;
    clearTimeout(typingTimeout.current);
    socket?.emit("chat:typing", { roomId: activeRoomId, typing: false });
    const { data: msg } = await api.post("/messages", { roomId: activeRoomId, text });
    setText("");
    setMessages((prev) => [...prev, msg]);
    loadConversations();
  };

  const onImageUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file || !activeRoomId) return;
    setUploading(true);
    try {
      const { data } = await api.post("/messages/upload-image", file, {
        headers: { "Content-Type": file.type },
      });
      const { data: msg } = await api.post("/messages", {
        roomId: activeRoomId,
        text: "",
        imageUrl: data.url,
      });
      setMessages((prev) => [...prev, msg]);
      loadConversations();
    } finally {
      setUploading(false);
      e.target.value = "";
    }
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

  const openRoom = (id) => {
    setActiveRoomId(id);
    setSearchParams({ roomId: id });
    setIsTyping(false);
    setSearch("");
    setSearchQuery("");
  };

  return (
    <div className="chat-shell">
      {/* ── Sidebar ──────────────────────────────────────────────── */}
      <aside className="chat-sidebar">
        <div className="chat-sidebar-header">
          <h2>Messages</h2>
        </div>

        {convoLoading ? (
          <p className="chat-sidebar-empty muted">Loading…</p>
        ) : conversations.length === 0 ? (
          <p className="chat-sidebar-empty muted">
            No conversations yet. Visit someone's profile and start a conversation!
          </p>
        ) : (
          <ul className="convo-list">
            {conversations.map(({ user: u, lastMessage, unreadCount }) => (
              <li
                key={u.id}
                className={`convo-item${activeRoomId === u.id ? " active" : ""}${unreadCount > 0 ? " unread" : ""}`}
                onClick={() => openRoom(u.id)}
              >
                <div className="convo-avatar-wrap">
                  {u.avatar
                    ? <img src={toAssetUrl(u.avatar)} alt={u.name} className="convo-avatar" />
                    : <div className="convo-avatar-placeholder">{u.name[0]}</div>}
                  {unreadCount > 0 && <span className="convo-badge">{unreadCount}</span>}
                </div>
                <div className="convo-meta">
                  <span className="convo-name">{u.name}</span>
                  <span className="convo-last">
                    {lastMessage.imageUrl && !lastMessage.text ? "📷 Photo" : lastMessage.text}
                  </span>
                </div>
                <span className="convo-time">
                  {new Date(lastMessage.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                </span>
              </li>
            ))}
          </ul>
        )}
      </aside>

      {/* ── Thread ───────────────────────────────────────────────── */}
      <div className="chat-thread">
        {!activeRoomId ? (
          <div className="chat-empty-state">
            <p>💬</p>
            <p>Select a conversation or message someone from their profile.</p>
          </div>
        ) : (
          <>
            {/* Header */}
            <div className="chat-thread-header">
              {activeUser && (
                <>
                  {activeUser.avatar
                    ? <img src={toAssetUrl(activeUser.avatar)} alt={activeUser.name} className="chat-thread-avatar" />
                    : <div className="chat-thread-avatar-placeholder">{activeUser.name[0]}</div>}
                  <span className="chat-thread-name">{activeUser.name}</span>
                </>
              )}
              {/* Message search */}
              <div className="chat-search-bar">
                <input
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && setSearchQuery(search)}
                  placeholder="Search messages…"
                  className="chat-search-input"
                />
                {search && (
                  <button className="chat-search-clear" onClick={() => { setSearch(""); setSearchQuery(""); }}>✕</button>
                )}
              </div>
            </div>

            {/* Messages */}
            <div className="chat-messages">
              {searchQuery && (
                <div className="chat-search-banner muted">
                  Showing results for "<strong>{searchQuery}</strong>" — <button className="link" onClick={() => { setSearch(""); setSearchQuery(""); }}>clear</button>
                </div>
              )}
              {messages.map((message) => {
                const isMine = message.senderId === user?.id;
                const reactionGroups = groupReactions(message.reactions);
                return (
                  <div
                    key={message.id}
                    className={`chat-msg${isMine ? " chat-msg-mine" : " chat-msg-theirs"}`}
                    onMouseEnter={() => setHoveredId(message.id)}
                    onMouseLeave={() => setHoveredId(null)}
                  >
                    <div className="chat-msg-bubble">
                      {message.imageUrl && (
                        <img
                          src={toAssetUrl(message.imageUrl)}
                          alt="shared image"
                          className="chat-img"
                          onClick={() => window.open(toAssetUrl(message.imageUrl), "_blank")}
                        />
                      )}
                      {message.text && <p>{message.text}</p>}
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
                          <span className="read-receipt">{message.readAt ? "✓✓ Read" : "✓ Sent"}</span>
                        )}
                      </div>
                    </div>
                    {hoveredId === message.id && (
                      <div className={`reaction-bar${isMine ? " reaction-bar-left" : ""}`}>
                        {QUICK_EMOJIS.map((emoji) => (
                          <button key={emoji} className="reaction-btn" onClick={() => onReact(message.id, emoji)}>{emoji}</button>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
              {isTyping && (
                <div className="chat-msg chat-msg-theirs">
                  <div className="chat-msg-bubble">
                    <TypingBubble />
                  </div>
                </div>
              )}
              <div ref={bottomRef} />
            </div>

            {/* Input bar */}
            <form className="chat-input-bar" onSubmit={onSend}>
              <button
                type="button"
                className="chat-img-btn"
                title="Send image"
                onClick={() => fileRef.current?.click()}
                disabled={uploading}
              >
                {uploading ? "⏳" : "📷"}
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/*"
                style={{ display: "none" }}
                onChange={onImageUpload}
              />
              <input
                className="chat-text-input"
                value={text}
                onChange={handleTextChange}
                placeholder={`Message ${activeUser?.name || ""}…`}
                autoFocus
              />
              <button type="submit" className="btn-primary chat-send-btn" disabled={!text.trim()}>
                Send
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
};

