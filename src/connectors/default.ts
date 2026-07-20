import { MarkdownProcessor } from "../markdown.js";
import { SlackThreadProcessor } from "../slack.js";
import { LocalMarkdownConnector } from "./markdown-local.js";
import { ConnectorRegistry } from "./registry.js";
import { SlackExportConnector } from "./slack-export.js";

export function createDefaultConnectorRegistry(fixtureDir: string): ConnectorRegistry {
  return new ConnectorRegistry()
    .register({ connector: new LocalMarkdownConnector(fixtureDir), processor: new MarkdownProcessor() })
    .register({ connector: new SlackExportConnector(fixtureDir), processor: new SlackThreadProcessor() });
}
