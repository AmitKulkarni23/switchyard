import { expect, test } from "bun:test";
import { adapters } from "../src/adapters";
import { SAMPLE_LINES, TAX_TOTAL, USAGE_TOTAL } from "./fixtures/sample-bill";

const fixture = async (name: string) => new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/${name}`).arrayBuffer());
const sum = (xs: { BilledCost: number }[]) => Math.round(xs.reduce((s, r) => s + r.BilledCost, 0) * 100) / 100;

for (const [format, file] of [["focus-csv", "focus.csv"], ["aws-cur-csv", "aws-cur.csv"], ["aws-invoice-pdf", "aws-invoice.pdf"]] as const) {
  test(`${format} reproduces the fixture totals`, async () => {
    const { rows, unparsed, provider } = await adapters[format](await fixture(file));
    expect(provider).toBe("AWS");
    expect(unparsed).toEqual([]);
    expect(sum(rows.filter((r) => r.ChargeCategory === "Usage"))).toBe(USAGE_TOTAL);
    expect(sum(rows.filter((r) => r.ChargeCategory === "Tax"))).toBe(TAX_TOTAL);
    const ec2 = rows.find((r) => r.ChargeDescription.includes("m5.xlarge"));
    expect(ec2?.ConsumedUnit).toBe("Hrs");
    expect(Date.parse(rows[0]!.ChargePeriodStart!)).toBe(Date.parse("2026-09-01T00:00:00Z"));
    expect(Date.parse(rows[0]!.ChargePeriodEnd!)).toBe(Date.parse("2026-10-01T00:00:00Z"));
  });
}

test("pdf keeps every charge line", async () => {
  const { rows } = await adapters["aws-invoice-pdf"](await fixture("aws-invoice.pdf"));
  expect(rows.length).toBe(SAMPLE_LINES.length);
  expect(rows.find((r) => r.ServiceName === "AWS Support (Business)")?.ConsumedQuantity).toBeUndefined();
});
