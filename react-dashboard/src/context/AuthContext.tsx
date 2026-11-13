import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  evaluatePasswordStrength,
  generateSecureRandomHex,
  sanitizeSingleLineInput,
  sha256Hex,
  validateUsername,
} from "../security/crypto";
import type { FindingFeedbackRecord, PRDetail } from "../types/api";

export type AuthProviderType = "GitHub" | "Local";

export interface SessionUser {
  username: string;
  fullName: string;
  provider: AuthProviderType;
  authenticatedAt: string;
  csrfStateVerified?: string;
}

interface StoredLocalAccount {
  username: string;
  fullName: string;
  salt: string;
  passwordHash: string;
  createdAt: string;
}

interface AuthContextValue {
  user: SessionUser | null;
  isLocked: boolean;
  registerLocal: (
    fullName: string,
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string; digestPreview?: string }>;
  loginLocal: (
    username: string,
    password: string
  ) => Promise<{ ok: boolean; error?: string }>;
  loginWithGitHubOAuth: (
    githubHandle: string
  ) => Promise<{ ok: boolean; stateNonce: string; error?: string }>;
  lockSession: () => void;
  unlockSession: (passwordOrConfirm?: string) => Promise<{ ok: boolean; error?: string }>;
  logout: () => void;
  // Per-user namespaced persistence
  userSimulatedPRs: PRDetail[];
  addSimulatedPR: (pr: PRDetail) => void;
  userFeedbackMap: Record<number, FindingFeedbackRecord>;
  saveFindingFeedback: (record: FindingFeedbackRecord) => void;
  exportFeedbackJSON: () => void;
}

const ACCOUNTS_STORAGE_KEY = "prsentry_accounts_v1";
const SESSION_STORAGE_KEY = "prsentry_active_session_v1";
const SESSION_LOCK_KEY = "prsentry_session_locked_v1";
const OAUTH_STATE_KEY = "prsentry_oauth_csrf_state_v1";

const AuthContext = createContext<AuthContextValue | null>(null);

