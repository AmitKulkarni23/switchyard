# SwitchYard

Upload a bill from any cloud, see what it costs on Railway.

**Status:** work in progress.

## How it works

```
upload (PDF/CSV) ─▶ detect ─▶ adapter (→ FOCUS) ─▶ normalize (→ Workload) ─▶ pricer (Railway) ─▶ compare ─▶ results
```

All math is done in code. No LLM, no API key needed.

Formats: AWS invoice PDF, AWS Cost and Usage Report CSV (1.0 and 2.0), FOCUS CSV. Destination: Railway.

## API

```bash
curl -F file=@tests/fixtures/aws-invoice.pdf http://localhost:3000/api/estimates   # → { id, workload, estimate }
curl http://localhost:3000/api/estimates/<id>                                       # share link
```

## Run locally

```bash
bun install
cp .env.example .env   # every variable is optional locally
bun run dev
bun test
```

Fixtures in `tests/fixtures/` are synthetic; regenerate with `bun run tests/fixtures/make-fixtures.ts`.

## Deploy

One-click Railway template: coming soon.

Overview, alternatives considered and known problems: coming soon.
