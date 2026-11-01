import { expect, test } from "bun:test";
import { adapters } from "../src/adapters";
import { lookupInstance } from "../src/data/catalog/aws-instances";
import { normalize } from "../src/normalize";
import type { Format } from "../src/schema";
import { TAX_TOTAL, USAGE_TOTAL } from "./fixtures/sample-bill";

const load = async (format: Format, file: string) => {
  const bytes = new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/${file}`).arrayBuffer());
  return normalize({ format, ...(await adapters[format](bytes)) });
};
const r2 = (n: number) => Math.round(n * 100) / 100;

for (const [format, file] of [["focus-csv", "focus.csv"], ["aws-cur-csv", "aws-cur.csv"], ["aws-invoice-pdf", "aws-invoice.pdf"]] as const) {
  test(`${format} normalizes to the same workload`, async () => {
    const w = await load(format, file);
    const by = (key: string) => w.components.filter((c) => c.key === key);

    // every dollar is accounted for: components + not priced + excluded
    const total = w.components.reduce((s, c) => s + c.currentMonthlyCost, 0) + w.unparsed.reduce((s, u) => s + u.cost, 0);
    expect(r2(total)).toBe(USAGE_TOTAL);
    expect(r2(w.excluded.reduce((s, u) => s + u.cost, 0))).toBe(TAX_TOTAL);

    const m5 = by("aws:ec2:instance").find((c) => c.detail.includes("m5.xlarge"))!;
    expect(m5.size).toMatchObject({ vcpu: 12, memoryGb: 48 });
    const pg = by("aws:rds:postgres");
    expect(pg).toHaveLength(1);
    expect(pg[0]!.size).toMatchObject({ vcpu: 2, memoryGb: 16, storageGb: 200 });
    expect(pg[0]!.currentMonthlyCost).toBe(185);
    expect(by("aws:elasticache:redis")[0]!.size.memoryGb).toBe(3.09);
    expect(by("aws:data-transfer:internet")[0]!.size.egressGb).toBe(1200);
    expect(by("aws:s3:storage")[0]!.size.objectStorageGb).toBe(600);
    expect(by("aws:vpc:nat-gateway")[0]!.currentMonthlyCost).toBe(87.3);
    expect(w.unparsed.map((u) => u.service)).toEqual(["Amazon Kinesis"]);
    expect(w.components.map((c) => c.id).slice(0, 3)).toEqual(["01", "02", "03"]);
    expect(w.components[0]!.currentMonthlyCost).toBeGreaterThanOrEqual(w.components[1]!.currentMonthlyCost);
  });
}

test("catalog knows common shapes and refuses to guess", () => {
  expect(lookupInstance("m5.xlarge")).toEqual({ vcpu: 4, memoryGb: 16 });
  expect(lookupInstance("db.r6g.large")).toEqual({ vcpu: 2, memoryGb: 16 });
  expect(lookupInstance("t4g.small")).toEqual({ vcpu: 2, memoryGb: 2 });
  expect(lookupInstance("x2iedn.32xlarge")).toBeUndefined();
});
