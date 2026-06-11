import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogin, setStoredBranchId, setStoredEmail, setStoredRefreshToken, setStoredRole, setStoredToken } from "../api";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    if (!email.trim()) {
      setError("Enter your email address.");
      setBusy(false);
      return;
    }
    if (!password) {
      setError("Enter your password.");
      setBusy(false);
      return;
    }
    try {
      const res = await apiLogin(email.trim(), password);
      if (res.role !== "Staff" && res.role !== "Manager") {
        setError("Use a staff or manager account.");
        return;
      }
      setStoredToken(res.token);
      if (res.refreshToken) setStoredRefreshToken(res.refreshToken);
      setStoredRole(res.role);
      setStoredEmail(res.email);
      if (res.branchId) setStoredBranchId(res.branchId);
      navigate(res.role === "Manager" ? "/manager" : "/");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="login-page-v2">
      {/* Left panel - brand */}
      <div className="lp-left">
        <div className="lp-left-inner">
          <div className="lp-wordmark-wrap">
            <img className="lp-wordmark" src="/qgo-wordmark.png" alt="QGo" width={200} height={48} />
          </div>
          <h1 className="lp-headline">Queue Management<br />Made Simple</h1>
          <p className="lp-tagline">
            Manage branches, assign counters, and serve customers with real-time queue tracking.
          </p>
          <div className="lp-features">
            <div className="lp-feature">
              <span className="lp-feature-icon">⚡</span>
              <span>Real-time queue updates</span>
            </div>
            <div className="lp-feature">
              <span className="lp-feature-icon">📊</span>
              <span>Live dashboard analytics</span>
            </div>
            <div className="lp-feature">
              <span className="lp-feature-icon">🏢</span>
              <span>Multi-branch support</span>
            </div>
          </div>
        </div>
      </div>

      {/* Right panel - form */}
      <div className="lp-right">
        <div className="lp-form-wrap">
          <h2 className="lp-form-title">Welcome back</h2>
          <p className="lp-form-sub">Sign in to your staff account</p>

          <form className="lp-form" onSubmit={(e) => void onSubmit(e)}>
            <div className="lp-field">
              <label className="lp-label" htmlFor="lp-email">Email</label>
              <div className={`lp-input-wrap${error ? " lp-input-invalid" : ""}`}>
                <svg className="lp-input-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path d="M2.003 5.884L10 9.882l7.997-3.998A2 2 0 0016 4H4a2 2 0 00-1.997 1.884z" />
                  <path d="M18 8.118l-8 4-8-4V14a2 2 0 002 2h12a2 2 0 002-2V8.118z" />
                </svg>
                <input
                  id="lp-email"
                  type="email"
                  value={email}
                  onChange={(e) => {
                    setEmail(e.target.value);
                    setError(null);
                  }}
                  autoComplete="username"
                  placeholder="you@company.com"
                />
              </div>
            </div>

            <div className="lp-field">
              <label className="lp-label" htmlFor="lp-pass">Password</label>
              <div className={`lp-input-wrap${error ? " lp-input-invalid" : ""}`}>
                <svg className="lp-input-icon" viewBox="0 0 20 20" fill="currentColor" width="18" height="18">
                  <path fillRule="evenodd" d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z" clipRule="evenodd" />
                </svg>
                <input
                  id="lp-pass"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  autoComplete="current-password"
                  placeholder="Enter your password"
                />
                <button
                  type="button"
                  className="lp-eye-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex={-1}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            {error ? (
              <div className="lp-error" role="alert" aria-live="polite">
                {error}
              </div>
            ) : null}

            <button type="submit" className="lp-submit" disabled={busy}>
              {busy ? "Signing in…" : "Sign in"}
            </button>
          </form>

          <p className="lp-demo-hint">
            Demo credentials: <code>staff.teller@local.test</code> / <code>Passw0rd!</code>
          </p>
        </div>
      </div>
    </div>
  );
}
