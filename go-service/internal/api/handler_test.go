package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
	"time"

	"prsentry/go-service/internal/db"
)

type fakeDashboardStore struct{}

const sampleUUID = "550e8400-e29b-41d4-a716-446655440000"

func (f *fakeDashboardStore) Ping(_ context.Context) error { return nil }

func (f *fakeDashboardStore) ListPRs(_ context.Context, _ db.ListPRsFilter) ([]db.PRSummary, error) {
	return []db.PRSummary{
		{
			ID:                  sampleUUID,
			RepoFullName:        "acme/auth-service",
			PRNumber:            12,
			Title:               "Harden JWT middleware",
			Author:              "jerrie",
			PRStatus:            "open",
			ReviewStatus:        "completed",
			HeadSHA:             "abc1234",
			RiskScore:           2.0,
			MergeRecommendation: "safe",
			Summary:             "Clean PR with 1 minor style suggestion.",
			FindingsCount:       1,
			CreatedAt:           time.Now().UTC(),
		},
	}, nil
}

func (f *fakeDashboardStore) GetPRDetail(_ context.Context, prID string) (*db.PRDetail, error) {
	if prID != sampleUUID {
		return nil, db.ErrInvalidID
	}
	return &db.PRDetail{
		PRSummary: db.PRSummary{
			ID:                  sampleUUID,
			RepoFullName:        "acme/auth-service",
			PRNumber:            12,
			MergeRecommendation: "safe",
			RiskScore:           2.0,
		},
		Findings:   []db.PRFinding{{ID: 1, FilePath: "jwt.go", LineNumber: 10, Severity: "low", Category: "style", Message: "Add doc comment."}},
		ReviewRuns: []db.ReviewRunSummary{},
	}, nil
}

func (f *fakeDashboardStore) GetPRFindings(_ context.Context, prID string) ([]db.PRFinding, error) {
	if prID != sampleUUID {
		return nil, db.ErrInvalidID
	}
	return []db.PRFinding{
		{ID: 1, FilePath: "jwt.go", LineNumber: 10, Severity: "low", Category: "style", Message: "Add doc comment."},
	}, nil
}

func (f *fakeDashboardStore) GetReviewDetail(_ context.Context, reviewID string) (*db.ReviewDetail, error) {
	if reviewID != sampleUUID {
		return nil, db.ErrNotFound
	}
	return &db.ReviewDetail{
		ID:                  sampleUUID,
		PullRequestID:       sampleUUID,
		RepoFullName:        "acme/auth-service",
		PRNumber:            12,
		Status:              "completed",
		MergeRecommendation: "safe",
		RiskScore:           2.0,
		Findings:            []db.PRFinding{},
	}, nil
}

func (f *fakeDashboardStore) GetDashboardStats(_ context.Context) (*db.DashboardStats, error) {
	return &db.DashboardStats{
		TotalPRs:         1,
		TotalReviews:     1,
		AverageRiskScore: 2.0,
		Recommendations:  map[string]int{"safe": 1, "caution": 0, "block": 0},
		Severities:       map[string]int{"high": 0, "medium": 0, "low": 1},
		Categories:       map[string]int{"style": 1},
		Repositories:     []string{"acme/auth-service"},
		RecentReviews:    []db.DailyReviewStat{},
	}, nil
}

func TestAPIRoutesAndSecurityMiddleware(t *testing.T) {
	mux := http.NewServeMux()
	h := NewAPIHandler(&fakeDashboardStore{})
	h.RegisterRoutes(mux)

	secured := WrapWithSecurity(mux, SecurityMiddlewareConfig{
		AllowedOrigins:  []string{"http://localhost:5173"},
		DashboardAPIKey: "secret_dash_key",
		RequestsPerMin:  50,
	})

	// 1. Health endpoint does not require dashboard auth
	healthReq := httptest.NewRequest(http.MethodGet, "/health", nil)
	healthRec := httptest.NewRecorder()
	secured.ServeHTTP(healthRec, healthReq)
	if healthRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on /health, got %d", healthRec.Code)
	}

	// 2. /api/v1/prs rejects unauthenticated call when DashboardAPIKey is configured
	unauthReq := httptest.NewRequest(http.MethodGet, "/api/v1/prs", nil)
	unauthRec := httptest.NewRecorder()
	secured.ServeHTTP(unauthRec, unauthReq)
	if unauthRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 without Bearer key, got %d", unauthRec.Code)
	}

	// 3. Authenticated call with allowed Origin returns CORS header + PR list
	listReq := httptest.NewRequest(http.MethodGet, "/api/v1/prs", nil)
	listReq.Header.Set("Authorization", "Bearer secret_dash_key")
	listReq.Header.Set("Origin", "http://localhost:5173")
	listRec := httptest.NewRecorder()
	secured.ServeHTTP(listRec, listReq)
	if listRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on authenticated /api/v1/prs, got %d", listRec.Code)
	}
	if gotOrigin := listRec.Header().Get("Access-Control-Allow-Origin"); gotOrigin != "http://localhost:5173" {
		t.Fatalf("expected CORS origin header, got %q", gotOrigin)
	}

	var prs []db.PRSummary
	if err := json.Unmarshal(listRec.Body.Bytes(), &prs); err != nil || len(prs) != 1 || prs[0].ID != sampleUUID {
		t.Fatalf("unexpected PR list response: %v, %+v", err, prs)
	}

	// 4. PR detail and findings subroutes work with UUIDs and reject malformed IDs
	detailReq := httptest.NewRequest(http.MethodGet, "/api/v1/prs/"+sampleUUID, nil)
	detailReq.Header.Set("Authorization", "Bearer secret_dash_key")
	detailRec := httptest.NewRecorder()
	secured.ServeHTTP(detailRec, detailReq)
	if detailRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on PR detail, got %d", detailRec.Code)
	}

	findingsReq := httptest.NewRequest(http.MethodGet, "/api/v1/prs/"+sampleUUID+"/findings", nil)
	findingsReq.Header.Set("Authorization", "Bearer secret_dash_key")
	findingsRec := httptest.NewRecorder()
	secured.ServeHTTP(findingsRec, findingsReq)
	if findingsRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on PR findings, got %d", findingsRec.Code)
	}

	badIDReq := httptest.NewRequest(http.MethodGet, "/api/v1/prs/not-a-uuid", nil)
	badIDReq.Header.Set("Authorization", "Bearer secret_dash_key")
	badIDRec := httptest.NewRecorder()
	secured.ServeHTTP(badIDRec, badIDReq)
	if badIDRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on malformed UUID, got %d", badIDRec.Code)
	}

	// 5. Reject invalid status or recommendation filter query parameters
	badFilterReq := httptest.NewRequest(http.MethodGet, "/api/v1/prs?recommendation=unknown", nil)
	badFilterReq.Header.Set("Authorization", "Bearer secret_dash_key")
	badFilterRec := httptest.NewRecorder()
	secured.ServeHTTP(badFilterRec, badFilterReq)
	if badFilterRec.Code != http.StatusBadRequest {
		t.Fatalf("expected 400 on invalid recommendation filter, got %d", badFilterRec.Code)
	}
}
