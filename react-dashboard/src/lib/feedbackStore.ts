const STORAGE_KEY = "prsentry.beta-feedback.v1";

export interface BetaFeedbackEntry {
  pr_id: string;
  repo_full_name: string;
  pr_number: number;
  finding_id: number;
  file_path: string;
  line_number: number;
  severity: string;
  category: string;
  helpful: boolean;
  comment: string;
  submitted_at: string;
}

function canUseStorage(): boolean {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function loadFeedback(): BetaFeedbackEntry[] {
  if (!canUseStorage()) return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is BetaFeedbackEntry => {
      if (!item || typeof item !== "object") return false;
      const entry = item as Partial<BetaFeedbackEntry>;
      return typeof entry.pr_id === "string" && typeof entry.finding_id === "number";
    });
  } catch {
    return [];
  }
}

export function upsertFeedback(entry: BetaFeedbackEntry): BetaFeedbackEntry[] {
  const next = loadFeedback().filter(
    (item) => !(item.pr_id === entry.pr_id && item.finding_id === entry.finding_id),
  );
  next.push(entry);
  if (canUseStorage()) {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }
  return next;
}

export function downloadFeedback(entries: BetaFeedbackEntry[]): void {
  const blob = new Blob([JSON.stringify(entries, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "prsentry-beta-feedback.json";
  link.click();
  URL.revokeObjectURL(url);
}
