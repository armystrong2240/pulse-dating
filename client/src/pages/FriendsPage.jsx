import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, toAssetUrl } from "../api/client";

function Avatar({ user, size = 52 }) {
  if (user.avatar) {
    return (
      <img
        src={toAssetUrl(user.avatar)}
        alt={user.name}
        className="friends-avatar"
        style={{ width: size, height: size }}
      />
    );
  }
  return (
    <div className="friends-avatar-placeholder" style={{ width: size, height: size }}>
      {user.name?.[0] ?? "?"}
    </div>
  );
}

function FriendCard({ user, onMessage, onUnfriend }) {
  return (
    <div className="friend-card">
      <Link to={`/profiles/${user.id}`} className="friend-card-left">
        <Avatar user={user} />
        <div className="friend-card-info">
          <span className="friend-name">{user.name}</span>
          <span className="friend-meta">{user.age} · {user.city}</span>
        </div>
      </Link>
      <div className="friend-card-actions">
        <button className="btn-sm btn-accent" onClick={() => onMessage(user)}>
          💬 Message
        </button>
        <button className="btn-sm btn-ghost" onClick={() => onUnfriend(user.id)}>
          Unfriend
        </button>
      </div>
    </div>
  );
}

function RequestCard({ item, onAccept, onDecline }) {
  const { user, friendshipId } = item;
  return (
    <div className="friend-card">
      <Link to={`/profiles/${user.id}`} className="friend-card-left">
        <Avatar user={user} />
        <div className="friend-card-info">
          <span className="friend-name">{user.name}</span>
          <span className="friend-meta">{user.age} · {user.city}</span>
        </div>
      </Link>
      <div className="friend-card-actions">
        <button className="btn-sm btn-accent" onClick={() => onAccept(friendshipId, user.id)}>
          ✓ Accept
        </button>
        <button className="btn-sm btn-ghost" onClick={() => onDecline(friendshipId)}>
          Decline
        </button>
      </div>
    </div>
  );
}

function SentCard({ item, onCancel }) {
  const { user } = item;
  return (
    <div className="friend-card">
      <Link to={`/profiles/${user.id}`} className="friend-card-left">
        <Avatar user={user} />
        <div className="friend-card-info">
          <span className="friend-name">{user.name}</span>
          <span className="friend-meta">{user.age} · {user.city}</span>
        </div>
      </Link>
      <div className="friend-card-actions">
        <span className="friend-pending-label">Pending…</span>
        <button className="btn-sm btn-ghost" onClick={() => onCancel(user.id)}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function FriendsPage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("friends");
  const [friends, setFriends] = useState([]);
  const [requests, setRequests] = useState([]);
  const [sent, setSent] = useState([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [fRes, rRes, sRes] = await Promise.all([
        api.get("/friends"),
        api.get("/friends/requests"),
        api.get("/friends/sent"),
      ]);
      setFriends(fRes.data);
      setRequests(rRes.data);
      setSent(sRes.data);
    } catch {/* ignore */} finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const onMessage = (user) => {
    navigate(`/chat?roomId=${user.id}`);
  };

  const onUnfriend = async (userId) => {
    await api.delete(`/friends/${userId}`);
    setFriends((prev) => prev.filter((f) => f.id !== userId));
  };

  const onAccept = async (friendshipId, userId) => {
    await api.post(`/friends/accept/${friendshipId}`);
    setRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
    // Reload friends to include newly accepted
    const res = await api.get("/friends");
    setFriends(res.data);
  };

  const onDecline = async (friendshipId) => {
    await api.post(`/friends/decline/${friendshipId}`);
    setRequests((prev) => prev.filter((r) => r.friendshipId !== friendshipId));
  };

  const onCancel = async (userId) => {
    await api.delete(`/friends/cancel/${userId}`);
    setSent((prev) => prev.filter((s) => s.user.id !== userId));
  };

  const TABS = [
    { value: "friends", label: `Friends${friends.length ? ` (${friends.length})` : ""}` },
    { value: "requests", label: `Requests${requests.length ? ` (${requests.length})` : ""}` },
    { value: "sent", label: "Sent" },
  ];

  return (
    <div className="page friends-page">
      <h2 className="page-heading">Friends</h2>
      <div className="friends-tabs">
        {TABS.map((t) => (
          <button
            key={t.value}
            className={`friends-tab${tab === t.value ? " friends-tab-active" : ""}`}
            onClick={() => setTab(t.value)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="dim-text">Loading…</p>
      ) : tab === "friends" ? (
        friends.length === 0 ? (
          <div className="friends-empty">
            <p>No friends yet.</p>
            <p className="dim-text">Visit someone's profile and add them as a friend!</p>
          </div>
        ) : (
          <div className="friend-list">
            {friends.map((f) => (
              <FriendCard key={f.id} user={f} onMessage={onMessage} onUnfriend={onUnfriend} />
            ))}
          </div>
        )
      ) : tab === "requests" ? (
        requests.length === 0 ? (
          <div className="friends-empty"><p className="dim-text">No incoming requests.</p></div>
        ) : (
          <div className="friend-list">
            {requests.map((r) => (
              <RequestCard key={r.friendshipId} item={r} onAccept={onAccept} onDecline={onDecline} />
            ))}
          </div>
        )
      ) : (
        sent.length === 0 ? (
          <div className="friends-empty"><p className="dim-text">No outgoing requests.</p></div>
        ) : (
          <div className="friend-list">
            {sent.map((s) => (
              <SentCard key={s.friendshipId} item={s} onCancel={onCancel} />
            ))}
          </div>
        )
      )}
    </div>
  );
}
