import assert from "node:assert/strict";
import { test } from "node:test";
import { DeterministicAnswerProvider, isAbstentionText, validateCitations } from "../src/answers.js";
import { scoreAnswerPoint } from "../src/services.js";
import {
  ANSWER_CONTRACT_VERSION,
  ANSWER_EVALUATION_CONTRACT_VERSION,
  CONTEXT_CONTRACT_VERSION,
  type Evidence,
} from "../src/types.js";
import { createTestServices } from "./helpers.js";

test("ranking applies bounded authority, freshness, and resolution reasons", async () => {
  const context = await createTestServices();
  try {
    await context.services.ingest();
    const trace = await context.services.retrieve({
      question: "Why did TalentFlow send duplicate interview reminders?",
      userId: "u-owen",
      projectId: "talentflow",
      limit: 5,
    });
    assert.ok(trace.fused.length > 0);
    assert.ok(trace.fused.every((candidate) => candidate.policyReasons.map((item) => item.kind).join(",") === "authority,freshness,resolution"));
    assert.ok(trace.fused.every((candidate) => Math.abs(candidate.policyAdjustment) <= 0.1));
    assert.ok(trace.evidence.every((item) => item.policyReasons.length === 3));
  } finally {
    context.cleanup();
  }
});

test("primer.context.v1 contains only authorized evidence and marks code leads unverified", async () => {
  const context = await createTestServices();
  try {
    await context.services.ingest();
    const pack = await context.services.context({
      question: "Why did TalentFlow send duplicate interview reminders?",
      userId: "u-owen",
      projectId: "talentflow",
      limit: 5,
    });
    assert.equal(pack.schemaVersion, CONTEXT_CONTRACT_VERSION);
    assert.equal(pack.actorId, "u-owen");
    assert.ok(pack.evidence.every((item) => item.permissionChecked));
    assert.ok(pack.codeLeads.some((lead) => lead.ref === "retryNotification"));
    assert.ok(pack.codeLeads.every((lead) => lead.verifiedAgainstRepository === false));
  } finally {
    context.cleanup();
  }
});

test("same question yields restricted proposal only for the authorized identity", async () => {
  const context = await createTestServices();
  try {
    await context.services.ingest();
    const input = {
      question: "What is planned for TalentFlow compensation analytics?",
      projectId: "talentflow",
      limit: 5,
    };
    const leader = await context.services.context({ ...input, userId: "u-priya" });
    const engineer = await context.services.context({ ...input, userId: "u-maya" });
    const restrictedId = "slack:G-LEADERSHIP:1778491800.000100";
    assert.ok(leader.evidence.some((item) => item.recordId === restrictedId));
    assert.ok(leader.constraints.some((item) => item.text.includes("proposed")));
    assert.ok(!engineer.evidence.some((item) => item.recordId === restrictedId));
    assert.ok(!JSON.stringify(engineer).includes("roadmap commitment"));
  } finally {
    context.cleanup();
  }
});

test("grounded answers expose evidence and deterministic citation validation", async () => {
  const context = await createTestServices(new DeterministicAnswerProvider());
  try {
    await context.services.ingest();
    const result = await context.services.ask({
      question: "What does CC_IMPORT_017 mean?",
      userId: "u-maya",
      projectId: "clientcore",
      limit: 5,
    });
    assert.equal(result.schemaVersion, ANSWER_CONTRACT_VERSION);
    assert.equal(result.model, "deterministic-answer-v1");
    assert.ok(result.answer.includes("[E1]"));
    assert.equal(result.citationValidation.valid, true);
    assert.ok(result.evidence.every((item) => item.permissionChecked));
    assert.deepEqual(result.modelInputEvidenceIds, result.evidence.map((item) => item.evidenceId));
    assert.ok(result.timingMs.total >= result.timingMs.generation);
  } finally {
    context.cleanup();
  }
});

test("answer evaluation is separate, reproducible, and persisted for inspection", async () => {
  const context = await createTestServices(new DeterministicAnswerProvider());
  try {
    await context.services.ingest();
    const result = await context.services.evaluateAnswers();
    assert.equal(result.schemaVersion, ANSWER_EVALUATION_CONTRACT_VERSION);
    assert.equal(result.providerMode, "deterministic");
    assert.equal(result.answerModel, "deterministic-answer-v1");
    assert.equal(result.aggregate.cases, 14);
    assert.equal(result.aggregate.citationValidCases, 14);
    assert.equal(result.aggregate.permissionSafeCases, 14);
    assert.equal(result.aggregate.expectedFullAbstentionCases, 1);
    assert.equal(result.aggregate.correctFullAbstentionCases, 1);
    assert.deepEqual(result.skippedCaseIds, ["rf-eval-002"]);
    assert.ok(result.aggregate.expectedAnswerPoints > 0);
    assert.ok(result.aggregate.totalDurationMs >= 0);
    assert.ok(context.services.listEvaluationRuns().some((run) => run.id === result.runId));
    assert.deepEqual(context.services.getEvaluationRun(result.runId), result);
  } finally {
    context.cleanup();
  }
});

