# 07 Compare

`backend/compare.ts`: `compare(workload, assumptions) → Estimate`: current total, destination low/high, difference low/high (negative allowed), lines with formula text, disappears list with savings, noEquivalent, notPriced, excluded. Runs in browser and server (no Node APIs).

**Acceptance**: end-to-end fixture test bill → estimate with expected totals.
