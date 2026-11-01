import { compare } from "./compare";
import { UnsupportedFormatError } from "./detect";
import { analyze } from "./pipeline";
import type { Workload } from "./schema";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The parts of Bun's S3Client we use: the private upload bucket. */
export type Bucket = { write(key: string, data: Uint8Array): Promise<unknown>; delete(key: string): Promise<unknown> };
/** Derived workloads only, never the raw bill. */
export type Store = { save(w: Workload): Promise<string>; load(id: string): Promise<Workload | undefined> };
export type Deps = { bucket?: Bucket; store?: Store };

const json = (body: unknown, status = 200) => Response.json(body, { status });
const fail = (status: number, error: string) => json({ error }, status);

/** POST /api/estimates: multipart `file` → { id, workload, estimate }. The upload is deleted right after parsing. */
export async function createEstimate(req: Request, { bucket, store }: Deps): Promise<Response> {
  if (Number(req.headers.get("content-length") ?? 0) > MAX_UPLOAD_BYTES + 64 * 1024) return fail(413, "File too large. The limit is 10 MB.");
  let file: FormDataEntryValue | null;
  try {
    file = (await req.formData()).get("file");
  } catch {
    return fail(400, "Send the bill as multipart form data in a field named 'file'.");
  }
  if (!(file instanceof Blob)) return fail(400, "Send the bill as multipart form data in a field named 'file'.");
  if (file.size > MAX_UPLOAD_BYTES) return fail(413, "File too large. The limit is 10 MB.");
  if (file.size === 0) return fail(400, "The file is empty.");

  const bytes = new Uint8Array(await file.arrayBuffer());
  const key = `uploads/${crypto.randomUUID()}`;
  let workload: Workload;
  try {
    if (bucket) await bucket.write(key, bytes);
    workload = await analyze(bytes);
  } catch (err) {
    if (err instanceof UnsupportedFormatError) return fail(415, err.message);
    console.error("parse failed:", err instanceof Error ? err.message : "unknown error"); // never log bill content
    return fail(422, "We recognised the format but could not read this bill.");
  } finally {
    if (bucket) await bucket.delete(key).catch((e) => console.error(`bucket delete failed for ${key}:`, e instanceof Error ? e.message : e));
  }

  console.log(`parsed ${workload.format}: ${workload.components.length} components, ${workload.unparsed.length} not priced`);
  const id = store ? await store.save(workload).catch((e) => (console.error("save failed:", e instanceof Error ? e.message : e), null)) : null;
  return json({ id, workload, estimate: compare(workload) }, 201);
}

/** GET /api/estimates/:id → { id, workload, estimate } for share links. */
export async function getEstimate(id: string, { store }: Deps): Promise<Response> {
  if (!store) return fail(503, "Share links are not enabled on this deployment.");
  if (!/^[A-Za-z0-9_-]{6,32}$/.test(id)) return fail(404, "Not found.");
  const workload = await store.load(id);
  return workload ? json({ id, workload, estimate: compare(workload) }) : fail(404, "Not found.");
}
