import { findInstanceType, lookupInstance } from "./data/catalog/aws-instances";
import { classify, MAPPING, serviceCode } from "./data/mapping";
import { Component, type FocusRow, type Format, type UnpricedLine, Workload } from "./schema";

const HOURS_PER_MONTH = 730;
const round2 = (n: number) => Math.round(n * 100) / 100;
const isHours = (u?: string) => /^(hrs?|hours?)$/i.test(u ?? "");

type Group = { key: string; rows: FocusRow[]; instanceType?: string };

/** FocusRow[] → Workload: one component per resource or instance type, not per bill line. */
export function normalize(input: { provider: string; format: Format; rows: FocusRow[]; unparsed: UnpricedLine[] }): Workload {
  const unparsed = [...input.unparsed];
  const excluded: UnpricedLine[] = [];
  const groups = new Map<string, Group>();

  const starts = input.rows.map((r) => Date.parse(r.ChargePeriodStart ?? "")).filter((n) => !isNaN(n));
  const ends = input.rows.map((r) => Date.parse(r.ChargePeriodEnd ?? "")).filter((n) => !isNaN(n));
  const periodStart = starts.length ? Math.min(...starts) : undefined;
  const periodEnd = ends.length ? Math.max(...ends) : undefined;
  const periodHours = periodStart && periodEnd && periodEnd > periodStart ? (periodEnd - periodStart) / 3_600_000 : HOURS_PER_MONTH;
  // Monthly figures: a one-month bill is used as billed; longer exports are averaged per month.
  const months = periodHours > 32 * 24 ? periodHours / HOURS_PER_MONTH : 1;

  for (const r of input.rows) {
    if (r.ChargeCategory === "Tax" || r.ChargeCategory === "Credit" || r.ChargeCategory === "Adjustment") {
      excluded.push({ description: r.ChargeDescription || r.ChargeCategory, service: r.ServiceName, cost: r.BilledCost, reason: r.ChargeCategory.toLowerCase() });
      continue;
    }
    const code = r.x_ServiceCode || serviceCode(r.ServiceName) || "";
    const usage = `${r.x_UsageType ?? ""} ${r.ChargeDescription}`;
    const key = classify(code, usage, r.x_DatabaseEngine);
    if (!key) {
      unparsed.push({ description: r.ChargeDescription || r.ServiceName, service: r.ServiceName, cost: r.BilledCost, reason: `no mapping for ${r.ServiceName}` });
      continue;
    }
    const sizing = MAPPING[key]!.sizing;
    const instanceType = sizing === "instance" ? (r.x_InstanceType || findInstanceType(usage)) : undefined;
    // EC2 groups by instance type; databases by resource (instance + storage lines merge); everything else by key.
    const sub = key === "aws:ec2:instance" ? instanceType : sizing === "instance" ? (r.ResourceId ?? "") : "";
    const id = `${key}|${sub ?? ""}`;
    const g = groups.get(id) ?? { key, rows: [], instanceType };
    g.instanceType ??= instanceType;
    g.rows.push(r);
    groups.set(id, g);
  }

  const components: Omit<Component, "id">[] = [];
  for (const g of groups.values()) {
    const m = MAPPING[g.key]!;
    const cost = g.rows.reduce((s, r) => s + r.BilledCost, 0);
    const size = { vcpu: 0, memoryGb: 0, storageGb: 0, objectStorageGb: 0, egressGb: 0 };
    const warnings: string[] = [];
    let detail = "";

    if (m.sizing === "instance") {
      const hourRows = g.rows.filter((r) => isHours(r.ConsumedUnit) && (r.x_InstanceType || findInstanceType(`${r.x_UsageType ?? ""} ${r.ChargeDescription}`)));
      const spec = g.instanceType ? lookupInstance(g.instanceType) : undefined;
      if (!spec) {
        unparsed.push({ description: `${m.label}${g.instanceType ? ` (${g.instanceType})` : ""}`, service: g.rows[0]!.ServiceName, cost: round2(cost / months), reason: g.instanceType ? `instance type ${g.instanceType} not in catalog` : "instance type not found on bill" });
        continue;
      }
      const count = hourRows.reduce((s, r) => s + (r.ConsumedQuantity ?? 0), 0) / periodHours;
      size.vcpu = count * spec.vcpu;
      size.memoryGb = count * spec.memoryGb;
      size.storageGb = g.rows.filter((r) => /GB-?Mo/i.test(r.ConsumedUnit ?? "")).reduce((s, r) => s + (r.ConsumedQuantity ?? 0), 0) / months;
      detail = `${+count.toFixed(2)} × ${g.instanceType} (${+size.vcpu.toFixed(2)} vCPU / ${+size.memoryGb.toFixed(2)} GB)` + (size.storageGb ? `, ${+size.storageGb.toFixed(1)} GB storage` : "");
    } else if (m.sizing === "fargate") {
      for (const r of g.rows) {
        const hours = (r.ConsumedQuantity ?? 0) / periodHours;
        if (/GB/i.test(`${r.x_UsageType} ${r.ConsumedUnit} ${r.ChargeDescription}`)) size.memoryGb += hours;
        else size.vcpu += hours;
      }
      detail = `${+size.vcpu.toFixed(2)} vCPU / ${+size.memoryGb.toFixed(2)} GB average`;
    } else if (m.sizing === "storage" || m.sizing === "object-storage" || m.sizing === "egress") {
      const qty = g.rows.reduce((s, r) => s + (r.ConsumedQuantity ?? 0), 0) / months;
      const field = m.sizing === "storage" ? "storageGb" : m.sizing === "object-storage" ? "objectStorageGb" : "egressGb";
      size[field] = qty;
      detail = `${+qty.toFixed(1)} GB${m.sizing === "egress" ? "" : "-month"}`;
    }
    if (g.rows.some((r) => r.ConsumedQuantity === undefined) && m.sizing !== "none") warnings.push("Some lines had no usage quantity; size may be understated.");

    components.push({
      key: g.key,
      category: m.category,
      label: g.key === "aws:ec2:instance" && g.instanceType ? `EC2 ${g.instanceType}` : m.label,
      sourceService: g.rows[0]!.ServiceName,
      detail,
      size,
      currentMonthlyCost: round2(cost / months),
      rowCount: g.rows.length,
      warnings,
    });
  }

  components.sort((a, b) => b.currentMonthlyCost - a.currentMonthlyCost || a.key.localeCompare(b.key));
  return Workload.parse({
    provider: input.provider,
    format: input.format,
    periodStart: periodStart ? new Date(periodStart).toISOString() : undefined,
    periodEnd: periodEnd ? new Date(periodEnd).toISOString() : undefined,
    components: components.map((c, i) => ({ ...c, id: String(i + 1).padStart(2, "0") })),
    unparsed,
    excluded,
  });
}
