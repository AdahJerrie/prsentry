package github

import (
	"strings"
	"testing"
	"unicode/utf8"

	"prsentry/go-service/internal/review"
)

func TestIsGeneratedFile(t *testing.T) {
	cases := []struct {
		name string
		want bool
	}{
		{"package-lock.json", true},
		{"frontend/pnpm-lock.yaml", true},
		{"go-service/go.sum", true},
		{"dist/bundle.min.js", true},
		{"api/service.pb.go", true},
		{"internal/auth/jwt.go", false},
		{"src/components/App.tsx", false},
	}

	for _, tc := range cases {
		if got := isGeneratedFile(tc.name); got != tc.want {
			t.Errorf("isGeneratedFile(%q) = %v, want %v", tc.name, got, tc.want)
		}
	}
}

func TestTruncateUTF8PreservesValidRunes(t *testing.T) {
	// "🔥" is 4 bytes in UTF-8; cutting at byte 6 would split the second emoji if not UTF-8 aware.
	input := "ab🔥🔥cd"
	got := truncateUTF8(input, 7)
	if !utf8.ValidString(got) {
		t.Fatalf("truncateUTF8 produced invalid UTF-8: %q", got)
	}
	if got != "ab🔥" {
		t.Fatalf("expected %q, got %q", "ab🔥", got)
	}
}

func TestFormatReviewComment(t *testing.T) {
	res := &review.ReviewResponse{
		PRID:                42,
		Summary:             "Detected an unparameterized SQL query.",
		RiskScore:           5.0,
		MergeRecommendation: "block",
		Findings: []review.Finding{
			{
				FilePath:   "internal/db/user.go",
				LineNumber: 27,
				Severity:   "high",
				Category:   "security",
				Message:    "Use parameterized $1 placeholder | avoid fmt.Sprintf.",
			},
		},
	}

	md := FormatReviewComment("9f86d081884c7d659a2feaa0c55ad015a3bf4f1b", res)
	if !strings.Contains(md, "`9f86d08`") || !strings.Contains(md, "`BLOCK`") || !strings.Contains(md, "`internal/db/user.go:27`") {
		t.Fatalf("formatted comment missing expected fields:\n%s", md)
	}
}
