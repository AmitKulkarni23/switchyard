import { expect, spyOn, test } from "bun:test";
import { type Bucket, createEstimate, fitsStore, getEstimate, limiter, MAX_UPLOAD_BYTES, slidingWindow, type Store } from "../backend/api";
import { pdfLines } from "../backend/adapters/pdf-text";
import type { Workload } from "../backend/schema";

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
  await createEstimate(upload(await fixture("aws-invoice.pdf")), { store });
  const res = await getEstimate("abc123", { store });
  expect(res.status).toBe(200);
  expect((await res.json()).estimate.current).toBeGreaterThan(0);
  expect((await getEstimate("nope-nope", { store })).status).toBe(404);
  expect((await getEstimate("../etc", { store })).status).toBe(404);
  expect((await getEstimate("abc123", {})).status).toBe(503);
});

test("uploads are rate limited before anything is read", async () => {
  const { bucket, log } = fakeBucket();
  const deps = { bucket, uploadLimit: limiter(slidingWindow(1, 60_000), slidingWindow(100, 60_000)) };
  await createEstimate(upload("name,email\nada,a@b.c\n"), deps, "1.1.1.1");
  const before = log.length;
  const res = await createEstimate(upload("name,email\nada,a@b.c\n"), deps, "1.1.1.1");
  expect(res.status).toBe(429);
  expect(log.length).toBe(before);
  expect((await createEstimate(upload(""), deps, "2.2.2.2")).status).toBe(400); // someone else isn't affected
});

test("a PDF is parsed once however many times its lines are read", async () => {
  const bytes = new Uint8Array(await fixture("aws-invoice.pdf"));
  expect(await pdfLines(bytes)).toBe(await pdfLines(bytes));
});

test("a workload too big to store gets no share link", () => {
  const line = (i: number) => ({ description: `line ${i}`, service: "Unmapped", cost: 0.01, reason: "no mapping" });
  const workload = (n: number): Workload => ({ provider: "AWS", format: "aws-invoice-pdf", components: [], excluded: [], unparsed: Array.from({ length: n }, (_, i) => line(i)) });
  expect(fitsStore(workload(10))).toBe(true);
  expect(fitsStore(workload(20_000))).toBe(false);
});

test("CSV exports are refused for now, with a pointer to the PDF", async () => {
  for (const file of ["aws-cur.csv", "focus.csv"]) {
    const { bucket, objects } = fakeBucket();
    const res = await createEstimate(upload(await fixture(file)), { bucket });
    expect(res.status).toBe(415);
    expect((await res.json()).error).toBe("Unsupported file: CSV exports aren't supported yet. SwitchYard reads AWS invoice PDFs, which you can download from the AWS Billing console.");
    expect(objects.size).toBe(0); // still deleted
  }
});

/** Runs fn and returns the JSON log lines it wrote. */
async function logsOf(fn: () => Promise<unknown>) {
  const out = spyOn(console, "log").mockImplementation(() => {});
  out.mockClear();
  try {
    await fn();
    return out.mock.calls.map((c) => JSON.parse(String(c[0])) as Record<string, unknown>);
  } finally {
    out.mockRestore();
  }
}

test("rejected files log a fixed reason and the request id, never the content", async () => {
  const withId = (data: BlobPart) => {
    const form = new FormData();
    form.append("file", new Blob([data]), "x");
    return new Request("http://x", { method: "POST", body: form, headers: { "x-railway-request-id": "req-1" } });
  };
  const notInvoice = await logsOf(() => createEstimate(withId("name,email\nada-secret,a@b.c\n"), {}));
  expect(notInvoice).toEqual([expect.objectContaining({ level: "info", event: "upload_rejected", reason: "not_pdf", requestId: "req-1" })]);
  expect(JSON.stringify(notInvoice)).not.toContain("ada-secret");
  const broken = await logsOf(() => createEstimate(withId("%PDF-1.4 secret-text garbage"), {}));
  expect(broken[0]).toMatchObject({ event: "upload_rejected", reason: "pdf_unreadable" });
  expect(broken[0]!.errorType).toBeString();
  expect(JSON.stringify(broken)).not.toContain("secret-text");
  const csv = await logsOf(async () => createEstimate(withId(await fixture("focus.csv")), {}));
  expect(csv[0]).toMatchObject({ event: "upload_rejected", reason: "csv_disabled" });
});

test("a parsed bill logs its counts", async () => {
  const lines = await logsOf(async () => createEstimate(upload(await fixture("aws-invoice.pdf")), {}));
  expect(lines[0]).toMatchObject({ level: "info", event: "upload_parsed", format: "aws-invoice-pdf", notPriced: 0 });
  expect(lines[0]!.components).toBeGreaterThan(0);
});

test("a bucket outage is reported as ours, not as a bad bill", async () => {
  const deleted: string[] = [];
  const bucket: Bucket = { write: async () => { throw new Error("S3 down"); }, delete: async (k) => void deleted.push(k) };
  let res!: Response;
  const lines = await logsOf(async () => (res = await createEstimate(upload(await fixture("aws-invoice.pdf")), { bucket })));
  expect(res.status).toBe(500);
  expect((await res.json()).error).toContain("on our side");
  expect(lines[0]).toMatchObject({ level: "error", event: "upload_store_failed", error: "S3 down" });
  expect(deleted).toHaveLength(1);
});

test("failed deletes and saves are logged as errors", async () => {
  const bucket: Bucket = { write: async () => {}, delete: async () => { throw new Error("delete refused"); } };
  const store: Store = { save: async () => { throw new Error("db down"); }, load: async () => undefined };
  const lines = await logsOf(async () => createEstimate(upload(await fixture("aws-invoice.pdf")), { bucket, store }));
  expect(lines.map((l) => [l.level, l.event])).toEqual([["error", "upload_delete_failed"], ["info", "upload_parsed"], ["error", "estimate_save_failed"]]);
});
