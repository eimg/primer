# Primer conceptual architecture

**Status:** Phase 7 and the scoped Level 2 query-planning enhancement are complete; development is paused for manual live testing. The CLI and built-in Node HTTP adapters share the application services, SQLite index, connector/processor registry, registered-source lifecycle, retrieval, answer, trace, evaluation, diagnostics, backup, and readiness modules. `primer.connector.v1` supports local and HTTP acquisition through the same synchronization workflow. The React/Vite application consumes the HTTP API for account/content operations, grounded chat, evidence navigation, retrieval inspection, and evaluation reporting. Live connectors, an optional Pi simulation, and ecosystem integrations remain later. Components are logical ownership boundaries, not separate services.

## Delivery shape

Primer begins as one TypeScript application on Node.js. Its domain and application services are independent of delivery adapters:

```text
Phase A
CLI commands
  -> application services
  -> source / retrieval / answer modules
  -> SQLite derived index

Phase B
CLI commands ─┐
HTTP API      ├-> the same application services and modules
React UI      ┘
```

The CLI is the first product surface. The HTTP API and web UI are later adapters, not a rewrite. Stable CLI JSON and later HTTP responses should reuse versioned result contracts where their semantics match.

The current implementation follows this map:

```text
src/cli.ts
  -> src/services.ts
     -> src/connectors/*
     -> src/fixture.ts / src/markdown.ts / src/slack.ts
     -> src/database.ts
     -> src/embeddings.ts
     -> src/ranking.ts / src/context.ts / src/answers.ts
  -> SQLite database under PRIMER_DATA_DIR

src/server.ts -> src/http.ts -> the same src/services.ts
React/Vite web application -> /api only -> src/http.ts
```

Markdown and Slack export source processing are implemented as local reference providers. Four vendor-neutral HTTP providers accept canonical `document`, `conversation`, `business-record`, and `event` artifacts from future independently deployed connectors. Source-code bodies are deliberately outside the Primer index. Grounded answers, initial-context packs, complete synchronization/removal, the HTTP API, and React account/content/chat/inspection/evaluation operations are implemented; the optional Pi simulation and live integrations remain phase-gated.

## Architectural shape

Primer is a pipeline with two paths over a derived index: synchronization and inquiry.

```text
SYNCHRONIZATION
connector providers (`primer.connector.v1`)
  -> source-aware processors
  -> index policy
  -> record writer
  -> derived knowledge index

INQUIRY
question + actor + scope
  -> authorization context
  -> bounded query plan (grounded answers only)
  -> lexical and semantic retrieval for each query over one authorized population
  -> fusion and policy adjustment
  -> evidence builder
  -> answer generator
  -> citation validator
```

An inspection trace observes both paths. The trace is a first-class product output.

Direct `retrieve` and `context` calls remain the stable single-query baseline. `ask` adds one structured planning call with at most four query strings. Primer validates, trims, deduplicates, and bounds the plan; failure falls back to the original question. The planner cannot emit an actor, project, ACL, source filter, or evidence selection. Application services resolve the authorized record population once, execute every query against that same population, aggregate reciprocal-rank contributions, and persist `primer.retrieval.v4` with the plan, per-query candidates, fused ranking, and final evidence.

### Future hybrid discovery path

The current implementation is intentionally index-first: connectors acquire source material, processors normalize it, and inquiry runs over Primer's derived index. This remains the active architecture and implementation scope.

The architecture nevertheless distinguishes three concerns so a future source adapter can use capable native search without redesigning the evidence boundary:

1. **Discovery** finds candidate material through a source-native query, progressive inspection, or the derived Primer index.
2. **Evidence normalization** converts selected material into the canonical, permission-checked, attributable evidence shape.
3. **Durable indexing** persists normalized records for repeatability, cross-source retrieval, latency, and evaluation.

A later connector may support `explore`, `ingest`, or both. Exploration results cannot flow directly to an answer model: anything used as evidence must still pass authorization, normalization, provenance capture, evidence construction, and tracing. Native discovery is an extension point, not part of the current CLI phases, and `primer.connector.v1` intentionally covers synchronization rather than exploration.

### External connector boundary

Primer does not contain email, CRM, HRM, Teams, or other vendor SDKs. A later independently deployed connector owns its vendor API, credentials, pagination, webhook or polling behavior, rate limits, and native ACL translation. It exposes `primer.connector.v1` over HTTP and emits one of four semantic artifact kinds. Primer owns schema validation, source processing, authorization enforcement, indexing, embeddings, retrieval, evidence, and answers.

