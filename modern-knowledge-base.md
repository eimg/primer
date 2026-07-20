# Building a Modern AI Knowledge Base

> An approachable, inspectable system that turns organizational knowledge into trustworthy evidence for AI answers.

## What we are building

Primer begins as a **focused, credible knowledge product** with a complete evidence pipeline and room to expand.

The goal is to help teams find reliable answers while giving developers, operators, and domain experts visibility into the complete knowledge pipeline:

```text
existing knowledge
      ↓
source-aware processing
      ↓
central search index
      ↓
hybrid retrieval
      ↓
ranked evidence
      ↓
answer with citations
```

Most knowledge products hide everything between “connect sources” and “ask a question.” Primer makes those intermediate stages visible so people can trust, operate, evaluate, and adapt the system.

Primer should make it possible to understand:

1. Why naive RAG becomes unreliable with real organizational data.
2. Why Slack, code, and documents need different processing.
3. Why vector search and full-text search work better together.
4. How metadata, freshness, authority, and permissions affect relevance.
5. How the model receives selected evidence rather than the whole database.
6. Why citations and incremental updates are architectural features.
7. Where domain expertise enters the system.

## 1. The idea: from naive RAG to evidence construction

A basic RAG application usually does this:

```text
documents → fixed-size chunks → embeddings → vector search → prompt → answer
```

This can work for clean, static documents. Organizational knowledge is different:

- a Slack thread contains questions, guesses, corrections, and a final resolution;
- source code contains exact identifiers and structural relationships;
- a wiki has sections, tables, versions, and owners;
- a newer message may contradict an older runbook;
- the most similar result may belong to the wrong project;
- some evidence may be inaccessible to the current user.

Semantic similarity is useful, but it is not the same as relevance or truth.

A modern knowledge system instead does this:

```text
source-aware ingestion
  → normalization
  → selective indexing
  → meaningful chunks
  → vector + full-text retrieval
  → metadata and permission filtering
  → rank fusion
  → evidence synthesis
  → cited answer
```

The central lesson is:

> Modern RAG is not primarily “chat with embeddings.” It is a pipeline for constructing the best available evidence for a particular question and user.

## 2. Keep the original systems authoritative

Do not ask people to migrate all their knowledge into a new AI database.

```text
Slack or Teams     = discussion and decision context
GitHub or GitLab   = what was implemented
Issues             = what was requested and tracked
Wiki or documents  = what was formalized
Incidents          = what failed and how it was resolved
```

These remain the systems of record. The central knowledge index is a **derived, rebuildable search representation**.

```text
Original systems = authoritative knowledge
Central index    = content optimized for retrieval
```

The index stores normalized text, chunks, embeddings, text-search fields, metadata, access rules, timestamps, and links back to the originals. Users continue editing knowledge in its native system.

## 3. Begin with three sources

Begin with three contrasting sources rather than spreading the first release across every connector:

```text
Slack JSON or representative conversations
  requires conversational normalization and resolution handling

Local Git repository
  requires structural chunking and exact-identifier retrieval

Markdown documents
  requires hierarchy, authority, and formalized-knowledge handling
```

These are enough to prove the architecture and provide useful cross-source answers. Teams, email, Jira, Google Drive, and other sources can become later adapters using the same common interface.

Defer live OAuth integrations initially. Include realistic packaged data and allow users to select a local directory or import an export file where appropriate.

## 4. The complete MVP architecture

```text
AUTHORITATIVE INITIAL SOURCES
Slack JSON · Git repository · Markdown wiki
                         │
                         ▼
SOURCE ADAPTERS
Read source objects and preserve provenance
                         │
                         ▼
SOURCE-AWARE PROCESSING
Normalize · filter noise · create meaningful chunks
                         │
                         ▼
DERIVED KNOWLEDGE INDEX
PostgreSQL · pgvector · full-text search · metadata · ACLs
                         │
                         ▼
QUESTION + ACTIVE USER + PROJECT SCOPE
                         │
                         ▼
HYBRID RETRIEVAL
Vector search · lexical search · filters · rank fusion
                         │
                         ▼
EVIDENCE SET
Small · authorized · ranked · traceable
                         │
                         ▼
MODEL
Question + evidence + citation rules
                         │
                         ▼
ANSWER
Claims · citations · source links · uncertainty
```

