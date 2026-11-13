import type {
  Category,
  DashboardStats,
  MergeRecommendation,
  PRDetail,
  PRFinding,
  PRSummary,
} from "../types/api";

export const INSTITUTIONAL_REPOS = [
  "org/student-auth-go",
  "org/campus-portal-api",
  "org/lab-tracker-ui",
] as const;

export interface FindingRemediation {
  code_snippet: string;
  suggested_fix: string;
  why_it_matters: string;
}

const KNOWN_REMEDIATIONS: Record<number, FindingRemediation> = {
  1001: {
    code_snippet: `- query := fmt.Sprintf("SELECT id, role FROM students WHERE username = '%s'", req.Username)
- row := db.QueryRowContext(ctx, query)`,
    suggested_fix: `const query = "SELECT id, role FROM students WHERE username = $1"
row := db.QueryRowContext(ctx, query, req.Username)`,
    why_it_matters:
      "String interpolation inside SQL statements allows an attacker to inject arbitrary SQL predicates (e.g., `' OR '1'='1`), bypassing authentication or exfiltrating student records.",
  },
  1002: {
    code_snippet: `- var jwtSigningSecret = []byte("campus-dev-secret-2026-do-not-share")
- tokenString, err := token.SignedString(jwtSigningSecret)`,
    suggested_fix: `secret := os.Getenv("JWT_HMAC_SECRET")
if len(secret) < 32 {
    return "", errors.New("JWT_HMAC_SECRET must be at least 32 bytes")
}
tokenString, err := token.SignedString([]byte(secret))`,
    why_it_matters:
      "Hardcoding cryptographic signing keys in version control lets anyone with repository read access forge valid session JWTs for any administrative user.",
  },
  1003: {
    code_snippet: `- rows, err := s.pool.Query(ctx, "SELECT id, course_code FROM enrollments")
- if err != nil { return nil, err }
  for rows.Next() {`,
    suggested_fix: `rows, err := s.pool.Query(ctx, "SELECT id, course_code FROM enrollments")
if err != nil {
    return nil, err
}
defer rows.Close()`,
    why_it_matters:
      "Omitting `defer rows.Close()` prevents the underlying pgx connection from returning to the pool if an early return or panic occurs mid-iteration, leading to connection pool exhaustion.",
  },
  2001: {
    code_snippet: `- @app.get("/api/grades/export")
- async def export_grades(student_id: str, db: Session = Depends(get_db)):
-     return db.query(Grade).filter(Grade.student_id == student_id).all()`,
    suggested_fix: `@app.get("/api/grades/export")
async def export_grades(
    student_id: str,
    current_user: Student = Depends(require_authenticated_student),
    db: Session = Depends(get_db),
):
    if current_user.id != student_id and not current_user.is_instructor:
        raise HTTPException(status_code=403, detail="Forbidden")
    return db.query(Grade).filter(Grade.student_id == student_id).all()`,
    why_it_matters:
      "Insecure Direct Object Reference (IDOR): accepting `student_id` from query parameters without verifying caller ownership allows any student to query another student's transcript.",
  },
  2002: {
    code_snippet: `- for submission in submissions:
-     rubric = db.query(Rubric).filter_by(id=submission.rubric_id).first()`,
    suggested_fix: `submissions = (
    db.query(Submission)
    .options(joinedload(Submission.rubric))
    .filter(Submission.course_id == course_id)
    .all()
)`,
    why_it_matters:
      "Executing a lazy query inside a loop triggers an N+1 query pattern, multiplying database round-trips linearly with class size.",
  },
  3001: {
    code_snippet: `- useEffect(() => {
-   fetch(\`/api/v1/labs/\${labId}/status\`).then(r => r.json()).then(setStatus);
- }, [labId]);`,
    suggested_fix: `useEffect(() => {
  const controller = new AbortController();
  fetch(\`/api/v1/labs/\${encodeURIComponent(labId)}/status\`, {
    signal: controller.signal,
  })
    .then((r) => r.json())
    .then(setStatus)
    .catch((err) => {
      if (err.name !== "AbortError") setError(err.message);
    });
  return () => controller.abort();
}, [labId]);`,
    why_it_matters:
      "Without an `AbortController` and `encodeURIComponent`, rapid route transitions can cause out-of-order state updates (race conditions) on unmounted views.",
  },
};

