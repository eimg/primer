import assert from "node:assert/strict";
import { test } from "node:test";
import { CONTRACT_VERSION } from "../src/types.js";
import { createTestServices } from "./helpers.js";

test("retrieval exposes lexical, semantic, fused, and evidence stages", async () => {
  const context = await createTestServices();
  try {
    await context.services.ingest();
    const trace = await context.services.retrieve({
      question: "What does CC_IMPORT_017 mean?",
      userId: "u-maya",
      projectId: "clientcore",
      limit: 5,
    });

    assert.equal(trace.schemaVersion, CONTRACT_VERSION);
    assert.ok(trace.lexical.some((candidate) => candidate.recordId === "md:md-cc-imports#account-owner-mapping"));
    assert.ok(trace.lexical.some((candidate) => candidate.recordId === "slack:C-CC-DEV:1778147100.000100"));
    assert.ok(trace.semantic.some((candidate) => candidate.recordId === "md:md-cc-imports#account-owner-mapping"));
    assert.ok(trace.evidence.some((evidence) => evidence.recordId === "md:md-cc-imports#account-owner-mapping"));
    assert.ok(trace.evidence.some((evidence) => evidence.source === "slack"));
    assert.ok(trace.evidence.every((evidence) => evidence.permissionChecked));
    assert.deepEqual(context.services.getTrace(trace.traceId), trace);
  } finally {
    context.cleanup();
  }
});

test("authorization and project scope constrain the population before retrieval", async () => {
  const context = await createTestServices();
  try {
    await context.services.ingest();
    const financeTrace = await context.services.retrieve({
      question: "Why did retryNotification duplicate interview reminders?",
      userId: "u-bot",
      limit: 10,
    });
    const exposedFinanceIds = [
      ...financeTrace.lexical.map((candidate) => candidate.recordId),
      ...financeTrace.semantic.map((candidate) => candidate.recordId),
      ...financeTrace.evidence.map((evidence) => evidence.recordId),
    ];
    assert.ok(exposedFinanceIds.every((id) => id.startsWith("md:md-shared-terminology#")));
    assert.ok(!JSON.stringify(financeTrace).includes("retryNotification omitted"));

    const scoped = await context.services.retrieve({
      question: "What happens to an account?",
      userId: "u-priya",
      projectId: "clientcore",
      limit: 10,
    });
    const recordsById = new Map(context.database.listRecords().map((record) => [record.id, record]));
    assert.ok(scoped.evidence.every((evidence) => recordsById.get(evidence.recordId)?.projectId === "clientcore"));
  } finally {
    context.cleanup();
  }
});

test("Phase 2 evaluation reports Markdown and Slack recall plus permission safety", async () => {
  const context = await createTestServices();
  try {
    await context.services.ingest();
    const result = await context.services.evaluate();
    assert.equal(result.fixtureId, "acme-v0.3");
    assert.equal(result.aggregate.cases, 14);
    assert.equal(result.aggregate.meanUnionRecall, 1);
    assert.equal(result.aggregate.meanEvidenceRecall, 1);
    assert.equal(result.aggregate.permissionCases, 1);
    assert.equal(result.aggregate.permissionSafeCases, 1);
    assert.equal(result.codeContextCaseIds.length, 10);
    assert.deepEqual(result.skippedCaseIds, ["rf-eval-002"]);
  } finally {
    context.cleanup();
  }
});
