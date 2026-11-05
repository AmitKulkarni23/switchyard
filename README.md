# SwitchYard

See what a workload would cost on Railway before you migrate.

**Live:** https://switchyard.up.railway.app

**Status:** early proof of concept. Independent; not affiliated with Railway or Amazon Web Services.

## What it does

- **Upload an AWS invoice PDF.** See your AWS bill next to what the same workload would cost on Railway, part by part, including what disappears and what has no equivalent.
- **Or describe what you're building.** Get a sketch of the parts it needs, priced on both Railway and AWS. Every part and number can be edited.
- **Share a result.** Idea links hold the design in the URL, so nothing is stored. Bill links are saved in Postgres.

## How it works

```
AWS invoice PDF ─▶ detect ─▶ adapter (→ FOCUS rows) ─▶ normalize (→ Workload) ─┐
                                                                               ├─▶ pricers ─▶ compare ─▶ results
idea text ─▶ LLM panel ─▶ consensus ─▶ editable design ─▶ Workload ────────────┘
```

Code does all the math. Bills never go to an LLM. The idea box sends only its text through OpenRouter, and the models only pick parts and guess usage numbers. They never set a price. Without an API key, the idea box offers starter designs instead.

## How far to trust the numbers

These are estimates, not quotes.

- **AWS today** comes from the amounts on your bill.
- **Railway** rates come from `backend/data/price-books/railway.yaml`, copied from Railway's pricing page.
- **AWS rates for ideas** come from `aws.yaml`. `bun run prices` checks most of them against AWS's public price list and regenerates the instance sizes. A few are checked by hand, as noted in that file.
- **Server usage is assumed.** A bill shows what ran and for how long, not how busy it was, so fixed-size servers are priced as a range you can narrow with a slider. The page says which parts come from your bill and which are still estimated.
- **Not yet compared with real Railway invoices.**

## Run locally

```bash
bun install
cp .env.example .env   # every variable is optional locally
bun run dev
bun test
```

Fixtures in `tests/fixtures/` are synthetic; regenerate them with `bun run tests/fixtures/make-fixtures.ts`. Never commit real bills.

## API

```bash
curl -F file=@tests/fixtures/aws-invoice.pdf http://localhost:3000/api/estimates   # → { id, workload, estimate }
curl http://localhost:3000/api/estimates/<id>                                       # saved bill result
```

## Security

Uploaded files are deleted right after parsing and parsed in a separate process with a 10-second limit and no access to the app's secrets. Uploads and idea drafts are rate limited. See `docs/system-specs/security-and-infra.md` for details and known gaps.

## Deploy

Runs on Railway, with infrastructure defined in `.railway/railway.ts`. A one-click Railway template is under consideration.

## What's next

- More providers: GCP, Azure and Supabase
- More inputs: CSV and FOCUS reports (the parsers exist, but are switched off until tested on real exports)

## License

[MIT](LICENSE)
