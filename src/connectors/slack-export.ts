import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import { checksum } from "../utils.js";
import {
  CONNECTOR_CONTRACT_VERSION,
  type ConnectorItem,
  type ConnectorLocator,
  type ConnectorPage,
  type SourceConnector,
} from "./contracts.js";

interface SlackConversation {
  id: string;
  name: string;
  [key: string]: unknown;
}

async function readJson<T>(path: string): Promise<T> {
  return JSON.parse(await readFile(path, "utf8")) as T;
}

async function collectExportFiles(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) {
    if (!/^\d{4}-\d{2}-\d{2}\.json$/.test(basename(path))) {
      throw new Error(`Slack export connector expects a dated message file: ${path}`);
    }
    return [path];
  }
  const output: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) output.push(...(await collectExportFiles(child)));
    else if (entry.isFile() && /^\d{4}-\d{2}-\d{2}\.json$/.test(entry.name)) output.push(child);
  }
  return output.sort();
}

export class SlackExportConnector implements SourceConnector {
  readonly descriptor = {
    contractVersion: CONNECTOR_CONTRACT_VERSION,
    connectorId: "slack-export",
    sourceFamily: "slack",
    transport: "local",
    artifactKinds: ["conversation"],
    capabilities: { pagination: false, incrementalSync: false, tombstones: false, health: false },
  } as const;
  private readonly exportRoot: string;

  constructor(private readonly fixtureDir: string) {
    this.exportRoot = join(fixtureDir, "sources", "slack");
  }

  supports(locator: ConnectorLocator): boolean {
    if (locator.type !== "local-path") return false;
    if (!locator.value) return true;
    const normalized = resolve(locator.value).split(sep).join("/");
    return locator.value.endsWith(".json") || normalized.includes("/sources/slack");
  }

  async pull(request: { locator: ConnectorLocator }): Promise<ConnectorPage> {
    const [channels, groups, users, policy] = await Promise.all([
      readJson<SlackConversation[]>(join(this.exportRoot, "channels.json")),
      readJson<SlackConversation[]>(join(this.exportRoot, "groups.json")),
      readJson<unknown[]>(join(this.exportRoot, "users.json")),
      readJson<Record<string, unknown>>(join(this.exportRoot, "primer_metadata.json")),
    ]);
    const conversations = new Map([...channels, ...groups].map((conversation) => [conversation.name, conversation]));
    const files = await collectExportFiles(resolve(request.locator.value || this.exportRoot));
    const items: ConnectorItem[] = await Promise.all(files.map(async (file) => {
        const conversationName = basename(dirname(file));
        const conversation = conversations.get(conversationName);
        if (!conversation) throw new Error(`Slack export file belongs to unknown conversation: ${conversationName}`);
        const conversationPolicy = policy[conversation.id];
        if (!conversationPolicy || typeof conversationPolicy !== "object") {
          throw new Error(`Slack conversation ${conversation.id} has no Primer metadata mapping.`);
        }
        const rawContent = await readFile(file, "utf8");
        const sourceRef = relative(this.fixtureDir, file).split(sep).join("/");
        return {
          schemaVersion: CONNECTOR_CONTRACT_VERSION,
          connectorId: this.descriptor.connectorId,
          sourceFamily: this.descriptor.sourceFamily,
          artifactKind: "conversation",
          externalId: sourceRef,
          revision: checksum(rawContent),
          sourceRef,
          rawContent,
          metadata: { conversation, users, policy: conversationPolicy },
        };
      }));
    return {
      schemaVersion: CONNECTOR_CONTRACT_VERSION,
      connectorId: this.descriptor.connectorId,
      sourceFamily: this.descriptor.sourceFamily,
      mode: "snapshot",
      items,
      tombstones: [],
      checkpointCursor: checksum(items.map((item) => `${item.externalId}:${item.revision}`).join("\n")),
    };
  }

  async read(path?: string): Promise<ConnectorItem[]> {
    return (await this.pull({ locator: { type: "local-path", value: path ?? "" } })).items;
  }
}
