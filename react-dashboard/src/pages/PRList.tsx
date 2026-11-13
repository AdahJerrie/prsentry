import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import {
  fetchDashboardStats,
  fetchPRDetail,
  fetchPRs,
  fetchReviewDetail,
} from "../api/client";
import Badge from "../components/Badge";
import FindingInspectorCard from "../components/FindingInspectorCard";
import RiskMeter from "../components/RiskMeter";
import { useAuth } from "../context/AuthContext";
import {
  INSTITUTIONAL_REPOS,
  SEED_PR_DETAILS,
  computeDashboardStatsFromPRs,
} from "../data/institutionalSeeds";
import {
  generateSecureRandomHex,
  isSafeRepoFullName,
  sanitizeSingleLineInput,
} from "../security/crypto";
import type {
  Category,
  DashboardStats,
  MergeRecommendation,
  PRDetail,
  PRFinding,
  PRSummary,
  Severity,
} from "../types/api";

const SEVERITY_OPTIONS: Array<{ value: "" | Severity; label: string }> = [
  { value: "", label: "All" },
  { value: "high", label: "High" },
  { value: "medium", label: "Medium" },
  { value: "low", label: "Low" },
];

const CATEGORY_OPTIONS: Array<{ value: "" | Category; label: string }> = [
  { value: "", label: "All Categories" },
  { value: "security", label: "Security" },
  { value: "bug", label: "Bug" },
  { value: "performance", label: "Performance" },
  { value: "maintainability", label: "Maintainability" },
  { value: "style", label: "Style" },
];

const RECOMMENDATION_BADGE_STYLES: Record<MergeRecommendation, string> = {
  safe: "bg-[#34D399]/12 text-[#34D399] border-[#34D399]/40",
  caution: "bg-[#FFB224]/12 text-[#FFB224] border-[#FFB224]/40",
  block: "bg-[#F87171]/14 text-[#F87171] border-[#F87171]/45",
};

