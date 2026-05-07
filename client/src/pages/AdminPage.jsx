import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../api/client";
import { useAuth } from "../context/AuthContext";

const TABS = ["Overview", "Users", "Reports", "Subscriptions", "Security"];

export default function AdminPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab, setTab] = useState("Overview");
  const [stats, setStats] = useState(null);
  const [users, setUsers] = useState([]);
  const [userTotal, setUserTotal] = useState(0);
  const [userPage, setUserPage] = useState(1);
  const [userSearch, setUserSearch] = useState("");
  const [reports, setReports] = useState([]);
  const [subscriptions, setSubscriptions] = useState(null);
  const [security, setSecurity] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [toast, setToast] = useState("");

  const showToast = (msg) => { setToast(msg); setTimeout(() => setToast(""), 3000); };

  useEffect(() => {
    loadTab(tab);
  }, [tab, userPage, userSearch]);

  const loadTab = async (t) => {
    setLoading(true);
    setError("");
    try {
      if (t === "Overview") {
        const { data } = await api.get("/admin/stats");
        setStats(data.stats);
      } else if (t === "Users") {
        const { data } = await api.get("/admin/users", {
          params: { page: userPage, limit: 20, search: userSearch },
        });
        setUsers(data.users);
        setUserTotal(data.total);
      } else if (t === "Reports") {
        const { data } = await api.get("/admin/reports");
        setReports(data.reports);
      } else if (t === "Subscriptions") {
        const { data } = await api.get("/admin/subscriptions");
        setSubscriptions(data);
      } else if (t === "Security") {
        const { data } = await api.get("/security-admin/summary?hours=24");
        setSecurity(data);
      }
    } catch (err) {
      if (err.response?.status === 403) {
        setError("Access denied — your account is not in the ADMIN_EMAILS list on the server.");
      } else {
        setError(err.response?.data?.error || "Failed to load data");
      }
    } finally {
      setLoading(false);
    }
  };

  const banUser = async (id, name) => {
    if (!confirm(`Ban ${name}? This will pause their account.`)) return;
    try {
      await api.post(`/admin/users/${id}/ban`);
      showToast(`${name} has been banned.`);
      loadTab("Users");
    } catch {
      showToast("Failed to ban user.");
    }
  };

  const verifyUser = async (id, name) => {
    try {
      await api.post(`/admin/users/${id}/verify`);
      showToast(`${name} verified.`);
      loadTab("Users");
    } catch {
      showToast("Failed to verify user.");
    }
  };

  const s = {
    page: {
      padding: "24px",
      maxWidth: 1100,
      margin: "0 auto",
      color: "#e0e8ff",
      fontFamily: "inherit",
    },
    header: {
      display: "flex",
      alignItems: "center",
      gap: 12,
      marginBottom: 24,
    },
    title: { fontSize: "1.5rem", fontWeight: 700, color: "#fff" },
    badge: {
      background: "linear-gradient(135deg, #9b59b6, #6c3483)",
      color: "#fff",
      padding: "2px 10px",
      borderRadius: 20,
      fontSize: "0.65rem",
      fontWeight: 700,
      letterSpacing: 1,
    },
    tabs: { display: "flex", gap: 8, marginBottom: 20, flexWrap: "wrap" },
    tab: (active) => ({
      padding: "7px 18px",
      borderRadius: 20,
      border: "1px solid",
      borderColor: active ? "#9b59b6" : "#334",
      background: active ? "rgba(155,89,182,0.2)" : "rgba(255,255,255,0.03)",
      color: active ? "#c89ef5" : "#88aacc",
      cursor: "pointer",
      fontSize: "0.8rem",
      fontWeight: active ? 600 : 400,
    }),
    card: {
      background: "rgba(255,255,255,0.04)",
      border: "1px solid rgba(255,255,255,0.08)",
      borderRadius: 12,
      padding: 20,
      marginBottom: 16,
    },
    statGrid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
      gap: 12,
      marginBottom: 16,
    },
    statBox: {
      background: "rgba(155,89,182,0.08)",
      border: "1px solid rgba(155,89,182,0.2)",
      borderRadius: 10,
      padding: "14px 16px",
      textAlign: "center",
    },
    statVal: { fontSize: "1.8rem", fontWeight: 700, color: "#c89ef5" },
    statLabel: { fontSize: "0.6rem", color: "#88aacc", marginTop: 2, letterSpacing: 1 },
    table: { width: "100%", borderCollapse: "collapse", fontSize: "0.75rem" },
    th: {
      textAlign: "left",
      padding: "8px 10px",
      color: "#88aacc",
      borderBottom: "1px solid rgba(255,255,255,0.07)",
      fontSize: "0.65rem",
      letterSpacing: 1,
    },
    td: {
      padding: "8px 10px",
      borderBottom: "1px solid rgba(255,255,255,0.04)",
      color: "#ccd6f0",
      verticalAlign: "middle",
    },
    btn: (color) => ({
      padding: "3px 10px",
      borderRadius: 6,
      border: "none",
      background: color,
      color: "#fff",
      cursor: "pointer",
      fontSize: "0.65rem",
      fontWeight: 600,
      marginRight: 4,
    }),
    searchBox: {
      padding: "8px 14px",
      borderRadius: 8,
      border: "1px solid rgba(255,255,255,0.12)",
      background: "rgba(255,255,255,0.04)",
      color: "#e0e8ff",
      fontSize: "0.8rem",
      width: 260,
      marginBottom: 14,
    },
    error: {
      background: "rgba(255,60,60,0.12)",
      border: "1px solid rgba(255,60,60,0.3)",
      borderRadius: 8,
      padding: "12px 16px",
      color: "#ff8888",
      marginBottom: 16,
      fontSize: "0.8rem",
    },
    toast: {
      position: "fixed",
      bottom: 24,
      right: 24,
      background: "#9b59b6",
      color: "#fff",
      padding: "10px 20px",
      borderRadius: 10,
      fontSize: "0.8rem",
      fontWeight: 600,
      zIndex: 9999,
      boxShadow: "0 4px 24px rgba(155,89,182,0.4)",
    },
    pagination: { display: "flex", gap: 8, marginTop: 12, alignItems: "center", fontSize: "0.75rem", color: "#88aacc" },
  };

  const tierColor = (tier) =>
    tier === "gold" ? "#f39c12" : tier === "plus" ? "#9b59b6" : "#556";

  return (
    <div style={s.page}>
      {toast && <div style={s.toast}>{toast}</div>}

      <div style={s.header}>
        <div style={s.title}>Admin Dashboard</div>
        <span style={s.badge}>ADMIN</span>
        <span style={{ marginLeft: "auto", fontSize: "0.7rem", color: "#556" }}>
          {user?.email}
        </span>
      </div>

      <div style={s.tabs}>
        {TABS.map((t) => (
          <button key={t} style={s.tab(tab === t)} onClick={() => { setTab(t); setUserPage(1); }}>
            {t}
          </button>
        ))}
      </div>

      {error && <div style={s.error}>⚠ {error}</div>}
      {loading && <div style={{ color: "#88aacc", marginBottom: 12 }}>Loading...</div>}

      {/* ── Overview ── */}
      {tab === "Overview" && stats && (
        <>
          <div style={s.card}>
            <div style={{ fontSize: "0.7rem", color: "#88aacc", marginBottom: 12, letterSpacing: 1 }}>USERS</div>
            <div style={s.statGrid}>
              {[
                ["Total", stats.users.total],
                ["Verified", stats.users.verified],
                ["Premium", stats.users.premium],
                ["New Today", stats.users.newToday],
                ["New This Week", stats.users.newThisWeek],
              ].map(([label, val]) => (
                <div key={label} style={s.statBox}>
                  <div style={s.statVal}>{val}</div>
                  <div style={s.statLabel}>{label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.card}>
            <div style={{ fontSize: "0.7rem", color: "#88aacc", marginBottom: 12, letterSpacing: 1 }}>ENGAGEMENT</div>
            <div style={s.statGrid}>
              {[
                ["Matches", stats.engagement.totalMatches],
                ["Messages", stats.engagement.totalMessages],
                ["Gifts Sent", stats.engagement.totalGifts],
                ["Referrals", stats.engagement.totalReferrals],
                ["Reports", stats.moderation.totalReports],
              ].map(([label, val]) => (
                <div key={label} style={s.statBox}>
                  <div style={s.statVal}>{val}</div>
                  <div style={s.statLabel}>{label.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>

          <div style={s.card}>
            <div style={{ fontSize: "0.7rem", color: "#88aacc", marginBottom: 12, letterSpacing: 1 }}>TIER BREAKDOWN</div>
            <div style={s.statGrid}>
              {Object.entries(stats.tierBreakdown || {}).map(([tier, count]) => (
                <div key={tier} style={{ ...s.statBox, borderColor: tierColor(tier) + "55" }}>
                  <div style={{ ...s.statVal, color: tierColor(tier) }}>{count}</div>
                  <div style={s.statLabel}>{tier.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>
        </>
      )}

      {/* ── Users ── */}
      {tab === "Users" && (
        <div style={s.card}>
          <input
            style={s.searchBox}
            placeholder="Search by name, email, city..."
            value={userSearch}
            onChange={(e) => { setUserSearch(e.target.value); setUserPage(1); }}
          />
          <table style={s.table}>
            <thead>
              <tr>
                {["Name", "Email", "Age / City", "Tier", "Verified", "Status", "Joined", "Actions"].map((h) => (
                  <th key={h} style={s.th}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id}>
                  <td style={s.td}>{u.name}</td>
                  <td style={{ ...s.td, color: "#88aacc" }}>{u.email}</td>
                  <td style={s.td}>{u.age} · {u.city}{u.state ? `, ${u.state}` : ""}</td>
                  <td style={{ ...s.td, color: tierColor(u.premiumTier || "free"), fontWeight: 600 }}>
                    {(u.premiumTier || "free").toUpperCase()}
                  </td>
                  <td style={{ ...s.td, color: u.emailVerified ? "#00ff88" : "#ff8888" }}>
                    {u.emailVerified ? "✓" : "✗"}
                  </td>
                  <td style={{ ...s.td, color: u.paused ? "#ff8888" : "#00ff88" }}>
                    {u.paused ? "BANNED" : "ACTIVE"}
                  </td>
                  <td style={{ ...s.td, color: "#556" }}>
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                  <td style={s.td}>
                    {!u.verified && (
                      <button style={s.btn("#1e7e34")} onClick={() => verifyUser(u.id, u.name)}>Verify</button>
                    )}
                    {!u.paused && (
                      <button style={s.btn("#c0392b")} onClick={() => banUser(u.id, u.name)}>Ban</button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={s.pagination}>
            <button style={s.btn("#334")} disabled={userPage === 1} onClick={() => setUserPage(p => p - 1)}>← Prev</button>
            <span>Page {userPage} · {userTotal} total</span>
            <button style={s.btn("#334")} disabled={userPage * 20 >= userTotal} onClick={() => setUserPage(p => p + 1)}>Next →</button>
          </div>
        </div>
      )}

      {/* ── Reports ── */}
      {tab === "Reports" && (
        <div style={s.card}>
          {reports.length === 0 ? (
            <div style={{ color: "#88aacc" }}>No reports found.</div>
          ) : (
            <table style={s.table}>
              <thead>
                <tr>
                  {["Reporter", "Reported User", "Reason", "Date"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {reports.map((r) => (
                  <tr key={r.id}>
                    <td style={s.td}>{r.reporter?.name} <span style={{ color: "#556" }}>({r.reporter?.email})</span></td>
                    <td style={s.td}>{r.reported?.name} <span style={{ color: "#556" }}>({r.reported?.email})</span></td>
                    <td style={{ ...s.td, color: "#ffaa00" }}>{r.reason}</td>
                    <td style={{ ...s.td, color: "#556" }}>{new Date(r.createdAt).toLocaleString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── Subscriptions ── */}
      {tab === "Subscriptions" && subscriptions && (
        <>
          <div style={s.card}>
            <div style={s.statGrid}>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, color: "#00ff88" }}>${subscriptions.mrr.toFixed(2)}</div>
                <div style={s.statLabel}>MRR</div>
              </div>
              <div style={s.statBox}>
                <div style={s.statVal}>{subscriptions.counts.active}</div>
                <div style={s.statLabel}>ACTIVE</div>
              </div>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, color: "#ff8888" }}>{subscriptions.counts.canceled}</div>
                <div style={s.statLabel}>CANCELED</div>
              </div>
              <div style={s.statBox}>
                <div style={{ ...s.statVal, color: "#ffaa00" }}>{subscriptions.counts.pastDue}</div>
                <div style={s.statLabel}>PAST DUE</div>
              </div>
            </div>
          </div>
          <div style={s.card}>
            <table style={s.table}>
              <thead>
                <tr>
                  {["User", "Email", "Tier", "Status", "Since"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {subscriptions.subscriptions.map((sub) => (
                  <tr key={sub.id}>
                    <td style={s.td}>{sub.user?.name}</td>
                    <td style={{ ...s.td, color: "#88aacc" }}>{sub.user?.email}</td>
                    <td style={{ ...s.td, color: tierColor(sub.tier), fontWeight: 600 }}>
                      {(sub.tier || "free").toUpperCase()}
                    </td>
                    <td style={{ ...s.td, color: sub.status === "active" ? "#00ff88" : "#ff8888" }}>
                      {sub.status?.toUpperCase()}
                    </td>
                    <td style={{ ...s.td, color: "#556" }}>{new Date(sub.createdAt).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {/* ── Security ── */}
      {tab === "Security" && security && (
        <>
          <div style={s.card}>
            <div style={{ fontSize: "0.7rem", color: "#88aacc", marginBottom: 12, letterSpacing: 1 }}>EVENTS (LAST 24H)</div>
            <div style={s.statGrid}>
              {Object.entries(security.summary?.bySeverity || {}).map(([sev, count]) => (
                <div key={sev} style={s.statBox}>
                  <div style={{ ...s.statVal, color: sev === "error" ? "#ff4444" : sev === "warn" ? "#ffaa00" : "#00ff88" }}>
                    {count}
                  </div>
                  <div style={s.statLabel}>{sev.toUpperCase()}</div>
                </div>
              ))}
            </div>
          </div>

          {security.summary?.topFailedLoginIps?.length > 0 && (
            <div style={s.card}>
              <div style={{ fontSize: "0.7rem", color: "#ff8888", marginBottom: 10, letterSpacing: 1 }}>⚠ TOP FAILED LOGIN IPs</div>
              <table style={s.table}>
                <thead><tr><th style={s.th}>IP</th><th style={s.th}>Failures</th></tr></thead>
                <tbody>
                  {security.summary.topFailedLoginIps.map(([ip, count]) => (
                    <tr key={ip}>
                      <td style={{ ...s.td, fontFamily: "monospace" }}>{ip}</td>
                      <td style={{ ...s.td, color: "#ff8888", fontWeight: 700 }}>{count}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div style={s.card}>
            <div style={{ fontSize: "0.7rem", color: "#88aacc", marginBottom: 10, letterSpacing: 1 }}>RECENT EVENTS</div>
            <table style={s.table}>
              <thead>
                <tr>
                  {["Time", "Type", "Severity", "IP", "Email"].map((h) => (
                    <th key={h} style={s.th}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(security.events || []).slice(0, 50).map((e) => (
                  <tr key={e.id}>
                    <td style={{ ...s.td, color: "#556", fontFamily: "monospace", fontSize: "0.65rem" }}>
                      {new Date(e.createdAt).toLocaleTimeString()}
                    </td>
                    <td style={{ ...s.td, fontFamily: "monospace", fontSize: "0.65rem" }}>{e.eventType}</td>
                    <td style={{ ...s.td, color: e.severity === "error" ? "#ff4444" : e.severity === "warn" ? "#ffaa00" : "#00ff88" }}>
                      {e.severity?.toUpperCase()}
                    </td>
                    <td style={{ ...s.td, color: "#88aacc", fontFamily: "monospace" }}>{e.ip || "—"}</td>
                    <td style={{ ...s.td, color: "#88aacc" }}>{e.email || "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
