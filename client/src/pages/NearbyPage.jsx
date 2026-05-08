import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, toAssetUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";

const RADIUS_OPTIONS = [1, 5, 10, 25, 50];

export default function NearbyPage() {
  const { user } = useAuth();
  const navigate = useNavigate();

  const [people, setPeople] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [locationGranted, setLocationGranted] = useState(false);
  const [coords, setCoords] = useState(null);
  const [radius, setRadius] = useState(10);
  const [settings, setSettings] = useState({ showInNearby: false, nearbyPrivacy: "approximate" });
  const [savingSettings, setSavingSettings] = useState(false);
  const [toast, setToast] = useState("");
  const watchRef = useRef(null);

  const isPremium = user?.isPremium;

  const showToast = (msg) => {
    setToast(msg);
    setTimeout(() => setToast(""), 3000);
  };

  // Load own settings on mount
  useEffect(() => {
    api.get("/nearby/settings").catch(() => {}); // will 404 on non-premium; handled below
    // Read from profile
    api.get(`/profiles/${user?.id}`).then(({ data }) => {
      setSettings({
        showInNearby: data.showInNearby ?? false,
        nearbyPrivacy: data.nearbyPrivacy ?? "approximate",
      });
    }).catch(() => {});
  }, [user?.id]);

  const requestLocation = () => {
    if (!navigator.geolocation) {
      setError("Your browser does not support geolocation.");
      return;
    }
    setLoading(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const c = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        setCoords(c);
        setLocationGranted(true);
        loadNearby(c);
      },
      () => {
        setLoading(false);
        setError("Location access denied. Please allow location access and try again.");
      },
      { timeout: 12000, maximumAge: 60000 },
    );
  };

  const loadNearby = async (c = coords) => {
    if (!c) return;
    setLoading(true);
    setError("");
    try {
      const { data } = await api.get("/nearby", {
        params: { lat: c.lat, lng: c.lng, radiusMi: radius },
      });
      setPeople(data);
    } catch (err) {
      if (err.response?.data?.upgradeRequired) {
        setError("upgrade");
      } else {
        setError(err.response?.data?.error || "Failed to load nearby people.");
      }
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (coords) loadNearby();
  }, [radius]); // eslint-disable-line react-hooks/exhaustive-deps

  const saveSettings = async (patch) => {
    const next = { ...settings, ...patch };
    setSettings(next);
    setSavingSettings(true);
    try {
      await api.patch("/nearby/settings", {
        ...next,
        ...(coords ? { lat: coords.lat, lng: coords.lng } : {}),
      });
      showToast("Settings saved.");
    } catch {
      showToast("Could not save settings.");
    } finally {
      setSavingSettings(false);
    }
  };

  // Cleanup watcher on unmount
  useEffect(() => () => {
    if (watchRef.current) navigator.geolocation.clearWatch(watchRef.current);
  }, []);

  const photoUrl = (p) => {
    const src = p.firstPhoto || p.avatar;
    if (!src) return null;
    if (src.startsWith("http")) return src;
    return toAssetUrl(src);
  };

  if (!isPremium) {
    return (
      <section className="page" style={{ textAlign: "center", paddingTop: "3rem" }}>
        <div style={{ fontSize: "2.5rem", marginBottom: "1rem" }}>📍</div>
        <h2 style={{ color: "#fff", marginBottom: "0.5rem" }}>Nearby — Premium Feature</h2>
        <p className="muted" style={{ marginBottom: "1.5rem", maxWidth: 400, margin: "0 auto 1.5rem" }}>
          See who's near you right now. Sorted by distance. Opt-in and be discovered too.
          Available on Plus and Gold plans.
        </p>
        <button className="btn-primary" onClick={() => navigate("/upgrade")}>
          ⭐ Upgrade to Unlock
        </button>
      </section>
    );
  }

  return (
    <section className="page" style={{ maxWidth: 700, margin: "0 auto", padding: "0 1rem 2rem" }}>
      {toast && (
        <div style={{
          position: "fixed", bottom: 24, right: 24, background: "#9b59b6",
          color: "#fff", padding: "10px 20px", borderRadius: 10, fontSize: "0.85rem",
          fontWeight: 600, zIndex: 9999, boxShadow: "0 4px 24px rgba(155,89,182,0.4)",
        }}>
          {toast}
        </div>
      )}

      <h2 style={{ color: "#fff", marginBottom: "0.25rem" }}>📍 Nearby</h2>
      <p className="muted" style={{ marginBottom: "1.25rem", fontSize: "0.85rem" }}>
        People who are near you right now and have opted in.
      </p>

      {/* Settings card */}
      <div style={{
        background: "rgba(155,89,182,0.08)", border: "1px solid rgba(155,89,182,0.25)",
        borderRadius: 12, padding: "14px 18px", marginBottom: "1.25rem",
        display: "flex", flexWrap: "wrap", gap: "1rem", alignItems: "center",
      }}>
        <label style={{ display: "flex", alignItems: "center", gap: 10, cursor: "pointer", color: "#e0e8ff", fontSize: "0.85rem" }}>
          <div
            onClick={() => saveSettings({ showInNearby: !settings.showInNearby })}
            style={{
              width: 44, height: 24, borderRadius: 12,
              background: settings.showInNearby ? "#9b59b6" : "#334",
              position: "relative", cursor: "pointer", transition: "background 0.2s",
              border: "1px solid rgba(255,255,255,0.1)",
            }}
          >
            <div style={{
              position: "absolute", top: 3, left: settings.showInNearby ? 22 : 2,
              width: 16, height: 16, borderRadius: "50%", background: "#fff",
              transition: "left 0.2s",
            }} />
          </div>
          Show me in Nearby
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#e0e8ff", fontSize: "0.85rem" }}>
          Distance privacy:
          <select
            value={settings.nearbyPrivacy}
            onChange={(e) => saveSettings({ nearbyPrivacy: e.target.value })}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#e0e8ff", padding: "4px 10px", borderRadius: 6, fontSize: "0.8rem",
            }}
          >
            <option value="approximate">Approximate (safer)</option>
            <option value="exact">Exact distance</option>
          </select>
        </label>

        <label style={{ display: "flex", alignItems: "center", gap: 8, color: "#e0e8ff", fontSize: "0.85rem" }}>
          Radius:
          <select
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            style={{
              background: "rgba(255,255,255,0.06)", border: "1px solid rgba(255,255,255,0.15)",
              color: "#e0e8ff", padding: "4px 10px", borderRadius: 6, fontSize: "0.8rem",
            }}
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r} mi</option>
            ))}
          </select>
        </label>

        {savingSettings && <span style={{ color: "#9b59b6", fontSize: "0.75rem" }}>Saving…</span>}
      </div>

      {/* Location request */}
      {!locationGranted && (
        <div style={{ textAlign: "center", padding: "2rem 0" }}>
          <p className="muted" style={{ marginBottom: "1rem" }}>
            Share your location to see who is nearby.
          </p>
          <button className="btn-primary" onClick={requestLocation} disabled={loading}>
            {loading ? "Getting location…" : "📍 Share My Location"}
          </button>
          {error && error !== "upgrade" && (
            <p style={{ color: "#ff8888", fontSize: "0.8rem", marginTop: "0.75rem" }}>{error}</p>
          )}
        </div>
      )}

      {/* Upgrade error */}
      {error === "upgrade" && (
        <div style={{ textAlign: "center", padding: "2rem 0" }}>
          <p className="muted" style={{ marginBottom: "1rem" }}>Premium required to view nearby people.</p>
          <button className="btn-primary" onClick={() => navigate("/upgrade")}>⭐ Upgrade</button>
        </div>
      )}

      {/* Refresh button when location granted */}
      {locationGranted && (
        <div style={{ display: "flex", gap: 10, marginBottom: "1.25rem", alignItems: "center" }}>
          <button
            className="btn-secondary"
            onClick={requestLocation}
            disabled={loading}
            style={{ fontSize: "0.8rem", padding: "6px 14px" }}
          >
            {loading ? "Refreshing…" : "🔄 Refresh"}
          </button>
          <span style={{ color: "#88aacc", fontSize: "0.75rem" }}>
            {people.length} {people.length === 1 ? "person" : "people"} within {radius} mi
          </span>
        </div>
      )}

      {/* Grid */}
      {locationGranted && !loading && (
        <>
          {people.length === 0 ? (
            <div style={{ textAlign: "center", padding: "3rem 0", color: "#88aacc" }}>
              <div style={{ fontSize: "2rem", marginBottom: 8 }}>🏙️</div>
              <p>No one nearby has opted in yet within {radius} miles.</p>
              <p style={{ fontSize: "0.8rem", marginTop: 4 }}>
                Turn on "Show me in Nearby" above so others can find you.
              </p>
            </div>
          ) : (
            <div style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(140px, 1fr))",
              gap: 10,
            }}>
              {people.map((p) => {
                const photo = photoUrl(p);
                return (
                  <div
                    key={p.id}
                    onClick={() => navigate(`/profiles/${p.id}`)}
                    style={{
                      position: "relative", cursor: "pointer", borderRadius: 12,
                      overflow: "hidden", aspectRatio: "3/4",
                      background: photo ? "transparent" : "rgba(155,89,182,0.12)",
                      border: "1px solid rgba(255,255,255,0.08)",
                      transition: "transform 0.15s, box-shadow 0.15s",
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.transform = "scale(1.03)";
                      e.currentTarget.style.boxShadow = "0 4px 20px rgba(155,89,182,0.35)";
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.transform = "scale(1)";
                      e.currentTarget.style.boxShadow = "none";
                    }}
                  >
                    {photo ? (
                      <img
                        src={photo}
                        alt={p.name}
                        style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }}
                      />
                    ) : (
                      <div style={{
                        width: "100%", height: "100%", display: "flex",
                        alignItems: "center", justifyContent: "center",
                        fontSize: "2.5rem", color: "#9b59b6",
                      }}>
                        👤
                      </div>
                    )}

                    {/* Online dot */}
                    {p.isOnline && (
                      <div style={{
                        position: "absolute", top: 8, right: 8,
                        width: 10, height: 10, borderRadius: "50%",
                        background: "#00e676", border: "2px solid #0d0d14",
                      }} />
                    )}

                    {/* Info overlay */}
                    <div style={{
                      position: "absolute", bottom: 0, left: 0, right: 0,
                      background: "linear-gradient(to top, rgba(0,0,0,0.85) 0%, transparent 100%)",
                      padding: "20px 8px 8px",
                    }}>
                      <div style={{ color: "#fff", fontWeight: 700, fontSize: "0.85rem", lineHeight: 1.2 }}>
                        {p.name}{p.age ? `, ${p.age}` : ""}
                      </div>
                      <div style={{ color: "#c89ef5", fontSize: "0.7rem", marginTop: 2 }}>
                        📍 {p.distanceLabel}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </>
      )}
    </section>
  );
}
