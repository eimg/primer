import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { extname, join, normalize, resolve } from "node:path";
import type { PrimerConfig } from "./config.js";
import { PrimerDatabase } from "./database.js";
import { createEmbeddingProvider } from "./embeddings.js";
import { PrimerServices } from "./services.js";

const SESSION_COOKIE = "primer_session";

type ErrorCategory = "request" | "configuration" | "source-processing" | "authorization" | "provider" | "evaluation" | "not-found" | "internal";

function sendJson(response: ServerResponse, status: number, value: unknown, headers: Record<string, string> = {}): void {
  response.writeHead(status, { "content-type": "application/json; charset=utf-8", ...headers });
  response.end(`${JSON.stringify(value)}\n`);
}

async function readJson(request: IncomingMessage): Promise<Record<string, unknown>> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of request) {
    const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    size += buffer.length;
    if (size > 1_000_000) throw new Error("Request body exceeds 1 MB.");
    chunks.push(buffer);
  }
  if (chunks.length === 0) return {};
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.concat(chunks).toString("utf8")) as unknown;
  } catch {
    throw new Error("JSON body is invalid.");
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("JSON body must be an object.");
  return parsed as Record<string, unknown>;
}

function cookies(request: IncomingMessage): Map<string, string> {
  return new Map(
    (request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [decodeURIComponent(part.slice(0, index)), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function requiredString(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} must be a non-empty string.`);
  return value.trim();
}

function stringArray(value: unknown, field: string): string[] {
  if (!Array.isArray(value) || value.some((item) => typeof item !== "string")) {
    throw new Error(`${field} must be an array of strings.`);
  }
  return value as string[];
}

function errorCategory(pathname: string, message: string): ErrorCategory {
  if (/active local session|Unknown user/.test(message)) return "authorization";
  if (/Unknown (?:source|synchronization|trace|evaluation)/.test(message)) return "not-found";
  if (/JSON|Request body|must be|Unknown groups?/.test(message)) return "request";
  if (/OPENROUTER_API_KEY|PRIMER_(?:EMBEDDING|CHAT)_MODEL/.test(message)) return "configuration";
  if (pathname.includes("/evaluations")) return "evaluation";
  if (pathname.includes("/sources") || pathname.includes("/syncs")) return "source-processing";
  if (/OpenRouter|embedding|model|provider/i.test(message)) return "provider";
  return "internal";
}

function errorStatus(category: ErrorCategory): number {
  if (category === "authorization") return 401;
  if (category === "not-found") return 404;
  if (category === "provider") return 502;
  if (category === "internal") return 500;
  return 400;
}

function mimeType(path: string): string {
  return {
    ".css": "text/css; charset=utf-8",
    ".html": "text/html; charset=utf-8",
    ".js": "text/javascript; charset=utf-8",
    ".json": "application/json; charset=utf-8",
    ".svg": "image/svg+xml",
  }[extname(path)] ?? "application/octet-stream";
}

function serveWeb(response: ServerResponse, pathname: string, webRoot: string): void {
  const relativePath = pathname === "/" ? "index.html" : normalize(pathname).replace(/^[/\\]+/, "");
  let filePath = resolve(webRoot, relativePath);
  if (!filePath.startsWith(`${resolve(webRoot)}/`) || !existsSync(filePath) || !statSync(filePath).isFile()) {
    filePath = join(webRoot, "index.html");
  }
  if (!existsSync(filePath)) {
    sendJson(response, 404, {
      schemaVersion: "primer.error.v1",
      error: { category: "not-found", message: "Web build not found. Run npm run build:web." },
    });
    return;
  }
  response.writeHead(200, { "content-type": mimeType(filePath) });
  createReadStream(filePath).pipe(response);
}

export interface PrimerHttpApp {
  server: Server;
  services: PrimerServices;
  close(): void;
}

export async function createPrimerHttpApp(
  config: PrimerConfig,
  options: { webRoot?: string; services?: PrimerServices } = {},
): Promise<PrimerHttpApp> {
  const database = options.services ? undefined : new PrimerDatabase(config.databasePath);
  const services = options.services ?? new PrimerServices(config, database!, createEmbeddingProvider(config));
  const report = await services.initialize();
  if (!report.valid) {
    database?.close();
    throw new Error("Fixture validation failed; run primer validate for details.");
  }
  const webRoot = resolve(options.webRoot ?? join(process.cwd(), "dist", "web"));

  const server = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://primer.local");
    const pathname = url.pathname;
    try {
      if (!pathname.startsWith("/api/")) {
        serveWeb(response, pathname, webRoot);
        return;
      }

      if (request.method === "GET" && pathname === "/api/health") {
        sendJson(response, 200, {
          schemaVersion: "primer.health.v1",
          status: "ok",
          applicationVersion: services.configuration().applicationVersion,
          storageSchemaVersion: services.configuration().storageSchemaVersion,
        });
        return;
      }
      if (request.method === "GET" && pathname === "/api/config") {
        sendJson(response, 200, services.configuration());
        return;
      }
      if (request.method === "GET" && pathname === "/api/accounts") {
        sendJson(response, 200, {
          schemaVersion: "primer.accounts.v1",
          users: services.listUsers(),
          groups: services.listGroups(),
        });
        return;
      }
      if (request.method === "POST" && pathname === "/api/session") {
        const body = await readJson(request);
        const result = services.createLocalSession(requiredString(body.userId, "userId"));
        const { id, ...session } = result.session;
        sendJson(response, 201, { schemaVersion: "primer.session.v1", session, user: result.user }, {
          "set-cookie": `${SESSION_COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Lax; Path=/`,
        });
        return;
      }

      const sessionId = cookies(request).get(SESSION_COOKIE);
      const active = sessionId ? services.getLocalSession(sessionId) : undefined;
      if (request.method === "DELETE" && pathname === "/api/session") {
        if (sessionId) services.deleteLocalSession(sessionId);
        sendJson(response, 200, { schemaVersion: "primer.session.v1", signedOut: true }, {
          "set-cookie": `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`,
        });
        return;
      }
      if (!active) throw new Error("An active local session is required.");
      if (request.method === "GET" && pathname === "/api/session") {
        const { id: _id, ...session } = active.session;
        sendJson(response, 200, { schemaVersion: "primer.session.v1", session, user: active.user });
        return;
      }

      const accountGroups = /^\/api\/accounts\/([^/]+)\/groups$/.exec(pathname);
      if (request.method === "PUT" && accountGroups) {
        const body = await readJson(request);
        const user = services.updateUserGroups(decodeURIComponent(accountGroups[1]!), stringArray(body.groupIds, "groupIds"));
        sendJson(response, 200, { schemaVersion: "primer.account.v1", user });
        return;
      }
      if (request.method === "GET" && pathname === "/api/sources/connectors") {
        sendJson(response, 200, { schemaVersion: "primer.connectors.v1", connectors: services.listConnectors() });
        return;
      }
      if (request.method === "GET" && pathname === "/api/sources/registrations") {
        sendJson(response, 200, {
          schemaVersion: "primer.source-registrations.v1",
          registrations: services.listSourceRegistrations(),
        });
        return;
      }
      if (request.method === "POST" && pathname === "/api/sources/registrations") {
        const body = await readJson(request);
        const registration = services.registerSource({
          connectorId: requiredString(body.connectorId, "connectorId"),
          path: requiredString(body.path, "path"),
        });
        sendJson(response, 201, { schemaVersion: "primer.source-registration.v1", registration });
        return;
      }
      const registrationRoute = /^\/api\/sources\/registrations\/([^/]+)$/.exec(pathname);
      if (registrationRoute && request.method === "GET") {
        sendJson(response, 200, services.inspectSourceRegistration(decodeURIComponent(registrationRoute[1]!)));
        return;
      }
      if (registrationRoute && request.method === "DELETE") {
        sendJson(response, 200, services.unregisterSource(decodeURIComponent(registrationRoute[1]!)));
        return;
      }
      const syncRegistrationRoute = /^\/api\/sources\/registrations\/([^/]+)\/sync$/.exec(pathname);
      if (syncRegistrationRoute && request.method === "POST") {
        const runs = await services.synchronize({ registrationId: decodeURIComponent(syncRegistrationRoute[1]!) });
        sendJson(response, 200, { schemaVersion: "primer.sync-results.v1", runs });
        return;
      }
      if (request.method === "GET" && pathname === "/api/sources") {
        sendJson(response, 200, { schemaVersion: "primer.sources.v1", sources: services.listSources() });
        return;
      }
      const sourceRoute = /^\/api\/sources\/([^/]+)$/.exec(pathname);
      if (sourceRoute && request.method === "GET") {
        sendJson(response, 200, { schemaVersion: "primer.source.v1", ...services.inspectSource(decodeURIComponent(sourceRoute[1]!)) });
        return;
      }
      if (sourceRoute && request.method === "DELETE") {
        sendJson(response, 200, services.removeSource(decodeURIComponent(sourceRoute[1]!)));
        return;
      }
      if (request.method === "GET" && pathname === "/api/syncs") {
        sendJson(response, 200, { schemaVersion: "primer.sync-runs.v1", runs: services.listSyncRuns() });
        return;
      }
      const syncRoute = /^\/api\/syncs\/([^/]+)$/.exec(pathname);
      if (request.method === "GET" && syncRoute) {
        sendJson(response, 200, { schemaVersion: "primer.sync-run.v1", run: services.getSyncRun(decodeURIComponent(syncRoute[1]!)) });
        return;
      }
      if (request.method === "GET" && pathname === "/api/traces") {
        sendJson(response, 200, { schemaVersion: "primer.traces.v1", traces: services.listTraces() });
        return;
      }
      const traceRoute = /^\/api\/traces\/([^/]+)$/.exec(pathname);
      if (request.method === "GET" && traceRoute) {
        sendJson(response, 200, { schemaVersion: "primer.trace.v1", trace: services.getTrace(decodeURIComponent(traceRoute[1]!)) });
        return;
      }
      if (request.method === "GET" && pathname === "/api/evaluations") {
        sendJson(response, 200, { schemaVersion: "primer.evaluation-runs.v1", runs: services.listEvaluationRuns() });
        return;
      }
      const evaluationRoute = /^\/api\/evaluations\/([^/]+)$/.exec(pathname);
      if (request.method === "GET" && evaluationRoute) {
        sendJson(response, 200, {
          schemaVersion: "primer.evaluation-run.v1",
          run: services.getEvaluationRun(decodeURIComponent(evaluationRoute[1]!)),
        });
        return;
      }
      sendJson(response, 404, {
        schemaVersion: "primer.error.v1",
        error: { category: "not-found", message: `Unknown API route: ${request.method} ${pathname}` },
      });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      const category = errorCategory(pathname, message);
      sendJson(response, errorStatus(category), { schemaVersion: "primer.error.v1", error: { category, message } });
    }
  });

  return {
    server,
    services,
    close() {
      database?.close();
    },
  };
}
