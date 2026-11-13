package db

import (
	"context"
	"errors"
	"fmt"
	"math"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"prsentry/go-service/internal/review"
)

var (
	ErrInvalidID = errors.New("invalid UUID identifier")
	ErrNotFound  = errors.New("resource not found")
)

type Store struct {
	*Queries
	pool *pgxpool.Pool
}

func NewStore(pool *pgxpool.Pool) *Store {
	return &Store{
		Queries: New(pool),
		pool:    pool,
	}
}

func (store *Store) Ping(ctx context.Context) error {
	return store.pool.Ping(ctx)
}

func (store *Store) execTx(ctx context.Context, fn func(*Queries) error) error {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}

	q := New(tx)
	err = fn(q)
	if err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			return fmt.Errorf("tx err: %w, rollback err: %v", err, rbErr)
		}
		return err
	}

	return tx.Commit(ctx)
}

// PRMetadata carries the GitHub installation, repository, and PR context needed
// to persist a review run with full referential integrity.
type PRMetadata struct {
	InstallationID int64
	AccountName    string
	GithubRepoID   int64
	RepoFullName   string
	PRNumber       int
	Title          string
	Author         string
	PRStatus       string
	HeadSHA        string
	RunStatus      string
}

func truncateRunes(s string, maxLen int) string {
	runes := []rune(s)
	if len(runes) <= maxLen {
		return s
	}
	return string(runes[:maxLen])
}

func normalizePRStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "open", "closed", "merged":
		return strings.ToLower(strings.TrimSpace(status))
	default:
		return "open"
	}
}

func normalizeRunStatus(status string) string {
	switch strings.ToLower(strings.TrimSpace(status)) {
	case "pending", "processing", "completed", "failed":
		return strings.ToLower(strings.TrimSpace(status))
	default:
		return "completed"
	}
}

func normalizeRecommendation(rec string) string {
	switch strings.ToLower(strings.TrimSpace(rec)) {
	case "safe", "caution", "block":
		return strings.ToLower(strings.TrimSpace(rec))
	default:
		return "caution"
	}
}

func normalizeSeverity(sev string) string {
	switch strings.ToLower(strings.TrimSpace(sev)) {
	case "low", "medium", "high":
		return strings.ToLower(strings.TrimSpace(sev))
	default:
		return "low"
	}
}

func normalizeCategory(cat string) string {
	switch strings.ToLower(strings.TrimSpace(cat)) {
	case "bug", "security", "performance", "style", "maintainability":
		return strings.ToLower(strings.TrimSpace(cat))
	default:
		return "maintainability"
	}
}

func clampRiskScore(score float64) float64 {
	if math.IsNaN(score) || math.IsInf(score, 0) {
		return 3.0
	}
	if score < 1.0 {
		return 1.0
	}
	if score > 5.0 {
		return 5.0
	}
	return score
}

func uuidToString(u pgtype.UUID) string {
	if !u.Valid {
		return ""
	}
	b := u.Bytes
	return fmt.Sprintf("%08x-%04x-%04x-%04x-%012x", b[0:4], b[4:6], b[6:8], b[8:10], b[10:16])
}

func parseUUID(raw string) (pgtype.UUID, error) {
	var u pgtype.UUID
	if err := u.Scan(strings.TrimSpace(raw)); err != nil || !u.Valid {
		return pgtype.UUID{}, ErrInvalidID
	}
	return u, nil
}

