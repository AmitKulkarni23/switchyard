import { MAPPING } from "../data/mapping";
import { type PriceBook, railwayPriceBook } from "../data/price-books";
import type { Assumptions, Component, EstimateLine, Range, Workload } from "../schema";

/** Memory doesn't idle to zero like CPU: it sits at a floor and rises with load. */
export const MEMORY_FLOOR = 0.3;
/** A database service never idles below this on Railway (ponytail: rough idle Postgres/Redis footprint; measure and refine). */
const DB_MIN_MEMORY_GB = 0.25;
const DATABASES = new Set(["postgres", "mysql", "redis", "mongo"]);
const memoryShare = (u: number) => MEMORY_FLOOR + (1 - MEMORY_FLOOR) * u;

const usd = (n: number) => `$${+n.toFixed(n < 1 ? 3 : 2)}`;
const pct = (n: number) => `${Math.round(n * 100)}%`;
const fmt = (n: number) => +n.toFixed(2);

export type Priced = {
  plan: { name: string; monthlyFee: number; includedUsage: number };
  lines: EstimateLine[];
  total: Range; // what you'd pay per month: destination plan + usage + anything kept on the source
};

function usageCost(c: Component, u: number, r: PriceBook["rates"]) {
  const s = DATABASES.has(c.category) ? { ...c.size, memoryGb: Math.max(c.size.memoryGb, DB_MIN_MEMORY_GB) } : c.size;
  return s.vcpu * r.vcpu_month * u + s.memoryGb * r.memory_gb_month * memoryShare(u) + s.storageGb * r.volume_gb_month + s.objectStorageGb * r.object_storage_gb_month + s.egressGb * r.egress_gb;
}

function formula(c: Component, { low, high }: Assumptions["utilization"], r: PriceBook["rates"]) {
  const s = c.size;
  const parts = [
    s.vcpu && `${fmt(s.vcpu)} vCPU × ${usd(r.vcpu_month)} × ${pct(low)}–${pct(high)} busy`,
    s.memoryGb && `${fmt(s.memoryGb)} GB RAM × ${usd(r.memory_gb_month)} × ${pct(memoryShare(low))}–${pct(memoryShare(high))} used`,
    s.storageGb && `${fmt(s.storageGb)} GB volume × ${usd(r.volume_gb_month)}`,
    s.objectStorageGb && `${fmt(s.objectStorageGb)} GB bucket × ${usd(r.object_storage_gb_month)}`,
    s.egressGb && `${fmt(s.egressGb)} GB egress × ${usd(r.egress_gb)}`,
  ];
  return parts.filter(Boolean).join(" + ");
}

/** price(workload, assumptions) → per-component Railway cost ranges, plan and total. Pure; runs in the browser too. */
export function price(workload: Workload, a: Assumptions, book: PriceBook = railwayPriceBook): Priced {
  const r = book.rates;
  const { low, high } = a.utilization;
  const lines: EstimateLine[] = workload.components.map((c) => {
    const target = MAPPING[c.key]?.targets[book.destination] ?? { kind: "none" as const, notes: "No mapping for this destination." };
    const base = { componentId: c.id, label: c.label, category: c.category, current: c.currentMonthlyCost };
    if (a.mustKeep.includes(c.id)) return { ...base, outcome: "kept", destination: { low: c.currentMonthlyCost, high: c.currentMonthlyCost }, formula: "Kept on the current cloud at today's cost", notes: "Marked must keep." };
    if (target.kind === "none") return { ...base, outcome: "no-equivalent", destination: { low: c.currentMonthlyCost, high: c.currentMonthlyCost }, formula: "Stays on the current cloud at today's cost", notes: target.notes };
    if (target.kind === "disappears") return { ...base, outcome: "disappears", destination: { low: 0, high: 0 }, formula: `No ${book.destination} charge`, notes: target.notes };
    return { ...base, outcome: "moves", destination: { low: usageCost(c, low, r), high: usageCost(c, high, r) }, formula: formula(c, a.utilization, r), notes: `${target.target}. ${target.notes}` };
  });

  const moving = workload.components.filter((c) => lines.find((l) => l.componentId === c.id)?.outcome === "moves");
  const fits = (p: PriceBook["plans"][number]) => moving.every((c) => c.size.vcpu <= p.limits.vcpu && c.size.memoryGb <= p.limits.memory_gb && c.size.storageGb <= p.limits.volume_gb);
  const chosen = moving.length ? (book.plans.find(fits) ?? book.plans.at(-1)!) : undefined;
  const plan = chosen ? { name: chosen.name, monthlyFee: chosen.monthly_fee, includedUsage: chosen.included_usage } : { name: "None", monthlyFee: 0, includedUsage: 0 };

  const sum = (k: "low" | "high", outcome: EstimateLine["outcome"]) => lines.filter((l) => l.outcome === outcome).reduce((s, l) => s + l.destination[k], 0);
  const kept = (k: "low" | "high") => sum(k, "kept") + sum(k, "no-equivalent");
  const total = (k: "low" | "high") => plan.monthlyFee + Math.max(0, sum(k, "moves") - plan.includedUsage) + kept(k);
  return { plan, lines, total: { low: total("low"), high: total("high") } };
}
