import { S3Client } from "bun";
import { createEstimate, type Deps, getEstimate, MAX_UPLOAD_BYTES } from "./api";
import { pgStore } from "./db";
import index from "../frontend/index.html";

function bucketFromEnv(env = process.env): Deps["bucket"] {
  const { BUCKET_NAME, BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY, BUCKET_REGION } = env;
  const set = [BUCKET_NAME, BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID, BUCKET_SECRET_ACCESS_KEY].filter(Boolean).length;
  if (set === 0) {
    console.log("No bucket configured: uploads are parsed in memory only.");
    return undefined;
  }
  if (set < 4) throw new Error("Bucket config incomplete: set BUCKET_NAME, BUCKET_ENDPOINT, BUCKET_ACCESS_KEY_ID and BUCKET_SECRET_ACCESS_KEY.");
  const s3 = new S3Client({ bucket: BUCKET_NAME, endpoint: BUCKET_ENDPOINT, accessKeyId: BUCKET_ACCESS_KEY_ID, secretAccessKey: BUCKET_SECRET_ACCESS_KEY, region: BUCKET_REGION || "auto" });
  return { write: (key, data) => s3.write(key, data), delete: (key) => s3.delete(key) };
}

async function storeFromEnv(url = process.env.DATABASE_URL): Promise<Deps["store"]> {
  if (!url) {
    console.log("DATABASE_URL not set: share links are disabled.");
    return undefined;
  }
  return pgStore(url);
}

const deps: Deps = { bucket: bucketFromEnv(), store: await storeFromEnv() };

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  development: process.env.NODE_ENV !== "production", // production: minified bundle, no HMR
  maxRequestBodySize: MAX_UPLOAD_BYTES + 1024 * 1024,
  routes: {
    "/": index,
    "/health": new Response("ok"),
    // Synthetic demo bill for "Try a sample bill"; never a real one.
    "/sample-bill.pdf": () => new Response(Bun.file(`${import.meta.dir}/../tests/fixtures/aws-invoice.pdf`), { headers: { "content-type": "application/pdf" } }),
    "/api/estimates": { POST: (req) => createEstimate(req, deps) },
    "/api/estimates/:id": { GET: (req) => getEstimate(req.params.id, deps) },
  },
  error(err) {
    console.error("unhandled:", err.message);
    return Response.json({ error: "Something went wrong." }, { status: 500 });
  },
});

console.log(`SwitchYard listening on ${server.url}`);

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
