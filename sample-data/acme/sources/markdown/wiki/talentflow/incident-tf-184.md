---
source_id: md-tf-incident-184
title: TF-184 Duplicate interview reminders
project_id: talentflow
owner: TalentFlow Engineering
status: resolved
updated_at: 2026-04-24T17:30:00Z
authority: 0.97
access:
  visibility: group
  allowed_group_ids: [g-talentflow, g-support, g-engineering]
---

# TF-184: Duplicate interview reminders

## Impact

Between 2026-04-20 and 2026-04-22, 37 interview reminders were delivered twice after transient mail-gateway failures. No interview records were duplicated.

## Root cause

`retryNotification` retried the gateway request without forwarding the notification's stable idempotency key. The gateway therefore treated the retry as a new send.

The queue visibility timeout was investigated and ruled out. TalentFlow notification jobs use a 90-second visibility timeout, and affected jobs completed within that window.

## Resolution

TF-184 forwards `notification.id` as `idempotencyKey` on the first attempt and every retry. A regression test asserts that the same key is preserved after a transient failure.

