# PRSentry — AI-Powered Pull Request Review Assistant

Manual code review is slow and inconsistent, especially on small teams without a dedicated senior reviewer. **PRSentry** automatically analyzes GitHub pull requests when they open or update, flags bugs, security vulnerabilities, performance issues, and maintainability defects, persists review history in PostgreSQL, posts a structured review comment on GitHub, and surfaces insights on a React dashboard.

---

## Architecture

| Service | Directory | Responsibility |
| :--- | :--- | :--- |
| **Go Backend** | `go-service/` | Verifies GitHub `X-Hub-Signature-256` webhooks (`POST /webhook`), fetches PR diffs via GitHub App JWTs, orchestrates AI reviews, writes atomic transactions to PostgreSQL, posts GitHub PR comments, and serves `/api/v1/*` for the dashboard. |
| **Python AI Engine** | `python-service/` | Internal FastAPI service (`POST /review`) protected by constant-time `INTERNAL_AUTH_TOKEN`, using Anthropic structured tool-use to return risk scores, merge recommendations (`safe`, `caution`, `block`), and line-level findings. |
| **React Dashboard** | `react-dashboard/` | React 19 + TypeScript + Vite + Tailwind CSS v4 dashboard displaying filterable PR reviews, expandable inline previews, historical review runs, and 14-day risk/category analytics. |
| **PostgreSQL 16** | `go-service/migrations/` | Stores `installations`, `repositories`, `pull_requests`, `review_runs`, and `findings`. |

Cross-service request and response schemas are locked in [`api-contract.md`](./api-contract.md). Engineering workflow rules live in [`AGENTS.md`](./AGENTS.md).

---

## Quickstart (Docker Compose)

1. Copy `.env.example` to `.env` and populate your GitHub App credentials, `INTERNAL_AUTH_TOKEN`, and `ANTHROPIC_API_KEY`:

```bash
cp .env.example .env
```

2. Build and start PostgreSQL, migrations, Python AI service, Go backend, and React dashboard:

```bash
docker compose up --build
```

- **React Dashboard:** `http://localhost:3000`
- **Go API & Webhook Receiver:** `http://localhost:8080` (`POST /webhook`, `GET /health`, `GET /api/v1/prs`)

---

## Running Services Natively (Local Development)

### 1. PostgreSQL & Migrations

```bash
docker compose up -d postgres migrations
```

### 2. Python AI Service (`:8000`)

```bash
cd python-service
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

### 3. Go Backend (`:8080`)

```bash
cd go-service
go run ./cmd/server
```

### 4. React Dashboard (`:5173`, proxies `/api` to `:8080`)

```bash
cd react-dashboard
npm install
npm run dev
```

---

## Running Tests & Verification

```bash
# Go unit + PostgreSQL integration tests
cd go-service
TEST_DATABASE_URL="postgres://prsentry:secret@localhost:5432/prsentry_dev?sslmode=disable" go vet ./...
TEST_DATABASE_URL="postgres://prsentry:secret@localhost:5432/prsentry_dev?sslmode=disable" go test -race -v ./...

# Python AI service tests
cd ../python-service
pytest -v

# React dashboard TypeScript & production build check
cd ../react-dashboard
npm run typecheck
npm run build
```
