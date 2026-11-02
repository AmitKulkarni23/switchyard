// Regenerate synthetic fixtures: bun run tests/fixtures/make-fixtures.ts
import { PERIOD, SAMPLE_LINES, TAX_TOTAL, USAGE_TOTAL, type SampleLine } from "./sample-bill";

const dir = import.meta.dir;
const csv = (rows: (string | number | undefined)[][]) =>
  rows.map((r) => r.map((v) => (v === undefined ? "" : /[",\n]/.test(String(v)) ? `"${String(v).replace(/"/g, '""')}"` : String(v))).join(",")).join("\n") + "\n";

// Split multi-resource lines evenly so per-resource rows sum to the line.
function perResource(l: SampleLine): { id?: string; qty?: number; cost: number }[] {
  const ids = l.resourceIds ?? [undefined];
  return ids.map((id) => ({ id, qty: l.qty === undefined ? undefined : l.qty / ids.length, cost: Math.round((l.cost / ids.length) * 1e6) / 1e6 }));
}

// FOCUS 1.0 export (AWS Data Exports flavour, with x_ extensions)
const focus: (string | number | undefined)[][] = [["BillingPeriodStart", "ChargePeriodStart", "ChargePeriodEnd", "ChargeCategory", "ProviderName", "ServiceName", "ResourceId", "ChargeDescription", "ConsumedQuantity", "ConsumedUnit", "BilledCost", "x_ServiceCode", "x_UsageType"]];
for (const l of SAMPLE_LINES)
  for (const r of perResource(l))
    focus.push([PERIOD.start, PERIOD.start, PERIOD.end, l.type ?? "Usage", "AWS", l.service, r.id, l.description, r.qty, l.unit, r.cost, l.code, l.usageType]);
await Bun.write(`${dir}/focus.csv`, csv(focus));

// CUR 1.0 (legacy Cost and Usage Report)
const cur: (string | number | undefined)[][] = [["identity/LineItemId", "bill/BillingPeriodStartDate", "lineItem/UsageStartDate", "lineItem/UsageEndDate", "lineItem/LineItemType", "lineItem/ProductCode", "lineItem/UsageType", "lineItem/ResourceId", "lineItem/UsageAmount", "lineItem/UnblendedCost", "lineItem/LineItemDescription", "product/ProductName", "product/instanceType", "product/databaseEngine", "pricing/unit"]];
let n = 0;
for (const l of SAMPLE_LINES)
  for (const r of perResource(l))
    cur.push([`li-${++n}`, PERIOD.start, PERIOD.start, PERIOD.end, l.type ?? "Usage", l.code, l.usageType, r.id, r.qty, r.cost, l.description, l.service, l.instanceType, l.engine, l.unit]);
await Bun.write(`${dir}/aws-cur.csv`, csv(cur));

// AWS invoice PDF in the layout of AWS's "AWS bill" PDF export: provider x=30, service/region x=36,
// product sub-group x=40, charge lines x=51, amounts as "USD 1.23" and credits as "(USD 1.23)".
const usd = (n: number) => (n < 0 ? `(USD ${Math.abs(n).toFixed(2)})` : `USD ${n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
const qty = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 3 });
type T = { x: number; text: string; bold?: boolean };
const usage = SAMPLE_LINES.filter((l) => l.type !== "Tax");
const CREDIT = -5; // a promotional credit under EC2, to exercise credits
const lines: T[] = [
  { x: 30, text: "SAMPLE BILL - SYNTHETIC DATA", bold: true },
  { x: 193, text: "Billing period    Account ID    Bill status" },
  { x: 193, text: "Sep 1 - Sep 30, 2026    000000000000    Issued" },
  { x: 30, text: "AWS bill summary", bold: true },
  { x: 36, text: `Grand total:    ${usd(USAGE_TOTAL + CREDIT + TAX_TOTAL)}` },
  { x: 30, text: "Charges by service", bold: true },
  { x: 30, text: `Amazon Web Services, Inc.    Total pre-tax    ${usd(USAGE_TOTAL + CREDIT)}`, bold: true },
  { x: 36, text: "Description    Usage Quantity    Amount in USD" },
];
const SHORT: Record<string, string> = { "Amazon Elastic Compute Cloud": "Elastic Compute Cloud", "Amazon Relational Database Service": "Relational Database Service", "Amazon ElastiCache": "ElastiCache", "Amazon Simple Storage Service": "Simple Storage Service", "Amazon Simple Queue Service": "Simple Queue Service", "Amazon DynamoDB": "DynamoDB", "AmazonCloudWatch": "CloudWatch", "Amazon Kinesis": "Kinesis", "AWS Data Transfer": "Data Transfer" };
for (const svc of [...new Set(usage.map((l) => l.service))]) {
  const items = usage.filter((l) => l.service === svc);
  const credit = svc === "Amazon Elastic Compute Cloud" ? CREDIT : 0;
  const total = items.reduce((a, l) => a + l.cost, 0);
  lines.push({ x: 36, text: `${SHORT[svc] ?? svc}    ${usd(total + credit)}`, bold: true });
  if (credit) {
    lines.push({ x: 36, text: `No Region    ${usd(credit)}` });
    lines.push({ x: 51, text: `Promotional credit, credit id: 1234567890    Credit    ${usd(credit)}` });
  }
  lines.push({ x: 36, text: `US East (N. Virginia)    ${usd(total)}` });
  lines.push({ x: 40, text: `${svc}    ${usd(total)}` });
  for (const l of items) lines.push({ x: 51, text: l.qty === undefined ? `${l.description}    ${usd(l.cost)}` : `${l.description}    ${qty(l.qty)} ${l.unit}    ${usd(l.cost)}` });
}
lines.push({ x: 30, text: `Total tax    ${usd(TAX_TOTAL)}`, bold: true });
lines.push({ x: 30, text: "Invoices", bold: true });

const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
const stream = lines.map((l, i) => `BT /${l.bold ? "F2" : "F1"} 7 Tf ${l.x} ${780 - i * 10} Td (${esc(l.text)}) Tj ET`).join("\n");
const objs = [
  "<< /Type /Catalog /Pages 2 0 R >>",
  "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
  "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 4 0 R /F2 5 0 R >> >> /Contents 6 0 R >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold >>",
  `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
];
let pdf = "%PDF-1.4\n";
const offsets = objs.map((o, i) => {
  const at = pdf.length;
  pdf += `${i + 1} 0 obj\n${o}\nendobj\n`;
  return at;
});
const xref = pdf.length;
pdf += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
pdf += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
await Bun.write(`${dir}/aws-invoice.pdf`, pdf);

console.log(`fixtures written: usage ${USAGE_TOTAL}, tax ${TAX_TOTAL}`);
