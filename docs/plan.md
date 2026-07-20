# Primer delivery plan

**Status:** Phase 5 is next. Phases 1 through 4 are complete: the CLI now covers registered Markdown and Slack content, synchronization/removal, policy and authorization, versioned traces, grounded OpenRouter answers, citation repair, and persisted evaluation. The `acme-v0.1` full baseline and targeted follow-up runs validated citation, abstention, repair, permission, and expected-point behavior; `acme-v0.3` is the active verified fixture.

The plan uses decision gates rather than calendar estimates. Each phase should leave behind inspectable artifacts and evidence, not only code.

## Current phase: Phase 5 working HTTP API and web operations

### Completed

- Original concept paper captured in `modern-knowledge-base.md`.
- Product vision separated from MVP behavior.
- Conceptual architecture and trust boundaries defined.
- Evaluation treated as a pre-implementation input.
- Implementation choices and their resolved questions recorded separately.
- Acme Software Services selected as the fictional organization, with ClientCore and TalentFlow project scopes.
- Frozen initial-backfill focus established for the first retrieval slice.
- Initial synthetic fixture started under `sample-data/acme/`.
- Initial fixture expanded to fifteen retrieval cases with shared and restricted knowledge.
- CLI-first and web-second delivery order selected.
- TypeScript, SQLite, the official OpenRouter TypeScript SDK for embeddings, Vercel AI SDK for later chat/agent needs, deterministic processors, and initial access/trace boundaries selected.
- Future Acme Issues source and Helix evidence-consumer relationships bounded and deferred.
- TypeScript CLI, SQLite schema, application services, fixture validator, and Markdown processor implemented.
- Deterministic and OpenRouter embedding adapters implemented behind one interface.
- Lexical and semantic retrieval, reciprocal-rank fusion, bounded evidence, saved traces, and the initial Markdown evaluation implemented.
- Automated fixture, ingestion, idempotency, authorization, retrieval, evaluation, and CLI contract tests passing.

### Completed Phase 2 work

- General connector item, connector, processor, registration, and registry contracts implemented.
- Existing Markdown behavior moved behind the `markdown-local` connector.
- Slack export acquisition and deterministic thread normalization implemented independently.
- SQLite schema upgraded to persist source family for sources and records.
- Standalone bot notifications and isolated Slack messages remain visible rejection decisions.
- Thread-level ACL, project overrides, provenance, authorship, stable identity, and resolution state preserved.
- Evaluation upgraded to fourteen Markdown-plus-Slack cases with an explicit permission-safety result.
- Connector independence, idempotency, thread normalization, retrieval, and restricted-content tests passing.

### Completed Phase 2 policy and context work

- Explicit, bounded authority, freshness, and resolution-state rank-adjustment reason ledgers implemented.
- Same-question/different-user regression coverage proves restricted evidence does not cross the authorization boundary.
- `primer.context.v1` implemented with authorized evidence, constraints, conflicts, and unverified code leads without Helix coupling.
- Lexical query normalization and an explicit sufficiency gate prevent low-confidence semantic-only candidates from triggering answer generation.

### Foundation exit gate

Implementation may begin because:

- the initial dataset tells one coherent story across all three sources;
- at least ten evaluation cases cover the required behavior families;
- the authorization matrix contains both shared and restricted knowledge;
- the initial stack and local runtime boundary are selected;
- model-dependent and deterministic stages are explicitly separated;
- no blocking product question remains disguised as an engineering task.

## Phase 1: CLI foundation and Markdown evidence search

**Status:** Complete.

Scaffold the TypeScript application, SQLite schema/migrations, configuration, application services, CLI adapter, deterministic model fakes, and fixture validator. Use Markdown only to prove the path from authoritative content through derived records to visible lexical and semantic results, fusion, and final evidence. Do not generate answers yet.

Exit evidence:

- human-readable CLI commands and stable JSON contracts for reusable results;
- fixture validation and local database initialization;
- heading-aware records and provenance;
- visible acceptance/rejection decisions;
- separate retriever results and fused ranking;
- a retrieval-only evaluation report;
- rebuild and unchanged-input idempotency verification.

## Phase 2: CLI contrasting sources, identity, and policy

**Status:** Complete.

Add deterministic Slack-like thread normalization plus identity inspection commands, scope, authority, freshness, resolution state, and the initial authorization model. Define a bounded organizational context contract for orchestrators. Source-code exploration is not part of the Primer index; real workflows delegate it to Helix's Pi harness.

Exit evidence:

- each source proves the need for distinct processing;
- exact and semantic retrieval provide complementary value;
- rank adjustments have visible reason ledgers;
- same-question/different-user tests show authorized differences;
- permission-leakage tests pass.
- the initial-context pack contains only authorized Primer evidence and labels code paths or symbols as non-authoritative leads.

