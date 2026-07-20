import assert from "node:assert/strict";
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { loadConfig } from "../src/config.js";
import { PrimerDatabase } from "../src/database.js";
import type { SyncRun } from "../src/types.js";
import { createTestServices, fixtureDir } from "./helpers.js";

test("registered source synchronization accounts for unchanged, changed, removed, and explicit cleanup", async () => {
  const context = await createTestServices();
  const sourceRoot = join(context.directory, "sources", "markdown");
  const sourcePath = join(sourceRoot, "imports.md");
  mkdirSync(sourceRoot, { recursive: true });
  copyFileSync(join(fixtureDir, "sources", "markdown", "wiki", "clientcore", "imports.md"), sourcePath);

  try {
    const registration = context.services.registerSource({ connectorId: "markdown-local", path: sourceRoot });
    assert.equal(registration.lastSyncStatus, "never");

    const [initial] = await context.services.synchronize({ registrationId: registration.id });
    assert.equal(initial?.status, "completed");
    assert.equal(initial?.results[0]?.status, "indexed");
    assert.equal(initial?.storageSchemaVersion, 3);
    assert.equal(initial?.policyVersion, "index-v1");
    assert.ok((initial?.timingMs.total ?? -1) >= 0);

    const [unchanged] = await context.services.synchronize({ registrationId: registration.id });
    assert.equal(unchanged?.results[0]?.status, "unchanged");

    const original = readFileSync(sourcePath, "utf8");
    writeFileSync(
      sourcePath,
      original.replace(
        "The `owner_email` column is optional.",
        "The `owner_email` column remains optional. Operational marker: PHASE4_SYNC_MARKER.",
      ),
    );
    const [changed] = await context.services.synchronize({ registrationId: registration.id });
    assert.equal(changed?.results[0]?.status, "replaced");
    assert.match(context.services.inspectSource("md-cc-imports").records[0]?.content ?? "", /remains optional/);
    const changedTrace = await context.services.retrieve({
      question: "PHASE4_SYNC_MARKER",
      userId: "u-maya",
      projectId: "clientcore",
    });
    assert.equal(changedTrace.evidence[0]?.recordId, "md:md-cc-imports#account-owner-mapping");

    unlinkSync(sourcePath);
    const [removed] = await context.services.synchronize({ registrationId: registration.id });
    assert.deepEqual(removed?.removedSourceIds, ["md-cc-imports"]);
    assert.equal(context.services.listSources().length, 0);
    assert.equal(context.database.listRecords().length, 0);
    const removedTrace = await context.services.retrieve({
      question: "PHASE4_SYNC_MARKER",
      userId: "u-maya",
      projectId: "clientcore",
    });
    assert.equal(removedTrace.evidence.length, 0);

    const inspected = context.services.inspectSourceRegistration(registration.id);
    assert.equal(inspected.registration.lastSyncStatus, "completed");
    assert.equal(inspected.syncRuns.length, 4);
    assert.deepEqual(context.services.getSyncRun(removed!.id), removed);

    const unregistered = context.services.unregisterSource(registration.id);
    assert.equal(unregistered.removedRecords, 0);
    assert.equal(context.services.listSourceRegistrations().length, 0);
    assert.equal(context.services.listSyncRuns().length, 4);
  } finally {
    context.cleanup();
  }
});

test("failed synchronization remains inspectable and is not reported as completed", async () => {
  const context = await createTestServices();
  const missingPath = join(context.directory, "sources", "markdown", "missing");
  try {
    const registration = context.services.registerSource({ connectorId: "markdown-local", path: missingPath });
    await assert.rejects(
      context.services.synchronize({ registrationId: registration.id }),
      /Synchronization sync_.+ failed:/,
    );
    const inspected = context.services.inspectSourceRegistration(registration.id);
    assert.equal(inspected.registration.lastSyncStatus, "failed");
    assert.match(inspected.registration.lastError ?? "", /ENOENT/);
    assert.equal(inspected.syncRuns[0]?.status, "failed");
  } finally {
    context.cleanup();
  }
});

test("two registrations cannot silently claim the same stable source identity", async () => {
  const context = await createTestServices();
  const firstRoot = join(context.directory, "first", "sources", "markdown");
  const secondRoot = join(context.directory, "second", "sources", "markdown");
  mkdirSync(firstRoot, { recursive: true });
  mkdirSync(secondRoot, { recursive: true });
  const fixtureSource = join(fixtureDir, "sources", "markdown", "wiki", "clientcore", "imports.md");
  copyFileSync(fixtureSource, join(firstRoot, "imports.md"));
  copyFileSync(fixtureSource, join(secondRoot, "imports.md"));
  try {
    const first = context.services.registerSource({ connectorId: "markdown-local", path: firstRoot });
    const second = context.services.registerSource({ connectorId: "markdown-local", path: secondRoot });
    await context.services.synchronize({ registrationId: first.id });
    await assert.rejects(
      context.services.synchronize({ registrationId: second.id }),
      new RegExp(`already managed by registration ${first.id}`),
    );
    assert.equal(context.services.inspectSourceRegistration(second.id).registration.lastSyncStatus, "failed");
  } finally {
    context.cleanup();
  }
});

test("explicit source removal clears records and every retrieval representation", async () => {
  const context = await createTestServices();
  try {
    await context.services.ingest({
      connectorId: "markdown-local",
      path: join(fixtureDir, "sources", "markdown", "wiki", "clientcore", "imports.md"),
    });
    const result = context.services.removeSource("md-cc-imports");
    assert.equal(result.removed, true);
    assert.equal(result.removedRecords, 2);
    assert.equal(context.database.listRecords().length, 0);
    assert.deepEqual(context.database.lexicalSearch(["md:md-cc-imports#account-owner-mapping"], "CC_IMPORT_017", 5), []);
  } finally {
    context.cleanup();
  }
});

test("a running synchronization is recovered as interrupted when the database reopens", () => {
  const directory = mkdtempSync(join(tmpdir(), "primer-interruption-test-"));
  const config = loadConfig({ dataDir: directory, fixtureDir, embeddingProvider: "deterministic" });
  let database = new PrimerDatabase(config.databasePath);
  try {
    const timestamp = new Date().toISOString();
    database.registerSource({
      id: "reg_interrupted",
      connectorId: "markdown-local",
      sourceFamily: "markdown",
      path: join(directory, "sources", "markdown"),
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSyncStatus: "never",
    });
    const running: SyncRun = {
      schemaVersion: "primer.sync.v1",
      id: "sync_interrupted",
      registrationId: "reg_interrupted",
      connectorId: "markdown-local",
      sourceFamily: "markdown",
      status: "running",
      applicationVersion: "0.1.0",
      storageSchemaVersion: 3,
      processorVersion: "markdown-v1",
      policyVersion: "index-v1",
      embeddingModel: "deterministic/hash-256-v1",
      ownerProcessId: 2_147_483_647,
      results: [],
      removedSourceIds: [],
      timingMs: { acquisitionAndProcessing: 0, embedding: 0, indexWrite: 0, cleanup: 0, total: 0 },
      startedAt: timestamp,
    };
    database.saveSyncRun(running);
    database.close();

    database = new PrimerDatabase(config.databasePath);
    assert.equal(database.getSyncRun(running.id)?.status, "interrupted");
    assert.equal(database.getSourceRegistration(running.registrationId)?.lastSyncStatus, "interrupted");
  } finally {
    database.close();
    rmSync(directory, { recursive: true, force: true });
  }
});
