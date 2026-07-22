export interface User {
  id: string;
  name: string;
  title: string;
  email: string;
  groupIds: string[];
}

export interface Group { id: string; name: string }
export interface Project { id: string; code: string; name: string; description: string; defaultGroupId: string }
export interface Connector {
  contractVersion: string;
  connectorId: string;
  sourceFamily: string;
  transport: "local" | "http";
  artifactKinds: string[];
  capabilities: { pagination: boolean; incrementalSync: boolean; tombstones: boolean; health: boolean };
  processorVersion?: string;
}
export interface Registration {
  id: string;
  connectorId: string;
  sourceFamily: string;
  path: string;
  locator?: { type: "local-path" | "http"; value: string };
  config?: Record<string, unknown>;
  checkpointCursor?: string;
  lastSyncStatus: "never" | "completed" | "failed" | "interrupted";
  lastSyncAt?: string;
  lastError?: string;
}
export interface SourceSummary {
  source_id: string;
  registration_id: string | null;
  source_family: string;
  source_ref: string;
  project_id: string | null;
  accepted: number;
  rejected: number;
  indexed_at: string;
}
export interface SyncRun {
  id: string;
  registrationId: string;
  status: "running" | "completed" | "failed" | "interrupted";
  results: Array<{ status: "indexed" | "replaced" | "unchanged" }>;
  removedSourceIds: string[];
  timingMs: { total: number };
  startedAt: string;
  error?: string;
}
export interface Evidence {
  evidenceId: string;
  recordId: string;
  title: string;
  excerpt: string;
  source: string;
  sourceRef: string;
  updatedAt: string;
  authority: number;
  resolutionState?: string;
  retrievalReasons: string[];
  policyReasons: Array<{ kind: string; adjustment: number; reason: string }>;
}
export interface Candidate {
  recordId: string;
  rank: number;
  score: number;
  reason?: string;
  retrievalReasons?: string[];
  policyReasons?: Array<{ kind: string; adjustment: number; reason: string }>;
}
export interface GroundedAnswer {
  traceId: string;
  question: string;
  actorId: string;
  projectId?: string;
  answer: string;
  modelInputEvidenceIds: string[];
  evidence: Evidence[];
  constraints: Array<{ text: string; evidenceIds: string[] }>;
  conflicts: Array<{ text: string; evidenceIds: string[] }>;
  citationValidation: { valid: boolean; citedEvidenceIds: string[]; invalidEvidenceIds: string[]; uncitedClaims: string[] };
  model: string;
  configuredModel: string;
  generationAttempts: number;
  timingMs: { retrieval: number; generation: number; validation: number; total: number };
  createdAt: string;
}
export interface TraceSummary { id: string; userId: string; question: string; projectId?: string; embeddingModel: string; createdAt: string }
export interface RetrievalTrace {
  traceId: string;
  question: string;
  userId: string;
  projectId?: string;
  embeddingModel: string;
  queryPlan?: {
    schemaVersion: string;
    strategy: "single" | "planned";
    queries: string[];
    model: string;
    fallback: boolean;
    fallbackReason?: string;
    timingMs: number;
  };
  queryRuns?: Array<{
    queryIndex: number;
    query: string;
    lexical: Candidate[];
    semantic: Candidate[];
    timingMs: { lexical: number; semantic: number; total: number };
  }>;
  lexical: Candidate[];
  semantic: Candidate[];
  fused: Candidate[];
  evidence: Evidence[];
  timingMs: { planning?: number; authorization: number; lexical: number; semantic: number; fusion: number; evidence: number; total: number };
  createdAt: string;
}
export interface EvaluationSummary { id: string; schemaVersion: string; fixtureId: string; embeddingModel: string; createdAt: string }
export interface EvaluationRun {
  schemaVersion: string;
  runId: string;
  fixtureId: string;
  embeddingModel: string;
  answerModel?: string;
  providerMode?: string;
  aggregate: Record<string, number>;
  cases: Array<Record<string, unknown>>;
  createdAt: string;
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const response = await fetch(path, {
    credentials: "same-origin",
    ...options,
    headers: { ...(options.body ? { "content-type": "application/json" } : {}), ...options.headers },
  });
  const body = await response.json() as T & { error?: { message: string } };
  if (!response.ok) throw new Error(body.error?.message ?? `Request failed with ${response.status}`);
  return body;
}

