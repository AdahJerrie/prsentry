package webhook

import (
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"io"
	"log"
	"net/http"
	"strings"

	"prsentry/go-service/internal/github"
	"prsentry/go-service/internal/review"
)

const maxPayloadBytes = 5 * 1024 * 1024 // 5 MB

func verifySignature(secret string, payload []byte, signatureHeader string) bool {
	if !strings.HasPrefix(signatureHeader, "sha256=") {
		return false
	}
	expectedHex := strings.TrimPrefix(signatureHeader, "sha256=")

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	computedHex := hex.EncodeToString(mac.Sum(nil))

	return hmac.Equal([]byte(computedHex), []byte(expectedHex))
}

// NewHandler returns an http.HandlerFunc configured with the webhook secret,
// a GitHub client for fetching PR data, and a review client for submitting
// that data to the Python analysis service.
func NewHandler(secret string, ghClient *github.Client, reviewClient *review.Client) http.HandlerFunc {
	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxPayloadBytes)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Println("Body read failed (possibly too large):", err)
			http.Error(w, "request body too large or unreadable", http.StatusRequestEntityTooLarge)
			return
		}

		signature := r.Header.Get("X-Hub-Signature-256")
		if !verifySignature(secret, body, signature) {
			log.Println("Invalid signature — rejecting request")
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}

		var payload GitHubWebhookPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			log.Println("Failed to parse payload:", err)
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}

		if payload.Action != "opened" && payload.Action != "synchronize" && payload.Action != "reopened" {
			log.Printf("Ignoring action: %s\n", payload.Action)
			w.WriteHeader(http.StatusOK)
			return
		}

		// respond to GitHub immediately — we still have work to do below,
		// but GitHub only cares that delivery succeeded
		w.WriteHeader(http.StatusOK)

		parts := strings.SplitN(payload.Repository.FullName, "/", 2)
		if len(parts) != 2 {
			log.Println("Unexpected repo format:", payload.Repository.FullName)
			return
		}
		owner, repo := parts[0], parts[1]

		files, err := ghClient.FetchPRFiles(payload.Installation.ID, owner, repo, payload.PullRequest.Number)
		if err != nil {
			log.Println("Failed to fetch PR files:", err)
			return
		}

		log.Printf("Fetched %d changed file(s) for PR #%d:\n", len(files), payload.PullRequest.Number)
		for _, f := range files {
			log.Printf("  %s (%d bytes of diff)\n", f.Path, len(f.Diff))
		}

		riskResult, err := reviewClient.SubmitForReview(payload.PullRequest.Number, files)
		if err != nil {
			log.Println("Failed to submit for review:", err)
			return
		}

		log.Printf("Risk assessment for PR #%d: score=%.1f, flagged=%v\n",
			riskResult.PRID, riskResult.RiskScore, riskResult.FlaggedFiles)
	}
}
