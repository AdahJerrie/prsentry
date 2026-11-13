interface RiskMeterProps {
  score: number;
  compact?: boolean;
}

export default function RiskMeter({ score, compact = false }: RiskMeterProps) {
  const clamped = Math.min(5, Math.max(1, Number(score) || 1));
  const pct = ((clamped - 1) / 4) * 100;

  let barColor = "bg-success";
  let textColor = "text-success";
  if (clamped >= 4) {
    barColor = "bg-danger";
    textColor = "text-danger";
  } else if (clamped >= 2.5) {
    barColor = "bg-warning";
    textColor = "text-warning";
  }

  return (
    <div
      role="meter"
      aria-label="Pull request risk score"
      aria-valuemin={1}
      aria-valuemax={5}
      aria-valuenow={Number(clamped.toFixed(1))}
      className={`flex items-center gap-2.5 ${compact ? "min-w-[110px]" : "min-w-[140px]"}`}
    >
      <div className="h-2 flex-1 overflow-hidden rounded-full bg-bg-primary border border-border">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${Math.max(12, pct)}%` }}
        />
      </div>
      <span className={`font-mono text-xs font-semibold tabular-nums ${textColor}`}>
        {clamped.toFixed(1)}/5.0
      </span>
    </div>
  );
}
