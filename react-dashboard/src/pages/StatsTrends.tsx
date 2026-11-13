import { useEffect, useMemo, useState } from "react";
import { fetchDashboardStats } from "../api/client";
import Badge from "../components/Badge";
import { useAuth } from "../context/AuthContext";
import {
  SEED_PR_DETAILS,
  computeDashboardStatsFromPRs,
} from "../data/institutionalSeeds";
import type { DashboardStats, PRDetail } from "../types/api";

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
      <div className="flex items-center justify-between font-mono text-xs">
        <span className="capitalize text-text-primary font-medium">{label}</span>
        <span className="text-text-secondary">
          {count} ({pct}%)
        </span>
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-[#0E1116] border border-white/[0.08]">
        <div
          className={`h-full rounded-full transition-all duration-300 ${colorClass}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export default function StatsTrends() {
  const { userSimulatedPRs } = useAuth();
  const [apiStats, setApiStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const controller = new AbortController();
    fetchDashboardStats(controller.signal)
      .then((res) => {
        if (res.total_prs > 0) {
          setApiStats(res);
        }
      })
      .catch(() => {
        // Fallback to institutional seed computation when Go backend is offline
      })
      .finally(() => setLoading(false));
    return () => controller.abort();
  }, []);

  const stats: DashboardStats = useMemo(() => {
    if (apiStats && userSimulatedPRs.length === 0) {
      return apiStats;
    }
    const combined = [...userSimulatedPRs, ...SEED_PR_DETAILS];
    const map: Record<string, PRDetail> = {};
    for (const item of combined) {
      map[item.id] = item;
    }
    return computeDashboardStatsFromPRs(combined, map);
  }, [apiStats, userSimulatedPRs]);

  if (loading) {
    return (
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="h-52 animate-pulse rounded-lg studio-panel" />
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-mono text-2xl font-bold tracking-tight">
          Analytics &amp; Review Trends
        </h1>
        <p className="text-sm text-text-secondary">
          Aggregate risk posture, issue category distribution, and 14-day automated review volume.
        </p>
      </div>

      <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
        {/* Merge Recommendations */}
        <section className="studio-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Merge Decisions
            </h2>
            <span className="font-mono text-xs text-text-secondary">{stats.total_prs} PRs</span>
          </div>
          <div className="space-y-3">
            <BarRow
              label="Safe"
              count={stats.recommendations.safe ?? 0}
              total={stats.total_prs}
              colorClass="bg-[#34D399]"
            />
            <BarRow
              label="Caution"
              count={stats.recommendations.caution ?? 0}
              total={stats.total_prs}
              colorClass="bg-[#FFB224]"
            />
            <BarRow
              label="Block"
              count={stats.recommendations.block ?? 0}
              total={stats.total_prs}
              colorClass="bg-[#F87171]"
            />
          </div>
        </section>

        {/* Findings by Severity */}
        <section className="studio-panel rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
              Findings by Severity
            </h2>
            <span className="font-mono text-xs text-text-secondary">
              {stats.total_findings} total
            </span>
          </div>
          <div className="space-y-3">
            <BarRow
              label="High"
              count={stats.severities.high ?? 0}
              total={stats.total_findings}
              colorClass="bg-[#F87171]"
            />
            <BarRow
              label="Medium"
              count={stats.severities.medium ?? 0}
              total={stats.total_findings}
              colorClass="bg-[#FFB224]"
            />
            <BarRow
              label="Low"
              count={stats.severities.low ?? 0}
              total={stats.total_findings}
              colorClass="bg-[#34D399]"
            />
          </div>
        </section>

        {/* Findings by Category */}
        <section className="studio-panel rounded-lg p-5 space-y-4">
          <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
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
      <section className="studio-panel rounded-lg p-5 space-y-4">
        <h2 className="font-mono text-xs font-semibold uppercase tracking-wider text-text-muted">
          Recent 14-Day Review Activity
        </h2>

        {stats.recent_reviews.length === 0 ? (
          <p className="font-mono text-xs text-text-secondary">
            No review runs recorded in the last 14 days.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left font-mono text-xs">
              <thead>
                <tr className="border-b border-white/[0.08] text-text-muted">
                  <th className="pb-2.5 font-medium">Date (UTC)</th>
                  <th className="pb-2.5 font-medium">Review Runs</th>
                  <th className="pb-2.5 font-medium">Average Risk Score</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/[0.06]">
                {stats.recent_reviews.map((day) => (
                  <tr key={day.date}>
                    <td className="py-2.5 text-text-primary">{day.date}</td>
                    <td className="py-2.5 text-text-secondary">{day.review_count}</td>
                    <td className="py-2.5 text-[#7C8AFF]">
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
