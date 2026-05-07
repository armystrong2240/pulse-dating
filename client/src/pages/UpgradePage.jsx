import { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const PLAN_FEATURES = {
  free: {
    name: "Free",
    price: "$0",
    period: "",
    color: "#888",
    gradient: "linear-gradient(135deg, #555 0%, #333 100%)",
    features: [
      "20 likes per day",
      "1 Super Like per day",
      "Basic filters",
      "Mutual matches only",
    ],
    missing: [
      "See who liked you",
      "Unlimited likes",
      "Profile Boosts",
      "Virtual gifts",
      "Advanced filters",
      "Read receipts",
    ],
  },
  plus: {
    name: "PulsDate Plus",
    price: "$9.99",
    period: "/month",
    color: "#9b59b6",
    gradient: "linear-gradient(135deg, #9b59b6 0%, #6c3483 100%)",
    badge: "POPULAR",
    features: [
      "Unlimited likes",
      "5 Super Likes per day",
      "See who liked you",
      "1 Boost per week",
      "Advanced filters",
      "Read receipts",
      "Send virtual gifts",
    ],
  },
  gold: {
    name: "PulsDate Gold",
    price: "$19.99",
    period: "/month",
    color: "#f39c12",
    gradient: "linear-gradient(135deg, #f39c12 0%, #d68910 100%)",
    badge: "BEST VALUE",
    features: [
      "Everything in Plus",
      "Unlimited Super Likes",
      "3 Boosts per month",
      "Priority in discovery",
      "5 free gifts/month",
      "Profile highlighted in search",
      "Gold badge on profile",
    ],
  },
};

export default function UpgradePage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [subscription, setSubscription] = useState(null);
  const [subLoading, setSubLoading] = useState(true);

  const currentTier = user?.premiumTier || "free";

  useEffect(() => {
    api.get("/billing/subscription")
      .then((r) => setSubscription(r.data.subscription))
      .catch(() => {})
      .finally(() => setSubLoading(false));
  }, []);

  async function handleUpgrade(tier) {
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/billing/checkout", { tier });
      window.location.href = res.data.url;
    } catch (e) {
      const msg = e.response?.data?.error || "Failed to start checkout. Please try again.";
      setError(msg);
      setLoading(false);
    }
  }

  async function handleCancel() {
    if (!window.confirm("Are you sure you want to cancel your subscription? You'll keep access until the billing period ends.")) return;
    setLoading(true);
    setError("");
    try {
      const res = await api.post("/billing/cancel");
      alert(res.data.message || "Subscription cancelled.");
      window.location.reload();
    } catch (e) {
      setError(e.response?.data?.error || "Could not cancel subscription. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div style={{ minHeight: "100vh", background: "#0d0d0d", color: "#fff", padding: "2rem 1rem" }}>
      <div style={{ maxWidth: 900, margin: "0 auto" }}>
        {/* Header */}
        <button
          onClick={() => navigate(-1)}
          style={{ background: "none", border: "none", color: "#aaa", fontSize: 14, cursor: "pointer", marginBottom: 24 }}
        >
          ← Back
        </button>

        <div style={{ textAlign: "center", marginBottom: 48 }}>
          <h1 style={{ fontSize: "2.5rem", fontWeight: 800, margin: 0 }}>
            Upgrade Your <span style={{ color: "#e74c3c" }}>PulsDate</span>
          </h1>
          <p style={{ color: "#aaa", marginTop: 12, fontSize: "1.1rem" }}>
            Find better matches, faster. Unlock the features that matter.
          </p>
        </div>

        {/* Current plan banner */}
        {currentTier !== "free" && (
          <div style={{
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            border: "1px solid #333",
            borderRadius: 12,
            padding: "1rem 1.5rem",
            marginBottom: 32,
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
          }}>
            <div>
              <span style={{ color: "#aaa", fontSize: 13 }}>Current plan</span>
              <div style={{ fontWeight: 700, fontSize: 18 }}>{PLAN_FEATURES[currentTier]?.name}</div>
              {subscription?.currentPeriodEnd && (
                <div style={{ color: "#777", fontSize: 12, marginTop: 4 }}>
                  {subscription.cancelAtPeriodEnd
                    ? `Cancels on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`
                    : `Renews on ${new Date(subscription.currentPeriodEnd).toLocaleDateString()}`}
                </div>
              )}
            </div>
            <button
              onClick={handleCancel}
              disabled={loading}
              style={{
                background: "#222",
                color: "#e74c3c",
                border: "1px solid #c0392b",
                borderRadius: 8,
                padding: "0.5rem 1rem",
                cursor: "pointer",
                fontSize: 14,
              }}
            >
              Cancel Subscription
            </button>
          </div>
        )}

        {error && (
          <div style={{ background: "#3d1515", border: "1px solid #c0392b", borderRadius: 8, padding: "0.75rem 1rem", marginBottom: 24, color: "#e74c3c", fontSize: 14 }}>
            {error}
          </div>
        )}

        {/* Plan cards */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 24 }}>
          {["free", "plus", "gold"].map((tier) => {
            const plan = PLAN_FEATURES[tier];
            const isCurrent = currentTier === tier;
            const isUpgrade = tier !== "free" && !isCurrent;

            return (
              <div
                key={tier}
                style={{
                  background: isCurrent ? "#1a1a2e" : "#111",
                  border: isCurrent ? `2px solid ${plan.color}` : tier === "plus" ? "2px solid #9b59b6" : "1px solid #222",
                  borderRadius: 16,
                  padding: "1.75rem",
                  position: "relative",
                  transition: "transform 0.2s",
                }}
              >
                {plan.badge && (
                  <div style={{
                    position: "absolute",
                    top: -12,
                    left: "50%",
                    transform: "translateX(-50%)",
                    background: plan.gradient,
                    color: "#fff",
                    fontSize: 11,
                    fontWeight: 700,
                    padding: "3px 12px",
                    borderRadius: 20,
                    letterSpacing: 1,
                  }}>
                    {plan.badge}
                  </div>
                )}

                <div style={{ marginBottom: 16 }}>
                  <h2 style={{ margin: 0, fontSize: "1.25rem", color: plan.color }}>{plan.name}</h2>
                  <div style={{ marginTop: 8 }}>
                    <span style={{ fontSize: "2rem", fontWeight: 800 }}>{plan.price}</span>
                    <span style={{ color: "#777", fontSize: 14 }}>{plan.period}</span>
                  </div>
                </div>

                <ul style={{ listStyle: "none", padding: 0, margin: "0 0 24px 0" }}>
                  {plan.features.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14 }}>
                      <span style={{ color: plan.color, fontSize: 16 }}>✓</span>
                      {f}
                    </li>
                  ))}
                  {plan.missing?.map((f) => (
                    <li key={f} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, fontSize: 14, color: "#555" }}>
                      <span style={{ fontSize: 16 }}>✗</span>
                      {f}
                    </li>
                  ))}
                </ul>

                {isCurrent ? (
                  <div style={{ textAlign: "center", color: plan.color, fontWeight: 600, padding: "0.75rem", background: "#ffffff10", borderRadius: 8 }}>
                    ✓ Current Plan
                  </div>
                ) : tier === "free" ? (
                  <div style={{ textAlign: "center", color: "#555", fontSize: 13 }}>Basic access</div>
                ) : (
                  <button
                    onClick={() => handleUpgrade(tier)}
                    disabled={loading}
                    style={{
                      width: "100%",
                      background: plan.gradient,
                      color: "#fff",
                      border: "none",
                      borderRadius: 10,
                      padding: "0.9rem",
                      fontSize: 15,
                      fontWeight: 700,
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.7 : 1,
                      transition: "opacity 0.2s",
                    }}
                  >
                    {loading ? "Redirecting..." : `Get ${plan.name}`}
                  </button>
                )}
              </div>
            );
          })}
        </div>

        {/* Trust signals */}
        <div style={{ display: "flex", justifyContent: "center", gap: 32, marginTop: 48, flexWrap: "wrap" }}>
          {["🔒 Secure Payments via PayPal", "↩ Cancel Anytime", "💳 No Hidden Fees"].map((item) => (
            <div key={item} style={{ color: "#666", fontSize: 13 }}>{item}</div>
          ))}
        </div>
      </div>
    </div>
  );
}
