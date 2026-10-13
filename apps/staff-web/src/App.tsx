import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { ToastProvider } from "./context/ToastContext";
import { getStoredRefreshToken, getStoredRole, getStoredToken } from "./api";
import { LoginPage } from "./pages/LoginPage";
import { ManagerCountersPage } from "./pages/ManagerCountersPage";
import { PreviewHubPage } from "./pages/preview/PreviewHubPage";
import { PreviewManagerPage } from "./pages/preview/PreviewManagerPage";
import { PreviewStaffPage } from "./pages/preview/PreviewStaffPage";
import { StaffDeckPage } from "./pages/StaffDeckPage";
import { WalkInPublicPage } from "./pages/WalkInPublicPage";
import { WalkInQrPage } from "./pages/WalkInQrPage";

function RequireAuth({ children }: { children: ReactNode }) {
  return getStoredToken() || getStoredRefreshToken() ? children : <Navigate to="/login" replace />;
}

function RequireManager({ children }: { children: ReactNode }) {
  if (!getStoredToken() && !getStoredRefreshToken()) return <Navigate to="/login" replace />;
  if (getStoredRole() !== "Manager") return <Navigate to="/" replace />;
  return children;
}

function LoginRedirect() {
  if (!getStoredToken() && !getStoredRefreshToken()) return <LoginPage />;
  return <Navigate to={getStoredRole() === "Manager" ? "/manager" : "/"} replace />;
}

export default function App() {
  return (
    <ToastProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/preview" element={<PreviewHubPage />} />
          <Route path="/preview/staff" element={<PreviewStaffPage variant="idle" />} />
          <Route path="/preview/staff-serving" element={<PreviewStaffPage variant="serving" />} />
          <Route path="/preview/staff-unassigned" element={<PreviewStaffPage variant="not-assigned" />} />
          <Route path="/preview/manager" element={<PreviewManagerPage />} />
          <Route path="/login" element={<LoginRedirect />} />
          {/* Public: opened from the branch QR (no auth guard) */}
          <Route path="/walk-in" element={<WalkInPublicPage />} />
          <Route
            path="/walk-in-qr"
            element={
              <RequireAuth>
                <WalkInQrPage />
              </RequireAuth>
            }
          />
          <Route
            path="/"
            element={
              <RequireAuth>
                <StaffDeckPage />
              </RequireAuth>
            }
          />
          <Route
            path="/manager"
            element={
              <RequireManager>
                <ManagerCountersPage />
              </RequireManager>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </ToastProvider>
  );
}
