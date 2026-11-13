import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import StatsTrends from "./pages/StatsTrends";
import Workspace from "./pages/Workspace";

export default function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Workspace />} />
        <Route path="/prs/:id" element={<Workspace />} />
        <Route path="/stats" element={<StatsTrends />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
