import { FocusRow, type UnpricedLine } from "../schema";
import type { AdapterResult } from ".";
import { pdfLines } from "./pdf-text";

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
/** "USD 2.89", "(USD 1.71)", "$2.89", "-$2.89" at the end of a line. */
const AMOUNT = /(\(?-?(?:USD\s*|\$)-?[\d,]+\.\d{2}\)?)$/;
const money = (s: string) => (/[(-]/.test(s) ? -1 : 1) * Number(s.replace(/[^\d.]/g, ""));
const cents = (n: number) => Math.round(n * 100);
const REGION = /^(US|EU|Asia Pacific|Canada|South America|Africa|Middle East|Israel|Mexico|AWS GovCloud|Europe|Global|No Region|Any)\b/;

/** "Aug 1 - Aug 31, 2026" (or "August 1 - August 31, 2026") → ISO start and exclusive end. */
function period(lines: string[]) {
  for (const l of lines) {
    const m = l.match(/\b([A-Z][a-z]{2})[a-z]*\.? (\d{1,2})\s*-\s*([A-Z][a-z]{2})[a-z]*\.? (\d{1,2}),\s*(\d{4})/);
    if (!m) continue;
    const [, m1, d1, m2, d2, y] = m;
    const start = new Date(Date.UTC(+y!, MONTHS.indexOf(m1!.toLowerCase()), +d1!));
    const end = new Date(Date.UTC(+y!, MONTHS.indexOf(m2!.toLowerCase()), +d2! + 1));
    if (!isNaN(+start) && !isNaN(+end)) return { start: start.toISOString(), end: end.toISOString() };
  }
  return undefined;
}

/**
 * AWS invoice PDF ("AWS bill" export). Inside "Charges by service", indent levels are:
 * provider (Total pre-tax) → service | region → product sub-group → charge line
 * ("<$rate per …>  <qty> <unit>  USD <amount>", or "<…>  Credit  (USD <amount>)").
 * Anything that doesn't reconcile becomes an unparsed line, never silently dropped.
 */
export async function awsInvoicePdf(bytes: Uint8Array): Promise<AdapterResult> {
  const lines = await pdfLines(bytes);
  const p = period(lines.map((l) => l.text));
  const start = lines.findIndex((l) => /^Charges by service\b/.test(l.text));
  const end = lines.findIndex((l, i) => i > start && /^(Total tax|Charges by account|Invoices)\b/.test(l.text));
  const section = lines.slice(start + 1, end === -1 ? undefined : end).filter((l) => l.x < 300 && !/^Description\s+Usage Quantity/.test(l.text));
  const taxLine = lines.find((l) => /^Total tax\b/.test(l.text));

  const rows: FocusRow[] = [];
  const unparsed: UnpricedLine[] = [];
  if (start === -1) return { provider: "AWS", rows, unparsed: [{ description: "No 'Charges by service' section found in this PDF", service: "", cost: 0, reason: "unrecognised layout" }] };

  // Indent ranks: 0 provider, 1 service/region, 2 sub-group, 3 charge.
  const indents = [...new Set(section.filter((l) => AMOUNT.test(l.text)).map((l) => l.x))].sort((a, b) => a - b);
  const rank = (x: number) => indents.findIndex((i) => Math.abs(i - x) <= 2);
  const row = (r: Partial<FocusRow>) => FocusRow.parse({ ProviderName: "AWS", ChargeCategory: "Usage", ChargePeriodStart: p?.start, ChargePeriodEnd: p?.end, ...r });

  let preTax: number | undefined;
  let service: { name: string; total: number; sum: number } | undefined;
  let group = "";
  const closeService = () => {
    if (service && cents(service.total) !== cents(service.sum)) {
      unparsed.push({ description: `${service.name}: charges that did not reconcile with the service total`, service: service.name, cost: (cents(service.total) - cents(service.sum)) / 100, reason: "unreconciled" });
    }
    service = undefined;
  };

  for (const { x, text } of section) {
    const amount = text.match(AMOUNT)?.[1];
    if (!amount) continue; // wrapped continuation lines, labels
    const head = text.slice(0, -amount.length).trim();
    const cost = money(amount);
    const r = rank(x);
    if (r <= 0) {
      if (/Total pre-tax/i.test(head)) preTax = cost;
      continue;
    }
    if (r === 1) {
      if (REGION.test(head)) continue; // region subtotal
      closeService();
      service = { name: head, total: cost, sum: 0 };
      group = "";
      continue;
    }
    if (r === 2) {
      group = head; // e.g. "Amazon Relational Database Service for Aurora PostgreSQL": carries engine and product
      continue;
    }
    if (!service) {
      unparsed.push({ description: text, service: "", cost, reason: "charge outside any service section" });
      continue;
    }
    const cols = head.split(/\s{2,}/);
    const last = cols.at(-1) ?? "";
    const credit = /^Credit$/i.test(last) || /\bcredit id\b/i.test(head);
    const q = !credit && cols.length > 1 ? last.match(/^([\d,]+(?:\.\d+)?)\s+(.+)$/) : null;
    const desc = (q || /^Credit$/i.test(last) ? cols.slice(0, -1) : cols).join(" ");
    service.sum += cost;
    if (credit) {
      rows.push(row({ BilledCost: cost, ChargeCategory: "Credit", ServiceName: service.name, ChargeDescription: desc }));
      continue;
    }
    // Lines without a rate or quantity (e.g. "AWS Support (Business)") are kept as rows; normalize decides if they map.
    rows.push(row({ BilledCost: cost, ServiceName: service.name, ChargeDescription: desc, x_UsageType: group, ConsumedQuantity: q ? Number(q[1]!.replace(/,/g, "")) : undefined, ConsumedUnit: q?.[2] }));
  }
  closeService();

  const tax = taxLine ? money(taxLine.text.match(AMOUNT)?.[1] ?? "0") : 0;
  if (tax) rows.push(row({ BilledCost: tax, ChargeCategory: "Tax", ServiceName: "Tax", ChargeDescription: "Total tax" }));

  if (preTax !== undefined) {
    const parsed = rows.filter((r) => r.ChargeCategory !== "Tax").reduce((s, r) => s + r.BilledCost, 0);
    const diff = (cents(preTax) - cents(parsed)) / 100;
    if (Math.abs(diff) >= 0.01) unparsed.push({ description: "Pre-tax total not accounted for by parsed lines", service: "", cost: diff, reason: "unreconciled" });
  }
  return { provider: "AWS", rows, unparsed };
}
