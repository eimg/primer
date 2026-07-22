#!/usr/bin/env node
import { PrimerDatabase } from "./database.js";
import { loadConfig, type PrimerConfig } from "./config.js";
import { createEmbeddingProvider, DeterministicEmbeddingProvider } from "./embeddings.js";
import { createAnswerProvider } from "./answers.js";
import { createQueryPlanner } from "./planner.js";
import { validateFixture } from "./fixture.js";
import { PrimerServices, type AnswerEvaluationResult, type EvaluationResult, type PrimerDiagnostics, type ReadinessReport } from "./services.js";
import type { GroundedAnswer, OrchestratorContextPack, RetrievalTrace, SyncRun, ValidationReport } from "./types.js";

const HELP = `Primer — inspect organizational sources as authorized evidence

Usage:
  primer init [--fixture <path>] [--data-dir <path>] [--json]
  primer validate [--fixture <path>] [--json]
  primer config show [--json]
  primer diagnostics [--json]
  primer readiness check [--include-answers] [--json]
  primer data backup <destination> [--json]
  primer users list|show <user-id> [--json]
  primer sources connectors [--json]
  primer sources register <path> --connector <connector-id> [--json]
  primer sources registrations [--json]
  primer sources registration <registration-id> [--json]
  primer sources health <registration-id> [--json]
  primer sources sync [registration-id] [--json]
  primer sources ingest [path] [--connector <connector-id>] [--json]
  primer sources list [--json]
  primer sources inspect <source-id> [--json]
  primer sources remove <source-id> [--json]
  primer sources unregister <registration-id> [--json]
  primer syncs list [--json]
  primer syncs show <sync-id> [--json]
  primer retrieve <question> --user <user-id> [--project <project-id>] [--limit <n>] [--json]
  primer context <question> --user <user-id> [--project <project-id>] [--limit <n>] [--json]
  primer ask <question> --user <user-id> [--project <project-id>] [--limit <n>] [--json]
  primer traces list [--json]
  primer trace show <trace-id> [--json]
  primer evaluate [retrieval|answers] [--case <case-id> ...] [--json]
  primer evaluations list [--json]
  primer evaluations show <run-id> [--json]

Environment:
  PRIMER_DATA_DIR                 Local state directory (default: ./.primer)
  PRIMER_FIXTURE_DIR              Acme fixture root (default: ./sample-data/acme)
  PRIMER_EMBEDDING_PROVIDER       openrouter (default) or deterministic
  PRIMER_EMBEDDING_MODEL          Required OpenRouter embedding model ID
  PRIMER_CHAT_PROVIDER            openrouter (default) or deterministic
  PRIMER_CHAT_MODEL               Required OpenRouter chat model ID
  OPENROUTER_API_KEY              Required for OpenRouter embeddings

Use PRIMER_EMBEDDING_PROVIDER=deterministic only for explicit offline development and tests.
`;

interface ParsedArgs {
  positionals: string[];
  json: boolean;
  dataDir?: string;
  fixtureDir?: string;
  userId?: string;
  projectId?: string;
  limit?: number;
  connectorId?: string;
  includeAnswers: boolean;
  caseIds: string[];
}

function parseArguments(args: string[]): ParsedArgs {
  const positionals: string[] = [];
  const parsed: ParsedArgs = { positionals, json: false, includeAnswers: false, caseIds: [] };
  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") parsed.json = true;
    else if (arg === "--data-dir") parsed.dataDir = requiredValue(args, ++index, arg);
    else if (arg === "--fixture") parsed.fixtureDir = requiredValue(args, ++index, arg);
    else if (arg === "--user") parsed.userId = requiredValue(args, ++index, arg);
    else if (arg === "--project") parsed.projectId = requiredValue(args, ++index, arg);
    else if (arg === "--connector") parsed.connectorId = requiredValue(args, ++index, arg);
    else if (arg === "--include-answers") parsed.includeAnswers = true;
    else if (arg === "--case") parsed.caseIds.push(requiredValue(args, ++index, arg));
    else if (arg === "--limit") {
      const value = Number(requiredValue(args, ++index, arg));
      if (!Number.isInteger(value) || value < 1) throw new Error("--limit must be a positive integer");
      parsed.limit = value;
    } else if (arg?.startsWith("--")) throw new Error(`Unknown option: ${arg}`);
    else if (arg) positionals.push(arg);
  }
  return parsed;
}

