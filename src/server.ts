import index from "./frontend/index.html";

const server = Bun.serve({
  port: Number(process.env.PORT ?? 3000),
  routes: {
    "/": index,
    "/health": new Response("ok"),
  },
});

console.log(`SwitchYard listening on ${server.url}`);

process.on("SIGTERM", () => {
  server.stop();
  process.exit(0);
});
