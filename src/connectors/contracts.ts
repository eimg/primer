import type { AccessDescriptor, KnowledgeRecord, ProcessedSource, SourceFamily } from "../types.js";

export const CONNECTOR_CONTRACT_VERSION = "primer.connector.v1" as const;

export type ConnectorArtifactKind = "document" | "conversation" | "business-record" | "event";
export type ConnectorTransport = "local" | "http";

export interface ConnectorLocator {
  type: "local-path" | "http";
  value: string;
}

export interface ConnectorCapabilities {
  pagination: boolean;
  incrementalSync: boolean;
  tombstones: boolean;
  health: boolean;
}

export interface ConnectorDescriptor {
  contractVersion: typeof CONNECTOR_CONTRACT_VERSION;
  connectorId: string;
  sourceFamily: SourceFamily;
  transport: ConnectorTransport;
  artifactKinds: readonly ConnectorArtifactKind[];
  capabilities: ConnectorCapabilities;
}

export interface ConnectorItem {
  schemaVersion: typeof CONNECTOR_CONTRACT_VERSION;
  connectorId: string;
  sourceFamily: SourceFamily;
  artifactKind: ConnectorArtifactKind;
  externalId: string;
  revision: string;
  sourceRef: string;
  rawContent: string;
  canonical?: {
    title: string;
    createdAt: string;
    updatedAt: string;
    authors: string[];
    projectId?: string;
    access: AccessDescriptor;
    authority: number;
    resolutionState?: KnowledgeRecord["resolutionState"];
  };
  metadata: Record<string, unknown>;
}

export interface ConnectorTombstone {
  externalId: string;
  sourceId?: string;
  deletedAt: string;
  sourceRef?: string;
}

export interface ConnectorPullRequest {
  locator: ConnectorLocator;
  config: Record<string, unknown>;
  checkpointCursor?: string;
  pageCursor?: string;
}

export interface ConnectorPage {
  schemaVersion: typeof CONNECTOR_CONTRACT_VERSION;
  connectorId: string;
  sourceFamily: SourceFamily;
  mode: "snapshot" | "incremental";
  items: ConnectorItem[];
  tombstones: ConnectorTombstone[];
  nextPageCursor?: string;
  checkpointCursor?: string;
}

export interface ConnectorHealth {
  schemaVersion: typeof CONNECTOR_CONTRACT_VERSION;
  connectorId: string;
  status: "available" | "degraded" | "unavailable";
  checkedAt: string;
  message?: string;
}

export interface ConnectorProvider {
  readonly descriptor: ConnectorDescriptor;
  supports(locator: ConnectorLocator): boolean;
  pull(request: ConnectorPullRequest): Promise<ConnectorPage>;
  health?(locator: ConnectorLocator, config: Record<string, unknown>): Promise<ConnectorHealth>;
}

// Compatibility name for the existing local connector classes.
export type SourceConnector = ConnectorProvider;

export interface SourceProcessor {
  readonly sourceFamily: SourceFamily;
  readonly version: string;
  process(item: ConnectorItem): Promise<ProcessedSource[]>;
}

export interface ConnectorRegistration {
  connector: ConnectorProvider;
  processor: SourceProcessor;
}
