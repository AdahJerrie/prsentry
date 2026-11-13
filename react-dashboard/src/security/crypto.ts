/**
 * PRSentry Security-First Utilities
 * - Web Crypto SHA-256 credential hashing (zero plaintext password storage)
 * - Cryptographically random OAuth CSRF state nonce generation
 * - Strict input validation & text sanitization
 */

export const USERNAME_REGEX = /^[a-zA-Z0-9_-]{3,24}$/;
export const REPO_FULL_NAME_REGEX = /^[a-zA-Z0-9_.-]{1,64}\/[a-zA-Z0-9_.-]{1,64}$/;

export interface PasswordStrengthResult {
  score: 0 | 1 | 2 | 3 | 4 | 5;
  label: "Too Short" | "Weak" | "Fair" | "Good" | "Strong" | "Institutional Grade";
  isValid: boolean;
  checks: {
    minLength: boolean;
    hasUpper: boolean;
    hasLower: boolean;
    hasNumber: boolean;
    hasSymbol: boolean;
  };
}

/**
 * Evaluates password strength against institutional security policy:
 * Minimum 10 characters, uppercase, lowercase, number, and symbol.
 */
export function evaluatePasswordStrength(password: string): PasswordStrengthResult {
  const checks = {
    minLength: password.length >= 10,
    hasUpper: /[A-Z]/.test(password),
    hasLower: /[a-z]/.test(password),
    hasNumber: /[0-9]/.test(password),
    hasSymbol: /[^A-Za-z0-9]/.test(password),
  };

  const passedCount = Object.values(checks).filter(Boolean).length as 0 | 1 | 2 | 3 | 4 | 5;
  const isValid =
    checks.minLength &&
    checks.hasUpper &&
    checks.hasLower &&
    checks.hasNumber &&
    checks.hasSymbol;

  const labels: Record<0 | 1 | 2 | 3 | 4 | 5, PasswordStrengthResult["label"]> = {
    0: "Too Short",
    1: "Weak",
    2: "Fair",
    3: "Good",
    4: "Strong",
    5: "Institutional Grade",
  };

  return {
    score: passedCount,
    label: labels[passedCount],
    isValid,
    checks,
  };
}

/**
 * Computes a hex-encoded SHA-256 digest using the browser's native Web Crypto API.
 */
export async function sha256Hex(input: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(input);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Generates a cryptographically random hex token (used for OAuth CSRF state nonces & per-user salts).
 */
export function generateSecureRandomHex(byteLength = 16): string {
  const bytes = new Uint8Array(byteLength);
  window.crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Validates username against strict allowlist regex ^[a-zA-Z0-9_-]{3,24}$
 */
export function validateUsername(username: string): boolean {
  return USERNAME_REGEX.test(username.trim());
}

/**
 * Sanitizes single-line user input by stripping control characters and enforcing max length.
 * React escapes text nodes by default; this adds defense-in-depth before persistence/export.
 */
export function sanitizeSingleLineInput(raw: string, maxLength = 240): string {
  return raw
    .replace(/[\u0000-\u001F\u007F]/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, maxLength);
}

/**
 * Validates that a repository identifier is safe and matches owner/name format.
 */
export function isSafeRepoFullName(repo: string): boolean {
  return REPO_FULL_NAME_REGEX.test(repo.trim());
}
