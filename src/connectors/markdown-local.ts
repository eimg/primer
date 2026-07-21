import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep, join } from "node:path";
import { checksum } from "../utils.js";
import {
  CONNECTOR_CONTRACT_VERSION,
  type ConnectorItem,
  type ConnectorLocator,
  type ConnectorPage,
  type SourceConnector,
} from "./contracts.js";

async function collectMarkdown(path: string): Promise<string[]> {
  const info = await stat(path);
  if (info.isFile()) {
    if (!path.endsWith(".md")) throw new Error(`Markdown connector does not support file: ${path}`);
    return [path];
  }
  const output: string[] = [];
  for (const entry of await readdir(path, { withFileTypes: true })) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) output.push(...(await collectMarkdown(child)));
    else if (entry.isFile() && child.endsWith(".md")) output.push(child);
  }
  return output.sort();
}

function sourceReference(filePath: string, fixtureDir: string): string {
  const rel = relative(resolve(fixtureDir), resolve(filePath));
  if (rel && !rel.startsWith(`..${sep}`) && rel !== "..") return rel.split(sep).join("/");
  return resolve(filePath);
}

export class LocalMarkdownConnector implements SourceConnector {
  readonly descriptor = {
    contractVersion: CONNECTOR_CONTRACT_VERSION,
    connectorId: "markdown-local",
    sourceFamily: "markdown",
    transport: "local",
    artifactKinds: ["document"],
    capabilities: { pagination: false, incrementalSync: false, tombstones: false, health: false },
  } as const;

  constructor(private readonly fixtureDir: string) {}

  supports(locator: ConnectorLocator): boolean {
    if (locator.type !== "local-path") return false;
    if (!locator.value) return true;
    const normalized = resolve(locator.value).split(sep).join("/");
    return locator.value.endsWith(".md") || normalized.includes("/sources/markdown");
  }

  async pull(request: { locator: ConnectorLocator }): Promise<ConnectorPage> {
    const root = resolve(request.locator.value || join(this.fixtureDir, "sources", "markdown"));
    const files = await collectMarkdown(root);
    const items: ConnectorItem[] = await Promise.all(files.map(async (file) => {
      const rawContent = await readFile(file, "utf8");
      const sourceRef = sourceReference(file, this.fixtureDir);
      return {
        schemaVersion: CONNECTOR_CONTRACT_VERSION,
        connectorId: this.descriptor.connectorId,
        sourceFamily: this.descriptor.sourceFamily,
        artifactKind: "document",
        externalId: sourceRef,
        revision: checksum(rawContent),
        sourceRef,
        rawContent,
        metadata: { localPath: resolve(file) },
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
