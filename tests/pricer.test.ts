import { expect, test } from "bun:test";
import { price } from "../backend/pricers/railway";
import { Assumptions, Workload } from "../backend/schema";

const comp = (id: string, key: string, current: number, size: object) => ({ id, key, category: "x", label: key, sourceService: "AWS", size, currentMonthlyCost: current, rowCount: 1 });
const workload = Workload.parse({
  provider: "AWS",
  format: "focus-csv",
  components: [
    comp("01", "aws:ec2:instance", 414.72, { vcpu: 12, memoryGb: 48 }),
    comp("02", "aws:rds:postgres", 185, { vcpu: 2, memoryGb: 16, storageGb: 200 }),
    comp("03", "aws:vpc:nat-gateway", 87.3, {}),
    comp("04", "aws:sqs", 11.6, {}),
  ],
  unparsed: [],
  excluded: [],
});
const near = (a: number, b: number) => expect(a).toBeCloseTo(b, 6);
const line = (p: ReturnType<typeof price>, id: string) => p.lines.find((l) => l.componentId === id)!;

test("prices each category by hand-calculated rates", () => {
  const p = price(workload, Assumptions.parse({}));
  // 12 vCPU × $20 × 10% + 48 GB × $10 × 37%  …  × 50% / 65%
  near(line(p, "01").destination.low, 201.6);
  near(line(p, "01").destination.high, 432);
  // 2 × 20 × .1 + 16 × 10 × .37 + 200 × .15
  near(line(p, "02").destination.low, 93.2);
  near(line(p, "02").destination.high, 154);
  expect(line(p, "03")).toMatchObject({ outcome: "disappears", destination: { low: 0, high: 0 } });
  expect(line(p, "04")).toMatchObject({ outcome: "no-equivalent", destination: { low: 11.6, high: 11.6 } });
  expect(line(p, "01").formula).toBe("12 vCPU × $20 × 10%–50% busy + 48 GB RAM × $10 × 37%–65% used");
  // 200 GB volume exceeds Hobby's 5 GB → Pro: $20 fee covers $20 of usage
  expect(p.plan.name).toBe("Pro");
  near(p.total.low, 20 + (201.6 + 93.2 - 20) + 11.6);
  near(p.total.high, 20 + (432 + 154 - 20) + 11.6);
});

test("usage-based parts ignore the busy slider", () => {
  const w = Workload.parse({ ...workload, components: [{ ...comp("01", "aws:rds:postgres", 89.28, { vcpu: 0.25, memoryGb: 2, storageGb: 10 }), category: "postgres", usageBased: true }] });
  const p = price(w, Assumptions.parse({}));
  // .25 × 20 + 2 × 10 + 10 × .15, at any utilization
  near(line(p, "01").destination.low, 26.5);
  near(line(p, "01").destination.high, 26.5);
  expect(line(p, "01").formula).toBe("0.25 vCPU × $20 + 2 GB RAM × $10 + 10 GB volume × $0.15");
});

test("must keep holds a component at today's cost", () => {
  const p = price(workload, Assumptions.parse({ mustKeep: ["01"] }));
  expect(line(p, "01")).toMatchObject({ outcome: "kept", destination: { low: 414.72, high: 414.72 } });
  near(p.total.low, 20 + (93.2 - 20) + 11.6 + 414.72);
});

test("small workloads land on Hobby with included usage", () => {
  const small = Workload.parse({ ...workload, components: [comp("01", "aws:ec2:instance", 30, { vcpu: 1, memoryGb: 1 })] });
  const p = price(small, Assumptions.parse({}));
  expect(p.plan.name).toBe("Hobby");
  near(p.total.low, 5 + Math.max(0, 5.7 - 5));
});

test("nothing moving means no destination plan", () => {
  const p = price(workload, Assumptions.parse({ mustKeep: ["01", "02"] }));
  expect(p.plan.name).toBe("None");
  near(p.total.low, 414.72 + 185 + 11.6);
});
