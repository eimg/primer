import { readFile, readdir, stat } from "node:fs/promises";
import { relative, resolve, sep, join } from "node:path";
import type { ConnectorItem, SourceConnector } from "./contracts.js";

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
  readonly id = "markdown-local";
  readonly sourceFamily = "markdown";

  constructor(private readonly fixtureDir: string) {}

  supports(path: string): boolean {
    const normalized = resolve(path).split(sep).join("/");
    return path.endsWith(".md") || normalized.includes("/sources/markdown");
  }

  async read(path?: string): Promise<ConnectorItem[]> {
    const root = resolve(path ?? join(this.fixtureDir, "sources", "markdown"));
    const files = await collectMarkdown(root);
    return Promise.all(
      files.map(async (file) => ({
        connectorId: this.id,
        sourceFamily: this.sourceFamily,
        sourceRef: sourceReference(file, this.fixtureDir),
        rawContent: await readFile(file, "utf8"),
        metadata: { localPath: resolve(file) },
      })),
    );
  }
}
