import { S3Client } from "bun";
import { createEstimate, type Deps, getEstimate, MAX_UPLOAD_BYTES } from "./api";
import index from "./frontend/index.html";

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

const deps: Deps = { bucket: bucketFromEnv() };

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  maxRequestBodySize: MAX_UPLOAD_BYTES + 1024 * 1024,
  routes: {
    "/": index,
    "/health": new Response("ok"),
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
