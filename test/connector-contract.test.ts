import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createServer } from "node:http";
import { test } from "node:test";
import { join } from "node:path";
import { CONNECTOR_CONTRACT_VERSION, type ConnectorItem, type ConnectorPage } from "../src/connectors/contracts.js";
import { HttpConnectorProvider } from "../src/connectors/http-provider.js";
import { CanonicalArtifactProcessor } from "../src/connectors/canonical-processor.js";
import { ConnectorRegistry } from "../src/connectors/registry.js";
import { DeterministicEmbeddingProvider } from "../src/embeddings.js";
import { MarkdownProcessor } from "../src/markdown.js";
import { processMarkdownContent } from "../src/markdown.js";
import { loadConfig } from "../src/config.js";
import { PrimerDatabase } from "../src/database.js";
import { PrimerServices } from "../src/services.js";
import { checksum } from "../src/utils.js";
import { fixtureDir } from "./helpers.js";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";

function item(externalId: string, sourceRef: string, rawContent: string): ConnectorItem {
  return {
    schemaVersion: CONNECTOR_CONTRACT_VERSION,
    connectorId: "document-http-test",
    sourceFamily: "markdown",
    artifactKind: "document",
    externalId,
    revision: checksum(rawContent),
    sourceRef,
    rawContent,
    metadata: {},
  };
}

