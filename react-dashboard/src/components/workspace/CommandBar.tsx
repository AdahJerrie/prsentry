import { Download, Radio, Search } from "lucide-react";
import type { FormEvent } from "react";

interface CommandBarProps {
  repos: string[];
  repo: string;
  query: string;
  apiHealthy: boolean | null;
  onRepoChange: (repo: string) => void;
  onQueryChange: (query: string) => void;
  onSimulate: () => void;
  onExport: () => void;
  exportDisabled: boolean;
}

export default function CommandBar({
  repos,
  repo,
  query,
  apiHealthy,
  onRepoChange,
  onQueryChange,
  onSimulate,
  onExport,
  exportDisabled,
}: CommandBarProps) {
  function handleSubmit(event: FormEvent) {
    event.preventDefault();
  }

  const apiLabel =
    apiHealthy === null ? "API CHECK" : apiHealthy ? "API OK" : "API OFFLINE";

  return (
    <header className="flex flex-col gap-3 rounded-xl border border-white/10 bg-[#14181f]/80 px-3 py-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.07)] backdrop-blur-md sm:px-4 lg:flex-row lg:items-center lg:justify-between">
      <div className="flex min-w-0 items-center gap-3">
        <div className="grid h-8 w-8 shrink-0 place-items-center rounded-lg border border-amber/40 bg-amber/10 font-mono text-xs font-semibold text-amber">
          PS
        </div>
        <div className="min-w-0">
          <div className="flex items-center gap-2">
            <span className="text-sm font-semibold tracking-tight">PRSentry</span>
            <span className="rounded-full border border-white/10 px-2 py-0.5 font-mono text-[10px] tracking-[0.12em] text-text-secondary">
              v1.0-beta
            </span>
          </div>
          <p className="truncate text-xs text-text-muted">Review feedback for campus pull requests</p>
        </div>
      </div>

      <form
        onSubmit={handleSubmit}
        className="grid flex-1 grid-cols-1 gap-2 sm:grid-cols-[minmax(0,180px)_minmax(0,1fr)_auto] lg:max-w-3xl"
      >
        <label className="sr-only" htmlFor="repo-filter">
          Repository
        </label>
        <select
          id="repo-filter"
          value={repo}
          onChange={(event) => onRepoChange(event.target.value)}
          className="h-9 rounded-lg border border-white/10 bg-bg-primary/80 px-2 font-mono text-xs text-text-primary focus:border-amber/60 focus:outline-none"
        >
          {repos.map((name) => (
            <option key={name} value={name}>
              {name === "All Repos" ? name : name.split("/").pop()}
            </option>
          ))}
        </select>

        <div className="relative">
          <Search
            aria-hidden="true"
            strokeWidth={1.5}
            className="pointer-events-none absolute left-2.5 top-2.5 h-4 w-4 text-text-muted"
          />
          <label className="sr-only" htmlFor="pr-search">
            Search pull requests
          </label>
          <input
            id="pr-search"
            type="search"
            value={query}
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Title, author, or #18"
            className="h-9 w-full rounded-lg border border-white/10 bg-bg-primary/80 pl-8 pr-3 text-sm text-text-primary placeholder:text-text-muted focus:border-amber/60 focus:outline-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onSimulate}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-white/4 px-3 text-xs font-medium text-text-primary hover:bg-white/8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            <Radio strokeWidth={1.5} className="h-3.5 w-3.5 text-amber" />
            Simulate Webhook Review
          </button>
          <button
            type="button"
            onClick={onExport}
            disabled={exportDisabled}
            className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-white/15 bg-text-primary px-3 text-xs font-semibold text-bg-primary disabled:cursor-not-allowed disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber"
          >
            <Download strokeWidth={1.5} className="h-3.5 w-3.5" />
            Export Beta Feedback JSON
          </button>
        </div>
      </form>

      <p
        role="status"
        className={`inline-flex items-center gap-2 self-start rounded-full border border-white/10 px-2.5 py-1 font-mono text-[10px] tracking-[0.12em] lg:self-center ${
          apiHealthy ? "text-success" : "text-amber"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full ${apiHealthy ? "bg-success" : "bg-amber"}`}
        />
        {apiLabel}
      </p>
    </header>
  );
}
