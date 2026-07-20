import assert from "node:assert/strict";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";
import { test } from "node:test";

const projectRoot = process.cwd();

function runCli(dataDir: string, args: string[]): { status: number | null; stdout: string; stderr: string } {
  const result = spawnSync(process.execPath, ["--import", "tsx", "src/cli.ts", ...args], {
    cwd: projectRoot,
    encoding: "utf8",
    env: {
      ...process.env,
      PRIMER_DATA_DIR: dataDir,
      PRIMER_EMBEDDING_PROVIDER: "deterministic",
      PRIMER_CHAT_PROVIDER: "deterministic",
    },
  });
  return { status: result.status, stdout: result.stdout, stderr: result.stderr };
}

test("CLI JSON contracts cover init, ingest, and retrieval", () => {
  const dataDir = mkdtempSync(join(tmpdir(), "primer-cli-test-"));
  try {
    const initialized = runCli(dataDir, ["init", "--json"]);
    assert.equal(initialized.status, 0, initialized.stderr);
    assert.equal((JSON.parse(initialized.stdout) as { valid: boolean }).valid, true);

    const connectors = runCli(dataDir, ["sources", "connectors", "--json"]);
    assert.equal(connectors.status, 0, connectors.stderr);
    assert.deepEqual(
      (JSON.parse(connectors.stdout) as { connectors: Array<{ connectorId: string }> }).connectors.map(
        (connector) => connector.connectorId,
      ),
      ["markdown-local", "slack-export"],
    );

    const ingested = runCli(dataDir, ["sources", "ingest", "--json"]);
    assert.equal(ingested.status, 0, ingested.stderr);
    assert.equal((JSON.parse(ingested.stdout) as { schemaVersion: string }).schemaVersion, "primer.ingest.v1");

    const retrieved = runCli(dataDir, [
      "retrieve",
      "What does CC_IMPORT_017 mean?",
      "--user",
      "u-maya",
      "--project",
      "clientcore",
      "--json",
    ]);
    assert.equal(retrieved.status, 0, retrieved.stderr);
    const trace = JSON.parse(retrieved.stdout) as { schemaVersion: string; evidence: Array<{ recordId: string }> };
    assert.equal(trace.schemaVersion, "primer.retrieval.v2");
    assert.equal(trace.evidence[0]?.recordId, "md:md-cc-imports#account-owner-mapping");

    const packed = runCli(dataDir, [
      "context",
      "What does CC_IMPORT_017 mean?",
      "--user",
      "u-maya",
      "--project",
      "clientcore",
      "--json",
    ]);
    assert.equal(packed.status, 0, packed.stderr);
    assert.equal((JSON.parse(packed.stdout) as { schemaVersion: string }).schemaVersion, "primer.context.v1");

    const answered = runCli(dataDir, [
      "ask",
      "What does CC_IMPORT_017 mean?",
      "--user",
      "u-maya",
      "--project",
      "clientcore",
      "--json",
    ]);
    assert.equal(answered.status, 0, answered.stderr);
    const answer = JSON.parse(answered.stdout) as { schemaVersion: string; citationValidation: { valid: boolean } };
    assert.equal(answer.schemaVersion, "primer.answer.v1");
    assert.equal(answer.citationValidation.valid, true);

    const answerEvaluation = runCli(dataDir, [
      "evaluate",
      "answers",
      "--case",
      "rf-eval-004",
      "--case",
      "rf-eval-012",
      "--json",
    ]);
    assert.equal(answerEvaluation.status, 0, answerEvaluation.stderr);
    const evaluated = JSON.parse(answerEvaluation.stdout) as {
      schemaVersion: string;
      runId: string;
      caseFilter: string[];
      cases: unknown[];
    };
    assert.equal(evaluated.schemaVersion, "primer.answer-evaluation.v1");
    assert.deepEqual(evaluated.caseFilter, ["rf-eval-004", "rf-eval-012"]);
    assert.equal(evaluated.cases.length, 2);

    const evaluationRuns = runCli(dataDir, ["evaluations", "list", "--json"]);
    assert.equal(evaluationRuns.status, 0, evaluationRuns.stderr);
    assert.ok(
      (JSON.parse(evaluationRuns.stdout) as { runs: Array<{ id: string }> }).runs.some((run) => run.id === evaluated.runId),
    );
  } finally {
    rmSync(dataDir, { recursive: true, force: true });
  }
});