/**
 * Deterministically provides `code_snippet`, `suggested_fix`, and `why_it_matters`
 * for any backend `PRFinding` even when the Go database only stores the 6 core fields.
 */
export function getFindingRemediation(finding: PRFinding): FindingRemediation {
  if (finding.code_snippet && finding.suggested_fix) {
    return {
      code_snippet: finding.code_snippet,
      suggested_fix: finding.suggested_fix,
      why_it_matters:
        KNOWN_REMEDIATIONS[finding.id]?.why_it_matters ??
        "Addressing this issue before merge reduces production incident risk and improves long-term maintainability.",
    };
  }

  if (KNOWN_REMEDIATIONS[finding.id]) {
    return KNOWN_REMEDIATIONS[finding.id];
  }

  const categoryDefaults: Record<Category, FindingRemediation> = {
    security: {
      code_snippet: `- // ${finding.file_path}:${finding.line_number}\n- rawInput := r.URL.Query().Get("input")\n- execUnverified(rawInput)`,
      suggested_fix: `// ${finding.file_path}:${finding.line_number}\nvalidatedInput, err := sanitizeAndVerify(r.URL.Query().Get("input"))\nif err != nil {\n    http.Error(w, "invalid parameter", http.StatusBadRequest)\n    return\n}`,
      why_it_matters:
        "Untrusted input crossing a service boundary must be validated, parameterized, and authorized before execution.",
    },
    bug: {
      code_snippet: `- // ${finding.file_path}:${finding.line_number}\n- res, _ := client.Do(req)\n- defer res.Body.Close()`,
      suggested_fix: `// ${finding.file_path}:${finding.line_number}\nres, err := client.Do(req)\nif err != nil {\n    return fmt.Errorf("request failed: %w", err)\n}\ndefer res.Body.Close()`,
      why_it_matters:
        "Ignoring returned error values can cause nil-pointer dereferences or silent data corruption under network failure.",
    },
    performance: {
      code_snippet: `- // ${finding.file_path}:${finding.line_number}\n- for _, id := range ids {\n-     item, _ := store.GetByID(ctx, id)\n- }`,
      suggested_fix: `// ${finding.file_path}:${finding.line_number}\nitems, err := store.GetBatchByIDs(ctx, ids)\nif err != nil {\n    return err\n}`,
      why_it_matters:
        "Batching I/O operations avoids per-item network overhead and keeps p95 latency predictable under load.",
    },
    maintainability: {
      code_snippet: `- // ${finding.file_path}:${finding.line_number}\n- if status == 1 || status == 3 {`,
      suggested_fix: `// ${finding.file_path}:${finding.line_number}\nconst (\n    StatusPending = "pending"\n    StatusCompleted = "completed"\n)\nif status == StatusPending || status == StatusCompleted {`,
      why_it_matters:
        "Explicit domain constants and clear error propagation make code self-documenting for teammates reviewing future diffs.",
    },
    style: {
      code_snippet: `- // ${finding.file_path}:${finding.line_number}\n- func Process_Data(d []byte) error {`,
      suggested_fix: `// ${finding.file_path}:${finding.line_number}\nfunc ProcessData(payload []byte) error {`,
      why_it_matters:
        "Consistent naming and formatting conventions reduce cognitive friction during peer code review.",
    },
  };

  return categoryDefaults[finding.category] ?? categoryDefaults.maintainability;
}

