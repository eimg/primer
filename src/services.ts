import { existsSync, statSync } from "node:fs";
import { basename, join, resolve } from "node:path";
import type { PrimerConfig } from "./config.js";
import { createDefaultConnectorRegistry } from "./connectors/default.js";
import type { ConnectorRegistry, ProcessedConnectorSource } from "./connectors/registry.js";
import { PrimerDatabase, type StoredRecord } from "./database.js";
import { cosineSimilarity } from "./embeddings.js";
import { loadFixtureIdentities, loadFixtureProjects, validateFixture } from "./fixture.js";
import { buildContextPack } from "./context.js";
import { applyRankingPolicy } from "./ranking.js";
import { isAbstentionText, validateCitations } from "./answers.js";
import {
  ANSWER_EVALUATION_CONTRACT_VERSION,
  ANSWER_CONTRACT_VERSION,
  APPLICATION_VERSION,
  CONTRACT_VERSION,
  MARKDOWN_PROCESSOR_VERSION,
  POLICY_VERSION,
  SLACK_PROCESSOR_VERSION,
  STORAGE_SCHEMA_VERSION,
  type AnswerProvider,
  type EmbeddingProvider,
  type Evidence,
  type FixtureUser,
  type FusedCandidate,
  type GroundedAnswer,
  type Group,
  type IngestResult,
  type LocalSession,
  type OrchestratorContextPack,
  type Project,
  type RetrievalCandidate,
  type RetrievalTrace,
  type RegistrationRemovalResult,
  type SourceRegistration,
  type SourceRemovalResult,
  type SyncRun,
  type SyncTiming,
  type ValidationReport,
} from "./types.js";
import { checksum, elapsedMs, newSessionId, newSyncId, newTraceId, nowIso } from "./utils.js";

export interface EvaluationCaseResult {
  id: string;
  question: string;
  expectedRecordIds: string[];
  expectedCodeContextRefs: string[];
  forbiddenRecordIds: string[];
  forbiddenExposedRecordIds: string[];
  permissionSafe: boolean;
  lexicalRecordIds: string[];
  semanticRecordIds: string[];
  evidenceRecordIds: string[];
  lexicalRecall: number;
  semanticRecall: number;
  unionRecall: number;
  evidenceRecall: number;
  traceId: string;
}

export interface EvaluationResult {
  schemaVersion: "primer.evaluation.v2";
  runId: string;
  fixtureId: string;
  embeddingModel: string;
  cases: EvaluationCaseResult[];
  skippedCaseIds: string[];
  codeContextCaseIds: string[];
  aggregate: {
    cases: number;
    meanLexicalRecall: number;
    meanSemanticRecall: number;
    meanUnionRecall: number;
    meanEvidenceRecall: number;
    permissionCases: number;
    permissionSafeCases: number;
  };
  createdAt: string;
}

interface RawEvaluationCase {
  id: string;
  question: string;
  userId: string;
  projectId?: string;
  expectedRecordIds: string[];
  expectedCodeContextRefs?: string[];
  forbiddenRecordIds?: string[];
  expectedAnswerPoints?: string[];
  mustAbstain?: boolean;
  rationale?: string;
}

export interface AnswerPointResult {
  point: string;
  coverage: number;
  covered: boolean;
}

export interface AnswerEvaluationCaseResult {
  id: string;
  question: string;
  traceId: string;
  model: string;
  answer: string;
  generationAttempts: number;
  expectedAnswerPoints: string[];
  pointResults: AnswerPointResult[];
  mustAbstain: boolean;
  expectedFullAbstention: boolean;
  abstained: boolean;
  behaviorPassed: boolean;
  citationValid: boolean;
  citationValidation: GroundedAnswer["citationValidation"];
  forbiddenRecordIds: string[];
  forbiddenEvidenceRecordIds: string[];
  permissionSafe: boolean;
  requiresSemanticReview: boolean;
  usage?: GroundedAnswer["usage"];
  timingMs: GroundedAnswer["timingMs"];
}

export interface AnswerEvaluationResult {
  schemaVersion: typeof ANSWER_EVALUATION_CONTRACT_VERSION;
  runId: string;
  fixtureId: string;
  applicationVersion: string;
  storageSchemaVersion: number;
  processorVersions: Record<string, string>;
  policyVersion: string;
  embeddingModel: string;
  answerModel: string;
  providerMode: "deterministic" | "live";
  caseFilter?: string[];
  cases: AnswerEvaluationCaseResult[];
  skippedCaseIds: string[];
  aggregate: {
    cases: number;
    citationValidCases: number;
    permissionSafeCases: number;
    expectedFullAbstentionCases: number;
    correctFullAbstentionCases: number;
    expectedAnswerPoints: number;
    coveredAnswerPoints: number;
    meanAnswerPointCoverage: number;
    semanticReviewCases: number;
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
    totalDurationMs: number;
    meanDurationMs: number;
  };
  createdAt: string;
}

interface PreparedConnectorSource {
  entry: ProcessedConnectorSource;
  vectors?: number[][];
  result: IngestResult;
}

export interface ReadinessCheck {
  id: string;
  status: "pass" | "fail" | "warn";
  message: string;
}

export interface PrimerDiagnostics {
  schemaVersion: "primer.diagnostics.v1";
  applicationVersion: string;
  storageSchemaVersion: number;
  fixture: { id?: string; valid: boolean; errors: number; warnings: number };
  database: ReturnType<PrimerDatabase["diagnostics"]>;
  providers: {
    embedding: { provider: string; model: string; configured: boolean };
    chat: { provider: string; model?: string; configured: boolean };
  };
  registrations: {
    total: number;
    never: number;
    completed: number;
    failed: number;
    interrupted: number;
  };
  createdAt: string;
}

export interface ReadinessReport {
  schemaVersion: "primer.readiness.v1";
  ready: boolean;
  mode: "deterministic" | "live";
  checks: ReadinessCheck[];
  diagnostics: PrimerDiagnostics;
  retrieval?: EvaluationResult;
  answers?: AnswerEvaluationResult;
  thresholds: {
    meanUnionRecall: number;
    meanEvidenceRecall: number;
    meanAnswerPointCoverage: number;
  };
  createdAt: string;
}

