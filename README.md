# Primer

Primer is an inspectable knowledge system for turning organizational sources into trustworthy evidence and cited answers.

Primer turns source material into authorized, ranked evidence and uses that evidence to produce cited answers. Its primary product is not a chat box. It is a trustworthy answer system with transparent decisions between ingestion and generation.

Primer includes a working CLI, HTTP API, and React application backed by the same SQLite, retrieval, authorization, answer, trace, synchronization, and evaluation services. Grounded answers use one bounded structured planning call, run each validated query through Primer-owned permission-aware hybrid retrieval, fuse the authorized results, and then generate and validate the cited answer. This is an explicit workflow, not an agent/tool loop. The included Acme fixture makes the complete system locally testable without connecting real organizational sources.

## Web application

[![Primer grounded chat with cited evidence and account-aware access](https://i.imgur.com/vfaKbXB.jpg)](https://imgur.com/a/tsSkoJO)

### Get started

Run the complete web application with deterministic local models:

```bash
npm install
npm run dev:offline:serve
```

Open [http://127.0.0.1:8317](http://127.0.0.1:8317), then:

1. Choose an Acme account.
2. Open **Content**, register `sample-data/acme/sources/markdown` with `markdown-local`, and synchronize it.
3. Register `sample-data/acme/sources/slack` with `slack-export`, and synchronize it.
4. Open **Chat** and try “What does CC_IMPORT_017 mean?”
5. Open its citations or use **Inspect** to review the query plan, retrieval candidates, ranking, timing, and final authorized evidence.

Offline mode is deterministic and requires no provider credentials. To use OpenRouter, copy `.env.example` to `.env`, set `OPENROUTER_API_KEY`, `PRIMER_EMBEDDING_MODEL`, and `PRIMER_CHAT_MODEL`, then run `npm run dev` instead. Content synchronized in live mode is embedded with the configured OpenRouter model.

## Read first

- [`modern-knowledge-base.md`](./modern-knowledge-base.md) — original concept paper and source material.
- [`docs/vision.md`](./docs/vision.md) — product purpose, principles, audience, and long-term direction.
- [`docs/product-spec.md`](./docs/product-spec.md) — MVP behavior, scope, user journeys, and acceptance criteria.
- [`docs/architecture.md`](./docs/architecture.md) — conceptual components, ownership boundaries, and data flow.
- [`docs/connector-contract.md`](./docs/connector-contract.md) — implemented external connector protocol and conformance rules.
- [`docs/manual-live-testing.md`](./docs/manual-live-testing.md) — readiness, live-model, browser, API, backup, and review procedure.
- [`docs/evaluation.md`](./docs/evaluation.md) — how retrieval, citations, permissions, and updates will be judged.
- [`docs/plan.md`](./docs/plan.md) — decision gates and staged delivery plan.
- [`docs/decisions.md`](./docs/decisions.md) — settled decisions, resolved questions, and the process for later changes.

## Implementation overview

The concept, initial dataset, evaluation cases, and implementation direction are defined. The baseline is a TypeScript application with a local SQLite-derived index and OpenRouter as the model provider. Embeddings use the official OpenRouter TypeScript SDK; grounded answers use Vercel AI SDK with the OpenRouter provider.

The CLI supports content ingestion and inspection, identity-aware retrieval, evaluation, cited answers, synchronization, removal, and machine-readable traces. The HTTP API exposes the same application services to the React account, content, chat, and inspection surfaces. Browser code consumes only the API and has no SQLite or provider-credential access.

See [`docs/plan.md`](./docs/plan.md) for the delivery gates and [`docs/decisions.md`](./docs/decisions.md) for the settled implementation choices.

## Current CLI

The CLI currently supports:

- fixture validation and local SQLite initialization;
- fixture identity listing and inspection;
- independently registered local Markdown and Slack export connectors plus external-ready semantic HTTP providers;
- persisted content registrations with stable IDs, typed locators, connector configuration, health, and checkpoints;
- explicit synchronization with indexed, replaced, unchanged, removed, failed, and interrupted outcomes;
- preserved synchronization history, stage timing, processor/policy/model versions, and explicit derived-content removal;
- heading-aware Markdown records and thread-aware Slack records with stable checksums and IDs;
- visible accepted and rejected index decisions;
- separate SQLite FTS and embedding retrieval stages;
- reciprocal-rank fusion, bounded evidence, saved and listable traces, and project/identity filtering;
- bounded authority, freshness, and resolution adjustments with reason ledgers;
- versioned authorized context packs with constraints, conflicts, and explicitly unverified code leads;
- grounded answers, deterministic citation validation, and pre-generation abstention;
- one bounded citation-repair attempt when generated output fails deterministic validation;
- separate persisted retrieval and answer evaluations with expected-point coverage, permission checks, usage, and timing;
- Markdown-plus-Slack retrieval and permission evaluation; and
- inspectable safe configuration without credential exposure; and
- structured diagnostics, restorable non-overwriting SQLite backup, and deterministic/live readiness commands; and
- human-readable and stable JSON command and categorized error output.

Install and verify:

```bash
npm install
npm run verify
```

## Local API and web application

Run the deterministic server at [http://127.0.0.1:8317](http://127.0.0.1:8317):

```bash
npm run dev:offline:serve
```

`npm run dev` is the same thing with live provider configuration. Both run one process on one port: `primer serve` mounts Vite as middleware, so the browser gets HMR from `web/` and the server restarts on `src/` changes, with no build step in between. `npm start` runs the built server, which serves `dist/web` from that same process.

The web app defaults to a standalone fixture-identity chooser and local HttpOnly session. Set `PRIMER_AUTH_PROVIDER=acme-identity` to use the optional plain-HTTP Identity adapter for human cookies and bearer tokens. An authenticated Identity principal is mapped to one existing Primer actor; Identity permissions gate operations (`primer.ask` or `primer.manage`), while the actor's Primer groups continue to gate evidence. Chat never accepts a browser-supplied actor ID. The app also provides source registration and synchronization, streamed grounded chat, citation-linked evidence provenance, retrieval-stage inspection, and persisted evaluation reports.

The local Acme Identity seed includes accounts whose exact emails match the existing human fixture actors. On first authenticated use, Primer records the stable `(issuer, subject) → actor` mapping. Unmapped or ambiguous accounts fail closed for chat and actor-scoped traces. A principal with `primer.manage` may administer actors, sources, synchronization, and evaluation without a knowledge actor; even Identity admin's `*` never bypasses evidence ACLs. Primer remains independently runnable: the adapter defaults to `standalone`, imports no sibling package, and the CLI continues to accept an explicit fixture actor.

The API exposes health and safe configuration plus account, chat, registration, source, synchronization, trace, and evaluation operations. `POST /api/evaluations` can run retrieval or answer suites; the answer suite invokes the configured chat model in live mode.

Copy `.env.example` to `.env` and fill in the OpenRouter values for live commands. Every `primer` command loads `.env` when it is present, without overriding variables already set in the environment.

For a complete deterministic offline baseline, with isolated state under `.primer/offline`:

```bash
npm run baseline:offline
npm run baseline:answers:offline
```

For an interactive offline walkthrough:

```bash
npm run dev:offline -- init
npm run dev:offline -- config show
npm run dev:offline -- sources register sample-data/acme/sources/markdown --connector markdown-local
npm run dev:offline -- sources sync <registration-id>
npm run dev:offline -- sources registrations
npm run dev:offline -- sources health <registration-id>
npm run dev:offline -- syncs list
npm run dev:offline -- retrieve "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev:offline -- context "Why did TalentFlow send duplicate interview reminders?" --user u-owen --project talentflow
npm run dev:offline -- ask "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev:offline -- evaluate
npm run dev:offline -- evaluate answers
npm run dev:offline -- evaluations list
npm run dev:offline -- traces list
```

For the deterministic readiness gate:

```bash
npm run readiness:offline
```

Use `npm run readiness:live:retrieval` for the explicit live embedding gate and `npm run readiness:live` for the paid full retrieval-and-answer gate. See [`docs/manual-live-testing.md`](./docs/manual-live-testing.md) before running or interpreting live results.

For the live OpenRouter baseline:

```bash
npm run baseline:live
npm run baseline:answers:live
npm run dev:cli -- retrieve "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev:cli -- ask "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev:cli -- evaluate answers --case rf-eval-008 --case rf-eval-012
```

The baseline scripts retain `sources ingest` as a one-shot fixture convenience. Managed content should use `sources register` and `sources sync`, which can account for removals and preserve synchronization status and history. The live baseline sends accepted synthetic Markdown and Slack thread content to the configured OpenRouter embedding model and persists the returned vectors under `.primer/`. Re-running it with unchanged content, processor version, and embedding model reports sources as `unchanged` and does not re-embed them. Each retrieval still embeds its new query. Live `ask` first asks the configured chat model for at most four search variants, validates and bounds that plan, and safely falls back to the original question if planning fails. The same fixed actor and project scope govern every query; the model cannot select identity, permissions, filters, or evidence. A grounded generation call then receives only the final authorized evidence, constraints, conflicts, question, and answer rules. Deterministic providers retain the original single query for repeatable tests and offline regression baselines; they are not substitutes for recorded live baselines.

The content UI intentionally lists only local connectors for now. The API and application services can register `http` locators for the semantic `document-http`, `conversation-http`, `business-record-http`, and `event-http` providers. These are protocol surfaces for later independently deployed connectors, not live vendor integrations. See [`docs/connector-contract.md`](./docs/connector-contract.md).

`baseline:answers:live` is an explicit paid/network evaluation: it runs the eligible answer cases sequentially and persists the full report in SQLite. Use repeated `--case <id>` options with `evaluate answers` to rerun only selected cases. Use `evaluations list` and `evaluations show <run-id>` with the matching live or offline command to inspect prior runs. Expected-point coverage is a deterministic token-overlap signal; cases marked for semantic review still require human or separately controlled evaluation. A failed citation check triggers at most one additional generation request, and both attempts are included in usage and timing.

## Acme development testbed

Primer is one of seven related projects used to exercise an inspectable knowledge-to-development workflow. They remain separate products with separate responsibilities.

| Project | Role |
|---|---|
| **[Primer](https://github.com/eimg/primer)** | Knowledge product and fictional Acme evidence corpus; currently outside the Issues → Helix runtime loop. |
| **[Prelude](https://github.com/eimg/prelude)** | Project inception workspace; may query Primer over HTTP and exports bootstrap artifacts for Helix empty-workspace bootstrap. |
| **[Helix](https://github.com/eimg/helix)** | Agent workflow control plane that receives work and orchestrates changes. |
| **[Acme Issues](https://github.com/eimg/acme-issues)** | Local issue tracker and webhook harness that triggers Helix and receives callbacks. |
| **[Acme Projects](https://github.com/eimg/acme-projects)** | Feature-idea and collaboration board for existing Helix repos; can manually create non-triggering issues through Acme Issues. |
| **[Acme Todo](https://github.com/eimg/acme-todo)** | Disposable target application used for agent implementation and verification. |

Existing-repo exercise: Acme Issues sends a work item to Helix, and Helix works on Acme Todo. Acme Projects can submit a ready card as a thin, non-triggering implementation issue through Acme Issues, which remains the only companion that triggers Helix for that path. Automatic triggering and card lifecycle callbacks remain planned.

New-project path: Prelude drafts inception documents, may pull Primer evidence over HTTP, and exports bootstrap artifacts under its local data directory. Helix consumes those exports via `helix bootstrap` / Bootstrap UI (materialize shipped; specialist execution next). This does not make Primer part of the Issues → Helix runtime path.

The planned relationship is intentionally directional: Acme Issues may later become an authoritative Primer source, while Helix may later query Primer for bounded, authorized internal evidence. Primer will not directly edit Acme Issues or expose its database to Helix. These integrations are planned boundaries, not current behavior and not part of the first CLI or web phases.

## Restoring the code-context fixtures

The ClientCore and TalentFlow fixture repositories support later Pi simulation and Helix integration evaluation; Primer does not index their source-code bodies. A fresh clone can restore both nested read-only repositories with:

```bash
./scripts/restore-git-fixtures.sh
```

The script is idempotent and leaves an already-restored fixture repository unchanged.

## Working rule

The authoritative source remains the original system. Primer's index is derived, explainable, and rebuildable. An answer is only as trustworthy as the authorized evidence that can be inspected behind it.
