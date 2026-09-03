import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiGet, apiSend, ApiError } from "../api";
import { useAuth } from "../auth/AuthContext";

interface LoginOption {
  id: string;
  name: string;
  role: string;
}

export default function Login() {
  const { user, login, sessionNotice, clearSessionNotice } = useAuth();
  const navigate = useNavigate();
  const [options, setOptions] = useState<LoginOption[]>([]);
  const [userId, setUserId] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [resetMessage, setResetMessage] = useState<string | null>(null);

  useEffect(() => {
    apiGet("/auth/login-options").then(setOptions).catch(() => setOptions([]));
  }, []);

  useEffect(() => {
    if (user) navigate("/");
  }, [user, navigate]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setResetMessage(null);
    if (!userId || !password) {
      setError("Select your name and enter your password");
      return;
    }
    setSubmitting(true);
    try {
      await login(userId, password);
      navigate("/");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Login failed");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleForgotPassword() {
    setError(null);
    setResetMessage(null);
    if (!userId) {
      setError("Select your name first, then click Forgot password");
      return;
    }
    try {
      const res = await apiSend("POST", "/auth/request-password-reset", { userId });
      setResetMessage(res.message);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Could not send request");
    }
  }

  return (
    <div className="login-page">
      <form className="login-card" onSubmit={handleSubmit}>
        <div className="login-header">
          <img
            src="/logo.png"
            alt="Juaben Senior High School crest"
            className="login-logo"
            onError={(e) => {
              (e.target as HTMLImageElement).style.display = "none";
            }}
          />
          <h1>JUASS Tablets Share</h1>
          <p className="subtitle">Juaben Senior High School — Tablet Distribution System</p>
        </div>

        {sessionNotice && (
          <p className="warn-text">
            {sessionNotice}{" "}
            <button type="button" className="btn-link" onClick={clearSessionNotice}>
              Dismiss
            </button>
          </p>
        )}

        <div className="field">
          <label>Your Name</label>
          <select value={userId} onChange={(e) => setUserId(e.target.value)} required>
            <option value="">Select your name…</option>
            {options.map((o) => (
              <option key={o.id} value={o.id}>
                {o.name} ({o.role.replace("_", " ").toLowerCase()})
              </option>
            ))}
          </select>
        </div>

        <div className="field">
          <label>Password</label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            autoComplete="current-password"
          />
        </div>

        {error && <p className="error-text">{error}</p>}
        {resetMessage && <p className="success-text">{resetMessage}</p>}

        <button type="submit" className="btn-primary" disabled={submitting}>
          {submitting ? "Logging in…" : "Log In"}
        </button>
        <button type="button" className="btn-link" onClick={handleForgotPassword}>
          Forgot password?
        </button>
      </form>
    </div>
  );
}
