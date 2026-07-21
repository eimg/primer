# Primer evaluation contract

**Status:** Implemented CLI evaluation contract. The active evaluation dataset is frozen as `acme-v0.3`. Retrieval and answer evaluation are implemented as separate persisted run types. Historical runs remain comparable only against their original expectations: version 0.2 corrected case 003 to use project-scoped evidence, and version 0.3 narrows case 008 to the deletion and audit behavior asked by the question.

The retrieval runner evaluates fourteen cases against indexed Markdown and Slack records and skips the code-context-only exact-symbol case. The answer runner evaluates the same eligible organizational-knowledge cases, persists model identity, answers, citations, expected-point coverage, permission results, abstention behavior, usage, and timing, and skips that code-only case. Git symbol locations are recorded separately as `expectedCodeContextRefs`; they are not Primer record expectations and are not scored by either runner. A later Pi simulation or Helix integration evaluation will verify them against a pinned checkout. Deterministic offline verification exercises the pipeline and contracts; it is not the live semantic-quality baseline.

Primer must evaluate the evidence pipeline before evaluating prose quality. A fluent answer does not compensate for missing, unauthorized, stale, or unsupported evidence.

## Evaluation unit

Each case should contain:

```ts
type EvaluationCase = {
  id: string;
  question: string;
  userId: string;
  projectId?: string;
  expectedRecordIds: string[];
  expectedCodeContextRefs?: string[];
  forbiddenRecordIds?: string[];
  expectedAnswerPoints: string[];
  expectedConflictIds?: string[];
  mustAbstain?: boolean;
  rationale: string;
};
```

Expected record identity should be stable across unchanged synchronizations.

`expectedCodeContextRefs` are unindexed repository targets for harness evaluation. They must remain distinct from Primer evidence, be verified against a specific repository revision, and never be presented as current code truth merely because an organizational source mentioned the path or symbol.

Evaluation output must also record the dataset version, application version, processor and policy versions, storage schema version, embedding model/configuration, answer model/configuration, and whether model calls used deterministic fakes or live OpenRouter requests.

## Required case families

The initial suite should include at least one case for each behavior and enough overlap to prevent one-off tuning:

- natural-language conceptual retrieval;
- exact symbol, error code, path, or command retrieval;
- a term shared by two projects where scope matters;
- a resolved thread outranking speculation;
- a maintained document outranking a stale or superseded statement;
- two sources that materially conflict;
- relevant evidence that the current user cannot access;
- a question with no sufficient evidence;
- a source edit that changes the expected result;
- a removed source whose records must disappear.

## Metrics

### Retrieval

- **Candidate recall:** expected records found by lexical, semantic, and union candidate sets.
- **Evidence recall:** expected records present in the final evidence set.
- **Evidence precision:** proportion of final evidence that is expected or explicitly relevant.
- **Rank quality:** whether the most useful and authoritative evidence appears early.

Metrics must be reported by retrieval stage so fusion cannot hide a failing retriever.

### Authorization

- **Permission leakage:** forbidden content appearing in exposed candidates, evidence, model input, answer, citation, or user-visible trace. Target: zero.
- **Identity differential:** expected differences when the same question is run as different users.

Authorization failures are release blockers, not quality trade-offs.

### Answer grounding

- **Citation validity:** every citation names supplied evidence.
- **Citation coverage:** material factual claims have nearby citations.
- **Citation support:** cited excerpts actually support the associated claim.
- **Expected point coverage:** supported answer points present.
- **Conflict disclosure:** known material conflict is surfaced.
- **Correct abstention:** insufficient-evidence cases do not produce confident factual answers.

Deterministic validation should cover evidence identity and citation coverage. Human review or a separately controlled evaluator may assess semantic support, with its limits clearly labeled.

