import type { MergeRecommendation } from "../../types/api";

const PILL: Record<MergeRecommendation, string> = {
  safe: "border-success/40 bg-success/10 text-success",
  caution: "border-amber/40 bg-amber/10 text-amber",
  block: "border-danger/40 bg-danger/10 text-danger",
};

const LABEL: Record<MergeRecommendation, string> = {
  safe: "SAFE",
  caution: "CAUTION",
  block: "BLOCK",
};

export default function VerdictPill({
  value,
}: {
  value: MergeRecommendation;
}) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 font-mono text-[10px] font-semibold tracking-[0.14em] ${PILL[value]}`}
    >
      {LABEL[value]}
    </span>
  );
}
