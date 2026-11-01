import { bucket, defineRailway, github, postgres, project, ref, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("postgres");
  // Private bucket for uploads; each object is deleted right after parsing.
  const uploads = bucket("uploads", { region: "sjc" });

  const web = service("web", {
    source: github("AmitKulkarni23/switchyard"),
    // Only code changes redeploy; docs and specs pushes don't.
    build: { watchPatterns: ["backend/**", "frontend/**", "package.json", "bun.lock", "tsconfig.json", "drizzle/**"] },
    start: "bun run backend/server.ts",
    healthcheck: "/health",
    variables: {
      LLM_FALLBACK_ENABLED: "false",
      DATABASE_URL: db.env.DATABASE_URL,
      BUCKET_NAME: ref(uploads, "BUCKET"),
      BUCKET_ENDPOINT: ref(uploads, "ENDPOINT"),
      BUCKET_REGION: "auto", // S3 signing region; the bucket's REGION output is the location (sjc)
      BUCKET_ACCESS_KEY_ID: ref(uploads, "ACCESS_KEY_ID"),
      BUCKET_SECRET_ACCESS_KEY: ref(uploads, "SECRET_ACCESS_KEY"),
    },
  });

  return project("switchyard", {
    resources: [db, uploads, web],
  });
});
