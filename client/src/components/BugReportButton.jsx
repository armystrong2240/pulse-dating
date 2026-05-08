import { useState } from "react";
import * as Sentry from "@sentry/react";
import api from "../api/client.js";

export default function BugReportButton() {
  const [open, setOpen] = useState(false);
  const [type, setType] = useState("bug");
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState("idle"); // idle | loading | sent | error

  async function submit(e) {
    e.preventDefault();
    if (message.trim().length < 10) return;
    setStatus("loading");
    try {
      await api.post("/support/report", {
        message: message.trim(),
        type,
        page: window.location.pathname,
      });
      // Also capture to Sentry if DSN configured (attaches user context)
      if (import.meta.env.VITE_SENTRY_DSN) {
        Sentry.captureMessage(`[User Report] ${type}: ${message.trim()}`, {
          level: type === "bug" ? "error" : "info",
          extra: { page: window.location.pathname },
        });
      }
      setStatus("sent");
      setMessage("");
      setTimeout(() => { setOpen(false); setStatus("idle"); }, 2500);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      {/* Floating trigger button */}
      <button
        onClick={() => setOpen(true)}
        aria-label="Report a problem"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          width: 48,
          height: 48,
          borderRadius: "50%",
          background: "rgba(30,30,40,0.9)",
          border: "1px solid rgba(255,255,255,0.15)",
          color: "#fff",
          fontSize: "1.3rem",
          cursor: "pointer",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: "0 4px 20px rgba(0,0,0,0.4)",
          zIndex: 9000,
          backdropFilter: "blur(8px)",
          transition: "transform 0.15s",
        }}
        onMouseEnter={(e) => (e.currentTarget.style.transform = "scale(1.1)")}
        onMouseLeave={(e) => (e.currentTarget.style.transform = "scale(1)")}
      >
        🐛
      </button>

      {/* Modal */}
      {open && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Report a problem"
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 9001,
            display: "flex",
            alignItems: "flex-end",
            justifyContent: "center",
            background: "rgba(0,0,0,0.5)",
            padding: "0 0 24px",
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setOpen(false); }}
        >
          <div
            style={{
              background: "#1a1a2e",
              border: "1px solid rgba(255,255,255,0.1)",
              borderRadius: 20,
              padding: "1.5rem",
              width: "100%",
              maxWidth: 480,
              margin: "0 1rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "1rem" }}>
              <h3 style={{ margin: 0, color: "#fff", fontSize: "1.1rem", fontWeight: 700 }}>
                Report a Problem
              </h3>
              <button onClick={() => setOpen(false)} style={{ background: "none", border: "none", color: "#aaa", fontSize: "1.4rem", cursor: "pointer" }}>×</button>
            </div>

            {status === "sent" ? (
              <p style={{ color: "#4ade80", textAlign: "center", fontWeight: 600, padding: "1rem 0" }}>
                ✓ Thanks! We'll look into it.
              </p>
            ) : (
              <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: ".75rem" }}>
                <div style={{ display: "flex", gap: ".5rem" }}>
                  {["bug", "feedback", "other"].map((t) => (
                    <button
                      key={t}
                      type="button"
                      onClick={() => setType(t)}
                      style={{
                        flex: 1,
                        padding: ".4rem",
                        borderRadius: 8,
                        border: type === t ? "2px solid #e91e8c" : "2px solid rgba(255,255,255,0.15)",
                        background: type === t ? "rgba(233,30,140,0.15)" : "transparent",
                        color: type === t ? "#e91e8c" : "#aaa",
                        cursor: "pointer",
                        fontWeight: 600,
                        fontSize: ".85rem",
                        textTransform: "capitalize",
                      }}
                    >
                      {t === "bug" ? "🐛 Bug" : t === "feedback" ? "💡 Feedback" : "❓ Other"}
                    </button>
                  ))}
                </div>
                <textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={4}
                  minLength={10}
                  maxLength={5000}
                  placeholder={type === "bug" ? "Describe what happened and what you expected..." : "Tell us what's on your mind..."}
                  required
                  style={{
                    background: "rgba(255,255,255,0.05)",
                    border: "1px solid rgba(255,255,255,0.15)",
                    borderRadius: 10,
                    color: "#fff",
                    padding: ".75rem",
                    fontSize: "1rem",
                    resize: "vertical",
                    outline: "none",
                  }}
                />
                <p style={{ margin: 0, fontSize: ".75rem", color: "#666" }}>
                  Page: {window.location.pathname}
                </p>
                {status === "error" && (
                  <p style={{ color: "#f87171", margin: 0, fontSize: ".85rem" }}>Failed to send. Please try again.</p>
                )}
                <button
                  type="submit"
                  disabled={status === "loading" || message.trim().length < 10}
                  style={{
                    background: "linear-gradient(135deg,#e91e8c,#9b59b6)",
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    padding: ".75rem",
                    fontWeight: 700,
                    fontSize: "1rem",
                    cursor: "pointer",
                    opacity: status === "loading" || message.trim().length < 10 ? 0.6 : 1,
                  }}
                >
                  {status === "loading" ? "Sending…" : "Send Report"}
                </button>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
