import assert from "node:assert/strict";
import { test } from "node:test";
import { join } from "node:path";
import { readFile } from "node:fs/promises";
import { validateFixture } from "../src/fixture.js";
import { processMarkdownFile } from "../src/markdown.js";
import { fixtureDir } from "./helpers.js";

test("acme-v0.3 fixture passes structural and identity validation", async () => {
  const report = await validateFixture(fixtureDir);
  assert.equal(report.valid, true);
  assert.deepEqual(report.issues, []);
  assert.equal(report.counts.users, 10);
  assert.equal(report.counts.markdownDocuments, 10);
  assert.equal(report.counts.retrievalCases, 15);
  assert.equal(report.counts.slackMessages, 43);
  assert.equal(report.counts.clientCoreTrackedFiles, 8);
  assert.equal(report.counts.talentFlowTrackedFiles, 10);

  const cases = JSON.parse(await readFile(join(fixtureDir, "evaluation", "cases.json"), "utf8")) as Array<{
    expectedRecordIds: string[];
    expectedCodeContextRefs?: string[];
  }>;
  assert.ok(cases.every((evaluation) => evaluation.expectedRecordIds.every((id) => !id.startsWith("git:"))));
  assert.equal(cases.filter((evaluation) => (evaluation.expectedCodeContextRefs?.length ?? 0) > 0).length, 10);
});

test("Markdown processor emits stable heading records and visible rejection decisions", async () => {
  const processed = await processMarkdownFile(
    join(fixtureDir, "sources", "markdown", "wiki", "clientcore", "imports.md"),
    fixtureDir,
  );

  assert.equal(processed.source.sourceId, "md-cc-imports");
  assert.deepEqual(
    processed.records.map((record) => record.id),
    ["md:md-cc-imports#account-owner-mapping", "md:md-cc-imports#activity-identity"],
  );
  assert.match(processed.records[0]?.content ?? "", /CC_IMPORT_017/);
  assert.deepEqual(processed.source.access.allowedGroupIds, ["g-clientcore", "g-support"]);
  assert.ok(
    processed.decisions.some(
      (decision) =>
        decision.recordId === "md:md-cc-imports#clientcore-csv-imports" && decision.decision === "rejected",
    ),
  );
});

test("single-heading documents follow the heading-slug identity convention", async () => {
  const processed = await processMarkdownFile(
    join(fixtureDir, "sources", "markdown", "wiki", "talentflow", "employer-suspension.md"),
    fixtureDir,
  );
  assert.equal(processed.records[0]?.id, "md:md-tf-employer-suspension#talentflow-employer-suspension");
});
