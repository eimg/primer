#!/usr/bin/env node
import { loadConfig } from "./config.js";
import { createPrimerHttpApp } from "./http.js";

const port = Number(process.env.PRIMER_PORT ?? 4318);
if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("PRIMER_PORT must be a valid TCP port.");
const host = process.env.PRIMER_HOST ?? "127.0.0.1";
const app = await createPrimerHttpApp(loadConfig());

app.server.listen(port, host, () => {
  process.stdout.write(`Primer API and web server listening at http://${host}:${port}\n`);
});

const shutdown = () => {
  app.server.close(() => {
    app.close();
    process.exit(0);
  });
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
