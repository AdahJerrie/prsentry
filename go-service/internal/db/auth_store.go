package db

import (
	"context"
	"errors"
	"fmt"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
)

// GitHubUser is the identity returned by GitHub OAuth.
type GitHubUser struct {
	GithubUserID int64
	Login        string
	DisplayName  string
	AvatarURL    string
}

// RepoRef is one repository granted to a GitHub App installation.
type RepoRef struct {
	GithubRepoID int64
	FullName     string
}

// SessionProfile is the signed-in user and the repositories they installed.
type SessionProfile struct {
	UserID       string   `json:"-"`
	Login        string   `json:"login"`
	Name         string   `json:"name"`
	AvatarURL    string   `json:"avatar_url"`
	Repositories []string `json:"repositories"`
}

// SaveOAuthState stores a one-time OAuth state nonce.
func (s *Store) SaveOAuthState(ctx context.Context, state string, expiresAt time.Time) error {
	state = strings.TrimSpace(state)
	if state == "" {
		return errors.New("oauth state is required")
	}
	if _, err := s.pool.Exec(ctx, `DELETE FROM oauth_states WHERE expires_at < NOW()`); err != nil {
		return fmt.Errorf("saving oauth state: %w", err)
	}
	_, err := s.pool.Exec(ctx, `
		INSERT INTO oauth_states (state, expires_at) VALUES ($1, $2)
		ON CONFLICT (state) DO UPDATE SET expires_at = EXCLUDED.expires_at
	`, state, expiresAt)
	if err != nil {
		return fmt.Errorf("saving oauth state: %w", err)
	}
	return nil
}

// ConsumeOAuthState returns true when the nonce exists and has not expired.
func (s *Store) ConsumeOAuthState(ctx context.Context, state string) (bool, error) {
	var ok bool
	err := s.pool.QueryRow(ctx, `
		DELETE FROM oauth_states
		WHERE state = $1 AND expires_at >= NOW()
		RETURNING TRUE
	`, strings.TrimSpace(state)).Scan(&ok)
	if errors.Is(err, pgx.ErrNoRows) {
		return false, nil
	}
	if err != nil {
		return false, fmt.Errorf("consuming oauth state: %w", err)
	}
	return ok, nil
}

// UpsertGitHubUser creates or updates the user identified by GitHub's numeric id.
func (s *Store) UpsertGitHubUser(ctx context.Context, user GitHubUser) (string, error) {
	if user.GithubUserID <= 0 || strings.TrimSpace(user.Login) == "" {
		return "", errors.New("github user id and login are required")
	}
	var id pgtype.UUID
	err := s.pool.QueryRow(ctx, `
		INSERT INTO users (github_user_id, login, display_name, avatar_url)
		VALUES ($1, $2, $3, $4)
		ON CONFLICT (github_user_id) DO UPDATE
		SET login = EXCLUDED.login,
		    display_name = EXCLUDED.display_name,
		    avatar_url = EXCLUDED.avatar_url,
		    updated_at = NOW()
		RETURNING id
	`, user.GithubUserID, truncateRunes(user.Login, 255), truncateRunes(user.DisplayName, 255), user.AvatarURL).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("upserting github user: %w", err)
	}
	return uuidToString(id), nil
}

// CreateSession issues a dashboard session for a user.
func (s *Store) CreateSession(ctx context.Context, userID string, expiresAt time.Time) (string, error) {
	uid, err := parseUUID(userID)
	if err != nil {
		return "", err
	}
	var id pgtype.UUID
	err = s.pool.QueryRow(ctx, `
		INSERT INTO sessions (user_id, expires_at) VALUES ($1, $2) RETURNING id
	`, uid, expiresAt).Scan(&id)
	if err != nil {
		return "", fmt.Errorf("creating session: %w", err)
	}
	return uuidToString(id), nil
}

// DeleteSession removes one session. Missing sessions are not an error.
func (s *Store) DeleteSession(ctx context.Context, sessionID string) error {
	sid, err := parseUUID(sessionID)
	if err != nil {
		return nil
	}
	_, err = s.pool.Exec(ctx, `DELETE FROM sessions WHERE id = $1`, sid)
	return err
}

// LookupSession returns the profile for a live session.
func (s *Store) LookupSession(ctx context.Context, sessionID string) (*SessionProfile, error) {
	sid, err := parseUUID(sessionID)
	if err != nil {
		return nil, ErrNotFound
	}
	profile := &SessionProfile{}
	var uid pgtype.UUID
	err = s.pool.QueryRow(ctx, `
		SELECT u.id, u.login, u.display_name, u.avatar_url
		FROM sessions s
		JOIN users u ON u.id = s.user_id
		WHERE s.id = $1 AND s.expires_at > NOW()
	`, sid).Scan(&uid, &profile.Login, &profile.Name, &profile.AvatarURL)
	if errors.Is(err, pgx.ErrNoRows) {
		return nil, ErrNotFound
	}
	if err != nil {
		return nil, fmt.Errorf("looking up session: %w", err)
	}
	profile.UserID = uuidToString(uid)
	profile.Repositories, err = s.listInstalledRepos(ctx, uid)
	if err != nil {
		return nil, err
	}
	return profile, nil
}

func (s *Store) listInstalledRepos(ctx context.Context, userID pgtype.UUID) ([]string, error) {
	rows, err := s.pool.Query(ctx, `
		SELECT r.full_name
		FROM repositories r
		JOIN installations i ON i.id = r.installation_id
		WHERE i.installed_by = $1 AND r.is_active = TRUE
		ORDER BY r.full_name ASC
	`, userID)
	if err != nil {
		return nil, fmt.Errorf("listing installed repositories: %w", err)
	}
	defer rows.Close()
	names := make([]string, 0)
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			return nil, err
		}
		names = append(names, name)
	}
	return names, rows.Err()
}

