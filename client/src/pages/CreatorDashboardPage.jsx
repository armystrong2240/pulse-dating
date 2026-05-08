import { useEffect, useRef, useState } from "react";
import api from "../api/client.js";

const API = import.meta.env.VITE_API_URL || "http://localhost:4000";

function StatCard({ label, value }) {
  return (
    <div style={{ background: "#f3f4f6", borderRadius: 12, padding: "1rem 1.25rem", flex: 1, minWidth: 120 }}>
      <p style={{ margin: 0, fontSize: ".8rem", color: "#666", fontWeight: 600 }}>{label}</p>
      <p style={{ margin: 0, fontSize: "1.4rem", fontWeight: 800 }}>{value}</p>
    </div>
  );
}

export default function CreatorDashboardPage() {
  const [dash, setDash] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [payoutMsg, setPayoutMsg] = useState("");
  const [payoutLoading, setPayoutLoading] = useState(false);

  // Post form
  const [caption, setCaption] = useState("");
  const [isPPV, setIsPPV] = useState(false);
  const [ppvPrice, setPpvPrice] = useState("");
  const [mediaFile, setMediaFile] = useState(null);
  const [postLoading, setPostLoading] = useState(false);
  const [postError, setPostError] = useState("");
  const fileInputRef = useRef();

  // Cover upload
  const [coverLoading, setCoverLoading] = useState(false);
  const coverRef = useRef();

  // Price/bio edit
  const [editMode, setEditMode] = useState(false);
  const [editPrice, setEditPrice] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editLoading, setEditLoading] = useState(false);

  async function loadDash() {
    setLoading(true);
    try {
      const { data } = await api.get("/creator/me/dashboard");
      setDash(data);
    } catch (err) {
      setError(err.response?.data?.error || "Failed to load dashboard.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { loadDash(); }, []);

  async function requestPayout() {
    setPayoutLoading(true);
    setPayoutMsg("");
    try {
      const { data } = await api.post("/creator/me/payout-request");
      setPayoutMsg(data.message);
      loadDash();
    } catch (err) {
      setPayoutMsg(err.response?.data?.error || "Payout request failed.");
    } finally {
      setPayoutLoading(false);
    }
  }

  async function submitPost(e) {
    e.preventDefault();
    setPostError("");
    setPostLoading(true);
    try {
      const fd = new FormData();
      fd.append("caption", caption);
      fd.append("isPPV", String(isPPV));
      if (isPPV) fd.append("ppvPrice", ppvPrice);
      if (mediaFile) fd.append("media", mediaFile);
      await api.post("/creator/posts", fd, { headers: { "Content-Type": "multipart/form-data" } });
      setCaption(""); setIsPPV(false); setPpvPrice(""); setMediaFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
      loadDash();
    } catch (err) {
      setPostError(err.response?.data?.error || "Failed to create post.");
    } finally {
      setPostLoading(false);
    }
  }

  async function deletePost(postId) {
    if (!window.confirm("Delete this post?")) return;
    try {
      await api.delete(`/creator/posts/${postId}`);
      loadDash();
    } catch {}
  }

  async function uploadCover(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    setCoverLoading(true);
    try {
      const fd = new FormData();
      fd.append("cover", file);
      await api.post("/creator/me/cover", fd, { headers: { "Content-Type": "multipart/form-data" } });
      loadDash();
    } catch {}
    setCoverLoading(false);
  }

  async function saveSettings(e) {
    e.preventDefault();
    setEditLoading(true);
    try {
      await api.patch("/creator/me", { price: Number(editPrice), bio: editBio });
      setEditMode(false);
      loadDash();
    } catch {}
    setEditLoading(false);
  }

  if (loading) return <div style={{ padding: "2rem", textAlign: "center" }}>Loading…</div>;
  if (error) return <div style={{ padding: "2rem", color: "red" }}>{error}</div>;
  if (!dash) return null;

  const { settings, stats, recentTips, recentSubscribers } = dash;

  return (
    <div style={{ maxWidth: 720, margin: "0 auto", padding: "1.5rem 1rem" }}>
      <h2 style={{ fontWeight: 800, fontSize: "1.6rem", marginBottom: ".25rem" }}>🎬 Creator Dashboard</h2>

      {/* Stats */}
      <div style={{ display: "flex", gap: "1rem", flexWrap: "wrap", margin: "1rem 0" }}>
        <StatCard label="Active Subscribers" value={stats.activeSubscribers} />
        <StatCard label="Total Posts" value={stats.totalPosts} />
        <StatCard label="Pending Earnings" value={`$${stats.pendingEarnings.toFixed(2)}`} />
      </div>

      {/* Payout */}
      <div style={{ background: "#ede9fe", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <p style={{ margin: 0, fontWeight: 700 }}>Payout Balance: ${stats.pendingEarnings.toFixed(2)}</p>
        <p style={{ margin: "4px 0 .75rem", color: "#666", fontSize: ".85rem" }}>Minimum $10 to request. Paid via PayPal within 3–5 business days.</p>
        <button
          onClick={requestPayout}
          disabled={payoutLoading || stats.pendingEarnings < 10}
          style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: ".5rem 1rem", fontWeight: 700, cursor: "pointer", opacity: stats.pendingEarnings < 10 ? 0.4 : 1 }}
        >
          {payoutLoading ? "Requesting…" : "Request Payout"}
        </button>
        {payoutMsg && <p style={{ marginTop: ".5rem", color: "#7c3aed", fontWeight: 600 }}>{payoutMsg}</p>}
      </div>

      {/* Cover photo */}
      <div style={{ marginBottom: "1.5rem" }}>
        <p style={{ fontWeight: 700, marginBottom: ".5rem" }}>Cover Photo</p>
        {settings.creatorCover && (
          <img src={settings.creatorCover.startsWith("/") ? `${API}${settings.creatorCover}` : settings.creatorCover}
            alt="cover" style={{ width: "100%", maxHeight: 180, objectFit: "cover", borderRadius: 12, marginBottom: ".5rem" }} />
        )}
        <input ref={coverRef} type="file" accept="image/*" style={{ display: "none" }} onChange={uploadCover} />
        <button onClick={() => coverRef.current?.click()} disabled={coverLoading}
          style={{ background: "#f3f4f6", border: "none", borderRadius: 8, padding: ".45rem .9rem", fontWeight: 600, cursor: "pointer" }}>
          {coverLoading ? "Uploading…" : settings.creatorCover ? "Change Cover" : "Upload Cover"}
        </button>
      </div>

      {/* Settings */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: ".5rem" }}>
          <p style={{ fontWeight: 700, margin: 0 }}>Subscription Settings</p>
          <button onClick={() => { setEditMode(!editMode); setEditPrice(settings.creatorPrice); setEditBio(settings.creatorBio); }}
            style={{ background: "none", border: "1px solid #7c3aed", borderRadius: 8, padding: ".3rem .7rem", color: "#7c3aed", fontWeight: 600, cursor: "pointer" }}>
            {editMode ? "Cancel" : "Edit"}
          </button>
        </div>
        {!editMode ? (
          <>
            <p style={{ margin: "2px 0" }}>Price: <strong>${settings.creatorPrice}/mo</strong></p>
            <p style={{ margin: "2px 0", color: "#666" }}>{settings.creatorBio || <em>No bio yet</em>}</p>
          </>
        ) : (
          <form onSubmit={saveSettings} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
            <input type="number" min="1" max="500" step="0.01" value={editPrice} onChange={(e) => setEditPrice(e.target.value)}
              placeholder="Monthly price ($)" required
              style={{ padding: ".5rem .75rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem" }} />
            <textarea value={editBio} onChange={(e) => setEditBio(e.target.value)} maxLength={500} rows={3}
              placeholder="Creator bio…"
              style={{ padding: ".5rem .75rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem", resize: "vertical" }} />
            <button type="submit" disabled={editLoading}
              style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: ".5rem", fontWeight: 700, cursor: "pointer" }}>
              {editLoading ? "Saving…" : "Save"}
            </button>
          </form>
        )}
      </div>

      {/* Create post */}
      <div style={{ border: "1px solid #e5e7eb", borderRadius: 12, padding: "1rem 1.25rem", marginBottom: "1.5rem" }}>
        <p style={{ fontWeight: 700, marginBottom: ".75rem" }}>New Post</p>
        <form onSubmit={submitPost} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
          <textarea value={caption} onChange={(e) => setCaption(e.target.value)} maxLength={2000} rows={3}
            placeholder="Write something for your fans…"
            style={{ padding: ".5rem .75rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem", resize: "vertical" }} />
          <input ref={fileInputRef} type="file" accept="image/*,video/*" onChange={(e) => setMediaFile(e.target.files?.[0] || null)}
            style={{ fontSize: ".9rem" }} />
          <label style={{ display: "flex", alignItems: "center", gap: ".5rem", cursor: "pointer" }}>
            <input type="checkbox" checked={isPPV} onChange={(e) => setIsPPV(e.target.checked)} />
            Pay-per-view (PPV)
          </label>
          {isPPV && (
            <input type="number" min="1" max="500" step="0.01" value={ppvPrice} onChange={(e) => setPpvPrice(e.target.value)}
              placeholder="PPV unlock price ($)" required
              style={{ padding: ".5rem .75rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem" }} />
          )}
          {postError && <p style={{ color: "red", margin: 0 }}>{postError}</p>}
          <button type="submit" disabled={postLoading}
            style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: ".6rem", fontWeight: 700, cursor: "pointer" }}>
            {postLoading ? "Posting…" : "Post"}
          </button>
        </form>
      </div>

      {/* Recent subscribers */}
      {recentSubscribers.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontWeight: 700, marginBottom: ".5rem" }}>Recent Subscribers</p>
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {recentSubscribers.map((s) => (
              <div key={s.id} style={{ display: "flex", alignItems: "center", gap: ".75rem", background: "#f9fafb", borderRadius: 8, padding: ".5rem .75rem" }}>
                {s.fan.avatar && <img src={s.fan.avatar.startsWith("/") ? `${API}${s.fan.avatar}` : s.fan.avatar}
                  alt="" style={{ width: 36, height: 36, borderRadius: "50%", objectFit: "cover" }} />}
                <div>
                  <p style={{ margin: 0, fontWeight: 600 }}>{s.fan.name}</p>
                  <p style={{ margin: 0, fontSize: ".78rem", color: "#888" }}>Expires: {new Date(s.expiresAt).toLocaleDateString()}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent tips */}
      {recentTips.length > 0 && (
        <div style={{ marginBottom: "1.5rem" }}>
          <p style={{ fontWeight: 700, marginBottom: ".5rem" }}>Recent Tips</p>
          <div style={{ display: "flex", flexDirection: "column", gap: ".5rem" }}>
            {recentTips.map((t) => (
              <div key={t.id} style={{ background: "#f9fafb", borderRadius: 8, padding: ".5rem .75rem" }}>
                <p style={{ margin: 0 }}><strong>${t.amount.toFixed(2)}</strong> — {t.message || <em>No message</em>}</p>
                <p style={{ margin: 0, fontSize: ".78rem", color: "#888" }}>{new Date(t.createdAt).toLocaleDateString()}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* My posts */}
      <div>
        <p style={{ fontWeight: 700, marginBottom: ".5rem" }}>Your Posts</p>
        {/* Posts are fetched separately via the public profile endpoint — link there */}
        <a href={`/creator/${window.__currentUserId}`} style={{ color: "#7c3aed" }}>View your public creator profile</a>
      </div>
    </div>
  );
}