// SaveFullReviewResult persists the installation, repository, pull request,
// review run, and granular findings atomically inside a single database transaction.
func (store *Store) SaveFullReviewResult(ctx context.Context, meta PRMetadata, result *review.ReviewResponse) (string, error) {
	if meta.InstallationID <= 0 {
		return "", fmt.Errorf("invalid installation ID: %d", meta.InstallationID)
	}
	if meta.GithubRepoID <= 0 {
		return "", fmt.Errorf("invalid GitHub repository ID: %d", meta.GithubRepoID)
	}
	if meta.PRNumber <= 0 {
		return "", fmt.Errorf("invalid PR number: %d", meta.PRNumber)
	}
	if strings.TrimSpace(meta.RepoFullName) == "" {
		return "", errors.New("repository full_name is required")
	}

	accountName := strings.TrimSpace(meta.AccountName)
	if accountName == "" {
		parts := strings.SplitN(meta.RepoFullName, "/", 2)
		accountName = parts[0]
	}

	title := strings.TrimSpace(meta.Title)
	if title == "" {
		title = fmt.Sprintf("PR #%d", meta.PRNumber)
	}

	author := strings.TrimSpace(meta.Author)
	if author == "" {
		author = "unknown"
	}

	var savedPRID string

	err := store.execTx(ctx, func(q *Queries) error {
		if _, err := q.CreateInstallation(ctx, CreateInstallationParams{
			ID:          meta.InstallationID,
			AccountName: truncateRunes(accountName, 255),
		}); err != nil {
			return fmt.Errorf("failed to upsert installation: %w", err)
		}

		repo, err := q.CreateRepository(ctx, CreateRepositoryParams{
			InstallationID: meta.InstallationID,
			GithubRepoID:   meta.GithubRepoID,
			FullName:       truncateRunes(meta.RepoFullName, 255),
		})
		if err != nil {
			return fmt.Errorf("failed to upsert repository: %w", err)
		}

		pr, err := q.CreatePullRequest(ctx, CreatePullRequestParams{
			RepositoryID: repo.ID,
			PrNumber:     int32(meta.PRNumber),
			Title:        pgtype.Text{String: truncateRunes(title, 512), Valid: true},
			Author:       pgtype.Text{String: truncateRunes(author, 255), Valid: true},
			Status:       normalizePRStatus(meta.PRStatus),
		})
		if err != nil {
			return fmt.Errorf("failed to upsert pull request: %w", err)
		}
		savedPRID = uuidToString(pr.ID)

		var riskScoreNumeric pgtype.Numeric
		if err := riskScoreNumeric.Scan(fmt.Sprintf("%.1f", clampRiskScore(result.RiskScore))); err != nil {
			return fmt.Errorf("failed to encode risk score: %w", err)
		}

		commitSHA := pgtype.Text{Valid: false}
		if trimmedSHA := strings.TrimSpace(meta.HeadSHA); trimmedSHA != "" {
			commitSHA = pgtype.Text{String: truncateRunes(trimmedSHA, 40), Valid: true}
		}

		run, err := q.CreateReviewRun(ctx, CreateReviewRunParams{
			PullRequestID:       pr.ID,
			CommitSha:           commitSHA,
			Status:              normalizeRunStatus(meta.RunStatus),
			Summary:             result.Summary,
			RiskScore:           riskScoreNumeric,
			MergeRecommendation: normalizeRecommendation(result.MergeRecommendation),
		})
		if err != nil {
			return fmt.Errorf("failed to insert review run: %w", err)
		}

		for _, f := range result.Findings {
			lineNum := f.LineNumber
			if lineNum < 1 {
				lineNum = 1
			}
			err = q.CreateFinding(ctx, CreateFindingParams{
				ReviewRunID: run.ID,
				FilePath:    f.FilePath,
				LineNumber:  int32(lineNum),
				Severity:    normalizeSeverity(f.Severity),
				Category:    normalizeCategory(f.Category),
				Message:     f.Message,
			})
			if err != nil {
				return fmt.Errorf("failed to insert finding for file %s: %w", f.FilePath, err)
			}
		}

		return nil
	})
	if err != nil {
		return "", err
	}

	return savedPRID, nil
}

// ============================================================================
// READ API MODELS & METHODS FOR REACT DASHBOARD
// ============================================================================

type ListPRsFilter struct {
	Repo           string
	Status         string
	Recommendation string
	Limit          int
}

