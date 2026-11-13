"""
FastAPI entry point for the PRSentry Python AI analysis service.

Run locally with:
    uvicorn app.main:app --reload --port 8000
"""

import logging
import os
import secrets

from fastapi import Depends, FastAPI, Header, HTTPException

from app.analysis import analyze_pr_async
from app.models import ReviewRequest, ReviewResponse

logger = logging.getLogger(__name__)

app = FastAPI(title="PRSentry Python Service")


async def verify_internal_token(authorization: str | None = Header(default=None)) -> None:
    expected_token = os.getenv("INTERNAL_AUTH_TOKEN", "").strip()
    if not expected_token:
        raise HTTPException(
            status_code=500,
            detail="INTERNAL_AUTH_TOKEN is not configured on the server.",
        )

    expected_header = f"Bearer {expected_token}"
    provided = authorization or ""
    if not secrets.compare_digest(provided.encode("utf-8"), expected_header.encode("utf-8")):
        raise HTTPException(
            status_code=401,
            detail="Unauthorized: Invalid or missing internal auth token.",
        )


@app.get("/health")
def health() -> dict[str, str]:
    """Liveness check confirming the FastAPI service is reachable."""
    return {"status": "ok"}


@app.post(
    "/review",
    response_model=ReviewResponse,
    dependencies=[Depends(verify_internal_token)],
)
async def review(request: ReviewRequest) -> ReviewResponse:
    """
    Receives PR file diffs from the Go service, runs bounded concurrent LLM
    analysis, and returns a contract-compliant ReviewResponse payload.
    """
    try:
        return await analyze_pr_async(
            pr_id=request.pr_id,
            repo=request.repo,
            files=request.files,
        )
    except Exception:
        logger.exception("AI diff analysis failed for %s#%d", request.repo, request.pr_id)
        raise HTTPException(
            status_code=502,
            detail="Upstream AI analysis failed while evaluating pull request diffs.",
        )
