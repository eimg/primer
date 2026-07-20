# Acme retrieval evaluation

These cases are written before retrieval tuning. They target the frozen `acme-v0.1` backfill.

## Record identity convention

- Markdown section: `md:<source_id>#<heading-slug>`
- Slack thread: `slack:<conversation-id>:<root-ts>`
- Git symbol: `git:<repository>:<path>#<symbol>`

Processors may emit child records, but they must retain these stable source-derived identities or a deterministic mapping to them.

`expectedRecordIds` are useful evidence, not necessarily an exhaustive set. `forbiddenRecordIds` must not cross the authorization boundary. `distractorRecordIds` may be retrieved as pre-policy candidates but should not displace current authoritative evidence.

Email records are absent because email ingestion is deferred from the first retrieval slice.

