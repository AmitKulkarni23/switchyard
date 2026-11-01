# SwitchYard

Upload a bill from any cloud, see what it costs on Railway.

**Status:** work in progress.

## How it works

```
upload (PDF/CSV) ─▶ detect ─▶ adapter (→ FOCUS) ─▶ normalize (→ Workload) ─▶ pricer (Railway) ─▶ compare ─▶ results
```

All math is done in code. No LLM, no API key needed.

## Run locally

```bash
bun install
cp .env.example .env
bun run dev
```

## Deploy

One-click Railway template: coming soon.

Overview, alternatives considered and known problems: coming soon.
