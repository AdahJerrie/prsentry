package api

import (
	"net/http"
	"net/http/httptest"
	"strings"
	"testing"
)

func TestGitHubStartRedirectsWhenUnconfigured(t *testing.T) {
	handler := NewAuthHandler(nil, nil, AuthConfig{FrontendURL: "http://localhost:5173"})
	req := httptest.NewRequest(http.MethodGet, "/api/v1/auth/github", nil)
	rec := httptest.NewRecorder()

	handler.Start(rec, req)

	if rec.Code != http.StatusFound {
		t.Fatalf("expected redirect, got %d", rec.Code)
	}
	location := rec.Header().Get("Location")
	if !strings.Contains(location, "/auth?error=github_not_configured") {
		t.Fatalf("expected configuration error redirect, got %s", location)
	}
}
