import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, toAssetUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";

const SafetyCardModal = ({ profile, onClose }) => {
  const info = `Date Safety Info\nName: ${profile.name}\nAge: ${profile.age}\nCity: ${profile.city}\nProfile: ${window.location.origin}/profiles/${profile.id}\nTime: ${new Date().toLocaleString()}`;
  const [copied, setCopied] = useState(false);
  const onCopy = () => {
    navigator.clipboard.writeText(info).then(() => { setCopied(true); setTimeout(() => setCopied(false), 2500); });
  };
  return (
    <div className="block-report-overlay" onClick={onClose}>
      <div className="safety-card-modal" onClick={(e) => e.stopPropagation()}>
        <h3>🛡 Date Safety Card</h3>
        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
          Share this info with a trusted friend before meeting {profile.name}.
        </p>
        <pre className="safety-card-text">{info}</pre>
        <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.75rem" }}>
          <button className="btn-primary" onClick={onCopy}>{copied ? "✅ Copied!" : "📋 Copy to Clipboard"}</button>
          <button className="btn-secondary" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
};

export const MatchesPage = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [matches, setMatches] = useState([]);
  const [pending, setPending] = useState([]);
  const [likedMe, setLikedMe] = useState([]);
  const [likedMeRequiresUpgrade, setLikedMeRequiresUpgrade] = useState(false);
  const [safetyProfile, setSafetyProfile] = useState(null);

  useEffect(() => {
    api.get("/matches").then((r) => setMatches(r.data));
    api.get("/matches/pending").then((r) => setPending(r.data));
    api.get("/matches/liked-me").then((r) => {
      setLikedMe(r.data.likedMe || []);
      setLikedMeRequiresUpgrade(r.data.requiresUpgrade || false);
    });
  }, []);

  return (
    <section className="page">
      <h2>Your Matches</h2>
      <p className="muted">
        {matches.length} mutual {matches.length === 1 ? "match" : "matches"}
      </p>

      {matches.length > 0 ? (
        <div className="profile-grid">
          {matches.map((profile) => (
            <article className="profile-card" key={profile.id}>
              <img src={toAssetUrl(profile.avatar)} alt={`${profile.name} avatar`} />
              <div className="profile-card-body">
                <h3>{profile.name}, {profile.age}</h3>
                <p className="muted">{profile.city}</p>
              </div>
              <div className="action-row">
                <Link to={`/chat?roomId=${profile.id}`} className="btn-primary">Message</Link>
                <Link to={`/profiles/${profile.id}`} className="btn-secondary">View</Link>
                <button className="btn-secondary" style={{ fontSize: "0.8rem" }} onClick={() => setSafetyProfile(profile)}>🛡</button>
              </div>
            </article>
          ))}
        </div>
      ) : (
        <p className="muted">
          No matches yet — go to <Link to="/" className="link">Discover</Link> and start liking!
        </p>
      )}

      {likedMe.length > 0 && (
        <>
          <h3 style={{ marginTop: "2rem" }}>
            💝 {likedMe.length} {likedMe.length === 1 ? "person" : "people"} liked you
          </h3>
          {likedMeRequiresUpgrade ? (
            <div style={{
              background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
              border: "1px solid #9b59b6",
              borderRadius: 12,
              padding: "1.5rem",
              marginBottom: "1rem",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>⭐</div>
              <div style={{ fontWeight: 700, marginBottom: 6 }}>See who liked you</div>
              <p style={{ color: "#aaa", fontSize: 13, marginBottom: 16 }}>
                {likedMe.length} people already liked you. Upgrade to Plus to see who they are — without waiting for a match!
              </p>
              <button
                onClick={() => navigate("/upgrade")}
                style={{
                  background: "linear-gradient(135deg, #9b59b6 0%, #6c3483 100%)",
                  color: "#fff",
                  border: "none",
                  borderRadius: 10,
                  padding: "0.75rem 1.5rem",
                  fontWeight: 700,
                  cursor: "pointer",
                  fontSize: 14,
                }}
              >
                Upgrade to Plus →
              </button>
            </div>
          ) : (
            <p className="muted" style={{ marginBottom: "1rem", fontSize: "0.85rem" }}>
              Like them back to connect!
            </p>
          )}
          <div className="profile-grid">
            {likedMe.map((person) => (
              <article className="profile-card liked-me-card" key={person.id}>
                <div className={`liked-me-avatar${person.isMutual ? "" : " blurred"}`}>
                  {person.avatar
                    ? <img src={toAssetUrl(person.avatar)} alt={person.name} />
                    : <div className="avatar-placeholder">?</div>}
                </div>
                <div className="profile-card-body">
                  <h3>{person.name}{person.isMutual ? `, ${person.age}` : ""}</h3>
                  <p className="muted">{person.isMutual ? person.city : "Mystery person 👀"}</p>
                  {person.isMutual && (
                    <span className="badge-green" style={{fontSize:"0.75rem"}}>✓ Matched!</span>
                  )}
                </div>
                {person.isMutual && (
                  <div className="action-row">
                    <Link to={`/profiles/${person.id}`} className="btn-secondary">View</Link>
                    <Link to={`/chat?roomId=${person.id}`} className="btn-primary">Message</Link>
                  </div>
                )}
              </article>
            ))}
          </div>
        </>
      )}

      {pending.length > 0 && (
        <>
          <h3 style={{ marginTop: "2rem" }}>Likes Sent — Awaiting Match</h3>
          <div className="profile-grid">
            {pending.map((profile) => (
              <article className="profile-card" key={profile.id}>
                <div className="profile-card-body">
                  <h3>{profile.name}, {profile.age}</h3>
                  <p className="muted">{profile.city} · Waiting…</p>
                </div>
              </article>
            ))}
          </div>
        </>
      )}
      {safetyProfile && <SafetyCardModal profile={safetyProfile} onClose={() => setSafetyProfile(null)} />}
    </section>
  );
};
