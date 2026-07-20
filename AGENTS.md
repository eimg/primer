# Primer agent guide

Primer is in a documentation and product-definition stage. Do not scaffold or implement the system unless the user explicitly moves the project into implementation.

This file is an entrypoint, not the full specification.

## Related projects

| Project | Local path | Responsibility |
|---|---|---|
| Primer | `~/Desktop/acme/primer` | Knowledge product and fictional Acme evidence corpus; not currently part of the runtime loop. |
| Helix | `~/Desktop/acme/helix` | Agent workflow control plane that receives work and orchestrates changes. |
| Acme Issues | `~/Desktop/acme/acme-issues` | Local issue tracker and webhook harness that triggers Helix and receives callbacks. |
| Acme Todo | `~/Desktop/acme/acme-todo` | Disposable target application used for agent implementation and verification. |

The current local runtime flow is Acme Issues → Helix → Acme Todo, followed by a Helix completion callback to Acme Issues. Primer shares the fictional Acme context but remains a separate knowledge-product and dataset effort.

## Read first

1. [`README.md`](./README.md) for project status and document routing.
2. [`modern-knowledge-base.md`](./modern-knowledge-base.md) for the original concept.
3. [`docs/vision.md`](./docs/vision.md) and [`docs/product-spec.md`](./docs/product-spec.md) before changing product scope.
4. [`docs/architecture.md`](./docs/architecture.md) before choosing infrastructure, models, connectors, data stores, or service boundaries.
5. [`docs/evaluation.md`](./docs/evaluation.md) before claiming a retrieval or answer-quality improvement.
6. [`docs/decisions.md`](./docs/decisions.md) before turning an assumption into a durable choice.

## Invariants

- Primer is a focused knowledge product whose first release proves a complete, trustworthy evidence pipeline before expanding its operational breadth.
- Original systems are authoritative; the search index is derived and rebuildable.
- Different source types retain source-aware processing and provenance.
- Authorization filtering happens before evidence reaches a model.
- Retrieval remains inspectable from candidates through final evidence.
- Generated claims must link to supporting evidence or state uncertainty.
- Exact search and semantic search are complementary; neither is treated as truth.
- Domain rules, source authority, freshness, and supersession remain explicit.
- MCP and live third-party integrations are optional boundaries, not MVP foundations.
- Product direction, planned work, and implemented behavior must be labeled separately.

## Change discipline

- Preserve `modern-knowledge-base.md` as the original concept unless explicitly asked to revise it.
- Record consequential choices and reversals in `docs/decisions.md`.
- Keep planning documents technology-neutral until the corresponding decision gate is resolved.
- Do not describe planned behavior as shipped behavior.
- Favor a small, inspectable vertical slice over breadth of connectors or infrastructure.