// PRSummary represents a pull request alongside its latest review run status.
type PRSummary struct {
	ID                  string    `json:"id"`
	RepoFullName        string    `json:"repo_full_name"`
	PRNumber            int       `json:"pr_number"`
	Title               string    `json:"title"`
	Author              string    `json:"author"`
	PRStatus            string    `json:"pr_status"`
	LatestReviewID      string    `json:"latest_review_id"`
	ReviewStatus        string    `json:"review_status"`
	HeadSHA             string    `json:"head_sha"`
	RiskScore           float64   `json:"risk_score"`
	MergeRecommendation string    `json:"merge_recommendation"`
	Summary             string    `json:"summary"`
	FindingsCount       int       `json:"findings_count"`
	HighSeverityCount   int       `json:"high_severity_count"`
	CreatedAt           time.Time `json:"created_at"`
}

// PRFinding represents an individual AI finding for a review run.
type PRFinding struct {
	ID         int64  `json:"id"`
	FilePath   string `json:"file_path"`
	LineNumber int    `json:"line_number"`
	Severity   string `json:"severity"`
	Category   string `json:"category"`
	Message    string `json:"message"`
}

// ReviewRunSummary represents a historical review run on a pull request.
type ReviewRunSummary struct {
	ID                  string    `json:"id"`
	HeadSHA             string    `json:"head_sha"`
	Status              string    `json:"status"`
	RiskScore           float64   `json:"risk_score"`
	MergeRecommendation string    `json:"merge_recommendation"`
	Summary             string    `json:"summary"`
	FindingsCount       int       `json:"findings_count"`
	CreatedAt           time.Time `json:"created_at"`
}

// PRDetail represents a full pull request view with its latest review, findings, and run history.
type PRDetail struct {
	PRSummary
	Findings   []PRFinding        `json:"findings"`
	ReviewRuns []ReviewRunSummary `json:"review_runs"`
}

// ReviewDetail represents one specific review run and all of its findings.
type ReviewDetail struct {
	ID                  string      `json:"id"`
	PullRequestID       string      `json:"pull_request_id"`
	RepoFullName        string      `json:"repo_full_name"`
	PRNumber            int         `json:"pr_number"`
	PRTitle             string      `json:"pr_title"`
	Author              string      `json:"author"`
	HeadSHA             string      `json:"head_sha"`
	Status              string      `json:"status"`
	Summary             string      `json:"summary"`
	RiskScore           float64     `json:"risk_score"`
	MergeRecommendation string      `json:"merge_recommendation"`
	CreatedAt           time.Time   `json:"created_at"`
	Findings            []PRFinding `json:"findings"`
}

// DailyReviewStat represents review volume and average risk for a single calendar day.
type DailyReviewStat struct {
	Date         string  `json:"date"`
	ReviewCount  int     `json:"review_count"`
	AvgRiskScore float64 `json:"avg_risk_score"`
}

// DashboardStats represents aggregated telemetry for the dashboard overview and trends view.
type DashboardStats struct {
	TotalPRs         int               `json:"total_prs"`
	TotalReviews     int               `json:"total_reviews"`
	AverageRiskScore float64           `json:"average_risk_score"`
	TotalFindings    int               `json:"total_findings"`
	Recommendations  map[string]int    `json:"recommendations"`
	Severities       map[string]int    `json:"severities"`
	Categories       map[string]int    `json:"categories"`
	Repositories     []string          `json:"repositories"`
	RecentReviews    []DailyReviewStat `json:"recent_reviews"`
}