function requiredValue(args: string[], index: number, option: string): string {
  const value = args[index];
  if (!value || value.startsWith("--")) throw new Error(`${option} requires a value`);
  return value;
}

function configFromArgs(args: ParsedArgs): PrimerConfig {
  return loadConfig({
    ...(args.dataDir ? { dataDir: args.dataDir } : {}),
    ...(args.fixtureDir ? { fixtureDir: args.fixtureDir } : {}),
  });
}

function print(value: unknown, asJson: boolean, human: () => string): void {
  process.stdout.write(asJson ? `${JSON.stringify(value, null, 2)}\n` : `${human()}\n`);
}

function validationText(report: ValidationReport): string {
  const counts = Object.entries(report.counts)
    .map(([key, value]) => `  ${key}: ${value}`)
    .join("\n");
  const issues = report.issues
    .map((issue) => `  ${issue.severity.toUpperCase()} ${issue.path}: ${issue.message}`)
    .join("\n");
  return [
    report.valid ? `Fixture ${report.fixtureId ?? "unknown"} is valid.` : "Fixture is invalid.",
    counts && `Counts:\n${counts}`,
    issues && `Issues:\n${issues}`,
  ]
    .filter(Boolean)
    .join("\n");
}

function retrievalText(trace: RetrievalTrace): string {
  const stage = (name: string, items: Array<{ rank: number; recordId: string; score: number }>) =>
    `${name}:\n${items
      .slice(0, 10)
      .map((item) => `  ${item.rank}. ${item.recordId} (${item.score.toFixed(4)})`)
      .join("\n") || "  no candidates"}`;
  const evidence = trace.evidence
    .map((item) => `  ${item.evidenceId} ${item.recordId}\n     ${item.title} — ${item.sourceRef}`)
    .join("\n");
  return [
    `Trace ${trace.traceId}`,
    `Question: ${trace.question}`,
    `Identity: ${trace.userId}${trace.projectId ? ` · project ${trace.projectId}` : ""}`,
    `Embedding: ${trace.embeddingModel}`,
    stage("Lexical", trace.lexical),
    stage("Semantic", trace.semantic),
    `Policy-ranked:\n${trace.fused
      .slice(0, 10)
      .map((item) => `  ${item.rank}. ${item.recordId} (${item.fusedScore.toFixed(6)}; adjustment ${item.policyAdjustment >= 0 ? "+" : ""}${item.policyAdjustment.toFixed(4)})`)
      .join("\n") || "  no candidates"}`,
    `Evidence:\n${evidence || "  no evidence"}`,
    `Timing: ${trace.timingMs.total.toFixed(2)} ms total`,
  ].join("\n\n");
}

function contextText(context: OrchestratorContextPack): string {
  return [
    `Context ${context.schemaVersion} · trace ${context.traceId}`,
    `Question: ${context.question}`,
    `Identity: ${context.actorId}${context.projectId ? ` · project ${context.projectId}` : ""}`,
    `Evidence: ${context.evidence.map((item) => `${item.evidenceId} ${item.recordId}`).join(", ") || "none"}`,
    `Constraints: ${context.constraints.length}`,
    `Conflicts: ${context.conflicts.length}`,
    `Unverified code leads: ${context.codeLeads.map((item) => item.ref).join(", ") || "none"}`,
  ].join("\n");
}

function answerText(result: GroundedAnswer): string {
  return [
    result.answer,
    `\nTrace: ${result.traceId}`,
    `Model: ${result.model}${result.configuredModel !== result.model ? ` · configured ${result.configuredModel}` : ""}`,
    `Generation attempts: ${result.generationAttempts}`,
    `Citations: ${result.citationValidation.valid ? "valid" : "invalid"}`,
    `Timing: ${result.timingMs.total.toFixed(2)} ms total · ${result.timingMs.generation.toFixed(2)} ms generation`,
    `Evidence: ${result.evidence.map((item) => `[${item.evidenceId}] ${item.sourceRef}`).join(", ") || "none"}`,
  ].join("\n");
}

