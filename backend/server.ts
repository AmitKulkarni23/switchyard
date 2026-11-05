import { S3Client } from "bun";
import { clientIp, createDesign, createEstimate, type Deps, getEstimate, limiter, MAX_UPLOAD_BYTES, slidingWindow } from "./api";
import { openRouterCaller } from "./design/openrouter";
import { pgStore } from "./db";
import { errorMessage, log } from "./log";
import index from "../frontend/index.html";

// Last resort: log anything nobody caught as one structured line, then exit so Railway restarts us.
const crash = (kind: string) => (err: unknown) => {
  log.error("unhandled_error", { kind, error: errorMessage(err), stack: err instanceof Error ? err.stack : undefined });
  process.exit(1);
};
process.on("uncaughtException", crash("uncaughtException"));
process.on("unhandledRejection", crash("unhandledRejection"));

function bucketFromEnv(env = process.env): Deps["bucket"] {
  const { BUCKET_NAME, BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_REGION } = env;
  const set = [BUCKET_NAME, BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY].filter(Boolean).length;
  if (set === 0) {
    log.info("bucket_not_configured", { effect: "uploads are parsed in memory only" });
    return undefined;
  }
  if (set < 4) throw new Error("Bucket config incomplete: set BUCKET_NAME, BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID and BUCKET_SECRET_ACCESS_KEY.");
  const s3 = new S3Client({ bucket: BUCKET_NAME, endpoint: BUCKET_ENDPOINT, accessKeyId: BUCKET_ACCESS_KEY_ID, secretAccessKey: BUCKET_SECRET_ACCESS_KEY, region: BUCKET_REGION || "auto" });
  return { write: (key, data) => s3.write(key, data), delete: (key) => s3.delete(key) };
}

async function storeFromEnv(url = process.env.DATABASE_URL): Promise<Deps["store"]> {
  if (!url) {
    log.warn("database_not_configured", { effect: "bill share links are disabled" });
    return undefined;
  }
  return pgStore(url);
}

const HOUR = 3_600_000;
const key = process.env.OPENROUTER_API_KEY;
if (!key) log.warn("openrouter_not_configured", { effect: "idea drafting is off; starter designs are shown instead" });
const deps: Deps = { bucket: bucketFromEnv(), store: await storeFromEnv(), caller: key ? openRouterCaller(key) : undefined, rateLimit: limiter(slidingWindow(10, HOUR), slidingWindow(100, HOUR)), uploadLimit: limiter(slidingWindow(20, HOUR), slidingWindow(200, HOUR)) };

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production", // production: minified bundle, no HMR
  maxRequestBodySize: MAX_UPLOAD_BYTES + 1024 * 1024,
  routes: {
    "/": index,
    "/health": new Response("ok"),
    // Synthetic demo bill for "Try a sample bill"; never a real one.
    "/sample-bill.pdf": () => new Response(Bun.file(`${import.meta.dir}/../tests/fixtures/aws-invoice.pdf`), { headers: { "content-type": "application/pdf", "x-content-type-options": "nosniff" } }),
    "/api/estimates": { POST: (req, srv) => createEstimate(req, deps, clientIp(req, srv.requestIP(req)?.address ?? "unknown")) },
    "/api/designs": { POST: (req, srv) => createDesign(req, clientIp(req, srv.requestIP(req)?.address ?? "unknown"), deps) },
    "/config": Response.json({ designs: !!key }),
    "/api/estimates/:id": { GET: (req) => getEstimate(req.params.id, deps) },
  },
  error(err) {
    log.error("unhandled_error", { kind: "request", error: err.message, stack: err.stack });
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  },
});

log.info("server_started", { url: server.url.href });

process.on("SIGTERM", () => {
  log.info("shutdown", { signal: "SIGTERM" });
  server.stop();
  process.exit(0);
});
