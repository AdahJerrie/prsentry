# PRSentry — Full Project Planning Document

This doc is meant to be read once by everyone before anyone writes code, then kept open as a reference during the build. Treat Section 1 as your team meeting agenda.

---

## 1. The Planning Phase — What to Discuss Before Writing Code

This is the general checklist worth reusing for any project bigger than a weekend hack. For a team project specifically, skipping this step is the #1 cause of merge conflicts and wasted work — not because anyone did anything wrong, but because two people quietly assumed two different things.

**A. Problem & scope alignment**
- What exact problem are we solving, in one sentence? (See Section 2.)
- What's explicitly *out of scope* for v1? (Write this down — it prevents scope creep mid-build.)
- Who is the "user"? For PRSentry: a repo maintainer/team that installs the app.

**B. Data contracts — lock these before splitting up work**
- Exact JSON shape flowing Go → Python (the diff analysis request)
- Exact JSON shape flowing Python → Go (the review result)
- Exact REST endpoints Go exposes to React, with request/response shapes
- This is non-negotiable to do *first*, together. It's what lets three people build in parallel without waiting on each other. (Full contracts in Section 6.)

**C. Tech decisions everyone needs to agree on once**
- Database choice and where it's hosted (Section 5)
- Which LLM provider/API (cost, rate limits — someone needs to own the API key)
- Where secrets live (never committed — `.env` + `.gitignore`, see Section 8)
- Local dev setup — does everyone run Docker Compose, or native installs?

