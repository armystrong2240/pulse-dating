import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const STEP_ORDER = ["basics", "photos", "prompts", "vibe", "finish"];

export function OnboardingPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [profile, setProfile] = useState(null);
  const [quality, setQuality] = useState(null);
  const [status, setStatus] = useState(null);
  const [busyStep, setBusyStep] = useState("");
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (user?.isAdmin) {
      navigate("/admin", { replace: true });
    }
  }, [navigate, user?.isAdmin]);

  const load = useCallback(async () => {
    if (!user?.id) return;
    setError("");
    try {
      const [pRes, qRes, sRes] = await Promise.all([
        api.get(`/profiles/${user.id}`),
        api.get("/profile-quality/me"),
        api.get("/onboarding/status"),
      ]);
      setProfile(pRes.data);
      setQuality(qRes.data);
      setStatus(sRes.data);
    } catch {
      setError("Could not load onboarding data.");
    }
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  const checks = useMemo(() => {
    if (!profile) return null;
    return {
      basics: Boolean(
        profile.name && profile.age >= 18 && profile.city && profile.bio?.trim().length >= 20
      ),
      photos: Array.isArray(profile.media) && profile.media.length >= 3,
      prompts:
        Array.isArray(profile.profilePrompts) &&
        profile.profilePrompts.filter((p) => p?.q && p?.a).length >= 3,
      vibe: Boolean(profile.lookingFor && profile.interests?.length >= 5),
      finish: quality?.unlocked ?? false,
    };
  }, [profile, quality]);

  const advanceStep = async (step) => {
    setBusyStep(step);
    try {
      await api.post("/onboarding/complete-step", { step });
      const idx = STEP_ORDER.indexOf(step);
      const next = STEP_ORDER[Math.min(idx + 1, STEP_ORDER.length - 1)];
      await api.post("/onboarding/complete-step", { step: next });
      await load();
    } finally {
      setBusyStep("");
    }
  };

  const finishOnboarding = async () => {
    setFinishing(true);
    try {
      const { data } = await api.post("/onboarding/finish");
      await load();
      if (data.unlocked) {
        navigate("/");
      }
    } finally {
      setFinishing(false);
    }
  };

  const recalcScore = async () => {
    await api.post("/profile-quality/recalculate");
    await load();
  };

  const STEP_INFO = [
    {
      key: "basics",
      title: "Complete basics",
      detail: "Add name, age, city, and a meaningful bio.",
      cta: "Edit basics",
      link: `/profiles/${user?.id}?mode=edit&tab=basics&from=onboarding`,
    },
    {
      key: "photos",
      title: "Add photos",
      detail: "Upload at least 3 photos so your profile feels real.",
      cta: "Add photos",
      link: `/profiles/${user?.id}?mode=edit&tab=media&from=onboarding`,
    },
    {
      key: "prompts",
      title: "Answer prompts",
      detail: "Answer at least 3 prompts to spark better conversations.",
      cta: "Edit prompts",
      link: `/profiles/${user?.id}?mode=edit&tab=prompts&from=onboarding`,
    },
    {
      key: "vibe",
      title: "Set your vibe",
      detail: "Choose what you're looking for and add at least 5 interests.",
      cta: "Update vibe",
      link: `/profiles/${user?.id}?mode=edit&tab=vibe&from=onboarding`,
    },
  ];

  return (
    <section className="page onboarding-page">
      <div className="hero onboarding-hero">
        <h2>Finish your onboarding</h2>
        <p>Complete each step to unlock full Discover swiping.</p>
      </div>

      {error && <p className="error">{error}</p>}

      {quality && (
        <article className="panel onboarding-score-panel">
          <div className="onboarding-score-top">
            <h3 style={{ margin: 0 }}>Profile quality score</h3>
            <span className={quality.unlocked ? "badge-green" : "badge-amber"}>
              {quality.score}% / {quality.threshold}%
            </span>
          </div>
          <div className="progress-track" style={{ marginTop: "0.5rem" }}>
            <div
              className="progress-fill"
              style={{
                width: `${quality.score}%`,
                background: quality.unlocked ? "var(--success)" : "var(--accent-2)",
              }}
            />
          </div>
          <div className="onboarding-score-actions">
            <button className="btn-secondary" onClick={recalcScore}>Recalculate score</button>
            <button className="btn-primary" onClick={finishOnboarding} disabled={finishing}>
              {finishing ? "Finishing..." : "Finish onboarding"}
            </button>
          </div>
        </article>
      )}

      <div className="onboarding-step-list">
        {STEP_INFO.map((step) => {
          const done = checks?.[step.key];
          return (
            <article className="panel onboarding-step" key={step.key}>
              <div className="onboarding-step-main">
                <div>
                  <h3 style={{ marginBottom: "0.35rem" }}>{step.title}</h3>
                  <p className="muted" style={{ margin: 0 }}>{step.detail}</p>
                </div>
                <span className={done ? "badge-green" : "badge-amber"}>
                  {done ? "Complete" : "Incomplete"}
                </span>
              </div>
              <div className="onboarding-step-actions">
                <Link className="btn-secondary" to={step.link}>{step.cta}</Link>
                <button
                  className="btn-primary"
                  onClick={() => advanceStep(step.key)}
                  disabled={!done || busyStep === step.key}
                >
                  {busyStep === step.key ? "Saving..." : "Mark complete"}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      {status && (
        <p className="muted onboarding-status-text">
          Current step: <strong>{status.onboardingStep}</strong>
          {" · "}
          Completed: <strong>{status.onboardingCompleted ? "Yes" : "No"}</strong>
        </p>
      )}

      <div className="onboarding-footer-cta">
        <Link className="btn-secondary" to="/">Back to Discover</Link>
      </div>
    </section>
  );
}
