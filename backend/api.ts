import { compare } from "./compare";
import { UnsupportedFormatError } from "./detect";
import { analyze } from "./pipeline";
import { z } from "zod";
import { draftDesign, PANEL, PanelError, type Caller } from "./design/panel";
import type { Workload } from "./schema";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

/** The parts of Bun's S3Client we use: the private upload bucket. */
export type Bucket = { write(key: string, data: Uint8Array): Promise<unknown>; delete(key: string): Promise<unknown> };
/** Derived workloads only, never the raw bill. */
export type Store = {
  save(w: Workload): Promise<string>;
  load(id: string): Promise<Workload | undefined>;
  getDraft?(key: string): Promise<unknown>;
  saveDraft?(key: string, result: unknown, escalated: boolean): Promise<void>;
};
export type Deps = { bucket?: Bucket; store?: Store; caller?: Caller; rateLimit?: (key: string) => boolean };

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

const DesignRequest = z.strictObject({
  idea: z.string().trim().min(20, "Describe the idea in a sentence or two.").max(2000, "Keep the description under 2,000 characters."),
  requestsPerDay: z.number().min(0).max(1e9).optional(),
  dataGb: z.number().min(0).max(1e6).optional(),
});
const RULES_VERSION = "1";

/** POST /api/designs: idea → cheap pair → (tie-breaker) → merged draft. Only the idea text leaves the server. */
export async function createDesign(req: Request, ip: string, { caller, store, rateLimit }: Deps): Promise<Response> {
  if (!caller) return fail(503, "Model drafting isn't set up on this deployment. Start from a starter design instead.");
  const parsed = DesignRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const input = parsed.data;

  const key = new Bun.CryptoHasher("sha256").update(JSON.stringify([RULES_VERSION, PANEL, input.idea.toLowerCase(), input.requestsPerDay, input.dataGb])).digest("hex");
  const cached = await store?.getDraft?.(key).catch(() => undefined);
  if (cached) return json({ ...(cached as object), cached: true });

  if (rateLimit && !rateLimit(ip)) return fail(429, "That's a lot of drafts. Try again in an hour, or start from a starter design.");
  try {
    const result = await draftDesign(input, caller, PANEL, req.signal);
    console.log(`design drafted: ${result.parts.length} parts, escalated=${result.escalated}, models ${result.models.map((m) => `${m.model}:${m.ok ? "ok" : "fail"}`).join(" ")}`);
    await store?.saveDraft?.(key, result, result.escalated).catch((e) => console.error("draft cache save failed:", e instanceof Error ? e.message : e));
    return json(result);
  } catch (e) {
    if (e instanceof PanelError) {
      console.error("design panel failed:", e.detail); // provider errors stay in logs; never the idea text
      return fail(502, e.message);
    }
    throw e;
  }
}

/** ponytail: in-memory sliding window per replica; move to Postgres or Redis if we run more than one replica. */
export function slidingWindow(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return hits.set(key, recent), false;
    hits.set(key, [...recent, now]);
    return true;
  };
}