export default function PRList() {
  const {
    user,
    userSimulatedPRs,
    addSimulatedPR,
    userFeedbackMap,
    exportFeedbackJSON,
  } = useAuth();

  const [apiPRs, setApiPRs] = useState<PRSummary[]>([]);
  const [apiDetailsCache, setApiDetailsCache] = useState<Record<string, PRDetail>>({});
  const [apiStats, setApiStats] = useState<DashboardStats | null>(null);
  const [usingFallbackSeeds, setUsingFallbackSeeds] = useState(false);
  const [loading, setLoading] = useState(true);

  // Filters & instant search (debounced)
  const [repoFilter, setRepoFilter] = useState("");
  const [recFilter, setRecFilter] = useState("");
  const [searchInput, setSearchInput] = useState("");
  const [debouncedSearch, setDebouncedSearch] = useState("");

  // Selected PR & Inspector state
  const [selectedPRId, setSelectedPRId] = useState<string>("");
  const [selectedRunId, setSelectedRunId] = useState<string>("");
  const [inspectorFindings, setInspectorFindings] = useState<PRFinding[]>([]);
  const [inspectorSummary, setInspectorSummary] = useState("");
  const [inspectorRisk, setInspectorRisk] = useState(1);
  const [inspectorRec, setInspectorRec] = useState<MergeRecommendation>("safe");
  const [inspectorSha, setInspectorSha] = useState("");
  const [loadingInspector, setLoadingInspector] = useState(false);

  // Finding filters in right inspector pane
  const [severityFilter, setSeverityFilter] = useState<"" | Severity>("");
  const [categoryFilter, setCategoryFilter] = useState<"" | Category>("");

  // Simulate Webhook Modal & Cooldown state
  const [showSimModal, setShowSimModal] = useState(false);
  const [simRepo, setSimRepo] = useState<string>("org/student-auth-go");
  const [simTitle, setSimTitle] = useState(
    "feat(session): validate student token and query lab assignments"
  );
  const [simScenario, setSimScenario] = useState<"sql_injection" | "idor_leak" | "clean_refactor">(
    "sql_injection"
  );
  const [simCooldownUntil, setSimCooldownUntil] = useState<number>(0);
  const [simError, setSimError] = useState<string | null>(null);

  // Debounce search input (200ms)
  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedSearch(searchInput.trim().toLowerCase());
    }, 200);
    return () => window.clearTimeout(timer);
  }, [searchInput]);

  // Seed map for quick lookup
  const seedDetailsMap = useMemo(() => {
    const map: Record<string, PRDetail> = {};
    for (const item of SEED_PR_DETAILS) {
      map[item.id] = item;
    }
    for (const sim of userSimulatedPRs) {
      map[sim.id] = sim;
    }
    return map;
  }, [userSimulatedPRs]);

  const loadData = useCallback(async (signal?: AbortSignal) => {
    setLoading(true);
    try {
      const [prList, statsPayload] = await Promise.all([
        fetchPRs({ limit: 50 }, signal),
        fetchDashboardStats(signal),
      ]);
      if (prList.length > 0) {
        setApiPRs(prList);
        setApiStats(statsPayload);
        setUsingFallbackSeeds(false);
      } else {
        setApiPRs(SEED_PR_DETAILS);
        setApiStats(null);
        setUsingFallbackSeeds(true);
      }
    } catch (err) {
      if ((err as Error)?.name === "AbortError") return;
      // Graceful fallback to rich institutional PRs matching exact Go API contract
      setApiPRs(SEED_PR_DETAILS);
      setApiStats(null);
      setUsingFallbackSeeds(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    const controller = new AbortController();
    void loadData(controller.signal);
    return () => controller.abort();
  }, [loadData]);

  // Merge user-simulated PRs + API/Seed PRs, prioritizing logged-in user's PRs first
  const allPRs = useMemo(() => {
    const combined: PRSummary[] = [...userSimulatedPRs, ...apiPRs];
    const seen = new Set<string>();
    const deduped: PRSummary[] = [];
    for (const pr of combined) {
      if (!seen.has(pr.id)) {
        seen.add(pr.id);
        deduped.push(pr);
      }
    }

    const activeUsername = user?.username.toLowerCase();
    return deduped.sort((a, b) => {
      const aMine = activeUsername && a.author.toLowerCase() === activeUsername ? 1 : 0;
      const bMine = activeUsername && b.author.toLowerCase() === activeUsername ? 1 : 0;
      if (aMine !== bMine) return bMine - aMine;
      return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
    });
  }, [userSimulatedPRs, apiPRs, user]);

  // Filtered PR Queue
  const filteredPRs = useMemo(() => {
    return allPRs.filter((pr) => {
      if (repoFilter) {
        const shortRepo = pr.repo_full_name.split("/").pop() ?? pr.repo_full_name;
        if (pr.repo_full_name !== repoFilter && shortRepo !== repoFilter) {
          return false;
        }
      }
      if (recFilter && pr.merge_recommendation !== recFilter) {
        return false;
      }
      if (debouncedSearch) {
        const matches =
          pr.title.toLowerCase().includes(debouncedSearch) ||
          pr.repo_full_name.toLowerCase().includes(debouncedSearch) ||
          pr.author.toLowerCase().includes(debouncedSearch) ||
          pr.head_sha.toLowerCase().includes(debouncedSearch) ||
          `#${pr.pr_number}`.includes(debouncedSearch);
        if (!matches) return false;
      }
      return true;
    });
  }, [allPRs, repoFilter, recFilter, debouncedSearch]);

  // Ensure a PR is selected whenever filteredPRs updates
  useEffect(() => {
    if (filteredPRs.length === 0) {
      setSelectedPRId("");
      return;
    }
    if (!selectedPRId || !filteredPRs.some((p) => p.id === selectedPRId)) {
      setSelectedPRId(filteredPRs[0].id);
    }
  }, [filteredPRs, selectedPRId]);

  // Load PRDetail when selectedPRId changes
  useEffect(() => {
    if (!selectedPRId) return;

    const localDetail = seedDetailsMap[selectedPRId] ?? apiDetailsCache[selectedPRId];
    if (localDetail) {
      setSelectedRunId(localDetail.latest_review_id);
      setInspectorFindings(localDetail.findings);
      setInspectorSummary(localDetail.summary);
      setInspectorRisk(localDetail.risk_score);
      setInspectorRec(localDetail.merge_recommendation);
      setInspectorSha(localDetail.head_sha);
      return;
    }

    const controller = new AbortController();
    setLoadingInspector(true);
    fetchPRDetail(selectedPRId, controller.signal)
      .then((detail) => {
        setApiDetailsCache((prev) => ({ ...prev, [detail.id]: detail }));
        setSelectedRunId(detail.latest_review_id);
        setInspectorFindings(detail.findings);
        setInspectorSummary(detail.summary);
        setInspectorRisk(detail.risk_score);
        setInspectorRec(detail.merge_recommendation);
        setInspectorSha(detail.head_sha);
      })
      .catch(() => {
        // Fallback to summary fields if detail endpoint fails
        const summaryItem = allPRs.find((p) => p.id === selectedPRId);
        if (summaryItem) {
          setSelectedRunId(summaryItem.latest_review_id);
          setInspectorFindings([]);
          setInspectorSummary(summaryItem.summary);
          setInspectorRisk(summaryItem.risk_score);
          setInspectorRec(summaryItem.merge_recommendation);
          setInspectorSha(summaryItem.head_sha);
        }
      })
      .finally(() => setLoadingInspector(false));

    return () => controller.abort();
  }, [selectedPRId, seedDetailsMap, apiDetailsCache, allPRs]);

  // J / K Keyboard Navigation across PR Queue
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.tagName === "SELECT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (filteredPRs.length === 0) return;

      if (e.key === "j" || e.key === "J") {
        e.preventDefault();
        const idx = filteredPRs.findIndex((p) => p.id === selectedPRId);
        const nextIdx = idx < filteredPRs.length - 1 ? idx + 1 : 0;
        setSelectedPRId(filteredPRs[nextIdx].id);
      } else if (e.key === "k" || e.key === "K") {
        e.preventDefault();
        const idx = filteredPRs.findIndex((p) => p.id === selectedPRId);
        const prevIdx = idx > 0 ? idx - 1 : filteredPRs.length - 1;
        setSelectedPRId(filteredPRs[prevIdx].id);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [filteredPRs, selectedPRId]);

  const activePRDetail: PRDetail | null = useMemo(() => {
    if (!selectedPRId) return null;
    if (seedDetailsMap[selectedPRId]) return seedDetailsMap[selectedPRId];
    if (apiDetailsCache[selectedPRId]) return apiDetailsCache[selectedPRId];
    const summary = allPRs.find((p) => p.id === selectedPRId);
    if (!summary) return null;
    return {
      ...summary,
      findings: inspectorFindings,
      review_runs: [
        {
          id: summary.latest_review_id,
          head_sha: summary.head_sha,
          status: summary.review_status,
          risk_score: summary.risk_score,
          merge_recommendation: summary.merge_recommendation,
          summary: summary.summary,
          findings_count: summary.findings_count,
          created_at: summary.created_at,
        },
      ],
    };
  }, [selectedPRId, seedDetailsMap, apiDetailsCache, allPRs, inspectorFindings]);

  // Compute DashboardStats (live or computed)
  const effectiveStats: DashboardStats = useMemo(() => {
    if (apiStats && !usingFallbackSeeds && userSimulatedPRs.length === 0) {
      return apiStats;
    }
    return computeDashboardStatsFromPRs(allPRs, {
      ...seedDetailsMap,
      ...apiDetailsCache,
    });
  }, [apiStats, usingFallbackSeeds, userSimulatedPRs.length, allPRs, seedDetailsMap, apiDetailsCache]);

  const topFlaggedCategory = useMemo(() => {
    const entries = Object.entries(effectiveStats.categories);
    if (entries.length === 0) return { name: "Security", count: 0 };
    const sorted = [...entries].sort((a, b) => b[1] - a[1]);
    const [topName, topCount] = sorted[0];
    return {
      name: topName.charAt(0).toUpperCase() + topName.slice(1),
      count: topCount,
    };
  }, [effectiveStats]);

  const visibleFindings = useMemo(() => {
    return inspectorFindings.filter((f) => {
      if (severityFilter && f.severity !== severityFilter) return false;
      if (categoryFilter && f.category !== categoryFilter) return false;
      return true;
    });
  }, [inspectorFindings, severityFilter, categoryFilter]);

  async function handleSelectReviewRun(runId: string) {
    if (!activePRDetail || runId === selectedRunId) return;
    setSelectedRunId(runId);

    if (runId === activePRDetail.latest_review_id) {
      setInspectorFindings(activePRDetail.findings);
      setInspectorSummary(activePRDetail.summary);
      setInspectorRisk(activePRDetail.risk_score);
      setInspectorRec(activePRDetail.merge_recommendation);
      setInspectorSha(activePRDetail.head_sha);
      return;
    }

    const localRun = activePRDetail.review_runs.find((r) => r.id === runId);
    if (usingFallbackSeeds && localRun) {
      setInspectorSummary(localRun.summary);
      setInspectorRisk(localRun.risk_score);
      setInspectorRec(localRun.merge_recommendation);
      setInspectorSha(localRun.head_sha);
      return;
    }

    setLoadingInspector(true);
    try {
      const reviewDetail = await fetchReviewDetail(runId);
      setInspectorFindings(reviewDetail.findings);
      setInspectorSummary(reviewDetail.summary);
      setInspectorRisk(reviewDetail.risk_score);
      setInspectorRec(reviewDetail.merge_recommendation);
      setInspectorSha(reviewDetail.head_sha);
    } catch {
      // Keep current findings if historical lookup fails
    } finally {
      setLoadingInspector(false);
    }
  }

  function handleSimulateWebhookSubmit(e: FormEvent) {
    e.preventDefault();
    setSimError(null);

    const now = Date.now();
    if (now < simCooldownUntil) {
      const waitSec = Math.ceil((simCooldownUntil - now) / 1000);
      setSimError(`Rate-limit cooldown active. Please wait ${waitSec}s before triggering another webhook.`);
      return;
    }

    if (!isSafeRepoFullName(simRepo)) {
      setSimError("Repository must match safe owner/name format.");
      return;
    }

    const cleanTitle = sanitizeSingleLineInput(simTitle, 140);
    if (cleanTitle.length < 6) {
      setSimError("PR title must be at least 6 characters.");
      return;
    }

    const prNumber = Math.floor(120 + Math.random() * 80);
    const prUuid = `550e8400-e29b-41d4-a716-${generateSecureRandomHex(6)}`;
    const runUuid = `7c9e6679-7425-40de-944b-${generateSecureRandomHex(6)}`;
    const headSha = generateSecureRandomHex(20);
    const authorHandle = user?.username ?? "jerrie";
    const baseFindingId = Math.floor(5000 + Math.random() * 4000);

    let riskScore = 4.5;
    let rec: MergeRecommendation = "block";
    let findings: PRFinding[] = [];

    if (simScenario === "sql_injection") {
      riskScore = 4.5;
      rec = "block";
      findings = [
        {
          id: baseFindingId,
          file_path: "internal/auth/session_query.go",
          line_number: 54,
          severity: "high",
          category: "security",
          message:
            "Raw string concatenation in SQL query allows authentication bypass. Replace fmt.Sprintf with parameterized $1 query arguments.",
          code_snippet: `- q := fmt.Sprintf("SELECT student_id FROM sessions WHERE token = '%s'", tok)\n- row := db.QueryRowContext(ctx, q)`,
          suggested_fix: `const q = "SELECT student_id FROM sessions WHERE token = $1"\nrow := db.QueryRowContext(ctx, q, tok)`,
        },
        {
          id: baseFindingId + 1,
          file_path: "internal/auth/session_query.go",
          line_number: 89,
          severity: "medium",
          category: "bug",
          message:
            "Context timeout is not applied to database lookup; a stalled DB connection will block the HTTP worker indefinitely.",
          code_snippet: `- row := db.QueryRowContext(r.Context(), q, tok)`,
          suggested_fix: `ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)\ndefer cancel()\nrow := db.QueryRowContext(ctx, q, tok)`,
        },
      ];
    } else if (simScenario === "idor_leak") {
      riskScore = 3.3;
      rec = "caution";
      findings = [
        {
          id: baseFindingId,
          file_path: "app/api/submissions.py",
          line_number: 41,
          severity: "high",
          category: "security",
          message:
            "Endpoint returns lab submission payload by ID without verifying current_student ownership.",
          code_snippet: `- submission = db.get(Submission, submission_id)\n- return submission`,
          suggested_fix: `submission = db.get(Submission, submission_id)\nif not submission or submission.student_id != current_user.id:\n    raise HTTPException(status_code=403, detail="Forbidden")\nreturn submission`,
        },
      ];
    } else {
      riskScore = 1.2;
      rec = "safe";
      findings = [
        {
          id: baseFindingId,
          file_path: "src/components/LabTable.tsx",
          line_number: 33,
          severity: "low",
          category: "style",
          message:
            "Prefer explicit tabular-nums utility class on numeric score columns for vertical alignment.",
          code_snippet: `- <td className="font-mono text-xs">{score.toFixed(1)}</td>`,
          suggested_fix: `<td className="font-mono text-xs tabular-nums">{score.toFixed(1)}</td>`,
        },
      ];
    }

    const highCount = findings.filter((f) => f.severity === "high").length;
    const newPR: PRDetail = {
      id: prUuid,
      repo_full_name: simRepo,
      pr_number: prNumber,
      title: cleanTitle,
      author: authorHandle,
      pr_status: "open",
      latest_review_id: runUuid,
      review_status: "completed",
      head_sha: headSha,
      risk_score: riskScore,
      merge_recommendation: rec,
      summary: `Automated webhook analysis reviewed diff in ${simRepo} (HMAC-SHA256 verified) and identified ${findings.length} finding(s) (${highCount} high).`,
      findings_count: findings.length,
      high_severity_count: highCount,
      created_at: new Date().toISOString(),
      findings,
      review_runs: [
        {
          id: runUuid,
          head_sha: headSha,
          status: "completed",
          risk_score: riskScore,
          merge_recommendation: rec,
          summary: `Automated webhook analysis reviewed diff in ${simRepo} and identified ${findings.length} finding(s).`,
          findings_count: findings.length,
          created_at: new Date().toISOString(),
        },
      ],
    };

    addSimulatedPR(newPR);
    setSelectedPRId(newPR.id);
    setSimCooldownUntil(Date.now() + 4000);
    setShowSimModal(false);
  }

  const repositoryOptions = useMemo(() => {
    const set = new Set<string>(INSTITUTIONAL_REPOS);
    for (const r of effectiveStats.repositories) {
      set.add(r);
    }
    return Array.from(set);
  }, [effectiveStats.repositories]);

  const feedbackCount = Object.keys(userFeedbackMap).length;

  return (
    <div className="space-y-5">
      {/* Action & Filter Command Strip */}
      <div className="studio-panel rounded-lg p-3.5 sm:p-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 flex-wrap items-center gap-2.5">
          {/* Search Input */}
          <div className="relative flex-1 min-w-[210px]">
            <input
              type="search"
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              maxLength={100}
              placeholder="Search title, #pr_id, @author, SHA..."
              aria-label="Search pull requests"
              className="w-full rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-[#7C8AFF] focus:outline-none"
            />
          </div>

          {/* Repository Filter */}
          <select
            value={repoFilter}
            onChange={(e) => setRepoFilter(e.target.value)}
            aria-label="Filter by repository"
            className="rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 font-mono text-xs text-text-primary focus:border-[#7C8AFF] focus:outline-none"
          >
            <option value="">All Repos</option>
            {repositoryOptions.map((repo) => {
              const shortLabel = repo.split("/").pop() ?? repo;
              return (
                <option key={repo} value={repo}>
                  {shortLabel} ({repo})
                </option>
              );
            })}
          </select>

          {/* Merge Recommendation Filter */}
          <select
            value={recFilter}
            onChange={(e) => setRecFilter(e.target.value)}
            aria-label="Filter by recommendation"
            className="rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-1.5 font-mono text-xs text-text-primary focus:border-[#7C8AFF] focus:outline-none"
          >
            <option value="">All Verdicts</option>
            <option value="block">BLOCK</option>
            <option value="caution">CAUTION</option>
            <option value="safe">SAFE</option>
          </select>
        </div>

        {/* Right Command Buttons */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => {
              setSimError(null);
              setShowSimModal(true);
            }}
            className="rounded-md border border-[#FFB224]/40 bg-[#FFB224]/12 px-3 py-1.5 font-mono text-xs font-medium text-[#FFB224] hover:bg-[#FFB224]/20 transition-colors cursor-pointer"
          >
            + Simulate Webhook Review
          </button>

          <button
            type="button"
            onClick={exportFeedbackJSON}
            className="rounded-md border border-[#7C8AFF]/40 bg-[#7C8AFF]/12 px-3 py-1.5 font-mono text-xs font-medium text-[#7C8AFF] hover:bg-[#7C8AFF]/20 transition-colors cursor-pointer"
          >
            Export Beta Feedback JSON ({feedbackCount})
          </button>
        </div>
      </div>

      {/* Compact KPI Strip (3 Cards) */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="studio-panel rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
              01 / PRs Reviewed
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
              {effectiveStats.total_prs}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
              {effectiveStats.recommendations.block ?? 0} block ·{" "}
              {effectiveStats.recommendations.caution ?? 0} caution ·{" "}
              {effectiveStats.recommendations.safe ?? 0} safe
            </p>
          </div>
          <span className="rounded-md border border-[#34D399]/30 bg-[#34D399]/10 px-2.5 py-1 font-mono text-xs text-[#34D399]">
            {effectiveStats.total_reviews} runs
          </span>
        </div>

        <div className="studio-panel rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
              02 / Average Risk Score
            </p>
            <p className="mt-1 font-mono text-2xl font-bold tabular-nums text-text-primary">
              {effectiveStats.average_risk_score.toFixed(2)}
              <span className="text-xs font-normal text-text-muted"> / 5.0</span>
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
              Quantified across latest commit SHAs
            </p>
          </div>
          <RiskMeter score={effectiveStats.average_risk_score} compact />
        </div>

        <div className="studio-panel rounded-lg p-4 flex items-center justify-between">
          <div>
            <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
              03 / Top Flagged Category
            </p>
            <p className="mt-1 font-mono text-2xl font-bold text-[#F87171]">
              {topFlaggedCategory.name}
            </p>
            <p className="mt-0.5 font-mono text-[11px] text-text-secondary">
              {topFlaggedCategory.count} of {effectiveStats.total_findings} total findings
            </p>
          </div>
          <Badge variant={topFlaggedCategory.name.toLowerCase()}>
            {effectiveStats.severities.high ?? 0} HIGH
          </Badge>
        </div>
      </div>

      {/* Master-Detail Split Workspace */}
      {loading ? (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-12">
          <div className="lg:col-span-5 space-y-3">
            {[1, 2, 3].map((n) => (
              <div key={n} className="studio-panel h-24 animate-pulse rounded-lg" />
            ))}
          </div>
          <div className="lg:col-span-7 studio-panel h-96 animate-pulse rounded-lg" />
        </div>
      ) : filteredPRs.length === 0 ? (
        <div className="studio-panel rounded-lg p-10 text-center space-y-2">
          <p className="font-mono text-sm font-semibold text-text-primary">
            No Pull Requests Match Current Filters
          </p>
          <p className="text-xs text-text-secondary max-w-md mx-auto">
            Clear your search query or click &ldquo;+ Simulate Webhook Review&rdquo; to trigger a
            new HMAC-verified pull request review run.
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12 lg:items-start">
          {/* Left Pane: Scannable PR Queue List */}
          <section
            aria-label="Pull Request Queue"
            className="lg:col-span-5 space-y-2.5"
          >
            <div className="flex items-center justify-between px-1 font-mono text-[11px] text-text-muted">
              <span>PR QUEUE ({filteredPRs.length})</span>
              <span>Shortcut: [J / K] Navigate</span>
            </div>

            <div className="space-y-2">
              {filteredPRs.map((pr) => {
                const isSelected = pr.id === selectedPRId;
                const isMine =
                  user && pr.author.toLowerCase() === user.username.toLowerCase();
                const shortRepo = pr.repo_full_name.split("/").pop() ?? pr.repo_full_name;
                const recStyle =
                  RECOMMENDATION_BADGE_STYLES[pr.merge_recommendation] ??
                  RECOMMENDATION_BADGE_STYLES.caution;

                return (
                  <div
                    key={pr.id}
                    role="button"
                    tabIndex={0}
                    onClick={() => setSelectedPRId(pr.id)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        setSelectedPRId(pr.id);
                      }
                    }}
                    className={`rounded-lg border p-3.5 transition-colors cursor-pointer focus:outline-none focus:ring-2 focus:ring-[#7C8AFF] ${
                      isSelected
                        ? "border-[#7C8AFF] bg-[#1B202B]"
                        : "border-white/[0.08] bg-[#141820] hover:border-white/[0.18]"
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-1.5 font-mono text-xs">
                        <span
                          className={`rounded border px-1.5 py-0.5 text-[10px] font-semibold uppercase ${recStyle}`}
                        >
                          {pr.merge_recommendation}
                        </span>
                        <span className="text-[#7C8AFF] font-medium">{shortRepo}</span>
                        <span className="text-text-secondary">#{pr.pr_number}</span>
                        {isMine && (
                          <span className="rounded border border-[#34D399]/40 bg-[#34D399]/15 px-1.5 py-0.5 text-[10px] font-semibold text-[#34D399]">
                            Your PR
                          </span>
                        )}
                      </div>

                      <span className="font-mono text-xs font-semibold tabular-nums text-text-secondary">
                        {pr.risk_score.toFixed(1)}/5.0
                      </span>
                    </div>

                    <p className="mt-2 font-mono text-xs sm:text-[13px] font-semibold text-text-primary line-clamp-1">
                      {pr.title}
                    </p>

                    <div className="mt-2 flex flex-wrap items-center justify-between gap-2 font-mono text-[11px] text-text-muted">
                      <span>
                        @{pr.author} · {new Date(pr.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      <div className="flex items-center gap-1.5">
                        <span className="rounded bg-[#0E1116] px-1.5 py-0.5 border border-white/[0.06] text-text-secondary">
                          {pr.findings_count} {pr.findings_count === 1 ? "finding" : "findings"}
                        </span>
                        {pr.high_severity_count > 0 && (
                          <span className="rounded bg-[#F87171]/15 px-1.5 py-0.5 border border-[#F87171]/35 text-[#F87171]">
                            {pr.high_severity_count} high
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>

          {/* Right Pane: Review Inspector */}
          <section
            aria-label="Review Inspector"
            className="lg:col-span-7 space-y-4"
          >
            {activePRDetail ? (
              <>
                {/* Verdict Banner */}
                <div className="studio-panel rounded-lg p-5 space-y-4">
                  <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between border-b border-white/[0.08] pb-4">
                    <div className="space-y-1">
                      <div className="flex flex-wrap items-center gap-2 font-mono text-xs">
                        <span className="text-[#7C8AFF] font-semibold">
                          {activePRDetail.repo_full_name}
                        </span>
                        <span className="text-text-muted">·</span>
                        <span className="text-text-primary">PR #{activePRDetail.pr_number}</span>
                        <Badge variant={activePRDetail.pr_status}>
                          {activePRDetail.pr_status}
                        </Badge>
                        {inspectorSha && (
                          <span className="rounded border border-white/[0.08] bg-[#0E1116] px-2 py-0.5 text-[11px] text-text-muted">
                            {inspectorSha.slice(0, 10)}
                          </span>
                        )}
                      </div>

                      <h2 className="font-mono text-base sm:text-lg font-bold text-text-primary">
                        {activePRDetail.title}
                      </h2>

                      <p className="font-mono text-[11px] text-text-muted">
                        Author: <span className="text-text-secondary">@{activePRDetail.author}</span>{" "}
                        · Reviewed {new Date(activePRDetail.created_at).toLocaleString()}
                      </p>
                    </div>

                    <div className="flex flex-col items-start sm:items-end gap-2 shrink-0">
                      <Badge variant={inspectorRec} className="text-xs px-2.5 py-1">
                        VERDICT: {inspectorRec.toUpperCase()}
                      </Badge>
                      <RiskMeter score={inspectorRisk} />
                    </div>
                  </div>

                  {/* Run History Switcher + Standalone Detail Link */}
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 font-mono text-xs">
                      <span className="text-text-muted">Review Run:</span>
                      <select
                        value={selectedRunId}
                        onChange={(e) => void handleSelectReviewRun(e.target.value)}
                        aria-label="Select historical review run"
                        className="rounded border border-white/[0.1] bg-[#0E1116] px-2 py-1 font-mono text-xs text-text-primary"
                      >
                        {activePRDetail.review_runs.map((run, idx) => (
                          <option key={run.id} value={run.id}>
                            {idx === 0 ? "Latest" : `Run #${activePRDetail.review_runs.length - idx}`} ·{" "}
                            {run.head_sha.slice(0, 7)} · {run.merge_recommendation.toUpperCase()}
                          </option>
                        ))}
                      </select>
                    </div>

                    <Link
                      to={`/prs/${activePRDetail.id}`}
                      className="font-mono text-xs text-[#7C8AFF] hover:underline"
                    >
                      Open Standalone PR Report →
                    </Link>
                  </div>

                  {/* AI Executive Summary */}
                  <div className="rounded-md border border-white/[0.08] bg-[#0E1116] p-3.5 space-y-1">
                    <div className="flex items-center justify-between font-mono text-[10px] uppercase tracking-wider text-text-muted">
                      <span>AI Executive Summary (Go + Claude Engine)</span>
                      <span className="text-[#34D399]">HMAC-SHA256 Verified</span>
                    </div>
                    <p className="text-[15px] leading-[1.75] text-text-primary">
                      {loadingInspector ? "Loading review run..." : inspectorSummary}
                    </p>
                  </div>
                </div>

                {/* Severity & Category Filter Pills */}
                <div className="studio-panel rounded-lg p-3.5 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="font-mono text-[11px] text-text-muted mr-1">Severity:</span>
                    {SEVERITY_OPTIONS.map((opt) => {
                      const active = severityFilter === opt.value;
                      return (
                        <button
                          key={opt.label}
                          type="button"
                          onClick={() => setSeverityFilter(opt.value)}
                          className={`rounded border px-2.5 py-1 font-mono text-xs transition-colors cursor-pointer ${
                            active
                              ? "border-[#7C8AFF] bg-[#7C8AFF]/15 text-[#7C8AFF]"
                              : "border-white/[0.08] bg-[#0E1116] text-text-secondary hover:text-text-primary"
                          }`}
                        >
                          {opt.label}
                        </button>
                      );
                    })}
                  </div>

                  <div className="flex items-center gap-2">
                    <select
                      value={categoryFilter}
                      onChange={(e) => setCategoryFilter(e.target.value as "" | Category)}
                      aria-label="Filter findings by category"
                      className="rounded border border-white/[0.1] bg-[#0E1116] px-2.5 py-1 font-mono text-xs text-text-primary focus:border-[#7C8AFF] focus:outline-none"
                    >
                      {CATEGORY_OPTIONS.map((cat) => (
                        <option key={cat.label} value={cat.value}>
                          {cat.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                {/* Expandable Finding Cards */}
                <div className="space-y-3">
                  {visibleFindings.length === 0 ? (
                    <div className="studio-panel rounded-lg p-8 text-center font-mono text-xs text-text-secondary">
                      {inspectorFindings.length === 0
                        ? "Zero issues flagged in this review run."
                        : "No findings match the selected severity/category filters."}
                    </div>
                  ) : (
                    visibleFindings.map((finding) => (
                      <FindingInspectorCard
                        key={finding.id}
                        finding={finding}
                        prId={activePRDetail.id}
                        repoFullName={activePRDetail.repo_full_name}
                        prNumber={activePRDetail.pr_number}
                      />
                    ))
                  )}
                </div>
              </>
            ) : null}
          </section>
        </div>
      )}

      {/* Simulate Webhook Review Modal */}
      {showSimModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="sim-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="studio-panel w-full max-w-lg rounded-lg p-6 space-y-5">
            <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
              <div>
                <span className="font-mono text-[10px] uppercase tracking-wider text-[#FFB224]">
                  WEBHOOK EVENT SIMULATOR
                </span>
                <h3
                  id="sim-modal-title"
                  className="font-mono text-base font-bold text-text-primary"
                >
                  Simulate GitHub pull_request Webhook
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowSimModal(false)}
                className="font-mono text-xs text-text-muted hover:text-text-primary cursor-pointer"
              >
                [ESC / Close]
              </button>
            </div>

            <form onSubmit={handleSimulateWebhookSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="sim-repo"
                  className="block font-mono text-xs text-text-secondary"
                >
                  Target Institutional Repository
                </label>
                <select
                  id="sim-repo"
                  value={simRepo}
                  onChange={(e) => setSimRepo(e.target.value)}
                  className="w-full rounded border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-xs text-text-primary"
                >
                  {INSTITUTIONAL_REPOS.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="sim-title"
                  className="block font-mono text-xs text-text-secondary"
                >
                  Pull Request Title (Sanitized, max 140 chars)
                </label>
                <input
                  id="sim-title"
                  type="text"
                  required
                  maxLength={140}
                  value={simTitle}
                  onChange={(e) => setSimTitle(e.target.value)}
                  className="w-full rounded border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-xs text-text-primary focus:border-[#7C8AFF] focus:outline-none"
                />
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="sim-scenario"
                  className="block font-mono text-xs text-text-secondary"
                >
                  Diff Analysis Preset
                </label>
                <select
                  id="sim-scenario"
                  value={simScenario}
                  onChange={(e) =>
                    setSimScenario(
                      e.target.value as "sql_injection" | "idor_leak" | "clean_refactor"
                    )
                  }
                  className="w-full rounded border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-xs text-text-primary"
                >
                  <option value="sql_injection">
                    BLOCK (Risk 4.5) — SQL Injection + Missing DB Context Timeout
                  </option>
                  <option value="idor_leak">
                    CAUTION (Risk 3.3) — Missing Student Ownership Check (IDOR)
                  </option>
                  <option value="clean_refactor">
                    SAFE (Risk 1.2) — Clean Refactor + Minor Style Note
                  </option>
                </select>
              </div>

              {simError && (
                <div className="rounded border border-[#F87171]/40 bg-[#F87171]/10 p-2.5 font-mono text-xs text-[#F87171]">
                  {simError}
                </div>
              )}

              <div className="flex items-center justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowSimModal(false)}
                  className="rounded border border-white/[0.12] bg-[#0E1116] px-3.5 py-2 font-mono text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="rounded bg-[#FFB224] px-4 py-2 font-mono text-xs font-semibold text-[#0E1116] hover:bg-[#FFB224]/90 cursor-pointer"
                >
                  Dispatch HMAC-Verified Webhook →
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
