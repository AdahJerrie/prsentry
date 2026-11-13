package webhook

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"net/http"
	"net/http/httptest"
	"sync"
	"testing"
	"time"

	"prsentry/go-service/internal/db"
	"prsentry/go-service/internal/review"
)

type mockGH struct {
	mu       sync.Mutex
	files    []review.FileDiff
	err      error
	comments []string
}

func (m *mockGH) FetchPRFiles(_ context.Context, _ int64, _, _ string, _ int) ([]review.FileDiff, error) {
	return m.files, m.err
}

func (m *mockGH) PostPRComment(_ context.Context, _ int64, _, _ string, _ int, body string) error {
	m.mu.Lock()
	defer m.mu.Unlock()
	m.comments = append(m.comments, body)
	return nil
}

type mockReviewer struct {
	called bool
	resp   *review.ReviewResponse
	err    error
}

func (m *mockReviewer) SubmitForReview(_ context.Context, prID int, _ string, _ []review.FileDiff) (*review.ReviewResponse, error) {
	m.called = true
	if m.err != nil {
		return nil, m.err
	}
	if m.resp != nil {
		return m.resp, nil
	}
	return &review.ReviewResponse{
		PRID:                prID,
		Summary:             "Looks solid.",
		RiskScore:           1.0,
		MergeRecommendation: "safe",
		Findings:            []review.Finding{},
	}, nil
}

type mockStore struct {
	done chan struct{}
	meta db.PRMetadata
	resp *review.ReviewResponse
}

func (m *mockStore) SaveFullReviewResult(_ context.Context, meta db.PRMetadata, result *review.ReviewResponse) (string, error) {
	m.meta = meta
	m.resp = result
	select {
	case <-m.done:
	default:
		close(m.done)
	}
	return "550e8400-e29b-41d4-a716-446655440000", nil
}

func signPayload(secret string, body []byte) string {
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	return "sha256=" + hex.EncodeToString(mac.Sum(nil))
}

func TestWebhookSignatureAndPing(t *testing.T) {
	secret := "test_webhook_secret"
	handler := NewHandler(secret, &mockGH{}, &mockReviewer{}, &mockStore{done: make(chan struct{})})

	body := []byte(`{"zen":"Keep it logically awesome."}`)

	// Reject tampered signature
	badReq := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(body))
	badReq.Header.Set("X-Hub-Signature-256", "sha256=deadbeef")
	badRec := httptest.NewRecorder()
	handler(badRec, badReq)
	if badRec.Code != http.StatusUnauthorized {
		t.Fatalf("expected 401 on invalid signature, got %d", badRec.Code)
	}

	// Accept valid ping event
	pingReq := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(body))
	pingReq.Header.Set("X-Hub-Signature-256", signPayload(secret, body))
	pingReq.Header.Set("X-GitHub-Event", "ping")
	pingRec := httptest.NewRecorder()
	handler(pingRec, pingReq)
	if pingRec.Code != http.StatusOK {
		t.Fatalf("expected 200 on ping event, got %d", pingRec.Code)
	}
}

func TestWebhookEndToEndAndLargePRGuardrail(t *testing.T) {
	secret := "test_webhook_secret"

	// Build 31 files to trigger the 30-file guardrail
	manyFiles := make([]review.FileDiff, 31)
	for i := range manyFiles {
		manyFiles[i] = review.FileDiff{
			Path: fmt.Sprintf("pkg/file_%d.go", i),
			Diff: "@@ -1,2 +1,3 @@\n+var x = 1",
		}
	}

	gh := &mockGH{files: manyFiles}
	rev := &mockReviewer{}
	store := &mockStore{done: make(chan struct{})}
	handler := NewHandler(secret, gh, rev, store)

	payload := map[string]any{
		"action": "opened",
		"installation": map[string]any{
			"id": 9901,
		},
		"repository": map[string]any{
			"id":        445566,
			"full_name": "acme/api-server",
			"owner":     map[string]any{"login": "acme"},
		},
		"pull_request": map[string]any{
			"number": 17,
			"title":  "Add new endpoints",
			"state":  "open",
			"user":   map[string]any{"login": "jerrie"},
			"head":   map[string]any{"sha": "abcdef1234567890abcdef1234567890abcdef12"},
		},
	}
	raw, _ := json.Marshal(payload)

	req := httptest.NewRequest(http.MethodPost, "/webhook", bytes.NewReader(raw))
	req.Header.Set("X-Hub-Signature-256", signPayload(secret, raw))
	req.Header.Set("X-GitHub-Event", "pull_request")
	rec := httptest.NewRecorder()

	handler(rec, req)
	if rec.Code != http.StatusAccepted {
		t.Fatalf("expected 202 Accepted, got %d", rec.Code)
	}

	select {
	case <-store.done:
	case <-time.After(2 * time.Second):
		t.Fatal("timed out waiting for async webhook pipeline")
	}

	if rev.called {
		t.Fatal("expected Python service NOT to be called when PR exceeds maxFilesPerPR guardrail")
	}
	if store.meta.GithubRepoID != 445566 || store.meta.Author != "jerrie" {
		t.Fatalf("unexpected saved metadata: %+v", store.meta)
	}
	if store.resp.MergeRecommendation != "caution" {
		t.Fatalf("expected caution merge recommendation for oversized PR, got %s", store.resp.MergeRecommendation)
	}
}
