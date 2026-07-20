import type { ProcessedSource } from "../types.js";
import type { ConnectorRegistration } from "./contracts.js";

export interface ProcessedConnectorSource {
  connectorId: string;
  processorVersion: string;
  processed: ProcessedSource;
}

export class ConnectorRegistry {
  private readonly registrations = new Map<string, ConnectorRegistration>();

  register(registration: ConnectorRegistration): this {
    const { connector, processor } = registration;
    if (connector.sourceFamily !== processor.sourceFamily) {
      throw new Error(
        `Connector ${connector.id} emits ${connector.sourceFamily}, but processor handles ${processor.sourceFamily}.`,
      );
    }
    if (this.registrations.has(connector.id)) throw new Error(`Duplicate connector ID: ${connector.id}`);
    this.registrations.set(connector.id, registration);
    return this;
  }

  list(): Array<{ connectorId: string; sourceFamily: string; processorVersion: string }> {
    return [...this.registrations.values()]
      .map(({ connector, processor }) => ({
        connectorId: connector.id,
        sourceFamily: connector.sourceFamily,
        processorVersion: processor.version,
      }))
      .sort((left, right) => left.connectorId.localeCompare(right.connectorId));
  }

  describe(connectorId: string): { connectorId: string; sourceFamily: string; processorVersion: string } {
    const registration = this.registrations.get(connectorId);
    if (!registration) throw new Error(`Unknown connector: ${connectorId}`);
    return {
      connectorId: registration.connector.id,
      sourceFamily: registration.connector.sourceFamily,
      processorVersion: registration.processor.version,
    };
  }

  assertSupports(connectorId: string, path: string): void {
    const registration = this.registrations.get(connectorId);
    if (!registration) throw new Error(`Unknown connector: ${connectorId}`);
    if (!registration.connector.supports(path)) {
      throw new Error(`Connector ${connectorId} does not support path: ${path}`);
    }
  }

  async process(input: { connectorId?: string; path?: string } = {}): Promise<ProcessedConnectorSource[]> {
    let registrations = [...this.registrations.values()];
    if (input.connectorId) {
      const registration = this.registrations.get(input.connectorId);
      if (!registration) throw new Error(`Unknown connector: ${input.connectorId}`);
      if (input.path && !registration.connector.supports(input.path)) {
        throw new Error(`Connector ${input.connectorId} does not support path: ${input.path}`);
      }
      registrations = [registration];
    } else if (input.path) {
      registrations = registrations.filter(({ connector }) => connector.supports(input.path!));
      if (registrations.length === 0) throw new Error(`No connector supports path: ${input.path}`);
      if (registrations.length > 1) {
        throw new Error(`Multiple connectors support ${input.path}; specify --connector explicitly.`);
      }
    }

    const output: ProcessedConnectorSource[] = [];
    for (const { connector, processor } of registrations) {
      for (const item of await connector.read(input.path)) {
        if (item.connectorId !== connector.id || item.sourceFamily !== connector.sourceFamily) {
          throw new Error(`Connector ${connector.id} emitted an item with inconsistent connector identity.`);
        }
        for (const processed of await processor.process(item)) {
          if (processed.source.source !== connector.sourceFamily) {
            throw new Error(`Processor ${processor.version} emitted unexpected family ${processed.source.source}.`);
          }
          output.push({ connectorId: connector.id, processorVersion: processor.version, processed });
        }
      }
    }
    return output;
  }
}
