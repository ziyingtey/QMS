import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { QRCodeSVG } from "qrcode.react";
import { Copy, ExternalLink, Footprints, Info, Power, QrCode, RefreshCw, Smartphone, Ticket, Users } from "lucide-react";
import type { LiveDashboard } from "../api";
import type { WalkInLink } from "../walkInApi";
import { Badge, Card, EmptyBlock, PageHeader, Skeleton, StatCard } from "./ui";
import type { ManagerTab } from "./managerNav";
import { formatMyDateTime } from "../malaysiaTime";

type Props = {
  branchId: string;
  branchName?: string;
  live: LiveDashboard | null;
  /** Loads today's QR link (apiWalkInLink on the real page, a mock in preview). */
  loadLink: (branchId: string) => Promise<WalkInLink>;
  onCopied?: (ok: boolean) => void;
  onGoToTab?: (tab: ManagerTab) => void;
};

/** Walk-in QR: "What do customers scan today, and is it working?" */
export function ManagerWalkInQrTab({ branchId, branchName, live, loadLink, onCopied, onGoToTab }: Props) {
  const [link, setLink] = useState<WalkInLink | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!branchId) return;
    try {
      setLink(await loadLink(branchId));
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load QR");
    }
  }, [branchId, loadLink]);

  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    // The token rotates at branch-local midnight; refresh periodically to pick it up.
    const id = window.setInterval(() => void load(), 5 * 60 * 1000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(id);
    };
  }, [load]);

  const copy = async () => {
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link.qrUrl);
      onCopied?.(true);
    } catch {
      onCopied?.(false);
    }
  };

  const validUntil = link ? new Date(link.validUntil) : null;

  return (
    <>
      <PageHeader
        title="Walk-in QR"
        description="Scan to get a ticket"
        actions={
          <>
            <button type="button" className="m-btn m-btn--secondary" onClick={() => void load()}>
              <RefreshCw size={15} aria-hidden /> Refresh
            </button>
            <Link to="/walk-in-qr" target="_blank" rel="noreferrer" className="m-btn m-btn--primary">
              <ExternalLink size={15} aria-hidden /> Show full screen
            </Link>
          </>
        }
      />

      {live && live.activeCounters === 0 ? (
        <div className="m-callout m-callout--info" role="status">
          <Info size={16} aria-hidden />
          <span className="m-callout__text">
            <strong>No counters open.</strong> Tickets won't be called yet.
          </span>
          {onGoToTab ? (
            <button type="button" className="m-btn m-btn--primary m-btn--sm m-callout__action" onClick={() => onGoToTab("counters")}>
              <Power size={14} aria-hidden /> Open counter
            </button>
          ) : null}
        </div>
      ) : null}

      <div className="m-grid">
        <Card
          className="m-col-5"
          title="Today's code"
          description={branchName}
          action={link ? <Badge tone="success" dot>Active</Badge> : error ? <Badge tone="danger" dot>Unavailable</Badge> : undefined}
          footer={
            link ? (
              <span className="m-qr__foot">
                <span>Code <b className="tabular">{link.token}</b></span>
                <span>Until {validUntil ? formatMyDateTime(validUntil, { weekday: "short", hour: "numeric", minute: "2-digit" }) : "—"}</span>
              </span>
            ) : undefined
          }
        >
          {error ? (
            <EmptyBlock icon={QrCode} title="QR not available" body={error} action={<button type="button" className="m-btn m-btn--secondary m-btn--sm" onClick={() => void load()}>Try again</button>} />
          ) : link ? (
            <div className="m-qr">
              <div className="m-qr__box">
                <QRCodeSVG value={link.qrUrl} size={208} level="M" fgColor="#0f172a" />
              </div>
              <div className="m-qr__url">
                <span className="tabular" title={link.qrUrl}>{link.qrUrl}</span>
                <button type="button" className="m-btn m-btn--ghost m-btn--icon m-btn--sm" onClick={() => void copy()} aria-label="Copy link" title="Copy link">
                  <Copy size={14} aria-hidden />
                </button>
              </div>
            </div>
          ) : (
            <div className="m-qr">
              <Skeleton width={232} height={232} radius={12} />
              <Skeleton width="80%" height={14} />
            </div>
          )}
        </Card>

        <div className="m-col-7 m-stack m-stack--fill">
          <div className="m-stats m-stats--2">
            <StatCard label="Walk-ins today" icon={Footprints} value={live?.walkInsToday ?? "—"} empty={!live} context={!live ? "Loading…" : live.walkInsToday === 0 ? "None yet" : `${live.walkInsWaiting} waiting`} />
            <StatCard label="In branch" icon={Users} value={live?.customersInBranch ?? "—"} empty={!live} context={!live ? "Loading…" : live.customersInBranch === 0 ? "No one yet" : `${live.servingCount} serving`} />
          </div>
          <Card title="How it works">
            <ol className="m-steps">
              <li>
                <span className="m-steps__icon"><Smartphone size={16} aria-hidden /></span>
                <span><b>Scan</b><span>With the phone camera.</span></span>
              </li>
              <li>
                <span className="m-steps__icon"><Ticket size={16} aria-hidden /></span>
                <span><b>Pick a service</b><span>Get a ticket number.</span></span>
              </li>
              <li>
                <span className="m-steps__icon"><Users size={16} aria-hidden /></span>
                <span><b>Wait anywhere</b><span>The phone shows when to come.</span></span>
              </li>
              <li>
                <span className="m-steps__icon"><RefreshCw size={16} aria-hidden /></span>
                <span><b>New code daily</b><span>Changes at midnight.</span></span>
              </li>
            </ol>
          </Card>
        </div>
      </div>
    </>
  );
}
