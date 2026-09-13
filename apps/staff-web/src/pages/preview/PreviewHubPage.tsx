import { Link } from "react-router-dom";

export function PreviewHubPage() {
  return (
    <div className="qgo-preview-hub">
      <div className="qgo-preview-hub__card">
        <img src="/qgo-wordmark.png" alt="QGo" className="qgo-preview-hub__logo" />
        <h1>UI Preview</h1>
        <p className="qgo-muted">
          Browse staff and manager screens with mock data. No login, no database, or API required.
        </p>
        <div className="qgo-preview-hub__links">
          <Link to="/preview/staff" className="qgo-preview-hub__link">
            <strong>Teller workspace</strong>
            <span>Counter deck · call next · queue list</span>
          </Link>
          <Link to="/preview/staff-serving" className="qgo-preview-hub__link">
            <strong>Teller — serving customer</strong>
            <span>Active ticket A014 on screen</span>
          </Link>
          <Link to="/preview/manager?tab=analytics" className="qgo-preview-hub__link">
            <strong>Manager — analytics (with data)</strong>
            <span>Ticket-to-call, hybrid channel, counter utilization</span>
          </Link>
          <Link to="/preview/manager?tab=dashboard" className="qgo-preview-hub__link">
            <strong>Manager — dashboard</strong>
            <span>Live overview · alerts · counters</span>
          </Link>
        </div>
        <p className="qgo-preview-hub__hint">
          Run locally: <code>cd apps/staff-web && npm run dev</code> then open{" "}
          <code>http://localhost:5173/preview</code>
        </p>
        <Link to="/login" className="qgo-link">
          Go to real login →
        </Link>
      </div>
    </div>
  );
}
