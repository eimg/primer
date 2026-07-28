import type { Request, Response } from "express";
import type { FixtureUser } from "./types.js";

export type PrimerPrincipal = {
  id: string;
  issuer: string;
  username: string;
  displayName: string;
  email?: string;
  roles: string[];
  permissions: string[];
  kind: "human" | "service" | "development";
};

export type AuthRequest = { authorization?: string; cookie?: string };
export type SessionResult = { status: number; body: unknown; setCookie?: string };

/** Primer-owned auth seam. Acme Identity is one optional plain-HTTP adapter. */
export interface PrimerAuthAdapter {
  readonly provider: "standalone" | "acme-identity";
  resolve?(request: AuthRequest): Promise<PrimerPrincipal>;
  signIn?(credentials: unknown, request: AuthRequest): Promise<SessionResult>;
  signOut?(request: AuthRequest): Promise<SessionResult>;
}

export class PrimerAuthError extends Error {
  constructor(
    message: string,
    readonly code: "unauthenticated" | "unavailable" | "unmapped" | "config",
    options?: { cause?: unknown },
  ) {
    super(message, options);
    this.name = "PrimerAuthError";
  }
}

export interface ActorDirectory {
  listUsers(): FixtureUser[];
  getActorMapping(issuer: string, subject: string): string | undefined;
  saveActorMapping(issuer: string, subject: string, userId: string): void;
}

export function createStandaloneAuthAdapter(): PrimerAuthAdapter {
  return { provider: "standalone" };
}

export function createAcmeIdentityAuthAdapter({
  baseUrl = process.env.PRIMER_AUTH_URL ?? process.env.ACME_IDENTITY_URL ?? "http://127.0.0.1:8316",
  fetchFn = fetch,
  timeoutMs = 3_000,
}: {
  baseUrl?: string;
  fetchFn?: typeof fetch;
  timeoutMs?: number;
} = {}): PrimerAuthAdapter {
  const providerUrl = baseUrl.replace(/\/$/, "");
  const call = async (path: string, init: RequestInit): Promise<globalThis.Response> => {
    try {
      return await fetchFn(`${providerUrl}${path}`, { ...init, signal: AbortSignal.timeout(timeoutMs) });
    } catch (cause) {
      throw new PrimerAuthError(`Authentication provider unavailable at ${providerUrl}`, "unavailable", { cause });
    }
  };
  return {
    provider: "acme-identity",
    async resolve(request) {
      const response = await call("/api/principal", { method: "GET", headers: forwardedHeaders(request) });
      if (response.status === 401) throw new PrimerAuthError("Authentication required", "unauthenticated");
      if (!response.ok) throw new PrimerAuthError(`Authentication provider lookup failed (${response.status})`, "unavailable");
      return translatePrincipal(await response.json());
    },
    async signIn(credentials, request) {
      return sessionResult(await call("/api/session", {
        method: "POST",
        headers: { "content-type": "application/json", ...forwardedHeaders(request) },
        body: JSON.stringify(credentials ?? {}),
      }));
    },
    async signOut(request) {
      return sessionResult(await call("/api/session", { method: "DELETE", headers: forwardedHeaders(request) }));
    },
  };
}

export function createAuthAdapterFromEnv(provider = process.env.PRIMER_AUTH_PROVIDER ?? "standalone"): PrimerAuthAdapter {
  const normalized = provider.trim().toLowerCase();
  if (normalized === "standalone") return createStandaloneAuthAdapter();
  if (normalized === "acme-identity") return createAcmeIdentityAuthAdapter();
  throw new PrimerAuthError(
    `PRIMER_AUTH_PROVIDER must be "standalone" or "acme-identity" (got ${JSON.stringify(provider)})`,
    "config",
  );
}

/**
 * Resolve an external principal to Primer's existing knowledge actor. The first
 * exact, unique email match is persisted by issuer+subject; later identity
 * profile changes cannot silently move the principal to another actor.
 */
