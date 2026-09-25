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
// (e.g. "http://localhost:8000"). The 10s timeout means a hung Python
// service fails loudly and fast instead of blocking a webhook goroutine
// forever.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// SubmitForReview sends a PR's changed files to Python's POST /review and
// returns the parsed risk assessment. Every failure point is wrapped with
// context about which step failed, so a caller's log line says WHERE
// things broke, not just that something did.
func (c *Client) SubmitForReview(prID int, files []FileDiff) (*ReviewResponse, error) {
	reqBody := ReviewRequest{
		PRID:  prID,
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