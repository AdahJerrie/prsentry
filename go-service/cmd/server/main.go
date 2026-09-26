package main

import (
	"context"
	"log"
	"net/http"
	"os"

	"github.com/jackc/pgx/v5/pgxpool"
	"github.com/joho/godotenv"

	"prsentry/go-service/internal/db" // The package sqlc just generated
	"prsentry/go-service/internal/github"
	"prsentry/go-service/internal/review"
	"prsentry/go-service/internal/webhook"
)

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found, relying on real environment variables")
	}

	secret := os.Getenv("GITHUB_WEBHOOK_SECRET")
	if secret == "" {
		log.Fatal("GITHUB_WEBHOOK_SECRET is not set")
	}

	appID := os.Getenv("GITHUB_APP_ID")
	if appID == "" {
		log.Fatal("GITHUB_APP_ID is not set")
	}

	keyPath := os.Getenv("GITHUB_APP_PRIVATE_KEY_PATH")
	if keyPath == "" {
		log.Fatal("GITHUB_APP_PRIVATE_KEY_PATH is not set")
	}
	privateKeyPEM, err := os.ReadFile(keyPath)
	if err != nil {
		log.Fatalf("reading private key file: %v", err)
	}

	pythonServiceURL := os.Getenv("PYTHON_SERVICE_URL")
	if pythonServiceURL == "" {
		log.Fatal("PYTHON_SERVICE_URL is not set")
	}

	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		log.Fatal("DATABASE_URL is not set")
	}

	// 1. Create a concurrent connection pool to Postgres
	pool, err := pgxpool.New(context.Background(), dbURL)
	if err != nil {
		log.Fatalf("Unable to connect to database: %v", err)
	}
	defer pool.Close()

	// 2. Wrap the pool in the sqlc-generated Queries struct
	queries := db.New(pool)

	ghClient, err := github.NewClient(appID, privateKeyPEM) //[cite: 1]
	if err != nil {
		log.Fatalf("creating GitHub client: %v", err)
	}

	reviewClient := review.NewClient(pythonServiceURL) //[cite: 1]

	// 3. Pass 'queries' into your handler so it can save data
	http.HandleFunc("/webhook", webhook.NewHandler(secret, ghClient, reviewClient, queries))

	log.Println("Server listening on :8080")                  //[cite: 1]
	if err := http.ListenAndServe(":8080", nil); err != nil { //[cite: 1]
		log.Fatal(err) //[cite: 1]
	}
}
