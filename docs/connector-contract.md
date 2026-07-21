# Primer connector contract

**Status:** `primer.connector.v1` is implemented and covered by local plus simulated-HTTP conformance tests. No live vendor connector is included.

## Purpose and boundary

The connector contract lets independently developed acquisition services deliver organizational material without adding vendor APIs or credentials to Primer. The external service owns its upstream system. Primer owns the trustworthy evidence pipeline after acquisition.

Connectors may represent email, CRM, HRM, Slack, Teams, document stores, or future systems, but the wire contract uses semantic artifact kinds rather than vendor names:

- `document`
- `conversation`
- `business-record`
- `event`

Local Markdown and Slack export connectors use the same in-process provider interface. The default registry also exposes `document-http`, `conversation-http`, `business-record-http`, and `event-http` providers for future services.

## Registration

A registration stores:

```ts
type ConnectorLocator =
  | { type: "local-path"; value: string }
  | { type: "http"; value: string };

type SourceRegistration = {
  connectorId: string;
  locator: ConnectorLocator;
  config: Record<string, unknown>;
  checkpointCursor?: string;
};
```

HTTP `config` is sent to the connector and should contain stable scope identifiers, not upstream credentials. The independently deployed connector owns those credentials. The legacy `path` response field remains for local CLI and web compatibility.

The API accepts either the existing local form:

```json
{
  "connectorId": "markdown-local",
  "path": "/absolute/path/to/markdown"
}
```

or an external-ready form:

```json
{
  "connectorId": "business-record-http",
  "locator": {
    "type": "http",
    "value": "http://connector.internal/connector/v1/pull"
  },
  "config": {
    "tenantId": "acme",
    "scope": "clientcore"
  }
}
```

## Pull request

Primer sends `POST` with JSON:

```json
{
  "schemaVersion": "primer.connector.v1",
  "connectorId": "business-record-http",
  "config": { "tenantId": "acme" },
  "checkpointCursor": "last-committed-checkpoint",
  "pageCursor": "transient-next-page"
}
```

`pageCursor` is used only while acquiring one synchronization run. `checkpointCursor` is the last fully committed connector position and is not advanced on acquisition or processing failure.

## Pull response

```ts
type ConnectorPage = {
  schemaVersion: "primer.connector.v1";
  connectorId: string;
  sourceFamily: string;
  mode: "snapshot" | "incremental";
  items: ConnectorItem[];
  tombstones: ConnectorTombstone[];
  nextPageCursor?: string;
  checkpointCursor?: string;
};
```

Each item includes stable `externalId`, `revision`, `sourceRef`, `artifactKind`, raw content, extension metadata, and canonical fields needed for a permission-aware record: title, timestamps, authors, optional project, access descriptor, authority, and optional resolution state.

Snapshot mode is a complete listing: after every page succeeds, Primer removes previously managed sources that were not observed. Incremental mode changes only delivered items and explicit tombstones. A tombstone identifies the deleted item by the connector's `externalId`; Primer maps that identity to its own canonical source.

## Health

HTTP providers resolve `./health` relative to the pull URL unless registration config supplies `healthUrl`. The health response uses `primer.connector.v1`, the configured connector ID, status (`available`, `degraded`, or `unavailable`), timestamp, and optional message. Local providers report in-process availability. Operators can use:

```bash
npm run dev:offline -- sources health <registration-id>
```

or `GET /api/sources/registrations/:id/health`.

## Conformance requirements

An external connector is acceptable only when the shared suite proves:

- initial paginated backfill and unchanged idempotency;
- stable external identity with content and ACL-only updates;
- snapshot deletion and incremental tombstones;
- checkpoint forwarding and no checkpoint advancement after failure;
- duplicate-delivery rejection;
- contract, family, artifact-kind, and page-identity validation;
- repeated-page-cursor protection;
- failure visibility without partial deletion; and
- equivalent canonical records and retrieval behavior for equivalent local and HTTP input.

The contract is acquisition-only. A future native exploration or MCP capability requires a separate versioned contract and must still pass Primer authorization, provenance, evidence, and trace boundaries.
