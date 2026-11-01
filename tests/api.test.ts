import { expect, test } from "bun:test";
import { type Bucket, createEstimate, getEstimate, MAX_UPLOAD_BYTES, type Store } from "../src/api";
import type { Workload } from "../src/schema";

const upload = (data: BlobPart, name = "bill.bin") => {
  const form = new FormData();
  form.append("file", new Blob([data]), name);
  return new Request("http://x/api/estimates", { method: "POST", body: form });
};
const fixture = (name: string) => Bun.file(`${import.meta.dir}/fixtures/${name}`).arrayBuffer();

function fakeBucket() {
  const objects = new Map<string, Uint8Array>();
  const log: string[] = [];
  const bucket: Bucket = {
    write: async (k, d) => (objects.set(k, d), log.push(`write ${k}`)),
    delete: async (k) => (objects.delete(k), log.push(`delete ${k}`)),
  };
  return { bucket, objects, log };
}
function memoryStore(): Store {
  const m = new Map<string, Workload>();
  return { save: async (w) => (m.set("abc123", w), "abc123"), load: async (id) => m.get(id) };
}

test("parses a bill, deletes the upload, returns an estimate", async () => {
  const { bucket, objects, log } = fakeBucket();
  const res = await createEstimate(upload(await fixture("aws-invoice.pdf"), "anything.txt"), { bucket, store: memoryStore() });
  expect(res.status).toBe(201);
  const body = await res.json();
  expect(body.id).toBe("abc123");
  expect(body.workload.format).toBe("aws-invoice-pdf");
  expect(body.estimate.destination).toBe("railway");
  expect(objects.size).toBe(0);
  expect(log).toHaveLength(2);
  expect(log[1]).toStartWith("delete uploads/");
});

test("unsupported content → 415, and the upload is still deleted", async () => {
  const { bucket, objects } = fakeBucket();
  const res = await createEstimate(upload("name,email\nada,a@b.c\n", "bill.csv"), { bucket });
  expect(res.status).toBe(415);
  expect((await res.json()).error).toMatch(/Unsupported file/);
  expect(objects.size).toBe(0);
});

test("too large → 413, empty → 400, missing field → 400", async () => {
  expect((await createEstimate(upload(new Uint8Array(MAX_UPLOAD_BYTES + 1)), {})).status).toBe(413);
  expect((await createEstimate(upload(new Uint8Array(0)), {})).status).toBe(400);
  expect((await createEstimate(new Request("http://x", { method: "POST", body: "hi" }), {})).status).toBe(400);
});

test("share links: load by id, 404 for unknown, 503 when disabled", async () => {
  const store = memoryStore();
  await createEstimate(upload(await fixture("focus.csv")), { store });
  const res = await getEstimate("abc123", { store });
  expect(res.status).toBe(200);
  expect((await res.json()).estimate.current).toBeGreaterThan(0);
  expect((await getEstimate("nope-nope", { store })).status).toBe(404);
  expect((await getEstimate("../etc", { store })).status).toBe(404);
  expect((await getEstimate("abc123", {})).status).toBe(503);
});
