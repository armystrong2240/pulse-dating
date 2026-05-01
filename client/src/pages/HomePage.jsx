import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { api, toAssetUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";

const LOOKING_FOR_OPTIONS = [
  "Any","Long-term relationship","Casual dating","Friendship","Something serious","Open to anything",
];

const SWIPE_THRESHOLD = 80;

const SwipeDeck = ({ profiles, onLike, onPass, onPulse, onUndo, limitReached, superLimitReached, undoAvailable }) => {
  const [dragX, setDragX] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [flyDir, setFlyDir] = useState(null); // 'left' | 'right' | 'up'
  const dragStartX = useRef(0);

  const current = profiles[0];
  const behind = profiles.slice(1, 3);

  const flyOut = (dir, action) => {
    setFlyDir(dir);
    setTimeout(() => {
      setFlyDir(null);
      setDragX(0);
      action(current.id);
    }, 320);
  };

  const handlePointerDown = (e) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setIsDragging(true);
    dragStartX.current = e.clientX;
  };

  const handlePointerMove = (e) => {
    if (!isDragging) return;
    setDragX(e.clientX - dragStartX.current);
  };

  const handlePointerUp = () => {
    if (!isDragging) return;
    setIsDragging(false);
    if (dragX > SWIPE_THRESHOLD && !limitReached) {
      flyOut("right", onLike);
    } else if (dragX < -SWIPE_THRESHOLD) {
      flyOut("left", onPass);
    } else {
      setDragX(0);
    }
  };

  if (!current) return null;

  const rotation = dragX * 0.07;
  const likeOpacity = Math.max(0, Math.min(1, dragX / SWIPE_THRESHOLD));
  const passOpacity = Math.max(0, Math.min(1, -dragX / SWIPE_THRESHOLD));

  const cardStyle = flyDir === "right"
    ? { animation: "flyRight 0.32s ease forwards" }
    : flyDir === "left"
    ? { animation: "flyLeft 0.32s ease forwards" }
    : flyDir === "up"
    ? { animation: "flyUp 0.32s ease forwards" }
    : {
        transform: `translateX(${dragX}px) rotate(${rotation}deg)`,
        transition: isDragging ? "none" : "transform 0.3s ease",
        cursor: isDragging ? "grabbing" : "grab",
      };

  return (
    <div className="swipe-deck">
      {behind.map((p, i) => (
        <div key={p.id} className="swipe-card swipe-card-behind"
          style={{ transform: `scale(${0.96 - i * 0.03}) translateY(${(i + 1) * 10}px)`, zIndex: 10 - i }}>
          <img src={toAssetUrl(p.avatar)} alt={p.name} />
        </div>
      ))}

      <div
        className="swipe-card swipe-card-top"
        style={{ ...cardStyle, zIndex: 20 }}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerCancel={handlePointerUp}
      >
        {/* Overlay indicators */}
        <div className="swipe-overlay swipe-like" style={{ opacity: likeOpacity }}>❤️ LIKE</div>
        <div className="swipe-overlay swipe-pass" style={{ opacity: passOpacity }}>✕ PASS</div>

        <img src={toAssetUrl(current.avatar)} alt={`${current.name} avatar`} draggable={false} />

        <div className="swipe-card-info">
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0 }}>{current.name}, {current.age}</h3>
            {current.compatScore !== undefined && (
              <span className={`compat-badge ${current.compatScore >= 70 ? "compat-high" : current.compatScore >= 40 ? "compat-mid" : "compat-low"}`}>
                {current.compatScore}% match
              </span>
            )}
            {current.distanceMi !== null && current.distanceMi !== undefined && (
              <span className="compat-badge compat-mid" style={{ background: "rgba(100,180,255,0.18)", color: "#80cfff" }}>
                📍 {current.distanceMi} mi
              </span>
            )}
          </div>
          <p className="muted" style={{ fontSize: "0.85rem" }}>{current.city}</p>
          {current.lookingFor && (
            <p style={{ fontSize: "0.8rem", color: "var(--accent-2)" }}>
              Looking for: {current.lookingFor}
            </p>
          )}
          <p style={{ fontSize: "0.88rem", marginTop: "0.3rem" }}>{current.bio}</p>
          <div className="chip-row" style={{ marginTop: "0.4rem" }}>
            {current.interests.slice(0, 5).map((i) => (
              <span className="chip" key={i}>{i}</span>
            ))}
          </div>
        </div>

        <div className="swipe-actions" onPointerDown={(e) => e.stopPropagation()}>
          <button className="swipe-btn swipe-btn-pass" onClick={() => flyOut("left", onPass)} title="Pass">
            ✕
          </button>
          <button
            className={`swipe-btn swipe-btn-undo${!undoAvailable ? " disabled" : ""}`}
            onClick={() => undoAvailable && onUndo()}
            disabled={!undoAvailable}
            title="Undo last swipe"
          >↩</button>
          <Link to={`/profiles/${current.id}`} className="swipe-btn swipe-btn-view" title="View full profile">
            👁
          </Link>
          <button
            className={`swipe-btn swipe-btn-pulse${superLimitReached ? " disabled" : ""}`}
            onClick={() => !superLimitReached && flyOut("up", (id) => onPulse(id))}
            title={superLimitReached ? "Daily Pulse used up" : "⚡ Pulse — super like!"}
            disabled={superLimitReached}
          >
            ⚡
          </button>
          <button className={`swipe-btn swipe-btn-like${limitReached ? " disabled" : ""}`}
            onClick={() => !limitReached && flyOut("right", onLike)}
            disabled={limitReached}
            title="Like">
            ♥
          </button>
        </div>
      </div>
    </div>
  );
};

