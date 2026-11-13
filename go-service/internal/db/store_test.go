package db

import (
	"context"
	"os"
	"testing"

	"github.com/jackc/pgx/v5/pgxpool"

	"prsentry/go-service/internal/review"
)

func TestStoreIntegrationWithPostgres(t *testing.T) {
	dsn := os.Getenv("TEST_DATABASE_URL")
	if dsn == "" {
		t.Skip("TEST_DATABASE_URL not set; skipping PostgreSQL integration test")
	}

	ctx := context.Background()
	pool, err := pgxpool.New(ctx, dsn)
	if err != nil {
		t.Fatalf("connecting to test DB: %v", err)
	}
	defer pool.Close()

	if _, err := pool.Exec(ctx, `TRUNCATE installations CASCADE`); err != nil {
		t.Fatalf("truncating tables: %v", err)
	}

	store := NewStore(pool)

	meta := PRMetadata{
		InstallationID: 778899,
		AccountName:    "acme",
		GithubRepoID:   112233,
		RepoFullName:   "acme/payment-api",
		PRNumber:       101,
		Title:          "Initial payment webhook handler",
		Author:         "jerrie",
		PRStatus:       "open",
		HeadSHA:        "1111111111111111111111111111111111111111",
		RunStatus:      "completed",
	}

	// Run 1: high-severity security finding
	prID1, err := store.SaveFullReviewResult(ctx, meta, &review.ReviewResponse{
		PRID:                101,
		Summary:             "Run 1 detected hardcoded secret.",
		RiskScore:           5.0,
		MergeRecommendation: "block",
		Findings: []review.Finding{
			{
				FilePath:   "pay.go",
				LineNumber: 12,
				Severity:   "high",
				Category:   "security",
				Message:    "Hardcoded API secret in source.",
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveFullReviewResult run 1 failed: %v", err)
	}

	// Run 2 (synchronize event on same PR): fixed secret, only 1 low style note
	meta.HeadSHA = "2222222222222222222222222222222222222222"
	meta.Title = "Initial payment webhook handler (hardened)"
	prID2, err := store.SaveFullReviewResult(ctx, meta, &review.ReviewResponse{
		PRID:                101,
		Summary:             "Run 2 resolved secret; minor naming suggestion.",
		RiskScore:           2.0,
		MergeRecommendation: "safe",
		Findings: []review.Finding{
			{
				FilePath:   "pay.go",
				LineNumber: 20,
				Severity:   "low",
				Category:   "style",
				Message:    "Exported function lacks doc comment.",
			},
		},
	})
	if err != nil {
		t.Fatalf("SaveFullReviewResult run 2 failed: %v", err)
	}

	if prID1 != prID2 {
		t.Fatalf("expected upsert to preserve PR UUID, got %s vs %s", prID1, prID2)
	}

	// ListPRs must return 1 deduplicated PR surfacing Run 2 (latest), not 2 duplicate rows
	prs, err := store.ListPRs(ctx, ListPRsFilter{})
	if err != nil {
		t.Fatalf("ListPRs failed: %v", err)
	}
	if len(prs) != 1 {
		t.Fatalf("expected 1 PR in ListPRs, got %d", len(prs))
	}
	if prs[0].MergeRecommendation != "safe" || prs[0].RiskScore != 2.0 || prs[0].FindingsCount != 1 {
		t.Fatalf("expected latest run metrics on ListPRs, got %+v", prs[0])
	}

	// GetPRFindings must return only the 1 finding from Run 2, not stale Run 1 finding
	findings, err := store.GetPRFindings(ctx, prID1)
	if err != nil {
		t.Fatalf("GetPRFindings failed: %v", err)
	}
	if len(findings) != 1 || findings[0].Severity != "low" {
		t.Fatalf("expected 1 low finding from latest run, got %+v", findings)
	}

	// GetPRDetail must expose both historical runs
	detail, err := store.GetPRDetail(ctx, prID1)
	if err != nil {
		t.Fatalf("GetPRDetail failed: %v", err)
	}
	if len(detail.ReviewRuns) != 2 {
		t.Fatalf("expected 2 review runs in PR history, got %d", len(detail.ReviewRuns))
	}

	// GetReviewDetail for historical Run 1 must still show its high finding
	olderRunID := detail.ReviewRuns[1].ID
	revDetail, err := store.GetReviewDetail(ctx, olderRunID)
	if err != nil {
		t.Fatalf("GetReviewDetail failed: %v", err)
	}
	if revDetail.MergeRecommendation != "block" || len(revDetail.Findings) != 1 {
		t.Fatalf("unexpected historical review detail: %+v", revDetail)
	}

	// GetDashboardStats must reflect 1 PR, 2 total reviews, 1 active finding
	stats, err := store.GetDashboardStats(ctx)
	if err != nil {
		t.Fatalf("GetDashboardStats failed: %v", err)
	}
	if stats.TotalPRs != 1 || stats.TotalReviews != 2 || stats.TotalFindings != 1 {
		t.Fatalf("unexpected dashboard stats: %+v", stats)
	}
}
