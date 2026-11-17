package webhook

// webhookRepo is a repository named on an installation webhook.
type webhookRepo struct {
	ID       int64  `json:"id"`
	FullName string `json:"full_name"`
}

type GitHubWebhookPayload struct {
	Action string `json:"action"`

	Repository struct {
		ID       int64  `json:"id"`
		FullName string `json:"full_name"`
		Owner    struct {
			Login string `json:"login"`
		} `json:"owner"`
	} `json:"repository"`

	Installation struct {
		ID int64 `json:"id"`
		Account struct {
			Login string `json:"login"`
		} `json:"account"`
		RepositorySelection string `json:"repository_selection"`
	} `json:"installation"`

	Repositories        []webhookRepo `json:"repositories"`
	RepositoriesAdded   []webhookRepo `json:"repositories_added"`
	RepositoriesRemoved []webhookRepo `json:"repositories_removed"`

	PullRequest struct {
		Number int    `json:"number"`
		Title  string `json:"title"`
		State  string `json:"state"`
		Merged bool   `json:"merged"`
		User   struct {
			Login string `json:"login"`
		} `json:"user"`
		Head struct {
			SHA string `json:"sha"`
		} `json:"head"`
		Base struct {
			SHA string `json:"sha"`
		} `json:"base"`
	} `json:"pull_request"`
}
