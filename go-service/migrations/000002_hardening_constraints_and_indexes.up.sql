-- Composite index to accelerate DISTINCT ON (pull_request_id) latest review lookups
CREATE INDEX IF NOT EXISTS idx_review_runs_pr_created_at
    ON review_runs(pull_request_id, created_at DESC);

-- Enforce valid lifecycle status values at the database level
ALTER TABLE pull_requests
    ADD CONSTRAINT chk_pull_requests_status
    CHECK (status IN ('open', 'closed', 'merged'));

ALTER TABLE review_runs
    ADD CONSTRAINT chk_review_runs_status
    CHECK (status IN ('pending', 'processing', 'completed', 'failed'));
