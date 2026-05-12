import type { ReactNode } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { getStoredRole, getStoredToken } from "./api";
import { LoginPage } from "./pages/LoginPage";
import { ManagerCountersPage } from "./pages/ManagerCountersPage";
import { StaffDeckPage } from "./pages/StaffDeckPage";

function RequireAuth({ children }: { children: ReactNode }) {
  return getStoredToken() ? children : <Navigate to="/login" replace />;
}

function RequireManager({ children }: { children: ReactNode }) {
  if (!getStoredToken()) return <Navigate to="/login" replace />;
  if (getStoredRole() !== "Manager") return <Navigate to="/" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={<LoginPage />} />
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
  );
}
