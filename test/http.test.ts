import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { join } from "node:path";
import { test } from "node:test";
import { createPrimerHttpApp } from "../src/http.js";
import { DeterministicAnswerProvider } from "../src/answers.js";
import type { GroundedAnswer } from "../src/types.js";
import { createTestServices, fixtureDir } from "./helpers.js";

test("HTTP API runs independently and reuses account and content application services", async () => {
  const context = await createTestServices();
  const app = await createPrimerHttpApp(context.services.config, { services: context.services });
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolve);
  });
  const address = app.server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    const health = await fetch(`${baseUrl}/api/health`);
    assert.equal(health.status, 200);
    assert.equal((await health.json() as { status: string }).status, "ok");

    const anonymousSources = await fetch(`${baseUrl}/api/sources`);
    assert.equal(anonymousSources.status, 401);
    assert.equal(
      (await anonymousSources.json() as { error: { category: string } }).error.category,
      "authorization",
    );

    const accounts = await fetch(`${baseUrl}/api/accounts`);
    assert.equal(accounts.status, 200);
    const accountBody = await accounts.json() as { users: unknown[]; groups: unknown[]; projects: unknown[] };
    assert.equal(accountBody.users.length, 10);
    assert.equal(accountBody.groups.length, 11);
    assert.equal(accountBody.projects.length, 3);

    const signedIn = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId: "u-maya" }),
    });
    assert.equal(signedIn.status, 201);
    const signedInBody = await signedIn.json() as { session: Record<string, unknown> };
    assert.equal(signedInBody.session.id, undefined);
    const cookie = signedIn.headers.get("set-cookie")?.split(";", 1)[0];
    assert.ok(cookie?.startsWith("primer_session="));

    const malformed = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "{",
    });
    assert.equal(malformed.status, 400);
    assert.equal((await malformed.json() as { error: { category: string } }).error.category, "request");

    const updated = await fetch(`${baseUrl}/api/accounts/u-maya/groups`, {
      method: "PUT",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({ groupIds: ["g-all", "g-clientcore", "g-support"] }),
    });
    assert.equal(updated.status, 200);
    assert.deepEqual(
      (await updated.json() as { user: { groupIds: string[] } }).user.groupIds,
      ["g-all", "g-clientcore", "g-support"],
    );
    await context.services.initialize();
    assert.deepEqual(
      context.services.listUsers().find((user) => user.id === "u-maya")?.groupIds,
      ["g-all", "g-clientcore", "g-support"],
    );

    const invalidLocator = await fetch(`${baseUrl}/api/sources/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        connectorId: "document-http",
        locator: { type: "ftp", value: "ftp://connector.invalid/pull" },
      }),
    });
    assert.equal(invalidLocator.status, 400);
    assert.equal((await invalidLocator.json() as { error: { category: string } }).error.category, "request");

    const registrationResponse = await fetch(`${baseUrl}/api/sources/registrations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: cookie! },
      body: JSON.stringify({
        connectorId: "markdown-local",
        path: join(fixtureDir, "sources", "markdown", "wiki", "clientcore", "imports.md"),
      }),
    });
    assert.equal(registrationResponse.status, 201);
    const registrationId = (
      await registrationResponse.json() as { registration: { id: string } }
    ).registration.id;

    const connectorHealth = await fetch(`${baseUrl}/api/sources/registrations/${registrationId}/health`, {
      headers: { cookie: cookie! },
    });
    assert.equal(connectorHealth.status, 200);
    assert.equal((await connectorHealth.json() as { health: { status: string } }).health.status, "available");

    const synchronized = await fetch(`${baseUrl}/api/sources/registrations/${registrationId}/sync`, {
      method: "POST",
      headers: { cookie: cookie! },
    });
    assert.equal(synchronized.status, 200);
    const synchronizedBody = await synchronized.json() as { runs: Array<{ id: string; status: string }> };
    assert.equal(synchronizedBody.runs[0]?.status, "completed");

    const syncDetail = await fetch(`${baseUrl}/api/syncs/${synchronizedBody.runs[0]!.id}`, {
      headers: { cookie: cookie! },
    });
    assert.equal(syncDetail.status, 200);
    assert.equal((await syncDetail.json() as { run: { id: string } }).run.id, synchronizedBody.runs[0]!.id);

    const missingTrace = await fetch(`${baseUrl}/api/traces/missing`, { headers: { cookie: cookie! } });
    assert.equal(missingTrace.status, 404);
    assert.equal((await missingTrace.json() as { error: { category: string } }).error.category, "not-found");

    const sources = await fetch(`${baseUrl}/api/sources`, { headers: { cookie: cookie! } });
    assert.equal(sources.status, 200);
    assert.equal((await sources.json() as { sources: unknown[] }).sources.length, 1);

    const removed = await fetch(`${baseUrl}/api/sources/registrations/${registrationId}`, {
      method: "DELETE",
      headers: { cookie: cookie! },
    });
    assert.equal(removed.status, 200);
    assert.equal((await removed.json() as { removedSourceIds: string[] }).removedSourceIds.length, 1);

    const signedOut = await fetch(`${baseUrl}/api/session`, { method: "DELETE", headers: { cookie: cookie! } });
    assert.equal(signedOut.status, 200);
  } finally {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    app.close();
    context.cleanup();
  }
});

