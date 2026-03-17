# Deployment

This guide covers deploying LyraNote to a production server using the included Docker Compose production configuration.

## Architecture Overview

A production LyraNote deployment consists of:

| Service | Description |
|---|---|
| `nginx` | Reverse proxy, SSL termination, static file serving |
| `web` | Next.js frontend (SSR) |
| `api` | FastAPI backend |
| `postgres` | PostgreSQL 16 with pgvector extension |
| `redis` | Task queue and caching |
| `minio` | S3-compatible object storage for file uploads |
| `celery` | Background task worker |
| `celery-beat` | Periodic task scheduler (scheduled tasks) |

## Prerequisites

- A Linux server with Docker and Docker Compose v2 installed
- A domain name pointed to your server's IP
- Ports `80` and `443` open in your firewall

## Step 1: Clone and Configure

```bash
git clone https://github.com/LinMoQC/LyraNote.git
cd LyraNote
cp api/.env.example api/.env
cp web/.env.example web/.env.local
```

Edit `api/.env` with your production values:

```bash
OPENAI_API_KEY=sk-...
SECRET_KEY=<generate a long random string>
DATABASE_URL=postgresql+asyncpg://lyra:yourpassword@postgres:5432/lyranote
REDIS_URL=redis://redis:6379/0

# Storage (MinIO by default, or switch to S3/OSS/R2)
STORAGE_BACKEND=minio
STORAGE_S3_ENDPOINT_URL=http://minio:9000
STORAGE_S3_BUCKET=lyranote
STORAGE_S3_ACCESS_KEY=minioadmin
STORAGE_S3_SECRET_KEY=<secure password>

# Optional features
TAVILY_API_KEY=tvly-...       # Deep Research web search
SMTP_HOST=smtp.gmail.com      # Scheduled task email delivery
SMTP_PORT=587
SMTP_USER=your@gmail.com
SMTP_PASSWORD=your-app-password
```

Edit `web/.env.local`:

```bash
NEXT_PUBLIC_API_URL=https://yourdomain.com/api
```

## Step 2: Configure Nginx

Edit `nginx.prod.conf` and replace `yourdomain.com` with your actual domain.

## Step 3: Set Up SSL

LyraNote's Nginx config expects certificates at:
- `/etc/letsencrypt/live/yourdomain.com/fullchain.pem`
- `/etc/letsencrypt/live/yourdomain.com/privkey.pem`

Get a free Let's Encrypt certificate:

```bash
sudo apt install certbot
sudo certbot certonly --standalone -d yourdomain.com
```

## Step 4: Start Production Services

```bash
docker compose -f docker-compose.prod.yml up -d
```

## Step 5: Run Database Migrations

```bash
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

## Updating

```bash
git pull
docker compose -f docker-compose.prod.yml build
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml exec api alembic upgrade head
```

## Storage Options

LyraNote supports multiple file storage backends. Switch backends by changing `STORAGE_BACKEND` in `api/.env`:

| Backend | `STORAGE_BACKEND` value | Notes |
|---|---|---|
| Local filesystem | `local` | Good for single-server setups |
| MinIO (self-hosted) | `minio` | S3-compatible, included in Docker Compose |
| AWS S3 | `s3` | Set `STORAGE_S3_BUCKET`, `ACCESS_KEY`, etc. |
| Alibaba Cloud OSS | `oss` | Set `STORAGE_S3_ENDPOINT_URL` to OSS endpoint |
| Cloudflare R2 | `r2` | Set `STORAGE_S3_ENDPOINT_URL` to R2 endpoint |

## Monitoring

View logs for any service:

```bash
docker compose -f docker-compose.prod.yml logs -f api
docker compose -f docker-compose.prod.yml logs -f celery
```

## Backup

Back up the PostgreSQL database periodically:

```bash
docker compose -f docker-compose.prod.yml exec postgres \
  pg_dump -U lyra lyranote > backup_$(date +%Y%m%d).sql
```

For file storage, back up the MinIO data volume or configure replication on your S3-compatible provider.
