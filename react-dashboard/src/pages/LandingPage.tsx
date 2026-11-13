import { useCallback, useState } from "react";
import { useNavigate } from "react-router-dom";
import Badge from "../components/Badge";
import FallingCodeCanvas from "../components/FallingCodeCanvas";
import RiskMeter from "../components/RiskMeter";
import { useAuth } from "../context/AuthContext";
import { SEED_PR_DETAILS, getFindingRemediation } from "../data/institutionalSeeds";

export default function LandingPage() {
  const navigate = useNavigate();
  const { user, isLocked } = useAuth();
  const [rainPaused, setRainPaused] = useState(false);
  const [selectedFindingIdx, setSelectedFindingIdx] = useState(0);
  const [copiedDemoFix, setCopiedDemoFix] = useState(false);

  const previewPR = SEED_PR_DETAILS[0];
  const activeFinding = previewPR.findings[selectedFindingIdx] ?? previewPR.findings[0];
  const activeRemediation = getFindingRemediation(activeFinding);

  const handleToggleRain = useCallback(() => {
    setRainPaused((prev) => !prev);
  }, []);

  const handleProceedToDashboard = () => {
    if (user && !isLocked) {
      navigate("/dashboard");
    } else {
      navigate("/auth");
    }
  };

  const handleCopyPreviewFix = async () => {
    try {
      await navigator.clipboard.writeText(activeRemediation.suggested_fix);
      setCopiedDemoFix(true);
      window.setTimeout(() => setCopiedDemoFix(false), 1800);
    } catch {
      // Clipboard API unavailable
    }
  };

  return (
    <div className="studio-canvas min-h-screen text-text-primary flex flex-col relative">
      <div className="studio-noise-overlay" aria-hidden="true" />

      {/* Top 620px Hero Ambient Falling Code Rain */}
      <FallingCodeCanvas paused={rainPaused} onTogglePause={handleToggleRain} />

      {/* Sticky Glass-Hairline Header */}
      <header className="sticky top-0 z-30 border-b border-white/[0.08] bg-[#0E1116]/85 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3.5 sm:px-6">
          <div className="flex items-center gap-3">
            <a
              href="#top"
              className="flex items-center gap-2.5 group focus:outline-none focus:ring-2 focus:ring-[#7C8AFF] rounded-md"
            >
              <span className="flex h-8 w-8 items-center justify-center rounded-md bg-[#141820] border border-white/[0.12] font-mono text-sm font-bold text-[#FFB224]">
                ◈
              </span>
              <span className="font-mono text-base font-semibold tracking-tight text-text-primary group-hover:text-[#7C8AFF] transition-colors">
                PRSentry
              </span>
            </a>

            <span className="rounded border border-white/[0.1] bg-[#141820] px-2 py-0.5 font-mono text-[11px] text-text-secondary">
              v1.0-beta
            </span>

            <span className="hidden sm:inline-flex items-center gap-1.5 rounded border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 font-mono text-[11px] text-[#34D399]">
              <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
              SYS OK
            </span>
          </div>

          <nav
            aria-label="Landing sections"
            className="hidden md:flex items-center gap-6 font-mono text-xs text-text-secondary"
          >
            <a
              href="#architecture"
              className="hover:text-text-primary focus:outline-none focus:text-[#7C8AFF] transition-colors"
            >
              Architecture
            </a>
            <a
              href="#security"
              className="hover:text-text-primary focus:outline-none focus:text-[#7C8AFF] transition-colors"
            >
              Security
            </a>
            <a
              href="#junior-devs"
              className="hover:text-text-primary focus:outline-none focus:text-[#7C8AFF] transition-colors"
            >
              For Junior Devs
            </a>
          </nav>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleToggleRain}
              title="Toggle Falling Code Ambient Rain (Shortcut: R)"
              className="hidden sm:inline-flex items-center gap-1.5 rounded-md border border-white/[0.08] bg-[#141820] px-2.5 py-1.5 font-mono text-[11px] text-text-secondary hover:text-text-primary hover:border-white/[0.16] transition-colors cursor-pointer"
            >
              <span className="text-[#FFB224]">[R]</span>
              <span>{rainPaused ? "Rain: PAUSED" : "Rain: LIVE"}</span>
            </button>

            {/* CTA #1: Header Proceed to Dashboard */}
            <button
              type="button"
              onClick={handleProceedToDashboard}
              className="
                rounded-md bg-[#7C8AFF] px-3.5 py-1.5
                font-mono text-xs font-semibold text-[#0E1116]
                hover:bg-[#7C8AFF]/90 focus:outline-none focus:ring-2 focus:ring-[#7C8AFF]
                transition-colors cursor-pointer
              "
            >
              Proceed to Dashboard →
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main id="top" className="relative z-10 mx-auto w-full max-w-6xl flex-1 px-4 sm:px-6">
        {/* Hero Section */}
        <section className="pt-12 pb-16 sm:pt-16 sm:pb-20">
          <div className="grid grid-cols-1 gap-10 lg:grid-cols-12 lg:items-start">
            {/* Left Column: Product Copy & CTAs */}
            <div className="lg:col-span-6 space-y-6">
              <div className="inline-flex items-center gap-2 rounded-md border border-[#FFB224]/30 bg-[#FFB224]/10 px-3 py-1 font-mono text-xs text-[#FFB224]">
                <span>01 / AUTOMATED CODE REVIEW · GO + CLAUDE ENGINE</span>
              </div>

              <h1 className="font-mono text-3xl sm:text-4xl lg:text-[42px] font-bold tracking-tight text-text-primary leading-[1.18]">
                Ship safer Pull Requests.{" "}
                <span className="text-[#34D399]">Learn from every diff.</span>
              </h1>

              <p className="text-[15px] leading-[1.75] text-text-secondary max-w-xl">
                Manual code review on engineering teams and institutional cohorts is slow and
                inconsistent. PRSentry intercepts every GitHub Pull Request webhook, analyzes
                unified diffs for SQL injection, leaked secrets, logic bugs, and N+1 bottlenecks,
                and posts structured line-level guidance before a human opens the diff.
              </p>

              {/* CTA #2: Hero Primary & Secondary Buttons */}
              <div className="flex flex-wrap items-center gap-3 pt-1">
                <button
                  type="button"
                  onClick={handleProceedToDashboard}
                  className="
                    inline-flex items-center gap-2 rounded-md bg-[#34D399] px-5 py-2.5
                    font-mono text-xs sm:text-sm font-semibold text-[#0E1116]
                    hover:bg-[#34D399]/90 focus:outline-none focus:ring-2 focus:ring-[#7C8AFF]
                    transition-colors cursor-pointer
                  "
                >
                  <span>Proceed to Dashboard →</span>
                </button>

                <a
                  href="#security"
                  className="
                    inline-flex items-center gap-2 rounded-md border border-white/[0.12] bg-[#141820] px-4 py-2.5
                    font-mono text-xs sm:text-sm font-medium text-text-primary
                    hover:border-[#7C8AFF]/60 hover:text-[#7C8AFF]
                    focus:outline-none focus:ring-2 focus:ring-[#7C8AFF]
                    transition-colors
                  "
                >
                  <span>View Security Model</span>
                </a>
              </div>

              {/* Architecture & Webhook Integrity Badges */}
              <div className="pt-3 border-t border-white/[0.08] space-y-2.5">
                <p className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                  Defense-in-Depth Runtime Guarantees
                </p>
                <div className="flex flex-wrap gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#141820] px-2.5 py-1 font-mono text-[11px] text-text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#34D399]" />
                    HMAC-SHA256 Webhook Verification
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#141820] px-2.5 py-1 font-mono text-[11px] text-text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#FFB224]" />
                    Short-Lived Scoped GitHub App JWT
                  </span>
                  <span className="inline-flex items-center gap-1.5 rounded border border-white/[0.08] bg-[#141820] px-2.5 py-1 font-mono text-[11px] text-text-secondary">
                    <span className="h-1.5 w-1.5 rounded-full bg-[#7C8AFF]" />
                    Zero-Retention LLM Diff Processing
                  </span>
                </div>
              </div>
            </div>

            {/* Right Column: Interactive Live Preview Card */}
            <div className="lg:col-span-6">
              <div className="studio-panel rounded-lg overflow-hidden">
                {/* Preview Top Bar */}
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/[0.08] bg-[#0E1116]/70 px-4 py-3">
                  <div className="flex items-center gap-2 font-mono text-xs">
                    <span className="text-[#FFB224]">● LIVE VERDICT PREVIEW</span>
                    <span className="text-text-muted">·</span>
                    <span className="text-[#7C8AFF]">{previewPR.repo_full_name}</span>
                    <span className="text-text-secondary">#{previewPR.pr_number}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <Badge variant="block">BLOCK · Risk {previewPR.risk_score.toFixed(1)}/5.0</Badge>
                  </div>
                </div>

                {/* Preview Body */}
                <div className="p-4 sm:p-5 space-y-4">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div>
                      <h2 className="font-mono text-sm font-semibold text-text-primary">
                        {previewPR.title}
                      </h2>
                      <p className="font-mono text-[11px] text-text-muted mt-0.5">
                        author: @{previewPR.author} · sha: {previewPR.head_sha.slice(0, 10)} ·{" "}
                        {previewPR.findings.length} findings
                      </p>
                    </div>
                    <RiskMeter score={previewPR.risk_score} compact />
                  </div>

                  {/* Interactive Finding Selector Tabs */}
                  <div className="space-y-2">
                    <div className="flex items-center justify-between">
                      <span className="font-mono text-[11px] uppercase tracking-wider text-text-muted">
                        Inspect Flagged Diff Findings ({previewPR.findings.length})
                      </span>
                      <span className="font-mono text-[11px] text-text-secondary">
                        Click tab to switch
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                      {previewPR.findings.map((f, idx) => {
                        const selected = idx === selectedFindingIdx;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => setSelectedFindingIdx(idx)}
                            className={`text-left rounded-md border p-2.5 transition-colors cursor-pointer ${
                              selected
                                ? "border-[#7C8AFF] bg-[#1B202B]"
                                : "border-white/[0.08] bg-[#0E1116]/60 hover:border-white/[0.18]"
                            }`}
                          >
                            <div className="flex items-center justify-between gap-1">
                              <Badge variant={f.severity}>{f.severity.toUpperCase()}</Badge>
                              <span className="font-mono text-[10px] text-text-muted">
                                L{f.line_number}
                              </span>
                            </div>
                            <p className="mt-1.5 font-mono text-[11px] text-text-primary truncate">
                              {f.file_path.split("/").pop()}
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {/* Active Finding Detail Box */}
                  <div className="rounded-md border border-white/[0.08] bg-[#0E1116] p-3.5 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Badge variant={activeFinding.severity}>
                          {activeFinding.severity.toUpperCase()}
                        </Badge>
                        <Badge variant={activeFinding.category}>{activeFinding.category}</Badge>
                      </div>
                      <span className="font-mono text-xs text-[#7C8AFF]">
                        {activeFinding.file_path}:{activeFinding.line_number}
                      </span>
                    </div>

                    <p className="text-xs sm:text-sm text-text-primary leading-relaxed">
                      {activeFinding.message}
                    </p>

                    <div className="space-y-1.5">
                      <span className="font-mono text-[10px] uppercase tracking-wider text-[#F87171]">
                        Flagged Commit Diff
                      </span>
                      <pre className="overflow-x-auto rounded border border-[#F87171]/25 bg-[#141820] p-2.5 font-mono text-xs text-[#F87171]">
                        <code>{activeRemediation.code_snippet}</code>
                      </pre>
                    </div>

                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-[10px] uppercase tracking-wider text-[#34D399]">
                          Suggested Parameterized Fix
                        </span>
                        <button
                          type="button"
                          onClick={() => void handleCopyPreviewFix()}
                          className="rounded border border-white/[0.1] bg-[#141820] px-2 py-0.5 font-mono text-[10px] text-text-secondary hover:text-text-primary cursor-pointer"
                        >
                          {copiedDemoFix ? "✓ Copied Fix" : "Copy Fix"}
                        </button>
                      </div>
                      <pre className="overflow-x-auto rounded border border-[#34D399]/25 bg-[#141820] p-2.5 font-mono text-xs text-[#34D399]">
                        <code>{activeRemediation.suggested_fix}</code>
                      </pre>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* 3-Step Pipeline & Security Architecture Section */}
        <section
          id="architecture"
          className="py-14 border-t border-white/[0.08] space-y-8"
        >
          <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
            <div className="space-y-2">
              <p className="font-mono text-xs uppercase tracking-wider text-[#FFB224]">
                02 / THREE-SERVICE PIPELINE ARCHITECTURE
              </p>
              <h2 className="font-mono text-2xl font-bold text-text-primary">
                Decoupled Go, Python, and React Micro-Pipeline
              </h2>
            </div>
            <p className="font-mono text-xs text-text-secondary max-w-md">
              Locked JSON contracts across boundaries ensure deterministic parsing, strict schema
              validation, and zero-trust service communication.
            </p>
          </div>

          {/* Crisp 3-Column Hairline Grid */}
          <div className="grid grid-cols-1 gap-4 md:grid-cols-3">
            <div className="studio-panel rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#FFB224]">
                  01. HMAC-Verified Webhook (Go)
                </span>
                <Badge variant="open">Go 1.24</Badge>
              </div>
              <p className="text-[15px] leading-[1.75] text-text-secondary">
                Receives GitHub <code className="font-mono text-xs text-text-primary">pull_request</code>{" "}
                events (<code className="font-mono text-xs">opened</code>,{" "}
                <code className="font-mono text-xs">synchronize</code>,{" "}
                <code className="font-mono text-xs">reopened</code>), validates{" "}
                <code className="font-mono text-xs text-[#34D399]">X-Hub-Signature-256</code> in
                constant time, and enforces a 30-file guardrail.
              </p>
              <div className="pt-2 border-t border-white/[0.06] font-mono text-[11px] text-text-muted">
                POST /webhook → pgx PostgreSQL Transaction
              </div>
            </div>

            <div className="studio-panel rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#34D399]">
                  02. Concurrent AST &amp; Diff Analysis (Python + Claude)
                </span>
                <Badge variant="safe">FastAPI</Badge>
              </div>
              <p className="text-[15px] leading-[1.75] text-text-secondary">
                Chunks unified diffs up to 100 KB per file, authenticates internal calls via
                constant-time Bearer tokens, and prompts Claude for structured JSON findings across{" "}
                <code className="font-mono text-xs text-text-primary">security</code>,{" "}
                <code className="font-mono text-xs text-text-primary">bug</code>, and{" "}
                <code className="font-mono text-xs text-text-primary">performance</code>.
              </p>
              <div className="pt-2 border-t border-white/[0.06] font-mono text-[11px] text-text-muted">
                POST /review → Risk Score (1.0–5.0) + Verdict
              </div>
            </div>

            <div className="studio-panel rounded-lg p-5 space-y-3">
              <div className="flex items-center justify-between">
                <span className="font-mono text-xs font-semibold text-[#7C8AFF]">
                  03. Actionable Line-by-Line Triage
                </span>
                <Badge variant="completed">React 19</Badge>
              </div>
              <p className="text-[15px] leading-[1.75] text-text-secondary">
                Posts a formatted review comment directly to the GitHub PR and surfaces historical
                review runs, commit SHA comparisons, and copy-ready code fixes in the PRSentry
                Dashboard.
              </p>
              <div className="pt-2 border-t border-white/[0.06] font-mono text-[11px] text-text-muted">
                GET /api/v1/prs · /api/v1/reviews/:id · /api/v1/stats
              </div>
            </div>
          </div>

          {/* Security Model Sub-panel (#security) */}
          <div id="security" className="studio-panel rounded-lg p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/[0.08] pb-4">
              <div>
                <span className="font-mono text-xs uppercase tracking-wider text-[#34D399]">
                  SECURITY POSTURE &amp; TRUST BOUNDARIES
                </span>
                <h3 className="font-mono text-lg font-semibold text-text-primary mt-0.5">
                  End-to-End Cryptographic &amp; Session Isolation Controls
                </h3>
              </div>
              <Badge variant="safe">ZERO PLAINTEXT STORAGE</Badge>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4 font-mono text-xs">
              <div className="rounded border border-white/[0.06] bg-[#0E1116]/70 p-3.5 space-y-1.5">
                <p className="text-[#34D399] font-semibold">01. Webhook Integrity</p>
                <p className="font-sans text-xs text-text-secondary leading-relaxed">
                  Every GitHub payload is verified with <code className="font-mono">HMAC-SHA256</code>{" "}
                  before parsing JSON. Unsigned requests are rejected with <code className="font-mono">401</code>.
                </p>
              </div>

              <div className="rounded border border-white/[0.06] bg-[#0E1116]/70 p-3.5 space-y-1.5">
                <p className="text-[#FFB224] font-semibold">02. Scoped App Tokens</p>
                <p className="font-sans text-xs text-text-secondary leading-relaxed">
                  Go mints short-lived 10-minute RS256 GitHub App JWTs and installation tokens
                  scoped strictly to <code className="font-mono">pull_requests:write</code>.
                </p>
              </div>

              <div className="rounded border border-white/[0.06] bg-[#0E1116]/70 p-3.5 space-y-1.5">
                <p className="text-[#7C8AFF] font-semibold">03. Web Crypto SHA-256</p>
                <p className="font-sans text-xs text-text-secondary leading-relaxed">
                  Institutional lab accounts salt and hash credentials via native{" "}
                  <code className="font-mono">crypto.subtle.digest</code> and isolate storage per
                  student handle.
                </p>
              </div>

              <div className="rounded border border-white/[0.06] bg-[#0E1116]/70 p-3.5 space-y-1.5">
                <p className="text-[#F87171] font-semibold">04. Strict XSS Escaping</p>
                <p className="font-sans text-xs text-text-secondary leading-relaxed">
                  All commit diffs, PR titles, and AI messages render inside escaped{" "}
                  <code className="font-mono">&lt;pre&gt;&lt;code&gt;</code> blocks with zero{" "}
                  <code className="font-mono">dangerouslySetInnerHTML</code>.
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Built for Junior Developers Section */}
        <section
          id="junior-devs"
          className="py-14 border-t border-white/[0.08] space-y-8"
        >
          <div className="grid grid-cols-1 gap-8 lg:grid-cols-12 lg:items-center">
            <div className="lg:col-span-7 space-y-4">
              <p className="font-mono text-xs uppercase tracking-wider text-[#7C8AFF]">
                03 / BUILT FOR INSTITUTIONAL JUNIOR DEVELOPERS
              </p>
              <h2 className="font-mono text-2xl sm:text-3xl font-bold text-text-primary">
                Turn every automated PR block into a mentoring moment.
              </h2>
              <p className="text-[15px] leading-[1.75] text-text-secondary">
                Static linters spit out cryptic rule IDs without context. PRSentry is built for
                computer science cohorts, capstone teams, and junior engineers: every flagged line
                explains{" "}
                <span className="text-text-primary font-medium">
                  why the pattern is risky in production
                </span>{" "}
                and provides a concrete, copyable remediation snippet.
              </p>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2">
                <div className="studio-panel rounded-md p-4 space-y-1">
                  <p className="font-mono text-xs font-semibold text-[#34D399]">
                    ◈ Why This Matters &amp; How to Fix
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Side-by-side vulnerable diff vs. parameterized fix with generous 15px / 1.75
                    prose spacing for long study sessions.
                  </p>
                </div>

                <div className="studio-panel rounded-md p-4 space-y-1">
                  <p className="font-mono text-xs font-semibold text-[#FFB224]">
                    ◈ Persistent v1 Feedback Loop
                  </p>
                  <p className="text-xs text-text-secondary leading-relaxed">
                    Rate each AI finding (<code className="font-mono">👍 / 👎</code>) with notes
                    saved to your isolated session and exportable as JSON for v2 model grading.
                  </p>
                </div>
              </div>

              {/* CTA #3: Junior Devs Section Proceed to Dashboard */}
              <div className="pt-3 flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleProceedToDashboard}
                  className="
                    inline-flex items-center gap-2 rounded-md bg-[#7C8AFF] px-5 py-2.5
                    font-mono text-xs sm:text-sm font-semibold text-[#0E1116]
                    hover:bg-[#7C8AFF]/90 focus:outline-none focus:ring-2 focus:ring-[#7C8AFF]
                    transition-colors cursor-pointer
                  "
                >
                  <span>Proceed to Dashboard →</span>
                </button>
                <span className="font-mono text-xs text-text-muted">
                  Supports GitHub OAuth (CSRF-protected) &amp; Local Lab Accounts
                </span>
              </div>
            </div>

            {/* Educational Feedback Loop Illustration Card */}
            <div className="lg:col-span-5">
              <div className="studio-panel rounded-lg p-5 space-y-4">
                <div className="flex items-center justify-between border-b border-white/[0.08] pb-3">
                  <span className="font-mono text-xs text-text-primary font-semibold">
                    Junior Dev Triage &amp; Feedback Loop
                  </span>
                  <span className="rounded border border-[#34D399]/30 bg-[#34D399]/10 px-2 py-0.5 font-mono text-[10px] text-[#34D399]">
                    Saved to your session
                  </span>
                </div>

                <div className="space-y-2 text-xs">
                  <p className="font-mono text-[11px] uppercase tracking-wider text-[#FFB224]">
                    Why This Matters
                  </p>
                  <p className="text-text-secondary leading-relaxed">
                    {activeRemediation.why_it_matters}
                  </p>
                </div>

                <div className="rounded border border-white/[0.08] bg-[#0E1116] p-3 space-y-2">
                  <div className="flex items-center justify-between font-mono text-[11px]">
                    <span className="text-text-secondary">Was this finding accurate?</span>
                    <div className="flex items-center gap-1.5">
                      <span className="rounded border border-[#34D399]/40 bg-[#34D399]/15 px-2 py-0.5 text-[#34D399]">
                        👍 Helpful
                      </span>
                      <span className="rounded border border-white/[0.08] px-2 py-0.5 text-text-muted">
                        👎 Noise
                      </span>
                    </div>
                  </div>
                  <p className="font-mono text-[11px] text-text-muted">
                    &ldquo;Clear explanation of pgx $1 placeholders—fixed in commit 9f86d08.&rdquo;
                  </p>
                </div>
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* Minimal Institutional Footer */}
      <footer className="relative z-10 border-t border-white/[0.08] bg-[#0E1116]/90">
        <div className="mx-auto flex max-w-6xl flex-col gap-3 px-4 py-6 sm:flex-row sm:items-center sm:justify-between sm:px-6 font-mono text-xs text-text-muted">
          <div className="flex flex-wrap items-center gap-3">
            <span className="text-text-primary font-semibold">◈ PRSentry v1.0-beta</span>
            <span>·</span>
            <span>HMAC-SHA256 Verified</span>
            <span>·</span>
            <span>Web Crypto SHA-256 Session Isolation</span>
          </div>

          <div className="flex items-center gap-4">
            <button
              type="button"
              onClick={handleProceedToDashboard}
              className="text-[#7C8AFF] hover:underline cursor-pointer"
            >
              Proceed to Dashboard →
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
