---
source_id: md-cc-adr-activity-dedupe
title: ADR-014 Activity import idempotency
project_id: clientcore
owner: ClientCore Engineering
status: accepted
updated_at: 2026-04-16T16:00:00Z
authority: 0.94
access:
  visibility: group
  allowed_group_ids: [g-clientcore, g-engineering]
---

# ADR-014: Activity import idempotency

## Decision

ClientCore identifies an imported activity by the tuple `tenant_id` and `source_event_id`.

## Rejected alternative

We rejected deduplication by activity timestamp. Imports can legitimately contain two different calls at the same second, especially when a telephony vendor batches events.

## Consequence

Sources that cannot provide a stable event ID must provide a deterministic adapter-generated identifier. The identifier must remain stable when the same source file is backfilled again.

