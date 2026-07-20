# Primer decisions and open questions

**Status:** Active decision log. Update this document when product or architecture choices are settled or reversed.

## Settled decisions

### D-001 — Primer is a focused, inspectable knowledge system

**Decision:** Build a credible knowledge product around trustworthy answers, inspectable evidence, and adaptable boundaries. Sequence breadth and scale after the core pipeline is proven.

**Consequence:** The UI exposes consequential intermediate stages. The first release concentrates engineering effort on a dependable core before broadening connectors and infrastructure.

### D-002 — Original systems remain authoritative

**Decision:** The central knowledge index is derived and rebuildable. Primer does not become the editing system of record.

**Consequence:** Provenance, stable source identity, synchronization, replacement, and deletion are core behavior.

### D-003 — Use three contrasting source families — Git portion superseded by D-022

**Decision:** Initially support Markdown documents, Slack-like exported conversations, and one Git source family containing two local repositories: ClientCore and TalentFlow.

**Consequence:** A common connector envelope is useful, but source processing remains specialized.

**Revision:** Markdown and Slack remain Primer source families. The Git fixtures remain code-context evaluation material, but source-code exploration is delegated to the orchestrator harness by D-022.

### D-004 — Retrieval is hybrid and inspectable

**Decision:** Lexical and semantic retrieval remain independently visible and are combined through a rank-based method with explicit policy adjustments.

**Consequence:** The system cannot collapse retrieval into one unexplained relevance number.

### D-005 — Authorization precedes model context

**Decision:** Records the actor cannot access must not enter the evidence set, model input, answer, or user-visible post-boundary trace.

**Consequence:** Permission-leakage tests are release blockers.

### D-006 — Evidence search precedes answer generation

**Decision:** The first vertical slice ends at a ranked evidence set. Answer generation is added only after retrieval can be evaluated directly.

**Consequence:** Work cannot hide weak retrieval behind polished model output.

### D-007 — Prefer module boundaries before service boundaries

**Decision:** Begin with one locally runnable application and explicit internal contracts. MCP or additional services require a real independent consumer, deployment, ownership, isolation, credential, or policy need.

**Consequence:** The architecture remains portable and understandable during the MVP.

### D-008 — Use Acme Software Services as the initial evaluation organization

**Decision:** The initial dataset represents a fictional medium-sized B2B software-services company with two products: the ClientCore CRM and the TalentFlow job portal, plus a small shared platform surface.

**Consequence:** Cross-project ambiguity, authority, access differences, and source conflicts can be designed deliberately without using private or unrelated real-company material.

### D-009 — Groundwork and the first retrieval slice use a frozen initial backfill

**Decision:** Prepare and evaluate a versioned snapshot before implementing connector triggers, polling, interval updates, reconciliation, or continuous synchronization.

**Consequence:** Stable source identity and provenance remain required, but the current dataset and retrieval work do not need to model ongoing update delivery. Synchronization acceptance criteria remain later work rather than part of the first retrieval slice.

### D-010 — Use two local repositories within one Git source family — Superseded by D-022

**Decision:** The initial fixture contains one small read-only repository for ClientCore and one for TalentFlow. Both use the same Git adapter and source-processing contract.

**Consequence:** Project scoping can be tested with realistic code and exact identifiers without adding a new connector family.

**Revision:** The repositories remain as Pi simulation and future Helix-integration fixtures, not as a Primer-indexed source family.

### D-011 — Prepare email data but defer email ingestion

**Decision:** Fictional email threads may be collected as part of Acme's coherent history, but the first ingestion and retrieval slice remains Markdown and Slack-like JSON.

**Consequence:** Email does not expand the first implementation surface. Its prepared fixture can support a later source-family decision.

### D-012 — Deliver the complete CLI before the web application

**Decision:** The first implementation surface is a first-class CLI. It proves ingestion, content and identity inspection, retrieval, evaluation, cited answers, synchronization, and traces before web work begins. Human-readable output and stable `--json` output are both required where results form a reusable contract.

**Consequence:** Application logic lives behind reusable services rather than inside command handlers. The later HTTP API and web UI adapt those same services instead of reimplementing them.

