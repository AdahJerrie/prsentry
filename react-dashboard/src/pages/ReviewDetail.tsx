import { useCallback, useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPRDetail, fetchReviewDetail } from "../api/client";
import Badge from "../components/Badge";
import FindingItem from "../components/FindingItem";
import RiskMeter from "../components/RiskMeter";
import {
  RECOMMENDATION_LABELS,
  type Category,
  type MergeRecommendation,
  type PRDetail,
  type PRFinding,
  type Severity,
} from "../types/api";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [pr, setPr] = useState<PRDetail | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [activeFindings, setActiveFindings] = useState<PRFinding[]>([]);
  const [activeSummary, setActiveSummary] = useState("");
  const [activeRisk, setActiveRisk] = useState(1);
  const [activeRec, setActiveRec] = useState<MergeRecommendation>("safe");
  const [activeSha, setActiveSha] = useState("");

  const [severityFilter, setSeverityFilter] = useState<Severity | "">("");
  const [categoryFilter, setCategoryFilter] = useState<Category | "">("");

  const [loading, setLoading] = useState(true);
  const [switchingRun, setSwitchingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [runError, setRunError] = useState<string | null>(null);

  const loadDetail = useCallback(
    async (signal?: AbortSignal) => {
      if (!id) {
        setError("Missing pull request identifier.");
        setLoading(false);
        return;
      }
      setLoading(true);
      setError(null);
      setRunError(null);
      try {
        const detail = await fetchPRDetail(id, signal);
        setPr(detail);
        setSelectedRunId(detail.latest_review_id);
        setActiveFindings(detail.findings);
        setActiveSummary(detail.summary);
        setActiveRisk(detail.risk_score);
        setActiveRec(detail.merge_recommendation);
        setActiveSha(detail.head_sha);
      } catch (err) {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load PR review");
      } finally {
        setLoading(false);
      }
    },
    [id]
  );

  useEffect(() => {
    const controller = new AbortController();
    void loadDetail(controller.signal);
    return () => controller.abort();
  }, [loadDetail]);

  function restoreLatestRun(detail: PRDetail) {
    setSelectedRunId(detail.latest_review_id);
    setActiveFindings(detail.findings);
    setActiveSummary(detail.summary);
    setActiveRisk(detail.risk_score);
    setActiveRec(detail.merge_recommendation);
    setActiveSha(detail.head_sha);
    setRunError(null);
  }

  async function handleSelectRun(runId: string) {
    if (!pr || runId === selectedRunId) return;
    setRunError(null);

    if (runId === pr.latest_review_id) {
      restoreLatestRun(pr);
      return;
    }

    const previousRunId = selectedRunId;
    setSelectedRunId(runId);
    setSwitchingRun(true);
    try {
      const reviewRun = await fetchReviewDetail(runId);
      setActiveFindings(reviewRun.findings);
      setActiveSummary(reviewRun.summary);
      setActiveRisk(reviewRun.risk_score);
      setActiveRec(reviewRun.merge_recommendation);
      setActiveSha(reviewRun.head_sha);
    } catch (err) {
      setSelectedRunId(previousRunId);
      setRunError(
        err instanceof Error ? err.message : "Failed to load historical review run"
      );
    } finally {
      setSwitchingRun(false);
    }
  }

  const visibleFindings = useMemo(() => {
    return activeFindings.filter((f) => {
      if (severityFilter && f.severity !== severityFilter) return false;
      if (categoryFilter && f.category !== categoryFilter) return false;
      return true;
    });
  }, [activeFindings, severityFilter, categoryFilter]);

  if (loading) {
    return (
      <div role="status" aria-busy="true" aria-label="Loading pull request review" className="space-y-4">
        <div className="h-8 w-48 animate-pulse rounded bg-bg-secondary" />
        <div className="h-40 animate-pulse rounded-xl border border-border bg-bg-secondary" />
        <div className="h-64 animate-pulse rounded-xl border border-border bg-bg-secondary" />
      </div>
    );
  }

  if (error || !pr) {
    return (
      <div className="space-y-4">
        <Link to="/" className="text-sm text-accent hover:underline">
          ← Back to Pull Requests
        </Link>
        <div role="alert" className="rounded-xl border border-danger/40 bg-danger/10 p-6 text-sm space-y-3">
          <p className="text-danger font-medium">{error ?? "Pull request not found."}</p>
          <button
            type="button"
            onClick={() => void loadDetail()}
            className="rounded-lg border border-danger/40 bg-bg-secondary px-3 py-1.5 text-xs font-medium text-text-primary hover:bg-bg-tertiary transition-colors cursor-pointer"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Link
          to="/"
          className="text-sm text-text-secondary hover:text-accent transition-colors self-start"
        >
          ← Back to Pull Requests
        </Link>

        {pr.review_runs.length > 1 && (
          <div className="flex flex-wrap items-center gap-2 text-xs">
            <label htmlFor="run-select" className="text-text-muted">
              Review Run History ({pr.review_runs.length}):
            </label>
            <select
              id="run-select"
              disabled={switchingRun}
              value={selectedRunId}
              onChange={(e) => void handleSelectRun(e.target.value)}
              className="rounded-lg border border-border bg-bg-secondary px-2.5 py-1.5 text-xs font-mono text-text-primary focus:border-accent focus:outline-none disabled:opacity-60"
            >
              {pr.review_runs.map((run, idx) => (
                <option key={run.id} value={run.id}>
                  {idx === 0 ? "Latest" : `Run #${pr.review_runs.length - idx}`} •{" "}
                  {run.head_sha ? run.head_sha.slice(0, 7) : "no-sha"} •{" "}
                  {run.merge_recommendation.toUpperCase()} ({run.findings_count})
                </option>
              ))}
            </select>
          </div>
        )}
      </div>

      {runError && (
        <div
          role="alert"
          className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-danger/40 bg-danger/10 px-4 py-3 text-xs text-danger"
        >
          <span>Could not load historical review run: {runError}</span>
          <button
            type="button"
            onClick={() => restoreLatestRun(pr)}
            className="underline font-medium hover:text-text-primary cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* PR Header & Verdict Card */}
      <section className="rounded-xl border border-border bg-bg-secondary p-5 sm:p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="min-w-0 space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="font-mono font-semibold text-accent">{pr.repo_full_name}</span>
              <span aria-hidden="true">•</span>
              <span className="font-mono">PR #{pr.pr_number}</span>
              <Badge variant={pr.pr_status}>{pr.pr_status}</Badge>
              {activeSha && (
                <span className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-text-muted border border-border">
                  {activeSha.slice(0, 12)}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary break-words">
              {pr.title || `Pull Request #${pr.pr_number}`}
            </h1>
            <p className="text-xs text-text-muted">
              Opened by <span className="text-text-secondary font-medium">{pr.author}</span> •{" "}
              {new Date(pr.created_at).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <Badge variant={activeRec} className="text-sm px-3 py-1">
              {RECOMMENDATION_LABELS[activeRec]}
            </Badge>
            <RiskMeter score={activeRisk} />
          </div>
        </div>

        <div className="rounded-lg border border-border bg-bg-primary/70 p-4">
          <p className="text-xs font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            AI Executive Summary
          </p>
          <p className="text-sm text-text-primary leading-relaxed">
            {switchingRun ? "Loading selected review run..." : activeSummary}
          </p>
        </div>
      </section>

      {/* Findings Section */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="text-lg font-semibold">
            Line-Level Findings ({visibleFindings.length}
            {visibleFindings.length !== activeFindings.length ? ` of ${activeFindings.length}` : ""})
          </h2>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value as Severity | "")}
              aria-label="Filter findings by severity"
              className="rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as Category | "")}
              aria-label="Filter findings by category"
              className="rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-primary focus:border-accent focus:outline-none"
            >
              <option value="">All Categories</option>
              <option value="security">Security</option>
              <option value="bug">Bug</option>
              <option value="performance">Performance</option>
              <option value="maintainability">Maintainability</option>
              <option value="style">Style</option>
            </select>
          </div>
        </div>

        {visibleFindings.length === 0 ? (
          <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center space-y-3 text-sm text-text-secondary">
            <p>
              {activeFindings.length === 0
                ? "No issues were flagged in this review run."
                : "No findings match the selected severity/category filters."}
            </p>
            {(severityFilter || categoryFilter) && (
              <button
                type="button"
                onClick={() => {
                  setSeverityFilter("");
                  setCategoryFilter("");
                }}
                className="rounded-lg border border-border bg-bg-tertiary px-3 py-1.5 text-xs font-medium text-accent hover:bg-bg-primary transition-colors cursor-pointer"
              >
                Reset Finding Filters
              </button>
            )}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleFindings.map((finding) => (
              <FindingItem key={finding.id} finding={finding} />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