export const api = {
  health: () => request<{ status: string; applicationVersion: string; storageSchemaVersion: number }>("/api/health"),
  accounts: () => request<{ users: User[]; groups: Group[]; projects: Project[] }>("/api/accounts"),
  session: () => request<{ user: User }>("/api/session"),
  signIn: (userId: string) => request<{ user: User }>("/api/session", { method: "POST", body: JSON.stringify({ userId }) }),
  signOut: () => request<{ signedOut: boolean }>("/api/session", { method: "DELETE" }),
  updateGroups: (userId: string, groupIds: string[]) => request<{ user: User }>(`/api/accounts/${encodeURIComponent(userId)}/groups`, {
    method: "PUT",
    body: JSON.stringify({ groupIds }),
  }),
  connectors: () => request<{ connectors: Connector[] }>("/api/sources/connectors"),
  registrations: () => request<{ registrations: Registration[] }>("/api/sources/registrations"),
  register: (connectorId: string, path: string) => request<{ registration: Registration }>("/api/sources/registrations", {
    method: "POST",
    body: JSON.stringify({ connectorId, path }),
  }),
  synchronize: (id: string) => request<{ runs: SyncRun[] }>(`/api/sources/registrations/${encodeURIComponent(id)}/sync`, { method: "POST" }),
  unregister: (id: string) => request(`/api/sources/registrations/${encodeURIComponent(id)}`, { method: "DELETE" }),
  sources: () => request<{ sources: SourceSummary[] }>("/api/sources"),
  syncs: () => request<{ runs: SyncRun[] }>("/api/syncs"),
  traces: () => request<{ traces: TraceSummary[] }>("/api/traces"),
  trace: (id: string) => request<{ trace: RetrievalTrace }>(`/api/traces/${encodeURIComponent(id)}`),
  evaluations: () => request<{ runs: EvaluationSummary[] }>("/api/evaluations"),
  evaluation: (id: string) => request<{ run: EvaluationRun }>(`/api/evaluations/${encodeURIComponent(id)}`),
  runEvaluation: (kind: "retrieval" | "answers") => request<{ run: EvaluationRun }>("/api/evaluations", {
    method: "POST",
    body: JSON.stringify({ kind }),
  }),
  streamChat: async (
    input: { question: string; projectId?: string; limit?: number },
    handlers: { onStatus(message: string, stage?: string): void; onDelta?(text: string): void },
  ): Promise<GroundedAnswer> => {
    const response = await fetch("/api/chat", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(input),
    });
    if (!response.ok || !response.body) throw new Error(`Chat request failed with ${response.status}`);
    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = "";
    let result: GroundedAnswer | undefined;
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value, { stream: !done });
      const lines = buffer.split("\n");
      buffer = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.trim()) continue;
        const event = JSON.parse(line) as {
          type: "status" | "delta" | "result" | "error";
          message?: string;
          stage?: string;
          text?: string;
          answer?: GroundedAnswer;
          error?: { message: string };
        };
        if (event.type === "status" && event.message) handlers.onStatus(event.message, event.stage);
        if (event.type === "delta" && event.text) handlers.onDelta?.(event.text);
        if (event.type === "result" && event.answer) result = event.answer;
        if (event.type === "error") throw new Error(event.error?.message ?? "Chat request failed.");
      }
      if (done) break;
    }
    if (!result) throw new Error("Chat stream ended without a grounded result.");
    return result;
  },
};