### D-013 — Use TypeScript and a single local application

**Decision:** Implement Primer in TypeScript on Node.js as one locally runnable application with explicit module boundaries. The CLI is the first adapter; a local HTTP API and React-based UI are later adapters in the same product.

**Consequence:** The initial repository does not use distributed services. Exact HTTP framework and web build tooling may be selected during their phase without changing the domain architecture.

### D-014 — Use SQLite as the first derived index

**Decision:** Store records, metadata, ACL attributes, traces, and lexical search fields in SQLite. Use SQLite full-text search for the lexical baseline and an abstract vector repository with exhaustive cosine comparison for the small initial corpus.

**Consequence:** The MVP remains locally manageable. Storage and retrieval interfaces must allow a measured later migration to PostgreSQL/pgvector without hiding SQLite-specific behavior or pretending the initial vector scan is a large-scale design.

### D-015 — Use OpenRouter with task-appropriate SDK boundaries

**Decision:** OpenRouter is the initial provider for both chat and embedding models. Embedding calls use the official `@openrouter/sdk` client directly. Later grounded chat and streaming use Vercel AI SDK with OpenRouter. A later read-only code-exploration simulation uses Pi because it must model the harness boundary used by Helix; Pi does not own Primer's normal evidence pipeline. Chat and embedding model IDs are independently configurable and recorded with their relevant configuration.

**Consequence:** Provider credentials remain server-side and provider or harness SDK types remain inside adapters. Document embeddings are batched and cached; query and document embeddings must use compatible model/configuration versions. Automated tests use deterministic fakes, while explicit live evaluations use configured OpenRouter models. Neither Vercel AI SDK nor Pi is a wrapper around the embedding endpoint.

### D-016 — Use explicit workflows before agent loops

**Decision:** Ingestion, authorization, retrieval, fusion, evidence construction, answering, and citation validation remain explicit workflows. No agent abstraction owns the evidence pipeline. Pi may later host a bounded, read-only code-exploration simulation after Primer has constructed authorized initial context.

**Consequence:** Generated answers use Vercel AI SDK generation functions. Primer does not become an autonomous research agent, and Helix retains responsibility for real orchestration and repository exploration.

### D-017 — Use deterministic source-aware processors — Git clause superseded by D-022

**Decision:** Parse Markdown through frontmatter and heading structure, normalize Slack-like exports through deterministic thread rules, and parse the TypeScript Git fixtures through the TypeScript compiler API. Model-assisted normalization is deferred.

**Consequence:** Unchanged inputs and processor versions produce stable records. Broader language support or model-assisted normalization requires a later decision rather than weakening initial identity guarantees.

**Revision:** Deterministic Markdown and Slack processing remains. Primer will not implement the planned TypeScript AST processor unless later evidence reverses D-022.

### D-018 — Use the fixture identity model initially

**Decision:** The CLI accepts an explicit fixture user identity and resolves group/project access from local data. The web phase adds local accounts and sessions over the same authorization model. External federation is deferred.

**Consequence:** CLI evaluation does not require password or session behavior. The web account surface can test real identity differences without implying production SSO readiness.

### D-019 — Store safe, versioned traces

**Decision:** Store stage timing, stage inputs and outputs, source/processor/policy versions, model configuration, retrieval reasons, final evidence, and safe model input. Restricted pre-boundary content is never copied into a user-visible trace.

**Consequence:** Traces are inspectable and reusable by CLI and web surfaces while preserving the authorization boundary. Retention controls may be added when operating beyond the local MVP.

### D-020 — Plan cross-project integration without coupling the MVP

**Decision:** Acme Issues is a future read-only authoritative source. Helix is a future consumer of bounded Primer evidence. Neither integration is part of the CLI or web implementation phases.

**Consequence:** Stable CLI JSON and later equivalent HTTP contracts should make integration possible. Primer never writes Acme Issues, Helix never reads Primer's database directly, and MCP remains optional until a real service boundary justifies it.

### D-021 — Keep connectors independent from processors and the index

**Decision:** Each source connector independently owns acquisition, native references, source metadata, and connector-specific configuration. A registered source-family processor converts connector items into canonical source objects, records, and visible index decisions. Connectors do not embed, rank, or write retrieval storage directly.

