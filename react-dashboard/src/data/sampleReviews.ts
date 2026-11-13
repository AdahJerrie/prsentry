import type { Category, MergeRecommendation, PRFinding, PRSummary, Severity } from "../types/api";

/** Local teaching fields. The Go API does not return these. */
export interface TeachingNote {
  code_snippet: string;
  suggested_fix: string;
}

export interface ReviewFinding extends PRFinding {
  teaching?: TeachingNote;
}

export interface QueueItem extends PRSummary {
  simulated?: boolean;
  findings?: ReviewFinding[];
}

const DEMO_REPOS = [
  "campus/campus-portal-api",
  "campus/student-auth-go",
  "campus/lab-tracker-ui",
] as const;

export const DEMO_REPO_OPTIONS = ["All Repos", ...DEMO_REPOS] as const;

function finding(
  id: number,
  filePath: string,
  line: number,
  severity: Severity,
  category: Category,
  message: string,
  teaching?: TeachingNote,
): ReviewFinding {
  return {
    id,
    file_path: filePath,
    line_number: line,
    severity,
    category,
    message,
    teaching,
  };
}

export const SAMPLE_REVIEWS: QueueItem[] = [
  {
    id: "sample-campus-portal",
    repo_full_name: "campus/campus-portal-api",
    pr_number: 18,
    title: "Add course enrollment endpoint",
    author: "ada",
    pr_status: "open",
    latest_review_id: "sample-run-portal",
    review_status: "completed",
    head_sha: "a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2",
    risk_score: 4.0,
    merge_recommendation: "block",
    summary:
      "Enrollment writes a SQL string with the student id spliced in. That can change the query itself. Read the error from the database call before returning success.",
    findings_count: 2,
    high_severity_count: 1,
    created_at: "2026-11-12T09:24:00.000Z",
    simulated: true,
    findings: [
      finding(
        1,
        "internal/enroll/handler.go",
        42,
        "high",
        "security",
        "The student id is concatenated into SQL. A value like a quote can change which rows the query touches. Pass it as a placeholder instead.",
        {
          code_snippet: `query := "SELECT id FROM students WHERE sid='" + sid + "'"
row := db.QueryRow(query)`,
          suggested_fix: `row := db.QueryRow("SELECT id FROM students WHERE sid=$1", sid)`,
        },
      ),
      finding(
        2,
        "internal/enroll/handler.go",
        57,
        "medium",
        "bug",
        "The error from Exec is ignored, so a failed insert still looks successful to the caller.",
        {
          code_snippet: `db.Exec("INSERT INTO enrollments(sid, course) VALUES ($1, $2)", sid, course)
return c.JSON(200, map[string]string{"status": "ok"})`,
          suggested_fix: `if _, err := db.Exec("INSERT INTO enrollments(sid, course) VALUES ($1, $2)", sid, course); err != nil {
    return c.JSON(500, map[string]string{"error": "could not enroll"})
}`,
        },
      ),
    ],
  },
  {
    id: "sample-student-auth",
    repo_full_name: "campus/student-auth-go",
    pr_number: 7,
    title: "Cache session tokens in memory",
    author: "kwame",
    pr_status: "open",
    latest_review_id: "sample-run-auth",
    review_status: "completed",
    head_sha: "b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3",
    risk_score: 3.0,
    merge_recommendation: "caution",
    summary:
      "The session helper is readable, but a long-lived token is written into source. Move it to the environment and keep the in-memory map behind a mutex if more than one request can use it.",
    findings_count: 2,
    high_severity_count: 0,
    created_at: "2026-11-11T16:05:00.000Z",
    simulated: true,
    findings: [
      finding(
        3,
        "internal/session/token.go",
        11,
        "medium",
        "security",
        "A session secret is committed in source. Anyone who can read the repo can forge a session. Read it from the environment at startup.",
        {
          code_snippet: `const sessionSecret = "campus-session-secret-2026"`,
          suggested_fix: `sessionSecret := os.Getenv("SESSION_SECRET")
if sessionSecret == "" {
    log.Fatal("SESSION_SECRET is not set")
}`,
        },
      ),
      finding(
        4,
        "internal/session/cache.go",
        19,
        "low",
        "maintainability",
        "sessions is a plain map used from request handlers. Two requests can write it at once. Guard it with a mutex, or document that it is single-threaded.",
        {
          code_snippet: `var sessions = map[string]string{}

func Save(id, token string) { sessions[id] = token }`,
          suggested_fix: `var (
    sessions = map[string]string{}
    mu       sync.Mutex
)

func Save(id, token string) {
    mu.Lock()
    defer mu.Unlock()
    sessions[id] = token
}`,
        },
      ),
    ],
  },
  {
    id: "sample-lab-tracker",
    repo_full_name: "campus/lab-tracker-ui",
    pr_number: 31,
    title: "Show lab booking times in local format",
    author: "nkechi",
    pr_status: "open",
    latest_review_id: "sample-run-lab",
    review_status: "completed",
    head_sha: "c3d4e5f6a1b2c3d4e5f6a1b2c3d4e5f6a1b2c3d4",
    risk_score: 1.5,
    merge_recommendation: "safe",
    summary:
      "The booking list formats dates in a way other students can read. One name is vague. No security or correctness issues were flagged.",
    findings_count: 1,
    high_severity_count: 0,
    created_at: "2026-11-10T11:40:00.000Z",
    simulated: true,
    findings: [
      finding(
        5,
        "src/components/BookingList.tsx",
        14,
        "low",
        "style",
        "The variable d does not say that it is a booking time. A name like bookedAt is easier to follow when you return to this file.",
        {
          code_snippet: `const d = new Date(booking.startsAt)`,
          suggested_fix: `const bookedAt = new Date(booking.startsAt)`,
        },
      ),
    ],
  },
];

let simCounter = 40;

export function createSimulatedReview(): QueueItem {
  simCounter += 1;
  const repo = DEMO_REPOS[simCounter % DEMO_REPOS.length];
  const recommendation: MergeRecommendation = simCounter % 3 === 0 ? "caution" : "safe";
  const risk = recommendation === "caution" ? 3.0 : 2.0;
  return {
    id: `sim-${simCounter}`,
    repo_full_name: repo,
    pr_number: simCounter,
    title: "Handle empty lab notes on submit",
    author: "beta-student",
    pr_status: "open",
    latest_review_id: `sim-run-${simCounter}`,
    review_status: "completed",
    head_sha: `${simCounter.toString(16).padStart(7, "0")}cafebabe`,
    risk_score: risk,
    merge_recommendation: recommendation,
    summary:
      "Simulated webhook review. The submit handler treats a blank note as a successful save. Check the trimmed value and tell the student what to fix.",
    findings_count: 1,
    high_severity_count: 0,
    created_at: new Date().toISOString(),
    simulated: true,
    findings: [
      finding(
        simCounter,
        "src/pages/SubmitNote.tsx",
        28,
        recommendation === "caution" ? "medium" : "low",
        "bug",
        "An empty note still takes the success path. Trim the text and stop when nothing is left, so the student sees why the save did not happen.",
        {
          code_snippet: `await saveNote(note)
setStatus("Saved")`,
          suggested_fix: `const text = note.trim()
if (!text) {
  setStatus("Write a note before saving")
  return
}
await saveNote(text)
setStatus("Saved")`,
        },
      ),
    ],
  };
}
