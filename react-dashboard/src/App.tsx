import { BrowserRouter, Navigate, Outlet, Route, Routes } from "react-router-dom";
import { AuthProvider, useAuth } from "./context/AuthContext";
import AuthGate from "./pages/AuthGate";
import LandingPage from "./pages/LandingPage";
import StatsTrends from "./pages/StatsTrends";
import Workspace from "./pages/Workspace";

function RequireAuth() {
  const { user, isLocked } = useAuth();
  if (!user || isLocked) return <Navigate to="/auth" replace />;
  return <Outlet />;
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<LandingPage />} />
          <Route path="/auth" element={<AuthGate />} />
          <Route element={<RequireAuth />}>
            <Route path="/dashboard" element={<Workspace />} />
            <Route path="/prs/:id" element={<Workspace />} />
            <Route path="/stats" element={<StatsTrends />} />
          </Route>
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
