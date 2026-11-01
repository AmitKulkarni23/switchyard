# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Primary: engineers and founders evaluating a move.** A developer or CTO on a small team running on AWS, privately checking whether moving to Railway would save money before making the case internally. They come with a real bill and a sceptical eye, and they will check the numbers.
- **Secondary: Railway sales and solutions staff.** They run a prospect's bill through the same tool during or after a call to show the comparison. Same flow, same results page; no separate mode.

## Product Purpose

Upload a bill from any cloud, see what it costs on Railway. SwitchYard re-prices the workload in an uploaded cloud bill (AWS first) on Railway and shows current cost against Railway cost, what provider-only overhead disappears, and what has no Railway equivalent. Success: the user leaves with a number they believe, knows which parts of their stack come along and which do not, and can explain the result to someone else.

## Positioning

A deterministic re-pricer, not an estimate generator. Every figure is computed in code from the bill's own lines, a published price book and stated assumptions. No LLM in v1. Railway bills actual usage, not provisioned capacity, so SwitchYard shows a range (low/high utilization) rather than one false-precision number.

## Operating Context

- Input: an AWS invoice PDF or cost export CSV (Cost and Usage Report, FOCUS). The format is detected from content, never from the file name.
- Pipeline: upload → detect → adapter (to FOCUS) → normalize (to a Workload, one row per component) → pricer → compare → results.
- The bill does not contain utilization. There are zero required questions: the default is a range; an optional "How busy are your servers?" slider narrows it. On the results page, "must keep" services are toggles that recompute the estimate.
- Results include line items per component, a "what disappears" list with savings, and a "no equivalent" list (SQS, DynamoDB, ...).
- Railway is the default destination. Other destinations (AWS, GCP, Azure, Supabase) and other source clouds are later additions; the UI must not hardcode Railway as the only destination.
- Deployed on Railway and published as a one-click Railway template.

## Capabilities and Constraints

- Stack: Bun, React + Material UI, Zod, Postgres + Drizzle. Railway IaC in `.railway/railway.ts`.
- Accepts only PDF and CSV. An unknown format gets a clear "unsupported format" error, never a guess.
- Lines that can't be parsed are shown as "not priced", never silently dropped.
- The optional OpenRouter LLM fallback is unimplemented and disabled. The app works fully without an API key.
- Rates come from `backend/data/price-books/railway.yaml`, sourced from railway.com/pricing and the Railway docs.

## Brand Commitments

- Name: SwitchYard. Tagline: "Upload a bill from any cloud, see what it costs on Railway."
- **Independent and unofficial.** Railway is named as the destination, but SwitchYard does not use Railway's logo, brand assets or visual identity, and does not imply endorsement.

## Evidence on Hand

- The user has sample AWS bills (synthetic or anonymized) for fixtures and a demo. Path not yet provided. Real customer bills are never committed.
- No testimonials, customers, savings benchmarks or case studies exist. Do not invent them.

## Product Principles

1. **Show the math.** Every number traces back to a bill line, a rate and an assumption the user can see.
2. **Privacy is visible.** Say plainly, where the user decides to upload, that the bill is deleted right after parsing and is never sent to an LLM.
3. **Honest about gaps.** "No equivalent" services and the utilization uncertainty are prominent, even when they weaken the savings story.
4. **Zero required questions.** Defaults always produce a result; inputs only narrow it.
5. **Ranges over false precision.** When the bill can't tell us something, show the range and say why.
