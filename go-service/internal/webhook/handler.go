package webhook

import (
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"strings"
	"time"

	"prsentry/go-service/internal/db"
	"prsentry/go-service/internal/github"
	"prsentry/go-service/internal/review"
)

const (
	maxPayloadBytes        = 5 * 1024 * 1024 // 5 MB
	maxFilesPerPR          = 30              // v1 guardrail against huge PR diffs
	maxConcurrentReviews   = 5               // bounds concurrent LLM pipeline runs
	backgroundPipelineWait = 90 * time.Second
)

// GitHubService abstracts GitHub operations for testability.
type GitHubService interface {
	FetchPRFiles(ctx context.Context, installationID int64, owner, repo string, prNumber int) ([]review.FileDiff, error)
	PostPRComment(ctx context.Context, installationID int64, owner, repo string, prNumber int, body string) error
	ListInstallationRepos(ctx context.Context, installationID int64) ([]github.InstalledRepo, error)
}

// ReviewService abstracts Python AI analysis calls for testability.
type ReviewService interface {
	SubmitForReview(ctx context.Context, prID int, repo string, files []review.FileDiff) (*review.ReviewResponse, error)
}

// ReviewStore abstracts transactional review persistence for testability.
type ReviewStore interface {
	SaveFullReviewResult(ctx context.Context, meta db.PRMetadata, result *review.ReviewResponse) (string, error)
	RepoMonitored(ctx context.Context, installationID, githubRepoID int64) (bool, error)
	SyncInstallation(ctx context.Context, account string, installationID int64, repos []db.RepoRef, userID, mode string) error
}

func verifySignature(secret string, payload []byte, signatureHeader string) bool {
	if secret == "" || !strings.HasPrefix(signatureHeader, "sha256=") {
		return false
	}
	expectedHex := strings.TrimPrefix(signatureHeader, "sha256=")
	expectedMAC, err := hex.DecodeString(expectedHex)
	if err != nil {
		return false
	}

	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(payload)
	computedMAC := mac.Sum(nil)

	return hmac.Equal(computedMAC, expectedMAC)
}

