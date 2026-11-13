import type { PRFinding } from "../types/api";
import Badge from "./Badge";

interface FindingItemProps {
  finding: PRFinding;
  compact?: boolean;
}

export default function FindingItem({ finding, compact = false }: FindingItemProps) {
  if (compact) {
    return (
      <div className="rounded-lg border border-border bg-bg-secondary p-3 flex flex-col sm:flex-row sm:items-start gap-2.5 text-sm">
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
    );
  }

  return (
    <div className="rounded-xl border border-border bg-bg-secondary p-4 sm:p-5 space-y-2.5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <Badge variant={finding.severity}>{finding.severity.toUpperCase()}</Badge>
          <Badge variant={finding.category}>{finding.category}</Badge>
        </div>
        <span className="rounded-md bg-bg-primary px-2.5 py-1 font-mono text-xs text-accent border border-border break-all">
          {finding.file_path}:{finding.line_number}
        </span>
      </div>
      <p className="text-sm text-text-primary leading-relaxed">{finding.message}</p>
    </div>
  );
}
