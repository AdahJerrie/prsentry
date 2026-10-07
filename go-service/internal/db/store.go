package db

import (
	"context"
	"fmt"
	"time"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"

	"prsentry/go-service/internal/review"
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

func (store *Store) execTx(ctx context.Context, fn func(*Queries) error) error {
	tx, err := store.pool.Begin(ctx)
	if err != nil {
		return err
	}

	q := New(tx)
	err = fn(q)
	if err != nil {
		if rbErr := tx.Rollback(ctx); rbErr != nil {
			return fmt.Errorf("tx err: %v, rollback err: %v", err, rbErr)
		}
		return err
	}

	return tx.Commit(ctx)
}

func (store *Store) SaveFullReviewResult(ctx context.Context, repoID int64, prNumber int, commitSha string, result *review.ReviewResponse) error {
	return store.execTx(ctx, func(q *Queries) error {

		// 1. Upsert Pull Request (Using pgtype.Text wrappers)
		pr, err := q.CreatePullRequest(ctx, CreatePullRequestParams{
			RepositoryID: repoID,
			PrNumber:     int32(prNumber),
			Title:        pgtype.Text{String: "Auto-synced via webhook", Valid: true},
			Author:       pgtype.Text{String: "unknown", Valid: true},
		})
		if err != nil {
			return fmt.Errorf("failed to insert PR: %w", err)
		}

		// Convert float64 RiskScore (e.g. 8.5) to pgtype.Numeric
		var riskScoreNumeric pgtype.Numeric
		_ = riskScoreNumeric.Scan(fmt.Sprintf("%.2f", result.RiskScore))

		// 2. Insert Review Run (Passing pr.ID returned from previous query)
		run, err := q.CreateReviewRun(ctx, CreateReviewRunParams{
			PullRequestID:       pr.ID,
			CommitSha:           pgtype.Text{String: commitSha, Valid: true},
			Summary:             result.Summary,
			RiskScore:           riskScoreNumeric,
			MergeRecommendation: result.MergeRecommendation,
		})
		if err != nil {
			return fmt.Errorf("failed to insert review run: %w", err)
		}

		// 3. Insert Findings
		for _, f := range result.Findings {
			err = q.CreateFinding(ctx, CreateFindingParams{
				ReviewRunID: run.ID,
				FilePath:    f.FilePath,
				LineNumber:  int32(f.LineNumber),
				Severity:    f.Severity,
				Category:    f.Category,
				Message:     f.Message,
			})
			if err != nil {
				return fmt.Errorf("failed to insert finding for file %s: %w", f.FilePath, err)
			}
		}

		return nil
	})
}

// ============================================================================
// READ API METHODS FOR REACT DASHBOARD
// ============================================================================

// PRSummary represents a lightweight pull request item for the dashboard list view.
type PRSummary struct {
	ID                  int64     `json:"id"`
	RepoFullName        string    `json:"repo_full_name"`
	PRNumber            int       `json:"pr_number"`
	HeadSHA             string    `json:"head_sha"`
	RiskScore           float64   `json:"risk_score"`
	MergeRecommendation string    `json:"merge_recommendation"`
	Summary             string    `json:"summary"`
	CreatedAt           time.Time `json:"created_at"`
}

// PRFinding represents an individual AI finding for a given PR.
type PRFinding struct {
	ID         int64  `json:"id"`
	FilePath   string `json:"file_path"`
	LineNumber int    `json:"line_number"`
	Severity   string `json:"severity"`
	Category   string `json:"category"`
	Message    string `json:"message"`
}

// ListPRs fetches all analyzed PRs ordered by creation date.
func (s *Store) ListPRs(ctx context.Context) ([]PRSummary, error) {
	query := `
		SELECT 
			pr.id,
			r.full_name,
			pr.pr_number,
			rr.commit_sha,
			rr.risk_score,
			rr.merge_recommendation,
			rr.summary,
			rr.created_at
		FROM pull_requests pr
		JOIN repositories r ON pr.repository_id = r.id
		JOIN review_runs rr ON pr.id = rr.pull_request_id
		ORDER BY rr.created_at DESC
	`

	rows, err := s.pool.Query(ctx, query)
	if err != nil {
		return nil, fmt.Errorf("querying PRs: %w", err)
	}
	defer rows.Close()

	var summaries []PRSummary
	for rows.Next() {
		var (
			sum       PRSummary
			shaText   pgtype.Text
			scoreNum  pgtype.Numeric
			createdAt pgtype.Timestamptz
		)

		err := rows.Scan(
			&sum.ID,
			&sum.RepoFullName,
			&sum.PRNumber,
			&shaText,
			&scoreNum,
			&sum.MergeRecommendation,
			&sum.Summary,
			&createdAt,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning PR row: %w", err)
		}

		// Map pgtype values
		sum.HeadSHA = shaText.String
		sum.CreatedAt = createdAt.Time

		// Convert Numeric to float64
		val, _ := scoreNum.Float64Value()
		if val.Valid {
			sum.RiskScore = val.Float64
		}

		summaries = append(summaries, sum)
	}

	return summaries, nil
}

// GetPRFindings fetches all AI findings associated with a specific PR ID.
func (s *Store) GetPRFindings(ctx context.Context, prID int64) ([]PRFinding, error) {
	query := `
		SELECT 
			f.id,
			f.file_path,
			f.line_number,
			f.severity,
			f.category,
			f.message
		FROM findings f
		JOIN review_runs rr ON f.review_run_id = rr.id
		WHERE rr.pull_request_id = $1
		ORDER BY f.id ASC
	`

	rows, err := s.pool.Query(ctx, query, prID)
	if err != nil {
		return nil, fmt.Errorf("querying findings: %w", err)
	}
	defer rows.Close()

	var findings []PRFinding
	for rows.Next() {
		var f PRFinding
		err := rows.Scan(
			&f.ID,
			&f.FilePath,
			&f.LineNumber,
			&f.Severity,
			&f.Category,
			&f.Message,
		)
		if err != nil {
			return nil, fmt.Errorf("scanning finding row: %w", err)
		}
		findings = append(findings, f)
	}

	return findings, nil
}