test("ask abstains without calling the model when authorized evidence is insufficient", async () => {
  let calls = 0;
  const context = await createTestServices({
    modelId: "must-not-run",
    async generate() {
      calls += 1;
      return { text: "unexpected", finishReason: "stop" };
    },
  });
  try {
    await context.services.ingest();
    const result = await context.services.ask({
      question: "What is planned for TalentFlow compensation analytics?",
      userId: "u-maya",
      projectId: "talentflow",
    });
    assert.equal(calls, 0);
    assert.equal(result.model, "primer-abstain");
    assert.match(result.answer, /not have enough authorized evidence/i);
    assert.equal(result.citationValidation.valid, true);
  } finally {
    context.cleanup();
  }
});

test("citation validation rejects unknown citations and uncited material claims", () => {
  const validation = validateCitations(
    "This paragraph makes a material factual claim without a supported citation.\n\nAnother claim [E9]",
    [],
  );
  assert.equal(validation.valid, false);
  assert.deepEqual(validation.invalidEvidenceIds, ["E9"]);
  assert.equal(validation.uncitedClaims.length, 1);
});

test("citation validation expands grouped citations", () => {
  const evidence = (evidenceId: string): Evidence => ({
    evidenceId,
    recordId: `record-${evidenceId}`,
    title: evidenceId,
    excerpt: "Supported evidence.",
    source: "test",
    sourceRef: `test/${evidenceId}`,
    updatedAt: "2026-01-01T00:00:00Z",
    authority: 1,
    retrievalReasons: [],
    policyReasons: [],
    permissionChecked: true,
  });
  const validation = validateCitations("This supported factual sentence uses two supplied records [E1, E2].", [
    evidence("E1"),
    evidence("E2"),
  ]);
  assert.equal(validation.valid, true);
  assert.deepEqual(validation.citedEvidenceIds, ["E1", "E2"]);
});

test("citation failures receive one bounded repair attempt", async () => {
  let calls = 0;
  const context = await createTestServices({
    modelId: "repair-test",
    async generate(input) {
      calls += 1;
      if (!input.revision) {
        return {
          text: "This opening paragraph makes an unsupported factual statement without any citation.",
          finishReason: "stop",
          usage: { inputTokens: 10, outputTokens: 10, totalTokens: 20 },
        };
      }
      return {
        text: "The supported answer is grounded in the supplied authorized evidence [E1].",
        finishReason: "stop",
        usage: { inputTokens: 5, outputTokens: 5, totalTokens: 10 },
      };
    },
  });
  try {
    await context.services.ingest();
    const result = await context.services.ask({
      question: "What does CC_IMPORT_017 mean?",
      userId: "u-maya",
      projectId: "clientcore",
    });
    assert.equal(calls, 2);
    assert.equal(result.generationAttempts, 2);
    assert.equal(result.citationValidation.valid, true);
    assert.equal(result.usage?.totalTokens, 30);
  } finally {
    context.cleanup();
  }
});

test("answer evaluation normalizes identifiers and recognizes evidence-based abstention", () => {
  assert.equal(scoreAnswerPoint("tenant ID plus source event ID", "The key is (tenant_id, source_event_id).").covered, true);
  const liveCase014Answer =
    "ClientCore does not automatically merge contacts. As confirmed in internal support discussion, there is no automatic merge functionality in the current code, and no approved matching rules for such a process exist. The system only flags possible duplicates for review.";
  assert.equal(
    scoreAnswerPoint("automatic contact merging is not supported", liveCase014Answer).covered,
    true,
  );
  assert.equal(
    scoreAnswerPoint("no approved matching rules are available", liveCase014Answer).covered,
    true,
  );
  const liveCase008Answer =
    "Based on the authorized evidence, archiving a ClientCore account does not delete its activities. Activities remain attached to the archived account and must remain available for audit and restoration.";
  assert.equal(scoreAnswerPoint("no", liveCase008Answer).covered, true);
  assert.equal(scoreAnswerPoint("activities remain available for audit", liveCase008Answer).covered, true);
  assert.equal(
    isAbstentionText("The available evidence does not contain information regarding planned compensation analytics."),
    true,
  );
});