**Consequence:** Local Markdown, Slack export, and future organizational-source connectors can evolve independently while reusing source-family processors and the same application services. Connectors remain modules in the single application until deployment, credential, ownership, isolation, or reuse requirements justify separate packages or services.

### D-022 — Delegate source-code exploration to the orchestrator harness

**Decision:** Primer does not index repository source code or duplicate Helix's code exploration. Primer supplies a bounded, authorized initial-context pack containing organizational evidence, constraints, conflicts, and non-authoritative code leads. In real implementation workflows, Helix's Pi harness verifies the current repository and gathers code context. Primer may later use Pi server-side only for a read-only UI simulation of that handoff, through a Primer-owned adapter rather than Helix internals.

**Consequence:** Git fixtures and exact symbol expectations move out of Primer's record index into a separate code-context reference set. Code paths mentioned by Primer are leads, not claims about the current checkout. A Pi simulation must pin repository identity and revision, use read-only tools, validate returned paths/excerpts, keep Primer evidence distinct from discovered code context, and never write Pi output back into the knowledge index automatically.

### D-023 — Preserve a future hybrid discovery path while remaining index-first

**Decision:** Continue the current index-first architecture for the CLI and web milestones. Keep discovery, evidence normalization, and durable indexing conceptually separate so a future connector may explore a source through its native search API, ingest it into Primer, or combine both approaches.

**Consequence:** No current connector API, phase gate, or implementation priority changes. Future native exploration must enter through an explicit connector capability and cannot bypass authorization, normalization, provenance, evidence construction, or tracing. Indexing remains valuable for cross-source retrieval, repeatability, latency, historical inspection, and sources with weak native search; it is not declared a permanent requirement for every future source.

## Resolved product questions

### Q-002 — Who is the primary user? — Resolved by D-012 and D-018

The first experience is optimized for an operator or developer using the CLI. The later web experience progressively reveals advanced inspection for technical leads and domain experts.

### Q-003 — What is the primary interaction flow? — Resolved by D-012

The CLI uses task-oriented commands. The web uses a progressive combination: chat is the common entry point, with linked content, account, retrieval, trace, and evaluation views.

### Q-004 — How much user-controlled configuration belongs in the MVP? — Resolved

Users control identity, optional project scope, result/evidence limit, and selected configured model where appropriate. Policy weights remain configuration and are inspectable but not general interactive controls in the MVP.

## Resolved technical questions

### Q-005 — What application language and UI stack should be used? — Resolved by D-013

Use TypeScript on Node.js, CLI first, then a local HTTP API and React UI over the same application services.

### Q-006 — What is the smallest credible storage baseline? — Resolved by D-014

Use SQLite full-text search and an abstract exhaustive vector baseline for the small local corpus.

### Q-007 — Which embedding and answer models/providers should be supported first? — Resolved by D-015

Use independently configurable OpenRouter chat and embedding models. Use the official OpenRouter TypeScript SDK for embeddings and Vercel AI SDK for later chat, streaming, and agent capabilities. Select concrete model IDs by evaluating the fixture rather than hard-coding them in the product contract.

### Q-008 — How will Git be parsed structurally? — Superseded by D-022

Primer will not parse or index source-code bodies in the current plan. Helix/Pi explores the current checkout in real workflows; a later Primer simulation may exercise the same read-only harness boundary.

### Q-009 — What is the initial access model? — Resolved by D-018

Use the fixture users, groups, projects, and `AccessDescriptor`, with no implicit administrator bypass.

### Q-010 — How deterministic must normalization be? — Resolved by D-017

Initial Markdown and Slack processing is deterministic and schema-validated. Model-assisted normalization is deferred.

### Q-011 — What evidence trace is stored? — Resolved by D-019

Store safe stage traces and exact authorized model input with configuration versions. Never copy restricted pre-boundary content into user-visible traces.

## Decision process

For each future question or proposed reversal:

1. state the user or system need;
2. compare the smallest viable options;
3. test any risky assumption with a short spike if necessary;
4. record the decision and consequences here;
5. update the product, architecture, evaluation, or plan document only where behavior changes.