export const SEED_PR_DETAILS: PRDetail[] = [
  {
    id: "550e8400-e29b-41d4-a716-446655440001",
    repo_full_name: "org/student-auth-go",
    pr_number: 42,
    title: "feat(auth): add student login SQL query and JWT token issuer",
    author: "jerrie",
    pr_status: "open",
    latest_review_id: "7c9e6679-7425-40de-944b-e07fc1f90a01",
    review_status: "completed",
    head_sha: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b",
    risk_score: 4.6,
    merge_recommendation: "block",
    summary:
      "Automated analysis reviewed 3 file(s) in org/student-auth-go and identified 3 finding(s) (2 high, 1 medium, 0 low). Critical SQL injection vector and hardcoded HMAC signing secret must be remediated before merge.",
    findings_count: 3,
    high_severity_count: 2,
    created_at: "2026-11-13T19:45:00Z",
    findings: [
      {
        id: 1001,
        file_path: "internal/auth/login_handler.go",
        line_number: 48,
        severity: "high",
        category: "security",
        message:
          "Unparameterized fmt.Sprintf SQL query constructs a raw WHERE clause from user-supplied req.Username. Use parameterized $1 placeholders with db.QueryRowContext.",
      },
      {
        id: 1002,
        file_path: "internal/auth/jwt_issuer.go",
        line_number: 19,
        severity: "high",
        category: "security",
        message:
          "Hardcoded HMAC signing secret detected in source code. Load JWT_HMAC_SECRET from environment configuration and enforce a minimum 32-byte key length.",
      },
      {
        id: 1003,
        file_path: "internal/store/enrollments.go",
        line_number: 84,
        severity: "medium",
        category: "bug",
        message:
          "pgx.Rows cursor returned by pool.Query is not closed via defer rows.Close(), risking connection pool exhaustion on early return.",
      },
    ],
    review_runs: [
      {
        id: "7c9e6679-7425-40de-944b-e07fc1f90a01",
        head_sha: "9f86d081884c7d659a2feaa0c55ad015a3bf4f1b",
        status: "completed",
        risk_score: 4.6,
        merge_recommendation: "block",
        summary:
          "Automated analysis reviewed 3 file(s) in org/student-auth-go and identified 3 finding(s) (2 high, 1 medium, 0 low).",
        findings_count: 3,
        created_at: "2026-11-13T19:45:00Z",
      },
      {
        id: "7c9e6679-7425-40de-944b-e07fc1f90a00",
        head_sha: "3a14b882190c7d659a2feaa0c55ad015a3bf1102",
        status: "completed",
        risk_score: 4.9,
        merge_recommendation: "block",
        summary:
          "Initial commit review flagged 4 issues including missing webhook signature verification.",
        findings_count: 4,
        created_at: "2026-11-13T17:10:00Z",
      },
    ],
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440002",
    repo_full_name: "org/campus-portal-api",
    pr_number: 118,
    title: "feat(grades): add student transcript export endpoint and rubric loader",
    author: "alex-chen",
    pr_status: "open",
    latest_review_id: "7c9e6679-7425-40de-944b-e07fc1f90a02",
    review_status: "completed",
    head_sha: "4b22c190a84c7d659a2feaa0c55ad015a3bf992a",
    risk_score: 3.2,
    merge_recommendation: "caution",
    summary:
      "Automated analysis reviewed 2 file(s) in org/campus-portal-api and identified 2 finding(s) (1 high, 1 medium, 0 low). Verify caller authorization on transcript export and batch rubric lookups.",
    findings_count: 2,
    high_severity_count: 1,
    created_at: "2026-11-13T18:20:00Z",
    findings: [
      {
        id: 2001,
        file_path: "app/routers/grades.py",
        line_number: 63,
        severity: "high",
        category: "security",
        message:
          "Missing ownership check on student_id parameter (IDOR). Verify current_user.id == student_id or instructor role before returning grade records.",
      },
      {
        id: 2002,
        file_path: "app/services/rubric_loader.py",
        line_number: 112,
        severity: "medium",
        category: "performance",
        message:
          "ORM query executed inside loop over submissions causes N+1 query overhead. Eager-load Rubric via joinedload.",
      },
    ],
    review_runs: [
      {
        id: "7c9e6679-7425-40de-944b-e07fc1f90a02",
        head_sha: "4b22c190a84c7d659a2feaa0c55ad015a3bf992a",
        status: "completed",
        risk_score: 3.2,
        merge_recommendation: "caution",
        summary:
          "Automated analysis reviewed 2 file(s) in org/campus-portal-api and identified 2 finding(s) (1 high, 1 medium, 0 low).",
        findings_count: 2,
        created_at: "2026-11-13T18:20:00Z",
      },
    ],
  },
  {
    id: "550e8400-e29b-41d4-a716-446655440003",
    repo_full_name: "org/lab-tracker-ui",
    pr_number: 79,
    title: "refactor(polling): clean up lab status effect and add accessible ARIA labels",
    author: "jerrie",
    pr_status: "open",
    latest_review_id: "7c9e6679-7425-40de-944b-e07fc1f90a03",
    review_status: "completed",
    head_sha: "8e71a44bc84c7d659a2feaa0c55ad015a3bf7741",
    risk_score: 1.4,
    merge_recommendation: "safe",
    summary:
      "Automated analysis reviewed 4 file(s) in org/lab-tracker-ui and identified 1 finding(s) (0 high, 0 medium, 1 low). Clean diff with one minor AbortController cleanup recommendation.",
    findings_count: 1,
    high_severity_count: 0,
    created_at: "2026-11-13T16:05:00Z",
    findings: [
      {
        id: 3001,
        file_path: "src/hooks/useLabStatus.ts",
        line_number: 27,
        severity: "low",
        category: "maintainability",
        message:
          "Pass an AbortSignal to fetch inside useEffect cleanup so rapid labId switching cancels stale in-flight requests.",
      },
    ],
    review_runs: [
      {
        id: "7c9e6679-7425-40de-944b-e07fc1f90a03",
        head_sha: "8e71a44bc84c7d659a2feaa0c55ad015a3bf7741",
        status: "completed",
        risk_score: 1.4,
        merge_recommendation: "safe",
        summary:
          "Automated analysis reviewed 4 file(s) in org/lab-tracker-ui and identified 1 finding(s) (0 high, 0 medium, 1 low).",
        findings_count: 1,
        created_at: "2026-11-13T16:05:00Z",
      },
    ],
  },
];

