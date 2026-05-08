import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "../api/client.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

function mediaAbsUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${API}${url}` : url;
}

export default function CreatorFeedPage() {
  const [posts, setPosts] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/creator/me/feed")
      .then(({ data }) => setPosts(data))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading feed…</div>;

  return (
    <div style={{ maxWidth: 640, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h2 style={{ fontWeight: 800, fontSize: "1.5rem", marginBottom: ".25rem" }}>🎬 Creator Feed</h2>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>Posts from creators you subscribe to.</p>

      {posts.length === 0 && (
        <div style={{ textAlign: "center", padding: "3rem 0", color: "#888" }}>
          <p style={{ fontSize: "1.1rem" }}>No posts yet. Subscribe to a creator to see their content here.</p>
          <Link to="/matches" style={{ color: "#7c3aed", fontWeight: 700 }}>Browse profiles</Link>
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "1.5rem" }}>
        {posts.map((p) => (
          <div key={p.id} style={{ background: "#fff", border: "1px solid #e5e7eb", borderRadius: 16, overflow: "hidden" }}>
            {/* Creator header */}
            <Link to={`/creator/${p.creator.id}`} style={{ display: "flex", alignItems: "center", gap: ".75rem", padding: ".75rem 1rem", textDecoration: "none", color: "inherit" }}>
              {p.creator.avatar
                ? <img src={mediaAbsUrl(p.creator.avatar)} alt="" style={{ width: 40, height: 40, borderRadius: "50%", objectFit: "cover" }} />
                : <div style={{ width: 40, height: 40, borderRadius: "50%", background: "#7c3aed", display: "flex", alignItems: "center", justifyContent: "center", color: "#fff", fontWeight: 700 }}>
                    {p.creator.name?.[0] || "?"}
                  </div>}
              <div>
                <p style={{ margin: 0, fontWeight: 700 }}>{p.creator.name}</p>
                <p style={{ margin: 0, fontSize: ".8rem", color: "#888" }}>{new Date(p.createdAt).toLocaleDateString()}</p>
              </div>
            </Link>

            {/* Media */}
            {p.mediaUrl && (
              p.mediaType === "video"
                ? <video src={mediaAbsUrl(p.mediaUrl)} controls style={{ width: "100%", maxHeight: 420, objectFit: "cover", display: "block" }} />
                : <img src={mediaAbsUrl(p.mediaUrl)} alt="" style={{ width: "100%", maxHeight: 420, objectFit: "cover", display: "block" }} />
            )}

            {/* Caption */}
            {p.caption && <p style={{ margin: 0, padding: ".75rem 1rem", color: "#374151" }}>{p.caption}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}