Registrations persist an opaque typed locator, non-secret connector configuration, the last committed checkpoint, and synchronization history. Page cursors are transient within one acquisition; the checkpoint advances only after acquisition, processing, indexing, and deletion handling complete. Snapshot mode removes previously managed sources not observed in the completed snapshot. Incremental mode removes only explicit tombstones, mapped through the connector's stable external identity. Duplicate external identities, repeated page cursors, family or kind mismatches, and unsupported contract versions fail before the checkpoint advances.

The local Markdown and Slack providers exercise the same provider interface in process. A simulated HTTP provider in the conformance tests proves that remote transport, pagination, updates, ACL-only changes, interruption, checkpoint retention, and tombstones do not require vendor-specific code inside Primer.

## Ownership boundaries

### Connector provider

Acquires native source items and preserves connector identity, stable external identity and revision, semantic artifact kind, native URL or local reference, raw content, canonical ACL and ownership fields where available, and connector-specific metadata. It may run in process or behind HTTP. It does not embed content, decide answer relevance, write retrieval storage, or generate answer evidence.

### Source processor

Understands the structure of one source family, maps native identity, timestamps, authorship, project and access metadata into a canonical source object, and produces retrieval-friendly records plus visible index decisions. It may use a model for normalization, but model output remains derived data and must be schema-validated.

### Index policy

Accepts, rejects, or down-ranks content using explicit rules. Each decision records its reason and policy version.

### Record writer

Applies idempotent changes. It owns stable record identity, checksums, replacement, deletion, and the regeneration of affected search representations. For managed synchronization, all prepared source writes, removals, checkpoint advancement, and the completed-run record share one SQLite transaction. Acquisition and embedding finish before that transaction begins; failure rolls back the entire commit while preserving a visible failed run.

### Knowledge index

Stores derived content, lexical fields, vectors, metadata, provenance, ACL attributes, and source-version information. It is rebuildable from authoritative sources and configuration.

### Authorization resolver

Converts the active identity and source ACL attributes into hard retrieval filters. It owns the rule that protected content cannot cross into model context or user-visible post-boundary traces.

### Retriever

Runs lexical and semantic searches independently and reports comparable ranks, not falsely normalized truth scores.

### Ranker

Fuses candidate ranks, then applies explicit and bounded domain adjustments such as scope, authority, freshness, and resolution state. It retains a reason ledger for each rank change.

### Evidence builder

Selects a bounded set of authorized excerpts and assigns stable evidence identifiers. This output is the complete factual context available to the answer model.

### Answer generator

Produces claims, citations, conflict notes, and uncertainty from the evidence set. It has no direct database, connector, filesystem, or network access during answer generation.

### Citation validator

Checks that referenced evidence exists and that material claims have nearby support. Semantic claim-support scoring may assist later, but deterministic existence and coverage checks come first.

If generated output fails deterministic citation validation, the application service may request one revision using the same authorized evidence plus the failed answer and validator diagnostics. There is no unbounded retry loop. Both calls contribute to recorded usage and timing; a second failure remains visible rather than being silently accepted.

### Trace recorder

Captures stage inputs, outputs, timing, configuration versions, and decision reasons while respecting the same visibility boundary as the user.

### Application service layer

Coordinates explicit use cases such as registering a source, synchronizing content, retrieving evidence, asking a question, inspecting a trace, and running evaluation. CLI and HTTP handlers depend on this layer. It owns transaction/use-case sequencing but not source parsing, ranking policy, or provider-specific request types.

### Delivery adapters

- The CLI maps arguments, environment, exit status, human output, and stable JSON to application services.
- The built-in Node HTTP API maps local session-authenticated requests to the same services, serves the production web build, and is independently runnable and integration-tested.
- The React UI consumes that API for account/content operations, grounded chat, traces, synchronization detail, and evaluation presentation; it never accesses SQLite directly.

The chat route derives actor identity exclusively from the HttpOnly session. It uses newline-delimited JSON to send immediate workflow status, then answer deltas only after the existing bounded citation-validation/repair workflow has produced its final result, followed by the complete versioned answer object. This preserves the invariant that the stable displayed answer and displayed evidence are the validated application-service output; it intentionally does not expose provisional provider tokens that may later fail citation validation.

Saved trace lists and detail reads are filtered to the active actor. Evaluation reports remain an explicit local-operator capability and may run model calls when an answer suite is requested.

