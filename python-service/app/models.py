"""
Request/response shapes for the /review endpoint.

These match api-contract.md at the monorepo root. Go sends ReviewRequest;
this service returns ReviewResponse.
"""

from typing import Literal
from pydantic import BaseModel, Field

Severity = Literal["low", "medium", "high"]
Category = Literal["bug", "security", "performance", "style", "maintainability"]
MergeRecommendation = Literal["safe", "caution", "block"]


class FileDiff(BaseModel):
    """One changed file in the PR. Go's review.FileDiff mirrors this."""

    path: str = Field(min_length=1, max_length=1024)
    diff: str = Field(max_length=200_000)


class ReviewRequest(BaseModel):
    """What Go POSTs to /review."""

    pr_id: int = Field(gt=0)
    repo: str = Field(min_length=3, max_length=255)
    files: list[FileDiff] = Field(default_factory=list, max_length=50)


class Finding(BaseModel):
    """One specific code defect or risk discovered by the AI reviewer."""

    file_path: str = Field(min_length=1)
    line_number: int = Field(ge=1, description="1-based line in the file the finding applies to.")
    severity: Severity = Field(description="Must match exact set: low, medium, or high.")
    category: Category = Field(
        description="Must match exact set: bug, security, performance, style, or maintainability."
    )
    message: str = Field(min_length=1, description="Human-readable explanation of the finding.")


class ReviewResponse(BaseModel):
    """What the Python service sends back to Go."""

    pr_id: int
    summary: str
    risk_score: float = Field(ge=1.0, le=5.0, description="Numeric rollup risk scale (1.0–5.0).")
    merge_recommendation: MergeRecommendation = Field(
        description="Must match exact set: safe, caution, or block."
    )
    findings: list[Finding] = Field(default_factory=list)
