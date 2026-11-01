import { pricers } from "./pricers";
import { Assumptions, Estimate, type Workload } from "./schema";

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Current cost vs destination as a range, plus what disappears and what has no equivalent. */
export function compare(workload: Workload, assumptions: Partial<Assumptions> = {}): Estimate {
  const a = Assumptions.parse(assumptions);
  const pricer = pricers[a.destination];
  if (!pricer) throw new Error(`Unknown destination: ${a.destination}`);
  const { plan, lines, total } = pricer(workload, a);
  const current = r2(workload.components.reduce((s, c) => s + c.currentMonthlyCost, 0));
  const rounded = lines.map((l) => ({ ...l, destination: { low: r2(l.destination.low), high: r2(l.destination.high) } }));
  return Estimate.parse({
    destination: a.destination,
    plan,
    assumptions: a,
    current,
    destinationTotal: { low: r2(total.low), high: r2(total.high) },
    difference: { low: r2(current - total.high), high: r2(current - total.low) },
    lines: rounded,
    disappears: rounded.filter((l) => l.outcome === "disappears"),
    noEquivalent: rounded.filter((l) => l.outcome === "no-equivalent"),
    notPriced: workload.unparsed,
    excluded: workload.excluded,
  });
}
