import type { ProcessedSource, SourceFamily } from "../types.js";

export interface ConnectorItem {
  connectorId: string;
  sourceFamily: SourceFamily;
  sourceRef: string;
  rawContent: string;
  metadata: Record<string, unknown>;
}

export interface SourceConnector {
  readonly id: string;
  readonly sourceFamily: SourceFamily;
  supports(path: string): boolean;
  read(path?: string): Promise<ConnectorItem[]>;
}

export interface SourceProcessor {
  readonly sourceFamily: SourceFamily;
  readonly version: string;
  process(item: ConnectorItem): Promise<ProcessedSource[]>;
}

export interface ConnectorRegistration {
  connector: SourceConnector;
  processor: SourceProcessor;
}
