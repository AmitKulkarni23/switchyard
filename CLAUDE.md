# SwitchYard

Upload a bill from any cloud, see what it costs on Railway. A user uploads a cloud bill (AWS first) and the app re-prices that workload on Railway, showing current cost versus Railway cost, what provider-only overhead disappears and what has no Railway equivalent. Deployed on Railway and published as a one-click Railway template.

## What It Does

Upload (PDF or CSV) → detect the format from file content → convert to FOCUS rows → normalize into a Workload IR (one row per component) → price on the destination (Railway by default) → compare → results page. Utilization is not in the bill, so the Railway estimate is a range (low/high utilization), narrowed by an optional "how busy are your servers?" slider. "Must keep" services are toggles that recompute the estimate.

## Design Principles

- **Laziest correct solution**: build only what the current task needs.
- **Code does all math**: no LLM in v1. Parsing is deterministic. An OpenRouter LLM fallback hook for unparsed lines exists as an interface only, disabled and unimplemented. The app works fully without an API key.
- **Pluggable destinations**: Railway first. AWS, GCP, Azure, Supabase are later pricer modules behind the same `price(workload, assumptions)` signature.
- **Pluggable sources**: one adapter per input format, all producing FOCUS rows.
- **Zero required questions**: defaults produce a result; inputs only narrow it.
- **Bills are sensitive**: delete uploads right after parsing.

## Tech Stack

- **Runtime**: Bun (install, scripts, server, frontend bundling)
- **Backend**: `Bun.serve` HTTP server, TypeScript
- **Frontend**: React + Material UI, bundled by Bun's HTML imports (no Vite, no Next.js)
- **Schemas**: Zod in `backend/schema/`
- **Database**: Postgres + Drizzle ORM
- **Uploads**: private Railway bucket, object deleted after parsing
- **Hosting**: Railway, published as a template (Project Settings → Generate Template from Project)
- **Infrastructure as Code**: Railway IaC in `.railway/railway.ts` (not `railway.json`)

## Folder Structure

```
switchyard/
├── .railway/
│   └── railway.ts            # Railway IaC: switchyard (app), postgres, uploads bucket
├── backend/
│   ├── server.ts             # Bun.serve: /, /health, /api/estimates
│   ├── api.ts                # upload + share-link handlers
│   ├── pipeline.ts           # detect → adapter → normalize
│   ├── detect.ts             # identify format from content (magic bytes, provider text, CSV headers)
│   ├── adapters/             # one per input format → FocusRow[]
│   ├── normalize.ts          # FocusRow[] → Workload (catalog lookup + mapping table)
│   ├── pricers/              # railway.ts, aws.ts; index.ts: registry
│   ├── design/               # idea path: parts, starter designs, rules.md prompt, panel (cheap pair + tie-breaker), consensus
│   ├── compare.ts            # current vs destination, ranges, disappears / no-equivalent lists
│   ├── llm/fallback.ts       # OpenRouter hook, disabled, unimplemented
│   ├── schema/               # Zod: FocusRow, Component, Workload, Assumptions, Estimate
│   ├── db/                   # Drizzle schema + share-link store
│   └── data/
│       ├── mapping.ts        # source service + engine → category + per-destination target
│       ├── catalog/          # instance type → vCPU/RAM
│       └── price-books/      # railway.yaml: rates from railway.com/pricing and Railway docs
├── frontend/
│   ├── index.html
│   ├── app.tsx               # entry: describe an idea or drop a file
│   ├── workspace.tsx         # Split Workspace: what you told us | Railway vs AWS, recomputed in the browser
│   └── results.tsx, theme.ts # shared marks, masthead, MUI theme
├── drizzle/                  # generated SQL migrations, applied at startup
├── tests/                    # bun test; fixtures/ are synthetic bills only, never real ones
├── docs/
│   ├── system-specs/         # architecture, security/infra, UI brief
│   └── task-specs/           # one spec per task, TASK_INDEX.md lists them in order
├── package.json
├── .env.example
├── PRODUCT.md                # product context for /impeccable
├── CLAUDE.md
└── README.md
```

## Environment Variables

See `.env.example`. Secrets (`DATABASE_URL`, bucket credentials, `OPENROUTER_API_KEY`) are Railway variables, never in Git, `.railway/railway.ts` or chat. `PORT` is injected by Railway.

## Commands

```bash
bun install
bun run dev        # local server with hot reload
bun run typecheck
bun test
```

```bash
railway config plan    # preview infra changes
railway config apply   # apply them
railway up             # deploy
```

## Security Model

- Accept only PDF and CSV, checked by content, not file name or extension.
- Uploads go to a private bucket; the object is deleted right after parsing, success or failure.
- Never commit real bills. Test fixtures are synthetic.
- No secrets in the repo. `.env.example` lists every variable.
- Render bill content as text (React escaping). Never use `dangerouslySetInnerHTML`.

## Reliability

- Start command is `bun run backend/server.ts` (not `bun run start`) so SIGTERM reaches the app.
- `/health` returns 200 when the server is up.
- Validate env vars at startup and fail with a clear log line.
- Unknown file formats return a clear "unsupported format" error, never a guess.

## Infrastructure as Code

All Railway configuration lives in `.railway/railway.ts` — no ClickOps after the first setup.

- **Deploy**: `railway config plan` before every `railway config apply`.
- **Never** change service settings in the Railway dashboard without updating `.railway/railway.ts`.

## Browser Automation

**Do not run any browser automation (playwright-cli or claude-in-chrome) unless the user explicitly asks for it.** Verify changes with type-check and tests, and let the user check the UI.

When the user does ask, use the `/playwright-cli` skill (screenshots, clicking, form filling). Never use claude-in-chrome MCP tools.

## Specs and Tasks

- **Architecture**: `docs/system-specs/`. Read before any backend or infra change and keep it current.
- **Tasks**: `docs/task-specs/TASK_INDEX.md` lists every task in order. Work on the first task that is not struck through and whose dependencies are done; follow its spec exactly.
- **When a task is done** (all acceptance criteria met), strike its line through in `docs/task-specs/TASK_INDEX.md` (`~~...~~`) and commit that with the task's last change.
- Steps marked **asks the user** / **requires user approval** in a spec are hard stops: ask and wait.

## Git Conventions

- Commit messages must be at most 2 sentences/phrases long.
- Commit and push to GitHub after each meaningful file or logical unit of work is complete.
