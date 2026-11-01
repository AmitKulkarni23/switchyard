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

// AWS invoice PDF: service headers at x=50, charges indented at x=80. Minimal hand-written PDF.
const money = (n: number) => "$" + n.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const qty = (n: number) => n.toLocaleString("en-US", { minimumFractionDigits: 3, maximumFractionDigits: 3 });
type T = { x: number; text: string; bold?: boolean };
const lines: T[] = [
  { x: 50, text: "Amazon Web Services, Inc.", bold: true },
  { x: 50, text: "Bill for September 2026" },
  { x: 50, text: "Billing period September 1 - September 30, 2026" },
  { x: 50, text: "SAMPLE BILL - SYNTHETIC DATA" },
];
const services = [...new Set(SAMPLE_LINES.filter((l) => l.type !== "Tax").map((l) => l.service))];
for (const s of services) {
  const items = SAMPLE_LINES.filter((l) => l.service === s);
  lines.push({ x: 50, text: `${s}    ${money(items.reduce((a, l) => a + l.cost, 0))}`, bold: true });
  lines.push({ x: 65, text: "US East (N. Virginia)" });
  for (const l of items)
    lines.push({ x: 80, text: l.qty === undefined ? `${l.description}    ${money(l.cost)}` : `${l.description}    ${qty(l.qty)} ${l.unit}    ${money(l.cost)}` });
}
lines.push({ x: 50, text: `Tax    ${money(TAX_TOTAL)}`, bold: true });
lines.push({ x: 50, text: `Total    ${money(USAGE_TOTAL + TAX_TOTAL)}`, bold: true });

const esc = (s: string) => s.replace(/[\\()]/g, (c) => "\\" + c);
const stream = lines.map((l, i) => `BT /${l.bold ? "F2" : "F1"} 8 Tf ${l.x} ${770 - i * 11} Td (${esc(l.text)}) Tj ET`).join("\n");
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
