package main

import (
	"os"
	"path/filepath"
	"strings"
	"testing"
)

func TestLoadGitHubPrivateKey(t *testing.T) {
	// 1. Inline escaped PEM takes precedence for container/cloud secrets
	pemBytes, err := loadGitHubPrivateKey(`-----BEGIN RSA PRIVATE KEY-----\nabc\n-----END RSA PRIVATE KEY-----`, "")
	if err != nil {
		t.Fatalf("unexpected error loading inline PEM: %v", err)
	}
	if !strings.Contains(string(pemBytes), "\nabc\n") {
		t.Fatalf("expected escaped newlines to be normalized, got %q", string(pemBytes))
	}

	// 2. File path fallback works for local development
	tmpFile := filepath.Join(t.TempDir(), "app.pem")
	if err := os.WriteFile(tmpFile, []byte("file-pem-content"), 0o600); err != nil {
		t.Fatalf("writing temp pem: %v", err)
	}
	fromFile, err := loadGitHubPrivateKey("", tmpFile)
	if err != nil || string(fromFile) != "file-pem-content" {
		t.Fatalf("expected file content, got %q (err=%v)", string(fromFile), err)
	}

	// 3. Missing both returns an explicit error
	if _, err := loadGitHubPrivateKey("", ""); err == nil {
		t.Fatal("expected error when both inline PEM and path are empty")
	}
}
