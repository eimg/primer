export const CONTRACT_VERSION = "primer.retrieval.v3";
export const CONTEXT_CONTRACT_VERSION = "primer.context.v1";
export const ANSWER_CONTRACT_VERSION = "primer.answer.v1";
export const ANSWER_EVALUATION_CONTRACT_VERSION = "primer.answer-evaluation.v1";
export const APPLICATION_VERSION = "0.1.0";
export const STORAGE_SCHEMA_VERSION = 3;
export const MARKDOWN_PROCESSOR_VERSION = "markdown-v1";
export const SLACK_PROCESSOR_VERSION = "slack-thread-v1";
export const PROCESSOR_VERSION = MARKDOWN_PROCESSOR_VERSION;
export const POLICY_VERSION = "index-v1";

export type SourceFamily = string;

export type Visibility = "public" | "group" | "restricted";

export interface AccessDescriptor {
  visibility: Visibility;
  allowedGroupIds: string[];
  allowedUserIds: string[];
}

export interface FixtureUser {
  id: string;
  name: string;
  title: string;
  email: string;
  groupIds: string[];
}

export interface SourceObject {
  source: SourceFamily;
  sourceId: string;
  sourceRef: string;
  sourceType: string;
  rawContent: string;
  createdAt: string;
  updatedAt: string;
  authors: string[];
  projectId?: string;
  metadata: Record<string, unknown>;
  access: AccessDescriptor;
}

export interface KnowledgeRecord {
  id: string;
  source: SourceFamily;
  sourceId: string;
  sourceRef: string;
  sourceVersion: string;
  parentId?: string;
  title: string;
  content: string;
  contentChecksum: string;
  projectId?: string;
  updatedAt: string;
  authority: number;
  resolutionState?: "proposed" | "resolved" | "superseded";
  metadata: Record<string, unknown>;
  access: AccessDescriptor;
}

export interface IndexDecision {
  sourceId: string;
  recordId: string;
  decision: "accepted" | "rejected";
  reason: string;
  policyVersion: string;
}

export interface ProcessedSource {
  source: SourceObject;
  sourceVersion: string;
  records: KnowledgeRecord[];
  decisions: IndexDecision[];
}

export interface EmbeddingProvider {
  readonly modelId: string;
  embed(value: string): Promise<number[]>;
  embedMany(values: string[]): Promise<number[][]>;
}

export interface RetrievalCandidate {
  recordId: string;
  title: string;
  sourceRef: string;
  projectId?: string;
  rank: number;
  score: number;
  reason: string;
}

export interface FusedCandidate extends RetrievalCandidate {
  lexicalRank?: number;
  semanticRank?: number;
  baseFusedScore: number;
  fusedScore: number;
  retrievalReasons: string[];
  policyAdjustment: number;
  policyReasons: PolicyReason[];
}

export interface PolicyReason {
  kind: "authority" | "freshness" | "resolution";
  adjustment: number;
  reason: string;
}

export interface Evidence {
  evidenceId: string;
  recordId: string;
  title: string;
  excerpt: string;
  source: SourceFamily;
  sourceRef: string;
  updatedAt: string;
  authority: number;
  resolutionState?: KnowledgeRecord["resolutionState"];
  retrievalReasons: string[];
  policyReasons: PolicyReason[];
  permissionChecked: true;
}

export interface RetrievalTrace {
  schemaVersion: typeof CONTRACT_VERSION;
  traceId: string;
  question: string;
  userId: string;
  projectId?: string;
  applicationVersion: string;
  storageSchemaVersion: number;
  policyVersion: string;
  processorVersions: Record<string, string>;
  embeddingModel: string;
  lexical: RetrievalCandidate[];
  semantic: RetrievalCandidate[];
  fused: FusedCandidate[];
  evidence: Evidence[];
  timingMs: {
    authorization: number;
    lexical: number;
    semantic: number;
    fusion: number;
    evidence: number;
    total: number;
  };
  createdAt: string;
}

