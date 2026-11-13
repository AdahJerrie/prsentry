import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import Layout from "./components/Layout";
import PRList from "./pages/PRList";
import ReviewDetailPage from "./pages/ReviewDetail";
import StatsTrends from "./pages/StatsTrends";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route element={<Layout />}>
          <Route path="/" element={<PRList />} />
          <Route path="/prs/:id" element={<ReviewDetailPage />} />
          <Route path="/stats" element={<StatsTrends />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}
