"""
Request/response shapes for the /review endpoint.

These MUST match docs/api-contract.md at the monorepo root. Go sends
ReviewRequest; this service sends back ReviewResponse. If you change a
field name here, the Go side breaks silently (it'll just get a 422
from FastAPI, or Go will unmarshal into zero-values) — so this file
IS the contract for the Python side.
"""

from pydantic import BaseModel, Field  # pyright: ignore[reportMissingImports]


class FileDiff(BaseModel):
    """One changed file in the PR. Go's review.FileDiff mirrors this."""
    path: str
    diff: str


class ReviewRequest(BaseModel):
    """What Go POSTs to /review. Updated to include the mandatory repo target field."""
    pr_id: int
    repo: str
    files: list[FileDiff]


class Finding(BaseModel):
    """
    One specific code architecture finding or defect discovered by the AI reviewer.
    Satisfies the granular line-by-line contract structure.
    """
    file_path: str
    line_number: int = Field(description="Line in the file the finding applies to.")
    severity: str = Field(description="Must match exact set: low, medium, or high.")
    category: str = Field(description="Must match exact set: bug, security, performance, style, or maintainability.")
    message: str = Field(description="Human-readable explanation of the finding.")


class ReviewResponse(BaseModel):
    """
    What the Python service sends back to Go.
    Fully updated and locked down to match the v1 api-contract.md parameters.
    """
    pr_id: int
    summary: str
    risk_score: float = Field(description="Numeric rollup risk scale value.")
    merge_recommendation: str = Field(description="Must match exact set: safe, caution, or block.")
    findings: list[Finding] = []
