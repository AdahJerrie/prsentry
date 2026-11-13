/**
 * Exact TypeScript mirror of the Go backend's REST API contracts
 * (go-service/internal/db/store.go & api-contract.md Section 3).
 */

export type Severity = "low" | "medium" | "high";
export type Category = "bug" | "security" | "performance" | "style" | "maintainability";
export type MergeRecommendation = "safe" | "caution" | "block";
export type PRStatus = "open" | "closed" | "merged";
export type ReviewStatus = "pending" | "processing" | "completed" | "failed";

export interface PRFinding {
  id: number;
  file_path: string;
  line_number: number;
  severity: Severity;
  category: Category;
  message: string;
  /** Optional client/educational enrichment for code diff preview & remediation */
  code_snippet?: string;
  suggested_fix?: string;
}

export interface FindingFeedbackRecord {
  finding_id: number;
  pr_id: string;
  repo_full_name: string;
  pr_number: number;
  file_path: string;
  line_number: number;
  severity: Severity;
  category: Category;
  helpful: "up" | "down";
  comment: string;
  reviewer_username: string;
  updated_at: string;
}

export interface PRSummary {
  id: string;
  repo_full_name: string;
  pr_number: number;
  title: string;
  author: string;
  pr_status: PRStatus;
  latest_review_id: string;
  review_status: ReviewStatus;
  head_sha: string;
  risk_score: number;
  merge_recommendation: MergeRecommendation;
  summary: string;
  findings_count: number;
  high_severity_count: number;
  created_at: string;
}

export interface ReviewRunSummary {
  id: string;
  head_sha: string;
  status: ReviewStatus;
  risk_score: number;
  merge_recommendation: MergeRecommendation;
  summary: string;
  findings_count: number;
  created_at: string;
}

export interface PRDetail extends PRSummary {
  findings: PRFinding[];
  review_runs: ReviewRunSummary[];
}

export interface ReviewDetail {
  id: string;
  pull_request_id: string;
  repo_full_name: string;
  pr_number: number;
  pr_title: string;
  author: string;
  head_sha: string;
  status: ReviewStatus;
  summary: string;
  risk_score: number;
  merge_recommendation: MergeRecommendation;
  created_at: string;
  findings: PRFinding[];
}

export interface DailyReviewStat {
  date: string;
  review_count: number;
  avg_risk_score: number;
}

export interface DashboardStats {
  total_prs: number;
  total_reviews: number;
  average_risk_score: number;
  total_findings: number;
  recommendations: Record<MergeRecommendation | string, number>;
  severities: Record<Severity | string, number>;
  categories: Record<Category | string, number>;
  repositories: string[];
  recent_reviews: DailyReviewStat[];
}

export interface PRListFilters {
  repo?: string;
  status?: string;
  recommendation?: string;
  limit?: number;
}
