import { expect, test } from "bun:test";
import { Assumptions, FocusRow, Workload } from "../src/schema";

test("schemas parse a hand-written sample", () => {
  const row = FocusRow.parse({ BilledCost: 12.5, ChargeCategory: "Usage", ProviderName: "AWS", ServiceName: "Amazon Simple Queue Service" });
  expect(row.ChargeDescription).toBe("");
  const w = Workload.parse({
    provider: "AWS",
    format: "focus-csv",
    components: [{ id: "01", key: "aws:sqs", category: "queue", label: "SQS", sourceService: "SQS", size: {}, currentMonthlyCost: 12.5, rowCount: 1 }],
    unparsed: [],
    excluded: [],
  });
  expect(w.components[0]!.size.vcpu).toBe(0);
  expect(Assumptions.parse({}).utilization).toEqual({ low: 0.1, high: 0.5 });
  expect(() => Assumptions.parse({ utilization: { low: 0.6, high: 0.2 } })).toThrow();
});
