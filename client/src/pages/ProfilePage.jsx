import { useCallback, useEffect, useMemo, useState } from "react";
import { useNavigate, useParams, useSearchParams } from "react-router-dom";
import { api, toAssetUrl } from "../api/client";
import { useAuth } from "../context/AuthContext";
import { MessagePanel } from "../components/MessagePanel";
import { MediaCarousel } from "../components/MediaCarousel";

const THEME_OPTIONS = [
  { value: "sunset", label: "Sunset Glow" },
  { value: "ocean", label: "Ocean Dream" },
  { value: "neon", label: "Neon City" },
  { value: "forest", label: "Forest Calm" },
];

const GRAPHIC_OPTIONS = [
  { value: "none", label: "Minimal" },
  { value: "hearts", label: "Hearts" },
  { value: "stars", label: "Stars" },
  { value: "sparkles", label: "Sparkles" },
];

const POLY_PREFERENCE_OPTIONS = [
  "Prefer monogamy",
  "Open to monogamy",
  "Open to polyamory",
  "Polyamorous",
  "Not sure yet",
  "Prefer not to say",
];

const PROMPT_QUESTIONS = [
  "The way to my heart is...",
  "I'll know it's a match if...",
  "Most controversial opinion:",
  "My love language is...",
  "Best trip I've ever taken:",
  "Ideal Sunday morning:",
  "I'm irrationally passionate about:",
  "Two truths and a lie:",
  "The key to my heart:",
  "Something you'd never guess about me:",
];

const REPORT_REASONS = [
  "Fake profile / Catfish",
  "Harassment or abuse",
  "Inappropriate photos",
  "Spam or scam",
  "Underage user",
  "Other",
];

const EDIT_TABS = [
  { value: "basics", label: "Basics" },
  { value: "prompts", label: "Prompts" },
  { value: "vibe", label: "Vibe" },
  { value: "media", label: "Media" },
  { value: "visibility", label: "Visibility" },
];

const TAB_FIELDS = {
  basics: [
    "name",
    "age",
    "city",
    "state",
    "zipCode",
    "pronouns",
    "genderIdentity",
    "sexualOrientation",
    "polyPreference",
    "interestsText",
    "bio",
    "lookingFor",
  ],
  vibe: ["profileTheme", "profileGraphic", "musicUrl", "profileMotto", "dreamDate"],
  prompts: ["profilePrompts"],
  media: ["avatar"],
  visibility: ["profileVisibility"],
};

const THEME_STYLE_MAP = {
  sunset: { start: "#5c204a", end: "#f9a33f", border: "#f7bf66" },
  ocean: { start: "#103e67", end: "#2eb2c9", border: "#8ce9ff" },
  neon: { start: "#1e103f", end: "#ff5b8f", border: "#ff9de0" },
  forest: { start: "#1f3b2d", end: "#73b687", border: "#a9dfbf" },
};

function completeness(profile) {
  const checks = [
    !!profile.avatar,
    profile.bio?.length > 20,
    profile.interests?.length > 0,
    !!profile.lookingFor,
    !!profile.city,
    profile.media?.length > 0,
  ];
  return Math.round((checks.filter(Boolean).length / checks.length) * 100);
}

const COMPLETE_TIPS = {
  avatar: "Add a profile photo",
  bio: "Write a bio (at least 20 chars)",
  interests: "Add some interests",
  lookingFor: "Set what you're looking for",
  city: "Add your city",
  media: "Upload at least one photo",
};

function completenessDetails(profile) {
  return [
    { key: "avatar", done: !!profile.avatar },
    { key: "bio", done: profile.bio?.length > 20 },
    { key: "interests", done: profile.interests?.length > 0 },
    { key: "lookingFor", done: !!profile.lookingFor },
    { key: "city", done: !!profile.city },
    { key: "media", done: profile.media?.length > 0 },
  ];
}

