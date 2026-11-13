import { useState, type FormEvent } from "react";
import Badge from "./Badge";
import { useAuth } from "../context/AuthContext";
import { getFindingRemediation } from "../data/institutionalSeeds";
import { sanitizeSingleLineInput } from "../security/crypto";
import type { PRFinding } from "../types/api";

interface FindingInspectorCardProps {
  finding: PRFinding;
  prId: string;
  repoFullName: string;
  prNumber: number;
}

export default function FindingInspectorCard({
  finding,
  prId,
  repoFullName,
  prNumber,
}: FindingInspectorCardProps) {
  const { user, userFeedbackMap, saveFindingFeedback } = useAuth();
  const existingFeedback = userFeedbackMap[finding.id];

  const [expanded, setExpanded] = useState(true);
  const [copiedFix, setCopiedFix] = useState(false);

  const [helpfulVote, setHelpfulVote] = useState<"up" | "down" | null>(
    existingFeedback?.helpful ?? null
  );
  const [comment, setComment] = useState(existingFeedback?.comment ?? "");
  const [cooldownActive, setCooldownActive] = useState(false);
  const [justSaved, setJustSaved] = useState(false);

  const remediation = getFindingRemediation(finding);

  async function handleCopyFix() {
    try {
      await navigator.clipboard.writeText(remediation.suggested_fix);
      setCopiedFix(true);
      window.setTimeout(() => setCopiedFix(false), 1800);
    } catch {
      // Ignore if clipboard blocked
    }
  }

  function handleVote(vote: "up" | "down") {
    if (cooldownActive || !user) return;
    setHelpfulVote(vote);
    const cleanComment = sanitizeSingleLineInput(comment, 200);
    saveFindingFeedback({
      finding_id: finding.id,
      pr_id: prId,
      repo_full_name: repoFullName,
      pr_number: prNumber,
      file_path: finding.file_path,
      line_number: finding.line_number,
      severity: finding.severity,
      category: finding.category,
      helpful: vote,
      comment: cleanComment,
      reviewer_username: user.username,
      updated_at: new Date().toISOString(),
    });
    triggerCooldown();
  }

  function handleSaveComment(e: FormEvent) {
    e.preventDefault();
    if (cooldownActive || !user) return;
    const vote = helpfulVote ?? "up";
    setHelpfulVote(vote);
    const cleanComment = sanitizeSingleLineInput(comment, 200);
    setComment(cleanComment);
    saveFindingFeedback({
      finding_id: finding.id,
      pr_id: prId,
      repo_full_name: repoFullName,
      pr_number: prNumber,
      file_path: finding.file_path,
      line_number: finding.line_number,
      severity: finding.severity,
      category: finding.category,
      helpful: vote,
      comment: cleanComment,
      reviewer_username: user.username,
      updated_at: new Date().toISOString(),
    });
    triggerCooldown();
  }

  function triggerCooldown() {
    setJustSaved(true);
    setCooldownActive(true);
    window.setTimeout(() => setCooldownActive(false), 900);
    window.setTimeout(() => setJustSaved(false), 2500);
  }

  return (
    <article className="studio-panel rounded-lg overflow-hidden transition-colors">
      {/* Header Row */}
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0E1116]/60 px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={finding.severity}>{finding.severity.toUpperCase()}</Badge>
          <Badge variant={finding.category}>{finding.category}</Badge>
          <span className="rounded border border-white/[0.08] bg-[#141820] px-2 py-0.5 font-mono text-xs text-[#7C8AFF]">
            {finding.file_path}:{finding.line_number}
          </span>
        </div>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => void handleCopyFix()}
            className="rounded border border-[#34D399]/35 bg-[#34D399]/10 px-2.5 py-1 font-mono text-[11px] font-medium text-[#34D399] hover:bg-[#34D399]/20 transition-colors cursor-pointer"
          >
            {copiedFix ? "✓ Copied Fix" : "Copy Fix"}
          </button>

          <button
            type="button"
            onClick={() => setExpanded((prev) => !prev)}
            className="rounded border border-white/[0.08] bg-[#141820] px-2 py-1 font-mono text-[11px] text-text-secondary hover:text-text-primary cursor-pointer"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
        </div>
      </div>

      {/* Finding Message */}
      <div className="p-4 space-y-4">
        <p className="text-[15px] leading-[1.75] text-text-primary">{finding.message}</p>

        {expanded && (
          <div className="space-y-3 pt-1">
            {/* Educational Why This Matters */}
            <div className="rounded-md border border-[#FFB224]/25 bg-[#FFB224]/[0.06] p-3 space-y-1">
              <p className="font-mono text-[11px] font-semibold uppercase tracking-wider text-[#FFB224]">
                Why This Matters (Junior Dev Guide)
              </p>
              <p className="text-xs sm:text-sm text-text-secondary leading-relaxed">
                {remediation.why_it_matters}
              </p>
            </div>

            {/* Sanitized Code Snippet & Suggested Fix */}
            <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
              <div className="space-y-1">
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#F87171]">
                  Flagged Diff ({finding.file_path}:{finding.line_number})
                </span>
                <pre className="overflow-x-auto rounded-md border border-[#F87171]/25 bg-[#0E1116] p-3 font-mono text-xs text-[#F87171]">
                  <code>{remediation.code_snippet}</code>
                </pre>
              </div>

              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-[10px] uppercase tracking-wider text-[#34D399]">
                    Suggested Safe Remediation
                  </span>
                </div>
                <pre className="overflow-x-auto rounded-md border border-[#34D399]/25 bg-[#0E1116] p-3 font-mono text-xs text-[#34D399]">
                  <code>{remediation.suggested_fix}</code>
                </pre>
              </div>
            </div>
          </div>
        )}

        {/* Persistent Junior Dev Feedback Widget */}
        <form
          onSubmit={handleSaveComment}
          className="mt-2 pt-3 border-t border-white/[0.08] flex flex-col gap-2.5 sm:flex-row sm:items-center sm:justify-between"
        >
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-mono text-xs text-text-secondary">
              Was this finding accurate?
            </span>

            <button
              type="button"
              disabled={cooldownActive}
              onClick={() => handleVote("up")}
              aria-label="Mark finding accurate"
              className={`rounded border px-2.5 py-1 font-mono text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                (existingFeedback?.helpful ?? helpfulVote) === "up"
                  ? "border-[#34D399]/50 bg-[#34D399]/15 text-[#34D399]"
                  : "border-white/[0.1] bg-[#0E1116] text-text-secondary hover:text-text-primary"
              }`}
            >
              👍
            </button>

            <button
              type="button"
              disabled={cooldownActive}
              onClick={() => handleVote("down")}
              aria-label="Mark finding inaccurate"
              className={`rounded border px-2.5 py-1 font-mono text-xs transition-colors cursor-pointer disabled:opacity-50 ${
                (existingFeedback?.helpful ?? helpfulVote) === "down"
                  ? "border-[#F87171]/50 bg-[#F87171]/15 text-[#F87171]"
                  : "border-white/[0.1] bg-[#0E1116] text-text-secondary hover:text-text-primary"
              }`}
            >
              👎
            </button>

            {(existingFeedback || justSaved) && (
              <span className="inline-flex items-center gap-1 rounded border border-[#34D399]/35 bg-[#34D399]/10 px-2 py-0.5 font-mono text-[10px] text-[#34D399]">
                ✓ Saved to your session
              </span>
            )}
          </div>

          <div className="flex items-center gap-2 flex-1 sm:max-w-xs">
            <input
              type="text"
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              maxLength={200}
              placeholder="Add 1-line note (max 200 chars)..."
              aria-label="Feedback note for this finding"
              className="w-full rounded border border-white/[0.1] bg-[#0E1116] px-2.5 py-1 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-[#7C8AFF] focus:outline-none"
            />
            <button
              type="submit"
              disabled={cooldownActive}
              className="shrink-0 rounded border border-white/[0.12] bg-[#1B202B] px-2.5 py-1 font-mono text-xs text-text-primary hover:border-[#7C8AFF] transition-colors cursor-pointer disabled:opacity-50"
            >
              Save
            </button>
          </div>
        </form>
      </div>
    </article>
  );
}