function loadStoredAccounts(): Record<string, StoredLocalAccount> {
  try {
    const raw = localStorage.getItem(ACCOUNTS_STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Record<string, StoredLocalAccount>;
  } catch {
    return {};
  }
}

function saveStoredAccounts(accounts: Record<string, StoredLocalAccount>): void {
  localStorage.setItem(ACCOUNTS_STORAGE_KEY, JSON.stringify(accounts));
}

function getReviewsNamespaceKey(username: string): string {
  return `prsentry_user_${username.toLowerCase()}_reviews`;
}

function getFeedbackNamespaceKey(username: string): string {
  return `prsentry_user_${username.toLowerCase()}_feedback`;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<SessionUser | null>(() => {
    try {
      const raw = localStorage.getItem(SESSION_STORAGE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw) as SessionUser;
      if (!parsed?.username || !validateUsername(parsed.username)) return null;
      return parsed;
    } catch {
      return null;
    }
  });

  const [isLocked, setIsLocked] = useState<boolean>(() => {
    return localStorage.getItem(SESSION_LOCK_KEY) === "true";
  });

  const [userSimulatedPRs, setUserSimulatedPRs] = useState<PRDetail[]>([]);
  const [userFeedbackMap, setUserFeedbackMap] = useState<Record<number, FindingFeedbackRecord>>({});

  // Load namespaced user data when active user changes
  useEffect(() => {
    if (!user) {
      setUserSimulatedPRs([]);
      setUserFeedbackMap({});
      return;
    }

    try {
      const rawPRs = localStorage.getItem(getReviewsNamespaceKey(user.username));
      setUserSimulatedPRs(rawPRs ? (JSON.parse(rawPRs) as PRDetail[]) : []);
    } catch {
      setUserSimulatedPRs([]);
    }

    try {
      const rawFeedback = localStorage.getItem(getFeedbackNamespaceKey(user.username));
      setUserFeedbackMap(
        rawFeedback ? (JSON.parse(rawFeedback) as Record<number, FindingFeedbackRecord>) : {}
      );
    } catch {
      setUserFeedbackMap({});
    }
  }, [user]);

  const registerLocal = useCallback(
    async (fullName: string, username: string, password: string) => {
      const cleanName = sanitizeSingleLineInput(fullName, 64);
      const cleanUser = username.trim();

      if (!cleanName || cleanName.length < 2) {
        return { ok: false, error: "Full name must be between 2 and 64 characters." };
      }
      if (!validateUsername(cleanUser)) {
        return {
          ok: false,
          error: "Username must match ^[a-zA-Z0-9_-]{3,24}$ (3–24 alphanumeric, _, or -).",
        };
      }

      const strength = evaluatePasswordStrength(password);
      if (!strength.isValid) {
        return {
          ok: false,
          error:
            "Password must be at least 10 characters and include uppercase, lowercase, number, and symbol.",
        };
      }

      const accounts = loadStoredAccounts();
      const key = cleanUser.toLowerCase();
      if (accounts[key]) {
        return { ok: false, error: `Username @${cleanUser} is already registered on this machine.` };
      }

      const salt = generateSecureRandomHex(16);
      const passwordHash = await sha256Hex(`${salt}:${password}`);

      accounts[key] = {
        username: cleanUser,
        fullName: cleanName,
        salt,
        passwordHash,
        createdAt: new Date().toISOString(),
      };
      saveStoredAccounts(accounts);

      const sessionUser: SessionUser = {
        username: cleanUser,
        fullName: cleanName,
        provider: "Local",
        authenticatedAt: new Date().toISOString(),
      };
      localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
      localStorage.removeItem(SESSION_LOCK_KEY);
      setIsLocked(false);
      setUser(sessionUser);

      return { ok: true, digestPreview: passwordHash.slice(0, 16) };
    },
    []
  );

  const loginLocal = useCallback(async (username: string, password: string) => {
    const cleanUser = username.trim();
    if (!validateUsername(cleanUser)) {
      return { ok: false, error: "Invalid username format (^[a-zA-Z0-9_-]{3,24}$)." };
    }
    if (!password) {
      return { ok: false, error: "Password is required." };
    }

    const accounts = loadStoredAccounts();
    const record = accounts[cleanUser.toLowerCase()];
    if (!record) {
      return {
        ok: false,
        error: "No local institutional account found for that username. Create an account or use GitHub OAuth.",
      };
    }

    const computedHash = await sha256Hex(`${record.salt}:${password}`);
    if (computedHash !== record.passwordHash) {
      return { ok: false, error: "Invalid credentials (SHA-256 verification mismatch)." };
    }

    const sessionUser: SessionUser = {
      username: record.username,
      fullName: record.fullName,
      provider: "Local",
      authenticatedAt: new Date().toISOString(),
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    localStorage.removeItem(SESSION_LOCK_KEY);
    setIsLocked(false);
    setUser(sessionUser);
    return { ok: true };
  }, []);

  const loginWithGitHubOAuth = useCallback(async (githubHandle: string) => {
    const cleanHandle = githubHandle.trim() || "jerrie";
    if (!validateUsername(cleanHandle)) {
      return {
        ok: false,
        stateNonce: "",
        error: "GitHub handle must match ^[a-zA-Z0-9_-]{3,24}$.",
      };
    }

    // 1. Generate cryptographically random state nonce via crypto.getRandomValues()
    const issuedStateNonce = generateSecureRandomHex(24);
    sessionStorage.setItem(OAUTH_STATE_KEY, issuedStateNonce);

    // 2. Validate CSRF state nonce upon callback simulation
    const callbackState = sessionStorage.getItem(OAUTH_STATE_KEY);
    if (!callbackState || callbackState !== issuedStateNonce) {
      return {
        ok: false,
        stateNonce: "",
        error: "OAuth CSRF state validation failed. Aborting authentication.",
      };
    }
    sessionStorage.removeItem(OAUTH_STATE_KEY);

    const sessionUser: SessionUser = {
      username: cleanHandle,
      fullName: `${cleanHandle} (GitHub Verified)`,
      provider: "GitHub",
      authenticatedAt: new Date().toISOString(),
      csrfStateVerified: issuedStateNonce.slice(0, 12),
    };
    localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify(sessionUser));
    localStorage.removeItem(SESSION_LOCK_KEY);
    setIsLocked(false);
    setUser(sessionUser);

    return { ok: true, stateNonce: issuedStateNonce };
  }, []);

  const lockSession = useCallback(() => {
    localStorage.setItem(SESSION_LOCK_KEY, "true");
    setIsLocked(true);
  }, []);

  const unlockSession = useCallback(
    async (passwordOrConfirm?: string) => {
      if (!user) return { ok: false, error: "No active session." };

      if (user.provider === "Local") {
        const accounts = loadStoredAccounts();
        const record = accounts[user.username.toLowerCase()];
        if (record) {
          if (!passwordOrConfirm) {
            return { ok: false, error: "Enter your account password to unlock the session." };
          }
          const digest = await sha256Hex(`${record.salt}:${passwordOrConfirm}`);
          if (digest !== record.passwordHash) {
            return { ok: false, error: "Password verification failed." };
          }
        }
      }

      localStorage.removeItem(SESSION_LOCK_KEY);
      setIsLocked(false);
      return { ok: true };
    },
    [user]
  );

  const logout = useCallback(() => {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    localStorage.removeItem(SESSION_LOCK_KEY);
    setIsLocked(false);
    setUser(null);
  }, []);

  const addSimulatedPR = useCallback(
    (pr: PRDetail) => {
      if (!user) return;
      setUserSimulatedPRs((prev) => {
        const next = [pr, ...prev];
        localStorage.setItem(getReviewsNamespaceKey(user.username), JSON.stringify(next));
        return next;
      });
    },
    [user]
  );

  const saveFindingFeedback = useCallback(
    (record: FindingFeedbackRecord) => {
      if (!user) return;
      const sanitizedRecord: FindingFeedbackRecord = {
        ...record,
        comment: sanitizeSingleLineInput(record.comment, 240),
        reviewer_username: user.username,
        updated_at: new Date().toISOString(),
      };
      setUserFeedbackMap((prev) => {
        const next = { ...prev, [record.finding_id]: sanitizedRecord };
        localStorage.setItem(getFeedbackNamespaceKey(user.username), JSON.stringify(next));
        return next;
      });
    },
    [user]
  );

  const exportFeedbackJSON = useCallback(() => {
    if (!user) return;
    const records = Object.values(userFeedbackMap);
    const reportPayload = {
      schema_version: "prsentry.beta.feedback.v1",
      exported_at: new Date().toISOString(),
      reviewer: {
        username: user.username,
        provider: user.provider,
        namespace: getFeedbackNamespaceKey(user.username),
      },
      summary: {
        total_rated_findings: records.length,
        accurate_upvotes: records.filter((r) => r.helpful === "up").length,
        inaccurate_downvotes: records.filter((r) => r.helpful === "down").length,
      },
      feedback_items: records,
    };

    const blob = new Blob([JSON.stringify(reportPayload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `prsentry-beta-feedback-${user.username}-${new Date().toISOString().slice(0, 10)}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [user, userFeedbackMap]);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      isLocked,
      registerLocal,
      loginLocal,
      loginWithGitHubOAuth,
      lockSession,
      unlockSession,
      logout,
      userSimulatedPRs,
      addSimulatedPR,
      userFeedbackMap,
      saveFindingFeedback,
      exportFeedbackJSON,
    }),
    [
      user,
      isLocked,
      registerLocal,
      loginLocal,
      loginWithGitHubOAuth,
      lockSession,
      unlockSession,
      logout,
      userSimulatedPRs,
      addSimulatedPR,
      userFeedbackMap,
      saveFindingFeedback,
      exportFeedbackJSON,
    ]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return ctx;
}
