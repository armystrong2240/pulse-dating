import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api } from "../api/client";

export const VerifyEmailPage = () => {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [status, setStatus] = useState("checking"); // checking | success | error

  useEffect(() => {
    const token = params.get("token");
    if (!token) { setStatus("error"); return; }
    api.get(`/auth/verify-email?token=${encodeURIComponent(token)}`)
      .then(() => { setStatus("success"); setTimeout(() => navigate("/"), 3000); })
      .catch(() => setStatus("error"));
  }, [params, navigate]);

  return (
    <section className="page" style={{ textAlign: "center", paddingTop: "4rem" }}>
      {status === "checking" && <p className="muted">Verifying your email…</p>}
      {status === "success" && (
        <>
          <h2>✅ Email verified!</h2>
          <p className="muted">Redirecting you to the app…</p>
        </>
      )}
      {status === "error" && (
        <>
          <h2>❌ Verification failed</h2>
          <p className="muted">The link may have expired or already been used.</p>
        </>
      )}
    </section>
  );
};
