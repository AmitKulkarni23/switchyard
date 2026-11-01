import { FocusRow, type UnpricedLine } from "../schema";
import type { AdapterResult } from ".";
import { pdfLines } from "./pdf-text";

const MONTHS = ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"];
const AMOUNT = /(-?\(?-?\$[\d,]+\.\d{2}\)?)$/;
const money = (s: string) => (s.includes("-") || s.includes("(") ? -1 : 1) * Number(s.replace(/[^\d.]/g, ""));
const cents = (n: number) => Math.round(n * 100);

/** "Billing period September 1 - September 30, 2026" → ISO start and exclusive end. */
function period(lines: string[]) {
  for (const l of lines) {
    const m = l.match(/Billing period\s+(\w+)\s+(\d+)\s*-\s*(\w+)\s+(\d+),\s*(\d{4})/i);
    if (!m) continue;
    const [, m1, d1, m2, d2, y] = m;
    const start = new Date(Date.UTC(+y!, MONTHS.indexOf(m1!.toLowerCase()), +d1!));
    const end = new Date(Date.UTC(+y!, MONTHS.indexOf(m2!.toLowerCase()), +d2! + 1));
    if (!isNaN(+start) && !isNaN(+end)) return { start: start.toISOString(), end: end.toISOString() };
  }
  return undefined;
}

/**
 * AWS invoice PDF: service headers sit at the left margin with the service total;
 * charge lines are indented: "<$rate per description>  <qty> <unit>  <$amount>".
 * Anything that doesn't reconcile becomes an unparsed line, never silently dropped.
 */
export async function awsInvoicePdf(bytes: Uint8Array): Promise<AdapterResult> {
  const lines = await pdfLines(bytes);
  const margin = Math.min(...lines.map((l) => l.x));
  const p = period(lines.map((l) => l.text));
  const rows: FocusRow[] = [];
  const unparsed: UnpricedLine[] = [];
  let service: { name: string; total: number; rows: FocusRow[] } | undefined;
  let invoiceTotal: number | undefined;

  const closeService = () => {
    if (!service) return;
    const diff = (cents(service.total) - cents(service.rows.reduce((s, r) => s + r.BilledCost, 0))) / 100;
    if (Math.abs(diff) >= 0.01) unparsed.push({ description: `${service.name}: charges that did not reconcile with the service total`, service: service.name, cost: diff, reason: "unreconciled" });
    service = undefined;
  };
  const row = (r: Partial<FocusRow>) => FocusRow.parse({ ProviderName: "AWS", ChargeCategory: "Usage", ChargePeriodStart: p?.start, ChargePeriodEnd: p?.end, ...r });

  for (const { x, text } of lines) {
    const amount = text.match(AMOUNT)?.[1];
    if (!amount) continue; // titles, regions, sub-group labels
    const head = text.slice(0, -amount.length).trim();
    const cost = money(amount);
    if (x <= margin + 5) {
      closeService();
      if (/^total\b/i.test(head)) invoiceTotal = cost;
      else if (/^tax\b/i.test(head)) rows.push(row({ BilledCost: cost, ChargeCategory: "Tax", ServiceName: "Tax", ChargeDescription: head }));
      else if (/^credits?\b/i.test(head)) rows.push(row({ BilledCost: cost, ChargeCategory: "Credit", ServiceName: "Credits", ChargeDescription: head }));
      else service = { name: head, total: cost, rows: [] };
      continue;
    }
    if (!service) {
      unparsed.push({ description: text, service: "", cost, reason: "charge outside any service section" });
      continue;
    }
    const cols = head.split(/\s{2,}/);
    const q = cols.length > 1 ? cols.at(-1)!.match(/^([\d,]+(?:\.\d+)?)\s+(\S+)$/) : null;
    const r = row({
      BilledCost: cost,
      ServiceName: service.name,
      ChargeDescription: (q ? cols.slice(0, -1) : cols).join(" "),
      ConsumedQuantity: q ? Number(q[1]!.replace(/,/g, "")) : undefined,
      ConsumedUnit: q?.[2],
    });
    service.rows.push(r);
    rows.push(r);
  }
  closeService();

  if (invoiceTotal !== undefined) {
    const diff = (cents(invoiceTotal) - cents(rows.reduce((s, r) => s + r.BilledCost, 0)) - cents(unparsed.reduce((s, u) => s + u.cost, 0))) / 100;
    if (Math.abs(diff) >= 0.01) unparsed.push({ description: "Invoice total not accounted for by parsed lines", service: "", cost: diff, reason: "unreconciled" });
  }
  return { provider: "AWS", rows, unparsed };
}
