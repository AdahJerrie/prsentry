package main

import (
	"log"
	"net/http"
	"os"

	"github.com/joho/godotenv"

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

	ghClient, err := github.NewClient(appID, privateKeyPEM)
	if err != nil {
		log.Fatalf("creating GitHub client: %v", err)
	}

	reviewClient := review.NewClient(pythonServiceURL)

	http.HandleFunc("/webhook", webhook.NewHandler(secret, ghClient, reviewClient))

	log.Println("Server listening on :8080")
	if err := http.ListenAndServe(":8080", nil); err != nil {
		log.Fatal(err)
	}
}