function canAccess(record: StoredRecord, user: FixtureUser): boolean {
  if (record.access.visibility === "public") return true;
  if (record.access.allowedUserIds.includes(user.id)) return true;
  return record.access.allowedGroupIds.some((groupId) => user.groupIds.includes(groupId));
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((sum, value) => sum + value, 0) / values.length;
}

function recall(expected: string[], actual: string[]): number {
  if (expected.length === 0) return 1;
  const actualSet = new Set(actual);
  return expected.filter((id) => actualSet.has(id)).length / expected.length;
}

const ANSWER_POINT_STOPWORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "for", "from", "in", "is", "it", "of", "on", "or", "the", "to", "was", "with",
]);

function answerPointTokens(value: string): string[] {
  const normalizeMorphology = (token: string): string => {
    if (token === "no") return "not";
    if (token.length <= 3 || /^\d+$/.test(token)) return token;

    let normalized = token;
    if (normalized.endsWith("ically") && normalized.length > 7) {
      normalized = `${normalized.slice(0, -6)}ic`;
    } else if (normalized.endsWith("ies") && normalized.length > 4) {
      normalized = `${normalized.slice(0, -3)}y`;
    } else if (normalized.endsWith("ing") && normalized.length > 5) {
      normalized = normalized.slice(0, -3);
    } else if (normalized.endsWith("ed") && normalized.length > 4) {
      normalized = normalized.slice(0, -2);
    } else if (normalized.endsWith("s") && !normalized.endsWith("ss") && normalized.length > 4) {
      normalized = normalized.slice(0, -1);
    }

    if (/([b-df-hj-np-tv-z])\1$/.test(normalized)) normalized = normalized.slice(0, -1);
    if (normalized.endsWith("e") && normalized.length > 4) normalized = normalized.slice(0, -1);
    return normalized;
  };

  return [
    ...new Set(
      (value.toLowerCase().replaceAll(/[_-]+/g, " ").match(/[a-z0-9]+/g) ?? []).filter(
        (token) => !ANSWER_POINT_STOPWORDS.has(token),
      ).map(normalizeMorphology),
    ),
  ];
}

export function scoreAnswerPoint(point: string, answer: string): AnswerPointResult {
  const expected = answerPointTokens(point);
  const actual = new Set(answerPointTokens(answer));
  const coverage = expected.length === 0 ? 1 : expected.filter((token) => actual.has(token)).length / expected.length;
  return { point, coverage, covered: coverage >= 0.6 };
}

function isAbstention(answer: GroundedAnswer): boolean {
  return answer.model === "primer-abstain" || isAbstentionText(answer.answer);
}

function combineUsage(
  first: GroundedAnswer["usage"],
  second: GroundedAnswer["usage"],
): GroundedAnswer["usage"] {
  if (!first && !second) return undefined;
  const total = (key: "inputTokens" | "outputTokens" | "totalTokens") =>
    (first?.[key] ?? 0) + (second?.[key] ?? 0);
  return { inputTokens: total("inputTokens"), outputTokens: total("outputTokens"), totalTokens: total("totalTokens") };
}

function withoutProjectName(question: string, projectId?: string): string {
  if (!projectId) return question;
  return question.replace(new RegExp(projectId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "gi"), " ");
}

function hasSufficientAnswerEvidence(trace: RetrievalTrace): boolean {
  return trace.lexical.length > 0 || (trace.semantic[0]?.score ?? -1) >= 0.16;
}

export class PrimerServices {
  readonly connectors: ConnectorRegistry;

  constructor(
    readonly config: PrimerConfig,
    readonly database: PrimerDatabase,
    readonly embeddings: EmbeddingProvider,
    connectors?: ConnectorRegistry,
    readonly answers?: AnswerProvider,
  ) {
    this.connectors = connectors ?? createDefaultConnectorRegistry(config.fixtureDir);
  }

  async initialize(): Promise<ValidationReport> {
    const report = await validateFixture(this.config.fixtureDir);
    if (!report.valid) return report;
    const { users, groups } = await loadFixtureIdentities(this.config.fixtureDir);
    this.database.importIdentities(users, groups);
    return report;
  }

  validate(): Promise<ValidationReport> {
    return validateFixture(this.config.fixtureDir);
  }

  listUsers(): FixtureUser[] {
    return this.database.listUsers();
  }

  listGroups(): Group[] {
    return this.database.listGroups();
  }

  async listProjects(): Promise<Project[]> {
    return loadFixtureProjects(this.config.fixtureDir);
  }

  getUser(id: string): FixtureUser {
    const user = this.database.getUser(id);
    if (!user) throw new Error(`Unknown user: ${id}. Run primer init first.`);
    return user;
  }

  updateUserGroups(userId: string, groupIds: string[]): FixtureUser {
    this.getUser(userId);
    const knownGroupIds = new Set(this.database.listGroups().map((group) => group.id));
    const unknown = [...new Set(groupIds)].filter((groupId) => !knownGroupIds.has(groupId));
    if (unknown.length > 0) throw new Error(`Unknown group${unknown.length > 1 ? "s" : ""}: ${unknown.join(", ")}`);
    const updated = this.database.updateUserGroups(userId, groupIds);
    if (!updated) throw new Error(`Unknown user: ${userId}`);
    return updated;
  }

