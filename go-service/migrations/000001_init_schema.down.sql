DROP INDEX IF EXISTS idx_pull_requests_status;
DROP INDEX IF EXISTS idx_findings_run_severity;
DROP INDEX IF EXISTS idx_review_runs_pr_id;
DROP INDEX IF EXISTS idx_pull_requests_repo_number;

DROP TABLE IF EXISTS findings;
DROP TABLE IF EXISTS review_runs;
DROP TABLE IF EXISTS pull_requests;
DROP TABLE IF EXISTS repositories;
DROP TABLE IF EXISTS installations;
