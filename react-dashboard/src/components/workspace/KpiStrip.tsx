interface KpiStripProps {
  reviewed: number;
  averageRisk: number;
  topCategory: string;
}

export default function KpiStrip({ reviewed, averageRisk, topCategory }: KpiStripProps) {
  const cards = [
    { kicker: "PRS REVIEWED", value: String(reviewed), detail: "In this queue" },
    {
      kicker: "AVERAGE RISK",
      value: reviewed > 0 ? averageRisk.toFixed(1) : "—",
      detail: "Scale 1.0–5.0",
    },
    { kicker: "TOP CATEGORY", value: topCategory, detail: "Most common flag" },
  ];

  return (
    <section aria-label="Review summary" className="grid grid-cols-1 overflow-hidden rounded-xl border border-white/10 bg-[#14181f]/70 sm:grid-cols-3">
      {cards.map((card, index) => (
        <div
          key={card.kicker}
          className={`px-4 py-3 ${index > 0 ? "border-t border-white/10 sm:border-t-0 sm:border-l" : ""}`}
        >
          <p className="font-mono text-[10px] tracking-[0.14em] text-amber">{card.kicker}</p>
          <p className="mt-1 font-mono text-2xl font-medium tracking-tight text-text-primary">
            {card.value}
          </p>
          <p className="text-xs text-text-muted">{card.detail}</p>
        </div>
      ))}
    </section>
  );
}
