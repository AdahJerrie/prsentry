ALTER TABLE review_runs DROP CONSTRAINT IF EXISTS chk_review_runs_status;
ALTER TABLE pull_requests DROP CONSTRAINT IF EXISTS chk_pull_requests_status;
DROP INDEX IF EXISTS idx_review_runs_pr_created_at;
