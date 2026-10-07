package api

import (
	"encoding/json"
	"net/http"
	"strconv"
	"strings"

	"prsentry/go-service/internal/db"
)

type APIHandler struct {
	store *db.Store
}

func NewAPIHandler(store *db.Store) *APIHandler {
	return &APIHandler{store: store}
}

// ListPRsHandler handles GET /api/v1/prs
func (h *APIHandler) ListPRsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	prs, err := h.store.ListPRs(r.Context())
	if err != nil {
		http.Error(w, "failed to fetch PRs", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(prs)
}

// GetPRFindingsHandler handles GET /api/v1/prs/{id}/findings
func (h *APIHandler) GetPRFindingsHandler(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
		return
	}

	// Extract PR ID from URL path: /api/v1/prs/{id}/findings
	path := strings.TrimPrefix(r.URL.Path, "/api/v1/prs/")
	parts := strings.Split(path, "/")
	if len(parts) < 2 || parts[1] != "findings" {
		http.Error(w, "invalid path", http.StatusBadRequest)
		return
	}

	prID, err := strconv.ParseInt(parts[0], 10, 64)
	if err != nil {
		http.Error(w, "invalid PR ID", http.StatusBadRequest)
		return
	}

	findings, err := h.store.GetPRFindings(r.Context(), prID)
	if err != nil {
		http.Error(w, "failed to fetch findings", http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(findings)
}
