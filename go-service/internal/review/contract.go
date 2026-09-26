package review

// FileDiff represents one modified file tracking patch data.
type FileDiff struct {
	Path string `json:"path"`
	Diff string `json:"diff"`
}

// ReviewRequest represents the outgoing transmission to the Python microservice.
type ReviewRequest struct {
	PRID  int        `json:"pr_id"`
	Repo  string     `json:"repo"` // Aligned to supply target metadata
	Files []FileDiff `json:"files"`
}

// Finding represents an individual architectural issue discovered by the AI.
type Finding struct {
	FilePath   string `json:"file_path"`
	LineNumber int    `json:"line_number"`
	Severity   string `json:"severity"`
	Category   string `json:"category"`
	Message    string `json:"message"`
}

// ReviewResponse captures the final structural payload from Python.
type ReviewResponse struct {
	PRID                int       `json:"pr_id"`
	Summary             string    `json:"summary"`
	RiskScore           float64   `json:"risk_score"`
	MergeRecommendation string    `json:"merge_recommendation"`
	Findings            []Finding `json:"findings"`
}
