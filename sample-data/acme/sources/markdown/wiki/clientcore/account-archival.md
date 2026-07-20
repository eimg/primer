---
source_id: md-cc-account-archival
title: ClientCore account archival
project_id: clientcore
owner: ClientCore Product
status: approved
updated_at: 2026-04-29T11:00:00Z
authority: 0.95
access:
  visibility: group
  allowed_group_ids: [g-clientcore, g-support, g-product]
---

# ClientCore account archival

Archival is reversible visibility control, not deletion.

## Search behavior

Archived accounts are excluded from default account search. Users with the archive filter may include them explicitly.

## Retained information

Contacts, activities, deals, ownership history, and audit events remain attached to the archived account. They must remain available to authorized users for audit and restoration.

## Prohibited behavior

Archival must not cascade-delete activities or rewrite historical ownership.

