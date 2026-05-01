import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

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
  const { register } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState(initialForm);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

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
