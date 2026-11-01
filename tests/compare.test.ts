import { expect, test } from "bun:test";
import { adapters } from "../backend/adapters";
import { compare } from "../backend/compare";
import { normalize } from "../backend/normalize";

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
