import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogin, setStoredBranchId, setStoredEmail, setStoredRole, setStoredToken } from "../api";
import { API_BASE } from "../config";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await apiLogin(email.trim(), password);
      if (res.role !== "Staff" && res.role !== "Manager") {
        setError("Use a staff or manager account.");
        return;
      }
      setStoredToken(res.token);
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
    <div className="deck-page">
      <div className="login-card">
        <div className="brand-inline">
          <span className="brand-mark" />
          <span className="brand-text">IH-QMS</span>
        </div>
        <h1 className="login-title">IH-QMS · Staff</h1>
        <p className="login-hint">
          Sign in with a <strong>Staff</strong> or <strong>Manager</strong> account that exists in your database (insert via SQL or your admin process).
          Managers land on <strong>Branch operations</strong> (<code>/manager</code>) to assign tellers and lanes to counters, set Open/Break/Closed, and tune booking capacity.
        </p>
        <p className="login-hint muted-small">
          If you used <code>database/insert-staff-sample.sql</code>, try <code>staff.teller@local.test</code> or{" "}
          <code>staff.manager@local.test</code> with password <code>Passw0rd!</code> (zero, exclamation). You still need at
          least one row in <code>BRANCHES</code> before that script succeeds.
        </p>
        {import.meta.env.DEV ? (
          <p className="login-hint muted-small">
            Dev: API base is <code>{API_BASE}</code> — set <code>VITE_API_URL</code> in <code>.env.local</code> if wrong.
          </p>
        ) : null}
        <form className="login-form" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error ? (
            <p className="error login-error" role="alert">
              {error}
            </p>
          ) : null}
          <button type="submit" className="btn-primary-lg" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
