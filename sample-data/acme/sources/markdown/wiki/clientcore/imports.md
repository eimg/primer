---
source_id: md-cc-imports
title: ClientCore CSV imports
project_id: clientcore
owner: ClientCore Engineering
status: maintained
updated_at: 2026-05-07T14:30:00Z
authority: 0.92
access:
  visibility: group
  allowed_group_ids: [g-clientcore, g-support]
---

# ClientCore CSV imports

## Account owner mapping

The `owner_email` column is optional.

- If the column is absent or the value is blank, the importing user becomes the owner.
- If a value is supplied, it must match an active ClientCore user in the tenant.
- A supplied value that does not match an active user fails that row with `CC_IMPORT_017`.

The importer must not silently fall back when an explicit email is wrong. That would conceal data-quality problems.

## Activity identity

Imported activities use `(tenant_id, source_event_id)` as their deduplication key. Timestamp-only deduplication was rejected because two legitimate calls may occur at the same time.

