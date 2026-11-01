# 01 Schemas

Zod schemas in `backend/schema/` with inferred types: `FocusRow`, `Component`, `Workload`, `Assumptions`, `Estimate`.

- `FocusRow`: FOCUS columns used downstream (BilledCost, ChargeCategory, ServiceName, ProviderName, ResourceId, ChargeDescription, ConsumedQuantity, ConsumedUnit, ChargePeriodStart/End) plus `x_` extensions (ServiceCode, UsageType, InstanceType, DatabaseEngine).
- `Component`: id (stable "01".."NN"), mapping key, category, label, size (vcpu, memoryGb, storageGb, objectStorageGb, egressGb), currentMonthlyCost, source row count.
- `Workload`: provider, format, billing period, components, unparsed lines, excluded lines (tax, credits).
- `Assumptions`: utilization {low, high} in 0..1, mustKeep ids, destination.
- `Estimate`: totals, per-line low/high, disappears, noEquivalent, notPriced, excluded, plan.

**Acceptance**: `bun run typecheck` passes; schemas parse a hand-written sample.
