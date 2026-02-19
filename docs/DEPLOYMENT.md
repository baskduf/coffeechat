# Deployment Guide

## Local Docker run

```bash
docker build -t coffeechat-mvp .
docker run --rm -p 4000:4000 \
  -e ADMIN_API_KEY=dev-admin-key \
  -e PORT=4000 \
  coffeechat-mvp
```

Health check:

```bash
curl http://127.0.0.1:4000/health
```

## Docker Compose

1. Create `.env` from `.env.example`
2. Start service:

```bash
docker compose up --build -d
```

3. Stop service:

```bash
docker compose down
```

Notes:
- SQLite DB is persisted in the named volume `coffeechat_db`.
- Schema is synchronized automatically on container startup via `prisma db push`.
- For production migration workflows, replace `db push` with controlled migration steps.

## Environment Variables

See `.env.example`.

Required:
- `ADMIN_API_KEY`: protects `/admin/*` endpoints.

Optional:
- `PORT` (default `4000`)
- `DATABASE_URL` (default in compose: `file:/app/prisma/dev.db`)