Use existing database technology. Do not build a search engine.

For this MVP:

```text
PostgreSQL             stores records and metadata
PostgreSQL full text   retrieves exact words and identifiers
pgvector               retrieves semantically related content
application code       fuses rankings and prepares evidence
```

At greater scale, the derived search index could move to OpenSearch, Qdrant, or another search service. That change is not necessary for the initial operating scope.

## 5. Give every connector one contract

Each source adapter understands its own source but emits a common object:

```ts
type SourceObject = {
  source: "slack" | "git" | "markdown";
  sourceId: string;
  sourceUrl: string;
  sourceType: string;       // thread, function, document-section

  title?: string;
  rawContent: string;
  createdAt: string;
  updatedAt: string;

  projectId?: string;
  authors: string[];
  metadata: Record<string, unknown>;

  allowedUserIds: string[];
  allowedGroupIds: string[];
};
```

Processing converts it into one or more searchable records:

```ts
type KnowledgeRecord = {
  id: string;
  source: string;
  sourceId: string;
  sourceUrl: string;
  sourceType: string;

  title?: string;
  content: string;          // retrieval-friendly representation
  parentId?: string;

  projectId?: string;
  updatedAt: string;
  authority: number;        // 0 to 1
  resolutionState?: "proposed" | "resolved" | "superseded";

  allowedUserIds: string[];
  allowedGroupIds: string[];
  metadata: Record<string, unknown>;

  contentChecksum: string;
  embedding?: number[];
};
```

Stable `sourceId` values allow a later sync to replace old records instead of creating duplicates. Every record needs a `sourceUrl` so the answer can cite the original evidence.

## 6. Process each source differently

### Slack: normalize conversations

A raw message is usually a poor knowledge unit. Process an entire thread and extract:

```ts
type NormalizedThread = {
  question: string;
  summary: string;
  resolution?: string;
  decisions: string[];
  unresolvedPoints: string[];
  systems: string[];
  exactIdentifiers: string[];
};
```

Example:

```text
Raw thread
  “Checkout is duplicating orders.”
  “Maybe the database is retrying?”
  “No, DB looks normal.”
  “Found it: retry worker omitted the idempotency key.”
  “Fixed in PR 482.”

Normalized record
  Question: Why were checkout orders duplicated?
  Resolution: The retry worker omitted the idempotency key.
  Related identifier: PR 482
  State: resolved
```

Keep the original thread link. If the conversation has no clear resolution, record that honestly rather than asking the model to invent one.

Also preserve high-signal message groups containing stack traces, commands, or identifiers that a summary could omit.

### Git: chunk by structure

Do not split code every fixed number of tokens. Use meaningful units:

- module overview;
- class or interface;
- function or method;
- configuration block;
- schema or migration;
- important test case.

Attach repository, path, language, symbol, and commit metadata.

```text
Repository: checkout-service
Path: src/workers/retry.ts
Symbol: retryPayment
Commit: abc123

<function content>
```

Full-text search is essential for identifiers such as `retryPayment`, `ERR_TOKEN_EXPIRED`, and file paths.

### Markdown: preserve hierarchy

Split documents by headings before considering token limits:

```text
Payments Runbook
  Production incidents
    Duplicate orders
      Detection
      Resolution
```

Include the heading path, document owner, status, and modification time in every chunk. Keep tables with their headers and code blocks intact when possible.

## 7. Normalize, but preserve evidence

Normalization transforms content into the form people are likely to search:

```text
raw workplace content
   → likely question
   → concise summary
   → final decision or resolution
   → systems and exact identifiers
   → source link and provenance
```

An LLM can help produce this structure, but its output must be validated. Normalization improves discoverability; it does not become the authoritative evidence.

