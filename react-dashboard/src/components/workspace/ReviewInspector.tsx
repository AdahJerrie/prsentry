import type { BetaFeedbackEntry } from "../../lib/feedbackStore";
import type { Category, Severity } from "../../types/api";
import type { QueueItem, ReviewFinding } from "../../data/sampleReviews";
import FindingCard from "./FindingCard";
import VerdictPill from "./VerdictPill";

const SEVERITIES: Array<"all" | Severity> = ["all", "high", "medium", "low"];
const CATEGORIES: Array<"all" | Category> = [
  "all",
  "bug",
  "security",
  "performance",
  "style",
  "maintainability",
];

interface ReviewInspectorProps {
  item: QueueItem | null;
  findings: ReviewFinding[];
  loading: boolean;
  error: string | null;
  severity: "all" | Severity;
  category: "all" | Category;
  feedback: BetaFeedbackEntry[];
  onSeverity: (value: "all" | Severity) => void;
  onCategory: (value: "all" | Category) => void;
  onFeedback: (entry: BetaFeedbackEntry) => void;
  onBack?: () => void;
}

export default function ReviewInspector({
  item,
  findings,
  loading,
  error,
  severity,
  category,
  feedback,
  onSeverity,
  onCategory,
  onFeedback,
  onBack,
}: ReviewInspectorProps) {
  if (!item) {
    return (
      <div className="grid h-full place-items-center px-6 text-center text-sm text-text-secondary">
        Select a pull request to read the review.
      </div>
    );
  }

  const visible = findings.filter((finding) => {
    if (severity !== "all" && finding.severity !== severity) return false;
    if (category !== "all" && finding.category !== category) return false;
    return true;
  });
  const repo = item.repo_full_name.split("/").pop() ?? item.repo_full_name;
  const risk = Math.min(5, Math.max(1, item.risk_score || 1));
  const width = ((risk - 1) / 4) * 100;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="space-y-3 border-b border-white/10 px-4 py-4">
        {onBack && (
          <button type="button" onClick={onBack} className="text-xs text-accent lg:hidden">
            Back to queue
          </button>
        )}
        <div className="flex flex-wrap items-center gap-2">
          <VerdictPill value={item.merge_recommendation} />
          <span className="font-mono text-[11px] text-accent">
            {repo} #{item.pr_number}
          </span>
          <span className="font-mono text-[11px] text-text-muted">{item.author}</span>
        </div>
        <h2 className="text-lg font-semibold leading-snug">{item.title}</h2>
        <div>
          <div className="mb-1 flex items-center justify-between font-mono text-[10px] tracking-[0.12em] text-text-muted">
            <span>RISK SCORE</span>
            <span className="text-text-primary">{risk.toFixed(1)} / 5.0</span>
          </div>
          <div
            role="meter"
            aria-label="Risk score"
            aria-valuemin={1}
            aria-valuemax={5}
            aria-valuenow={Number(risk.toFixed(1))}
            className="h-1.5 overflow-hidden rounded-full border border-white/10 bg-white/5"
          >
            <div
              className="h-full rounded-full"
              style={{
                width: `${Math.max(8, width)}%`,
                background: "linear-gradient(90deg, #34d399, #ffb224)",
              }}
            />
          </div>
        </div>
        <p className="text-sm leading-7 text-[#cfcbc2]">{item.summary}</p>
      </div>

      <div className="flex flex-wrap gap-1.5 border-b border-white/10 px-4 py-2">
        {SEVERITIES.map((value) => (
          <FilterChip key={value} active={severity === value} onClick={() => onSeverity(value)}>
            {value === "all" ? "All" : value}
          </FilterChip>
        ))}
        <span className="mx-1 hidden h-6 w-px bg-white/10 sm:block" />
        {CATEGORIES.map((value) => (
          <FilterChip key={value} active={category === value} onClick={() => onCategory(value)}>
            {value === "all" ? "Any category" : value}
          </FilterChip>
        ))}
      </div>

      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
        {loading && <p className="text-sm text-text-muted">Loading findings…</p>}
        {error && (
          <p role="alert" className="text-sm text-danger">
            {error}
          </p>
        )}
        {!loading && !error && visible.length === 0 && (
          <p className="text-sm text-text-secondary">
            {findings.length === 0
              ? "No findings on this review."
              : "No findings match these filters."}
          </p>
        )}
        {visible.map((finding) => (
          <FindingCard
            key={finding.id}
            prId={item.id}
            repo={item.repo_full_name}
            prNumber={item.pr_number}
            finding={finding}
            saved={feedback.find(
              (entry) => entry.pr_id === item.id && entry.finding_id === finding.id,
            )}
            onSubmit={onFeedback}
          />
        ))}
      </div>
    </div>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: string;
}) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={`rounded-full border px-2.5 py-1 font-mono text-[10px] capitalize tracking-[0.06em] ${
        active
          ? "border-amber/50 bg-amber/10 text-amber"
          : "border-white/10 text-text-secondary hover:text-text-primary"
      }`}
    >
      {children}
    </button>
  );
}
