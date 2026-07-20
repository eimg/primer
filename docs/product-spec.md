# Primer MVP product specification

**Status:** Draft product contract. No implementation exists.

## Objective

Build a focused first release that turns heterogeneous source material into permission-checked evidence and cited answers, while letting users inspect how consequential decisions were made.

The MVP succeeds when people can obtain useful answers, verify their evidence, and test the pipeline's trust boundaries. A polished chat surface alone is not the success criterion.

## Initial operating scenario

Primer initially uses a small, coherent organization dataset with knowledge about at least two projects. The same concepts should appear across contrasting sources and include intentional conflicts, superseded statements, inaccessible records, exact identifiers, and unanswered questions.

The initial ingestible source set is:

1. Markdown documents, split by heading hierarchy.
2. Slack-like exported JSON, normalized at thread level.
3. Two local Git repositories, one per project, split by meaningful code structure through the same Git source-family contract.

The MVP uses packaged or locally selected sources. Live OAuth connectors are deferred until the core source, retrieval, and authorization contracts are proven.

The initial fixture may also contain prepared fictional email threads so the organizational history is coherent. Email ingestion is deferred and is not part of the first retrieval slice.

The first retrieval slice operates on a frozen, versioned initial backfill. Connector triggers, polling, interval updates, and reconciliation are deferred until retrieval behavior is credible.

## Core user journeys

### 1. Inspect a source transformation

The user selects a source object and sees:

- original content and provenance;
- normalized representation;
- generated knowledge records or chunks;
- attached metadata and access rules;
- index or rejection decision with a reason.

### 2. Inspect retrieval

The user asks a question under a selected identity and optional project scope, then sees:

- lexical candidates and match reasons;
- semantic candidates and similarity information;
- authorization and metadata filters;
- rank fusion and policy adjustments;
- the exact final evidence set.

### 3. Inspect a grounded answer

The user sees:

- an answer generated only from the displayed evidence;
- citations that open the supporting record and original source;
- conflicts and material uncertainty;
- an explicit insufficient-evidence response when required.

### 4. Inspect synchronization

The operator changes an approved local source, runs synchronization, and sees:

- stable source identity and checksum comparison;
- records added, replaced, or removed;
- embeddings or search representations regenerated;
- the changed retrieval and answer behavior.

### 5. Compare access boundaries

The same question is asked under two identities, and the resulting authorized evidence and answers differ without exposing restricted content.

## Functional requirements

### Source processing

- A connector emits a common source-object envelope with stable identity, provenance, timestamps, metadata, and access rules.
- Processing is selected by source type.
- Normalization output is distinguishable from authoritative source content.
- Chunk identity is stable enough for idempotent re-synchronization.
- Selective indexing records both accepted and rejected decisions.
- Code blocks, tables, heading paths, conversation resolution state, and exact identifiers are preserved when relevant.

### Index and retrieval

- Searchable records keep content, provenance, metadata, authority, freshness, resolution state, and ACL information together.
- Lexical and semantic retrieval execute as distinct, visible stages.
- Authorization and hard scope constraints apply before evidence construction.
- Rank fusion does not compare incompatible raw scores directly.
- Post-fusion adjustments are named, bounded, and inspectable.
- The final evidence set is small, ordered, and traceable to original sources.

### Answering

- The answer model receives only the question, authorized evidence records, and answer rules.
- Every citation refers to a supplied evidence identifier.
- The system validates citation existence and reports unsupported or uncited material claims.
- Conflicting evidence remains visible.
- The system can abstain and state what evidence is missing.

### Explainability

- Each visible stage includes the inputs, outputs, and reason for consequential decisions.
- The interface distinguishes original content, derived normalization, retrieval scores, policy adjustments, and generated answer text.
- A user can account for the major ranking steps from displayed information.

## MVP screens

The conceptual screens are:

1. **Sources** — originals, transformations, records, and rejection decisions.
2. **Retrieval** — candidates, filters, fusion, adjustments, and final evidence.
3. **Answer** — cited claims, evidence, conflicts, and uncertainty.
4. **Synchronization** — source versions, checksums, record changes, and re-index action.

Navigation and visual layout remain open. These are capability groupings, not a commitment to four routes.

## Non-goals

- Live Slack, Teams, GitHub, Drive, or OAuth integration in the first release.
- External identity federation or full source-permission reconciliation in the first release.
- A distributed worker, queue, or search-cluster architecture.
- Continuous web crawling or autonomous knowledge creation.
- A general-purpose agent that can mutate source systems.
- Training or fine-tuning a foundation model.
- A no-code connector marketplace.
- MCP as a required internal boundary.
- Proving that generated summaries are authoritative.

## Acceptance criteria

The MVP is complete only when all of the following are verified with fixed evaluation cases:

- all three source types produce inspectable, source-aware records;
- at least one low-value item is visibly rejected for a documented reason;
- lexical and semantic retrieval each recover evidence the other misses;
- an unauthorized record never appears in candidates exposed after the authorization boundary or in model input;
- authority, freshness, or supersession visibly changes at least one final rank;
- every displayed citation resolves to supplied evidence and then to an original source;
- at least one conflict is surfaced rather than silently resolved;
- at least one question causes correct abstention;
- one source edit causes a traceable incremental index change and a predictable retrieval change;
- the evaluation suite reports retrieval, citation, permission, abstention, and stage-latency results.

## Product questions still open

The initial domain, exact user flow, answer-model behavior, and stack are intentionally unresolved. They are tracked in [`decisions.md`](./decisions.md) and must be settled before scaffolding.
