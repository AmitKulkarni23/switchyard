import { bucket, defineRailway, github, postgres, preserve, project, ref, service } from "railway/iac";

export default defineRailway(() => {
  const db = postgres("postgres");
  // Private bucket for uploads; each object is deleted right after parsing.
  const uploads = bucket("uploads", { region: "sjc" });

  const app = service("switchyard", {
    source: github("AmitKulkarni23/switchyard"),
    // Only code changes redeploy; docs and specs pushes don't.
    build: { watchPatterns: ["backend/**", "frontend/**", "package.json", "bun.lock", "tsconfig.json", "drizzle/**"] },
    start: "bun run backend/server.ts",
    healthcheck: "/health",
    variables: {
      NODE_ENV: "production",
      LLM_FALLBACK_ENABLED: "false",
      // Set as a sealed variable in the dashboard; preserve() keeps applies from removing it. Optional: without it, ideas start from starter designs.
      OPENROUTER_API_KEY: preserve(),
      DATABASE_URL: db.env.DATABASE_URL,
      BUCKET_NAME: ref(uploads, "BUCKET"),
      BUCKET_ENDPOINT: ref(uploads, "ENDPOINT"),
      BUCKET_REGION: "auto", // S3 signing region; the bucket's REGION output is the location (sjc)
      BUCKET_ACCESS_KEY_ID: ref(uploads, "ACCESS_KEY_ID"),
      BUCKET_SECRET_ACCESS_KEY: ref(uploads, "SECRET_ACCESS_KEY"),
    },
  });

  return project("SwitchYard", {
    resources: [db, uploads, app],
  });
});
