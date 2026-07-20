---
source_id: md-platform-mail-gateway
title: Shared mail gateway contract
project_id: platform
owner: Platform Engineering
status: maintained
updated_at: 2026-04-23T09:30:00Z
authority: 0.93
access:
  visibility: group
  allowed_group_ids: [g-engineering, g-platform]
---

# Shared mail gateway contract

Every logical notification must provide a stable `idempotencyKey`. Clients must reuse the same key when retrying a failed request.

The gateway guarantees that successful requests with the same tenant and idempotency key produce at most one provider submission during the retention window.

The gateway cannot deduplicate retries that omit the key. A queue message ID is not an acceptable substitute because a re-enqueued notification may receive a new message ID.