test("streamed chat uses the active account and keeps traces account-scoped", async () => {
  const context = await createTestServices(new DeterministicAnswerProvider());
  await context.services.ingest();
  const app = await createPrimerHttpApp(context.services.config, { services: context.services });
  await new Promise<void>((resolve, reject) => {
    app.server.once("error", reject);
    app.server.listen(0, "127.0.0.1", resolve);
  });
  const address = app.server.address() as AddressInfo;
  const baseUrl = `http://127.0.0.1:${address.port}`;

  const signIn = async (userId: string): Promise<string> => {
    const response = await fetch(`${baseUrl}/api/session`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ userId }),
    });
    assert.equal(response.status, 201);
    return response.headers.get("set-cookie")!.split(";", 1)[0]!;
  };
  const ask = async (cookie: string): Promise<GroundedAnswer> => {
    const response = await fetch(`${baseUrl}/api/chat`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie },
      body: JSON.stringify({
        question: "What is planned for TalentFlow compensation analytics?",
        projectId: "talentflow",
      }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get("content-type") ?? "", /application\/x-ndjson/);
    const events = (await response.text()).trim().split("\n").map((line) => JSON.parse(line) as {
      type: string;
      stage?: string;
      answer?: GroundedAnswer;
    });
    const stages = events.filter((event) => event.type === "status").map((event) => event.stage);
    assert.ok(stages.includes("planning"));
    assert.ok(stages.includes("retrieval"));
    assert.ok(stages.includes("fusion"));
    assert.ok(stages.includes("generation"));
    assert.ok(stages.includes("validation"));
    assert.ok(stages.indexOf("planning") < stages.indexOf("retrieval"));
    assert.ok(stages.indexOf("retrieval") < stages.indexOf("fusion"));
    assert.ok(events.some((event) => event.type === "delta"));
    const answer = events.find((event) => event.type === "result")?.answer;
    assert.ok(answer);
    return answer;
  };

  try {
    const mayaCookie = await signIn("u-maya");
    const mayaAnswer = await ask(mayaCookie);
    assert.equal(mayaAnswer.model, "primer-abstain");
    assert.ok(!mayaAnswer.evidence.some((item) => item.recordId === "slack:G-LEADERSHIP:1778491800.000100"));

    const priyaCookie = await signIn("u-priya");
    const priyaAnswer = await ask(priyaCookie);
    assert.notEqual(priyaAnswer.model, "primer-abstain");
    assert.ok(priyaAnswer.evidence.some((item) => item.recordId === "slack:G-LEADERSHIP:1778491800.000100"));

    const inaccessibleTrace = await fetch(`${baseUrl}/api/traces/${mayaAnswer.traceId}`, {
      headers: { cookie: priyaCookie },
    });
    assert.equal(inaccessibleTrace.status, 401);
    const priyaTraces = await fetch(`${baseUrl}/api/traces`, { headers: { cookie: priyaCookie } });
    assert.ok(!(await priyaTraces.json() as { traces: Array<{ id: string }> }).traces.some((trace) => trace.id === mayaAnswer.traceId));

    const evaluation = await fetch(`${baseUrl}/api/evaluations`, {
      method: "POST",
      headers: { "content-type": "application/json", cookie: priyaCookie },
      body: JSON.stringify({ kind: "retrieval" }),
    });
    assert.equal(evaluation.status, 201);
    const evaluationId = (await evaluation.json() as { run: { runId: string } }).run.runId;
    const evaluationDetail = await fetch(`${baseUrl}/api/evaluations/${evaluationId}`, { headers: { cookie: priyaCookie } });
    assert.equal(evaluationDetail.status, 200);
  } finally {
    await new Promise<void>((resolve) => app.server.close(() => resolve()));
    app.close();
    context.cleanup();
  }
});
