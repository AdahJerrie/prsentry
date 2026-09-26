package webhook

type GitHubWebhookPayload struct {
	Action string `json:"action"`

	Repository struct {
		FullName string `json:"full_name"`
	} `json:"repository"`

	Installation struct {
		ID int64 `json:"id"`
	} `json:"installation"`

	PullRequest struct {
		Number int `json:"number"`
	} `json:"pull_request"`
}