// ListPRs fetches analyzed PRs (surfacing only the latest review run per PR).
func (s *Store) ListPRs(ctx context.Context, filter ListPRsFilter) ([]PRSummary, error) {
	limit := filter.Limit
	if limit <= 0 {
		limit = 50
	}
	if limit > 200 {
		limit = 200
	}

	query := `
		WITH latest_runs AS (
			SELECT DISTINCT ON (pull_request_id)
				id,
				pull_request_id,
				commit_sha,
				status,
				summary,
				risk_score,
				merge_recommendation,
				created_at
			FROM review_runs
			ORDER BY pull_request_id, created_at DESC
		),
		finding_totals AS (
			SELECT
				review_run_id,
				COUNT(*)::int AS total_count,
				COUNT(*) FILTER (WHERE severity = 'high')::int AS high_count
			FROM findings
			GROUP BY review_run_id
		)
		SELECT
			pr.id,
			r.full_name,
			pr.pr_number,
			pr.title,
			pr.author,
			pr.status,
			lr.id,
			lr.status,
			lr.commit_sha,
			lr.risk_score,
			lr.merge_recommendation,
			lr.summary,
			COALESCE(ft.total_count, 0),
			COALESCE(ft.high_count, 0),
			lr.created_at
		FROM pull_requests pr
		JOIN repositories r ON pr.repository_id = r.id
		JOIN latest_runs lr ON pr.id = lr.pull_request_id
		LEFT JOIN finding_totals ft ON lr.id = ft.review_run_id
		WHERE ($1 = '' OR r.full_name = $1)
		  AND ($2 = '' OR pr.status = $2 OR lr.status = $2)
		  AND ($3 = '' OR lr.merge_recommendation = $3)
		ORDER BY lr.created_at DESC
		LIMIT $4
	`

	rows, err := s.pool.Query(
		ctx,
		query,
		strings.TrimSpace(filter.Repo),
		strings.ToLower(strings.TrimSpace(filter.Status)),
		strings.ToLower(strings.TrimSpace(filter.Recommendation)),
		limit,
	)
	if err != nil {
		return nil, fmt.Errorf("querying PRs: %w", err)
	}
	defer rows.Close()

	summaries := make([]PRSummary, 0)
	for rows.Next() {
		var (
			sum        PRSummary
			prUUID     pgtype.UUID
			runUUID    pgtype.UUID
			titleText  pgtype.Text
			authorText pgtype.Text
			shaText    pgtype.Text
			scoreNum   pgtype.Numeric
			createdAt  pgtype.Timestamptz
		)

		err := rows.Scan(
			&prUUID,
			&sum.RepoFullName,
			&sum.PRNumber,
			&titleText,
			&authorText,
			&sum.PRStatus,
			&runUUID,
			&sum.ReviewStatus,
			&shaText,
			&scoreNum,
			&sum.MergeRecommendation,
			&sum.Summary,
			&sum.FindingsCount,
			&sum.HighSeverityCount,
			&createdAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning PR row: %w", err)
		}

		sum.ID = uuidToString(prUUID)
		sum.LatestReviewID = uuidToString(runUUID)
		sum.Title = titleText.String
		sum.Author = authorText.String
		sum.HeadSHA = shaText.String
		sum.CreatedAt = createdAt.Time

		val, _ := scoreNum.Float64Value()
		if val.Valid {
			sum.RiskScore = val.Float64
		}

		summaries = append(summaries, sum)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating PR rows: %w", err)
	}

	return summaries, nil
}

func (s *Store) fetchFindingsByReviewRun(ctx context.Context, runUUID pgtype.UUID) ([]PRFinding, error) {
	query := `
		SELECT
			id,
			file_path,
			line_number,
			severity,
			category,
			message
		FROM findings
		WHERE review_run_id = $1
		ORDER BY
			CASE severity
				WHEN 'high' THEN 0
				WHEN 'medium' THEN 1
				ELSE 2
			END ASC,
			id ASC
	`

	rows, err := s.pool.Query(ctx, query, runUUID)
	if err != nil {
		return nil, fmt.Errorf("querying findings: %w", err)
	}
	defer rows.Close()

	findings := make([]PRFinding, 0)
	for rows.Next() {
		var f PRFinding
		if err := rows.Scan(
			&f.ID,
			&f.FilePath,
			&f.LineNumber,
			&f.Severity,
			&f.Category,
			&f.Message,
		); err != nil {
			return nil, fmt.Errorf("scanning finding row: %w", err)
		}
		findings = append(findings, f)
	}

	if err := rows.Err(); err != nil {
		return nil, fmt.Errorf("iterating finding rows: %w", err)
	}

	return findings, nil
}

