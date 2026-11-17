package api

import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"log"
	"net/http"
	"net/url"
	"strconv"
	"strings"
	"time"

	"prsentry/go-service/internal/db"
	"prsentry/go-service/internal/github"
)

const sessionCookieName = "prsentry_session"

// AuthConfig holds the GitHub App OAuth settings. The app is registered once;
// each user signs in and then installs that app on chosen repositories.
type AuthConfig struct {
	ClientID     string
	ClientSecret string
	AppSlug      string
	CallbackURL  string
	FrontendURL  string
	CookieSecure bool
}

// GitHubAuth talks to GitHub for the OAuth and installation steps.
type GitHubAuth interface {
	ExchangeOAuthCode(ctx context.Context, clientID, clientSecret, code, redirectURI string) (string, error)
	FetchAuthenticatedUser(ctx context.Context, accessToken string) (login, name, avatar string, githubUserID int64, err error)
	GetInstallationAccount(ctx context.Context, installationID int64) (string, error)
	ListInstallationRepos(ctx context.Context, installationID int64) ([]github.InstalledRepo, error)
}

type AuthHandler struct {
	store  *db.Store
	github GitHubAuth
	cfg    AuthConfig
}

func NewAuthHandler(store *db.Store, gh GitHubAuth, cfg AuthConfig) *AuthHandler {
	cfg.FrontendURL = strings.TrimRight(strings.TrimSpace(cfg.FrontendURL), "/")
	if cfg.FrontendURL == "" {
		cfg.FrontendURL = "http://localhost:5173"
	}
	return &AuthHandler{store: store, github: gh, cfg: cfg}
}

func (h *AuthHandler) Register(mux *http.ServeMux) {
	mux.HandleFunc("/api/v1/auth/github", h.Start)
	mux.HandleFunc("/api/v1/auth/github/callback", h.Callback)
	mux.HandleFunc("/api/v1/auth/github/setup", h.Setup)
	mux.HandleFunc("/api/v1/auth/me", h.Me)
	mux.HandleFunc("/api/v1/auth/logout", h.Logout)
	mux.HandleFunc("/api/auth/github", h.Start)
	mux.HandleFunc("/api/auth/github/callback", h.Callback)
	mux.HandleFunc("/api/auth/github/setup", h.Setup)
	mux.HandleFunc("/api/auth/me", h.Me)
	mux.HandleFunc("/api/auth/logout", h.Logout)
}

func (h *AuthHandler) configured() bool {
	return h.github != nil && h.store != nil &&
		h.cfg.ClientID != "" && h.cfg.ClientSecret != "" && h.cfg.CallbackURL != ""
}

// Start sends the browser to GitHub OAuth.
func (h *AuthHandler) Start(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.configured() {
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=github_not_configured", http.StatusFound)
		return
	}

	buf := make([]byte, 32)
	if _, err := rand.Read(buf); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to start github sign-in")
		return
	}
	state := hex.EncodeToString(buf)
	if err := h.store.SaveOAuthState(r.Context(), state, time.Now().Add(10*time.Minute)); err != nil {
		log.Printf("saving oauth state: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to start github sign-in")
		return
	}

	q := url.Values{}
	q.Set("client_id", h.cfg.ClientID)
	q.Set("redirect_uri", h.cfg.CallbackURL)
	q.Set("state", state)
	q.Set("allow_signup", "true")
	http.Redirect(w, r, "https://github.com/login/oauth/authorize?"+q.Encode(), http.StatusFound)
}

