import { useState } from "react";
import { useNavigate } from "react-router-dom";
import api from "../api/client.js";

export default function CreatorSetupPage() {
  const navigate = useNavigate();
  const [price, setPrice] = useState("");
  const [bio, setBio] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    const p = Number(price);
    if (!p || p < 1) { setError("Monthly price must be at least $1."); return; }
    setLoading(true);
    try {
      await api.post("/creator/setup", { price: p, bio });
      navigate("/creator/dashboard");
    } catch (err) {
      setError(err.response?.data?.error || "Failed to enable creator mode.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{ maxWidth: 520, margin: "0 auto", padding: "2rem 1rem" }}>
      <h2 style={{ fontWeight: 700, fontSize: "1.6rem", marginBottom: ".25rem" }}>🎬 Become a Creator</h2>
      <p style={{ color: "#888", marginBottom: "1.5rem" }}>
        Share exclusive content with subscribers. Free to start — PulseDate keeps <strong>25%</strong>, you keep <strong>75%</strong>.
      </p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <label style={{ display: "flex", flexDirection: "column", gap: ".4rem", fontWeight: 600 }}>
          Monthly subscription price ($)
          <input
            type="number"
            min="1"
            max="500"
            step="0.01"
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            placeholder="e.g. 9.99"
            required
            style={{ padding: ".6rem .8rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem" }}
          />
        </label>
        <label style={{ display: "flex", flexDirection: "column", gap: ".4rem", fontWeight: 600 }}>
          Creator bio <span style={{ fontWeight: 400, color: "#888" }}>(optional)</span>
          <textarea
            value={bio}
            onChange={(e) => setBio(e.target.value)}
            maxLength={500}
            rows={4}
            placeholder="Tell fans what to expect..."
            style={{ padding: ".6rem .8rem", borderRadius: 8, border: "1px solid #ccc", fontSize: "1rem", resize: "vertical" }}
          />
        </label>
        {error && <p style={{ color: "red", margin: 0 }}>{error}</p>}
        <button
          type="submit"
          disabled={loading}
          style={{ background: "#7c3aed", color: "#fff", border: "none", borderRadius: 8, padding: ".75rem", fontSize: "1rem", fontWeight: 700, cursor: "pointer" }}
        >
          {loading ? "Setting up…" : "Enable Creator Mode"}
        </button>
      </form>
    </div>
  );
}
