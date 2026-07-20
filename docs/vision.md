# Primer vision

**Status:** Product direction. Primer has not been implemented.

Primer should help people find trustworthy answers across organizational knowledge while retaining a clear path back to the evidence. It should make consequential transformations inspectable: what entered the system, what was rejected, how content was normalized and split, why evidence matched, which evidence was authorized, and whether each answer claim is supported.

## The problem

Many knowledge products compress a complex evidence pipeline into two visible actions: connect sources and ask questions. That hides the sources of both quality and failure.

Organizational knowledge is heterogeneous and contested. A discussion can contain guesses and a later resolution. Code contains exact identifiers and structural relationships. A maintained document may outrank a newer informal message. Relevant content can still be inaccessible to the current user. Semantic similarity alone cannot decide truth, authority, scope, or permission.

## Product promise

Primer will let a user follow one question through this complete path:

```text
authoritative source
  -> source-aware processing
  -> derived records
  -> lexical and semantic candidates
  -> authorization and scope filters
  -> fused and adjusted ranking
  -> bounded evidence set
  -> cited answer or honest abstention
```

Every arrow should be inspectable.

## Audience

### Primary

- Teams that need reliable answers across fragmented technical and operational knowledge.
- Developers and technical leads responsible for knowledge quality and system behavior.
- Domain experts defining useful knowledge units, authority rules, and representative questions.

### Secondary

- Operators investigating why a result or answer behaved a certain way.
- Builders adapting Primer's connector, retrieval, and evaluation boundaries to new domains.

The first release is intentionally focused on a small number of sources and a locally manageable operating model, establishing a strong base for broader connectors and operating environments.

## Principles

### Evidence before eloquence

Retrieval quality, authorization, provenance, and citation support matter more than fluent prose.

### Native sources remain authoritative

Primer does not become the editing home for Slack, Git, or documents. Its index is a replaceable representation optimized for discovery and retrieval.

### Source-aware before source-agnostic

Connectors share a contract, but processing respects the meaning of each source. Threads, symbols, and document sections should not be reduced to identical fixed-size chunks.

### Inspectability is a feature

Rejected records, intermediate rankings, filtering decisions, conflicts, and insufficient evidence are product behavior, not debug information to hide.

### Authorization precedes generation

Protected content must be removed before model context is assembled. Hiding a citation after generation is not access control.

### Small, local, and understandable first

Primer should be locally runnable and understandable from end to end. Operational concerns are designed explicitly, while infrastructure complexity enters only when concrete scale or reliability needs justify it.

### Domain judgment stays explicit

Authority, freshness, supersession, scope, and representative questions are configurable policy. They are not delegated invisibly to an embedding model or answer model.

## The user outcome

After using Primer, a user or operator should be able to determine:

1. which sources support an answer and how current they are;
2. why particular evidence was retrieved and ranked;
3. where scope, permissions, authority, and freshness changed the result;
4. what evidence was actually supplied to the model;
5. whether citations support the nearby claims;
6. whether source changes have reached the derived index; and
7. where domain policy influenced the outcome.

## Long-term direction

Primer may grow into reusable connector, retrieval, evaluation, and tool interfaces supporting broader organizational use. That extensibility must grow out of a trustworthy core. The first release should not become a universal connector platform or autonomous research agent before the evidence pipeline is proven.
