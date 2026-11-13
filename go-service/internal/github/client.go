package github

import (
	"bytes"
	"context"
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
	"unicode/utf8"

	"github.com/golang-jwt/jwt/v5"

	"prsentry/go-service/internal/review"
)

const (
	maxDiffBytes         = 100 * 1024       // 100 KB limit per file diff
	maxResponseBodyBytes = 10 * 1024 * 1024 // 10 MB upper bound for GitHub API responses
	githubAPIVersion     = "2022-11-28"
)

type Client struct {
	appID      string
	privateKey *rsa.PrivateKey
	baseURL    string
	httpClient *http.Client
}

// NewClient parses the App's private key once at startup and returns a ready-to-use client.
func NewClient(appID string, privateKeyPEM []byte) (*Client, error) {
	key, err := jwt.ParseRSAPrivateKeyFromPEM(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("parsing private key: %w", err)
	}
	return &Client{
		appID:      appID,
		privateKey: key,
		baseURL:    "https://api.github.com",
		httpClient: &http.Client{Timeout: 15 * time.Second},
	}, nil
}

// generateJWT signs a short-lived token proving "I am this App."
func (c *Client) generateJWT() (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now.Add(-30 * time.Second)),
		ExpiresAt: jwt.NewNumericDate(now.Add(9 * time.Minute)),
		Issuer:    c.appID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(c.privateKey)
}

type installationTokenResponse struct {
	Token string `json:"token"`
}

// getInstallationToken exchanges the app JWT for a token scoped to one installation.
func (c *Client) getInstallationToken(ctx context.Context, installationID int64) (string, error) {
	jwtToken, err := c.generateJWT()
	if err != nil {
		return "", fmt.Errorf("generating app JWT: %w", err)
	}

	endpoint := fmt.Sprintf("%s/app/installations/%d/access_tokens", c.baseURL, installationID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
	req.Header.Set("User-Agent", "PRSentry")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("requesting installation token: %w", err)
	}
	defer resp.Body.Close()

	limitedBody := io.LimitReader(resp.Body, maxResponseBodyBytes)
	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(limitedBody)
		return "", fmt.Errorf("unexpected status %d fetching installation token: %s", resp.StatusCode, string(body))
	}

	var tokenResp installationTokenResponse
	if err := json.NewDecoder(limitedBody).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("decoding installation token response: %w", err)
	}
	if tokenResp.Token == "" {
		return "", fmt.Errorf("installation token response was empty")
	}
	return tokenResp.Token, nil
}

type prFile struct {
	Filename string `json:"filename"`
	Patch    string `json:"patch"`
}

// isGeneratedFile filters out dependency lockfiles, generated code, and minified assets.
func isGeneratedFile(filename string) bool {
	lower := strings.ToLower(filename)
	ignoredSuffixes := []string{
		"package-lock.json",
		"yarn.lock",
		"pnpm-lock.yaml",
		"go.sum",
		"cargo.lock",
		"poetry.lock",
		"pipfile.lock",
		"composer.lock",
		"gemfile.lock",
		".min.js",
		".min.css",
		".map",
		".pb.go",
	}
	for _, suffix := range ignoredSuffixes {
		if strings.HasSuffix(lower, suffix) {
			return true
		}
	}
	return false
}

// truncateUTF8 slices s to at most maxBytes without splitting a multi-byte UTF-8 rune.
func truncateUTF8(s string, maxBytes int) string {
	if len(s) <= maxBytes {
		return s
	}
	cut := s[:maxBytes]
	for len(cut) > 0 && !utf8.ValidString(cut) {
		cut = cut[:len(cut)-1]
	}
	return cut
}

