import { compare } from "./compare";
import { UnsupportedFormatError } from "./detect";
import { analyzeIsolated, ParseFailedError } from "./pipeline";
import { errorMessage, log } from "./log";
import { z } from "zod";
import { IDEA_MAX } from "./design/parts";
import { draftDesign, PANEL, PanelError, type Caller, type PanelResult } from "./design/panel";
import type { Workload } from "./schema";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;
/** A huge bill still gets its result, just no share link; bounds what uploads can add to Postgres. */
export const fitsStore = (w: Workload) => JSON.stringify(w).length <= 1024 * 1024;

/** The parts of Bun's S3Client we use: the private upload bucket. */
export type Bucket = { write(key: string, data: Uint8Array): Promise<unknown>; delete(key: string): Promise<unknown> };
/** Derived workloads only, never the raw bill. */
export type Store = {
  save(w: Workload): Promise<string>;
  load(id: string): Promise<Workload | undefined>;
  getDraft?(key: string): Promise<unknown>;
  saveDraft?(key: string, result: unknown, escalated: boolean): Promise<void>;
};
export type Deps = { bucket?: Bucket; store?: Store; caller?: Caller; rateLimit?: (key: string) => boolean; uploadLimit?: (key: string) => boolean };

const json = (body: unknown, status = 200) => Response.json(body, { status, headers: { "x-content-type-options": "nosniff" } });
const fail = (status: number, error: string) => json({ error }, status);

/** POST /api/estimates: multipart `file` → { id, workload, estimate }. The upload is deleted right after parsing. */
export async function createEstimate(req: Request, { bucket, store, uploadLimit }: Deps, ip = "unknown"): Promise<Response> {
  if (uploadLimit && !uploadLimit(ip)) return fail(429, "That's a lot of uploads. Try again in an hour.");
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
  const requestId = req.headers.get("x-railway-request-id");
  let workload: Workload;
  try {
    if (bucket) {
      try {
        await bucket.write(key, bytes);
      } catch (err) {
        log.error("upload_store_failed", { requestId, key, error: errorMessage(err) });
        return fail(500, "Something went wrong on our side. Try again in a moment.");
      }
    }
    workload = await analyzeIsolated(bytes);
  } catch (err) {
    if (err instanceof UnsupportedFormatError) {
      log.info("upload_rejected", { requestId, reason: err.reason, errorType: err.errorType });
      return fail(415, err.message);
    }
    log.error("parse_failed", { requestId, ...(err instanceof ParseFailedError ? err.fields : { reason: "spawn_failed", errorType: err instanceof Error ? err.name : "unknown" }) }); // never bill content
    return fail(422, "We recognised the format but could not read this bill.");
  } finally {
    if (bucket) await bucket.delete(key).catch((e) => log.error("upload_delete_failed", { requestId, key, error: errorMessage(e) })); // a bill may still be in the bucket
  }

  log.info("upload_parsed", { requestId, format: workload.format, components: workload.components.length, notPriced: workload.unparsed.length });
  const id = store && fitsStore(workload) ? await store.save(workload).catch((e) => (log.error("estimate_save_failed", { requestId, error: errorMessage(e) }), null)) : null;
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
  idea: z.string().trim().min(20, "Describe the idea in a sentence or two.").max(IDEA_MAX, `Keep the description to ${IDEA_MAX.toLocaleString("en-US")} characters.`),
  requestsPerDay: z.number().min(0).max(1e9).optional(),
  dataGb: z.number().min(0).max(1e6).optional(),
});
const RULES_VERSION = "4"; // bump whenever rules.md or the draft schema changes: invalidates cached drafts

const respond = (r: PanelResult & { cached?: boolean }) => (r.describesProduct ? json(r) : fail(422, "That doesn't look like a product description. Say what you're building and who uses it."));

/** POST /api/designs: idea → cheap pair → (tie-breaker) → merged draft. Only the idea text leaves the server. */
export async function createDesign(req: Request, ip: string, { caller, store, rateLimit }: Deps): Promise<Response> {
  if (!caller) return fail(503, "Model drafting isn't set up on this deployment. Start from a starter design instead.");
  const parsed = DesignRequest.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return fail(400, parsed.error.issues[0]?.message ?? "Invalid request.");
  const input = parsed.data;

  const requestId = req.headers.get("x-railway-request-id");
  const key = new Bun.CryptoHasher("sha256").update(JSON.stringify([RULES_VERSION, PANEL, input.idea.toLowerCase(), input.requestsPerDay, input.dataGb])).digest("hex");
  const cached = await store?.getDraft?.(key).catch((e) => log.warn("draft_cache_read_failed", { requestId, error: errorMessage(e) }));
  if (cached) return respond({ ...(cached as PanelResult), cached: true });

  if (rateLimit && !rateLimit(ip)) return fail(429, "That's a lot of drafts. Try again in an hour, or start from a starter design.");
  try {
    const result = await draftDesign(input, caller, PANEL, req.signal);
    log[result.models.every((m) => m.ok) ? "info" : "warn"]("design_drafted", { requestId, parts: result.parts.length, describesProduct: result.describesProduct, escalated: result.escalated, disputes: result.disputes, models: result.models });
    await store?.saveDraft?.(key, result, result.escalated).catch((e) => log.warn("draft_cache_save_failed", { requestId, error: errorMessage(e) }));
    return respond(result);
  } catch (e) {
    if (e instanceof PanelError) {
      log.error("design_panel_failed", { requestId, error: e.detail }); // provider errors stay in logs; never the idea text
      return fail(502, e.message);
    }
    throw e;
  }
}

/** Railway's edge sets X-Real-IP. Never X-Forwarded-For: Railway doesn't document it and its first value can come from the client. */
export const clientIp = (req: Request, fallback: string) => req.headers.get("x-real-ip")?.trim() || fallback;

/** Per person, plus a cap on everyone that bounds the cost even if an IP can be faked or rotated. */
export function limiter(perIp: (key: string) => boolean, overall: (key: string) => boolean) {
  return (ip: string) => perIp(ip) && overall("all");
}

/** ponytail: in-memory sliding window per replica; move to Postgres or Redis if we run more than one replica. */
export function slidingWindow(limit: number, windowMs: number) {
  const hits = new Map<string, number[]>();
  return (key: string) => {
    const now = Date.now();
    if (hits.size > 10_000) hits.clear(); // rotating IPs can't grow this without bound
    const recent = (hits.get(key) ?? []).filter((t) => now - t < windowMs);
    if (recent.length >= limit) return hits.set(key, recent), false;
    hits.set(key, [...recent, now]);
    return true;
  };
}
