// src/components/Badge.jsx

const VARIANTS = {
  // Status badges
  completed: "bg-success/15 text-success border-success/30",
  processing: "bg-accent/15 text-accent border-accent/30",
  failed: "bg-danger/15 text-danger border-danger/30",
  pending: "bg-text-muted/15 text-text-muted border-text-muted/30",

  // Severity badges
  low: "bg-severity-low-bg text-severity-low-text border-severity-low-text/20",
  medium: "bg-severity-medium-bg text-severity-medium-text border-severity-medium-text/20",
  high: "bg-severity-high-bg text-severity-high-text border-severity-high-text/20",
};

export default function Badge({ variant, children }) {
  const styles = VARIANTS[variant] ?? VARIANTS.pending;

  return (
    <span
      className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${styles}`}
    >
      {children}
    </span>
  );
}