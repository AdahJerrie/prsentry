import type { ReactNode } from "react";

const VARIANT_STYLES: Record<string, string> = {
  // Merge recommendations (Strict Functional Restraint)
  safe: "bg-[#34D399]/12 text-[#34D399] border-[#34D399]/35",
  caution: "bg-[#FFB224]/12 text-[#FFB224] border-[#FFB224]/35",
  block: "bg-[#F87171]/14 text-[#F87171] border-[#F87171]/40",

  // Severities
  low: "bg-[#34D399]/12 text-[#34D399] border-[#34D399]/30",
  medium: "bg-[#FFB224]/12 text-[#FFB224] border-[#FFB224]/30",
  high: "bg-[#F87171]/14 text-[#F87171] border-[#F87171]/35",

  // Review / PR lifecycle statuses
  completed: "bg-[#34D399]/12 text-[#34D399] border-[#34D399]/30",
  processing: "bg-[#FFB224]/12 text-[#FFB224] border-[#FFB224]/30",
  pending: "bg-white/5 text-text-secondary border-white/10",
  failed: "bg-[#F87171]/14 text-[#F87171] border-[#F87171]/35",
  open: "bg-[#7C8AFF]/12 text-[#7C8AFF] border-[#7C8AFF]/35",
  merged: "bg-[#34D399]/10 text-[#34D399] border-[#34D399]/25",
  closed: "bg-white/5 text-text-secondary border-white/10",

  // Categories
  security: "bg-[#F87171]/12 text-[#F87171] border-[#F87171]/30",
  bug: "bg-[#FFB224]/12 text-[#FFB224] border-[#FFB224]/30",
  performance: "bg-[#7C8AFF]/12 text-[#7C8AFF] border-[#7C8AFF]/30",
  maintainability: "bg-white/6 text-text-primary border-white/12",
  style: "bg-white/5 text-text-secondary border-white/10",
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
      className={`inline-flex items-center gap-1 rounded-md border px-2 py-0.5 font-mono text-[11px] font-medium tracking-wide ${styles} ${className}`}
    >
      {children}
    </span>
  );
}
