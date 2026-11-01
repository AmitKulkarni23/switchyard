import { FocusRow } from "../schema";
import type { AdapterResult } from ".";
import { csvRecords, num } from "./csv";

const CATEGORIES = ["Usage", "Purchase", "Tax", "Credit", "Adjustment"] as const;
const opt = (s: string | undefined) => (s ? s : undefined);

export function focusCsv(bytes: Uint8Array): AdapterResult {
  const records = csvRecords(new TextDecoder().decode(bytes));
  const rows = records.map((r) =>
    FocusRow.parse({
      BilledCost: num(r.billedcost) ?? 0,
      ChargeCategory: CATEGORIES.find((c) => c.toLowerCase() === r.chargecategory?.toLowerCase()) ?? "Usage",
      ProviderName: r.providername || "Unknown",
      ServiceName: r.servicename || "Unknown",
      ChargeDescription: r.chargedescription ?? "",
      ResourceId: opt(r.resourceid),
      ConsumedQuantity: num(r.consumedquantity),
      ConsumedUnit: opt(r.consumedunit),
      ChargePeriodStart: opt(r.chargeperiodstart),
      ChargePeriodEnd: opt(r.chargeperiodend),
      x_ServiceCode: opt(r.xservicecode),
      x_UsageType: opt(r.xusagetype),
    }),
  );
  return { provider: rows[0]?.ProviderName ?? "Unknown", rows, unparsed: [] };
}
