package github

import (
	"crypto/rsa"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"

	"prsentry/go-service/internal/review"
)

type Client struct {
	appID      string
	privateKey *rsa.PrivateKey
	httpClient *http.Client
}

// NewClient parses the App's private key once at startup and returns a
// ready-to-use client.
func NewClient(appID string, privateKeyPEM []byte) (*Client, error) {
	key, err := jwt.ParseRSAPrivateKeyFromPEM(privateKeyPEM)
	if err != nil {
		return nil, fmt.Errorf("parsing private key: %w", err)
	}
	return &Client{
		appID:      appID,
		privateKey: key,
		httpClient: &http.Client{Timeout: 10 * time.Second},
	}, nil
}

// generateJWT signs a short-lived token proving "I am this App."
func (c *Client) generateJWT() (string, error) {
	now := time.Now()
	claims := jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(now.Add(-30 * time.Second)), // small buffer for clock drift
		ExpiresAt: jwt.NewNumericDate(now.Add(9 * time.Minute)),
		Issuer:    c.appID,
	}
	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	return token.SignedString(c.privateKey)
}

type installationTokenResponse struct {
	Token string `json:"token"`
}

// getInstallationToken exchanges the app JWT for a token scoped to one
// specific installation (i.e. one account/set of repos).
func (c *Client) getInstallationToken(installationID int64) (string, error) {
	jwtToken, err := c.generateJWT()
	if err != nil {
		return "", fmt.Errorf("generating app JWT: %w", err)
	}

	url := fmt.Sprintf("https://api.github.com/app/installations/%d/access_tokens", installationID)
	req, err := http.NewRequest(http.MethodPost, url, nil)
	if err != nil {
		return "", err
	}
	req.Header.Set("Authorization", "Bearer "+jwtToken)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("requesting installation token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("unexpected status %d fetching installation token: %s", resp.StatusCode, string(body))
	}

	var tokenResp installationTokenResponse
	if err := json.NewDecoder(resp.Body).Decode(&tokenResp); err != nil {
		return "", fmt.Errorf("decoding installation token response: %w", err)
	}
	return tokenResp.Token, nil
}

type prFile struct {
	Filename string `json:"filename"`
	Patch    string `json:"patch"` // may be empty for binary/huge files
}

// FetchPRFiles returns the changed files for a PR, already shaped as
// review.FileDiff — ready to drop straight into a ReviewRequest.
func (c *Client) FetchPRFiles(installationID int64, owner, repo string, prNumber int) ([]review.FileDiff, error) {
	token, err := c.getInstallationToken(installationID)
	if err != nil {
		return nil, err
	}

	url := fmt.Sprintf("https://api.github.com/repos/%s/%s/pulls/%d/files?per_page=100", owner, repo, prNumber)
	req, err := http.NewRequest(http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "token "+token)
	req.Header.Set("Accept", "application/vnd.github+json")

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("requesting PR files: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("unexpected status %d fetching PR files: %s", resp.StatusCode, string(body))
	}

	var files []prFile
	if err := json.NewDecoder(resp.Body).Decode(&files); err != nil {
		return nil, fmt.Errorf("decoding PR files response: %w", err)
	}

	diffs := make([]review.FileDiff, 0, len(files))
	for _, f := range files {
		if f.Patch == "" {
			continue // binary or too-large file — GitHub omits the patch
		}
		diffs = append(diffs, review.FileDiff{
			Path: f.Filename,
			Diff: f.Patch,
		})
	}
	return diffs, nil
}
