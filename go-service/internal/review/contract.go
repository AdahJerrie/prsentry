package review

// FileDiff is one changed file in the PR — mirrors Python's FileDiff model.
type FileDiff struct {
	Path string `json:"path"`
	Diff string `json:"diff"`
}

// ReviewRequest is what Go sends to Python's POST /review.
// Repo was removed (YAGNI) — nothing on the Python side reads it yet.
// If a concrete need shows up, adding it back is a cheap additive change,
// same as FileRisks below.
type ReviewRequest struct {
	PRID  int        `json:"pr_id"`
	Files []FileDiff `json:"files"`
}

// FileRisk is one file's individual risk verdict — mirrors Python's
// FileRisk model. Part of ReviewResponse below.
type FileRisk struct {
	Path      string  `json:"path"`
	RiskScore float64 `json:"risk_score"`
	Reasoning string  `json:"reasoning"`
}

// ReviewResponse is what Python sends back from POST /review.
// PRID and RiskScore are the locked fields per docs/api-contract.md.
// Summary, FlaggedFiles, and FileRisks are additive — safe for Go to
// read now that they exist, but not part of the original lock.
type ReviewResponse struct {
	PRID         int        `json:"pr_id"`
	RiskScore    float64    `json:"risk_score"`
	Summary      string     `json:"summary"`
	FlaggedFiles []string   `json:"flagged_files"`
	FileRisks    []FileRisk `json:"file_risks"`
}
