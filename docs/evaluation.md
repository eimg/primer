# Primer evaluation contract

**Status:** Draft. The evaluation dataset must be designed before implementation.

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
  forbiddenRecordIds?: string[];
  expectedAnswerPoints: string[];
  expectedConflictIds?: string[];
  mustAbstain?: boolean;
  rationale: string;
};
```

Expected record identity should be stable across unchanged synchronizations.

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

### Synchronization

- unchanged input causes no record churn;
- changed input replaces only affected records;
- removed input removes all affected search representations;
- interrupted synchronization reports incomplete state;
- the expected query outcome changes after the test update.

### Performance

Measure latency separately for authorization, lexical retrieval, semantic retrieval, fusion/policy, evidence construction, generation, and validation. The first release establishes observable baselines before scale targets are set.

## Evaluation workflow

1. Freeze a versioned sample-data fixture.
2. Assign stable source and expected record identifiers.
3. Write cases and rationales before tuning retrieval.
4. Run retrieval-only evaluation.
5. Run answer evaluation using the captured evidence.
6. Compare results by configuration and model version.
7. Review failures through the same traces exposed in the product.

## Exit criteria for implementation phases

- Evidence search cannot pass while exact-identifier or natural-language cases systematically fail.
- Grounded answers cannot pass while citations can reference missing evidence or abstention fails.
- Access-control work cannot pass with any permission leakage.
- Synchronization cannot pass while deletion or unchanged-input idempotency is unverified.

Numeric thresholds will be set after the dataset is drafted and a simple baseline is measured. Choosing thresholds before representative cases would create false precision.
