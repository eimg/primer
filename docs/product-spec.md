# Primer MVP product specification

**Status:** Active product contract. Phase 1 retrieval, Phase 2 contrasting sources, policy, authorization, and context packs, and Phase 3 grounded CLI answers with persisted evaluation are implemented and live-verified. Complete source lifecycle work and web capabilities remain planned.

## Objective

Build a focused first release that turns heterogeneous source material into permission-checked evidence and cited answers, while letting users inspect how consequential decisions were made.

The MVP succeeds when people can obtain useful answers, verify their evidence, and test the pipeline's trust boundaries first through the CLI and then through an integrated web application. A polished chat surface alone is not the success criterion.

## Delivery model

Primer has two ordered product milestones over one application core.

### CLI milestone

The first milestone proves the complete pipeline without a web server or browser dependency. It provides task-oriented commands for configuration, identities, sources, retrieval, answering, traces, synchronization, and evaluation. Commands that expose reusable results provide stable JSON output in addition to readable terminal output.

### Web milestone

After the CLI exit gate passes, a local HTTP API and web application adapt the same application services. The web milestone adds integrated chat, account management, content management, retrieval inspection, synchronization, and evaluation surfaces. It must not introduce a parallel ingestion or retrieval implementation.

## Initial operating scenario

Primer initially uses a small, coherent organization dataset with knowledge about at least two projects. The same concepts should appear across contrasting sources and include intentional conflicts, superseded statements, inaccessible records, exact identifiers, and unanswered questions.

The initial ingestible source set is:

1. Markdown documents, split by heading hierarchy.
2. Slack-like exported JSON, normalized at thread level.

Two local Git repositories remain fixture targets for later harness simulation and Helix integration evaluation. Primer does not index their source-code bodies. In real workflows, Primer supplies authorized organizational context and Helix/Pi verifies the current checkout.

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

### 6. Operate through the CLI

The operator can:

- initialize and inspect local configuration;
- list and inspect fixture identities and their effective access;
- register, ingest, inspect, synchronize, and remove supported content sources;
- retrieve evidence or ask a cited question under a selected identity and project scope;
- inspect a saved trace; and
- run the fixed evaluation suite with human-readable or JSON output.
- emit a bounded, versioned initial-context pack for a future orchestrator consumer, with code paths and symbols explicitly labeled as unverified leads.

### 7. Manage local accounts and content in the web application

The web operator can manage local accounts, group/project membership, active sessions, registered content sources, and indexing actions. Account management proves the local authorization model; it does not claim external identity federation. Content management changes Primer's derived representation and source registration, not the authoritative source content.

## Functional requirements

### Source processing

- A connector emits a common acquisition envelope containing connector identity, source family, native reference, raw content, and connector metadata.
- A registered source-family processor converts acquisition items into canonical source objects with stable identity, provenance, timestamps, metadata, access rules, records, and visible decisions.
- Connectors do not embed, rank, or write retrieval storage directly.
- Processing is selected by source type.
- Normalization output is distinguishable from authoritative source content.
- Chunk identity is stable enough for idempotent re-synchronization.
- Selective indexing records both accepted and rejected decisions.
- Code blocks, tables, heading paths, conversation resolution state, and exact identifiers are preserved when relevant.
- The MVP is index-first. A future connector may additionally expose source-native discovery, but discovered material must become authorized, normalized, attributable evidence before it can support an answer.

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
- One bounded repair request may correct invalid citation formatting or uncited factual paragraphs; repeated failure remains visible.
- Conflicting evidence remains visible.
- The system can abstain and state what evidence is missing.

### Explainability

- Each visible stage includes the inputs, outputs, and reason for consequential decisions.
- The interface distinguishes original content, derived normalization, retrieval scores, policy adjustments, and generated answer text.
- A user can account for the major ranking steps from displayed information.

### Model provider

- OpenRouter is used for embeddings through its official TypeScript SDK; grounded chat uses Vercel AI SDK with OpenRouter, with streaming deferred until a CLI or web journey justifies it.
- Pi is reserved for a later server-side, read-only UI simulation of the orchestrator code-exploration handoff. Real repository exploration remains owned by Helix/Pi.
- Chat and embedding models are configured independently.
- Provider credentials remain outside source control and browser code.
- Record embeddings retain model and configuration identity; incompatible vector spaces are not mixed.
- Model calls record safe usage, timing, returned model identity, and relevant configuration in the trace.
- Automated tests can replace both model boundaries with deterministic fakes.

### CLI contracts

- Command handlers call application services rather than own domain behavior.
- Reusable command results support stable `--json` output with explicit schema versions where appropriate.
- Failures have non-zero exit status and distinguish configuration, source-processing, authorization, provider, and evaluation errors.
- The CLI can complete the full MVP pipeline before the web phase begins.

## Web application surfaces

The later web milestone includes:

1. **Chat** — conversation, cited answer, conflicts, uncertainty, and expandable evidence trace.
2. **Accounts** — local profiles, active identity, group/project membership, and effective access.
3. **Content** — registered sources, originals, transformations, records, rejection decisions, synchronization, and removal.
4. **Retrieval and traces** — candidates, authorization boundary, filters, fusion, adjustments, final evidence, model input, and timing.
5. **Evaluation** — fixed cases, stage metrics, failures, and configuration comparison.

Navigation and visual layout remain implementation details. These are capability groupings, not a commitment to five isolated routes.

## Future ecosystem boundaries

### Acme Issues as a source

After the CLI and web milestones, a dedicated read-only adapter may ingest issue descriptions, comments, labels, status history, and Helix run lineage from Acme Issues. Acme Issues remains authoritative. Primer does not edit issues, comments, status, or webhook state.

### Helix as a consumer

Helix may later request a bounded initial-context pack using an actor, question, project/scope, and result limit. The response retains evidence identifiers, excerpts, provenance, freshness, retrieval reasons, constraints, conflicts, and explicitly unverified code leads. Helix owns workflow orchestration and current-repository exploration through Pi; Primer owns organizational evidence construction. Direct database access is not an integration contract.

## Non-goals

- Live Slack, Teams, GitHub, Drive, or OAuth integration in the first release.
- Source-native or federated exploration for organizational sources in the initial CLI and web milestones.
- Indexing repository source-code bodies as a Primer knowledge source.
- External identity federation or full source-permission reconciliation in the first release.
- A distributed worker, queue, or search-cluster architecture.
- Continuous web crawling or autonomous knowledge creation.
- A general-purpose agent that can mutate source systems.
- Training or fine-tuning a foundation model.
- A no-code connector marketplace.
- MCP as a required internal boundary.
- Acme Issues ingestion during the initial CLI or web milestones.
- Helix runtime integration during the initial CLI or web milestones.
- Replacing Helix orchestration with a Primer agent.
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
- the evaluation suite reports retrieval, citation, permission, abstention, and stage-latency results;
- the complete pipeline is operable through the CLI before the web milestone begins;
- reusable CLI results have stable JSON output consumed by contract tests;
- the web application reuses the same application services and passes integrated chat, account, content, trace, and evaluation journeys.

## Implementation flexibility

The product direction, initial stack, provider boundary, source processors, access model, and phase order are settled in [`decisions.md`](./decisions.md). Exact command spelling, HTTP framework, React build tooling, visual layout, and concrete OpenRouter model IDs may be selected during their relevant phase as long as they preserve this contract.
