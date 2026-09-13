import { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { clearStoredSession, getStoredRefreshToken, revokeStaffRefreshRemote } from "../api";
import { clearActiveTicketSession } from "../staffTicketSession";

export function useStaffLogout() {
  const navigate = useNavigate();

  return useCallback(async () => {
    const refresh = getStoredRefreshToken();
    if (refresh) await revokeStaffRefreshRemote(refresh);
    clearActiveTicketSession();
    clearStoredSession();
    navigate("/login");
  }, [navigate]);
}
