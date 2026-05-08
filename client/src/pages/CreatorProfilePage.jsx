import { useCallback, useEffect, useState } from "react";
import { useLocation, useNavigate, useParams } from "react-router-dom";
import api from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

function mediaAbsUrl(url) {
  if (!url) return "";
  return url.startsWith("/") ? `${API}${url}` : url;
}

export default function CreatorProfilePage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Tip state
  const [tipAmount, setTipAmount] = useState("");
  const [tipMessage, setTipMessage] = useState("");
  const [tipLoading, setTipLoading] = useState(false);
  const [tipError, setTipError] = useState("");

  const loadProfile = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get(`/creator/${id}`);
      setProfile(data);
    } catch (err) {
      setError(err.response?.data?.error || "Creator not found.");
    } finally {
      setLoading(false);
    }
  }, [id]);

  // Handle PayPal return URL params
  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const action = params.get("action");
    const orderId = params.get("token"); // PayPal appends ?token=ORDER_ID

    if (!action || !orderId) return;

    (async () => {
      try {
        if (action === "sub_capture") {
          await api.post(`/creator/${id}/subscribe/capture`, { orderId });
          navigate(`/creator/${id}`, { replace: true });
        } else if (action === "ppv_capture") {
          const postId = params.get("postId");
          await api.post(`/creator/posts/${postId}/unlock/capture`, { orderId });
          navigate(`/creator/${id}`, { replace: true });
        } else if (action === "tip_capture") {
          const amount = params.get("tipAmount");
          const message = params.get("tipMsg");
          const context = params.get("tipCtx") || "profile";
          await api.post(`/creator/tip/${id}/capture`, { orderId, amount, message, context });
          navigate(`/creator/${id}`, { replace: true });
        }
      } catch {
        // Ignore capture errors silently — reload profile anyway
        navigate(`/creator/${id}`, { replace: true });
      }
    })();
  }, [location.search, id, navigate]);

  useEffect(() => { loadProfile(); }, [loadProfile]);

  async function subscribe() {
    try {
      const { data } = await api.post(`/creator/${id}/subscribe`);
      window.location.href = data.approveUrl;
    } catch (err) {
      setError(err.response?.data?.error || "Subscription error.");
    }
  }

  async function unlockPost(post) {
    try {
      const { data } = await api.post(`/creator/posts/${post.id}/unlock`);
      if (data.alreadyUnlocked || data.free) {
        loadProfile();
      } else {
        window.location.href = data.approveUrl;
      }
    } catch (err) {
      setError(err.response?.data?.error || "Unlock error.");
    }
  }

  async function sendTip(e) {
    e.preventDefault();
    setTipError("");
    const amt = Number(tipAmount);
    if (!amt || amt < 1) { setTipError("Minimum tip is $1."); return; }
    setTipLoading(true);
    try {
      const { data } = await api.post(`/creator/tip/${id}`, { amount: amt, message: tipMessage, context: "profile" });
      window.location.href = data.approveUrl;
    } catch (err) {
      setTipError(err.response?.data?.error || "Failed to send tip.");
    } finally {
      setTipLoading(false);
    }
  }

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;
  if (error) return <div style={{ padding: "2rem", color: "red" }}>{error}</div>;
  if (!profile) return null;

  const { creator, subscriberCount, isSubscribed, isOwnProfile, subscriptionExpiry, posts } = profile;

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", paddingBottom: "3rem" }}>
      {/* Cover */}
      <div style={{ position: "relative", height: 200, background: "#1f2937", borderRadius: "0 0 16px 16px", overflow: "hidden" }}>
        {creator.creatorCover
          ? <img src={mediaAbsUrl(creator.creatorCover)} alt="cover" style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          : <div style={{ width: "100%", height: "100%", background: "linear-gradient(135deg,#7c3aed,#db2777)" }} />}
        {creator.avatar && (
          <img src={mediaAbsUrl(creator.avatar)} alt={creator.name}
            style={{ position: "absolute", bottom: -36, left: 24, width: 80, height: 80, borderRadius: "50%", objectFit: "cover", border: "3px solid #fff" }} />
        )}
      </div>

      {/* Info */}
      <div style={{ padding: "2.75rem 1.5rem 1rem" }}>
        <h2 style={{ fontWeight: 800, fontSize: "1.5rem", margin: "0 0 .2rem" }}>{creator.name}</h2>
        {creator.city && <p style={{ color: "#888", margin: "0 0 .5rem", fontSize: ".9rem" }}>📍 {creator.city}</p>}
        {creator.creatorBio && <p style={{ color: "#374151", marginBottom: ".75rem" }}>{creator.creatorBio}</p>}
        <p style={{ color: "#888", fontSize: ".85rem", marginBottom: "1rem" }}>{subscriberCount} subscriber{subscriberCount !== 1 ? "s" : ""}</p>

        {!isOwnProfile && (
          <div style={{ display: "flex", gap: ".75rem", flexWrap: "wrap", marginBottom: "1.5rem" }}>
            {isSubscribed ? (
              <div style={{ background: "#d1fae5", borderRadius: 8, padding: ".5rem 1rem", fontWeight: 600, color: "#065f46" }}>
                ✓ Subscribed — expires {new Date(subscriptionExpiry).toLocaleDateString()}
              </div>
            ) : (
              <button onClick={subscribe}
                style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, padding: ".65rem 1.5rem", fontWeight: 700, fontSize: "1rem", cursor: "pointer" }}>
                Subscribe ${creator.creatorPrice}/mo
              </button>
            )}
          </div>
        )}
        {isOwnProfile && (
          <div style={{ display: "flex", gap: ".75rem", marginBottom: "1.5rem" }}>
            <button onClick={() => navigate("/creator/dashboard")}
              style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 10, padding: ".6rem 1.2rem", fontWeight: 700, cursor: "pointer" }}>
              Dashboard
            </button>
          </div>
        )}

        {/* Tip box */}
        {!isOwnProfile && (
          <details style={{ marginBottom: "1.5rem" }}>
            <summary style={{ fontWeight: 700, cursor: "pointer", color: "#7c3aed" }}>💰 Send a Tip</summary>
            <form onSubmit={sendTip} style={{ display: "flex", flexDirection: "column", gap: ".6rem", marginTop: ".75rem", maxWidth: 340 }}>
              <input type="number" min="1" max="500" step="0.01" value={tipAmount} onChange={(e) => setTipAmount(e.target.value)}
                placeholder="Amount ($)" required
                style={{ padding: ".5rem .75rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem" }} />
              <input type="text" value={tipMessage} onChange={(e) => setTipMessage(e.target.value)} maxLength={200}
                placeholder="Message (optional)"
                style={{ padding: ".5rem .75rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem" }} />
              {tipError && <p style={{ color: "red", margin: 0 }}>{tipError}</p>}
              <button type="submit" disabled={tipLoading}
                style={{ background: "#f59e0b", color: "#fff", border: "none", borderRadius: 8, padding: ".55rem", fontWeight: 700, cursor: "pointer" }}>
                {tipLoading ? "Redirecting…" : "Send Tip via PayPal"}
              </button>
            </form>
          </details>
        )}

        {/* Posts grid */}
        <h3 style={{ fontWeight: 700, marginBottom: "1rem" }}>Posts</h3>
        {posts.length === 0 && <p style={{ color: "#888" }}>No posts yet.</p>}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))", gap: "1rem" }}>
          {posts.map((p) => (
            <div key={p.id} style={{ borderRadius: 12, overflow: "hidden", background: "#f3f4f6", position: "relative" }}>
              {p.mediaUrl && p.unlocked ? (
                p.mediaType === "video"
                  ? <video src={mediaAbsUrl(p.mediaUrl)} controls style={{ width: "100%", maxHeight: 200, objectFit: "cover" }} />
                  : <img src={mediaAbsUrl(p.mediaUrl)} alt="" style={{ width: "100%", height: 160, objectFit: "cover" }} />
              ) : (
                <div style={{ height: 160, background: p.isPPV ? "#1f2937" : "#e5e7eb", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: ".5rem" }}>
                  {p.isPPV && !p.unlocked && (
                    <>
                      <span style={{ fontSize: "2rem" }}>🔒</span>
                      <span style={{ color: "#fff", fontWeight: 700 }}>${p.ppvPrice}</span>
                    </>
                  )}
                </div>
              )}
              <div style={{ padding: ".5rem .75rem" }}>
                {p.caption && <p style={{ margin: 0, fontSize: ".85rem", color: "#374151" }}>{p.caption}</p>}
                {p.isPPV && !p.unlocked && (
                  <button onClick={() => unlockPost(p)}
                    style={{ marginTop: ".4rem", background: "#7c3aed", color: "#fff", border: "none", borderRadius: 6, padding: ".35rem .7rem", fontWeight: 700, cursor: "pointer", fontSize: ".85rem" }}>
                    Unlock ${p.ppvPrice}
                  </button>
                )}
                <p style={{ margin: "4px 0 0", fontSize: ".75rem", color: "#9ca3af" }}>{new Date(p.createdAt).toLocaleDateString()}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
