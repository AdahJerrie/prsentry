-- The -- name: FunctionName :one comment is the magic of sqlc. It tells the compiler to generate a Go function named CreateReviewRun that returns exactly :one row.
-- Instead of writing Go code to insert data, I am writing annotated SQL.

-- name: CreateInstallation :one
INSERT INTO installations (id, account_name)
VALUES ($1, $2)
ON CONFLICT (id) DO UPDATE SET updated_at = NOW()
RETURNING *;

-- name: CreatePullRequest :one
INSERT INTO pull_requests (repository_id, pr_number, title, author)
VALUES ($1, $2, $3, $4)
ON CONFLICT (repository_id, pr_number) DO UPDATE SET updated_at = NOW()
RETURNING *;

-- name: CreateReviewRun :one
INSERT INTO review_runs (pull_request_id, commit_sha, summary, risk_score, merge_recommendation)
VALUES ($1, $2, $3, $4, $5)
RETURNING *;