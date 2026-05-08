import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api/client";

export default function BillingSuccessPage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const { refreshUser } = useAuth();
  const [status, setStatus] = useState("activating"); // activating | success | error
  const [errorMsg, setErrorMsg] = useState("");

  useEffect(() => {
    const provider = params.get("provider") || "paypal";
    const stripeSessionId = params.get("session_id");
    const subscriptionId = params.get("subscription_id");

    async function activate() {
      if (provider === "stripe") {
        if (!stripeSessionId) {
          setErrorMsg("Missing Stripe session id.");
          setStatus("error");
          return;
        }
        try {
          await api.post("/billing/stripe/confirm", { session_id: stripeSessionId });
          if (refreshUser) await refreshUser();
          setStatus("success");
          setTimeout(() => navigate("/"), 4000);
        } catch (e) {
          const msg = e.response?.data?.error || "Could not activate card subscription. Please contact support.";
          setErrorMsg(msg);
          setStatus("error");
        }
        return;
      }

      if (!subscriptionId) {
        // Fallback: just refresh and redirect (e.g. webhook already handled it)
        if (refreshUser) await refreshUser();
        setStatus("success");
        setTimeout(() => navigate("/"), 4000);
        return;
      }
      try {
        await api.post("/billing/capture", { subscription_id: subscriptionId });
        if (refreshUser) await refreshUser();
        setStatus("success");
        setTimeout(() => navigate("/"), 4000);
      } catch (e) {
        const msg = e.response?.data?.error || "Could not activate subscription. Please contact support.";
        setErrorMsg(msg);
        setStatus("error");
      }
    }

    activate();
  }, [navigate, params, refreshUser]);

  return (
    <div style={{
      minHeight: "100vh",
      background: "#0d0d0d",
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 24,
      padding: "2rem",
      textAlign: "center",
    }}>
      {status === "activating" && (
        <>
          <div style={{ fontSize: 48 }}>⏳</div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>Activating your subscription…</h1>
          <p style={{ color: "#aaa", maxWidth: 400 }}>Just a moment while we confirm your payment.</p>
        </>
      )}
      {status === "success" && (
        <>
          <div style={{ fontSize: 72 }}>🎉</div>
          <h1 style={{ fontSize: "2rem", fontWeight: 800, margin: 0 }}>Welcome to Premium!</h1>
          <p style={{ color: "#aaa", maxWidth: 400 }}>
            Your subscription is now active. Enjoy unlimited likes, see who liked you, and all your premium features!
          </p>
          <div style={{ color: "#666", fontSize: 13 }}>Redirecting you home in 4 seconds…</div>
          <button
            onClick={() => navigate("/")}
            style={{
              background: "linear-gradient(135deg, #e74c3c 0%, #c0392b 100%)",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "0.9rem 2rem",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Start Swiping →
          </button>
        </>
      )}
      {status === "error" && (
        <>
          <div style={{ fontSize: 48 }}>⚠️</div>
          <h1 style={{ fontSize: "1.8rem", fontWeight: 800, margin: 0 }}>Something went wrong</h1>
          <p style={{ color: "#e74c3c", maxWidth: 400 }}>{errorMsg}</p>
          <p style={{ color: "#aaa", fontSize: 13 }}>
            If you were charged, contact support at support@pulsedate.net and we'll sort it out.
          </p>
          <button
            onClick={() => navigate("/upgrade")}
            style={{
              background: "#333",
              color: "#fff",
              border: "none",
              borderRadius: 10,
              padding: "0.9rem 2rem",
              fontSize: 15,
              fontWeight: 700,
              cursor: "pointer",
            }}
          >
            Back to Plans
          </button>
        </>
      )}
    </div>
  );
}