function syncText(run: SyncRun): string {
  const counts = run.results.reduce(
    (totals, result) => ({ ...totals, [result.status]: totals[result.status] + 1 }),
    { indexed: 0, replaced: 0, unchanged: 0 },
  );
  return [
    `Synchronization ${run.id}: ${run.status}`,
    `Registration: ${run.registrationId} · ${run.connectorId}/${run.sourceFamily}`,
    `Sources: ${counts.indexed} indexed · ${counts.replaced} replaced · ${counts.unchanged} unchanged · ${run.removedSourceIds.length} removed`,
    `Versions: app ${run.applicationVersion} · storage ${run.storageSchemaVersion} · processor ${run.processorVersion} · policy ${run.policyVersion}`,
    `Embedding: ${run.embeddingModel}`,
    run.error ? `Error: ${run.error}` : "",
    `Timing: ${run.timingMs.total.toFixed(2)} ms total · ${run.timingMs.acquisitionAndProcessing.toFixed(2)} acquisition/processing · ${run.timingMs.embedding.toFixed(2)} embedding · ${run.timingMs.indexWrite.toFixed(2)} index write · ${run.timingMs.cleanup.toFixed(2)} cleanup`,
  ].filter(Boolean).join("\n");
}

function answerEvaluationText(result: AnswerEvaluationResult): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const cases = result.cases
    .map(
      (item) =>
        `  ${item.id}: citations ${item.citationValid ? "valid" : "invalid"}, points ${item.pointResults.filter((point) => point.covered).length}/${item.pointResults.length}, behavior ${item.behaviorPassed ? "pass" : "fail"}${item.requiresSemanticReview ? ", review" : ""}`,
    )
    .join("\n");
  const usage = result.aggregate.totalTokens !== undefined
    ? `Tokens: ${result.aggregate.inputTokens ?? 0} input · ${result.aggregate.outputTokens ?? 0} output · ${result.aggregate.totalTokens} total`
    : "Tokens: unavailable";
  return [
    `Answer evaluation ${result.runId}`,
    `Fixture: ${result.fixtureId}`,
    `Models: ${result.embeddingModel} · ${result.answerModel} (${result.providerMode})`,
    `Cases: ${result.aggregate.cases}; skipped: ${result.skippedCaseIds.length}`,
    result.caseFilter?.length ? `Filter: ${result.caseFilter.join(", ")}` : "",
    cases,
    `Citations: ${result.aggregate.citationValidCases}/${result.aggregate.cases} valid`,
    `Permissions: ${result.aggregate.permissionSafeCases}/${result.aggregate.cases} safe`,
    `Full abstention: ${result.aggregate.correctFullAbstentionCases}/${result.aggregate.expectedFullAbstentionCases} correct`,
    `Expected points: ${result.aggregate.coveredAnswerPoints}/${result.aggregate.expectedAnswerPoints} covered · mean ${percent(result.aggregate.meanAnswerPointCoverage)}`,
    `Semantic review: ${result.aggregate.semanticReviewCases} cases`,
    usage,
    `Timing: ${result.aggregate.totalDurationMs.toFixed(2)} ms total · ${result.aggregate.meanDurationMs.toFixed(2)} ms mean`,
  ].filter(Boolean).join("\n");
}

function evaluationText(result: EvaluationResult): string {
  const percent = (value: number) => `${(value * 100).toFixed(1)}%`;
  const cases = result.cases
    .map(
      (item) =>
        `  ${item.id}: lexical ${percent(item.lexicalRecall)}, semantic ${percent(item.semanticRecall)}, union ${percent(item.unionRecall)}, evidence ${percent(item.evidenceRecall)}`,
    )
    .join("\n");
  return [
    `Evaluation ${result.runId}`,
    `Fixture: ${result.fixtureId}`,
    `Embedding: ${result.embeddingModel}`,
    `Eligible indexed-source cases: ${result.aggregate.cases}; skipped: ${result.skippedCaseIds.length}`,
    `Code-context cases deferred to the orchestrator harness: ${result.codeContextCaseIds.length}`,
    cases,
    `Mean recall — lexical ${percent(result.aggregate.meanLexicalRecall)}, semantic ${percent(result.aggregate.meanSemanticRecall)}, union ${percent(result.aggregate.meanUnionRecall)}, evidence ${percent(result.aggregate.meanEvidenceRecall)}`,
    `Permission checks: ${result.aggregate.permissionSafeCases}/${result.aggregate.permissionCases} safe`,
  ].join("\n");
}

