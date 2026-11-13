-- Annotated SQL queries for sqlc generation.

-- name: CreateInstallation :one
INSERT INTO installations (id, account_name)
VALUES ($1, $2)
ON CONFLICT (id) DO UPDATE
SET account_name = EXCLUDED.account_name,
    updated_at = NOW()
RETURNING *;

-- name: CreateRepository :one
INSERT INTO repositories (installation_id, github_repo_id, full_name)
VALUES ($1, $2, $3)
ON CONFLICT (github_repo_id) DO UPDATE
SET installation_id = EXCLUDED.installation_id,
    full_name = EXCLUDED.full_name,
    updated_at = NOW()
RETURNING *;

-- name: CreatePullRequest :one
INSERT INTO pull_requests (repository_id, pr_number, title, author, status)
VALUES ($1, $2, $3, $4, $5)
ON CONFLICT (repository_id, pr_number) DO UPDATE
SET title = EXCLUDED.title,
    author = EXCLUDED.author,
    status = EXCLUDED.status,
    updated_at = NOW()
RETURNING *;

-- name: CreateReviewRun :one
INSERT INTO review_runs (pull_request_id, commit_sha, status, summary, risk_score, merge_recommendation)
VALUES ($1, $2, $3, $4, $5, $6)
RETURNING *;

-- name: CreateFinding :exec
INSERT INTO findings (review_run_id, file_path, line_number, severity, category, message)
VALUES ($1, $2, $3, $4, $5, $6);