/**
 * Computes a complete `DashboardStats` payload from a list of `PRDetail` / `PRSummary` items,
 * matching the exact Go backend `GET /api/v1/stats` schema.
 */
export function computeDashboardStatsFromPRs(
  prs: PRSummary[],
  detailsMap: Record<string, PRDetail>
): DashboardStats {
  const recommendations: Record<MergeRecommendation | string, number> = {
    safe: 0,
    caution: 0,
    block: 0,
  };
  const severities: Record<string, number> = {
    high: 0,
    medium: 0,
    low: 0,
  };
  const categories: Record<string, number> = {
    security: 0,
    bug: 0,
    performance: 0,
    maintainability: 0,
    style: 0,
  };

  let totalRisk = 0;
  let totalReviews = 0;
  let totalFindings = 0;
  const repoSet = new Set<string>(INSTITUTIONAL_REPOS);

  for (const pr of prs) {
    repoSet.add(pr.repo_full_name);
    totalRisk += pr.risk_score;
    recommendations[pr.merge_recommendation] =
      (recommendations[pr.merge_recommendation] ?? 0) + 1;

    const detail = detailsMap[pr.id];
    if (detail) {
      totalReviews += Math.max(1, detail.review_runs.length);
      for (const f of detail.findings) {
        totalFindings++;
        severities[f.severity] = (severities[f.severity] ?? 0) + 1;
        categories[f.category] = (categories[f.category] ?? 0) + 1;
      }
    } else {
      totalReviews += 1;
      totalFindings += pr.findings_count;
      severities.high += pr.high_severity_count;
    }
  }

  return {
    total_prs: prs.length,
    total_reviews: totalReviews,
    average_risk_score: prs.length > 0 ? Number((totalRisk / prs.length).toFixed(2)) : 0,
    total_findings: totalFindings,
    recommendations,
    severities,
    categories,
    repositories: Array.from(repoSet).sort(),
    recent_reviews: [
      { date: "2026-11-10", review_count: 3, avg_risk_score: 2.8 },
      { date: "2026-11-11", review_count: 5, avg_risk_score: 3.1 },
      { date: "2026-11-12", review_count: 4, avg_risk_score: 2.4 },
      {
        date: "2026-11-13",
        review_count: prs.length,
        avg_risk_score: prs.length > 0 ? Number((totalRisk / prs.length).toFixed(2)) : 2.5,
      },
    ],
  };
}
