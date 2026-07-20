# Acme initial-backfill dataset

**Status:** Synthetic groundwork fixture. It is not application code and it is not evidence about a real company.

Acme Software Services is a fictional medium-sized B2B software-services company. The fixture spans six weeks, from 2026-04-06 through 2026-05-17, and covers two products:

- **ClientCore (`CC`)** — a CRM for accounts, contacts, activities, deals, and imports.
- **TalentFlow (`TF`)** — a job portal for employers, candidates, applications, interviews, and notifications.

Both products use a small shared platform surface. Similar terms such as `account`, `status`, `profile`, `owner`, and `notification` intentionally mean different things across project scopes.

## Purpose

This corpus is designed for Primer's initial backfill and retrieval groundwork. It should support source-aware parsing, stable source identity, lexical and semantic retrieval, project scope, authorization filtering, authority/freshness adjustments, conflict visibility, and abstention.

The fixture does not yet test polling, webhooks, interval updates, reconciliation, or continuous synchronization. A later snapshot may be derived from this one, but the current corpus is frozen as `acme-v0.1`.

## Dataset map

```text
organization/          fictional people, groups, projects, and ACL conventions
ground-truth/          canonical claims and the six-week event ledger
sources/slack/         Slack-export-shaped JSON
sources/email/         RFC 5322-style email messages; collection only for now
sources/markdown/      wiki and runbook documents
sources/git/           two read-only knowledge repositories
evaluation/            retrieval cases with expected and forbidden evidence
manifest.json          fixture identity and source inventory
```

Each Git fixture carries its synthetic history in `.primer/history.bundle` so the history survives inside the outer Primer repository. From the Primer root, run `./scripts/restore-git-fixtures.sh` after a fresh clone to reconstruct the nested repositories before Git ingestion or history-sensitive evaluation.

## Authority model

The dataset deliberately contains disagreement. Canonical truth is not inferred from recency alone.

1. Current approved policy and maintained runbooks.
2. Merged code and tests for implemented behavior.
3. Resolved incident and decision records.
4. Resolved Slack threads and formal email decisions.
5. Unresolved discussion, proposals, and individual recollection.

`ground-truth/claims.json` is an evaluation oracle, not an ingestible source. Primer must never retrieve it as evidence.

## Initial ingest scope

The first Primer slice should ingest Markdown, Slack-like JSON, and Git. Email is included so the fictional history remains coherent and so a later source family has prepared data, but email ingestion is not required for the first retrieval slice.
