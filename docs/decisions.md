# Primer decisions and open questions

**Status:** Active decision log. Update this document when product or architecture choices are settled or reversed.

## Settled decisions

### D-001 — Primer is a focused, inspectable knowledge system

**Decision:** Build a credible knowledge product around trustworthy answers, inspectable evidence, and adaptable boundaries. Sequence breadth and scale after the core pipeline is proven.

**Consequence:** The UI exposes consequential intermediate stages. The first release concentrates engineering effort on a dependable core before broadening connectors and infrastructure.

### D-002 — Original systems remain authoritative

**Decision:** The central knowledge index is derived and rebuildable. Primer does not become the editing system of record.

**Consequence:** Provenance, stable source identity, synchronization, replacement, and deletion are core behavior.

### D-003 — Use three contrasting source families

**Decision:** Initially support Markdown documents, Slack-like exported conversations, and one local Git repository.

**Consequence:** A common connector envelope is useful, but source processing remains specialized.

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

### D-010 — Use two local repositories within one Git source family

**Decision:** The initial fixture contains one small read-only repository for ClientCore and one for TalentFlow. Both use the same Git adapter and source-processing contract.

**Consequence:** Project scoping can be tested with realistic code and exact identifiers without adding a new connector family.

### D-011 — Prepare email data but defer email ingestion

**Decision:** Fictional email threads may be collected as part of Acme's coherent history, but the first ingestion and retrieval slice remains Markdown, Slack-like JSON, and Git.

**Consequence:** Email does not expand the first implementation surface. Its prepared fixture can support a later source-family decision.

## Open product decisions

### Q-002 — Who is the primary user?

Choose whether the default experience is optimized first for an application developer, an AI/ML engineer, a technical lead, or a domain expert. The same capabilities can remain, but language and information density will change.

### Q-003 — What is the primary interaction flow?

Decide between a guided scenario, a dashboard with free exploration, or a progressive combination. The four capability groupings in the product spec do not require four isolated pages.

### Q-004 — How much user-controlled configuration belongs in the MVP?

Candidates include authority weights, freshness behavior, result limits, and user/project scope. Exposing every tuning knob would obscure the primary workflow; the minimum useful controls remain to be selected.

## Open technical decisions

### Q-005 — What application language and UI stack should be used?

The choice should optimize for an approachable local setup, readable end-to-end code, inspection UI quality, and strong database/tooling support.

### Q-006 — What is the smallest credible storage baseline?

The concept proposes PostgreSQL full-text search plus pgvector. Decide whether the first slice requires that exact environment or whether a simpler embedded setup can preserve the required retrieval behavior without creating a later rewrite trap.

### Q-007 — Which embedding and answer models/providers should be supported first?

The design should separate provider interfaces and record model/configuration versions. Decide whether the default requires a hosted API, supports a local model, or provides both through one narrow abstraction.

### Q-008 — How will Git be parsed structurally?

Choose the language scope and whether to use a parser such as Tree-sitter, language-native tooling, or a deliberately constrained fixture parser. Fixed-token splitting is not an acceptable substitute.

### Q-009 — What is the initial access model?

Define the smallest `AccessDescriptor`, identity-to-group mapping, and database filtering representation that proves the authorization boundary without overstating the initial identity integration.

### Q-010 — How deterministic must normalization be?

Decide which Slack-like normalization steps are rules, which may use a model, how schema validation works, and whether curated fixture outputs are used to keep baseline behavior reproducible.

### Q-011 — What evidence trace is stored?

Define trace retention, model-input capture, configuration/version identifiers, redaction, and how user-visible traces avoid leaking restricted candidates.

## Decision process

For each open question:

1. state the user or system need;
2. compare the smallest viable options;
3. test any risky assumption with a short spike if necessary;
4. record the decision and consequences here;
5. update the product, architecture, evaluation, or plan document only where behavior changes.
