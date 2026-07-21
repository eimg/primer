import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { DeterministicAnswerProvider } from "../src/answers.js";
import { PrimerDatabase } from "../src/database.js";
import { createTestServices, fixtureDir } from "./helpers.js";

test("Phase 7 diagnostics and deterministic readiness enforce release gates", async () => {
  const context = await createTestServices(new DeterministicAnswerProvider());
  try {
    context.services.registerSource({
      connectorId: "markdown-local",
      path: join(fixtureDir, "sources", "markdown"),
    });
    context.services.registerSource({
      connectorId: "slack-export",
      path: join(fixtureDir, "sources", "slack"),
    });
    await context.services.synchronize();

    const diagnostics = await context.services.diagnostics();
    assert.equal(diagnostics.schemaVersion, "primer.diagnostics.v1");
    assert.equal(diagnostics.database.integrity, "ok");
    assert.equal(diagnostics.database.foreignKeyViolations, 0);
    assert.equal(diagnostics.registrations.completed, 2);
    assert.equal(diagnostics.providers.embedding.configured, true);
    assert.doesNotMatch(JSON.stringify(diagnostics), /api[_-]?key/i);

    const readiness = await context.services.readiness({ includeAnswers: true });
    assert.equal(readiness.schemaVersion, "primer.readiness.v1");
    assert.equal(readiness.ready, true, JSON.stringify(readiness.checks, null, 2));
    assert.ok(readiness.checks.every((check) => check.status !== "fail"));
    assert.equal(readiness.retrieval?.aggregate.permissionCases, readiness.retrieval?.aggregate.permissionSafeCases);
    assert.equal(readiness.answers?.aggregate.citationValidCases, readiness.answers?.aggregate.cases);
    assert.equal(readiness.answers?.aggregate.permissionSafeCases, readiness.answers?.aggregate.cases);
  } finally {
    context.cleanup();
  }
});

test("online SQLite backup is restorable and never overwrites an existing target", async () => {
  const context = await createTestServices();
  const destination = join(context.directory, "backups", "primer.db");
  try {
    await context.services.ingest({ connectorId: "markdown-local" });
    const result = await context.services.backup(destination);
    assert.equal(result.schemaVersion, "primer.backup.v1");
    assert.ok(result.bytes > 0);
    assert.equal(existsSync(destination), true);

    const restored = new PrimerDatabase(destination);
    try {
      assert.equal(restored.diagnostics().integrity, "ok");
      assert.equal(restored.listRecords().length, context.database.listRecords().length);
    } finally {
      restored.close();
    }
    await assert.rejects(context.services.backup(destination), /already exists/);
  } finally {
    context.cleanup();
  }
});
