import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const LoginPage = () => {
  const { login, loginWithFacebook } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [fbLoading, setFbLoading] = useState(false);
  const successMessage = location.state?.message;

  const onChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      setError("");
      const signedInUser = await login(form.email, form.password);
      navigate(signedInUser?.isAdmin ? "/admin" : "/");
    } catch (err) {
      setError(err.response?.data?.error || "Login failed");
    }
  };

  const onFacebookLogin = () => {
    if (!window.FB) return setError("Facebook SDK not loaded. Please refresh.");
    setFbLoading(true);
    setError("");
    window.FB.login(async (response) => {
      if (response.authResponse?.accessToken) {
        try {
          const signedInUser = await loginWithFacebook(response.authResponse.accessToken);
          navigate(signedInUser?.isAdmin ? "/admin" : signedInUser?.onboardingCompleted ? "/" : "/onboarding");
        } catch (err) {
          setError(err.response?.data?.error || "Facebook login failed");
        }
      } else {
        setError("Facebook login was cancelled or denied.");
      }
      setFbLoading(false);
    }, { scope: "email,public_profile" });
  };

  return (
    <section className="page auth-page">
      <h2>Welcome back</h2>
      <p className="muted">Sign in to continue to PulseDate</p>

      <form className="stack-form auth-form" onSubmit={onSubmit}>
        <input
          name="email"
          type="email"
          value={form.email}
          onChange={onChange}
          placeholder="Email"
          required
          autoComplete="email"
        />
        <input
          name="password"
          type="password"
          value={form.password}
          onChange={onChange}
          placeholder="Password"
          required
          autoComplete="current-password"
        />
        <button className="btn-primary" type="submit">
          Sign In
        </button>
      </form>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
        <div style={{ flex: 1, height: 1, background: "#333" }} />
        <span className="muted" style={{ fontSize: "0.8rem" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "#333" }} />
      </div>

      <button
        onClick={onFacebookLogin}
        disabled={fbLoading}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", width: "100%", padding: "0.65rem 1rem", background: "#1877f2", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.95rem", fontWeight: 600, cursor: "pointer", opacity: fbLoading ? 0.7 : 1 }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
        {fbLoading ? "Connecting..." : "Continue with Facebook"}
      </button>

      {successMessage && <p style={{ color: "#4caf50", marginTop: "0.5rem" }}>{successMessage}</p>}
      {error && <p className="error">{error}</p>}

      <p className="muted" style={{ marginTop: "1rem" }}>
        <Link to="/forgot-password" className="link">Forgot password?</Link>
      </p>
      <p className="muted" style={{ marginTop: "0.5rem" }}>
        New here?{" "}
        <Link to="/register" className="link">
          Create a profile
        </Link>
      </p>
    </section>
  );
};
