# Primer groundwork and delivery plan

**Status:** Planning. No phase has entered implementation.

The plan uses decision gates rather than calendar estimates. Each phase should leave behind inspectable artifacts and evidence, not only code.

## Current phase: foundation and dataset construction

### Completed

- Original concept paper captured in `modern-knowledge-base.md`.
- Product vision separated from MVP behavior.
- Conceptual architecture and trust boundaries defined.
- Evaluation treated as a pre-implementation input.
- Implementation choices and open questions recorded separately.
- Acme Software Services selected as the fictional organization, with ClientCore and TalentFlow project scopes.
- Frozen initial-backfill focus established for the first retrieval slice.
- Initial synthetic fixture started under `sample-data/acme/`.

### Remaining foundation work

- Expand and review the initial users/groups and access matrix.
- Expand the adversarial Acme corpus while preserving its canonical event ledger.
- Review and refine the first evaluation cases and stable expected source identities.
- Decide the primary user journey and how advanced inspection is revealed.
- Select the initial runtime, database, model-provider strategy, and local setup boundary.
- Record lightweight architectural decisions for choices that constrain later phases.

### Foundation exit gate

Implementation may begin when:

- the initial dataset tells one coherent story across all three sources;
- at least ten evaluation cases cover the required behavior families;
- the authorization matrix contains both shared and restricted knowledge;
- the initial stack can run the complete vertical slice locally;
- expected model-dependent and deterministic stages are explicitly separated;
- no blocking product question remains disguised as an engineering task.

## Phase 1: evidence search vertical slice

Use Markdown only to prove the path from authoritative content through derived records to visible lexical and semantic results, fusion, and final evidence. Do not generate answers yet.

Exit evidence:

- heading-aware records and provenance;
- visible acceptance/rejection decisions;
- separate retriever results and fused ranking;
- a retrieval-only evaluation report;
- rebuild and unchanged-input idempotency verification.

## Phase 2: contrasting sources and policy

Add Slack-like thread normalization and Git structural processing. Add scope, authority, freshness, resolution state, and the initial authorization model.

Exit evidence:

- each source proves the need for distinct processing;
- exact and semantic retrieval provide complementary value;
- rank adjustments have visible reason ledgers;
- same-question/different-user tests show authorized differences;
- permission-leakage tests pass.

## Phase 3: grounded answers

Generate from the final evidence set only. Add citations, original-source navigation, conflict disclosure, abstention, and validation.

Exit evidence:

- captured model input matches displayed evidence;
- citation identity and coverage validation pass;
- conflict and insufficient-evidence cases behave correctly;
- answer evaluation is reported separately from retrieval evaluation.

## Phase 4: trust and change

Add the complete synchronization walkthrough, deletion behavior, policy/configuration versions, and stage-level traces and latency.

Exit evidence:

- an operator can edit one source and account for every affected record and answer change;
- unchanged, changed, removed, and interrupted synchronization cases are verified;
- all MVP acceptance criteria in `product-spec.md` are verified;
- documentation distinguishes reference behavior from production extensions.

## Deferred until after the MVP

- live connectors and OAuth;
- background jobs, webhooks, polling, and reconciliation workers;
- production identity integration;
- shared MCP exposure;
- advanced reranking and query planning;
- distributed deployment and large-scale search infrastructure.

Deferred work should enter only through a concrete use case and a new decision record.
