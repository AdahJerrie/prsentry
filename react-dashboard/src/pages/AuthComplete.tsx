import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchGitHubSession } from "../api/client";
import { useAuth } from "../context/AuthContext";

export default function AuthComplete() {
  const navigate = useNavigate();
  const { adoptGitHubSession } = useAuth();
  const [message, setMessage] = useState("Finishing GitHub sign-in…");

  useEffect(() => {
    const controller = new AbortController();
    fetchGitHubSession(controller.signal)
      .then((session) => {
        if (!session) {
          navigate("/auth?error=session", { replace: true });
          return;
        }
        adoptGitHubSession(session.login, session.name);
        navigate("/dashboard", { replace: true });
      })
      .catch(() => {
        setMessage("GitHub sign-in could not be finished.");
        window.setTimeout(() => navigate("/auth?error=session", { replace: true }), 1200);
      });
    return () => controller.abort();
  }, [adoptGitHubSession, navigate]);

  return (
    <div className="grid min-h-screen place-items-center bg-[#0E1116] font-mono text-sm text-[#9AA0A8]">
      {message}
    </div>
  );
}
