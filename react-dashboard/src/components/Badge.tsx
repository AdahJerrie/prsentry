import type { ReactNode } from "react";

const VARIANT_STYLES: Record<string, string> = {
  // Merge recommendations
  safe: "bg-success/15 text-success border-success/35",
  caution: "bg-warning/15 text-warning border-warning/35",
  block: "bg-danger/15 text-danger border-danger/40",

  // Severities
  low: "bg-severity-low-bg text-severity-low-text border-severity-low-text/25",
  medium: "bg-severity-medium-bg text-severity-medium-text border-severity-medium-text/25",
  high: "bg-severity-high-bg text-severity-high-text border-severity-high-text/30",

  // Review / PR lifecycle statuses
  completed: "bg-success/15 text-success border-success/30",
  processing: "bg-accent/15 text-accent border-accent/30",
  pending: "bg-text-muted/15 text-text-secondary border-border",
  failed: "bg-danger/15 text-danger border-danger/30",
  open: "bg-accent/15 text-accent border-accent/30",
  merged: "bg-purple-500/15 text-purple-300 border-purple-400/30",
  closed: "bg-text-muted/15 text-text-secondary border-border",

  // Categories
  security: "bg-danger/10 text-red-300 border-danger/25",
  bug: "bg-warning/10 text-amber-300 border-warning/25",
  performance: "bg-cyan-500/10 text-cyan-300 border-cyan-400/25",
  maintainability: "bg-indigo-500/10 text-indigo-300 border-indigo-400/25",
  style: "bg-slate-500/15 text-slate-300 border-slate-400/25",
};

interface BadgeProps {
  variant: string;
  children: ReactNode;
  className?: string;
}

export default function Badge({ variant, children, className = "" }: BadgeProps) {
  const key = variant.toLowerCase();
  const styles = VARIANT_STYLES[key] ?? VARIANT_STYLES.pending;

  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full border px-2.5 py-0.5 text-xs font-medium tracking-wide ${styles} ${className}`}
    >
      {children}
    </span>
  );
}
