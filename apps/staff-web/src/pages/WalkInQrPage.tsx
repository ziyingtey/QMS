import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { apiMyCounter, getStoredBranchId, getStoredRole } from "../api";
import { apiWalkInLink, type WalkInLink } from "../walkInApi";
import "../styles/walk-in.css";
import { formatMyDateTime } from "../malaysiaTime";

/** Branch display: shows today's walk-in QR. Token rotates at branch-local midnight; page re-fetches automatically. */
export function WalkInQrPage() {
  const [branchId, setBranchId] = useState<string>(() => getStoredBranchId() ?? "");
  const [link, setLink] = useState<WalkInLink | null>(null);
  const [error, setError] = useState<string | null>(null);
  const isManager = getStoredRole() === "Manager";

  useEffect(() => {
    if (branchId) return;
    apiMyCounter()
      .then((mc) => setBranchId(mc.branchId))
      .catch(() => setError("Could not determine your branch."));
  }, [branchId]);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      setLink(await apiWalkInLink(branchId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load QR");
    }
  }, [branchId]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const id = window.setInterval(() => void load(), 5 * 60 * 1000); // picks up the new token shortly after midnight
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);

  return (
    <div className="wi-page">
      <div className="wi-wrap" style={{ maxWidth: 560 }}>
        <div className="wi-brand">
          <h1>Walk-in QR</h1>
          <Link to={isManager ? "/manager" : "/"} className="wi-muted">← Back</Link>
        </div>
        <div className="wi-card wi-qr">
          {error ? <div className="wi-error">{error}</div> : null}
          {link ? (
            <>
              <h2 style={{ fontSize: 24 }}>Scan to get a queue ticket</h2>
              <div className="wi-qr__box">
                <QRCodeSVG value={link.qrUrl} size={320} level="M" />
              </div>
              <p className="wi-muted">
                Code <b>{link.token}</b> · valid for {link.branchLocalDate} (until {formatMyDateTime(link.validUntil)})
              </p>
              <a className="wi-qr__url" href={link.qrUrl} target="_blank" rel="noreferrer">{link.qrUrl}</a>
            </>
          ) : !error ? (
            <p className="wi-muted">Loading…</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}
