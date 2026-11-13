import type { QueueItem } from "../../data/sampleReviews";
import VerdictPill from "./VerdictPill";

interface PRQueueProps {
  items: QueueItem[];
  selectedId: string;
  incomingId: string;
  onSelect: (id: string) => void;
}

function shortTime(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function PRQueue({ items, selectedId, incomingId, onSelect }: PRQueueProps) {
  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex items-center justify-between border-b border-white/10 px-3 py-2">
        <h2 className="font-mono text-[10px] tracking-[0.14em] text-text-muted">PR QUEUE</h2>
        <span className="font-mono text-[10px] text-text-muted">{items.length}</span>
      </div>
      <ul className="min-h-0 flex-1 overflow-y-auto" role="listbox" aria-label="Reviewed pull requests">
        {items.length === 0 && (
          <li className="px-3 py-8 text-sm text-text-secondary">
            No pull requests match this search. Clear the filter, or simulate a webhook review.
          </li>
        )}
        {items.map((pr) => {
          const selected = pr.id === selectedId;
          const repo = pr.repo_full_name.split("/").pop() ?? pr.repo_full_name;
          return (
            <li key={pr.id} className={incomingId === pr.id ? "animate-[pulse_1s_ease-in-out_1]" : ""}>
              <button
                type="button"
                role="option"
                aria-selected={selected}
                onClick={() => onSelect(pr.id)}
                className={`flex w-full flex-col gap-1.5 border-b border-white/10 px-3 py-3 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber ${
                  selected ? "bg-amber/8" : "hover:bg-white/3"
                }`}
              >
                <div className="flex items-center justify-between gap-2">
                  <VerdictPill value={pr.merge_recommendation} />
                  <span className="font-mono text-[10px] text-text-muted">{shortTime(pr.created_at)}</span>
                </div>
                <p className="font-mono text-[11px] text-accent">
                  {repo} #{pr.pr_number}
                </p>
                <p className="line-clamp-2 text-sm font-medium leading-snug text-text-primary">{pr.title}</p>
                <p className="text-xs text-text-muted">
                  {pr.author} · {pr.findings_count} {pr.findings_count === 1 ? "finding" : "findings"}
                  {pr.simulated ? " · sample" : ""}
                </p>
              </button>
            </li>
          );
        })}
      </ul>
      <p className="border-t border-white/10 px-3 py-2 font-mono text-[10px] tracking-[0.08em] text-text-muted">
        J next · K previous
      </p>
    </div>
  );
}
