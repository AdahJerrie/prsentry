package api

import (
	"context"
	"encoding/json"
	"errors"
	"net/http"
	"strconv"
	"strings"

	"prsentry/go-service/internal/db"
)

// DashboardStore abstracts read queries for the HTTP API handlers.
type DashboardStore interface {
	Ping(ctx context.Context) error
	ListPRs(ctx context.Context, filter db.ListPRsFilter) ([]db.PRSummary, error)
	GetPRDetail(ctx context.Context, prID string) (*db.PRDetail, error)
	GetPRFindings(ctx context.Context, prID string) ([]db.PRFinding, error)
	GetReviewDetail(ctx context.Context, reviewID string) (*db.ReviewDetail, error)
	GetDashboardStats(ctx context.Context) (*db.DashboardStats, error)
}

type APIHandler struct {
	store DashboardStore
}

func NewAPIHandler(store DashboardStore) *APIHandler {
	return &APIHandler{store: store}
}

func writeJSON(w http.ResponseWriter, status int, payload any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	_ = json.NewEncoder(w).Encode(payload)
}

func writeError(w http.ResponseWriter, status int, msg string) {
	writeJSON(w, status, map[string]string{"error": msg})
}

// RegisterRoutes attaches both versioned (/api/v1/...) and contract (/api/...) read routes.
func (h *APIHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("/health", h.HealthHandler)

	mux.HandleFunc("/api/v1/prs", h.ListPRsHandler)
	mux.HandleFunc("/api/v1/prs/", h.PRSubrouteHandler)
	mux.HandleFunc("/api/v1/reviews/", h.GetReviewDetailHandler)
	mux.HandleFunc("/api/v1/stats", h.GetStatsHandler)

	mux.HandleFunc("/api/prs", h.ListPRsHandler)
	mux.HandleFunc("/api/prs/", h.PRSubrouteHandler)
	mux.HandleFunc("/api/reviews/", h.GetReviewDetailHandler)
	mux.HandleFunc("/api/stats", h.GetStatsHandler)
}

// HealthHandler handles GET /health.
func (h *APIHandler) HealthHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if err := h.store.Ping(r.Context()); err != nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"status": "unhealthy"})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

// ListPRsHandler handles GET /api/v1/prs?repo=&status=&recommendation=&limit=
func (h *APIHandler) ListPRsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	q := r.URL.Query()
	limit := 50
	if rawLimit := strings.TrimSpace(q.Get("limit")); rawLimit != "" {
		parsed, err := strconv.Atoi(rawLimit)
		if err != nil || parsed <= 0 {
			writeError(w, http.StatusBadRequest, "limit must be a positive integer")
			return
		}
		limit = parsed
	}

	prs, err := h.store.ListPRs(r.Context(), db.ListPRsFilter{
		Repo:           q.Get("repo"),
		Status:         q.Get("status"),
		Recommendation: q.Get("recommendation"),
		Limit:          limit,
	})
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch pull requests")
		return
	}

	writeJSON(w, http.StatusOK, prs)
}

// PRSubrouteHandler dispatches GET /api/v1/prs/{id} and GET /api/v1/prs/{id}/findings.
func (h *APIHandler) PRSubrouteHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	trimmed := r.URL.Path
	if strings.HasPrefix(trimmed, "/api/v1/prs/") {
		trimmed = strings.TrimPrefix(trimmed, "/api/v1/prs/")
	} else {
		trimmed = strings.TrimPrefix(trimmed, "/api/prs/")
	}
	trimmed = strings.TrimSuffix(trimmed, "/")

	if trimmed == "" {
		h.ListPRsHandler(w, r)
		return
	}

	parts := strings.Split(trimmed, "/")
	switch {
	case len(parts) == 1:
		detail, err := h.store.GetPRDetail(r.Context(), parts[0])
		if err != nil {
			switch {
			case errors.Is(err, db.ErrInvalidID):
				writeError(w, http.StatusBadRequest, "invalid pull request ID")
			case errors.Is(err, db.ErrNotFound):
				writeError(w, http.StatusNotFound, "pull request not found")
			default:
				writeError(w, http.StatusInternalServerError, "failed to fetch pull request detail")
			}
			return
		}
		writeJSON(w, http.StatusOK, detail)

	case len(parts) == 2 && parts[1] == "findings":
		findings, err := h.store.GetPRFindings(r.Context(), parts[0])
		if err != nil {
			switch {
			case errors.Is(err, db.ErrInvalidID):
				writeError(w, http.StatusBadRequest, "invalid pull request ID")
			case errors.Is(err, db.ErrNotFound):
				writeError(w, http.StatusNotFound, "pull request not found")
			default:
				writeError(w, http.StatusInternalServerError, "failed to fetch findings")
			}
			return
		}
		writeJSON(w, http.StatusOK, findings)

	default:
		writeError(w, http.StatusNotFound, "invalid path")
	}
}

// GetPRFindingsHandler preserves backward compatibility for callers invoking GetPRFindingsHandler directly.
func (h *APIHandler) GetPRFindingsHandler(w http.ResponseWriter, r *http.Request) {
	h.PRSubrouteHandler(w, r)
}

// GetReviewDetailHandler handles GET /api/v1/reviews/{id}
func (h *APIHandler) GetReviewDetailHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	trimmed := r.URL.Path
	if strings.HasPrefix(trimmed, "/api/v1/reviews/") {
		trimmed = strings.TrimPrefix(trimmed, "/api/v1/reviews/")
	} else {
		trimmed = strings.TrimPrefix(trimmed, "/api/reviews/")
	}
	trimmed = strings.TrimSuffix(trimmed, "/")

	if trimmed == "" || strings.Contains(trimmed, "/") {
		writeError(w, http.StatusBadRequest, "invalid review ID")
		return
	}

	detail, err := h.store.GetReviewDetail(r.Context(), trimmed)
	if err != nil {
		switch {
		case errors.Is(err, db.ErrInvalidID):
			writeError(w, http.StatusBadRequest, "invalid review ID")
		case errors.Is(err, db.ErrNotFound):
			writeError(w, http.StatusNotFound, "review not found")
		default:
			writeError(w, http.StatusInternalServerError, "failed to fetch review detail")
		}
		return
	}

	writeJSON(w, http.StatusOK, detail)
}

// GetStatsHandler handles GET /api/v1/stats
func (h *APIHandler) GetStatsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}

	stats, err := h.store.GetDashboardStats(r.Context())
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to fetch dashboard stats")
		return
	}

	writeJSON(w, http.StatusOK, stats)
}
