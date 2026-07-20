import assert from "node:assert/strict";
import { test } from "node:test";
import { createTestServices } from "./helpers.js";

test("Markdown backfill is inspectable and unchanged input is idempotent", async () => {
  const context = await createTestServices();
  try {
    const first = await context.services.ingest({ connectorId: "markdown-local" });
    assert.equal(first.length, 10);
    assert.ok(first.every((result) => result.status === "indexed"));
    assert.ok(first.some((result) => result.rejected > 0));

    const recordSnapshot = context.database
      .listRecords()
      .map((record) => ({ id: record.id, checksum: record.contentChecksum }))
      .sort((left, right) => left.id.localeCompare(right.id));
    const second = await context.services.ingest({ connectorId: "markdown-local" });
    const repeatedSnapshot = context.database
      .listRecords()
      .map((record) => ({ id: record.id, checksum: record.contentChecksum }))
      .sort((left, right) => left.id.localeCompare(right.id));

    assert.ok(second.every((result) => result.status === "unchanged"));
    assert.deepEqual(repeatedSnapshot, recordSnapshot);
    assert.equal(context.services.listSources().length, 10);

    const imports = context.services.inspectSource("md-cc-imports");
    assert.equal(imports.records.length, 2);
    assert.equal(imports.decisions.filter((decision) => decision.decision === "rejected").length, 1);
  } finally {
    context.cleanup();
  }
});
