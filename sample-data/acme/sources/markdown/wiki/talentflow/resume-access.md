---
source_id: md-tf-resume-access
title: Candidate resume access policy
project_id: talentflow
owner: Security
status: approved
updated_at: 2026-04-27T15:45:00Z
authority: 1.0
access:
  visibility: group
  allowed_group_ids: [g-talentflow, g-security, g-support]
---

# Candidate resume access policy

Candidate resumes are private applicant material.

Authorized employer users receive a signed download URL that expires after **five minutes**. The URL must be scoped to one resume object and one employer tenant. It must not be cached in analytics events, application logs, or support comments.

The five-minute lifetime replaces the earlier fifteen-minute prototype setting.

