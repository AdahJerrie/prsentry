import { useState } from "react";
import { Link } from "react-router-dom";
import { fetchPRFindings } from "../api/client";
import type { PRFinding, PRSummary } from "../types/api";
import Badge from "./Badge";
import RiskMeter from "./RiskMeter";

interface ExpandablePRCardProps {
  pr: PRSummary;
}

const RECOMMENDATION_LABELS: Record<string, string> = {
  safe: "Safe to Merge",
  caution: "Merge with Caution",
  block: "Block Merge",
};

export default function ExpandablePRCard({ pr }: ExpandablePRCardProps) {
  const [expanded, setExpanded] = useState(false);
  const [findings, setFindings] = useState<PRFinding[] | null>(null);
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [findingsError, setFindingsError] = useState<string | null>(null);

  async function handleToggleExpand() {
    const next = !expanded;
    setExpanded(next);

    if (next && findings === null && pr.review_status === "completed" && pr.findings_count > 0) {
      setLoadingFindings(true);
      setFindingsError(null);
      try {
        const result = await fetchPRFindings(pr.id);
        setFindings(result);
      } catch (err) {
        setFindingsError(err instanceof Error ? err.message : "Failed to load findings");
      } finally {
        setLoadingFindings(false);
      }
    }
  }

  const shortSha = pr.head_sha ? pr.head_sha.slice(0, 7) : "—";
  const formattedTime = new Date(pr.created_at).toLocaleString();

  return (
    <article className="rounded-xl border border-border bg-bg-secondary transition-colors hover:border-border/90 overflow-hidden">
      <div className="p-4 sm:p-5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0 flex-1 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2 text-xs text-text-secondary">
            <span className="font-mono font-medium text-accent">{pr.repo_full_name}</span>
            <span>•</span>
            <span className="font-mono">#{pr.pr_number}</span>
            <span>•</span>
            <Badge variant={pr.pr_status}>{pr.pr_status}</Badge>
            <span className="font-mono text-text-muted">commit {shortSha}</span>
          </div>

          <div className="flex items-baseline gap-2">
            <Link
              to={`/prs/${pr.id}`}
              className="text-base font-semibold text-text-primary hover:text-accent transition-colors truncate"
            >
              {pr.title || `Pull Request #${pr.pr_number}`}
            </Link>
          </div>

          <p className="text-xs text-text-muted">
            Authored by <span className="text-text-secondary font-medium">{pr.author}</span> • Reviewed{" "}
            {formattedTime}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 sm:justify-end">
          <RiskMeter score={pr.risk_score} compact />

          <Badge variant={pr.merge_recommendation}>
            {RECOMMENDATION_LABELS[pr.merge_recommendation] ?? pr.merge_recommendation}
          </Badge>

          <div className="flex items-center gap-1.5 text-xs text-text-secondary">
            <span className="rounded-md bg-bg-tertiary px-2 py-1 border border-border font-mono">
              {pr.findings_count} {pr.findings_count === 1 ? "finding" : "findings"}
            </span>
            {pr.high_severity_count > 0 && (
              <Badge variant="high">{pr.high_severity_count} high</Badge>
            )}
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleToggleExpand}
              className="rounded-lg border border-border bg-bg-tertiary px-2.5 py-1.5 text-xs font-medium text-text-secondary hover:text-text-primary transition-colors cursor-pointer"
            >
              {expanded ? "Hide Preview" : "Quick Preview"}
            </button>
            <Link
              to={`/prs/${pr.id}`}
              className="rounded-lg bg-accent/15 border border-accent/35 px-3 py-1.5 text-xs font-medium text-accent hover:bg-accent/25 transition-colors"
            >
              Full Report →
            </Link>
          </div>
        </div>
      </div>

      {expanded && (
        <div className="border-t border-border bg-bg-primary/60 p-4 sm:p-5 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold uppercase tracking-wider text-text-muted">
              AI Review Summary
            </span>
            <Badge variant={pr.review_status}>{pr.review_status}</Badge>
          </div>
          <p className="text-sm text-text-secondary leading-relaxed">{pr.summary}</p>

          {loadingFindings && (
            <p className="text-xs text-text-muted animate-pulse">Loading findings from Go API...</p>
          )}
          {findingsError && (
            <p className="text-xs text-danger">Failed to load findings: {findingsError}</p>
          )}

          {pr.findings_count === 0 && pr.review_status === "completed" && (
            <p className="text-xs text-success">
              Clean diff — zero security, bug, or maintainability issues flagged.
            </p>
          )}

          {findings && findings.length > 0 && (
            <div className="space-y-2 pt-1">
              {findings.map((finding) => (
                <div
                  key={finding.id}
                  className="rounded-lg border border-border bg-bg-secondary p-3 flex flex-col sm:flex-row sm:items-start gap-2.5 text-sm"
                >
                  <div className="flex items-center gap-1.5 shrink-0">
                    <Badge variant={finding.severity}>{finding.severity.toUpperCase()}</Badge>
                    <Badge variant={finding.category}>{finding.category}</Badge>
                  </div>
                  <div className="min-w-0 flex-1 space-y-1">
                    <p className="font-mono text-xs text-accent break-all">
                      {finding.file_path}:{finding.line_number}
                    </p>
                    <p className="text-text-primary text-sm">{finding.message}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </article>
  );
}
