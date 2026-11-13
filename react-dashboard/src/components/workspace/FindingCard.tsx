import { Check, Copy, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import type { BetaFeedbackEntry } from "../../lib/feedbackStore";
import type { Severity } from "../../types/api";
import type { ReviewFinding } from "../../data/sampleReviews";

const SEVERITY: Record<Severity, string> = {
  high: "border-danger/40 bg-danger/10 text-severity-high-text",
  medium: "border-amber/40 bg-amber/10 text-amber",
  low: "border-success/40 bg-success/10 text-success",
};

interface FindingCardProps {
  prId: string;
  repo: string;
  prNumber: number;
  finding: ReviewFinding;
  saved?: BetaFeedbackEntry;
  onSubmit: (entry: BetaFeedbackEntry) => void;
}

export default function FindingCard({
  prId,
  repo,
  prNumber,
  finding,
  saved,
  onSubmit,
}: FindingCardProps) {
  const [open, setOpen] = useState(false);
  const [helpful, setHelpful] = useState<boolean | null>(saved?.helpful ?? null);
  const [comment, setComment] = useState(saved?.comment ?? "");
  const [logged, setLogged] = useState(Boolean(saved));
  const [copied, setCopied] = useState(false);
  const panelId = `finding-${prId}-${finding.id}`;

  async function copyFix() {
    const text = finding.teaching?.suggested_fix;
    if (!text) return;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  }

  function submit() {
    if (helpful === null) return;
    onSubmit({
      pr_id: prId,
      repo_full_name: repo,
      pr_number: prNumber,
      finding_id: finding.id,
      file_path: finding.file_path,
      line_number: finding.line_number,
      severity: finding.severity,
      category: finding.category,
      helpful,
      comment: comment.trim(),
      submitted_at: new Date().toISOString(),
    });
    setLogged(true);
  }

  return (
    <article className="rounded-xl border border-white/10 bg-white/2">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((value) => !value)}
        className="flex w-full flex-col gap-2 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber sm:px-4"
      >
        <div className="flex flex-wrap items-center gap-2">
          <span className={`rounded-full border px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] ${SEVERITY[finding.severity]}`}>
            {finding.severity.toUpperCase()}
          </span>
          <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.08em] text-accent">
            {finding.category}
          </span>
          <span className="rounded-md border border-white/10 bg-bg-primary px-2 py-0.5 font-mono text-[11px] text-text-secondary">
            {finding.file_path}:{finding.line_number}
          </span>
        </div>
        <p className="text-sm leading-relaxed text-text-primary">{finding.message}</p>
      </button>

      {open && (
        <div id={panelId} className="space-y-3 border-t border-white/10 px-3 py-3 sm:px-4">
          {finding.teaching ? (
            <div className="grid gap-2 lg:grid-cols-2">
              <pre className="overflow-x-auto rounded-lg border border-white/10 bg-[#0a0d12] p-3 font-mono text-[12px] leading-relaxed text-[#d8d3c8]">
                <span className="mb-2 block text-[10px] tracking-[0.12em] text-text-muted">CURRENT</span>
                {finding.teaching.code_snippet}
              </pre>
              <div className="relative">
                <pre className="overflow-x-auto rounded-lg border border-success/30 bg-[#0a0d12] p-3 font-mono text-[12px] leading-relaxed text-success">
                  <span className="mb-2 block text-[10px] tracking-[0.12em] text-text-muted">SUGGESTED FIX</span>
                  {finding.teaching.suggested_fix}
                </pre>
                <button
                  type="button"
                  onClick={() => void copyFix()}
                  className="absolute right-2 top-2 inline-flex items-center gap-1 rounded-md border border-white/10 bg-bg-secondary px-2 py-1 font-mono text-[10px] text-text-secondary hover:text-text-primary"
                >
                  {copied ? <Check strokeWidth={1.5} className="h-3 w-3" /> : <Copy strokeWidth={1.5} className="h-3 w-3" />}
                  {copied ? "Copied" : "Copy Fix"}
                </button>
              </div>
            </div>
          ) : (
            <p className="text-sm leading-relaxed text-text-secondary">
              This finding came from the live review API. It includes the explanation above. A side-by-side code preview is only attached to sample reviews in this beta.
            </p>
          )}

          <fieldset className="space-y-2 rounded-lg border border-white/10 p-3">
            <legend className="px-1 text-xs text-text-secondary">
              Helpful? Tell us if this caught a real bug or was a false positive.
            </legend>
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                aria-pressed={helpful === true}
                onClick={() => {
                  setHelpful(true);
                  setLogged(false);
                }}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  helpful === true
                    ? "border-success/50 bg-success/10 text-success"
                    : "border-white/10 text-text-secondary"
                }`}
              >
                <ThumbsUp strokeWidth={1.5} className="h-3.5 w-3.5" />
                Helpful
              </button>
              <button
                type="button"
                aria-pressed={helpful === false}
                onClick={() => {
                  setHelpful(false);
                  setLogged(false);
                }}
                className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs ${
                  helpful === false
                    ? "border-danger/50 bg-danger/10 text-danger"
                    : "border-white/10 text-text-secondary"
                }`}
              >
                <ThumbsDown strokeWidth={1.5} className="h-3.5 w-3.5" />
                Not helpful
              </button>
            </div>
            <label className="sr-only" htmlFor={`${panelId}-note`}>
              Feedback comment
            </label>
            <input
              id={`${panelId}-note`}
              value={comment}
              onChange={(event) => {
                setComment(event.target.value);
                setLogged(false);
              }}
              maxLength={180}
              placeholder="Tell us if this caught a real bug or was a false positive"
              className="h-9 w-full rounded-md border border-white/10 bg-bg-primary px-2 text-sm text-text-primary placeholder:text-text-muted focus:border-amber/60 focus:outline-none"
            />
            <div className="flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={submit}
                disabled={helpful === null}
                className="rounded-md border border-white/15 px-2.5 py-1 text-xs font-medium text-text-primary disabled:opacity-40"
              >
                Log feedback
              </button>
              {logged && (
                <p role="status" className="font-mono text-[11px] text-success">
                  Feedback logged for v2
                </p>
              )}
            </div>
          </fieldset>
        </div>
      )}
    </article>
  );
}
