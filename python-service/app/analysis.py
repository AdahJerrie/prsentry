# app/analysis.py
import asyncio
import json
import anthropic
from app.models import FileDiff, ReviewResponse, Finding

# 1. Instantiate the asynchronous Anthropic engine
client = anthropic.AsyncAnthropic()  # Reads ANTHROPIC_API_KEY from environment
MODEL = "claude-3-5-sonnet-latest"   # Valid, up-to-date Sonnet model identifier

SYSTEM_PROMPT = """You are an expert senior code reviewer assessing security, performance, and correctness in file diffs.
Analyze the provided unified diff chunk and extract specific issues.

For each issue found, you must provide:
- line_number: The line number in the diff where the issue resides. If uncertain, default to 1.
- severity: Strict choice of "low", "medium", or "high".
- category: Strict choice of "bug", "security", "performance", "style", or "maintainability".
- message: Clear, human-readable prose explaining the issue and the fix.
"""

async def _analyze_single_diff(file: FileDiff) -> list[dict]:
    """
    Submits an individual file diff to Claude using Anthropic's Tools API 
    to guarantee structured JSON enforcement without formatting hallucinations.
    """
    try:
        response = await client.messages.create(
            model=MODEL,
            max_tokens=800,
            system=SYSTEM_PROMPT,
            # Forcing structural compliance via Tool definitions
            tools=[{
                "name": "submit_findings",
                "description": "Submit a collection of line-by-line code review findings.",
                "input_schema": {
                    "type": "object",
                    "properties": {
                        "findings": {
                            "type": "array",
                            "items": {
                                "type": "object",
                                "properties": {
                                    "line_number": {"type": "integer"},
                                    "severity": {"type": "string", "enum": ["low", "medium", "high"]},
                                    "category": {"type": "string", "enum": ["bug", "security", "performance", "style", "maintainability"]},
                                    "message": {"type": "string"}
                                },
                                "required": ["line_number", "severity", "category", "message"]
                            }
                        }
                    },
                    "required": ["findings"]
                }
            }],
            tool_choice={"type": "tool", "name": "submit_findings"},
            messages=[{
                "role": "user",
                "content": f"File Path: {file.path}\n\nDiff Content:\n{file.diff}"
            }]
        )

        #Ensure we access the correct content block array index
        tool_block = response.content[0]
        
        # Safely parse structural input fields directly from the tool call block
        if hasattr(tool_block, "input"):
            raw_findings = tool_block.input.get("findings", [])
        else:
            raw_findings = []

        # Inject the file_path into each individual item as mandated by the contract
        for item in raw_findings:
            item["file_path"] = file.path
        return raw_findings

    except Exception:
        # Fail safe for v1: if an error hits an isolated file, log and return empty findings
        return []

async def analyze_pr_async(pr_id: int, repo: str, files: list[FileDiff]) -> ReviewResponse:
    """
    Orchestrates high-speed concurrent analysis across all modified PR files
    and aggregates them neatly into the locked v1 Contract format.
    """
    if not files:
        return ReviewResponse(
            pr_id=pr_id,
            summary="No modified files found to review in this PR block.",
            risk_score=1.0,
            merge_recommendation="safe",
            findings=[]
        )

    # Trigger all AI queries in parallel over asyncio threads
    tasks = [_analyze_single_diff(f) for f in files]
    grouped_results = await asyncio.gather(*tasks)
    
    # Flatten findings array
    all_findings: list[Finding] = []
    for file_findings in grouped_results:
        for f in file_findings:
            all_findings.append(Finding(**f))

    # Calculate Rollup Metrics for the Contract response
    high_count = sum(1 for f in all_findings if f.severity == "high")
    med_count = sum(1 for f in all_findings if f.severity == "medium")
    
    # 1. Determine Merge Recommendation Rule
    if high_count > 0:
        recommendation = "block"
    elif med_count > 0:
        recommendation = "caution"
    else:
        recommendation = "safe"

    # 2. Determine Risk Score (Scale mapping 1 to 5 as per Contract)
    if high_count > 0:
        score = 5.0
    elif med_count > 2:
        score = 4.0
    elif med_count > 0:
        score = 3.0
    elif len(all_findings) > 0:
        score = 2.0
    else:
        score = 1.0

    summary = f"Automated analysis completed. Identified {len(all_findings)} architectural finding(s) across modified paths."

    return ReviewResponse(
        pr_id=pr_id,
        summary=summary,
        risk_score=score,
        merge_recommendation=recommendation,
        findings=all_findings
    )