  createLocalSession(userId: string): { session: LocalSession; user: FixtureUser } {
    const user = this.getUser(userId);
    const timestamp = nowIso();
    const session: LocalSession = {
      id: newSessionId(),
      userId,
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.database.createSession(session);
    return { session, user };
  }

  getLocalSession(id: string): { session: LocalSession; user: FixtureUser } | undefined {
    const session = this.database.getSession(id);
    if (!session) return undefined;
    const user = this.database.getUser(session.userId);
    if (!user) return undefined;
    const updatedAt = nowIso();
    this.database.touchSession(id, updatedAt);
    return { session: { ...session, updatedAt }, user };
  }

  deleteLocalSession(id: string): boolean {
    return this.database.deleteSession(id);
  }

  listConnectors(): ReturnType<ConnectorRegistry["list"]> {
    return this.connectors.list();
  }

  configuration(): {
    schemaVersion: "primer.config.v1";
    applicationVersion: string;
    storageSchemaVersion: number;
    policyVersion: string;
    dataDir: string;
    databasePath: string;
    fixtureDir: string;
    embedding: { provider: string; model: string };
    chat: { provider: string; model?: string };
    connectors: ReturnType<ConnectorRegistry["list"]>;
  } {
    return {
      schemaVersion: "primer.config.v1",
      applicationVersion: APPLICATION_VERSION,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      policyVersion: POLICY_VERSION,
      dataDir: this.config.dataDir,
      databasePath: this.config.databasePath,
      fixtureDir: this.config.fixtureDir,
      embedding: { provider: this.config.embeddingProvider, model: this.config.embeddingModel ?? this.embeddings.modelId },
      chat: {
        provider: this.config.chatProvider,
        ...(this.config.chatModel ? { model: this.config.chatModel } : {}),
      },
      connectors: this.connectors.list(),
    };
  }

  async diagnostics(): Promise<PrimerDiagnostics> {
    const [fixture, database] = await Promise.all([
      this.validate(),
      Promise.resolve(this.database.diagnostics()),
    ]);
    const registrations = this.database.listSourceRegistrations();
    const statusCount = (status: SourceRegistration["lastSyncStatus"]) =>
      registrations.filter((registration) => registration.lastSyncStatus === status).length;
    const embeddingConfigured = this.config.embeddingProvider === "deterministic" ||
      Boolean(this.config.openRouterApiKey && this.config.embeddingModel);
    const chatConfigured = this.config.chatProvider === "deterministic" ||
      Boolean(this.config.openRouterApiKey && this.config.chatModel);
    return {
      schemaVersion: "primer.diagnostics.v1",
      applicationVersion: APPLICATION_VERSION,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      fixture: {
        ...(fixture.fixtureId ? { id: fixture.fixtureId } : {}),
        valid: fixture.valid,
        errors: fixture.issues.filter((issue) => issue.severity === "error").length,
        warnings: fixture.issues.filter((issue) => issue.severity === "warning").length,
      },
      database,
      providers: {
        embedding: {
          provider: this.config.embeddingProvider,
          model: this.config.embeddingModel ?? this.embeddings.modelId,
          configured: embeddingConfigured,
        },
        chat: {
          provider: this.config.chatProvider,
          ...(this.config.chatModel ? { model: this.config.chatModel } : {}),
          configured: chatConfigured,
        },
      },
      registrations: {
        total: registrations.length,
        never: statusCount("never"),
        completed: statusCount("completed"),
        failed: statusCount("failed"),
        interrupted: statusCount("interrupted"),
      },
      createdAt: nowIso(),
    };
  }

  async readiness(input: { includeAnswers?: boolean } = {}): Promise<ReadinessReport> {
    await this.initialize();
    const diagnostics = await this.diagnostics();
    const mode = this.config.embeddingProvider === "deterministic" && this.config.chatProvider === "deterministic"
      ? "deterministic"
      : "live";
    const thresholds = {
      meanUnionRecall: 0.95,
      meanEvidenceRecall: 0.9,
      meanAnswerPointCoverage: 0.6,
    };
    const checks: ReadinessCheck[] = [];
    const check = (id: string, passed: boolean, message: string): void => {
      checks.push({ id, status: passed ? "pass" : "fail", message });
    };
    check("fixture", diagnostics.fixture.valid, diagnostics.fixture.valid
      ? `Fixture ${diagnostics.fixture.id ?? "unknown"} is valid.`
      : `Fixture has ${diagnostics.fixture.errors} errors.`);
    check("database-integrity", diagnostics.database.integrity === "ok" && diagnostics.database.foreignKeyViolations === 0,
      `SQLite integrity=${diagnostics.database.integrity}; foreign-key violations=${diagnostics.database.foreignKeyViolations}.`);
    check("storage-schema", diagnostics.database.schemaVersion === STORAGE_SCHEMA_VERSION,
      `Database schema ${diagnostics.database.schemaVersion}; application expects ${STORAGE_SCHEMA_VERSION}.`);
    check("provider-configuration", diagnostics.providers.embedding.configured && (!input.includeAnswers || diagnostics.providers.chat.configured),
      `Embedding provider configured=${diagnostics.providers.embedding.configured}; chat provider configured=${diagnostics.providers.chat.configured}.`);
    check("indexed-content", (diagnostics.database.counts.sources ?? 0) > 0 && (diagnostics.database.counts.records ?? 0) > 0,
      `${diagnostics.database.counts.sources ?? 0} sources and ${diagnostics.database.counts.records ?? 0} records are indexed.`);
    check("managed-synchronization", diagnostics.registrations.total > 0 && diagnostics.registrations.completed === diagnostics.registrations.total,
      `${diagnostics.registrations.completed}/${diagnostics.registrations.total} registrations completed; ${diagnostics.registrations.failed} failed; ${diagnostics.registrations.interrupted} interrupted.`);

    let retrieval: EvaluationResult | undefined;
    try {
      retrieval = await this.evaluate();
      check("retrieval-union-recall", retrieval.aggregate.meanUnionRecall >= thresholds.meanUnionRecall,
        `Mean union recall ${(retrieval.aggregate.meanUnionRecall * 100).toFixed(1)}%; threshold ${(thresholds.meanUnionRecall * 100).toFixed(1)}%.`);
      check("retrieval-evidence-recall", retrieval.aggregate.meanEvidenceRecall >= thresholds.meanEvidenceRecall,
        `Mean evidence recall ${(retrieval.aggregate.meanEvidenceRecall * 100).toFixed(1)}%; threshold ${(thresholds.meanEvidenceRecall * 100).toFixed(1)}%.`);
      check("retrieval-permissions", retrieval.aggregate.permissionCases === retrieval.aggregate.permissionSafeCases,
        `${retrieval.aggregate.permissionSafeCases}/${retrieval.aggregate.permissionCases} permission cases are safe.`);
    } catch (cause) {
      checks.push({ id: "retrieval-evaluation", status: "fail", message: cause instanceof Error ? cause.message : String(cause) });
    }

    let answers: AnswerEvaluationResult | undefined;
    if (input.includeAnswers) {
      try {
        answers = await this.evaluateAnswers();
        check("answer-citations", answers.aggregate.citationValidCases === answers.aggregate.cases,
          `${answers.aggregate.citationValidCases}/${answers.aggregate.cases} answers have valid citations.`);
        check("answer-permissions", answers.aggregate.permissionSafeCases === answers.aggregate.cases,
          `${answers.aggregate.permissionSafeCases}/${answers.aggregate.cases} answers are permission-safe.`);
        check("answer-abstention", answers.aggregate.correctFullAbstentionCases === answers.aggregate.expectedFullAbstentionCases,
          `${answers.aggregate.correctFullAbstentionCases}/${answers.aggregate.expectedFullAbstentionCases} full-abstention cases are correct.`);
        check("answer-behavior", answers.cases.every((item) => item.behaviorPassed),
          `${answers.cases.filter((item) => item.behaviorPassed).length}/${answers.aggregate.cases} answer behaviors pass.`);
        check("answer-point-coverage", answers.aggregate.meanAnswerPointCoverage >= thresholds.meanAnswerPointCoverage,
          `Mean answer-point coverage ${(answers.aggregate.meanAnswerPointCoverage * 100).toFixed(1)}%; threshold ${(thresholds.meanAnswerPointCoverage * 100).toFixed(1)}%.`);
        if (answers.aggregate.semanticReviewCases > 0) {
          checks.push({
            id: "semantic-review",
            status: "warn",
            message: `${answers.aggregate.semanticReviewCases} answer cases still require human semantic review.`,
          });
        }
      } catch (cause) {
        checks.push({ id: "answer-evaluation", status: "fail", message: cause instanceof Error ? cause.message : String(cause) });
      }
    } else {
      checks.push({ id: "answer-evaluation", status: "warn", message: "Answer evaluation was not requested." });
    }

    return {
      schemaVersion: "primer.readiness.v1",
      ready: checks.every((item) => item.status !== "fail"),
      mode,
      checks,
      diagnostics,
      ...(retrieval ? { retrieval } : {}),
      ...(answers ? { answers } : {}),
      thresholds,
      createdAt: nowIso(),
    };
  }

  async backup(destination: string) {
    const target = resolve(destination);
    if (target === this.config.databasePath) throw new Error("Backup destination must differ from the active database.");
    if (existsSync(target)) throw new Error(`Backup destination already exists: ${target}`);
    const result = await this.database.backup(target);
    return {
      schemaVersion: "primer.backup.v1" as const,
      source: this.config.databasePath,
      destination: result.destination,
      pages: result.pages,
      bytes: statSync(target).size,
      createdAt: nowIso(),
    };
  }

  registerSource(input: {
    connectorId: string;
    path?: string;
    locator?: import("./connectors/contracts.js").ConnectorLocator;
    config?: Record<string, unknown>;
  }): SourceRegistration {
    if (!input.path && !input.locator) throw new Error("Source registration requires a path or locator.");
    const provided = input.locator ?? { type: "local-path" as const, value: input.path! };
    const locator = provided.type === "local-path" ? { ...provided, value: resolve(provided.value) } : provided;
    this.connectors.assertSupports(input.connectorId, locator);
    const connector = this.connectors.describe(input.connectorId);
    const timestamp = nowIso();
    return this.database.registerSource({
      id: `reg_${checksum(`${input.connectorId}\0${JSON.stringify(locator)}\0${JSON.stringify(input.config ?? {})}`).slice(0, 16)}`,
      connectorId: input.connectorId,
      sourceFamily: connector.sourceFamily,
      locator,
      config: input.config ?? {},
      path: locator.value,
      createdAt: timestamp,
      updatedAt: timestamp,
      lastSyncStatus: "never",
    });
  }

  listSourceRegistrations(): SourceRegistration[] {
    return this.database.listSourceRegistrations();
  }

  inspectSourceRegistration(id: string): {
    schemaVersion: "primer.source-registration.v1";
    registration: SourceRegistration;
    sourceIds: string[];
    syncRuns: SyncRun[];
  } {
    const registration = this.database.getSourceRegistration(id);
    if (!registration) throw new Error(`Unknown source registration: ${id}`);
    return {
      schemaVersion: "primer.source-registration.v1",
      registration,
      sourceIds: this.database.listSourceIdsForRegistration(id),
      syncRuns: this.database.listSyncRuns(id),
    };
  }

  async checkSourceRegistration(id: string) {
    const registration = this.database.getSourceRegistration(id);
    if (!registration) throw new Error(`Unknown source registration: ${id}`);
    return this.connectors.health(
      registration.connectorId,
      registration.locator ?? { type: "local-path", value: registration.path },
      registration.config ?? {},
    );
  }

  private async prepareProcessedSources(
    sources: ProcessedConnectorSource[],
    registrationId?: string,
    timing?: Pick<SyncTiming, "embedding">,
  ): Promise<PreparedConnectorSource[]> {
    const prepared: PreparedConnectorSource[] = [];
    for (const entry of sources) {
      const { processorVersion, processed } = entry;
      const previous = this.database.getSourceVersion(processed.source.sourceId);
      if (registrationId && previous?.registrationId && previous.registrationId !== registrationId) {
        throw new Error(
          `Source ${processed.source.sourceId} is already managed by registration ${previous.registrationId}.`,
        );
      }
      if (!registrationId && previous?.registrationId && previous.sourceVersion !== processed.sourceVersion) {
        throw new Error(
          `Source ${processed.source.sourceId} is managed by registration ${previous.registrationId}; synchronize that registration instead.`,
        );
      }
      if (
        previous?.sourceVersion === processed.sourceVersion &&
        previous.processorVersion === processorVersion &&
        previous.embeddingModel === this.embeddings.modelId
      ) {
        prepared.push({ entry, result: this.ingestResult(entry, "unchanged") });
        continue;
      }
      const embeddingStart = process.hrtime.bigint();
      const vectors = await this.embeddings.embedMany(
        processed.records.map((record) => `${record.title}\n${record.content}`),
      );
      if (timing) timing.embedding += elapsedMs(embeddingStart);
      prepared.push({ entry, vectors, result: this.ingestResult(entry, previous ? "replaced" : "indexed") });
    }
    return prepared;
  }

  private ingestResult(entry: ProcessedConnectorSource, status: IngestResult["status"]): IngestResult {
    const { connectorId, processed } = entry;
    return {
      connectorId,
      sourceFamily: processed.source.source,
      sourceId: processed.source.sourceId,
      status,
      accepted: processed.records.length,
      rejected: processed.decisions.filter((decision) => decision.decision === "rejected").length,
      recordIds: processed.records.map((record) => record.id),
    };
  }

  private applyPreparedSources(prepared: PreparedConnectorSource[], registrationId?: string): IngestResult[] {
    for (const { entry, vectors, result } of prepared) {
      const { externalId, processorVersion, processed } = entry;
      if (result.status === "unchanged") {
        if (registrationId) this.database.assignSourceRegistration(processed.source.sourceId, registrationId, externalId);
        continue;
      }
      if (!vectors) throw new Error(`Prepared source ${processed.source.sourceId} is missing embeddings.`);
      this.database.replaceSource(
        processed,
        vectors,
        this.embeddings.modelId,
        processorVersion,
        registrationId,
        externalId,
      );
    }
    return prepared.map(({ result }) => result);
  }

  async ingest(input: { path?: string; connectorId?: string } = {}): Promise<IngestResult[]> {
    const sources = await this.connectors.process(input);
    const prepared = await this.prepareProcessedSources(sources);
    return this.database.atomic(() => this.applyPreparedSources(prepared));
  }

  async synchronize(input: { registrationId?: string } = {}): Promise<SyncRun[]> {
    const registrations = input.registrationId
      ? [this.database.getSourceRegistration(input.registrationId)].filter(
          (registration): registration is SourceRegistration => Boolean(registration),
        )
      : this.database.listSourceRegistrations();
    if (input.registrationId && registrations.length === 0) {
      throw new Error(`Unknown source registration: ${input.registrationId}`);
    }
    if (registrations.length === 0) throw new Error("No registered sources. Run primer sources register first.");

    const runs: SyncRun[] = [];
    for (const registration of registrations) runs.push(await this.synchronizeRegistration(registration));
    return runs;
  }

  private async synchronizeRegistration(registration: SourceRegistration): Promise<SyncRun> {
    const descriptor = this.connectors.describe(registration.connectorId);
    const startedAt = nowIso();
    const totalStart = process.hrtime.bigint();
    const timingMs: SyncTiming = {
      acquisitionAndProcessing: 0,
      embedding: 0,
      indexWrite: 0,
      cleanup: 0,
      total: 0,
    };
    let run: SyncRun = {
      schemaVersion: "primer.sync.v1",
      id: newSyncId(),
      registrationId: registration.id,
      connectorId: registration.connectorId,
      sourceFamily: registration.sourceFamily,
      status: "running",
      applicationVersion: APPLICATION_VERSION,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      processorVersion: descriptor.processorVersion,
      policyVersion: POLICY_VERSION,
      embeddingModel: this.embeddings.modelId,
      ownerProcessId: process.pid,
      results: [],
      removedSourceIds: [],
      timingMs,
      startedAt,
    };
    this.database.saveSyncRun(run);
    try {
      const processStart = process.hrtime.bigint();
      const acquisition = await this.connectors.acquire({
        connectorId: registration.connectorId,
        locator: registration.locator ?? { type: "local-path", value: registration.path },
        config: registration.config ?? {},
        ...(registration.checkpointCursor ? { checkpointCursor: registration.checkpointCursor } : {}),
      });
      timingMs.acquisitionAndProcessing = elapsedMs(processStart);
      const previousSourceIds = this.database.listSourceIdsForRegistration(registration.id);
      const prepared = await this.prepareProcessedSources(acquisition.processed, registration.id, timingMs);
      const results = prepared.map(({ result }) => result);
      const observed = new Set(results.map((result) => result.sourceId));
      const removedSourceIds = acquisition.mode === "snapshot"
          ? previousSourceIds.filter((sourceId) => !observed.has(sourceId))
          : [...new Set(acquisition.tombstones.flatMap((tombstone) => {
            const mapped = this.database.sourceIdsForExternalId(registration.id, tombstone.externalId);
            if (mapped.length > 0) return mapped;
            if (tombstone.sourceId && previousSourceIds.includes(tombstone.sourceId)) return [tombstone.sourceId];
            return [];
          }))];
      this.database.atomic(() => {
        const writeStart = process.hrtime.bigint();
        this.applyPreparedSources(prepared, registration.id);
        timingMs.indexWrite = elapsedMs(writeStart);
        const cleanupStart = process.hrtime.bigint();
        for (const sourceId of removedSourceIds) this.database.removeSource(sourceId);
        this.database.saveRegistrationCheckpoint(registration.id, acquisition.checkpointCursor);
        timingMs.cleanup = elapsedMs(cleanupStart);
        timingMs.total = elapsedMs(totalStart);
        run = { ...run, status: "completed", results, removedSourceIds, timingMs, completedAt: nowIso() };
        this.database.saveSyncRun(run);
      });
      return run;
    } catch (cause) {
      timingMs.total = elapsedMs(totalStart);
      const error = cause instanceof Error ? cause.message : String(cause);
      run = { ...run, status: "failed", error, timingMs, completedAt: nowIso() };
      this.database.saveSyncRun(run);
      throw new Error(`Synchronization ${run.id} failed: ${error}`);
    }
  }

  listSyncRuns(): SyncRun[] {
    return this.database.listSyncRuns();
  }

  getSyncRun(id: string): SyncRun {
    const run = this.database.getSyncRun(id);
    if (!run) throw new Error(`Unknown synchronization run: ${id}`);
    return run;
  }

  removeSource(sourceId: string): SourceRemovalResult {
    const result = this.database.removeSource(sourceId);
    return { schemaVersion: "primer.source-removal.v1", sourceId, ...result };
  }

  unregisterSource(id: string): RegistrationRemovalResult {
    const result = this.database.removeRegistration(id);
    if (!result) throw new Error(`Unknown source registration: ${id}`);
    return { schemaVersion: "primer.registration-removal.v1", registrationId: id, ...result };
  }

  listSources(): ReturnType<PrimerDatabase["listSources"]> {
    return this.database.listSources();
  }

  inspectSource(sourceId: string): NonNullable<ReturnType<PrimerDatabase["inspectSource"]>> {
    const result = this.database.inspectSource(sourceId);
    if (!result) throw new Error(`Unknown source: ${sourceId}`);
    return result;
  }

  async retrieve(input: { question: string; userId: string; projectId?: string; limit?: number }): Promise<RetrievalTrace> {
    const totalStart = process.hrtime.bigint();
    const user = this.getUser(input.userId);
    const limit = Math.max(1, Math.min(input.limit ?? 6, 20));

    const authorizationStart = process.hrtime.bigint();
    const permitted = this.database
      .listRecords()
      .filter((record) => canAccess(record, user))
      .filter((record) => !input.projectId || record.projectId === input.projectId);
    const authorization = elapsedMs(authorizationStart);
    const incompatible = permitted.find((record) => record.embeddingModel !== this.embeddings.modelId);
    if (incompatible) {
      throw new Error(
        `Indexed records use ${incompatible.embeddingModel}, but the configured query model is ${this.embeddings.modelId}. Re-ingest before retrieval.`,
      );
    }

    const candidateLimit = Math.max(limit * 4, 20);
    const lexicalStart = process.hrtime.bigint();
    const lexical = this.database.lexicalSearch(
      permitted.map((record) => record.id),
      withoutProjectName(input.question, input.projectId),
      candidateLimit,
    );
    const lexicalMs = elapsedMs(lexicalStart);

    const semanticStart = process.hrtime.bigint();
    const queryVector = await this.embeddings.embed(input.question);
    const semantic: RetrievalCandidate[] = permitted
      .map((record) => ({ record, score: cosineSimilarity(queryVector, record.embedding) }))
      .sort((left, right) => right.score - left.score || left.record.id.localeCompare(right.record.id))
      .slice(0, candidateLimit)
      .map(({ record, score }, index) => ({
        recordId: record.id,
        title: record.title,
        sourceRef: record.sourceRef,
        ...(record.projectId ? { projectId: record.projectId } : {}),
        rank: index + 1,
        score,
        reason: `cosine similarity ${score.toFixed(4)} using ${this.embeddings.modelId}`,
      }));
    const semanticMs = elapsedMs(semanticStart);

    const fusionStart = process.hrtime.bigint();
    const candidateMap = new Map<string, FusedCandidate>();
    const addCandidate = (candidate: RetrievalCandidate, kind: "lexical" | "semantic") => {
      const previous = candidateMap.get(candidate.recordId);
      const contribution = 1 / (60 + candidate.rank);
      const retrievalReasons = [...(previous?.retrievalReasons ?? []), candidate.reason];
      candidateMap.set(candidate.recordId, {
        ...(previous ?? candidate),
        ...(kind === "lexical" ? { lexicalRank: candidate.rank } : { semanticRank: candidate.rank }),
        baseFusedScore: (previous?.baseFusedScore ?? 0) + contribution,
        fusedScore: (previous?.baseFusedScore ?? 0) + contribution,
        retrievalReasons,
        policyAdjustment: 0,
        policyReasons: [],
      });
    };
    lexical.forEach((candidate) => addCandidate(candidate, "lexical"));
    semantic.forEach((candidate) => addCandidate(candidate, "semantic"));
    const fused = applyRankingPolicy([...candidateMap.values()], permitted);
    const fusionMs = elapsedMs(fusionStart);

    const evidenceStart = process.hrtime.bigint();
    const recordsById = new Map(permitted.map((record) => [record.id, record]));
    const evidence: Evidence[] = fused.slice(0, limit).flatMap((candidate, index) => {
      const record = recordsById.get(candidate.recordId);
      if (!record) return [];
      return [
        {
          evidenceId: `E${index + 1}`,
          recordId: record.id,
          title: record.title,
          excerpt: record.content.length > 900 ? `${record.content.slice(0, 897)}...` : record.content,
          source: record.source,
          sourceRef: record.sourceRef,
          updatedAt: record.updatedAt,
          authority: record.authority,
          ...(record.resolutionState ? { resolutionState: record.resolutionState } : {}),
          retrievalReasons: candidate.retrievalReasons,
          policyReasons: candidate.policyReasons,
          permissionChecked: true,
        },
      ];
    });
    const evidenceMs = elapsedMs(evidenceStart);
    const trace: RetrievalTrace = {
      schemaVersion: CONTRACT_VERSION,
      traceId: newTraceId(),
      question: input.question,
      userId: user.id,
      ...(input.projectId ? { projectId: input.projectId } : {}),
      applicationVersion: APPLICATION_VERSION,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      policyVersion: POLICY_VERSION,
      processorVersions: { markdown: MARKDOWN_PROCESSOR_VERSION, slack: SLACK_PROCESSOR_VERSION },
      embeddingModel: this.embeddings.modelId,
      lexical,
      semantic,
      fused,
      evidence,
      timingMs: {
        authorization,
        lexical: lexicalMs,
        semantic: semanticMs,
        fusion: fusionMs,
        evidence: evidenceMs,
        total: elapsedMs(totalStart),
      },
      createdAt: nowIso(),
    };
    this.database.saveTrace(trace);
    return trace;
  }

  async context(input: { question: string; userId: string; projectId?: string; limit?: number }): Promise<OrchestratorContextPack> {
    return buildContextPack(await this.retrieve(input));
  }

  async ask(input: { question: string; userId: string; projectId?: string; limit?: number }): Promise<GroundedAnswer> {
    const totalStart = process.hrtime.bigint();
    const trace = await this.retrieve(input);
    const context = buildContextPack(trace);
    if (context.evidence.length === 0 || !hasSufficientAnswerEvidence(trace)) {
      const validationStart = process.hrtime.bigint();
      const answer = "I do not have enough authorized evidence to answer.";
      const citationValidation = validateCitations(answer, context.evidence);
      const validation = elapsedMs(validationStart);
      return {
        schemaVersion: ANSWER_CONTRACT_VERSION,
        traceId: context.traceId,
        question: context.question,
        actorId: context.actorId,
        ...(context.projectId ? { projectId: context.projectId } : {}),
        answer,
        modelInputEvidenceIds: [],
        evidence: context.evidence,
        constraints: context.constraints,
        conflicts: context.conflicts,
        citationValidation,
        model: "primer-abstain",
        configuredModel: "primer-abstain",
        finishReason: "not-called",
        generationAttempts: 0,
        timingMs: {
          retrieval: trace.timingMs.total,
          generation: 0,
          validation,
          total: elapsedMs(totalStart),
        },
        createdAt: nowIso(),
      };
    }
    if (!this.answers) throw new Error("An answer provider is required for the ask command.");
    const generationStart = process.hrtime.bigint();
    const generationInput = {
      question: context.question,
      evidence: context.evidence,
      constraints: context.constraints,
      conflicts: context.conflicts,
    };
    let generated = await this.answers.generate(generationInput);
    let validationStart = process.hrtime.bigint();
    let citationValidation = validateCitations(generated.text, context.evidence);
    let validation = elapsedMs(validationStart);
    let generationAttempts = 1;
    if (!citationValidation.valid) {
      const first = generated;
      generated = await this.answers.generate({
        ...generationInput,
        revision: {
          previousAnswer: first.text,
          invalidEvidenceIds: citationValidation.invalidEvidenceIds,
          uncitedClaims: citationValidation.uncitedClaims,
        },
      });
      const combinedUsage = combineUsage(first.usage, generated.usage);
      generated = { ...generated, ...(combinedUsage ? { usage: combinedUsage } : {}) };
      generationAttempts = 2;
      validationStart = process.hrtime.bigint();
      citationValidation = validateCitations(generated.text, context.evidence);
      validation += elapsedMs(validationStart);
    }
    const generation = Math.max(0, elapsedMs(generationStart) - validation);
    return {
      schemaVersion: ANSWER_CONTRACT_VERSION,
      traceId: context.traceId,
      question: context.question,
      actorId: context.actorId,
      ...(context.projectId ? { projectId: context.projectId } : {}),
      answer: generated.text,
      modelInputEvidenceIds: context.evidence.map((item) => item.evidenceId),
      evidence: context.evidence,
      constraints: context.constraints,
      conflicts: context.conflicts,
      citationValidation,
      model: generated.modelId ?? this.answers.modelId,
      configuredModel: this.answers.modelId,
      finishReason: generated.finishReason,
      generationAttempts,
      ...(generated.usage ? { usage: generated.usage } : {}),
      timingMs: {
        retrieval: trace.timingMs.total,
        generation,
        validation,
        total: elapsedMs(totalStart),
      },
      createdAt: nowIso(),
    };
  }

  async evaluateAnswers(input: { caseIds?: string[] } = {}): Promise<AnswerEvaluationResult> {
    if (!this.answers) throw new Error("An answer provider is required for answer evaluation.");
    const { readFile } = await import("node:fs/promises");
    const cases = JSON.parse(
      await readFile(join(this.config.fixtureDir, "evaluation", "cases.json"), "utf8"),
    ) as RawEvaluationCase[];
    const manifest = JSON.parse(await readFile(join(this.config.fixtureDir, "manifest.json"), "utf8")) as {
      datasetId: string;
    };
    const caseFilter = [...new Set(input.caseIds ?? [])];
    const knownCaseIds = new Set(cases.map((evaluation) => evaluation.id));
    const unknownCaseIds = caseFilter.filter((id) => !knownCaseIds.has(id));
    if (unknownCaseIds.length > 0) throw new Error(`Unknown evaluation case${unknownCaseIds.length > 1 ? "s" : ""}: ${unknownCaseIds.join(", ")}`);
    const selectedCases = caseFilter.length > 0 ? cases.filter((evaluation) => caseFilter.includes(evaluation.id)) : cases;
    const results: AnswerEvaluationCaseResult[] = [];
    const skippedCaseIds: string[] = [];
    for (const evaluation of selectedCases) {
      if (evaluation.expectedRecordIds.length === 0 && (evaluation.expectedCodeContextRefs?.length ?? 0) > 0) {
        skippedCaseIds.push(evaluation.id);
        continue;
      }
      const answer = await this.ask({
        question: evaluation.question,
        userId: evaluation.userId,
        ...(evaluation.projectId ? { projectId: evaluation.projectId } : {}),
        limit: 5,
      });
      const expectedAnswerPoints = evaluation.expectedAnswerPoints ?? [];
      const pointResults = expectedAnswerPoints.map((point) => scoreAnswerPoint(point, answer.answer));
      const expectedFullAbstention = evaluation.mustAbstain === true && expectedAnswerPoints.length === 0;
      const abstained = isAbstention(answer);
      const forbiddenRecordIds = evaluation.forbiddenRecordIds ?? [];
      const forbiddenEvidenceRecordIds = answer.evidence
        .map((item) => item.recordId)
        .filter((recordId) => forbiddenRecordIds.includes(recordId));
      results.push({
        id: evaluation.id,
        question: evaluation.question,
        traceId: answer.traceId,
        model: answer.model,
        answer: answer.answer,
        generationAttempts: answer.generationAttempts,
        expectedAnswerPoints,
        pointResults,
        mustAbstain: evaluation.mustAbstain === true,
        expectedFullAbstention,
        abstained,
        behaviorPassed: expectedFullAbstention ? abstained : !abstained,
        citationValid: answer.citationValidation.valid,
        citationValidation: answer.citationValidation,
        forbiddenRecordIds,
        forbiddenEvidenceRecordIds,
        permissionSafe: forbiddenEvidenceRecordIds.length === 0,
        requiresSemanticReview:
          !answer.citationValidation.valid ||
          (evaluation.mustAbstain === true && expectedAnswerPoints.length > 0) ||
          pointResults.some((item) => !item.covered),
        ...(answer.usage ? { usage: answer.usage } : {}),
        timingMs: answer.timingMs,
      });
    }
    const pointResults = results.flatMap((item) => item.pointResults);
    const tokenTotals = results.reduce(
      (totals, item) => ({
        inputTokens: totals.inputTokens + (item.usage?.inputTokens ?? 0),
        outputTokens: totals.outputTokens + (item.usage?.outputTokens ?? 0),
        totalTokens: totals.totalTokens + (item.usage?.totalTokens ?? 0),
      }),
      { inputTokens: 0, outputTokens: 0, totalTokens: 0 },
    );
    const runId = `answer_eval_${Date.now()}_${basename(this.config.fixtureDir)}`;
    const totalDurationMs = results.reduce((sum, item) => sum + item.timingMs.total, 0);
    const result: AnswerEvaluationResult = {
      schemaVersion: ANSWER_EVALUATION_CONTRACT_VERSION,
      runId,
      fixtureId: manifest.datasetId,
      applicationVersion: APPLICATION_VERSION,
      storageSchemaVersion: STORAGE_SCHEMA_VERSION,
      processorVersions: { markdown: MARKDOWN_PROCESSOR_VERSION, slack: SLACK_PROCESSOR_VERSION },
      policyVersion: POLICY_VERSION,
      embeddingModel: this.embeddings.modelId,
      answerModel: this.answers.modelId,
      providerMode: this.answers.modelId.startsWith("deterministic-") ? "deterministic" : "live",
      ...(caseFilter.length > 0 ? { caseFilter } : {}),
      cases: results,
      skippedCaseIds,
      aggregate: {
        cases: results.length,
        citationValidCases: results.filter((item) => item.citationValid).length,
        permissionSafeCases: results.filter((item) => item.permissionSafe).length,
        expectedFullAbstentionCases: results.filter((item) => item.expectedFullAbstention).length,
        correctFullAbstentionCases: results.filter((item) => item.expectedFullAbstention && item.abstained).length,
        expectedAnswerPoints: pointResults.length,
        coveredAnswerPoints: pointResults.filter((item) => item.covered).length,
        meanAnswerPointCoverage: mean(pointResults.map((item) => item.coverage)),
        semanticReviewCases: results.filter((item) => item.requiresSemanticReview).length,
        ...tokenTotals,
        totalDurationMs,
        meanDurationMs: mean(results.map((item) => item.timingMs.total)),
      },
      createdAt: nowIso(),
    };
    this.database.saveEvaluationRun(runId, result.fixtureId, result.embeddingModel, result.schemaVersion, result);
    return result;
  }

  getTrace(id: string): RetrievalTrace {
    const trace = this.database.getTrace(id);
    if (!trace) throw new Error(`Unknown trace: ${id}`);
    return trace;
  }

  listTraces(): ReturnType<PrimerDatabase["listTraces"]> {
    return this.database.listTraces();
  }

  listEvaluationRuns(): ReturnType<PrimerDatabase["listEvaluationRuns"]> {
    return this.database.listEvaluationRuns();
  }

  getEvaluationRun(id: string): unknown {
    const result = this.database.getEvaluationRun(id);
    if (!result) throw new Error(`Unknown evaluation run: ${id}`);
    return result;
  }

  async evaluate(): Promise<EvaluationResult> {
    const { readFile } = await import("node:fs/promises");
    const cases = JSON.parse(
      await readFile(join(this.config.fixtureDir, "evaluation", "cases.json"), "utf8"),
    ) as RawEvaluationCase[];
    const manifest = JSON.parse(await readFile(join(this.config.fixtureDir, "manifest.json"), "utf8")) as {
      datasetId: string;
    };
    const results: EvaluationCaseResult[] = [];
    const skippedCaseIds: string[] = [];
    const codeContextCaseIds = cases
      .filter((evaluation) => (evaluation.expectedCodeContextRefs?.length ?? 0) > 0)
      .map((evaluation) => evaluation.id);
    for (const evaluation of cases) {
      const indexedRecordIds = new Set(this.database.listRecords().map((record) => record.id));
      const expected = evaluation.expectedRecordIds.filter((id) => indexedRecordIds.has(id));
      const forbidden = (evaluation.forbiddenRecordIds ?? []).filter((id) => indexedRecordIds.has(id));
      if (expected.length === 0 && forbidden.length === 0) {
        skippedCaseIds.push(evaluation.id);
        continue;
      }
      const trace = await this.retrieve({
        question: evaluation.question,
        userId: evaluation.userId,
        ...(evaluation.projectId ? { projectId: evaluation.projectId } : {}),
        limit: 5,
      });
      const lexicalRecordIds = trace.lexical.map((candidate) => candidate.recordId);
      const semanticRecordIds = trace.semantic.map((candidate) => candidate.recordId);
      const evidenceRecordIds = trace.evidence.map((item) => item.recordId);
      const exposedRecordIds = new Set([...lexicalRecordIds, ...semanticRecordIds, ...evidenceRecordIds]);
      const forbiddenExposedRecordIds = forbidden.filter((id) => exposedRecordIds.has(id));
      results.push({
        id: evaluation.id,
        question: evaluation.question,
        expectedRecordIds: expected,
        expectedCodeContextRefs: evaluation.expectedCodeContextRefs ?? [],
        forbiddenRecordIds: forbidden,
        forbiddenExposedRecordIds,
        permissionSafe: forbiddenExposedRecordIds.length === 0,
        lexicalRecordIds,
        semanticRecordIds,
        evidenceRecordIds,
        lexicalRecall: recall(expected, lexicalRecordIds),
        semanticRecall: recall(expected, semanticRecordIds),
        unionRecall: recall(expected, [...new Set([...lexicalRecordIds, ...semanticRecordIds])]),
        evidenceRecall: recall(expected, evidenceRecordIds),
        traceId: trace.traceId,
      });
    }
    const runId = `eval_${Date.now()}_${basename(this.config.fixtureDir)}`;
    const result: EvaluationResult = {
      schemaVersion: "primer.evaluation.v2",
      runId,
      fixtureId: manifest.datasetId,
      embeddingModel: this.embeddings.modelId,
      cases: results,
      skippedCaseIds,
      codeContextCaseIds,
      aggregate: {
        cases: results.length,
        meanLexicalRecall: mean(results.map((item) => item.lexicalRecall)),
        meanSemanticRecall: mean(results.map((item) => item.semanticRecall)),
        meanUnionRecall: mean(results.map((item) => item.unionRecall)),
        meanEvidenceRecall: mean(results.map((item) => item.evidenceRecall)),
        permissionCases: results.filter((item) => item.forbiddenRecordIds.length > 0).length,
        permissionSafeCases: results.filter(
          (item) => item.forbiddenRecordIds.length > 0 && item.permissionSafe,
        ).length,
      },
      createdAt: nowIso(),
    };
    this.database.saveEvaluationRun(runId, result.fixtureId, result.embeddingModel, result.schemaVersion, result);
    return result;
  }
}
