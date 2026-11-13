import { useEffect, useState, type FormEvent } from "react";
import { Link, useNavigate } from "react-router-dom";
import Badge from "../components/Badge";
import { useAuth } from "../context/AuthContext";
import {
  evaluatePasswordStrength,
  sha256Hex,
  validateUsername,
} from "../security/crypto";

type AuthTab = "signin" | "register";

export default function AuthGate() {
  const navigate = useNavigate();
  const {
    user,
    isLocked,
    loginLocal,
    registerLocal,
    loginWithGitHubOAuth,
    unlockSession,
    logout,
  } = useAuth();

  const [activeTab, setActiveTab] = useState<AuthTab>("signin");
  const [githubHandle, setGithubHandle] = useState("jerrie");
  const [oauthStatus, setOauthStatus] = useState<string | null>(null);

  // Local form state
  const [fullName, setFullName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [liveDigestPreview, setLiveDigestPreview] = useState<string>("");

  // Unlock state
  const [unlockPassword, setUnlockPassword] = useState("");

  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const strength = evaluatePasswordStrength(password);

  // Compute live Web Crypto SHA-256 preview during registration
  useEffect(() => {
    let active = true;
    if (!password) {
      setLiveDigestPreview("");
      return;
    }
    sha256Hex(password)
      .then((hex) => {
        if (active) setLiveDigestPreview(hex.slice(0, 24));
      })
      .catch(() => {
        if (active) setLiveDigestPreview("");
      });
    return () => {
      active = false;
    };
  }, [password]);

  async function handleGitHubContinue() {
    setError(null);
    setSubmitting(true);
    setOauthStatus("Generating 192-bit CSRF state nonce via crypto.getRandomValues()...");
    try {
      const result = await loginWithGitHubOAuth(githubHandle);
      if (!result.ok) {
        setOauthStatus(null);
        setError(result.error ?? "GitHub OAuth failed.");
        return;
      }
      setOauthStatus(`CSRF state ${result.stateNonce.slice(0, 12)}... verified. Redirecting...`);
      navigate("/dashboard", { replace: true });
    } finally {
      setSubmitting(false);
    }
  }

  async function handleLocalSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      if (activeTab === "register") {
        const res = await registerLocal(fullName, username, password);
        if (!res.ok) {
          setError(res.error ?? "Registration failed.");
          return;
        }
        navigate("/dashboard", { replace: true });
      } else {
        const res = await loginLocal(username, password);
        if (!res.ok) {
          setError(res.error ?? "Login failed.");
          return;
        }
        navigate("/dashboard", { replace: true });
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function handleUnlockSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    const res = await unlockSession(unlockPassword);
    if (!res.ok) {
      setError(res.error ?? "Failed to unlock session.");
      return;
    }
    navigate("/dashboard", { replace: true });
  }

  const strengthColors = [
    "bg-white/10",
    "bg-[#F87171]",
    "bg-[#F87171]",
    "bg-[#FFB224]",
    "bg-[#FFB224]",
    "bg-[#34D399]",
  ];

  return (
    <div className="studio-canvas min-h-screen text-text-primary flex flex-col justify-between p-4 sm:p-6 relative">
      <div className="studio-noise-overlay" aria-hidden="true" />

      {/* Top Back Bar */}
      <header className="relative z-10 mx-auto flex w-full max-w-5xl items-center justify-between py-2">
        <Link
          to="/"
          className="inline-flex items-center gap-2 font-mono text-xs text-text-secondary hover:text-[#7C8AFF] transition-colors"
        >
          <span>← Back to Overview</span>
        </Link>

        <div className="flex items-center gap-2 font-mono text-xs">
          <span className="text-[#FFB224]">◈</span>
          <span className="font-semibold">PRSentry</span>
          <span className="rounded border border-white/[0.1] bg-[#141820] px-1.5 py-0.5 text-[10px] text-text-muted">
            v1.0-beta
          </span>
        </div>
      </header>

      {/* Centered Elevated #141820 Auth Card */}
      <main className="relative z-10 my-auto mx-auto w-full max-w-md py-8">
        <div className="studio-panel rounded-lg p-6 sm:p-7 space-y-6">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] uppercase tracking-wider text-[#FFB224]">
                INSTITUTIONAL AUTH GATE
              </span>
              <Badge variant="safe">SHA-256 + CSRF</Badge>
            </div>
            <h1 className="font-mono text-xl font-bold text-text-primary">
              {user && isLocked
                ? `Session Locked (@${user.username})`
                : "Authenticate to PRSentry"}
            </h1>
            <p className="text-xs text-text-secondary leading-relaxed">
              Sessions are isolated per student handle (<code className="font-mono">prsentry_user_*</code>)
              so shared lab machines never leak reviews or grading feedback.
            </p>
          </div>

          {/* If already logged in and unlocked, offer instant continuation */}
          {user && !isLocked && (
            <div className="rounded-md border border-[#34D399]/35 bg-[#34D399]/10 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-[#34D399]">Active Session: @{user.username}</span>
                <Badge variant="open">{user.provider}</Badge>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => navigate("/dashboard")}
                  className="flex-1 rounded-md bg-[#34D399] px-3 py-2 font-mono text-xs font-semibold text-[#0E1116] hover:bg-[#34D399]/90 cursor-pointer"
                >
                  Continue to Dashboard →
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-xs text-text-secondary hover:text-text-primary cursor-pointer"
                >
                  Switch User
                </button>
              </div>
            </div>
          )}

          {/* If session is locked */}
          {user && isLocked ? (
            <form onSubmit={(e) => void handleUnlockSubmit(e)} className="space-y-4">
              {user.provider === "Local" ? (
                <div className="space-y-1.5">
                  <label
                    htmlFor="unlock-password"
                    className="block font-mono text-xs text-text-secondary"
                  >
                    Password for @{user.username}
                  </label>
                  <input
                    id="unlock-password"
                    type="password"
                    value={unlockPassword}
                    onChange={(e) => setUnlockPassword(e.target.value)}
                    placeholder="Enter your password to unlock"
                    className="w-full rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-xs text-text-primary focus:border-[#7C8AFF] focus:outline-none"
                  />
                </div>
              ) : (
                <p className="font-mono text-xs text-text-secondary">
                  GitHub OAuth session for <span className="text-text-primary">@{user.username}</span>{" "}
                  is currently locked.
                </p>
              )}

              {error && (
                <div className="rounded border border-[#F87171]/40 bg-[#F87171]/10 p-2.5 font-mono text-xs text-[#F87171]">
                  {error}
                </div>
              )}

              <div className="flex items-center gap-2">
                <button
                  type="submit"
                  className="flex-1 rounded-md bg-[#7C8AFF] px-4 py-2 font-mono text-xs font-semibold text-[#0E1116] hover:bg-[#7C8AFF]/90 cursor-pointer"
                >
                  Unlock Session →
                </button>
                <button
                  type="button"
                  onClick={logout}
                  className="rounded-md border border-white/[0.12] bg-[#0E1116] px-3 py-2 font-mono text-xs text-[#F87171] hover:border-[#F87171]/40 cursor-pointer"
                >
                  Log Out
                </button>
              </div>
            </form>
          ) : (
            <>
              {/* Primary OAuth Option: Continue with GitHub */}
              <div className="space-y-2.5 rounded-md border border-white/[0.08] bg-[#0E1116]/70 p-4">
                <div className="flex items-center justify-between">
                  <label
                    htmlFor="github-handle"
                    className="font-mono text-xs font-medium text-text-primary"
                  >
                    GitHub OAuth Handle
                  </label>
                  <span className="font-mono text-[10px] text-[#34D399]">
                    CSRF state nonce enabled
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs text-text-muted">@</span>
                  <input
                    id="github-handle"
                    type="text"
                    value={githubHandle}
                    onChange={(e) => setGithubHandle(e.target.value)}
                    placeholder="jerrie"
                    maxLength={24}
                    className="flex-1 rounded border border-white/[0.1] bg-[#141820] px-2.5 py-1.5 font-mono text-xs text-text-primary focus:border-[#7C8AFF] focus:outline-none"
                  />
                </div>

                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => void handleGitHubContinue()}
                  className="
                    w-full flex items-center justify-center gap-2 rounded-md
                    bg-[#E6EDF3] px-4 py-2.5 font-mono text-xs font-semibold text-[#0E1116]
                    hover:bg-white focus:outline-none focus:ring-2 focus:ring-[#7C8AFF]
                    transition-colors cursor-pointer disabled:opacity-50
                  "
                >
                  <span>◈ Continue with GitHub</span>
                </button>

                {oauthStatus && (
                  <p className="font-mono text-[11px] text-[#34D399]">{oauthStatus}</p>
                )}
              </div>

              <div className="relative flex items-center py-1">
                <div className="flex-grow border-t border-white/[0.08]" />
                <span className="mx-3 shrink-0 font-mono text-[10px] uppercase tracking-wider text-text-muted">
                  OR INSTITUTIONAL LOCAL ACCOUNT
                </span>
                <div className="flex-grow border-t border-white/[0.08]" />
              </div>

              {/* Tabbed Toggle: Sign In vs Create Account */}
              <div className="grid grid-cols-2 rounded-md border border-white/[0.08] bg-[#0E1116] p-1 font-mono text-xs">
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("signin");
                    setError(null);
                  }}
                  className={`rounded py-1.5 font-medium transition-colors cursor-pointer ${
                    activeTab === "signin"
                      ? "bg-[#1B202B] text-text-primary border border-white/[0.1]"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Sign In
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab("register");
                    setError(null);
                  }}
                  className={`rounded py-1.5 font-medium transition-colors cursor-pointer ${
                    activeTab === "register"
                      ? "bg-[#1B202B] text-text-primary border border-white/[0.1]"
                      : "text-text-secondary hover:text-text-primary"
                  }`}
                >
                  Create Account
                </button>
              </div>

              {/* Local Account Form */}
              <form onSubmit={(e) => void handleLocalSubmit(e)} className="space-y-4" noValidate>
                {activeTab === "register" && (
                  <div className="space-y-1.5">
                    <label
                      htmlFor="local-fullname"
                      className="block font-mono text-xs text-text-secondary"
                    >
                      Full Name
                    </label>
                    <input
                      id="local-fullname"
                      type="text"
                      required
                      maxLength={64}
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Jerrie Obiajulu"
                      className="w-full rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-2 text-sm text-text-primary placeholder:text-text-muted focus:border-[#7C8AFF] focus:outline-none"
                    />
                  </div>
                )}

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="local-username"
                      className="block font-mono text-xs text-text-secondary"
                    >
                      Username
                    </label>
                    <span className="font-mono text-[10px] text-text-muted">
                      ^[a-zA-Z0-9_-]&#123;3,24&#125;$
                    </span>
                  </div>
                  <input
                    id="local-username"
                    type="text"
                    required
                    maxLength={24}
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="jerrie"
                    className={`w-full rounded-md border bg-[#0E1116] px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:outline-none ${
                      username && !validateUsername(username)
                        ? "border-[#F87171]"
                        : "border-white/[0.1] focus:border-[#7C8AFF]"
                    }`}
                  />
                </div>

                <div className="space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label
                      htmlFor="local-password"
                      className="block font-mono text-xs text-text-secondary"
                    >
                      Password
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      className="font-mono text-[11px] text-[#7C8AFF] hover:underline cursor-pointer"
                    >
                      {showPassword ? "Hide" : "Show"}
                    </button>
                  </div>
                  <input
                    id="local-password"
                    type={showPassword ? "text" : "password"}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder={
                      activeTab === "register"
                        ? "Min 10 chars, A-Z, a-z, 0-9, symbol"
                        : "Enter your password"
                    }
                    className="w-full rounded-md border border-white/[0.1] bg-[#0E1116] px-3 py-2 font-mono text-xs text-text-primary placeholder:text-text-muted focus:border-[#7C8AFF] focus:outline-none"
                  />
                </div>

                {/* Live Password Strength Meter & Web Crypto SHA-256 Digest on Registration */}
                {activeTab === "register" && (
                  <div className="rounded-md border border-white/[0.08] bg-[#0E1116]/80 p-3 space-y-2.5">
                    <div className="flex items-center justify-between font-mono text-[11px]">
                      <span className="text-text-secondary">Password Policy Strength</span>
                      <span
                        className={
                          strength.isValid
                            ? "text-[#34D399]"
                            : strength.score >= 3
                              ? "text-[#FFB224]"
                              : "text-[#F87171]"
                        }
                      >
                        {strength.label} ({strength.score}/5)
                      </span>
                    </div>

                    <div className="grid grid-cols-5 gap-1.5">
                      {[1, 2, 3, 4, 5].map((bar) => (
                        <div
                          key={bar}
                          className={`h-1.5 rounded-full transition-colors ${
                            strength.score >= bar
                              ? strengthColors[strength.score]
                              : "bg-white/[0.08]"
                          }`}
                        />
                      ))}
                    </div>

                    <ul className="grid grid-cols-2 gap-1 font-mono text-[10px] text-text-muted">
                      <li className={strength.checks.minLength ? "text-[#34D399]" : ""}>
                        {strength.checks.minLength ? "✓" : "○"} 10+ characters
                      </li>
                      <li className={strength.checks.hasUpper ? "text-[#34D399]" : ""}>
                        {strength.checks.hasUpper ? "✓" : "○"} Uppercase (A-Z)
                      </li>
                      <li className={strength.checks.hasLower ? "text-[#34D399]" : ""}>
                        {strength.checks.hasLower ? "✓" : "○"} Lowercase (a-z)
                      </li>
                      <li className={strength.checks.hasNumber ? "text-[#34D399]" : ""}>
                        {strength.checks.hasNumber ? "✓" : "○"} Number (0-9)
                      </li>
                      <li className={strength.checks.hasSymbol ? "text-[#34D399]" : ""}>
                        {strength.checks.hasSymbol ? "✓" : "○"} Symbol (!@#$...)
                      </li>
                    </ul>

                    {liveDigestPreview && (
                      <div className="pt-1.5 border-t border-white/[0.06] font-mono text-[10px] text-text-muted truncate">
                        Web Crypto SHA-256: <span className="text-[#7C8AFF]">{liveDigestPreview}…</span>
                      </div>
                    )}
                  </div>
                )}

                {error && (
                  <div
                    role="alert"
                    className="rounded-md border border-[#F87171]/40 bg-[#F87171]/10 p-3 font-mono text-xs text-[#F87171]"
                  >
                    {error}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={submitting}
                  className="
                    w-full rounded-md bg-[#7C8AFF] px-4 py-2.5
                    font-mono text-xs font-semibold text-[#0E1116]
                    hover:bg-[#7C8AFF]/90 focus:outline-none focus:ring-2 focus:ring-[#7C8AFF]
                    transition-colors cursor-pointer disabled:opacity-50
                  "
                >
                  {activeTab === "register"
                    ? "Create Institutional Account & Open Dashboard →"
                    : "Sign In to Dashboard →"}
                </button>
              </form>
            </>
          )}
        </div>
      </main>

      <footer className="relative z-10 mx-auto w-full max-w-5xl text-center font-mono text-[11px] text-text-muted py-2">
        Credentials hashed client-side via <code className="text-text-secondary">crypto.subtle.digest(&apos;SHA-256&apos;)</code> · Zero plaintext storage
      </footer>
    </div>
  );
}