// NewHandler verifies GitHub webhook signatures, filters pull_request events,
// and dispatches bounded asynchronous diff analysis, DB persistence, and PR commenting.
func NewHandler(secret string, ghClient GitHubService, reviewClient ReviewService, store ReviewStore) http.HandlerFunc {
	workerSem := make(chan struct{}, maxConcurrentReviews)

	return func(w http.ResponseWriter, r *http.Request) {
		if r.Method != http.MethodPost {
			http.Error(w, "method not allowed", http.StatusMethodNotAllowed)
			return
		}

		r.Body = http.MaxBytesReader(w, r.Body, maxPayloadBytes)
		body, err := io.ReadAll(r.Body)
		if err != nil {
			log.Println("Webhook body read failed (possibly too large):", err)
			http.Error(w, "request body too large or unreadable", http.StatusRequestEntityTooLarge)
			return
		}

		signature := r.Header.Get("X-Hub-Signature-256")
		if !verifySignature(secret, body, signature) {
			log.Println("Invalid webhook signature — rejecting request")
			http.Error(w, "invalid signature", http.StatusUnauthorized)
			return
		}

		event := r.Header.Get("X-GitHub-Event")
		if event == "ping" {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write([]byte(`{"status":"pong"}`))
			return
		}
		if event == "installation" || event == "installation_repositories" {
			if err := syncInstallationEvent(r.Context(), ghClient, store, body); err != nil {
				log.Printf("installation sync failed: %v", err)
				http.Error(w, "failed to sync installation", http.StatusInternalServerError)
				return
			}
			w.WriteHeader(http.StatusOK)
			return
		}
		if event != "" && event != "pull_request" {
			w.WriteHeader(http.StatusOK)
			return
		}

		var payload GitHubWebhookPayload
		if err := json.Unmarshal(body, &payload); err != nil {
			log.Println("Failed to parse webhook payload:", err)
			http.Error(w, "invalid payload", http.StatusBadRequest)
			return
		}

		if payload.Action != "opened" && payload.Action != "synchronize" && payload.Action != "reopened" {
			log.Printf("Ignoring pull_request action: %s\n", payload.Action)
			w.WriteHeader(http.StatusOK)
			return
		}

		monitored, err := store.RepoMonitored(r.Context(), payload.Installation.ID, payload.Repository.ID)
		if err != nil {
			log.Printf("failed to check monitored repository: %v", err)
			http.Error(w, "failed to check repository", http.StatusInternalServerError)
			return
		}
		if !monitored {
			log.Printf("Ignoring pull_request for unmonitored repository %s\n", payload.Repository.FullName)
			w.WriteHeader(http.StatusOK)
			return
		}

		parts := strings.SplitN(payload.Repository.FullName, "/", 2)
		if len(parts) != 2 || parts[0] == "" || parts[1] == "" ||
			payload.Installation.ID <= 0 || payload.Repository.ID <= 0 || payload.PullRequest.Number <= 0 {
			log.Println("Invalid repository, installation, or PR identifiers in webhook payload")
			http.Error(w, "missing required pull_request metadata", http.StatusBadRequest)
			return
		}

		select {
		case workerSem <- struct{}{}:
		default:
			log.Println("Webhook worker pool saturated — rejecting burst request for GitHub retry")
			http.Error(w, "review queue busy, please retry", http.StatusServiceUnavailable)
			return
		}

		w.WriteHeader(http.StatusAccepted)

		go func(p GitHubWebhookPayload, owner, repo string) {
			defer func() { <-workerSem }()

			ctx, cancel := context.WithTimeout(context.Background(), backgroundPipelineWait)
			defer cancel()

			prState := p.PullRequest.State
			if p.PullRequest.Merged {
				prState = "merged"
			}

			meta := db.PRMetadata{
				InstallationID: p.Installation.ID,
				AccountName:    p.Repository.Owner.Login,
				GithubRepoID:   p.Repository.ID,
				RepoFullName:   p.Repository.FullName,
				PRNumber:       p.PullRequest.Number,
				Title:          p.PullRequest.Title,
				Author:         p.PullRequest.User.Login,
				PRStatus:       prState,
				HeadSHA:        p.PullRequest.Head.SHA,
				RunStatus:      "completed",
			}

			files, err := ghClient.FetchPRFiles(ctx, p.Installation.ID, owner, repo, p.PullRequest.Number)
			if err != nil {
				log.Printf("Failed to fetch PR files for %s#%d: %v\n", p.Repository.FullName, p.PullRequest.Number, err)
				meta.RunStatus = "failed"
				_, _ = store.SaveFullReviewResult(ctx, meta, &review.ReviewResponse{
					PRID:                p.PullRequest.Number,
					Summary:             "Automated review failed while fetching changed files from GitHub.",
					RiskScore:           3.0,
					MergeRecommendation: "caution",
					Findings:            nil,
				})
				return
			}

			log.Printf("Fetched %d reviewable file(s) for %s#%d\n", len(files), p.Repository.FullName, p.PullRequest.Number)

			var reviewResult *review.ReviewResponse
			if len(files) > maxFilesPerPR {
				reviewResult = &review.ReviewResponse{
					PRID:                p.PullRequest.Number,
					Summary:             fmt.Sprintf("Pull request modifies %d reviewable files, exceeding the %d-file automated review guardrail. Manual review is recommended.", len(files), maxFilesPerPR),
					RiskScore:           3.0,
					MergeRecommendation: "caution",
					Findings:            []review.Finding{},
				}
			} else {
				reviewResult, err = reviewClient.SubmitForReview(ctx, p.PullRequest.Number, p.Repository.FullName, files)
				if err != nil {
					log.Printf("Failed to submit %s#%d for AI review: %v\n", p.Repository.FullName, p.PullRequest.Number, err)
					meta.RunStatus = "failed"
					_, _ = store.SaveFullReviewResult(ctx, meta, &review.ReviewResponse{
						PRID:                p.PullRequest.Number,
						Summary:             "Automated AI review service encountered an upstream error. Please trigger a re-run or review manually.",
						RiskScore:           3.0,
						MergeRecommendation: "caution",
						Findings:            nil,
					})
					return
				}
			}

			dbCtx, dbCancel := context.WithTimeout(context.Background(), 10*time.Second)
			defer dbCancel()

			if _, err := store.SaveFullReviewResult(dbCtx, meta, reviewResult); err != nil {
				log.Printf("Failed to save review run for %s#%d to DB: %v\n", p.Repository.FullName, p.PullRequest.Number, err)
				return
			}

			commentBody := github.FormatReviewComment(p.PullRequest.Head.SHA, reviewResult)
			if err := ghClient.PostPRComment(ctx, p.Installation.ID, owner, repo, p.PullRequest.Number, commentBody); err != nil {
				log.Printf("Saved review for %s#%d, but posting GitHub comment failed: %v\n", p.Repository.FullName, p.PullRequest.Number, err)
			}

			log.Printf(
				"Analysis for %s#%d complete: Recommendation=%s, Risk=%.1f, Findings=%d\n",
				p.Repository.FullName,
				p.PullRequest.Number,
				reviewResult.MergeRecommendation,
				reviewResult.RiskScore,
				len(reviewResult.Findings),
			)
		}(payload, parts[0], parts[1])
	}
}

func syncInstallationEvent(ctx context.Context, gh GitHubService, store ReviewStore, body []byte) error {
	var payload GitHubWebhookPayload
	if err := json.Unmarshal(body, &payload); err != nil {
		return err
	}
	if payload.Installation.ID <= 0 {
		return nil
	}

	account := payload.Installation.Account.Login
	action := payload.Action
	if action == "deleted" || action == "suspend" {
		return store.SyncInstallation(ctx, account, payload.Installation.ID, nil, "", "deactivate_all")
	}

	if action == "removed" {
		return store.SyncInstallation(ctx, account, payload.Installation.ID, repoRefs(payload.RepositoriesRemoved), "", "remove")
	}

	listed, err := gh.ListInstallationRepos(ctx, payload.Installation.ID)
	if err == nil {
		refs := make([]db.RepoRef, 0, len(listed))
		for _, repo := range listed {
			refs = append(refs, db.RepoRef{GithubRepoID: repo.ID, FullName: repo.FullName})
		}
		return store.SyncInstallation(ctx, account, payload.Installation.ID, refs, "", "replace")
	}
	log.Printf("listing installation %d repositories failed, using webhook payload: %v", payload.Installation.ID, err)

	refs := repoRefs(payload.Repositories)
	if action == "added" {
		refs = append(refs, repoRefs(payload.RepositoriesAdded)...)
		return store.SyncInstallation(ctx, account, payload.Installation.ID, refs, "", "add")
	}
	return store.SyncInstallation(ctx, account, payload.Installation.ID, refs, "", "add")
}

func repoRefs(repos []webhookRepo) []db.RepoRef {
	out := make([]db.RepoRef, 0, len(repos))
	for _, repo := range repos {
		out = append(out, db.RepoRef{GithubRepoID: repo.ID, FullName: repo.FullName})
	}
	return out
}
