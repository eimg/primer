import { checksum } from "../utils.js";
import { POLICY_VERSION, type IndexDecision, type KnowledgeRecord, type ProcessedSource, type SourceObject } from "../types.js";
import type { ConnectorArtifactKind, ConnectorItem, SourceProcessor } from "./contracts.js";

export class CanonicalArtifactProcessor implements SourceProcessor {
  readonly version = "canonical-artifact-v1";

  constructor(
    readonly sourceFamily: ConnectorArtifactKind,
  ) {}

  async process(item: ConnectorItem): Promise<ProcessedSource[]> {
    if (item.artifactKind !== this.sourceFamily) {
      throw new Error(`Canonical ${this.sourceFamily} processor cannot process ${item.artifactKind}.`);
    }
    const canonical = item.canonical;
    if (!canonical) throw new Error(`External artifact ${item.externalId} has no canonical metadata.`);
    if (typeof canonical.title !== "string" || !canonical.title || typeof canonical.createdAt !== "string" ||
      !canonical.createdAt || typeof canonical.updatedAt !== "string" || !canonical.updatedAt ||
      !Array.isArray(canonical.authors) || canonical.authors.length === 0 ||
      canonical.authors.some((author) => typeof author !== "string" || !author)) {
      throw new Error(`External artifact ${item.externalId} has incomplete canonical identity.`);
    }
    if (!canonical.access || !["public", "group", "restricted"].includes(canonical.access.visibility) ||
      !Array.isArray(canonical.access.allowedGroupIds) || !Array.isArray(canonical.access.allowedUserIds)) {
      throw new Error(`External artifact ${item.externalId} has invalid access metadata.`);
    }
    if (!Number.isFinite(canonical.authority) || canonical.authority < 0 || canonical.authority > 1) {
      throw new Error(`External artifact ${item.externalId} has invalid authority.`);
    }
    const identity = `${item.connectorId}\0${item.externalId}`;
    const sourceId = `ext_${checksum(identity).slice(0, 24)}`;
    const sourceVersion = checksum(JSON.stringify({
      revision: item.revision,
      canonical,
      rawContent: item.rawContent,
      metadata: item.metadata,
    }));
    const metadata = {
      ...item.metadata,
      connectorId: item.connectorId,
      externalId: item.externalId,
      artifactKind: item.artifactKind,
      revision: item.revision,
      processorVersion: this.version,
    };
    const source: SourceObject = {
      source: this.sourceFamily,
      sourceId,
      sourceRef: item.sourceRef,
      sourceType: item.artifactKind,
      rawContent: item.rawContent,
      createdAt: canonical.createdAt,
      updatedAt: canonical.updatedAt,
      authors: canonical.authors,
      ...(canonical.projectId ? { projectId: canonical.projectId } : {}),
      metadata,
      access: canonical.access,
    };
    const recordId = `${sourceId}:root`;
    const record: KnowledgeRecord = {
      id: recordId,
      source: this.sourceFamily,
      sourceId,
      sourceRef: item.sourceRef,
      sourceVersion,
      title: canonical.title,
      content: item.rawContent,
      contentChecksum: checksum(item.rawContent),
      ...(canonical.projectId ? { projectId: canonical.projectId } : {}),
      updatedAt: canonical.updatedAt,
      authority: canonical.authority,
      ...(canonical.resolutionState ? { resolutionState: canonical.resolutionState } : {}),
      metadata,
      access: canonical.access,
    };
    const decision: IndexDecision = {
      sourceId,
      recordId,
      decision: "accepted",
      reason: `canonical ${item.artifactKind} passed index policy`,
      policyVersion: POLICY_VERSION,
    };
    return [{ source, sourceVersion, records: [record], decisions: [decision] }];
  }
}
