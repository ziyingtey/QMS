import { useState } from "react";
import type { FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { apiLogin, setStoredEmail, setStoredRole, setStoredToken } from "../api";

export function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("staff@qms.demo");
  const [password, setPassword] = useState("Demo123!");
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
          <strong>Branch manager</strong> — use <code>manager@qms.demo</code> / <code>Demo123!</code>. After sign-in you’ll land on{" "}
          <strong>Branch operations</strong> (<code>/manager</code>) to open, break, or close counters.
        </p>
        <p className="login-hint muted-small">
          Counter staff: <code>staff@qms.demo</code> / <code>Demo123!</code>
        </p>
        <form className="login-form" onSubmit={(e) => void onSubmit(e)}>
          <label>
            Email
            <input value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="username" />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </label>
          {error ? <p className="error">{error}</p> : null}
          <button type="submit" className="btn-primary-lg" disabled={busy}>
            {busy ? "Signing in…" : "Sign in"}
          </button>
        </form>
      </div>
    </div>
  );
}
