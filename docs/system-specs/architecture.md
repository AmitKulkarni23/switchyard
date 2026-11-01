# Architecture

## Product

Upload a bill from any cloud, see what it costs on Railway.

A user uploads a cloud bill (AWS first). The app re-prices that workload on a destination (Railway by default) and shows:

- current cost vs destination cost, as a range (low/high utilization)
- per-component line items
- **what disappears**: provider-only overhead with no cost on the destination (NAT gateway, load balancer hours, data transfer between AZs, ...), with the saving
- **no equivalent**: services the destination does not offer (SQS, DynamoDB, ...), listed so the user knows they must keep or replace them

## Core principle

- Code does all math. No LLM in v1.
- Parsing is deterministic.
- An optional LLM fallback hook (OpenRouter, via `OPENROUTER_API_KEY`) for unparsed lines is designed as an interface in `backend/llm/fallback.ts` but left **unimplemented and disabled** (`LLM_FALLBACK_ENABLED=false`). The app must work fully without an API key. Unparsed lines are shown to the user as "not priced", never silently dropped.

## Pipeline

```
upload ─▶ detect ─▶ adapter ─▶ normalize ─▶ pricer ─▶ compare ─▶ results
          format    FocusRow[]  Workload     Estimate   Result
```

### 1. `backend/detect.ts`

Identifies the input format from **file content, never the file name or extension**:

- PDF magic bytes (`%PDF-`)
- provider text inside the PDF (e.g. "Amazon Web Services")
- distinctive CSV header columns (e.g. AWS CUR `lineItem/UsageAccountId`, FOCUS `BilledCost`, `ServiceName`)

Returns a format id (e.g. `aws-invoice-pdf`, `aws-cur-csv`, `focus-csv`). Anything else → a clear **unsupported format** error.

### 2. `backend/adapters/`

One adapter per input format. Each converts its format to `FocusRow[]` (FinOps FOCUS columns, see https://www.economize.cloud/blog/finops-focus/). FOCUS is the common billing shape, so a new source (GCP, Azure) is a new adapter and nothing downstream changes.

### 3. `backend/normalize.ts`

`FocusRow[]` → `Workload`: **one row per component, not per bill line**. Several bill lines (instance hours, EBS, snapshots) for the same resource collapse into one component.

- **Catalog lookup** (`backend/data/catalog/`): instance type → vCPU / RAM. Example: `m5.xlarge` → 4 vCPU / 16 GB.
- **Mapping table** (`backend/data/mapping.ts`): source service (+ engine) → category. Example: RDS + Postgres → `postgres`.

### 4. `backend/pricers/railway.ts`

`price(workload, assumptions) → Estimate`

Railway bills actual usage (CPU, RAM, egress, volume storage), not provisioned capacity, so utilization matters. Rates come from https://railway.com/pricing and the Railway docs and are stored in `backend/data/price-books/railway.yaml` (with the source URL and the date fetched). Pricers never hardcode rates.

Every destination is a pricer module with the same signature. Railway is the default; AWS, GCP, Azure and Supabase are later additions in `backend/pricers/<name>.ts` with their own price book.

### 5. `backend/compare.ts`

Builds the result:

- current cost vs destination cost as a **range** (low / high utilization)
- line items per component
- "what disappears" list with savings
- "no equivalent" list (SQS, DynamoDB, ...)

## Utilization

Bills show provisioned capacity, not usage. Zero required questions:

- **Default**: show a range, e.g. 10% busy → 50% busy.
- **Optional**: a single slider "How busy are your servers?" narrows the range.
- On the results page, **"must keep"** services are toggles; toggling one recomputes the estimate (kept services stay at their current cost).

Recomputing is pure and cheap (`price` + `compare` on the stored `Workload`), so it runs on every slider move or toggle without re-parsing the bill.

## Schemas (Zod, `backend/schema/`)

| Schema | What it is |
|---|---|
| `FocusRow` | one billing line in FOCUS columns (BilledCost, ServiceName, ResourceId, SkuId, UsageQuantity, UsageUnit, ChargePeriodStart/End, ...) |
| `Component` | one workload piece: category, source service, size (vCPU, RAM GB, storage GB, egress GB), current monthly cost, source rows |
| `Workload` | the list of components plus source provider, billing period and unparsed lines |
| `Assumptions` | utilization low/high (or a single slider value), must-keep component ids, destination id |
| `Estimate` | per-component destination cost (low/high), totals, disappears list, no-equivalent list |

Zod validates at trust boundaries: adapter output, API requests, price books on load.

## Mapping table (`backend/data/mapping.ts`)

Hand maintained TypeScript.

- **Key**: source service + engine (e.g. `aws:rds:postgres`, `aws:ec2`, `aws:sqs`)
- **Value**: category + per-destination target + conversion notes

```ts
"aws:rds:postgres": {
  category: "postgres",
  targets: { railway: { kind: "service", template: "postgres", notes: "Runs as a Railway Postgres service with a volume." } },
},
"aws:sqs": {
  category: "queue",
  targets: { railway: { kind: "none", notes: "No managed queue. Keep SQS or run a queue service." } },
},
"aws:ec2:nat-gateway": {
  category: "network-overhead",
  targets: { railway: { kind: "disappears", notes: "Railway has no NAT gateway charge." } },
},
```

`kind` drives the result lists: `service` → priced line item, `disappears` → "what disappears", `none` → "no equivalent".

## Extensibility

| To add | Change |
|---|---|
| A source format | new file in `backend/adapters/`, a rule in `detect.ts`, mapping keys |
| A destination | new `backend/pricers/<name>.ts`, `backend/data/price-books/<name>.yaml`, a `targets.<name>` entry per mapping row |

## Persistence

Postgres + Drizzle ORM. Store only the derived `Workload` and results (no raw bill), so a results page can be reloaded and recomputed. Added when the first feature needs it.
