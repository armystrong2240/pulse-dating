import { useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

const FB_SDK_SRC = "https://connect.facebook.net/en_US/sdk.js";

const loadFacebookSdk = () => new Promise((resolve, reject) => {
  if (window.FB) return resolve(window.FB);
  const existing = document.querySelector(`script[src="${FB_SDK_SRC}"]`);
  if (existing) {
    existing.addEventListener("load", () => resolve(window.FB), { once: true });
    existing.addEventListener("error", () => reject(new Error("Failed to load Facebook SDK")), { once: true });
    return;
  }
  const script = document.createElement("script");
  script.src = FB_SDK_SRC;
  script.async = true;
  script.defer = true;
  script.crossOrigin = "anonymous";
  script.onload = () => resolve(window.FB);
  script.onerror = () => reject(new Error("Failed to load Facebook SDK"));
  document.body.appendChild(script);
});

const ensureFacebookReady = async () => {
  const appId = import.meta.env.VITE_FACEBOOK_APP_ID;
  if (!appId) throw new Error("Facebook login is not configured.");
  const FB = await loadFacebookSdk();
  FB.init({
    appId,
    cookie: true,
    xfbml: false,
    version: "v19.0",
  });
  return FB;
};

export const LoginPage = () => {
  const {
    login,
    loginWithFacebook,
    loginWithMagicLink,
    loginWithPhoneOtp,
    requestMagicLink,
    requestPhoneOtp,
  } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [form, setForm] = useState({ email: "", password: "" });
  const [error, setError] = useState("");
  const [fbLoading, setFbLoading] = useState(false);
  const [magicLoading, setMagicLoading] = useState(false);
  const [magicVerifying, setMagicVerifying] = useState(false);
  const [magicMessage, setMagicMessage] = useState("");
  const [phoneForm, setPhoneForm] = useState({ phone: "", code: "" });
  const [phoneCodeSent, setPhoneCodeSent] = useState(false);
  const [phoneLoading, setPhoneLoading] = useState(false);
  const [phoneMessage, setPhoneMessage] = useState("");
  const [cooldownPhone, setCooldownPhone] = useState(0);
  const [cooldownMagic, setCooldownMagic] = useState(0);
  const successMessage = location.state?.message;

  useEffect(() => {
    if (cooldownPhone <= 0) return;
    const t = setTimeout(() => setCooldownPhone((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownPhone]);

  useEffect(() => {
    if (cooldownMagic <= 0) return;
    const t = setTimeout(() => setCooldownMagic((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [cooldownMagic]);

  useEffect(() => {
    const token = new URLSearchParams(location.search).get("magic");
    if (!token) return;

    setMagicVerifying(true);
    setError("");
    loginWithMagicLink(token)
      .then((signedInUser) => {
        navigate(
          signedInUser?.isAdmin
            ? "/admin"
            : signedInUser?.onboardingCompleted
              ? "/"
              : "/onboarding",
          { replace: true },
        );
      })
      .catch((err) => {
        setError(err.response?.data?.error || "Sign-in link is invalid or expired");
        const next = new URLSearchParams(location.search);
        next.delete("magic");
        navigate({ pathname: "/login", search: next.toString() }, { replace: true });
      })
      .finally(() => setMagicVerifying(false));
  }, [location.search, navigate]); // eslint-disable-line react-hooks/exhaustive-deps

  const onChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const onPhoneChange = (e) =>
    setPhoneForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

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

  const onFacebookLogin = async () => {
    setFbLoading(true);
    setError("");
    try {
      const FB = await ensureFacebookReady();
      FB.login(async (response) => {
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
    } catch (err) {
      setError(err?.message || "Facebook login is unavailable right now.");
      setFbLoading(false);
    }
  };

  const onSendMagicLink = async () => {
    if (!form.email.trim()) {
      setError("Enter your email first to receive a sign-in link.");
      return;
    }
    try {
      setMagicLoading(true);
      setError("");
      await requestMagicLink(form.email.trim());
      setMagicMessage("If that email is registered, a secure sign-in link has been sent.");
      setCooldownMagic(60);
    } catch (err) {
      setError(err.response?.data?.error || "Could not send sign-in link");
    } finally {
      setMagicLoading(false);
    }
  };

  const onSendPhoneCode = async () => {
    if (!phoneForm.phone.trim()) {
      setError("Enter your phone number in E.164 format (+1234567890).");
      return;
    }
    try {
      setPhoneLoading(true);
      setError("");
      setPhoneMessage("");
      await requestPhoneOtp(phoneForm.phone.trim());
      setPhoneCodeSent(true);
      setPhoneMessage("If this phone is registered, a login code has been sent.");
      setCooldownPhone(60);
    } catch (err) {
      setError(err.response?.data?.error || "Could not send phone login code");
    } finally {
      setPhoneLoading(false);
    }
  };

  const onVerifyPhoneCode = async () => {
    if (!phoneForm.phone.trim() || !phoneForm.code.trim()) {
      setError("Enter your phone and 6-digit code.");
      return;
    }
    try {
      setPhoneLoading(true);
      setError("");
      const signedInUser = await loginWithPhoneOtp(phoneForm.phone.trim(), phoneForm.code.trim());
      navigate(
        signedInUser?.isAdmin
          ? "/admin"
          : signedInUser?.onboardingCompleted
            ? "/"
            : "/onboarding",
      );
    } catch (err) {
      setError(err.response?.data?.error || "Invalid or expired phone code");
    } finally {
      setPhoneLoading(false);
    }
  };


  // Hero image aligned to brand audience and tone
  const heroImageUrl = "https://source.unsplash.com/1200x675/?african-american,couple,romance";

  return (
    <section className="page auth-page">
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: "1.5rem" }}>
        <img
          src={heroImageUrl}
          alt="African American couple smiling together"
          style={{
            width: "100%",
            maxWidth: 340,
            borderRadius: 16,
            boxShadow: "0 4px 32px rgba(0,0,0,0.25)",
            marginBottom: 18,
            objectFit: "cover",
            aspectRatio: "16/9",
            background: "#111"
          }}
        />
      </div>
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
        <button
          className="btn-secondary"
          type="button"
          onClick={onSendMagicLink}
          disabled={magicLoading || magicVerifying || phoneLoading || cooldownMagic > 0}
        >
          {magicLoading ? "Sending link..." : cooldownMagic > 0 ? `Resend in ${cooldownMagic}s` : "Email me a sign-in link"}
        </button>
      </form>

      <div className="stack-form auth-form" style={{ marginTop: "0.8rem" }}>
        <input
          name="phone"
          type="tel"
          value={phoneForm.phone}
          onChange={onPhoneChange}
          placeholder="Phone in E.164 format (+1234567890)"
          autoComplete="tel"
        />
        {phoneCodeSent && (
          <input
            name="code"
            type="text"
            value={phoneForm.code}
            onChange={onPhoneChange}
            placeholder="6-digit code"
            maxLength={6}
            inputMode="numeric"
            autoComplete="one-time-code"
          />
        )}
        <div style={{ display: "grid", gridTemplateColumns: phoneCodeSent ? "1fr 1fr" : "1fr", gap: "0.6rem" }}>
          <button
            className="btn-secondary"
            type="button"
            onClick={onSendPhoneCode}
            disabled={phoneLoading || magicVerifying || fbLoading || cooldownPhone > 0}
          >
            {phoneLoading
              ? "Sending..."
              : cooldownPhone > 0
                ? `Resend in ${cooldownPhone}s`
                : phoneCodeSent
                  ? "Resend code"
                  : "Text me a login code"}
          </button>
          {phoneCodeSent && (
            <button
              className="btn-primary"
              type="button"
              onClick={onVerifyPhoneCode}
              disabled={phoneLoading || magicVerifying || fbLoading}
            >
              {phoneLoading ? "Verifying..." : "Sign in with code"}
            </button>
          )}
        </div>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "1rem 0" }}>
        <div style={{ flex: 1, height: 1, background: "#333" }} />
        <span className="muted" style={{ fontSize: "0.8rem" }}>or</span>
        <div style={{ flex: 1, height: 1, background: "#333" }} />
      </div>

      <button
        onClick={onFacebookLogin}
        disabled={fbLoading || magicVerifying || phoneLoading}
        style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", width: "100%", padding: "0.65rem 1rem", background: "#1877f2", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.95rem", fontWeight: 600, cursor: "pointer", opacity: fbLoading ? 0.7 : 1 }}
      >
        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
          <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
        </svg>
        {fbLoading ? "Connecting..." : "Continue with Facebook"}
      </button>

      {magicVerifying && <p className="muted">Verifying your sign-in link...</p>}
      {magicMessage && <p style={{ color: "#4caf50", marginTop: "0.5rem" }}>{magicMessage}</p>}
      {phoneMessage && <p style={{ color: "#4caf50", marginTop: "0.5rem" }}>{phoneMessage}</p>}
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
