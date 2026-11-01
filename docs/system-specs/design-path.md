# Design Path: from an idea to a price on every provider

Status: proposed, not built. Builds on the Workload IR in `architecture.md`.

## Why

The bill path answers "what would my running system cost elsewhere?". This path answers the question before anything exists: "what would my idea cost on each provider?". People who haven't built yet have no bill, so we start from a description.

## One entry screen, three ways in (no chat)

```
┌──────────────────────────────────────────────────────────────┐
│  What would it cost to run?                                  │
│  ┌────────────────────────────────────────────────────────┐  │
│  │ Describe your idea…                                    │  │  ← text: design path (LLM)
│  │                                                        │  │
│  └────────────────────────────────────────────────────────┘  │
│  or drop a file: AWS bill (PDF/CSV) · CloudFormation ·       │  ← file: detected by content
│  Terraform plan · docker-compose                    [Choose] │     (no LLM)
└──────────────────────────────────────────────────────────────┘
                 │                          │
                 ▼                          ▼
          draft design                 Workload (from file)
                 └────────────┬─────────────┘
                              ▼
              Review: editable parts + assumptions
                              ▼
             Results: every provider side by side
```

- A text box and a drop zone on the same screen. Typing means "idea"; dropping a file means "bill or template". The file kind is detected from content (`backend/detect.ts`), never the name.
- **Not a chat.** The result is a structured, editable table that people share and re-run. A chat transcript hides that state, can't be edited in place, and gives a different conversation every time. The LLM's questions (at most three) appear as inline multiple-choice fields on the review step, not as chat turns.
- Every input lands on the same **review step** (the parts list with sizes and assumptions, all editable) and the same **results page**. Bill uploads skip to results as today, with the review available as "Edit the workload".

## Flow for a text input

Worked example: *"A booking app for dental clinics. About 500 clinics. Patients book appointments online, we text them a reminder the day before, and clinic staff have an admin dashboard."*

1. **Browser** sends `POST /api/designs { description, numbers? }`. Optional numbers: users, requests/day, data size.
2. **Backend → LLM (OpenRouter).** The prompt is the rulebook (below) plus five or six worked examples. The model must return JSON matching the `DesignDraft` Zod schema. It may only pick parts from the fixed menu and size tiers; it never names a provider product.
   ```
   parts:
     web-service     why: "patients book online", "admin dashboard"
     relational-db   why: bookings, clinics, patients
     scheduled-job   why: "text them a reminder the day before"  (daily)
   assumptions:
     bookings_per_clinic_per_day: 20    (assumed)
     data_gb_after_one_year: 2          (assumed)
   questions:
     "Is traffic mostly during business hours, or steady all day?"
   ```
3. **Backend validates** with Zod. On failure, retry once with the validation error; then fail with a clear message. Unknown part types are rejected, not mapped.
4. **Review (browser).** The user answers the questions, edits assumptions (20 → 40 bookings), adds or removes parts.
5. **Code sizes it** into a `Workload`, the same format bills produce:
   ```
   500 clinics × 40 bookings     = 20,000 bookings/day
   × ~10 page loads per booking  = 200,000 requests/day
   × ~50 KB per page             ≈ 300 GB/month egress
   business hours only           → busy ~10 h/day
   web service (small tier)      → 1 vCPU / 1 GB
   ```