export interface ContextConstraint {
  text: string;
  evidenceIds: string[];
}

export interface ContextConflict {
  text: string;
  evidenceIds: string[];
}

export interface CodeLead {
  ref: string;
  reason: string;
  evidenceIds: string[];
  verifiedAgainstRepository: false;
}

export interface OrchestratorContextPack {
  schemaVersion: typeof CONTEXT_CONTRACT_VERSION;
  traceId: string;
  actorId: string;
  question: string;
  projectId?: string;
  evidence: Evidence[];
  constraints: ContextConstraint[];
  conflicts: ContextConflict[];
  codeLeads: CodeLead[];
  createdAt: string;
}

export interface AnswerGenerationInput {
  question: string;
  evidence: Evidence[];
  constraints: ContextConstraint[];
  conflicts: ContextConflict[];
  revision?: {
    previousAnswer: string;
    invalidEvidenceIds: string[];
    uncitedClaims: string[];
  };
}

export interface AnswerProviderResult {
  text: string;
  finishReason: string;
  modelId?: string;
  usage?: {
    inputTokens?: number;
    outputTokens?: number;
    totalTokens?: number;
  };
}

export interface AnswerProvider {
  readonly modelId: string;
  generate(input: AnswerGenerationInput): Promise<AnswerProviderResult>;
}

export interface CitationValidation {
  valid: boolean;
  citedEvidenceIds: string[];
  invalidEvidenceIds: string[];
  uncitedClaims: string[];
}

export interface GroundedAnswer {
  schemaVersion: typeof ANSWER_CONTRACT_VERSION;
  traceId: string;
  question: string;
  actorId: string;
  projectId?: string;
  answer: string;
  modelInputEvidenceIds: string[];
  evidence: Evidence[];
  constraints: ContextConstraint[];
  conflicts: ContextConflict[];
  citationValidation: CitationValidation;
  model: string;
  configuredModel: string;
  finishReason: string;
  generationAttempts: number;
  usage?: AnswerProviderResult["usage"];
  timingMs: {
    retrieval: number;
    generation: number;
    validation: number;
    total: number;
  };
  createdAt: string;
}

export interface IngestResult {
  connectorId: string;
  sourceFamily: SourceFamily;
  sourceId: string;
  status: "indexed" | "replaced" | "unchanged";
  accepted: number;
  rejected: number;
  recordIds: string[];
}

export interface SourceRegistration {
  id: string;
  connectorId: string;
  sourceFamily: SourceFamily;
  path: string;
  createdAt: string;
  updatedAt: string;
  lastSyncAt?: string;
  lastSyncStatus: "never" | "completed" | "failed" | "interrupted";
  lastError?: string;
}

export interface SyncTiming {
  acquisitionAndProcessing: number;
  embedding: number;
  indexWrite: number;
  cleanup: number;
  total: number;
}

export interface SyncRun {
  schemaVersion: "primer.sync.v1";
  id: string;
  registrationId: string;
  connectorId: string;
  sourceFamily: SourceFamily;
  status: "running" | "completed" | "failed" | "interrupted";
  applicationVersion: string;
  storageSchemaVersion: number;
  processorVersion: string;
  policyVersion: string;
  embeddingModel: string;
  ownerProcessId?: number;
  results: IngestResult[];
  removedSourceIds: string[];
  error?: string;
  timingMs: SyncTiming;
  startedAt: string;
  completedAt?: string;
}

export interface SourceRemovalResult {
  schemaVersion: "primer.source-removal.v1";
  sourceId: string;
  removedRecords: number;
  removed: boolean;
}

export interface RegistrationRemovalResult {
  schemaVersion: "primer.registration-removal.v1";
  registrationId: string;
  removedSourceIds: string[];
  removedRecords: number;
}

export interface ValidationIssue {
  severity: "error" | "warning";
  path: string;
  message: string;
}

export interface ValidationReport {
  fixtureId?: string;
  valid: boolean;
  counts: Record<string, number>;
  issues: ValidationIssue[];
}
