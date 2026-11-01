import { FocusRow } from "../schema";
import type { AdapterResult } from ".";
import { csvRecords, num } from "./csv";

// CUR lineItem/LineItemType → FOCUS ChargeCategory
function category(t: string): FocusRow["ChargeCategory"] {
  if (t === "Tax") return "Tax";
  if (/Credit|Refund|Discount/.test(t)) return "Credit";
  if (/Fee/.test(t)) return "Purchase";
  return "Usage";
}
const opt = (s: string | undefined) => (s ? s : undefined);

/** CUR 1.0 (`lineItem/UnblendedCost`) and CUR 2.0 (`line_item_unblended_cost`) both normalize to the same keys. */
export function awsCurCsv(bytes: Uint8Array): AdapterResult {
  const rows = csvRecords(new TextDecoder().decode(bytes)).map((r) =>
    FocusRow.parse({
      BilledCost: num(r.lineitemunblendedcost) ?? 0,
      ChargeCategory: category(r.lineitemlineitemtype ?? ""),
      ProviderName: "AWS",
      ServiceName: r.productproductname || r.lineitemproductcode || "Unknown",
      ChargeDescription: r.lineitemlineitemdescription ?? "",
      ResourceId: opt(r.lineitemresourceid),
      ConsumedQuantity: num(r.lineitemusageamount),
      ConsumedUnit: opt(r.pricingunit),
      ChargePeriodStart: opt(r.lineitemusagestartdate),
      ChargePeriodEnd: opt(r.lineitemusageenddate),
      x_ServiceCode: opt(r.lineitemproductcode),
      x_UsageType: opt(r.lineitemusagetype),
      x_InstanceType: opt(r.productinstancetype),
      x_DatabaseEngine: opt(r.productdatabaseengine),
    }),
  );
  return { provider: "AWS", rows, unparsed: [] };
}