export function resolvePrimerActor(principal: PrimerPrincipal, directory: ActorDirectory): FixtureUser {
  const mappedId = directory.getActorMapping(principal.issuer, principal.id);
  if (mappedId) {
    const actor = directory.listUsers().find((candidate) => candidate.id === mappedId);
    if (actor) return actor;
    throw new PrimerAuthError("The mapped Primer actor no longer exists", "unmapped");
  }
  if (principal.kind === "service") {
    const serviceMap = serviceActorMap();
    const actorId = serviceMap[`${principal.issuer}:${principal.username}`] ?? serviceMap[principal.username];
    const actor = actorId ? directory.listUsers().find((candidate) => candidate.id === actorId) : undefined;
    if (!actor) throw new PrimerAuthError("Service principal has no Primer actor mapping", "unmapped");
    directory.saveActorMapping(principal.issuer, principal.id, actor.id);
    return actor;
  }
  const email = principal.email?.trim().toLowerCase();
  const matches = email
    ? directory.listUsers().filter((candidate) => candidate.email.trim().toLowerCase() === email)
    : [];
  if (matches.length !== 1) {
    throw new PrimerAuthError("Authenticated account has no unique Primer actor mapping", "unmapped");
  }
  directory.saveActorMapping(principal.issuer, principal.id, matches[0]!.id);
  return matches[0]!;
}

export function hasPermission(principal: PrimerPrincipal, requested: string): boolean {
  const permission = requested.trim().toLowerCase();
  return principal.permissions.some((granted) =>
    granted === "*" || granted === permission || (granted.endsWith(".*") && permission.startsWith(granted.slice(0, -1))),
  );
}

export function authRequest(request: Request): AuthRequest {
  return {
    ...(request.headers.authorization ? { authorization: request.headers.authorization } : {}),
    ...(request.headers.cookie ? { cookie: request.headers.cookie } : {}),
  };
}

export function sendSessionResult(response: Response, result: SessionResult): void {
  if (result.setCookie) response.setHeader("set-cookie", result.setCookie);
  response.status(result.status).json(result.body);
}

function forwardedHeaders(request: AuthRequest): Record<string, string> {
  return {
    ...(request.authorization ? { authorization: request.authorization } : {}),
    ...(request.cookie ? { cookie: request.cookie } : {}),
  };
}

async function sessionResult(response: globalThis.Response): Promise<SessionResult> {
  return {
    status: response.status,
    body: await response.json().catch(() => ({ error: response.statusText })),
    ...(response.headers.get("set-cookie") ? { setCookie: response.headers.get("set-cookie")! } : {}),
  };
}

function translatePrincipal(value: unknown): PrimerPrincipal {
  if (!value || typeof value !== "object") throw new PrimerAuthError("Authentication provider returned an invalid principal", "unavailable");
  const raw = value as Record<string, unknown>;
  const id = text(raw.sub);
  const issuer = text(raw.iss);
  const username = text(raw.username);
  const displayName = text(raw.displayName);
  const roles = strings(raw.roles);
  const permissions = strings(raw.permissions);
  if (!id || !issuer || !username || !displayName || !roles || !permissions) {
    throw new PrimerAuthError("Authentication provider returned an invalid principal", "unavailable");
  }
  return {
    id,
    issuer,
    username,
    displayName,
    ...(text(raw.email) ? { email: text(raw.email)! } : {}),
    roles,
    permissions,
    kind: raw.kind === "service" ? "service" : raw.kind === "dev" ? "development" : "human",
  };
}

function serviceActorMap(): Record<string, string> {
  const raw = process.env.PRIMER_SERVICE_ACTOR_MAP?.trim();
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error();
    return Object.fromEntries(Object.entries(parsed).filter((entry): entry is [string, string] => typeof entry[1] === "string"));
  } catch {
    throw new PrimerAuthError("PRIMER_SERVICE_ACTOR_MAP must be a JSON object", "config");
  }
}

function text(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function strings(value: unknown): string[] | undefined {
  return Array.isArray(value) && value.every((entry) => typeof entry === "string") ? value : undefined;
}
