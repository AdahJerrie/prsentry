-- 1. INSTALLATIONS (GitHub App level tenant tracking)
CREATE TABLE installations (
    id BIGINT PRIMARY KEY, -- Uses GitHub's native installation_id
    account_name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. REPOSITORIES
CREATE TABLE repositories (
    id BIGSERIAL PRIMARY KEY,
    installation_id BIGINT NOT NULL REFERENCES installations(id) ON DELETE CASCADE,
    github_repo_id BIGINT UNIQUE NOT NULL,
    full_name VARCHAR(255) NOT NULL, -- e.g. "owner/repo"
    is_active BOOLEAN NOT NULL DEFAULT TRUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 3. PULL REQUESTS
CREATE TABLE pull_requests (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    repository_id BIGINT NOT NULL REFERENCES repositories(id) ON DELETE CASCADE,
    pr_number INT NOT NULL,
    title VARCHAR(512),
    author VARCHAR(255),
    status VARCHAR(50) NOT NULL DEFAULT 'open', -- 'open', 'closed', 'merged'
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- Prevent duplicate PR records within the same repository
    CONSTRAINT unique_repo_pr UNIQUE (repository_id, pr_number)
);

-- 4. REVIEW RUNS (One PR can have multiple runs over time)
CREATE TABLE review_runs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    pull_request_id UUID NOT NULL REFERENCES pull_requests(id) ON DELETE CASCADE,
    commit_sha VARCHAR(40),
    status VARCHAR(50) NOT NULL DEFAULT 'completed', -- 'pending', 'completed', 'failed'
    summary TEXT NOT NULL,
    risk_score NUMERIC(3, 1) NOT NULL CHECK (risk_score >= 1.0 AND risk_score <= 5.0),
    merge_recommendation VARCHAR(20) NOT NULL CHECK (merge_recommendation IN ('safe', 'caution', 'block')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 5. FINDINGS (Granular AI results per review run)
CREATE TABLE findings (
    id BIGSERIAL PRIMARY KEY,
    review_run_id UUID NOT NULL REFERENCES review_runs(id) ON DELETE CASCADE,
    file_path TEXT NOT NULL,
    line_number INT NOT NULL,
    severity VARCHAR(20) NOT NULL CHECK (severity IN ('low', 'medium', 'high')),
    category VARCHAR(50) NOT NULL CHECK (category IN ('bug', 'security', 'performance', 'style', 'maintainability')),
    message TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- INDEXES FOR REACT DASHBOARD PERFORMANCE

-- Fast lookup when navigating to a specific PR page in React
CREATE INDEX idx_pull_requests_repo_number ON pull_requests(repository_id, pr_number);

-- Fast lookup for fetching all runs belonging to a PR
CREATE INDEX idx_review_runs_pr_id ON review_runs(pull_request_id);

-- Fast dashboard filtering for high-severity findings across runs
CREATE INDEX idx_findings_run_severity ON findings(review_run_id, severity);

-- Filtering PRs by open/closed status on the main dashboard list
CREATE INDEX idx_pull_requests_status ON pull_requests(status);