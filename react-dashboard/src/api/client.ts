import type {
  DashboardStats,
  PRDetail,
  PRFinding,
  PRListFilters,
  PRSummary,
  ReviewDetail,
} from "../types/api";

const RAW_BASE = (import.meta.env.VITE_API_BASE_URL as string | undefined) || "/api/v1";
const API_BASE = RAW_BASE.replace(/\/+$/, "");
const API_KEY = (import.meta.env.VITE_DASHBOARD_API_KEY as string | undefined)?.trim();

async function request<T>(path: string, signal?: AbortSignal): Promise<T> {
  const headers: Record<string, string> = {
    Accept: "application/json",
  };
  if (API_KEY) {
    headers.Authorization = `Bearer ${API_KEY}`;
  }

  const response = await fetch(`${API_BASE}${path}`, {
    method: "GET",
    headers,
    signal,
  });

  if (!response.ok) {
    let detail = `HTTP ${response.status}`;
    try {
      const errJson = (await response.json()) as { error?: string };
      if (errJson?.error) {
        detail = errJson.error;
      }
    } catch {
      // Fallback to HTTP status code when body isn't JSON
    }
    throw new Error(detail);
  }

  return (await response.json()) as T;
}

export function fetchPRs(filters: PRListFilters = {}, signal?: AbortSignal): Promise<PRSummary[]> {
  const params = new URLSearchParams();
  if (filters.repo) params.set("repo", filters.repo);
  if (filters.status) params.set("status", filters.status);
  if (filters.recommendation) params.set("recommendation", filters.recommendation);
  if (filters.limit) params.set("limit", String(filters.limit));

  const qs = params.toString();
  return request<PRSummary[]>(`/prs${qs ? `?${qs}` : ""}`, signal);
}

export function fetchPRDetail(prId: string, signal?: AbortSignal): Promise<PRDetail> {
  return request<PRDetail>(`/prs/${encodeURIComponent(prId)}`, signal);
}

export function fetchPRFindings(prId: string, signal?: AbortSignal): Promise<PRFinding[]> {
  return request<PRFinding[]>(`/prs/${encodeURIComponent(prId)}/findings`, signal);
}

export function fetchReviewDetail(reviewId: string, signal?: AbortSignal): Promise<ReviewDetail> {
  return request<ReviewDetail>(`/reviews/${encodeURIComponent(reviewId)}`, signal);
}

export function fetchDashboardStats(signal?: AbortSignal): Promise<DashboardStats> {
  return request<DashboardStats>("/stats", signal);
}
