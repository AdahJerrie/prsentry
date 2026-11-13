package api

import (
	"crypto/subtle"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// SecurityMiddlewareConfig configures CORS, optional dashboard auth, and rate limiting.
type SecurityMiddlewareConfig struct {
	AllowedOrigins  []string
	DashboardAPIKey string
	RequestsPerMin  int
}

type clientBucket struct {
	tokens     float64
	lastRefill time.Time
}

type ipRateLimiter struct {
	mu      sync.Mutex
	buckets map[string]*clientBucket
	rate    float64 // tokens per second
	burst   float64
}

func newIPRateLimiter(requestsPerMin int) *ipRateLimiter {
	if requestsPerMin <= 0 {
		requestsPerMin = 120
	}
	return &ipRateLimiter{
		buckets: make(map[string]*clientBucket),
		rate:    float64(requestsPerMin) / 60.0,
		burst:   float64(requestsPerMin),
	}
}

func (rl *ipRateLimiter) allow(ip string) bool {
	now := time.Now()
	rl.mu.Lock()
	defer rl.mu.Unlock()

	// Opportunistically prune stale entries when map grows large
	if len(rl.buckets) > 4096 {
		for k, v := range rl.buckets {
			if now.Sub(v.lastRefill) > 5*time.Minute {
				delete(rl.buckets, k)
			}
		}
	}

	b, ok := rl.buckets[ip]
	if !ok {
		rl.buckets[ip] = &clientBucket{tokens: rl.burst - 1, lastRefill: now}
		return true
	}

	elapsed := now.Sub(b.lastRefill).Seconds()
	b.tokens += elapsed * rl.rate
	if b.tokens > rl.burst {
		b.tokens = rl.burst
	}
	b.lastRefill = now

	if b.tokens < 1.0 {
		return false
	}
	b.tokens -= 1.0
	return true
}

func clientIP(r *http.Request) string {
	host, _, err := net.SplitHostPort(r.RemoteAddr)
	if err != nil {
		return r.RemoteAddr
	}
	return host
}

// WrapWithSecurity adds defensive HTTP headers, origin-allowlisted CORS,
// per-IP rate limiting, and optional Bearer token verification on /api/* routes.
func WrapWithSecurity(next http.Handler, cfg SecurityMiddlewareConfig) http.Handler {
	allowed := make(map[string]struct{}, len(cfg.AllowedOrigins))
	for _, origin := range cfg.AllowedOrigins {
		trimmed := strings.TrimSpace(origin)
		if trimmed != "" {
			allowed[trimmed] = struct{}{}
		}
	}

	limiter := newIPRateLimiter(cfg.RequestsPerMin)
	expectedBearer := ""
	if strings.TrimSpace(cfg.DashboardAPIKey) != "" {
		expectedBearer = "Bearer " + strings.TrimSpace(cfg.DashboardAPIKey)
	}

	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("X-Content-Type-Options", "nosniff")
		w.Header().Set("X-Frame-Options", "DENY")
		w.Header().Set("Referrer-Policy", "strict-origin-when-cross-origin")

		origin := r.Header.Get("Origin")
		if origin != "" {
			if _, ok := allowed[origin]; ok {
				w.Header().Set("Access-Control-Allow-Origin", origin)
				w.Header().Set("Vary", "Origin")
				w.Header().Set("Access-Control-Allow-Methods", "GET, POST, OPTIONS")
				w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")
				w.Header().Set("Access-Control-Max-Age", "600")
			}
		}

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}

		if r.URL.Path != "/health" && !limiter.allow(clientIP(r)) {
			writeError(w, http.StatusTooManyRequests, "rate limit exceeded")
			return
		}

		if expectedBearer != "" && strings.HasPrefix(r.URL.Path, "/api/") {
			authHeader := r.Header.Get("Authorization")
			if len(authHeader) != len(expectedBearer) ||
				subtle.ConstantTimeCompare([]byte(authHeader), []byte(expectedBearer)) != 1 {
				writeError(w, http.StatusUnauthorized, "unauthorized")
				return
			}
		}

		next.ServeHTTP(w, r)
	})
}
