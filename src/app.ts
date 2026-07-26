import type { Server } from "node:http";
import { createServer } from "node:http";
import express, {
  type Express,
  type NextFunction,
  type Request,
  type RequestHandler,
  type Response,
} from "express";
import type { PrimerConfig } from "./config.js";
import { createAnswerProvider } from "./answers.js";
import { PrimerDatabase } from "./database.js";
import { createEmbeddingProvider } from "./embeddings.js";
import { createQueryPlanner } from "./planner.js";
import { PrimerServices } from "./services.js";
import { attachHmr, webAssets, webIndex } from "./webAssets.js";

const SESSION_COOKIE = "primer_session";

type ErrorCategory = "request" | "configuration" | "source-processing" | "authorization" | "provider" | "evaluation" | "not-found" | "internal";

type ActiveSession = NonNullable<ReturnType<PrimerServices["getLocalSession"]>>;

function body(request: Request): Record<string, unknown> {
  return (request.body ?? {}) as Record<string, unknown>;
}

function cookies(request: Request): Map<string, string> {
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

/** Set by requireSession, so every route below it can read the caller without re-checking. */
function active(response: Response): ActiveSession {
  return response.locals.active as ActiveSession;
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

function optionalString(value: unknown, field: string): string | undefined {
  if (value === undefined || value === null || value === "") return undefined;
  return requiredString(value, field);
}

function optionalObject(value: unknown, field: string): Record<string, unknown> | undefined {
  if (value === undefined) return undefined;
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${field} must be an object.`);
  return value as Record<string, unknown>;
}

function evidenceLimit(value: unknown): number {
  if (value === undefined) return 5;
  if (!Number.isInteger(value) || (value as number) < 1 || (value as number) > 10) {
    throw new Error("limit must be an integer from 1 to 10.");
  }
  return value as number;
}

function streamEvent(response: Response, value: unknown): void {
  response.write(`${JSON.stringify(value)}\n`);
}

function answerChunks(answer: string): string[] {
  const words = answer.match(/\S+\s*/g) ?? [answer];
  const chunks: string[] = [];
  for (let index = 0; index < words.length; index += 8) chunks.push(words.slice(index, index + 8).join(""));
  return chunks;
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

/**
 * Restates body-parser failures in the wording errorCategory already classifies, so a
 * malformed or oversized body stays a "request" error rather than falling through to 500.
 */
function bodyErrorMessage(error: unknown): string | undefined {
  const type = (error as { type?: unknown } | null)?.type;
  if (type === "entity.parse.failed") return "JSON body is invalid.";
  if (type === "entity.too.large") return "Request body exceeds 1 MB.";
  return undefined;
}

export interface PrimerHttpApp {
  server: Server;
  services: PrimerServices;
  close(): void;
}

export function createApp(services: PrimerServices): Express {
  const app = express();
  app.disable("x-powered-by");
  app.use(express.json({ limit: "1mb" }));
  app.use((request, _response, next) => {
    const parsed: unknown = request.body;
    if (parsed !== undefined && (typeof parsed !== "object" || parsed === null || Array.isArray(parsed))) {
      next(new Error("JSON body must be an object."));
      return;
    }
    next();
  });
  app.use(webAssets());

  app.get("/api/health", (_request, response) => {
    response.json({
      schemaVersion: "primer.health.v1",
      status: "ok",
      applicationVersion: services.configuration().applicationVersion,
      storageSchemaVersion: services.configuration().storageSchemaVersion,
    });
  });

  app.get("/api/config", (_request, response) => {
    response.json(services.configuration());
  });

  app.get("/api/accounts", async (_request, response) => {
    response.json({
      schemaVersion: "primer.accounts.v1",
      users: services.listUsers(),
      groups: services.listGroups(),
      projects: await services.listProjects(),
    });
  });

  app.post("/api/session", (request, response) => {
    const result = services.createLocalSession(requiredString(body(request).userId, "userId"));
    const { id, ...session } = result.session;
    response
      .status(201)
      .set("set-cookie", `${SESSION_COOKIE}=${encodeURIComponent(id)}; HttpOnly; SameSite=Lax; Path=/`)
      .json({ schemaVersion: "primer.session.v1", session, user: result.user });
  });

  app.delete("/api/session", (request, response) => {
    const sessionId = cookies(request).get(SESSION_COOKIE);
    if (sessionId) services.deleteLocalSession(sessionId);
    response
      .set("set-cookie", `${SESSION_COOKIE}=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0`)
      .json({ schemaVersion: "primer.session.v1", signedOut: true });
  });

  const requireSession: RequestHandler = (request, response, next) => {
    const sessionId = cookies(request).get(SESSION_COOKIE);
    const session = sessionId ? services.getLocalSession(sessionId) : undefined;
    if (!session) {
      next(new Error("An active local session is required."));
      return;
    }
    response.locals.active = session;
    next();
  };
  app.use("/api", requireSession);

  app.get("/api/session", (_request, response) => {
    const { id: _id, ...session } = active(response).session;
    response.json({ schemaVersion: "primer.session.v1", session, user: active(response).user });
  });

  app.post("/api/chat", async (request, response) => {
    response.writeHead(200, {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store",
      "x-content-type-options": "nosniff",
    });
    try {
      const projectId = optionalString(body(request).projectId, "projectId");
      const answer = await services.ask(
        {
          question: requiredString(body(request).question, "question"),
          userId: active(response).user.id,
          ...(projectId ? { projectId } : {}),
          limit: evidenceLimit(body(request).limit),
        },
        { onProgress: (event) => streamEvent(response, { type: "status", ...event }) },
      );
      for (const text of answerChunks(answer.answer)) {
        streamEvent(response, { type: "delta", text });
        await new Promise<void>((resolve) => setImmediate(resolve));
      }
      streamEvent(response, { type: "result", answer });
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : String(cause);
      streamEvent(response, { type: "error", error: { category: errorCategory(request.path, message), message } });
    }
    response.end();
  });

  app.put("/api/accounts/:userId/groups", (request, response) => {
    const user = services.updateUserGroups(request.params.userId, stringArray(body(request).groupIds, "groupIds"));
    response.json({ schemaVersion: "primer.account.v1", user });
  });

  app.get("/api/sources/connectors", (_request, response) => {
    response.json({ schemaVersion: "primer.connectors.v1", connectors: services.listConnectors() });
  });

  app.get("/api/sources/registrations", (_request, response) => {
    response.json({
      schemaVersion: "primer.source-registrations.v1",
      registrations: services.listSourceRegistrations(),
    });
  });

  app.post("/api/sources/registrations", (request, response) => {
    const locatorInput = optionalObject(body(request).locator, "locator");
    const locator = locatorInput
      ? {
        type: requiredString(locatorInput.type, "locator.type") as "local-path" | "http",
        value: requiredString(locatorInput.value, "locator.value"),
      }
      : undefined;
    if (locator && locator.type !== "local-path" && locator.type !== "http") {
      throw new Error("locator.type must be local-path or http.");
    }
    const registration = services.registerSource({
      connectorId: requiredString(body(request).connectorId, "connectorId"),
      ...(locator ? { locator } : { path: requiredString(body(request).path, "path") }),
      config: optionalObject(body(request).config, "config") ?? {},
    });
    response.status(201).json({ schemaVersion: "primer.source-registration.v1", registration });
  });

  app.get("/api/sources/registrations/:id", (request, response) => {
    response.json(services.inspectSourceRegistration(request.params.id));
  });

  app.delete("/api/sources/registrations/:id", (request, response) => {
    response.json(services.unregisterSource(request.params.id));
  });

  app.get("/api/sources/registrations/:id/health", async (request, response) => {
    const health = await services.checkSourceRegistration(request.params.id);
    response.json({ schemaVersion: "primer.connector-health.v1", health });
  });

  app.post("/api/sources/registrations/:id/sync", async (request, response) => {
    const runs = await services.synchronize({ registrationId: request.params.id });
    response.json({ schemaVersion: "primer.sync-results.v1", runs });
  });

  app.get("/api/sources", (_request, response) => {
    response.json({ schemaVersion: "primer.sources.v1", sources: services.listSources() });
  });

  app.get("/api/sources/:id", (request, response) => {
    response.json({ schemaVersion: "primer.source.v1", ...services.inspectSource(request.params.id) });
  });

  app.delete("/api/sources/:id", (request, response) => {
    response.json(services.removeSource(request.params.id));
  });

  app.get("/api/syncs", (_request, response) => {
    response.json({ schemaVersion: "primer.sync-runs.v1", runs: services.listSyncRuns() });
  });

  app.get("/api/syncs/:id", (request, response) => {
    response.json({ schemaVersion: "primer.sync-run.v1", run: services.getSyncRun(request.params.id) });
  });

  app.get("/api/traces", (_request, response) => {
    response.json({
      schemaVersion: "primer.traces.v1",
      traces: services.listTraces().filter((trace) => trace.userId === active(response).user.id),
    });
  });

  app.get("/api/traces/:id", (request, response) => {
    const trace = services.getTrace(request.params.id);
    if (trace.userId !== active(response).user.id) {
      throw new Error("The active local session cannot access this trace.");
    }
    response.json({ schemaVersion: "primer.trace.v1", trace });
  });

  app.get("/api/evaluations", (_request, response) => {
    response.json({ schemaVersion: "primer.evaluation-runs.v1", runs: services.listEvaluationRuns() });
  });

  app.post("/api/evaluations", async (request, response) => {
    const kind = requiredString(body(request).kind, "kind");
    const caseIds = body(request).caseIds;
    const run = kind === "retrieval"
      ? await services.evaluate()
      : kind === "answers"
        ? await services.evaluateAnswers({ caseIds: caseIds === undefined ? [] : stringArray(caseIds, "caseIds") })
        : undefined;
    if (!run) throw new Error("kind must be retrieval or answers.");
    response.status(201).json({ schemaVersion: "primer.evaluation-run.v1", run });
  });

  app.get("/api/evaluations/:id", (request, response) => {
    response.json({
      schemaVersion: "primer.evaluation-run.v1",
      run: services.getEvaluationRun(request.params.id),
    });
  });

  app.all("/api/*path", (request, response) => {
    response.status(404).json({
      schemaVersion: "primer.error.v1",
      error: { category: "not-found", message: `Unknown API route: ${request.method} ${request.path}` },
    });
  });

  app.get("*path", webIndex());

  app.use((cause: unknown, request: Request, response: Response, _next: NextFunction) => {
    const message = bodyErrorMessage(cause) ?? (cause instanceof Error ? cause.message : String(cause));
    const category = errorCategory(request.path, message);
    if (response.headersSent) {
      response.end();
      return;
    }
    response.status(errorStatus(category)).json({ schemaVersion: "primer.error.v1", error: { category, message } });
  });

  return app;
}

export async function createPrimerHttpApp(
  config: PrimerConfig,
  options: { services?: PrimerServices } = {},
): Promise<PrimerHttpApp> {
  const database = options.services ? undefined : new PrimerDatabase(config.databasePath);
  const services = options.services ?? new PrimerServices(
    config,
    database!,
    createEmbeddingProvider(config),
    undefined,
    createAnswerProvider(config),
    createQueryPlanner(config),
  );
  const report = await services.initialize();
  if (!report.valid) {
    database?.close();
    throw new Error("Fixture validation failed; run primer validate for details.");
  }

  const server = createServer(createApp(services));
  attachHmr(server);

  return {
    server,
    services,
    close() {
      database?.close();
    },
  };
}
