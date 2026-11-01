# 02 Railway price book

`src/data/price-books/railway.yaml` with rates from https://railway.com/pricing and https://docs.railway.com/reference/pricing/plans (fetched 2026-11-01): vCPU $20/month, RAM $10/GB/month, egress $0.05/GB, volume $0.15/GB/month, object storage $0.015/GB-month (free egress), Hobby $5 incl. $5 usage (48 vCPU / 48 GB / 5 GB volume per service), Pro $20 incl. $20 usage. Validated by a Zod schema on import.

**Acceptance**: loader test validates the file; each rate carries its source URL and fetch date.
