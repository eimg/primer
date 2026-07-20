---
source_id: md-platform-queue-onboarding-old
title: Queue worker onboarding notes
project_id: platform
owner: Platform Engineering
status: superseded
updated_at: 2026-02-10T09:00:00Z
authority: 0.35
superseded_by: md-tf-incident-184
access:
  visibility: group
  allowed_group_ids: [g-engineering]
---

# Queue worker onboarding notes

> This page is retained for historical reference and has not been verified against current product configuration.

All Acme queue consumers use a 60-second visibility timeout. If a message is delivered twice, increase the timeout before changing application code.

Product teams should confirm current configuration in their repository and maintained runbook.

