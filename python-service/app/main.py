"""
Entry point. This is what Go's webhook handler will POST to once
the forwarding step is wired up on the Go side (Week 2 work).

Run locally with:
    uvicorn app.main:app --reload --port 8000
"""

from importlib import import_module

_fastapi = import_module("fastapi")
FastAPI = _fastapi.FastAPI
HTTPException = _fastapi.HTTPException

# Import the updated asynchronous execution engine from your analysis layer
from app.analysis import analyze_pr_async
from app.models import ReviewRequest, ReviewResponse

app = FastAPI(title="PRSentry Python Service")


@app.get("/health")
def health():
    """Simple liveness check — handy for confirming the service is up
    before Go ever tries to talk to it."""
    return {"status": "ok"}


@app.post("/review", response_model=ReviewResponse)
async def review(request: ReviewRequest):
    """
    Receives PR file diffs from the Go service, runs concurrent LLM-based 
    finding and vulnerability analysis, and returns the aggregated 
    v1 contract compliant payload.
    """
    try:
        # Pass the expanded contract parameters (pr_id, repo, files) to the async engine
        response_payload = await analyze_pr_async(
            pr_id=request.pr_id,
            repo=request.repo,
            files=request.files
        )
        return response_payload
        
    except Exception as exc:
        # Anything from the Anthropic API (rate limit, network, auth)
        # surfaces here. Bubble up as a 502 so Go knows THIS service
        # failed, not that the request itself was malformed.
        raise HTTPException(status_code=502, detail=f"Analysis failed: {exc}")
