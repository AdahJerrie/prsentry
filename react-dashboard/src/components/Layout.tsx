import { useEffect, useState } from "react";
import { NavLink, Outlet } from "react-router-dom";
import { checkApiHealth } from "../api/client";

export default function Layout() {
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    let mounted = true;

    checkApiHealth(controller.signal).then((ok) => {
      if (mounted) setApiHealthy(ok);
    });

    return () => {
      mounted = false;
      controller.abort();
    };
  }, []);

  return (
    <div className="min-h-screen bg-bg-primary text-text-primary flex flex-col">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-accent focus:px-3 focus:py-2 focus:text-xs focus:font-semibold focus:text-bg-primary"
      >
        Skip to main content
      </a>

      <header className="sticky top-0 z-20 border-b border-border bg-bg-secondary/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-between gap-x-4 gap-y-2.5 px-4 py-3.5 sm:px-6">
          <div className="flex flex-wrap items-center gap-4 sm:gap-6">
            <NavLink
              to="/"
              className="flex items-center gap-2.5 group rounded-md focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
            >
              <div
                aria-hidden="true"
                className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent/15 border border-accent/35 text-accent font-bold text-sm"
              >
                PS
              </div>
              <div>
                <span className="text-base font-semibold tracking-tight text-text-primary group-hover:text-accent transition-colors">
                  PRSentry
                </span>
                <span className="hidden md:inline-block ml-2 text-xs text-text-muted">
                  AI Pull Request Security &amp; Code Review
                </span>
              </div>
            </NavLink>

            <nav aria-label="Primary" className="flex items-center gap-1 text-sm">
              <NavLink
                to="/"
                end
                className={({ isActive }) =>
                  `rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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
                  `rounded-md px-3 py-1.5 font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${
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

          <div
            role="status"
            aria-live="polite"
            className="flex items-center gap-2 text-xs text-text-secondary"
          >
            <span
              aria-hidden="true"
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

      <main id="main-content" className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-8">
        <Outlet />
      </main>
    </div>
  );
}
