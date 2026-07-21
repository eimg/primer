import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { SlackExportConnector } from "../src/connectors/slack-export.js";
import { SlackThreadProcessor } from "../src/slack.js";
import { createTestServices, fixtureDir } from "./helpers.js";

test("Slack export connector and processor emit stable thread records and visible rejections", async () => {
  const connector = new SlackExportConnector(fixtureDir);
  const processor = new SlackThreadProcessor();
  const items = await connector.read(
    join(fixtureDir, "sources", "slack", "clientcore-dev", "2026-04-06.json"),
  );
  assert.equal(items.length, 1);
  const processed = await processor.process(items[0]!);
  assert.equal(processed.length, 2);

  const thread = processed.find((source) => source.source.sourceId === "slack:C-CC-DEV:1775467800.000100");
  assert.ok(thread);
  assert.equal(thread.records[0]?.id, "slack:C-CC-DEV:1775467800.000100");
  assert.equal(thread.records[0]?.source, "slack");
  assert.match(thread.records[0]?.content ?? "", /CC_IMPORT_017/);
  assert.deepEqual(thread.source.access.allowedGroupIds, ["g-clientcore", "g-support"]);

  const bot = processed.find((source) => source.source.sourceId === "slack:C-CC-DEV:1775472000.000700");
  assert.ok(bot);
  assert.equal(bot.records.length, 0);
  assert.equal(bot.decisions[0]?.decision, "rejected");
  assert.match(bot.decisions[0]?.reason ?? "", /bot notification/);
});

test("Markdown and Slack connectors ingest independently and remain idempotent", async () => {
  const context = await createTestServices();
  try {
    const connectors = context.services.listConnectors();
    assert.deepEqual(connectors.filter((connector) => connector.transport === "local").map(({ connectorId, sourceFamily, processorVersion }) => ({ connectorId, sourceFamily, processorVersion })), [
      { connectorId: "markdown-local", sourceFamily: "markdown", processorVersion: "markdown-v1" },
      { connectorId: "slack-export", sourceFamily: "slack", processorVersion: "slack-thread-v1" },
    ]);
    assert.ok(connectors.every((connector) => connector.contractVersion === "primer.connector.v1"));
    assert.equal(connectors.filter((connector) => connector.transport === "local").length, 2);
    assert.equal(connectors.filter((connector) => connector.transport === "http").length, 4);
    const first = await context.services.ingest();
    assert.equal(first.length, 22);
    assert.equal(first.filter((result) => result.sourceFamily === "markdown").length, 10);
    assert.equal(first.filter((result) => result.sourceFamily === "slack").length, 12);
    assert.equal(context.database.listRecords().filter((record) => record.source === "slack").length, 7);

    const second = await context.services.ingest({ connectorId: "slack-export" });
    assert.equal(second.length, 12);
    assert.ok(second.every((result) => result.status === "unchanged"));

    const restricted = context.services.inspectSource("slack:G-LEADERSHIP:1778491800.000100");
    assert.equal(restricted.source.source_family, "slack");
    assert.equal(restricted.records[0]?.projectId, "talentflow");
    assert.equal(restricted.records[0]?.resolutionState, "proposed");
  } finally {
    context.cleanup();
  }
});
