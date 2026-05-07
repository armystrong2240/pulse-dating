import { useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
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
