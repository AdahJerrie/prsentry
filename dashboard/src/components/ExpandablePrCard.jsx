// src/components/ExpandablePrCard.jsx
import { useState } from "react";
import { useApi } from "../hooks/useApi";
import Card from "./Card";
import Badge from "./Badge";

const severityOrder = { high: 0, medium: 1, low: 2 };

export default function ExpandablePrCard({ pr }) {
  const [expanded, setExpanded] = useState(false);

  // Only attempt to fetch a review if one could actually exist
  const canFetchReview = pr.status === "completed";
  const { data, loading, error } = useApi(
    expanded && canFetchReview ? `/reviews/${pr.id}` : null
  );

  return (
    <Card className="!p-0 overflow-hidden">
      <button
        onClick={() => setExpanded((e) => !e)}
        className="w-full text-left p-4 flex justify-between items-center hover:bg-bg-tertiary transition-colors"
      >
        <div>
          <p className="font-medium">{pr.title}</p>
          <p className="text-sm text-text-secondary">{pr.repo}</p>
        </div>
        <div className="flex items-center gap-3">
          {pr.risk_score !== null && (
            <span className="text-sm text-text-muted">Risk: {pr.risk_score}/5</span>
          )}
          <Badge variant={pr.status}>{pr.status}</Badge>
          <span className="text-text-muted text-xs">{expanded ? "▲" : "▼"}</span>
        </div>
      </button>

      {expanded && (
        <div className="border-t border-border p-4 space-y-3">
          {pr.status === "processing" && (
            <p className="text-sm text-text-secondary flex items-center gap-2">
              <span className="animate-pulse">●</span> Review in progress...
            </p>
          )}

          {pr.status === "pending" && (
            <p className="text-sm text-text-muted">Queued — review hasn't started yet.</p>
          )}

          {pr.status === "failed" && (
            <p className="text-sm text-danger">
              This review failed to complete. It may be retried automatically.
            </p>
          )}

          {canFetchReview && loading && (
            <p className="text-sm text-text-secondary">Loading findings...</p>
          )}
          {canFetchReview && error && (
            <p className="text-sm text-danger">Error loading findings: {error}</p>
          )}

          {canFetchReview && data && (
            <>
              <p className="text-sm text-text-secondary">{data.summary}</p>
              <div className="space-y-2">
                {[...data.findings]
                  .sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity])
                  .map((f, i) => (
                    <div key={i} className="flex items-start gap-3 text-sm">
                      <Badge variant={f.severity}>{f.severity}</Badge>
                      <div>
                        <p className="font-mono text-xs text-text-muted">
                          {f.file_path}:{f.line_number}
                        </p>
                        <p>{f.message}</p>
                      </div>
                    </div>
                  ))}
              </div>
            </>
          )}
        </div>
      )}
    </Card>
  );
}