// FetchPRFiles returns the changed non-generated files for a PR, shaped as review.FileDiff.
func (c *Client) FetchPRFiles(ctx context.Context, installationID int64, owner, repo string, prNumber int) ([]review.FileDiff, error) {
	token, err := c.getInstallationToken(ctx, installationID)
	if err != nil {
		return nil, err
	}

	endpoint := fmt.Sprintf(
		"%s/repos/%s/%s/pulls/%d/files?per_page=100",
		c.baseURL,
		url.PathEscape(owner),
		url.PathEscape(repo),
		prNumber,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, endpoint, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
	req.Header.Set("User-Agent", "PRSentry")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("requesting PR files: %w", err)
	}
	defer resp.Body.Close()

	limitedBody := io.LimitReader(resp.Body, maxResponseBodyBytes)
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(limitedBody)
		return nil, fmt.Errorf("unexpected status %d fetching PR files: %s", resp.StatusCode, string(body))
	}

	var files []prFile
	if err := json.NewDecoder(limitedBody).Decode(&files); err != nil {
		return nil, fmt.Errorf("decoding PR files response: %w", err)
	}

	diffs := make([]review.FileDiff, 0, len(files))
	for _, f := range files {
		if f.Patch == "" || isGeneratedFile(f.Filename) {
			continue
		}

		patch := f.Patch
		if len(patch) > maxDiffBytes {
			patch = truncateUTF8(patch, maxDiffBytes) + "\n... [Diff truncated: exceeded 100 KB size limit]\n"
		}

		diffs = append(diffs, review.FileDiff{
			Path: f.Filename,
			Diff: patch,
		})
	}
	return diffs, nil
}

// PostPRComment posts a formatted Markdown review comment on the target GitHub pull request.
func (c *Client) PostPRComment(ctx context.Context, installationID int64, owner, repo string, prNumber int, body string) error {
	token, err := c.getInstallationToken(ctx, installationID)
	if err != nil {
		return err
	}

	payload, err := json.Marshal(map[string]string{"body": body})
	if err != nil {
		return fmt.Errorf("encoding PR comment body: %w", err)
	}

	endpoint := fmt.Sprintf(
		"%s/repos/%s/%s/issues/%d/comments",
		c.baseURL,
		url.PathEscape(owner),
		url.PathEscape(repo),
		prNumber,
	)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, endpoint, bytes.NewReader(payload))
	if err != nil {
		return err
	}
	req.Header.Set("Authorization", "Bearer "+token)
	req.Header.Set("Accept", "application/vnd.github+json")
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-GitHub-Api-Version", githubAPIVersion)
	req.Header.Set("User-Agent", "PRSentry")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("posting PR comment: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		respBody, _ := io.ReadAll(io.LimitReader(resp.Body, maxResponseBodyBytes))
		return fmt.Errorf("unexpected status %d posting PR comment: %s", resp.StatusCode, string(respBody))
	}

	return nil
}

// FormatReviewComment renders a ReviewResponse as a structured Markdown GitHub PR comment.
func FormatReviewComment(headSHA string, result *review.ReviewResponse) string {
	var b strings.Builder

	recLabel := strings.ToUpper(result.MergeRecommendation)
	shortSHA := headSHA
	if len(shortSHA) > 7 {
		shortSHA = shortSHA[:7]
	}

	b.WriteString("## PRSentry Automated Code Review\n\n")
	if shortSHA != "" {
		fmt.Fprintf(&b, "**Commit:** `%s` | ", shortSHA)
	}
	fmt.Fprintf(&b, "**Risk Score:** `%.1f / 5.0` | **Merge Recommendation:** `%s`\n\n", result.RiskScore, recLabel)
	fmt.Fprintf(&b, "### Summary\n%s\n\n", result.Summary)

	if len(result.Findings) == 0 {
		b.WriteString("_No bugs, security risks, or maintainability findings were flagged in this diff._\n")
		return b.String()
	}

	fmt.Fprintf(&b, "### Findings (%d)\n\n", len(result.Findings))
	b.WriteString("| Severity | Category | Location | Details |\n")
	b.WriteString("| :--- | :--- | :--- | :--- |\n")

	for _, f := range result.Findings {
		msg := strings.ReplaceAll(strings.ReplaceAll(f.Message, "\n", " "), "|", "\\|")
		loc := fmt.Sprintf("`%s:%d`", strings.ReplaceAll(f.FilePath, "|", "\\|"), f.LineNumber)
		fmt.Fprintf(&b, "| **%s** | `%s` | %s | %s |\n", strings.ToUpper(f.Severity), f.Category, loc, msg)
	}

	return b.String()
}