## Phase 3: CLI grounded answers through OpenRouter

**Status:** Complete. `primer.answer.v1`, deterministic and Vercel/OpenRouter providers, citation validation with one bounded repair attempt, conflict/constraint forwarding, no-model-call abstention, persisted `primer.answer-evaluation.v1` runs, detailed citation diagnostics, filtered live reruns, and bounded grammatical normalization for expected-point screening are implemented. The v0.1 full and targeted live runs are preserved, and v0.3 passes offline and targeted live verification. Terminal streaming was not required for the CLI gate and remains available as a later UX optimization if a concrete need emerges.

Use Vercel AI SDK with configured OpenRouter models. Generate from the final evidence set only. Add terminal streaming where useful, citations, original-source references, conflict disclosure, abstention, and validation.

Exit evidence:

- captured model input matches displayed evidence;
- citation identity and coverage validation pass;
- conflict and insufficient-evidence cases behave correctly;
- answer evaluation is reported separately from retrieval evaluation;
- deterministic tests run without network or provider credentials;
- explicit live evaluation records model identity, configuration, usage, and timing.

## Phase 4: complete CLI trust and change

**Status:** Complete. Persisted source registrations, explicit synchronization, changed and removed source handling, explicit source and registration removal, preserved synchronization runs, failed/interrupted status, configuration/version inspection, listable versioned traces, stage timing, categorized CLI errors, and stable JSON contracts are implemented. `sources ingest` remains a one-shot fixture convenience; registered synchronization is the managed lifecycle contract.

Complete content registration, listing, inspection, synchronization, removal, deletion behavior, policy/configuration versions, saved stage traces, and latency. At this gate the complete product pipeline works without a browser.

Exit evidence:

- an operator can edit one source and account for every affected record and answer change;
- unchanged, changed, removed, and interrupted synchronization cases are verified;
- CLI acceptance criteria in `product-spec.md` are verified;
- stable JSON contracts have regression tests;
- documentation distinguishes implemented CLI behavior from planned web and integration behavior.

## Phase 5: local HTTP API and web operations

First expose the existing application services through a working local HTTP API and verify it independently. Then add a React application with local accounts/sessions and content operations before chat presentation. The browser must use the API for all application behavior and must never read SQLite or provider credentials directly.

Exit evidence:

- account, group/project membership, active session, and effective-access journeys work;
- the HTTP API can be run and tested without the React UI and exposes health/configuration plus the required account, content, synchronization, trace, and evaluation operations;
- content registration, ingestion, inspection, synchronization, and removal reuse CLI-tested services;
- API and CLI contract results remain semantically equivalent;
- provider credentials remain server-side;
- API integration tests cover success, categorized failures, authorization, and lifecycle behavior before UI tests;
- integrated visual tests cover account and content workflows.

## Phase 6: web chat, inspection, and evaluation

Add streamed chat, citations, evidence navigation, expandable retrieval/model traces, synchronization results, and evaluation reporting to the web application. Add an optional server-side Pi simulation only after these core surfaces work: Primer supplies authorized initial context, a read-only Pi session explores a restored fixture repository, and the UI displays Primer evidence and Pi-discovered code context as separate stages.

Exit evidence:

- displayed answers use exactly the displayed authorized evidence;
- the same-question/different-account visual journey proves access differences without leakage;
- chat, content, account, trace, synchronization, and evaluation surfaces operate as one system;
- all MVP acceptance criteria in `product-spec.md` are verified;
- visual and end-to-end tests cover the representative product journeys.
- the optional Pi simulation is revision-pinned, read-only, bounded, and cannot mutate the Primer index.

## Phase 7: ecosystem integrations

This phase begins only through a separate decision and after the CLI and web gates pass.

Candidate order:

1. Add a read-only Acme Issues source adapter for issues, comments, labels, state history, and Helix run lineage.
2. Expose a bounded evidence-query HTTP contract equivalent to the stable CLI JSON result.
3. Add a Helix adapter that supplies actor/project-scoped Primer evidence to planning or specialist context.
4. Evaluate MCP only if more independent consumers or a concrete deployment, credential, policy, isolation, or ownership boundary emerges.

Integration exit evidence must prove provenance, authorization, freshness, failure isolation, and that neither project reads or mutates another project's private storage.

Helix retains ownership of Pi sessions, repository tools, and current-code exploration. Primer supplies initial organizational context and does not return indexed source-code bodies.

## Deferred until after the MVP

- live connectors and OAuth;
- hybrid source adapters that can use native exploration as well as durable ingestion;
- background jobs, webhooks, polling, and reconciliation workers;
- production identity integration;
- shared MCP exposure without a demonstrated boundary;
- advanced reranking and query planning;
- distributed deployment and large-scale search infrastructure.

Deferred work should enter only through a concrete use case and a new decision record.
