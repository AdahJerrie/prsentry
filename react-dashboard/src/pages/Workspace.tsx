import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { checkApiHealth, fetchPRDetail, fetchPRs } from "../api/client";
import CodeRain from "../components/atmosphere/CodeRain";
import CommandBar from "../components/workspace/CommandBar";
import KpiStrip from "../components/workspace/KpiStrip";
import PRQueue from "../components/workspace/PRQueue";
import ReviewInspector from "../components/workspace/ReviewInspector";
import {
  DEMO_REPO_OPTIONS,
  SAMPLE_REVIEWS,
  createSimulatedReview,
  type QueueItem,
  type ReviewFinding,
} from "../data/sampleReviews";
import {
  downloadFeedback,
  loadFeedback,
  upsertFeedback,
  type BetaFeedbackEntry,
} from "../lib/feedbackStore";
import type { Category, Severity } from "../types/api";

function isSampleId(id: string): boolean {
  return id.startsWith("sample-") || id.startsWith("sim-");
}

function repoMatches(fullName: string, filter: string): boolean {
  if (filter === "All Repos") return true;
  return fullName === filter || fullName.endsWith(`/${filter}`) || fullName.endsWith(filter);
}

export default function Workspace() {
  const { id: routeId } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const [live, setLive] = useState<QueueItem[]>([]);
  const [extra, setExtra] = useState<QueueItem[]>([]);
  const [findings, setFindings] = useState<Record<string, ReviewFinding[]>>({});
  const [selectedId, setSelectedId] = useState(routeId ?? SAMPLE_REVIEWS[0]?.id ?? "");
  const [incomingId, setIncomingId] = useState("");
  const [repo, setRepo] = useState<string>("All Repos");
  const [query, setQuery] = useState("");
  const [severity, setSeverity] = useState<"all" | Severity>("all");
  const [category, setCategory] = useState<"all" | Category>("all");
  const [loadingFindings, setLoadingFindings] = useState(false);
  const [findingsError, setFindingsError] = useState<string | null>(null);
  const [apiHealthy, setApiHealthy] = useState<boolean | null>(null);
  const [mobileInspector, setMobileInspector] = useState(Boolean(routeId));
  const [feedback, setFeedback] = useState<BetaFeedbackEntry[]>(() => loadFeedback());

  useEffect(() => {
    const controller = new AbortController();
    checkApiHealth(controller.signal).then(setApiHealthy);
    fetchPRs({ limit: 50 }, controller.signal)
      .then((rows) => setLive(rows))
      .catch(() => setLive([]));
    return () => controller.abort();
  }, []);

  const queue = useMemo(() => {
    const seen = new Set<string>();
    const merged = [...extra, ...live, ...SAMPLE_REVIEWS].filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    });
    const needle = query.trim().toLowerCase().replace(/^#/, "");
    return merged.filter((item) => {
      if (!repoMatches(item.repo_full_name, repo)) return false;
      if (!needle) return true;
      return (
        item.title.toLowerCase().includes(needle) ||
        item.author.toLowerCase().includes(needle) ||
        String(item.pr_number) === needle ||
        `#${item.pr_number}` === `#${needle}`
      );
    });
  }, [extra, live, query, repo]);

  const selected = queue.find((item) => item.id === selectedId) ?? queue[0] ?? null;

  useEffect(() => {
    if (!selected) return;
    if (selected.findings || findings[selected.id] || isSampleId(selected.id)) {
      if (selected.findings) {
        setFindings((current) =>
          current[selected.id] ? current : { ...current, [selected.id]: selected.findings ?? [] },
        );
      }
      return;
    }
    let cancelled = false;
    setLoadingFindings(true);
    setFindingsError(null);
    fetchPRDetail(selected.id)
      .then((detail) => {
        if (!cancelled) {
          setFindings((current) => ({ ...current, [selected.id]: detail.findings }));
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setFindingsError(err instanceof Error ? err.message : "Could not load findings");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingFindings(false);
      });
    return () => {
      cancelled = true;
    };
  }, [findings, selected]);

  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      const target = event.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable) {
        return;
      }
      if (event.key !== "j" && event.key !== "k" && event.key !== "J" && event.key !== "K") return;
      if (queue.length === 0) return;
      const index = Math.max(0, queue.findIndex((item) => item.id === selected?.id));
      const next = event.key.toLowerCase() === "j"
        ? Math.min(queue.length - 1, index + 1)
        : Math.max(0, index - 1);
      const item = queue[next];
      if (!item) return;
      setSelectedId(item.id);
      setMobileInspector(true);
      navigate(`/prs/${item.id}`);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [navigate, queue, selected?.id]);

  function select(id: string) {
    setSelectedId(id);
    setSeverity("all");
    setCategory("all");
    setMobileInspector(true);
    navigate(`/prs/${id}`);
  }

  function simulate() {
    const item = createSimulatedReview();
    setExtra((current) => [item, ...current]);
    setIncomingId(item.id);
    window.setTimeout(() => setIncomingId(""), 1200);
    select(item.id);
  }

  const activeFindings = selected
    ? findings[selected.id] ?? selected.findings ?? []
    : [];

  const kpis = useMemo(() => {
    const reviewed = queue.length;
    const averageRisk = reviewed
      ? queue.reduce((sum, item) => sum + item.risk_score, 0) / reviewed
      : 0;
    const counts = new Map<string, number>();
    queue.forEach((item) => {
      (item.findings ?? findings[item.id] ?? []).forEach((finding) => {
        counts.set(finding.category, (counts.get(finding.category) ?? 0) + 1);
      });
    });
    let topCategory = "—";
    let topCount = 0;
    counts.forEach((count, name) => {
      if (count > topCount) {
        topCount = count;
        topCategory = name;
      }
    });
    return { reviewed, averageRisk, topCategory };
  }, [findings, queue]);

  const repos = useMemo(() => {
    const names = new Set<string>(DEMO_REPO_OPTIONS);
    [...live, ...extra].forEach((item) => names.add(item.repo_full_name));
    return Array.from(names);
  }, [extra, live]);

  return (
    <div className="relative min-h-screen">
      <div className="studio-base fixed inset-0" />
      <div className="studio-noise pointer-events-none fixed inset-0" />
      <div className="studio-vignette pointer-events-none fixed inset-0" />
      <div className="pointer-events-none fixed inset-x-0 top-0 h-[420px] [mask-image:linear-gradient(to_bottom,#000_0%,#000_35%,transparent_92%)]">
        <CodeRain />
      </div>

      <div className="relative z-10 mx-auto flex min-h-screen max-w-6xl flex-col gap-3 px-3 py-3 sm:px-4 sm:py-4">
        <CommandBar
          repos={repos}
          repo={repo}
          query={query}
          apiHealthy={apiHealthy}
          onRepoChange={setRepo}
          onQueryChange={setQuery}
          onSimulate={simulate}
          onExport={() => downloadFeedback(feedback)}
          exportDisabled={feedback.length === 0}
        />
        <KpiStrip
          reviewed={kpis.reviewed}
          averageRisk={kpis.averageRisk}
          topCategory={kpis.topCategory}
        />

        <div className="grid min-h-[70vh] overflow-hidden rounded-xl border border-white/15 bg-[#14181f]/75 shadow-[inset_0_1px_0_rgba(255,255,255,0.08)] lg:grid-cols-[minmax(280px,340px)_minmax(0,1fr)] lg:h-[calc(100vh-210px)]">
          <div className={`${mobileInspector ? "hidden" : "block"} min-h-[420px] lg:block lg:min-h-0 lg:border-r lg:border-white/10`}>
            <PRQueue
              items={queue}
              selectedId={selected?.id ?? ""}
              incomingId={incomingId}
              onSelect={select}
            />
          </div>
          <div className={`${mobileInspector ? "block" : "hidden"} min-h-[420px] lg:block lg:min-h-0`}>
            <ReviewInspector
              item={selected}
              findings={activeFindings}
              loading={loadingFindings && activeFindings.length === 0}
              error={findingsError}
              severity={severity}
              category={category}
              feedback={feedback}
              onSeverity={setSeverity}
              onCategory={setCategory}
              onFeedback={(entry) => setFeedback(upsertFeedback(entry))}
              onBack={() => setMobileInspector(false)}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
