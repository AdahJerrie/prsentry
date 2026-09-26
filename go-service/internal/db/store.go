// go-service/internal/db/store.go
package db

import (
	"context"
	"fmt"
	"prsentry/go-service/internal/review"

	"github.com/jackc/pgx/v5/pgtype"
	"github.com/jackc/pgx/v5/pgxpool"
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