6. **Every pricer** realizes the logical parts in its own products and prices them. Choices like Lambda vs containers are made here by arithmetic on the traffic shape, never by the LLM.
7. **Results:** each provider as a range (wider than a bill's), what disappears per provider, and which assumption moves the total most.

## Logical parts (the LLM's only vocabulary)

| Part | Cost drivers it carries |
|---|---|
| `web-service` | requests/day, traffic shape (steady, business-hours, spiky, mostly-idle), size tier |
| `background-worker` | jobs/day, job duration, size tier |
| `scheduled-job` | runs/day, duration |
| `relational-db` | data GB, size tier |
| `key-value-store` | reads/day, writes/day, data GB |
| `queue` | messages/day |
| `object-storage` | stored GB, GB served/month |
| `cache` | memory GB |

Counts of tables, functions or buckets are not modelled: providers bill on usage and storage, and the parts carry usage.

Size tiers map to resources in code: `small` 1 vCPU / 1 GB, `medium` 2 / 4, `large` 4 / 16.

## Rulebook (versioned prompt, `backend/design/rules.md`)

- Start from the simplest design that fits: one `web-service` and one `relational-db`.
- Add a `background-worker` or `queue` only when the text mentions async or long-running work; a `cache` only for read-heavy load or tight latency; `object-storage` only for files, images or uploads; a `scheduled-job` for anything periodic.
- Every part quotes the sentence that justifies it (`why`).
- Every number not given by the user is an assumption with a default and the label "assumed".
- Ask at most three questions, multiple choice, only about what moves cost most: traffic volume, traffic shape, data size, background work.
- Never name a provider or product.

## Per-provider realization (deterministic, in each pricer)

| Part | AWS | Railway |
|---|---|---|
| `web-service` | Lambda + API Gateway **or** ECS Fargate + ALB: price both, show the cheaper and the crossover | service |
| `relational-db` | RDS | Postgres |
| `key-value-store` | DynamoDB on-demand | Redis or Postgres | Firestore |
| `queue` | SQS | worker + Redis, or "no equivalent" | Pub/Sub |
| `object-storage` | S3 | bucket |
| required overhead | NAT gateway for private subnets, ALB | none |

The table is a starting point; each pricer task fills and verifies its column against published rates.

## Destinations

Railway and AWS only for now. AWS is priced "right-sized" for the same workload, so the comparison separates "you were over-provisioned" from "Railway is cheaper".

## LLM configuration: cheap pair first, tie-breaker on disagreement

`POST /api/designs` (`backend/design/panel.ts`), through OpenRouter (`OPENROUTER_API_KEY`):

```
idea ─┬─▶ z-ai/glm-5.3 ───────────┐  in parallel
      └─▶ deepseek/deepseek-v4-flash ┘
                 │
        code: compareDrafts()  ── agree ──▶ merge (2/2)
                 │ disagree, or one failed
                 ▼
        openai/gpt-6.1-sol drafts independently (never sees the other drafts)
                 │
        code: mergeDrafts() per-field majority (2 of 3); no majority → unticked suggestion
```

| Model | $ per 1M in / out (2026-11-01) | ≈ $ per draft |
|---|---|---|
| `z-ai/glm-5.3` | 0.08 / 3.60 | 0.005 |
| `deepseek/deepseek-v4-flash` | 0.09 / 0.18 | 0.001 |
| `openai/gpt-6.1-sol` (only on disagreement) | 2.00 / 10.00 | 0.023 |

About $0.006 per idea when the pair agrees, $0.03 when it escalates. Models are config: `DESIGN_PRIMARY_MODELS`, `DESIGN_TIEBREAK_MODEL`.

- **Agreement is checked in code**: same set of part types, same tier on sized parts, same traffic shape, numbers within 2×. Free text (`why`, question wording) is never compared. Questions are topics from a fixed list; code supplies each topic's answer options.
- Each call: strict JSON schema (`DesignDraft`), temperature 0, 20 s timeout, one retry with the validation error, `provider.require_parameters` so OpenRouter only routes to providers that honour the schema.
- A failed or timed-out cheap model counts as disagreement. Fewer than 2 valid drafts → 502 with a clear message and the starter picker.
- **Stateless**: no memory between requests. Postgres stores only a cache (`design_drafts`, keyed by idea + rulebook version + models), so the same idea never costs twice and always gets the same answer, and records whether it escalated.
- Rate limit: 10 drafts per IP per hour (in memory, per replica).
- Measure the agreement rate with `bun run tests/design-eval.ts` (12 ideas, ~$0.10). If most ideas escalate, tighten `backend/design/rules.md` before loosening the check.

### Why not Temporal

The panel is four parallel HTTP calls that finish in seconds, inside one request: `Promise.allSettled` with per-model timeouts and one retry covers it. Temporal would add a server (or Temporal Cloud), a worker process and a second deploy for no durable state worth keeping. Revisit when there is a long-running, multi-step job that must survive restarts, e.g. scheduled re-pricing of saved estimates when price books change, or batch processing of very large cost exports.
- Only the idea text is sent. Bills and templates never go to an LLM.
- The saved draft is pinned to its share link, so a link always shows the same numbers.
- Rate-limited per IP; the endpoint returns 429 with a retry time.

## Without an API key

The text box is replaced by a picker of starter designs (web app + Postgres; API + worker + queue; static site + functions; …) that land on the same review step. The app stays fully usable with no key.

## Files and templates (no LLM)

- **CloudFormation** (YAML/JSON with `AWSTemplateFormatVersion` or `Resources` of `AWS::` types), **Terraform plan JSON** (`terraform show -json`), **docker-compose**: deterministic adapters that map resources to logical parts, then the same review step. Templates have no usage, so traffic and data assumptions come from the review step.

## Quality

- `tests/design/`: ~20 example descriptions with expected parts. Run on every rulebook or model change; a part list that drifts fails the test.
- The schema, sizing and pricing are unit-tested without the LLM by feeding fixed `DesignDraft` JSON.

## Open questions

- Per-request spend ceiling and rate limit (proposed: $0.10 per draft, 10 drafts per IP per hour).