Show both versions in the product:

```text
Original source | Normalized record | Generated chunks
```

This is one of the product's most important trust and operations views.

## 8. Index selectively

Do not embed everything. Skip or down-rank:

- acknowledgements such as “thanks” or “done”;
- repeated bot notifications;
- empty templates;
- generated build artifacts;
- duplicated cross-posts;
- clearly superseded content;
- secrets or prohibited data.

Use transparent rules for the MVP:

```ts
type IndexDecision = {
  shouldIndex: boolean;
  reason: string;
  informationScore: number;
};
```

Display rejected items and reasons in the interface. What the system refuses to index affects quality as much as what it includes, and operators need to be able to account for both.

## 9. Store text, vectors, metadata, and permissions together

A simplified PostgreSQL table is enough:

```sql
CREATE TABLE knowledge_records (
  id              uuid PRIMARY KEY,
  source          text NOT NULL,
  source_id       text NOT NULL,
  source_url      text NOT NULL,
  source_type     text NOT NULL,
  title           text,
  content         text NOT NULL,
  project_id      text,
  updated_at      timestamptz NOT NULL,
  authority       real NOT NULL DEFAULT 0.5,
  metadata        jsonb NOT NULL DEFAULT '{}',
  acl             jsonb NOT NULL DEFAULT '{}',
  search_vector   tsvector GENERATED ALWAYS AS (
    setweight(to_tsvector('english', coalesce(title, '')), 'A') ||
    setweight(to_tsvector('english', content), 'B')
  ) STORED,
  embedding       vector(1536),
  UNIQUE (source, source_id)
);

CREATE INDEX knowledge_text_idx
  ON knowledge_records USING gin (search_vector);

CREATE INDEX knowledge_embedding_idx
  ON knowledge_records USING hnsw (embedding vector_cosine_ops);
```

The vector dimension depends on the embedding model you choose.

## 10. Retrieve with multiple signals

When a user asks:

```text
“Why did ERR_TOKEN_EXPIRED happen in the mobile login flow?”
```

Run both searches:

```text
Vector search                 Full-text search
-------------                 ----------------
authentication expiry        ERR_TOKEN_EXPIRED
mobile session lifecycle     exact source constant
login design                 related issue or stack trace
```

Apply hard filters before sending results to the model:

```text
user permissions
  → current project
  → requested source or time range
  → retrieval and ranking
```

Then combine vector and lexical rankings. Reciprocal Rank Fusion is simple and avoids comparing incompatible raw scores:

```text
RRF(document) = Σ 1 / (k + rank_in_each_result_list)
```

After fusion, adjust the small candidate set using:

```text
scope relevance
authority
freshness
resolved or superseded state
```

Newer is not automatically better. A recent guess in chat may be less authoritative than a maintained runbook or resolved incident.

## 11. Make retrieval visible

The central inspection screen should expose the retrieval pipeline:

```text
Question
   ↓
┌──────────────────────┬──────────────────────┐
│ Vector results       │ Full-text results    │
│ scores and excerpts  │ scores and matches   │
└──────────────────────┴──────────────────────┘
   ↓
Metadata and ACL filters
   ↓
Rank fusion and authority/freshness adjustments
   ↓
Final evidence sent to the model
```

For each result, show:

- why it matched;
- its source and date;
- its project and authority;
- whether it survived filtering;
- its final rank;
- the excerpt ultimately sent to the model.

This retrieval inspector is more valuable than a polished chat interface alone because it makes answer quality diagnosable.

## 12. Give the model evidence, not database access

Normalize the final results into a small evidence set:

```ts
type Evidence = {
  evidenceId: string;       // E1, E2, E3
  title: string;
  excerpt: string;
  source: string;
  sourceUrl: string;
  updatedAt: string;
  retrievalReasons: string[];
  permissionChecked: true;
};
```

The model receives the question plus these records:

```text
- Cite factual claims with [E1], [E2], etc.
- Do not claim more than the evidence supports.
- Describe conflicts between sources.
- Distinguish evidence from inference.
- If evidence is insufficient, say what is missing.
- Never invent a source or resolution.
```

The final interface should show the answer beside its evidence and link citations to the original source.

Validate that every citation exists and supports the nearby claim. A source link is not useful if it does not actually prove what the answer says.

## 13. Keep access control in the architecture

Full external identity integration is deferred, but authorization behavior cannot be omitted. Begin with two users or groups with different access:

```text
Alice can access: public + payments project
Bob can access:   public + mobile project
```

Ask the same question as both users and show different authorized evidence.

The important rule is:

```text
filter unauthorized records before model context is constructed
```

Never retrieve globally, show the content to the model, and hide the citation afterward. At that point the protected information has already crossed the access boundary.

## 14. Support one complete incremental update

For the MVP, a **Synchronize now** button is enough:

```text
operator edits a Markdown source
        ↓
connector reads current source state
        ↓
compare stable ID and checksum
        ↓
replace affected chunks
        ↓
regenerate affected embeddings
        ↓
repeat the question and inspect the new answer
```

This proves that the index is derived and rebuildable.

Explain the production version without implementing all of it:

```text
initial full backfill
        +
webhooks or events for fast updates
        +
cursor-based polling for missed changes
        +
periodic reconciliation and ACL repair
```

Synchronization must be idempotent and handle deletions explicitly. Direct synchronous processing is acceptable for the initial operating scope if every stage remains visible and failures are reported honestly.

## 15. Where tools, APIs, and MCP fit

The retrieval service can be exposed as a normal function:

```ts
searchKnowledge({ question, userId, projectId })
```

The complete boundary is:

```text
UI or AI client
      ↓
application function / internal API / optional MCP server
      ↓
permission-aware retrieval service
      ↓
central knowledge index
```

MCP is optional. It is a standardized way for multiple AI clients to call retrieval tools; it is not the database or knowledge pipeline. For one application, an ordinary internal function or API is simpler. Add MCP when the same knowledge tools need to serve several independent assistants or another genuine service boundary appears.

## 16. Show where domain expertise enters

The value of the system does not come only from the embedding model. Domain experts shape:

```ts
type DomainKnowledgeConfig = {
  normalizationRules: NormalizationRule[];
  authorityRules: AuthorityRule[];
  metadataSchema: MetadataDefinition[];
  retrievalPolicies: RetrievalPolicy[];
  evaluationQuestions: EvaluationCase[];
};
```

A software team might decide:

```text
merged code > proposed code
resolved incident > live incident speculation
current runbook > old Slack answer
exact identifiers require lexical search
```

A healthcare organization might decide:

```text
approved clinical guideline > internal discussion
current policy version > superseded policy
patient-specific information requires restricted access
```

This is the adoption story for domain experts: they do not need to train a new model. They define useful knowledge units, authority, metadata, access boundaries, and representative evaluation questions.

## 17. Build four inspectable screens

### Source explorer

Display:

```text
original source
normalized representation
generated chunks
metadata and authority
index or rejection decision
```

### Retrieval inspector

Display vector and lexical results, applied filters, fusion, adjustments, and final evidence.

### Answer view

Display the grounded answer, citations, original source links, conflicts, and insufficient-evidence warnings.

### Synchronization view

Display source version, checksum, last indexed time, affected records, and a manual synchronization action.

These four screens make the invisible system understandable.

## 18. Suggested implementation sequence

### Phase 1: Evidence search

1. Load Markdown documents.
2. Split them by headings.
3. Store content, metadata, full-text fields, and embeddings.
4. Display vector and lexical search results separately.
5. Fuse their rankings.
6. Show the final evidence without generating an answer.

### Phase 2: Contrasting sources

1. Add Slack JSON with thread normalization.
2. Add local Git parsing by symbol or function.
3. Add selective-indexing rules.
4. Add authority, freshness, and project metadata.

### Phase 3: Grounded answers

