import { expect, test } from "bun:test";
import { adapters } from "../backend/adapters";
import { compare, estimateBasis } from "../backend/compare";
import { normalize } from "../backend/normalize";
import { Workload } from "../backend/schema";

test("bill → estimate end to end (CUR fixture)", async () => {
  const bytes = new Uint8Array(await Bun.file(`${import.meta.dir}/fixtures/aws-cur.csv`).arrayBuffer());
  const w = normalize({ format: "aws-cur-csv", ...(await adapters["aws-cur-csv"](bytes)) });
  const e = compare(w);

  expect(e.destination).toBe("railway");
  expect(e.plan.name).toBe("Pro");
  expect(e.current).toBe(1179.43); // every usage line is mapped
  expect(e.notPriced).toEqual([]);
  expect(e.excluded).toHaveLength(1);
  expect(e.disappears.map((l) => l.label).sort()).toEqual(["AWS Support", "CloudWatch", "Inter-AZ / regional transfer", "Load balancers", "NAT gateway", "S3 requests"]);
  expect(e.noEquivalent.map((l) => l.label).sort()).toEqual(["DynamoDB", "Kinesis", "SQS"]);
  expect(e.destinationTotal.low).toBeLessThan(e.destinationTotal.high);
  expect(e.difference.low).toBe(Math.round((e.current - e.destinationTotal.high) * 100) / 100);

  const busy = compare(w, { utilization: { low: 0.3, high: 0.3 } });
  expect(busy.destinationTotal.low).toBe(busy.destinationTotal.high);
  expect(() => compare(w, { destination: "mars" })).toThrow(/Unknown destination/);
});

test("estimate basis splits bill facts from assumptions, for parts that move", () => {
  const comp = (id: string, label: string, key: string, size: object, usageBased = false) => ({ id, key, category: "x", label, sourceService: "AWS", size, currentMonthlyCost: 1, rowCount: 1, usageBased });
  const w = Workload.parse({
    provider: "AWS", format: "focus-csv", unparsed: [], excluded: [],
    components: [
      comp("01", "EC2 t3.small", "aws:ec2:instance", { vcpu: 2, memoryGb: 2 }),
      comp("02", "Aurora", "aws:rds:postgres", { vcpu: 0.25, memoryGb: 2, storageGb: 1 }, true),
      comp("03", "Transfer", "aws:data-transfer:internet", { egressGb: 5 }),
      comp("04", "NAT gateway", "aws:vpc:nat-gateway", {}),
    ],
  });
  expect(estimateBasis(w, compare(w).lines)).toEqual({ fromBill: ["server sizes and hours", "serverless database usage", "storage", "egress"], assumed: ["EC2 t3.small"] });
  // a server kept on AWS isn't estimated any more, so nothing is left to assume
  expect(estimateBasis(w, compare(w, { mustKeep: ["01"] }).lines)).toEqual({ fromBill: ["serverless database usage", "storage", "egress"], assumed: [] });
});