export const HomePage = () => {
  const { user } = useAuth();
  const [profiles, setProfiles] = useState([]);
  const [search, setSearch] = useState("");
  const [city, setCity] = useState("");
  const [state, setState] = useState("");
  const [zipCode, setZipCode] = useState("");
  const [ageMin, setAgeMin] = useState("");
  const [ageMax, setAgeMax] = useState("");
  const [lookingFor, setLookingFor] = useState("Any");
  const [showFilters, setShowFilters] = useState(false);
  const [toast, setToast] = useState(null);
  const [dailyLikes, setDailyLikes] = useState({ count: 0, limit: 20, superLikeCount: 0, superLikeLimit: 3 });
  const [viewMode, setViewMode] = useState("swipe"); // 'swipe' | 'grid'
  const [userLat, setUserLat] = useState(null);
  const [userLng, setUserLng] = useState(null);
  const [radiusMi, setRadiusMi] = useState(50);
  const [geoStatus, setGeoStatus] = useState(""); // '', 'loading', 'active', 'denied'
  const [lastUndoProfile, setLastUndoProfile] = useState(null);
  const [dailyPick, setDailyPick] = useState(null);
  const [icebreakerModal, setIcebreakerModal] = useState(null); // { name, icebreaker, id }
  const [quality, setQuality] = useState(null);
  const [qualityLoading, setQualityLoading] = useState(true);

  const fetchProfiles = useCallback(async () => {
    const params = { search, city };
    if (state) params.state = state;
    if (zipCode) params.zipCode = zipCode;
    if (ageMin) params.ageMin = ageMin;
    if (ageMax) params.ageMax = ageMax;
    if (lookingFor !== "Any") params.lookingFor = lookingFor;
    if (userLat !== null && userLng !== null) {
      params.lat = userLat;
      params.lng = userLng;
      params.radiusMi = radiusMi;
    }
    const { data } = await api.get("/profiles", { params });
    setProfiles(data);
  }, [search, city, state, zipCode, ageMin, ageMax, lookingFor, userLat, userLng, radiusMi]);

  const fetchDailyLikes = useCallback(async () => {
    const { data } = await api.get("/matches/likes/today");
    setDailyLikes(data);
  }, []);

  const fetchQuality = useCallback(async () => {
    setQualityLoading(true);
    try {
      const { data } = await api.get("/profile-quality/me");
      setQuality(data);
    } catch {
      setQuality(null);
    } finally {
      setQualityLoading(false);
    }
  }, []);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setGeoStatus("denied");
      showToast("Geolocation is not supported by your browser.");
      return;
    }
    setGeoStatus("loading");
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setUserLat(pos.coords.latitude);
        setUserLng(pos.coords.longitude);
        setGeoStatus("active");
        showToast("📍 Location set! Showing people near you.");
      },
      () => {
        setGeoStatus("denied");
        showToast("Location access denied. Enable it in your browser settings.");
      },
      { timeout: 10000, maximumAge: 300000 }
    );
  };

  const clearLocation = () => {
    setUserLat(null);
    setUserLng(null);
    setGeoStatus("");
  };

  useEffect(() => {
    fetchProfiles();
    fetchDailyLikes();
    fetchQuality();
    api.get("/matches/daily-pick").then(({ data }) => setDailyPick(data)).catch(() => {});
  }, [fetchProfiles, fetchDailyLikes, fetchQuality]);

  const onUndo = async () => {
    try {
      const { data } = await api.delete("/matches/undo");
      if (data.profile) {
        setProfiles((prev) => [data.profile, ...prev]);
        setLastUndoProfile(null);
        setDailyLikes((prev) => ({ ...prev, count: Math.max(0, prev.count - 1) }));
        showToast("↩ Undo! Profile brought back.");
      }
    } catch {
      showToast("Nothing to undo.");
    }
  };

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(null), 2800);
  };

  const onLike = async (id) => {
    try {
      const likedProfile = profiles.find((p) => p.id === id);
      const { data } = await api.post(`/matches/like/${id}`, { liked: true });
      if (data.mutualMatch) showToast("🎉 It's a match!");
      else showToast("❤️ Liked!");
      setLastUndoProfile(likedProfile || null);
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setDailyLikes((prev) => ({ ...prev, count: prev.count + 1 }));
    } catch (err) {
      if (err.response?.data?.limitReached) {
        showToast("⚠️ " + err.response.data.error);
        setDailyLikes((prev) => ({ ...prev, count: prev.limit }));
      }
    }
  };

  const onPass = async (id) => {
    const passedProfile = profiles.find((p) => p.id === id);
    setLastUndoProfile(passedProfile || null);
    await api.post(`/matches/like/${id}`, { liked: false });
    setProfiles((prev) => prev.filter((p) => p.id !== id));
  };

  const onPulse = async (id) => {
    try {
      const { data } = await api.post(`/matches/like/${id}`, { liked: true, superLike: true });
      if (data.mutualMatch) showToast("🎉 It's a match! ⚡ Pulse sent!");
      else showToast("⚡ Pulse sent! They'll know you really like them.");
      setProfiles((prev) => prev.filter((p) => p.id !== id));
      setDailyLikes((prev) => ({
        ...prev,
        count: prev.count + 1,
        superLikeCount: (prev.superLikeCount || 0) + 1,
      }));
    } catch (err) {
      if (err.response?.data?.superLimitReached) {
        showToast("⚡ Daily Pulse limit reached. Come back tomorrow!");
      } else if (err.response?.data?.limitReached) {
        showToast("⚠️ " + err.response.data.error);
      }
    }
  };

  const likesRemaining = dailyLikes.limit - dailyLikes.count;
  const limitReached = likesRemaining <= 0;
  const superLikesRemaining = dailyLikes.superLikeLimit - (dailyLikes.superLikeCount || 0);
  const superLimitReached = superLikesRemaining <= 0;

  const countLabel = useMemo(() => {
    if (profiles.length === 1) return "1 profile";
    return `${profiles.length} profiles`;
  }, [profiles.length]);

  return (
    <section className="page">
      {toast && <div className="toast">{toast}</div>}

      <div className="hero">
        <h2>Discover People Nearby</h2>
        <p>Swipe right to like, left to pass, ⚡ Pulse to stand out.</p>
      </div>

      {quality && (
        <article className="quality-banner">
          <div className="quality-banner-row">
            <strong>Profile quality: {quality.score}%</strong>
            <span className={quality.unlocked ? "badge-green" : "badge-amber"}>
              {quality.unlocked ? "Swiping unlocked" : `Unlock at ${quality.threshold}%`}
            </span>
          </div>
          <div className="progress-track" style={{ marginTop: "0.4rem" }}>
            <div
              className="progress-fill"
              style={{
                width: `${quality.score}%`,
                background: quality.unlocked ? "var(--success)" : "var(--accent-2)",
              }}
            />
          </div>
          {!quality.unlocked && quality.tips?.length > 0 && (
            <ul className="quality-tips">
              {quality.tips.slice(0, 3).map((tip) => (
                <li key={tip}>{tip}</li>
              ))}
            </ul>
          )}
          {!quality.unlocked && user?.id && (
            <Link className="btn-primary" to="/onboarding" style={{ marginTop: "0.5rem", display: "inline-block" }}>
              Continue onboarding
            </Link>
          )}
        </article>
      )}

      {qualityLoading ? (
        <p className="muted">Checking profile quality…</p>
      ) : quality && !quality.unlocked ? (
        <p className="muted">Discover is locked until your profile quality reaches the unlock score.</p>
      ) : (
        <>

      <div className="geo-bar">
        {geoStatus === "active" ? (
          <>
            <span className="geo-active">📍 Location active</span>
            <select
              value={radiusMi}
              onChange={(e) => setRadiusMi(Number(e.target.value))}
              className="geo-radius-select"
            >
              <option value={10}>Within 10 mi</option>
              <option value={25}>Within 25 mi</option>
              <option value={50}>Within 50 mi</option>
              <option value={100}>Within 100 mi</option>
              <option value={250}>Within 250 mi</option>
            </select>
            <button className="btn-secondary geo-clear-btn" onClick={clearLocation}>✕ Clear</button>
          </>
        ) : (
          <button
            className="btn-secondary geo-detect-btn"
            onClick={requestLocation}
            disabled={geoStatus === "loading"}
          >
            {geoStatus === "loading" ? "Detecting..." : "📍 Use My Location"}
          </button>
        )}
        {geoStatus === "denied" && (
          <span className="muted" style={{ fontSize: "0.8rem" }}>Location permission was denied.</span>
        )}
      </div>

      <div className="daily-likes-bar">
        <span className={limitReached ? "error" : "muted"}>
          {limitReached
            ? "❤️ Daily likes used up — come back tomorrow!"
            : `❤️ ${likesRemaining} likes remaining`}
        </span>
        <span className="muted" style={{ fontSize: "0.85rem" }}>
          ⚡ {superLikesRemaining} Pulse{superLikesRemaining !== 1 ? "s" : ""} left
        </span>
        <div className="progress-track" style={{flex:1, maxWidth:"160px"}}>
          <div className="progress-fill" style={{
            width: `${Math.min((dailyLikes.count / dailyLikes.limit) * 100, 100)}%`,
            background: limitReached ? "var(--error)" : "var(--accent)",
          }} />
        </div>
        <div style={{ display: "flex", gap: "0.4rem", marginLeft: "auto" }}>
          <button
            className={`btn-secondary swipe-mode-btn${viewMode === "swipe" ? " active" : ""}`}
            onClick={() => setViewMode("swipe")} style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}>
            🃏 Swipe
          </button>
          <button
            className={`btn-secondary swipe-mode-btn${viewMode === "grid" ? " active" : ""}`}
            onClick={() => setViewMode("grid")} style={{ padding: "0.3rem 0.7rem", fontSize: "0.8rem" }}>
            ⊞ Grid
          </button>
        </div>
      </div>

      <form className="search-grid" onSubmit={(e) => { e.preventDefault(); fetchProfiles(); }}>
        <input value={search} onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by vibe, interest, or name" />
        <input value={city} onChange={(e) => setCity(e.target.value)} placeholder="City" />
        <button className="btn-secondary" type="button" onClick={() => setShowFilters((f) => !f)}>
          {showFilters ? "Hide Filters ▲" : "Filters ▼"}
        </button>
        <button className="btn-primary" type="submit">Browse</button>
      </form>

      {showFilters && (
        <div className="filter-panel">
          <div className="filter-row">
            <label>State</label>
            <input
              value={state}
              onChange={(e) => setState(e.target.value)}
              placeholder="e.g. GA"
              maxLength={30}
            />
          </div>
          <div className="filter-row">
            <label>ZIP code</label>
            <input
              value={zipCode}
              onChange={(e) => setZipCode(e.target.value)}
              placeholder="e.g. 30301"
              maxLength={12}
            />
          </div>
          <div className="filter-row">
            <label>Age range</label>
            <div style={{display:"flex",gap:"0.5rem",alignItems:"center"}}>
              <input type="number" value={ageMin} onChange={(e) => setAgeMin(e.target.value)}
                placeholder="Min" min={18} max={120} style={{width:"80px"}} />
              <span className="muted">–</span>
              <input type="number" value={ageMax} onChange={(e) => setAgeMax(e.target.value)}
                placeholder="Max" min={18} max={120} style={{width:"80px"}} />
            </div>
          </div>
          <div className="filter-row">
            <label>Looking for</label>
            <div className="chip-select">
              {LOOKING_FOR_OPTIONS.map((opt) => (
                <button key={opt} type="button"
                  className={`chip chip-toggle${lookingFor === opt ? " active" : ""}`}
                  onClick={() => setLookingFor(opt)}>
                  {opt}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      <p className="muted">Showing {countLabel}</p>

      {dailyPick && (
        <article className="daily-pick-card">
          <span className="daily-pick-label">✨ Today's Best Match</span>
          <div className="daily-pick-inner">
            <img src={toAssetUrl(dailyPick.avatar)} alt={dailyPick.name} className="daily-pick-avatar" />
            <div>
              <strong>{dailyPick.name}</strong>, {dailyPick.age}
              <p className="muted" style={{ fontSize: "0.82rem", margin: "0.2rem 0" }}>{dailyPick.city}</p>
              {dailyPick.compatScore !== undefined && (
                <span className={`compat-badge ${dailyPick.compatScore >= 70 ? "compat-high" : "compat-mid"}`}>{dailyPick.compatScore}% match</span>
              )}
            </div>
            <Link to={`/profiles/${dailyPick.id}`} className="btn-primary" style={{ marginLeft: "auto", fontSize: "0.85rem" }}>View</Link>
          </div>
        </article>
      )}

      {profiles.length === 0 ? (
        <p className="muted">
          No new profiles to show.{" "}
          <Link to="/matches" className="link">Check your matches!</Link>
        </p>
      ) : viewMode === "swipe" ? (
        <SwipeDeck
          profiles={profiles}
          onLike={onLike}
          onPass={onPass}
          onPulse={onPulse}
          onUndo={onUndo}
          undoAvailable={!!lastUndoProfile}
          limitReached={limitReached}
          superLimitReached={superLimitReached}
        />
      ) : (
        <div className="profile-grid">
          {profiles.map((profile) => (
            <article key={profile.id} className="profile-card">
              <img src={toAssetUrl(profile.avatar)} alt={`${profile.name} avatar`} />
              <div className="profile-card-body">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <h3 style={{ margin: 0 }}>{profile.name}, {profile.age}</h3>
                  {profile.compatScore !== undefined && (
                    <span className={`compat-badge ${profile.compatScore >= 70 ? "compat-high" : profile.compatScore >= 40 ? "compat-mid" : "compat-low"}`}>
                      {profile.compatScore}%
                    </span>
                  )}
                </div>
                <p className="muted">{profile.city}</p>
                <p>{profile.bio}</p>
                {profile.lookingFor && (
                  <p className="muted" style={{fontSize:"0.8rem",marginTop:"0.25rem"}}>
                    Looking for: {profile.lookingFor}
                  </p>
                )}
                <div className="chip-row">
                  {profile.interests.map((i) => (
                    <span className="chip" key={i}>{i}</span>
                  ))}
                </div>
              </div>
              <div className="action-row">
                <button className="btn-pass" onClick={() => onPass(profile.id)}>✕ Pass</button>
                <Link to={`/profiles/${profile.id}`} className="btn-secondary">View</Link>
                <button className="btn-like" onClick={() => onLike(profile.id)} disabled={limitReached}>
                  ♥ Like
                </button>
              </div>
            </article>
          ))}
        </div>
      )}
        </>
      )}
    </section>
  );
};
