-- Users identified by GitHub OAuth. The GitHub App itself is registered once;
-- each user installs that app and chooses repositories.
CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    github_user_id BIGINT UNIQUE NOT NULL,
    login VARCHAR(255) NOT NULL,
    display_name VARCHAR(255) NOT NULL DEFAULT '',
    avatar_url TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE sessions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMPTZ NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_sessions_user_id ON sessions(user_id);
CREATE INDEX idx_sessions_expires_at ON sessions(expires_at);

-- Short-lived OAuth state values. Checked once on the GitHub callback.
CREATE TABLE oauth_states (
    state TEXT PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

ALTER TABLE installations
    ADD COLUMN installed_by UUID REFERENCES users(id) ON DELETE SET NULL;

CREATE INDEX idx_installations_installed_by ON installations(installed_by);
