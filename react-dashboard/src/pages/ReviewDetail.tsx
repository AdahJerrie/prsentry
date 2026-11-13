import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { fetchPRDetail, fetchReviewDetail } from "../api/client";
import Badge from "../components/Badge";
import FindingInspectorCard from "../components/FindingInspectorCard";
import RiskMeter from "../components/RiskMeter";
import { useAuth } from "../context/AuthContext";
import { SEED_PR_DETAILS } from "../data/institutionalSeeds";
import type { PRDetail, PRFinding } from "../types/api";

export default function ReviewDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { userSimulatedPRs } = useAuth();

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

    // Check simulated PRs and institutional seed PRs first
    const localMatch =
      userSimulatedPRs.find((item) => item.id === id) ??
      SEED_PR_DETAILS.find((item) => item.id === id);

    if (localMatch) {
      setPr(localMatch);
      setSelectedRunId(localMatch.latest_review_id);
      setActiveFindings(localMatch.findings);
      setActiveSummary(localMatch.summary);
      setActiveRisk(localMatch.risk_score);
      setActiveRec(localMatch.merge_recommendation);
      setActiveSha(localMatch.head_sha);
      setLoading(false);
      setError(null);
      return;
    }

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
  }, [id, userSimulatedPRs]);

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

    const localRun = pr.review_runs.find((r) => r.id === runId);
    setSwitchingRun(true);
    try {
      const reviewRun = await fetchReviewDetail(runId);
      setActiveFindings(reviewRun.findings);
      setActiveSummary(reviewRun.summary);
      setActiveRisk(reviewRun.risk_score);
      setActiveRec(reviewRun.merge_recommendation);
      setActiveSha(reviewRun.head_sha);
    } catch {
      if (localRun) {
        setActiveSummary(localRun.summary);
        setActiveRisk(localRun.risk_score);
        setActiveRec(localRun.merge_recommendation);
        setActiveSha(localRun.head_sha);
      }
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
        <div className="h-8 w-48 animate-pulse rounded bg-[#141820]" />
        <div className="h-40 animate-pulse rounded-lg studio-panel" />
        <div className="h-64 animate-pulse rounded-lg studio-panel" />
      </div>
    );
  }

  if (error || !pr) {
    return (
      <div className="space-y-4">
        <Link to="/dashboard" className="font-mono text-xs text-[#7C8AFF] hover:underline">
          ← Back to PR Workspace
        </Link>
        <div className="rounded-lg border border-[#F87171]/40 bg-[#F87171]/10 p-6 font-mono text-xs text-[#F87171]">
          {error ?? "Pull request not found."}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/dashboard"
          className="font-mono text-xs text-text-secondary hover:text-[#7C8AFF] transition-colors"
        >
          ← Back to PR Workspace
        </Link>

        {pr.review_runs.length > 1 && (
          <div className="flex items-center gap-2 font-mono text-xs">
            <label htmlFor="run-select" className="text-text-muted">
              Review Run History ({pr.review_runs.length}):
            </label>
            <select
              id="run-select"
              value={selectedRunId}
              onChange={(e) => void handleSelectRun(e.target.value)}
              className="rounded border border-white/[0.1] bg-[#141820] px-2.5 py-1.5 font-mono text-xs text-text-primary"
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
      <section className="studio-panel rounded-lg p-6 space-y-4">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="space-y-1.5">
            <div className="flex flex-wrap items-center gap-2 font-mono text-xs text-text-secondary">
              <span className="font-semibold text-[#7C8AFF]">{pr.repo_full_name}</span>
              <span>•</span>
              <span>PR #{pr.pr_number}</span>
              <Badge variant={pr.pr_status}>{pr.pr_status}</Badge>
              {activeSha && (
                <span className="rounded bg-[#0E1116] px-2 py-0.5 font-mono text-text-muted border border-white/[0.08]">
                  {activeSha.slice(0, 12)}
                </span>
              )}
            </div>
            <h1 className="font-mono text-xl sm:text-2xl font-bold text-text-primary">
              {pr.title || `Pull Request #${pr.pr_number}`}
            </h1>
            <p className="font-mono text-xs text-text-muted">
              Opened by <span className="text-text-secondary font-medium">@{pr.author}</span> •{" "}
              {new Date(pr.created_at).toLocaleString()}
            </p>
          </div>

          <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
            <Badge variant={activeRec} className="text-xs px-3 py-1">
              Recommendation: {activeRec.toUpperCase()}
            </Badge>
            <RiskMeter score={activeRisk} />
          </div>
        </div>

        <div className="rounded-md border border-white/[0.08] bg-[#0E1116] p-4">
          <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-text-muted mb-1.5">
            AI Executive Summary
          </p>
          <p className="text-[15px] leading-[1.75] text-text-primary">
            {switchingRun ? "Loading selected review run..." : activeSummary}
          </p>
        </div>
      </section>

      {/* Findings Section */}
      <section className="space-y-4">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <h2 className="font-mono text-base font-semibold">
            Line-Level Findings ({visibleFindings.length}
            {visibleFindings.length !== activeFindings.length ? ` of ${activeFindings.length}` : ""})
          </h2>

          <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
            <select
              value={severityFilter}
              onChange={(e) => setSeverityFilter(e.target.value)}
              aria-label="Filter findings by severity"
              className="rounded border border-white/[0.1] bg-[#141820] px-3 py-1.5 text-xs text-text-primary"
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
              className="rounded border border-white/[0.1] bg-[#141820] px-3 py-1.5 text-xs text-text-primary"
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
          <div className="studio-panel rounded-lg p-8 text-center font-mono text-xs text-text-secondary">
            {activeFindings.length === 0
              ? "No issues were flagged in this review run."
              : "No findings match the selected severity/category filters."}
          </div>
        ) : (
          <div className="space-y-3">
            {visibleFindings.map((finding) => (
              <FindingInspectorCard
                key={finding.id}
                finding={finding}
                prId={pr.id}
                repoFullName={pr.repo_full_name}
                prNumber={pr.pr_number}
              />
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
