type Props = {
  ticket: string;
  servingActive: boolean;
  serviceName: string;
  waitingCount: number;
  busy: boolean;
  canCallNext: boolean;
  onCallNext: () => void;
  onComplete: () => void;
  onNoShow: () => void;
  onStart: () => void;
};

export function CurrentCustomerPanel({
  ticket,
  servingActive,
  serviceName,
  waitingCount,
  busy,
  canCallNext,
  onCallNext,
  onComplete,
  onNoShow,
  onStart,
}: Props) {
  const hasTicket = Boolean(ticket);

  return (
    <div className="panel current-customer-panel">
      <div className="panel-header-indigo">
        <h2>Current customer</h2>
        {hasTicket && servingActive ? (
          <span className="current-customer-panel__badge">
            <span className="current-customer-panel__badge-dot" />
            Serving
          </span>
        ) : null}
      </div>

      {hasTicket ? (
        <div className={`staff-ticket-card${servingActive ? " staff-ticket-card--serving" : " staff-ticket-card--called"}`}>
          <p className="staff-ticket-card__label">Current ticket</p>
          <p className="staff-ticket-card__number">{ticket}</p>
          <p className="staff-ticket-card__service">{serviceName}</p>
          <div className="staff-ticket-card__hint">
            {servingActive ? (
              <>
                <span className="staff-ticket-card__hint-icon staff-ticket-card__hint-icon--ok" aria-hidden>
                  ✓
                </span>
                <span>Tap complete when the visit is finished.</span>
              </>
            ) : (
              <>
                <span className="staff-ticket-card__hint-icon staff-ticket-card__hint-icon--warn" aria-hidden>
                  !
                </span>
                <span>Customer called — start service when they arrive at the counter.</span>
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="current-body">
          <div className="dash-empty-customer">
            <div className="dash-empty-icon-wrap">
              <span className="dash-empty-icon" aria-hidden>
                👤
              </span>
            </div>
            <div className="ticket-placeholder-title">No customer being served</div>
            <div className="ticket-placeholder-sub">
              {waitingCount} customer{waitingCount === 1 ? "" : "s"} waiting in your queue
            </div>
          </div>
        </div>
      )}

      {!hasTicket ? (
        <div className="call-next-below-card">
          <button
            type="button"
            className="btn-call-next btn-call-next--below"
            disabled={busy || !canCallNext}
            onClick={() => void onCallNext()}
          >
            Call next customer
          </button>
        </div>
      ) : (
        <div className="current-actions current-actions--stack">
          <button
            type="button"
            className="btn-complete btn-complete--full"
            disabled={busy || !servingActive}
            onClick={() => void onComplete()}
          >
            Complete service
          </button>
          <div className="current-actions-row">
            <button type="button" className="btn-skip btn-skip--subtle" disabled={busy} onClick={() => void onNoShow()}>
              No-show
            </button>
            {!servingActive ? (
              <button type="button" className="btn-start-inline" disabled={busy} onClick={() => void onStart()}>
                Start service
              </button>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}