function diagnosticsText(result: PrimerDiagnostics): string {
  return [
    `Primer ${result.applicationVersion} diagnostics`,
    `Fixture: ${result.fixture.id ?? "unknown"} · ${result.fixture.valid ? "valid" : "invalid"}`,
    `Database: integrity ${result.database.integrity} · schema ${result.database.schemaVersion}/${result.storageSchemaVersion} · foreign-key violations ${result.database.foreignKeyViolations}`,
    `Content: ${result.database.counts.sources ?? 0} sources · ${result.database.counts.records ?? 0} records`,
    `Registrations: ${result.registrations.completed}/${result.registrations.total} completed · ${result.registrations.failed} failed · ${result.registrations.interrupted} interrupted`,
    `Embedding: ${result.providers.embedding.provider}/${result.providers.embedding.model} · ${result.providers.embedding.configured ? "configured" : "missing configuration"}`,
    `Chat: ${result.providers.chat.provider}/${result.providers.chat.model ?? "not configured"} · ${result.providers.chat.configured ? "configured" : "missing configuration"}`,
  ].join("\n");
}

function readinessText(result: ReadinessReport): string {
  return [
    `Primer readiness: ${result.ready ? "PASS" : "FAIL"} (${result.mode})`,
    ...result.checks.map((check) => `  ${check.status.toUpperCase()} ${check.id}: ${check.message}`),
  ].join("\n");
}

async function withServices<T>(
  config: PrimerConfig,
  needsEmbeddings: boolean,
  action: (services: PrimerServices) => Promise<T> | T,
  needsAnswers = false,
): Promise<T> {
  const database = new PrimerDatabase(config.databasePath);
  const embeddings = needsEmbeddings ? createEmbeddingProvider(config) : new DeterministicEmbeddingProvider();
  try {
    return await action(
      new PrimerServices(
        config,
        database,
        embeddings,
        undefined,
        needsAnswers ? createAnswerProvider(config) : undefined,
        needsAnswers ? createQueryPlanner(config) : undefined,
      ),
    );
  } finally {
    database.close();
  }
}

