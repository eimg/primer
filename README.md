# Primer

Primer is an inspectable knowledge system for turning organizational sources into trustworthy evidence and cited answers.

Primer turns source material into authorized, ranked evidence and uses that evidence to produce cited answers. Its primary product is not a chat box. It is a trustworthy answer system with transparent decisions between ingestion and generation.

Primer is currently in the groundwork stage. No runtime or application stack has been selected or implemented yet.

## Read first

- [`modern-knowledge-base.md`](./modern-knowledge-base.md) — original concept paper and source material.
- [`docs/vision.md`](./docs/vision.md) — product purpose, principles, audience, and long-term direction.
- [`docs/product-spec.md`](./docs/product-spec.md) — MVP behavior, scope, user journeys, and acceptance criteria.
- [`docs/architecture.md`](./docs/architecture.md) — conceptual components, ownership boundaries, and data flow.
- [`docs/evaluation.md`](./docs/evaluation.md) — how retrieval, citations, permissions, and updates will be judged.
- [`docs/plan.md`](./docs/plan.md) — decision gates and staged delivery plan.
- [`docs/decisions.md`](./docs/decisions.md) — settled decisions and questions that remain open.

## Current status

The concept is defined and the initial planning documents exist. The next work is to resolve the open product and technical decisions in [`docs/decisions.md`](./docs/decisions.md), prepare representative sample data and evaluation cases, and only then choose an implementation stack.

## Acme development testbed

Primer is one of four related local projects used to exercise an inspectable knowledge-to-development workflow. They remain separate products with separate responsibilities.

| Project | Local path | Role |
|---|---|---|
| **Primer** | `~/Desktop/acme/primer` | Knowledge product and fictional Acme evidence corpus; not currently part of the runtime loop. |
| **Helix** | `~/Desktop/acme/helix` | Agent workflow control plane that receives work and orchestrates changes. |
| **Acme Issues** | `~/Desktop/acme/acme-issues` | Local issue tracker and webhook harness that triggers Helix and receives callbacks. |
| **Acme Todo** | `~/Desktop/acme/acme-todo` | Disposable target application used for agent implementation and verification. |

Typical development exercise: Acme Issues sends a work item to Helix, Helix works on Acme Todo, and Primer provides the separate knowledge/retrieval groundwork for the same fictional Acme context. Primer is not currently a runtime dependency of the other three projects.

## Restoring the Git fixtures

The ClientCore and TalentFlow sample sources include their synthetic commit histories as Git bundles. A fresh clone can restore both nested read-only repositories with:

```bash
./scripts/restore-git-fixtures.sh
```

The script is idempotent and leaves an already-restored fixture repository unchanged.

## Working rule

The authoritative source remains the original system. Primer's index is derived, explainable, and rebuildable. An answer is only as trustworthy as the authorized evidence that can be inspected behind it.
