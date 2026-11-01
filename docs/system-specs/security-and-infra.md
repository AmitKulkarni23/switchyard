# Security, Privacy and Infrastructure

## Bills are sensitive

- Accept only PDF and CSV, checked by content in `detect.ts` (magic bytes / headers), not by name, extension or `Content-Type`.
- Enforce a maximum upload size.
- Uploads go to a **private** Railway bucket. The object is **deleted right after parsing**, on success and on failure.
- The raw bill is never written to Postgres or logs. Only the derived `Workload` is stored.
- Never commit real bills. Test fixtures in `tests/fixtures/` are synthetic. `.gitignore` blocks `*.pdf` / `*.csv` outside fixtures.
- No secrets in the repo. `.env.example` lists every variable with no values.
- Bill text is rendered by React (escaped). Never `dangerouslySetInnerHTML`.

## Railway

- **IaC**: all configuration in `.railway/railway.ts`. `railway config plan` before every `railway config apply`. No dashboard-only changes.
- **Resources**: `web` (Bun server: API + frontend), `postgres` (share links: derived workloads only), `uploads` (private bucket, region sjc; every object deleted right after parsing).
- **Wiring**: `web` gets `DATABASE_URL` from `postgres` and `BUCKET_NAME`, `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` from `uploads` by reference. `BUCKET_REGION` is the literal `auto` (S3 signing region). Bun's S3 client must use path-style URLs against Railway's endpoint; virtual-hosted style gets AccessDenied.
- **Deploys**: pushes to `main` deploy `web`; watch patterns limit this to `src/**`, `package.json`, `bun.lock`, `tsconfig.json`, `drizzle/**`.
- **Migrations**: Drizzle migrations in `drizzle/` run at startup.
- **Start command**: `bun run src/server.ts` so SIGTERM reaches the app.
- **Healthcheck**: `/health`.
- **Template**: the project must be publishable via Project Settings → Generate Template from Project, so anyone can one-click deploy. That means no manual steps after deploy: every variable is either injected by Railway (`PORT`, `DATABASE_URL`, bucket credentials via references) or has a safe default. `OPENROUTER_API_KEY` is optional. A template that deploys from GitHub requires a public repo.

## Environment variables

| Variable | Required | Source |
|---|---|---|
| `PORT` | yes | injected by Railway |
| `DATABASE_URL` | no (share links off without it) | reference to `postgres` |
| `BUCKET_NAME`, `BUCKET_ENDPOINT`, `BUCKET_ACCESS_KEY_ID`, `BUCKET_SECRET_ACCESS_KEY` | no (uploads parsed in memory only without them) | references to `uploads` |
| `BUCKET_REGION` | no | literal `auto` |
| `LLM_FALLBACK_ENABLED` | no | default `false` |
| `OPENROUTER_API_KEY` | no | sealed variable, unused in v1 |

## API

| Route | Does |
|---|---|
| `POST /api/estimates` | multipart `file` (≤ 10 MB) → `201 { id, workload, estimate }`; `413` too large, `415` unsupported content, `422` recognised but unreadable, `400` bad request |
| `GET /api/estimates/:id` | `{ id, workload, estimate }` for a share link; `404` unknown, `503` when Postgres isn't configured |
| `GET /health` | `ok` |

Known gaps: no rate limiting on uploads; share links never expire.
