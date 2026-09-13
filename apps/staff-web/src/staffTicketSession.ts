const KEY = "qms_staff_active_ticket";

export type ActiveTicketSession = {
  ticket: string;
  servingActive: boolean;
  branchId: string;
  serviceId: string;
};

export function readActiveTicketSession(): ActiveTicketSession | null {
  try {
    const raw = sessionStorage.getItem(KEY);
    if (!raw) return null;
    const o = JSON.parse(raw) as ActiveTicketSession;
    if (!o.ticket || !o.branchId) return null;
    return o;
  } catch {
    return null;
  }
}

export function writeActiveTicketSession(session: ActiveTicketSession | null): void {
  if (!session?.ticket) {
    sessionStorage.removeItem(KEY);
    return;
  }
  sessionStorage.setItem(KEY, JSON.stringify(session));
}

export function clearActiveTicketSession(): void {
  sessionStorage.removeItem(KEY);
}