// GetPRFindings fetches all AI findings from the latest review run of a specific PR.
func (s *Store) GetPRFindings(ctx context.Context, prID string) ([]PRFinding, error) {
	prUUID, err := parseUUID(prID)
	if err != nil {
		return nil, err
	}

	var latestRunUUID pgtype.UUID
	err = s.pool.QueryRow(ctx, `
		SELECT rr.id
		FROM pull_requests pr
		LEFT JOIN review_runs rr ON rr.pull_request_id = pr.id
		WHERE pr.id = $1
		ORDER BY rr.created_at DESC
		LIMIT 1
	`, prUUID).Scan(&latestRunUUID)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("looking up latest review run: %w", err)
	}

	if !latestRunUUID.Valid {
		return make([]PRFinding, 0), nil
	}

	return s.fetchFindingsByReviewRun(ctx, latestRunUUID)
}

// GetPRDetail fetches a single pull request with its latest review, findings, and run history.
func (s *Store) GetPRDetail(ctx context.Context, prID string) (*PRDetail, error) {
	prUUID, err := parseUUID(prID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT
			pr.id,
			r.full_name,
			pr.pr_number,
			pr.title,
			pr.author,
			pr.status,
			rr.id,
			rr.status,
			rr.commit_sha,
			rr.risk_score,
			rr.merge_recommendation,
			rr.summary,
			rr.created_at
		FROM pull_requests pr
		JOIN repositories r ON pr.repository_id = r.id
		JOIN review_runs rr ON pr.id = rr.pull_request_id
		WHERE pr.id = $1
		ORDER BY rr.created_at DESC
		LIMIT 1
	`

	var (
		detail     PRDetail
		scannedPR  pgtype.UUID
		latestUUID pgtype.UUID
		titleText  pgtype.Text
		authorText pgtype.Text
		shaText    pgtype.Text
		scoreNum   pgtype.Numeric
		createdAt  pgtype.Timestamptz
	)

	err = s.pool.QueryRow(ctx, query, prUUID).Scan(
		&scannedPR,
		&detail.RepoFullName,
		&detail.PRNumber,
		&titleText,
		&authorText,
		&detail.PRStatus,
		&latestUUID,
		&detail.ReviewStatus,
		&shaText,
		&scoreNum,
		&detail.MergeRecommendation,
		&detail.Summary,
		&createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("querying PR detail: %w", err)
	}

	detail.ID = uuidToString(scannedPR)
	detail.LatestReviewID = uuidToString(latestUUID)
	detail.Title = titleText.String
	detail.Author = authorText.String
	detail.HeadSHA = shaText.String
	detail.CreatedAt = createdAt.Time

	val, _ := scoreNum.Float64Value()
	if val.Valid {
		detail.RiskScore = val.Float64
	}

	findings, err := s.fetchFindingsByReviewRun(ctx, latestUUID)
	if err != nil {
		return nil, err
	}
	detail.Findings = findings
	detail.FindingsCount = len(findings)
	for _, f := range findings {
		if f.Severity == "high" {
			detail.HighSeverityCount++
		}
	}

	runsRows, err := s.pool.Query(ctx, `
		SELECT
			rr.id,
			rr.commit_sha,
			rr.status,
			rr.risk_score,
			rr.merge_recommendation,
			rr.summary,
			COUNT(f.id)::int AS findings_count,
			rr.created_at
		FROM review_runs rr
		LEFT JOIN findings f ON f.review_run_id = rr.id
		WHERE rr.pull_request_id = $1
		GROUP BY rr.id
		ORDER BY rr.created_at DESC
	`, prUUID)
	if err != nil {
		return nil, fmt.Errorf("querying PR review history: %w", err)
	}
	defer runsRows.Close()

	detail.ReviewRuns = make([]ReviewRunSummary, 0)
	for runsRows.Next() {
		var (
			run          ReviewRunSummary
			runUUID      pgtype.UUID
			runSHA       pgtype.Text
			runScore     pgtype.Numeric
			runCreatedAt pgtype.Timestamptz
		)
		if err := runsRows.Scan(
			&runUUID,
			&runSHA,
			&run.Status,
			&runScore,
			&run.MergeRecommendation,
			&run.Summary,
			&run.FindingsCount,
			&runCreatedAt,
		); err != nil {
			return nil, fmt.Errorf("scanning review run row: %w", err)
		}
		run.ID = uuidToString(runUUID)
		run.HeadSHA = runSHA.String
		run.CreatedAt = runCreatedAt.Time
		if rv, _ := runScore.Float64Value(); rv.Valid {
			run.RiskScore = rv.Float64
		}
		detail.ReviewRuns = append(detail.ReviewRuns, run)
	}
	if err := runsRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating review run rows: %w", err)
	}

	return &detail, nil
}

// GetReviewDetail fetches one specific review run by its UUID along with its findings.
func (s *Store) GetReviewDetail(ctx context.Context, reviewID string) (*ReviewDetail, error) {
	runUUID, err := parseUUID(reviewID)
	if err != nil {
		return nil, err
	}

	query := `
		SELECT
			rr.id,
			rr.pull_request_id,
			r.full_name,
			pr.pr_number,
			pr.title,
			pr.author,
			rr.commit_sha,
			rr.status,
			rr.summary,
			rr.risk_score,
			rr.merge_recommendation,
			rr.created_at
		FROM review_runs rr
		JOIN pull_requests pr ON rr.pull_request_id = pr.id
		JOIN repositories r ON pr.repository_id = r.id
		WHERE rr.id = $1
	`

	var (
		detail     ReviewDetail
		scannedRun pgtype.UUID
		scannedPR  pgtype.UUID
		titleText  pgtype.Text
		authorText pgtype.Text
		shaText    pgtype.Text
		scoreNum   pgtype.Numeric
		createdAt  pgtype.Timestamptz
	)

	err = s.pool.QueryRow(ctx, query, runUUID).Scan(
		&scannedRun,
		&scannedPR,
		&detail.RepoFullName,
		&detail.PRNumber,
		&titleText,
		&authorText,
		&shaText,
		&detail.Status,
		&detail.Summary,
		&scoreNum,
		&detail.MergeRecommendation,
		&createdAt,
	)
	if err != nil {
		if errors.Is(err, pgx.ErrNoRows) {
			return nil, ErrNotFound
		}
		return nil, fmt.Errorf("querying review detail: %w", err)
	}

	detail.ID = uuidToString(scannedRun)
	detail.PullRequestID = uuidToString(scannedPR)
	detail.PRTitle = titleText.String
	detail.Author = authorText.String
	detail.HeadSHA = shaText.String
	detail.CreatedAt = createdAt.Time

	if val, _ := scoreNum.Float64Value(); val.Valid {
		detail.RiskScore = val.Float64
	}

	findings, err := s.fetchFindingsByReviewRun(ctx, scannedRun)
	if err != nil {
		return nil, err
	}
	detail.Findings = findings

	return &detail, nil
}

// GetDashboardStats computes aggregate metrics across analyzed PRs and latest findings.
func (s *Store) GetDashboardStats(ctx context.Context) (*DashboardStats, error) {
	stats := &DashboardStats{
		Recommendations: map[string]int{
			"safe":    0,
			"caution": 0,
			"block":   0,
		},
		Severities: map[string]int{
			"high":   0,
			"medium": 0,
			"low":    0,
		},
		Categories: map[string]int{
			"bug":             0,
			"security":        0,
			"performance":     0,
			"style":           0,
			"maintainability": 0,
		},
		Repositories:  make([]string, 0),
		RecentReviews: make([]DailyReviewStat, 0),
	}

	var safeCount, cautionCount, blockCount int
	err := s.pool.QueryRow(ctx, `
		WITH latest_runs AS (
			SELECT DISTINCT ON (pull_request_id)
				id,
				risk_score,
				merge_recommendation
			FROM review_runs
			ORDER BY pull_request_id, created_at DESC
		)
		SELECT
			COUNT(*)::int AS total_prs,
			COALESCE(ROUND(AVG(risk_score), 2)::float8, 0) AS avg_risk,
			COUNT(*) FILTER (WHERE merge_recommendation = 'safe')::int,
			COUNT(*) FILTER (WHERE merge_recommendation = 'caution')::int,
			COUNT(*) FILTER (WHERE merge_recommendation = 'block')::int
		FROM latest_runs
	`).Scan(&stats.TotalPRs, &stats.AverageRiskScore, &safeCount, &cautionCount, &blockCount)
	if err != nil {
		return nil, fmt.Errorf("querying summary stats: %w", err)
	}
	stats.Recommendations["safe"] = safeCount
	stats.Recommendations["caution"] = cautionCount
	stats.Recommendations["block"] = blockCount

	if err := s.pool.QueryRow(ctx, `SELECT COUNT(*)::int FROM review_runs`).Scan(&stats.TotalReviews); err != nil {
		return nil, fmt.Errorf("counting review runs: %w", err)
	}

	findingRows, err := s.pool.Query(ctx, `
		WITH latest_runs AS (
			SELECT DISTINCT ON (pull_request_id) id
			FROM review_runs
			ORDER BY pull_request_id, created_at DESC
		)
		SELECT f.severity, f.category, COUNT(*)::int
		FROM findings f
		JOIN latest_runs lr ON f.review_run_id = lr.id
		GROUP BY f.severity, f.category
	`)
	if err != nil {
		return nil, fmt.Errorf("querying finding stats: %w", err)
	}
	defer findingRows.Close()

	for findingRows.Next() {
		var sev, cat string
		var count int
		if err := findingRows.Scan(&sev, &cat, &count); err != nil {
			return nil, fmt.Errorf("scanning finding stat: %w", err)
		}
		stats.TotalFindings += count
		stats.Severities[sev] += count
		stats.Categories[cat] += count
	}
	if err := findingRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating finding stats: %w", err)
	}

	repoRows, err := s.pool.Query(ctx, `SELECT full_name FROM repositories WHERE is_active = TRUE ORDER BY full_name ASC`)
	if err != nil {
		return nil, fmt.Errorf("querying active repositories: %w", err)
	}
	defer repoRows.Close()

	for repoRows.Next() {
		var name string
		if err := repoRows.Scan(&name); err != nil {
			return nil, fmt.Errorf("scanning repository name: %w", err)
		}
		stats.Repositories = append(stats.Repositories, name)
	}
	if err := repoRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating repository names: %w", err)
	}

	trendRows, err := s.pool.Query(ctx, `
		SELECT
			TO_CHAR(created_at AT TIME ZONE 'UTC', 'YYYY-MM-DD') AS day,
			COUNT(*)::int AS review_count,
			COALESCE(ROUND(AVG(risk_score), 2)::float8, 0) AS avg_risk
		FROM review_runs
		WHERE created_at >= NOW() - INTERVAL '14 days'
		GROUP BY day
		ORDER BY day ASC
	`)
	if err != nil {
		return nil, fmt.Errorf("querying recent review trends: %w", err)
	}
	defer trendRows.Close()

	for trendRows.Next() {
		var item DailyReviewStat
		if err := trendRows.Scan(&item.Date, &item.ReviewCount, &item.AvgRiskScore); err != nil {
			return nil, fmt.Errorf("scanning daily trend: %w", err)
		}
		stats.RecentReviews = append(stats.RecentReviews, item)
	}
	if err := trendRows.Err(); err != nil {
		return nil, fmt.Errorf("iterating daily trends: %w", err)
	}

	return stats, nil
}