async function main(): Promise<void> {
  const args = parseArguments(process.argv.slice(2));
  const [command, subcommand, ...rest] = args.positionals;
  if (!command || command === "help" || command === "--help") {
    process.stdout.write(HELP);
    return;
  }
  const config = configFromArgs(args);

  if (command === "validate") {
    const report = await validateFixture(config.fixtureDir);
    print(report, args.json, () => validationText(report));
    if (!report.valid) process.exitCode = 1;
    return;
  }

  if (command === "init") {
    const report = await withServices(config, false, (services) => services.initialize());
    print(
      { ...report, databasePath: config.databasePath },
      args.json,
      () => `${validationText(report)}\nDatabase: ${config.databasePath}`,
    );
    if (!report.valid) process.exitCode = 1;
    return;
  }

  if (command === "config" && subcommand === "show") {
    const result = await withServices(config, false, (services) => services.configuration());
    print(result, args.json, () => [
      `Primer ${result.applicationVersion}`,
      `Storage schema: ${result.storageSchemaVersion}`,
      `Policy: ${result.policyVersion}`,
      `Embedding: ${result.embedding.provider}/${result.embedding.model}`,
      `Chat: ${result.chat.provider}/${result.chat.model ?? "not configured"}`,
      `Database: ${result.databasePath}`,
      `Fixture: ${result.fixtureDir}`,
      ...result.connectors.map((connector) => `Connector: ${connector.connectorId} · ${connector.processorVersion}`),
    ].join("\n"));
    return;
  }

  if (command === "diagnostics") {
    const result = await withServices(config, false, (services) => services.diagnostics());
    print(result, args.json, () => diagnosticsText(result));
    if (!result.fixture.valid || result.database.integrity !== "ok" || result.database.foreignKeyViolations > 0) {
      process.exitCode = 1;
    }
    return;
  }

  if (command === "readiness" && subcommand === "check") {
    const result = await withServices(
      config,
      true,
      (services) => services.readiness({ includeAnswers: args.includeAnswers }),
      args.includeAnswers,
    );
    print(result, args.json, () => readinessText(result));
    if (!result.ready) process.exitCode = 1;
    return;
  }

  if (command === "data" && subcommand === "backup") {
    const destination = rest[0];
    if (!destination) throw new Error("data backup requires a destination path");
    const result = await withServices(config, false, (services) => services.backup(destination));
    print(result, args.json, () => `Backed up ${result.bytes} bytes (${result.pages} pages) to ${result.destination}`);
    return;
  }

  if (command === "users" && subcommand === "list") {
    const users = await withServices(config, false, (services) => services.listUsers());
    print(users, args.json, () => users.map((user) => `${user.id}\t${user.name}\t${user.title}`).join("\n"));
    return;
  }
  if (command === "users" && subcommand === "show") {
    const id = rest[0];
    if (!id) throw new Error("users show requires a user ID");
    const user = await withServices(config, false, (services) => services.getUser(id));
    print(user, args.json, () => `${user.name} (${user.id})\n${user.title}\n${user.email}\nGroups: ${user.groupIds.join(", ")}`);
    return;
  }

  if (command === "sources" && subcommand === "connectors") {
    const connectors = await withServices(config, false, (services) => services.listConnectors());
    print(
      { schemaVersion: "primer.connectors.v1", connectors },
      args.json,
      () =>
        connectors
          .map((connector) => `${connector.connectorId}\t${connector.sourceFamily}\t${connector.processorVersion}`)
          .join("\n"),
    );
    return;
  }
  if (command === "sources" && subcommand === "register") {
    const path = rest[0];
    if (!path) throw new Error("sources register requires a path");
    if (!args.connectorId) throw new Error("sources register requires --connector <connector-id>");
    const registration = await withServices(config, false, (services) =>
      services.registerSource({ connectorId: args.connectorId!, path }),
    );
    print(
      { schemaVersion: "primer.source-registration.v1", registration },
      args.json,
      () => `${registration.id}\t${registration.connectorId}\t${registration.lastSyncStatus}\t${registration.path}`,
    );
    return;
  }
  if (command === "sources" && subcommand === "registrations") {
    const registrations = await withServices(config, false, (services) => services.listSourceRegistrations());
    print(
      { schemaVersion: "primer.source-registrations.v1", registrations },
      args.json,
      () => registrations.map((registration) =>
        `${registration.id}\t${registration.connectorId}\t${registration.lastSyncStatus}\t${registration.path}`,
      ).join("\n") || "No registered sources.",
    );
    return;
  }
  if (command === "sources" && subcommand === "registration") {
    const registrationId = rest[0];
    if (!registrationId) throw new Error("sources registration requires a registration ID");
    const inspected = await withServices(config, false, (services) => services.inspectSourceRegistration(registrationId));
    print(inspected, args.json, () => [
      `${inspected.registration.id} [${inspected.registration.connectorId}]`,
      `Path: ${inspected.registration.path}`,
      `Last sync: ${inspected.registration.lastSyncStatus}${inspected.registration.lastSyncAt ? ` at ${inspected.registration.lastSyncAt}` : ""}`,
      `Sources: ${inspected.sourceIds.join(", ") || "none"}`,
      `Runs: ${inspected.syncRuns.length}`,
    ].join("\n"));
    return;
  }
  if (command === "sources" && subcommand === "health") {
    const registrationId = rest[0];
    if (!registrationId) throw new Error("sources health requires a registration ID");
    const health = await withServices(config, false, (services) => services.checkSourceRegistration(registrationId));
    print(
      { schemaVersion: "primer.connector-health.v1", health },
      args.json,
      () => `${health.connectorId}\t${health.status}\t${health.checkedAt}${health.message ? `\t${health.message}` : ""}`,
    );
    return;
  }
  if (command === "sources" && subcommand === "sync") {
    const runs = await withServices(config, true, (services) =>
      services.synchronize({ ...(rest[0] ? { registrationId: rest[0] } : {}) }),
    );
    print(
      { schemaVersion: "primer.sync-results.v1", runs },
      args.json,
      () => runs.map(syncText).join("\n\n"),
    );
    return;
  }
  if (command === "sources" && subcommand === "ingest") {
    const results = await withServices(config, true, async (services) => {
      const report = await services.initialize();
      if (!report.valid) throw new Error("Fixture validation failed; run primer validate for details.");
      return services.ingest({
        ...(rest[0] ? { path: rest[0] } : {}),
        ...(args.connectorId ? { connectorId: args.connectorId } : {}),
      });
    });
    print(
      { schemaVersion: "primer.ingest.v1", results },
      args.json,
      () =>
        results
          .map(
            (result) =>
              `${result.sourceId} [${result.sourceFamily}/${result.connectorId}]: ${result.status} · ${result.accepted} accepted · ${result.rejected} rejected`,
          )
          .join("\n"),
    );
    return;
  }
  if (command === "sources" && subcommand === "list") {
    const sources = await withServices(config, false, (services) => services.listSources());
    print(
      { schemaVersion: "primer.sources.v1", sources },
      args.json,
      () =>
        sources
          .map(
            (source) =>
              `${source.source_id}\t${source.source_family}\t${source.project_id ?? "-"}\t${source.accepted} accepted\t${source.rejected} rejected\t${source.source_ref}`,
          )
          .join("\n"),
    );
    return;
  }
  if (command === "sources" && subcommand === "inspect") {
    const sourceId = rest[0];
    if (!sourceId) throw new Error("sources inspect requires a source ID");
    const inspected = await withServices(config, false, (services) => services.inspectSource(sourceId));
    print(
      { schemaVersion: "primer.source.v1", ...inspected },
      args.json,
      () => [
        `${inspected.source.source_id} [${inspected.source.source_family}] — ${inspected.source.source_ref}`,
        `Records: ${inspected.records.length}`,
        ...inspected.decisions.map((decision) => `  ${decision.decision}: ${decision.recordId} — ${decision.reason}`),
      ].join("\n"),
    );
    return;
  }
  if (command === "sources" && subcommand === "remove") {
    const sourceId = rest[0];
    if (!sourceId) throw new Error("sources remove requires a source ID");
    const result = await withServices(config, false, (services) => services.removeSource(sourceId));
    print(
      result,
      args.json,
      () => result.removed
        ? `Removed ${result.sourceId} and ${result.removedRecords} derived records.`
        : `Source ${result.sourceId} was not indexed.`,
    );
    return;
  }
  if (command === "sources" && subcommand === "unregister") {
    const registrationId = rest[0];
    if (!registrationId) throw new Error("sources unregister requires a registration ID");
    const result = await withServices(config, false, (services) => services.unregisterSource(registrationId));
    print(
      result,
      args.json,
      () => `Unregistered ${registrationId}; removed ${result.removedSourceIds.length} sources and ${result.removedRecords} records.`,
    );
    return;
  }

  if (command === "syncs" && subcommand === "list") {
    const runs = await withServices(config, false, (services) => services.listSyncRuns());
    print(
      { schemaVersion: "primer.sync-runs.v1", runs },
      args.json,
      () => runs.map((run) => `${run.id}\t${run.status}\t${run.registrationId}\t${run.startedAt}`).join("\n") || "No synchronization runs.",
    );
    return;
  }
  if (command === "syncs" && subcommand === "show") {
    const syncId = rest[0];
    if (!syncId) throw new Error("syncs show requires a synchronization ID");
    const run = await withServices(config, false, (services) => services.getSyncRun(syncId));
    print(run, args.json, () => syncText(run));
    return;
  }

  if (command === "retrieve") {
    const question = [subcommand, ...rest].filter(Boolean).join(" ");
    if (!question) throw new Error("retrieve requires a question");
    if (!args.userId) throw new Error("retrieve requires --user <user-id>");
    const trace = await withServices(config, true, async (services) => {
      await services.initialize();
      return services.retrieve({
        question,
        userId: args.userId!,
        ...(args.projectId ? { projectId: args.projectId } : {}),
        ...(args.limit ? { limit: args.limit } : {}),
      });
    });
    print(trace, args.json, () => retrievalText(trace));
    return;
  }

  if (command === "context" || command === "ask") {
    const question = [subcommand, ...rest].filter(Boolean).join(" ");
    if (!question) throw new Error(`${command} requires a question`);
    if (!args.userId) throw new Error(`${command} requires --user <user-id>`);
    const result = await withServices(
      config,
      true,
      async (services) => {
        await services.initialize();
        const input = {
          question,
          userId: args.userId!,
          ...(args.projectId ? { projectId: args.projectId } : {}),
          ...(args.limit ? { limit: args.limit } : {}),
        };
        return command === "context" ? services.context(input) : services.ask(input);
      },
      command === "ask",
    );
    if (command === "context") {
      print(result, args.json, () => contextText(result as OrchestratorContextPack));
    } else {
      print(result, args.json, () => answerText(result as GroundedAnswer));
    }
    return;
  }

  if (command === "trace" && subcommand === "show") {
    const traceId = rest[0];
    if (!traceId) throw new Error("trace show requires a trace ID");
    const trace = await withServices(config, false, (services) => services.getTrace(traceId));
    print(trace, args.json, () => retrievalText(trace));
    return;
  }
  if (command === "traces" && subcommand === "list") {
    const traces = await withServices(config, false, (services) => services.listTraces());
    print(
      { schemaVersion: "primer.traces.v1", traces },
      args.json,
      () => traces.map((trace) =>
        `${trace.id}\t${trace.userId}\t${trace.projectId ?? "-"}\t${trace.createdAt}\t${trace.question}`,
      ).join("\n") || "No saved traces.",
    );
    return;
  }

  if (command === "evaluate") {
    if (subcommand && subcommand !== "retrieval" && subcommand !== "answers") {
      throw new Error("evaluate accepts only retrieval or answers");
    }
    const answerMode = subcommand === "answers";
    const result = await withServices(
      config,
      true,
      async (services) => {
        const report = await services.initialize();
        if (!report.valid) throw new Error("Fixture validation failed; run primer validate for details.");
        if (!answerMode && args.caseIds.length > 0) throw new Error("--case is supported only by evaluate answers");
        return answerMode ? services.evaluateAnswers({ ...(args.caseIds.length > 0 ? { caseIds: args.caseIds } : {}) }) : services.evaluate();
      },
      answerMode,
    );
    if (answerMode) {
      print(result, args.json, () => answerEvaluationText(result as AnswerEvaluationResult));
    } else {
      print(result, args.json, () => evaluationText(result as EvaluationResult));
    }
    return;
  }

  if (command === "evaluations" && subcommand === "list") {
    const runs = await withServices(config, false, (services) => services.listEvaluationRuns());
    print(
      { schemaVersion: "primer.evaluation-runs.v1", runs },
      args.json,
      () => runs.map((run) => `${run.id}\t${run.schemaVersion}\t${run.fixtureId}\t${run.createdAt}`).join("\n") || "No evaluation runs.",
    );
    return;
  }

  if (command === "evaluations" && subcommand === "show") {
    const runId = rest[0];
    if (!runId) throw new Error("evaluations show requires a run ID");
    const result = await withServices(config, false, (services) => services.getEvaluationRun(runId));
    print(result, args.json, () => JSON.stringify(result, null, 2));
    return;
  }

  throw new Error(`Unknown command: ${args.positionals.join(" ")}\n\n${HELP}`);
}

type ErrorCategory = "configuration" | "source-processing" | "authorization" | "provider" | "evaluation" | "internal";

function errorCategory(args: string[], message: string): ErrorCategory {
  const [command] = args.filter((arg) => !arg.startsWith("--"));
  if (/Unknown user|requires --user/.test(message)) return "authorization";
  if (/OPENROUTER_API_KEY|PRIMER_(?:EMBEDDING|CHAT)_MODEL|Unknown option|requires a value/.test(message)) {
    return "configuration";
  }
  if (command === "evaluate" || command === "evaluations" || command === "readiness") return "evaluation";
  if (command === "sources" || command === "syncs") return "source-processing";
  if (command === "retrieve" || command === "context" || command === "ask") return "provider";
  return "internal";
}

main().catch((cause) => {
  const message = cause instanceof Error ? cause.message : String(cause);
  const category = errorCategory(process.argv.slice(2), message);
  if (process.argv.includes("--json")) {
    process.stderr.write(`${JSON.stringify({ schemaVersion: "primer.error.v1", error: { category, message } }, null, 2)}\n`);
  } else {
    process.stderr.write(`primer [${category}]: ${message}\n`);
  }
  process.exitCode = 1;
});
