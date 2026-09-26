package review

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client talks to the Python review service. Built once and reused across
// requests — same reasoning as github.Client, same as Python's module-level
// anthropic.Anthropic() instance.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient builds a review.Client pointed at the Python service's base URL
// (e.g. "http://localhost:8000"). // go-service: internal/review/client.go

func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 60 * time.Second, // Elevated to handle multi-file AI evaluation latency
		},
	}
}

// SubmitForReview sends a PR's changed files alongside the target repo details to Python's POST /review and
// returns the parsed risk assessment. Every failure point is wrapped with
// context about which step failed, so a caller's log line says WHERE
// things broke, not just that something did.
func (c *Client) SubmitForReview(prID int, repo string, files []FileDiff) (*ReviewResponse, error) {
	reqBody := ReviewRequest{
		PRID:  prID,
		Repo:  repo,
		Files: files,
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to encode review request: %w", err)
	}

	req, err := http.NewRequest(
		http.MethodPost,
		c.baseURL+"/review",
		bytes.NewReader(jsonBytes),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to build review request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach review service: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(resp.Body)
	if err != nil {
		return nil, fmt.Errorf("failed to read review response body: %w", err)
	}

	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("review service returned %d: %s", resp.StatusCode, string(bodyBytes))
	}

	var result ReviewResponse
	if err := json.Unmarshal(bodyBytes, &result); err != nil {
		return nil, fmt.Errorf("failed to decode review response: %w", err)
	}

	return &result, nil
}
