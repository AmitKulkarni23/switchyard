import { defineRailway, github, project, service } from "railway/iac";

export default defineRailway(() => {
  const web = service("web", {
    source: github("AmitKulkarni23/switchyard"),
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
