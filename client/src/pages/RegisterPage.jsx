import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
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

const INTEREST_TAGS = [
  "Travel","Fitness","Music","Photography","Cooking","Gaming","Art","Reading",
  "Hiking","Movies","Dancing","Yoga","Tech","Fashion","Sports","Foodie",
  "Coffee","Wine","Pets","Outdoors","Concerts","Volunteering","Meditation",
];

const LOOKING_FOR_OPTIONS = [
  "Long-term relationship","Casual dating","Friendship","Something serious",
  "Open to anything","Networking",
];

const ORIENTATION_OPTIONS = [
  "Straight","Gay","Lesbian","Bisexual","Pansexual","Asexual","Queer","Questioning",
  "Prefer not to say",
];

const POLY_PREFERENCE_OPTIONS = [
  "Prefer monogamy","Open to monogamy","Open to polyamory","Polyamorous","Not sure yet","Prefer not to say",
];

const initialForm = {
  email: "", password: "", name: "", age: "", city: "",
  bio: "", interests: [], lookingFor: "Long-term relationship", avatar: "",
  sexualOrientation: "", polyPreference: "",
};

const STEPS = ["Account","About You","Interests & Vibe"];

export const RegisterPage = () => {
  const { register, loginWithFacebook } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [fbLoading, setFbLoading] = useState(false);

  const onChange = (e) =>
    setForm((prev) => ({ ...prev, [e.target.name]: e.target.value }));

  const toggleInterest = (tag) =>
    setForm((prev) => ({
      ...prev,
      interests: prev.interests.includes(tag)
        ? prev.interests.filter((i) => i !== tag)
        : [...prev.interests, tag],
    }));

  const nextStep = (e) => {
    e.preventDefault();
    setError("");
    if (step === 0 && form.password.length < 8) {
      return setError("Password must be at least 8 characters");
    }
    if (step === 1 && Number(form.age) < 18) {
      return setError("You must be 18 or older");
    }
    setStep((s) => s + 1);
  };

  const onSubmit = async (e) => {
    e.preventDefault();
    try {
      setError("");
      setLoading(true);
      await register({ ...form, age: Number(form.age) });
      navigate("/");
    } catch (err) {
      setError(err.response?.data?.error || "Registration failed");
    } finally {
      setLoading(false);
    }
  };

  const onFacebookRegister = async () => {
    setFbLoading(true);
    setError("");
    try {
      const FB = await ensureFacebookReady();
      FB.login(async (response) => {
        if (response.authResponse?.accessToken) {
          try {
            const signedInUser = await loginWithFacebook(response.authResponse.accessToken);
            navigate(signedInUser?.onboardingCompleted ? "/" : "/onboarding");
          } catch (err) {
            setError(err.response?.data?.error || "Facebook sign-up failed");
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

  const progress = Math.round(((step + 1) / STEPS.length) * 100);

  return (
    <section className="page auth-page">
      <div className="wizard-header">
        <h2>Create your profile</h2>
        <p className="muted">Step {step + 1} of {STEPS.length} — {STEPS[step]}</p>
        <div className="progress-track">
          <div className="progress-fill" style={{ width: `${progress}%` }} />
        </div>
      </div>

      {step === 0 && (
        <form className="stack-form auth-form" onSubmit={nextStep}>
          <input name="email" type="email" value={form.email} onChange={onChange}
            placeholder="Email address" required autoComplete="email" />
          <input name="password" type="password" value={form.password} onChange={onChange}
            placeholder="Password (min 8 chars)" required autoComplete="new-password" minLength={8} />
          {error && <p className="error">{error}</p>}
          <button className="btn-primary" type="submit">Continue →</button>

          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", margin: "0.25rem 0" }}>
            <div style={{ flex: 1, height: 1, background: "#333" }} />
            <span className="muted" style={{ fontSize: "0.8rem" }}>or sign up with</span>
            <div style={{ flex: 1, height: 1, background: "#333" }} />
          </div>
          <button
            type="button"
            onClick={onFacebookRegister}
            disabled={fbLoading}
            style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: "0.6rem", width: "100%", padding: "0.65rem 1rem", background: "#1877f2", color: "#fff", border: "none", borderRadius: 8, fontSize: "0.95rem", fontWeight: 600, cursor: "pointer", opacity: fbLoading ? 0.7 : 1 }}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="white">
              <path d="M24 12.073C24 5.405 18.627 0 12 0S0 5.405 0 12.073C0 18.1 4.388 23.094 10.125 24v-8.437H7.078v-3.49h3.047V9.41c0-3.025 1.792-4.697 4.533-4.697 1.312 0 2.686.236 2.686.236v2.97h-1.513c-1.491 0-1.956.93-1.956 1.874v2.25h3.328l-.532 3.49h-2.796V24C19.612 23.094 24 18.1 24 12.073z"/>
            </svg>
            {fbLoading ? "Connecting..." : "Continue with Facebook"}
          </button>

          <p className="muted" style={{textAlign:"center"}}>
            Already have an account? <Link to="/login" className="link">Sign in</Link>
          </p>
        </form>
      )}

      {step === 1 && (
        <form className="stack-form auth-form" onSubmit={nextStep}>
          <input name="name" value={form.name} onChange={onChange}
            placeholder="Display name" required />
          <div style={{display:"grid",gridTemplateColumns:"1fr 1fr",gap:"0.75rem"}}>
            <input name="age" type="number" value={form.age} onChange={onChange}
              placeholder="Age" required min={18} max={120} />
            <input name="city" value={form.city} onChange={onChange}
              placeholder="City" required />
          </div>
          <input name="avatar" value={form.avatar} onChange={onChange}
            placeholder="Avatar image URL (optional)" />
          <textarea name="bio" value={form.bio} onChange={onChange}
            placeholder="Write a bio — what makes you, you?" required rows={4} />
          {error && <p className="error">{error}</p>}
          <div style={{display:"flex",gap:"0.75rem"}}>
            <button type="button" className="btn-secondary" onClick={() => setStep(0)}>← Back</button>
            <button className="btn-primary" type="submit" style={{flex:1}}>Continue →</button>
          </div>
        </form>
      )}

      {step === 2 && (
        <form className="stack-form auth-form" onSubmit={onSubmit}>
          <div>
            <label className="field-label">What are you looking for?</label>
            <div className="chip-select">
              {LOOKING_FOR_OPTIONS.map((opt) => (
                <button key={opt} type="button"
                  className={`chip chip-toggle${form.lookingFor === opt ? " active" : ""}`}
                  onClick={() => setForm((p) => ({ ...p, lookingFor: opt }))}>
                  {opt}
                </button>
              ))}
            </div>
            <label className="field-label" style={{ marginTop: "0.75rem", fontSize: "0.85rem", opacity: 0.8 }}>Relationship style</label>
            <div className="chip-select">
              {POLY_PREFERENCE_OPTIONS.map((opt) => (
                <button key={opt} type="button"
                  className={`chip chip-toggle${form.polyPreference === opt ? " active" : ""}`}
                  onClick={() => setForm((p) => ({ ...p, polyPreference: opt }))}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">Sexual orientation</label>
            <div className="chip-select">
              {ORIENTATION_OPTIONS.map((opt) => (
                <button key={opt} type="button"
                  className={`chip chip-toggle${form.sexualOrientation === opt ? " active" : ""}`}
                  onClick={() => setForm((p) => ({ ...p, sexualOrientation: opt }))}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="field-label">
              Your interests <span className="muted">({form.interests.length} selected)</span>
            </label>
            <div className="chip-select">
              {INTEREST_TAGS.map((tag) => (
                <button key={tag} type="button"
                  className={`chip chip-toggle${form.interests.includes(tag) ? " active" : ""}`}
                  onClick={() => toggleInterest(tag)}>
                  {tag}
                </button>
              ))}
            </div>
          </div>
          {error && <p className="error">{error}</p>}
          <div style={{display:"flex",gap:"0.75rem"}}>
            <button type="button" className="btn-secondary" onClick={() => setStep(1)}>← Back</button>
            <button className="btn-primary" type="submit" style={{flex:1}} disabled={loading}>
              {loading ? "Creating…" : "🎉 Create Account"}
            </button>
          </div>
        </form>
      )}
    </section>
  );
};