The local web session is an explicit MVP boundary: choosing a fixture identity creates a random session identifier stored in SQLite and delivered only through an `HttpOnly`, `SameSite=Lax` cookie. It proves identity-dependent product behavior without claiming password authentication, external federation, or production deployment hardening. Safe account discovery and health/configuration are public local endpoints; operational routes require an active session. Provider credentials never enter HTTP responses or the web bundle.

No domain rule should exist only in a command handler, route, or browser component.

## Canonical contracts

Names and fields may change during implementation, but the semantic distinctions should remain.

```ts
type ConnectorItem = {
  schemaVersion: "primer.connector.v1";
  connectorId: string;
  sourceFamily: string;
  artifactKind: "document" | "conversation" | "business-record" | "event";
  externalId: string;
  revision: string;
  sourceRef: string;
  rawContent: string;
  canonical?: {
    title: string;
    createdAt: string;
    updatedAt: string;
    authors: string[];
    projectId?: string;
    access: AccessDescriptor;
    authority: number;
    resolutionState?: "proposed" | "resolved" | "superseded";
  };
  metadata: Record<string, unknown>;
};

type SourceObject = {
  source: string;
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
};

type KnowledgeRecord = {
  id: string;
  source: SourceObject["source"];
  sourceId: string;
  sourceRef: string;
  sourceVersion: string;
  parentId?: string;
  title?: string;
  content: string;
  contentChecksum: string;
  projectId?: string;
  updatedAt: string;
  authority: number;
  resolutionState?: "proposed" | "resolved" | "superseded";
  metadata: Record<string, unknown>;
  access: AccessDescriptor;
};

type Evidence = {
  evidenceId: string;
  recordId: string;
  title: string;
  excerpt: string;
  source: string;
  sourceRef: string;
  updatedAt: string;
  authority: number;
  resolutionState?: "proposed" | "resolved" | "superseded";
  retrievalReasons: string[];
  policyReasons: Array<{
    kind: "authority" | "freshness" | "resolution";
    adjustment: number;
    reason: string;
  }>;
  permissionChecked: true;
};

type OrchestratorContextPack = {
  schemaVersion: "primer.context.v1";
  traceId: string;
  actorId: string;
  question: string;
  projectId?: string;
  evidence: Evidence[];
  constraints: Array<{ text: string; evidenceIds: string[] }>;
  conflicts: Array<{ text: string; evidenceIds: string[] }>;
  codeLeads: Array<{
    ref: string;
    reason: string;
    evidenceIds: string[];
    verifiedAgainstRepository: false;
  }>;
  createdAt: string;
};
```

`AccessDescriptor` uses the fixture's `public`, `group`, and `restricted` visibility plus allowed group and user identifiers. It must support filtering without copying protected content into an unsafe trace. CLI commands receive an explicit user identity. The web phase adds local accounts and sessions over the same resolver; it does not add external federation.

`OrchestratorContextPack` is implemented as `primer.context.v1`. It contains only authorized Primer evidence and attributable derived guidance. `codeLeads` may repeat paths or symbols mentioned by evidence, but they are explicitly unverified until the receiving harness checks a pinned repository revision. The pack never contains hidden pre-authorization candidates or Pi-discovered code from a prior run.

## Initial physical storage

SQLite is the first derived index and operational store. It keeps:

- source objects and versions;
- knowledge records and provenance;
- ACL attributes and local identity/group data;
- full-text search fields;
- embedding vectors with model/configuration identity;
- indexing decisions and synchronization state;
- inquiry traces, evidence, and persisted retrieval and answer-evaluation runs; and
- later local web accounts and sessions.

Lexical retrieval uses SQLite full-text search. Semantic retrieval initially loads the permitted candidate population through a vector repository and performs exhaustive cosine comparison, which is credible for the small frozen corpus and intentionally not presented as a scale architecture. Storage and vector interfaces preserve a later PostgreSQL/pgvector option.

## Data and trust boundaries

### Authoritative versus derived

- Authoritative: imported source bytes and their native identity/version.
- Derived: normalizations, chunks, embeddings, lexical fields, ranks, traces, and answers.
- Configured judgment: authority rules, access mappings, indexing rules, retrieval policies, and evaluation expectations.

Derived state can be discarded and rebuilt. Rebuilding the same version with the same configuration should produce functionally equivalent records, apart from explicitly documented model nondeterminism.

### Authorization boundary

The inquiry path is logically ordered as:

```text
actor and scope
  -> permitted record population
  -> retrieval and ranking
  -> evidence
  -> model
```

An implementation may optimize query execution, but it must preserve this information-flow rule. Internal pre-filter diagnostics containing restricted content cannot be exposed to the user or model.

