import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPRDetail, fetchReviewDetail } from "../api/client";
import Badge from "../components/Badge";
import RiskMeter from "../components/RiskMeter";
import type { PRDetail, PRFinding } from "../types/api";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const [pr, setPr] = useState<PRDetail | null>(null);
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [activeFindings, setActiveFindings] = useState<PRFinding[]>([]);
  const [activeSummary, setActiveSummary] = useState("");
  const [activeRisk, setActiveRisk] = useState(1);
  const [activeRec, setActiveRec] = useState("safe");
  const [activeSha, setActiveSha] = useState("");

  const [severityFilter, setSeverityFilter] = useState("");
  const [categoryFilter, setCategoryFilter] = useState("");

  const [loading, setLoading] = useState(true);
  const [switchingRun, setSwitchingRun] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    const controller = new AbortController();
    setLoading(true);
    setError(null);

    fetchPRDetail(id, controller.signal)
      .then((detail) => {
        setPr(detail);
        setSelectedRunId(detail.latest_review_id);
        setActiveFindings(detail.findings);
        setActiveSummary(detail.summary);
        setActiveRisk(detail.risk_score);
        setActiveRec(detail.merge_recommendation);
        setActiveSha(detail.head_sha);
      })
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load PR review");
      })
      .finally(() => setLoading(false));

    return () => controller.abort();
  }, [id]);

  async function handleSelectRun(runId: string) {
    if (!pr || runId === selectedRunId) return;
    setSelectedRunId(runId);

    if (runId === pr.latest_review_id) {
      setActiveFindings(pr.findings);
      setActiveSummary(pr.summary);
      setActiveRisk(pr.risk_score);
      setActiveRec(pr.merge_recommendation);
      setActiveSha(pr.head_sha);
      return;
    }

    setSwitchingRun(true);
    try {
      const reviewRun = await fetchReviewDetail(runId);
      setActiveFindings(reviewRun.findings);
      setActiveSummary(reviewRun.summary);
      setActiveRisk(reviewRun.risk_score);
      setActiveRec(reviewRun.merge_recommendation);
      setActiveSha(reviewRun.head_sha);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load historical review run");
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
      <div className="space-y-4">
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
        <div className="rounded-xl border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
          {error ?? "Pull request not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Link to="/" className="text-sm text-text-secondary hover:text-accent transition-colors">
          ← Back to Pull Requests
        </Link>

        {pr.review_runs.length > 1 && (
          <div className="flex items-center gap-2 text-xs">
            <label htmlFor="run-select" className="text-text-muted">
              Review Run History ({pr.review_runs.length}):
            </label>
            <select
              id="run-select"
              value={selectedRunId}
              onChange={(e) => void handleSelectRun(e.target.value)}
              className="rounded-lg border border-border bg-bg-secondary px-2.5 py-1.5 text-xs font-mono text-text-primary"
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

      {/* PR Header & Verdict Card */}
      <section className="rounded-xl border border-border bg-bg-secondary p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
              <span className="font-mono font-semibold text-accent">{pr.repo_full_name}</span>
              <span>•</span>
              <span className="font-mono">PR #{pr.pr_number}</span>
              <Badge variant={pr.pr_status}>{pr.pr_status}</Badge>
              {activeSha && (
                <span className="rounded bg-bg-tertiary px-2 py-0.5 font-mono text-text-muted border border-border">
                  {activeSha.slice(0, 12)}
                </span>
              )}
            </div>
            <h1 className="text-xl sm:text-2xl font-bold text-text-primary">
              {pr.title || `Pull Request #${pr.pr_number}`}
            </h1>
            <p className="text-xs text-text-muted">
              Opened by <span className="text-text-secondary font-medium">{pr.author}</span> •{" "}
              {new Date(pr.created_at).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <Badge variant={activeRec} className="text-sm px-3 py-1">
              Recommendation: {activeRec.toUpperCase()}
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
              onChange={(e) => setSeverityFilter(e.target.value)}
              aria-label="Filter findings by severity"
              className="rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-primary"
            >
              <option value="">All Severities</option>
              <option value="high">High</option>
              <option value="medium">Medium</option>
              <option value="low">Low</option>
            </select>

            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              aria-label="Filter findings by category"
              className="rounded-lg border border-border bg-bg-secondary px-3 py-1.5 text-xs text-text-primary"
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
          <div className="rounded-xl border border-border bg-bg-secondary p-8 text-center text-sm text-text-secondary">
            {activeFindings.length === 0
              ? "No issues were flagged in this review run."
              : "No findings match the selected severity/category filters."}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleFindings.map((finding) => (
              <div
                key={finding.id}
                className="rounded-xl border border-border bg-bg-secondary p-4 sm:p-5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge variant={finding.severity}>{finding.severity.toUpperCase()}</Badge>
                    <Badge variant={finding.category}>{finding.category}</Badge>
                  </div>
                  <span className="rounded-md bg-bg-primary px-2.5 py-1 font-mono text-xs text-accent border border-border">
                    {finding.file_path}:{finding.line_number}
                  </span>
                </div>
                <p className="text-sm text-text-primary leading-relaxed">{finding.message}</p>
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
