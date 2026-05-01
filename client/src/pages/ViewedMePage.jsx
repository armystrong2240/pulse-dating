import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, toAssetUrl } from "../api/client";

const timeAgo = (dateStr) => {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
};

export const ViewedMePage = () => {
  const [viewers, setViewers] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/profiles/views/me")
      .then(({ data }) => setViewers(data))
      .finally(() => setLoading(false));
  }, []);

  return (
    <section className="page">
      <div className="hero">
        <h2>👁 Who Viewed Your Profile</h2>
        <p>People who checked you out recently. Go say hi!</p>
      </div>

      {loading ? (
        <p className="muted">Loading...</p>
      ) : viewers.length === 0 ? (
        <p className="muted">No profile views yet. Share your profile to get noticed!</p>
      ) : (
        <div className="profile-grid">
          {viewers.map((v) => (
            <article key={v.id} className="profile-card">
              <div style={{ position: "relative" }}>
                <img
                  src={toAssetUrl(v.avatar)}
                  alt={v.name}
                  style={{ width: "100%", aspectRatio: "16/11", objectFit: "cover", borderRadius: "12px" }}
                />
                <span className="viewed-time-badge">{timeAgo(v.viewedAt)}</span>
              </div>
              <div className="profile-card-body">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h3 style={{ margin: 0 }}>{v.name}, {v.age}</h3>
                  {v.iLikedThem && (
                    <span className="badge-green" style={{ fontSize: "0.75rem" }}>❤️ Liked</span>
                  )}
                </div>
                <p className="muted" style={{ fontSize: "0.85rem" }}>{v.city}</p>
              </div>
              <div style={{ display: "flex", gap: "0.5rem" }}>
                <Link to={`/profiles/${v.id}`} className="btn-secondary" style={{ flex: 1, textAlign: "center" }}>
                  View Profile
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
};
