# Acme retrieval evaluation

These cases target the frozen `acme-v0.3` evaluation contract. Version 0.2 corrected the scoped answer expectation in `rf-eval-003`; version 0.3 narrows `rf-eval-008` to the deletion and audit behavior its question asks about. Both preserve the 0.1 source corpus.

## Record identity convention

- Markdown section: `md:<source_id>#<heading-slug>`
- Slack thread: `slack:<conversation-id>:<root-ts>`
- Deferred code-context reference: `git:<repository>:<path>#<symbol>`

Processors may emit child records, but they must retain stable source-derived identities or a deterministic mapping to them. Git references are not Primer records; they identify expected locations for a later Pi or Helix harness evaluation.

`expectedRecordIds` are useful Primer evidence, not necessarily an exhaustive set. `expectedCodeContextRefs` are non-indexed repository targets that the harness must verify against a pinned revision. `forbiddenRecordIds` must not cross the authorization boundary. `distractorRecordIds` may be retrieved as pre-policy candidates but should not displace current authoritative evidence.

Email records are absent because email ingestion is deferred from the first retrieval slice.
