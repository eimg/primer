# Primer conceptual architecture

**Status:** Pre-implementation architecture. Components are logical ownership boundaries, not a commitment to separate services.

## Architectural shape

Primer is a pipeline with two paths over a derived index: synchronization and inquiry.

```text
SYNCHRONIZATION
source adapters
  -> source-aware processors
  -> index policy
  -> record writer
  -> derived knowledge index

INQUIRY
question + actor + scope
  -> authorization context
  -> lexical and semantic retrieval
  -> fusion and policy adjustment
  -> evidence builder
  -> answer generator
  -> citation validator
```

An inspection trace observes both paths. The trace is a first-class product output.

## Ownership boundaries

### Source adapter

Reads source objects and preserves stable identity, native URL or local reference, timestamps, authorship, metadata, and access rules. It does not decide answer relevance.

### Source processor

Understands the structure of one source type and produces retrieval-friendly records. It may use a model for normalization, but model output remains derived data and must be schema-validated.

### Index policy

Accepts, rejects, or down-ranks content using explicit rules. Each decision records its reason and policy version.

### Record writer

Applies idempotent changes. It owns stable record identity, checksums, replacement, deletion, and the regeneration of affected search representations.

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

### Trace recorder

Captures stage inputs, outputs, timing, configuration versions, and decision reasons while respecting the same visibility boundary as the user.

## Canonical contracts

Names and fields may change during implementation, but the semantic distinctions should remain.

```ts
type SourceObject = {
  source: "slack" | "git" | "markdown";
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
  retrievalReasons: string[];
  permissionChecked: true;
};
```

`AccessDescriptor` remains abstract until the initial identity model is chosen. It must support filtering without copying protected content into an unsafe trace.

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
- answering receives only the final authorized evidence set;
- no model is the authority for ACL decisions, source identity, or citation existence.

## Consistency and synchronization

- Source and record identities must be stable.
- A source version or content checksum makes changes observable.
- Synchronization is idempotent for an unchanged source version.
- Removed or rejected content must be deleted from all retrieval representations.
- Partial failure must be visible and must not present a mixed index as fully synchronized.
- Policy and processor versions belong in the trace so changed behavior can be explained.

## Runtime shape

The MVP should default to one application and one database unless a measured requirement proves a service boundary necessary. Logical components should be expressed as modules/interfaces first.

An internal function or ordinary API is the default retrieval boundary. MCP becomes useful only if multiple independent AI clients need the same tool, or if deployment, credentials, policy, or runtime ownership genuinely require a service boundary.

## Technology decisions deliberately deferred

- application framework and UI stack;
- programming language;
- local containers versus installed services;
- PostgreSQL/pgvector versus a simpler local first slice;
- embedding and answer providers;
- code parser strategy;
- exact tracing and evaluation libraries.

These are decision-gate outputs, not architectural principles. See [`decisions.md`](./decisions.md).
