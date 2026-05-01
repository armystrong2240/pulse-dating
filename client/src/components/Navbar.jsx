import { NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { useSocket } from "../context/SocketContext";
import { toAssetUrl } from "../api/client";
import { useEffect, useState } from "react";
import { api } from "../api/client";

export const Navbar = () => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const socket = useSocket();
  const unreadMessages = socket?.unreadMessages ?? 0;
  const unreadMatches = socket?.unreadMatches ?? 0;
  const [pendingFriends, setPendingFriends] = useState(0);
  const [onboardingNeeded, setOnboardingNeeded] = useState(false);

  useEffect(() => {
    if (!user) return;
    api.get("/friends/requests").then((r) => setPendingFriends(r.data.length)).catch(() => {});
    api.get("/onboarding/status")
      .then((r) => setOnboardingNeeded(!r.data.onboardingCompleted))
      .catch(() => {});
  }, [user]);

  // Listen for incoming friend requests via socket
  useEffect(() => {
    if (!socket?.socket) return;
    const s = socket.socket;
    const onRequest = () => setPendingFriends((n) => n + 1);
    const onAccepted = () => {};
    s.on("friend:request", onRequest);
    s.on("friend:accepted", onAccepted);
    return () => { s.off("friend:request", onRequest); s.off("friend:accepted", onAccepted); };
  }, [socket?.socket]);

  const onLogout = () => {
    logout();
    navigate("/login");
  };

  return (
    <header className="topbar">
      <div>
        <h1>PulseDate</h1>
        <p>Find your person, your vibe, your circle.</p>
      </div>

      {user ? (
        <nav>
          <NavLink to="/" end className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            Discover
          </NavLink>
          <NavLink to="/matches" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            onClick={socket?.clearUnreadMatches}>
            Matches{unreadMatches > 0 && <span className="nav-badge">{unreadMatches}</span>}
          </NavLink>
          <NavLink to="/chat" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            onClick={socket?.clearUnreadMessages}>
            Messages{unreadMessages > 0 && <span className="nav-badge">{unreadMessages}</span>}
          </NavLink>
          <NavLink to="/friends" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}
            onClick={() => setPendingFriends(0)}>
            Friends{pendingFriends > 0 && <span className="nav-badge">{pendingFriends}</span>}
          </NavLink>
          {onboardingNeeded && (
            <NavLink to="/onboarding" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
              Onboarding
              <span className="nav-badge">!</span>
            </NavLink>
          )}
          <NavLink to="/live" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            Live
          </NavLink>
          <NavLink to="/viewed-me" className={({ isActive }) => isActive ? "nav-link active" : "nav-link"}>
            👁 Viewed Me
          </NavLink>
          <NavLink to={`/profiles/${user.id}`}
            className={({ isActive }) => isActive ? "nav-link active nav-me" : "nav-link nav-me"}>
            {user.avatar ? (
              <img src={toAssetUrl(user.avatar)} className="nav-avatar" alt={user.name} />
            ) : (
              user.name
            )}
          </NavLink>
          <button className="btn-secondary nav-link" onClick={onLogout}>Sign out</button>
        </nav>
      ) : (
        <nav>
          <NavLink to="/login" className="nav-link">Sign In</NavLink>
          <NavLink to="/register" className="btn-primary nav-link">Join</NavLink>
        </nav>
      )}
    </header>
  );
};
