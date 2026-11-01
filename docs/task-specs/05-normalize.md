# 05 Normalize

`src/normalize.ts`: `FocusRow[] → Workload`, one component per resource (or per instance type when the bill has no resource IDs; instance count = hours / 730).

- `src/data/catalog/aws-instances.ts`: instance type → vCPU / RAM (EC2, RDS `db.*`, ElastiCache `cache.*`).
- `src/data/mapping.ts`: key (`aws:<service>[:<engine|kind>]`) → category + per-destination target (`service` | `disappears` | `none`) + notes.
- Tax and credits go to `excluded`; unknown services to `unparsed`.

**Acceptance**: fixture workloads have the expected components, sizes and totals; unknown instance types are flagged, not guessed.