`expectedAnswerPoints` currently use deterministic normalized-token overlap as a screening metric. Identifier separators, `no`/`not` negation, and bounded English variants such as plurals, `-ed`, `-ing`, and `-ically` are normalized so grammatical wording does not create obvious false negatives. This can identify missing concepts but cannot prove entailment or citation support. A case is marked for semantic review when a point is missed or when `mustAbstain` accompanies expected negative-boundary points, as in a response that should state no approved behavior without inventing an algorithm. Only `mustAbstain` cases with no expected answer points require a full no-evidence abstention automatically.

Answer runs persist the full citation validator result: cited IDs, invalid IDs, and uncited factual paragraphs. Bracket groups such as `[E1, E2]` expand to both evidence identifiers. Evidence-based refusal language is recognized as abstention even when the provider does not use Primer's deterministic wording. Identifier punctuation such as `tenant_id` and `tenant-id` is normalized for expected-point screening.

### Synchronization

- unchanged input causes no record churn;
- changed input replaces only affected records;
- removed input removes all affected search representations;
- interrupted synchronization reports incomplete state;
- the expected query outcome changes after the test update.

### Performance

Measure latency separately for authorization, lexical retrieval, semantic retrieval, fusion/policy, evidence construction, generation, and validation. The first release establishes observable baselines before scale targets are set.

### Operational contracts

- human-readable CLI evaluation output identifies failed cases and the stage responsible;
- JSON evaluation output is stable enough for regression comparison and later web/API consumption;
- provider, rate-limit, configuration, and fixture-validation failures are distinguishable from relevance failures;
- web evaluation views report the same underlying run rather than recalculate metrics independently.

## Deterministic and live evaluation

The normal automated test suite must not require an OpenRouter key, network access, or paid model calls. It uses deterministic embedding and answer adapters to verify contracts, authorization, ranking mechanics, citation identity, synchronization, and presentation of traces.

Live model evaluation is an explicit command or option. It uses the configured OpenRouter embedding model through the official OpenRouter TypeScript SDK and later answer models through Vercel AI SDK, recording returned model identity, relevant configuration, usage, and timing. Live results are comparable only when the embedding space and evaluation configuration are compatible.

Repeated `--case <case-id>` options select a subset for a paid live rerun. The persisted run records the filter. Citation repair is limited to one extra provider call per answer, and aggregated usage includes both attempts.

Model-dependent quality and deterministic correctness are reported separately. A provider failure cannot be reported as a retrieval-quality score, and a fluent live answer cannot override a deterministic authorization or citation failure.

## Evaluation workflow

1. Freeze a versioned sample-data fixture.
2. Assign stable source and expected record identifiers.
3. Write cases and rationales before tuning retrieval.
4. Run retrieval-only evaluation.
5. Run answer evaluation using the captured evidence.
6. Compare results by configuration and model version.
7. Review failures through the same traces exposed in the product.

The CLI is the first evaluation surface. The later web application reads persisted evaluation runs and invokes the same evaluation service.

## Exit criteria for implementation phases

- Evidence search cannot pass while exact-identifier or natural-language cases systematically fail.
- Grounded answers cannot pass while citations can reference missing evidence or abstention fails.
- Access-control work cannot pass with any permission leakage.
- Synchronization cannot pass while deletion or unchanged-input idempotency is unverified.
- The CLI milestone cannot pass without stable JSON contract tests and an end-to-end offline evaluation run.
- The web milestone cannot pass if its displayed evidence, metrics, or trace differs from the underlying application-service result.

The Phase 7 `primer.readiness.v1` gate freezes conservative regression floors for `acme-v0.3`: 95% mean union recall, 90% mean evidence recall, and 60% mean answer-point screening coverage. These floors are regression alarms, not semantic-quality claims. Permission leakage, invalid citation identity, incorrect full abstention, failed deterministic behavior, database corruption, and incomplete managed synchronization retain zero tolerance. Live semantic-review warnings require human review under [`manual-live-testing.md`](./manual-live-testing.md).

Thresholds must not be compared across incompatible fixture expectations or silently changed to make a run pass. A later threshold revision requires a recorded decision and preserved baseline evidence.
