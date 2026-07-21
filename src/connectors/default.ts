import { MarkdownProcessor } from "../markdown.js";
import { SlackThreadProcessor } from "../slack.js";
import { CanonicalArtifactProcessor } from "./canonical-processor.js";
import { HttpConnectorProvider } from "./http-provider.js";
import { LocalMarkdownConnector } from "./markdown-local.js";
import { ConnectorRegistry } from "./registry.js";
import { SlackExportConnector } from "./slack-export.js";

export function createDefaultConnectorRegistry(fixtureDir: string): ConnectorRegistry {
  const registry = new ConnectorRegistry()
    .register({ connector: new LocalMarkdownConnector(fixtureDir), processor: new MarkdownProcessor() })
    .register({ connector: new SlackExportConnector(fixtureDir), processor: new SlackThreadProcessor() });
  for (const artifactKind of ["document", "conversation", "business-record", "event"] as const) {
    registry.register({
      connector: new HttpConnectorProvider({
        connectorId: `${artifactKind}-http`,
        sourceFamily: artifactKind,
        artifactKinds: [artifactKind],
      }),
      processor: new CanonicalArtifactProcessor(artifactKind),
    });
  }
  return registry;
}
