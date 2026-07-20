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

## Product surfaces

Primer should expose one knowledge pipeline through progressively richer surfaces rather than build separate products around the same behavior.

### CLI first

The first surface is a first-class CLI for operators and developers. It proves ingestion, inspection, identity-aware retrieval, evaluation, cited answers, synchronization, and machine-readable traces before visual presentation can conceal weak behavior. Human-readable output and stable JSON output are both product contracts.

### Web second

After the CLI pipeline is credible, a local web application will reuse the same application services. Its integrated surfaces are:

- chat with citations and expandable retrieval evidence;
- local account and access management;
- content registration, ingestion, inspection, synchronization, and removal; and
- evaluation and trace inspection.

The web application is part of the intended product, not a disposable test harness. Primer still remains more than a chat box: the content, access, retrieval, and trace surfaces are equally consequential.

## Principles

### Evidence before eloquence

Retrieval quality, authorization, provenance, and citation support matter more than fluent prose.

### Native sources remain authoritative

Primer does not become the editing home for Slack or documents. Its index is a replaceable representation optimized for discovery and retrieval. Repository source code remains outside that index: Primer supplies organizational context, while an orchestrator harness verifies current code when implementation work begins.

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

### Deterministic workflow before agent autonomy

Source processing, authorization, retrieval, ranking, evidence construction, and citation validation use explicit application control flow. Model or agent SDKs do not own these trust boundaries. Agent behavior enters only when a future capability genuinely requires a bounded multi-step tool loop.

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

Within the Acme testbed, two later relationships are planned:

- Acme Issues can become an authoritative source of issue descriptions, comments, labels, status history, and Helix run lineage. Primer derives searchable records but never becomes the issue editor.
- Helix can request bounded, authorized evidence from Primer when planning or implementation needs internal knowledge. Helix keeps ownership of orchestration and reasoning; Primer keeps ownership of evidence construction and provenance.

The first interoperable contract should be stable JSON from the CLI, followed by an equivalent HTTP API in the web phase. Direct database coupling is prohibited. MCP remains optional and should be introduced only when multiple independent consumers or an ownership, credential, policy, or deployment boundary justifies it.
