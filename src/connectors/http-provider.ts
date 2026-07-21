import {
  CONNECTOR_CONTRACT_VERSION,
  type ConnectorArtifactKind,
  type ConnectorDescriptor,
  type ConnectorHealth,
  type ConnectorLocator,
  type ConnectorPage,
  type ConnectorProvider,
  type ConnectorPullRequest,
} from "./contracts.js";

type Fetch = typeof globalThis.fetch;

export class HttpConnectorProvider implements ConnectorProvider {
  readonly descriptor: ConnectorDescriptor;

  constructor(input: {
    connectorId: string;
    sourceFamily: string;
    artifactKinds: ConnectorArtifactKind[];
    fetch?: Fetch;
  }) {
    this.fetcher = input.fetch ?? globalThis.fetch;
    this.descriptor = {
      contractVersion: CONNECTOR_CONTRACT_VERSION,
      connectorId: input.connectorId,
      sourceFamily: input.sourceFamily,
      transport: "http",
      artifactKinds: input.artifactKinds,
      capabilities: { pagination: true, incrementalSync: true, tombstones: true, health: true },
    };
  }

  private readonly fetcher: Fetch;

  supports(locator: ConnectorLocator): boolean {
    if (locator.type !== "http") return false;
    try {
      const url = new URL(locator.value);
      return url.protocol === "http:" || url.protocol === "https:";
    } catch {
      return false;
    }
  }

  async pull(request: ConnectorPullRequest): Promise<ConnectorPage> {
    if (!this.supports(request.locator)) throw new Error(`Invalid HTTP connector locator: ${request.locator.value}`);
    const response = await this.fetcher(request.locator.value, {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json" },
      body: JSON.stringify({
        schemaVersion: CONNECTOR_CONTRACT_VERSION,
        connectorId: this.descriptor.connectorId,
        config: request.config,
        ...(request.checkpointCursor ? { checkpointCursor: request.checkpointCursor } : {}),
        ...(request.pageCursor ? { pageCursor: request.pageCursor } : {}),
      }),
    });
    if (!response.ok) {
      const detail = (await response.text()).trim();
      throw new Error(`HTTP connector ${this.descriptor.connectorId} returned ${response.status}${detail ? `: ${detail}` : ""}`);
    }
    return await response.json() as ConnectorPage;
  }

  async health(locator: ConnectorLocator, config: Record<string, unknown>): Promise<ConnectorHealth> {
    const healthUrl = typeof config.healthUrl === "string" ? config.healthUrl : new URL("./health", locator.value).toString();
    try {
      const response = await this.fetcher(healthUrl, { headers: { accept: "application/json" } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const health = await response.json() as ConnectorHealth;
      if (health.schemaVersion !== CONNECTOR_CONTRACT_VERSION || health.connectorId !== this.descriptor.connectorId) {
        throw new Error("incompatible health response");
      }
      return health;
    } catch (cause) {
      return {
        schemaVersion: CONNECTOR_CONTRACT_VERSION,
        connectorId: this.descriptor.connectorId,
        status: "unavailable",
        checkedAt: new Date().toISOString(),
        message: cause instanceof Error ? cause.message : String(cause),
      };
    }
  }
}
