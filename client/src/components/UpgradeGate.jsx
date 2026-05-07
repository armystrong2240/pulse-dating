import { useNavigate } from "react-router-dom";

const TIER_COLORS = {
  plus: { color: "#9b59b6", gradient: "linear-gradient(135deg, #9b59b6 0%, #6c3483 100%)" },
  gold: { color: "#f39c12", gradient: "linear-gradient(135deg, #f39c12 0%, #d68910 100%)" },
};

/**
 * UpgradeGate — renders children if user has required tier, otherwise shows upgrade prompt.
 * Props:
 *   requiredTier: "plus" | "gold"
 *   currentTier: user.premiumTier
 *   feature: string — feature name to display
 *   children: JSX — content to show if unlocked
 *   inline: bool — if true, show a compact banner instead of full overlay
 */
export default function UpgradeGate({ requiredTier = "plus", currentTier = "free", feature = "this feature", children, inline = false }) {
  const navigate = useNavigate();
  const tierOrder = { free: 0, plus: 1, gold: 2 };
  const hasAccess = tierOrder[currentTier] >= tierOrder[requiredTier];

  if (hasAccess) return children;

  const colors = TIER_COLORS[requiredTier];

  if (inline) {
    return (
      <div style={{
        background: "#1a1a2e",
        border: `1px solid ${colors.color}`,
        borderRadius: 10,
        padding: "0.75rem 1rem",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        gap: 12,
        flexWrap: "wrap",
      }}>
        <div style={{ fontSize: 13, color: "#aaa" }}>
          <span style={{ color: colors.color, fontWeight: 700 }}>
            {requiredTier === "gold" ? "💎 Gold" : "⭐ Plus"}
          </span>{" "}
          required to use {feature}
        </div>
        <button
          onClick={() => navigate("/upgrade")}
          style={{
            background: colors.gradient,
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "0.4rem 0.8rem",
            fontSize: 12,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Upgrade
        </button>
      </div>
    );
  }

  return (
    <div style={{
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      justifyContent: "center",
      padding: "3rem 1.5rem",
      textAlign: "center",
      gap: 16,
    }}>
      <div style={{ fontSize: 48 }}>{requiredTier === "gold" ? "💎" : "⭐"}</div>
      <h3 style={{ margin: 0, color: "#fff", fontSize: "1.25rem" }}>
        Unlock {feature}
      </h3>
      <p style={{ color: "#aaa", margin: 0, maxWidth: 320, fontSize: 14 }}>
        This feature is available with{" "}
        <span style={{ color: colors.color, fontWeight: 700 }}>
          PulsDate {requiredTier === "gold" ? "Gold" : "Plus"}
        </span>.
        Upgrade to access it instantly.
      </p>
      <button
        onClick={() => navigate("/upgrade")}
        style={{
          background: colors.gradient,
          color: "#fff",
          border: "none",
          borderRadius: 10,
          padding: "0.85rem 2rem",
          fontSize: 15,
          fontWeight: 700,
          cursor: "pointer",
        }}
      >
        View Plans →
      </button>
    </div>
  );
}
