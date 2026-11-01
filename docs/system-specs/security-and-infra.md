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
- **Services**: `web` (Bun server serving API + frontend). Postgres and a private bucket are added when their tasks land.
- **Start command**: `bun run src/server.ts` so SIGTERM reaches the app.
- **Healthcheck**: `/health`.
- **Template**: the project must be publishable via Project Settings → Generate Template from Project, so anyone can one-click deploy. That means no manual steps after deploy: every variable is either injected by Railway (`PORT`, `DATABASE_URL`, bucket credentials via references) or has a safe default. `OPENROUTER_API_KEY` is optional. A template that deploys from GitHub requires a public repo.

## Environment variables

| Variable | Required | Source |
|---|---|---|
| `PORT` | yes | injected by Railway |
| `DATABASE_URL` | when Postgres lands | reference to the Postgres service |
| `BUCKET_*` | when uploads land | reference to the bucket |
| `LLM_FALLBACK_ENABLED` | no | default `false` |
| `OPENROUTER_API_KEY` | no | sealed variable, unused in v1 |
