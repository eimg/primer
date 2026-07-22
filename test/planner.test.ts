import assert from "node:assert/strict";
import { test } from "node:test";
import { DeterministicAnswerProvider } from "../src/answers.js";
import type { QueryPlanner, QueryPlannerInput, QueryPlannerResult, WorkflowProgress } from "../src/types.js";
import { createTestServices } from "./helpers.js";

class StaticPlanner implements QueryPlanner {
  readonly modelId = "static-planner";

  constructor(private readonly result: QueryPlannerResult | Error) {}

  async plan(_input: QueryPlannerInput): Promise<QueryPlannerResult> {
    if (this.result instanceof Error) throw this.result;
    return this.result;
  }
}

test("planned answers validate and bound query variants before retrieval", async () => {
  const planner = new StaticPlanner({
    queries: ["", "CC_IMPORT_017", "cc_import_017", "account owner import", "extra query", "ignored query"],
  });
  const context = await createTestServices(new DeterministicAnswerProvider(), planner);
  try {
    await context.services.ingest();
    const progress: WorkflowProgress[] = [];
    const answer = await context.services.ask({
      question: "What does CC_IMPORT_017 mean?",
      userId: "u-maya",
      projectId: "clientcore",
      limit: 5,
    }, { onProgress: (event) => progress.push(event) });
    const trace = context.services.getTrace(answer.traceId);

    assert.equal(trace.queryPlan.strategy, "planned");
    assert.equal(trace.queryPlan.fallback, false);
    assert.deepEqual(trace.queryPlan.queries, [
      "What does CC_IMPORT_017 mean?",
      "CC_IMPORT_017",
      "account owner import",
      "extra query",
    ]);
    assert.equal(trace.queryRuns.length, 4);
    assert.ok(trace.evidence.every((item) => item.permissionChecked));
    assert.ok(progress.some((event) => event.stage === "retrieval" && event.queryIndex === 4 && event.queryCount === 4));
    assert.deepEqual([...new Set(progress.map((event) => event.stage))], ["planning", "retrieval", "fusion", "generation", "validation"]);
  } finally {
    context.cleanup();
  }
});

test("planner failure safely falls back to the original query", async () => {
  const context = await createTestServices(
    new DeterministicAnswerProvider(),
    new StaticPlanner(new Error("provider unavailable")),
  );
  try {
    await context.services.ingest();
    const answer = await context.services.ask({
      question: "What does CC_IMPORT_017 mean?",
      userId: "u-maya",
      projectId: "clientcore",
    });
    const trace = context.services.getTrace(answer.traceId);
    assert.equal(trace.queryPlan.fallback, true);
    assert.equal(trace.queryPlan.fallbackReason, "planner-error");
    assert.deepEqual(trace.queryPlan.queries, ["What does CC_IMPORT_017 mean?"]);
    assert.equal(trace.queryRuns.length, 1);
    assert.equal(answer.citationValidation.valid, true);
  } finally {
    context.cleanup();
  }
});
