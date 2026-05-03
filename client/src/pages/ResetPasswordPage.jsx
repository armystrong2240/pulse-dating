import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export const ResetPasswordPage = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const navigate = useNavigate();

  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  if (!token) {
    return (
      <section className="page auth-page">
        <h2>Invalid link</h2>
        <p className="muted">This reset link is invalid or has expired.</p>
        <p className="muted" style={{ marginTop: "1rem" }}>
          <Link to="/forgot-password" className="link">Request a new link</Link>
        </p>
      </section>
    );
  }

  const onSubmit = async (e) => {
    e.preventDefault();
    if (password !== confirm) {
      setError("Passwords don't match");
      return;
    }
    if (password.length < 8) {
      setError("Password must be at least 8 characters");
      return;
    }
    setLoading(true);
    setError("");
    try {
      await api.post("/auth/reset-password", { token, password });
      navigate("/login", { state: { message: "Password reset! Please sign in." } });
    } catch (err) {
      setError(err.response?.data?.error || "Reset failed. The link may have expired.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="page auth-page">
      <h2>Reset your password</h2>
      <p className="muted">Enter a new password for your account.</p>

      <form className="stack-form auth-form" onSubmit={onSubmit}>
        <input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="New password (min 8 chars)"
          required
          autoComplete="new-password"
        />
        <input
          type="password"
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
          placeholder="Confirm new password"
          required
          autoComplete="new-password"
        />
        <button className="btn-primary" type="submit" disabled={loading}>
          {loading ? "Saving…" : "Reset password"}
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </section>
  );
};