**D. Process decisions**
- Git branching strategy (Section 10)
- Who reviews whose PRs before merge to `main`
- How often you sync (a 15-minute check-in every 2-3 days is usually enough for a 3-week sprint)
- Where you track tasks (GitHub Projects/Issues is fine — don't overthink this)

**E. Definition of done**
- What does "Week 1 complete" actually mean, concretely, for each track? (Section 11 gives you a starting point — adjust it together.)

Once A–E are agreed and written down (even just in a shared doc), you're ready to split up and build. Everything below is the reference material for that conversation.

---

## 2. Problem Statement & Objective

Manual code review is slow and inconsistent, especially on small teams without a dedicated senior reviewer. PRSentry automatically analyzes GitHub pull requests, flags bugs/style/security issues, and posts a structured review — cutting review turnaround time and catching problems before a human opens the diff.

**In scope for v1:** single-repo installs, LLM-based diff analysis, posted PR comments, a dashboard showing review history.
**Out of scope for v1 (future work):** multi-org billing, custom fine-tuned models, IDE plugins, the full RepoIntel Q&A vision.

---

## 3. High-Level Architecture

Three independently-runnable services, connected by a database and REST calls:

- **Go — the nervous system:** receives GitHub webhook events, verifies them, stores data, orchestrates the pipeline, exposes the API.
- **Python — the brain:** takes a diff, calls the LLM, returns structured findings.
- **React — the face:** shows humans what happened.
- **PostgreSQL — the memory:** the only place state persists. Both Go and (indirectly, via Go) the review results live here.

Data flow for one PR event:
1. GitHub sends a webhook to Go when a PR opens/updates.
2. Go verifies the signature (this proves the request really came from GitHub, not an impostor — same idea as checking a wax seal on a letter).
3. Go stores the PR record, fetches the diff via GitHub's API.
4. Go sends the diff to Python's `/review` endpoint.
5. Python analyzes it with the LLM, returns structured JSON (summary, risk score, findings).
6. Go stores the review, posts it back to GitHub as a PR comment.
7. React reads everything through Go's REST API for the dashboard.

*(See the diagram rendered above in chat for the visual version of this.)*

---

## 4. Component Breakdown

### 4.1 Frontend — React
**Responsibility:** display, not logic. It should be a thin layer reading from Go's API.

- **Pages:**
  - PR List — all analyzed PRs, filterable by repo/status/risk level
  - Review Detail — full findings for one PR, grouped by severity
  - Stats/Trends — reviews over time, average risk score, most common issue categories
- **State management:** for this scope, React's built-in state + a data-fetching pattern (e.g. a simple hook wrapping `fetch`) is enough — no need for Redux/Zustand at this size.
- **Styling:** keep it simple — Tailwind or a component library (shadcn/ui) will get you a clean dashboard fast without hand-rolling CSS.
- **Auth (if you add it):** simplest viable option is GitHub OAuth login, matching who has access to the connected repos.

### 4.2 Backend — Go
**Responsibility:** the only service that talks to the outside world (GitHub, the database, and the frontend). Python and React never talk to each other directly — everything routes through Go.

- **`internal/webhook`** — receives GitHub's POST, verifies the `X-Hub-Signature-256` header against your webhook secret, parses the event type (only care about `pull_request` events: `opened`, `synchronize`, `reopened`).
- **`internal/github`** — a client wrapping GitHub's REST/GraphQL API: fetch PR diff, post a comment, (later) create check runs.
- **`internal/store`** — database layer. Use `database/sql` + a lightweight query builder (sqlc or squirrel) rather than a heavy ORM — good for learning Go idioms, and you're a beginner so simpler is better here.
- **`internal/api`** — REST handlers the React app calls (`GET /api/prs`, `GET /api/reviews/:id`, etc).
- **Concurrency note (when you're ready for it):** calling Python and waiting can block. For v1, synchronous (Go waits for Python's response before responding to GitHub) is perfectly fine and much simpler to build/debug. A background job queue is a legitimate stretch goal, not a v1 requirement.

### 4.3 AI Service — Python
**Responsibility:** the only service that talks to the LLM.

- **`/review` endpoint (FastAPI recommended — lighter than Flask, gives you request/response validation for free via Pydantic):**
  - Input: PR metadata + diff (possibly multiple files)
  - Output: structured JSON — summary, risk score, findings array (each with file, line, severity, category, message)
- **Diff chunking:** large diffs won't fit in one LLM call — split by file, analyze each, then have a final pass that summarizes across files.
- **Structured output:** use the LLM provider's JSON mode / structured output feature rather than parsing free text — this is the difference between a review that reliably renders in your UI and one that breaks every few requests.
- **Prompt design:** give the model the diff, the file's surrounding context if possible, and explicit categories to classify findings into (bug / security / style / maintainability). Ask for a risk score on a fixed scale (e.g. 1-5) so it's consistent and sortable.

---

## 5. Data Model

Postgres, four core tables for v1:

```sql
-- one row per connected GitHub App installation
installations (
  id, github_installation_id, account_login, created_at
)

-- one row per repo the app is analyzing
repositories (
  id, installation_id, github_repo_id, owner, name, created_at
)

-- one row per PR that's been seen
pull_requests (
  id, repo_id, github_pr_number, title, author,
  head_sha, base_sha, status, created_at, updated_at
)

-- one row per review run on a PR
reviews (
  id, pr_id, status,        -- pending | processing | completed | failed
  risk_score, summary, created_at, completed_at
)

-- one row per individual issue found in a review
findings (
  id, review_id, file_path, line_number,
  severity,     -- low | medium | high
  category,     -- bug | security | style | maintainability
  message
)
```

`status` fields matter more than they look — they're what let your dashboard show "processing..." states and what let Go safely retry a failed Python call without double-posting comments.

---

## 6. API Contracts

**Lock these in your Week 1 kickoff meeting — this is what lets the three of you build without blocking each other.**

**Go → Python: `POST /review`**
```json
{
  "pr_id": 123,
  "repo": "owner/name",
  "files": [
    { "path": "main.go", "diff": "@@ ... unified diff ..." }
  ]
}
```

**Python → Go response**
```json
{
  "summary": "Refactors error handling in the auth package...",
  "risk_score": 3,
  "findings": [
    {
      "file_path": "main.go",
      "line_number": 42,
      "severity": "medium",
      "category": "bug",
      "message": "Error from db.Query is ignored — could mask connection failures."
    }
  ]
}
```

**Go → React: key endpoints**
```
GET  /api/prs?repo=&status=&limit=      → list of PRs with latest review status
GET  /api/prs/:id                       → PR detail + its review
GET  /api/reviews/:id                   → full review with all findings
GET  /api/stats                         → aggregate counts for the trends page
```

---

## 7. GitHub App Setup (do this early — it can have surprising lead time)

1. Register a new **GitHub App** (not OAuth App — GitHub Apps are the right tool for "acts on repos with fine-grained permissions").
2. Set permissions: `Pull requests: Read & write`, `Contents: Read`.
3. Subscribe to webhook events: `pull_request`.
4. Set the webhook URL to your Go service (use `ngrok` or similar for local dev — GitHub can't reach `localhost`).
5. Generate a private key for the app — Go uses this to authenticate as the app when calling GitHub's API.
6. Install the app on a test repo you control.

Do this in Week 1, ideally on Day 1 — GitHub App setup is fiddly the first time and you don't want it blocking Person A mid-week.

---

## 8. Infrastructure & DevOps

- **Local dev:** `docker-compose.yml` running all three services + Postgres, so anyone can `docker compose up` and have the full stack running.
- **CI:** a GitHub Actions workflow per service — run tests + linter on every PR to that service's branch.
- **Secrets:** `.env` files, never committed. Each service reads its own: Go needs the GitHub App private key + webhook secret + DB connection string; Python needs the LLM API key.
- **Deployment (when you get there):** Railway, Render, or Fly.io are the easiest for a project this size — all three support Docker deploys without much DevOps overhead, which matters since none of you should be spending your 3 weeks fighting Kubernetes.

---

## 9. Security Considerations

- **Always verify the webhook signature** — without this, anyone who finds your URL can fake a "PR opened" event.
- **Never log or expose the GitHub App private key or LLM API key.**
- **Rate-limit the webhook endpoint** — a misbehaving or malicious sender shouldn't be able to hammer your LLM budget.
- **Sanitize what goes into LLM prompts** if you ever accept free-text user input beyond the diff itself (not a v1 concern, but worth knowing why it matters).

---

## 10. Git Workflow

- `main` — always deployable
- `go-service`, `python-service`, `react-dashboard` — track branches, merged to `main` at each week's checkpoint
- Feature branches off the track branch for individual tasks, PR'd back into the track branch
- At minimum, one other teammate reviews before merge to `main` — even a quick glance catches a surprising number of issues

---

## 11. Week-by-Week Checkpoints (Definition of Done)

**Week 1 done means:** all three services run via `docker compose up`, talk to each other using mock/hardcoded data matching the locked contract, and the GitHub App is registered and receiving real webhook events (even if Go just logs them).

**Week 2 done means:** a real PR on your test repo triggers a real end-to-end flow — Go fetches the diff, Python returns a real LLM-generated review, Go posts it as a comment, and it's visible on the React dashboard.

**Week 3 done means:** error handling doesn't crash the pipeline, the dashboard is polished enough to demo, there's a README explaining setup, and you've run it against at least one real open-source repo's PR (not just your own test repo) to sanity-check it in the wild.

---

## 12. Tools & Accounts to Set Up Before Day 1

- GitHub account with permission to create a GitHub App on a test org/repo
- LLM provider API key (Anthropic or OpenAI — decide as a team, this affects Person B's Week 1 setup)
- A Postgres instance for local dev (via Docker, no separate signup needed) and, later, a hosting account (Railway/Render/Supabase) for a shared dev/demo database
- `ngrok` (or similar) account for exposing local Go server to GitHub during development
