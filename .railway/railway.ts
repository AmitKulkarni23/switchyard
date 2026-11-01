import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    source: github("AmitKulkarni23/switchyard"),
    // Only code changes redeploy; docs and specs pushes don't.
    build: { watchPatterns: ["src/**", "package.json", "bun.lock", "tsconfig.json", "drizzle/**"] },
    start: "bun run src/server.ts",
    healthcheck: "/health",
    variables: {
      LLM_FALLBACK_ENABLED: "false",
    },
  });

  return project("switchyard", {
    resources: [web],
  });
});
