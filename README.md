# Primer

Primer is an inspectable knowledge system for turning organizational sources into trustworthy evidence and cited answers.

Primer turns source material into authorized, ranked evidence and uses that evidence to produce cited answers. Its primary product is not a chat box. It is a trustworthy answer system with transparent decisions between ingestion and generation.

Primer has completed its CLI milestone and Phase 5 local operations milestone. A working HTTP API and React interface now reuse the same SQLite, retrieval, authorization, trace, synchronization, and evaluation services as the CLI. The web application supports local identity/session selection, effective-group management, content registration, synchronization, and derived-index inspection. Phase 6 adds chat, trace, and evaluation presentation. Primer supplies organizational context; source-code exploration is delegated to Helix's Pi harness in real workflows.

## Read first

- [`modern-knowledge-base.md`](./modern-knowledge-base.md) — original concept paper and source material.
- [`docs/vision.md`](./docs/vision.md) — product purpose, principles, audience, and long-term direction.
- [`docs/product-spec.md`](./docs/product-spec.md) — MVP behavior, scope, user journeys, and acceptance criteria.
- [`docs/architecture.md`](./docs/architecture.md) — conceptual components, ownership boundaries, and data flow.
- [`docs/evaluation.md`](./docs/evaluation.md) — how retrieval, citations, permissions, and updates will be judged.
- [`docs/plan.md`](./docs/plan.md) — decision gates and staged delivery plan.
- [`docs/decisions.md`](./docs/decisions.md) — settled decisions, resolved questions, and the process for later changes.

## Delivery direction

The concept, initial dataset, evaluation cases, and implementation direction are defined. The baseline is a TypeScript application with a local SQLite-derived index and OpenRouter as the model provider. Embeddings use the official OpenRouter TypeScript SDK; grounded answers use Vercel AI SDK with the OpenRouter provider.

The completed CLI milestone supports content ingestion and inspection, identity-aware retrieval, evaluation, cited answers, synchronization, removal, and machine-readable traces. Phase 5 exposed those application services through an independently tested HTTP API before adding React account and content operations. Browser code consumes only the API and has no SQLite or provider-credential access.

See [`docs/plan.md`](./docs/plan.md) for the delivery gates and [`docs/decisions.md`](./docs/decisions.md) for the settled implementation choices.

## Current CLI

The CLI currently supports:

- fixture validation and local SQLite initialization;
- fixture identity listing and inspection;
- independently registered local Markdown and Slack export connectors;
- persisted content registrations with stable IDs;
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
- human-readable and stable JSON command and categorized error output.

Install and verify:

```bash
npm install
npm run verify
```

## Local API and web application

Run the deterministic integrated server at [http://127.0.0.1:4318](http://127.0.0.1:4318):

```bash
npm run build
npm run dev:api:offline
```

For live provider configuration, use `npm run dev:api`. During UI development, `npm run dev:full:offline` starts the API and Vite development server together. The production build serves `dist/web` from the same Node HTTP process as `/api`.

The current web milestone provides a local identity chooser, HttpOnly session cookie, effective-group editing, source registration, synchronization status/history, and indexed-source inspection. The API also exposes health and safe configuration plus account, registration, source, synchronization, trace, and evaluation list/detail operations. Chat and detailed trace/evaluation views are Phase 6 work.

Copy `.env.example` to `.env` and fill in the OpenRouter values for live commands. `npm run dev` loads `.env` automatically.

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
npm run dev:offline -- syncs list
npm run dev:offline -- retrieve "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev:offline -- context "Why did TalentFlow send duplicate interview reminders?" --user u-owen --project talentflow
npm run dev:offline -- ask "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev:offline -- evaluate
npm run dev:offline -- evaluate answers
npm run dev:offline -- evaluations list
npm run dev:offline -- traces list
```

For the live OpenRouter baseline:

```bash
npm run baseline:live
npm run baseline:answers:live
npm run dev -- retrieve "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev -- ask "What does CC_IMPORT_017 mean?" --user u-maya --project clientcore
npm run dev -- evaluate answers --case rf-eval-008 --case rf-eval-012
```

The baseline scripts retain `sources ingest` as a one-shot fixture convenience. Managed content should use `sources register` and `sources sync`, which can account for removals and preserve synchronization status and history. The live baseline sends accepted synthetic Markdown and Slack thread content to the configured OpenRouter embedding model and persists the returned vectors under `.primer/`. Re-running it with unchanged content, processor version, and embedding model reports sources as `unchanged` and does not re-embed them. Each retrieval still embeds its new query. `ask` sends only the final authorized evidence, constraints, conflicts, question, and answer rules to the configured chat model. Deterministic providers exist for repeatable tests and offline development; they are not substitutes for recorded live baselines.

`baseline:answers:live` is an explicit paid/network evaluation: it runs the eligible answer cases sequentially and persists the full report in SQLite. Use repeated `--case <id>` options with `evaluate answers` to rerun only selected cases. Use `evaluations list` and `evaluations show <run-id>` with the matching live or offline command to inspect prior runs. Expected-point coverage is a deterministic token-overlap signal; cases marked for semantic review still require human or separately controlled evaluation. A failed citation check triggers at most one additional generation request, and both attempts are included in usage and timing.

## Acme development testbed

Primer is one of four related projects used to exercise an inspectable knowledge-to-development workflow. They remain separate products with separate responsibilities.

| Project | Role |
|---|---|
| **[Primer](https://github.com/eimg/primer)** | Knowledge product and fictional Acme evidence corpus; currently separate from the runtime loop. |
| **[Helix](https://github.com/eimg/helix)** | Agent workflow control plane that receives work and orchestrates changes. |
| **[Acme Issues](https://github.com/eimg/acme-issues)** | Local issue tracker and webhook harness that triggers Helix and receives callbacks. |
| **[Acme Todo](https://github.com/eimg/acme-todo)** | Disposable target application used for agent implementation and verification. |

Current development exercise: Acme Issues sends a work item to Helix, and Helix works on Acme Todo. Primer remains separate while its core is built and evaluated.

The planned relationship is intentionally directional: Acme Issues may later become an authoritative Primer source, while Helix may later query Primer for bounded, authorized internal evidence. Primer will not directly edit Acme Issues or expose its database to Helix. These integrations are planned boundaries, not current behavior and not part of the first CLI or web phases.

## Restoring the code-context fixtures

The ClientCore and TalentFlow fixture repositories support later Pi simulation and Helix integration evaluation; Primer does not index their source-code bodies. A fresh clone can restore both nested read-only repositories with:

```bash
./scripts/restore-git-fixtures.sh
```

The script is idempotent and leaves an already-restored fixture repository unchanged.

## Working rule

The authoritative source remains the original system. Primer's index is derived, explainable, and rebuildable. An answer is only as trustworthy as the authorized evidence that can be inspected behind it.
