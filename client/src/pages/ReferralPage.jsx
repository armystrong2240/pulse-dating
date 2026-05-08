import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";

const APP = "https://www.pulsedate.net";

function buildShareUrl(baseUrl, source) {
  if (!baseUrl) return "";
  // Append UTM params to track acquisition source
  const url = new URL(baseUrl, APP);
  url.searchParams.set("utm_source", source);
  url.searchParams.set("utm_medium", "referral");
  url.searchParams.set("utm_campaign", "invite");
  return url.toString();
}

export default function ReferralPage() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [copied, setCopied] = useState(false);
  const [redeemCode, setRedeemCode] = useState("");
  const [redeemMsg, setRedeemMsg] = useState("");
  const [redeemError, setRedeemError] = useState("");
  const [leaderboard, setLeaderboard] = useState([]);

  useEffect(() => {
    Promise.all([
      api.get("/referrals/my-code"),
      api.get("/referrals/leaderboard"),
    ])
      .then(([myRes, lbRes]) => {
        setData(myRes.data);
        setLeaderboard(lbRes.data.leaderboard || []);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  async function handleCopy() {
    if (!data?.shareUrl) return;
    await navigator.clipboard.writeText(buildShareUrl(data.shareUrl, "copy"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  async function handleRedeem(e) {
    e.preventDefault();
    setRedeemError("");
    setRedeemMsg("");
    try {
      const res = await api.post("/referrals/redeem", { code: redeemCode });
      setRedeemMsg(res.data.message || "Referral redeemed!");
      setRedeemCode("");
    } catch (e) {
      setRedeemError(e.response?.data?.error || "Failed to redeem code.");
    }
  }

  if (loading) return <div style={{ color: "#aaa", padding: 32, textAlign: "center" }}>Loading...</div>;

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#fff", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 600, margin: "0 auto" }}>
        <button
          onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", color: "#aaa", fontSize: 14, cursor: "pointer", marginBottom: 24 }}
        >
          ← Back
        </button>

        <h1 style={{ fontSize: "2rem", fontWeight: 800, marginBottom: 8 }}>Invite Friends 🎁</h1>
        <p style={{ color: "#aaa", marginBottom: 32 }}>
          Share your invite link. Every friend who joins earns you a free Boost!
        </p>

        {/* Stats */}
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, marginBottom: 32 }}>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#e74c3c" }}>{data?.referralCount || 0}</div>
            <div style={{ color: "#aaa", fontSize: 13 }}>Friends Invited</div>
          </div>
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "1.25rem", textAlign: "center" }}>
            <div style={{ fontSize: "2rem", fontWeight: 800, color: "#f39c12" }}>{data?.rewardedCount || 0}</div>
            <div style={{ color: "#aaa", fontSize: 13 }}>Boosts Earned</div>
          </div>
        </div>

        {/* Share link */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "1.5rem", marginBottom: 24 }}>
          <div style={{ color: "#aaa", fontSize: 13, marginBottom: 8 }}>Your invite link</div>
          <div style={{ display: "flex", gap: 8 }}>
            <input
              readOnly
              value={data?.shareUrl || ""}
              style={{
                flex: 1,
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 8,
                padding: "0.6rem 0.8rem",
                color: "#fff",
                fontSize: 13,
                outline: "none",
              }}
            />
            <button
              onClick={handleCopy}
              style={{
                background: copied ? "#27ae60" : "#e74c3c",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "0.6rem 1rem",
                cursor: "pointer",
                fontSize: 13,
                fontWeight: 600,
                transition: "background 0.2s",
                whiteSpace: "nowrap",
              }}
            >
              {copied ? "✓ Copied!" : "Copy Link"}
            </button>
          </div>
          <div style={{ marginTop: 8, color: "#666", fontSize: 12 }}>
            Code: <strong style={{ color: "#aaa" }}>{data?.code}</strong>
          </div>
          {/* Social share buttons */}
          {data?.shareUrl && (
            <div style={{ display: "flex", gap: 8, marginTop: 16, flexWrap: "wrap" }}>
              {[
                { label: "𝕏 Twitter", color: "#1da1f2", href: (url) => `https://twitter.com/intent/tweet?text=${encodeURIComponent("Join me on PulseDate — the dating app that actually works 💘")}&url=${encodeURIComponent(url)}` },
                { label: "📘 Facebook", color: "#1877f2", href: (url) => `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(url)}` },
                { label: "💬 WhatsApp", color: "#25d366", href: (url) => `https://wa.me/?text=${encodeURIComponent("Join me on PulseDate 💘 " + url)}` },
                { label: "✉ Email", color: "#e91e8c", href: (url) => `mailto:?subject=${encodeURIComponent("Join me on PulseDate!")}&body=${encodeURIComponent("Hey! I've been using PulseDate and thought you'd love it. Use my link to join: " + url)}` },
              ].map(({ label, color, href }) => {
                const utmUrl = buildShareUrl(data.shareUrl, label.toLowerCase().replace(/[^a-z]+/g, "-"));
                return (
                  <a
                    key={label}
                    href={href(utmUrl)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ background: color, color: "#fff", textDecoration: "none", borderRadius: 8, padding: "0.45rem 0.85rem", fontSize: 12, fontWeight: 600 }}
                  >
                    {label}
                  </a>
                );
              })}
            </div>
          )}
        </div>

        {/* Redeem a code */}
        <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "1.5rem", marginBottom: 32 }}>
          <div style={{ fontWeight: 600, marginBottom: 12 }}>Got an invite code?</div>
          <form onSubmit={handleRedeem} style={{ display: "flex", gap: 8 }}>
            <input
              value={redeemCode}
              onChange={(e) => setRedeemCode(e.target.value.toUpperCase())}
              placeholder="Enter invite code"
              maxLength={8}
              style={{
                flex: 1,
                background: "#1a1a1a",
                border: "1px solid #333",
                borderRadius: 8,
                padding: "0.6rem 0.8rem",
                color: "#fff",
                fontSize: 14,
                outline: "none",
              }}
            />
            <button
              type="submit"
              style={{
                background: "#9b59b6",
                color: "#fff",
                border: "none",
                borderRadius: 8,
                padding: "0.6rem 1rem",
                cursor: "pointer",
                fontWeight: 600,
              }}
            >
              Redeem
            </button>
          </form>
          {redeemMsg && <div style={{ color: "#27ae60", fontSize: 13, marginTop: 8 }}>{redeemMsg}</div>}
          {redeemError && <div style={{ color: "#e74c3c", fontSize: 13, marginTop: 8 }}>{redeemError}</div>}
        </div>

        {/* Leaderboard */}
        {leaderboard.length > 0 && (
          <div style={{ background: "#111", border: "1px solid #222", borderRadius: 12, padding: "1.5rem" }}>
            <div style={{ fontWeight: 600, marginBottom: 16 }}>🏆 Top Inviters</div>
            {leaderboard.map((entry, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
                <div style={{ width: 28, textAlign: "center", color: i === 0 ? "#f39c12" : i === 1 ? "#bdc3c7" : i === 2 ? "#cd6133" : "#555", fontWeight: 700 }}>
                  {i + 1}
                </div>
                {entry.avatar ? (
                  <img src={entry.avatar} style={{ width: 32, height: 32, borderRadius: "50%", objectFit: "cover" }} />
                ) : (
                  <div style={{ width: 32, height: 32, borderRadius: "50%", background: "#333", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 13 }}>
                    {entry.name?.[0]?.toUpperCase()}
                  </div>
                )}
                <div style={{ flex: 1 }}>{entry.name}</div>
                <div style={{ color: "#e74c3c", fontWeight: 700 }}>{entry.count} invites</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
