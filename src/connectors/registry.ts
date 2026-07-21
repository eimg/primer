import type { ProcessedSource } from "../types.js";
import {
  CONNECTOR_CONTRACT_VERSION,
  type ConnectorDescriptor,
  type ConnectorItem,
  type ConnectorLocator,
  type ConnectorPage,
  type ConnectorRegistration,
  type ConnectorTombstone,
} from "./contracts.js";

export interface ProcessedConnectorSource {
  connectorId: string;
  externalId: string;
  processorVersion: string;
  processed: ProcessedSource;
}

export interface ConnectorAcquisition {
  descriptor: ConnectorDescriptor;
  mode: "snapshot" | "incremental";
  processed: ProcessedConnectorSource[];
  tombstones: ConnectorTombstone[];
  checkpointCursor?: string;
}

function assertPage(page: ConnectorPage, descriptor: ConnectorDescriptor): void {
  if (page.schemaVersion !== CONNECTOR_CONTRACT_VERSION) {
    throw new Error(`Connector ${descriptor.connectorId} returned unsupported contract ${String(page.schemaVersion)}.`);
  }
  if (page.connectorId !== descriptor.connectorId || page.sourceFamily !== descriptor.sourceFamily) {
    throw new Error(`Connector ${descriptor.connectorId} returned an inconsistent page identity.`);
  }
  if (page.mode !== "snapshot" && page.mode !== "incremental") {
    throw new Error(`Connector ${descriptor.connectorId} returned an unsupported synchronization mode.`);
  }
  if (!Array.isArray(page.items) || !Array.isArray(page.tombstones)) {
    throw new Error(`Connector ${descriptor.connectorId} returned a malformed page.`);
  }
  if (page.nextPageCursor !== undefined && typeof page.nextPageCursor !== "string") {
    throw new Error(`Connector ${descriptor.connectorId} returned an invalid page cursor.`);
  }
  if (page.checkpointCursor !== undefined && typeof page.checkpointCursor !== "string") {
    throw new Error(`Connector ${descriptor.connectorId} returned an invalid checkpoint cursor.`);
  }
  if (page.nextPageCursor === "") throw new Error(`Connector ${descriptor.connectorId} returned an empty page cursor.`);
  for (const tombstone of page.tombstones) {
    if (!tombstone || typeof tombstone.externalId !== "string" || !tombstone.externalId || typeof tombstone.deletedAt !== "string") {
      throw new Error(`Connector ${descriptor.connectorId} returned a malformed tombstone.`);
    }
  }
}

function assertItem(item: ConnectorItem, descriptor: ConnectorDescriptor): void {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    throw new Error(`Connector ${descriptor.connectorId} emitted a malformed item.`);
  }
  if (item.schemaVersion !== CONNECTOR_CONTRACT_VERSION) {
    throw new Error(`Connector ${descriptor.connectorId} emitted an unsupported item contract.`);
  }
  if (item.connectorId !== descriptor.connectorId || item.sourceFamily !== descriptor.sourceFamily) {
    throw new Error(`Connector ${descriptor.connectorId} emitted an item with inconsistent connector identity.`);
  }
  if (!descriptor.artifactKinds.includes(item.artifactKind)) {
    throw new Error(`Connector ${descriptor.connectorId} emitted unsupported artifact kind ${item.artifactKind}.`);
  }
  if (!item || typeof item.externalId !== "string" || typeof item.revision !== "string" ||
    typeof item.sourceRef !== "string" || typeof item.rawContent !== "string" ||
    !item.metadata || typeof item.metadata !== "object" || Array.isArray(item.metadata) ||
    !item.externalId || !item.revision || !item.sourceRef) {
    throw new Error(`Connector ${descriptor.connectorId} emitted an item without stable identity, revision, or provenance.`);
  }
}

export class ConnectorRegistry {
  private readonly registrations = new Map<string, ConnectorRegistration>();

  register(registration: ConnectorRegistration): this {
    const { connector, processor } = registration;
    const descriptor = connector.descriptor;
    if (descriptor.contractVersion !== CONNECTOR_CONTRACT_VERSION) {
      throw new Error(`Connector ${descriptor.connectorId} uses unsupported contract ${descriptor.contractVersion}.`);
    }
    if (descriptor.sourceFamily !== processor.sourceFamily) {
      throw new Error(
        `Connector ${descriptor.connectorId} emits ${descriptor.sourceFamily}, but processor handles ${processor.sourceFamily}.`,
      );
    }
    if (this.registrations.has(descriptor.connectorId)) {
      throw new Error(`Duplicate connector ID: ${descriptor.connectorId}`);
    }
    this.registrations.set(descriptor.connectorId, registration);
    return this;
  }

  list(): Array<ConnectorDescriptor & { processorVersion: string }> {
    return [...this.registrations.values()]
      .map(({ connector, processor }) => ({ ...connector.descriptor, processorVersion: processor.version }))
      .sort((left, right) => left.connectorId.localeCompare(right.connectorId));
  }

