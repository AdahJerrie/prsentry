Dimension	        Complexity	    Risk Level	            Mitigation Strategy

Development	        Moderate	        Low	               Mocking endpoints early allows continuous integration.

GitHub Integration	High	            Medium	           App permissions and Webhook handling have a steep initial learning curve.

LLM Reliability	    Moderate	    Medium	           Rely strictly on Structured Outputs (JSON mode) to prevent UI parsing crashes.

Deployment	        Low	                Low	            Dockerization hides OS differences; platforms like Railway make hosting simple.

# Some of the bottle necks I was looking into
1. The "Large Diff" Problem (Python Track)
GitHub diffs can easily exceed LLM context limits or trigger massive API token bills if a PR alters lock files (e.g., package-lock.json, go.sum) or auto-generated assets.
    *Action: Implement an early file-filtering layer in Go or Python. Immediately ignore binary files, lockfiles, and minified assets before passing the payload to the LLM.*

2. GitHub Webhook Timeouts (Go Track)GitHub expects your webhook endpoint to acknowledge a payload with a 200 OK response within 10 seconds. Calling the Python service, waiting for the LLM to complete its analysis, and returning the data synchronously will frequently cross this 10-second threshold for larger PRs.
    *Action: If a synchronous architecture causes GitHub timeout errors during Week 2, immediately pivot Go's webhook handler to save the incoming event to the database with a pending status, return a 202 Accepted to GitHub, and launch a Go goroutine (go internal.AnalyzePR(...)) to process the LLM call asynchronously in the background.*

3. Inline Comment Mapping
Posting an overall summary comment on a PR is trivial. However, posting inline findings tied to exact lines (findings.line_number) requires understanding GitHub's specific review comment API, which maps to the diff's relative line index (the "position" field in the diff hunk), not necessarily the absolute file line number.
    *Action: Dedicate extra testing time in Week 2 for the mapping logic, or fall back to posting a single beautifully formatted Markdown table of findings as a main PR comment if inline mapping becomes a blocker.*

# Decision for the first bottle neck
I think we set a limit to files that can be handled in v1, then find a way of chunking larger files in v2.

In the Go service, before sending the request, cap it:

If files_changed > N (say 30) or total diff size > some byte limit, just skip full analysis and send Go's existing metadata to make a decision — either:
Truncate: send only the first N files, or
Reject: return a friendly "PR too large to auto-review, please review manually" message from Go without ever calling Python.
This is a single if check in one place (wherever Go builds the request), not a new subsystem. It touches no contract fields, no Python code, no frontend logic beyond maybe displaying that message.

Why this doesn't complicate v1:

Zero new fields in the JSON contract
Zero changes to Python's logic
Lives entirely in Go, as a pre-flight check
You can literally hardcode the limit as a constant for now
V2 later: replace that one if block with real chunking/prioritization logic (e.g. "analyze the 10 riskiest files first," or "summarize per-file, then synthesize"). Because it's isolated in one function today, swapping it out later is a contained change, not a refactor.

APIs and API Calls ExplainedWhat is an API?An API (Application Programming Interface) is a predefined set of rules, routes, and data formats that allows two separate software programs to communicate with each other over a network.Think of an API like a menu at a restaurant:The Restaurant Kitchen: The backend service (e.g., Python AI engine). You aren't allowed to walk into the kitchen and grab raw ingredients yourself.The Menu (The API Contract): Specifies exactly what dishes you can order and what inputs (parameters) the kitchen requires.The Waiter (The API Endpoint): Takes your structured request to the kitchen and returns the finished response to your table.What is an API Call?An API Call is the actual network message sent from a client to a server asking the server to process data or return information. It consists of:HTTP Method: The intent of the call (POST to submit data, GET to fetch data, DELETE to remove data).Endpoint URL: The specific web address path that handles the task (e.g., /webhook or /review).Headers & Body: Metadata (e.g., authentication keys, signatures) and JSON payload containing the actual data.The API Endpoints of PRSentryPRSentry relies on two distinct API boundaries: the Go Service API (public-facing) and the Python Service API (internal-facing).+------------------+         API Call 1 (External Webhook)          +--------------------+
|  GitHub Servers  | ---------------------------------------------> |  Go Backend Server |
+------------------+   POST http://your-domain.com/webhook          +--------------------+
                                                                              |
                                                                              | API Call 2 (Internal)
                                                                              | POST http://python-service:8000/v1/review
                                                                              v
                                                                    +--------------------+
                                                                    | Python AI Service  |
                                                                    +--------------------+
1. Go Service API EndpointsThe Go service exposes public endpoints to the outside world (GitHub) and internal endpoints for frontend dashboards.MethodEndpoint PathCallerDescriptionPOST/webhookGitHub ServersInbound Webhook Listener. Receives real-time PR events (opened, synchronize), verifies X-Hub-Signature-256, and triggers background reviews.GET/api/v1/prs (Future)React FrontendPR List. Returns a paginated list of all analyzed pull requests from PostgreSQL.GET/api/v1/prs/{id} (Future)React FrontendPR Details. Returns the summary, risk score, and granular security findings for a specific review run.Example API Call to Go (POST /webhook):GitHub sends a JSON payload when a developer opens a Pull Request:JSON// Headers: X-Hub-Signature-256: sha256=a1b2c3...
{
  "action": "opened",
  "number": 42,
  "repository": { "full_name": "owner/repo" },
  "installation": { "id": 991823 }
}
Go Response: 202 Accepted (tells GitHub the message was received safely).2. Python AI Service API EndpointsThe Python service acts as an internal microservice. It is never exposed directly to the public internet; only the Go backend is allowed to make API calls to it.MethodEndpoint PathCallerDescriptionPOST/v1/reviewGo BackendCode Analysis Endpoint. Accepts PR file diffs/patches, passes them to the AI model, and returns a structured risk score and finding list.GET/healthGo / MonitoringHealth Check. Returns 200 OK if the Python service and AI models are loaded and ready in memory.Example API Call from Go to Python (POST /v1/review):The Go service formats the changed code files and calls the Python API:JSON// Request sent to http://python-service:8000/v1/review
{
  "pr_id": 42,
  "repository": "owner/repo",
  "files": [
    {
      "filename": "auth.go",
      "patch": "@@ -10,3 +10,5 @@ + password := r.FormValue(\"password\")"
    }
  ]
}
Python executes the AI analysis and responds back with structured JSON:JSON// Response returned to Go
{
  "pr_id": 42,
  "summary": "Hardcoded credential handling detected.",
  "risk_score": 8.5,
  "merge_recommendation": "NEEDS_REVISION",
  "findings": [
    {
      "file_path": "auth.go",
      "line_number": 11,
      "severity": "CRITICAL",
      "category": "SECURITY",
      "message": "Plaintext password passed without sanitization."
    }
  ]
}
Summary of the Complete API Execution FlowWhen a developer opens a PR on GitHub, the chain of API calls proceeds as follows:API Call 1 (GitHub -> Go): GitHub makes an HTTP POST /webhook call to the Go server.API Call 2 (Go -> GitHub REST API): Go makes an HTTP GET /repos/{owner}/{repo}/pulls/{number}/files call to GitHub to download code patches.API Call 3 (Go -> Python): Go makes an HTTP POST /v1/review call sending those patches to Python.Database Write: Go receives the Python API response and saves it to PostgreSQL inside a single db.Store ACID transaction.