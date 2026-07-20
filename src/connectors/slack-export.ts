import { readFile, readdir, stat } from "node:fs/promises";
import { basename, dirname, join, relative, resolve, sep } from "node:path";
import type { ConnectorItem, SourceConnector } from "./contracts.js";

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
  readonly id = "slack-export";
  readonly sourceFamily = "slack";
  private readonly exportRoot: string;

  constructor(private readonly fixtureDir: string) {
    this.exportRoot = join(fixtureDir, "sources", "slack");
  }

  supports(path: string): boolean {
    const normalized = resolve(path).split(sep).join("/");
    return path.endsWith(".json") || normalized.includes("/sources/slack");
  }

  async read(path?: string): Promise<ConnectorItem[]> {
    const [channels, groups, users, policy] = await Promise.all([
      readJson<SlackConversation[]>(join(this.exportRoot, "channels.json")),
      readJson<SlackConversation[]>(join(this.exportRoot, "groups.json")),
      readJson<unknown[]>(join(this.exportRoot, "users.json")),
      readJson<Record<string, unknown>>(join(this.exportRoot, "primer_metadata.json")),
    ]);
    const conversations = new Map([...channels, ...groups].map((conversation) => [conversation.name, conversation]));
    const files = await collectExportFiles(resolve(path ?? this.exportRoot));
    return Promise.all(
      files.map(async (file) => {
        const conversationName = basename(dirname(file));
        const conversation = conversations.get(conversationName);
        if (!conversation) throw new Error(`Slack export file belongs to unknown conversation: ${conversationName}`);
        const conversationPolicy = policy[conversation.id];
        if (!conversationPolicy || typeof conversationPolicy !== "object") {
          throw new Error(`Slack conversation ${conversation.id} has no Primer metadata mapping.`);
        }
        return {
          connectorId: this.id,
          sourceFamily: this.sourceFamily,
          sourceRef: relative(this.fixtureDir, file).split(sep).join("/"),
          rawContent: await readFile(file, "utf8"),
          metadata: { conversation, users, policy: conversationPolicy },
        };
      }),
    );
  }
}
