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

		// Only process target code lifecycle triggers
		if payload.Action != "opened" && payload.Action != "synchronize" && payload.Action != "reopened" {
			log.Printf("Ignoring action: %s\n", payload.Action)
			w.WriteHeader(http.StatusOK)
			return
		}

		// 1. Acknowledge and release GitHub immediately to prevent 10s timeout retry loops
		w.WriteHeader(http.StatusAccepted)

		// 2. Dispatch heavy blocking I/O tasks to an isolated background thread context
		go func(p GitHubWebhookPayload) {
			// Extract the raw full repository path string ("owner/name")
			repoFullName := p.Repository.FullName
			parts := strings.SplitN(repoFullName, "/", 2)
			if len(parts) != 2 {
				log.Println("Unexpected repo format:", repoFullName)
				return
			}
			owner, repo := parts[0], parts[1]

			// Fetch the code unified patch files from GitHub endpoints
			files, err := ghClient.FetchPRFiles(p.Installation.ID, owner, repo, p.PullRequest.Number)
			if err != nil {
				log.Println("Failed to fetch PR files:", err)
				return
			}

			log.Printf("Fetched %d changed file(s) for PR #%d inside %s\n", len(files), p.PullRequest.Number, repoFullName)

			// Submit parameters matching the updated v1 contract payload signature (pr_id, repo, files)
			reviewResult, err := reviewClient.SubmitForReview(p.PullRequest.Number, repoFullName, files)
			if err != nil {
				log.Println("Failed to submit for review:", err)
				return
			}

			log.Printf("Analysis for PR #%d complete: Recommendation=%s, Risk Score=%.1f, Findings Count=%d\n",
				reviewResult.PRID, reviewResult.MergeRecommendation, reviewResult.RiskScore, len(reviewResult.Findings))
		}(payload)
	}
}
