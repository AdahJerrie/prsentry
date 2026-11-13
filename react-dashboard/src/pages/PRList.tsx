import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchDashboardStats, fetchPRs } from "../api/client";
import ExpandablePRCard from "../components/ExpandablePRCard";
import type {
  DashboardStats,
  MergeRecommendation,
  PRListFilterStatus,
  PRSummary,
} from "../types/api";

export default function PRList() {
  const [prs, setPrs] = useState<PRSummary[]>([]);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [repoFilter, setRepoFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState<PRListFilterStatus | "">("");
  const [recFilter, setRecFilter] = useState<MergeRecommendation | "">("");
  const [searchQuery, setSearchQuery] = useState("");

  const hasActiveFilters = Boolean(
    repoFilter || statusFilter || recFilter || searchQuery.trim()
  );

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    setError(null);
    try {
      const [prList, statsPayload] = await Promise.all([
        fetchPRs(
          {
            repo: repoFilter || undefined,
            status: statusFilter || undefined,
            recommendation: recFilter || undefined,
            limit: 50,
          },
          signal
        ),
        fetchDashboardStats(signal),
      ]);
      setPrs(prList);
      setStats(statsPayload);
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      setError(err instanceof Error ? err.message : "Unable to load pull request reviews");
    } finally {
      setLoading(false);
    }
  }, [repoFilter, statusFilter, recFilter]);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  const filteredPRs = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return prs;
    return prs.filter(
      (pr) =>
        pr.title.toLowerCase().includes(q) ||
        pr.repo_full_name.toLowerCase().includes(q) ||
        pr.author.toLowerCase().includes(q) ||
        pr.head_sha.toLowerCase().includes(q) ||
        `#${pr.pr_number}`.includes(q)
    );
  }, [prs, searchQuery]);

  function handleClearFilters() {
    setRepoFilter("");
    setStatusFilter("");
    setRecFilter("");
    setSearchQuery("");
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">Pull Request Reviews</h1>
          <p className="text-sm text-text-secondary">
            Automated bug, security, performance, and maintainability reviews triggered by GitHub webhooks.
          </p>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => void loadData()}
          className="self-start sm:self-auto rounded-lg border border-border bg-bg-secondary px-3.5 py-2 text-xs font-medium text-text-primary hover:bg-bg-tertiary disabled:opacity-60 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
        >
          {loading ? "Refreshing..." : "Refresh"}
        </button>
      </div>

      {/* KPI Summary Strip */}
      {stats && (
        <section aria-label="Review overview metrics" className="grid grid-cols-1 gap-3 min-[460px]:grid-cols-2 lg:grid-cols-4">
          <div className="rounded-xl border border-border bg-bg-secondary p-4">
            <p className="text-xs font-medium text-text-muted">Analyzed PRs</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">{stats.total_prs}</p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {stats.total_reviews} total review runs
            </p>
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary p-4">
            <p className="text-xs font-medium text-text-muted">Avg Risk Score</p>
            <p className="mt-1 text-2xl font-bold tabular-nums">
              {stats.average_risk_score.toFixed(2)}
              <span className="text-sm font-normal text-text-muted"> / 5.0</span>
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">Across latest PR runs</p>
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary p-4">
            <p className="text-xs font-medium text-text-muted">Blocked PRs</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-danger">
              {stats.recommendations.block ?? 0}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {stats.recommendations.caution ?? 0} caution • {stats.recommendations.safe ?? 0} safe
            </p>
          </div>

          <div className="rounded-xl border border-border bg-bg-secondary p-4">
            <p className="text-xs font-medium text-text-muted">High-Severity Issues</p>
            <p className="mt-1 text-2xl font-bold tabular-nums text-severity-high-text">
              {stats.severities.high ?? 0}
            </p>
            <p className="mt-0.5 text-xs text-text-secondary">
              {stats.total_findings} active findings total
            </p>
          </div>
        </section>
      )}

      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-bg-secondary p-4 sm:grid-cols-2 lg:grid-cols-4">
        <input
          type="search"
          aria-label="Search pull requests by title, PR number, author, or commit SHA"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search title, #PR, author, SHA..."
          className="rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-accent focus:outline-none"
        />

        <select
          value={repoFilter}
          onChange={(e) => setRepoFilter(e.target.value)}
          aria-label="Filter by repository"
          className="rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Repositories</option>
          {(stats?.repositories ?? []).map((repo) => (
            <option key={repo} value={repo}>
              {repo}
            </option>
          ))}
        </select>

        <select
          value={recFilter}
          onChange={(e) => setRecFilter(e.target.value as MergeRecommendation | "")}
          aria-label="Filter by merge recommendation"
          className="rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Recommendations</option>
          <option value="block">Block Merge</option>
          <option value="caution">Merge with Caution</option>
          <option value="safe">Safe to Merge</option>
        </select>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as PRListFilterStatus | "")}
          aria-label="Filter by status"
          className="rounded-lg border border-border bg-bg-primary px-3 py-2 text-sm text-text-primary focus:border-accent focus:outline-none"
        >
          <option value="">All Statuses</option>
          <option value="open">PR Open</option>
          <option value="merged">PR Merged</option>
          <option value="closed">PR Closed</option>
          <option value="completed">Review Completed</option>
          <option value="failed">Review Failed</option>
        </select>
      </div>

      {/* Main Content States */}
      {loading && (
        <div role="status" aria-busy="true" aria-label="Loading pull requests" className="space-y-3">
          {[1, 2, 3].map((n) => (
            <div
              key={n}
              className="h-24 animate-pulse rounded-xl border border-border bg-bg-secondary"
            />
          ))}
        </div>
      )}

      {!loading && error && (
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6 text-sm space-y-3">
          <div>
            <p className="font-semibold text-danger">Could not reach PRSentry Go Backend</p>
            <p className="mt-1 text-text-secondary">{error}</p>
            <p className="mt-1.5 text-xs text-text-muted">
              Verify the Go server is listening on port 8080 and PostgreSQL migrations are applied.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            className="rounded-lg border border-danger/40 bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      )}

      {!loading && !error && filteredPRs.length === 0 && (
        <div className="rounded-xl border border-border bg-bg-secondary p-10 text-center space-y-3">
          <p className="text-base font-medium text-text-primary">No Pull Request Reviews Found</p>
          <p className="text-sm text-text-secondary max-w-lg mx-auto">
            {!hasActiveFilters
              ? "Once your GitHub App sends a pull_request webhook (opened, synchronize, or reopened) to POST /webhook, PRSentry's AI review will appear here automatically."
              : "No pull requests match your active search or filter criteria."}
          </p>
          {hasActiveFilters && (
            <button
              type="button"
              onClick={handleClearFilters}
              className="rounded-lg border border-border bg-bg-tertiary px-3.5 py-1.5 text-xs font-medium text-accent hover:bg-bg-primary transition-colors cursor-pointer"
            >
              Clear All Filters
            </button>
          )}
        </div>
      )}

      {!loading && !error && filteredPRs.length > 0 && (
        <div className="space-y-3">
          {filteredPRs.map((pr) => (
            <ExpandablePRCard key={pr.id} pr={pr} />
          ))}
        </div>
      )}
    </div>
  );
}
