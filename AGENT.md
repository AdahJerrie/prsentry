# AGENT.md — Engineering Workflow & Codebase Guide

You are my senior software engineer and coding agent.

Your job is not just to write code. Your job is to understand the existing codebase, make the smallest correct changes, and verify that everything still works.

Before touching the code:

1. Explore the project structure.
2. Read the relevant files and existing patterns.
3. Identify how the feature currently works.
4. Explain your implementation plan.
5. Tell me which files you intend to change.

Do not start coding until you understand the context.

---

## PRSentry Architecture & Boundaries

PRSentry consists of three services coordinated over explicit JSON contracts (`api-contract.md`) and backed by PostgreSQL:

- **`go-service/` (Ingress, Orchestration, Storage, Read API):**
  - Verifies GitHub `X-Hub-Signature-256` HMAC-SHA256 webhook signatures on `POST /webhook`.
  - Exchanges GitHub App RS256 JWTs for short-lived installation tokens (`internal/github`), fetches PR diffs, filters generated/lockfiles, enforces size/file-count guardrails, and posts Markdown review summaries back to GitHub PRs.
  - Persists `installations` -> `repositories` -> `pull_requests` -> `review_runs` -> `findings` atomically in PostgreSQL (`internal/db/store.go`).
  - Serves read-only dashboard endpoints (`/api/v1/prs`, `/api/v1/prs/:id`, `/api/v1/prs/:id/findings`, `/api/v1/reviews/:id`, `/api/v1/stats`, `/health`) protected by CORS origin allowlisting, defensive headers, per-IP rate limiting, and optional `DASHBOARD_API_KEY`.
- **`python-service/` (Internal AI Analysis Engine):**
  - Accepts `POST /review` from Go only, authenticated via constant-time `Bearer <INTERNAL_AUTH_TOKEN>` verification (`app/main.py`).
  - Evaluates diffs concurrently via Anthropic structured tool-use (`app/analysis.py`) with `<untrusted_diff>` prompt-injection delimiters, failing closed (`502`) if upstream analysis fails completely.
- **`react-dashboard/` (Frontend Dashboard):**
  - Thin React + TypeScript + Vite + Tailwind v4 SPA (`src/types/api.ts`, `src/api/client.ts`) consuming Go's `/api/v1/*` endpoints. Never communicates with `python-service` or PostgreSQL directly.

## Non-Negotiable Rules

1. **Contract Discipline:** Never silently rename or alter fields crossing Go <-> Python or Go <-> React boundaries without updating `api-contract.md` and all affected services together.
2. **Database Integrity:** Never edit existing applied migrations in `go-service/migrations/` in place when adding new schema changes — create a new numbered `.up.sql` and `.down.sql` pair. If editing `go-service/internal/db/queries.sql`, keep `queries.sql.go` synchronized.
3. **Security Invariants:**
   - Never commit `.env` files, `*.pem` private keys, or real tokens.
   - Always verify webhook HMAC signatures before parsing payloads.
   - Keep `python-service` internal; never expose it publicly without `INTERNAL_AUTH_TOKEN`.
   - Never fail open to `"safe"` when an upstream GitHub or LLM error occurs.

## Required Verification Before Completing Any Change

Run the checks for every service touched (and full-stack checks whenever contracts change):

```bash
# Go service (unit + PostgreSQL integration tests)
cd go-service
go vet ./...
go test -race -v ./...

# Python AI service
cd python-service
pytest -v

# React dashboard
cd react-dashboard
npm run typecheck
npm run build
```
