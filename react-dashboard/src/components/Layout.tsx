import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";

export default function Layout() {
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

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <header className="sticky top-0 z-20 border-b border-border bg-bg-secondary/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-6">
            <NavLink to="/" className="flex items-center gap-2.5 group">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 border border-accent/35 text-accent font-bold text-sm">
                PS
              </div>
              <div>
                <span className="text-base font-semibold tracking-tight text-text-primary group-hover:text-accent transition-colors">
                  PRSentry
                </span>
                <span className="hidden sm:inline-block ml-2 text-xs text-text-muted">
                  AI Pull Request Security &amp; Code Review
                </span>
              </div>
            </NavLink>

            <nav className="flex items-center gap-1 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 font-medium transition-colors ${
                    isActive
                      ? "bg-bg-tertiary text-text-primary border border-border"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60"
                  }`
                }
              >
                Pull Requests
              </NavLink>
              <NavLink
                to="/stats"
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 font-medium transition-colors ${
                    isActive
                      ? "bg-bg-tertiary text-text-primary border border-border"
                      : "text-text-secondary hover:text-text-primary hover:bg-bg-tertiary/60"
                  }`
                }
              >
                Analytics &amp; Trends
              </NavLink>
            </nav>
          </div>

          <div className="flex items-center gap-2 text-xs text-text-secondary">
            <span
              className={`h-2 w-2 rounded-full ${
                apiHealthy === null
                  ? "bg-text-muted"
                  : apiHealthy
                    ? "bg-success"
                    : "bg-danger"
              }`}
            />
            <span>
              {apiHealthy === null
                ? "Checking API..."
                : apiHealthy
                  ? "Go API Connected"
                  : "Go API Unreachable"}
            </span>
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">
        <Outlet />
      </main>
    </div>
  );
}
