import { useState } from "react";
import { Link } from "react-router-dom";
import type { ServiceDto } from "../api";
import { useToast } from "../context/ToastContext";
import { apiStaffWalkIn } from "../walkInApi";
import "../styles/walk-in.css";

/** Staff issues a walk-in ticket for a customer (no QR token, no rate limit). */
export function StaffWalkInIssue({ branchId, services }: { branchId: string; services: ServiceDto[] }) {
  const { toast } = useToast();
  const [svc, setSvc] = useState("");
  const [busy, setBusy] = useState(false);
  const [last, setLast] = useState<string | null>(null);
  const selected = svc || services[0]?.id || "";

  const issue = async () => {
    if (!branchId || !selected) return;
    setBusy(true);
    try {
      const r = await apiStaffWalkIn(branchId, selected);
      setLast(r.ticketNumber);
      toast(`Issued walk-in ticket ${r.ticketNumber}`, "success");
    } catch (e) {
      toast(e instanceof Error ? e.message : "Failed to issue ticket", "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="wi-staff-issue">
      <select value={selected} onChange={(e) => setSvc(e.target.value)} aria-label="Walk-in service">
        {services.map((s) => (
          <option key={s.id} value={s.id}>{s.name}</option>
        ))}
      </select>
      <button type="button" className="qgo-btn-secondary qgo-btn-sm" disabled={busy || !selected} onClick={() => void issue()}>
        {busy ? "Issuing…" : "Issue walk-in ticket"}
      </button>
      {last ? <span className="qgo-muted">Last: <b>{last}</b></span> : null}
      <Link to="/walk-in-qr" className="qgo-muted" style={{ marginLeft: "auto" }}>Walk-in QR</Link>
    </div>
  );
}
