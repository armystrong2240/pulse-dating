import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export const LoginPage = () => {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");

  const onChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      setError("");
      await login(form.email, form.password);
      navigate("/");
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

      {error && <p className="error">{error}</p>}

      <p className="muted" style={{ marginTop: "1rem" }}>
        New here?{" "}
        <Link to="/register" className="link">
          Create a profile
        </Link>
      </p>
    </section>
  );
};
