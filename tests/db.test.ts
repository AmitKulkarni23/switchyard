import { expect, test } from "bun:test";
import { pgStore } from "../src/db";
import { Workload } from "../src/schema";

// Runs only against a real database: DATABASE_URL=postgres://... bun test tests/db.test.ts
test.skipIf(!process.env.DATABASE_URL)("share-link round trip through Postgres", async () => {
  const store = await pgStore(process.env.DATABASE_URL!);
  const w = Workload.parse({ provider: "AWS", format: "focus-csv", components: [], unparsed: [], excluded: [] });
  const id = await store.save(w);
  expect(id).toMatch(/^[A-Za-z0-9]{12}$/);
  expect(await store.load(id)).toEqual(w);
  expect(await store.load("missing123")).toBeUndefined();
});