// Callback exchanges the OAuth code, starts a session, and sends the user to install the app.
func (h *AuthHandler) Callback(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if !h.configured() {
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=github_not_configured", http.StatusFound)
		return
	}
	if r.URL.Query().Get("error") != "" {
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=oauth_denied", http.StatusFound)
		return
	}

	state := r.URL.Query().Get("state")
	code := r.URL.Query().Get("code")
	ok, err := h.store.ConsumeOAuthState(r.Context(), state)
	if err != nil || !ok || code == "" {
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=oauth_state", http.StatusFound)
		return
	}

	token, err := h.github.ExchangeOAuthCode(r.Context(), h.cfg.ClientID, h.cfg.ClientSecret, code, h.cfg.CallbackURL)
	if err != nil {
		log.Printf("github oauth exchange: %v", err)
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=oauth_exchange", http.StatusFound)
		return
	}
	login, name, avatar, githubID, err := h.github.FetchAuthenticatedUser(r.Context(), token)
	if err != nil {
		log.Printf("github user lookup: %v", err)
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=oauth_exchange", http.StatusFound)
		return
	}
	userID, err := h.store.UpsertGitHubUser(r.Context(), db.GitHubUser{
		GithubUserID: githubID,
		Login:        login,
		DisplayName:  name,
		AvatarURL:    avatar,
	})
	if err != nil {
		log.Printf("saving github user: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to save github user")
		return
	}
	sessionID, err := h.store.CreateSession(r.Context(), userID, time.Now().Add(14*24*time.Hour))
	if err != nil {
		log.Printf("creating session: %v", err)
		writeError(w, http.StatusInternalServerError, "failed to start session")
		return
	}
	setSessionCookie(w, sessionID, h.cfg.CookieSecure, time.Now().Add(14*24*time.Hour))

	if strings.TrimSpace(h.cfg.AppSlug) == "" {
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=install_not_configured", http.StatusFound)
		return
	}
	http.Redirect(w, r, "https://github.com/apps/"+url.PathEscape(h.cfg.AppSlug)+"/installations/new", http.StatusFound)
}

// Setup receives GitHub's post-install redirect and stores the chosen repositories.
func (h *AuthHandler) Setup(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	profile, err := h.profileFromRequest(r)
	if err != nil || profile == nil {
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=session", http.StatusFound)
		return
	}
	installationID, err := strconv.ParseInt(r.URL.Query().Get("installation_id"), 10, 64)
	if err != nil || installationID <= 0 || h.github == nil {
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=install_failed", http.StatusFound)
		return
	}

	account, err := h.github.GetInstallationAccount(r.Context(), installationID)
	if err != nil || account == "" {
		log.Printf("installation account lookup: %v", err)
		account = profile.Login
	}
	repos, err := h.github.ListInstallationRepos(r.Context(), installationID)
	if err != nil {
		log.Printf("listing installation repos: %v", err)
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=install_failed", http.StatusFound)
		return
	}
	refs := make([]db.RepoRef, 0, len(repos))
	for _, repo := range repos {
		refs = append(refs, db.RepoRef{GithubRepoID: repo.ID, FullName: repo.FullName})
	}
	if err := h.store.SyncInstallation(r.Context(), account, installationID, refs, profile.UserID, "replace"); err != nil {
		log.Printf("syncing installation: %v", err)
		http.Redirect(w, r, h.cfg.FrontendURL+"/auth?error=install_failed", http.StatusFound)
		return
	}
	http.Redirect(w, r, h.cfg.FrontendURL+"/auth/complete", http.StatusFound)
}

// Me returns the signed-in GitHub user and the repositories selected at install time.
func (h *AuthHandler) Me(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodGet {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	profile, err := h.profileFromRequest(r)
	if err != nil {
		writeError(w, http.StatusInternalServerError, "failed to read session")
		return
	}
	if profile == nil {
		writeError(w, http.StatusUnauthorized, "not signed in")
		return
	}
	if profile.Repositories == nil {
		profile.Repositories = []string{}
	}
	writeJSON(w, http.StatusOK, profile)
}

// Logout clears the session cookie.
func (h *AuthHandler) Logout(w http.ResponseWriter, r *http.Request) {
	if r.Method != http.MethodPost {
		writeError(w, http.StatusMethodNotAllowed, "method not allowed")
		return
	}
	if cookie, err := r.Cookie(sessionCookieName); err == nil && h.store != nil {
		_ = h.store.DeleteSession(r.Context(), cookie.Value)
	}
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    "",
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   h.cfg.CookieSecure,
		MaxAge:   -1,
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "signed_out"})
}

func (h *AuthHandler) profileFromRequest(r *http.Request) (*db.SessionProfile, error) {
	if h.store == nil {
		return nil, nil
	}
	cookie, err := r.Cookie(sessionCookieName)
	if err != nil || strings.TrimSpace(cookie.Value) == "" {
		return nil, nil
	}
	profile, err := h.store.LookupSession(r.Context(), cookie.Value)
	if err == db.ErrNotFound {
		return nil, nil
	}
	return profile, err
}

func setSessionCookie(w http.ResponseWriter, sessionID string, secure bool, expires time.Time) {
	http.SetCookie(w, &http.Cookie{
		Name:     sessionCookieName,
		Value:    sessionID,
		Path:     "/",
		HttpOnly: true,
		SameSite: http.SameSiteLaxMode,
		Secure:   secure,
		Expires:  expires,
	})
}