test("primer.connector.v1 proves paged remote snapshots, checkpoints, ACL updates, and tombstones", async () => {
  const importsRef = "sources/markdown/wiki/clientcore/imports.md";
  const archiveRef = "sources/markdown/wiki/clientcore/account-archival.md";
  const originalImports = readFileSync(join(fixtureDir, importsRef), "utf8");
  const originalArchive = readFileSync(join(fixtureDir, archiveRef), "utf8");
  let imports = originalImports;
  let mode: ConnectorPage["mode"] = "snapshot";
  let checkpoint = "snapshot-1";
  let visible: Array<ConnectorItem> = [
    item("wiki/imports", importsRef, imports),
    item("wiki/account-archival", archiveRef, originalArchive),
  ];
  let tombstones: ConnectorPage["tombstones"] = [];
  let failSecondPage = false;
  const requests: Array<Record<string, unknown>> = [];

  const server = createServer(async (request, response) => {
    const chunks: Buffer[] = [];
    for await (const chunk of request) chunks.push(Buffer.from(chunk));
    const body = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
    requests.push(body);
    if (failSecondPage && body.pageCursor === "page-2") {
      response.writeHead(503, { "content-type": "text/plain" });
      response.end("simulated interruption");
      return;
    }
    const second = body.pageCursor === "page-2";
    const pageItems = mode === "snapshot" && visible.length > 1 ? (second ? visible.slice(1) : visible.slice(0, 1)) : visible;
    const page: ConnectorPage = {
      schemaVersion: CONNECTOR_CONTRACT_VERSION,
      connectorId: "document-http-test",
      sourceFamily: "markdown",
      mode,
      items: pageItems,
      tombstones: second || visible.length <= 1 ? tombstones : [],
      ...(!second && mode === "snapshot" && visible.length > 1 ? { nextPageCursor: "page-2" } : {}),
      ...(second || visible.length <= 1 ? { checkpointCursor: checkpoint } : {}),
    };
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify(page));
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  assert.ok(address && typeof address === "object");

  const directory = mkdtempSync(join(tmpdir(), "primer-connector-contract-"));
  const config = loadConfig({ dataDir: directory, fixtureDir, embeddingProvider: "deterministic" });
  const database = new PrimerDatabase(config.databasePath);
  const registry = new ConnectorRegistry().register({
    connector: new HttpConnectorProvider({
      connectorId: "document-http-test",
      sourceFamily: "markdown",
      artifactKinds: ["document"],
    }),
    processor: new MarkdownProcessor(),
  });
  const services = new PrimerServices(config, database, new DeterministicEmbeddingProvider(), registry);

  try {
    await services.initialize();
    const registration = services.registerSource({
      connectorId: "document-http-test",
      locator: { type: "http", value: `http://127.0.0.1:${address.port}/connector/v1/pull` },
      config: { scope: "clientcore" },
    });

    const [initial] = await services.synchronize({ registrationId: registration.id });
    assert.equal(initial?.results.length, 2);
    const expectedImports = processMarkdownContent(originalImports, importsRef);
    assert.deepEqual(
      services.inspectSource("md-cc-imports").records.map(({ id, content, access }) => ({ id, content, access })),
      expectedImports.records.map(({ id, content, access }) => ({ id, content, access })),
    );
    assert.equal(services.inspectSourceRegistration(registration.id).registration.checkpointCursor, "snapshot-1");
    assert.equal(requests.at(-1)?.pageCursor, "page-2");

    const [unchanged] = await services.synchronize({ registrationId: registration.id });
    assert.ok(unchanged?.results.every((result) => result.status === "unchanged"));
    assert.equal(requests.at(-2)?.checkpointCursor, "snapshot-1");

    imports = imports.replace("allowed_group_ids: [g-clientcore, g-support]", "allowed_group_ids: [g-clientcore]");
    checkpoint = "snapshot-2";
    visible = [item("wiki/imports", importsRef, imports), item("wiki/account-archival", archiveRef, originalArchive)];
    const [aclUpdate] = await services.synchronize({ registrationId: registration.id });
    assert.equal(aclUpdate?.results.find((result) => result.sourceId === "md-cc-imports")?.status, "replaced");
    assert.deepEqual(services.inspectSource("md-cc-imports").source.access_json.includes("g-support"), false);

    failSecondPage = true;
    checkpoint = "snapshot-should-not-commit";
    await assert.rejects(services.synchronize({ registrationId: registration.id }), /simulated interruption/);
    assert.equal(services.inspectSourceRegistration(registration.id).registration.checkpointCursor, "snapshot-2");
    failSecondPage = false;

    mode = "incremental";
    checkpoint = "incremental-3";
    visible = [];
    tombstones = [{ externalId: "wiki/account-archival", deletedAt: new Date().toISOString() }];
    const [deleted] = await services.synchronize({ registrationId: registration.id });
    assert.deepEqual(deleted?.removedSourceIds, ["md-cc-account-archival"]);
    assert.equal(services.listSources().length, 1);
    assert.equal(services.inspectSourceRegistration(registration.id).registration.checkpointCursor, "incremental-3");
  } finally {
    database.close();
    await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
    rmSync(directory, { recursive: true, force: true });
  }
});

test("connector registry rejects duplicate delivery and incompatible schemas before processing", async () => {
  const raw = readFileSync(join(fixtureDir, "sources/markdown/wiki/clientcore/imports.md"), "utf8");
  const duplicate = item("wiki/imports", "sources/markdown/wiki/clientcore/imports.md", raw);
  const provider = new HttpConnectorProvider({
    connectorId: "document-http-test",
    sourceFamily: "markdown",
    artifactKinds: ["document"],
    fetch: async () => new Response(JSON.stringify({
      schemaVersion: CONNECTOR_CONTRACT_VERSION,
      connectorId: "document-http-test",
      sourceFamily: "markdown",
      mode: "snapshot",
      items: [duplicate, duplicate],
      tombstones: [],
    }), { status: 200 }),
  });
  const registry = new ConnectorRegistry().register({ connector: provider, processor: new MarkdownProcessor() });
  await assert.rejects(
    registry.acquire({ connectorId: "document-http-test", locator: { type: "http", value: "http://connector.test/pull" } }),
    /duplicate external ID/,
  );

  const incompatible = new HttpConnectorProvider({
    connectorId: "incompatible",
    sourceFamily: "markdown",
    artifactKinds: ["document"],
    fetch: async () => new Response(JSON.stringify({
      schemaVersion: "primer.connector.v999",
      connectorId: "incompatible",
      sourceFamily: "markdown",
      mode: "snapshot",
      items: [],
      tombstones: [],
    }), { status: 200 }),
  });
  const incompatibleRegistry = new ConnectorRegistry().register({ connector: incompatible, processor: new MarkdownProcessor() });
  await assert.rejects(
    incompatibleRegistry.acquire({ connectorId: "incompatible", locator: { type: "http", value: "http://connector.test/pull" } }),
    /unsupported contract/,
  );

  const looping = new HttpConnectorProvider({
    connectorId: "looping",
    sourceFamily: "markdown",
    artifactKinds: ["document"],
    fetch: async () => new Response(JSON.stringify({
      schemaVersion: CONNECTOR_CONTRACT_VERSION,
      connectorId: "looping",
      sourceFamily: "markdown",
      mode: "snapshot",
      items: [],
      tombstones: [],
      nextPageCursor: "same-page",
    }), { status: 200 }),
  });
  const loopingRegistry = new ConnectorRegistry().register({ connector: looping, processor: new MarkdownProcessor() });
  await assert.rejects(
    loopingRegistry.acquire({ connectorId: "looping", locator: { type: "http", value: "http://connector.test/pull" } }),
    /repeated page cursor/,
  );
});

test("canonical artifact processing is semantic rather than vendor-specific", async () => {
  const processor = new CanonicalArtifactProcessor("business-record");
  const [processed] = await processor.process({
    schemaVersion: CONNECTOR_CONTRACT_VERSION,
    connectorId: "crm-outside-primer",
    sourceFamily: "business-record",
    artifactKind: "business-record",
    externalId: "account/42",
    revision: "rev-7",
    sourceRef: "https://crm.example.test/accounts/42",
    rawContent: "Account 42 is assigned to Maya and is currently active.",
    canonical: {
      title: "Account 42",
      createdAt: "2026-01-01T00:00:00Z",
      updatedAt: "2026-07-01T00:00:00Z",
      authors: ["crm-system"],
      projectId: "clientcore",
      access: { visibility: "group", allowedGroupIds: ["g-clientcore"], allowedUserIds: [] },
      authority: 0.9,
    },
    metadata: { recordType: "account" },
  });
  assert.equal(processed?.source.source, "business-record");
  assert.equal(processed?.source.sourceType, "business-record");
  assert.equal(processed?.records[0]?.title, "Account 42");
  assert.deepEqual(processed?.records[0]?.access.allowedGroupIds, ["g-clientcore"]);
  assert.equal(processed?.records[0]?.metadata.connectorId, "crm-outside-primer");
});
