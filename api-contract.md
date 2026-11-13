# PRSentry — API Contract

This is the locked contract for data crossing service boundaries. All three services (Go, Python, and React) build against these exact schemas.

---

## 1. Go → Python: Diff Analysis

**Endpoint:** `POST /review`
**Authentication:** `Authorization: Bearer <INTERNAL_AUTH_TOKEN>` (verified in constant time)

### Request (Go → Python)

```json
{
  "pr_id": 123,
  "repo": "owner/name",
  "files": [
    {
      "path": "main.go",
      "diff": "@@ -10,6 +10,7 @@ ... unified diff ..."
    }
  ]
}
```

| Field | Type | Notes |
| :--- | :--- | :--- |
| `pr_id` | int | GitHub PR number (`> 0`) |
| `repo` | string | `"owner/name"` format |
| `files` | array of objects | Changed non-generated files (max 50; Go enforces 30-file v1 guardrail) |
| `files[].path` | string | File path relative to repo root |
| `files[].diff` | string | Unified diff text for that file (UTF-8 safe, capped at 100 KB) |

### Response (Python → Go)

```json
{
  "pr_id": 123,
  "summary": "Automated analysis reviewed 1 file(s) in owner/name and identified 1 finding(s) (0 high, 1 medium, 0 low).",
  "risk_score": 3.0,
  "merge_recommendation": "caution",
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

| Field | Type | Notes |
| :--- | :--- | :--- |
| `pr_id` | int | Echoed GitHub PR number |
| `summary` | string | Human-readable overview of the PR review |
| `risk_score` | number | Numeric scale `1.0`–`5.0` |
| `merge_recommendation` | string | Fixed set: `"safe"`, `"caution"`, `"block"` |
| `findings` | array | Empty array `[]` when no issues are found |
| `findings[].file_path` | string | Matches a `files[].path` from the request |
| `findings[].line_number` | int | 1-based line number in the file |
| `findings[].severity` | string | Fixed set: `"low"`, `"medium"`, `"high"` |
| `findings[].category` | string | Fixed set: `"bug"`, `"security"`, `"performance"`, `"style"`, `"maintainability"` |
| `findings[].message` | string | Actionable explanation of the finding |

---

## 2. GitHub → Go: Webhook Events

Go listens for `pull_request` events at `POST /webhook`, verified via HMAC-SHA256 signature (`X-Hub-Signature-256` header) against `GITHUB_WEBHOOK_SECRET`.

- **Events handled:** `X-GitHub-Event: pull_request` (`opened`, `synchronize`, `reopened`) and `ping` (`200 OK`).
- **Other events/actions:** Acknowledged with `200 OK` and ignored.
- **Large PR guardrail:** PRs modifying more than 30 reviewable files bypass LLM calls and record a `"caution"` review run recommending manual review.

---

## 3. Go → React: Dashboard REST API

Base path: `/api/v1` (aliased at `/api` for backward compatibility).
Optional header when `DASHBOARD_API_KEY` is set on Go: `Authorization: Bearer <DASHBOARD_API_KEY>`.

### 3.1 `GET /api/v1/prs`

Query parameters (all optional):
- `repo` — exact `"owner/name"` filter
- `status` — PR status (`open`, `closed`, `merged`) or review status (`completed`, `failed`, `pending`, `processing`)
- `recommendation` — `"safe"`, `"caution"`, or `"block"`
- `limit` — positive integer (default `50`, max `200`)

Response `200 OK` (`[]PRSummary` — always `[]` when empty, never `null`):

```json
[
  {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "repo_full_name": "acme/auth-service",
    "pr_number": 42,
    "title": "Refactor token verification middleware",
    "author": "jerrie",
    "pr_status": "open",
    "latest_review_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
    "review_status": "completed",
    "head_sha": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b",
    "risk_score": 3.0,
    "merge_recommendation": "caution",
    "summary": "Automated analysis reviewed 2 file(s) in acme/auth-service and identified 1 finding(s)...",
    "findings_count": 1,
    "high_severity_count": 0,
    "created_at": "2026-11-13T03:00:00Z"
  }
]
```

### 3.2 `GET /api/v1/prs/:id`

Returns full PR detail (`PRDetail`), surfacing the latest review's findings plus historical `review_runs` (`id` is the PR UUID):

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "repo_full_name": "acme/auth-service",
  "pr_number": 42,
  "title": "Refactor token verification middleware",
  "author": "jerrie",
  "pr_status": "open",
  "latest_review_id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  "review_status": "completed",
  "head_sha": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b",
  "risk_score": 3.0,
  "merge_recommendation": "caution",
  "summary": "Automated analysis reviewed 2 file(s)...",
  "findings_count": 1,
  "high_severity_count": 0,
  "created_at": "2026-11-13T03:00:00Z",
  "findings": [
    {
      "id": 101,
      "file_path": "internal/auth/jwt.go",
      "line_number": 42,
      "severity": "medium",
      "category": "security",
      "message": "Algorithm header is not pinned to RS256."
    }
  ],
  "review_runs": [
    {
      "id": "7c9e6679-7425-40de-944b-e07fc1f90ae7",
      "head_sha": "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b",
      "status": "completed",
      "risk_score": 3.0,
      "merge_recommendation": "caution",
      "summary": "Automated analysis reviewed 2 file(s)...",
      "findings_count": 1,
      "created_at": "2026-11-13T03:00:00Z"
    }
  ]
}
```

### 3.3 `GET /api/v1/prs/:id/findings`

Returns `[]PRFinding` for the latest review run of pull request `:id` (UUID).

### 3.4 `GET /api/v1/reviews/:id`

Returns one specific review run (`ReviewDetail`) and its `findings` by review run UUID `:id`.

### 3.5 `GET /api/v1/stats`

Returns aggregate counts (`DashboardStats`) for KPI cards, repository filter options, and trends:

```json
{
  "total_prs": 12,
  "total_reviews": 19,
  "average_risk_score": 2.45,
  "total_findings": 27,
  "recommendations": { "safe": 7, "caution": 3, "block": 2 },
  "severities": { "high": 3, "medium": 9, "low": 15 },
  "categories": {
    "bug": 6,
    "security": 4,
    "performance": 3,
    "style": 8,
    "maintainability": 6
  },
  "repositories": ["acme/auth-service", "acme/payment-worker"],
  "recent_reviews": [
    { "date": "2026-11-13", "review_count": 4, "avg_risk_score": 2.5 }
  ]
}
```

---

## Change Log

| Date | Change | Reason |
| :--- | :--- | :--- |
| 14-09-2026 | Initial contract locked | Week 1 kickoff |
| 13-11-2026 | Locked Section 3 Go → React response schemas & UUID identifiers | Align Go backend, Postgres UUID schema, and React dashboard |
