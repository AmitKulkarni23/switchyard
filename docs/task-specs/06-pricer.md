# 06 Railway pricer

`backend/pricers/railway.ts`: `price(workload, assumptions) → Priced` (pure). Compute: vCPU × rate × CPU utilization + GB × rate × memory utilization (memory floor 30%, scaled by the same slider). Volumes and object storage at full size, egress at full volume. Disappears → $0; none and must-keep → current cost, kept on source. Plan: Hobby if every service fits its limits, else Pro; total = fee + max(0, usage − included). Pricers register in `backend/pricers/index.ts` by destination id.

**Acceptance**: hand-calculated tests for each category, plan selection and must-keep.
