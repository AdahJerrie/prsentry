import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import { AuthProvider } from "./context/AuthContext";
import AuthGate from "./pages/AuthGate";
import LandingPage from "./pages/LandingPage";
import PRList from "./pages/PRList";
import ReviewDetailPage from "./pages/ReviewDetail";
import StatsTrends from "./pages/StatsTrends";

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          {/* View A: Public Landing Page (Default Entry Route /) */}
          <Route path="/" element={<LandingPage />} />

          {/* View B: Institutional Authentication Gate (/auth) */}
          <Route path="/auth" element={<AuthGate />} />

          {/* View C: Protected PRSentry Dashboard & Analytics Routes */}
          <Route element={<Layout />}>
            <Route path="/dashboard" element={<PRList />} />
            <Route path="/prs/:id" element={<ReviewDetailPage />} />
            <Route path="/stats" element={<StatsTrends />} />
          </Route>

          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}
