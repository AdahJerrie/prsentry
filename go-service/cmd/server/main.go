package main

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"os"
	"os/signal"
	"strings"
	"syscall"
	"time"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"prsentry/go-service/internal/api"
	"prsentry/go-service/internal/db"
	"prsentry/go-service/internal/github"
	"prsentry/go-service/internal/review"
	"prsentry/go-service/internal/webhook"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on environment variables")
	}

	secret := os.Getenv("GITHUB_WEBHOOK_SECRET")
	if secret == "" {
		log.Fatal("GITHUB_WEBHOOK_SECRET is not set")
	}

	appID := os.Getenv("GITHUB_APP_ID")
	if appID == "" {
		log.Fatal("GITHUB_APP_ID is not set")
	}

	privateKeyPEM, err := loadGitHubPrivateKey(
		os.Getenv("GITHUB_APP_PRIVATE_KEY"),
		os.Getenv("GITHUB_APP_PRIVATE_KEY_PATH"),
	)
	if err != nil {
		log.Fatalf("loading GitHub App private key: %v", err)
	}

	pythonServiceURL := os.Getenv("PYTHON_SERVICE_URL")
	if pythonServiceURL == "" {
		log.Fatal("PYTHON_SERVICE_URL is not set")
	}

	internalAuthToken := os.Getenv("INTERNAL_AUTH_TOKEN")
	if internalAuthToken == "" {
		log.Fatal("INTERNAL_AUTH_TOKEN is not set")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	envMode := strings.ToLower(strings.TrimSpace(os.Getenv("ENVIRONMENT")))

	poolConfig, err := pgxpool.ParseConfig(dbURL)
	if err != nil {
		log.Fatalf("Unable to parse DB config: %v", err)
	}

	if envMode == "production" {
		if strings.Contains(dbURL, "sslmode=disable") || poolConfig.ConnConfig.TLSConfig == nil {
			log.Fatal("SECURITY ERROR: DATABASE_URL must enforce TLS (e.g. sslmode=require) when ENVIRONMENT=production.")
		}
	}

	poolConfig.MaxConns = 25
	poolConfig.MinConns = 2
	poolConfig.MaxConnIdleTime = 5 * time.Minute

	pool, err := pgxpool.NewWithConfig(context.Background(), poolConfig)
	if err != nil {
		log.Fatalf("Unable to create database pool: %v", err)
	}
	defer pool.Close()

	pingCtx, pingCancel := context.WithTimeout(context.Background(), 5*time.Second)
	if err := pool.Ping(pingCtx); err != nil {
		pingCancel()
		log.Fatalf("Unable to reach PostgreSQL database: %v", err)
	}
	pingCancel()

	store := db.NewStore(pool)

	ghClient, err := github.NewClient(appID, privateKeyPEM)
	if err != nil {
		log.Fatalf("creating GitHub client: %v", err)
	}

	reviewClient := review.NewClient(pythonServiceURL, internalAuthToken)

	mux := http.NewServeMux()
	mux.HandleFunc("/webhook", webhook.NewHandler(secret, ghClient, reviewClient, store))

	apiHandler := api.NewAPIHandler(store)
	apiHandler.RegisterRoutes(mux)

	rawOrigins := os.Getenv("ALLOWED_ORIGINS")
	if rawOrigins == "" && envMode != "production" {
		rawOrigins = "http://localhost:5173,http://127.0.0.1:5173,http://localhost:3000"
	}
	var allowedOrigins []string
	if rawOrigins != "" {
		allowedOrigins = strings.Split(rawOrigins, ",")
	}

	securedHandler := api.WrapWithSecurity(mux, api.SecurityMiddlewareConfig{
		AllowedOrigins:  allowedOrigins,
		DashboardAPIKey: os.Getenv("DASHBOARD_API_KEY"),
		RequestsPerMin:  120,
	})

	port := strings.TrimSpace(os.Getenv("PORT"))
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           securedHandler,
		ReadHeaderTimeout: 5 * time.Second,
		ReadTimeout:       15 * time.Second,
		WriteTimeout:      30 * time.Second,
		IdleTimeout:       60 * time.Second,
		MaxHeaderBytes:    1 << 20,
	}

	shutdownErr := make(chan error, 1)
	go func() {
		sigCh := make(chan os.Signal, 1)
		signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
		<-sigCh
		log.Println("Shutting down server gracefully...")
		ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
		defer cancel()
		shutdownErr <- srv.Shutdown(ctx)
	}()

	log.Printf("PRSentry Go server listening on :%s\n", port)
	if err := srv.ListenAndServe(); err != nil && !errors.Is(err, http.ErrServerClosed) {
		log.Fatal(err)
	}
	if err := <-shutdownErr; err != nil {
		log.Printf("Graceful shutdown error: %v\n", err)
	}
}

func loadGitHubPrivateKey(inlinePEM, keyPath string) ([]byte, error) {
	if trimmed := strings.TrimSpace(inlinePEM); trimmed != "" {
		return []byte(strings.ReplaceAll(trimmed, `\n`, "\n")), nil
	}
	if trimmedPath := strings.TrimSpace(keyPath); trimmedPath != "" {
		data, err := os.ReadFile(trimmedPath)
		if err != nil {
			return nil, fmt.Errorf("reading %s: %w", trimmedPath, err)
		}
		return data, nil
	}
	return nil, errors.New("neither GITHUB_APP_PRIVATE_KEY nor GITHUB_APP_PRIVATE_KEY_PATH is set")
}
