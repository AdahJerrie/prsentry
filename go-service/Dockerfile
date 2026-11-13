FROM golang:1.25-alpine AS builder

WORKDIR /src
COPY go.mod go.sum ./
RUN go mod download

COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -trimpath -ldflags="-s -w" -o /out/prsentry-server ./cmd/server

FROM alpine:3.21

RUN apk add --no-cache ca-certificates wget \
    && adduser -D -u 10001 prsentry

WORKDIR /app
COPY --from=builder /out/prsentry-server /app/prsentry-server

USER prsentry
EXPOSE 8080

ENTRYPOINT ["/app/prsentry-server"]
