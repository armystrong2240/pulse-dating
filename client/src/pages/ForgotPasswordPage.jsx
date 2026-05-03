import { useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../api/client";

export const ForgotPasswordPage = () => {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const onSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/forgot-password", { email });
      setSubmitted(true);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  if (submitted) {
    return (
      <section className="page auth-page">
        <h2>Check your inbox</h2>
        <p className="muted">
          If an account exists for <strong>{email}</strong>, we sent a password reset link.
          Check your spam folder if you don't see it.
        </p>
        <p className="muted" style={{ marginTop: "1rem" }}>
          <Link to="/login" className="link">Back to sign in</Link>
        </p>
      </section>
    );
  }

  return (
    <section className="page auth-page">
      <h2>Forgot your password?</h2>
      <p className="muted">Enter your email and we'll send you a reset link.</p>

      <form className="stack-form auth-form" onSubmit={onSubmit}>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Email"
          required
          autoComplete="email"
        />
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Sending…" : "Send reset link"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to="/login" className="link">Back to sign in</Link>
      </p>
    </section>
  );
};
