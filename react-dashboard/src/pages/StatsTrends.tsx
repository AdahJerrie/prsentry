import { useEffect, useState } from "react";
import { fetchDashboardStats } from "../api/client";
import Badge from "../components/Badge";
import type { DashboardStats } from "../types/api";

function BarRow({
  label,
  count,
  total,
  colorClass,
}: {
  label: string;
  count: number;
  total: number;
  colorClass: string;
}) {
  const pct = total > 0 ? Math.round((count / total) * 100) : 0;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <span className="capitalize text-text-primary font-medium">{label}</span>
        <span className="font-mono text-text-secondary">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-bg-primary border border-border">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function StatsTrends() {
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardStats(controller.signal)
      .then(setStats)
      .catch((err) => {
        if ((err as Error)?.name === "AbortError") return;
        setError(err instanceof Error ? err.message : "Failed to load stats");
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className="h-52 animate-pulse rounded-xl border border-border bg-bg-secondary"
          />
        ))}
      </div>
    );
  }

  if (error || !stats) {
    return (
      <div className="rounded-xl border border-danger/40 bg-danger/10 p-6 text-sm text-danger">
        {error ?? "Unable to load analytics."}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Analytics &amp; Review Trends</h1>
        <p className="text-sm text-text-secondary">
          Aggregate risk posture, issue category distribution, and recent automated review volume.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Merge Recommendations */}
        <section className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Merge Decisions
            </h2>
            <span className="text-xs text-text-secondary">{stats.total_prs} PRs</span>
          </div>
          <div className="space-y-3">
            <BarRow
              label="Safe"
              count={stats.recommendations.safe ?? 0}
              total={stats.total_prs}
              colorClass="bg-success"
            />
            <BarRow
              label="Caution"
              count={stats.recommendations.caution ?? 0}
              total={stats.total_prs}
              colorClass="bg-warning"
            />
            <BarRow
              label="Block"
              count={stats.recommendations.block ?? 0}
              total={stats.total_prs}
              colorClass="bg-danger"
            />
          </div>
        </section>

        {/* Findings by Severity */}
        <section className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
              Findings by Severity
            </h2>
            <span className="text-xs text-text-secondary">{stats.total_findings} total</span>
          </div>
          <div className="space-y-3">
            <BarRow
              label="High"
              count={stats.severities.high ?? 0}
              total={stats.total_findings}
              colorClass="bg-danger"
            />
            <BarRow
              label="Medium"
              count={stats.severities.medium ?? 0}
              total={stats.total_findings}
              colorClass="bg-warning"
            />
            <BarRow
              label="Low"
              count={stats.severities.low ?? 0}
              total={stats.total_findings}
              colorClass="bg-success"
            />
          </div>
        </section>

        {/* Findings by Category */}
        <section className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
            Issue Categories
          </h2>
          <div className="space-y-2.5">
            {(["security", "bug", "performance", "maintainability", "style"] as const).map(
              (cat) => (
                <div key={cat} className="flex items-center justify-between text-sm">
                  <Badge variant={cat}>{cat}</Badge>
                  <span className="font-mono text-xs text-text-primary">
                    {stats.categories[cat] ?? 0}
                  </span>
                </div>
              )
            )}
          </div>
        </section>
      </div>

      {/* 14-Day Review Activity Table */}
      <section className="rounded-xl border border-border bg-bg-secondary p-5 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wider text-text-muted">
          Recent 14-Day Review Activity
        </h2>

        {stats.recent_reviews.length === 0 ? (
          <p className="text-sm text-text-secondary">No review runs recorded in the last 14 days.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="border-b border-border text-xs text-text-muted">
                  <th className="pb-2.5 font-medium">Date (UTC)</th>
                  <th className="pb-2.5 font-medium">Review Runs</th>
                  <th className="pb-2.5 font-medium">Average Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {stats.recent_reviews.map((day) => (
                  <tr key={day.date}>
                    <td className="py-2.5 font-mono text-xs text-text-primary">{day.date}</td>
                    <td className="py-2.5 font-mono text-xs text-text-secondary">
                      {day.review_count}
                    </td>
                    <td className="py-2.5 font-mono text-xs text-accent">
                      {day.avg_risk_score.toFixed(2)} / 5.0
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