  describe(connectorId: string): ConnectorDescriptor & { processorVersion: string } {
    const registration = this.registrations.get(connectorId);
    if (!registration) throw new Error(`Unknown connector: ${connectorId}`);
    return { ...registration.connector.descriptor, processorVersion: registration.processor.version };
  }

  assertSupports(connectorId: string, locator: ConnectorLocator): void {
    const registration = this.registrations.get(connectorId);
    if (!registration) throw new Error(`Unknown connector: ${connectorId}`);
    if (!registration.connector.supports(locator)) {
      throw new Error(`Connector ${connectorId} does not support locator: ${locator.type}:${locator.value}`);
    }
  }

  async health(connectorId: string, locator: ConnectorLocator, config: Record<string, unknown> = {}) {
    const registration = this.registrations.get(connectorId);
    if (!registration) throw new Error(`Unknown connector: ${connectorId}`);
    this.assertSupports(connectorId, locator);
    if (registration.connector.health) return registration.connector.health(locator, config);
    return {
      schemaVersion: CONNECTOR_CONTRACT_VERSION,
      connectorId,
      status: "available" as const,
      checkedAt: new Date().toISOString(),
      message: "Connector is in-process and does not expose a separate health endpoint.",
    };
  }

  async acquire(input: {
    connectorId: string;
    locator: ConnectorLocator;
    config?: Record<string, unknown>;
    checkpointCursor?: string;
  }): Promise<ConnectorAcquisition> {
    const registration = this.registrations.get(input.connectorId);
    if (!registration) throw new Error(`Unknown connector: ${input.connectorId}`);
    const { connector, processor } = registration;
    const descriptor = connector.descriptor;
    this.assertSupports(input.connectorId, input.locator);

    const processed: ProcessedConnectorSource[] = [];
    const tombstones: ConnectorTombstone[] = [];
    const externalIds = new Set<string>();
    const pageCursors = new Set<string>();
    let pageCursor: string | undefined;
    let checkpointCursor: string | undefined;
    let mode: ConnectorPage["mode"] | undefined;

    do {
      const page = await connector.pull({
        locator: input.locator,
        config: input.config ?? {},
        ...(input.checkpointCursor ? { checkpointCursor: input.checkpointCursor } : {}),
        ...(pageCursor ? { pageCursor } : {}),
      });
      assertPage(page, descriptor);
      if (mode && page.mode !== mode) throw new Error(`Connector ${input.connectorId} changed mode during pagination.`);
      mode = page.mode;
      for (const item of page.items) {
        assertItem(item, descriptor);
        if (externalIds.has(item.externalId)) {
          throw new Error(`Connector ${input.connectorId} emitted duplicate external ID ${item.externalId}.`);
        }
        externalIds.add(item.externalId);
        for (const source of await processor.process(item)) {
          if (source.source.source !== descriptor.sourceFamily) {
            throw new Error(`Processor ${processor.version} emitted unexpected family ${source.source.source}.`);
          }
          processed.push({
            connectorId: descriptor.connectorId,
            externalId: item.externalId,
            processorVersion: processor.version,
            processed: source,
          });
        }
      }
      tombstones.push(...page.tombstones);
      checkpointCursor = page.checkpointCursor ?? checkpointCursor;
      pageCursor = page.nextPageCursor;
      if (pageCursor) {
        if (pageCursors.has(pageCursor)) throw new Error(`Connector ${input.connectorId} repeated page cursor ${pageCursor}.`);
        pageCursors.add(pageCursor);
      }
    } while (pageCursor);

    return {
      descriptor,
      mode: mode ?? "snapshot",
      processed,
      tombstones,
      ...(checkpointCursor ? { checkpointCursor } : {}),
    };
  }

  async process(input: { connectorId?: string; path?: string } = {}): Promise<ProcessedConnectorSource[]> {
    let registrations = [...this.registrations.values()];
    const locator = input.path ? ({ type: "local-path", value: input.path } as const) : undefined;
    if (input.connectorId) {
      const registration = this.registrations.get(input.connectorId);
      if (!registration) throw new Error(`Unknown connector: ${input.connectorId}`);
      registrations = [registration];
    } else if (locator) {
      registrations = registrations.filter(({ connector }) => connector.supports(locator));
      if (registrations.length === 0) throw new Error(`No connector supports path: ${input.path}`);
      if (registrations.length > 1) throw new Error(`Multiple connectors support ${input.path}; specify --connector explicitly.`);
    } else {
      const defaultLocator = { type: "local-path" as const, value: "" };
      registrations = registrations.filter(({ connector }) => connector.supports(defaultLocator));
    }

    const output: ProcessedConnectorSource[] = [];
    for (const { connector } of registrations) {
      const target = locator ?? {
        type: "local-path" as const,
        value: "",
      };
      const acquired = await this.acquire({ connectorId: connector.descriptor.connectorId, locator: target });
      output.push(...acquired.processed);
    }
    return output;
  }
}
