import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { test } from "node:test";
import { DeterministicAnswerProvider } from "../src/answers.js";
import { createPrimerHttpApp } from "../src/app.js";
import {
  PrimerAuthError,
  createAcmeIdentityAuthAdapter,
  type AuthRequest,
  type PrimerAuthAdapter,
  type PrimerPrincipal,
} from "../src/auth.js";
import type { GroundedAnswer } from "../src/types.js";
import { createTestServices } from "./helpers.js";

const principals: Record<string, PrimerPrincipal> = {
  admin: {
    id: "user:1",
    issuer: "acme-identity",
    username: "admin",
    displayName: "Acme Admin",
    email: "admin@acme.local",
    roles: ["admin"],
    permissions: ["*"],
    kind: "human",
  },
  maya: {
    id: "user:101",
    issuer: "acme-identity",
    username: "maya.chen",
    displayName: "Maya Chen",
    email: "maya.chen@acme.test",
    roles: ["member"],
    permissions: ["primer.ask"],
    kind: "human",
  },
  priya: {
    id: "user:103",
    issuer: "acme-identity",
    username: "priya.nair",
    displayName: "Priya Nair",
    email: "priya.nair@acme.test",
    roles: ["operator"],
    permissions: ["primer.ask", "primer.manage"],
    kind: "human",
  },
  unknown: {
    id: "user:999",
    issuer: "acme-identity",
    username: "outsider",
    displayName: "Outside User",
    email: "outside@example.test",
    roles: ["member"],
    permissions: ["primer.ask"],
    kind: "human",
  },
};

const adapter: PrimerAuthAdapter = {
  provider: "acme-identity",
  async resolve(request: AuthRequest) {
    const token = request.authorization?.replace(/^Bearer\s+/i, "");
    const principal = token ? principals[token] : undefined;
    if (!principal) throw new PrimerAuthError("Authentication required", "unauthenticated");
    return principal;
  },
};

test("Identity capability gates remain separate from Primer knowledge actors", async () => {
  const context = await createTestServices(new DeterministicAnswerProvider());
  await context.services.ingest();
  const app = await createPrimerHttpApp(context.services.config, { services: context.services, authAdapter: adapter });
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolve);
  });
  const baseUrl = `http://127.0.0.1:${(app.server.address() as AddressInfo).port}`;
  try {
    assert.equal((await fetch(`${baseUrl}/api/session`)).status, 401);

    const adminSession = await fetch(`${baseUrl}/api/session`, { headers: { authorization: "Bearer admin" } });
    assert.equal(adminSession.status, 200);
    const adminBody = await adminSession.json() as { user?: unknown; canManage: boolean; canAsk: boolean };
    assert.equal(adminBody.user, undefined);
    assert.equal(adminBody.canManage, true);
    assert.equal(adminBody.canAsk, false);
    assert.equal((await fetch(`${baseUrl}/api/sources`, { headers: { authorization: "Bearer admin" } })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { authorization: "Bearer admin", "content-type": "application/json" },
      body: JSON.stringify({ question: "Show me everything" }),
    })).status, 403, "admin wildcard does not bypass the knowledge actor boundary");

    const session = await fetch(`${baseUrl}/api/session`, { headers: { authorization: "Bearer maya" } });
    assert.equal(session.status, 200);
    assert.equal((await session.json() as { user: { id: string } }).user.id, "u-maya");
    assert.equal(context.services.getActorMapping("acme-identity", "user:101"), "u-maya");

    const deniedManage = await fetch(`${baseUrl}/api/accounts/u-maya/groups`, {
      method: "PUT",
      headers: { authorization: "Bearer maya", "content-type": "application/json" },
      body: JSON.stringify({ groupIds: ["g-all"] }),
    });
    assert.equal(deniedManage.status, 403);

    const allowedManage = await fetch(`${baseUrl}/api/accounts/u-priya/groups`, {
      method: "PUT",
      headers: { authorization: "Bearer priya", "content-type": "application/json" },
      body: JSON.stringify({ groupIds: principals.priya ? ["g-all", "g-leadership"] : [] }),
    });
    assert.equal(allowedManage.status, 200);

    const chat = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { authorization: "Bearer maya", "content-type": "application/json" },
      body: JSON.stringify({ question: "What is planned for compensation analytics?", userId: "u-priya" }),
    });
    assert.equal(chat.status, 200);
    const result = chatResult(await chat.text());
    assert.equal(result.actorId, "u-maya", "a request body cannot select another knowledge actor");

    assert.equal((await fetch(`${baseUrl}/api/session`, { headers: { authorization: "Bearer unknown" } })).status, 200);
    assert.equal((await fetch(`${baseUrl}/api/accounts`, { headers: { authorization: "Bearer unknown" } })).status, 403);
    assert.equal((await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { authorization: "Bearer unknown", "content-type": "application/json" },
      body: JSON.stringify({ question: "Can I see anything?" }),
    })).status, 403);
  } finally {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    app.close();
    context.cleanup();
  }
});

test("the optional HTTP adapter forwards bearer credentials without importing Identity", async () => {
  let authorization = "";
  const auth = createAcmeIdentityAuthAdapter({
    baseUrl: "http://identity.test",
    fetchFn: async (_input, init) => {
      authorization = new Headers(init?.headers).get("authorization") ?? "";
      return Response.json({
        schemaVersion: "acme.principal.v1",
        sub: "user:101",
        iss: "acme-identity",
        username: "maya.chen",
        displayName: "Maya Chen",
        email: "maya.chen@acme.test",
        roles: ["member"],
        permissions: ["primer.ask"],
        kind: "user",
        authMode: "local",
      });
    },
  });
  const principal = await auth.resolve!({ authorization: "Bearer suite-token" });
  assert.equal(authorization, "Bearer suite-token");
  assert.equal(principal.username, "maya.chen");
});

function chatResult(body: string): GroundedAnswer {
  for (const line of body.trim().split("\n").reverse()) {
    const event = JSON.parse(line) as { type?: string; answer?: GroundedAnswer };
    if (event.type === "result" && event.answer) return event.answer;
  }
  throw new Error("Primer chat stream did not contain a result");
}
