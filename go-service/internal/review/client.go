package review

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"
	"time"
)

const maxReviewResponseBytes = 5 * 1024 * 1024 // 5 MB upper bound

// Client talks to the Python review service. Built once and reused across requests.
type Client struct {
	baseURL    string
	authToken  string
	httpClient *http.Client
}

func NewClient(baseURL string, authToken string) *Client {
	return &Client{
		baseURL:   strings.TrimRight(strings.TrimSpace(baseURL), "/"),
		authToken: authToken,
		httpClient: &http.Client{
			Timeout: 60 * time.Second,
		},
	}
}

// SubmitForReview sends a PR's changed files alongside the target repo details to Python's POST /review.
func (c *Client) SubmitForReview(ctx context.Context, prID int, repo string, files []FileDiff) (*ReviewResponse, error) {
	reqBody := ReviewRequest{
		PRID:  prID,
		Repo:  repo,
		Files: files,
	}

	jsonBytes, err := json.Marshal(reqBody)
	if err != nil {
		return nil, fmt.Errorf("failed to encode review request: %w", err)
	}

	req, err := http.NewRequestWithContext(
		ctx,
		http.MethodPost,
		c.baseURL+"/review",
		bytes.NewReader(jsonBytes),
	)
	if err != nil {
		return nil, fmt.Errorf("failed to build review request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	if c.authToken != "" {
		req.Header.Set("Authorization", "Bearer "+c.authToken)
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("failed to reach review service: %w", err)
	}
	defer resp.Body.Close()

	bodyBytes, err := io.ReadAll(io.LimitReader(resp.Body, maxReviewResponseBytes))
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
