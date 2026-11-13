import { useEffect, useState } from "react";
import { Navigate, NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext";

export default function Layout() {
  const { user, isLocked, lockSession, logout } = useAuth();
  const navigate = useNavigate();
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    let active = true;
    const rawBase = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api/v1";
    const healthUrl = rawBase.startsWith("http")
      ? `${new URL(rawBase).origin}/health`
      : "/health";

    fetch(healthUrl)
      .then((res) => {
        if (active) setApiHealthy(res.ok);
      })
      .catch(() => {
        if (active) setApiHealthy(false);
      });

    return () => {
      active = false;
    };
  }, []);

  // Gate protected routes behind AuthGate
  if (!user || isLocked) {
    return <Navigate to="/auth" replace />;
  }

  const initials = user.username.slice(0, 2).toUpperCase();

  function handleLock() {
    lockSession();
    navigate("/auth");
  }

  function handleLogout() {
    logout();
    navigate("/");
  }

  return (
    <div className="studio-canvas min-h-screen text-text-primary flex flex-col relative">
      <div className="studio-noise-overlay" aria-hidden="true" />

      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0E1116]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-3 sm:px-6">
          {/* Left: Brand Wordmark + Navigation */}
          <div className="flex items-center gap-5">
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-md bg-[#141820] border border-white/[0.12] font-mono text-sm font-bold text-[#FFB224]">
                ◈
              </div>
              <div className="flex items-center gap-2">
                <span className="font-mono text-base font-semibold tracking-tight text-text-primary group-hover:text-[#7C8AFF] transition-colors">
                  PRSentry
                </span>
                <span className="rounded border border-white/[0.1] bg-[#141820] px-1.5 py-0.5 font-mono text-[10px] text-text-muted">
                  v1.0-beta
                </span>
              </div>
            </NavLink>

            <nav className="flex items-center gap-1 font-mono text-xs">
              <NavLink
                to="/dashboard"
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 font-medium transition-colors ${
                    isActive
                      ? "bg-[#1B202B] text-text-primary border border-white/[0.1]"
                      : "text-text-secondary hover:text-text-primary hover:bg-[#141820]"
                  }`
                }
              >
                PR Workspace
              </NavLink>
              <NavLink
                to="/stats"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 font-medium transition-colors ${
                    isActive
                      ? "bg-[#1B202B] text-text-primary border border-white/[0.1]"
                      : "text-text-secondary hover:text-text-primary hover:bg-[#141820]"
                  }`
                }
              >
                Analytics &amp; Trends
              </NavLink>
            </nav>
          </div>

          {/* Right: Security Guarantees, API Health, Active User Pill, Lock & Log Out */}
          <div className="flex flex-wrap items-center gap-2.5">
            {/* Webhook Integrity Indicator */}
            <div className="hidden xl:flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#141820] px-2.5 py-1 font-mono text-[11px] text-text-secondary">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
              <span>HMAC-SHA256 · Zero-Retention LLM</span>
            </div>

            {/* Go API Health Indicator */}
            <div className="hidden md:flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#141820] px-2.5 py-1 font-mono text-[11px] text-text-secondary">
              <span
                className={`h-1.5 w-1.5 rounded-full ${
                  apiHealthy === null
                    ? "bg-text-muted"
                    : apiHealthy
                      ? "bg-[#34D399]"
                      : "bg-[#FFB224]"
                }`}
              />
              <span>
                {apiHealthy === null
                  ? "Checking API..."
                  : apiHealthy
                    ? "Go API Live"
                    : "Institutional Seed Mode"}
              </span>
            </div>

            {/* Active User Pill */}
            <div className="flex items-center gap-2 rounded-md border border-white/[0.1] bg-[#141820] px-2.5 py-1 font-mono text-xs">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-[#7C8AFF]/20 text-[10px] font-bold text-[#7C8AFF]">
                {initials}
              </span>
              <span className="text-text-primary">@{user.username}</span>
              <span
                className={`rounded px-1.5 py-0.2 text-[10px] font-semibold ${
                  user.provider === "GitHub"
                    ? "bg-[#34D399]/15 text-[#34D399]"
                    : "bg-[#FFB224]/15 text-[#FFB224]"
                }`}
              >
                {user.provider}
              </span>
            </div>

            {/* Manual Lock Session Action */}
            <button
              type="button"
              onClick={handleLock}
              title="Lock session on shared lab workstation"
              className="rounded-md border border-white/[0.1] bg-[#141820] px-2.5 py-1 font-mono text-xs text-text-secondary hover:text-[#FFB224] hover:border-[#FFB224]/40 transition-colors cursor-pointer"
            >
              Lock Session
            </button>

            {/* Log Out Button */}
            <button
              type="button"
              onClick={handleLogout}
              className="rounded-md border border-[#F87171]/35 bg-[#F87171]/12 px-2.5 py-1 font-mono text-xs font-medium text-[#F87171] hover:bg-[#F87171]/20 transition-colors cursor-pointer"
            >
              Log Out
            </button>
          </div>
        </div>
      </header>

      <main className="relative z-10 mx-auto w-full max-w-7xl flex-1 px-4 py-6 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