1. Convert results to evidence records.
2. Generate an answer from only that evidence.
3. Add inline citations and original-source views.
4. Add conflict and insufficient-evidence behavior.

### Phase 4: Trust and change

1. Simulate two users with different permissions.
2. Add the complete synchronization flow.
3. Create a small evaluation set.
4. Add traces showing every retrieval stage.

Stop there for the focused MVP and evaluate it before expanding the operating surface.

## 19. Evaluate with real questions

Create 20–50 questions that exercise different behaviors:

```ts
type EvaluationCase = {
  question: string;
  userId: string;
  projectId?: string;
  expectedRecordIds: string[];
  forbiddenRecordIds?: string[];
  expectedAnswerPoints: string[];
  mustAbstain?: boolean;
};
```

Include:

- natural-language concepts;
- exact error codes and function names;
- ambiguous terms used by multiple projects;
- outdated documents;
- conflicting sources;
- inaccessible evidence;
- questions with no answer.

Measure whether the correct evidence appears before judging the prose quality. A fluent answer can hide weak retrieval.

Useful MVP metrics include:

- recall of expected evidence;
- precision of the final evidence set;
- citation correctness;
- permission leakage;
- correct abstention;
- update visibility after synchronization;
- latency by retrieval stage.

## 20. What to explain but not build yet

The MVP should mention these production concerns without implementing their full complexity:

```text
live OAuth connectors
durable queues and retry workers
webhook verification
cursor-based polling
large-scale search clusters
complex external identity mapping
automatic permission reconciliation
advanced LLM query planners
cross-encoder reranking
multi-region deployment
```

Add them only when a concrete use case proves the need.

## 21. MVP checklist

### Sources and processing

- [ ] Slack JSON becomes questions, summaries, and resolutions.
- [ ] Code is chunked by meaningful structure.
- [ ] Markdown is chunked by heading hierarchy.
- [ ] Original sources and normalized records can be compared.
- [ ] Low-value content can be rejected with a visible reason.

### Retrieval

- [ ] Vector and full-text results are displayed separately.
- [ ] Metadata and simulated ACL filters run before generation.
- [ ] Rank fusion produces a final evidence list.
- [ ] Freshness, authority, and resolution state are visible.

### Answering

- [ ] The model receives only normalized evidence records.
- [ ] Important claims contain citations.
- [ ] Citations open the original evidence.
- [ ] Conflicts and insufficient evidence are surfaced.

### Product inspectability

- [ ] Users and operators can inspect every consequential pipeline stage.
- [ ] One source edit changes the derived index and answer.
- [ ] Two users verify different access boundaries.
- [ ] Domain rules can be changed without replacing the system.
- [ ] A representative evaluation set reports measurable quality.

## 22. The main lesson

The product opportunity is not another opaque chatbot interface. It is delivering trustworthy organizational answers while revealing how they are constructed:

```text
keep knowledge in its native systems
  → understand each source
  → create meaningful searchable records
  → combine semantic and exact retrieval
  → apply domain, scope, freshness, and permission rules
  → give the model a small evidence set
  → require citations and honest uncertainty
```

Embeddings are useful, but the system’s quality comes from information design, domain judgment, retrieval engineering, and verifiable evidence.

Build the smallest version that makes those ideas visible. Once people can see and understand the pipeline, they can adapt it to their own domain and decide which production capabilities they actually need.

## Further reading

- [Cerebras: How We Built Our Knowledge Base](https://www.cerebras.ai/blog/how-we-built-our-knowledge-base)
- [PostgreSQL full-text search](https://www.postgresql.org/docs/current/textsearch.html)
- [pgvector](https://github.com/pgvector/pgvector)
- [OpenSearch hybrid search](https://docs.opensearch.org/latest/vector-search/ai-search/hybrid-search/)
- [Qdrant hybrid and multi-stage queries](https://qdrant.tech/documentation/search/hybrid-queries/)
- [Reciprocal Rank Fusion](https://plg.uwaterloo.ca/~gvcormac/cormacksigir09-rrf.pdf)