export const ProfilePage = () => {
  const { id } = useParams();
  const { user } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [profile, setProfile] = useState(null);
  const [form, setForm] = useState(null);
  const [baselineForm, setBaselineForm] = useState(null);
  const [mediaDraft, setMediaDraft] = useState([]);
  const [dragMediaId, setDragMediaId] = useState(null);
  const [isMatch, setIsMatch] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [savingMedia, setSavingMedia] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [formError, setFormError] = useState("");
  const [saveMsg, setSaveMsg] = useState("");
  const [editTab, setEditTab] = useState("basics");
  const [publicPreview, setPublicPreview] = useState(false);
  const [paused, setPaused] = useState(false);
  const [boosting, setBoosting] = useState(false);
  const [boostMsg, setBoostMsg] = useState("");
  const [showReport, setShowReport] = useState(false);
  const [reportReason, setReportReason] = useState("");
  const [reportDetails, setReportDetails] = useState("");
  const [reportSent, setReportSent] = useState(false);
  const [blocked, setBlocked] = useState(false);
  const [verifyStatus, setVerifyStatus] = useState("");
  const [actionMsg, setActionMsg] = useState("");
  const [quality, setQuality] = useState(null);
  // Phone verification
  const [phoneNumber, setPhoneNumber] = useState("");
  const [phoneVerified, setPhoneVerified] = useState(false);
  const [phoneCode, setPhoneCode] = useState("");
  const [phoneSent, setPhoneSent] = useState(false);
  const [phoneMsg, setPhoneMsg] = useState("");
  // Friendship
  const [friendStatus, setFriendStatus] = useState("none"); // none | pending | accepted
  const [friendshipId, setFriendshipId] = useState(null);
  const [isFriendSender, setIsFriendSender] = useState(false);
  const [friendLoading, setFriendLoading] = useState(false);

  const isOwn = user?.id === id;
  const fromOnboarding = searchParams.get("from") === "onboarding";

  useEffect(() => {
    if (!isOwn) return;

    const mode = searchParams.get("mode");
    const tab = searchParams.get("tab");
    const validTabs = new Set(EDIT_TABS.map((t) => t.value));

    if (mode === "edit") {
      setPublicPreview(false);
    }
    if (tab && validTabs.has(tab)) {
      setEditTab(tab);
    }
  }, [isOwn, searchParams]);

  const fetchProfile = useCallback(async () => {
    try {
      const [profileRes, matchRes, blocksRes] = await Promise.all([
        api.get(`/profiles/${id}`),
        api.get("/matches"),
        api.get("/safety/blocks").catch(() => ({ data: [] })),
      ]);
      setProfile(profileRes.data);
      setMediaDraft(profileRes.data.media || []);
      setIsMatch(matchRes.data.some((m) => m.id === id));
      setPaused(!!profileRes.data.paused);
      setVerifyStatus(profileRes.data.verifiedStatus || "");
      setBlocked(blocksRes.data.some((b) => b.id === id));
      if (user?.id === id) {
        setPhoneNumber(profileRes.data.phoneNumber || "");
        setPhoneVerified(!!profileRes.data.phoneVerified);
        api.get("/profile-quality/me")
          .then((r) => setQuality(r.data))
          .catch(() => setQuality(null));
      } else {
        setQuality(null);
      }
      // Load friendship status for non-own profiles
      if (user?.id !== id) {
        api.get(`/friends/status/${id}`)
          .then((r) => {
            setFriendStatus(r.data.status || "none");
            setFriendshipId(r.data.friendshipId || null);
            setIsFriendSender(!!r.data.isSender);
          })
          .catch(() => {});
      }
    } catch {
      setLoadError("Profile not found.");
    }
  }, [id, user?.id]);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  useEffect(() => {
    setForm(null);
    setBaselineForm(null);
    setMediaDraft([]);
  }, [id]);

  const makeFormFromProfile = useCallback((p) => ({
    name: p.name || "",
    age: String(p.age || ""),
    city: p.city || "",
    state: p.state || "",
    zipCode: p.zipCode || "",
    pronouns: p.pronouns || "",
    genderIdentity: p.genderIdentity || "",
    sexualOrientation: p.sexualOrientation || "",
    polyPreference: p.polyPreference || "",
    bio: p.bio || "",
    lookingFor: p.lookingFor || "",
    musicUrl: p.musicUrl || "",
    profileTheme: p.profileTheme || "sunset",
    profileGraphic: p.profileGraphic || "none",
    profileMotto: p.profileMotto || "",
    dreamDate: p.dreamDate || "",
    interestsText: (p.interests || []).join(", "),
    avatar: p.avatar || "",
    latitude: p.latitude ?? 0,
    longitude: p.longitude ?? 0,
    profilePrompts: Array.isArray(p.profilePrompts) ? p.profilePrompts : [],
    profileVisibility: (() => { try { return typeof p.profileVisibility === "object" ? (p.profileVisibility || {}) : JSON.parse(p.profileVisibility || "{}"); } catch { return {}; } })(),
  }), []);

  useEffect(() => {
    if (!profile) return;
    if (isOwn) {
      const nextForm = makeFormFromProfile(profile);
      setForm(nextForm);
      setBaselineForm(nextForm);
    }
    setMediaDraft(profile.media || []);
  }, [profile, isOwn, makeFormFromProfile]);

  const onUpload = async (event) => {
    const file = event.target.files?.[0];
    if (!file || !isOwn) return;
    const formData = new FormData();
    formData.append("media", file);
    try {
      setUploading(true);
      await api.post(`/profiles/${id}/media`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      await fetchProfile();
    } finally {
      setUploading(false);
    }
  };

  const onField = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormError("");
  };

  const showAction = (msg) => { setActionMsg(msg); setTimeout(() => setActionMsg(""), 3000); };

  const onTogglePause = async () => {
    const next = !paused;
    await api.post("/safety/pause", { paused: next });
    setPaused(next);
    showAction(next ? "⏸ Profile paused — you won't appear in searches." : "▶ Profile is active again!");
  };

  const onBoost = async () => {
    setBoosting(true);
    try {
      await api.post("/safety/boost");
      setBoostMsg("🚀 Profile boosted for 30 minutes!");
      setTimeout(() => setBoostMsg(""), 30000);
    } finally { setBoosting(false); }
  };

  const onRequestVerify = async () => {
    await api.post("/safety/verify/request");
    setVerifyStatus("pending");
    showAction("✅ Verification request submitted!");
  };

  // Demo: approve own verify
  const onApproveVerify = async () => {
    await api.post(`/safety/verify/approve/${id}`);
    setVerifyStatus("verified");
    setProfile((p) => ({ ...p, verified: true, verifiedStatus: "verified" }));
    showAction("✅ Profile verified!");
  };

  const onBlock = async () => {
    await api.post(`/safety/block/${id}`);
    setBlocked(true);
    showAction("🚫 User blocked.");
  };

  const onUnblock = async () => {
    await api.delete(`/safety/block/${id}`);
    setBlocked(false);
    showAction("Unblocked.");
  };

  const onReport = async () => {
    if (!reportReason) return;
    await api.post(`/safety/report/${id}`, { reason: reportReason, details: reportDetails });
    setReportSent(true);
    setTimeout(() => { setShowReport(false); setReportSent(false); setReportReason(""); setReportDetails(""); }, 2500);
  };

  // ── Friend actions ─────────────────────────────────────────────────────────
  const onAddFriend = async () => {
    setFriendLoading(true);
    try {
      await api.post(`/friends/request/${id}`);
      setFriendStatus("pending");
      setIsFriendSender(true);
      showAction("Friend request sent!");
    } catch (e) {
      showAction(e.response?.data?.error || "Could not send request.");
    } finally {
      setFriendLoading(false);
    }
  };

  const onCancelFriend = async () => {
    setFriendLoading(true);
    try {
      await api.delete(`/friends/cancel/${id}`);
      setFriendStatus("none");
      setFriendshipId(null);
      showAction("Request cancelled.");
    } catch { /* ignore */ } finally {
      setFriendLoading(false);
    }
  };

  const onAcceptFriend = async () => {
    if (!friendshipId) return;
    setFriendLoading(true);
    try {
      await api.post(`/friends/accept/${friendshipId}`);
      setFriendStatus("accepted");
      showAction("You are now friends!");
    } catch { /* ignore */ } finally {
      setFriendLoading(false);
    }
  };

  const onUnfriend = async () => {
    setFriendLoading(true);
    try {
      await api.delete(`/friends/${id}`);
      setFriendStatus("none");
      setFriendshipId(null);
      showAction("Unfriended.");
    } catch { /* ignore */ } finally {
      setFriendLoading(false);
    }
  };

  const onSendPhoneCode = async () => {
    setPhoneMsg("");
    try {
      await api.post("/phone/send", { phoneNumber });
      setPhoneSent(true);
      setPhoneMsg("Code sent! Check your SMS.");
    } catch (e) {
      setPhoneMsg(e.response?.data?.error || "Failed to send code.");
    }
  };

  const onVerifyPhone = async () => {
    setPhoneMsg("");
    try {
      await api.post("/phone/verify", { phoneNumber, code: phoneCode });
      setPhoneVerified(true);
      setPhoneSent(false);
      setPhoneCode("");
      setPhoneMsg("✓ Phone verified!");
    } catch (e) {
      setPhoneMsg(e.response?.data?.error || "Invalid code.");
    }
  };

  const onUnlinkPhone = async () => {
    setPhoneMsg("");
    try {
      await api.delete("/phone");
      setPhoneNumber("");
      setPhoneVerified(false);
      setPhoneMsg("Phone number removed.");
    } catch (e) {
      setPhoneMsg(e.response?.data?.error || "Failed to unlink phone.");
    }
  };

  const reorderMedia = (list, fromId, toId) => {
    const fromIndex = list.findIndex((m) => m.id === fromId);
    const toIndex = list.findIndex((m) => m.id === toId);
    if (fromIndex < 0 || toIndex < 0 || fromIndex === toIndex) return list;
    const next = [...list];
    const [moved] = next.splice(fromIndex, 1);
    next.splice(toIndex, 0, moved);
    return next;
  };

  const onMediaDrop = (targetId) => {
    if (!dragMediaId) return;
    const nextOrder = reorderMedia(mediaDraft, dragMediaId, targetId);
    if (nextOrder === mediaDraft) {
      setDragMediaId(null);
      return;
    }
    setMediaDraft(nextOrder);
    setDragMediaId(null);
    onSaveMediaOrder(nextOrder);
  };

  const onMoveMedia = (mediaId, direction) => {
    const index = mediaDraft.findIndex((m) => m.id === mediaId);
    if (index < 0) return;
    let targetIndex;
    if (direction === "up") {
      targetIndex = index - 1;
      if (targetIndex < 0) return;
    } else if (direction === "down") {
      targetIndex = index + 1;
      if (targetIndex >= mediaDraft.length) return;
    } else {
      return;
    }
    const nextOrder = [...mediaDraft];
    [nextOrder[index], nextOrder[targetIndex]] = [nextOrder[targetIndex], nextOrder[index]];
    setMediaDraft(nextOrder);
    onSaveMediaOrder(nextOrder);
  };

  const mediaDirty = useMemo(() => {
    const base = profile?.media || [];
    if (base.length !== mediaDraft.length) return true;
    return base.some((m, idx) => mediaDraft[idx]?.id !== m.id);
  }, [profile?.media, mediaDraft]);

  const onSaveMediaOrder = async (orderedDraft = mediaDraft) => {
    if (!isOwn || !orderedDraft.length) return;
    try {
      setSavingMedia(true);
      const { data } = await api.put(`/profiles/${id}/media/order`, {
        orderedIds: orderedDraft.map((m) => m.id),
      });
      setProfile((prev) => ({ ...prev, media: data }));
      setMediaDraft(data);
      setSaveMsg("Media order auto-saved.");
      setTimeout(() => setSaveMsg(""), 2500);
    } catch {
      setFormError("Unable to save media order.");
    } finally {
      setSavingMedia(false);
    }
  };

  const onCancelTab = (tab) => {
    if (!form || !baselineForm) return;
    const keys = TAB_FIELDS[tab] || [];
    const reset = { ...form };
    keys.forEach((k) => {
      reset[k] = baselineForm[k];
    });
    setForm(reset);
    if (tab === "media") setMediaDraft(profile?.media || []);
    setFormError("");
  };

  const onRevertAll = () => {
    if (!baselineForm) return;
    setForm({ ...baselineForm });
    setMediaDraft(profile?.media || []);
    setFormError("");
  };

  const onSaveProfile = async () => {
    if (!isOwn || !form) return;
    setSaveMsg("");
    setFormError("");
    try {
      setSaving(true);
      const payload = {
        name: form.name.trim(),
        age: Number(form.age),
        city: form.city.trim(),
        state: form.state.trim(),
        zipCode: form.zipCode.trim(),
        pronouns: form.pronouns.trim(),
        genderIdentity: form.genderIdentity.trim(),
        sexualOrientation: form.sexualOrientation.trim(),
        polyPreference: form.polyPreference.trim(),
        bio: form.bio.trim(),
        lookingFor: form.lookingFor.trim(),
        musicUrl: form.musicUrl.trim(),
        profileTheme: form.profileTheme,
        profileGraphic: form.profileGraphic,
        profileMotto: form.profileMotto.trim(),
        dreamDate: form.dreamDate.trim(),
        avatar: form.avatar.trim(),
        latitude: form.latitude ? Number(form.latitude) : undefined,
        longitude: form.longitude ? Number(form.longitude) : undefined,
        profilePrompts: (form.profilePrompts || []).filter((p) => p.q && p.a),
        interests: form.interestsText
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean),
        profileVisibility: form.profileVisibility || {},
      };

      const { data } = await api.put(`/profiles/${id}`, payload);
      setProfile(data);
      const nextForm = makeFormFromProfile(data);
      setForm(nextForm);
      setBaselineForm(nextForm);
      setSaveMsg("Profile updated.");
      setTimeout(() => setSaveMsg(""), 2500);
      if (fromOnboarding) {
        navigate("/onboarding");
      }
    } catch {
      setFormError("Unable to save profile changes.");
    } finally {
      setSaving(false);
    }
  };

  const showOwnerEditor = isOwn && !publicPreview;

  const baseProfile = profile || {
    name: "",
    age: "",
    city: "",
    state: "",
    zipCode: "",
    pronouns: "",
    genderIdentity: "",
    sexualOrientation: "",
    polyPreference: "",
    bio: "",
    lookingFor: "",
    profileTheme: "sunset",
    profileGraphic: "none",
    musicUrl: "",
    profileMotto: "",
    dreamDate: "",
    avatar: "",
    interests: [],
    media: [],
  };

  const previewProfile = (showOwnerEditor && form)
    ? {
        ...baseProfile,
        name: form.name,
        age: Number(form.age) || baseProfile.age,
        city: form.city,
        state: form.state,
        zipCode: form.zipCode,
        pronouns: form.pronouns,
        genderIdentity: form.genderIdentity,
        sexualOrientation: form.sexualOrientation,
        polyPreference: form.polyPreference,
        bio: form.bio,
        lookingFor: form.lookingFor,
        profileTheme: form.profileTheme,
        profileGraphic: form.profileGraphic,
        musicUrl: form.musicUrl,
        profileMotto: form.profileMotto,
        dreamDate: form.dreamDate,
        avatar: form.avatar,
        interests: form.interestsText
          .split(",")
          .map((i) => i.trim())
          .filter(Boolean),
        media: mediaDraft,
      }
    : {
        ...baseProfile,
        media: mediaDraft.length ? mediaDraft : baseProfile.media,
      };

  const theme = THEME_STYLE_MAP[previewProfile.profileTheme] || THEME_STYLE_MAP.sunset;
  const themeVars = {
    "--profile-theme-start": theme.start,
    "--profile-theme-end": theme.end,
    "--profile-theme-border": theme.border,
  };

  const locationLabel = useMemo(() => {
    const cityState = [previewProfile.city, previewProfile.state].filter(Boolean).join(", ");
    if (cityState && previewProfile.zipCode) return `${cityState} ${previewProfile.zipCode}`;
    return cityState || previewProfile.zipCode || "";
  }, [previewProfile.city, previewProfile.state, previewProfile.zipCode]);

  const tabDirty = useMemo(() => {
    if (!form || !baselineForm) return { basics: false, vibe: false, media: mediaDirty };
    const map = { basics: false, vibe: false, media: mediaDirty };
    Object.entries(TAB_FIELDS).forEach(([tab, keys]) => {
      map[tab] = keys.some((k) => (form[k] || "") !== (baselineForm[k] || ""));
    });
    map.media = map.media || mediaDirty;
    return map;
  }, [form, baselineForm, mediaDirty]);

  const anyDirty = tabDirty.basics || tabDirty.vibe || tabDirty.media;

  if (loadError) return <p className="error">{loadError}</p>;
  if (!profile) return <p>Loading profile...</p>;

  return (
    <section className="page">
      {isOwn && (
        <div className="profile-preview-toggle">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => setPublicPreview((v) => !v)}
          >
            {publicPreview ? "Back To Edit Mode" : "Public Preview"}
          </button>
          <span className="muted">
            {publicPreview
              ? "Showing exactly what other members see."
              : "Edit mode with live preview enabled."}
          </span>
        </div>
      )}

      {(!isOwn || form) ? (
        <>
          <div
            className={`profile-custom-shell graphic-${previewProfile.profileGraphic || "none"}`}
            style={themeVars}
          >
            <div className="profile-custom-overlay" />

            <div className="profile-header">
              <img
                src={toAssetUrl(previewProfile.avatar)}
                alt={`${previewProfile.name} avatar`}
                className="profile-avatar"
              />
              <div>
                <h2 style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                  {previewProfile.name}, {previewProfile.age}
                  {previewProfile.verified && (
                    <span className="verified-badge" title="Verified profile">✓ Verified</span>
                  )}
                  {previewProfile.isPremium && (
                    <span className="premium-badge">⭐ Premium</span>
                  )}
                </h2>
                {showOwnerEditor && anyDirty && (
                  <span className="unsaved-badge">Unsaved Changes</span>
                )}
                <p className="muted">{locationLabel || previewProfile.city}</p>
                <p className="muted">
                  {previewProfile.pronouns || "Pronouns not set"}
                  {previewProfile.genderIdentity ? ` • ${previewProfile.genderIdentity}` : ""}
                </p>
                <p className="muted">
                  {previewProfile.sexualOrientation || "Orientation not set"}
                </p>
                {previewProfile.profileMotto && (
                  <p className="profile-motto">"{previewProfile.profileMotto}"</p>
                )}
                {isMatch && !isOwn && (
                  <span className="match-badge">✓ Mutual Match</span>
                )}
              </div>
            </div>

            <div className="profile-info-grid">
              <article className="panel">
                <h3>About Me</h3>
                <p>{previewProfile.bio}</p>
              </article>
              <article className="panel">
                <h3>What I Am Looking For</h3>
                <p>{previewProfile.lookingFor}</p>
                {previewProfile.polyPreference && (
                  <p className="muted" style={{ marginTop: "0.3rem", fontSize: "0.9rem" }}>
                    Relationship style: {previewProfile.polyPreference}
                  </p>
                )}
                {previewProfile.dreamDate && (
                  <p className="muted" style={{ marginTop: "0.4rem" }}>
                    Ideal date: {previewProfile.dreamDate}
                  </p>
                )}
              </article>
              <article className="panel">
                <h3>Interests</h3>
                <div className="chip-row">
                  {(previewProfile.interests || []).map((i) => (
                    <span className="chip" key={i}>{i}</span>
                  ))}
                </div>
              </article>

              {(previewProfile.profilePrompts || []).filter((p) => p.q && p.a).map((p, idx) => (
                <article className="panel prompt-card" key={idx}>
                  <p className="prompt-question">{p.q}</p>
                  <p className="prompt-answer">{p.a}</p>
                </article>
              ))}

            </div>

            {!isOwn && (
              <div className="profile-safety-row">
                {/* Friend button */}
                {friendStatus === "none" && (
                  <button className="btn-secondary btn-friend" onClick={onAddFriend} disabled={friendLoading}>
                    👤+ Add Friend
                  </button>
                )}
                {friendStatus === "pending" && isFriendSender && (
                  <button className="btn-secondary btn-friend" onClick={onCancelFriend} disabled={friendLoading}>
                    ⏳ Request Sent
                  </button>
                )}
                {friendStatus === "pending" && !isFriendSender && (
                  <button className="btn-secondary btn-friend btn-accent-outline" onClick={onAcceptFriend} disabled={friendLoading}>
                    ✓ Accept Request
                  </button>
                )}
                {friendStatus === "accepted" && (
                  <button className="btn-secondary btn-friend" onClick={onUnfriend} disabled={friendLoading}>
                    👥 Friends ▾
                  </button>
                )}
                {/* Message button — available to everyone */}
                <button className="btn-secondary" onClick={() => navigate(`/chat?roomId=${id}`)}>
                  💬 Message
                </button>
                {blocked ? (
                  <button className="btn-secondary" onClick={onUnblock}>Unblock User</button>
                ) : (
                  <button className="btn-secondary" style={{ color: "var(--error)" }} onClick={onBlock}>🚫 Block</button>
                )}
                <button className="btn-secondary" onClick={() => setShowReport(true)}>⚑ Report</button>
              </div>
            )}

            {isOwn && (
              <div className="profile-owner-actions">
                {actionMsg && <span className="action-toast">{actionMsg}</span>}
                {boostMsg && <span className="action-toast boost-toast">{boostMsg}</span>}
                <button className={`btn-secondary${paused ? " active" : ""}`} onClick={onTogglePause}>
                  {paused ? "▶ Resume Profile" : "⏸ Pause Profile"}
                </button>
                <button className="btn-secondary" onClick={onBoost} disabled={boosting}>
                  🚀 {boosting ? "Boosting..." : "Boost (30 min)"}
                </button>
                {verifyStatus === "" && (
                  <button className="btn-secondary" onClick={onRequestVerify}>✓ Request Verification</button>
                )}
                {verifyStatus === "pending" && (
                  <>
                    <span className="muted" style={{ fontSize: "0.85rem" }}>⏳ Verification pending...</span>
                    <button className="btn-secondary" style={{ fontSize: "0.8rem" }} onClick={onApproveVerify}>[Demo] Approve</button>
                  </>
                )}
                {verifyStatus === "verified" && (
                  <span className="verified-badge">✓ Verified</span>
                )}
              </div>
            )}

            {previewProfile.musicUrl && (
              <article className="panel">
                <h3>Profile Soundtrack</h3>
                <audio controls preload="none" src={previewProfile.musicUrl} style={{ width: "100%" }}>
                  Your browser does not support audio playback.
                </audio>
              </article>
            )}
          </div>

          {showOwnerEditor && (() => {
            const pct = completeness(previewProfile);
            const details = completenessDetails(previewProfile);
            const missing = details.filter((d) => !d.done);
            return (
              <div className="completeness-box">
                <div className="completeness-header">
                  <span>Profile strength: <strong>{pct}%</strong></span>
                  {pct === 100 && <span className="badge-green">? Complete</span>}
                </div>
                {quality && (
                  <p className="muted" style={{ marginTop: "0.35rem", marginBottom: "0.5rem" }}>
                    Unlock score: <strong>{quality.score}%</strong> / {quality.threshold}%
                    {" "}
                    <span className={quality.unlocked ? "badge-green" : "badge-amber"}>
                      {quality.unlocked ? "Unlocked" : "Locked"}
                    </span>
                  </p>
                )}
                <div className="progress-track">
                  <div className="progress-fill" style={{ width: `${pct}%`,
                    background: pct < 50 ? "var(--error)" : pct < 80 ? "var(--accent-2)" : "var(--success)" }} />
                </div>
                {missing.length > 0 && (
                  <ul className="completeness-tips">
                    {missing.map((d) => <li key={d.key}>� {COMPLETE_TIPS[d.key]}</li>)}
                  </ul>
                )}
                {!quality?.unlocked && quality?.tips?.length > 0 && (
                  <ul className="completeness-tips" style={{ marginTop: "0.5rem" }}>
                    {quality.tips.slice(0, 3).map((tip) => <li key={tip}>• {tip}</li>)}
                  </ul>
                )}
              </div>
            );
          })()}

          {showOwnerEditor && (
            <>
              <article className="panel">
                <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap", marginBottom: "0.5rem" }}>
                  <h3 style={{ margin: 0 }}>Edit Your Profile</h3>
                  {searchParams.get("from") === "onboarding" && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "0.25rem 0.75rem" }}
                      onClick={() => navigate("/onboarding")}
                    >
                      ← Back to Onboarding
                    </button>
                  )}
                </div>
                <div className="profile-edit-tabs">
                  {EDIT_TABS.map((tab) => (
                    <button
                      key={tab.value}
                      type="button"
                      className={`profile-edit-tab${editTab === tab.value ? " active" : ""}`}
                      onClick={() => setEditTab(tab.value)}
                    >
                      {tab.label}
                      {tabDirty[tab.value] ? " *" : ""}
                    </button>
                  ))}
                </div>
                <p className="muted" style={{ fontSize: "0.85rem" }}>
                  Preview updates live above while you edit. Click Save Profile to publish.
                </p>
                {form && (
                  <>
                    {editTab === "basics" && (
                      <div className="profile-edit-grid">
                        <input value={form.name} onChange={(e) => onField("name", e.target.value)} placeholder="Name" />
                        <input type="number" min={18} max={120} value={form.age} onChange={(e) => onField("age", e.target.value)} placeholder="Age" />
                        <input value={form.city} onChange={(e) => onField("city", e.target.value)} placeholder="City" />
                        <input value={form.state} onChange={(e) => onField("state", e.target.value)} placeholder="State" />
                        <input value={form.zipCode} onChange={(e) => onField("zipCode", e.target.value)} placeholder="ZIP Code" />
                        <input value={form.pronouns} onChange={(e) => onField("pronouns", e.target.value)} placeholder="Pronouns" />
                        <input value={form.genderIdentity} onChange={(e) => onField("genderIdentity", e.target.value)} placeholder="Gender identity" />
                        <input value={form.sexualOrientation} onChange={(e) => onField("sexualOrientation", e.target.value)} placeholder="Sexual orientation" />
                        <div style={{ gridColumn: "1 / -1" }}>
                          <button
                            type="button"
                            className="btn-secondary"
                            style={{ fontSize: "0.85rem", padding: "0.35rem 0.8rem" }}
                            onClick={() => {
                              if (!navigator.geolocation) return;
                              navigator.geolocation.getCurrentPosition(
                                (pos) => {
                                  onField("latitude", pos.coords.latitude);
                                  onField("longitude", pos.coords.longitude);
                                },
                                () => {}
                              );
                            }}
                          >
                            📍 Update my location
                          </button>
                          <span className="muted" style={{ fontSize: "0.78rem", marginLeft: "0.6rem" }}>
                            {form.latitude && form.latitude !== 0
                              ? `Location set (${Number(form.latitude).toFixed(3)}, ${Number(form.longitude).toFixed(3)})`
                              : "Location not set — enable to appear in nearby searches"}
                          </span>
                        </div>
                        <input value={form.interestsText} onChange={(e) => onField("interestsText", e.target.value)} placeholder="Interests (comma-separated)" />
                        <textarea value={form.bio} onChange={(e) => onField("bio", e.target.value)} placeholder="About me" rows={4} />
                        <div style={{ gridColumn: "1 / -1", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
                          <label style={{ fontWeight: 600, fontSize: "0.9rem" }}>📱 Phone Verification</label>
                          {phoneVerified ? (
                            <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", flexWrap: "wrap" }}>
                              <span style={{ color: "#2ecc71", fontSize: "0.85rem" }}>✓ Verified: {phoneNumber}</span>
                              <button type="button" className="btn-secondary" style={{ fontSize: "0.8rem", padding: "0.25rem 0.6rem" }} onClick={onUnlinkPhone}>Unlink</button>
                            </div>
                          ) : (
                            <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem", maxWidth: 360 }}>
                              <input
                                type="tel"
                                placeholder="+1 555 000 0000"
                                value={phoneNumber}
                                onChange={(e) => setPhoneNumber(e.target.value)}
                                disabled={phoneSent}
                                style={{ fontSize: "0.9rem" }}
                              />
                              {phoneSent && (
                                <input
                                  type="text"
                                  placeholder="Enter 6-digit code"
                                  value={phoneCode}
                                  onChange={(e) => setPhoneCode(e.target.value)}
                                  maxLength={6}
                                  style={{ fontSize: "0.9rem", letterSpacing: 4 }}
                                />
                              )}
                              <div style={{ display: "flex", gap: "0.5rem" }}>
                                {!phoneSent ? (
                                  <button type="button" className="btn-primary" style={{ fontSize: "0.85rem" }} onClick={onSendPhoneCode} disabled={!phoneNumber.trim()}>
                                    Send Code
                                  </button>
                                ) : (
                                  <>
                                    <button type="button" className="btn-primary" style={{ fontSize: "0.85rem" }} onClick={onVerifyPhone} disabled={phoneCode.length < 4}>
                                      Verify
                                    </button>
                                    <button type="button" className="btn-secondary" style={{ fontSize: "0.85rem" }} onClick={() => { setPhoneSent(false); setPhoneCode(""); setPhoneMsg(""); }}>
                                      Cancel
                                    </button>
                                  </>
                                )}
                              </div>
                              {phoneMsg && <span style={{ fontSize: "0.82rem", color: phoneMsg.startsWith("✓") ? "#2ecc71" : "#e74c3c" }}>{phoneMsg}</span>}
                            </div>
                          )}
                        </div>
                        <textarea value={form.lookingFor} onChange={(e) => onField("lookingFor", e.target.value)} placeholder="What I am looking for" rows={3} />
                        <select value={form.polyPreference} onChange={(e) => onField("polyPreference", e.target.value)} style={{ marginTop: "0.25rem" }}>
                          <option value="">Relationship style (optional)</option>
                          {POLY_PREFERENCE_OPTIONS.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    )}
                    {editTab === "prompts" && (
                      <div className="prompts-editor">
                        <p className="muted" style={{ fontSize: "0.85rem", marginBottom: "0.75rem" }}>
                          Add up to 5 prompts to spark conversations. Shown on your public profile.
                        </p>
                        {(form.profilePrompts || []).map((p, idx) => (
                          <div key={idx} className="prompt-edit-row">
                            <select
                              value={p.q}
                              onChange={(e) => {
                                const next = [...(form.profilePrompts || [])];
                                next[idx] = { ...next[idx], q: e.target.value };
                                onField("profilePrompts", next);
                              }}
                            >
                              <option value="">-- Pick a question --</option>
                              {PROMPT_QUESTIONS.map((q) => (
                                <option key={q} value={q}>{q}</option>
                              ))}
                            </select>
                            <input
                              value={p.a}
                              onChange={(e) => {
                                const next = [...(form.profilePrompts || [])];
                                next[idx] = { ...next[idx], a: e.target.value };
                                onField("profilePrompts", next);
                              }}
                              placeholder="Your answer..."
                            />
                            <button
                              className="btn-icon"
                              onClick={() => {
                                const next = (form.profilePrompts || []).filter((_, i) => i !== idx);
                                onField("profilePrompts", next);
                              }}
                              title="Remove prompt"
                            >✕</button>
                          </div>
                        ))}
                        {(form.profilePrompts || []).length < 5 && (
                          <button
                            className="btn-secondary"
                            style={{ fontSize: "0.85rem", marginTop: "0.5rem" }}
                            onClick={() => {
                              const next = [...(form.profilePrompts || []), { q: "", a: "" }];
                              onField("profilePrompts", next);
                            }}
                          >+ Add Prompt</button>
                        )}
                      </div>
                    )}
                    {editTab === "vibe" && (
                      <div className="profile-edit-grid">
                        <select value={form.profileTheme} onChange={(e) => onField("profileTheme", e.target.value)}>
                          {THEME_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <select value={form.profileGraphic} onChange={(e) => onField("profileGraphic", e.target.value)}>
                          {GRAPHIC_OPTIONS.map((opt) => (
                            <option key={opt.value} value={opt.value}>{opt.label}</option>
                          ))}
                        </select>
                        <input value={form.musicUrl} onChange={(e) => onField("musicUrl", e.target.value)} placeholder="Music URL (mp3/stream link)" />
                        <input value={form.profileMotto} onChange={(e) => onField("profileMotto", e.target.value)} placeholder="Profile motto" />
                        <input value={form.dreamDate} onChange={(e) => onField("dreamDate", e.target.value)} placeholder="Ideal date idea" />
                      </div>
                    )}
                    {editTab === "media" && (
                      <div className="profile-edit-grid">
                        <input value={form.avatar} onChange={(e) => onField("avatar", e.target.value)} placeholder="Avatar image URL" />
                        <label className="upload" style={{ gridColumn: "1 / -1" }}>
                          Upload Photos or Videos
                          <input
                            type="file"
                            accept="image/*,video/*"
                            onChange={onUpload}
                            disabled={uploading}
                          />
                        </label>
                        <div className="media-order-list" style={{ gridColumn: "1 / -1" }}>
                          {mediaDraft.map((m, idx) => (
                            <div
                              key={m.id}
                              className="media-order-item"
                              draggable
                              onDragStart={() => setDragMediaId(m.id)}
                              onDragOver={(e) => e.preventDefault()}
                              onDrop={() => onMediaDrop(m.id)}
                            >
                              <img src={toAssetUrl(m.url)} alt="media thumbnail" />
                              <div className="media-item-controls">
                                <button
                                  className="btn-icon"
                                  aria-label="Move media up"
                                  onClick={() => onMoveMedia(m.id, "up")}
                                  disabled={idx === 0 || savingMedia}
                                  title="Move up (keyboard accessible)"
                                >
                                  ?
                                </button>
                                <button
                                  className="btn-icon"
                                  aria-label="Move media down"
                                  onClick={() => onMoveMedia(m.id, "down")}
                                  disabled={idx === mediaDraft.length - 1 || savingMedia}
                                  title="Move down (keyboard accessible)"
                                >
                                  ?
                                </button>
                              </div>
                              <span className="muted">Drag to reorder or use arrow buttons</span>
                            </div>
                          ))}
                        </div>
                        <p className="muted" style={{ gridColumn: "1 / -1", fontSize: "0.85rem" }}>
                          Drag to reorder or use arrow buttons. Order auto-saves on change.
                          {savingMedia ? " Saving..." : ""}
                        </p>
                      </div>
                    )}
                    {editTab === "visibility" && (
                      <div className="profile-edit-grid" style={{ gridTemplateColumns: "1fr" }}>
                        <p className="muted" style={{ fontSize: "0.85rem", margin: "0 0 0.5rem" }}>
                          Choose which fields other members can see on your profile. Toggling a field off hides it from everyone except you.
                        </p>
                        {[
                          { key: "sexualOrientation", label: "Sexual Orientation" },
                          { key: "genderIdentity",    label: "Gender Identity" },
                          { key: "pronouns",          label: "Pronouns" },
                          { key: "polyPreference",    label: "Relationship Style" },
                          { key: "age",               label: "Age" },
                          { key: "city",              label: "City / Location" },
                          { key: "lookingFor",        label: "What I'm Looking For" },
                          { key: "bio",               label: "About Me" },
                          { key: "interests",         label: "Interests" },
                          { key: "profilePrompts",    label: "Profile Prompts" },
                        ].map(({ key, label }) => {
                          const hidden = !!(form.profileVisibility || {})[key];
                          return (
                            <label key={key} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "0.5rem 0.75rem", background: hidden ? "#1a1215" : "#0f1a0f", border: `1px solid ${hidden ? "#c0392b44" : "#2a4a2a"}`, borderRadius: 8, cursor: "pointer", userSelect: "none" }}>
                              <span style={{ fontSize: "0.9rem" }}>{label}</span>
                              <span style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                                <span style={{ fontSize: "0.8rem", color: hidden ? "#e74c3c" : "#2ecc71" }}>
                                  {hidden ? "Hidden" : "Visible"}
                                </span>
                                <input
                                  type="checkbox"
                                  checked={!hidden}
                                  onChange={(e) => {
                                    const next = { ...(form.profileVisibility || {}) };
                                    if (e.target.checked) delete next[key];
                                    else next[key] = true;
                                    onField("profileVisibility", next);
                                  }}
                                  style={{ width: 18, height: 18, cursor: "pointer", accentColor: "#2ecc71" }}
                                />
                              </span>
                            </label>
                          );
                        })}
                      </div>
                    )}
                  </>
                )}
                <div className="profile-actions" style={{ marginTop: "0.8rem" }}>
                  <button className="btn-primary" onClick={onSaveProfile} disabled={saving || !form}>
                    {saving ? "Saving..." : "Save Profile"}
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={() => onCancelTab(editTab)}
                    disabled={!tabDirty[editTab]}
                  >
                    Cancel Tab Changes
                  </button>
                  <button
                    className="btn-secondary"
                    type="button"
                    onClick={onRevertAll}
                    disabled={!anyDirty}
                  >
                    Revert All Changes
                  </button>
                  <span className="muted">Theme + graphics let you personalize your profile vibe.</span>
                </div>
                {anyDirty && (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>Unsaved changes across profile tabs.</p>
                )}
                {tabDirty[editTab] && (
                  <p className="muted" style={{ fontSize: "0.85rem" }}>Unsaved changes in {editTab}.</p>
                )}
                {formError && <p className="error">{formError}</p>}
                {saveMsg && <p className="success">{saveMsg}</p>}
              </article>
            </>
          )}

          {previewProfile.media?.length > 0 && (
            <MediaCarousel items={previewProfile.media} />
          )}

          {(isMatch || showOwnerEditor) && <MessagePanel activeProfile={previewProfile} />}
          {!isOwn && !isMatch && (
            <div className="open-chat-prompt">
              <p className="muted">Start a conversation with {previewProfile.name}</p>
              <button className="btn-accent" onClick={() => navigate(`/chat?roomId=${id}`)}>
                💬 Open Chat
              </button>
            </div>
          )}
        </>
      ) : (
        <p>Initializing editor...</p>
      )}

      {showReport && (
        <div className="block-report-overlay" onClick={() => setShowReport(false)}>
          <div className="block-report-modal" onClick={(e) => e.stopPropagation()}>
            <h3>Report User</h3>
            {reportSent ? (
              <p className="success">✅ Report submitted. Thank you for helping keep the community safe.</p>
            ) : (
              <>
                <select value={reportReason} onChange={(e) => setReportReason(e.target.value)}>
                  <option value="">-- Select a reason --</option>
                  {REPORT_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                </select>
                <textarea
                  rows={3}
                  placeholder="Additional details (optional)"
                  value={reportDetails}
                  onChange={(e) => setReportDetails(e.target.value)}
                />
                <div style={{ display: "flex", gap: "0.75rem", marginTop: "0.5rem" }}>
                  <button className="btn-primary" onClick={onReport} disabled={!reportReason}>Submit Report</button>
                  <button className="btn-secondary" onClick={() => setShowReport(false)}>Cancel</button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </section>
  );
};