// RepoMonitored reports whether this installation currently includes the repository.
func (s *Store) RepoMonitored(ctx context.Context, installationID, githubRepoID int64) (bool, error) {
	var monitored bool
	err := s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1 FROM repositories
			WHERE installation_id = $1 AND github_repo_id = $2 AND is_active = TRUE
		)
	`, installationID, githubRepoID).Scan(&monitored)
	if err != nil {
		return false, fmt.Errorf("checking monitored repository: %w", err)
	}
	return monitored, nil
}

// UserOwnsPullRequest reports whether the PR belongs to an installation this user connected.
func (s *Store) UserOwnsPullRequest(ctx context.Context, userID, prID string) (bool, error) {
	uid, err := parseUUID(userID)
	if err != nil {
		return false, err
	}
	pid, err := parseUUID(prID)
	if err != nil {
		return false, err
	}
	var ok bool
	err = s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM pull_requests pr
			JOIN repositories r ON r.id = pr.repository_id
			JOIN installations i ON i.id = r.installation_id
			WHERE pr.id = $1 AND i.installed_by = $2
		)
	`, pid, uid).Scan(&ok)
	if err != nil {
		return false, err
	}
	return ok, nil
}

// UserOwnsReview reports whether the review run belongs to an installation this user connected.
func (s *Store) UserOwnsReview(ctx context.Context, userID, reviewID string) (bool, error) {
	uid, err := parseUUID(userID)
	if err != nil {
		return false, err
	}
	rid, err := parseUUID(reviewID)
	if err != nil {
		return false, err
	}
	var ok bool
	err = s.pool.QueryRow(ctx, `
		SELECT EXISTS (
			SELECT 1
			FROM review_runs rr
			JOIN pull_requests pr ON pr.id = rr.pull_request_id
			JOIN repositories r ON r.id = pr.repository_id
			JOIN installations i ON i.id = r.installation_id
			WHERE rr.id = $1 AND i.installed_by = $2
		)
	`, rid, uid).Scan(&ok)
	if err != nil {
		return false, err
	}
	return ok, nil
}

// SyncInstallation upserts an installation and applies a repository selection.
// mode is "replace" (selected set becomes the active set), "add", "remove", or "deactivate_all".
func (s *Store) SyncInstallation(ctx context.Context, account string, installationID int64, repos []RepoRef, userID, mode string) error {
	if installationID <= 0 {
		return fmt.Errorf("invalid installation ID: %d", installationID)
	}
	account = strings.TrimSpace(account)
	if account == "" {
		account = "github"
	}
	var installedBy pgtype.UUID
	if strings.TrimSpace(userID) != "" {
		parsed, err := parseUUID(userID)
		if err != nil {
			return err
		}
		installedBy = parsed
	}

	tx, err := s.pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx)

	if _, err := tx.Exec(ctx, `
		INSERT INTO installations (id, account_name, installed_by)
		VALUES ($1, $2, $3)
		ON CONFLICT (id) DO UPDATE
		SET account_name = EXCLUDED.account_name,
		    installed_by = COALESCE(EXCLUDED.installed_by, installations.installed_by),
		    updated_at = NOW()
	`, installationID, truncateRunes(account, 255), installedBy); err != nil {
		return fmt.Errorf("upserting installation: %w", err)
	}

	switch mode {
	case "deactivate_all":
		if _, err := tx.Exec(ctx, `
			UPDATE repositories SET is_active = FALSE, updated_at = NOW()
			WHERE installation_id = $1
		`, installationID); err != nil {
			return err
		}
	case "remove":
		ids := repoIDs(repos)
		if len(ids) > 0 {
			if _, err := tx.Exec(ctx, `
				UPDATE repositories SET is_active = FALSE, updated_at = NOW()
				WHERE installation_id = $1 AND github_repo_id = ANY($2::bigint[])
			`, installationID, ids); err != nil {
				return err
			}
		}
	case "add", "replace":
		if mode == "replace" {
			ids := repoIDs(repos)
			if _, err := tx.Exec(ctx, `
				UPDATE repositories SET is_active = FALSE, updated_at = NOW()
				WHERE installation_id = $1
				  AND NOT (github_repo_id = ANY($2::bigint[]))
			`, installationID, ids); err != nil {
				return err
			}
		}
		for _, repo := range repos {
			if repo.GithubRepoID <= 0 || strings.TrimSpace(repo.FullName) == "" {
				continue
			}
			if _, err := tx.Exec(ctx, `
				INSERT INTO repositories (installation_id, github_repo_id, full_name, is_active)
				VALUES ($1, $2, $3, TRUE)
				ON CONFLICT (github_repo_id) DO UPDATE
				SET installation_id = EXCLUDED.installation_id,
				    full_name = EXCLUDED.full_name,
				    is_active = TRUE,
				    updated_at = NOW()
			`, installationID, repo.GithubRepoID, truncateRunes(repo.FullName, 255)); err != nil {
				return fmt.Errorf("upserting repository %s: %w", repo.FullName, err)
			}
		}
	default:
		return fmt.Errorf("unknown installation sync mode %q", mode)
	}

	return tx.Commit(ctx)
}

func repoIDs(repos []RepoRef) []int64 {
	ids := make([]int64, 0, len(repos))
	for _, repo := range repos {
		if repo.GithubRepoID > 0 {
			ids = append(ids, repo.GithubRepoID)
		}
	}
	if ids == nil {
		return []int64{}
	}
	return ids
}