### Model boundaries

Models may assist normalization, embedding, and answer generation. Each use has a narrow contract:

- normalization receives one source object within the configured ingestion scope and returns validated derived structure;
- embedding receives only content approved for the index;
- query planning receives the question and fixed project label and returns search text only;
- answering receives only the final authorized evidence set;
- no model is the authority for ACL decisions, source identity, or citation existence.

OpenRouter is the initial chat and embedding provider. SDK choices remain inside model adapters:

- the official OpenRouter TypeScript SDK batches approved record content and embeds queries with a compatible model/configuration;
- Vercel AI SDK implements controlled answer generation and can support later terminal/web streaming;
- Pi may later host a server-side, read-only code-exploration simulation that mirrors the Helix handoff.

Chat and embedding model IDs are configured independently. Provider credentials never enter the database, trace, browser bundle, or generated evidence. Provider SDK types remain inside adapters. Deterministic test adapters replace network calls in the normal test suite; live evaluation is explicit.

The evidence pipeline, including Level 2 query planning, is a structured workflow, not an agent loop or model-controlled tool call. A later Pi simulation begins only after Primer has built authorized initial context. It cannot bypass authorization, evidence construction, or citation validation, and its discovered code context remains separate from indexed Primer evidence.

## Consistency and synchronization

- Source and record identities must be stable.
- A persisted registration identifies the connector and acquisition scope responsible for a managed set of sources.
- One stable source identity cannot be silently claimed by two registrations; ownership collisions fail visibly.
- A source version or content checksum makes changes observable.
- Synchronization is idempotent for an unchanged source version.
- Removed or rejected content must be deleted from all retrieval representations.
- An available but empty registered scope confirms removals; an unavailable scope fails synchronization rather than guessing that all sources were deleted.
- Partial failure must be visible and must not present a mixed index as fully synchronized.
- Synchronization runs remain inspectable after a registration is removed; abandoned running work is recovered as interrupted.
- Policy and processor versions belong in the trace so changed behavior can be explained.

## Runtime shape

The MVP uses one TypeScript application and one SQLite database unless a measured requirement proves a service boundary necessary. Logical components are modules/interfaces first.

An internal function or ordinary API is the default retrieval boundary. MCP becomes useful only if multiple independent AI clients need the same tool, or if deployment, credentials, policy, or runtime ownership genuinely require a service boundary.

## Future external boundaries

Future relationships are planned without coupling current implementation.

### Acme Issues source adapter

Acme Issues remains the system of record for issues, comments, labels, state, webhook deliveries, and Helix run lineage. A future Primer adapter reads its supported API or another explicit read-only export and emits stable source objects. It requires source-aware issue/timeline processing, access mapping, incremental version identity, and deletion behavior. Direct writes to Acme Issues are out of scope.

### Helix evidence consumer

Helix may later query Primer before planning or specialist work:

```text
Helix request: actor + question + project/scope + limit
  -> Primer authorization and retrieval
  -> bounded evidence pack with provenance and reasons
  -> Helix-owned reasoning and workflow
```

Primer's response supplies organizational context: decisions, policies, incidents, conversations, constraints, conflicts, and possible code leads. Helix's Pi harness owns current-repository exploration, file/symbol verification, tests, and implementation context. Primer does not duplicate that exploration or present remembered paths as current code truth.

The first integration-compatible boundary is a versioned JSON initial-context pack from the CLI. The web phase adds an equivalent HTTP contract. Helix must not read the Primer database, and Primer must not absorb Helix's orchestration or Pi sessions. A shared MCP tool is deferred until independent consumers or a deployment, credential, ownership, isolation, or policy boundary justifies it.

## Technology decisions settled

- TypeScript on Node.js in one locally runnable application;
- CLI before HTTP API and React UI;
- SQLite full-text search plus an abstract exhaustive vector baseline;
- OpenRouter for embeddings through its official TypeScript SDK, and for grounded chat through Vercel AI SDK, with streaming deferred;
- deterministic Markdown and Slack processing, with source-code exploration delegated to the orchestrator harness;
- Pi reserved for a later server-side, read-only simulation of that harness boundary;
- fixture identities/groups for CLI authorization and local accounts/sessions in the web phase;
- safe versioned traces shared by CLI and web adapters.

Exact HTTP framework, React build tooling, CLI command parser, migration library, and concrete OpenRouter model IDs may be selected during implementation without changing these boundaries. See [`decisions.md`](./decisions.md).
