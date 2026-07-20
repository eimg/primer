---
source_id: md-shared-terminology
title: Acme product terminology
project_id: platform
owner: Product Operations
status: maintained
updated_at: 2026-05-15T09:00:00Z
authority: 0.90
access:
  visibility: public
  allowed_group_ids: [g-all]
---

# Acme product terminology

Terms must be interpreted within a product scope. Do not assume the same database or lifecycle merely because two products use the same word.

## Account

In **ClientCore**, an account is a customer company. An account owns contacts, deals, and activities. Archiving the account removes it from default search but does not delete its audit history.

In **TalentFlow**, an employer account represents the employer login and tenant relationship. Suspending it blocks new job postings but does not automatically unpublish existing listings.

## Status

ClientCore has separate account, deal, and activity states. TalentFlow has employer, job, candidate, and application states. Always include the entity and project when asking about a status.

## Owner

ClientCore record ownership is an active internal user assignment. TalentFlow job ownership identifies the employer-side user responsible for a listing. The two owner identifiers are not interchangeable.

